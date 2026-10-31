-- ── ข้อทดสอบใบ 0266: แผงดีลเลอร์ด้านขวา (hq_dealer_panel · บอสสั่ง 30 ต.ค. 69) ──
--   งานดูแลเป็นจำนวน: ลีดเปิดอยู่ · คำขอราคารอ HQ · ใบรอลูกค้าตอบ · ลูกค้า · ข้อมูลบริษัทที่ขาด (กติกาเดียวกับด่านส่งใบแรก)
--   ผู้ติดต่อ = บัญชีผู้ดูแลดีลเลอร์ · ใบค่าแฟรนไชส์ที่ตอบรับล่าสุด + สถานะชำระ (ไม่ส่งยอดเงิน) · กิจกรรมล่าสุดตามจำนวนที่ขอ
--   เฉพาะ HQ (ดีลเลอร์ = forbidden) · แถว HQ / รหัสที่ไม่มี = null
-- รัน: docker exec -i <คอนเทนเนอร์ฐานทดสอบ> psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 < supabase/tests/hq_dealer_panel.sql
-- ทรานแซกชันเดียวแล้ว rollback · ผ่าน = "ALL PASS" · ตกบนโค้ดก่อนใบ 0266: ไม่มี hq_dealer_panel
begin;
create schema dptest;
create table dptest.fails (what text);
create function dptest.eq(p_got text, p_want text, p_what text) returns void language plpgsql as $$
begin
  if p_got is distinct from p_want then insert into dptest.fails values (p_what || ' — ได้ ' || coalesce(p_got, 'ไม่มี') || ' ควร ' || coalesce(p_want, 'ไม่มี'));
    raise notice 'FAIL %', p_what; return; end if;
  raise notice 'ok  %', p_what;
end $$;
grant usage on schema dptest to authenticated;
grant execute on all functions in schema dptest to authenticated;
grant insert on dptest.fails to authenticated;

-- สาขา ZZDPA (ตราด) จากผู้สนใจ 991201: ลีดเปิด 2 · ปิดสำเร็จ 1 · คำขอใหม่ 1 กำลังทำราคา 1 ตอบรับ 1 · ใบส่งลูกค้า 1 ร่าง 1 · ลูกค้า 1
--   ข้อมูลบริษัทขาดเลขผู้เสียภาษี · ใบค่าแฟรนไชส์ตอบรับ 2 ใบ (ล่าสุดชำระบางส่วน) · กิจกรรม 12 รายการ (ของสาขาอื่น 1)
set local session_replication_role = replica;
insert into dealer_prospects (id, name, status, dealer_code) values (991201, 'ZZTEST ผู้สนใจแผง', 'won', 'ZZDPA');
insert into dealers (code, name, province, region, status, package, prospect_id) values ('ZZDPA', 'ZZTEST แผงดีลเลอร์', 'ตราด', 'ตะวันออก', 'active', 'standard', 991201);
insert into dealer_settings (dealer_code, issuer) values ('ZZDPA', '{"company": "ZZTEST บริษัทแผง", "address": "ZZTEST ที่อยู่", "phone": "000-000-0000", "taxId": " "}');
insert into dealer_package_proposals (id, prospect_id, proposal_no, package, amount, status) values
  (991211, 991201, 'FP-ZZDPA-1', 'standard', 100000, 'accepted'),
  (991212, 991201, 'FP-ZZDPA-2', 'exclusive', 200000, 'accepted'),
  (991213, 991201, 'FP-ZZDPA-3', 'exclusive', 300000, 'sent');
insert into dealer_proposal_payments (proposal_id, paid_on, amount, reference) values (991212, '2026-10-01', 50000, 'ZZTEST'), (991211, '2026-09-01', 100000, 'ZZTEST');
insert into leads (id, num_id, dealer_code, company, name, phone, province, status, created_date) values
  ('#L-991221', 991221, 'ZZDPA', 'ZZTEST ล1', 'ZZTEST', '000-000-1221', 'ตราด', 'WAITING', '2026-10-01'),
  ('#L-991222', 991222, 'ZZDPA', 'ZZTEST ล2', 'ZZTEST', '000-000-1222', 'ตราด', 'QUOTED', '2026-10-02'),
  ('#L-991223', 991223, 'ZZDPA', 'ZZTEST ล3', 'ZZTEST', '000-000-1223', 'ตราด', 'PAID', '2026-10-03');
insert into quote_requests (id, request_no, dealer_code, lead_num_id, product, status, submitted_at, due_at) values
  (991231, 'QR-ZZDPA-1', 'ZZDPA', 991221, 'ZZTEST', 'new', '2026-10-05', '2026-10-19'),
  (991232, 'QR-ZZDPA-2', 'ZZDPA', 991222, 'ZZTEST', 'pricing', '2026-10-06', '2026-10-20'),
  (991233, 'QR-ZZDPA-3', 'ZZDPA', 991223, 'ZZTEST', 'won', '2026-10-07', '2026-10-21');
insert into customers (id, dealer_code, name, company, province) values (991241, 'ZZDPA', 'ZZTEST ลูกค้า', 'ZZTEST ลูกค้า', 'ตราด');
insert into quotations (id, dealer_code, customer, status, total_value, line_items, date) values
  ('ZZDPA-Q1', 'ZZDPA', 'ZZTEST ลูกค้า', 'sent_to_client', 50000, '[]', '2026-10-08'),
  ('ZZDPA-Q2', 'ZZDPA', 'ZZTEST ลูกค้า', 'draft', 70000, '[]', '2026-10-09');
