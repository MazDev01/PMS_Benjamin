-- ── ข้อทดสอบใบ 0272: ส่วนต่างรายใบของหน้าใบเสนอราคาทั้งเครือ (บอสสั่ง 2 พ.ย. 69) ──
--   1) ใบที่ทำจากใบ HQ: ราคาส่ง HQ = ราคาของใบ HQ · ราคาขาย = มูลค่าใบ (ก่อน VAT) · ส่วนต่าง ฿/% ตรงค่าที่รู้ · ลำดับตามที่ขอ
--   2) ใบที่ไม่ได้ทำจากใบ HQ / ไม่มีอยู่ = ไม่มีแถว (หน้าจอขึ้น "—" ไม่กุ)
--   3) เฉลี่ยถ่วงของใบตอบรับในช่วง (Σ ส่วนต่าง ÷ Σ ขาย) = การ์ดส่วนต่างกำไรเฉลี่ย (kpi_cards hq.pipeline) ของสาขาเดียวกัน
--   4) สิทธิ์: ดีลเลอร์เรียก hq_quote_margins ไม่ได้ · ดีลเลอร์ดูส่วนต่าง/ใบของสาขาอื่นไม่ได้ (quotation_margin = null · ไม่เห็นแถว)
--   ตกบนโค้ดก่อนใบ 0272: ไม่มี hq_quote_margins
-- รัน: docker exec -i <คอนเทนเนอร์ฐานทดสอบ> psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 < supabase/tests/hq_quote_margins.sql
begin;
set transaction isolation level repeatable read;
create schema mgtest;
create function mgtest.ok(p_cond boolean, p_what text) returns void language plpgsql as $$
begin if p_cond is not true then raise exception 'FAIL: %', p_what; end if; raise notice 'ok  %', p_what; end $$;
create function mgtest.must_fail(p_sql text, p_like text, p_what text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if sqlerrm ilike '%' || p_like || '%' then raise notice 'ok  % (ถูกปฏิเสธ)', p_what; return; end if;
    raise exception 'FAIL: % — ถูกปฏิเสธแต่ข้อความไม่ตรง: %', p_what, sqlerrm;
  end;
  raise exception 'FAIL: % — ควรถูกปฏิเสธแต่ผ่าน', p_what;
end $$;
create function mgtest.as_user(p_role text, p_dealer text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated',
    'user_role', p_role, 'dealer_code', p_dealer, 'email', 'zzmargin@example.test')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
grant usage on schema mgtest to authenticated;
grant execute on all functions in schema mgtest to authenticated;

-- ═══ ข้อมูลของข้อ: ZZMRG (ตราด) + ZZMR2 (สาขาอื่น) · ช่วง 1 ก.ย.–27 ต.ค. 2026 (ปิดตัวดัก — ใส่สถานะปลายทางตรง) ═══
--   ZZMRG: Q1 ตอบรับ ต.ค. ขาย 1,000,000 ราคาส่ง 800,000 (ต่าง 200,000 · 20.0%) · Q2 ตอบรับ ก.ย. ขาย 500,000 ราคาส่ง 450,000 (ต่าง 50,000 · 10.0%)
--          Q3 ส่งแล้ว ขาย 100,000 ราคาส่ง 90,000 (ไม่นับในการ์ด — ยังไม่ตอบรับ) · Q4 ตอบรับ 300,000 ไม่ได้ทำจากใบ HQ (ไม่มีแถว · การ์ดก็ไม่นับ)
--          Q5 ตอบรับ ส.ค. (นอกช่วง) ขาย 200,000 ราคาส่ง 100,000 → การ์ดไม่นับ
--   เฉลี่ยถ่วงในช่วง = (200,000 + 50,000) ÷ 1,500,000 = 16.67% → 16.7
set local session_replication_role = replica;
insert into dealers (code, name, province, region, status, revenue_target) values
  ('ZZMRG', 'ZZTEST ส่วนต่าง', 'ตราด', 'ตะวันออก', 'active', 0), ('ZZMR2', 'ZZTEST ส่วนต่าง 2', 'ตราด', 'ตะวันออก', 'active', 0);
-- ใบตอบรับต้องผูกลูกค้า (quotations_won_requires_customer)
insert into customers (id, dealer_code, name, company, province, join_date) values
  (992201, 'ZZMRG', 'ZZTEST ก', 'ZZTEST ก', 'ตราด', '2026-09-01'), (992202, 'ZZMRG', 'ZZTEST ข', 'ZZTEST ข', 'ตราด', '2026-09-01'),
  (992204, 'ZZMRG', 'ZZTEST ง', 'ZZTEST ง', 'ตราด', '2026-09-01'), (992205, 'ZZMRG', 'ZZTEST จ', 'ZZTEST จ', 'ตราด', '2026-08-01'),
  (992209, 'ZZMR2', 'ZZTEST ฉ', 'ZZTEST ฉ', 'ตราด', '2026-09-01');
insert into quote_requests (id, request_no, dealer_code, lead_num_id, product, status, due_at) values
  (992001, 'RQ-ZZMRG-1', 'ZZMRG', 992101, 'ZZTEST', 'quoted', now()), (992002, 'RQ-ZZMRG-2', 'ZZMRG', 992102, 'ZZTEST', 'quoted', now()),
  (992003, 'RQ-ZZMRG-3', 'ZZMRG', 992103, 'ZZTEST', 'quoted', now()), (992005, 'RQ-ZZMRG-5', 'ZZMRG', 992105, 'ZZTEST', 'quoted', now()),
  (992009, 'RQ-ZZMR2-1', 'ZZMR2', 992109, 'ZZTEST', 'quoted', now());
insert into hq_quotes (id, request_id, version, quote_no, status, total_cost) values
  (992011, 992001, 1, 'HQ-ZZMRG-1', 'ordered', 800000), (992012, 992002, 1, 'HQ-ZZMRG-2', 'ordered', 450000),
  (992013, 992003, 1, 'HQ-ZZMRG-3', 'sent', 90000), (992015, 992005, 1, 'HQ-ZZMRG-5', 'ordered', 100000),
  (992019, 992009, 1, 'HQ-ZZMR2-1', 'ordered', 70000);
insert into quotations (id, dealer_code, customer, status, total_value, line_items, date, won_at, hq_quote_id, customer_id) values
  ('ZZMRG-Q1', 'ZZMRG', 'ZZTEST ก', 'won',            1000000, '[]', '2026-09-28', '2026-10-06 10:00:00+07', 992011, 992201),
  ('ZZMRG-Q2', 'ZZMRG', 'ZZTEST ข', 'won',            500000,  '[]', '2026-09-10', '2026-09-12 10:00:00+07', 992012, 992202),
  ('ZZMRG-Q3', 'ZZMRG', 'ZZTEST ค', 'sent_to_client', 100000,  '[]', '2026-10-08', null,                     992013, null),
  ('ZZMRG-Q4', 'ZZMRG', 'ZZTEST ง', 'won',            300000,  '[]', '2026-10-01', '2026-10-02 10:00:00+07', null,   992204),
  ('ZZMRG-Q5', 'ZZMRG', 'ZZTEST จ', 'won',            200000,  '[]', '2026-08-01', '2026-08-05 10:00:00+07', 992015, 992205),
  ('ZZMR2-Q1', 'ZZMR2', 'ZZTEST ฉ', 'won',            100000,  '[]', '2026-10-01', '2026-10-03 10:00:00+07', 992019, 992209);
insert into quotation_won_at (dealer_code, quote_id, won_at) values
  ('ZZMRG', 'ZZMRG-Q1', '2026-10-06 10:00+07'), ('ZZMRG', 'ZZMRG-Q2', '2026-09-12 10:00+07'), ('ZZMRG', 'ZZMRG-Q4', '2026-10-02 10:00+07'),
  ('ZZMRG', 'ZZMRG-Q5', '2026-08-05 10:00+07'), ('ZZMR2', 'ZZMR2-Q1', '2026-10-03 10:00+07');
set local session_replication_role = origin;

do $$
declare
  m jsonb; การ์ด jsonb; ถ่วง numeric;
  -- ใบตอบรับในช่วงของ ZZMRG (ตามวันตอบรับ = ชุดเดียวกับการ์ด) — อ่านตอนต้นบล็อก (สิทธิ์ผู้ดูแลฐาน) ก่อนสวมสิทธิ์ผู้ใช้
  ตอบรับ text[] := array(select q.id from quotations q join quotation_won_at w on w.dealer_code = q.dealer_code and w.quote_id = q.id
                         where q.dealer_code = 'ZZMRG' and q.status = 'won' and (w.won_at at time zone 'Asia/Bangkok')::date between '2026-09-01' and '2026-10-27' order by q.id);
begin
  perform mgtest.as_user('SUPER_ADMIN', '');
  -- ══ 1) ค่าที่รู้รายใบ + ลำดับตามที่ขอ ══
  m := hq_quote_margins(array['ZZMRG','ZZMRG','ZZMRG','ZZMRG','ZZMRG','ZZMRG'], array['ZZMRG-Q3','ZZMRG-Q1','ZZMRG-Q2','ZZMRG-Q4','ZZMRG-Q5','ไม่มีใบนี้']);
  perform mgtest.ok(jsonb_array_length(m) = 4, format('ใบที่ทำจากใบ HQ 4 ใบ = 4 แถว (Q4 ไม่ผูกใบ HQ · เลขที่ไม่มีจริง = ไม่มีแถว) (ได้ %s)', m));
  perform mgtest.ok(m -> 0 = '{"dealer":"ZZMRG","id":"ZZMRG-Q3","hqQuoteNo":"HQ-ZZMRG-3","hqCost":90000,"sale":100000,"baht":10000,"pct":10.0}'::jsonb,
    format('Q3: ราคาส่ง 90,000 · ขาย 100,000 · ต่าง 10,000 · 10.0%% (ได้ %s)', m -> 0));
  perform mgtest.ok(m -> 1 = '{"dealer":"ZZMRG","id":"ZZMRG-Q1","hqQuoteNo":"HQ-ZZMRG-1","hqCost":800000,"sale":1000000,"baht":200000,"pct":20.0}'::jsonb,
    format('Q1: ราคาส่ง 800,000 · ขาย 1,000,000 · ต่าง 200,000 · 20.0%% (ได้ %s)', m -> 1));
  perform mgtest.ok(m -> 2 ->> 'id' = 'ZZMRG-Q2' and (m -> 2 ->> 'baht')::numeric = 50000 and (m -> 2 ->> 'pct')::numeric = 10.0, 'Q2: ต่าง 50,000 · 10.0%');
  perform mgtest.ok(m -> 3 ->> 'id' = 'ZZMRG-Q5', 'ลำดับแถว = ลำดับที่ขอ (Q3 · Q1 · Q2 · Q5)');
  perform mgtest.ok(hq_quote_margins('{}', '{}') = '[]'::jsonb, 'ไม่ขอใบใด = รายการว่าง');
  perform mgtest.must_fail($q$select hq_quote_margins(array['ZZMRG'], '{}')$q$, 'bad_keys', 'รหัสสาขากับเลขที่จำนวนไม่เท่ากัน = ปฏิเสธ');

  -- ══ 3) เฉลี่ยถ่วงของใบตอบรับในช่วง = การ์ดส่วนต่างกำไรเฉลี่ย ══
  perform mgtest.ok(ตอบรับ = array['ZZMRG-Q1','ZZMRG-Q2','ZZMRG-Q4'], format('ใบตอบรับในช่วง Q1 · Q2 · Q4 (Q5 นอกช่วง) (ได้ %s)', ตอบรับ));
  m := hq_quote_margins(array_fill('ZZMRG'::text, array[cardinality(ตอบรับ)]), ตอบรับ);
  select round(100.0 * sum((r ->> 'baht')::numeric) / sum((r ->> 'sale')::numeric), 1) into ถ่วง from jsonb_array_elements(m) r;
  การ์ด := kpi_cards('hq.pipeline', '2026-09-01', '2026-10-27', 'ZZMRG', '2026-10-27');
  perform mgtest.ok(ถ่วง = 16.7, format('เฉลี่ยถ่วงของใบตอบรับในช่วง = 250,000 ÷ 1,500,000 = 16.7%% (ได้ %s)', ถ่วง));
  perform mgtest.ok((การ์ด -> 'margin' ->> 'pct')::numeric = ถ่วง and (การ์ด -> 'margin' ->> 'quotes')::int = jsonb_array_length(m),
    format('การ์ดส่วนต่างกำไรเฉลี่ย = เฉลี่ยถ่วงจากรายใบ · จำนวนใบเท่ากัน (การ์ด %s)', การ์ด -> 'margin'));

  -- ══ 4) สิทธิ์ ══
  perform mgtest.as_user('DEALER', 'ZZMRG');
  perform mgtest.must_fail($q$select hq_quote_margins(array['ZZMRG'], array['ZZMRG-Q1'])$q$, 'forbidden', 'ดีลเลอร์เรียกส่วนต่างรายใบของ HQ ไม่ได้ (แม้ใบตัวเอง)');
  perform mgtest.must_fail($q$select hq_quote_margins(array['ZZMR2'], array['ZZMR2-Q1'])$q$, 'forbidden', 'ดีลเลอร์เรียกส่วนต่างของสาขาอื่นไม่ได้');
  perform mgtest.ok(quotation_margin('ZZMR2', 'ZZMR2-Q1') is null, 'ดีลเลอร์ดูส่วนต่างรายบรรทัดของสาขาอื่นไม่ได้ (null)');
  perform mgtest.ok(not exists (select 1 from quotations where dealer_code = 'ZZMR2'), 'ดีลเลอร์มองไม่เห็นใบของสาขาอื่น');
  perform mgtest.ok(not exists (select 1 from hq_quotes where id = 992019), 'ดีลเลอร์มองไม่เห็นราคาส่ง HQ ของสาขาอื่น');
end $$;

select 'ALL PASS' as result;
rollback;
