-- ── ใบ 0235: แดชบอร์ด HQ — ตัวเลขทุกตัวตรงกับชุดข้อมูลที่รู้ค่าล่วงหน้า (บอสสั่ง 21 ต.ค. 69) ─────────────────────────────
--   ล้างตารางที่เกี่ยวข้องในรายการนี้ (ย้อนทั้งหมดตอนจบ) แล้วใส่ชุดข้อมูลที่กำหนดเอง
--   ช่วงทดสอบ 1–31 ต.ค. 2026 · "วันนี้" 21 ต.ค. 2026
-- รัน: docker exec -i <คอนเทนเนอร์ฐานทดสอบ> psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/hq_dashboard.sql
begin;
create schema flowtest;
create function flowtest.ok(p_cond boolean, p_what text) returns void language plpgsql as $$
begin if p_cond is not true then raise exception 'FAIL: %', p_what; end if; raise notice 'ok  %', p_what; end $$;
create function flowtest.as_hq() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated',
    'user_role', 'SUPER_ADMIN', 'dealer_code', '', 'email', 'hq@test')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function flowtest.as_dealer() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated',
    'user_role', 'DEALER_ADMIN', 'dealer_code', 'RYG', 'email', 'ryg@test')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function flowtest.as_postgres() returns void language plpgsql as $$
begin perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '', true); end $$;
grant usage on schema flowtest to authenticated;
grant execute on all functions in schema flowtest to authenticated;
create table flowtest.r (k text primary key, v jsonb);
grant all on flowtest.r to authenticated;

-- ═══ ชุดข้อมูล (ปิดตัวดักในช่วงนี้เท่านั้น) ═══
set local session_replication_role = replica;
delete from quotation_won_at; delete from dealer_proposal_payments; delete from dealer_package_proposals; delete from dealer_prospect_activities;
delete from dealer_prospects; delete from hq_quotes; delete from quote_request_events; delete from quote_requests;
delete from quotations; delete from leads;
-- บันทึกการใช้งานลบไม่ได้ (ตัวดักใบ 0241) — ปิดตัวดักชั่วคราวในทรานแซกชันนี้ ซึ่งย้อนกลับท้ายไฟล์เสมอ (ไม่มีอะไรถูกลบจริง)
alter table audit_log disable trigger audit_log_guard_row; delete from audit_log; alter table audit_log enable trigger audit_log_guard_row;
update hq_targets set annual_target = 365000000 where id = 1;
update dealers set revenue_target = 36500000 where code = 'RYG';
update dealers set revenue_target = 0 where code = 'CNX';

-- ใบเสนอราคา: Q1 ออกใบ ก.ย. แต่ตอบรับ ต.ค. (นับ ต.ค.) · Q2 ออกใบ ต.ค. ตอบรับ ก.ย. (ไม่นับ ต.ค.) · ใบของแถว HQ ไม่นับ
insert into customers (id, dealer_code, company) values (989001, 'HQ', 'ZZHD ลูกค้าแถว HQ');
insert into quotations (dealer_code, id, customer, project, status, total_value, date, customer_id) values
  ('RYG', 'ZZHD-Q1', 'ZZHD ก', 'ZZHD', 'won',            100000, '2026-09-20', (select min(id) from customers where dealer_code = 'RYG')),
  ('RYG', 'ZZHD-Q2', 'ZZHD ข', 'ZZHD', 'won',             50000, '2026-10-02', (select min(id) from customers where dealer_code = 'RYG')),
  ('CNX', 'ZZHD-Q3', 'ZZHD ค', 'ZZHD', 'won',             30000, '2026-10-03', (select min(id) from customers where dealer_code = 'CNX')),
  ('HQ',  'ZZHD-Q4', 'ZZHD ง', 'ZZHD', 'won',            999999, '2026-10-06', 989001),
  ('RYG', 'ZZHD-Q5', 'ZZHD จ', 'ZZHD', 'sent_to_client',   7000, '2026-10-04', null),
  ('RYG', 'ZZHD-Q6', 'ZZHD ฉ', 'ZZHD', 'draft',            8000, '2026-10-05', null),
  ('RYG', 'ZZHD-Q7', 'ZZHD ช', 'ZZHD', 'superseded',       9000, '2026-10-06', null),
  ('CNX', 'ZZHD-Q8', 'ZZHD ซ', 'ZZHD', 'lost',             1000, '2026-10-07', null),
  ('CNX', 'ZZHD-Q9', 'ZZHD ฌ', 'ZZHD', 'expired',          2000, '2026-09-30', null);
