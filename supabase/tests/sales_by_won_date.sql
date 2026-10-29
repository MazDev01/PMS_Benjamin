-- ── ข้อทดสอบใบ 0260: ยอดขายทุกหน้านับตามวันที่ลูกค้าตอบรับ (บอสตัดสิน 29 ต.ค. 69) ─────────────────────────────────────
--   ตัวอย่างของบอส: ใบออก ก.ย. ตอบรับ ต.ค. = ยอด ต.ค. ทุกหน้า · ใบออก ธ.ค. ปีก่อน ตอบรับ ม.ค. = ยอดปีนี้
--   ทุกตัวคำนวณที่หน้าเว็บใช้: dealer_rollup (ยอดทั้งปีเทียบเป้า) · dashboard_quote_summary · hq_quotations_summary
--   · network_quote_range · hq_customers_page (ซื้อล่าสุด/ตัวกรองช่วงที่ซื้อ) · ฟังก์ชันกลาง _q_report_date · ตัวดักเขียน won_at
-- รัน: docker exec -i supabase_db_pms-dbcheck psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 < supabase/tests/sales_by_won_date.sql
-- ทรานแซกชันเดียวแล้ว rollback · รอบปิดด่านรันผ่าน tests/scenario/db-rule-tests.spec.ts · ผ่าน = "ALL PASS"
-- ตกบนโค้ดก่อนใบ 0260: ไม่มี quotations.won_at · ทุกตัวคำนวณนับตามวันออกใบ (ก.ย. / ธ.ค. ปีก่อน)
begin;
create schema swtest;
create table swtest.fails (what text);
create function swtest.eq(p_got numeric, p_want numeric, p_what text) returns void language plpgsql as $$
begin
  if p_got is distinct from p_want then
    insert into swtest.fails values (format('%s — ได้ %s ควรได้ %s', p_what, coalesce(p_got::text, 'ไม่มี'), coalesce(p_want::text, 'ไม่มี')));
    raise notice 'FAIL %', p_what; return;
  end if;
  raise notice 'ok  % (%)', p_what, p_got;
end $$;
create function swtest.as_hq() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.profiles where role = 'SUPER_ADMIN' limit 1),
    'role', 'authenticated', 'user_role', 'SUPER_ADMIN', 'dealer_code', '')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function swtest.as_db() returns void language plpgsql as $$
begin perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '', true); end $$;
grant usage on schema swtest to authenticated;
grant execute on all functions in schema swtest to authenticated;
grant select, insert on swtest.fails to authenticated;

-- ═══ ข้อมูลที่รู้ค่า: สาขา ZZSW · ใบ A ออก 15 ก.ย. 2026 ตอบรับ 5 ต.ค. 2026 · ใบ B ออก 20 ธ.ค. 2025 ตอบรับ 10 ม.ค. 2026 ═══
set local session_replication_role = replica;
insert into public.dealers (code, name, province, region, revenue_target, status) values ('ZZSW', 'ZZSW สาขาทดสอบยอดตามวันตอบรับ', 'ระยอง', 'ตะวันออก', 0, 'active');
insert into public.customers (id, dealer_code, name, company, province, join_date) values (990801, 'ZZSW', 'ZZSW ลูกค้า', 'ZZSW ลูกค้า', 'ระยอง', '2025-12-01');
insert into public.quotations (id, dealer_code, customer, status, total_value, date, customer_id, won_at) values
  ('ZZSW-A', 'ZZSW', 'ZZSW ลูกค้า', 'won', 100000, '2026-09-15', 990801, '2026-10-05 10:00:00+07'),
  ('ZZSW-B', 'ZZSW', 'ZZSW ลูกค้า', 'won', 200000, '2025-12-20', 990801, '2026-01-10 14:00:00+07'),
  ('ZZSW-C', 'ZZSW', 'ZZSW ลูกค้า', 'sent_to_client', 50000, '2026-09-20', null, null);
set local session_replication_role = origin;

