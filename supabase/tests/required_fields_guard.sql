-- ── ข้อทดสอบใบ 0276: ฐานกันช่องบังคับว่าง (บอสสั่ง 4 พ.ย. 69) — ข้อมูลปลอมทั้งหมด (000-000-NNNN) ─────────────────────
--   1) ใบค่าแฟรนไชส์: สร้างต้องครบ 8 ช่อง (ขาดช่องเดียว/ช่องว่างล้วน = ปฏิเสธ) · "-" ในเงื่อนไขผ่าน · มีผลถึงก่อนวันที่เสนอ = ปฏิเสธ
--      ร่างเก่าที่ว่างอยู่แล้ว: แก้ช่องอื่นได้ · ส่งไม่ได้จนครบ · แก้ช่องที่มีค่าเป็นว่าง = ปฏิเสธ
--   2) ตารางอื่น: เดิมมีค่า → แก้เป็นว่าง/ช่องว่างล้วน = ปฏิเสธ · "-" ผ่าน · แถวที่ว่างมาแต่เดิมแก้ช่องอื่นได้
--   3) ผู้สนใจไม่มีเบอร์ / ผู้รับผิดชอบไม่มีชื่อ = สร้างไม่ได้
--   4) ผ่านสิทธิ์ผู้ใช้จริง (authenticated) ก็ถูกกัน — ไม่ใช่แค่ผู้ดูแลฐาน
--   ตกบนโค้ดก่อนใบ 0276: ข้อแรกที่ควรถูกปฏิเสธ "ผ่าน"
-- รัน: docker exec -i <คอนเทนเนอร์ฐานทดสอบ> psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 < supabase/tests/required_fields_guard.sql
begin;
create schema rqtest;
create function rqtest.ok(p_cond boolean, p_what text) returns void language plpgsql as $$
begin if p_cond is not true then raise exception 'FAIL: %', p_what; end if; raise notice 'ok  %', p_what; end $$;
create function rqtest.must_fail(p_sql text, p_like text, p_what text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if sqlerrm ilike '%' || p_like || '%' then raise notice 'ok  % (ถูกปฏิเสธ: %)', p_what, sqlerrm; return; end if;
    raise exception 'FAIL: % — ถูกปฏิเสธแต่ข้อความไม่ตรง: %', p_what, sqlerrm;
  end;
  raise exception 'FAIL: % — ควรถูกปฏิเสธแต่ผ่าน', p_what;
end $$;
create function rqtest.must_pass(p_sql text, p_what text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then raise exception 'FAIL: % — ควรผ่านแต่ถูกปฏิเสธ: %', p_what, sqlerrm;
  end;
  raise notice 'ok  %', p_what;
end $$;
create function rqtest.as_user(p_uid uuid, p_role text) returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'user_role', p_role, 'dealer_code', '', 'email', 'zzrq@example.test')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function rqtest.as_admin() returns void language plpgsql as $$
begin perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '', true); end $$;
grant usage on schema rqtest to authenticated;
grant execute on all functions in schema rqtest to authenticated;

-- ── แถวทดสอบ (ข้ามด่านด้วย replica: ร่างเก่าที่ว่าง = สภาพแถวบนฐานจริงก่อนใบนี้) ──
set local session_replication_role = replica;
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000a7601', 'zzrq-hq@example.test', 'authenticated', 'authenticated');
insert into profiles (id, role, dealer_code, name, status) values
  ('00000000-0000-4000-8000-0000000a7601', 'SUPER_ADMIN', '', 'ZZRQ ผู้ดูแล', 'active');
insert into dealer_prospects (id, name, phone, status) overriding system value values
  (997601, 'ZZTEST-RQ ผู้สนใจ', '000-000-7601', 'new'),
  (997602, 'ZZTEST-RQ ผู้สนใจเบอร์ว่างเดิม', null, 'new');
insert into dealer_package_proposals (id, prospect_id, proposal_no, status, proposed_date) overriding system value values
  (997611, 997601, 'ZZTEST-RQ-ร่างเก่า', 'draft', '2026-11-04');
insert into leads (id, dealer_code, num_id, company, contact, phone, province) overriding system value values
  ('#L-ZZRQ1', 'BKK', 997621, 'ZZTEST-RQ บริษัทลีด', 'ZZ ผู้ติดต่อ', '000-000-7621', 'กรุงเทพมหานคร'),
  ('#L-ZZRQ2', 'BKK', 997622, 'ZZTEST-RQ บริษัทลีดเก่า', null, null, null);
