-- ── ข้อทดสอบใบ 0268: ตัวเลขที่ฐานของหน้า HQ ที่ปรับตามแบบ (บอสสั่ง 30 ต.ค. 69) ──
--   1. hq_customers_page: กราฟจังหวัดครบทุกจังหวัด + "ไม่ระบุจังหวัด" → ผลรวมตามจังหวัด = ผลรวมตามดีลเลอร์ = ลูกค้าทั้งหมด
--   2. hq_quotations_summary.byMonthSent: ใบที่ส่งตามวันที่ส่ง (ไม่นับร่าง/ถูกแทนที่) · ตอบรับตามวันตอบรับ
--   3. hq_pipeline_months: ผลรวมทุกเดือน = hq_pipeline_dealers (ลีด · ใบที่ส่ง · ปิดได้/ไม่ได้ · ยอดขาย · ส่วนต่าง) · ดีลเลอร์เรียกไม่ได้
--   4. hq_dashboard: ใบที่ส่งรายเดือนไม่นับร่าง · 5. ชื่อขั้น "รอตัดสินใจ HQ" · 6. material_estimate_accuracy.by_template
-- รัน: docker exec -i <คอนเทนเนอร์ฐานทดสอบ> psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 < supabase/tests/hq_pages_monthly.sql
-- ทรานแซกชันเดียวแล้ว rollback · ผ่าน = "ALL PASS" · ตกบนโค้ดก่อนใบ 0268: จังหวัดตัด/ทิ้งไม่ระบุ · ไม่มี byMonthSent · ไม่มี hq_pipeline_months · แดชบอร์ดนับร่าง · "รอตัดสินใจ" · ไม่มี by_template
begin;
create schema hpmtest;
create table hpmtest.fails (what text);
create function hpmtest.eq(p_got text, p_want text, p_what text) returns void language plpgsql as $$
begin
  if p_got is distinct from p_want then insert into hpmtest.fails values (p_what || ' — ได้ ' || coalesce(p_got, 'ไม่มี') || ' ควร ' || coalesce(p_want, 'ไม่มี'));
    raise notice 'FAIL %', p_what; return; end if;
  raise notice 'ok  %', p_what;
end $$;
grant usage on schema hpmtest to authenticated;
grant execute on all functions in schema hpmtest to authenticated;
grant insert on hpmtest.fails to authenticated;

-- สาขา ZZHPM (ตราด): ลูกค้า 12 ราย ใน 11 จังหวัด + 1 รายไม่มีจังหวัด (เกิน 10 อันดับ · มีช่องว่าง)
--   ลีด ก.ย. 2 (ปิดได้ 1) · ต.ค. 2 (ปิดไม่ได้ 1) · ใบ: ส่ง ก.ย. ตอบรับ ต.ค. 300,000 (ผูกใบ HQ ต้นทุน 240,000) · ส่ง ต.ค. 1 · ร่าง ต.ค. 1 · ถูกแทนที่ ต.ค. 1
set local session_replication_role = replica;
insert into dealers (code, name, province, region, status, revenue_target) values ('ZZHPM', 'ZZTEST หน้า HQ รายเดือน', 'ตราด', 'ตะวันออก', 'active', 12000000);
insert into customers (id, dealer_code, name, company, province)
  select 992300 + i, 'ZZHPM', 'ZZTEST ลูกค้า ' || i, 'ZZTEST ลูกค้า ' || i,
         (array['ตราด','จันทบุรี','ระยอง','ชลบุรี','ฉะเชิงเทรา','ปราจีนบุรี','สระแก้ว','นครนายก','ลพบุรี','สระบุรี','อ่างทอง','อ่างทอง', ''])[i]   -- ลูกค้าไม่มีจังหวัด = ค่าว่าง (ช่องนี้ห้าม NULL · ใบ 0106)
    from generate_series(1, 13) i;
