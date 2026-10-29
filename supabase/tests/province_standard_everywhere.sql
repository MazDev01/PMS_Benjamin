-- ── ข้อทดสอบใบ 0259: จังหวัดจากรายชื่อ 77 จังหวัดทุกที่ + ดีลเลอร์ดูแล 1 จังหวัดพอดี (บอสสั่ง 29 ต.ค. 69) ─────────────
--   ข้อที่บอสสั่ง: "กรุงเทพฯ" ถูกปฏิเสธ · ไม่มีจังหวัดบันทึกไม่ได้ · 2 จังหวัดบันทึกไม่ได้ · 2 สาขาจังหวัดเดียวกันบันทึกได้
-- รัน: docker exec -i supabase_db_pms-dbcheck psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 < supabase/tests/province_standard_everywhere.sql
-- ทรานแซกชันเดียวแล้ว rollback · รอบปิดด่านรันผ่าน tests/scenario/db-rule-tests.spec.ts · ผ่าน = "ALL PASS"
-- ตกบนโค้ดก่อนใบ 0259: ดีลเลอร์ "กรุงเทพฯ"/ไม่มีจังหวัด บันทึกได้ · ดีลเลอร์มี 2 พื้นที่ได้ · สร้างดีลเลอร์ไม่ได้พื้นที่ · ผู้สนใจ "กทม" บันทึกได้
begin;
create schema pvtest;
create table pvtest.fails (what text);
create function pvtest.ok(p_cond boolean, p_what text) returns void language plpgsql as $$
begin
  if p_cond is not true then insert into pvtest.fails values (p_what); raise notice 'FAIL %', p_what; return; end if;
  raise notice 'ok  %', p_what;
