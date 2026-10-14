-- ── ทดสอบใบ 0195: กฎพื้นที่ หนึ่งจังหวัด หนึ่งดีลเลอร์ (FLOW.html กฎที่ระบบบังคับ) ─────────────────────────
-- รัน: docker exec -i <คอนเทนเนอร์ฐานทดสอบ> psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/territories.sql
-- ทุกอย่างอยู่ในทรานแซกชันเดียวแล้ว rollback ท้ายไฟล์ · ผ่าน = บรรทัดสุดท้ายขึ้น "ALL PASS"
begin;

create schema flowtest;
create table flowtest.t_ctx as
select (select id from profiles where role = 'DEALER_ADMIN' and dealer_code = 'RYG' limit 1) as ryg_uid,
       (select id from profiles where role = 'DEALER_ADMIN' and dealer_code = 'CNX' limit 1) as cnx_uid,
       (select id from profiles where role = 'SUPER_ADMIN' limit 1) as hq_uid;
grant select on flowtest.t_ctx to authenticated;
create function flowtest.as_dealer(p_code text, p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated',
    'user_role', 'DEALER_ADMIN', 'dealer_code', p_code, 'email', lower(p_code) || '@test')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function flowtest.as_hq(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated',
    'user_role', 'SUPER_ADMIN', 'dealer_code', '', 'email', 'hq@test')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function flowtest.as_root() returns void language plpgsql as $$
begin perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '', true); end $$;
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
grant usage on schema flowtest to authenticated;
grant execute on all functions in schema flowtest to authenticated;
/** สร้างลูกค้าเป้าหมายใหม่ในนามดีลเลอร์ (ผ่านกฎทุกข้อของฐาน) */
create function flowtest.new_lead(p_dealer text, p_id text, p_company text, p_phone text, p_province text) returns void language plpgsql as $$
begin
  insert into leads (id, dealer_code, num_id, name, company, phone, province, status)
  values (p_id, p_dealer, 980000000 + (abs(hashtext(p_id)) % 9999999), p_company, p_company, p_phone, p_province, 'WAITING');
end $$;

