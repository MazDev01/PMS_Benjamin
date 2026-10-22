-- ── ข้อทดสอบใบ 0231 + 0236: แจ้งเตือนจากตารางกลางที่เดียว (บอสสั่ง 21 ต.ค. 69 · รอบ 4) ─────────────────────────────────────
--   แต่ละเรื่องเกิดแล้วคนที่ถูกได้แจ้ง (กระดิ่ง + อีเมลตามตาราง) · คนทำเองไม่ได้ · เรื่องนอกตาราง (ยกเลิกคำขอ/ลูกค้าปฏิเสธ) ไม่มี
--   งานตั้งเวลารัน 2 รอบได้แจ้งครั้งเดียว · ตัวตรวจ: ฟังก์ชันอื่นนอกตัวกลางที่เขียน notifications / email_outbox = ตก
-- รัน: docker exec -i supabase_db_pms-dbcheck psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 < supabase/tests/notification_catalog.sql
-- ทรานแซกชันเดียวแล้ว rollback · รอบปิดด่านรันผ่าน tests/scenario/db-rule-tests.spec.ts · ผ่าน = "ALL PASS"
begin;
create schema ntest;
create function ntest.ok(p_cond boolean, p_what text) returns void language plpgsql as $$
begin if p_cond is not true then raise exception 'FAIL: %', p_what; end if; raise notice 'ok  %', p_what; end $$;
create function ntest.as_dealer(p_code text default 'CNX') returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.profiles where role = 'DEALER_ADMIN' and dealer_code = p_code limit 1),
    'role', 'authenticated', 'user_role', 'DEALER_ADMIN', 'dealer_code', p_code)::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function ntest.as_hq() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.profiles where role = 'SUPER_ADMIN' limit 1),
    'role', 'authenticated', 'user_role', 'SUPER_ADMIN', 'dealer_code', '')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function ntest.as_db() returns void language plpgsql as $$
begin perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '', true); end $$;
-- จำนวนแจ้งเตือนชนิดนี้ (ทั้งหมด หรือเฉพาะที่เกี่ยวกับลีด/คำขอ/ชื่อนี้)
create function ntest.n(p_kind text, p_like text default '%') returns int language sql as $$
  select count(*)::int from public.notifications where kind = p_kind and (body like p_like or dedupe_key like p_like) $$;
create function ntest.mail(p_kind text, p_to text) returns int language sql as $$
  select count(*)::int from public.email_outbox where kind = p_kind and to_email = p_to $$;
create function ntest.lead(p_company text, p_status text default 'BULLET', p_dealer text default 'CNX') returns int language plpgsql as $$
declare n int;
begin
  n := (select coalesce(max(num_id), 0) from public.leads where dealer_code = p_dealer) + 1;
  insert into public.leads (id, num_id, dealer_code, company, name, contact, phone, province, status)
  values ('#L-' || (40321 + n), n, p_dealer, p_company, p_company, 'ผู้ทดสอบ', '000-000-' || lpad((n % 10000)::text, 4, '0'), 'เชียงใหม่', p_status::lead_status);
  return n;
end $$;
create function ntest.hq_send(p_rid bigint, p_valid date default (now() at time zone 'Asia/Bangkok')::date + 30) returns bigint language plpgsql as $$
begin
  perform ntest.as_hq();
  perform public.hq_quote_save(p_rid, '[{"name":"โครงเหล็ก","qty":1,"unit":"ชุด","unitCost":1000}]'::jsonb, p_valid);
  perform public.hq_quote_send(p_rid);
  perform ntest.as_db();
  return (select id from public.hq_quotes where request_id = p_rid);
end $$;
-- เรียกตัวกลางด้วยตัวตนของผู้ใช้ที่ล็อกอิน (ผู้ใช้เรียก _notify ตรงไม่ได้ · ตัวดัก/คำสั่งของฐานเรียกแทน)
create function ntest.notify(p_kind text, p_dealer text, p_once text) returns boolean language sql security definer as $$
  select public._notify(p_kind, p_dealer, p_once, '{}') $$;
grant usage on schema ntest to authenticated;
grant execute on all functions in schema ntest to authenticated;

do $$
declare
  วันนี้ date := (now() at time zone 'Asia/Bangkok')::date;
  เช้านี้ timestamptz := (วันนี้::text || ' 09:00:00+07')::timestamptz;
  HQ_MAIL text := 'zz-notif-hq@example.test';
  CNX_MAIL text := 'zz-notif-cnx@example.test';
  n1 int; n2 int; n3 int; rid bigint; rid2 bigint; rid3 bigint; hq bigint; q text; c int; c2 int; total int;
  pid bigint; pr bigint; bad text;