insert into leads (id, num_id, dealer_code, company, name, phone, province, status, created_date) values
  ('#L-992311', 992311, 'ZZHPM', 'ZZTEST ล1', 'ZZTEST', '000-000-2311', 'ตราด', 'PAID', '2026-09-10'),
  ('#L-992312', 992312, 'ZZHPM', 'ZZTEST ล2', 'ZZTEST', '000-000-2312', 'ตราด', 'WAITING', '2026-09-12'),
  ('#L-992313', 992313, 'ZZHPM', 'ZZTEST ล3', 'ZZTEST', '000-000-2313', 'ตราด', 'CANCELLED', '2026-10-03'),
  ('#L-992314', 992314, 'ZZHPM', 'ZZTEST ล4', 'ZZTEST', '000-000-2314', 'ตราด', 'QUOTED', '2026-10-04');
insert into quote_requests (id, request_no, dealer_code, lead_num_id, product, status, submitted_at, due_at, quoted_at) values
  (992321, 'QR-ZZHPM-1', 'ZZHPM', 992311, 'ZZTEST', 'won', '2026-09-11', '2026-09-25', '2026-09-12');
insert into hq_quotes (id, request_id, version, quote_no, status, line_items, total_cost, sent_at, ordered_at) values
  (992321, 992321, 1, 'HQ-ZZHPM-1', 'ordered', '[]', 240000, '2026-09-12', '2026-10-05');
insert into quotations (id, dealer_code, customer, status, total_value, line_items, hq_quote_id, customer_id, date, won_at) values
  ('ZZHPM-Q1', 'ZZHPM', 'ZZTEST ลูกค้า 1', 'won', 300000, '[]', 992321, 992301, '2026-09-20', '2026-10-05 10:00:00+07'),
  ('ZZHPM-Q2', 'ZZHPM', 'ZZTEST ลูกค้า 2', 'sent_to_client', 50000, '[]', null, null, '2026-10-06', null),
  ('ZZHPM-Q3', 'ZZHPM', 'ZZTEST ลูกค้า 3', 'draft', 70000, '[]', null, null, '2026-10-07', null),
  ('ZZHPM-Q4', 'ZZHPM', 'ZZTEST ลูกค้า 4', 'superseded', 90000, '[]', null, null, '2026-10-08', null);
insert into quotation_won_at (dealer_code, quote_id, won_at) values ('ZZHPM', 'ZZHPM-Q1', '2026-10-05 10:00:00+07');
-- แม่แบบวัสดุ 2 รายการ · คำขอที่ HQ ส่งใบแล้ว 2 คำขอ: คำขอ 1 ใช้ ก+ข (คลาด +10) · คำขอ 2 ใช้ ก (คลาด −4) → ก = 3.0 (2 คำขอ) · ข = 10.0 (1 คำขอ)
insert into material_templates (id, category, name, unit, unit_price) values (992381, 'ZZTEST', 'ZZTEST วัสดุ ก', 'ชิ้น', 100), (992382, 'ZZTEST', 'ZZTEST วัสดุ ข', 'ชิ้น', 200);
insert into quote_requests (id, request_no, dealer_code, lead_num_id, product, status, submitted_at, due_at, quoted_at, estimate_items, estimate_deviation_pct) values
  (992331, 'QR-ZZHPM-2', 'ZZHPM', 992312, 'ZZTEST', 'quoted', '2026-10-01', '2026-10-15', '2026-10-02',
   '[{"templateId": 992381, "qty": 1}, {"templateId": 992382, "qty": 1}, {"templateId": 992381, "qty": 2}]', 10),
  (992332, 'QR-ZZHPM-3', 'ZZHPM', 992314, 'ZZTEST', 'quoted', '2026-10-01', '2026-10-15', '2026-10-02', '[{"templateId": 992381, "qty": 1}]', -4);
insert into dealer_prospects (id, name, status) values (992391, 'ZZTEST ผู้สนใจรายเดือน', 'meeting');
set local session_replication_role = origin;