insert into quotation_won_at (dealer_code, quote_id, won_at) values
  ('RYG', 'ZZHD-Q1', '2026-10-05 10:15+07'),
  ('RYG', 'ZZHD-Q2', '2026-09-28 09:00+07'),
  ('CNX', 'ZZHD-Q3', '2026-10-10 14:30+07'),
  ('HQ',  'ZZHD-Q4', '2026-10-06 11:00+07');

-- ลีด: ต.ค. RYG 3 (ปิดสำเร็จ 1 · ไม่สำเร็จ 1) · CNX 1 (สำเร็จ) · แถว HQ 1 (ไม่นับ) · RYG เข้ามา ก.ย. 1
insert into leads (id, num_id, dealer_code, company, name, phone, province, status, created_date) values
  ('#L-HD-1', 9601, 'RYG', 'ZZHD ล1', 'ZZHD', '0800000001', 'ระยอง',   'PAID',      '2026-10-02'),
  ('#L-HD-2', 9602, 'RYG', 'ZZHD ล2', 'ZZHD', '0800000002', 'ระยอง',   'CANCELLED', '2026-10-03'),
  ('#L-HD-3', 9603, 'RYG', 'ZZHD ล3', 'ZZHD', '0800000003', 'ระยอง',   'WAITING',   '2026-10-31'),
  ('#L-HD-4', 9604, 'CNX', 'ZZHD ล4', 'ZZHD', '0800000004', 'เชียงใหม่', 'PAID',      '2026-10-01'),
  ('#L-HD-5', 9605, 'HQ',  'ZZHD ล5', 'ZZHD', '0800000005', 'ตราด',    'WAITING',   '2026-10-04'),
  ('#L-HD-6', 9606, 'RYG', 'ZZHD ล6', 'ZZHD', '0800000006', 'ระยอง',   'PAID',      '2026-09-15');

-- คำขอราคา: รอตีราคา 3 (เลยกำหนด 1) · ส่งใบแล้ว 1 ไม่นับ
insert into quote_requests (id, request_no, dealer_code, lead_num_id, product, status, submitted_at, due_at) values
  (9701, 'QR-HD-1', 'RYG', 9601, 'โกดัง', 'new',     now() - interval '20 days', now() - interval '6 days'),
  (9702, 'QR-HD-2', 'RYG', 9612, 'โกดัง', 'pricing', now() - interval '2 days',  now() + interval '12 days'),
  (9703, 'QR-HD-3', 'CNX', 9614, 'โกดัง', 'new',     now() - interval '1 day',   now() + interval '13 days'),
  (9704, 'QR-HD-4', 'CNX', 9604, 'โกดัง', 'quoted',  now() - interval '30 days', now() - interval '16 days');

-- ใบค่าแฟรนไชส์: ค้างชำระ 1 ใบ (100,000 จ่าย 40,000 + ยกเลิก 30,000 = ค้าง 60,000)
--   จ่ายครบ · ยังไม่ถึงกำหนด · ยังไม่ตอบรับ = ไม่นับ
insert into dealer_prospects (id, name, status) values (9801, 'ZZHD ผู้สนใจ', 'considering');
insert into dealer_package_proposals (id, prospect_id, proposal_no, package, amount, status, payment_due_on) values
  (9811, 9801, 'DP-HD-1', 'standard', 100000, 'accepted', (now() at time zone 'Asia/Bangkok')::date - 3),
  (9812, 9801, 'DP-HD-2', 'standard',  50000, 'accepted', (now() at time zone 'Asia/Bangkok')::date - 3),
  (9813, 9801, 'DP-HD-3', 'standard',  70000, 'accepted', (now() at time zone 'Asia/Bangkok')::date + 5),
  (9814, 9801, 'DP-HD-4', 'standard',  80000, 'sent',     (now() at time zone 'Asia/Bangkok')::date - 3);
insert into dealer_proposal_payments (proposal_id, paid_on, amount, reference, cancelled_at) values
  (9811, '2026-10-01', 40000, 'ZZHD-1', null), (9811, '2026-10-02', 30000, 'ZZHD-2', now()), (9812, '2026-10-01', 50000, 'ZZHD-3', null);

