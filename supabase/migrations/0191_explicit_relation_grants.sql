-- ── สิทธิ์บนตาราง มุมมอง และตัวนับเลขใน public: กำหนดให้ชัด ไม่พึ่งค่าตั้งต้นของรุ่นฐานข้อมูลหรือไฟล์ตั้งต้น ──────
--
-- ที่มา (13 ต.ค. 69) — เรื่องเดียวกับใบ 0190 แต่เป็นฝั่งตาราง:
--   ฐานบนคลาวด์และฐานในเครื่องรุ่นใหม่ ให้สิทธิ์ตารางใหม่กับ anon / authenticated / service_role เองตั้งแต่ตอนสร้าง
--   ฐานในเครื่องรุ่นเก่าไม่ให้ — จึงต้องมี supabase/seed.sql ที่ "grant all on all tables … " หลังรันใบ
--   แต่บรรทัดนั้นทับการถอนสิทธิ์ที่ใบตั้งใจทำไว้ด้วย: เทียบกับฐานเปล่าแล้วหลวมกว่าใบ 11 ตัว
--   (เช่น hq_login_secrets ที่คนนอกและผู้ใช้ได้สิทธิ์ครบ · quote_requests / hq_quotes ที่ผู้ใช้ได้สิทธิ์เขียนตรง
--    · dealers ที่ผู้ใช้อ่านได้ทั้งตาราง ทั้งที่ใบให้อ่านเฉพาะ 6 คอลัมน์) — กฎรายแถวยังคุมอยู่ และเกิดเฉพาะฐานในเครื่อง
--   ผล: ชุดทดสอบเรื่องสิทธิ์รันกับสิทธิ์ตารางที่หลวมกว่าระบบจริง
--
-- แก้: ถอนสิทธิ์ของสามกลุ่มนี้ออกจากทุกตาราง/มุมมอง/ตัวนับเลขก่อน แล้วให้คืนตามสภาพที่ใบทั้งหมดตั้งใจ
--   (= สภาพของฐานเปล่ารุ่นใหม่ที่สร้างจากใบ 0001–0190 ล้วน ๆ · รายการข้างล่างสร้างจากฐานนั้น ไม่ได้พิมพ์เอง)
--   ใบนี้ "ไม่ได้ทำให้เข้มขึ้น" จากที่ใบเดิมตั้งใจ — แค่ทำให้ทุกฐานได้ผลเดียวกัน · หลังใบนี้ seed.sql ไม่ต้องให้สิทธิ์อะไรอีก
--   ตัวตรวจ scripts/db-audit-grants.mjs + supabase/tests/expected-relation-grants.json กันไม่ให้เพี้ยนภายหลัง

-- ═══ 1. ค่าตั้งต้นของตาราง/ตัวนับเลขใหม่ในสคีมานี้: ให้สามกลุ่มนี้เหมือนฐานบนคลาวด์ (กฎรายแถวเป็นตัวคุม) ═══
--   ตารางที่ต้องจำกัดกว่านี้ ใบที่สร้างตารางต้องถอนสิทธิ์เองเหมือนที่ทำมาตลอด
grant usage on schema public to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;

-- ═══ 2. ถอนของเดิมทั้งหมด (รวมสิทธิ์รายคอลัมน์) ═══════════════════════════════════════════
do $$
declare r record;
begin
  for r in select c.oid::regclass as rel, c.relkind from pg_class c
            where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p','v','m','S') loop
    execute format('revoke all on %s %s from anon, authenticated, service_role',
                   case when r.relkind = 'S' then 'sequence' else 'table' end, r.rel);
  end loop;
  for r in select distinct c.oid::regclass as rel, a.attname from pg_class c
             join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped and a.attacl is not null
            where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p','v','m') loop
    execute format('revoke all (%I) on %s from anon, authenticated, service_role', r.attname, r.rel);
  end loop;
end $$;

-- ═══ 3. เปิดให้ทั้งสามกลุ่ม — กฎรายแถวเป็นตัวคุม (34 ตัว) ═══
grant all on table public.appointments to anon, authenticated, service_role;
grant all on table public.audit_log to anon, authenticated, service_role;
grant all on sequence public.audit_log_id_seq to anon, authenticated, service_role;
grant all on table public.customer_notes to anon, authenticated, service_role;
grant all on sequence public.customer_notes_id_seq to anon, authenticated, service_role;
grant all on table public.customers to anon, authenticated, service_role;
grant all on table public.dealer_account_changes to anon, authenticated, service_role;
grant all on sequence public.dealer_account_changes_id_seq to anon, authenticated, service_role;
grant all on table public.dealer_account_requests to anon, authenticated, service_role;
grant all on sequence public.dealer_account_requests_id_seq to anon, authenticated, service_role;
grant all on table public.dealer_lead_rules to anon, authenticated, service_role;
grant all on sequence public.dealer_package_proposals_id_seq to anon, authenticated, service_role;
grant all on sequence public.dealer_prospect_activities_id_seq to anon, authenticated, service_role;
grant all on sequence public.dealer_prospects_id_seq to anon, authenticated, service_role;
grant all on table public.dealer_settings to anon, authenticated, service_role;
grant all on table public.entity_counters to anon, authenticated, service_role;
grant all on table public.files to anon, authenticated, service_role;
grant all on sequence public.files_id_seq to anon, authenticated, service_role;
grant all on table public.hq_company to anon, authenticated, service_role;
grant all on table public.hq_notif_rules to anon, authenticated, service_role;
grant all on table public.hq_policy to anon, authenticated, service_role;
grant all on sequence public.hq_quotes_id_seq to anon, authenticated, service_role;
grant all on table public.hq_sales_journey to anon, authenticated, service_role;
grant all on table public.hq_targets to anon, authenticated, service_role;
grant all on table public.leads to anon, authenticated, service_role;
grant all on table public.master_catalog to anon, authenticated, service_role;
grant all on table public.profiles to anon, authenticated, service_role;
grant all on table public.quotations to anon, authenticated, service_role;
grant all on table public.quote_counters to anon, authenticated, service_role;
grant all on sequence public.quote_request_events_id_seq to anon, authenticated, service_role;
grant all on sequence public.quote_requests_id_seq to anon, authenticated, service_role;
grant all on table public.rate_limits to anon, authenticated, service_role;
grant all on table public.responsible_persons to anon, authenticated, service_role;
grant all on sequence public.responsible_persons_id_seq to anon, authenticated, service_role;

