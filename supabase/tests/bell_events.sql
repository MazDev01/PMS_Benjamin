-- ── ข้อทดสอบใบ 0224: เหตุการณ์ของกระดิ่ง — "HQ ส่งราคาแล้ว" ลงไทม์ไลน์ลีด · "ขอแก้ราคา" แยกจากคำขอใหม่ในบันทึกการใช้งาน ──
-- รัน: docker exec -i supabase_db_pms-dbcheck psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 < supabase/tests/bell_events.sql
-- ทรานแซกชันเดียวแล้ว rollback · รอบปิดด่านรันผ่าน tests/scenario/db-rule-tests.spec.ts · ผ่าน = "ALL PASS"
begin;
create schema btest;
create function btest.as_dealer() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.profiles where role = 'DEALER_ADMIN' and dealer_code = 'CNX' limit 1),
    'role', 'authenticated', 'user_role', 'DEALER_ADMIN', 'dealer_code', 'CNX')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function btest.as_hq() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.profiles where role = 'SUPER_ADMIN' limit 1),
    'role', 'authenticated', 'user_role', 'SUPER_ADMIN', 'dealer_code', '')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function btest.as_db() returns void language plpgsql as $$
begin perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '', true); end $$;
create function btest.hq_send(p_rid bigint) returns void language plpgsql as $$
begin
  perform btest.as_hq();
  perform public.hq_quote_save(p_rid, '[{"name":"โครงเหล็ก","qty":1,"unit":"ชุด","unitCost":1000}]'::jsonb, (now() at time zone 'Asia/Bangkok')::date + 30);
  perform public.hq_quote_send(p_rid);
  perform btest.as_db();
end $$;
create function btest.n_quoted(p_num int) returns int language sql as $$
  select count(*)::int from public.leads l, jsonb_array_elements(coalesce(l.activities, '[]'::jsonb)) a
   where l.dealer_code = 'CNX' and l.num_id = p_num and a ->> 'type' = 'hq_quoted' $$;
grant usage on schema btest to authenticated;
grant execute on all functions in schema btest to authenticated;

do $$
declare n int; rid bigint; rid2 bigint; a jsonb; c int;
begin
  perform btest.as_db();
  n := (select coalesce(max(num_id), 0) from public.leads where dealer_code = 'CNX') + 1;
  insert into public.leads (id, num_id, dealer_code, company, name, contact, phone, province, status)
  values ('#L-' || n, n, 'CNX', 'ZZTEST-กระดิ่ง', 'ZZTEST-กระดิ่ง', 'ผู้ทดสอบ', '000-000-' || lpad((n % 10000)::text, 4, '0'), 'เชียงใหม่', 'BULLET');

  -- 1) ดีลเลอร์ส่งคำขอ → บันทึกการใช้งาน "ส่งคำขอใบเสนอราคา" (เหมือนเดิม)
  perform btest.as_dealer();
  rid := (public.quote_request_submit(n, 'โกดังสำเร็จรูป')).id;
  perform btest.as_db();
  if not exists (select 1 from audit_log where action = 'ส่งคำขอใบเสนอราคา' and target = 'CNX · ' || (select request_no from quote_requests where id = rid))
    then raise exception 'FAIL: 1) คำขอใหม่ต้องจดว่า "ส่งคำขอใบเสนอราคา"'; end if;
  if btest.n_quoted(n) <> 0 then raise exception 'FAIL: 1) ยังไม่ส่งราคา ต้องไม่มีกิจกรรม hq_quoted'; end if;
  raise notice 'ok  1) คำขอใหม่ = "ส่งคำขอใบเสนอราคา" · ยังไม่มี "HQ ส่งราคาแล้ว"';

  -- 2) HQ ส่งใบ → ลีดได้กิจกรรม hq_quoted หนึ่งรายการ พร้อมเลขคำขอและเวลา
  perform btest.hq_send(rid);
  if btest.n_quoted(n) <> 1 then raise exception 'FAIL: 2) HQ ส่งใบแล้วต้องมีกิจกรรม hq_quoted 1 รายการ (ได้ %)', btest.n_quoted(n); end if;
  select x into a from public.leads l, jsonb_array_elements(l.activities) x where l.dealer_code = 'CNX' and l.num_id = n and x ->> 'type' = 'hq_quoted';
  if position((select request_no from quote_requests where id = rid) in a ->> 'text') = 0 or (a ->> 'at') is null then
    raise exception 'FAIL: 2) กิจกรรมต้องมีเลขคำขอและเวลา: %', a; end if;
  if (select status from leads where dealer_code = 'CNX' and num_id = n) <> 'HQ_QUOTED' then raise exception 'FAIL: 2) ลีดต้องเป็นได้ราคา HQ'; end if;
  raise notice 'ok  2) HQ ส่งใบ → กิจกรรม "HQ ส่งราคาแล้ว" (%)', a ->> 'text';

  -- 3) ดีลเลอร์ขอแก้ราคา → บันทึกการใช้งาน "ขอแก้ราคา" (ไม่ใช่คำขอใหม่) · HQ ส่งรอบสอง → กิจกรรมรอบที่สอง
  perform btest.as_dealer();
  rid2 := (public.quote_request_reprice(rid, 'ลูกค้าขอลดสเปก', null)).id;
  perform btest.as_db();
  select count(*) into c from audit_log where action = 'ขอแก้ราคา' and target = 'CNX · ' || (select request_no from quote_requests where id = rid2);
  if c <> 1 then raise exception 'FAIL: 3) ขอแก้ราคาต้องจดว่า "ขอแก้ราคา" 1 แถว (ได้ %)', c; end if;
  if exists (select 1 from audit_log where action = 'ส่งคำขอใบเสนอราคา' and target = 'CNX · ' || (select request_no from quote_requests where id = rid2))
    then raise exception 'FAIL: 3) ขอแก้ราคาต้องไม่จดเป็นคำขอใหม่'; end if;
  perform btest.hq_send(rid2);
  if btest.n_quoted(n) <> 2 then raise exception 'FAIL: 3) HQ ส่งรอบสองต้องมีกิจกรรม hq_quoted 2 รายการ (ได้ %)', btest.n_quoted(n); end if;
  raise notice 'ok  3) ขอแก้ราคา = "ขอแก้ราคา" · HQ ส่งรอบสอง → กิจกรรมใหม่อีกรายการ';
  raise notice 'ALL PASS';
end $$;
rollback;