do $$
declare
  hq uuid := (select id from profiles where role = 'SUPER_ADMIN' and status = 'active' limit 1);
  ค jsonb; ส jsonb; ด jsonb; ป jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', hq, 'role', 'authenticated', 'user_role', 'SUPER_ADMIN', 'dealer_code', '', 'email', 'hq@test')::text, true);
  perform set_config('role', 'authenticated', true);

  -- 1 · ลูกค้า: ผลรวมตามจังหวัด = ตามดีลเลอร์ = ทั้งหมด (13)
  ค := hq_customers_page(p_dealer_code => 'ZZHPM', p_limit => 50);
  perform hpmtest.eq(ค #>> '{kpi,total}', '13', 'ลูกค้าทั้งหมด 13');
  perform hpmtest.eq((select sum((x ->> 'value')::int)::text from jsonb_array_elements(ค #> '{charts,byProvince}') x), '13', 'ผลรวมตามจังหวัด = ลูกค้าทั้งหมด (ไม่ตัด 10 อันดับ · นับไม่มีจังหวัด)');
  perform hpmtest.eq((select sum((x ->> 'value')::int)::text from jsonb_array_elements(ค #> '{charts,byDealer}') x), '13', 'ผลรวมตามดีลเลอร์ = ลูกค้าทั้งหมด');
  perform hpmtest.eq(jsonb_array_length(ค #> '{charts,byProvince}')::text, '12', '11 จังหวัด + ไม่ระบุจังหวัด');
  perform hpmtest.eq((select x ->> 'value' from jsonb_array_elements(ค #> '{charts,byProvince}') x where x ->> 'label' = 'ไม่ระบุจังหวัด'), '1', 'ลูกค้าไม่มีจังหวัด = "ไม่ระบุจังหวัด" 1');

  -- 2 · ใบที่ส่ง/ตอบรับรายเดือน: ก.ย. ส่ง 1 (ใบที่ตอบรับนับตามวันที่ส่ง) · ต.ค. ส่ง 1 ตอบรับ 1 · ร่าง/ถูกแทนที่ไม่นับ
  ส := hq_quotations_summary(p_dealer_codes => array['ZZHPM']);
  perform hpmtest.eq((select x::text from jsonb_array_elements(ส -> 'byMonthSent') x where (x ->> 'm')::int = 8), '{"m": 8, "y": 2026, "won": 0, "sent": 1}', 'ก.ย.: ส่ง 1 (ใบที่ตอบรับเดือนถัดไป นับส่งตามวันที่ส่ง)');
  perform hpmtest.eq((select x::text from jsonb_array_elements(ส -> 'byMonthSent') x where (x ->> 'm')::int = 9), '{"m": 9, "y": 2026, "won": 1, "sent": 1}', 'ต.ค.: ส่ง 1 · ตอบรับ 1 (ตามวันตอบรับ) · ร่าง/ถูกแทนที่ไม่นับ');

  -- 3 · ผลงานรายเดือน: ผลรวมทุกเดือน = hq_pipeline_dealers ช่วงเดียวกัน
  ด := hq_pipeline_dealers('2026-09-01', '2026-10-31', array['ZZHPM'], '2026-10-31');
  ป := hq_pipeline_months('2026-09-01', '2026-10-31', array['ZZHPM']);
  perform hpmtest.eq(jsonb_array_length(ป)::text, '2', 'มี 2 เดือน (ก.ย. · ต.ค.)');
  perform hpmtest.eq((select jsonb_build_object('leads', sum((x->>'leads')::int), 'quotes', sum((x->>'quotes')::int), 'won', sum((x->>'won')::int), 'lost', sum((x->>'lost')::int),
                        'sales', sum((x->>'sales')::numeric), 'sale', sum((x->>'marginSale')::numeric), 'cost', sum((x->>'marginCost')::numeric))::text from jsonb_array_elements(ป) x),
                     jsonb_build_object('leads', (ด->0->>'leads')::int, 'quotes', (ด->0->>'quotes')::int, 'won', (ด->0->>'won')::int, 'lost', (ด->0->>'lost')::int,
                        'sales', (ด->0->>'sales')::numeric, 'sale', (ด->0->>'marginSale')::numeric, 'cost', (ด->0->>'marginCost')::numeric)::text,
                     'ผลรวมทุกเดือน = ผลงานทั้งช่วง (ชุดเดียวกับการ์ด)');
  perform hpmtest.eq((select jsonb_build_object('leads', x->'leads', 'quotes', x->'quotes', 'won', x->'won', 'lost', x->'lost', 'sales', (x->>'sales')::numeric)::text
                        from jsonb_array_elements(ป) x where (x->>'m')::int = 8), '{"won": 1, "lost": 0, "leads": 2, "sales": 0, "quotes": 1}', 'ก.ย.: ลีด 2 ปิดได้ 1 · ใบที่ส่ง 1 · ยอดขาย 0');
  perform hpmtest.eq((select jsonb_build_object('leads', x->'leads', 'quotes', x->'quotes', 'lost', x->'lost', 'sales', (x->>'sales')::numeric, 'cost', (x->>'marginCost')::numeric)::text
                        from jsonb_array_elements(ป) x where (x->>'m')::int = 9), '{"cost": 240000, "lost": 1, "leads": 2, "sales": 300000, "quotes": 1}', 'ต.ค.: ยอดขาย 300,000 ตามวันตอบรับ · ต้นทุนใบ HQ 240,000 · ร่าง/ถูกแทนที่ไม่นับ');
  perform hpmtest.eq((select x->>'annualTarget' from jsonb_array_elements(ป) x limit 1), '12000000', 'เป้าทั้งปีของสาขา');
  perform hpmtest.eq((select count(*)::text from jsonb_array_elements(hq_pipeline_months('2026-09-01', '2026-10-31', null)) x where x->>'code' = 'HQ'), '0', 'ไม่มีแถว HQ');

  -- 4 · แดชบอร์ด: "ใบที่ส่ง" รายเดือน ต.ค. = 1 (ไม่นับร่าง/ถูกแทนที่)
  perform hpmtest.eq((select x->>'quotes' from jsonb_array_elements(hq_dashboard('2026-10-01', '2026-10-31', 'ZZHPM', '2026-10-31') -> 'monthly') x where (x->>'m')::int = 9 and (x->>'y')::int = 2026),
                     '1', 'แดชบอร์ด ต.ค.: ใบที่ส่ง 1 (ร่าง/ถูกแทนที่ไม่นับ)');
  -- 6 · % คลาดเฉลี่ยรายวัสดุ (คำขอหนึ่งนับครั้งเดียวต่อวัสดุ)
  perform hpmtest.eq((select x::text from jsonb_array_elements(material_estimate_accuracy() -> 'by_template') x where (x->>'id')::bigint = 992381), '{"n": 2, "id": 992381, "avg_pct": 3.0}', 'วัสดุ ก: เฉลี่ย (10 − 4) ÷ 2 = 3.0 จาก 2 คำขอ');
  perform hpmtest.eq((select x::text from jsonb_array_elements(material_estimate_accuracy() -> 'by_template') x where (x->>'id')::bigint = 992382), '{"n": 1, "id": 992382, "avg_pct": 10.0}', 'วัสดุ ข: 10.0 จาก 1 คำขอ');
end $$;

-- 5 · ชื่อขั้นผู้สนใจในฐาน = หน้าเว็บ — ตัวสร้างข้อความเรียกได้เฉพาะฐาน (ตัวดัก/บันทึก) ไม่ใช่บทบาทหน้าเว็บ → ตรวจด้วยบทบาทเจ้าของฐาน
reset role;
do $$ begin
  -- ใบ 0278 (5 พ.ย. 69 · ตรวจกลับด้าน — เดิม "รอตัดสินใจ HQ" ของใบ 0268): ชื่อขั้น considering = "รอผู้สนใจตอบรับ"
  perform hpmtest.eq(prospect_status_th('considering'), 'รอผู้สนใจตอบรับ', 'ชื่อขั้น considering (prospect_status_th)');
  perform hpmtest.eq(_prospect_status_th('considering'), 'รอผู้สนใจตอบรับ', 'ชื่อขั้น considering (_prospect_status_th)');
end $$;

-- ดีลเลอร์เรียกไม่ได้
reset role;
do $$
declare ผล text := 'ผ่าน';
begin
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'user_role', 'DEALER_ADMIN', 'dealer_code', 'ZZHPM', 'email', 'd@test')::text, true);
  perform set_config('role', 'authenticated', true);
  begin perform hq_pipeline_months('2026-09-01', '2026-10-31', null); exception when others then ผล := sqlerrm; end;
  perform hpmtest.eq((ผล like 'forbidden%')::text, 'true', 'ดีลเลอร์เรียกผลงานรายเดือน = forbidden (ได้: ' || ผล || ')');
end $$;

reset role;
do $$ begin
  if exists (select 1 from hpmtest.fails) then raise exception 'FAIL: %', (select string_agg(what, E'\n') from hpmtest.fails); end if;
  raise notice 'ALL PASS';
end $$;
rollback;
