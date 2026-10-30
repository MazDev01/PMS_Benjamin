-- ── ทดสอบใบ 0195 (+0214 ยกเลิกหนึ่งจังหวัดหนึ่งดีลเลอร์): กฎพื้นที่ (FLOW.html กฎที่ระบบบังคับ) ─────────────────────────
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

-- ดีลเลอร์ที่จังหวัดในทะเบียนสะกดไม่ตรงรายชื่อ (ข้อมูลเดิมก่อนใบ 0259 — ตัวกันไม่รับแล้ว จึงใส่แบบปิดตัวดัก)
--   เดิมพึ่ง BKK "กรุงเทพฯ" ในข้อมูลตั้งต้น · 30 ต.ค. 69 ข้อมูลตั้งต้นแก้เป็น "กรุงเทพมหานคร" + พื้นที่ 1 แถว (ตามกติกา 0259) → ข้อนี้ใส่แถวของตัวเอง
set local session_replication_role = replica;
insert into dealers (code, name, province, region, status) values ('ZZTUB', 'ZZTEST จังหวัดสะกดไม่ตรง', 'กรุงเทพฯ', 'กลาง', 'active');
set local session_replication_role = origin;

do $$
declare c record; n int;
begin
  select * into c from flowtest.t_ctx;

  -- ══ ก. รายชื่อจังหวัดมาตรฐาน ══
  perform flowtest.ok((select count(*) from th_provinces) = 77, 'รายชื่อจังหวัดมาตรฐาน 77 จังหวัด');
  perform flowtest.must_fail('insert into dealer_territories (province, dealer_code) values (''กรุงเทพฯ'', ''RYG'')',
    'dealer_territor', 'จังหวัดที่ไม่อยู่ในรายชื่อมาตรฐาน (ชื่อย่อ กรุงเทพฯ) ใส่ในพื้นที่ไม่ได้');   -- ใบ 0259: ตัวกันพื้นที่ต้องตรงที่ตั้ง ดักก่อนกุญแจนอก
  perform flowtest.must_fail('insert into dealer_territories (province, dealer_code) values (''ระยองง'', ''RYG'')',
    'dealer_territor', 'จังหวัดที่สะกดผิดใส่ในพื้นที่ไม่ได้');

  -- ══ ข. ย้ายพื้นที่จากข้อมูลดีลเลอร์เดิม — ไม่เดาจับคู่ ══
  perform flowtest.ok(exists (select 1 from dealer_territories where dealer_code = 'RYG' and province = 'ระยอง' and not legacy),
    'ดีลเลอร์ที่อยู่จังหวัดเดียว → ได้พื้นที่จังหวัดนั้นเต็มกฎ (ไม่ติดป้าย legacy)');
  perform flowtest.ok(not exists (select 1 from dealer_territories where dealer_code = 'ZZTUB'),
    'ดีลเลอร์ที่จังหวัดสะกดไม่ตรงรายชื่อมาตรฐาน (ZZTUB = กรุงเทพฯ) → ไม่ถูกจับคู่เอง ไม่ได้พื้นที่');
  perform flowtest.ok(exists (select 1 from dealer_territories where dealer_code = 'BKK' and province = 'กรุงเทพมหานคร'),
    'ข้อมูลตั้งต้น BKK = กรุงเทพมหานคร มีพื้นที่ 1 แถว (ตามกติกา 0259)');
  perform flowtest.ok(exists (select 1 from territory_unmatched_dealers() u where u.dealer_code = 'ZZTUB')
                      and not exists (select 1 from territory_unmatched_dealers() u
                                       where exists (select 1 from dealer_territories t where t.dealer_code = u.dealer_code)),
    'รายการดีลเลอร์ที่จับคู่จังหวัดไม่ได้ ให้ HQ เห็นและแก้เอง');

  -- ══ ค. การกำหนดพื้นที่ — จังหวัดเดียวมีหลายดีลเลอร์ได้ (ใบ 0214 · ยกเลิกหนึ่งจังหวัดหนึ่งดีลเลอร์ 16 ต.ค. 69) ══
  --   ใบ 0259: ดีลเลอร์ 1 ราย = 1 จังหวัดพอดี = จังหวัดที่ตั้ง (ฐานให้พื้นที่เอง) → ดีลเลอร์รายที่ 2 ของจังหวัด = สาขาใหม่จังหวัดเดียวกัน
  insert into dealers (code, name, province, region, status) values ('ZZTRB', 'ZZTEST ระยอง B', 'ระยอง', 'ตะวันออก', 'active');
  perform flowtest.ok(exists (select 1 from dealer_territories where province = 'ระยอง' and dealer_code = 'ZZTRB'), 'จังหวัดที่มีดีลเลอร์ดูแลแล้ว เพิ่มดีลเลอร์รายที่ 2 ได้');
  delete from dealers where code = 'ZZTRB';
  insert into dealers (code, name, province, region, status) values ('ZZTRT', 'ZZTEST ยะลา', 'ยะลา', 'ใต้', 'active');
  perform flowtest.ok(exists (select 1 from dealer_territories where province = 'ยะลา' and dealer_code = 'ZZTRT'), 'จังหวัดว่างกำหนดให้ดีลเลอร์ได้');
  delete from dealers where code = 'ZZTRT';

  -- ══ ง. ลูกค้าเป้าหมายใหม่: หน้างานต้องอยู่ในพื้นที่ตัวเอง ══
  perform flowtest.as_dealer('RYG', c.ryg_uid);
  perform flowtest.new_lead('RYG', '#TT-1', 'บจ. ทดสอบพื้นที่ระยอง', '081-100-0001', 'ระยอง');
  perform flowtest.ok(true, 'หน้างานอยู่ในพื้นที่ตัวเอง → สร้างได้');
  perform flowtest.must_fail('select flowtest.new_lead(''RYG'', ''#TT-2'', ''บจ. ทดสอบนอกพื้นที่'', ''081-100-0002'', ''ชลบุรี'')',
    'lead_outside_territory', 'หน้างานอยู่ในพื้นที่ของดีลเลอร์อื่น (ชลบุรี = CBI) → สร้างไม่ได้');

  -- ══ จ. จังหวัดว่าง: ใครยื่นก่อนได้งาน ══
  perform flowtest.new_lead('RYG', '#TT-3', 'บจ. โกดังบึงกาฬ', '081-100-0003', 'บึงกาฬ');
  perform flowtest.ok(true, 'จังหวัดว่าง → ดีลเลอร์ใดก็ยื่นได้');
  perform flowtest.as_dealer('CNX', c.cnx_uid);
  perform flowtest.must_fail('select flowtest.new_lead(''CNX'', ''#TT-4'', ''  บจ.  โกดังบึงกาฬ '', ''0811000003'', ''บึงกาฬ'')',
    'lead_taken', 'จังหวัดว่าง งานเดียวกัน (ชื่อ+เบอร์เดียวกันหลังปรับรูปแบบ) ดีลเลอร์อื่นยื่นไว้ก่อน → ยื่นซ้ำไม่ได้');
  perform flowtest.new_lead('CNX', '#TT-5', 'บจ. งานอื่นที่บึงกาฬ', '081-100-0005', 'บึงกาฬ');
  perform flowtest.ok(true, 'จังหวัดว่าง งานคนละงาน → ยื่นได้');

  -- ══ ฉ. จังหวัดที่ดูแลร่วมกัน: ดีลเลอร์ทุกรายที่ดูแลสร้างลีดได้ · รายที่ไม่ได้ดูแลสร้างไม่ได้ ══
  perform flowtest.as_root();
  --   ใบ 0259: ลำพูนดูแลร่วม = สาขาทดสอบ 2 สาขาจังหวัดเดียวกัน (สิทธิ์เขียนอ่านจากรหัสสาขาในบัตรผ่าน)
  insert into dealers (code, name, province, region, status) values ('ZZTLA', 'ZZTEST ลำพูน A', 'ลำพูน', 'เหนือ', 'active'), ('ZZTLB', 'ZZTEST ลำพูน B', 'ลำพูน', 'เหนือ', 'active');
  perform flowtest.as_dealer('ZZTLA', c.ryg_uid);
  perform flowtest.new_lead('ZZTLA', '#TT-6', 'บจ. ลำพูนหนึ่ง', '081-100-0006', 'ลำพูน');
  perform flowtest.as_dealer('ZZTLB', c.cnx_uid);
  perform flowtest.new_lead('ZZTLB', '#TT-7', 'บจ. ลำพูนสอง', '081-100-0007', 'ลำพูน');
  perform flowtest.ok(true, 'จังหวัดที่ดูแลร่วมกัน → ดีลเลอร์ทั้งสองรายสร้างลูกค้าเป้าหมายได้');
  perform flowtest.as_dealer('CNX', c.cnx_uid);
  perform flowtest.must_fail('select flowtest.new_lead(''CNX'', ''#TT-8'', ''บจ. ลำพูนสาม'', ''081-100-0008'', ''ลำพูน'')',
    'lead_outside_territory', 'ดีลเลอร์ที่ไม่ได้ดูแลจังหวัด สร้างลูกค้าเป้าหมายในจังหวัดนั้นไม่ได้');

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
  -- ══ ญ. จังหวัดของลูกค้าเป้าหมายต้องอยู่ในรายชื่อมาตรฐาน (กันเลี่ยงกฎพื้นที่ด้วยชื่อย่อ/สะกดผิด) ══
  perform flowtest.must_fail('select flowtest.new_lead(''RYG'', ''#TT-10'', ''บจ. ชื่อย่อจังหวัด'', ''081-100-0010'', ''กรุงเทพฯ'')',
    'lead_province_invalid', 'สร้างลูกค้าเป้าหมายจังหวัด "กรุงเทพฯ" (ไม่ตรงรายชื่อมาตรฐาน) → ถูกปฏิเสธ');
  perform flowtest.must_fail('update leads set province = ''ระยองง'' where dealer_code = ''RYG'' and id = ''#TT-9''',
    'lead_province_invalid', 'แก้จังหวัดเป็นชื่อที่สะกดผิด → ถูกปฏิเสธ');
  perform flowtest.as_root();
  perform flowtest.must_fail('insert into leads (id, dealer_code, num_id, name, company, phone, province) values (''#TT-11'', ''RYG'', 980999998, ''x'', ''x'', ''081'', ''กรุงเทพฯ'')',
    'lead_province_invalid', 'ฝั่งเซิร์ฟเวอร์ (นำเข้า) ก็ใส่จังหวัดนอกรายชื่อไม่ได้');
