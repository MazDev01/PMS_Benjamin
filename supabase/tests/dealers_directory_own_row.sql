-- ── ข้อทดสอบใบ 0220: ทะเบียนดีลเลอร์ (dealers_directory) — ดีลเลอร์เห็นแถวตัวเองแถวเดียว · HQ เห็นครบ ──────────────────
-- รัน: docker exec -i supabase_db_pms-dbcheck psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 < supabase/tests/dealers_directory_own_row.sql
-- ทรานแซกชันเดียวแล้ว rollback · รอบปิดด่านรันผ่าน tests/scenario/db-rule-tests.spec.ts · ผ่าน = "ALL PASS"
begin;
do $$
declare ทั้งหมด int; เห็น int; อื่น int; เป้าตัวเอง numeric; คนนอก int;
begin
  select count(*) into ทั้งหมด from dealers;
  if ทั้งหมด < 2 then raise exception 'FAIL: ข้อมูลตั้งต้นต้องมีดีลเลอร์อย่างน้อย 2 ราย'; end if;

  -- ดีลเลอร์ A (CNX) อ่านแถวของดีลเลอร์ B ไม่ได้
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from profiles where role = 'DEALER_ADMIN' and dealer_code = 'CNX' limit 1),
    'role', 'authenticated', 'user_role', 'DEALER_ADMIN', 'dealer_code', 'CNX')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*), count(*) filter (where code <> 'CNX') into เห็น, อื่น from dealers_directory;
  select revenue_target into เป้าตัวเอง from dealers_directory where code = 'CNX';
  if เห็น <> 1 or อื่น <> 0 then raise exception 'FAIL: ดีลเลอร์ CNX เห็นทะเบียน % แถว (สาขาอื่น % แถว) — ต้องเห็นแค่แถวตัวเอง', เห็น, อื่น; end if;
  raise notice 'ok  ดีลเลอร์ CNX เห็นแถวตัวเองแถวเดียว ไม่เห็นสาขาอื่น';
  if (select count(*) from dealers_directory where code = 'RYG') <> 0 then raise exception 'FAIL: ดีลเลอร์ CNX อ่านแถว RYG ได้'; end if;
  raise notice 'ok  ดีลเลอร์ CNX ขอแถว RYG ตรง ๆ ก็ไม่ได้';
  if เป้าตัวเอง is null then raise exception 'FAIL: ดีลเลอร์ต้องยังเห็นเป้ายอดขายของตัวเอง'; end if;
  raise notice 'ok  ดีลเลอร์ยังเห็นเป้ายอดขายของตัวเอง';

  -- HQ เห็นครบ
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from profiles where role = 'SUPER_ADMIN' limit 1),
    'role', 'authenticated', 'user_role', 'SUPER_ADMIN', 'dealer_code', '')::text, true);
  select count(*) into เห็น from dealers_directory;
  if เห็น <> ทั้งหมด then raise exception 'FAIL: HQ เห็นทะเบียน % จาก % แถว', เห็น, ทั้งหมด; end if;
  raise notice 'ok  HQ เห็นทะเบียนครบ % แถว', เห็น;

  -- คนไม่เข้าระบบอ่านไม่ได้
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true);
  begin
    select count(*) into คนนอก from dealers_directory;
  exception when insufficient_privilege then คนนอก := 0;
  end;
  if คนนอก <> 0 then raise exception 'FAIL: คนไม่เข้าระบบเห็นทะเบียน % แถว', คนนอก; end if;
  raise notice 'ok  คนไม่เข้าระบบอ่านทะเบียนไม่ได้';

  perform set_config('role', 'postgres', true);
  raise notice 'ALL PASS';
end $$;
rollback;
