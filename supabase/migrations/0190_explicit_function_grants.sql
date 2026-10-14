-- ── สิทธิ์เรียกคำสั่งทุกตัวใน public: กำหนดให้ชัด ไม่พึ่งค่าตั้งต้นของรุ่นฐานข้อมูล ──────────────────────
--
-- ที่มา (13 ต.ค. 69): ฐานที่สร้างจากใบชุดเดียวกัน 189 ใบ ได้สิทธิ์เรียกคำสั่งไม่เหมือนกันตามรุ่นของฐาน
--   รุ่นเก่า (Postgres 17.6 ของ Supabase): คำสั่งใหม่ได้สิทธิ์ผ่าน public ทางเดียว
--   รุ่นใหม่ (17.11):                       คำสั่งใหม่ได้สิทธิ์ตรงกับ anon / authenticated / service_role ด้วย
--   ใบเดิมหลายใบเขียนแค่ "revoke … from public" — บนรุ่นใหม่ คนที่ยังไม่เข้าระบบจึงยังเรียกคำสั่งนั้นได้
--   (พบคำสั่งสิทธิ์สูง 4 ตัว: delete_customer_cascade · hq_customers_page · can_price_quotes · catalog_price_hidden
--    ทุกตัวยังถูกการตรวจสิทธิ์ข้างในคำสั่งปฏิเสธ — ไม่พบข้อมูลรั่ว แต่ชั้นสิทธิ์เรียกหลวมกว่าที่ใบตั้งใจ)
--   กลับกัน บนรุ่นเก่า ฝั่งเซิร์ฟเวอร์เรียกคำสั่งที่ถูกถอน public ไม่ได้ (บั๊ก 503 ของใบ 0188)
--
-- แก้: ถอนสิทธิ์เรียกของทุกคำสั่งจากทุกกลุ่มก่อน แล้วให้คืนตามเจตนา — ผลเหมือนกันทุกรุ่นของฐาน
--   ผู้ใช้ที่เข้าระบบ (authenticated): คำสั่งที่หน้าเว็บเรียก · ที่ใบเดิมให้ไว้ชัด · ที่กฎรายแถว/มุมมอง/คำสั่งสิทธิ์ผู้เรียกใช้
--   ฝั่งเซิร์ฟเวอร์ (service_role):   คำสั่งที่โค้ดฝั่งเซิร์ฟเวอร์เรียก · ที่มุมมอง/ตัวดัก/ดัชนีใช้ตอนฝั่งเซิร์ฟเวอร์อ่านเขียนตาราง
--   คนที่ยังไม่เข้าระบบ (anon):        ไม่ให้เลย (ไม่มีรายการยกเว้น — หน้าเข้าสู่ระบบไม่เรียกคำสั่งไหน)
--   ตัวดัก และคำสั่งที่ใช้ภายในคำสั่งสิทธิ์สูง: ไม่ให้ใคร
-- รายการข้างล่างสร้างจากฐานจริง + การเรียกในโค้ด (ไม่ได้พิมพ์เอง) · ตัวตรวจ scripts/check-server-rpc-grants.mjs
--   และค่าที่ถ่ายไว้ supabase/tests/expected-function-grants.json กันไม่ให้เพี้ยนภายหลัง
--
-- ⚠️ คำสั่งใหม่ในใบถัดไป: ต้อง revoke all … from public, anon, authenticated, service_role แล้ว grant ตามเจตนาเองทุกครั้ง
--    (ค่าตั้งต้นของ public ถอนรายสคีมาไม่ได้ · ตัวตรวจ scripts/check-new-function-grants.mjs บังคับ)

-- ═══ 1. ค่าตั้งต้นของคำสั่งใหม่ในสคีมานี้: ไม่ให้สิทธิ์ตรงกับสามกลุ่มนี้อีก ═══════════════════════════
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated, service_role;

-- ═══ 2. ถอนของเดิมทั้งหมด ═══════════════════════════════════════════════════════════════
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', f.sig);
  end loop;
end $$;

