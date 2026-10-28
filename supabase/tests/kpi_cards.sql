-- ── ใบ 0246: การ์ด KPI 4 ใบทุกหน้า (kpi_cards) — ตัวเลขตรงกับข้อมูลที่รู้ค่าล่วงหน้า · สิทธิ์แยกสาขา/HQ ─────────────
-- รัน: docker exec -i <คอนเทนเนอร์ฐานทดสอบ> psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/kpi_cards.sql
-- หน้าดีลเลอร์: สาขาทดสอบ ZZK ที่สร้างในรายการนี้ (ตัวเลขเป๊ะ) · หน้า HQ (ทั้งเครือ): ถ่ายค่าก่อน → ใส่ข้อมูลที่รู้ค่า → ต้องเพิ่มเท่าที่ใส่เป๊ะ
--   ล็อกตารางที่นับไว้จนจบรายการ (ข้อทดสอบอื่นที่รันพร้อมกันเขียนแทรกไม่ได้ · บทเรียน hq_overview 26 ต.ค. 69) · ย้อนทั้งหมดตอนจบ
-- วันอ้างอิง 27 ต.ค. 2026 (อังคาร) · สัปดาห์ = 26 ต.ค.–1 พ.ย. · ช่วงที่เลือก = 1–27 ต.ค.
begin;
create schema flowtest;
create function flowtest.ok(p_cond boolean, p_what text) returns void language plpgsql as $$
begin if p_cond is not true then raise exception 'FAIL: %', p_what; end if; raise notice 'ok  %', p_what; end $$;
create function flowtest.must_fail(p_sql text, p_like text, p_what text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if sqlerrm ilike '%' || p_like || '%' then raise notice 'ok  % (ถูกปฏิเสธ)', p_what; return; end if;
    raise exception 'FAIL: % — ถูกปฏิเสธแต่ข้อความไม่ตรง: %', p_what, sqlerrm;
  end;
  raise exception 'FAIL: % — ควรถูกปฏิเสธแต่ผ่าน', p_what;
end $$;
create function flowtest.as_user(p_role text, p_dealer text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated',
    'user_role', p_role, 'dealer_code', p_dealer, 'email', 'zzkpi@example.test')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function flowtest.as_root() returns void language plpgsql as $$
begin perform set_config('role', 'none', true); perform set_config('request.jwt.claims', '', true); end $$;
grant usage on schema flowtest to authenticated;
grant execute on all functions in schema flowtest to authenticated;
create table flowtest.ก่อน (หน้า text primary key, ค่า jsonb);
grant all on flowtest.ก่อน to authenticated;

lock table leads, quotations, quotation_won_at, customers, appointments, dealers, dealer_prospects, dealer_package_proposals,
  dealer_proposal_payments, hq_quotes, quote_requests, audit_log in share row exclusive mode;

-- ═══ ถ่ายค่าหน้า HQ ก่อนใส่ข้อมูล ═══
do $$
declare หน้า text;
begin
  perform flowtest.as_user('SUPER_ADMIN', '');
  foreach หน้า in array array['hq.prospects', 'hq.proposals', 'hq.dealers', 'hq.leads', 'hq.quotations', 'hq.customers', 'hq.audit'] loop
    insert into flowtest.ก่อน values (หน้า, kpi_cards(หน้า, '2026-10-01', '2026-10-27', null, '2026-10-27'));
  end loop;
end $$;

-- ═══ ข้อมูลที่รู้ค่า (สาขา ZZK ใหม่ · ปิดตัวดักระหว่างใส่) ═══
select flowtest.as_root();
set local session_replication_role = replica;
insert into dealers (code, name, province, revenue_target, status) values ('ZZK', 'ZZK สาขาทดสอบ KPI', 'ระยอง', 1000000, 'active'),
                                                                         ('ZZI', 'ZZI สาขาเงียบ', 'ตราด', 0, 'active');
insert into customers (id, dealer_code, name, company, join_date) values
  (990001, 'ZZK', 'ZZK ลูกค้า 1', 'ZZK ลูกค้า 1', '2026-10-03'), (990002, 'ZZK', 'ZZK ลูกค้า 2', 'ZZK ลูกค้า 2', '2026-01-01');
insert into leads (id, num_id, dealer_code, company, name, phone, province, status, created_date, quote_value, customer_id, last_contact_at) values
  ('#L-ZZK1', 1, 'ZZK', 'ZZK ล1', 'ZZK ล1', '000-000-0001', 'ระยอง', 'WAITING',    '2026-10-05', 100000, 990001, '2026-10-20'),
  ('#L-ZZK2', 2, 'ZZK', 'ZZK ล2', 'ZZK ล2', '000-000-0002', 'ระยอง', 'HQ_PRICING', '2026-10-06', null, null, '2026-10-20'),
  ('#L-ZZK3', 3, 'ZZK', 'ZZK ล3', 'ZZK ล3', '000-000-0003', 'ระยอง', 'HQ_QUOTED',  '2026-10-07', null, null, '2026-10-20'),
  ('#L-ZZK4', 4, 'ZZK', 'ZZK ล4', 'ZZK ล4', '000-000-0004', 'ระยอง', 'HQ_QUOTED',  '2026-10-08', null, null, '2026-10-20'),
  ('#L-ZZK5', 5, 'ZZK', 'ZZK ล5', 'ZZK ล5', '000-000-0005', 'ระยอง', 'QUOTED',     '2026-10-09', 200000, null, '2026-10-20'),
  ('#L-ZZK6', 6, 'ZZK', 'ZZK ล6', 'ZZK ล6', '000-000-0006', 'ระยอง', 'NEGO',       '2026-08-01', null, null, '2026-08-05'),
  ('#L-ZZK7', 7, 'ZZK', 'ZZK ล7', 'ZZK ล7', '000-000-0007', 'ระยอง', 'PAID',       '2026-10-09', null, null, null),
  ('#L-ZZK8', 8, 'ZZK', 'ZZK ล8', 'ZZK ล8', '000-000-0008', 'ระยอง', 'PAID',       '2026-09-01', null, null, null),
  ('#L-ZZK9', 9, 'ZZK', 'ZZK ล9', 'ZZK ล9', '000-000-0009', 'ระยอง', 'CANCELLED',  '2026-10-10', null, null, null),
  ('#L-ZZKH', 9001, 'HQ', 'ZZK ลีด HQ', 'ZZK ลีด HQ', '000-000-0010', 'ตราด', 'WAITING', '2026-10-11', null, null, null);
insert into quote_requests (id, request_no, dealer_code, lead_num_id, product, status, due_at)
  values (990601, 'RQ-ZZK-1', 'ZZK', 7, 'ZZK งาน', 'won', now());
insert into hq_quotes (id, request_id, version, quote_no, status, line_items, total_cost)
  values (990501, 990601, 1, 'HQ-ZZK-1', 'ordered', '[]', 240000);
insert into quotations (id, dealer_code, customer, status, total_value, date, expiry, deal_id, hq_quote_id, customer_id) values
  ('ZZK-Q1', 'ZZK', 'ZZK ล4', 'draft',          0,      '2026-10-08', null,         4, null, null),
  ('ZZK-Q2', 'ZZK', 'ZZK ล5', 'sent_to_client', 50000,  '2026-10-10', '2026-10-29', 5, null, null),
  ('ZZK-Q3', 'ZZK', 'ZZK ล5', 'sent_to_client', 70000,  '2026-10-11', '2026-11-15', 5, null, null),
  ('ZZK-Q4', 'ZZK', 'ZZK ล6', 'sent_to_client', 10000,  '2026-09-30', null,         6, null, null),
  ('ZZK-Q5', 'ZZK', 'ZZK ล7', 'won',            300000, '2026-10-12', null,         7, 990501, 990001),
  ('ZZK-Q6', 'ZZK', 'ZZK ล8', 'won',            200000, '2026-03-01', null,         8, null, 990002),
  ('ZZK-Q7', 'ZZK', 'ZZK ล5', 'superseded',     999999, '2026-10-01', null,         5, null, null);
-- อายุใบของสาขา 30 วัน (ใบ ZZK-Q4 ไม่มีวันหมดอายุในใบ → 30 ก.ย. + 30 = 30 ต.ค. = ใกล้หมดอายุ)
insert into dealer_settings (dealer_code, document) values ('ZZK', '{"validityDays": 30}')
  on conflict (dealer_code) do update set document = excluded.document;
insert into quotation_won_at (dealer_code, quote_id, won_at) values ('ZZK', 'ZZK-Q5', '2026-10-15 10:00+07'), ('ZZK', 'ZZK-Q6', '2026-03-01 10:00+07');
insert into appointments (id, dealer_code, company, date, status) values
  (990701, 'ZZK', 'ZZK นัด1', '2026-10-27', 'scheduled'), (990702, 'ZZK', 'ZZK นัด2', '2026-10-28', 'done'),
  (990703, 'ZZK', 'ZZK นัด3', '2026-10-20', 'scheduled'), (990704, 'ZZK', 'ZZK นัด4', '2026-10-25', 'done'),
  (990705, 'ZZK', 'ZZK นัด5', '2026-11-01', 'upcoming'),
  -- นัดเลยกำหนดที่ยกเลิกแล้ว ไม่ใช่ "ยังไม่ปิด" (ใบ 0253 · ตารางเทียบ FLOW รอบ 5 แถว D19) — 0246 นับเป็น 2
  (990706, 'ZZK', 'ZZK นัด6', '2026-10-21', 'cancelled');
-- ผู้สนใจ + ใบค่าแฟรนไชส์ (ทั้งเครือ)
insert into dealer_prospects (id, name, status, follow_up, converted_at) values
  (990101, 'ZZK ผู้สนใจคุยอยู่', 'meeting', '2026-10-20', null),
  (990102, 'ZZK ผู้สนใจได้แล้ว', 'won', null, '2026-10-10 10:00+07'),
  (990103, 'ZZK ผู้สนใจไม่สำเร็จ', 'lost', null, null);
insert into dealer_package_proposals (id, prospect_id, proposal_no, package, amount, status, payment_due_on) values
  (990201, 990101, 'DP-ZZK-1', 'standard', 300000, 'sent', null),
  (990202, 990102, 'DP-ZZK-2', 'standard', 100000, 'accepted', '2026-10-01');
insert into dealer_proposal_payments (proposal_id, paid_on, amount, reference) values (990202, '2026-10-05', 30000, 'ZZK-โอน-1');
-- บันทึกการใช้งาน (แถวทดสอบ ZZTEST ต้องไม่ถูกนับ)
insert into audit_log ("user", role, action, target, at) values
  ('ZZK ผู้ดูแล ก', 'SUPER_ADMIN', 'เข้าระบบแทนดีลเลอร์', 'RYG', '2026-10-15 10:00+07'),
  ('ZZK ผู้ดูแล ก', 'SUPER_ADMIN', 'ย้อนการตอบรับใบเสนอราคา', 'Q', '2026-10-16 10:00+07'),
  ('ZZK ผู้ดูแล ก', 'SUPER_ADMIN', 'ยกเลิกการชำระค่าแฟรนไชส์', 'P', '2026-10-17 10:00+07'),
  ('ZZK ผู้ดูแล ข', 'HQ_STAFF', 'บันทึกการตั้งค่า', 'x', '2026-10-27 09:00+07'),
  ('ZZK ผู้ดูแล ค', 'HQ_STAFF', 'บันทึกการตั้งค่า', 'x', '2026-10-27 09:30+07'),
  ('ZZK ผู้ดูแล ค', 'HQ_STAFF', 'ZZTEST-ห้ามนับ', 'x', '2026-10-27 09:40+07');
set local session_replication_role = origin;

do $$
declare k jsonb; ก jsonb;
begin
  -- ══ หน้าดีลเลอร์ (ZZK) ══
  perform flowtest.as_user('DEALER_ADMIN', 'ZZK');
  k := kpi_cards('dealer.dashboard', '2026-10-01', '2026-10-27', null, '2026-10-27');
  perform flowtest.ok(k #>> '{target,annual}' = '1000000' and k #>> '{target,ytd}' = '500000' and k #>> '{target,pct}' = '50',
    format('แดชบอร์ด: เป้าทั้งปี 1,000,000 · ยอดตั้งแต่ต้นปี 500,000 (ตามวันตอบรับ) · 50%% (ได้ %s)', k -> 'target'));
  perform flowtest.ok(k #>> '{pipeline,count}' = '6' and k #>> '{pipeline,value}' = '300000',
    format('แดชบอร์ด: โอกาสการขาย 6 ดีล 300,000 (มูลค่าใบล่าสุด · ลีดปิดแล้วไม่นับ) (ได้ %s)', k -> 'pipeline'));
  perform flowtest.ok(k #>> '{awaiting,count}' = '3' and k #>> '{awaiting,value}' = '130000',
    format('แดชบอร์ด: รอลูกค้าตอบ 3 ใบ 130,000 (ใบถูกแทนที่ไม่นับ) (ได้ %s)', k -> 'awaiting'));
  perform flowtest.ok(k #>> '{won,count}' = '1' and k #>> '{won,lost}' = '1' and k #>> '{won,rate}' = '50',
    format('แดชบอร์ด: ปิดได้ในช่วง 1 · อัตราปิด 50%% (ลีดเข้ามาในช่วง) (ได้ %s)', k -> 'won'));

  k := kpi_cards('dealer.leads', null, null, null, '2026-10-27');
  perform flowtest.ok(k = '{"open":6,"hqPricing":1,"hqQuotedNoDraft":1,"awaitingClient":2}'::jsonb,
    format('ลีด: เปิดอยู่ 6 · รอราคา HQ 1 · ได้ราคาแล้วรอทำใบ 1 (ลีดที่มีใบร่างแล้วไม่นับ) · รอลูกค้าตอบ 2 (ได้ %s)', k));

  k := kpi_cards('dealer.quotations', '2026-10-01', '2026-10-27', null, '2026-10-27');
  perform flowtest.ok(k = '{"drafts":1,"awaiting":3,"won":{"count":1,"value":300000},"expiring":2}'::jsonb,
    format('ใบเสนอราคา: ร่าง 1 · รอลูกค้าตอบ 3 · ตอบรับในช่วง 1 ใบ 300,000 · ใกล้หมดอายุ 3 วัน 2 (ตามวันยืนราคาในใบ · ไม่มีวัน = วันที่ใบ + 30) (ได้ %s)', k));

  k := kpi_cards('dealer.customers', '2026-10-01', '2026-10-27', null, '2026-10-27');
  perform flowtest.ok(k = '{"total":2,"new":1,"sales":300000,"openDeal":1}'::jsonb,
    format('ลูกค้า: ทั้งหมด 2 · ใหม่ในช่วง 1 · ยอดขายในช่วง 300,000 · มีงานขายใหม่เปิดอยู่ 1 (ได้ %s)', k));

  k := kpi_cards('dealer.calendar', null, null, null, '2026-10-27');
  perform flowtest.ok(k = '{"today":1,"week":3,"overdue":1,"doneWeek":1}'::jsonb,
    format('ปฏิทิน: วันนี้ 1 · สัปดาห์นี้ 3 · เลยกำหนดยังไม่ปิด 1 (นัดที่ยกเลิกแล้วไม่นับ) · ทำเสร็จสัปดาห์นี้ 1 (ได้ %s)', k));

  -- สาขาอื่นเห็นแต่ของตัวเอง · ส่งรหัสสาขาอื่นมาก็ไม่มีผล
  perform flowtest.as_user('DEALER_ADMIN', 'RYG');
  k := kpi_cards('dealer.calendar', null, null, 'ZZK', '2026-10-27');
  perform flowtest.ok((select count(*) from appointments where dealer_code = 'RYG' and date = '2026-10-27') = (k ->> 'today')::int,
    'สาขา RYG ได้ตัวเลขของตัวเอง แม้ส่งรหัส ZZK มา');
  perform flowtest.must_fail($q$select kpi_cards('hq.dealers')$q$, 'forbidden', 'ดีลเลอร์เรียกการ์ดของ HQ ไม่ได้');
  perform flowtest.as_user('SUPER_ADMIN', '');
  perform flowtest.must_fail($q$select kpi_cards('dealer.leads')$q$, 'forbidden', 'HQ เรียกการ์ดหน้าดีลเลอร์ไม่ได้ (ไม่มีสาขา)');
  perform flowtest.must_fail($q$select kpi_cards('hq.leads')$q$, 'bad_range', 'การ์ดในช่วงของ HQ ต้องระบุช่วง');
  perform flowtest.must_fail($q$select kpi_cards('hq.nope', '2026-10-01', '2026-10-27')$q$, 'invalid_page', 'ชื่อหน้าไม่รู้จัก = ปฏิเสธ');

  -- ══ หน้า HQ: ต้องเพิ่มเท่าที่ใส่เป๊ะ ══
  select ค่า into ก from flowtest.ก่อน where หน้า = 'hq.prospects';
  k := kpi_cards('hq.prospects', '2026-10-01', '2026-10-27', null, '2026-10-27');
  perform flowtest.ok((k->>'talking')::int = (ก->>'talking')::int + 1 and (k->>'followDue')::int = (ก->>'followDue')::int + 1
    and (k->>'proposalWaiting')::int = (ก->>'proposalWaiting')::int + 1 and (k->>'converted')::int = (ก->>'converted')::int + 1,
    format('ผู้สนใจ: กำลังคุย +1 · ถึงกำหนดติดตาม +1 · รอตอบใบค่าแฟรนไชส์ +1 · เป็นดีลเลอร์แล้วในช่วง +1 (ก่อน %s หลัง %s)', ก, k));

  select ค่า into ก from flowtest.ก่อน where หน้า = 'hq.proposals';
  k := kpi_cards('hq.proposals', '2026-10-01', '2026-10-27', null, '2026-10-27');
  perform flowtest.ok((k->>'waiting')::int = (ก->>'waiting')::int + 1
    and (k#>>'{unpaid,count}')::int = (ก#>>'{unpaid,count}')::int + 1 and (k#>>'{unpaid,amount}')::numeric = (ก#>>'{unpaid,amount}')::numeric + 70000
    and (k#>>'{overdue,count}')::int = (ก#>>'{overdue,count}')::int + 1 and (k#>>'{overdue,amount}')::numeric = (ก#>>'{overdue,amount}')::numeric + 70000
    and (k#>>'{paid,count}')::int = (ก#>>'{paid,count}')::int + 1 and (k#>>'{paid,amount}')::numeric = (ก#>>'{paid,amount}')::numeric + 30000,
    format('ใบค่าแฟรนไชส์: รอคำตอบ +1 · ค้างชำระ +1 (70,000) · เกินกำหนด +1 (70,000) · รับชำระในช่วง +1 (30,000) (ก่อน %s หลัง %s)', ก, k));

  select ค่า into ก from flowtest.ก่อน where หน้า = 'hq.dealers';
  k := kpi_cards('hq.dealers', null, null, null, '2026-10-27');
  perform flowtest.ok((k->>'total')::int = (ก->>'total')::int + 2 and (k->>'active')::int = (ก->>'active')::int + 2
    and (k->>'moving')::int = (ก->>'moving')::int + 1 and (k->>'idle')::int = (ก->>'idle')::int + 1
    and not (k ?| array['sales', 'value', 'revenue']),
    format('ดีลเลอร์: ทั้งหมด +2 · เปิดใช้ +2 · เคลื่อนไหว 30 วัน +1 (ZZK มีงานขาย) · ไม่เคลื่อนไหว +1 (ZZI) · ไม่มียอดเงิน (ก่อน %s หลัง %s)', ก, k));

  k := kpi_cards('hq.pipeline', '2026-10-01', '2026-10-27', 'ZZK', '2026-10-27');
  perform flowtest.ok(k = '{"sales":{"value":300000,"target":73973},"winRate":{"won":1,"lost":1,"rate":50},"margin":{"quotes":1,"pct":20.0},"onTarget":{"reached":0,"of":1,"codes":[]}}'::jsonb,
    format('ภาพรวมยอดขาย (ZZK): ยอด 300,000 เทียบเป้าในช่วง 73,973 · อัตราปิด 50%% · margin 20.0%% · ถึงเป้า 0 จาก 1 (ได้ %s)', k));

  select ค่า into ก from flowtest.ก่อน where หน้า = 'hq.leads';
  k := kpi_cards('hq.leads', '2026-10-01', '2026-10-27', 'ZZK', '2026-10-27');
  perform flowtest.ok((k->>'open')::int = 6 and (k->>'new')::int = 7 and (k->>'idle')::int = 1 and (k->>'hqWaiting')::int = (ก->>'hqWaiting')::int + 1,
    format('ลีดทั้งเครือ (ZZK): เปิดอยู่ 6 · ใหม่ในช่วง 7 · ไม่เคลื่อนไหวเกิน 30 วัน 1 · ลีดของ HQ รอโอน +1 (ได้ %s)', k));

  k := kpi_cards('hq.quotations', '2026-10-01', '2026-10-27', 'ZZK', '2026-10-27');
  perform flowtest.ok(k = '{"sent":3,"awaiting":3,"won":{"count":1,"value":300000},"acceptRate":33.3}'::jsonb,
    format('ใบเสนอราคาทั้งเครือ (ZZK): ส่งในช่วง 3 · รอลูกค้าตอบ 3 · ตอบรับ 1 ใบ 300,000 · อัตราตอบรับ 33.3%% (ได้ %s)', k));

  select ค่า into ก from flowtest.ก่อน where หน้า = 'hq.customers';
  k := kpi_cards('hq.customers', '2026-10-01', '2026-10-27', null, '2026-10-27');
  perform flowtest.ok((k->>'total')::int = (ก->>'total')::int + 2 and (k->>'new')::int = (ก->>'new')::int + 1
    and (k->>'sales')::numeric = (ก->>'sales')::numeric + 300000
    and (k#>>'{dealers,with}')::int = (ก#>>'{dealers,with}')::int + 1 and (k#>>'{dealers,of}')::int = (ก#>>'{dealers,of}')::int + 2,
    format('ลูกค้าทั้งเครือ: ทั้งหมด +2 · ใหม่เดือนนี้ +1 · ยอดขาย +300,000 · ดีลเลอร์ที่มีลูกค้า +1 จาก +2 (ก่อน %s หลัง %s)', ก, k));

  select ค่า into ก from flowtest.ก่อน where หน้า = 'hq.audit';
  k := kpi_cards('hq.audit', '2026-10-01', '2026-10-27', null, '2026-10-27');
  perform flowtest.ok((k->>'actionsToday')::int = (ก->>'actionsToday')::int + 2 and (k->>'usersToday')::int = (ก->>'usersToday')::int + 2
    and (k->>'impersonations')::int = (ก->>'impersonations')::int + 1 and (k->>'reversals')::int = (ก->>'reversals')::int + 2,
    format('บันทึก: การกระทำวันนี้ +2 · ผู้ใช้วันนี้ +2 (แถวทดสอบไม่นับ) · เข้าระบบแทน +1 · ย้อน/ยกเลิก +2 (ก่อน %s หลัง %s)', ก, k));

  -- แผงผู้ใช้: เข้าระบบใน 30 วัน ตามเวลาเข้าระบบล่าสุดจริง
  perform flowtest.as_root();
  update auth.users set last_sign_in_at = now() where id = (select id from profiles where role = 'SUPER_ADMIN' order by id limit 1);
  perform flowtest.as_user('SUPER_ADMIN', '');
  ก := kpi_cards('hq.users');
  perform flowtest.as_root();
  update auth.users set last_sign_in_at = now() - interval '40 days' where id = (select id from profiles where role = 'SUPER_ADMIN' order by id limit 1);
  perform flowtest.as_user('SUPER_ADMIN', '');
  k := kpi_cards('hq.users');
  perform flowtest.ok((k->>'signedIn30')::int = (ก->>'signedIn30')::int - 1 and (k->>'total')::int = (ก->>'total')::int
    and (k->>'total')::int = (k->>'active')::int + (k->>'inactive')::int
    and (k->>'total')::int = (select count(*) from profiles where role in ('SUPER_ADMIN', 'HQ_MANAGEMENT', 'HQ_STAFF')),
    format('ผู้ใช้: ทั้งหมด = บัญชี HQ · ใช้งาน + ปิดใช้ = ทั้งหมด · เข้าระบบล่าสุดเกิน 30 วัน ไม่นับ (ก่อน %s หลัง %s)', ก, k));

  -- ═══ การ์ดเดินตามตัวกรองอื่นของหน้า (p_filters · บอสตัดสิน 27 ต.ค. 69) ═══
  perform flowtest.must_fail($q$select kpi_cards('hq.dealers', null, null, null, null, '[]'::jsonb)$q$, 'bad_filters', 'ตัวกรองต้องเป็นก้อนข้อมูล');
  k := kpi_cards('hq.dealers', null, null, null, '2026-10-27', '{"ids":["ZZK","ZZI"]}');
  perform flowtest.ok(k->>'total' = '2' and k->>'moving' = '1' and k->>'idle' = '1' and k->'movingCodes' = '["ZZK"]'::jsonb,
    format('ดีลเลอร์ กรองเหลือ ZZK/ZZI: ทั้งหมด 2 · เคลื่อนไหว 1 · ไม่เคลื่อนไหว 1 (ได้ %s)', k));
  k := kpi_cards('hq.pipeline', '2026-10-01', '2026-10-27', null, '2026-10-27', '{"dealerCodes":["ZZK"]}');
  perform flowtest.ok(k = '{"sales":{"value":300000,"target":73973},"winRate":{"won":1,"lost":1,"rate":50},"margin":{"quotes":1,"pct":20.0},"onTarget":{"reached":0,"of":1,"codes":[]}}'::jsonb,
    format('ภาพรวมยอดขาย กรองสาขา ZZK (ไม่เลือกดีลเลอร์) = เท่ากับเลือก ZZK · เป้า = เป้าของสาขาที่เหลือ (ได้ %s)', k));
  select ค่า into ก from flowtest.ก่อน where หน้า = 'hq.leads';
  k := kpi_cards('hq.leads', '2026-10-01', '2026-10-27', null, '2026-10-27', '{"dealerCodes":["ZZK"],"search":"ล5"}');
  perform flowtest.ok(k->>'open' = '1' and k->>'new' = '1' and k->>'idle' = '0' and (k->>'hqWaiting')::int = (ก->>'hqWaiting')::int + 1,
    format('ลีดทั้งเครือ กรองสาขา ZZK + ค้น "ล5": เปิด 1 · ใหม่ 1 · ไม่เคลื่อนไหว 0 · คิว HQ ไม่ขึ้นกับตัวกรอง (ได้ %s)', k));
  k := kpi_cards('hq.leads', '2026-10-01', '2026-10-27', null, '2026-10-27', '{"dealerCodes":["ZZK"],"province":"ตราด"}');
  perform flowtest.ok(k->>'open' = '0' and k->>'new' = '0', format('ลีดทั้งเครือ ZZK + จังหวัดตราด = 0 (ได้ %s)', k));
  k := kpi_cards('hq.leads', '2026-10-01', '2026-10-27', null, '2026-10-27', '{"dealerCodes":["ZZK"],"source":"ไม่ระบุ"}');
  perform flowtest.ok(k->>'open' = '6' and k->>'idle' = '1', format('ลีดทั้งเครือ ZZK + ช่องทาง "ไม่ระบุ" (ช่องว่าง) = ครบ 6 (ได้ %s)', k));
  k := kpi_cards('hq.quotations', '2026-10-01', '2026-10-27', null, '2026-10-27', '{"dealerCodes":["ZZK"],"search":"ล5"}');
  perform flowtest.ok(k = '{"sent":2,"awaiting":2,"won":{"count":0,"value":0},"acceptRate":0.0}'::jsonb,
    format('ใบทั้งเครือ ZZK + ค้นลูกค้า "ล5": ส่ง 2 · รอ 2 · ตอบรับ 0 · ใบถูกแทนที่ไม่นับ (ได้ %s)', k));
  k := kpi_cards('hq.quotations', '2026-10-01', '2026-10-27', null, '2026-10-27', '{"dealerCodes":["ZZK"],"search":"ไม่มีคำนี้","searchDealers":["ZZK"]}');
  perform flowtest.ok(k = '{"sent":3,"awaiting":3,"won":{"count":1,"value":300000},"acceptRate":33.3}'::jsonb,
    format('ใบทั้งเครือ: คำค้นตรงชื่อสาขา = ทุกใบของสาขานั้น (กติกาเดียวกับ hq_quotations_summary) (ได้ %s)', k));
  k := kpi_cards('hq.customers', '2026-10-01', '2026-10-27', null, '2026-10-27', '{"dealerCodes":["ZZK"]}');
  perform flowtest.ok(k->>'total' = '2' and k->>'new' = '1' and k->>'sales' = '300000' and k->'dealers' = '{"with":1,"of":1}'::jsonb,
    format('ลูกค้าทั้งเครือ กรองสาขา ZZK: ทั้งหมด 2 · ใหม่ 1 · ยอด 300,000 · ดีลเลอร์ 1 จาก 1 (ได้ %s)', k));
  k := kpi_cards('hq.customers', '2026-10-01', '2026-10-27', null, '2026-10-27', '{"dealerCodes":["ZZK"],"search":"ลูกค้า 2"}');
  perform flowtest.ok(k->>'total' = '1' and k->>'new' = '0' and k->>'sales' = '0', format('ลูกค้าทั้งเครือ ZZK + ค้น "ลูกค้า 2" (ได้ %s)', k));
  k := kpi_cards('hq.customers', '2026-10-01', '2026-10-27', null, '2026-10-27', '{"dealerCodes":["ZZK"],"boughtFrom":"2026-10-01"}');
  perform flowtest.ok(k->>'total' = '1' and k->>'new' = '1' and k->>'sales' = '300000',
    format('ลูกค้าทั้งเครือ ZZK + ซื้อล่าสุดตั้งแต่ 1 ต.ค.: เหลือลูกค้า 1 (ใบ won 12 ต.ค.) (ได้ %s)', k));
  k := kpi_cards('hq.prospects', '2026-10-01', '2026-10-27', null, '2026-10-27', '{"ids":[990101]}');
  perform flowtest.ok(k = '{"talking":1,"followDue":1,"proposalWaiting":1,"converted":0}'::jsonb, format('ผู้สนใจ กรองเหลือ 1 ราย (ได้ %s)', k));
  k := kpi_cards('hq.proposals', '2026-10-01', '2026-10-27', null, '2026-10-27', '{"ids":[990202]}');
  perform flowtest.ok(k->>'waiting' = '0' and k #>> '{unpaid,count}' = '1' and k #>> '{unpaid,amount}' = '70000'
    and k #>> '{overdue,count}' = '1' and k #>> '{paid,count}' = '1' and k #>> '{paid,amount}' = '30000',
    format('ใบค่าแฟรนไชส์ กรองเหลือ DP-ZZK-2: ค้าง 70,000 · เกินกำหนด 1 · รับชำระ 30,000 (ได้ %s)', k));
  k := kpi_cards('hq.audit', '2026-10-01', '2026-10-27', null, '2026-10-27',
    jsonb_build_object('ids', (select jsonb_agg(id) from audit_log where "user" like 'ZZK ผู้ดูแล%' and action = 'บันทึกการตั้งค่า')));
  perform flowtest.ok(k = '{"actionsToday":2,"usersToday":2,"impersonations":0,"reversals":0}'::jsonb, format('บันทึก กรองเหลือ 2 แถว (ได้ %s)', k));
  k := kpi_cards('hq.users', null, null, null, null, jsonb_build_object('ids', (select jsonb_agg(id) from (select id from profiles where role = 'SUPER_ADMIN' order by id limit 1) x)));
  perform flowtest.ok(k->>'total' = '1', format('ผู้ใช้ กรองเหลือ 1 บัญชี (ได้ %s)', k));

  perform flowtest.as_user('DEALER_ADMIN', 'ZZK');
  k := kpi_cards('dealer.leads', null, null, null, '2026-10-27', '{"ids":["#L-ZZK2","#L-ZZK5","#L-ZZK7"]}');
  perform flowtest.ok(k = '{"open":2,"hqPricing":1,"hqQuotedNoDraft":0,"awaitingClient":1}'::jsonb, format('ลีดของสาขา กรองเหลือ 3 ราย (ได้ %s)', k));
  k := kpi_cards('dealer.leads', null, null, null, '2026-10-27', '{"ids":[]}');
  perform flowtest.ok(k = '{"open":0,"hqPricing":0,"hqQuotedNoDraft":0,"awaitingClient":0}'::jsonb, format('ตัวกรองไม่เหลือแถว = การ์ดเป็น 0 ไม่ใช่ทั้งหมด (ได้ %s)', k));
  k := kpi_cards('dealer.quotations', '2026-10-01', '2026-10-27', null, '2026-10-27', '{"ids":["ZZK-Q2","ZZK-Q5"]}');
  perform flowtest.ok(k = '{"drafts":0,"awaiting":1,"won":{"count":1,"value":300000},"expiring":1}'::jsonb, format('ใบของสาขา กรองเหลือ 2 ใบ (ได้ %s)', k));
  k := kpi_cards('dealer.customers', '2026-10-01', '2026-10-27', null, '2026-10-27', '{"ids":[990002]}');
  perform flowtest.ok(k = '{"total":1,"new":0,"sales":0,"openDeal":0}'::jsonb, format('ลูกค้าของสาขา กรองเหลือ 1 ราย (ได้ %s)', k));
  -- ตัวกรองต้องไม่พาข้ามสาขา: ดีลเลอร์ส่งรหัสลีดของสาขาอื่นมา = ไม่นับ
  k := kpi_cards('dealer.leads', null, null, null, '2026-10-27', jsonb_build_object('ids', (select coalesce(jsonb_agg(id), '[]') from leads where dealer_code = 'RYG')));
  perform flowtest.ok(k->>'open' = '0', format('ส่งรหัสลีดสาขาอื่น = ไม่นับ (ได้ %s)', k));
end $$;

select 'ALL PASS' as result;
rollback;
