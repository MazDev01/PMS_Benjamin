-- ── ด่าน 5: "สิ่งที่ HQ เห็นในภาพรวม" 3 กล่อง — ตัวเลขตรงกับข้อมูลทดสอบที่รู้ค่าล่วงหน้า (FLOW ช่วงที่ 3) ───────────────
--   ล้างตารางที่เกี่ยวข้องในรายการนี้ (ย้อนทั้งหมดตอนจบ) แล้วใส่ชุดข้อมูลที่กำหนดเอง → ทุกตัวเลขตรวจเป็นค่าตายตัว
-- รัน: docker exec -i <คอนเทนเนอร์ฐานทดสอบ> psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/hq_overview.sql
begin;
create schema flowtest;
create function flowtest.ok(p_cond boolean, p_what text) returns void language plpgsql as $$
begin if p_cond is not true then raise exception 'FAIL: %', p_what; end if; raise notice 'ok  %', p_what; end $$;
create function flowtest.as_hq(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated',
    'user_role', 'SUPER_ADMIN', 'dealer_code', '', 'email', 'hq@test')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function flowtest.as_dealer(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated',
    'user_role', 'DEALER_ADMIN', 'dealer_code', 'CNX', 'email', 'cnx@test')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
grant usage on schema flowtest to authenticated;
grant execute on all functions in schema flowtest to authenticated;

-- ═══ ชุดข้อมูลที่รู้ค่าล่วงหน้า (ปิดตัวดัก/กุญแจนอกในรายการนี้เท่านั้น — ใส่สถานะปลายทางตรง ๆ) ═══════════════════
set local session_replication_role = replica;
delete from dealer_proposal_payments; delete from dealer_package_proposals; delete from dealer_prospect_activities; delete from dealer_prospects;
delete from hq_quotes; delete from quote_request_events; delete from quote_requests; delete from quotations; delete from leads; delete from dealer_territories;

-- กล่อง 1 · หาดีลเลอร์ใหม่: ผู้สนใจ new 2 · meeting 1 · considering 1 · won 1 · lost 1
insert into dealer_prospects (id, name, status) values
  (9001, 'ZZOV ก', 'new'), (9002, 'ZZOV ข', 'new'), (9003, 'ZZOV ค', 'meeting'),
  (9004, 'ZZOV ง', 'considering'), (9005, 'ZZOV จ', 'won'), (9006, 'ZZOV ฉ', 'lost');
-- ใบค่าแฟรนไชส์รอตอบ (ส่งแล้ว) 2 ใบ รวม 450,000 · ร่าง/ตอบรับ ไม่นับ
insert into dealer_package_proposals (id, prospect_id, proposal_no, package, amount, status) values
  (9101, 9004, 'DP-OV-1', 'standard', 300000, 'sent'), (9102, 9003, 'DP-OV-2', 'exclusive', 150000, 'sent'),
  (9103, 9002, 'DP-OV-3', 'standard', 999999, 'draft'), (9104, 9005, 'DP-OV-4', 'standard', 500000, 'accepted');
-- จังหวัดที่มีลูกค้าเป้าหมาย (ยังเปิด) แต่ยังไม่มีดีลเลอร์: ตราด 2 · สตูล 1 · (ระยองมีดีลเลอร์ = ไม่นับ · ลูกค้าเป้าหมายที่ปิดแล้วไม่นับ)
insert into dealer_territories (province, dealer_code) values ('ระยอง', 'RYG');
insert into leads (id, num_id, dealer_code, company, name, phone, province, status) values
  ('#L-OV-1', 1, 'RYG', 'ZZOV ล1', 'ZZOV ล1', '0800000001', 'ตราด', 'BULLET'),
  ('#L-OV-2', 2, 'RYG', 'ZZOV ล2', 'ZZOV ล2', '0800000002', 'ตราด', 'QUOTED'),
  ('#L-OV-3', 3, 'RYG', 'ZZOV ล3', 'ZZOV ล3', '0800000003', 'สตูล', 'WAITING'),
  ('#L-OV-4', 4, 'RYG', 'ZZOV ล4', 'ZZOV ล4', '0800000004', 'ระยอง', 'BULLET'),
  ('#L-OV-5', 5, 'RYG', 'ZZOV ล5', 'ZZOV ล5', '0800000005', 'นราธิวาส', 'PAID');

