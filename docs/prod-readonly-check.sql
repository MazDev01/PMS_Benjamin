-- ── ตรวจระบบจริงแบบอ่านอย่างเดียว ก่อนขึ้นระบบ (ช่วงที่ 1 · บอสสั่ง 15 ต.ค. 69) ───────────────────────────────
-- วิธีใช้: Supabase ของระบบจริง → SQL Editor → วางทั้งไฟล์ → Run → คัดลอกผล "ช่องเดียว" ที่ได้ ส่งกลับมา
-- อ่านอย่างเดียว: มีแต่ SELECT ไม่มีคำสั่งแก้ข้อมูล/สิทธิ์ · ผลเป็นตัวเลขและชื่อสิทธิ์/ฟังก์ชัน/ตารางเท่านั้น ไม่มีข้อมูลลูกค้า
--
-- ส่วนในผล:
--   รุ่นPostgres          (ก่อนขึ้นระบบจริง ข้อ 3) รุ่นฐานจริง — ใช้ล็อกรุ่นของฐานในเครื่องให้ตรง
--   ใบล่าสุดบนระบบจริง     ควรเป็น 0181 (ยังไม่ได้ลง 0182–0211)
--   ลีดHQ                 (ข้อ 9) ลูกค้าเป้าหมายใต้รหัส HQ · "โอนไม่ได้" = ยังเปิดอยู่และ มีใบเสนอราคา หรือ ผูกลูกค้าแล้ว
--                         (คำขอราคายังไม่มีบนระบบจริง — ตารางมาในใบ 0183 จึงเป็น 0 แน่นอน)
--   dealers_directory     (ข้อ 0) สิทธิ์เขียนของผู้ไม่ล็อกอิน/ผู้ล็อกอิน
--   สิทธิ์                 (ข้อ 3) ผลอ่านสิทธิ์ทั้งหมด — ผมแยกส่วนนี้ไปตรวจด้วย scripts/db-audit-grants.mjs --actual
select json_build_object(
  'รุ่นPostgres', current_setting('server_version'),
  'ใบล่าสุดบนระบบจริง', (select max(version) from supabase_migrations.schema_migrations),
  'ลีดHQ', (
    with hq as (select l.*, l.status::text not in ('PAID', 'CANCELLED') as เปิด,
                       exists (select 1 from public.quotations q where q.dealer_code = 'HQ' and q.deal_id = l.num_id) as มีใบ
                  from public.leads l where l.dealer_code = 'HQ')
    select json_build_object(
      'ทั้งหมด', count(*),
      'ปิดแล้ว', count(*) filter (where not เปิด),
      'ยังเปิด', count(*) filter (where เปิด),
      'โอนไม่ได้_รวม', count(*) filter (where เปิด and (มีใบ or customer_id is not null)),
      'โอนไม่ได้_มีใบเสนอราคา', count(*) filter (where เปิด and มีใบ),
      'โอนไม่ได้_ผูกลูกค้าแล้ว', count(*) filter (where เปิด and customer_id is not null),
      'โอนไม่ได้_มีคำขอราคา', 0,
      'ไม่มีจังหวัด_เข้าคิวรอ', count(*) filter (where เปิด and btrim(coalesce(province, '')) = ''))
    from hq),
  'dealers_directory', (
    select json_object_agg(r, (select coalesce(string_agg(pv, ',' order by pv), '')
                                 from unnest(array['DELETE','INSERT','TRUNCATE','UPDATE']) pv
                                where has_table_privilege(r, 'public.dealers_directory'::regclass, pv)))
      from unnest(array['anon', 'authenticated']) r),
  'สิทธิ์', json_build_object(
  'functions', (select coalesce(json_agg(json_build_object(
    'f', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
    'anon', has_function_privilege('anon', p.oid, 'execute'),
    'authenticated', has_function_privilege('authenticated', p.oid, 'execute'),
    'service_role', has_function_privilege('service_role', p.oid, 'execute'),
    'definer', p.prosecdef) order by p.proname, pg_get_function_identity_arguments(p.oid)), '[]'::json)
  from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'),
  'relations', (select coalesce(json_agg(json_build_object(
    'r', c.relname, 'kind', c.relkind, 'rls', c.relrowsecurity,
    'anon', (select coalesce(string_agg(pv, ',' order by pv), '')
       from unnest(case when c.relkind = 'S' then array['SELECT','UPDATE','USAGE']
                        else array['DELETE','INSERT','REFERENCES','SELECT','TRIGGER','TRUNCATE','UPDATE'] end) pv
      where case when c.relkind = 'S' then has_sequence_privilege('anon', c.oid, pv)
                 else has_table_privilege('anon', c.oid, pv) end),
    'authenticated', (select coalesce(string_agg(pv, ',' order by pv), '')
       from unnest(case when c.relkind = 'S' then array['SELECT','UPDATE','USAGE']
                        else array['DELETE','INSERT','REFERENCES','SELECT','TRIGGER','TRUNCATE','UPDATE'] end) pv
      where case when c.relkind = 'S' then has_sequence_privilege('authenticated', c.oid, pv)
                 else has_table_privilege('authenticated', c.oid, pv) end),
    'service_role', (select coalesce(string_agg(pv, ',' order by pv), '')
       from unnest(case when c.relkind = 'S' then array['SELECT','UPDATE','USAGE']
                        else array['DELETE','INSERT','REFERENCES','SELECT','TRIGGER','TRUNCATE','UPDATE'] end) pv
      where case when c.relkind = 'S' then has_sequence_privilege('service_role', c.oid, pv)
                 else has_table_privilege('service_role', c.oid, pv) end)) order by c.relname), '[]'::json)
  from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p','v','m','S')),
  'columns',   (select coalesce(json_agg(json_build_object('c', q.c, 'role', q.r, 'privs', q.pvs) order by q.c, q.r), '[]'::json)
  from (select c.relname || '.' || a.attname as c, r,
               (select string_agg(pv, ',' order by pv) from unnest(array['INSERT','REFERENCES','SELECT','UPDATE']) pv
                 where has_column_privilege(r, c.oid, a.attnum, pv) and not has_table_privilege(r, c.oid, pv)) as pvs
          from pg_class c
          join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
         cross join unnest(array['anon','authenticated','service_role']) r
         where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p','v','m')) q
 where q.pvs is not null))
);
