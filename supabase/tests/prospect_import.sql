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
  -- ชื่อไฟล์ไม่ซ้ำต่อรอบ: บันทึกการใช้งานลบไม่ได้ และเลขชุดเริ่มนับใหม่ได้เมื่อฐานทดสอบล้างตารางชุดนำเข้า
  --   (รอบตรวจ deploy14 4 พ.ย. 69: แถว "… · ชุด N" ของรอบก่อนค้างใน audit_log แล้วเลขชุดของรอบนี้ซ้ำ = นับได้ 2)
  ไฟล์ text := format('ZZTEST-ไฟล์ปลอม-%s.xlsx', txid_current());
begin
  perform pitest.as_user('00000000-0000-4000-8000-0000000a7001', 'SUPER_ADMIN');
  r := public.hq_prospects_import(ไฟล์, $j$[
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
  -- ใบ 0277 (5 พ.ย. 69): บันทึกของวันเริ่มติดต่อ + หมายเหตุเดิมต่อท้าย (ข้อความเดิมไม่หาย) — เดิมบันทึกเป็นหมายเหตุล้วน
  perform pitest.ok(exists (select 1 from dealer_prospect_activities a where a.prospect_id = p.id and a.kind = 'contact' and a.body = 'จากไฟล์นำเข้า: เริ่มติดต่อ · ไม่มีคนรับ'
                              and (a.created_at at time zone 'Asia/Bangkok')::date = '2026-08-24'),
                    '1) หมายเหตุเดิม = อยู่ในบันทึกการติดต่อวันเริ่มติดต่อ (ข้อความเดิม · ลงวันตามไฟล์)');
  perform pitest.ok((select status from dealer_prospects where name = 'ZZTEST-สอง') = 'profile_sent', '1) ส่งข้อมูลบริษัทแล้ว');
  perform pitest.ok((select status || ':' || lost_reason from dealer_prospects where name = 'ZZTEST-สาม') = 'lost:เงินทุนไม่พอ', '1) ไม่สำเร็จ + เหตุผล');
  perform pitest.ok((select status from dealer_prospects where name = 'ZZTEST-สี่') = 'new'
                    and not exists (select 1 from dealer_prospect_activities a join dealer_prospects x on x.id = a.prospect_id where x.name = 'ZZTEST-สี่' and a.kind = 'contact'),
                    '1) หมายเหตุว่าง = รอติดต่อ ไม่มีบันทึกการติดต่อ');
  -- นับเฉพาะแถวของชุดนี้ (ผูกรหัสชุด/ชื่อรายของข้อนี้) — บันทึกการใช้งานลบไม่ได้ ข้อทดสอบอื่นทิ้งแถว "เพิ่มผู้สนใจ ZZTEST-…" ไว้ในฐานร่วม
  --   (รอบตรวจ deploy14 4 พ.ย. 69: ตรวจด้วย target like 'ZZTEST-%' ไปจับแถวของข้ออื่น = ตก ทั้งที่ชุดนี้ไม่ได้ลงทีละราย)
  perform pitest.ok((select count(*) from audit_log where action = 'นำเข้าผู้สนใจเป็นดีลเลอร์' and target like ไฟล์ || ' · %ชุด ' || b) = 1
                    and not exists (select 1 from audit_log where action = 'เพิ่มผู้สนใจเป็นดีลเลอร์'
                                     and target in ('ZZTEST-หนึ่ง', 'ZZTEST-สอง', 'ZZTEST-สาม', 'ZZTEST-สี่')),
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
  insert into dealer_package_proposals (prospect_id, amount, status, contract_months, annual_target, region, province, valid_until, terms) values ((select id from dealer_prospects where name = 'ZZTEST-สอง'), 10000, 'draft', 12, 1000000, 'ตะวันออก', 'ตราด', (current_date) + 30, '-');
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
  perform pitest.ok((select count(*) from audit_log where action = 'ยกเลิกการนำเข้าผู้สนใจ' and target like ไฟล์ || ' · %ชุด ' || b) = 1, '4) ยกเลิกลงบันทึกการใช้งานแถวเดียว');
  perform pitest.as_user('00000000-0000-4000-8000-0000000a7001', 'SUPER_ADMIN');
  perform pitest.must_fail(format('select public.hq_prospects_import_cancel(%s)', b), 'import_cancelled', '4) ยกเลิกซ้ำไม่ได้');
  perform pitest.as_admin();
end $$;

-- ── 5) ช่อง "ติดตาม" = วันที่ตามไปแล้ว (บอสสั่ง 5 พ.ย. 69 · ใบ 0277 · คำตอบบอส N1–N6) ──
--   ตกบนโค้ดก่อนใบ 0277: วันติดตามลง follow_up · ไม่มีบันทึกตามวัน · ติดต่อล่าสุด = วันเริ่ม/ว่าง · วันเกินวันนี้ผ่าน
do $$
declare r jsonb; b bigint; ก dealer_prospects; ข dealer_prospects; ค dealer_prospects; ง dealer_prospects; จ dealer_prospects;
  ไฟล์ text := format('ZZTEST-ไฟล์ติดตาม-%s.xlsx', txid_current());
  วัน text := 'Asia/Bangkok';
begin
  perform pitest.as_user('00000000-0000-4000-8000-0000000a7001', 'SUPER_ADMIN');
  perform pitest.must_fail(format($q$select public.hq_prospects_import('x', '[{"row":1,"name":"ZZTEST-ฉ","phone":"000 000 7306","status":"contacted","follow_up":"%s"}]')$q$,
                                  to_char((now() at time zone 'Asia/Bangkok')::date + 1, 'YYYY-MM-DD')),
                           'import_follow_up', '5) วันติดตามเกินวันนี้ = ปฏิเสธ (วันติดตามคือวันที่ตามไปแล้ว · N6)');
  r := public.hq_prospects_import(ไฟล์, $j$[
    {"row": 1, "name": "ZZTEST-ตามสองวัน", "phone": "000 000 7301", "status": "contacted", "first_contact": "2026-08-01", "follow_up": "2026-08-10", "contact_note": "คุยแล้ว รอโทรกลับ"},
    {"row": 2, "name": "ZZTEST-ไม่มีวันเริ่ม", "phone": "000 000 7302", "status": "contacted", "follow_up": "2026-09-03"},
    {"row": 3, "name": "ZZTEST-หมายเหตุไม่มีวัน", "phone": "000 000 7303", "status": "contacted", "contact_note": "ไม่รับสาย"},
    {"row": 4, "name": "ZZTEST-วันเดียวกัน", "phone": "000 000 7304", "status": "contacted", "first_contact": "2026-07-07", "follow_up": "2026-07-07"},
    {"row": 5, "name": "ZZTEST-ขั้นตามไฟล์", "phone": "000 000 7305", "status": "new", "first_contact": "2026-06-01"}
  ]$j$::jsonb);
  b := (r->>'batch')::bigint;
  perform pitest.ok((r->>'inserted')::int = 5, '5) นำเข้า 5 ราย — ได้ ' || r::text);
  perform pitest.as_admin();
  select * into ก from dealer_prospects where name = 'ZZTEST-ตามสองวัน';
  select * into ข from dealer_prospects where name = 'ZZTEST-ไม่มีวันเริ่ม';
  select * into ค from dealer_prospects where name = 'ZZTEST-หมายเหตุไม่มีวัน';
  select * into ง from dealer_prospects where name = 'ZZTEST-วันเดียวกัน';
  select * into จ from dealer_prospects where name = 'ZZTEST-ขั้นตามไฟล์';
  perform pitest.ok(ก.follow_up is null and ข.follow_up is null and ง.follow_up is null, '5) นัดติดตามว่างทุกราย (ทีมตั้งเอง · ไม่ขึ้นถึงกำหนดติดตาม)');
  perform pitest.ok((select array_agg((a.created_at at time zone วัน)::date::text || '|' || a.body order by a.created_at) from dealer_prospect_activities a where a.prospect_id = ก.id and a.kind = 'contact')
                    = array['2026-08-01|จากไฟล์นำเข้า: เริ่มติดต่อ', '2026-08-10|จากไฟล์นำเข้า: ติดตาม · คุยแล้ว รอโทรกลับ'],
                    '5) วันเริ่ม + วันติดตาม = บันทึกการติดต่อ 2 รายการลงวันตามไฟล์ · หมายเหตุผูกบันทึกวันล่าสุด (N2)');
  perform pitest.ok((ก.last_contact_at at time zone วัน)::date = '2026-08-10' and ก.first_contact = '2026-08-01', '5) ติดต่อล่าสุด = วันล่าสุดในสองช่อง · วันเริ่มตามไฟล์');
  perform pitest.ok(ข.first_contact is null and (ข.last_contact_at at time zone วัน)::date = '2026-09-03'
                    and (select count(*) from dealer_prospect_activities a where a.prospect_id = ข.id and a.kind = 'contact' and a.body = 'จากไฟล์นำเข้า: ติดตาม'
                           and (a.created_at at time zone วัน)::date = '2026-09-03') = 1,
                    '5) ไม่มีวันเริ่ม = ไม่เดาวันเริ่ม · บันทึกแค่วันติดตาม (N1)');
  perform pitest.ok(ค.last_contact_at is null
                    and exists (select 1 from dealer_prospect_activities a where a.prospect_id = ค.id and a.kind = 'contact' and a.body = 'จากไฟล์นำเข้า: ไม่รับสาย'),
                    '5) หมายเหตุไม่มีวันที่ = เก็บบันทึกหมายเหตุ · ติดต่อล่าสุดว่าง (N3)');
  perform pitest.ok((select count(*) from dealer_prospect_activities a where a.prospect_id = ง.id and a.kind = 'contact') = 1
                    and exists (select 1 from dealer_prospect_activities a where a.prospect_id = ง.id and a.body = 'จากไฟล์นำเข้า: เริ่มติดต่อ · ติดตาม'),
                    '5) วันเริ่ม = วันติดตาม → บันทึกเดียว (N4)');
  perform pitest.ok(จ.status = 'new' and exists (select 1 from dealer_prospect_activities a where a.prospect_id = จ.id and a.kind = 'contact'),
                    '5) ขั้นตั้งตามไฟล์ (ตัวดักบันทึกการติดต่อเลื่อนให้แล้วก็ทับกลับตามไฟล์)');
  perform pitest.ok(_import_batch_touched(b) = 0, '5) บันทึกลงวันย้อนหลังจากไฟล์ไม่นับว่าถูกแตะ — ยกเลิกทั้งชุดได้');
  perform pitest.as_user('00000000-0000-4000-8000-0000000a7001', 'SUPER_ADMIN');
  perform pitest.ok((public.hq_prospects_import_cancel(b)->>'deleted')::int = 5, '5) ยกเลิกทั้งชุดได้');
  perform pitest.as_admin();
end $$;

-- ── 6) บันทึกที่ชุดนำเข้าสร้างเองไม่นับว่า "ถูกแตะ" ไม่ขึ้นกับเวลา (ใบ 0277 · บั๊กที่ผู้ช่วย liveimport เจอ 5 พ.ย. 69) ──
--   เหตุ: บันทึกลง 09:00 ของวันในไฟล์ · วันในไฟล์ = วันนี้ + นำเข้าก่อน 09:00 → บันทึกใหม่กว่าเวลาชุด → เดิมนับว่าถูกแตะ ยกเลิกไม่ได้
--   จำลอง: ย้ายเวลาสร้างชุดไปก่อน 09:00 ของวันนี้ · ตกบนโค้ดก่อนแก้: ถูกแตะ = 1 ยกเลิกไม่ได้
do $$
declare r jsonb; b bigint; pid bigint; วันนี้ text := to_char((now() at time zone 'Asia/Bangkok')::date, 'YYYY-MM-DD');
begin
  perform pitest.as_user('00000000-0000-4000-8000-0000000a7001', 'SUPER_ADMIN');
  r := public.hq_prospects_import(format('ZZTEST-ไฟล์วันนี้-%s.xlsx', txid_current()),
         jsonb_build_array(jsonb_build_object('row', 1, 'name', 'ZZTEST-เริ่มวันนี้', 'phone', '000 000 7401', 'status', 'contacted', 'first_contact', วันนี้, 'contact_note', 'โทรแล้ว')));
  b := (r->>'batch')::bigint;
  perform pitest.as_admin();
  pid := (select id from dealer_prospects where import_batch_id = b);
  update prospect_import_batches set created_at = ((วันนี้::date)::timestamp + interval '8 hours') at time zone 'Asia/Bangkok' where id = b;   -- ชุดสร้าง 08:00 วันนี้
  perform pitest.ok((select count(*) from dealer_prospect_activities a where a.prospect_id = pid and a.import_batch_id = b
                       and a.created_at > (select created_at from prospect_import_batches where id = b)) = 1,
                    '6) บันทึกจากไฟล์ (09:00 วันนี้) ใหม่กว่าเวลาชุด (08:00) และติดรหัสชุด');
  perform pitest.ok(_import_batch_touched(b) = 0, '6) บันทึกที่ชุดสร้างเองไม่นับว่าถูกแตะ (ไม่ขึ้นกับเวลา)');
  -- แอปส่งรหัสชุดมาเองไม่ได้ (กันซ่อนการแตะหลังนำเข้า) — บันทึกการติดต่อของคน = ถูกแตะ
  perform pitest.as_user('00000000-0000-4000-8000-0000000a7001', 'SUPER_ADMIN');
  insert into dealer_prospect_activities (prospect_id, kind, channel, body, import_batch_id) values (pid, 'contact', 'โทรศัพท์', 'ZZTEST โทรตามหลังนำเข้า', b);
  perform pitest.as_admin();
  perform pitest.ok((select import_batch_id from dealer_prospect_activities where body = 'ZZTEST โทรตามหลังนำเข้า') is null, '6) แอปตั้งรหัสชุดเองไม่ได้ (ล้างทิ้ง)');
  perform pitest.ok(_import_batch_touched(b) = 1, '6) บันทึกการติดต่อของคนหลังนำเข้า = ถูกแตะ');
  delete from dealer_prospect_activities where body = 'ZZTEST โทรตามหลังนำเข้า';
  perform pitest.as_user('00000000-0000-4000-8000-0000000a7001', 'SUPER_ADMIN');
  perform pitest.ok((public.hq_prospects_import_cancel(b)->>'deleted')::int = 1, '6) ยกเลิกทั้งชุดได้ แม้บันทึกจากไฟล์ใหม่กว่าเวลาชุด');
  perform pitest.as_admin();
end $$;

select 'ALL PASS' as result;
rollback;
