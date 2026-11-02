-- ── ข้อทดสอบใบ 0273: แนบไฟล์ 2 ทาง ดีลเลอร์ ↔ HQ ในคำขอราคา (บอสสั่ง 2 พ.ย. 69) ──
--   1) ดีลเลอร์จองที่ → ไฟล์ลงถัง → แถวพร้อม + บันทึกการใช้งาน · ไม่จองก่อน = ถังปฏิเสธ
--   2) ดีลเลอร์ A แนบ/อ่าน/ลบ ของ B ไม่ได้ (ทั้งไฟล์ดีลเลอร์และไฟล์ HQ) · รายการไฟล์ของสาขาอื่น = forbidden
--   3) ชนิดผิด / เกิน 20 MB / เกิน 10 ไฟล์ = ฐานปฏิเสธ
--   4) ไฟล์ HQ ร่าง: ดีลเลอร์ไม่เห็น · ส่งใบแล้วเห็น · ส่งแล้วแนบ/ลบไม่ได้ทั้ง 2 ฝั่ง (ฐานกัน)
--   5) ฉบับใหม่ (ขอแก้ราคา): แนบใหม่ได้ ไฟล์ฉบับเก่ายังอยู่ ดูย้อนได้ทั้งสาย
--   6) กระดิ่งตอนส่งใบ HQ บอกจำนวนไฟล์แนบ · ป้ายจำนวนไฟล์ · พื้นที่เก็บไฟล์ (HQ เท่านั้น)
--   ตกบนโค้ดก่อนใบ 0273: ไม่มี quote_file_reserve / ถัง quote-files
-- รัน: docker exec -i <คอนเทนเนอร์ฐานทดสอบ> psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 < supabase/tests/quote_request_files.sql
begin;
create schema qftest;
create function qftest.ok(p_cond boolean, p_what text) returns void language plpgsql as $$
begin if p_cond is not true then raise exception 'FAIL: %', p_what; end if; raise notice 'ok  %', p_what; end $$;
create function qftest.must_fail(p_sql text, p_like text, p_what text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if sqlerrm ilike '%' || p_like || '%' then raise notice 'ok  % (ถูกปฏิเสธ)', p_what; return; end if;
    raise exception 'FAIL: % — ถูกปฏิเสธแต่ข้อความไม่ตรง: %', p_what, sqlerrm;
  end;
  raise exception 'FAIL: % — ควรถูกปฏิเสธแต่ผ่าน', p_what;
end $$;
create function qftest.as_user(p_uid uuid, p_role text, p_dealer text) returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated',
    'user_role', p_role, 'dealer_code', p_dealer, 'email', 'zzqf@example.test')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function qftest.as_admin() returns void language plpgsql as $$
begin perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '', true); end $$;
/** ไฟล์ลงถัง (แทนที่เก็บไฟล์ที่ใส่แถวในนามผู้ใช้) — ขนาดในข้อมูลไฟล์ = ขนาดจริง */
create function qftest.put(p_path text, p_size bigint) returns void language plpgsql as $$
begin
  insert into storage.objects (bucket_id, name, owner, metadata)
  values ('quote-files', p_path, auth.uid(), jsonb_build_object('size', p_size, 'mimetype', 'application/pdf'));
end $$;
/** ลบแบบที่เก็บไฟล์ลบ (ที่เก็บไฟล์รุ่นนี้กันการลบตรงด้วย SQL — API ของมันเปิดสวิตช์นี้ก่อนลบในนามผู้ใช้) · คืนจำนวนที่ลบได้จริง */
create function qftest.del(p_like text) returns integer language plpgsql as $$
declare n integer;
begin
  perform set_config('storage.allow_delete_query', 'true', true);
  delete from storage.objects where bucket_id = 'quote-files' and name like p_like;
  get diagnostics n = row_count;
  perform set_config('storage.allow_delete_query', 'false', true);
  return n;
end $$;
grant usage on schema qftest to authenticated;
grant execute on all functions in schema qftest to authenticated;

