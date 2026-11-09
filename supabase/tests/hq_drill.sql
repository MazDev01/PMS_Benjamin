-- ── ข้อทดสอบใบ 0271: เจาะลึก 3 หน้า HQ (ลูกค้าเป้าหมาย · ใบเสนอราคา · ลูกค้า) + แม่แบบวัสดุลบได้เฉพาะที่ยังไม่เคยใช้ (บอสสั่ง 2 พ.ย. 69) ──
--   1) แถวของสาขาของข้อ (ZZDRL) ตรงค่าที่รู้ทุกคีย์ · รายเดือนของสาขาตรงทุกเดือน
--   2) ทุกหน้า: ผลรวมแถวรายดีลเลอร์ = การ์ด kpi_cards (ทั้งเครือ + กรองสาขา) · ผลรวมรายเดือน = แถวรายดีลเลอร์ (คีย์ที่มีรายเดือน)
--   3) ตัวเลขชุดเดียวกันตรงกันข้ามหน้า: ปิดสำเร็จ/ไม่สำเร็จของลีด = ภาพรวมยอดขาย (hq_pipeline_dealers) · มูลค่าตอบรับ = ยอดขาย · ใบที่ส่ง = ใบเสนอราคาของภาพรวม
--   4) รายชื่อลูกค้ากรองชุดดีลเลอร์ได้ (hq_customers_page p_dealer_codes) · ดีลเลอร์เรียก hq_drill ไม่ได้
--   5) แม่แบบวัสดุ: ลบวัสดุที่เคยใช้ในคำขอ → ฐานปฏิเสธ (ทั้งทางบันทึกของหน้าเว็บและคำสั่งตรง) · ยังไม่เคยใช้ = ลบได้ · material_templates_used บอกถูก
--   ทั้งรายการเห็นข้อมูลชุดเดียว (repeatable read) · ตกบนโค้ดก่อนใบ 0271: ไม่มี hq_drill / material_templates_used / ตัวดักก่อนลบ
-- รัน: docker exec -i <คอนเทนเนอร์ฐานทดสอบ> psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 < supabase/tests/hq_drill.sql
begin;
set transaction isolation level repeatable read;
create schema drtest;
create function drtest.ok(p_cond boolean, p_what text) returns void language plpgsql as $$
begin if p_cond is not true then raise exception 'FAIL: %', p_what; end if; raise notice 'ok  %', p_what; end $$;
create function drtest.must_fail(p_sql text, p_like text, p_what text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if sqlerrm ilike '%' || p_like || '%' then raise notice 'ok  % (ถูกปฏิเสธ)', p_what; return; end if;
    raise exception 'FAIL: % — ถูกปฏิเสธแต่ข้อความไม่ตรง: %', p_what, sqlerrm;
  end;
  raise exception 'FAIL: % — ควรถูกปฏิเสธแต่ผ่าน', p_what;
end $$;
create function drtest.as_user(p_role text, p_dealer text, p_uid uuid default null) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', coalesce(p_uid, gen_random_uuid()), 'role', 'authenticated',
    'user_role', p_role, 'dealer_code', p_dealer, 'email', 'zzdrill@example.test')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function drtest.as_root() returns void language plpgsql as $$
begin perform set_config('role', 'none', true); perform set_config('request.jwt.claims', '', true); end $$;
/** ผลรวมคีย์ของแถวรายดีลเลอร์ (กรองชุดสาขาได้) */
create function drtest.sum(p jsonb, p_key text, p_codes text[] default null) returns numeric language sql as $$
  select coalesce(sum((r ->> p_key)::numeric), 0) from jsonb_array_elements(p -> 'dealers') r where p_codes is null or r ->> 'code' = any(p_codes) $$;
create function drtest.msum(p jsonb, p_key text, p_codes text[] default null) returns numeric language sql as $$
  select coalesce(sum((r ->> p_key)::numeric), 0) from jsonb_array_elements(p -> 'months') r where p_codes is null or r ->> 'code' = any(p_codes) $$;
create function drtest.row(p jsonb, p_code text) returns jsonb language sql as $$
  select r from jsonb_array_elements(p -> 'dealers') r where r ->> 'code' = p_code $$;
grant usage on schema drtest to authenticated;
grant execute on all functions in schema drtest to authenticated;