-- กล่อง 2 · คำขอใบเสนอราคา
--   เปิดอยู่: สมชาย 2 (เกิน 14 วัน 1) · ยังไม่มีผู้รับ 1 (เกิน 1) → คิวงาน 3 · เกิน 14 วัน 2
--   ส่งใบแล้ว (เวลาตอบ): 2 · 4 · 6 วัน (won/lost) + 1 วัน (ใบที่ถูกแทนด้วยเวอร์ชันใหม่ — HQ ตอบไปแล้วจริง นับด้วย) → เฉลี่ย 3.25 = 3.3 วัน
--   ผล: won 2 · lost 1 → ปิดการขายได้ 66.7% · ยกเลิก 2 จาก 8 (ไม่นับ superseded) = 25.0% เหตุผล "ลูกค้าเลื่อน" 2
insert into quote_requests (id, request_no, dealer_code, lead_num_id, product, status, assignee_name, submitted_at, due_at, quoted_at, cancel_reason) values
  (9201, 'QR-OV-1', 'RYG', 101, 'โกดัง', 'pricing', 'สมชาย', now() - interval '20 days', now() - interval '6 days',  null, ''),
  (9202, 'QR-OV-2', 'RYG', 102, 'โกดัง', 'new',     'สมชาย', now() - interval '2 days',  now() + interval '12 days', null, ''),
  (9203, 'QR-OV-3', 'RYG', 103, 'โกดัง', 'new',     '',    now() - interval '15 days', now() - interval '1 day',  null, ''),
  (9204, 'QR-OV-4', 'RYG', 104, 'โกดัง', 'won',     'สมชาย', now() - interval '30 days', now() - interval '16 days', now() - interval '28 days', ''),
  (9205, 'QR-OV-5', 'RYG', 105, 'โกดัง', 'won',     'สมชาย', now() - interval '30 days', now() - interval '16 days', now() - interval '26 days', ''),
  (9206, 'QR-OV-6', 'RYG', 106, 'โกดัง', 'lost',    'สมชาย', now() - interval '30 days', now() - interval '16 days', now() - interval '24 days', ''),
  (9207, 'QR-OV-7', 'RYG', 107, 'โกดัง', 'cancelled', '',  now() - interval '9 days',  now() + interval '5 days', null, 'ลูกค้าเลื่อน'),
  (9208, 'QR-OV-8', 'RYG', 108, 'โกดัง', 'cancelled', '',  now() - interval '8 days',  now() + interval '6 days', null, 'ลูกค้าเลื่อน'),
  (9209, 'QR-OV-9', 'RYG', 109, 'โกดัง', 'superseded', 'สมชาย', now() - interval '40 days', now() - interval '26 days', now() - interval '39 days', '');

-- กล่อง 3 · ยอดขายเครือข่าย
--   ใบ HQ สั่งผลิต 2 ใบ: 100,000 + 200,000 = 300,000 (ใบที่ส่งแล้วยังไม่สั่งผลิตไม่นับ)
insert into hq_quotes (id, request_id, version, quote_no, status, line_items, total_cost, sent_at, ordered_at) values
  (9301, 9204, 1, 'HQ-OV-1', 'ordered', '[]', 100000, now() - interval '28 days', now() - interval '20 days'),
  (9302, 9205, 1, 'HQ-OV-2', 'ordered', '[]', 200000, now() - interval '26 days', now() - interval '19 days'),
  (9303, 9206, 1, 'HQ-OV-3', 'sent',    '[]', 999999, now() - interval '24 days', null);
--   ใบลูกค้า won: RYG ขาย 150,000 (ต้นทุน 100,000) + 250,000 (ต้นทุน 200,000) · CNX ใบเดิม (ไม่ผูกใบ HQ) 80,000
--   → ยอดขายดีลเลอร์ให้ลูกค้า 480,000 · margin RYG: ขาย 400,000 ต้นทุน 300,000 → 25.0% ของราคาขาย · บวก 33.3% ของต้นทุน
--   ใบ lost/ส่งแล้ว ไม่นับ · CNX ไม่มีใบผูกใบ HQ → ไม่มีแถว margin
insert into quotations (id, dealer_code, customer, status, total_value, line_items, hq_quote_id, customer_id) values
  ('ZZOV-Q1', 'RYG', 'ZZOV ล1', 'won', 150000, '[]', 9301, (select min(id) from customers where dealer_code = 'RYG')),
  ('ZZOV-Q2', 'RYG', 'ZZOV ล2', 'won', 250000, '[]', 9302, (select min(id) from customers where dealer_code = 'RYG')),
  ('ZZOV-Q3', 'CNX', 'ZZOV เดิม', 'won', 80000, '[]', null, (select min(id) from customers where dealer_code = 'CNX')),
  ('ZZOV-Q4', 'RYG', 'ZZOV ล3', 'lost', 777777, '[]', 9303, null),
  ('ZZOV-Q5', 'RYG', 'ZZOV ล4', 'sent_to_client', 555555, '[]', null, null);
