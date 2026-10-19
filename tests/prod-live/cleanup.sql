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
delete from public.dealer_account_changes where dealer_code = 'ZZT';   -- ตั้งรหัสครั้งแรก (first-login-check.mjs) บันทึกประวัติไว้
delete from public.dealer_account_requests where dealer_code = 'ZZT';
delete from public.profiles where id in (select id from auth.users where email like 'live-%@example.test');
delete from auth.users where email like 'live-%@example.test';
delete from public.dealers where code = 'ZZT';
alter table public.hq_quotes enable trigger hq_quotes_lock_sent;
alter table public.quotations enable trigger quotations_no_delete_won;
alter table public.quotations enable trigger trg_price_history_append_only;
-- ⛔ ห้ามตั้ง/ย้อนตัวนับลำดับ (setval) ที่นี่ — ไฟล์นี้รันกับฐานจริง (บอสสั่ง 19 ต.ค. 69)
--   เดิมตั้งลำดับคำขอ/ใบ HQ/อีเมล/ไฟล์กลับไป 1 เมื่อตารางว่าง (ไว้ให้ใบจริงใบแรกได้ 00001 ก่อนเปิดระบบ)
--   ระบบจริงมีคำขอจริงแล้ว: ย้อนตัวนับ = เลขเอกสารซ้ำกับที่เคยออก · ตัวตรวจ scripts/check-prod-counter-safety.mjs
commit;
