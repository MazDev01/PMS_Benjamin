-- ── ข้อทดสอบใบ 0275: นำเข้าผู้สนใจเป็นดีลเลอร์ทั้งชุด (บอสสั่ง 3 พ.ย. 69) — ข้อมูลปลอมทั้งหมด (000-000-NNNN) ─────────────────
--   1) นำเข้าได้ · เบอร์ทำเป็นรูปแบบเดียว · ภาคตามจังหวัด · หมายเหตุเดิม = บันทึกการติดต่อครั้งแรก · ติดต่อล่าสุด = วันเริ่มติดต่อ
--   2) เบอร์ซ้ำในไฟล์ / ซ้ำกับที่มีอยู่ = ข้าม (ฐานตัดสิน · เทียบตัวเลขล้วน · เว้นวรรค/ขีดต่างกันก็ซ้ำ) · ไม่มีชื่อ/เบอร์ = ข้าม
--   3) ขั้นที่นำเข้าไม่ได้ / ไม่สำเร็จไม่มีเหตุผล / จังหวัดนอก 77 = ปฏิเสธทั้งชุด · เกิน 1,000 แถว = ปฏิเสธ · ไม่ใช่ผู้ดูแล HQ = ปฏิเสธ
--   4) บันทึกการใช้งานแถวเดียวต่อชุด · ยกเลิกทั้งชุด = ลบรายของชุด
--      มีรายที่ถูกแตะหลังนำเข้า (บันทึกการติดต่อ · เปลี่ยนขั้น · ออกใบ) = ยกเลิกไม่ได้ + บอกจำนวน · บันทึกการติดต่อแรกจากหมายเหตุในไฟล์ไม่นับ
--   ตกบนโค้ดก่อนใบ 0275: ไม่มีคำสั่ง hq_prospects_import
-- รัน: docker exec -i <คอนเทนเนอร์ฐานทดสอบ> psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 < supabase/tests/prospect_import.sql
begin;
create schema pitest;
create function pitest.ok(p_cond boolean, p_what text) returns void language plpgsql as $$
begin if p_cond is not true then raise exception 'FAIL: %', p_what; end if; raise notice 'ok  %', p_what; end $$;
create function pitest.must_fail(p_sql text, p_like text, p_what text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if sqlerrm ilike '%' || p_like || '%' then raise notice 'ok  % (ถูกปฏิเสธ: %)', p_what, sqlerrm; return; end if;
    raise exception 'FAIL: % — ถูกปฏิเสธแต่ข้อความไม่ตรง: %', p_what, sqlerrm;
  end;
  raise exception 'FAIL: % — ควรถูกปฏิเสธแต่ผ่าน', p_what;
end $$;
create function pitest.as_user(p_uid uuid, p_role text) returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'user_role', p_role, 'dealer_code', '', 'email', 'zzpi@example.test')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function pitest.as_admin() returns void language plpgsql as $$
begin perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '', true); end $$;
grant usage on schema pitest to authenticated;
grant execute on all functions in schema pitest to authenticated;

set local session_replication_role = replica;
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000a7001', 'zzpi-hq@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000a7002', 'zzpi-staff@example.test', 'authenticated', 'authenticated');
insert into profiles (id, role, dealer_code, name, status) values
  ('00000000-0000-4000-8000-0000000a7001', 'SUPER_ADMIN', '', 'ZZPI ผู้ดูแล', 'active'),
  ('00000000-0000-4000-8000-0000000a7002', 'HQ_STAFF', '', 'ZZPI เจ้าหน้าที่', 'active');
-- ผู้สนใจที่มีอยู่แล้ว (เบอร์เขียนต่างรูปแบบ)
insert into dealer_prospects (name, phone, status) values ('ZZTEST-มีอยู่แล้ว', '000 000 7999', 'new');
set local session_replication_role = origin;