insert into customers (id, dealer_code, company, name, phone) overriding system value values
  (997631, 'BKK', 'ZZTEST-RQ บริษัทลูกค้า', 'ZZ ผู้ติดต่อ', '000-000-7631'),
  (997632, 'BKK', 'ZZTEST-RQ บริษัทลูกค้าเก่า', '', '');
insert into appointments (id, dealer_code, type, date, time) overriding system value values
  (997641, 'BKK', 'meeting', '2026-11-05', '09:00');
insert into customer_notes (id, dealer_code, customer_id, title) overriding system value values (997651, 'BKK', 997631, 'ZZ หัวข้อ');
insert into responsible_persons (id, dealer_code, name) overriding system value values (997661, 'BKK', 'ZZ พนักงานขาย');
set local session_replication_role = origin;

do $$
declare
  ครบ text := $q$insert into dealer_package_proposals (prospect_id, status, amount, contract_months, annual_target, region, province, proposed_date, valid_until, terms)
                  values (997601, 'draft', %s, %s, %s, %s, %s, %s, %s, %s)$q$;
  ค jsonb := jsonb_build_object('amount', '50000', 'contract_months', '12', 'annual_target', '1000000', 'region', '''กลาง''',
                                'province', '''กรุงเทพมหานคร''', 'proposed_date', '''2026-11-04''', 'valid_until', '''2026-12-04''', 'terms', '''เงื่อนไขทดสอบ''');
  ลำดับ text[] := array['amount', 'contract_months', 'annual_target', 'region', 'province', 'proposed_date', 'valid_until', 'terms'];
  ชื่อ jsonb := '{"amount":"ค่าแรกเข้า","contract_months":"ระยะสัญญา","annual_target":"เป้ายอดซื้อต่อปี","region":"ภาค","province":"จังหวัด","proposed_date":"วันที่เสนอ","valid_until":"ข้อเสนอมีผลถึง","terms":"เงื่อนไข"}';
  ช่อง text;
  ด้วย jsonb;
  sql_ text;
