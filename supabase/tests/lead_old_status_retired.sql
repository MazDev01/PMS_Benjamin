-- ── ใบ 0257: ไม่มีสถานะ ติดตามผล/เจรจาต่อรอง และรายการเตือนแบบเก่าในฐาน · ฐานปฏิเสธทุกทาง (บอสสั่ง 28 ต.ค. 69) ─────────────
-- รัน: ผ่าน tests/scenario/db-rule-tests.spec.ts (ล็อกฐานทดสอบ) · ลีดทดสอบ ZZOS · ย้อนทั้งหมดตอนจบ (rollback)
-- ข้อที่ต้องตกบนฐานก่อนใบ 0257: ข้อมูลตั้งต้นเดิมมีลีดสถานะเก่า/รายการเตือนมีช่อง stage · HQ ตั้งสถานะเก่าได้ · งานในฐาน/กุญแจเซิร์ฟเวอร์ตั้งได้
--   · ข้อความปฏิเสธไม่ใช่ lead_status_retired · lead_stage_no ยังแปลงสถานะเก่าเป็นขั้น 5
begin;
create schema ostest;
create function ostest.ok(p_cond boolean, p_what text) returns void language plpgsql as $$
begin if p_cond is not true then raise exception 'FAIL: %', p_what; end if; raise notice 'ok  %', p_what; end $$;
create function ostest.must_fail(p_sql text, p_like text, p_what text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if sqlerrm ilike '%' || p_like || '%' then raise notice 'ok  % (ถูกปฏิเสธ)', p_what; return; end if;
    raise exception 'FAIL: % — ถูกปฏิเสธแต่ข้อความไม่ตรง: %', p_what, sqlerrm;
  end;
  raise exception 'FAIL: % — ควรถูกปฏิเสธแต่ผ่าน', p_what;
end $$;
create function ostest.ผู้ใช้(p_role text, p_dealer text) returns uuid language sql stable as $$
  select id from profiles where role::text = p_role and coalesce(dealer_code, '') = p_dealer and status::text = 'active' order by id limit 1 $$;
create function ostest.as_user(p_role text, p_dealer text) returns void language plpgsql as $$
begin
  -- คืนสิทธิ์ก่อนหาบัญชี: ถ้ายังสวมสิทธิ์ดีลเลอร์อยู่ กฎรายแถวซ่อนโปรไฟล์ HQ → sub ว่าง → คำสั่งของ HQ ไม่โดนแถวไหนเลย
  perform set_config('role', 'none', true); perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claims', json_build_object('sub', ostest.ผู้ใช้(p_role, p_dealer), 'role', 'authenticated',
    'user_role', p_role, 'dealer_code', p_dealer, 'email', 'zzos@example.test')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function ostest.as_root() returns void language plpgsql as $$
begin perform set_config('role', 'none', true); perform set_config('request.jwt.claims', '', true); end $$;
grant usage on schema ostest to authenticated;
grant execute on all functions in schema ostest to authenticated;