-- บันทึกการใช้งาน: เห็นรายการเดียว — ที่เหลือเป็นบัญชีทดสอบ / สาขา ZZ / ป้าย ZZTEST / งานขายของสาขา / นอกช่วง
insert into audit_log ("user", role, action, target, at) values
  ('ผู้ดูแลระบบสำนักงานใหญ่', 'SUPER_ADMIN', 'แก้ไขดีลเลอร์', 'RYG · ร้านระยอง', '2026-10-12 09:00+07'),
  ('บัญชีทดสอบชั่วคราว',     'SUPER_ADMIN', 'แก้ไขดีลเลอร์', 'RYG · ร้านระยอง', '2026-10-12 09:01+07'),
  ('live-hq-1@example.test',  'SUPER_ADMIN', 'แก้ไขดีลเลอร์', 'RYG · ร้านระยอง', '2026-10-12 09:02+07'),
  ('ผู้ดูแลระบบสำนักงานใหญ่', 'SUPER_ADMIN', 'ปิดใช้งานดีลเลอร์', 'ZZT · สาขาทดสอบชั่วคราว', '2026-10-12 09:03+07'),
  ('ผู้ดูแลระบบสำนักงานใหญ่', 'SUPER_ADMIN', 'ออกใบค่าแฟรนไชส์', 'DP-1 · ZZTEST-ผู้สนใจ', '2026-10-12 09:04+07'),
  ('ผู้ดูแลระบบสำนักงานใหญ่', 'SUPER_ADMIN', 'โอนลูกค้าเป้าหมายของ HQ ให้ดีลเลอร์', 'ระยอง → RYG · 1 ราย', '2026-10-12 09:05+07'),
  ('sales@rayongsteel.co.th', 'DEALER_ADMIN', 'สร้างใบเสนอราคา', 'RYG · Q-1 · ลูกค้า', '2026-10-12 09:06+07'),
  ('ผู้ดูแลระบบสำนักงานใหญ่', 'SUPER_ADMIN', 'บันทึกการตั้งค่า', 'การแจ้งเตือน', '2026-09-12 09:00+07');
set local session_replication_role = origin;

-- ═══ ตรวจ (เรียกในบทบาท HQ) ═══
select flowtest.as_hq();
insert into flowtest.r values ('all', public.hq_dashboard('2026-10-01', '2026-10-31', null, '2026-10-21'));
insert into flowtest.r values ('ryg', public.hq_dashboard('2026-10-01', '2026-10-31', 'RYG', '2026-10-21'));
insert into flowtest.r values ('sep', public.hq_dashboard('2026-09-01', '2026-09-30', null, '2026-10-21'));
insert into flowtest.r values ('empty', public.hq_dashboard('2026-01-01', '2026-01-31', null, '2026-10-21'));
select flowtest.as_postgres();

do $$
declare a jsonb := (select v from flowtest.r where k = 'all'); g jsonb := (select v from flowtest.r where k = 'ryg');
        s jsonb := (select v from flowtest.r where k = 'sep'); e jsonb := (select v from flowtest.r where k = 'empty');
        oct jsonb;
