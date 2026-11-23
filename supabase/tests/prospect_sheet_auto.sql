-- ── ข้อทดสอบใบ 0295: นำเข้า Facebook "เบอร์ซ้ำก็เอา ไม่ครบก็เอา" + กุญแจแถว + ดึงชีตอัตโนมัติ (บอสสั่ง 23 พ.ย. 69) — ข้อมูลปลอมทั้งหมด ─────────
--   1) แถว dup_ok: เบอร์ซ้ำในไฟล์/กับรายที่มีอยู่ = นำเข้า · ไม่มีชื่อ = "(ไม่มีชื่อ)" · ไม่มีเบอร์ = เบอร์ว่าง · ไม่มีทั้งคู่ = ข้าม
--   2) ส่งไฟล์เดิมซ้ำ = "เคยนำเข้าแล้ว" ข้ามทุกแถว (already) · ยกเลิกชุด = กุญแจหาย นำเข้าแถวเดิมใหม่ได้
--   3) ฟอร์มมือ (insert ตรง) เบอร์ว่างยังถูกปฏิเสธ · แถวไม่ส่ง dup_ok = กติกาเดิม (เบอร์ซ้ำข้าม)
--   4) ตั้งค่า: HQ ตั้ง/ปิดได้ + บันทึกการใช้งาน · ลิงก์ไม่ใช่ชีต/เปิดไม่มีลิงก์ = ปฏิเสธ · ดีลเลอร์ = ปฏิเสธ
--   5) คำสั่งของระบบ: ผู้ใช้ (authenticated) เรียกไม่ได้ · service_role: รับงาน/กันรันซ้อน · นำเข้า = แจ้งกระดิ่ง N ราย · ไม่ได้ = เตือนวันละครั้ง
--   ตกบนฐานก่อนใบ 0295: ไม่มีตาราง/คำสั่ง (ข้อ 1 เบอร์ซ้ำถูกข้าม)
-- รัน: docker exec -i <คอนเทนเนอร์ฐานทดสอบ> psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 < supabase/tests/prospect_sheet_auto.sql
begin;
create schema pstest;
create function pstest.ok(p_cond boolean, p_what text) returns void language plpgsql as $$
begin if p_cond is not true then raise exception 'FAIL: %', p_what; end if; raise notice 'ok  %', p_what; end $$;
create function pstest.must_fail(p_sql text, p_like text, p_what text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if sqlerrm ilike '%' || p_like || '%' then raise notice 'ok  % (ถูกปฏิเสธ: %)', p_what, sqlerrm; return; end if;
    raise exception 'FAIL: % — ถูกปฏิเสธแต่ข้อความไม่ตรง: %', p_what, sqlerrm;
  end;
  raise exception 'FAIL: % — ควรถูกปฏิเสธแต่ผ่าน', p_what;
end $$;
create function pstest.as_hq() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-0000000a7295', 'role', 'authenticated',
    'user_role', 'SUPER_ADMIN', 'dealer_code', '', 'email', 'zzps@example.test')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function pstest.as_dealer() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-0000000a7296', 'role', 'authenticated',
    'user_role', 'DEALER_ADMIN', 'dealer_code', 'ZPS', 'email', 'zzps-d@example.test')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function pstest.as_system() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  perform set_config('role', 'service_role', true);
end $$;
create function pstest.as_admin() returns void language plpgsql as $$
begin perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '', true); end $$;
grant usage on schema pstest to authenticated, service_role;
grant execute on all functions in schema pstest to authenticated, service_role;

set local session_replication_role = replica;
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000a7295', 'zzps-hq@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000a7296', 'zzps-d@example.test', 'authenticated', 'authenticated');
insert into dealers (code, name, province, region, status) values ('ZPS', 'ZZTEST ชีต', 'ตราด', 'ตะวันออก', 'active');
insert into profiles (id, role, dealer_code, name, status) values
  ('00000000-0000-4000-8000-0000000a7295', 'SUPER_ADMIN', '', 'ZZPS ผู้ดูแล', 'active'),
  ('00000000-0000-4000-8000-0000000a7296', 'DEALER_ADMIN', 'ZPS', 'ZZPS ดีลเลอร์', 'active');