end $$;

do $$
declare c record;
begin
  select * into c from flowtest.t_ctx;
  -- ข้อมูลเดิมที่จังหวัดไม่ตรงรายชื่อ (มีอยู่ก่อนกฎ) แก้ช่องอื่นได้ตามปกติ — ไม่บล็อกจนกว่าจะแก้จังหวัด
  alter table leads disable trigger user;
  insert into leads (id, dealer_code, num_id, name, company, phone, province, status)
  values ('#TT-12', 'RYG', 980999997, 'เดิม', 'บจ. รายเดิมจังหวัดชื่อย่อ', '081-100-0012', 'กรุงเทพฯ', 'WAITING');
  alter table leads enable trigger user;
  perform flowtest.as_dealer('RYG', c.ryg_uid);
  update leads set note = 'แก้โน้ตรายเดิม' where dealer_code = 'RYG' and id = '#TT-12';
  perform flowtest.ok(found, 'รายเดิมที่จังหวัดไม่ตรงรายชื่อ (มีก่อนกฎ) แก้ช่องอื่นได้ตามปกติ');
  update leads set province = 'ระยอง' where dealer_code = 'RYG' and id = '#TT-12';
  perform flowtest.ok(found, 'แก้จังหวัดของรายเดิมให้ถูกรายชื่อ → ได้');
  perform flowtest.as_root();
  raise notice 'ALL PASS';
end $$;

rollback;