do $$
declare j jsonb;
begin
  perform swtest.as_db();
  -- ฟังก์ชันกลาง
  perform swtest.eq((select extract(month from _q_report_date('won', '2026-10-05 10:00:00+07', '2026-09-15'))), 10, 'ฟังก์ชันกลาง: ใบตอบรับ = เดือนที่ตอบรับ (ต.ค.)');
  perform swtest.eq((select extract(month from _q_report_date('sent_to_client', null, '2026-09-20'))), 9, 'ฟังก์ชันกลาง: ใบอื่น = เดือนที่ออกใบ');
  perform swtest.eq((select extract(day from _q_report_date('won', '2026-10-04 18:30:00+00', '2026-09-15'))), 5, 'ฟังก์ชันกลาง: วันตามเวลาไทย (01:30 น. 5 ต.ค.)');

  -- dealer_rollup: ยอดทั้งปีเทียบเป้า = ปีที่ตอบรับ
  perform swtest.eq((select revenue from dealer_rollup(2026) where dealer_code = 'ZZSW'), 300000, 'dealer_rollup ปี 2026: ใบออก ธ.ค. ปีก่อน ตอบรับ ม.ค. นับเป็นปีนี้ (A + B)');
  perform swtest.eq((select revenue from dealer_rollup(2025) where dealer_code = 'ZZSW'), 0, 'dealer_rollup ปี 2025: ไม่มียอด (ใบ B ตอบรับปี 2026)');

  -- network_quote_range: ช่วง ต.ค. ได้ใบ A · ช่วง ก.ย. ไม่มียอด (ใบ C ยังนับเป็นใบเสนอ ก.ย.)
  perform swtest.eq((select won_val from network_quote_range('2026-10-01', '2026-10-31', 'ZZSW')), 100000, 'network_quote_range ต.ค.: ใบออก ก.ย. ตอบรับ ต.ค. = ยอด ต.ค.');
  perform swtest.eq((select coalesce(won_val, 0) from network_quote_range('2026-09-01', '2026-09-30', 'ZZSW')), 0, 'network_quote_range ก.ย.: ไม่มียอด');
  perform swtest.eq((select quotes from network_quote_range('2026-09-01', '2026-09-30', 'ZZSW')), 1, 'network_quote_range ก.ย.: ใบที่ยังไม่ตอบรับนับตามวันออกใบ');
  perform swtest.eq((select won_val from network_quote_range('2026-01-01', '2026-01-31', 'ZZSW')), 200000, 'network_quote_range ม.ค. 2026: ใบออก ธ.ค. ปีก่อน = ยอด ม.ค.');

  -- dashboard_quote_summary: รายเดือนตามเดือนที่ตอบรับ
  j := dashboard_quote_summary('2026-01-01', '2026-12-31', 'ZZSW');
  perform swtest.eq((select (x ->> 'won_val')::numeric from jsonb_array_elements(j -> 'byMonth') x where (x ->> 'm')::int = 9), 100000, 'dashboard_quote_summary: ยอดใบ A อยู่เดือน ต.ค. (m=9)');
  perform swtest.eq((select coalesce(sum((x ->> 'won_val')::numeric), 0) from jsonb_array_elements(j -> 'byMonth') x where (x ->> 'm')::int = 8), 0, 'dashboard_quote_summary: เดือน ก.ย. ไม่มียอดขาย');
  perform swtest.eq((select (x ->> 'won_val')::numeric from jsonb_array_elements(j -> 'byMonth') x where (x ->> 'm')::int = 0), 200000, 'dashboard_quote_summary: ยอดใบ B อยู่ ม.ค. 2026');

  -- hq_quotations_summary: ช่วง ต.ค. (รายดีลเลอร์ + รายเดือน)
  j := hq_quotations_summary(null, array['ZZSW'], null, null, '2026-10-01', '2026-10-31');
  perform swtest.eq((select (x ->> 'won_val')::numeric from jsonb_array_elements(j -> 'byDealer') x where x ->> 'dealer_code' = 'ZZSW'), 100000, 'hq_quotations_summary ต.ค.: ยอดใบ A ของสาขา');
  j := hq_quotations_summary(null, array['ZZSW'], null, null, '2026-09-01', '2026-09-30');
  perform swtest.eq((select coalesce((x ->> 'won_val')::numeric, 0) from jsonb_array_elements(j -> 'byDealer') x where x ->> 'dealer_code' = 'ZZSW'), 0, 'hq_quotations_summary ก.ย.: ไม่มียอดขาย');

  -- hq_customers_page: ซื้อล่าสุด = วันตอบรับ · ตัวกรองช่วงที่ซื้อ ต.ค. เห็นลูกค้า
  perform swtest.as_hq();
  j := hq_customers_page(null, 'ZZSW', null, null, '2026-10-01', '2026-10-31');
  perform swtest.eq((select count(*) from jsonb_array_elements(j -> 'rows') x where (x ->> 'id')::int = 990801), 1, 'hq_customers_page: ซื้อในช่วง ต.ค. (ตอบรับ 5 ต.ค.) เห็นลูกค้า');
  perform swtest.eq((select extract(month from (x ->> 'last_purchase_at')::date) from jsonb_array_elements(j -> 'rows') x where (x ->> 'id')::int = 990801), 10, 'hq_customers_page: ซื้อล่าสุด = เดือนที่ตอบรับ');
  j := hq_customers_page(null, 'ZZSW', null, null, '2026-09-01', '2026-09-30');
  perform swtest.eq((select count(*) from jsonb_array_elements(j -> 'rows') x where (x ->> 'id')::int = 990801), 0, 'hq_customers_page: ช่วง ก.ย. ไม่เห็น (ซื้อล่าสุดคือ ต.ค.)');
  perform swtest.as_db();

  -- หน้าเว็บ/คนนอกเขียนเวลาตอบรับเองไม่ได้ (ตัวดักคงค่าเดิม · ใบตอบรับยังล็อกการแก้อยู่แล้วด้วย)
  begin
    update public.quotations set won_at = '2020-01-01' where id = 'ZZSW-A';
  exception when others then null;   -- ใบตอบรับล็อกแก้ไข = เขียนไม่ได้เช่นกัน
  end;
  perform swtest.eq((select extract(year from won_at) from public.quotations where id = 'ZZSW-A'), 2026, 'เขียนเวลาตอบรับเองไม่ได้ (คงค่าเดิม)');

  if exists (select 1 from swtest.fails) then
    raise exception 'FAIL % ข้อ: %', (select count(*) from swtest.fails), (select string_agg(what, ' · ') from swtest.fails);
  end if;
end $$;

select 'ALL PASS' as result;
rollback;
