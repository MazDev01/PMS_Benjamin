-- ── ล้างข้อมูลของการทดลองใช้เว็บ (tests/prod-live/trial/trial.ts) — รันก่อน tests/prod-live/cleanup.sql ──────────────
--   ลบเฉพาะ: สาขา ZZU ที่สร้างจากขั้น H5 (ชื่อขึ้นต้น ZZTEST-ทดลอง) + บัญชีเข้าระบบของสาขานั้น
--            ผู้สนใจเป็นดีลเลอร์ชื่อขึ้นต้น ZZTEST-ทดลอง (ใบค่าแฟรนไชส์/การชำระ/บันทึกการติดต่อ ลบตาม FK)
--            ลีดทดลองที่อาจค้างนอกสาขา ZZT (ชื่อบริษัทขึ้นต้น ZZTEST-ทดลอง)
--   ด่านกันพลาด: สาขา ZZU ที่ชื่อไม่ขึ้นต้น ZZTEST-ทดลอง = ยกเลิกทั้งหมด · ทรานแซกชันเดียว
begin;
do $$ begin
  if exists (select 1 from public.dealers where code = 'ZZU' and name not like 'ZZTEST-ทดลอง%') then
    raise exception 'ZZU ไม่ใช่สาขาจากการทดลอง — ยกเลิก';
  end if;
end $$;
alter table public.hq_quotes disable trigger hq_quotes_lock_sent;
alter table public.quotations disable trigger quotations_no_delete_won;
alter table public.quotations disable trigger trg_price_history_append_only;
create temp table _ลบสาขา as select code from public.dealers where code = 'ZZU' and name like 'ZZTEST-ทดลอง%';
create temp table _ลบผู้ใช้ as select id from public.profiles where dealer_code in (select code from _ลบสาขา);
delete from public.email_outbox where ref_table = 'quote_requests' and ref_id in (select id::text from public.quote_requests where dealer_code in (select code from _ลบสาขา));
delete from public.quotations where dealer_code in (select code from _ลบสาขา);
delete from public.hq_quotes where request_id in (select id from public.quote_requests where dealer_code in (select code from _ลบสาขา));
update public.quote_requests set supersedes_id = null, root_id = null where dealer_code in (select code from _ลบสาขา);
delete from public.quote_request_events where request_id in (select id from public.quote_requests where dealer_code in (select code from _ลบสาขา));
delete from public.quote_requests where dealer_code in (select code from _ลบสาขา);
delete from public.files where dealer_code in (select code from _ลบสาขา);
delete from public.customer_notes where dealer_code in (select code from _ลบสาขา);
delete from public.appointments where dealer_code in (select code from _ลบสาขา);
delete from public.leads where dealer_code in (select code from _ลบสาขา);
delete from public.customers where dealer_code in (select code from _ลบสาขา);
delete from public.dealer_lead_rules where dealer_code in (select code from _ลบสาขา);
delete from public.responsible_persons where dealer_code in (select code from _ลบสาขา);
delete from public.dealer_account_changes where dealer_code in (select code from _ลบสาขา);
delete from public.dealer_account_requests where dealer_code in (select code from _ลบสาขา);
delete from public.dealer_prospects where name like 'ZZTEST-ทดลอง%';
delete from public.profiles where id in (select id from _ลบผู้ใช้);
delete from auth.users where id in (select id from _ลบผู้ใช้);
delete from public.dealers where code in (select code from _ลบสาขา);
-- ลีดทดลองที่ค้างนอกสาขาทดสอบ (เช่น ลีดของ HQ ที่ยังไม่ได้โอน)
delete from public.leads where company like 'ZZTEST-ทดลอง%' and dealer_code not in ('ZZT');
alter table public.hq_quotes enable trigger hq_quotes_lock_sent;
alter table public.quotations enable trigger quotations_no_delete_won;
alter table public.quotations enable trigger trg_price_history_append_only;
commit;