insert into dealer_prospects (name, phone, status) values ('ZZTEST-PS-มีอยู่แล้ว', '000-000-8399', 'new');
set local session_replication_role = origin;
-- แถวตั้งค่าเริ่มต้นของรอบนี้ (ฐานทดสอบอาจมีค่าค้าง · ย้อนกลับท้ายไฟล์)
update prospect_sheet_sync set url = '', enabled = false, running_since = null, fail_notified_on = null, last_run_at = null where id = 1;

-- ── 1–2) นำเข้าแถว Facebook (dup_ok) ──
do $$
declare r jsonb; b bigint; วันนี้ date := (now() at time zone 'Asia/Bangkok')::date;
  ไฟล์ text := format('ZZTEST-PS-ชีต-%s.xlsx', txid_current());
  แถว jsonb;
begin
  แถว := jsonb_build_array(
    jsonb_build_object('row', 'a:2', 'name', 'ZZTEST-PS-หนึ่ง', 'phone', '0000008301', 'status', 'new', 'follow_up_today', true, 'dup_ok', true,
      'entered_at', to_char(วันนี้ - 2, 'YYYY-MM-DD') || 'T10:15:00+07:00'),
    jsonb_build_object('row', 'a:3', 'name', 'ZZTEST-PS-ซ้ำในไฟล์', 'phone', '000-000-8301', 'status', 'new', 'follow_up_today', true, 'dup_ok', true,
      'entered_at', to_char(วันนี้ - 1, 'YYYY-MM-DD') || 'T11:00:00+07:00'),
    jsonb_build_object('row', 'a:4', 'name', 'ZZTEST-PS-ซ้ำของเดิม', 'phone', '0000008399', 'status', 'new', 'follow_up_today', true, 'dup_ok', true),
    jsonb_build_object('row', 'a:5', 'name', '', 'phone', '0000008302', 'status', 'new', 'follow_up_today', true, 'dup_ok', true),
    jsonb_build_object('row', 'a:6', 'name', 'ZZTEST-PS-ไม่มีเบอร์', 'phone', '', 'status', 'new', 'follow_up_today', true, 'dup_ok', true),
    jsonb_build_object('row', 'a:7', 'name', '', 'phone', '', 'status', 'new', 'follow_up_today', true, 'dup_ok', true));
  perform pstest.as_hq();
  r := public.hq_prospects_import(ไฟล์, แถว);
  b := (r->>'batch')::bigint;
  perform pstest.as_admin();
  perform pstest.ok((r->>'inserted')::int = 5, '1) นำเข้า 5 ราย (เบอร์ซ้ำในไฟล์ · ซ้ำของเดิม · ไม่มีชื่อ · ไม่มีเบอร์ = นำเข้า)');
  perform pstest.ok(jsonb_array_length(r->'skipped') = 1 and r->'skipped'->0->>'reason' = 'ไม่มีชื่อและไม่มีเบอร์', '1) ข้ามเฉพาะแถวไม่มีทั้งชื่อและเบอร์');
  perform pstest.ok((select count(*) from dealer_prospects where _phone_digits(phone) = '0000008301') = 2, '1) เบอร์ซ้ำในไฟล์ได้ 2 ราย');
  perform pstest.ok((select count(*) from dealer_prospects where _phone_digits(phone) = '0000008399') = 2, '1) เบอร์ซ้ำกับรายเดิมได้รายใหม่');
  perform pstest.ok(exists (select 1 from dealer_prospects where import_batch_id = b and name = '(ไม่มีชื่อ)' and phone = '000-000-8302'), '1) ไม่มีชื่อ = "(ไม่มีชื่อ)"');
  perform pstest.ok(exists (select 1 from dealer_prospects where import_batch_id = b and name = 'ZZTEST-PS-ไม่มีเบอร์' and phone is null), '1) ไม่มีเบอร์ = เบอร์ว่าง');
  perform pstest.ok((select count(*) from prospect_import_keys where batch_id = b) = 5, '2) เก็บกุญแจแถว 5 แถว');
  perform pstest.ok(exists (select 1 from prospect_import_keys where batch_id = b and key = 'ZZTEST-PS-หนึ่ง|0000008301|' || to_char(วันนี้ - 2, 'YYYY-MM-DD') || 'T10:15:00'),
    '2) กุญแจ = ชื่อ|ตัวเลขเบอร์|วันเวลาไทย (ตรงกับหน้าเว็บ)');
  -- ส่งไฟล์เดิมอีกรอบ (ดึงชีตทุกชั่วโมง) = เคยนำเข้าแล้ว ทุกแถว
  perform pstest.as_hq();
  r := public.hq_prospects_import(ไฟล์ || '-2', แถว);
  perform pstest.as_admin();
  perform pstest.ok((r->>'inserted')::int = 0 and (r->>'already')::int = 5, '2) ส่งแถวเดิมซ้ำ = เคยนำเข้าแล้ว 5 แถว ไม่เพิ่มราย');
  -- ยกเลิกชุดแรก = กุญแจหาย → นำเข้าแถวเดิมใหม่ได้
  perform pstest.as_hq();
  perform public.hq_prospects_import_cancel(b);
  perform pstest.as_admin();
  perform pstest.ok(not exists (select 1 from prospect_import_keys where batch_id = b), '2) ยกเลิกชุด = ลบกุญแจของชุด');
  perform pstest.as_hq();
  r := public.hq_prospects_import(ไฟล์ || '-3', แถว);
  perform pstest.as_admin();
  perform pstest.ok((r->>'inserted')::int = 5, '2) หลังยกเลิกชุด นำเข้าแถวเดิมใหม่ได้');
