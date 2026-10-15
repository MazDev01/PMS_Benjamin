-- ── ด่าน 4: ดีลเลอร์เดิมที่ไม่มีผู้สนใจผูก (แบบ 154 รายในระบบจริง) ยังจัดการได้ตามปกติหลังใบ 0208 (บอสสั่ง 15 ต.ค. 69) ──────
--   กฎ 0208 (ผูกผู้สนใจ + ตอบรับ + ชำระครบ) ต้องตรวจเฉพาะ "ตอนเพิ่มแถว" ไม่ใช่ตอนแก้
--   HQ แก้ชื่อ/เป้า/ปิดใช้งาน (ตรงที่ตาราง และผ่าน save_dealers ที่หน้าดีลเลอร์ใช้) · คำสั่งย้ายข้อมูลดีลเลอร์ยังทำงาน
-- รัน: docker exec -i <คอนเทนเนอร์ฐานทดสอบ> psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/legacy_dealers_after_0208.sql
begin;
create schema flowtest;
create function flowtest.ok(p_cond boolean, p_what text) returns void language plpgsql as $$
begin if p_cond is not true then raise exception 'FAIL: %', p_what; end if; raise notice 'ok  %', p_what; end $$;
create function flowtest.as_hq(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated',
    'user_role', 'SUPER_ADMIN', 'dealer_code', '', 'email', 'hq@test')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function flowtest.as_root() returns void language plpgsql as $$
begin perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '', true); end $$;
grant usage on schema flowtest to authenticated;
grant execute on all functions in schema flowtest to authenticated;

do $$
declare
  hq uuid := (select id from profiles where role = 'SUPER_ADMIN' limit 1);
  n int;
begin
  perform flowtest.ok(hq is not null, 'มีบัญชี HQ ตั้งต้น');
  -- ดีลเลอร์เดิมในฐาน (ลงทะเบียนก่อน 0208) ไม่มีผู้สนใจผูก — แบบเดียวกับระบบจริง
  perform flowtest.ok((select count(*) from dealers where prospect_id is null and code in ('RYG', 'CNX')) = 2, 'ดีลเลอร์เดิม RYG/CNX ไม่มีผู้สนใจผูก (prospect_id ว่าง)');

  -- ดีลเลอร์เดิมทดสอบ 2 ราย (ลงทะเบียนแบบสคริปต์ตั้งต้น = ไม่ผูกผู้สนใจ)
  insert into dealers (code, name, province, region, revenue_target, status) values
    ('ZZLG1', 'ZZTEST ดีลเลอร์เดิม 1', 'ตราด', 'ตะวันออก', 1000000, 'active'),
    ('ZZLG2', 'ZZTEST ดีลเลอร์เดิม 2', 'ตราด', 'ตะวันออก', 1000000, 'active');
  insert into leads (id, num_id, dealer_code, company, name, contact, phone, province, product, status)
  values ('#L-ZZLG-1', 1, 'ZZLG1', 'ZZTEST ลูกค้าของดีลเลอร์เดิม', 'ZZTEST ลูกค้าของดีลเลอร์เดิม', 'ผู้ทดสอบ', '0891112233', 'ตราด', 'โกดังสำเร็จรูป', 'BULLET');

  -- ── HQ แก้ตรงที่ตาราง: ชื่อ · เป้า · ปิดใช้งาน ──
  perform flowtest.as_hq(hq);
  update dealers set name = 'ZZTEST ดีลเลอร์เดิม 1 (แก้ชื่อ)' where code = 'ZZLG1';
  get diagnostics n = row_count;
  perform flowtest.ok(n = 1, 'HQ แก้ชื่อดีลเลอร์เดิมได้');
  update dealers set revenue_target = 2500000 where code = 'ZZLG1';
  get diagnostics n = row_count;
  perform flowtest.ok(n = 1, 'HQ แก้เป้าดีลเลอร์เดิมได้');
  update dealers set status = 'inactive' where code = 'ZZLG1';
  get diagnostics n = row_count;
  perform flowtest.ok(n = 1, 'HQ ปิดใช้งานดีลเลอร์เดิมได้');

  -- ── HQ แก้ผ่าน save_dealers (ทางที่หน้าดีลเลอร์ใช้) ──
  n := save_dealers(jsonb_build_array(jsonb_build_object('code', 'ZZLG2', 'name', 'ZZTEST ดีลเลอร์เดิม 2 (save)', 'province', 'ตราด',
         'region', 'ตะวันออก', 'status', 'inactive', 'revenue_target', 3300000)));
  perform flowtest.ok(n = 1, 'save_dealers แก้ดีลเลอร์เดิมได้ 1 แถว');

  perform flowtest.as_root();
  perform flowtest.ok((select row(name, revenue_target, status::text) = row('ZZTEST ดีลเลอร์เดิม 1 (แก้ชื่อ)'::text, 2500000::numeric, 'inactive'::text)
                        from dealers where code = 'ZZLG1'), 'ผลแก้ตรงลงฐานครบ (ชื่อ · เป้า · ปิดใช้งาน)');
  perform flowtest.ok((select row(name, revenue_target, status::text) = row('ZZTEST ดีลเลอร์เดิม 2 (save)'::text, 3300000::numeric, 'inactive'::text)
                        from dealers where code = 'ZZLG2'), 'ผล save_dealers ลงฐานครบ');

  -- ── คำสั่งย้ายข้อมูลดีลเลอร์ (เส้นทางย้ายข้อมูลของ HQ เรียกด้วยสิทธิ์เซิร์ฟเวอร์) ──
  update dealers set status = 'active' where code = 'ZZLG2';
  perform move_dealer_data_atomic('ZZLG1', 'ZZLG2');
  perform flowtest.ok((select dealer_code from leads where id = '#L-ZZLG-1') = 'ZZLG2', 'ย้ายข้อมูลดีลเลอร์เดิม: ลูกค้าเป้าหมายไปอยู่ดีลเลอร์ปลายทาง');
  perform flowtest.ok((select prospect_id from dealers where code = 'ZZLG2') is null, 'ดีลเลอร์เดิมยังไม่มีผู้สนใจผูก (ไม่ถูกบังคับตอนแก้)');
end $$;

\echo 'ALL PASS'
rollback;
