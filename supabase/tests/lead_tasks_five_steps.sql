-- ── ใบ 0250: รายการเตือน 5 ขั้น — แม่แบบ · ย้ายรายการลีดเดิม · ฐานติ๊กเอง · ดีลเลอร์/HQ แก้รายการของระบบไม่ได้ ─────────────
-- รัน: docker exec -i <คอนเทนเนอร์ฐานทดสอบ> psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/lead_tasks_five_steps.sql
-- ลีด/คำขอทดสอบ ZZLT · ย้อนทั้งหมดตอนจบ
-- ข้อที่ต้องตกบนโค้ดก่อนใบ 0250: แม่แบบไม่มีขั้น/รายการของระบบ · ไม่มี _lead_tasks_five_steps · ส่งคำขอแล้วไม่ติ๊ก · ฐานยอมให้ติ๊กงานของระบบเอง
begin;
create schema flowtest;
create function flowtest.ok(p_cond boolean, p_what text) returns void language plpgsql as $$
begin if p_cond is not true then raise exception 'FAIL: %', p_what; end if; raise notice 'ok  %', p_what; end $$;
create function flowtest.must_fail(p_sql text, p_like text, p_what text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if sqlerrm ilike '%' || p_like || '%' then raise notice 'ok  % (ถูกปฏิเสธ)', p_what; return; end if;
    raise exception 'FAIL: % — ถูกปฏิเสธแต่ข้อความไม่ตรง: %', p_what, sqlerrm;
  end;
  raise exception 'FAIL: % — ควรถูกปฏิเสธแต่ผ่าน', p_what;
end $$;
-- ใช้บัญชีจริงที่มีอยู่ (หนึ่งสาขาหนึ่งบัญชี · บัญชีต้องเปิดใช้อยู่ถึงจะมีสิทธิ์เขียนงานขาย)
create function flowtest.ผู้ใช้(p_role text, p_dealer text) returns uuid language sql stable as $$
  select id from profiles where role::text = p_role and coalesce(dealer_code, '') = p_dealer and status::text = 'active' order by id limit 1 $$;
create function flowtest.as_user(p_role text, p_dealer text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', flowtest.ผู้ใช้(p_role, p_dealer), 'role', 'authenticated',
    'user_role', p_role, 'dealer_code', p_dealer, 'email', 'zzlt@example.test')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function flowtest.as_root() returns void language plpgsql as $$
begin perform set_config('role', 'none', true); perform set_config('request.jwt.claims', '', true); end $$;
create function flowtest.งาน(p_num int, p_key text) returns jsonb language sql as $$
  select t from leads l, jsonb_array_elements(l.tasks) t where l.dealer_code = 'RYG' and l.num_id = p_num and t ->> 'key' = p_key limit 1 $$;
grant usage on schema flowtest to authenticated;
grant execute on all functions in schema flowtest to authenticated;

set local session_replication_role = replica;
insert into leads (id, num_id, dealer_code, company, name, phone, province, status, assigned, tasks) values
  ('#L-ZZLT1', 990801, 'RYG', 'ZZLT ลีด 1', 'ZZLT ลีด 1', '000-000-0801', 'ระยอง', 'BULLET', 'ทดสอบระบบ',
   '[{"key":"contact","label":"ติดต่อแล้ว","done":true,"doneAt":"2026-06-02","doneBy":"ทดสอบ"},
     {"key":"collect","label":"เก็บข้อมูลลูกค้า","done":false},
     {"key":"followup","label":"ติดตามผล","done":true,"doneAt":"3 มิ.ย. 2569 · 10:00","doneBy":"ทดสอบ"},
     {"key":"negotiate","label":"เจรจาต่อรอง","done":false},
     {"key":"close","label":"ปิดการขาย / ไม่สำเร็จ","done":false},
     {"key":"zz_own","label":"งานเฉพาะของลีดนี้","done":true}]'),
  ('#L-ZZLT2', 990802, 'RYG', 'ZZLT ลีด 2', 'ZZLT ลีด 2', '000-000-0802', 'ระยอง', 'BULLET', 'ทดสอบระบบ', '[]');
insert into quote_requests (id, request_no, dealer_code, lead_num_id, product, status, submitted_at, due_at, quoted_at, cancel_reason) values
  (990811, 'ZZLT-RQ1', 'RYG', 990801, 'ZZLT งาน', 'quoted', '2026-10-01 09:00+07', '2026-10-15 09:00+07', '2026-10-03 14:30+07', '');
set local session_replication_role = origin;

do $$
declare j jsonb; ใหม่ jsonb; นัด jsonb; keys text[];
begin
  -- ═══ 1) แม่แบบของ HQ = 5 ขั้น · รายการของระบบครบ · ไม่มีรายการ flow เก่า ═══
  select tasks into j from hq_sales_journey where id = 1;
  keys := array(select e ->> 'key' from jsonb_array_elements(j) e);
  perform flowtest.ok(keys @> array['appointment', 'requestQuote', 'hqQuote', 'makeQuote', 'sendQuote', 'followCustomer'], format('แม่แบบมีรายการใหม่ครบ (ได้ %s)', keys));
  perform flowtest.ok(not keys && array['followup', 'negotiate', 'close', 'catalog'], 'แม่แบบไม่มี ติดตามผล/เจรจาต่อรอง/ปิดการขาย/ส่งแม่แบบ');
  perform flowtest.ok(not exists (select 1 from jsonb_array_elements(j) e where coalesce(e ->> 'step', '') !~ '^[1-5]$'), 'ทุกรายการมีขั้น 1–5');
  perform flowtest.ok((select string_agg(e ->> 'step', '' order by o) from jsonb_array_elements(j) with ordinality x(e, o)) ~ '^1*2*3*4*5*$', 'เรียงตามขั้น 1→5');
  perform flowtest.ok((select (e ->> 'step')::int from jsonb_array_elements(j) e where e ->> 'key' = 'requestQuote') = 2
                  and (select (e ->> 'step')::int from jsonb_array_elements(j) e where e ->> 'key' = 'hqQuote') = 3, 'ส่งคำขอราคา = ขั้น 2 · ได้ใบ HQ = ขั้น 3');

  -- ═══ 2) ย้ายรายการของลีดเดิม: เก็บติ๊ก/วันที่ · ติดตามผล → ติดตามลูกค้า · ตัด flow เก่า · ติ๊กย้อนหลังจากคำขอจริง ═══
  ใหม่ := _lead_tasks_five_steps((select tasks from leads where id = '#L-ZZLT1'), 'RYG', 990801);
  keys := array(select e ->> 'key' from jsonb_array_elements(ใหม่) e);
  perform flowtest.ok(not keys && array['followup', 'negotiate', 'close'], format('ลีดเดิม: ตัดรายการ flow เก่า (ได้ %s)', keys));
  perform flowtest.ok((select e from jsonb_array_elements(ใหม่) e where e ->> 'key' = 'contact') @> '{"done":true,"doneAt":"2026-06-02","doneBy":"ทดสอบ"}',
    'ลีดเดิม: ติดต่อแล้ว เก็บติ๊ก/วันที่/ผู้ทำเดิม');
  perform flowtest.ok((select e from jsonb_array_elements(ใหม่) e where e ->> 'key' = 'followCustomer') @> '{"label":"ติดตามลูกค้า","done":true,"doneAt":"3 มิ.ย. 2569 · 10:00"}',
    'ลีดเดิม: ติดตามผล (ติ๊กแล้ว) → ติดตามลูกค้า เก็บติ๊ก');
  perform flowtest.ok((select e from jsonb_array_elements(ใหม่) e where e ->> 'key' = 'requestQuote') @> '{"done":true,"doneAt":"1 ต.ค. 2569 · 09:00"}',
    format('ลีดเดิม: ส่งคำขอราคา ติ๊กย้อนหลังตามวันส่งคำขอจริง (ได้ %s)', (select e from jsonb_array_elements(ใหม่) e where e ->> 'key' = 'requestQuote')));
  perform flowtest.ok((select e from jsonb_array_elements(ใหม่) e where e ->> 'key' = 'hqQuote') @> '{"done":true,"doneAt":"3 ต.ค. 2569 · 14:30"}',
    'ลีดเดิม: ได้ใบ HQ ติ๊กย้อนหลังตามวันที่ HQ ส่งใบ');
  perform flowtest.ok((select e from jsonb_array_elements(ใหม่) e where e ->> 'key' = 'makeQuote') @> '{"done":false}', 'ลีดเดิม: ยังไม่ทำใบ = ไม่ติ๊ก (ไม่เดา)');
  perform flowtest.ok(keys[array_length(keys, 1)] = 'zz_own', 'ลีดเดิม: รายการเฉพาะของลีดเก็บไว้ท้ายรายการ');
  -- งานนัดหมายที่ HQ เคยลบแล้วสร้างใหม่ (รหัส task_bullet_1 · มีจริงในข้อมูลรุ่นก่อน) → ย้ายเข้า "นัดหมาย" ของระบบ เก็บติ๊กเดิม ไม่ซ้ำ 2 แถว
  นัด := _lead_tasks_five_steps('[{"key":"task_bullet_1","label":"นัดหมาย","done":true,"doneAt":"28 ส.ค. 2569 · 15:34","doneBy":"ทดสอบ"}]', 'RYG', 990802, 'task_bullet_1');
  perform flowtest.ok((select e from jsonb_array_elements(นัด) e where e ->> 'key' = 'appointment') @> '{"label":"นัดหมาย","done":true,"doneAt":"28 ส.ค. 2569 · 15:34"}'
                  and not นัด @> '[{"key":"task_bullet_1"}]'
                  and (select count(*) from jsonb_array_elements(นัด) e where e ->> 'label' = 'นัดหมาย') = 1,
    format('นัดหมายรหัสเดิม task_bullet_1 → นัดหมายของระบบ เก็บติ๊ก ไม่ซ้ำ (ได้ %s)', นัด));

  -- ═══ 3) ดีลเลอร์ติ๊ก/ยกเลิกติ๊กรายการของระบบเองไม่ได้ · รายการติ๊กเองได้และไม่เปลี่ยนขั้น ═══
  perform flowtest.as_root();
  update leads set tasks = ใหม่ where id = '#L-ZZLT1';
  perform flowtest.as_user('DEALER_ADMIN', 'RYG');
  perform flowtest.must_fail($q$select lead_apply('#L-ZZLT1', '{"tasks":[{"key":"makeQuote","done":true}]}'::jsonb)$q$, 'system_task_locked',
    'ดีลเลอร์ติ๊ก "จัดทำใบเสนอราคา" เองไม่ได้');
  perform flowtest.must_fail($q$select lead_apply('#L-ZZLT1', '{"tasks":[{"key":"requestQuote","done":false}]}'::jsonb)$q$, 'system_task_locked',
    'ดีลเลอร์ยกเลิกติ๊ก "ส่งคำขอราคา" เองไม่ได้');
  perform flowtest.must_fail($q$update leads set tasks = '[]'::jsonb where id = '#L-ZZLT1'$q$, 'system_task_locked',
    'ดีลเลอร์ล้างรายการทั้งชุดตรงที่ตาราง (ลบติ๊กของระบบ) ไม่ได้');
  -- เก็บข้อมูลลูกค้า เป็นรายการของระบบตั้งแต่ใบ 0263 (30 ต.ค. 69) — รายการติ๊กเองที่เหลือ = ติดตามลูกค้า
  perform lead_apply('#L-ZZLT1', '{"tasks":[{"key":"followCustomer","done":false}]}'::jsonb);
  perform lead_apply('#L-ZZLT1', '{"tasks":[{"key":"followCustomer","done":true}]}'::jsonb);
  perform flowtest.ok((flowtest.งาน(990801, 'followCustomer') ->> 'done')::boolean, 'รายการติ๊กเอง (ติดตามลูกค้า) ติ๊กได้');
  perform flowtest.ok((select status::text from leads where id = '#L-ZZLT1') = 'BULLET', 'ติ๊กเองไม่เปลี่ยนขั้นของลีด');

  -- ═══ 4) ฐานติ๊กเอง: ส่งคำขอราคา → "ส่งคำขอราคา" · HQ ส่งใบ → "ได้ใบ HQ" (ลีดที่ยังไม่มีรายการ สร้างจากแม่แบบ) ═══
  perform flowtest.as_root();
  -- เพิ่มคำขอจริง (ตัวดัก quote_requests_task_sync ทำงาน) · ใบ HQ ใส่ตรงแบบร่าง แล้วส่งด้วยการเปลี่ยนสถานะจริงข้างล่าง
  insert into quote_requests (id, request_no, dealer_code, lead_num_id, product, status, submitted_at, due_at, cancel_reason)
    values (990812, 'ZZLT-RQ2', 'RYG', 990802, 'ZZLT งาน', 'new', now(), now() + interval '14 days', '');
  set local session_replication_role = replica;
  insert into hq_quotes (id, request_id, version, quote_no, status, line_items, total_cost) values (990821, 990812, 1, 'HQ-ZZLT-1', 'draft', '[]', 1000);
  set local session_replication_role = origin;
  perform flowtest.ok((flowtest.งาน(990802, 'requestQuote') ->> 'done')::boolean, 'ส่งคำขอราคาแล้ว "ส่งคำขอราคา" ถูกติ๊ก');
  perform flowtest.ok((flowtest.งาน(990802, 'requestQuote') ->> 'doneAt') ~ ' 25\d\d', 'วันที่ที่ฐานติ๊กเป็น พ.ศ.');
  update hq_quotes set status = 'sent', sent_at = now() where id = 990821;   -- ตัวดัก hq_quotes_task_sync ทำงานจริง
  perform flowtest.ok((flowtest.งาน(990802, 'hqQuote') ->> 'done')::boolean, 'HQ ส่งใบแล้ว "ได้ใบ HQ" ถูกติ๊ก (ตัวดักบนตาราง hq_quotes)');
  perform flowtest.ok(not (flowtest.งาน(990802, 'makeQuote') ->> 'done')::boolean, 'ยังไม่ทำใบลูกค้า = "จัดทำใบเสนอราคา" ไม่ถูกติ๊ก');

  -- ═══ 5) HQ แก้แม่แบบ: ตัด/แก้ชื่อ/ย้ายขั้นรายการของระบบไม่ได้ · รายการติ๊กเองเพิ่ม/ลบได้ ═══
  perform flowtest.as_user('SUPER_ADMIN', '');
  perform flowtest.must_fail($q$update hq_sales_journey set tasks = (select jsonb_agg(e) from jsonb_array_elements(tasks) e where e ->> 'key' <> 'hqQuote') where id = 1$q$,
    'system_task_locked', 'HQ ตัด "ได้ใบ HQ" ไม่ได้');
  perform flowtest.must_fail($q$update hq_sales_journey set tasks = (select jsonb_agg(case when e ->> 'key' = 'sendQuote' then e || '{"label":"ส่งใบ"}' else e end) from jsonb_array_elements(tasks) e) where id = 1$q$,
    'system_task_locked', 'HQ แก้ชื่อ "ส่งใบเสนอราคา" ไม่ได้');
  perform flowtest.must_fail($q$update hq_sales_journey set tasks = (select jsonb_agg(case when e ->> 'key' = 'requestQuote' then e || '{"step":1}' else e end) from jsonb_array_elements(tasks) e) where id = 1$q$,
    'system_task_locked', 'HQ ย้ายขั้น "ส่งคำขอราคา" ไม่ได้');
  perform flowtest.must_fail($q$update hq_sales_journey set tasks = tasks || '[{"key":"zz_bad","label":"ไม่มีขั้น"}]'::jsonb where id = 1$q$,
    'lead_tasks_invalid', 'รายการที่ไม่มีขั้น = ปฏิเสธ');
  update hq_sales_journey set tasks = (select jsonb_agg(e) from jsonb_array_elements(tasks) e where e ->> 'key' <> 'followCustomer') || '[{"key":"zz_new","label":"ZZLT งานใหม่","step":3}]'::jsonb where id = 1;
  perform flowtest.ok((select tasks @> '[{"key":"zz_new"}]' and not tasks @> '[{"key":"followCustomer"}]' from hq_sales_journey where id = 1),
    'HQ ลบรายการติ๊กเอง + เพิ่มรายการใหม่ได้');
end $$;

select 'ALL PASS' as result;
rollback;