do $$
declare r jsonb; b bigint; p dealer_prospects; n int;
begin
  perform pitest.as_user('00000000-0000-4000-8000-0000000a7001', 'SUPER_ADMIN');
  r := public.hq_prospects_import('ZZTEST-ไฟล์ปลอม.xlsx', $j$[
    {"row": 5, "name": "ZZTEST-หนึ่ง", "social": "ZZTEST เพจหนึ่ง", "phone": "000 000 7001", "province": "บุรีรัมย์", "channel": "Facebook",
     "first_contact": "2026-08-24", "status": "contacted", "contact_note": "ไม่มีคนรับ", "note": "Type: ทำอสังหาฯ"},
    {"row": 6, "name": "ZZTEST-สอง", "phone": "000-000-7002", "province": "นราธิวาส", "status": "profile_sent", "contact_note": "ส่ง Company Profiles แล้ว",
     "note": "จังหวัดอื่นในไฟล์: ปัตตานี ยะลา"},
    {"row": 7, "name": "ZZTEST-สาม", "phone": "0000007003", "status": "lost", "lost_reason": "เงินทุนไม่พอ", "contact_note": "ไม่มีทุน"},
    {"row": 8, "name": "ZZTEST-สี่", "phone": "000 000 7004", "status": "new"},
    {"row": 9, "name": "ZZTEST-ซ้ำในไฟล์", "phone": "000-000-7001", "status": "new"},
    {"row": 10, "name": "ZZTEST-ซ้ำของเดิม", "phone": "0000007999", "status": "new"},
    {"row": 11, "name": "", "phone": "000 000 7005", "status": "new"},
    {"row": 12, "name": "ZZTEST-ไม่มีเบอร์", "phone": "", "status": "new"}
  ]$j$::jsonb);
  b := (r->>'batch')::bigint;
  perform pitest.ok((r->>'inserted')::int = 4, '1) นำเข้า 4 ราย — ได้ ' || r::text);
  perform pitest.ok((select array_agg(x->>'row' || ':' || (x->>'reason') order by (x->>'row')::int) from jsonb_array_elements(r->'skipped') x)
                    = array['9:เบอร์ซ้ำกับแถวก่อนหน้าในไฟล์', '10:เบอร์นี้มีผู้สนใจอยู่แล้ว', '11:ไม่มีชื่อ', '12:ไม่มีเบอร์โทรที่ถูกต้อง'],
                    '2) ข้าม 4 แถวพร้อมเหตุผล (ซ้ำในไฟล์ · ซ้ำของเดิมต่างรูปแบบ · ไม่มีชื่อ · ไม่มีเบอร์)');
  perform pitest.as_admin();
  select * into p from dealer_prospects where name = 'ZZTEST-หนึ่ง';
  perform pitest.ok(p.phone = '000-000-7001' and p.region is not null and p.status = 'contacted' and p.import_batch_id = b and p.first_contact = '2026-08-24'
                    and (p.last_contact_at at time zone 'Asia/Bangkok')::date = '2026-08-24', '1) เบอร์รูปแบบเดียว · ภาคตามจังหวัด · ขั้น · ติดต่อล่าสุด = วันเริ่มติดต่อในไฟล์');
  perform pitest.ok(exists (select 1 from dealer_prospect_activities a where a.prospect_id = p.id and a.kind = 'contact' and a.body = 'จากไฟล์นำเข้า: ไม่มีคนรับ'),
                    '1) หมายเหตุเดิม = บันทึกการติดต่อครั้งแรก (ข้อความเดิม)');
  perform pitest.ok((select status from dealer_prospects where name = 'ZZTEST-สอง') = 'profile_sent', '1) ส่งข้อมูลบริษัทแล้ว');
  perform pitest.ok((select status || ':' || lost_reason from dealer_prospects where name = 'ZZTEST-สาม') = 'lost:เงินทุนไม่พอ', '1) ไม่สำเร็จ + เหตุผล');
  perform pitest.ok((select status from dealer_prospects where name = 'ZZTEST-สี่') = 'new'
                    and not exists (select 1 from dealer_prospect_activities a join dealer_prospects x on x.id = a.prospect_id where x.name = 'ZZTEST-สี่' and a.kind = 'contact'),
                    '1) หมายเหตุว่าง = รอติดต่อ ไม่มีบันทึกการติดต่อ');
  perform pitest.ok((select count(*) from audit_log where action = 'นำเข้าผู้สนใจเป็นดีลเลอร์' and target like 'ZZTEST-ไฟล์ปลอม.xlsx%') = 1
                    and not exists (select 1 from audit_log where action = 'เพิ่มผู้สนใจเป็นดีลเลอร์' and target like 'ZZTEST-%'),
                    '4) บันทึกการใช้งานแถวเดียวต่อชุด (ไม่ลงทีละราย)');

  -- 3) ปฏิเสธทั้งชุด
  perform pitest.as_user('00000000-0000-4000-8000-0000000a7001', 'SUPER_ADMIN');
  perform pitest.must_fail($q$select public.hq_prospects_import('x', '[{"row":1,"name":"ZZTEST-ก","phone":"000 000 7101","status":"meeting"}]')$q$, 'import_status', '3) ขั้นนัดคุยแล้วนำเข้าไม่ได้');
  perform pitest.must_fail($q$select public.hq_prospects_import('x', '[{"row":1,"name":"ZZTEST-ข","phone":"000 000 7102","status":"lost"}]')$q$, 'import_lost_reason', '3) ไม่สำเร็จไม่มีเหตุผล = ปฏิเสธ');
  perform pitest.must_fail($q$select public.hq_prospects_import('x', '[{"row":1,"name":"ZZTEST-ค","phone":"000 000 7103","province":"อุบล"}]')$q$, 'province_invalid', '3) จังหวัดนอก 77 = ปฏิเสธ');
  perform pitest.must_fail(format('select public.hq_prospects_import(%L, %L::jsonb)', 'x', (select jsonb_agg(jsonb_build_object('name', 'ZZTEST', 'phone', '000 000 7200')) from generate_series(1, 1001))),
                           'import_limit', '3) เกิน 1,000 แถว = ปฏิเสธ');
  perform pitest.as_admin();
  perform pitest.ok(not exists (select 1 from dealer_prospects where name in ('ZZTEST-ก', 'ZZTEST-ข', 'ZZTEST-ค')), '3) ชุดที่ถูกปฏิเสธไม่เหลือแถวใดเลย');
  perform pitest.as_user('00000000-0000-4000-8000-0000000a7002', 'HQ_STAFF');
  perform pitest.must_fail($q$select public.hq_prospects_import('x', '[{"row":1,"name":"ZZTEST-ง","phone":"000 000 7104"}]')$q$, 'forbidden', '3) เจ้าหน้าที่ HQ ทั่วไปนำเข้าไม่ได้');
  perform pitest.must_fail(format('select public.hq_prospects_import_cancel(%s)', b), 'forbidden', '4) เจ้าหน้าที่ HQ ทั่วไปยกเลิกไม่ได้');

  -- 4) ยกเลิกทั้งชุด: บันทึกการติดต่อแรกจากไฟล์ไม่นับ · ถูกแตะหลังนำเข้า = ไม่ได้ (ยิงตรงก็ไม่ได้)
  perform pitest.as_admin();
  perform pitest.ok(_import_batch_touched(b) = 0, '4) หลังนำเข้าทันที = ยังไม่มีรายถูกแตะ (บันทึกการติดต่อแรกจากไฟล์ไม่นับ)');
  -- บันทึกการติดต่อหลังนำเข้า 1 ราย (เวลาหลังสร้างชุด — ในธุรกรรมเดียวของข้อทดสอบต้องตั้งเวลาเอง)
  set local session_replication_role = replica;
  insert into dealer_prospect_activities (prospect_id, kind, channel, body, created_at)
  values ((select id from dealer_prospects where name = 'ZZTEST-สี่'), 'contact', 'โทรศัพท์', 'ZZTEST โทรหลังนำเข้า', now() + interval '1 minute');
  set local session_replication_role = origin;
  perform pitest.ok(_import_batch_touched(b) = 1, '4) บันทึกการติดต่อหลังนำเข้า 1 ราย = ถูกแตะ 1');
  perform pitest.as_user('00000000-0000-4000-8000-0000000a7001', 'SUPER_ADMIN');
  perform pitest.ok((select (x->>'touched')::int from jsonb_array_elements(public.hq_prospect_import_batches()) x where (x->>'id')::bigint = b) = 1,
                    '4) รายการชุดบอกจำนวนรายที่ถูกแตะ (หน้าจอปิดปุ่ม)');
  perform pitest.must_fail(format('select public.hq_prospects_import_cancel(%s)', b), 'import_in_use', '4) มีรายถูกบันทึกการติดต่อ = ยกเลิกทั้งชุดไม่ได้ (ยิงตรง)');
  perform pitest.as_admin();
  delete from dealer_prospect_activities where body = 'ZZTEST โทรหลังนำเข้า';
  -- เปลี่ยนขั้นหลังนำเข้า = ถูกแตะ
  set local session_replication_role = replica;
  insert into dealer_prospect_activities (prospect_id, kind, body, from_status, to_status, created_at)
  values ((select id from dealer_prospects where name = 'ZZTEST-หนึ่ง'), 'status', 'ติดต่อแล้ว → ส่งข้อมูลบริษัทแล้ว', 'contacted', 'profile_sent', now() + interval '1 minute');
  set local session_replication_role = origin;
  perform pitest.ok(_import_batch_touched(b) = 1, '4) เปลี่ยนขั้นหลังนำเข้า = ถูกแตะ');
  delete from dealer_prospect_activities where body = 'ติดต่อแล้ว → ส่งข้อมูลบริษัทแล้ว' and prospect_id = (select id from dealer_prospects where name = 'ZZTEST-หนึ่ง') and created_at > now();
  -- ออกใบค่าแฟรนไชส์ = ถูกแตะ
  insert into dealer_package_proposals (prospect_id, amount, status) values ((select id from dealer_prospects where name = 'ZZTEST-สอง'), 10000, 'draft');
  perform pitest.as_user('00000000-0000-4000-8000-0000000a7001', 'SUPER_ADMIN');
  perform pitest.must_fail(format('select public.hq_prospects_import_cancel(%s)', b), 'import_in_use', '4) มีรายที่ออกใบแล้ว = ยกเลิกทั้งชุดไม่ได้');
  perform pitest.as_admin();
  delete from dealer_package_proposals where prospect_id = (select id from dealer_prospects where name = 'ZZTEST-สอง');
  perform pitest.ok(_import_batch_touched(b) = 0, '4) ไม่มีรายถูกแตะแล้ว');
  perform pitest.as_user('00000000-0000-4000-8000-0000000a7001', 'SUPER_ADMIN');
  r := public.hq_prospects_import_cancel(b);
  perform pitest.ok((r->>'deleted')::int = 4, '4) ยกเลิกทั้งชุด = ลบ 4 ราย');
  perform pitest.ok(jsonb_array_length(public.hq_prospect_import_batches()) >= 1
                    and (select x->>'cancelledAt' from jsonb_array_elements(public.hq_prospect_import_batches()) x where (x->>'id')::bigint = b) is not null,
                    '4) รายการชุดบอกว่ายกเลิกแล้ว');
  perform pitest.as_admin();
  perform pitest.ok(not exists (select 1 from dealer_prospects where import_batch_id = b) and exists (select 1 from dealer_prospects where name = 'ZZTEST-มีอยู่แล้ว'),
                    '4) ลบเฉพาะรายของชุด (รายเดิมยังอยู่)');
  perform pitest.ok((select count(*) from audit_log where action = 'ยกเลิกการนำเข้าผู้สนใจ' and target like '%ชุด ' || b) = 1, '4) ยกเลิกลงบันทึกการใช้งานแถวเดียว');
  perform pitest.as_user('00000000-0000-4000-8000-0000000a7001', 'SUPER_ADMIN');
  perform pitest.must_fail(format('select public.hq_prospects_import_cancel(%s)', b), 'import_cancelled', '4) ยกเลิกซ้ำไม่ได้');
  perform pitest.as_admin();
end $$;

select 'ALL PASS' as result;
rollback;
