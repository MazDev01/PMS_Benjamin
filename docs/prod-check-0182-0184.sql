-- ── ตรวจว่าใบ 0182–0184 บนระบบจริง "ตรงกับไฟล์ในโค้ด" หรือไม่ — อ่านอย่างเดียว (15 ต.ค. 69) ──────────────────────
-- ที่มา: ผลตรวจช่วงที่ 1 พบระบบจริงอยู่ที่ใบ 0184 (คาดว่า 0181) — ถ้าตอนลงใบเหล่านี้ไฟล์ยังไม่ใช่รุ่นสุดท้าย
--   วันขึ้นระบบ db push จะข้าม 0182–0184 (เลขมีอยู่แล้ว) ส่วนที่ต่างจะไม่ขึ้นเลย
-- วิธีใช้: SQL Editor ของระบบจริง → วางทั้งไฟล์ → Run → คัดลอกผลช่องเดียวส่งกลับ
-- ผล: ค่า md5 ของ "นิยาม" แต่ละชิ้น (ฟังก์ชัน · ตาราง · ตัวดัก · กฎรายแถว · ดัชนี · ค่าสถานะ) — ไม่มีข้อมูลใด ๆ
-- ผมเทียบกับฐานในเครื่องที่สร้างจากใบ 0001–0184 บน Postgres รุ่นเดียวกัน (17.6)
select json_build_object(
  'ใบที่ลงแล้ว', (select json_agg(version order by version) from supabase_migrations.schema_migrations where version >= '0180'),
  'ฟังก์ชัน', (select json_object_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', md5(pg_get_functiondef(p.oid)) order by p.proname)
      from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' and p.proname = any (array[
        '_lead_flow_set_status','can_price_quotes','hq_quote_save','hq_quote_send','hq_quotes_lock_sent','leads_hq_pricing_guard',
        'quotations_flow_sync','quotations_hq_link_guard','quote_request_accept','quote_request_cancel','quote_request_overdue',
        'quote_request_reprice','quote_request_sla_days','quote_request_submit','quote_requests_log','touch_updated_at',
        'dealer_package_proposals_before_write','dealer_package_proposals_log','dealer_prospects_log','dealer_prospects_stage_guard','prospect_status_th'])),
  'ตาราง', (select json_object_agg(c.relname, md5(
        (select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull || ':' || coalesce(pg_get_expr(d.adbin, d.adrelid), ''), ',' order by a.attnum)
           from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
          where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped)
        || '|' || coalesce((select string_agg(pg_get_constraintdef(k.oid), ',' order by k.conname) from pg_constraint k where k.conrelid = c.oid), ''))
        order by c.relname)
      from pg_class c where c.relnamespace = 'public'::regnamespace and c.relname in ('quote_requests','hq_quotes','quote_request_events','quotations','leads')),
  'ตัวดัก', (select json_object_agg(t.tgname, md5(pg_get_triggerdef(t.oid)) order by t.tgname)
      from pg_trigger t where not t.tgisinternal and t.tgrelid in ('public.quote_requests'::regclass, 'public.hq_quotes'::regclass,
        'public.quote_request_events'::regclass, 'public.quotations'::regclass, 'public.leads'::regclass)),
  'กฎรายแถว', (select json_object_agg(p.tablename || '.' || p.policyname, md5(coalesce(p.qual, '') || '|' || coalesce(p.with_check, '') || '|' || p.cmd || '|' || array_to_string(p.roles, ',')) order by p.tablename, p.policyname)
      from pg_policies p where p.schemaname = 'public' and p.tablename in ('quote_requests','hq_quotes','quote_request_events')),
  'ดัชนี', (select json_object_agg(i.indexname, md5(i.indexdef) order by i.indexname)
      from pg_indexes i where i.schemaname = 'public' and i.tablename in ('quote_requests','hq_quotes','quote_request_events','quotations')),
  'ค่าสถานะลีด', (select json_agg(e.enumlabel order by e.enumsortorder) from pg_enum e where e.enumtypid = 'public.lead_status'::regtype)
);