begin
  -- วันนี้ต้องทำ: ไม่ขึ้นกับตัวกรอง
  perform flowtest.ok((a->'today'->>'requestsOpen')::int = 3, 'วันนี้ต้องทำ: คำขอรอตีราคา 3');
  perform flowtest.ok((a->'today'->>'requestsOverdue')::int = 1, 'วันนี้ต้องทำ: เกิน 14 วัน 1');
  perform flowtest.ok((a->'today'->'franchiseOverdue'->>'count')::int = 1, 'วันนี้ต้องทำ: ใบค่าแฟรนไชส์ค้างชำระ 1');
  perform flowtest.ok((a->'today'->'franchiseOverdue'->>'amount')::numeric = 60000, 'ค้างชำระ 60,000 (ไม่นับรายการที่ยกเลิก)');
  perform flowtest.ok(a->'today'->'franchiseOverdue'->'ids' = '[9811]'::jsonb, 'ค้างชำระ: เลขใบ 9811');
  perform flowtest.ok(g->'today' = a->'today' and e->'today' = a->'today', 'วันนี้ต้องทำ: เลือกดีลเลอร์/ช่วงเวลาไม่เปลี่ยน');

  -- การ์ด ทั้งเครือ ต.ค.
  perform flowtest.ok((a->'cards'->>'sales')::numeric = 130000, 'ยอดขาย ต.ค. = Q1 (ตอบรับ ต.ค.) + Q3 · ไม่นับ Q2 (ตอบรับ ก.ย.) · ไม่นับแถว HQ');
  perform flowtest.ok((a->'cards'->>'target')::numeric = 31000000, 'เป้าตามช่วง = 365 ล้าน × 31 ÷ 365');
  perform flowtest.ok((a->'cards'->>'days')::int = 31, 'จำนวนวันของช่วง 31');
  perform flowtest.ok((a->'cards'->>'leadsNew')::int = 4, 'ลีดใหม่ ต.ค. 4 (ไม่นับแถว HQ · ไม่นับ ก.ย.)');
  perform flowtest.ok((a->'cards'->>'quotesSent')::int = 4, 'ใบที่ส่งลูกค้า ต.ค. 4 (ไม่นับร่าง/ถูกแทนที่/แถว HQ)');
  perform flowtest.ok((a->'cards'->>'closedWon')::int = 2 and (a->'cards'->>'closedLost')::int = 1, 'ลีดปิดสำเร็จ 2 · ไม่สำเร็จ 1');

  -- การ์ด เลือก RYG
  perform flowtest.ok((g->'cards'->>'sales')::numeric = 100000, 'RYG: ยอดขาย 100,000');
  perform flowtest.ok((g->'cards'->>'target')::numeric = 3100000, 'RYG: เป้าสาขา 36.5 ล้าน × 31 ÷ 365');
  perform flowtest.ok((g->'cards'->>'leadsNew')::int = 3 and (g->'cards'->>'quotesSent')::int = 2, 'RYG: ลีดใหม่ 3 · ใบส่ง 2');
  perform flowtest.ok((g->'cards'->>'closedWon')::int = 1 and (g->'cards'->>'closedLost')::int = 1, 'RYG: ปิด 1/1');

  -- ช่วง ก.ย. · ช่วงไม่มีข้อมูล
  perform flowtest.ok((s->'cards'->>'sales')::numeric = 50000, 'ก.ย.: ยอดขาย = Q2 (ตอบรับ ก.ย.)');
  perform flowtest.ok((s->'cards'->>'leadsNew')::int = 1, 'ก.ย.: ลีดใหม่ 1');
  perform flowtest.ok((e->'cards'->>'sales')::numeric = 0 and e->'top' = '[]'::jsonb, 'ม.ค.: ไม่มียอดขาย · 10 อันดับว่าง');
  perform flowtest.ok(e->'trend'->'byMonth' = '[]'::jsonb and e->'trend'->'byDay' = '[]'::jsonb, 'ม.ค.: กราฟยอดขายไม่มีจุด');
  perform flowtest.ok(e->'activity' = '[]'::jsonb, 'ม.ค.: ไม่มีกิจกรรม');

  -- 10 อันดับ
  perform flowtest.ok(jsonb_array_length(a->'top') = 2, '10 อันดับ: เฉพาะดีลเลอร์ที่มียอด (RYG · CNX · ไม่มีแถว HQ)');
  perform flowtest.ok(a->'top'->0->>'code' = 'RYG' and (a->'top'->0->>'sales')::numeric = 100000, 'อันดับ 1 RYG 100,000');
  perform flowtest.ok((a->'top'->0->>'target')::numeric = 3100000, 'อันดับ 1: เป้าสาขาตามช่วง');
  perform flowtest.ok(a->'top'->1->>'code' = 'CNX' and (a->'top'->1->>'target') is null, 'อันดับ 2 CNX · ยังไม่ตั้งเป้า = null');
  perform flowtest.ok((a->'top'->1->>'closedWon')::int = 1 and (a->'top'->1->>'closedLost')::int = 0, 'CNX: ปิด 1/0');

  -- แนวโน้ม
  perform flowtest.ok(a->'trend'->'byDay' = '[{"d":"2026-10-05","sales":100000},{"d":"2026-10-10","sales":30000}]'::jsonb, 'รายวัน = วันตอบรับ');
  perform flowtest.ok(a->'trend'->'byHour' = '[{"h":10,"sales":100000},{"h":14,"sales":30000}]'::jsonb, 'รายชั่วโมง = เวลาตอบรับ (ไทย)');
  perform flowtest.ok(a->'trend'->'byMonth' = '[{"y":2026,"m":9,"sales":130000}]'::jsonb, 'รายเดือน: ต.ค. 130,000');

  -- 12 เดือน
  perform flowtest.ok(jsonb_array_length(a->'monthly') = 12, '12 เดือนย้อนหลัง');
  oct := a->'monthly'->11;
  perform flowtest.ok(oct = '{"y":2026,"m":9,"leads":4,"quotes":5,"won":2,"sales":130000}'::jsonb, 'เดือน ต.ค.: ลีด 4 · ใบ 5 · ตอบรับ 2 · ยอด 130,000 — ' || oct::text);
  perform flowtest.ok(a->'monthly'->10 = '{"y":2026,"m":8,"leads":1,"quotes":2,"won":1,"sales":50000}'::jsonb, 'เดือน ก.ย. — ' || (a->'monthly'->10)::text);
  perform flowtest.ok(a->'monthly'->0->>'y' = '2025' and a->'monthly'->0->>'m' = '10', 'เดือนแรก = พ.ย. 2025');
  perform flowtest.ok(e->'monthly' = a->'monthly', '12 เดือนไม่ขึ้นกับตัวกรองเวลา');
  perform flowtest.ok((a->>'monthlyTarget')::numeric = 30416667 and (g->>'monthlyTarget')::numeric = 3041667, 'เป้ารายเดือน = เป้าทั้งปี ÷ 12');

  -- ภาค
  perform flowtest.ok((a->>'dealerCount')::int = (select count(*) from dealers where code <> 'HQ'), 'จำนวนดีลเลอร์ = ทะเบียน ไม่นับแถว HQ');
  perform flowtest.ok((select sum((x->>'dealers')::int) from jsonb_array_elements(a->'regions') x) = (a->>'dealerCount')::int, 'โดนัทภาครวม = จำนวนดีลเลอร์');
  perform flowtest.ok((select sum((x->>'sales')::numeric) from jsonb_array_elements(a->'regions') x) = 130000, 'ยอดตามภาครวม = ยอดขาย');
  perform flowtest.ok((g->>'dealerCount')::int = 1, 'เลือก RYG: ดีลเลอร์ 1');

  -- กิจกรรม
  perform flowtest.ok(jsonb_array_length(a->'activity') = 1 and a->'activity'->0->>'action' = 'แก้ไขดีลเลอร์'
                      and a->'activity'->0->>'user' = 'ผู้ดูแลระบบสำนักงานใหญ่', 'กิจกรรม: เหลือรายการจริงรายการเดียว — ' || (a->'activity')::text);