do $$
declare c record; n int;
begin
  select * into c from flowtest.t_ctx;

  -- ══ ก. รายชื่อจังหวัดมาตรฐาน ══
  perform flowtest.ok((select count(*) from th_provinces) = 77, 'รายชื่อจังหวัดมาตรฐาน 77 จังหวัด');
  perform flowtest.must_fail('insert into dealer_territories (province, dealer_code) values (''กรุงเทพฯ'', ''RYG'')',
    'dealer_territories_province_fkey', 'จังหวัดที่ไม่อยู่ในรายชื่อมาตรฐาน (ชื่อย่อ กรุงเทพฯ) ใส่ในพื้นที่ไม่ได้');
  perform flowtest.must_fail('insert into dealer_territories (province, dealer_code) values (''ระยองง'', ''RYG'')',
    'dealer_territories_province_fkey', 'จังหวัดที่สะกดผิดใส่ในพื้นที่ไม่ได้');

  -- ══ ข. ย้ายพื้นที่จากข้อมูลดีลเลอร์เดิม — ไม่เดาจับคู่ ══
  perform flowtest.ok(exists (select 1 from dealer_territories where dealer_code = 'RYG' and province = 'ระยอง' and not legacy),
    'ดีลเลอร์ที่อยู่จังหวัดเดียว → ได้พื้นที่จังหวัดนั้นเต็มกฎ (ไม่ติดป้าย legacy)');
  perform flowtest.ok(not exists (select 1 from dealer_territories where dealer_code = 'BKK'),
    'ดีลเลอร์ที่จังหวัดสะกดไม่ตรงรายชื่อมาตรฐาน (BKK = กรุงเทพฯ) → ไม่ถูกจับคู่เอง ไม่ได้พื้นที่');
  perform flowtest.ok((select count(*) from territory_unmatched_dealers()) = 1
                      and (select dealer_code from territory_unmatched_dealers() limit 1) = 'BKK',
    'รายการดีลเลอร์ที่จับคู่จังหวัดไม่ได้ ให้ HQ เห็นและแก้เอง');

  -- ══ ค. หนึ่งจังหวัด หนึ่งดีลเลอร์ (การกำหนดพื้นที่ใหม่) ══
  perform flowtest.must_fail('insert into dealer_territories (province, dealer_code) values (''ระยอง'', ''CBI'')',
    'territory_taken', 'จังหวัดที่มีดีลเลอร์ดูแลแล้ว กำหนดให้อีกรายไม่ได้');
  insert into dealer_territories (province, dealer_code) values ('ตราด', 'RYG');
  perform flowtest.ok(true, 'จังหวัดว่างกำหนดให้ดีลเลอร์ได้');
  delete from dealer_territories where province = 'ตราด';

  -- ══ ง. ลูกค้าเป้าหมายใหม่: หน้างานต้องอยู่ในพื้นที่ตัวเอง ══
  perform flowtest.as_dealer('RYG', c.ryg_uid);
  perform flowtest.new_lead('RYG', '#TT-1', 'บจ. ทดสอบพื้นที่ระยอง', '081-100-0001', 'ระยอง');
  perform flowtest.ok(true, 'หน้างานอยู่ในพื้นที่ตัวเอง → สร้างได้');
  perform flowtest.must_fail('select flowtest.new_lead(''RYG'', ''#TT-2'', ''บจ. ทดสอบนอกพื้นที่'', ''081-100-0002'', ''ชลบุรี'')',
    'lead_outside_territory', 'หน้างานอยู่ในพื้นที่ของดีลเลอร์อื่น (ชลบุรี = CBI) → สร้างไม่ได้');

  -- ══ จ. จังหวัดว่าง: ใครยื่นก่อนได้งาน ══
  perform flowtest.new_lead('RYG', '#TT-3', 'บจ. โกดังตราด', '081-100-0003', 'ตราด');
  perform flowtest.ok(true, 'จังหวัดว่าง → ดีลเลอร์ใดก็ยื่นได้');
  perform flowtest.as_dealer('CNX', c.cnx_uid);
  perform flowtest.must_fail('select flowtest.new_lead(''CNX'', ''#TT-4'', ''  บจ.  โกดังตราด '', ''0811000003'', ''ตราด'')',
    'lead_taken', 'จังหวัดว่าง งานเดียวกัน (ชื่อ+เบอร์เดียวกันหลังปรับรูปแบบ) ดีลเลอร์อื่นยื่นไว้ก่อน → ยื่นซ้ำไม่ได้');
  perform flowtest.new_lead('CNX', '#TT-5', 'บจ. งานอื่นที่ตราด', '081-100-0005', 'ตราด');
  perform flowtest.ok(true, 'จังหวัดว่าง งานคนละงาน → ยื่นได้');

  -- ══ ฉ. พื้นที่ทับซ้อนเดิม (legacy): ดีลเลอร์เดิมทุกรายสร้างได้ตามเดิม ══
  perform flowtest.as_root();
  insert into dealer_territories (province, dealer_code, legacy) values ('ลำพูน', 'RYG', true), ('ลำพูน', 'CNX', true);
  perform flowtest.as_dealer('RYG', c.ryg_uid);
  perform flowtest.new_lead('RYG', '#TT-6', 'บจ. ลำพูนหนึ่ง', '081-100-0006', 'ลำพูน');
  perform flowtest.as_dealer('CNX', c.cnx_uid);
  perform flowtest.new_lead('CNX', '#TT-7', 'บจ. ลำพูนสอง', '081-100-0007', 'ลำพูน');
  perform flowtest.ok(true, 'จังหวัดทับซ้อนเดิม → ดีลเลอร์เดิมทั้งสองรายสร้างลูกค้าเป้าหมายได้');
  perform flowtest.as_hq(c.hq_uid);
  perform flowtest.ok(exists (select 1 from territory_overlaps where province = 'ลำพูน' and dealer_codes = array['CNX', 'RYG']),
    'HQ เห็นรายการจังหวัดทับซ้อนพร้อมดีลเลอร์ที่ทับกัน');

  -- ══ ช. HQ เคลียร์ทีละจังหวัด → กฎใช้เต็ม ══
  perform flowtest.as_dealer('RYG', c.ryg_uid);
  perform flowtest.must_fail('select territory_resolve_overlap(''ลำพูน'', ''RYG'')', 'forbidden', 'ดีลเลอร์เคลียร์พื้นที่ทับซ้อนเองไม่ได้');
  perform flowtest.as_hq(c.hq_uid);
  perform territory_resolve_overlap('ลำพูน', 'RYG');
  perform flowtest.ok((select count(*) from dealer_territories where province = 'ลำพูน') = 1
                      and exists (select 1 from dealer_territories where province = 'ลำพูน' and dealer_code = 'RYG' and not legacy),
    'เคลียร์แล้ว เหลือดีลเลอร์เดียว ไม่ติดป้าย legacy');
  perform flowtest.ok(not exists (select 1 from territory_overlaps where province = 'ลำพูน'), 'จังหวัดที่เคลียร์แล้วหายจากรายการทับซ้อน');
  perform flowtest.as_dealer('CNX', c.cnx_uid);
  perform flowtest.must_fail('select flowtest.new_lead(''CNX'', ''#TT-8'', ''บจ. ลำพูนสาม'', ''081-100-0008'', ''ลำพูน'')',
    'lead_outside_territory', 'เคลียร์แล้ว ดีลเลอร์ที่ไม่ได้พื้นที่สร้างลูกค้าเป้าหมายในจังหวัดนั้นไม่ได้');
  perform flowtest.as_hq(c.hq_uid);
  perform flowtest.must_fail('select territory_resolve_overlap(''ลำพูน'', ''CNX'')', 'territory_not_overlap', 'จังหวัดที่ไม่ได้ทับซ้อนแล้ว เคลียร์ซ้ำไม่ได้');

  -- ══ ซ. ลูกค้าเป้าหมายเดิมไม่ถูกบล็อกจนกว่าจะแก้จังหวัด ══
  perform flowtest.as_root();
  insert into leads (id, dealer_code, num_id, name, company, phone, province, status)
  values ('#TT-9', 'RYG', 980999999, 'เดิม', 'บจ. รายเดิมไม่มีจังหวัด', '', '', 'WAITING');
  perform flowtest.as_dealer('RYG', c.ryg_uid);
  update leads set note = 'แก้โน้ตรายเดิม' where dealer_code = 'RYG' and id = '#TT-9';
  perform flowtest.ok(found, 'รายเดิมที่ไม่มีจังหวัด แก้ช่องอื่นได้ตามปกติ');
  perform flowtest.must_fail('update leads set province = ''ชลบุรี'' where dealer_code = ''RYG'' and id = ''#TT-9''',
    'lead_outside_territory', 'แก้จังหวัดของรายเดิมเป็นพื้นที่ของดีลเลอร์อื่น → ไม่ได้');
  update leads set province = 'ระยอง' where dealer_code = 'RYG' and id = '#TT-9';
  perform flowtest.ok(found, 'แก้จังหวัดของรายเดิมเป็นพื้นที่ตัวเอง → ได้');

  -- ══ ฌ. ดีลเลอร์อ่านพื้นที่ได้ แต่แก้เองไม่ได้ ══
  perform flowtest.ok((select count(*) from dealer_territories) > 0, 'ดีลเลอร์อ่านรายการพื้นที่ได้');
  update dealer_territories set dealer_code = 'RYG' where province = 'ชลบุรี';
  get diagnostics n = row_count;
  perform flowtest.ok(n = 0, 'ดีลเลอร์แก้พื้นที่เองไม่ได้');
  perform flowtest.as_root();
  raise notice 'ALL PASS';
end $$;

rollback;