-- ═══ ข้อมูลของข้อ: สาขา ZZDRL (ตราด · ตะวันออก) ช่วง 1 ก.ย.–27 ต.ค. 2026 · วันนี้ 27 ต.ค. (ปิดตัวดัก — ใส่สถานะปลายทางตรง) ═══
set local session_replication_role = replica;
insert into dealers (code, name, province, region, status, revenue_target) values ('ZZDRL', 'ZZTEST เจาะลึก', 'ตราด', 'ตะวันออก', 'active', 0);
insert into customers (id, dealer_code, name, company, province, join_date) values
  (991001, 'ZZDRL', 'ZZTEST ลูกค้า ก', 'ZZTEST ลูกค้า ก', 'ตราด', '2026-10-03'),
  (991002, 'ZZDRL', 'ZZTEST ลูกค้า ข', 'ZZTEST ลูกค้า ข', 'ตราด', '2026-09-15'),
  (991003, 'ZZDRL', 'ZZTEST ลูกค้า ค', 'ZZTEST ลูกค้า ค', 'ตราด', '2025-12-01');
-- ลีด: เข้ามาในช่วง 6 ราย (ก.ย. 2 · ต.ค. 4) + นอกช่วง 1 (ส.ค. ยังเปิดอยู่) · เปิดอยู่ 4 (ขั้น 1 · ขั้น 2 · ขั้น 5 ×2) · ไม่เคลื่อนไหว >30 วัน 1 (ขั้น 5 ติดต่อ 1 ก.ย. · ขั้น 2 เงียบนานไม่นับ = รอฝั่ง HQ)
--   ปิดสำเร็จในช่วง 2 (ก.ย. 1 · ต.ค. 1) · ไม่สำเร็จในช่วง 1 (ต.ค.)
insert into leads (id, num_id, dealer_code, company, name, phone, province, status, created_date, last_contact_at) values
  ('#L-991011', 991011, 'ZZDRL', 'ZZTEST ล1', 'ZZTEST', '000-000-1011', 'ตราด', 'WAITING',    '2026-10-02', '2026-10-20'),
  ('#L-991012', 991012, 'ZZDRL', 'ZZTEST ล2', 'ZZTEST', '000-000-1012', 'ตราด', 'HQ_PRICING', '2026-10-03', '2026-08-01'),
  ('#L-991013', 991013, 'ZZDRL', 'ZZTEST ล3', 'ZZTEST', '000-000-1013', 'ตราด', 'QUOTED',     '2026-09-05', '2026-09-01'),
  ('#L-991014', 991014, 'ZZDRL', 'ZZTEST ล4', 'ZZTEST', '000-000-1014', 'ตราด', 'QUOTED',     '2026-08-10', '2026-10-25'),
  ('#L-991015', 991015, 'ZZDRL', 'ZZTEST ล5', 'ZZTEST', '000-000-1015', 'ตราด', 'PAID',       '2026-09-20', null),
  ('#L-991016', 991016, 'ZZDRL', 'ZZTEST ล6', 'ZZTEST', '000-000-1016', 'ตราด', 'PAID',       '2026-10-04', null),
  ('#L-991017', 991017, 'ZZDRL', 'ZZTEST ล7', 'ZZTEST', '000-000-1017', 'ตราด', 'CANCELLED',  '2026-10-05', null),
  -- ใบ 0284 (ยุบ 4 ขั้น 9 พ.ย. 69): ได้ราคา HQ + ใบร่าง = ขั้นเสนอราคาลูกค้า (เดิมขั้น 4 ทำใบให้ลูกค้า ไม่นับใน wait) · นอกช่วง ยังเปิดอยู่
  ('#L-991018', 991018, 'ZZDRL', 'ZZTEST ล8', 'ZZTEST', '000-000-1018', 'ตราด', 'HQ_QUOTED',  '2026-08-12', null);