set local session_replication_role = origin;

do $$
declare
  hq  uuid := (select id from profiles where role = 'SUPER_ADMIN' limit 1);
  cnx uuid := (select id from profiles where role = 'DEALER_ADMIN' and dealer_code = 'CNX' limit 1);
  o jsonb;
begin
  perform flowtest.as_hq(hq);
  o := hq_overview();

  -- กล่อง 1
  perform flowtest.ok(o #> '{recruit,stages}' = '{"new":2,"contacted":0,"profile_sent":0,"meeting":1,"considering":1,"won":1,"lost":1}'::jsonb,
    format('ผู้สนใจแต่ละขั้น (ได้ %s)', o #> '{recruit,stages}'));
  perform flowtest.ok(o #> '{recruit,proposalsWaiting}' = '{"count":2,"amount":450000}'::jsonb,
    format('ใบค่าแฟรนไชส์ที่รอตอบ 2 ใบ 450,000 (ได้ %s)', o #> '{recruit,proposalsWaiting}'));
  perform flowtest.ok(o #> '{recruit,provincesNoDealer}' = '[{"province":"ตราด","leads":2},{"province":"สตูล","leads":1}]'::jsonb,
    format('จังหวัดที่มีลูกค้าเป้าหมายแต่ไม่มีดีลเลอร์ (ได้ %s)', o #> '{recruit,provincesNoDealer}'));

  -- กล่อง 2
  perform flowtest.ok(o #> '{requests,queue}' = '[{"assignee":"สมชาย","open":2,"overdue":1},{"assignee":null,"open":1,"overdue":1}]'::jsonb,
    format('คิวงานแยกตามผู้รับผิดชอบ (ได้ %s)', o #> '{requests,queue}'));
  perform flowtest.ok((o #>> '{requests,overdue}')::int = 2, format('คำขอเกิน 14 วัน 2 (ได้ %s)', o #>> '{requests,overdue}'));
  perform flowtest.ok((o #>> '{requests,avgResponseDays}')::numeric = 3.3, format('เวลาตอบเฉลี่ย 3.3 วัน (ได้ %s)', o #>> '{requests,avgResponseDays}'));
  perform flowtest.ok(o #> '{requests,closeRate}' = '{"won":2,"lost":1,"pct":66.7}'::jsonb, format('ใบ HQ ปิดการขายได้ 66.7%% (ได้ %s)', o #> '{requests,closeRate}'));
  perform flowtest.ok(o #> '{requests,cancel}' = '{"cancelled":2,"total":8,"pct":25.0,"reasons":[{"reason":"ลูกค้าเลื่อน","count":2}]}'::jsonb,
    format('อัตรายกเลิก 25%% และเหตุผล (ได้ %s)', o #> '{requests,cancel}'));

  -- กล่อง 3
  perform flowtest.ok((o #>> '{sales,hqOrdered}')::numeric = 300000, format('ยอดขาย HQ จากใบที่สั่งผลิต 300,000 (ได้ %s)', o #>> '{sales,hqOrdered}'));
  perform flowtest.ok((o #>> '{sales,dealerWon}')::numeric = 480000, format('ยอดขายดีลเลอร์ให้ลูกค้า 480,000 (ได้ %s)', o #>> '{sales,dealerWon}'));
  perform flowtest.ok(o #> '{sales,marginByDealer}' = '[{"dealerCode":"RYG","quotes":2,"sale":400000,"cost":300000,"pctOfSale":25.0,"pctOfCost":33.3}]'::jsonb,
    format('margin เฉลี่ยแต่ละดีลเลอร์ (ได้ %s)', o #> '{sales,marginByDealer}'));

  -- ดีลเลอร์เรียกภาพรวมของ HQ ไม่ได้
  perform flowtest.as_dealer(cnx);
  begin
    perform hq_overview();
    raise exception 'FAIL: ดีลเลอร์เรียกภาพรวม HQ ได้';
  exception when others then
    if sqlerrm not like 'forbidden%' then raise; end if;
    raise notice 'ok  ดีลเลอร์เรียกภาพรวม HQ ไม่ได้ (ถูกปฏิเสธ)';
  end;
end $$;

\echo 'ALL PASS'
rollback;