insert into audit_log ("user", role, action, target, at)
  select 'zz@test', 'DEALER_ADMIN', 'ZZTEST กิจกรรม ' || g, 'ZZDPA · รายการ ' || g, '2026-10-01'::timestamptz + (g || ' hours')::interval from generate_series(1, 12) g;
insert into audit_log ("user", role, action, target, at) values ('zz@test', 'DEALER_ADMIN', 'ZZTEST ของสาขาอื่น', 'ZZDPB · รายการ', '2026-10-30');
set local session_replication_role = origin;

do $$
declare
  hq uuid := (select id from profiles where role = 'SUPER_ADMIN' and status = 'active' limit 1);
  ร jsonb;
  -- ค่าที่ควรได้ คิดก่อนสลับเป็นบทบาทผู้ใช้ (ฟังก์ชันภายในเรียกได้เฉพาะเจ้าของ)
  ขาดควร text := _issuer_missing('{"company": "ZZTEST บริษัทแผง", "address": "ZZTEST ที่อยู่", "phone": "000-000-0000", "taxId": " "}'::jsonb);
begin
  perform set_config('request.jwt.claims', json_build_object('sub', hq, 'role', 'authenticated', 'user_role', 'SUPER_ADMIN', 'dealer_code', '', 'email', 'hq@test')::text, true);
  perform set_config('role', 'authenticated', true);
  ร := hq_dealer_panel('ZZDPA', 10);
  perform dptest.eq(ร #>> '{counts,openLeads}', '2', 'ลีดที่เปิดอยู่ 2 (ปิดสำเร็จไม่นับ)');
  perform dptest.eq(ร #>> '{counts,requestsWaitingHq}', '2', 'คำขอราคาที่รอ HQ 2 (ใหม่ + กำลังทำราคา · ตอบรับแล้วไม่นับ)');
  perform dptest.eq(ร #>> '{counts,quotesAwaiting}', '1', 'ใบที่รอลูกค้าตอบ 1 (ร่างไม่นับ)');
  perform dptest.eq(ร #>> '{counts,customers}', '1', 'ลูกค้า 1');
  perform dptest.eq(ร #>> '{issuer,company}', 'ZZTEST บริษัทแผง', 'ข้อมูลบริษัท: ชื่อ');
  perform dptest.eq(ร #>> '{issuer,missing}', ขาดควร, 'ช่องที่ขาด = กติกาเดียวกับด่านส่งใบแรก (_issuer_missing)');
  perform dptest.eq(((ร #>> '{issuer,missing}') like '%เลขผู้เสียภาษี%')::text, 'true', 'ขาดเลขผู้เสียภาษี (ช่องว่างล้วน = ว่าง)');
  perform dptest.eq(ร #>> '{franchise,proposalNo}', 'FP-ZZDPA-2', 'ใบค่าแฟรนไชส์ = ใบตอบรับล่าสุด (ใบที่ยังไม่ตอบรับไม่นับ)');
  perform dptest.eq(ร #>> '{franchise,payment}', 'partial', 'สถานะชำระ: ชำระ 50,000 จาก 200,000 = ชำระบางส่วน');
  perform dptest.eq((ร -> 'franchise' ? 'amount')::text, 'false', 'ไม่ส่งยอดเงินของใบ (แผงไม่มี ฿)');
  perform dptest.eq(jsonb_array_length(ร -> 'activity')::text, '10', 'กิจกรรมล่าสุด 10 รายการตามที่ขอ');
  perform dptest.eq(ร #>> '{activity,0,action}', 'ZZTEST กิจกรรม 12', 'กิจกรรมเรียงล่าสุดก่อน · ไม่มีของสาขาอื่น');
  perform dptest.eq(jsonb_array_length(hq_dealer_panel('ZZDPA', 50) -> 'activity')::text, '12', 'ขอ 50 ได้ครบ 12 (เฉพาะของสาขานี้)');
  perform dptest.eq(hq_dealer_panel('HQ', 10)::text, null, 'แถว HQ ไม่ใช่ดีลเลอร์ = null');
  perform dptest.eq(hq_dealer_panel('ZZNOPE', 10)::text, null, 'รหัสที่ไม่มี = null');
end $$;

-- ดีลเลอร์เรียกไม่ได้
reset role;
do $$
declare ผล text := 'ผ่าน';
begin
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'user_role', 'DEALER_ADMIN', 'dealer_code', 'ZZDPA', 'email', 'd@test')::text, true);
  perform set_config('role', 'authenticated', true);
  begin perform hq_dealer_panel('ZZDPA', 10); exception when others then ผล := sqlerrm; end;
  perform dptest.eq((ผล like 'forbidden%')::text, 'true', 'ดีลเลอร์เรียก = forbidden (ได้: ' || ผล || ')');
end $$;

reset role;
do $$ begin
  if exists (select 1 from dptest.fails) then raise exception 'FAIL: %', (select string_agg(what, E'\n') from dptest.fails); end if;
  raise notice 'ALL PASS';
end $$;
rollback;