-- ใบ: ส่งในช่วง 3 (ก.ย. 1 · ต.ค. 2 รวมใบที่ตอบรับ) · ร่าง/ถูกแทนที่ไม่นับ · รอลูกค้าตอบตอนนี้ 2 (รวมใบนอกช่วง)
--   ตอบรับในช่วง 2 ใบ (ตามวันตอบรับ: ก.ย. 250,000 · ต.ค. 400,000) · ใบ ต.ค. ที่ออกใบ ก.ย. นับเดือนตามวันตอบรับ
insert into quotations (id, dealer_code, customer, status, total_value, line_items, customer_id, date, won_at) values
  ('ZZDRL-Q1', 'ZZDRL', 'ZZTEST ลูกค้า ก', 'won',            400000, '[]', 991001, '2026-09-28', '2026-10-06 10:00:00+07'),
  ('ZZDRL-Q2', 'ZZDRL', 'ZZTEST ลูกค้า ข', 'won',            250000, '[]', 991002, '2026-09-10', '2026-09-12 10:00:00+07'),
  ('ZZDRL-Q3', 'ZZDRL', 'ZZTEST ล3',      'sent_to_client', 50000,  '[]', null,   '2026-10-08', null),
  ('ZZDRL-Q4', 'ZZDRL', 'ZZTEST ล4',      'sent_to_client', 60000,  '[]', null,   '2026-08-20', null),
  ('ZZDRL-Q5', 'ZZDRL', 'ZZTEST ล3',      'draft',          70000,  '[]', null,   '2026-10-09', null),
  ('ZZDRL-Q6', 'ZZDRL', 'ZZTEST ล3',      'superseded',     80000,  '[]', null,   '2026-10-01', null);
insert into quotations (id, dealer_code, customer, status, total_value, line_items, date, deal_id) values
  ('ZZDRL-Q7', 'ZZDRL', 'ZZTEST ล8', 'draft', 90000, '[]', '2026-10-10', 991018);
insert into quotation_won_at (dealer_code, quote_id, won_at) values
  ('ZZDRL', 'ZZDRL-Q1', '2026-10-06 10:00+07'), ('ZZDRL', 'ZZDRL-Q2', '2026-09-12 10:00+07');
-- แม่แบบวัสดุ: ใช้แล้ว 1 (อยู่ในรายการประเมินของคำขอ) · ยังไม่เคยใช้ 1
insert into material_templates (id, category, name, unit, unit_price) values
  (991051, 'ZZTEST', 'ZZTEST วัสดุที่ใช้แล้ว', 'ชุด', 1000), (991052, 'ZZTEST', 'ZZTEST วัสดุยังไม่ใช้', 'ชุด', 2000);
insert into quote_requests (id, request_no, dealer_code, lead_num_id, product, status, due_at, estimate_items) values
  (991061, 'RQ-ZZDRL-1', 'ZZDRL', 991012, 'ZZTEST', 'new', now(),
   '[{"templateId": 991051, "category": "ZZTEST", "name": "ZZTEST วัสดุที่ใช้แล้ว", "unit": "ชุด", "qty": 2, "unitPrice": 1000}]');
set local session_replication_role = origin;

do $$
declare
  d jsonb; q jsonb; c jsonb; pl jsonb; k jsonb; x jsonb; ทุก text[];
  -- บัญชี HQ จริง (บันทึกแม่แบบต้องผ่าน can_write_master) — หาตอนต้นบล็อก (สิทธิ์ผู้ดูแลฐาน) ก่อนสวมสิทธิ์ดีลเลอร์ที่มองไม่เห็นบัญชีอื่น
  hq uuid := (select id from profiles where role = 'SUPER_ADMIN' and status = 'active' limit 1);