end $$;

-- ═══ สิทธิ์: ดีลเลอร์เรียกไม่ได้ · ช่วงผิดถูกปฏิเสธ ═══
select flowtest.as_dealer();
do $$ begin
  begin perform public.hq_dashboard('2026-10-01', '2026-10-31');
        raise exception 'FAIL: ดีลเลอร์เรียก hq_dashboard ได้';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    perform flowtest.ok(sqlerrm like 'forbidden:%', 'ดีลเลอร์เรียกไม่ได้ (' || sqlerrm || ')');
  end;
end $$;
select flowtest.as_hq();
do $$ begin
  begin perform public.hq_dashboard('2026-10-31', '2026-10-01');
        raise exception 'FAIL: ช่วงกลับหัวผ่าน';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    perform flowtest.ok(sqlerrm like 'bad_range:%', 'ช่วงกลับหัวถูกปฏิเสธ');
  end;
end $$;
select flowtest.as_postgres();
do $$ begin
  perform flowtest.ok(not has_table_privilege('authenticated', 'public.quotation_won_at', 'select'), 'ตารางวันตอบรับ: ผู้ใช้อ่านตรงไม่ได้');
  perform flowtest.ok(not has_function_privilege('authenticated', 'public._hd_won(text)', 'execute'), 'ตัวช่วย _hd_won: ผู้ใช้เรียกตรงไม่ได้');
end $$;

-- ═══ ตัวดักวันตอบรับ: ตอบรับ → บันทึกเวลา · ย้อนการตอบรับ → ลบ ═══
--   ตรวจตัวดักนี้ตัวเดียว (ปิดตัวดักอื่นของตารางใบในรายการนี้ — กติกาใบ HQ/ล็อกใบมีข้อทดสอบของตัวเองแล้ว)
set local session_replication_role = origin;
alter table quotations disable trigger user;
alter table quotations enable trigger quotations_won_at_sync;
alter table quotations enable always trigger quotations_vat_fill;   -- ใบ 0237: ตัวเติม VAT ทำงานเสมอ (ช่องห้ามว่าง)
insert into quotations (dealer_code, id, customer, project, status, total_value, date) values ('RYG', 'ZZHD-T1', 'ZZHD ต', 'ZZHD', 'sent_to_client', 500, '2026-10-01');
update quotations set status = 'won', customer_id = (select min(id) from customers where dealer_code = 'RYG') where dealer_code = 'RYG' and id = 'ZZHD-T1';
do $$ begin
  perform flowtest.ok((select won_at > now() - interval '1 minute' from quotation_won_at where dealer_code = 'RYG' and quote_id = 'ZZHD-T1'), 'ตอบรับ → บันทึกวันตอบรับ = ตอนนี้');
end $$;
update quotations set status = 'sent_to_client' where dealer_code = 'RYG' and id = 'ZZHD-T1';
do $$ begin
  perform flowtest.ok(not exists (select 1 from quotation_won_at where dealer_code = 'RYG' and quote_id = 'ZZHD-T1'), 'ย้อนการตอบรับ → ลบวันตอบรับ');
end $$;

\echo 'hq_dashboard: ALL PASS'
rollback;
