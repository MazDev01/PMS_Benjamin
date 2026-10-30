-- ── ข้อทดสอบใบ 0264: ตารางผลงานดีลเลอร์ (hq_pipeline_dealers) = การ์ดภาพรวมยอดขาย ทุกตัว ทุกชุดตัวกรอง (บอสสั่ง 30 ต.ค. 69) ──
--   ผลรวมรายดีลเลอร์ต้องเท่าการ์ด kpi_cards('hq.pipeline'): ยอดขาย · ปิดสำเร็จ · ปิดไม่สำเร็จ · ส่วนต่างกำไร (% จากผลรวม) · ถึงเป้า
--   + แถวของสาขาของข้อตรงค่าที่รู้: ลีด 4 (ปิดได้ 2 ไม่ได้ 1) → อัตราปิด 67% · ยอด 400,000 ต้นทุน 300,000 → ส่วนต่าง 25.0%
--     เป้าทั้งปี 36,500,000 · ช่วง 10 วัน → เป้าตามช่วง 1,000,000 → 40% · ใบร่าง/ถูกแทนที่ไม่นับเป็นใบเสนอราคา
--   ทั้งรายการเห็นข้อมูลชุดเดียว (repeatable read) — ข้ออื่นที่รันพร้อมกันเขียนแทรกไม่ทำให้ผลรวมกับการ์ดอ่านคนละเวลา
-- รัน: docker exec -i <คอนเทนเนอร์ฐานทดสอบ> psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 < supabase/tests/hq_pipeline_dealers.sql
-- ทรานแซกชันเดียวแล้ว rollback · ผ่าน = "ALL PASS" · ตกบนโค้ดก่อนใบ 0264: ไม่มี hq_pipeline_dealers
begin;
set transaction isolation level repeatable read;
create schema pltest;
create table pltest.fails (what text);
create function pltest.eq(p_got numeric, p_want numeric, p_what text) returns void language plpgsql as $$
begin
  if p_got is distinct from p_want then insert into pltest.fails values (p_what || ' — ได้ ' || coalesce(p_got::text, 'ไม่มี') || ' ควร ' || coalesce(p_want::text, 'ไม่มี'));
    raise notice 'FAIL %', p_what; return; end if;
  raise notice 'ok  %', p_what;
end $$;
grant usage on schema pltest to authenticated;
grant execute on all functions in schema pltest to authenticated;
grant insert on pltest.fails to authenticated;

-- ข้อมูลของข้อ: สาขา ZZPLD (ตราด · เป้า 36.5 ล้าน) วันที่ 2026-10-01..10 (ปิดตัวดัก — ใส่สถานะปลายทางตรง)
set local session_replication_role = replica;
insert into dealers (code, name, province, region, status, revenue_target) values ('ZZPLD', 'ZZTEST ผลงานดีลเลอร์', 'ตราด', 'ตะวันออก', 'active', 36500000);
insert into dealer_territories (province, dealer_code) values ('ตราด', 'ZZPLD');
insert into customers (id, dealer_code, name, company, province) values (990901, 'ZZPLD', 'ZZTEST ลูกค้า', 'ZZTEST ลูกค้า', 'ตราด');
insert into leads (id, num_id, dealer_code, company, name, phone, province, status, created_date) values
  ('#L-990911', 990911, 'ZZPLD', 'ZZTEST ล1', 'ZZTEST', '000-000-0911', 'ตราด', 'PAID', '2026-10-02'),
  ('#L-990912', 990912, 'ZZPLD', 'ZZTEST ล2', 'ZZTEST', '000-000-0912', 'ตราด', 'PAID', '2026-10-03'),
  ('#L-990913', 990913, 'ZZPLD', 'ZZTEST ล3', 'ZZTEST', '000-000-0913', 'ตราด', 'CANCELLED', '2026-10-04'),
  ('#L-990914', 990914, 'ZZPLD', 'ZZTEST ล4', 'ZZTEST', '000-000-0914', 'ตราด', 'BULLET', '2026-10-05'),
  ('#L-990915', 990915, 'ZZPLD', 'ZZTEST ล5 นอกช่วง', 'ZZTEST', '000-000-0915', 'ตราด', 'PAID', '2026-09-01');