begin
  perform ntest.as_db();
  update hq_notif_rules set email_recipients = array[HQ_MAIL] where id = 1;
  -- ตัวดักของโปรไฟล์ล้างการยืนยันเมื่ออีเมลเปลี่ยน → ตั้งอีเมลก่อนแล้วค่อยยืนยัน
  update profiles set contact_email = CNX_MAIL where role = 'DEALER_ADMIN' and dealer_code = 'CNX' and status = 'active';
  update profiles set contact_email_verified_at = now() where role = 'DEALER_ADMIN' and dealer_code = 'CNX' and status = 'active';
  delete from notifications;

  -- ══ 0) ตารางกลาง = 12 ชนิดตาม FLOW (11 แถว · D6 มี 2 ชนิด) กระดิ่ง/อีเมลตามที่บอสสั่ง ══
  select string_agg(kind || '/' || flow_row || '/' || audience || '/' || bell || '/' || email, ' ' order by sort) into bad from notification_kinds;
  perform ntest.ok(bad =
    'hq_quote_sent/D1/dealer/true/true hq_quote_expiring/D2/dealer/true/true hq_quote_expired/D3/dealer/true/false '
    'quote_expiring/D4/dealer/true/false appointment_due/D5/dealer/true/false lead_from_hq/D6/dealer/true/true '
    'won_reverted/D6/dealer/true/true request_new/H1/hq/true/true request_reprice/H2/hq/true/true '
    'requests_overdue/H3/hq/true/true customer_accepted/H4/hq/true/true franchise_payment_overdue/H5/hq/true/false '
    'request_cancelled/H6/hq/true/true prospect_followup_due/H7/hq/true/false prospect_idle/H7/hq/true/false '
    'proposal_awaiting/H8/hq/true/false proposal_expired/H8/hq/true/false',
    '0) ตารางกลางมี 17 ชนิด (14 แถว) ตรงตาราง FLOW (ได้ ' || bad || ')');

  -- ══ 1) H1 คำขอราคาใหม่ → HQ กระดิ่ง + อีเมล · ดีลเลอร์ (คนทำ) ไม่ได้อะไร ══
  n1 := ntest.lead('ZZTEST-แจ้งเตือน-1');
  perform ntest.as_dealer();
  rid := (public.quote_request_submit(n1, 'โกดังสำเร็จรูป')).id;
  perform ntest.as_db();
  perform ntest.ok(ntest.n('request_new', 'request_new:' || rid) = 1 and ntest.mail('request_new', HQ_MAIL) = 1,
    '1) คำขอใหม่ → กระดิ่ง HQ 1 + อีเมล HQ 1');
  perform ntest.ok(not exists (select 1 from notifications where audience = 'dealer'), '1) ดีลเลอร์ที่ส่งคำขอเองไม่ได้แจ้งเตือน');
  perform ntest.ok((select href from notifications where dedupe_key = 'request_new:' || rid) = '/hq/quote-requests?open=' || rid,
    '1) กดแล้วเปิดตรงคำขอนั้น');

  -- ══ 2) D1 HQ ส่งราคา → ดีลเลอร์ กระดิ่ง + อีเมลติดต่อที่ยืนยันแล้ว · HQ (คนทำ) ไม่ได้อะไรเพิ่ม ══
  total := (select count(*) from notifications where audience = 'hq');
  hq := ntest.hq_send(rid);
  perform ntest.ok(ntest.n('hq_quote_sent', 'hq_quote_sent:' || rid) = 1 and ntest.mail('hq_quote_sent', CNX_MAIL) = 1,
    '2) HQ ส่งราคา → กระดิ่งดีลเลอร์ 1 + อีเมลดีลเลอร์ 1');
  perform ntest.ok((select dealer_code from notifications where dedupe_key = 'hq_quote_sent:' || rid) = 'CNX'
    and (select href from notifications where dedupe_key = 'hq_quote_sent:' || rid) = '/leads?open=' || n1, '2) ถึง CNX · กดแล้วเปิดลีดนั้น');
  perform ntest.ok((select count(*) from notifications where audience = 'hq') = total, '2) HQ ที่ส่งราคาเองไม่ได้แจ้งเตือน');

  -- ══ 3) H2 ขอแก้ราคา → HQ · D1 รอบสอง → ดีลเลอร์อีกเรื่อง ══
  perform ntest.as_dealer();
  rid2 := (public.quote_request_reprice(rid, 'ลูกค้าขอลดสเปก', null)).id;
  perform ntest.as_db();
  perform ntest.ok(ntest.n('request_reprice', 'request_reprice:' || rid2) = 1 and ntest.n('request_new', 'request_new:' || rid2) = 0
    and ntest.mail('request_reprice', HQ_MAIL) = 1, '3) ขอแก้ราคา → กระดิ่ง HQ "ขอแก้ราคา" (ไม่ใช่คำขอใหม่) + อีเมล');
  hq := ntest.hq_send(rid2);
  perform ntest.ok(ntest.n('hq_quote_sent', '%ZZTEST-แจ้งเตือน-1%') = 2, '3) HQ ส่งราคาที่ขอแก้ → ดีลเลอร์ได้เรื่องใหม่ (รวม 2)');

  -- ══ 4) H4 ลูกค้าตอบรับ → HQ · D6 HQ ย้อนการปิดการขาย → ดีลเลอร์ ══
  perform ntest.as_dealer();
  q := (public.create_quotation('CNX', 'Q-', jsonb_build_object('customer', 'ZZTEST-แจ้งเตือน-1', 'project', 'ZZTEST', 'province', 'เชียงใหม่',
    'total', '0', 'status', 'draft', 'date', วันนี้, 'line_items', '[{"name":"โครงเหล็ก","qty":1,"unit":"ชุด","unitPrice":0,"markupPct":10}]'::jsonb,
    'items', 1, 'hq_quote_id', hq, 'deal_id', n1, 'markup_percent', 10))).id;
  update quotations set status = 'sent_to_client' where dealer_code = 'CNX' and id = q;
  update quotations set status = 'won', customer_id = (select id from customers where dealer_code = 'CNX' order by id limit 1)
   where dealer_code = 'CNX' and id = q;
  perform ntest.as_db();
  perform ntest.ok(ntest.n('customer_accepted', 'customer_accepted:' || rid2 || ':%') = 1 and ntest.mail('customer_accepted', HQ_MAIL) = 1,
    '4) ลูกค้าตอบรับ → กระดิ่ง HQ 1 + อีเมล HQ 1');
  perform ntest.ok(not exists (select 1 from notifications where audience = 'dealer' and dealer_code = 'CNX' and kind not in ('hq_quote_sent')),
    '4) ดีลเลอร์ที่กดตอบรับเองไม่ได้แจ้งเตือน');
  perform ntest.as_hq();
  perform public.quotation_revert_won('CNX', q, 'ZZTEST ลูกค้ายังไม่โอนมัดจำ');
  perform ntest.as_db();
  perform ntest.ok(ntest.n('won_reverted', '%ZZTEST ลูกค้ายังไม่โอนมัดจำ%') = 1 and ntest.mail('won_reverted', CNX_MAIL) = 1,
    '4) HQ ย้อนการปิดการขาย → กระดิ่งดีลเลอร์ (มีเหตุผล) + อีเมล');
  perform ntest.ok(not exists (select 1 from notifications where audience = 'hq' and kind = 'won_reverted'), '4) HQ ที่ย้อนเองไม่ได้แจ้งเตือน');

  -- ══ 5) H6 ดีลเลอร์ยกเลิกคำขอ → HQ กระดิ่ง + อีเมล พร้อมเหตุผล (คืนตาม FLOW D3x · ใบ 0236) · ลูกค้าปฏิเสธ = ห้ามแจ้ง ══
  total := (select count(*) from notifications);
  n2 := ntest.lead('ZZTEST-แจ้งเตือน-2');
  perform ntest.as_dealer();
  rid3 := (public.quote_request_submit(n2, 'โกดังสำเร็จรูป')).id;
  perform public.quote_request_cancel(rid3, 'ลูกค้าเลื่อนโครงการ');
  perform ntest.as_db();
  perform ntest.ok((select status from quote_requests where id = rid3) = 'cancelled'
    and ntest.n('request_cancelled', 'request_cancelled:' || rid3) = 1
    and (select body from notifications where dedupe_key = 'request_cancelled:' || rid3) like '%ลูกค้าเลื่อนโครงการ%'
    and (select href from notifications where dedupe_key = 'request_cancelled:' || rid3) = '/hq/quote-requests?open=' || rid3,
    '5) H6 ยกเลิกคำขอ → กระดิ่ง HQ 1 เรื่อง มีเหตุผล · กดแล้วเปิดคำขอนั้น');
  perform ntest.ok((select count(*) from email_outbox where kind = 'request_cancelled' and ref_id = rid3::text and to_email = HQ_MAIL) = 1,
    '5) H6 ยกเลิกคำขอ → อีเมลถึง HQ 1 ฉบับ');
  perform ntest.ok(not exists (select 1 from notifications where audience = 'dealer' and kind = 'request_cancelled'),
    '5) H6 ดีลเลอร์ที่ยกเลิกเองไม่ได้แจ้ง');
  n3 := ntest.lead('ZZTEST-แจ้งเตือน-3');
  perform ntest.as_dealer();
  rid3 := (public.quote_request_submit(n3, 'โกดังสำเร็จรูป')).id;
  hq := ntest.hq_send(rid3);
  perform ntest.as_dealer();
  q := (public.create_quotation('CNX', 'Q-', jsonb_build_object('customer', 'ZZTEST-แจ้งเตือน-3', 'project', 'ZZTEST', 'province', 'เชียงใหม่',
    'total', '0', 'status', 'draft', 'date', วันนี้, 'line_items', '[{"name":"โครงเหล็ก","qty":1,"unit":"ชุด","unitPrice":0,"markupPct":10}]'::jsonb,
    'items', 1, 'hq_quote_id', hq, 'deal_id', n3, 'markup_percent', 10))).id;
  update quotations set status = 'sent_to_client' where dealer_code = 'CNX' and id = q;
  perform ntest.as_db(); c := (select coalesce(max(id), 0) from notifications); perform ntest.as_dealer();
  update quotations set status = 'lost', lost_reason = 'ราคาสูง' where dealer_code = 'CNX' and id = q;
  perform ntest.as_db();
  perform ntest.ok(not exists (select 1 from notifications where id > c) and (select status from quote_requests where id = rid3) = 'lost',
    '5) ลูกค้าปฏิเสธ → ไม่มีแจ้งเตือน (เพิ่ม: ' || coalesce((select string_agg(dedupe_key, ', ') from notifications where id > c), '-') || ')');

  -- ══ 6) คนทำเองไม่ได้ · ชนิดนอกตาราง = ปฏิเสธ ══
  perform ntest.as_hq();
  perform ntest.ok(not ntest.notify('request_new', null, 'zz-self'), '6) HQ ทำเอง → ไม่สร้างเรื่องของ HQ');
  perform ntest.as_dealer();
  perform ntest.ok(not ntest.notify('lead_from_hq', 'CNX', 'zz-self'), '6) ดีลเลอร์ทำเอง → ไม่สร้างเรื่องของสาขาตัวเอง');
  perform ntest.as_db();
  begin
    perform public._notify('quote_request_cancelled', null, 'zz', '{}');
    raise exception 'FAIL: 6) ชนิดนอกตารางต้องถูกปฏิเสธ';
  exception when others then
    if sqlerrm not like 'notify_unknown_kind%' then raise; end if;
    raise notice 'ok  6) ชนิดนอกตารางกลาง (ชื่อชนิดเดิม quote_request_cancelled) สร้างไม่ได้';
  end;

  -- ══ 7) งานตั้งเวลา: D2 D4 D5 H3 H5 · รัน 2 รอบได้แจ้งครั้งเดียว · ก่อน 07:00 ไม่แจ้ง ══
  -- D2 ราคา HQ เหลือ 2 วัน
  n2 := ntest.lead('ZZTEST-แจ้งเตือน-ใกล้หมด');
  perform ntest.as_dealer();
  rid := (public.quote_request_submit(n2, 'โกดังสำเร็จรูป')).id;
  perform ntest.hq_send(rid, วันนี้ + 2);
  -- D4 ใบส่งลูกค้าเหลือ 1 วัน (ลีดอีกราย · ใบ HQ ยืนราคา 30 วัน)
  n3 := ntest.lead('ZZTEST-ลูกค้าใบใกล้หมด');
  perform ntest.as_dealer();
  rid3 := (public.quote_request_submit(n3, 'โกดังสำเร็จรูป')).id;
  hq := ntest.hq_send(rid3);
  perform ntest.as_dealer();
  q := (public.create_quotation('CNX', 'Q-', jsonb_build_object('customer', 'ZZTEST-ลูกค้าใบใกล้หมด', 'project', 'ZZTEST', 'province', 'เชียงใหม่',
    'total', '0', 'status', 'draft', 'date', วันนี้ - 29, 'expiry', วันนี้ + 1,
    'line_items', '[{"name":"โครงเหล็ก","qty":1,"unit":"ชุด","unitPrice":0,"markupPct":10}]'::jsonb,
    'items', 1, 'hq_quote_id', hq, 'deal_id', n3, 'markup_percent', 10))).id;
  update quotations set status = 'sent_to_client' where dealer_code = 'CNX' and id = q;
  perform ntest.as_db();
  perform ntest.ok((select expiry from quotations where dealer_code = 'CNX' and id = q) = (วันนี้ + 1)::text, '7) เตรียมใบส่งลูกค้าหมดอายุพรุ่งนี้');
  -- D5 นัดหมายวันนี้ · นัดที่ทำแล้วไม่แจ้ง
  insert into appointments (id, dealer_code, company, date, time, type, status, note)
  values (-9101, 'CNX', 'ZZTEST-นัดวันนี้', วันนี้::text, '10:30', 'follow_up', 'upcoming', ''),
         (-9102, 'CNX', 'ZZTEST-นัดเสร็จแล้ว', วันนี้::text, '11:00', 'visit', 'done', '');
  -- H3 คำขอค้างเกินกำหนด 2 รายการ → สรุปเรื่องเดียว
  perform ntest.as_dealer();
  rid := (public.quote_request_submit(ntest.lead('ZZTEST-ค้าง-1'), 'โกดังสำเร็จรูป')).id;
  rid2 := (public.quote_request_submit(ntest.lead('ZZTEST-ค้าง-2'), 'โกดังสำเร็จรูป')).id;
  perform ntest.as_db();
  update quote_requests set due_at = now() - interval '1 day' where id in (rid, rid2);
  -- H5 ใบค่าแฟรนไชส์ตอบรับแล้ว เลยวันครบกำหนดชำระ ยังค้าง
  insert into dealer_prospects (name, province) values ('ZZTEST-ผู้สนใจค้างชำระ', 'เชียงใหม่') returning id into pid;
  perform ntest.as_hq();
  insert into dealer_package_proposals (prospect_id, package, amount, status, valid_until) values (pid, 'standard', 50000, 'sent', วันนี้ + 10) returning id into pr;
  update dealer_package_proposals set status = 'accepted', payment_due_on = วันนี้ - 1 where id = pr;
  perform ntest.as_db();

  perform ntest.ok(public.notifications_scan((วันนี้::text || ' 06:30:00+07')::timestamptz) = 0, '7) ก่อน 07:00 น. งานตั้งเวลาไม่แจ้ง');
  c := public.notifications_scan(เช้านี้);
  perform ntest.ok(ntest.n('hq_quote_expiring', '%ZZTEST-แจ้งเตือน-ใกล้หมด%') = 1 and ntest.mail('hq_quote_expiring', CNX_MAIL) = 1,
    '7) D2 ราคา HQ เหลือ 2 วัน → กระดิ่ง + อีเมลดีลเลอร์');
  perform ntest.ok(ntest.n('quote_expiring', '%ZZTEST-ลูกค้าใบใกล้หมด%') = 1 and ntest.mail('quote_expiring', CNX_MAIL) = 0,
    '7) D4 ใบส่งลูกค้าเหลือ 1 วัน → กระดิ่งอย่างเดียว');
  perform ntest.ok(ntest.n('appointment_due', '%ZZTEST-นัดวันนี้%') = 1 and ntest.n('appointment_due', '%ZZTEST-นัดเสร็จแล้ว%') = 0,
    '7) D5 นัดวันนี้ → กระดิ่ง · นัดที่เสร็จแล้วไม่แจ้ง');
  perform ntest.ok(ntest.n('requests_overdue') = 1 and ntest.mail('requests_overdue', HQ_MAIL) = 1
    and (select body from notifications where kind = 'requests_overdue') like '%' || (select request_no from quote_requests where id = rid2) || '%',
    '7) H3 คำขอค้างเกินกำหนด → สรุปเรื่องเดียว + อีเมล HQ');
  perform ntest.ok(ntest.n('franchise_payment_overdue', '%ZZTEST-ผู้สนใจค้างชำระ%') = 1 and (select count(*) from email_outbox where kind = 'franchise_payment_overdue') = 0,
    '7) H5 ใบค่าแฟรนไชส์เกินกำหนดชำระ → กระดิ่ง HQ อย่างเดียว');
  total := (select count(*) from notifications); c2 := (select count(*) from email_outbox);
  perform ntest.ok(public.notifications_scan(เช้านี้ + interval '15 minutes') = 0 and (select count(*) from notifications) = total
    and (select count(*) from email_outbox) = c2, '7) รันรอบสองวันเดียวกัน → ไม่มีแจ้งเตือน/อีเมลซ้ำ (รอบแรก ' || c || ' เรื่อง)');
  -- ชำระครบแล้ว → วันถัดไปไม่แจ้งเกินกำหนดอีก
  perform ntest.as_hq();
  insert into dealer_proposal_payments (proposal_id, paid_on, amount, reference) values (pr, วันนี้, 50000, 'ZZTEST');
  perform ntest.as_db();
  perform public.notifications_scan(เช้านี้ + interval '1 day');
  perform ntest.ok(ntest.n('franchise_payment_overdue', '%ZZTEST-ผู้สนใจค้างชำระ%') = 1, '7) ชำระครบแล้ว ไม่แจ้งเกินกำหนดอีก');

  -- ══ 8) D3 ราคา HQ หมดอายุ → ลีดกลับรวบรวมความต้องการ + กระดิ่ง (ไม่มีอีเมล) · รันซ้ำไม่ซ้ำ ══
  perform public.expire_hq_linked_quotations(วันนี้ + 3);
  perform public.expire_hq_linked_quotations(วันนี้ + 3);
  perform ntest.ok((select status from leads where dealer_code = 'CNX' and num_id = n2) = 'BULLET'
    and ntest.n('hq_quote_expired', '%ZZTEST-แจ้งเตือน-ใกล้หมด%') = 1 and (select count(*) from email_outbox where kind = 'hq_quote_expired') = 0,
    '8) ราคา HQ หมดอายุ → ลีดกลับรวบรวมความต้องการ · กระดิ่ง 1 เรื่อง ไม่มีอีเมล');

  -- ══ 9) D6 HQ ส่งลีดใหม่ให้ (โอนจากรหัส HQ) ══
  bad := (select province from dealer_territories where dealer_code = 'CNX' order by province limit 1);
  n3 := ntest.lead('ZZTEST-ลีดจาก HQ', 'WAITING', 'HQ');
  update leads set province = bad where dealer_code = 'HQ' and num_id = n3;
  perform ntest.as_hq();
  perform public.transfer_hq_leads(bad, 'CNX');
  perform ntest.as_db();
  perform ntest.ok(ntest.n('lead_from_hq', '%ZZTEST-ลีดจาก HQ%') = 1 and ntest.mail('lead_from_hq', CNX_MAIL) = 1
    and (select href from notifications where kind = 'lead_from_hq' and body like '%ZZTEST-ลีดจาก HQ%')
        = '/leads?open=' || (select num_id from leads where dealer_code = 'CNX' and company = 'ZZTEST-ลีดจาก HQ'),
    '9) HQ โอนลีดให้ → กระดิ่ง + อีเมลดีลเลอร์ · กดแล้วเปิดลีดเลขใหม่ของสาขา');

  -- ══ 10) สิทธิ์อ่าน: ดีลเลอร์เห็นเฉพาะของสาขาตัวเอง · HQ เห็นเฉพาะของ HQ · เขียนเองไม่ได้ ══
  perform ntest.as_dealer();
  perform ntest.ok((select count(*) from notifications where audience = 'hq' or dealer_code <> 'CNX') = 0
    and (select count(*) from notifications) > 0, '10) ดีลเลอร์อ่านได้เฉพาะเรื่องของสาขาตัวเอง');
  begin
    insert into notifications (kind, audience, dealer_code, title, body, href, dedupe_key) values ('lead_from_hq', 'dealer', 'CNX', 'x', 'x', '/', 'zz-forge');
    raise exception 'FAIL: 10) ดีลเลอร์สร้างแจ้งเตือนเองต้องไม่ได้';
  exception when insufficient_privilege then raise notice 'ok  10) ดีลเลอร์สร้างแจ้งเตือนเองไม่ได้';
  end;
  perform ntest.as_hq();
  perform ntest.ok((select count(*) from notifications where audience <> 'hq') = 0 and (select count(*) from notifications) > 0,
    '10) HQ อ่านได้เฉพาะเรื่องของ HQ');
  perform ntest.as_db();

  -- ══ 12) H7 ผู้สนใจเป็นดีลเลอร์ถึงกำหนดติดตาม / ไม่ได้ติดต่อนาน (เกณฑ์เดิม 14 วัน) — งานตั้งเวลา · รัน 2 รอบได้เรื่องเดียว ══
  insert into dealer_prospects (name, province, status, follow_up, created_at)
  values ('ZZTEST-ผู้สนใจถึงนัด', 'เชียงใหม่', 'meeting', วันนี้ - 2, now() - interval '1 day'),
         ('ZZTEST-ผู้สนใจเงียบ', 'เชียงใหม่', 'contacted', null, now() - interval '40 days'),
         ('ZZTEST-ผู้สนใจเงียบน้อย', 'เชียงใหม่', 'contacted', null, now() - interval '40 days'),
         ('ZZTEST-ผู้สนใจจบแล้ว', 'เชียงใหม่', 'lost', วันนี้ - 5, now() - interval '40 days');
  -- ติดต่อล่าสุด = ฐานตั้งจากบันทึกการติดต่อเท่านั้น (ใบ 0174) — จำลองวันในอดีตด้วยสวิตช์ของตัวดักนั้น
  perform set_config('app.prospect_contact', 'on', true);
  update dealer_prospects set last_contact_at = now() - interval '20 days' where name = 'ZZTEST-ผู้สนใจเงียบ';
  update dealer_prospects set last_contact_at = now() - interval '13 days' where name = 'ZZTEST-ผู้สนใจเงียบน้อย';
  perform set_config('app.prospect_contact', 'off', true);
  perform ntest.ok((select last_contact_at::date from dealer_prospects where name = 'ZZTEST-ผู้สนใจเงียบ') = (now() - interval '20 days')::date,
    '12) เตรียม: ติดต่อล่าสุด 20 วันก่อน');
  perform public.notifications_scan(เช้านี้ + interval '1 hour');
  perform public.notifications_scan(เช้านี้ + interval '2 hours');
  perform ntest.ok(ntest.n('prospect_followup_due', '%ZZTEST-ผู้สนใจถึงนัด%') = 1
    and (select body from notifications where kind = 'prospect_followup_due' and body like '%ZZTEST-ผู้สนใจถึงนัด%') like '%เลยมา 2 วัน%'
    and (select href from notifications where kind = 'prospect_followup_due' and body like '%ZZTEST-ผู้สนใจถึงนัด%')
        = '/hq/prospects?open=' || (select id from dealer_prospects where name = 'ZZTEST-ผู้สนใจถึงนัด'),
    '12) H7 ถึงกำหนดติดตาม → กระดิ่ง HQ 1 เรื่อง (รัน 2 รอบ) · กดแล้วเปิดแผงผู้สนใจนั้น');
  perform ntest.ok(ntest.n('prospect_idle', '%ZZTEST-ผู้สนใจเงียบ ·%') = 1 and ntest.n('prospect_idle', '%ZZTEST-ผู้สนใจเงียบน้อย%') = 0,
    '12) H7 ไม่ได้ติดต่อ 20 วัน (≥ 14) → แจ้ง · 13 วัน → ไม่แจ้ง');
  perform ntest.ok(ntest.n('prospect_followup_due', '%ZZTEST-ผู้สนใจจบแล้ว%') + ntest.n('prospect_idle', '%ZZTEST-ผู้สนใจจบแล้ว%') = 0,
    '12) H7 ผู้สนใจที่จบแล้วไม่แจ้ง');
  perform ntest.ok((select count(*) from email_outbox where kind in ('prospect_followup_due', 'prospect_idle')) = 0, '12) H7 ไม่มีอีเมล');
  -- นัดใหม่ = เรื่องใหม่ (นัดเดิมแจ้งไปแล้ว)
  update dealer_prospects set follow_up = วันนี้ where name = 'ZZTEST-ผู้สนใจถึงนัด';
  perform public.notifications_scan(เช้านี้ + interval '3 hours');
  perform ntest.ok(ntest.n('prospect_followup_due', '%ZZTEST-ผู้สนใจถึงนัด%') = 2, '12) H7 เลื่อนนัดแล้วถึงนัดใหม่ → แจ้งอีกเรื่อง');

  -- ══ 13) H8 ใบค่าแฟรนไชส์รอคำตอบนาน (เกณฑ์เดิม 7 วัน) ══
  insert into dealer_prospects (name, province, status) values ('ZZTEST-ผู้สนใจรอใบ', 'เชียงใหม่', 'considering') returning id into pid;
  perform ntest.as_hq();
  insert into dealer_package_proposals (prospect_id, package, amount, status, proposed_date, valid_until)
  values (pid, 'standard', 30000, 'sent', วันนี้ - 8, วันนี้ + 20) returning id into pr;
  insert into dealer_package_proposals (prospect_id, package, amount, status, proposed_date, valid_until)
  values (pid, 'exclusive', 30000, 'sent', วันนี้ - 6, วันนี้ + 20);
  perform ntest.as_db();
  perform public.notifications_scan(เช้านี้ + interval '4 hours');
  perform public.notifications_scan(เช้านี้ + interval '5 hours');
  perform ntest.ok((select count(*) from notifications where kind = 'proposal_awaiting' and body like '%ZZTEST-ผู้สนใจรอใบ%') = 1
    and (select href from notifications where kind = 'proposal_awaiting' and body like '%ZZTEST-ผู้สนใจรอใบ%') = '/hq/proposals?open=' || pr,
    '13) H8 ส่งแล้ว 8 วัน (≥ 7) → แจ้ง 1 เรื่อง · 6 วัน → ไม่แจ้ง · กดแล้วเปิดใบนั้น');

  -- ══ 14) H8 เลยวันมีผล → งานตั้งเวลาปิดใบเป็นหมดอายุ → แจ้ง (ตัวดัก) · รันซ้ำไม่ซ้ำ ══
  perform ntest.as_hq();
  insert into dealer_package_proposals (prospect_id, package, amount, status, proposed_date, valid_until)
  values (pid, 'standard', 30000, 'sent', วันนี้ - 3, วันนี้ + 1) returning id into pr;
  perform ntest.as_db();
  -- ใบส่งแล้วแก้วันไม่ได้ (ตัวกัน 0207) — จำลองวันผ่านไปด้วยการปิดตัวกันชั่วคราว (ในทรานแซกชันทดสอบ · rollback)
  alter table dealer_package_proposals disable trigger user;
  update dealer_package_proposals set valid_until = วันนี้ - 1 where id = pr;
  alter table dealer_package_proposals enable trigger user;
  perform public.expire_dealer_proposals();
  perform public.notifications_scan(เช้านี้ + interval '6 hours');
  perform public.expire_dealer_proposals();
  perform ntest.ok((select status from dealer_package_proposals where id = pr) = 'expired'
    and ntest.n('proposal_expired', 'proposal_expired:' || pr) = 1
    and (select count(*) from email_outbox where kind = 'proposal_expired') = 0,
    '14) H8 เลยวันมีผล → ระบบปิดใบเป็นหมดอายุ → กระดิ่ง HQ 1 เรื่อง ไม่มีอีเมล (รันซ้ำไม่ซ้ำ)');

  -- ══ 15) H8 HQ ปิดใบเองเป็นหมดอายุ → ไม่แจ้งคนทำเอง ══
  perform ntest.as_hq();
  insert into dealer_package_proposals (prospect_id, package, amount, status, proposed_date, valid_until)
  values (pid, 'exclusive', 30000, 'sent', วันนี้ - 3, วันนี้ + 1) returning id into pr;
  perform ntest.as_db();
  alter table dealer_package_proposals disable trigger user;
  update dealer_package_proposals set valid_until = วันนี้ - 1 where id = pr;
  alter table dealer_package_proposals enable trigger user;
  perform ntest.as_hq();
  update dealer_package_proposals set status = 'expired', close_reason = 'ZZTEST HQ ปิดเอง' where id = pr;
  perform ntest.as_db();
  perform ntest.ok(ntest.n('proposal_expired', 'proposal_expired:' || pr) = 0, '15) H8 HQ ปิดใบเองเป็นหมดอายุ → ไม่แจ้งตัวเอง');

  -- ══ 16) H3 สรุปคำขอค้างส่งเฉพาะวันที่มีคำขอเกินกำหนดอย่างน้อย 1 ใบ (บอสยืนยัน 22 ต.ค. 69) ══
  update quote_requests set due_at = now() + interval '30 days' where status in ('new', 'pricing');
  perform public.notifications_scan(เช้านี้ + interval '3 days');
  perform ntest.ok(not exists (select 1 from notifications where dedupe_key = 'requests_overdue:' || (วันนี้ + 3))
    and not exists (select 1 from email_outbox where kind = 'requests_overdue' and dedupe_key like 'requests_overdue:' || (วันนี้ + 3) || ':%'),
    '16) H3 วันที่ไม่มีคำขอเกินกำหนด → ไม่มีสรุป (ทั้งกระดิ่งและอีเมล)');

  -- ══ 11) ตัวตรวจ: เขียนแจ้งเตือน/กล่องขาออกได้ทางตัวกลางเท่านั้น ══
  select string_agg(p.proname, ', ') into bad
    from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public'
     and (p.prosrc ~* 'insert\s+into\s+(public\.)?(notifications|email_outbox)\M' or p.prosrc ~* '_email_enqueue_(hq|dealer)\s*\(')
     and p.proname not in ('_notify', '_email_enqueue_hq', '_email_enqueue_dealer');
  perform ntest.ok(bad is null, '11) ไม่มีฟังก์ชันอื่นสร้างแจ้งเตือน/อีเมลนอกตัวกลาง (เจอ: ' || coalesce(bad, '-') || ')');
  perform ntest.ok(not exists (select 1 from notifications n where not exists (select 1 from notification_kinds k where k.kind = n.kind)),
    '11) ทุกแจ้งเตือนเป็นชนิดในตารางกลาง');
  raise notice 'ALL PASS';
end $$;
rollback;