begin
  perform rqtest.as_admin();
  -- 1) ใบค่าแฟรนไชส์
  perform rqtest.must_pass(format(ครบ, variadic (select array_agg(ค->>k order by i) from unnest(ลำดับ) with ordinality u(k, i))), '1) สร้างใบครบ 8 ช่อง = ผ่าน');
  ด้วย := ค || jsonb_build_object('terms', '''-''');
  perform rqtest.must_pass(format(ครบ, variadic (select array_agg(ด้วย->>k order by i) from unnest(ลำดับ) with ordinality u(k, i))), '1) เงื่อนไข "-" = ผ่าน');
  foreach ช่อง in array ลำดับ loop
    continue when ช่อง = 'proposed_date';   -- มีค่าตั้งต้นวันนี้ (NOT NULL) · null ตรง ๆ ถูก NOT NULL กัน
    ด้วย := ค || jsonb_build_object(ช่อง, 'null');
    sql_ := format(ครบ, variadic (select array_agg(ด้วย->>k order by i) from unnest(ลำดับ) with ordinality u(k, i)));
    perform rqtest.must_fail(sql_, 'required_field', format('1) สร้างใบไม่มี%s = ปฏิเสธ', ชื่อ->>ช่อง));
  end loop;
  foreach ช่อง in array array['region', 'province', 'terms'] loop
    ด้วย := ค || jsonb_build_object(ช่อง, '''   ''');
    sql_ := format(ครบ, variadic (select array_agg(ด้วย->>k order by i) from unnest(ลำดับ) with ordinality u(k, i)));
    perform rqtest.must_fail(sql_, 'required_field', format('1) %s เป็นช่องว่างล้วน = ปฏิเสธ', ชื่อ->>ช่อง));
  end loop;
  ด้วย := ค || jsonb_build_object('valid_until', '''2026-11-01''');
  perform rqtest.must_fail(format(ครบ, variadic (select array_agg(ด้วย->>k order by i) from unnest(ลำดับ) with ordinality u(k, i))),
                           'valid_range', '1) ข้อเสนอมีผลถึงก่อนวันที่เสนอ = ปฏิเสธ');

  -- ร่างเก่าที่ว่าง: แก้หมายเหตุได้ · ส่งไม่ได้จนครบ
  perform rqtest.must_pass($q$update dealer_package_proposals set note = 'ZZ หมายเหตุ' where id = 997611$q$, '1) ร่างเก่าที่ว่าง แก้ช่องอื่นได้');
  perform rqtest.must_fail($q$update dealer_package_proposals set status = 'sent' where id = 997611$q$, 'required_field', '1) ร่างเก่าที่ว่าง ส่งไม่ได้');
  perform rqtest.must_pass($q$update dealer_package_proposals set amount = 50000, contract_months = 12, annual_target = 1000000, region = 'กลาง',
      province = 'กรุงเทพมหานคร', valid_until = '2026-12-04', terms = 'เงื่อนไขทดสอบ' where id = 997611$q$, '1) เติมครบในร่าง = ผ่าน');
  perform rqtest.must_fail($q$update dealer_package_proposals set terms = '' where id = 997611$q$, 'required_field', '1) ร่าง: แก้เงื่อนไขที่มีค่าเป็นว่าง = ปฏิเสธ');
  perform rqtest.must_fail($q$update dealer_package_proposals set amount = null where id = 997611$q$, 'required_field', '1) ร่าง: ลบค่าแรกเข้า = ปฏิเสธ');
  perform rqtest.must_pass($q$update dealer_package_proposals set status = 'sent' where id = 997611$q$, '1) ครบแล้วส่งได้');

  -- 2) ตารางอื่น: เดิมมีค่า → ว่าง = ปฏิเสธ · "-" ผ่าน
  perform rqtest.must_fail($q$update leads set contact = '' where id = '#L-ZZRQ1'$q$, 'required_field', '2) ลีด: ล้างผู้ติดต่อ = ปฏิเสธ');
  perform rqtest.must_fail($q$update leads set phone = '  ' where id = '#L-ZZRQ1'$q$, 'required_field', '2) ลีด: โทรศัพท์ช่องว่างล้วน = ปฏิเสธ');
  perform rqtest.must_fail($q$update leads set province = null where id = '#L-ZZRQ1'$q$, 'required_field', '2) ลีด: ล้างจังหวัดหน้างาน = ปฏิเสธ');
  perform rqtest.must_pass($q$update leads set contact = '-' where id = '#L-ZZRQ1'$q$, '2) ลีด: ผู้ติดต่อ "-" = ผ่าน');
  perform rqtest.must_pass($q$update leads set note = 'ZZ' where id = '#L-ZZRQ2'$q$, '2) ลีดเก่าที่ว่างอยู่แล้ว แก้ช่องอื่นได้');

  perform rqtest.must_fail($q$update customers set name = '' where id = 997631$q$, 'required_field', '2) ลูกค้า: ล้างผู้ติดต่อ = ปฏิเสธ');
  perform rqtest.must_fail($q$update customers set phone = ' ' where id = 997631$q$, 'required_field', '2) ลูกค้า: ล้างโทรศัพท์ = ปฏิเสธ');
  perform rqtest.must_pass($q$update customers set name = '-' where id = 997631$q$, '2) ลูกค้า: ผู้ติดต่อ "-" = ผ่าน');
  perform rqtest.must_pass($q$update customers set address = 'ZZ' where id = 997632$q$, '2) ลูกค้าเก่าที่ว่างอยู่แล้ว แก้ช่องอื่นได้');

  perform rqtest.must_fail($q$update appointments set type = '' where id = 997641$q$, 'required_field', '2) นัด: ล้างประเภท = ปฏิเสธ');
  perform rqtest.must_fail($q$update appointments set date = null where id = 997641$q$, 'required_field', '2) นัด: ล้างวันที่ = ปฏิเสธ');
  perform rqtest.must_fail($q$update appointments set time = '' where id = 997641$q$, 'required_field', '2) นัด: ล้างเวลา = ปฏิเสธ');

  perform rqtest.must_fail($q$update customer_notes set title = '' where id = 997651$q$, 'required_field', '2) โน้ต: ล้างหัวข้อ = ปฏิเสธ');
  perform rqtest.must_pass($q$update customer_notes set title = '-' where id = 997651$q$, '2) โน้ต: หัวข้อ "-" = ผ่าน');

  perform rqtest.must_fail($q$update responsible_persons set name = ' ' where id = 997661$q$, 'required_field', '2) ผู้รับผิดชอบ: ล้างชื่อ = ปฏิเสธ');

  perform rqtest.must_fail($q$update dealers set name = '' where code = 'BKK'$q$, 'required_field', '2) ดีลเลอร์: ล้างชื่อ = ปฏิเสธ');
  perform rqtest.must_fail($q$update dealers set region = null where code = 'BKK'$q$, 'required_field', '2) ดีลเลอร์: ล้างภาค = ปฏิเสธ');

  perform rqtest.must_fail($q$update profiles set name = '' where id = '00000000-0000-4000-8000-0000000a7601'$q$, 'required_field', '2) ผู้ใช้: ล้างชื่อ = ปฏิเสธ');

  perform rqtest.must_fail($q$update dealer_settings set issuer = issuer || '{"company":""}' where dealer_code = 'BKK'$q$, 'required_field', '2) ผู้ออกใบ: ล้างชื่อบริษัท = ปฏิเสธ');
  perform rqtest.must_fail($q$update dealer_settings set issuer = issuer - 'address' where dealer_code = 'BKK'$q$, 'required_field', '2) ผู้ออกใบ: ลบที่อยู่ = ปฏิเสธ');
  update dealer_settings set document = document || '{"vatPercent":7, "validityDays":30}' where dealer_code = 'BKK';
  perform rqtest.must_fail($q$update dealer_settings set document = document || '{"vatPercent":null}' where dealer_code = 'BKK'$q$, 'required_field', '2) ใบเสนอราคา: ล้าง VAT = ปฏิเสธ');
  perform rqtest.must_fail($q$update dealer_settings set document = document - 'validityDays' where dealer_code = 'BKK'$q$, 'required_field', '2) ใบเสนอราคา: ลบอายุใบ = ปฏิเสธ');
  perform rqtest.must_pass($q$update dealer_settings set issuer = issuer || '{"taxId":"-"}' where dealer_code = 'BKK'$q$, '2) ผู้ออกใบ: เลขผู้เสียภาษี "-" = ผ่าน');

  perform rqtest.must_fail($q$update hq_company set phone = '' where id = 1$q$, 'required_field', '2) บริษัท HQ: ล้างโทรศัพท์ = ปฏิเสธ');
  perform rqtest.must_pass($q$update hq_company set tax_id = '-' where id = 1$q$, '2) บริษัท HQ: เลขผู้เสียภาษี "-" = ผ่าน');

  perform rqtest.must_fail($q$update dealer_prospects set phone = '' where id = 997601$q$, 'required_field', '2) ผู้สนใจ: ล้างเบอร์ = ปฏิเสธ');
  perform rqtest.must_pass($q$update dealer_prospects set note = 'ZZ' where id = 997602$q$, '2) ผู้สนใจเก่าที่ไม่มีเบอร์ แก้ช่องอื่นได้');

  -- 3) สร้างใหม่ไม่มีเบอร์/ชื่อ
  perform rqtest.must_fail($q$insert into dealer_prospects (name, phone) values ('ZZTEST-RQ ไม่มีเบอร์', null)$q$, 'required_field', '3) ผู้สนใจใหม่ไม่มีเบอร์ = ปฏิเสธ');
  perform rqtest.must_fail($q$insert into dealer_prospects (name, phone) values ('ZZTEST-RQ เบอร์ว่าง', '  ')$q$, 'required_field', '3) ผู้สนใจใหม่เบอร์ช่องว่างล้วน = ปฏิเสธ');
  perform rqtest.must_fail($q$insert into responsible_persons (dealer_code, name) values ('BKK', '')$q$, 'required_field', '3) ผู้รับผิดชอบใหม่ไม่มีชื่อ = ปฏิเสธ');

  -- 4) ผ่านสิทธิ์ผู้ใช้จริง
  perform rqtest.as_user('00000000-0000-4000-8000-0000000a7601', 'SUPER_ADMIN');
  perform rqtest.must_fail($q$update hq_company set name = '' where id = 1$q$, 'required_field', '4) ผู้ดูแล HQ (authenticated) ล้างชื่อบริษัท = ปฏิเสธ');
  perform rqtest.must_pass($q$update hq_company set address = 'ZZ ที่อยู่ทดสอบ' where id = 1$q$, '4) ผู้ดูแล HQ แก้ที่อยู่ปกติ = ผ่าน (คำสั่งในด่านเรียกได้)');
  perform rqtest.as_admin();
end $$;

select 'ALL PASS' as result;
rollback;
