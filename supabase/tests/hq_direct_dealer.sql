-- ── ข้อทดสอบใบ 0287: ดีลเลอร์ HQD (สำนักงานใหญ่ ขายตรง) — นับในยอดรวมทั้งเครือ · ไม่นับเป็นดีลเลอร์ · ไม่ติดอันดับ · ไม่มีเป้า/จังหวัด ──
--   1) ตัวเลข (บอสสั่ง 18 พ.ย. 69): หน้าหลัก HQ (hq_dashboard) จำนวนดีลเลอร์ + ดีลเลอร์ตามภาค ไม่นับ HQD · 10 อันดับไม่มี HQD
--      การ์ดทะเบียนดีลเลอร์ / ดีลเลอร์ที่มีลูกค้า ไม่นับ HQD · ยอดขายรวมทั้งเครือ (หน้าหลัก + ภาพรวมยอดขาย) นับยอดของ HQD
--   2) ฐานกัน: HQD ตั้งเป้า/ใส่จังหวัด/ภาค/พื้นที่ดูแล/ลบ/เปลี่ยนรหัส ไม่ได้ · ปิดใช้งานได้ · ไม่มีแถวพื้นที่ดูแล
--   3) ลูกค้าเป้าหมายจาก HQ ไป HQD ไม่สร้างแจ้งเตือน "HQ ส่งลีดใหม่ให้" · ไปดีลเลอร์อื่นยังแจ้งตามเดิม (ข้อตรวจไม่ว่างเปล่า)
--   ตกบนโค้ดก่อนใบ 0287: ใส่ HQD ไม่มีจังหวัดไม่ได้ (ฐานบังคับจังหวัดของดีลเลอร์) · ถ้าใส่ได้ จำนวนดีลเลอร์รวม HQD
-- ฐานทดสอบหลังใส่ข้อมูลตั้งต้นไม่มีแถว HQD (ข้อมูลตั้งต้นลบดีลเลอร์ที่ไม่ใช่ Z* แบบปิดตัวดัก) → ใส่ในทรานแซกชันนี้ผ่านตัวดักจริง
-- รัน: docker exec -i <คอนเทนเนอร์ฐานทดสอบ> psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 < supabase/tests/hq_direct_dealer.sql
begin;
create schema hqdtest;
create function hqdtest.ok(p_cond boolean, p_what text) returns void language plpgsql as $$
begin if p_cond is not true then raise exception 'FAIL: %', p_what; end if; raise notice 'ok  %', p_what; end $$;
create function hqdtest.must_fail(p_sql text, p_like text, p_what text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if sqlerrm ilike '%' || p_like || '%' then raise notice 'ok  % (ถูกปฏิเสธ)', p_what; return; end if;
    raise exception 'FAIL: % — ถูกปฏิเสธแต่ข้อความไม่ตรง: %', p_what, sqlerrm;
  end;
  raise exception 'FAIL: % — ควรถูกปฏิเสธแต่ผ่าน', p_what;
end $$;

-- HQD ตามใบ (ไม่มีจังหวัด/ภาค · เป้า 0) — ผ่านตัวดักจริง (ไม่ปิดตัวดัก)
insert into dealers (code, name, province, region, revenue_target, status)
values ('HQD', 'สำนักงานใหญ่ (ขายตรง)', null, null, 0, 'active') on conflict (code) do nothing;
-- แถว HQ (เจ้าของลูกค้าเป้าหมายก่อนย้าย) — ข้อทดสอบอื่นสร้างไว้แล้ว ไม่มีก็ใส่ (จังหวัดตามแถวจริงบนฐานจริง)
insert into dealers (code, name, province, region, revenue_target, status)
values ('HQ', 'สำนักงานใหญ่', 'ทุกจังหวัด', 'ทุกภาค', 0, 'active') on conflict (code) do nothing;

-- ยอดขายของ HQD วันนี้ (ใหญ่กว่าทุกดีลเลอร์ — ถ้าติดอันดับต้องอยู่อันดับ 1) + ลูกค้าเป้าหมายใหม่วันนี้ + ลูกค้าเป้าหมายใต้ HQ 2 ราย
set local session_replication_role = replica;
insert into leads (id, dealer_code, num_id, company, name, status, created_date)
values ('#ZZHQD-1', 'HQD', 990001, 'ZZTEST HQD ขายตรง', 'ZZTEST', 'WAITING', (now() at time zone 'Asia/Bangkok')::date),
       ('#ZZHQD-2', 'HQ', 990002, 'ZZTEST HQD จาก HQ ไปขายตรง', 'ZZTEST', 'WAITING', (now() at time zone 'Asia/Bangkok')::date),
       ('#ZZHQD-3', 'HQ', 990003, 'ZZTEST HQD จาก HQ ไปดีลเลอร์', 'ZZTEST', 'WAITING', (now() at time zone 'Asia/Bangkok')::date);
insert into customers (id, dealer_code, company) overriding system value values (990001, 'HQD', 'ZZTEST HQD ขายตรง');
insert into quotations (id, dealer_code, vat_percent, status, total_value, won_at, date, customer, customer_id)
values ('ZZHQD-Q1', 'HQD', 7, 'won', 987654321, now(), to_char((now() at time zone 'Asia/Bangkok')::date, 'YYYY-MM-DD'), 'ZZTEST HQD ขายตรง', 990001);
set local session_replication_role = origin;

do $$
declare
  hq uuid := (select id from profiles where role = 'SUPER_ADMIN' limit 1);
  วันนี้ date := (now() at time zone 'Asia/Bangkok')::date;
  ดีลเลอร์ int := (select count(*) from dealers where code not in ('HQ', 'HQD'));
  ยอดHQD numeric := 987654321;
  d jsonb; k jsonb;
begin
  perform hqdtest.ok(exists (select 1 from dealers where code = 'HQD'), 'มีแถว HQD (ไม่มีจังหวัด/ภาค · เป้า 0) ผ่านตัวดักจริง');
  perform hqdtest.ok(not exists (select 1 from dealer_territories where dealer_code = 'HQD'), '2) HQD ไม่มีแถวพื้นที่ดูแล');

  perform set_config('request.jwt.claims', json_build_object('sub', hq, 'role', 'authenticated', 'user_role', 'SUPER_ADMIN', 'dealer_code', '')::text, true);
  d := public.hq_dashboard(วันนี้, วันนี้, null, วันนี้);
  perform hqdtest.ok((d->>'dealerCount')::int = ดีลเลอร์,
    format('1) หน้าหลัก: จำนวนดีลเลอร์ = %s (ไม่นับ HQ/HQD) — ได้ %s', ดีลเลอร์, d->>'dealerCount'));
  perform hqdtest.ok((select coalesce(sum((r->>'dealers')::int), 0) from jsonb_array_elements(d->'regions') r) = ดีลเลอร์,
    '1) หน้าหลัก: ดีลเลอร์ตามภาครวมกัน = จำนวนดีลเลอร์ (ไม่มี HQD ในภาคใด) — ได้ ' || (d->'regions')::text);
  perform hqdtest.ok(not exists (select 1 from jsonb_array_elements(d->'top') t where t->>'code' = 'HQD'),
    '1) หน้าหลัก: 10 อันดับไม่มี HQD (ยอดวันนี้มากที่สุดก็ไม่ติด)');
  perform hqdtest.ok((d->'cards'->>'sales')::numeric >= ยอดHQD,
    '1) หน้าหลัก: ยอดขายรวมทั้งเครือนับยอดของ HQD — ได้ ' || (d->'cards'->>'sales'));
  perform hqdtest.ok((public.hq_dashboard(วันนี้, วันนี้, 'HQD', วันนี้)->'cards'->>'leadsNew')::int >= 1,
    '1) หน้าหลัก: ลูกค้าเป้าหมายใหม่ของ HQD นับได้ (ยอดรวมทั้งเครือ)');

  k := public.kpi_cards('hq.dealers', null, null, null, วันนี้, null);
  perform hqdtest.ok((k->>'total')::int = ดีลเลอร์, format('1) การ์ดทะเบียนดีลเลอร์: ทั้งหมด = %s (ไม่นับ HQD) — ได้ %s', ดีลเลอร์, k->>'total'));
  k := public.kpi_cards('hq.customers', วันนี้, วันนี้, null, วันนี้, null);
  perform hqdtest.ok((k->'dealers'->>'of')::int = ดีลเลอร์, format('1) การ์ดลูกค้า: ดีลเลอร์ทั้งหมด = %s (ไม่นับ HQD) — ได้ %s', ดีลเลอร์, k->'dealers'->>'of'));
  k := public.kpi_cards('hq.pipeline', วันนี้, วันนี้, null, วันนี้, null);
  perform hqdtest.ok((k->'sales'->>'value')::numeric >= ยอดHQD, '1) ภาพรวมยอดขาย: ยอดรวมทั้งเครือนับยอดของ HQD — ได้ ' || (k->'sales'->>'value'));
  perform hqdtest.ok(not ((k->'onTarget'->'codes') ? 'HQD'), '1) ภาพรวมยอดขาย: ถึงเป้าไม่มี HQD (ไม่มีเป้า)');
  perform set_config('request.jwt.claims', '', true);

  -- 2) ฐานกัน (งานฝั่งเซิร์ฟเวอร์ก็ไม่ได้)
  perform hqdtest.must_fail($s$update dealers set revenue_target = 1000000 where code = 'HQD'$s$, 'hq_direct_no_target', 'ตั้งเป้าให้ HQD');
  perform hqdtest.must_fail($s$update dealers set province = 'ระยอง', region = 'ตะวันออก' where code = 'HQD'$s$, 'hq_direct_no_territory', 'ใส่จังหวัด/ภาคให้ HQD');
  perform hqdtest.must_fail($s$insert into dealer_territories (province, dealer_code) values ('ระยอง', 'HQD')$s$, 'hq_direct_no_territory', 'เพิ่มพื้นที่ดูแลให้ HQD');
  perform hqdtest.must_fail($s$delete from dealers where code = 'HQD'$s$, 'hq_direct_protected', 'ลบแถว HQD');
  perform hqdtest.must_fail($s$update dealers set code = 'HQE' where code = 'HQD'$s$, 'hq_direct_protected', 'เปลี่ยนรหัส HQD');
  update dealers set status = 'inactive' where code = 'HQD';
  update dealers set status = 'active' where code = 'HQD';
  raise notice 'ok  2) ปิด/เปิดใช้งาน HQD ได้ตามปกติ';

  -- 3) แจ้งเตือน "HQ ส่งลีดใหม่ให้": ไป HQD ไม่แจ้ง · ไปดีลเลอร์อื่นแจ้ง (ข้อตรวจไม่ว่างเปล่า)
  perform set_config('pms.flow_sync', '1', true);
  update leads set dealer_code = 'HQD', num_id = 990002 where dealer_code = 'HQ' and id = '#ZZHQD-2';
  update leads set dealer_code = 'RYG', num_id = 990003 where dealer_code = 'HQ' and id = '#ZZHQD-3';
  perform set_config('pms.flow_sync', '', true);
  perform hqdtest.ok(not exists (select 1 from notifications where kind = 'lead_from_hq' and dedupe_key like '%#ZZHQD-2%'),
    '3) ย้ายจาก HQ ไป HQD ไม่สร้างแจ้งเตือน "HQ ส่งลีดใหม่ให้"');
  perform hqdtest.ok(exists (select 1 from notifications where kind = 'lead_from_hq' and dedupe_key like '%#ZZHQD-3%'),
    '3) ย้ายจาก HQ ไปดีลเลอร์อื่นยังแจ้งตามเดิม');
end $$;

select 'ALL PASS' as result;
rollback;