insert into quote_requests (id, request_no, dealer_code, lead_num_id, product, status, submitted_at, due_at, quoted_at) values
  (990921, 'QR-ZZPLD-1', 'ZZPLD', 990911, 'ZZTEST', 'won', '2026-10-02', '2026-10-16', '2026-10-03');
insert into hq_quotes (id, request_id, version, quote_no, status, line_items, total_cost, sent_at, ordered_at) values
  (990931, 990921, 1, 'HQ-ZZPLD-1', 'ordered', '[]', 300000, '2026-10-03', '2026-10-06');
insert into quotations (id, dealer_code, customer, status, total_value, line_items, hq_quote_id, customer_id, date, won_at) values
  ('ZZPLD-Q1', 'ZZPLD', 'ZZTEST ลูกค้า', 'won', 400000, '[]', 990931, 990901, '2026-10-03', '2026-10-06 10:00:00+07'),
  ('ZZPLD-Q2', 'ZZPLD', 'ZZTEST ลูกค้า', 'sent_to_client', 50000, '[]', null, null, '2026-10-07', null),
  ('ZZPLD-Q3', 'ZZPLD', 'ZZTEST ลูกค้า', 'draft', 70000, '[]', null, null, '2026-10-08', null),
  ('ZZPLD-Q4', 'ZZPLD', 'ZZTEST ลูกค้า', 'superseded', 80000, '[]', null, null, '2026-10-02', null);
insert into quotation_won_at (dealer_code, quote_id, won_at) values ('ZZPLD', 'ZZPLD-Q1', '2026-10-06 10:00:00+07');
set local session_replication_role = origin;