-- ═══ 3. ผู้ใช้ที่เข้าระบบ + ฝั่งเซิร์ฟเวอร์ (17 ตัว) ═══
-- ถูกเรียกจาก คำสั่งที่ทำงานด้วยสิทธิ์ผู้เรียก
grant execute on function public.audit_actor() to authenticated, service_role;
-- ถูกเรียกจาก กฎรายแถว/มุมมอง
grant execute on function public.auth_dealer() to authenticated, service_role;
-- ถูกเรียกจาก กฎรายแถว/คำสั่งที่ทำงานด้วยสิทธิ์ผู้เรียก
grant execute on function public.auth_role() to authenticated, service_role;
-- ถูกเรียกจาก กฎรายแถว
grant execute on function public.can_write_master() to authenticated, service_role;
-- ถูกเรียกจาก กฎรายแถว
grant execute on function public.can_write_sales() to authenticated, service_role;
-- ถูกเรียกจาก กฎรายแถว
grant execute on function public.catalog_price_hidden() to authenticated, service_role;
-- หน้าเว็บเรียก · โค้ดฝั่งเซิร์ฟเวอร์เรียก (perf-db.mjs)
grant execute on function public.dealer_rollup(integer,date,integer,jsonb) to authenticated, service_role;
-- หน้าเว็บเรียก · โค้ดฝั่งเซิร์ฟเวอร์เรียก (perf-db.mjs)
grant execute on function public.hq_alerts(date,integer,jsonb,integer,integer,integer,integer) to authenticated, service_role;
-- ใบเดิมให้สิทธิ์ผู้ใช้ไว้ชัด · ถูกเรียกจาก คำสั่งที่ทำงานด้วยสิทธิ์ผู้เรียก
grant execute on function public.is_account_active() to authenticated, service_role;
-- ถูกเรียกจาก กฎรายแถว/มุมมอง
grant execute on function public.is_hq() to authenticated, service_role;
-- ใบเดิมให้สิทธิ์ผู้ใช้ไว้ชัด · ถูกเรียกจาก กฎรายแถว
grant execute on function public.is_own_identity(text) to authenticated, service_role;
-- ถูกเรียกจาก คำสั่งที่ทำงานด้วยสิทธิ์ผู้เรียก/ดัชนี
grant execute on function public.lead_dedupe_key(text,text) to authenticated, service_role;
-- ถูกเรียกจาก คำสั่งที่ทำงานด้วยสิทธิ์ผู้เรียก
grant execute on function public.lead_last_activity_date(jsonb) to authenticated, service_role;
-- หน้าเว็บเรียก · โค้ดฝั่งเซิร์ฟเวอร์เรียก (perf-db.mjs, perf-rls.mjs)
grant execute on function public.leads_page(integer,integer,text,text[],text,text,text,text,date,date,boolean,date,integer,jsonb,boolean) to authenticated, service_role;
-- ถูกเรียกจาก กฎรายแถว/มุมมอง/คำสั่งที่ทำงานด้วยสิทธิ์ผู้เรียก
grant execute on function public.must_set_password() to authenticated, service_role;
-- ถูกเรียกจาก คำสั่งที่ทำงานด้วยสิทธิ์ผู้เรียก
grant execute on function public.parse_baht(text) to authenticated, service_role;
-- ถูกเรียกจาก คำสั่งที่ทำงานด้วยสิทธิ์ผู้เรียก
grant execute on function public.parse_thai_date(text) to authenticated, service_role;

