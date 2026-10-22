-- ── ทดสอบใบ 0193: กล่องขาออกอีเมล + อีเมลของคำขอราคา (ตารางสถานะใน FLOW.html แถว 1, 3, 6, 7) ──────────
-- รัน: docker exec -i <คอนเทนเนอร์ฐานทดสอบ> psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/email_outbox.sql
-- ทุกอย่างอยู่ในทรานแซกชันเดียวแล้ว rollback ท้ายไฟล์ — ไม่ทิ้งข้อมูลไว้ในฐาน
-- ผ่าน = บรรทัดสุดท้ายขึ้น "ALL PASS" · ตกข้อไหนหยุดที่ข้อนั้นพร้อมข้อความ
begin;

create schema flowtest;
create table flowtest.t_ctx as
select
  (select id from profiles where role = 'DEALER_ADMIN' and dealer_code = 'CNX' limit 1) as cnx_uid,
  (select id from profiles where role = 'SUPER_ADMIN' limit 1)                          as hq_uid,
  (select array_agg(num_id order by num_id) from (
     select num_id from leads where dealer_code = 'CNX' and status in ('WAITING','BULLET') order by num_id limit 3) x) as lead_ids;
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
/** นับอีเมลในกล่องขาออก (อ่านด้วยสิทธิ์เจ้าของ — ผู้ใช้อ่านกล่องขาออกเองไม่ได้) */
create function flowtest.mails(p_kind text, p_ref text default null) returns integer language sql security definer as $$
  select count(*)::integer from public.email_outbox where kind = p_kind and (p_ref is null or ref_id = p_ref) $$;
grant usage on schema flowtest to authenticated;
grant execute on all functions in schema flowtest to authenticated;

do $$
declare
  c record; r quote_requests; r2 quote_requests; r3 quote_requests; h hq_quotes; n int; m record;
  lines jsonb := '[{"name":"โครงเหล็ก","qty":100,"unit":"ตร.ม.","unitCost":2500}]';
  เช้านี้ timestamptz := (((now() at time zone 'Asia/Bangkok')::date)::text || ' 09:00:00+07')::timestamptz;