-- ═══ ข้อมูลของข้อ ═══
--   ZZQFA: A1 กำลังทำราคา (ร่าง HQ hA1) · A2 ลีดอื่น กำลังทำราคา (ร่าง hA2 · ใช้ทดสอบส่งใบ)
--   ZZQFB: B1 กำลังทำราคา (ร่าง hB1)
set local session_replication_role = replica;
insert into dealers (code, name, province, region, status, revenue_target) values
  ('ZZQFA', 'ZZTEST ไฟล์ A', 'ตราด', 'ตะวันออก', 'active', 0), ('ZZQFB', 'ZZTEST ไฟล์ B', 'ตราด', 'ตะวันออก', 'active', 0);
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000a0001', 'zzqf-a@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000b0001', 'zzqf-b@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000c0001', 'zzqf-hq@example.test', 'authenticated', 'authenticated');
insert into profiles (id, role, dealer_code, name, status, contact_email, contact_email_verified_at) values
  ('00000000-0000-4000-8000-0000000a0001', 'DEALER_ADMIN', 'ZZQFA', 'ZZQF ดีลเลอร์ A', 'active', 'zzqf-a@example.test', now()),
  ('00000000-0000-4000-8000-0000000b0001', 'DEALER_ADMIN', 'ZZQFB', 'ZZQF ดีลเลอร์ B', 'active', '', null),
  ('00000000-0000-4000-8000-0000000c0001', 'HQ_STAFF', '', 'ZZQF เจ้าหน้าที่ HQ', 'active', '', null);
insert into leads (id, num_id, dealer_code, company, contact, phone, province, project, area, note, status) values
  ('ZZQFA-1', 993101, 'ZZQFA', 'ZZTEST ไฟล์ 1', 'คุณไฟล์', '000-000-0101', 'ตราด', 'โกดัง', '100', 'สเปก', 'HQ_PRICING'),
  ('ZZQFA-2', 993102, 'ZZQFA', 'ZZTEST ไฟล์ 2', 'คุณไฟล์', '000-000-0102', 'ตราด', 'โกดัง', '100', 'สเปก', 'HQ_PRICING'),
  ('ZZQFB-1', 993109, 'ZZQFB', 'ZZTEST ไฟล์ B', 'คุณไฟล์', '000-000-0109', 'ตราด', 'โกดัง', '100', 'สเปก', 'HQ_PRICING');
insert into quote_requests (id, request_no, dealer_code, lead_num_id, product, status, due_at) values
  (993001, 'RQ-ZZQFA-1', 'ZZQFA', 993101, 'ZZTEST', 'pricing', now() + interval '14 days'),
  (993002, 'RQ-ZZQFA-2', 'ZZQFA', 993102, 'ZZTEST', 'pricing', now() + interval '14 days'),
  (993009, 'RQ-ZZQFB-1', 'ZZQFB', 993109, 'ZZTEST', 'pricing', now() + interval '14 days');
insert into hq_quotes (id, request_id, version, quote_no, status, total_cost, line_items, valid_until) values
  (993011, 993001, 1, 'HQ-ZZQFA-1', 'draft', 1000, '[{"name":"ZZ","qty":1,"unit":"ชุด","unitCost":1000}]', current_date + 30),
  (993012, 993002, 1, 'HQ-ZZQFA-2', 'draft', 1000, '[{"name":"ZZ","qty":1,"unit":"ชุด","unitCost":1000}]', current_date + 30),
  (993019, 993009, 1, 'HQ-ZZQFB-1', 'draft', 1000, '[{"name":"ZZ","qty":1,"unit":"ชุด","unitCost":1000}]', current_date + 30);
set local session_replication_role = origin;

do $$
declare
  A constant uuid := '00000000-0000-4000-8000-0000000a0001';
  B constant uuid := '00000000-0000-4000-8000-0000000b0001';
  HQ constant uuid := '00000000-0000-4000-8000-0000000c0001';
  j jsonb; pA text; pA2 text; pB text; pH text; pH2 text; pX text; n integer; l jsonb; i integer; บันทึกก่อน integer;