begin
  perform drtest.as_user('SUPER_ADMIN', '');
  d := hq_drill('leads', '2026-09-01', '2026-10-27', '2026-10-27');
  q := hq_drill('quotations', '2026-09-01', '2026-10-27', '2026-10-27');
  c := hq_drill('customers', '2026-09-01', '2026-10-27', '2026-10-27');

  -- ══ 1) แถวของสาขาของข้อ = ค่าที่รู้ ══
  x := drtest.row(d, 'ZZDRL');
  perform drtest.ok(x - 'name' = '{"code":"ZZDRL","region":"ตะวันออก","province":"ตราด","leads":6,"open":5,"qr":1,"wait":3,"stale":1,"won":2,"lost":1}'::jsonb,
    format('ลีด ZZDRL: ใหม่ 6 · เปิดอยู่ 5 · รอราคา HQ 1 · เสนอราคาลูกค้า 3 (ส่งแล้ว 2 + ทำใบแล้วยังไม่ส่ง 1 · ใบ 0284) · ไม่เคลื่อนไหว 1 · ปิดสำเร็จ 2 · ไม่สำเร็จ 1 (ได้ %s)', x));
  x := drtest.row(q, 'ZZDRL');
  perform drtest.ok(x - 'name' = '{"code":"ZZDRL","region":"ตะวันออก","province":"ตราด","sent":3,"wait":2,"won":2,"sales":650000}'::jsonb,
    format('ใบ ZZDRL: ส่ง 3 (ร่าง/ถูกแทนที่ไม่นับ) · รอตอบ 2 · ตอบรับ 2 ใบ 650,000 (ได้ %s)', x));
  x := drtest.row(c, 'ZZDRL');
  perform drtest.ok(x - 'name' = '{"code":"ZZDRL","region":"ตะวันออก","province":"ตราด","cust":3,"newc":2}'::jsonb,
    format('ลูกค้า ZZDRL: ทั้งหมด 3 · ใหม่ในช่วง 2 (ได้ %s)', x));
  perform drtest.ok(drtest.row(d, 'HQ') is null and drtest.row(q, 'HQ') is null and drtest.row(c, 'HQ') is null, 'ไม่มีแถว HQ ในทุกหน้า');

  -- รายเดือนของสาขา (ลีด = วันเข้ามา · ใบ = วันออกใบ/วันตอบรับ · ลูกค้า = วันเป็นลูกค้า)
  perform drtest.ok((select jsonb_agg(r - 'code' order by (r->>'y')::int, (r->>'m')::int) from jsonb_array_elements(d->'months') r where r->>'code' = 'ZZDRL')
                    = '[{"y":2026,"m":8,"leads":2,"won":1,"lost":0},{"y":2026,"m":9,"leads":4,"won":1,"lost":1}]'::jsonb,
    'ลีดรายเดือน ZZDRL: ก.ย. ใหม่ 2 ปิดได้ 1 · ต.ค. ใหม่ 4 ปิดได้ 1 ไม่ได้ 1');
  perform drtest.ok((select jsonb_agg(r - 'code' order by (r->>'y')::int, (r->>'m')::int) from jsonb_array_elements(q->'months') r where r->>'code' = 'ZZDRL')
                    = '[{"y":2026,"m":8,"sent":2,"won":1,"sales":250000},{"y":2026,"m":9,"sent":1,"won":1,"sales":400000}]'::jsonb,
    'ใบรายเดือน ZZDRL: ก.ย. ส่ง 2 ตอบรับ 1 (250,000) · ต.ค. ส่ง 1 ตอบรับ 1 (400,000 · ออกใบ ก.ย. นับตามวันตอบรับ)');
  perform drtest.ok((select jsonb_agg(r - 'code' order by (r->>'y')::int, (r->>'m')::int) from jsonb_array_elements(c->'months') r where r->>'code' = 'ZZDRL')
                    = '[{"y":2026,"m":8,"newc":1},{"y":2026,"m":9,"newc":1}]'::jsonb, 'ลูกค้าใหม่รายเดือน ZZDRL: ก.ย. 1 · ต.ค. 1');

  -- ══ 2) ทุกหน้า: ผลรวมแถวรายดีลเลอร์ = การ์ด · ผลรวมรายเดือน = แถวรายดีลเลอร์ (ทั้งเครือ + กรองสาขา) ══
  foreach ทุก slice 1 in array array[array[null::text], array['ZZDRL']] loop
    if ทุก[1] is null then ทุก := null; end if;
    k := kpi_cards('hq.leads', '2026-09-01', '2026-10-27', null, '2026-10-27', case when ทุก is null then null else jsonb_build_object('dealerCodes', to_jsonb(ทุก)) end);
    perform drtest.ok((k->>'open')::numeric = drtest.sum(d, 'open', ทุก) and (k->>'new')::numeric = drtest.sum(d, 'leads', ทุก)
                  and (k->>'qr')::numeric = drtest.sum(d, 'qr', ทุก) and (k->>'idle')::numeric = drtest.sum(d, 'stale', ทุก),
      format('ลีด %s: การ์ด = ผลรวมแถวรายดีลเลอร์ (การ์ด %s)', coalesce(array_to_string(ทุก, ','), 'ทั้งเครือ'), k));
    perform drtest.ok(drtest.msum(d, 'leads', ทุก) = drtest.sum(d, 'leads', ทุก) and drtest.msum(d, 'won', ทุก) = drtest.sum(d, 'won', ทุก)
                  and drtest.msum(d, 'lost', ทุก) = drtest.sum(d, 'lost', ทุก), 'ลีด: ผลรวมรายเดือน = แถวรายดีลเลอร์ (ใหม่ · ปิดสำเร็จ · ไม่สำเร็จ)');
    k := kpi_cards('hq.quotations', '2026-09-01', '2026-10-27', null, '2026-10-27', case when ทุก is null then null else jsonb_build_object('dealerCodes', to_jsonb(ทุก)) end);
    perform drtest.ok((k->>'sent')::numeric = drtest.sum(q, 'sent', ทุก) and (k->>'awaiting')::numeric = drtest.sum(q, 'wait', ทุก)
                  and (k#>>'{won,count}')::numeric = drtest.sum(q, 'won', ทุก) and (k#>>'{won,value}')::numeric = drtest.sum(q, 'sales', ทุก)
                  and (k->>'acceptRate') is not distinct from (case when drtest.sum(q, 'sent', ทุก) = 0 then null
                                                                     else round(100.0 * drtest.sum(q, 'won', ทุก) / drtest.sum(q, 'sent', ทุก), 1)::text end),
      format('ใบ %s: การ์ด = ผลรวมแถวรายดีลเลอร์ (การ์ด %s)', coalesce(array_to_string(ทุก, ','), 'ทั้งเครือ'), k));
    perform drtest.ok(drtest.msum(q, 'sent', ทุก) = drtest.sum(q, 'sent', ทุก) and drtest.msum(q, 'won', ทุก) = drtest.sum(q, 'won', ทุก)
                  and drtest.msum(q, 'sales', ทุก) = drtest.sum(q, 'sales', ทุก), 'ใบ: ผลรวมรายเดือน = แถวรายดีลเลอร์ (ส่ง · ตอบรับ · มูลค่า)');
    k := kpi_cards('hq.customers', '2026-09-01', '2026-10-27', null, '2026-10-27', case when ทุก is null then null else jsonb_build_object('dealerCodes', to_jsonb(ทุก)) end);
    perform drtest.ok((k->>'total')::numeric = drtest.sum(c, 'cust', ทุก) and (k->>'new')::numeric = drtest.sum(c, 'newc', ทุก)
                  and (k#>>'{dealers,with}')::int = (select count(*) from jsonb_array_elements(c->'dealers') r where (ทุก is null or r->>'code' = any(ทุก)) and (r->>'cust')::int > 0)
                  and (k#>>'{dealers,of}')::int = (select count(*) from jsonb_array_elements(c->'dealers') r where ทุก is null or r->>'code' = any(ทุก)),
      format('ลูกค้า %s: การ์ด = ผลรวมแถวรายดีลเลอร์ (การ์ด %s)', coalesce(array_to_string(ทุก, ','), 'ทั้งเครือ'), k));
    perform drtest.ok(drtest.msum(c, 'newc', ทุก) = drtest.sum(c, 'newc', ทุก), 'ลูกค้า: ผลรวมรายเดือน = แถวรายดีลเลอร์ (ลูกค้าใหม่)');
  end loop;

  -- ══ 3) ตัวเลขชุดเดียวกันตรงกันข้ามหน้า (ภาพรวมยอดขาย hq_pipeline_dealers) ══
  pl := jsonb_build_object('dealers', hq_pipeline_dealers('2026-09-01', '2026-10-27', null, '2026-10-27'));
  perform drtest.ok(drtest.sum(d, 'won') = drtest.sum(pl, 'won') and drtest.sum(d, 'lost') = drtest.sum(pl, 'lost') and drtest.sum(d, 'leads') = drtest.sum(pl, 'leads'),
    format('ลีด ปิดสำเร็จ/ไม่สำเร็จ/ลีดใหม่ = ภาพรวมยอดขาย (ลีด %s/%s/%s · ภาพรวม %s/%s/%s)', drtest.sum(d, 'won'), drtest.sum(d, 'lost'), drtest.sum(d, 'leads'),
      drtest.sum(pl, 'won'), drtest.sum(pl, 'lost'), drtest.sum(pl, 'leads')));
  perform drtest.ok(drtest.sum(q, 'sales') = drtest.sum(pl, 'sales') and drtest.sum(q, 'sent') = drtest.sum(pl, 'quotes'),
    format('มูลค่าตอบรับ = ยอดขาย · ใบที่ส่ง = ใบเสนอราคาของภาพรวม (ใบ %s/%s · ภาพรวม %s/%s)', drtest.sum(q, 'sales'), drtest.sum(q, 'sent'), drtest.sum(pl, 'sales'), drtest.sum(pl, 'quotes')));
  perform drtest.ok(drtest.sum(d, 'won', array['ZZDRL']) = drtest.sum(pl, 'won', array['ZZDRL']) and drtest.sum(q, 'sales', array['ZZDRL']) = drtest.sum(pl, 'sales', array['ZZDRL']),
    'สาขา ZZDRL: ปิดสำเร็จ 2 และยอด 650,000 ตรงภาพรวมยอดขาย');
  perform drtest.ok((kpi_cards('hq.pipeline', '2026-09-01', '2026-10-27', null, '2026-10-27')#>>'{sales,value}')::numeric = drtest.sum(q, 'sales'),
    'มูลค่าตอบรับทั้งเครือ = การ์ดยอดขายของภาพรวมยอดขาย');

  -- ══ 4) รายชื่อลูกค้ากรองชุดดีลเลอร์ · สิทธิ์ ══
  x := hq_customers_page(null, null, null, null, null, null, 50, 0, array['ZZDRL']);
  perform drtest.ok((x->>'total')::int = 3 and (select bool_and(r->>'dealer_code' = 'ZZDRL') from jsonb_array_elements(x->'rows') r),
    format('รายชื่อลูกค้าตามชุดดีลเลอร์ ZZDRL = 3 ราย ของสาขานี้เท่านั้น (ได้ %s ราย)', x->>'total'));
  perform drtest.must_fail($q$select hq_drill('nope', '2026-09-01', '2026-10-27')$q$, 'invalid_page', 'ชื่อหน้าไม่รู้จัก = ปฏิเสธ');
  perform drtest.must_fail($q$select hq_drill('leads', '2026-10-27', '2026-09-01')$q$, 'bad_range', 'ช่วงกลับด้าน = ปฏิเสธ');
  perform drtest.as_user('DEALER_ADMIN', 'ZZDRL');
  perform drtest.must_fail($q$select hq_drill('leads', '2026-09-01', '2026-10-27')$q$, 'forbidden', 'ดีลเลอร์เรียกเจาะลึกของ HQ ไม่ได้');
  perform drtest.ok(material_templates_used() = '{}'::bigint[], 'ดีลเลอร์ถามวัสดุที่เคยใช้ = ว่าง (เฉพาะ HQ)');

  -- ══ 5) แม่แบบวัสดุ: ลบได้เฉพาะที่ยังไม่เคยใช้ ══
  perform drtest.ok(hq is not null, 'มีบัญชี HQ จริง');
  perform drtest.as_user('SUPER_ADMIN', '', hq);
  perform drtest.ok(991051 = any(material_templates_used()) and not (991052 = any(material_templates_used())), 'วัสดุที่อยู่ในคำขอ = เคยใช้ · อีกตัว = ยังไม่เคยใช้');
  perform drtest.must_fail($q$select count(*) from material_templates_save('[]'::jsonb, array[991051]::bigint[])$q$, 'material_in_use',
    'ลบวัสดุที่เคยใช้ผ่านปุ่มบันทึก = ฐานปฏิเสธ (ปิดใช้แทน)');
  perform drtest.as_root();
  perform drtest.must_fail($q$delete from material_templates where id = 991051$q$, 'material_in_use', 'ลบวัสดุที่เคยใช้ด้วยคำสั่งตรง = ฐานปฏิเสธ');
  delete from material_templates where id = 991052;
  perform drtest.ok(not exists (select 1 from material_templates where id = 991052), 'วัสดุที่ยังไม่เคยใช้ ลบได้');
  update material_templates set active = false where id = 991051;
  perform drtest.ok((select not active from material_templates where id = 991051), 'วัสดุที่เคยใช้ ปิดใช้ได้');
end $$;

select 'ALL PASS' as result;
rollback;
