-- ── ข้อทดสอบใบ 0233: ลบไฟล์ — ไฟล์ของใบที่ส่งลูกค้าแล้วลบไม่ได้ · ลบได้เฉพาะไฟล์สาขาตัวเอง · HQ ลบไฟล์ดีลเลอร์ไม่ได้ ─────
-- รัน: docker exec -i supabase_db_pms-dbcheck psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 < supabase/tests/file_delete_rules.sql
-- ทรานแซกชันเดียวแล้ว rollback · ผ่าน = "ALL PASS"
begin;
create schema filetest;
create function filetest.ok(p_cond boolean, p_what text) returns void language plpgsql as $$
begin if p_cond is not true then raise exception 'FAIL: %', p_what; end if; raise notice 'ok  %', p_what; end $$;
create function filetest.must_fail(p_sql text, p_like text, p_what text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if sqlerrm ilike '%' || p_like || '%' then raise notice 'ok  % (ถูกปฏิเสธ)', p_what; return; end if;
    raise exception 'FAIL: % — ถูกปฏิเสธแต่ข้อความไม่ตรง: %', p_what, sqlerrm;
  end;
  raise exception 'FAIL: % — ควรถูกปฏิเสธแต่ผ่าน', p_what;
end $$;
create function filetest.as_dealer(p_code text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.profiles where role = 'DEALER_ADMIN' and dealer_code = p_code limit 1),
    'role', 'authenticated', 'user_role', 'DEALER_ADMIN', 'dealer_code', p_code)::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function filetest.as_hq() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.profiles where role = 'SUPER_ADMIN' limit 1),
    'role', 'authenticated', 'user_role', 'SUPER_ADMIN', 'dealer_code', '')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
grant usage on schema filetest to authenticated;
grant execute on all functions in schema filetest to authenticated;

do $$
declare n int;
begin
  set local session_replication_role = replica;
  insert into quotations (dealer_code, id, customer, project, status, total, total_value, date)
  values ('CNX', 'ZZ-FD-SENT', 'ZZTEST-filedel', 'p', 'sent_to_client', '฿1', 1, current_date),
         ('CNX', 'ZZ-FD-DRAFT', 'ZZTEST-filedel', 'p', 'draft', '฿1', 1, current_date);
  insert into files (dealer_code, name, size, ext, category, project, uploaded_by, uploaded_at, source)
  values ('CNX', 'ใบเสนอราคา_ZZ-FD-SENT_x.pdf', '', 'pdf', 'ใบเสนอราคา', 'p', 'ระบบ', current_date, 'lead'),
         ('CNX', 'ใบเสนอราคา_ZZ-FD-DRAFT_x.pdf', '', 'pdf', 'ใบเสนอราคา', 'p', 'ระบบ', current_date, 'lead'),
         ('CNX', 'ZZTEST-แนบผิด.jpg', '1 KB', 'jpg', 'รูปภาพ', 'p', 'ผู้ทดสอบ', current_date, 'lead'),
         ('CNX', 'ZZTEST-ของ-CNX-ให้-HQ-ลอง.jpg', '1 KB', 'jpg', 'รูปภาพ', 'p', 'ผู้ทดสอบ', current_date, 'lead'),
         ('RYG', 'ZZTEST-ของ-RYG.jpg', '1 KB', 'jpg', 'รูปภาพ', 'p', 'ผู้ทดสอบ', current_date, 'lead');
  set local session_replication_role = origin;

  perform filetest.as_dealer('CNX');
  perform filetest.must_fail($s$delete from files where dealer_code = 'CNX' and name = 'ใบเสนอราคา_ZZ-FD-SENT_x.pdf'$s$, 'file_of_sent_quote',
    'ลบไฟล์ของใบที่ส่งลูกค้าแล้ว');
  delete from files where dealer_code = 'CNX' and name = 'ใบเสนอราคา_ZZ-FD-DRAFT_x.pdf';
  get diagnostics n = row_count;
  perform filetest.ok(n = 1, 'ไฟล์ของใบร่างลบได้');
  delete from files where dealer_code = 'CNX' and name = 'ZZTEST-แนบผิด.jpg';
  get diagnostics n = row_count;
  perform filetest.ok(n = 1, 'ไฟล์ที่แนบผิดของสาขาตัวเองลบได้');
  delete from files where name = 'ZZTEST-ของ-RYG.jpg';
  get diagnostics n = row_count;
  perform filetest.ok(n = 0, 'ไฟล์ของสาขาอื่นลบไม่ได้ (ไม่เจอแถว)');

  perform filetest.as_hq();
  delete from files where name = 'ZZTEST-ของ-CNX-ให้-HQ-ลอง.jpg';
  get diagnostics n = row_count;
  perform filetest.ok(n = 0, 'HQ ลบไฟล์ของดีลเลอร์ไม่ได้');

  raise notice 'ALL PASS';
end $$;
rollback;