begin
  select count(*) into บันทึกก่อน from audit_log where action in ('แนบไฟล์คำขอราคา', 'ลบไฟล์คำขอราคา');

  -- ══ 1) ดีลเลอร์ A จองที่ + ไฟล์ลงถัง ══
  perform qftest.as_user(A, 'DEALER_ADMIN', 'ZZQFA');
  j := quote_file_reserve(993001, 'dealer', 'แบบบ้าน ชั้น 2.pdf', 1048576);
  pA := j ->> 'path';
  perform qftest.ok(pA ~ '^ZZQFA/993001/d/[0-9a-f]{32}\.pdf$', format('พาธในถัง = สาขา/คำขอ/d/สุ่ม.pdf (ได้ %s)', pA));
  perform qftest.put(pA, 1048576);
  perform qftest.as_admin();
  perform qftest.ok((select status from quote_files where object_name = pA) = 'ready', 'ไฟล์ลงถังแล้ว = แถว ready');
  perform qftest.ok(exists (select 1 from audit_log where action = 'แนบไฟล์คำขอราคา' and "user" = 'ZZQF ดีลเลอร์ A'
                              and target = 'RQ-ZZQFA-1 · ไฟล์จากดีลเลอร์ · แบบบ้าน ชั้น 2.pdf'), 'บันทึกการใช้งาน: แนบ ใคร ชื่อไฟล์');
  perform qftest.as_user(A, 'DEALER_ADMIN', 'ZZQFA');
  perform qftest.must_fail(format('select qftest.put(%L, 10)', 'ZZQFA/993001/d/ไม่ได้จอง.pdf'), 'file_unreserved', 'อัปโหลดเข้าถังโดยไม่จองก่อน = ถังปฏิเสธ');
  l := quote_files_list(993001);
  perform qftest.ok(jsonb_array_length(l) = 1 and l -> 0 ->> 'name' = 'แบบบ้าน ชั้น 2.pdf' and (l -> 0 ->> 'size')::bigint = 1048576
                    and l -> 0 ->> 'side' = 'dealer' and (l -> 0 ->> 'canDelete')::boolean, format('รายการไฟล์: ชื่อจริง ขนาดจริงจากถัง ลบได้ (ได้ %s)', l));

  -- ══ 3) ชนิด/ขนาด/จำนวน ══
  perform qftest.must_fail('select quote_file_reserve(993001, ''dealer'', ''ไวรัส.exe'', 100)', 'file_type', 'ชนิด .exe = ปฏิเสธ');
  perform qftest.must_fail('select quote_file_reserve(993001, ''dealer'', ''หน้าเว็บ.html'', 100)', 'file_type', 'ชนิด .html = ปฏิเสธ');
  perform qftest.must_fail('select quote_file_reserve(993001, ''dealer'', ''ใหญ่.pdf'', 20971521)', 'file_size', 'แจ้งขนาด 20 MB + 1 ไบต์ = ปฏิเสธ');
  pX := quote_file_reserve(993001, 'dealer', 'ขนาดจริงเกิน.pdf', 1000) ->> 'path';
  perform qftest.must_fail(format('select qftest.put(%L, 20971521)', pX), 'file_size', 'แจ้ง 1,000 ไบต์แต่ไฟล์จริงเกิน 20 MB = ตัวดักของถังปฏิเสธ');
  perform qftest.as_admin(); delete from quote_files where object_name = pX; perform qftest.as_user(A, 'DEALER_ADMIN', 'ZZQFA');
  for i in 2..10 loop
    perform qftest.put(quote_file_reserve(993001, 'dealer', format('ไฟล์ %s.xlsx', i), 10) ->> 'path', 10);
  end loop;
  perform qftest.must_fail('select quote_file_reserve(993001, ''dealer'', ''ไฟล์ 11.csv'', 10)', 'file_count', 'ไฟล์ที่ 11 ของฝั่งดีลเลอร์ = ปฏิเสธ');
  -- ชนิดที่รับได้ครบ (คำขอ A2)
  foreach pX in array array['ก.pdf', 'ข.JPG', 'ค.jpeg', 'ง.png', 'จ.xlsx', 'ฉ.xls', 'ช.csv', 'ซ.dwg', 'ฌ.DXF'] loop
    perform quote_file_reserve(993002, 'dealer', pX, 10);
  end loop;
  perform qftest.ok(true, 'รับครบ PDF · JPG/JPEG · PNG · XLSX/XLS/CSV · DWG/DXF (ตัวพิมพ์ใหญ่ก็ได้)');

  -- ══ 2) ข้ามสาขา ══
  perform qftest.as_user(B, 'DEALER_ADMIN', 'ZZQFB');
  perform qftest.must_fail('select quote_file_reserve(993001, ''dealer'', ''แอบ.pdf'', 10)', 'forbidden', 'B จองที่ในคำขอของ A = ปฏิเสธ');
  perform qftest.must_fail('select quote_files_list(993001)', 'forbidden', 'B ดูรายการไฟล์ของคำขอ A = ปฏิเสธ');
  select count(*) into n from storage.objects where bucket_id = 'quote-files' and name = pA;
  perform qftest.ok(n = 0, 'B อ่านไฟล์ของ A ในถังไม่ได้ (ไม่เห็นแถว)');
  n := qftest.del(pA);
  perform qftest.ok(n = 0, 'B ลบไฟล์ของ A ไม่ได้');
  perform qftest.must_fail('select quote_file_reserve(993009, ''hq'', ''แอบ.pdf'', 10)', 'forbidden', 'ดีลเลอร์แนบฝั่ง HQ ไม่ได้');
  pB := quote_file_reserve(993009, 'dealer', 'ของ B.pdf', 10) ->> 'path';
  perform qftest.as_user(A, 'DEALER_ADMIN', 'ZZQFA');
  perform qftest.must_fail(format('select qftest.put(%L, 10)', pB), 'forbidden', 'A อัปโหลดเข้าที่ที่ B จองไว้ = ถังปฏิเสธ');

  -- ══ 4) ไฟล์ HQ ร่าง → ส่งใบ ══
  perform qftest.as_user(HQ, 'HQ_STAFF', '');
  pH := quote_file_reserve(993002, 'hq', 'แบบที่ HQ แก้.pdf', 2048) ->> 'path';
  perform qftest.ok(pH ~ '^ZZQFA/993002/h993012/', format('ไฟล์ HQ ผูกใบ HQ ฉบับนั้น (ได้ %s)', pH));
  perform qftest.put(pH, 2048);
  perform qftest.must_fail('select quote_file_reserve(993002, ''dealer'', ''แทน.pdf'', 10)', 'forbidden', 'HQ แนบฝั่งดีลเลอร์ไม่ได้');
  perform qftest.ok(quote_file_counts(array[993001, 993002]::bigint[]) = '[{"request":993001,"dealer":10,"hq":0},{"request":993002,"dealer":0,"hq":1}]'::jsonb,
                    format('ป้ายจำนวนไฟล์: HQ เห็นทุกฝั่ง · นับเฉพาะไฟล์ที่ลงถังแล้ว (ได้ %s)', quote_file_counts(array[993001, 993002]::bigint[])));
  perform qftest.as_user(A, 'DEALER_ADMIN', 'ZZQFA');
  perform qftest.ok(not exists (select 1 from jsonb_array_elements(quote_files_list(993002)) e where e ->> 'side' = 'hq'), 'ดีลเลอร์ไม่เห็นไฟล์ของใบ HQ ร่าง');
  select count(*) into n from storage.objects where bucket_id = 'quote-files' and name = pH;
  perform qftest.ok(n = 0, 'ดีลเลอร์อ่านไฟล์ HQ ร่างในถังไม่ได้');
  perform qftest.ok(quote_file_counts(array[993002]::bigint[]) = '[]'::jsonb, 'ป้ายจำนวนของดีลเลอร์ไม่นับไฟล์ HQ ร่าง');

  perform qftest.as_user(HQ, 'HQ_STAFF', '');
  perform hq_quote_send(993002);
  perform qftest.as_admin();
  perform qftest.ok(exists (select 1 from notifications where dedupe_key = 'hq_quote_sent:993002' and body like '%ไฟล์แนบจาก HQ 1 ไฟล์%'),
    format('กระดิ่งตอนส่งใบ HQ บอกจำนวนไฟล์แนบ (ได้ %s)', (select body from notifications where dedupe_key = 'hq_quote_sent:993002')));
  perform qftest.ok(exists (select 1 from email_outbox where body like '%ไฟล์แนบจาก HQ: 1 ไฟล์%' and ref_id = '993002'), 'อีเมลตอนส่งใบ HQ บอกจำนวนไฟล์แนบ');
  perform qftest.as_user(A, 'DEALER_ADMIN', 'ZZQFA');
  l := quote_files_list(993002);
  perform qftest.ok(exists (select 1 from jsonb_array_elements(l) e where e ->> 'side' = 'hq' and e ->> 'quoteNo' = 'HQ-ZZQFA-2' and not (e ->> 'canDelete')::boolean),
    format('ส่งใบแล้ว ดีลเลอร์เห็นไฟล์ HQ (ลบไม่ได้) (ได้ %s)', l));
  select count(*) into n from storage.objects where bucket_id = 'quote-files' and name = pH;
  perform qftest.ok(n = 1, 'ส่งใบแล้ว ดีลเลอร์อ่านไฟล์ HQ ในถังได้');
  perform qftest.must_fail('select quote_file_reserve(993002, ''dealer'', ''หลังส่ง.pdf'', 10)', 'file_locked', 'ส่งใบแล้ว ดีลเลอร์แนบเพิ่มไม่ได้');
  n := qftest.del('ZZQFA/993002/%');
  perform qftest.ok(n = 0, 'ส่งใบแล้ว ดีลเลอร์ลบไฟล์ (ของตัวเองและของ HQ) ไม่ได้');
  perform qftest.as_user(HQ, 'HQ_STAFF', '');
  perform qftest.must_fail('select quote_file_reserve(993002, ''hq'', ''หลังส่ง.pdf'', 10)', 'file_locked', 'ส่งใบแล้ว HQ แนบเพิ่มไม่ได้');
  n := qftest.del(pH);
  perform qftest.ok(n = 0, 'ส่งใบแล้ว HQ ลบไฟล์ของใบไม่ได้');

  -- ══ 5) ฉบับใหม่ ══
  perform qftest.as_admin();
  set local session_replication_role = replica;
  update quote_requests set status = 'superseded' where id = 993002;
  insert into quote_requests (id, request_no, dealer_code, lead_num_id, product, status, due_at, root_id, supersedes_id)
  values (993003, 'RQ-ZZQFA-2b', 'ZZQFA', 993102, 'ZZTEST', 'pricing', now() + interval '14 days', 993002, 993002);
  update hq_quotes set status = 'superseded' where id = 993012;
  insert into hq_quotes (id, request_id, version, quote_no, status, total_cost) values (993013, 993003, 2, 'HQ-ZZQFA-2b', 'draft', 0);
  set local session_replication_role = origin;
  perform qftest.as_user(HQ, 'HQ_STAFF', '');
  pH2 := quote_file_reserve(993003, 'hq', 'แบบฉบับ 2.pdf', 4096) ->> 'path';
  perform qftest.put(pH2, 4096);
  l := quote_files_list(993003);
  perform qftest.ok((select count(*) from jsonb_array_elements(l) e where e ->> 'side' = 'hq') = 2
                    and exists (select 1 from jsonb_array_elements(l) e where e ->> 'path' = pH and e ->> 'version' = '1')
                    and exists (select 1 from jsonb_array_elements(l) e where e ->> 'path' = pH2 and e ->> 'version' = '2'),
                    format('ฉบับใหม่แนบได้ · ไฟล์ฉบับเก่ายังอยู่ (รายการทั้งสาย) (ได้ %s)', l));
  perform qftest.as_admin();
  perform qftest.ok((select count(*) from quote_files where hq_quote_id = 993012 and status = 'ready') = 1, 'ไฟล์ฉบับเก่าไม่ถูกทับ/ย้าย');

  -- ══ ลบก่อนล็อก = ได้ + บันทึก ══
  perform qftest.as_user(A, 'DEALER_ADMIN', 'ZZQFA');
  n := qftest.del(pA);
  perform qftest.ok(n = 1, 'ดีลเลอร์ลบไฟล์ของตัวเองได้ก่อน HQ ส่งใบ');
  perform qftest.as_admin();
  perform qftest.ok(not exists (select 1 from quote_files where object_name = pA), 'ลบในถัง = แถวไฟล์หายตาม');
  perform qftest.ok(exists (select 1 from audit_log where action = 'ลบไฟล์คำขอราคา' and target = 'RQ-ZZQFA-1 · ไฟล์จากดีลเลอร์ · แบบบ้าน ชั้น 2.pdf'),
    'บันทึกการใช้งาน: ลบ ใคร ชื่อไฟล์');
  perform qftest.ok((select count(*) from audit_log where action in ('แนบไฟล์คำขอราคา', 'ลบไฟล์คำขอราคา')) = บันทึกก่อน + 13,
    format('บันทึกครบ: แนบ 12 (ดีลเลอร์ 10 + HQ 2) + ลบ 1 (ได้ %s)', (select count(*) from audit_log where action in ('แนบไฟล์คำขอราคา', 'ลบไฟล์คำขอราคา')) - บันทึกก่อน));

  -- ══ 6) พื้นที่เก็บไฟล์ ══
  perform qftest.as_user(HQ, 'HQ_STAFF', '');
  j := storage_usage();
  perform qftest.ok(exists (select 1 from jsonb_array_elements(j -> 'buckets') x where x ->> 'bucket' = 'quote-files' and (x ->> 'bytes')::bigint >= 2048 + 4096),
    format('พื้นที่ที่ใช้ไปนับขนาดจริงในถัง (ได้ %s)', j));
  perform qftest.must_fail('select storage_quota_set(100)', 'forbidden', 'เจ้าหน้าที่ HQ ตั้งโควตาไม่ได้ (ผู้ดูแล/ผู้บริหารเท่านั้น)');
  perform qftest.as_user(HQ, 'SUPER_ADMIN', '');
  perform storage_quota_set(100);
  perform qftest.ok((storage_usage() ->> 'quotaGb')::numeric = 100, 'ผู้ดูแลตั้งโควตา 100 GB แล้วอ่านกลับได้');
  perform qftest.as_user(A, 'DEALER_ADMIN', 'ZZQFA');
  perform qftest.must_fail('select storage_usage()', 'forbidden', 'ดีลเลอร์ดูพื้นที่เก็บไฟล์ไม่ได้');
  perform qftest.as_admin();
end $$;

select 'ALL PASS' as result;
rollback;