end $$;

-- ── 3) ฟอร์มมือ / ไฟล์ทีม คงเดิม ──
do $$
declare r jsonb;
begin
  perform pstest.as_hq();
  perform pstest.must_fail($q$insert into dealer_prospects (name, phone, status) values ('ZZTEST-PS-ฟอร์มมือ', null, 'new')$q$, 'เบอร์โทร', '3) ฟอร์มมือเบอร์ว่าง = ปฏิเสธ');
  r := public.hq_prospects_import(format('ZZTEST-PS-ทีม-%s.xlsx', txid_current()),
    '[{"row":"1","name":"ZZTEST-PS-ทีมซ้ำ","phone":"0000008399","status":"new"}]');
  perform pstest.as_admin();
  perform pstest.ok((r->>'inserted')::int = 0 and r->'skipped'->0->>'reason' = 'เบอร์นี้มีผู้สนใจอยู่แล้ว', '3) ไฟล์ทีม (ไม่ส่ง dup_ok) เบอร์ซ้ำ = ข้ามเหมือนเดิม');
end $$;

-- ── 4) ตั้งค่า ──
do $$
declare s jsonb; ลิงก์ text := 'https://docs.google.com/spreadsheets/d/ZZTESTzzzzzzzzzzzzzzzzzzzzzz/edit#gid=0';
begin
  perform pstest.as_hq();
  perform pstest.must_fail($q$select public.hq_prospect_sheet_sync_set('https://example.test/x', true)$q$, 'sheet_url', '4) ลิงก์ไม่ใช่ Google Sheets = ปฏิเสธ');
  perform pstest.must_fail($q$select public.hq_prospect_sheet_sync_set('', true)$q$, 'sheet_url', '4) เปิดอัตโนมัติไม่มีลิงก์ = ปฏิเสธ');
  s := public.hq_prospect_sheet_sync_set(ลิงก์, true);
  perform pstest.ok((s->>'enabled')::boolean and s->>'url' = ลิงก์ and s->>'updatedBy' = 'ZZPS ผู้ดูแล', '4) HQ เปิดดึงอัตโนมัติ + จดผู้ตั้ง');
  perform pstest.as_admin();
  perform pstest.ok(exists (select 1 from audit_log where action = 'เปิดดึงผู้สนใจจากชีตอัตโนมัติ' and target = 'ชีต ZZTEST…' and "user" = 'ZZPS ผู้ดูแล'),
    '4) บันทึกการใช้งาน (รหัสชีต 6 ตัว ไม่ลงลิงก์เต็ม)');
  perform pstest.as_dealer();
  perform pstest.must_fail($q$select public.hq_prospect_sheet_sync_set('', false)$q$, 'forbidden', '4) ดีลเลอร์ตั้งค่า = ปฏิเสธ');
  perform pstest.must_fail($q$select public.hq_prospect_sheet_sync()$q$, 'forbidden', '4) ดีลเลอร์อ่านสถานะ = ปฏิเสธ');
  perform pstest.as_admin();
end $$;

