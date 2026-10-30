-- ใบ 0211: ตัวกลางบันทึกลูกค้าเป้าหมาย (lead_apply) — รับส่วนต่าง · รวมกับค่าล่าสุดในฐาน · งานที่ฐานติ๊กไม่หาย
-- รัน: docker exec -i <คอนเทนเนอร์ฐานทดสอบ> psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/lead_apply.sql
begin;
create schema latest;
create table latest.ctx as select
  (select id from profiles where role = 'DEALER_ADMIN' and dealer_code = 'RYG' limit 1) as ryg_uid,
  (select id from profiles where role = 'DEALER_ADMIN' and dealer_code = 'CNX' limit 1) as cnx_uid;
grant usage on schema latest to authenticated;
grant select on latest.ctx to authenticated;
create function latest.as_dealer(p_code text, p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated',
    'user_role', 'DEALER_ADMIN', 'dealer_code', p_code, 'email', lower(p_code) || '@test')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function latest.as_root() returns void language plpgsql as $$
begin perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '', true); end $$;
create function latest.ok(p_cond boolean, p_what text) returns void language plpgsql as $$
begin if p_cond is not true then raise exception 'FAIL: %', p_what; end if; raise notice 'ok  %', p_what; end $$;
create function latest.must_fail(p_sql text, p_like text, p_what text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if sqlerrm like '%' || p_like || '%' then raise notice 'ok  % (%)', p_what, p_like; return; end if;
    raise exception 'FAIL: % — ได้ข้อความอื่น: %', p_what, sqlerrm;
  end;
  raise exception 'FAIL: % — ไม่ถูกปฏิเสธ', p_what;
end $$;
grant execute on all functions in schema latest to authenticated;
create function latest.done(p_id text, p_key text) returns boolean language sql as $$
  select coalesce((select (t ->> 'done')::boolean from leads l, jsonb_array_elements(l.tasks) t where l.id = p_id and t ->> 'key' = p_key), false) $$;
grant execute on function latest.done(text, text) to authenticated;

insert into leads (id, num_id, dealer_code, company, name, contact, phone, province, product, status, tasks, activities, assigned)
values ('#L-ZLA1', 978000001, 'RYG', 'ZZTEST-LAPPLY', 'ZZTEST-LAPPLY', 'ผู้ทดสอบ', '0810000001', 'ระยอง', 'โกดังสำเร็จรูป', 'WAITING', '[]', '[]', 'พนักงานขายทดสอบ');

do $$
declare r leads; uid uuid := (select ryg_uid from latest.ctx); cnx uuid := (select cnx_uid from latest.ctx); n int;
begin
  perform latest.as_dealer('RYG', uid);

  -- ① แก้ช่องเดียว → ช่องอื่นไม่ถูกแตะ · ลูกค้าเป้าหมายที่ยังไม่มีรายการงานได้งานจากแม่แบบ HQ เมื่อติ๊ก
  r := lead_apply('#L-ZLA1', '{"fields":{"contact":"ผู้ติดต่อใหม่"}}');
  perform latest.ok(r.contact = 'ผู้ติดต่อใหม่' and r.phone = '0810000001' and r.status = 'WAITING', 'แก้ช่องเดียว ช่องอื่นคงเดิม');
  --   งาน: ข้อมูลลูกค้าครบ → ฐานติ๊ก "เก็บข้อมูลลูกค้า" ให้เอง (ใบ 0263) · รายการอื่นไม่ถูกติ๊ก · ไทม์ไลน์ไม่แตะ
  perform latest.ok((select array_agg(t ->> 'key') from jsonb_array_elements(r.tasks) t where (t ->> 'done')::boolean) = array['collect']
                    and r.activities = '[]'::jsonb, 'แก้ช่องธรรมดา ไม่แตะไทม์ไลน์ · งานติ๊กเฉพาะ เก็บข้อมูลลูกค้า (ระบบ)');

  -- ② ช่องที่ฐานเป็นเจ้าของ ส่งทาง fields ไม่ได้
  perform latest.must_fail($q$select lead_apply('#L-ZLA1', '{"fields":{"status":"PAID"}}')$q$, 'lead_field_not_allowed', 'ส่งขั้นทาง fields');
  perform latest.must_fail($q$select lead_apply('#L-ZLA1', '{"fields":{"tasks":[]}}')$q$, 'lead_field_not_allowed', 'ส่งงานทาง fields');
  perform latest.must_fail($q$select lead_apply('#L-ZLA1', '{"fields":{"activities":[]}}')$q$, 'lead_field_not_allowed', 'ส่งไทม์ไลน์ทาง fields');
  perform latest.must_fail($q$select lead_apply('#L-ZLA1', '{"fields":{"lost_reason":"x"}}')$q$, 'lead_field_not_allowed', 'ส่งเหตุผลปิดทาง fields');

  -- ③ ติ๊กงานทีละงาน + จดไทม์ไลน์ · รอบ 4 (ใบ 0232): งานไม่เลื่อนขั้น deriveStage ถูกเมิน
  --   (ใบ 0263: ติดต่อแล้วเอาออก · เก็บข้อมูลลูกค้า/สรุปความต้องการ ระบบติ๊ก — ใช้รายการติ๊กเอง "ติดตามลูกค้า")
  r := lead_apply('#L-ZLA1', '{"tasks":[{"key":"followCustomer","done":true,"doneBy":"คนติ๊ก"}],"deriveStage":"any"}');
  perform latest.ok(latest.done('#L-ZLA1', 'followCustomer') and jsonb_array_length(r.tasks) = (select jsonb_array_length(tasks) from hq_sales_journey order by id limit 1), 'ติ๊กงาน · งานมาจากแม่แบบ');
  perform latest.ok((select t ->> 'doneBy' from jsonb_array_elements(r.tasks) t where t ->> 'key' = 'followCustomer') = 'คนติ๊ก', 'ผู้ทำตามที่ส่ง');
  perform latest.ok(r.activities -> 0 ->> 'text' = 'ทำงาน: ติดตามลูกค้า', 'ไทม์ไลน์ "ทำงาน: …" ฐานจดเอง');
  r := lead_apply('#L-ZLA1', '{"tasks":[{"key":"followCustomer","done":false}],"deriveStage":"any"}');
  perform latest.ok(r.status = 'WAITING', 'ติ๊กงานแล้วขั้นไม่ขยับ (ใบ 0232)');
  perform latest.ok(not (r.activities @> '[{"text":"เปลี่ยนขั้นเป็น \"รวบรวมความต้องการ\""}]'), 'ไม่มีไทม์ไลน์เปลี่ยนขั้นจากงาน');

  -- ④ หัวใจ: ฐานติ๊กงานเพิ่ม (ระบบ/อีกแท็บ) → แอปส่งส่วนต่างจากหน้าค้าง → งานที่ฐานติ๊กยังอยู่
  perform latest.as_root();
  update leads set tasks = (select jsonb_agg(case when t ->> 'key' = 'makeQuote' then t || '{"done":true,"doneBy":"อัปเดตอัตโนมัติ"}' else t end)
                              from jsonb_array_elements(tasks) t) where id = '#L-ZLA1';
  perform latest.as_dealer('RYG', uid);
  r := lead_apply('#L-ZLA1', '{"fields":{"phone":"0810000099"}}');
  perform latest.ok(latest.done('#L-ZLA1', 'makeQuote') and r.phone = '0810000099', 'แก้ช่องจากหน้าค้าง: งานที่ฐานติ๊กยังอยู่');
  r := lead_apply('#L-ZLA1', '{"tasks":[{"key":"task_bullet_1","done":true}],"deriveStage":"up"}');
  perform latest.ok(latest.done('#L-ZLA1', 'makeQuote') and latest.done('#L-ZLA1', 'task_bullet_1'), 'ติ๊กงานจากหน้าค้าง: งานที่ฐานติ๊กยังอยู่');
  perform latest.ok(r.status = 'WAITING', 'งานในฐานไม่เลื่อนขั้น (ใบ 0232)');

  -- ⑤ เลิกติ๊กงานได้ · ขั้นคงเดิม — เฉพาะรายการติ๊กเอง · รายการของระบบ (makeQuote) ดีลเลอร์เลิกติ๊กไม่ได้ (ใบ 0250)
  r := lead_apply('#L-ZLA1', '{"tasks":[{"key":"contact","done":false}],"deriveStage":"any"}');
  perform latest.ok(not latest.done('#L-ZLA1', 'contact') and r.status = 'WAITING', 'เลิกติ๊กงาน ขั้นคงเดิม');
  perform latest.must_fail($q$select lead_apply('#L-ZLA1', '{"tasks":[{"key":"makeQuote","done":false}],"deriveStage":"any"}')$q$, 'system_task_locked', 'เลิกติ๊กรายการของระบบไม่ได้ (ใบ 0250)');
  perform latest.ok(latest.done('#L-ZLA1', 'makeQuote'), 'รายการของระบบยังติ๊กอยู่หลังถูกปฏิเสธ');

  -- ⑥ กฎปิดการขาย (เดิมอยู่ที่เซิร์ฟเวอร์แอปเท่านั้น)
  perform latest.must_fail($q$select lead_apply('#L-ZLA1', '{"stage":{"status":"PAID"}}')$q$, 'lead_won_needs_accepted_quote', 'ปิดสำเร็จที่ลีด (ไม่มีใบที่ตอบรับ · ใบ 0232)');
  perform latest.must_fail($q$select lead_apply('#L-ZLA1', '{"stage":{"status":"CANCELLED"}}')$q$, 'lead_lost_needs_reason', 'ปิดไม่สำเร็จโดยไม่มีเหตุผล');
  r := lead_apply('#L-ZLA1', '{"stage":{"status":"CANCELLED","lostReason":"งบไม่พอ"},"log":false}');
  perform latest.ok(r.status = 'CANCELLED' and r.lost_reason = 'งบไม่พอ', 'ปิดไม่สำเร็จพร้อมเหตุผล');
  perform latest.ok(not (r.activities @> '[{"text":"เปลี่ยนขั้นเป็น \"ปิดการขายไม่สำเร็จ\""}]'), 'log=false ไม่จดไทม์ไลน์');

  -- ⑦ ผู้รับผิดชอบเปลี่ยน → ไทม์ไลน์ · กิจกรรมที่ส่งมาต่อท้าย · เลขต่อเนื่อง
  select jsonb_array_length(activities) into n from leads where id = '#L-ZLA1';
  r := lead_apply('#L-ZLA1', '{"fields":{"assigned":"คนใหม่"},"activities":[{"text":"ออกใบเสนอราคา Q-ZZ","type":"doc"}]}');
  perform latest.ok(jsonb_array_length(r.activities) = n + 2, 'ต่อท้าย 2 บรรทัด');
  perform latest.ok(r.activities @> '[{"text":"เปลี่ยนผู้รับผิดชอบเป็น คนใหม่"},{"text":"ออกใบเสนอราคา Q-ZZ","type":"doc"}]', 'ไทม์ไลน์ผู้รับผิดชอบ + กิจกรรมที่ส่งมา');
  perform latest.ok((select count(distinct a ->> 'id') from jsonb_array_elements(r.activities) a) = jsonb_array_length(r.activities), 'เลขกิจกรรมไม่ซ้ำ');

  -- ⑧ สาขาอื่นแก้ไม่ได้ (กฎรายแถว) · ผู้ไม่ล็อกอินเรียกไม่ได้
  perform latest.as_dealer('CNX', cnx);
  perform latest.must_fail($q$select lead_apply('#L-ZLA1', '{"fields":{"note":"แอบแก้"}}')$q$, 'not_found:', 'สาขาอื่นแก้ไม่ได้');
  perform latest.as_root();
  perform latest.ok(not has_function_privilege('anon', 'public.lead_apply(text, jsonb)', 'execute'), 'anon เรียกไม่ได้');
  perform latest.ok(has_function_privilege('authenticated', 'public.lead_apply(text, jsonb)', 'execute'), 'ผู้ล็อกอินเรียกได้');
  raise notice 'ALL PASS';
end $$;
rollback;