do $$
declare
  hq uuid := (select id from profiles where role = 'SUPER_ADMIN' and status = 'active' limit 1);
  ชุด record; rows jsonb; card jsonb; แถว jsonb; ขาย numeric; ทุน numeric;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', hq, 'role', 'authenticated', 'user_role', 'SUPER_ADMIN', 'dealer_code', '', 'email', 'hq@test')::text, true);
  perform set_config('role', 'authenticated', true);

  -- แถวของสาขาของข้อ = ค่าที่รู้
  แถว := (select x from jsonb_array_elements(hq_pipeline_dealers('2026-10-01', '2026-10-10', array['ZZPLD'], '2026-10-10')) x);
  perform pltest.eq((แถว ->> 'leads')::numeric, 4, 'ZZPLD ลีดในช่วง 4 (นอกช่วงไม่นับ)');
  perform pltest.eq((แถว ->> 'won')::numeric, 2, 'ZZPLD ปิดได้ 2');
  perform pltest.eq((แถว ->> 'lost')::numeric, 1, 'ZZPLD ปิดไม่ได้ 1');
  perform pltest.eq((แถว ->> 'rate')::numeric, 67, 'ZZPLD อัตราปิด 2/(2+1) = 67% (สูตรกลาง)');
  perform pltest.eq((แถว ->> 'quotes')::numeric, 2, 'ZZPLD ใบเสนอราคา 2 (ไม่นับร่าง/ถูกแทนที่)');
  perform pltest.eq((แถว ->> 'sales')::numeric, 400000, 'ZZPLD ยอดขาย 400,000 (ตามวันตอบรับ)');
  perform pltest.eq((แถว ->> 'target')::numeric, 1000000, 'ZZPLD เป้าตามช่วง 36.5 ล้าน × 10 ÷ 365 = 1,000,000');
  perform pltest.eq((แถว ->> 'pct')::numeric, 40, 'ZZPLD % เป้า 40');
  perform pltest.eq((แถว ->> 'marginPct')::numeric, 25.0, 'ZZPLD ส่วนต่างกำไร 25.0%');
  perform pltest.eq(case when (แถว ->> 'latest') = '2026-10-07' then 1 else 0 end, 1, 'ZZPLD เสนอล่าสุด 2026-10-07 (ใบที่ส่งแล้ว ไม่นับร่าง)');

  -- ผลรวมรายดีลเลอร์ = การ์ด ทุกตัว หลายชุดตัวกรอง (ทั้งเครือ · สาขาเดียว · หลายสาขา · ช่วงทั้งปี/สั้น)
  for ชุด in select * from (values
      ('2026-10-01'::date, '2026-10-10'::date, null::text[]),
      ('2026-10-01', '2026-10-10', array['ZZPLD']),
      ('2026-10-01', '2026-10-10', array['ZZPLD', 'RYG', 'CNX']),
      ('2026-01-01', '2026-12-31', null),
      ('2026-01-01', '2026-12-31', array['RYG', 'CNX', 'BKK'])) v(s, e, codes)
  loop
    rows := hq_pipeline_dealers(ชุด.s, ชุด.e, ชุด.codes, '2026-10-10');
    card := kpi_cards('hq.pipeline', ชุด.s, ชุด.e, null, '2026-10-10', case when ชุด.codes is null then null else jsonb_build_object('dealerCodes', to_jsonb(ชุด.codes)) end);
    perform pltest.eq((select coalesce(sum((x ->> 'sales')::numeric), 0) from jsonb_array_elements(rows) x), (card #>> '{sales,value}')::numeric,
      format('ยอดขาย ผลรวมรายดีลเลอร์ = การ์ด (%s..%s %s)', ชุด.s, ชุด.e, coalesce(array_to_string(ชุด.codes, ','), 'ทั้งเครือ')));
    perform pltest.eq((select coalesce(sum((x ->> 'won')::numeric), 0) from jsonb_array_elements(rows) x), (card #>> '{winRate,won}')::numeric,
      format('ปิดสำเร็จ ผลรวม = การ์ด (%s..%s %s)', ชุด.s, ชุด.e, coalesce(array_to_string(ชุด.codes, ','), 'ทั้งเครือ')));
    perform pltest.eq((select coalesce(sum((x ->> 'lost')::numeric), 0) from jsonb_array_elements(rows) x), (card #>> '{winRate,lost}')::numeric,
      format('ปิดไม่สำเร็จ ผลรวม = การ์ด (%s..%s %s)', ชุด.s, ชุด.e, coalesce(array_to_string(ชุด.codes, ','), 'ทั้งเครือ')));
    select coalesce(sum((x ->> 'marginSale')::numeric), 0), coalesce(sum((x ->> 'marginCost')::numeric), 0) into ขาย, ทุน from jsonb_array_elements(rows) x;
    perform pltest.eq(case when ขาย = 0 then null else round(100.0 * (ขาย - ทุน) / ขาย, 1) end, (card #>> '{margin,pct}')::numeric,
      format('ส่วนต่างกำไร (จากผลรวมรายดีลเลอร์) = การ์ด (%s..%s %s)', ชุด.s, ชุด.e, coalesce(array_to_string(ชุด.codes, ','), 'ทั้งเครือ')));
    perform pltest.eq((select coalesce(sum((x ->> 'marginQuotes')::numeric), 0) from jsonb_array_elements(rows) x), (card #>> '{margin,quotes}')::numeric,
      format('จำนวนใบที่คิดส่วนต่าง ผลรวม = การ์ด (%s..%s %s)', ชุด.s, ชุด.e, coalesce(array_to_string(ชุด.codes, ','), 'ทั้งเครือ')));
    perform pltest.eq((select count(*) from jsonb_array_elements(rows) x where (x ->> 'onTarget')::boolean), (card #>> '{onTarget,reached}')::numeric,
      format('ถึงเป้า จำนวน = การ์ด (%s..%s %s)', ชุด.s, ชุด.e, coalesce(array_to_string(ชุด.codes, ','), 'ทั้งเครือ')));
  end loop;

  -- ดีลเลอร์เรียกไม่ได้ (ข้อมูลทั้งเครือ)
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'user_role', 'DEALER_ADMIN', 'dealer_code', 'RYG', 'email', 'ryg@test')::text, true);
  begin
    perform hq_pipeline_dealers('2026-10-01', '2026-10-10');
    insert into pltest.fails values ('ดีลเลอร์เรียก hq_pipeline_dealers ได้ (ควรถูกปฏิเสธ)');
  exception when others then
    if sqlerrm like 'forbidden%' then raise notice 'ok  ดีลเลอร์เรียกไม่ได้'; else insert into pltest.fails values ('ดีลเลอร์ถูกปฏิเสธด้วยข้อความอื่น: ' || sqlerrm); end if;
  end;
  perform set_config('role', 'postgres', true);

  if exists (select 1 from pltest.fails) then
    raise exception 'FAIL % ข้อ: %', (select count(*) from pltest.fails), (select string_agg(what, ' · ') from pltest.fails);
  end if;
end $$;

select 'ALL PASS' as result;
rollback;