-- ═══ 4. ผู้ใช้ที่เข้าระบบเท่านั้น (32 ตัว) ═══
-- หน้าเว็บเรียก · ใบเดิมให้สิทธิ์ผู้ใช้ไว้ชัด
grant execute on function public.check_own_rate_limit(text,integer,integer) to authenticated;
-- หน้าเว็บเรียก · ใบเดิมให้สิทธิ์ผู้ใช้ไว้ชัด
grant execute on function public.close_won_quotation(text,bigint,text,text,boolean,jsonb) to authenticated;
-- หน้าเว็บเรียก · ใบเดิมให้สิทธิ์ผู้ใช้ไว้ชัด
grant execute on function public.create_quotation(text,text,jsonb) to authenticated;
-- หน้าเว็บเรียก
grant execute on function public.dashboard_quote_summary(date,date,text) to authenticated;
-- หน้าเว็บเรียก · ใบเดิมให้สิทธิ์ผู้ใช้ไว้ชัด
grant execute on function public.delete_customer_cascade(bigint) to authenticated;
-- หน้าเว็บเรียก · ใบเดิมให้สิทธิ์ผู้ใช้ไว้ชัด
grant execute on function public.expire_quotations(date,integer) to authenticated;
-- หน้าเว็บเรียก · ใบเดิมให้สิทธิ์ผู้ใช้ไว้ชัด
grant execute on function public.hq_customers_filter_options() to authenticated;
-- หน้าเว็บเรียก
grant execute on function public.hq_customers_page(text,text,text[],text,date,date,integer,integer) to authenticated;
-- หน้าเว็บเรียก
grant execute on function public.hq_quotations_summary(text,text[],text[],text,date,date,date,text[]) to authenticated;
-- ใบเดิมให้สิทธิ์ผู้ใช้ไว้ชัด
grant execute on function public.hq_quote_copy_from(bigint,bigint) to authenticated;
-- ใบเดิมให้สิทธิ์ผู้ใช้ไว้ชัด
grant execute on function public.hq_quote_save(bigint,jsonb,date,text) to authenticated;
-- ใบเดิมให้สิทธิ์ผู้ใช้ไว้ชัด
grant execute on function public.hq_quote_send(bigint) to authenticated;
-- หน้าเว็บเรียก
grant execute on function public.lead_summary(text[],text,text,text,text,text,date,date) to authenticated;
-- หน้าเว็บเรียก
grant execute on function public.network_customer_summary(text,date,date) to authenticated;
-- หน้าเว็บเรียก
grant execute on function public.network_quote_range(date,date,text) to authenticated;
-- หน้าเว็บเรียก · ใบเดิมให้สิทธิ์ผู้ใช้ไว้ชัด
grant execute on function public.next_entity_id(text,text) to authenticated;
-- ใบเดิมให้สิทธิ์ผู้ใช้ไว้ชัด
grant execute on function public.next_quote_no(text,text) to authenticated;
-- ใบเดิมให้สิทธิ์ผู้ใช้ไว้ชัด
grant execute on function public.package_annual_target(text,text) to authenticated;
-- หน้าเว็บเรียก
grant execute on function public.quotation_salesperson(text,text) to authenticated;
-- ใบเดิมให้สิทธิ์ผู้ใช้ไว้ชัด
grant execute on function public.quote_request_accept(bigint,uuid) to authenticated;
-- ใบเดิมให้สิทธิ์ผู้ใช้ไว้ชัด
grant execute on function public.quote_request_cancel(bigint,text,boolean) to authenticated;
-- ใบเดิมให้สิทธิ์ผู้ใช้ไว้ชัด
grant execute on function public.quote_request_duplicates(bigint) to authenticated;
-- ใบเดิมให้สิทธิ์ผู้ใช้ไว้ชัด
grant execute on function public.quote_request_reprice(bigint,text,text) to authenticated;
-- ใบเดิมให้สิทธิ์ผู้ใช้ไว้ชัด
grant execute on function public.quote_request_submit(integer,text,text,numeric,text,text) to authenticated;
-- หน้าเว็บเรียก · ใบเดิมให้สิทธิ์ผู้ใช้ไว้ชัด
grant execute on function public.reconcile_customer_won_total(bigint) to authenticated;
-- หน้าเว็บเรียก · ใบเดิมให้สิทธิ์ผู้ใช้ไว้ชัด
grant execute on function public.relink_customer_quotes(text,bigint,text,boolean) to authenticated;
-- หน้าเว็บเรียก · ใบเดิมให้สิทธิ์ผู้ใช้ไว้ชัด
grant execute on function public.replace_responsible_persons(text,jsonb) to authenticated;
-- หน้าเว็บเรียก · ใบเดิมให้สิทธิ์ผู้ใช้ไว้ชัด
grant execute on function public.restore_hq_settings(jsonb,jsonb,jsonb,jsonb,jsonb) to authenticated;
-- หน้าเว็บเรียก · ใบเดิมให้สิทธิ์ผู้ใช้ไว้ชัด
grant execute on function public.save_dealers(jsonb) to authenticated;
-- หน้าเว็บเรียก · ใบเดิมให้สิทธิ์ผู้ใช้ไว้ชัด
grant execute on function public.set_quotation_status_reconciled(text,text) to authenticated;
-- หน้าเว็บเรียก
grant execute on function public.unassigned_leads(date,integer,jsonb,text[],text,text,text,text,date,date) to authenticated;
-- หน้าเว็บเรียก · ใบเดิมให้สิทธิ์ผู้ใช้ไว้ชัด
grant execute on function public.upsert_customer_for_company(text,jsonb) to authenticated;