-- ── 5) คำสั่งของระบบ ──
do $$
declare c jsonb; r jsonb; วันนี้ date := (now() at time zone 'Asia/Bangkok')::date;
begin
  perform pstest.as_hq();
  perform pstest.must_fail($q$select public._prospect_sheet_claim(true)$q$, 'permission denied', '5) ผู้ใช้เรียกรับงาน = ปฏิเสธ');
  perform pstest.must_fail($q$select public._prospect_sheet_import('x', '[{"row":"1","name":"ZZ","phone":"0000008398","dup_ok":true}]', 'x', false)$q$, 'permission denied', '5) ผู้ใช้เรียกตัวนำเข้าของระบบ = ปฏิเสธ');
  perform pstest.must_fail($q$select public._prospect_sheet_finish(true, 'x', null, true)$q$, 'permission denied', '5) ผู้ใช้เรียกจบงาน = ปฏิเสธ');
  perform pstest.as_admin();
  perform pstest.ok(not has_function_privilege('anon', 'public._prospect_sheet_claim(boolean)', 'execute')
                and not has_function_privilege('anon', 'public._cron_prospect_sheet()', 'execute')
                and not has_function_privilege('authenticated', 'public._cron_prospect_sheet()', 'execute'), '5) anon/ผู้ใช้เรียกตัวตั้งเวลาไม่ได้');

  perform pstest.as_system();
  c := public._prospect_sheet_claim(false);
  perform pstest.ok(c->>'status' = 'run' and c->>'url' like 'https://docs.google.com/spreadsheets/d/ZZTEST%', '5) รับงาน = run + ลิงก์');
  perform pstest.ok(public._prospect_sheet_claim(false)->>'status' = 'busy', '5) รอบที่ยังไม่จบ = busy (กันรันซ้อน)');
  r := public._prospect_sheet_import('Google Sheets ZZTEST… (ดึงอัตโนมัติ)',
         '[{"row":"s:2","name":"ZZTEST-PS-อัตโนมัติ","phone":"0000008398","status":"new","follow_up_today":true,"dup_ok":true}]', '', true);
  perform public._prospect_sheet_finish(true, 'นำเข้า 1 ราย', (r->>'batch')::bigint, false);
  perform pstest.as_admin();
  perform pstest.ok((r->>'inserted')::int = 1, '5) ตัวดึงนำเข้าผ่านคำสั่งเดิม 1 ราย');
  perform pstest.ok((select created_by from prospect_import_batches where id = (r->>'batch')::bigint) = 'ดึงอัตโนมัติ', '5) ชุดลงชื่อ "ดึงอัตโนมัติ"');
  perform pstest.ok(exists (select 1 from notifications where dedupe_key = 'prospect_sheet_imported:batch:' || (r->>'batch') and body like 'นำเข้าจากชีตอัตโนมัติ 1 ราย%'),
    '5) แจ้งกระดิ่ง HQ "นำเข้าจากชีตอัตโนมัติ 1 ราย"');
  perform pstest.ok((select running_since is null and last_ok and last_result = 'นำเข้า 1 ราย' from prospect_sheet_sync where id = 1), '5) จบงาน = ปลดล็อก + จดผล');
  -- ดึงไม่ได้ 2 ครั้งในวันเดียว = เตือนครั้งเดียว · กดเองไม่เตือน
  perform pstest.as_system();
  perform public._prospect_sheet_finish(false, 'ZZTEST ชีตยังไม่เปิดให้ทุกคนที่มีลิงก์ดูได้', null, false);
  perform public._prospect_sheet_finish(false, 'ZZTEST ชีตยังไม่เปิดให้ทุกคนที่มีลิงก์ดูได้', null, false);
  perform pstest.as_admin();
  perform pstest.ok((select count(*) from notifications where dedupe_key = 'prospect_sheet_failed:' || วันนี้) = 1, '5) ดึงไม่ได้ = เตือนวันละครั้ง');
  -- ปิดอัตโนมัติ = รับงานอัตโนมัติไม่ได้ · กดเองได้
  update prospect_sheet_sync set enabled = false where id = 1;
  perform pstest.as_system();
  perform pstest.ok(public._prospect_sheet_claim(false)->>'status' = 'off', '5) ปิดอยู่ = ตัวตั้งเวลาไม่ดึง');
  perform pstest.ok(public._prospect_sheet_claim(true)->>'status' = 'run', '5) ปิดอยู่ กด "ดึงตอนนี้" ยังดึงได้');
  perform pstest.as_admin();
end $$;

select 'ALL PASS' as result;
rollback;