begin
  select * into c from flowtest.t_ctx;
  delete from email_outbox;
  delete from notifications;
  update hq_notif_rules set email_recipients = array['boss@example.test', 'sales-admin@example.test'] where id = 1;

  -- ══ แถว 1: ดีลเลอร์ส่งคำขอ → อีเมลถึง HQ ทุกคนในรายชื่อผู้รับ ══
  perform flowtest.as_dealer('CNX', c.cnx_uid);
  r := quote_request_submit(c.lead_ids[1], 'โกดังและคลังสินค้า');
  perform flowtest.ok(flowtest.mails('request_new', r.id::text) = 2, 'ส่งคำขอ → อีเมล "คำขอใหม่" ถึงผู้รับของ HQ ครบ 2 คน');
  perform flowtest.must_fail('select count(*) from email_outbox', 'permission denied', 'ดีลเลอร์อ่านกล่องขาออกอีเมลไม่ได้');
  perform flowtest.must_fail('insert into email_outbox (kind, to_email, subject, body) values (''x'', ''a@b.c'', ''s'', ''b'')', 'permission denied', 'ดีลเลอร์เขียนกล่องขาออกอีเมลเองไม่ได้');
  perform flowtest.as_root();
  select * into m from email_outbox where kind = 'request_new' and ref_id = r.id::text order by to_email limit 1;
  perform flowtest.ok(m.to_email = 'boss@example.test' and m.status = 'pending' and m.subject like '%' || r.request_no || '%'
                      and m.body like '%CNX%' and m.body like '%โกดังและคลังสินค้า%',
    'อีเมลมีเลขคำขอในหัวเรื่อง · เนื้อความบอกดีลเลอร์และงานที่ขอ · สถานะรอส่ง');

  -- ══ แถว 2: HQ กดรับเรื่อง → ไม่มีอีเมล ══
  perform flowtest.as_root(); select count(*) into n from email_outbox;
  perform flowtest.as_hq(c.hq_uid);
  perform quote_request_accept(r.id);
  perform flowtest.as_root();
  perform flowtest.ok((select count(*) from email_outbox) = n, 'HQ กดรับเรื่อง → ไม่มีอีเมลเพิ่ม');

  -- ══ แถว 3: ครบ 14 วันยังไม่ส่งใบ → สรุปรวมวันละครั้ง (ใบ 0231 · ไม่แจ้งทีละคำขอ) ══
  update quote_requests set due_at = now() - interval '1 day' where id = r.id;   -- เลยกำหนดก่อน 09:00 ของวันนี้แน่นอน
  perform notifications_scan(เช้านี้);
  perform flowtest.ok(flowtest.mails('requests_overdue') = 2, 'คำขอเกิน 14 วัน → อีเมลสรุปในกล่องขาออกถึงผู้รับครบ (ได้ ' || flowtest.mails('requests_overdue') || ' · กระดิ่ง ' || (select count(*) from notifications where kind = 'requests_overdue') || ')');
  perform flowtest.ok((select body like '%' || r.request_no || '%' from email_outbox where kind = 'requests_overdue' limit 1), 'อีเมลสรุปมีเลขคำขอที่ค้าง');
  perform notifications_scan(เช้านี้ + interval '2 hours');
  perform flowtest.ok(flowtest.mails('requests_overdue') = 2, 'งานตรวจรันซ้ำวันเดียวกัน → ไม่ส่งซ้ำ');

  -- ══ แถว 6: ดีลเลอร์ยกเลิกคำขอ → อีเมลถึง HQ พร้อมเหตุผล (คืนตาม FLOW D3x · ใบ 0236) ══
  perform flowtest.as_dealer('CNX', c.cnx_uid);
  r2 := quote_request_submit(c.lead_ids[2], 'โรงงาน');
  perform flowtest.as_root(); select count(*) into n from email_outbox;
  perform flowtest.as_dealer('CNX', c.cnx_uid);
  r2 := quote_request_cancel(r2.id, 'ลูกค้าขอเลื่อน');
  perform flowtest.as_root();
  perform flowtest.ok(flowtest.mails('request_cancelled', r2.id::text) = 2, 'ยกเลิกคำขอ → อีเมล "ยกเลิก" ถึง HQ ครบ 2 คน');
  perform flowtest.ok((select body like '%ลูกค้าขอเลื่อน%' from email_outbox where kind = 'request_cancelled' and ref_id = r2.id::text limit 1), 'อีเมลยกเลิกมีเหตุผลที่ดีลเลอร์ระบุ');

  -- ══ แถว 7: ขอแก้ราคา → อีเมลถึง HQ (คำขอใหม่ที่มาแทน) ══
  perform flowtest.as_hq(c.hq_uid);
  perform hq_quote_save(r.id, lines, current_date + 10); h := hq_quote_send(r.id);
  perform flowtest.as_dealer('CNX', c.cnx_uid);
  r3 := quote_request_reprice(r.id, 'ลูกค้าลดพื้นที่');
  perform flowtest.ok(flowtest.mails('request_reprice', r3.id::text) = 2, 'ขอแก้ราคา → อีเมล "ขอแก้ราคา" ถึง HQ');
  perform flowtest.ok(flowtest.mails('request_new', r3.id::text) = 0, 'คำขอที่มาจากการขอแก้ราคา ไม่ส่งอีเมล "คำขอใหม่" ซ้ำอีกฉบับ');

  -- ══ ไม่มีผู้รับของ HQ → ไม่มีอีเมล · ตั้งผู้รับทีหลัง สรุปวันถัดไปได้อีเมล ══
  perform flowtest.as_root();
  update hq_notif_rules set email_recipients = '{}' where id = 1;
  update quote_requests set due_at = now() - interval '1 hour' where id = r3.id;
  select count(*) into n from email_outbox;
  perform notifications_scan(เช้านี้ + interval '1 day');
  perform flowtest.ok((select count(*) from email_outbox) = n, 'ไม่มีผู้รับ → ไม่มีอีเมล');
  update hq_notif_rules set email_recipients = array['boss@example.test'] where id = 1;
  perform notifications_scan(เช้านี้ + interval '2 days');
  perform flowtest.ok((select count(*) from email_outbox where kind = 'requests_overdue' and body like '%' || r3.request_no || '%') = 1,
    'ตั้งผู้รับทีหลัง → สรุปวันถัดไปแจ้งคำขอที่เกินกำหนดอยู่');

  -- ══ รายชื่อผู้รับ: ที่อยู่ซ้ำ/ว่าง/ผิดรูปแบบถูกปฏิเสธตั้งแต่ตอนตั้งค่า ══
  perform flowtest.must_fail('update hq_notif_rules set email_recipients = array[''ไม่ใช่อีเมล''] where id = 1', 'email_recipients', 'ผู้รับที่ไม่ใช่รูปแบบอีเมลถูกปฏิเสธ');
  raise notice 'ALL PASS';
end $$;

rollback;