-- ═══ 5. ฝั่งเซิร์ฟเวอร์เท่านั้น (4 ตัว) ═══
-- โค้ดฝั่งเซิร์ฟเวอร์เรียก (rateLimit.ts)
grant execute on function public.check_rate_limit(text,integer,integer) to service_role;
-- โค้ดฝั่งเซิร์ฟเวอร์เรียก (route.ts)
grant execute on function public.delete_dealer_atomic(text) to service_role;
-- โค้ดฝั่งเซิร์ฟเวอร์เรียก (route.ts)
grant execute on function public.move_dealer_data_atomic(text,text) to service_role;
-- โค้ดฝั่งเซิร์ฟเวอร์เรียก (restore.mjs)
grant execute on function public.restore_sync_sequences() to service_role;

-- ═══ 6. ไม่ให้ใคร (47 ตัว) — บันทึกไว้ให้เห็นว่าตั้งใจ ไม่ใช่ลืม ═══
--   dealer_package_proposals_before_delete()  — ตัวดัก (trigger) — ฐานเรียกเองตอนมีการเขียนข้อมูล ไม่ตรวจสิทธิ์เรียกของผู้ใช้ ไม่มีใครต้องเรียกตรง
--   dealer_package_proposals_before_write()  — ตัวดัก (trigger) — ฐานเรียกเองตอนมีการเขียนข้อมูล ไม่ตรวจสิทธิ์เรียกของผู้ใช้ ไม่มีใครต้องเรียกตรง
--   dealer_package_proposals_log()  — ตัวดัก (trigger) — ฐานเรียกเองตอนมีการเขียนข้อมูล ไม่ตรวจสิทธิ์เรียกของผู้ใช้ ไม่มีใครต้องเรียกตรง
--   dealer_prospect_activities_after_contact()  — ตัวดัก (trigger) — ฐานเรียกเองตอนมีการเขียนข้อมูล ไม่ตรวจสิทธิ์เรียกของผู้ใช้ ไม่มีใครต้องเรียกตรง
--   dealer_prospect_activities_before_insert()  — ตัวดัก (trigger) — ฐานเรียกเองตอนมีการเขียนข้อมูล ไม่ตรวจสิทธิ์เรียกของผู้ใช้ ไม่มีใครต้องเรียกตรง
--   dealer_prospects_insert_clean()  — ตัวดัก (trigger) — ฐานเรียกเองตอนมีการเขียนข้อมูล ไม่ตรวจสิทธิ์เรียกของผู้ใช้ ไม่มีใครต้องเรียกตรง
--   dealer_prospects_log()  — ตัวดัก (trigger) — ฐานเรียกเองตอนมีการเขียนข้อมูล ไม่ตรวจสิทธิ์เรียกของผู้ใช้ ไม่มีใครต้องเรียกตรง
--   dealer_prospects_stage_guard()  — ตัวดัก (trigger) — ฐานเรียกเองตอนมีการเขียนข้อมูล ไม่ตรวจสิทธิ์เรียกของผู้ใช้ ไม่มีใครต้องเรียกตรง
--   dealer_prospects_touch()  — ตัวดัก (trigger) — ฐานเรียกเองตอนมีการเขียนข้อมูล ไม่ตรวจสิทธิ์เรียกของผู้ใช้ ไม่มีใครต้องเรียกตรง
--   dealers_package_target()  — ตัวดัก (trigger) — ฐานเรียกเองตอนมีการเขียนข้อมูล ไม่ตรวจสิทธิ์เรียกของผู้ใช้ ไม่มีใครต้องเรียกตรง
--   fill_price_history()  — ตัวดัก (trigger) — ฐานเรียกเองตอนมีการเขียนข้อมูล ไม่ตรวจสิทธิ์เรียกของผู้ใช้ ไม่มีใครต้องเรียกตรง
--   guard_dealer_file_ext()  — ตัวดัก (trigger) — ฐานเรียกเองตอนมีการเขียนข้อมูล ไม่ตรวจสิทธิ์เรียกของผู้ใช้ ไม่มีใครต้องเรียกตรง
--   guard_last_super_admin()  — ตัวดัก (trigger) — ฐานเรียกเองตอนมีการเขียนข้อมูล ไม่ตรวจสิทธิ์เรียกของผู้ใช้ ไม่มีใครต้องเรียกตรง
--   guard_price_history_append_only()  — ตัวดัก (trigger) — ฐานเรียกเองตอนมีการเขียนข้อมูล ไม่ตรวจสิทธิ์เรียกของผู้ใช้ ไม่มีใครต้องเรียกตรง
--   guard_profile_dealer_exists()  — ตัวดัก (trigger) — ฐานเรียกเองตอนมีการเขียนข้อมูล ไม่ตรวจสิทธิ์เรียกของผู้ใช้ ไม่มีใครต้องเรียกตรง
--   guard_profile_privilege()  — ตัวดัก (trigger) — ฐานเรียกเองตอนมีการเขียนข้อมูล ไม่ตรวจสิทธิ์เรียกของผู้ใช้ ไม่มีใครต้องเรียกตรง
--   guard_quotation_total_matches_boq()  — ตัวดัก (trigger) — ฐานเรียกเองตอนมีการเขียนข้อมูล ไม่ตรวจสิทธิ์เรียกของผู้ใช้ ไม่มีใครต้องเรียกตรง
--   hq_quotes_lock_sent()  — ตัวดัก (trigger) — ฐานเรียกเองตอนมีการเขียนข้อมูล ไม่ตรวจสิทธิ์เรียกของผู้ใช้ ไม่มีใครต้องเรียกตรง
--   hq_quotes_set_recipient()  — ตัวดัก (trigger) — ฐานเรียกเองตอนมีการเขียนข้อมูล ไม่ตรวจสิทธิ์เรียกของผู้ใช้ ไม่มีใครต้องเรียกตรง
--   hq_recruit_settings_sync_targets()  — ตัวดัก (trigger) — ฐานเรียกเองตอนมีการเขียนข้อมูล ไม่ตรวจสิทธิ์เรียกของผู้ใช้ ไม่มีใครต้องเรียกตรง
--   hq_recruit_settings_touch()  — ตัวดัก (trigger) — ฐานเรียกเองตอนมีการเขียนข้อมูล ไม่ตรวจสิทธิ์เรียกของผู้ใช้ ไม่มีใครต้องเรียกตรง
--   leads_hq_pricing_guard()  — ตัวดัก (trigger) — ฐานเรียกเองตอนมีการเขียนข้อมูล ไม่ตรวจสิทธิ์เรียกของผู้ใช้ ไม่มีใครต้องเรียกตรง
--   leads_new_lead_guard()  — ตัวดัก (trigger) — ฐานเรียกเองตอนมีการเขียนข้อมูล ไม่ตรวจสิทธิ์เรียกของผู้ใช้ ไม่มีใครต้องเรียกตรง
--   log_catalog_change()  — ตัวดัก (trigger) — ฐานเรียกเองตอนมีการเขียนข้อมูล ไม่ตรวจสิทธิ์เรียกของผู้ใช้ ไม่มีใครต้องเรียกตรง
--   log_lead_change()  — ตัวดัก (trigger) — ฐานเรียกเองตอนมีการเขียนข้อมูล ไม่ตรวจสิทธิ์เรียกของผู้ใช้ ไม่มีใครต้องเรียกตรง
--   log_quotation_change()  — ตัวดัก (trigger) — ฐานเรียกเองตอนมีการเขียนข้อมูล ไม่ตรวจสิทธิ์เรียกของผู้ใช้ ไม่มีใครต้องเรียกตรง
--   log_quotation_price_change()  — ตัวดัก (trigger) — ฐานเรียกเองตอนมีการเขียนข้อมูล ไม่ตรวจสิทธิ์เรียกของผู้ใช้ ไม่มีใครต้องเรียกตรง
--   quotations_flow_sync()  — ตัวดัก (trigger) — ฐานเรียกเองตอนมีการเขียนข้อมูล ไม่ตรวจสิทธิ์เรียกของผู้ใช้ ไม่มีใครต้องเรียกตรง
--   quotations_hq_apply_markup()  — ตัวดัก (trigger) — ฐานเรียกเองตอนมีการเขียนข้อมูล ไม่ตรวจสิทธิ์เรียกของผู้ใช้ ไม่มีใครต้องเรียกตรง
--   quotations_hq_link_guard()  — ตัวดัก (trigger) — ฐานเรียกเองตอนมีการเขียนข้อมูล ไม่ตรวจสิทธิ์เรียกของผู้ใช้ ไม่มีใครต้องเรียกตรง
--   quote_requests_log()  — ตัวดัก (trigger) — ฐานเรียกเองตอนมีการเขียนข้อมูล ไม่ตรวจสิทธิ์เรียกของผู้ใช้ ไม่มีใครต้องเรียกตรง
--   set_lead_dates()  — ตัวดัก (trigger) — ฐานเรียกเองตอนมีการเขียนข้อมูล ไม่ตรวจสิทธิ์เรียกของผู้ใช้ ไม่มีใครต้องเรียกตรง
--   set_quotation_date_normalized()  — ตัวดัก (trigger) — ฐานเรียกเองตอนมีการเขียนข้อมูล ไม่ตรวจสิทธิ์เรียกของผู้ใช้ ไม่มีใครต้องเรียกตรง
--   set_quotation_product_line()  — ตัวดัก (trigger) — ฐานเรียกเองตอนมีการเขียนข้อมูล ไม่ตรวจสิทธิ์เรียกของผู้ใช้ ไม่มีใครต้องเรียกตรง
--   sync_customer_won_total()  — ตัวดัก (trigger) — ฐานเรียกเองตอนมีการเขียนข้อมูล ไม่ตรวจสิทธิ์เรียกของผู้ใช้ ไม่มีใครต้องเรียกตรง
--   sync_dealer_name_to_profile()  — ตัวดัก (trigger) — ฐานเรียกเองตอนมีการเขียนข้อมูล ไม่ตรวจสิทธิ์เรียกของผู้ใช้ ไม่มีใครต้องเรียกตรง
--   sync_quotation_items_count()  — ตัวดัก (trigger) — ฐานเรียกเองตอนมีการเขียนข้อมูล ไม่ตรวจสิทธิ์เรียกของผู้ใช้ ไม่มีใครต้องเรียกตรง
--   touch_updated_at()  — ตัวดัก (trigger) — ฐานเรียกเองตอนมีการเขียนข้อมูล ไม่ตรวจสิทธิ์เรียกของผู้ใช้ ไม่มีใครต้องเรียกตรง
--   custom_access_token_hook(jsonb)  — ตัวออกใบผ่าน — ระบบยืนยันตัวตน (supabase_auth_admin) เรียกเท่านั้น สิทธิ์นั้นไม่ถูกแตะ
--   _lead_flow_set_status(text,integer,lead_status,text)  — ใช้ภายในคำสั่งสิทธิ์สูงเท่านั้น (ทำงานด้วยสิทธิ์เจ้าของ) — ไม่มีโค้ดเรียก และไม่ถูกอ้างจากกฎ/มุมมอง/ตัวดัก
--   can_price_quotes()  — ใช้ภายในคำสั่งสิทธิ์สูงเท่านั้น (ทำงานด้วยสิทธิ์เจ้าของ) — ไม่มีโค้ดเรียก และไม่ถูกอ้างจากกฎ/มุมมอง/ตัวดัก
--   customer_rollup()  — ใช้ภายในคำสั่งสิทธิ์สูงเท่านั้น (ทำงานด้วยสิทธิ์เจ้าของ) — ไม่มีโค้ดเรียก และไม่ถูกอ้างจากกฎ/มุมมอง/ตัวดัก
--   hq_version_expired_reason()  — ใช้ภายในคำสั่งสิทธิ์สูงเท่านั้น (ทำงานด้วยสิทธิ์เจ้าของ) — ไม่มีโค้ดเรียก และไม่ถูกอ้างจากกฎ/มุมมอง/ตัวดัก
--   prospect_stage_no(text)  — ใช้ภายในคำสั่งสิทธิ์สูงเท่านั้น (ทำงานด้วยสิทธิ์เจ้าของ) — ไม่มีโค้ดเรียก และไม่ถูกอ้างจากกฎ/มุมมอง/ตัวดัก
--   prospect_status_th(text)  — ใช้ภายในคำสั่งสิทธิ์สูงเท่านั้น (ทำงานด้วยสิทธิ์เจ้าของ) — ไม่มีโค้ดเรียก และไม่ถูกอ้างจากกฎ/มุมมอง/ตัวดัก
--   quote_request_overdue(quote_requests)  — ใช้ภายในคำสั่งสิทธิ์สูงเท่านั้น (ทำงานด้วยสิทธิ์เจ้าของ) — ไม่มีโค้ดเรียก และไม่ถูกอ้างจากกฎ/มุมมอง/ตัวดัก
--   quote_request_sla_days()  — ใช้ภายในคำสั่งสิทธิ์สูงเท่านั้น (ทำงานด้วยสิทธิ์เจ้าของ) — ไม่มีโค้ดเรียก และไม่ถูกอ้างจากกฎ/มุมมอง/ตัวดัก
