-- ── ข้อทดสอบใบ 0274 (B): บันทึกการใช้งานแสดงเฉพาะสิ่งที่ HQ ทำ (บอสสั่ง 3 พ.ย. 69) ───────────────────────────────────
--   1) มุมมอง audit_log_hq = แถวบทบาท HQ_* / SUPER_ADMIN เท่านั้น · ดีลเลอร์ (DEALER_ADMIN/DEALER_SALES/DEALER) + งานเบื้องหลัง (บทบาทว่าง) ไม่มี
--   2) ไม่ลบอะไร — ตาราง audit_log ยังมีครบทุกแถว
--   3) ดีลเลอร์อ่านมุมมองไม่เห็นอะไรเลย (กฎรายแถวของ audit_log ใช้ตาม)
--   4) การ์ดตัวเลขของหน้า (kpi_cards 'hq.audit') นับชุดเดียวกับตาราง — ส่งรหัสแถวของดีลเลอร์มาด้วยก็ไม่นับ
--   ตกบนโค้ดก่อนใบ 0274: ไม่มีมุมมอง audit_log_hq · การ์ดนับแถวของดีลเลอร์
-- รัน: docker exec -i <คอนเทนเนอร์ฐานทดสอบ> psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 < supabase/tests/audit_hq_only.sql
begin;
create schema ahtest;
create function ahtest.ok(p_cond boolean, p_what text) returns void language plpgsql as $$
begin if p_cond is not true then raise exception 'FAIL: %', p_what; end if; raise notice 'ok  %', p_what; end $$;

-- ผู้ทำ/เป้าหมายไม่ขึ้นต้น ZZ — ไม่ให้ตัวคัดแถวทดสอบของการ์ด (_audit_is_test_row) ตัดทิ้งก่อนถึงกติกาบทบาท
set local session_replication_role = replica;
insert into audit_log ("user", role, action, target, at) values
  ('ทดสอบเอเอช ผู้ดูแล',     'SUPER_ADMIN',   'ทดสอบเอเอช แก้ไขดีลเลอร์',      'AHT-1', now()),
  ('ทดสอบเอเอช ผู้บริหาร',   'HQ_MANAGEMENT', 'ทดสอบเอเอช ตั้งเป้า',           'AHT-2', now()),
  ('ทดสอบเอเอช เจ้าหน้าที่', 'HQ_STAFF',      'ทดสอบเอเอช ส่งใบ HQ',           'AHT-3', now()),
  ('ทดสอบเอเอช ดีลเลอร์',    'DEALER_ADMIN',  'ทดสอบเอเอช แก้ไขข้อมูลบัญชี',   'AHT-4', now()),
  ('ทดสอบเอเอช พนักงานขาย',  'DEALER_SALES',  'ทดสอบเอเอช สร้างลีด',           'AHT-5', now()),
  ('ทดสอบเอเอช ดีลเลอร์',    'DEALER',        'ทดสอบเอเอช ยืนยันอีเมลติดต่อ',  'AHT-6', now()),
  ('',                       '',              'ทดสอบเอเอช ใบหมดอายุ',          'AHT-7', now()),
  ('ทดสอบเอเอช ไม่มีบทบาท',  null,            'ทดสอบเอเอช ไม่ระบุ',             'AHT-8', now());
set local session_replication_role = origin;

do $$
declare ids jsonb := (select jsonb_agg(id::text) from audit_log where target like 'AHT-%');
        hq uuid := (select id from profiles where role = 'SUPER_ADMIN' limit 1); k jsonb;
begin
  perform ahtest.ok((select array_agg(target order by target) from audit_log_hq where target like 'AHT-%') = array['AHT-1', 'AHT-2', 'AHT-3'],
                    '1) มุมมองมีเฉพาะที่คนของ HQ ทำ (ผู้ดูแล · ผู้บริหาร · เจ้าหน้าที่)');
  perform ahtest.ok((select count(*) from audit_log where target like 'AHT-%') = 8, '2) ตารางเดิมครบ 8 แถว — ไม่ลบอะไร');
  perform ahtest.ok(not exists (select 1 from audit_log_hq where not audit_role_is_hq(role)), '1) ทั้งมุมมองไม่มีแถวบทบาทอื่นเลย');

  perform set_config('request.jwt.claims', json_build_object('sub', hq, 'role', 'authenticated', 'user_role', 'SUPER_ADMIN', 'dealer_code', '')::text, true);
  k := public.kpi_cards('hq.audit', current_date, current_date, null, (now() at time zone 'Asia/Bangkok')::date, jsonb_build_object('ids', ids));
  perform ahtest.ok((k->>'actionsToday')::int = 3 and (k->>'usersToday')::int = 3,
                    '4) การ์ด "กิจกรรมวันนี้" นับเฉพาะของ HQ แม้ส่งรหัสแถวของดีลเลอร์มาด้วย — ได้ ' || k::text);
  perform set_config('request.jwt.claims', '', true);
end $$;

-- ดีลเลอร์อ่านมุมมอง = กฎรายแถวของตารางเดิม (ไม่เห็นบันทึกของ HQ)
select set_config('request.jwt.claims', json_build_object('sub', (select id from profiles where role = 'DEALER_ADMIN' limit 1), 'role', 'authenticated',
  'user_role', 'DEALER_ADMIN', 'dealer_code', (select dealer_code from profiles where role = 'DEALER_ADMIN' limit 1))::text, true);
set local role authenticated;
do $$ begin
  if exists (select 1 from audit_log_hq where target like 'AHT-%') then raise exception 'FAIL: 3) ดีลเลอร์เห็นบันทึกของ HQ ผ่านมุมมอง'; end if;
  raise notice 'ok  3) ดีลเลอร์อ่านมุมมองแล้วไม่เห็นบันทึกของ HQ';
end $$;
reset role;

select 'ALL PASS' as result;
rollback;
