-- ── ล้างข้อมูลของทดสอบ flow บนเว็บจริง (สาขา ZZT + บัญชี live-*@example.test เท่านั้น) ──────────────
-- รันหลัง run.mjs files · ทรานแซกชันเดียว · ปลดตัวกันลบชั่วคราวแล้วเปิดคืนในทรานแซกชันเดียวกัน
-- ด่านกันพลาด: ถ้าสาขา ZZT ไม่ใช่สาขาทดสอบ (ชื่อไม่ตรง) → ยกเลิกทั้งหมด
begin;
do $$ begin
  if exists (select 1 from public.dealers where code = 'ZZT' and name <> 'สาขาทดสอบชั่วคราว (ลบทิ้ง)') then
    raise exception 'ZZT ไม่ใช่สาขาทดสอบ — ยกเลิก';
  end if;
end $$;
alter table public.hq_quotes disable trigger hq_quotes_lock_sent;
alter table public.quotations disable trigger quotations_no_delete_won;
alter table public.quotations disable trigger trg_price_history_append_only;
delete from public.email_outbox
 where (ref_table = 'quote_requests' and ref_id in (select id::text from public.quote_requests where dealer_code = 'ZZT'))
    or to_email like 'live-%@example.test';
delete from public.quotations where dealer_code = 'ZZT';
delete from public.hq_quotes where request_id in (select id from public.quote_requests where dealer_code = 'ZZT');
update public.quote_requests set supersedes_id = null, root_id = null where dealer_code = 'ZZT';
delete from public.quote_request_events where request_id in (select id from public.quote_requests where dealer_code = 'ZZT');
delete from public.quote_requests where dealer_code = 'ZZT';
delete from public.files where dealer_code = 'ZZT';
delete from public.customer_notes where dealer_code = 'ZZT';
delete from public.appointments where dealer_code = 'ZZT';
delete from public.leads where dealer_code = 'ZZT';
delete from public.customers where dealer_code = 'ZZT';
delete from public.quote_counters where dealer_code = 'ZZT';
delete from public.entity_counters where dealer_code = 'ZZT';
delete from public.dealer_settings where dealer_code = 'ZZT';
delete from public.dealer_lead_rules where dealer_code = 'ZZT';
delete from public.responsible_persons where dealer_code = 'ZZT';
delete from public.dealer_login_secrets where dealer_code = 'ZZT';
delete from public.profiles where id in (select id from auth.users where email like 'live-%@example.test');
delete from auth.users where email like 'live-%@example.test';
delete from public.dealers where code = 'ZZT';
alter table public.hq_quotes enable trigger hq_quotes_lock_sent;
alter table public.quotations enable trigger quotations_no_delete_won;
alter table public.quotations enable trigger trg_price_history_append_only;
-- เลขใบ HQ อิงเลขคำขอ (HQ-ปี-ลำดับคำขอ) — ตารางที่ว่างหลังล้าง ตั้งลำดับกลับไปเริ่ม 1 (ใบจริงใบแรกจะได้ 00001)
do $$ declare t text; n bigint; begin
  foreach t in array array['quote_requests', 'hq_quotes', 'quote_request_events', 'email_outbox', 'files'] loop
    execute format('select count(*) from public.%I', t) into n;
    if n = 0 and pg_get_serial_sequence('public.' || t, 'id') is not null then
      perform setval(pg_get_serial_sequence('public.' || t, 'id'), 1, false);
    end if;
  end loop;
end $$;
commit;