-- ═══ 4. จำกัดกว่าค่าตั้งต้น ตามที่ใบเดิมถอนสิทธิ์ไว้ (14 ตัว) ═══
-- ตาราง dealer_login_secrets — anon: ไม่มี · authenticated: ไม่มี · service_role: ทั้งหมด
grant all on table public.dealer_login_secrets to service_role;
-- ตาราง dealer_package_proposals — anon: ไม่มี · authenticated: ทั้งหมด · service_role: ทั้งหมด
grant all on table public.dealer_package_proposals to authenticated;
grant all on table public.dealer_package_proposals to service_role;
-- ตาราง dealer_proposal_counters — anon: ไม่มี · authenticated: ไม่มี · service_role: ทั้งหมด
grant all on table public.dealer_proposal_counters to service_role;
-- ตาราง dealer_prospect_activities — anon: ไม่มี · authenticated: insert,select · service_role: ทั้งหมด
grant insert, select on table public.dealer_prospect_activities to authenticated;
grant all on table public.dealer_prospect_activities to service_role;
-- ตาราง dealer_prospects — anon: ไม่มี · authenticated: ทั้งหมด · service_role: ทั้งหมด
grant all on table public.dealer_prospects to authenticated;
grant all on table public.dealer_prospects to service_role;
-- ตาราง dealers — anon: ทั้งหมด · authenticated: delete,insert,references,trigger,truncate,update · service_role: ทั้งหมด
grant all on table public.dealers to anon;
grant delete, insert, references, trigger, truncate, update on table public.dealers to authenticated;
grant all on table public.dealers to service_role;
grant select (code, created_at, name, province, region, status) on table public.dealers to authenticated;
-- มุมมอง dealers_directory — anon: ไม่มี · authenticated: select · service_role: select
--   มุมมองอ่านอย่างเดียวเสมอ (14 ต.ค. 69 · ใบ 0199): ให้สิทธิ์ทั้งหมด = เขียนผ่านมุมมองข้ามกฎรายแถวของตารางจริงได้
grant select on table public.dealers_directory to authenticated;
grant select on table public.dealers_directory to service_role;
-- ตาราง hq_login_secrets — anon: ไม่มี · authenticated: ไม่มี · service_role: ทั้งหมด
grant all on table public.hq_login_secrets to service_role;
-- ตาราง hq_quotes — anon: ไม่มี · authenticated: references,select,trigger · service_role: ทั้งหมด
grant references, select, trigger on table public.hq_quotes to authenticated;
grant all on table public.hq_quotes to service_role;
-- ตาราง hq_recruit_settings — anon: ไม่มี · authenticated: ทั้งหมด · service_role: ทั้งหมด
grant all on table public.hq_recruit_settings to authenticated;
grant all on table public.hq_recruit_settings to service_role;
-- มุมมอง master_catalog_public — anon: ไม่มี · authenticated: select · service_role: select
--   มุมมองอ่านอย่างเดียวเสมอ (14 ต.ค. 69 · ใบ 0199): ให้สิทธิ์ทั้งหมด = เขียนผ่านมุมมองข้ามกฎรายแถวของตารางจริงได้
grant select on table public.master_catalog_public to authenticated;
grant select on table public.master_catalog_public to service_role;
-- ตาราง quote_pricing_roles — anon: ไม่มี · authenticated: references,select,trigger · service_role: ทั้งหมด
grant references, select, trigger on table public.quote_pricing_roles to authenticated;
grant all on table public.quote_pricing_roles to service_role;
-- ตาราง quote_request_events — anon: ไม่มี · authenticated: references,select,trigger · service_role: ทั้งหมด
grant references, select, trigger on table public.quote_request_events to authenticated;
grant all on table public.quote_request_events to service_role;
-- ตาราง quote_requests — anon: ไม่มี · authenticated: references,select,trigger · service_role: ทั้งหมด
grant references, select, trigger on table public.quote_requests to authenticated;
grant all on table public.quote_requests to service_role;