end $$;
create function pvtest.must_fail(p_sql text, p_like text, p_what text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if sqlerrm ilike '%' || p_like || '%' then raise notice 'ok  % (ถูกปฏิเสธ)', p_what; return; end if;
    insert into pvtest.fails values (format('%s — ถูกปฏิเสธแต่ข้อความไม่ตรง: %s', p_what, sqlerrm)); return;
  end;
  insert into pvtest.fails values (p_what || ' — ควรถูกปฏิเสธแต่ผ่าน'); raise notice 'FAIL %', p_what;
end $$;
create function pvtest.must_pass(p_sql text, p_what text) returns void language plpgsql as $$
begin
  begin execute p_sql; raise notice 'ok  %', p_what;
  exception when others then insert into pvtest.fails values (format('%s — ถูกปฏิเสธ: %s', p_what, sqlerrm)); raise notice 'FAIL %', p_what;
  end;
end $$;
create function pvtest.พื้นที่(p_code text) returns text language sql as $$
  select coalesce(string_agg(province, ',' order by province), '') from public.dealer_territories where dealer_code = p_code $$;

do $$
begin
  -- 1) "กรุงเทพฯ" (ชื่อย่อ ไม่อยู่ใน 77 จังหวัด) ถูกปฏิเสธ
  perform pvtest.must_fail($q$insert into public.dealers (code, name, province, region, status) values ('ZZPVA', 'ZZTEST จังหวัด A', 'กรุงเทพฯ', 'กลาง', 'active')$q$,
    'dealer_province_invalid', '1) ดีลเลอร์จังหวัด "กรุงเทพฯ" = ปฏิเสธ');
  -- 2) ไม่มีจังหวัด บันทึกไม่ได้
  perform pvtest.must_fail($q$insert into public.dealers (code, name, province, region, status) values ('ZZPVA', 'ZZTEST จังหวัด A', '', 'กลาง', 'active')$q$,
    'dealer_province_required', '2) ดีลเลอร์ไม่มีจังหวัด = ปฏิเสธ');
  perform pvtest.must_fail($q$insert into public.dealers (code, name, region, status) values ('ZZPVA', 'ZZTEST จังหวัด A', 'กลาง', 'active')$q$,
    'dealer_province_required', '2) ดีลเลอร์จังหวัดเป็นค่าว่าง (null) = ปฏิเสธ');

  -- 4) 2 สาขาจังหวัดเดียวกัน บันทึกได้ · ฐานให้พื้นที่จังหวัดที่ตั้งเอง
  perform pvtest.must_pass($q$insert into public.dealers (code, name, province, region, status) values ('ZZPVA', 'ZZTEST จังหวัด A', 'พะเยา', 'เหนือ', 'active')$q$,
    '4) สาขาแรกจังหวัดพะเยา บันทึกได้');
  perform pvtest.must_pass($q$insert into public.dealers (code, name, province, region, status) values ('ZZPVB', 'ZZTEST จังหวัด B', 'พะเยา', 'เหนือ', 'active')$q$,
    '4) สาขาที่ 2 จังหวัดเดียวกัน (พะเยา) บันทึกได้');
  perform pvtest.ok(pvtest.พื้นที่('ZZPVA') = 'พะเยา' and pvtest.พื้นที่('ZZPVB') = 'พะเยา', '4) สร้างดีลเลอร์แล้วได้พื้นที่จังหวัดที่ตั้ง 1 จังหวัด (ทั้ง 2 สาขา)');

  -- 3) 2 จังหวัด บันทึกไม่ได้ (เพิ่มพื้นที่จังหวัดที่ 2 · หรือพื้นที่ไม่ตรงจังหวัดที่ตั้ง)
  perform pvtest.must_fail($q$insert into public.dealer_territories (province, dealer_code) values ('น่าน', 'ZZPVA')$q$,
    'dealer_territory', '3) เพิ่มจังหวัดดูแลที่ 2 = ปฏิเสธ');
  perform pvtest.ok(pvtest.พื้นที่('ZZPVA') = 'พะเยา', '3) ยังดูแลจังหวัดเดียว');

  -- แก้จังหวัดที่ตั้ง → พื้นที่ย้ายตาม · ชื่อนอกรายชื่อ = ปฏิเสธ · ลบพื้นที่สุดท้าย = ปฏิเสธ · ลบดีลเลอร์ทั้งราย = ลบได้
  perform pvtest.must_pass($q$update public.dealers set province = 'น่าน' where code = 'ZZPVA'$q$, 'แก้จังหวัดที่ตั้งเป็นน่าน บันทึกได้');
  perform pvtest.ok(pvtest.พื้นที่('ZZPVA') = 'น่าน', 'แก้จังหวัดที่ตั้งแล้ว พื้นที่ย้ายตาม 1 จังหวัด');
  perform pvtest.must_fail($q$update public.dealers set province = 'กทม' where code = 'ZZPVA'$q$, 'dealer_province_invalid', 'แก้จังหวัดที่ตั้งเป็น "กทม" = ปฏิเสธ');
  perform pvtest.must_fail($q$update public.dealers set province = null where code = 'ZZPVA'$q$, 'dealer_province_required', 'ล้างจังหวัดที่ตั้ง = ปฏิเสธ');
  perform pvtest.must_fail($q$delete from public.dealer_territories where dealer_code = 'ZZPVA'$q$, 'dealer_territory_required', 'ลบพื้นที่สุดท้ายของดีลเลอร์ = ปฏิเสธ');
  perform pvtest.must_pass($q$delete from public.dealers where code = 'ZZPVB'$q$, 'ลบดีลเลอร์ทั้งราย = ลบได้ (พื้นที่ลบตาม)');
  perform pvtest.ok(pvtest.พื้นที่('ZZPVB') = '', 'ลบดีลเลอร์แล้วไม่เหลือพื้นที่ค้าง');
  -- แถว HQ ยกเว้น ("ทุกจังหวัด" ได้)
  perform pvtest.must_pass($q$update public.dealers set province = 'ทุกจังหวัด' where code = 'HQ'$q$, 'แถว HQ ใช้ "ทุกจังหวัด" ได้');

  -- ผู้สนใจ + ลูกค้า: ชื่อนอกรายชื่อ = ปฏิเสธ · ว่างได้ · ผู้สนใจ "ทุกจังหวัด" ได้
  perform pvtest.must_fail($q$insert into public.dealer_prospects (name, province) values ('ZZTEST ผู้สนใจจังหวัด', 'กทม')$q$, 'province_invalid', 'ผู้สนใจจังหวัด "กทม" = ปฏิเสธ');
  perform pvtest.must_pass($q$insert into public.dealer_prospects (name, province) values ('ZZTEST ผู้สนใจจังหวัด', 'กรุงเทพมหานคร')$q$, 'ผู้สนใจจังหวัดมาตรฐาน บันทึกได้');
  perform pvtest.must_pass($q$insert into public.dealer_prospects (name, province) values ('ZZTEST ผู้สนใจทั่วประเทศ', 'ทุกจังหวัด')$q$, 'ผู้สนใจ "ทุกจังหวัด" บันทึกได้');
  perform pvtest.must_pass($q$insert into public.dealer_prospects (name) values ('ZZTEST ผู้สนใจไม่มีจังหวัด')$q$, 'ผู้สนใจไม่ระบุจังหวัด บันทึกได้');
  perform pvtest.must_fail($q$update public.customers set province = 'กรุงเทพฯ' where id = (select min(id) from public.customers where province is distinct from 'กรุงเทพฯ')$q$, 'province_invalid', 'ลูกค้าจังหวัด "กรุงเทพฯ" = ปฏิเสธ');
  perform pvtest.must_fail($q$update public.leads set province = 'กรุงเทพฯ' where (dealer_code, num_id) = (select dealer_code, num_id from public.leads where province is distinct from 'กรุงเทพฯ' order by num_id limit 1)$q$, 'lead_province_invalid', 'ลีดจังหวัด "กรุงเทพฯ" = ปฏิเสธ (ใบ 0196)');

  if exists (select 1 from pvtest.fails) then
    raise exception 'FAIL % ข้อ: %', (select count(*) from pvtest.fails), (select string_agg(what, ' · ') from pvtest.fails);
  end if;
end $$;

select 'ALL PASS' as result;
rollback;