do $$
declare j jsonb;
begin
  -- ═══ 1) ข้อมูล: ไม่มีของเก่าเหลือ (ข้อมูลตั้งต้น + ทุกอย่างที่ข้อทดสอบอื่นสร้าง) ═══
  perform ostest.ok(not exists (select 1 from leads where status::text in ('FOLLOWUP', 'NEGO')), 'ไม่มีลีดสถานะ ติดตามผล/เจรจาต่อรอง');
  perform ostest.ok(not exists (select 1 from leads where status_before_paid::text in ('FOLLOWUP', 'NEGO')), 'ไม่มีสถานะก่อนปิดเป็นสถานะเก่า');
  perform ostest.ok(not exists (select 1 from leads l, jsonb_array_elements(case when jsonb_typeof(l.tasks) = 'array' then l.tasks else '[]' end) t
                                 where t ? 'stage' or t ->> 'key' in ('followup', 'negotiate', 'close', 'catalog')),
    'รายการเตือนของลีดไม่มีรายการ flow เก่า/ช่อง stage');
  select tasks into j from hq_sales_journey where id = 1;
  perform ostest.ok(not exists (select 1 from jsonb_array_elements(coalesce(j, '[]')) t
                                 where t ? 'stage' or t ->> 'key' in ('followup', 'negotiate', 'close', 'catalog')),
    'แม่แบบงาน HQ ไม่มีรายการ flow เก่า/ช่อง stage');

  -- ═══ 2) ตัวแปลงข้อมูลของใบ: ติดตามผล → ติดตามลูกค้า (เก็บติ๊ก) · ตัดเจรจาต่อรอง/ปิดการขาย · ตัดช่อง stage ═══
  j := _lead_tasks_drop_old_flow('[{"key":"contact","label":"ติดต่อแล้ว","stage":"WAITING","done":true},
    {"key":"followup","label":"ติดตามผล","stage":"FOLLOWUP","done":true,"doneAt":"3 มิ.ย. 2569 · 10:00"},
    {"key":"negotiate","label":"เจรจาต่อรอง","stage":"NEGO","done":false},{"key":"close","label":"ปิดการขาย","done":false}]');
  perform ostest.ok(j = '[{"key":"contact","label":"ติดต่อแล้ว","done":true},{"key":"followCustomer","label":"ติดตามลูกค้า","done":true,"doneAt":"3 มิ.ย. 2569 · 10:00"}]'::jsonb,
    format('ตัวแปลงรายการเตือน (ได้ %s)', j));
  j := _lead_tasks_drop_old_flow('[{"key":"zz","label":"งานของ HQ","stage":"QUOTED"}]', true);
  perform ostest.ok(j = '[{"key":"zz","label":"งานของ HQ","step":5}]'::jsonb, format('แม่แบบ: stage เดิม → ขั้น (ได้ %s)', j));

  -- ═══ 3) ฐานปฏิเสธสถานะเก่าทุกทาง ═══
  set local session_replication_role = replica;
  insert into leads (id, num_id, dealer_code, company, name, phone, province, status, assigned)
    values ('#L-ZZOS1', 990971, 'RYG', 'ZZOS ลีด 1', 'ZZOS ลีด 1', '000-000-0971', 'ระยอง', 'QUOTED', 'ทดสอบระบบ');
  set local session_replication_role = origin;

  perform ostest.as_user('DEALER_ADMIN', 'RYG');
  perform ostest.must_fail($q$insert into leads (id, num_id, dealer_code, company, name, phone, province, status, assigned)
      values ('#L-ZZOS2', 990972, 'RYG', 'ZZOS ลีด 2', 'ZZOS ลีด 2', '000-000-0972', 'ระยอง', 'FOLLOWUP', 'ทดสอบระบบ')$q$,
    'lead_status_retired', 'ดีลเลอร์สร้างลีดเป็น "ติดตามผล" = ปฏิเสธ (เลิกใช้แล้ว)');
  perform ostest.must_fail($q$update leads set status = 'NEGO' where id = '#L-ZZOS1'$q$, 'lead_status_retired', 'ดีลเลอร์ยิงตรงตั้ง "เจรจาต่อรอง" = ปฏิเสธ');
  perform ostest.must_fail($q$select lead_apply('#L-ZZOS1', '{"stage":{"status":"FOLLOWUP"}}'::jsonb)$q$, 'lead_status_retired',
    'ดีลเลอร์ใช้คำสั่งบันทึกลีดตั้ง "ติดตามผล" = ปฏิเสธ');
  perform ostest.must_fail($q$select lead_apply('#L-ZZOS1', '{"tasks":[{"key":"negotiate","label":"เจรจาต่อรอง","done":true}]}'::jsonb)$q$,
    'lead_task_retired', 'ดีลเลอร์เพิ่มรายการเตือน "เจรจาต่อรอง" = ปฏิเสธ');
  perform ostest.must_fail($q$select lead_apply('#L-ZZOS1', '{"tasks":[{"key":"catalog","label":"ส่งแม่แบบให้ลูกค้า","done":true}]}'::jsonb)$q$,
    'lead_task_retired', 'ดีลเลอร์เพิ่มรายการเตือน "ส่งแม่แบบให้ลูกค้า" = ปฏิเสธ');
  perform ostest.must_fail($q$select lead_apply('#L-ZZOS1', '{"tasks":[{"key":"close","label":"ปิดการขาย","done":true}]}'::jsonb)$q$,
    'lead_task_retired', 'ดีลเลอร์เพิ่มรายการเตือน "ปิดการขาย" แบบเก่า = ปฏิเสธ');

  perform ostest.as_user('SUPER_ADMIN', '');
  perform ostest.must_fail($q$insert into leads (id, num_id, dealer_code, company, name, phone, province, status, assigned)
      values ('#L-ZZOS3', 990973, 'RYG', 'ZZOS ลีด 3', 'ZZOS ลีด 3', '000-000-0973', 'ระยอง', 'NEGO', 'ทดสอบระบบ')$q$,
    'lead_status_retired', 'HQ สร้างลีดเป็น "เจรจาต่อรอง" = ปฏิเสธ');
  perform ostest.must_fail($q$update hq_sales_journey set tasks = tasks || '[{"key":"followup","label":"ติดตามผล","step":5}]'::jsonb where id = 1$q$,
    'lead_task_retired', 'HQ เพิ่ม "ติดตามผล" ในแม่แบบงาน = ปฏิเสธ');

  perform ostest.as_root();   -- กุญแจฝั่งเซิร์ฟเวอร์ / งานในฐาน (ตัวดักลีดตัวอื่นไม่ตรวจทางนี้)
  perform ostest.must_fail($q$update leads set status = 'FOLLOWUP' where id = '#L-ZZOS1'$q$, 'lead_status_retired', 'งานในฐานตั้ง "ติดตามผล" = ปฏิเสธ');
  perform ostest.must_fail($q$update leads set status_before_paid = 'NEGO' where id = '#L-ZZOS1'$q$, 'lead_status_retired',
    'งานในฐานตั้งสถานะก่อนปิดเป็น "เจรจาต่อรอง" (ทางย้อนการตอบรับ) = ปฏิเสธ');
  perform ostest.must_fail($q$update leads set tasks = '[{"key":"contact","label":"ติดต่อแล้ว","stage":"WAITING","done":false}]' where id = '#L-ZZOS1'$q$,
    'lead_task_retired', 'งานในฐานใส่รายการเตือนแบบผูกสถานะเก่า = ปฏิเสธ');
  -- ปิดตัวดัก (กู้ข้อมูล) ก็ไม่ได้ — ข้อบังคับของตาราง
  perform ostest.must_fail($q$do $x$ begin set local session_replication_role = replica; update leads set status = 'NEGO' where id = '#L-ZZOS1'; end $x$ $q$,
    'leads_status_retired', 'ปิดตัวดักแล้วตั้ง "เจรจาต่อรอง" = ข้อบังคับปฏิเสธ');
  set local session_replication_role = origin;

  -- ═══ 4) ตารางแปลงขั้นที่ฐานไม่มีสถานะเก่า ═══
  perform ostest.ok(lead_stage_no('RYG', -1, 'QUOTED') = 5, 'เสนอราคา = ขั้น 5');
  perform ostest.ok(lead_stage_no('RYG', -1, 'FOLLOWUP') is null and lead_stage_no('RYG', -1, 'NEGO') is null, 'สถานะเก่าไม่มีขั้น (เลิกใช้แล้ว)');
end $$;

select 'ALL PASS' as result;
rollback;
