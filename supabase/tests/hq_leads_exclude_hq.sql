-- ── ข้อทดสอบใบ 0265: หน้าลีดทั้งเครือของ HQ นับชุดเดียวกันทั้งหน้า (บอสตัดสิน 30 ต.ค. 69) ──
--   ลีดของ HQ ที่ยังไม่โอน ไม่นับในการ์ด/กราฟ/ตาราง (อยู่ในกล่องโอนที่เดียว) · ขอแถว HQ ตรง ๆ (p_dealer_codes มี 'HQ') ยังได้
--   การ์ด "ลีดที่เปิดอยู่" = ณ ตอนนี้ = ผลรวมขั้น 1–5 ของ lead_summary ไม่ผูกช่วง = ตาราง "กำลังดำเนินการ" ไม่ผูกช่วง
--   การ์ด "ลีดใหม่ในช่วงนี้" = แหล่งที่มารวมกัน (lead_summary ตามช่วง) = ตาราง "ทั้งหมด" ตามช่วง
--   การ์ด "ไม่เคลื่อนไหวเกิน 30 วัน" = ตาราง "ค้างติดตาม" ที่ 30 วัน
--   ข้อมูลของข้อ: ป้ายค้น ZZ1SET (สาขา ZZLXA + ลีดของ HQ) · ตัวกรองคำค้นทำให้ทุกตัวนับเฉพาะของข้อ
--   (2 พ.ย. 69 · ใบ 0271 เจาะลึก) การ์ด/กราฟคิดตาม "ระดับ" (ชุดสาขา) เท่านั้น — คำค้น/จังหวัดหน้างาน/ช่องทาง คุมแค่รายชื่อ
--     → เทียบการ์ด = กราฟ = ตาราง ที่ระดับทั้งเครือและระดับดีลเลอร์ของข้อ (ไม่ใส่คำค้น) · ตัวกรองรายชื่อไม่เปลี่ยนการ์ด (กลับด้านจากเดิม)
--     ทั้งรายการเห็นข้อมูลชุดเดียว (repeatable read) — ระดับทั้งเครือนับลีดของทุกสาขา ข้ออื่นที่รันพร้อมกันเขียนแทรกไม่ได้
-- รัน: docker exec -i <คอนเทนเนอร์ฐานทดสอบ> psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 < supabase/tests/hq_leads_exclude_hq.sql
-- ทรานแซกชันเดียวแล้ว rollback · ผ่าน = "ALL PASS" · ตกบนโค้ดก่อนใบ 0265: กราฟ/ตารางนับลีด HQ รวม (เกิน 2)
begin;
set transaction isolation level repeatable read;
create schema lxtest;
create table lxtest.fails (what text);
create function lxtest.eq(p_got numeric, p_want numeric, p_what text) returns void language plpgsql as $$
begin
  if p_got is distinct from p_want then insert into lxtest.fails values (p_what || ' — ได้ ' || coalesce(p_got::text, 'ไม่มี') || ' ควร ' || coalesce(p_want::text, 'ไม่มี'));
    raise notice 'FAIL %', p_what; return; end if;
  raise notice 'ok  %', p_what;
end $$;
grant usage on schema lxtest to authenticated;
grant execute on all functions in schema lxtest to authenticated;
grant insert on lxtest.fails to authenticated;

-- สาขา ZZLXA (ตราด): เปิดอยู่ 3 ราย (ขั้น 1 · 3 · 5) ในเดือน ต.ค. + เปิดอยู่ 1 ราย เข้ามาปีก่อน (นอกช่วง · เงียบ 40 วัน)
--   ปิดสำเร็จ 1 · ปิดไม่สำเร็จ 1 ในเดือน ต.ค. · ลีดของ HQ ที่ยังไม่โอน 2 ราย ในเดือน ต.ค. (ป้ายเดียวกัน)
set local session_replication_role = replica;
insert into dealers (code, name, province, region, status) values ('ZZLXA', 'ZZTEST ลีดชุดเดียว', 'ตราด', 'ตะวันออก', 'active');
insert into dealer_territories (province, dealer_code) values ('ตราด', 'ZZLXA');
insert into leads (id, num_id, dealer_code, company, name, phone, province, source, status, created_date, last_contact_at) values
  ('#L-991101', 991101, 'ZZLXA', 'ZZ1SET ก', 'ZZTEST', '000-000-1101', 'ตราด', 'Facebook', 'WAITING',   '2026-10-05', '2026-10-28'),
  ('#L-991102', 991102, 'ZZLXA', 'ZZ1SET ข', 'ZZTEST', '000-000-1102', 'ตราด', 'Facebook', 'HQ_QUOTED', '2026-10-06', '2026-10-28'),
  ('#L-991103', 991103, 'ZZLXA', 'ZZ1SET ค', 'ZZTEST', '000-000-1103', 'ตราด', 'เว็บไซต์', 'QUOTED',    '2026-10-07', '2026-10-28'),
  ('#L-991104', 991104, 'ZZLXA', 'ZZ1SET ง เก่า', 'ZZTEST', '000-000-1104', 'ตราด', 'เว็บไซต์', 'WAITING', '2025-12-01', '2026-09-20'),
  ('#L-991105', 991105, 'ZZLXA', 'ZZ1SET จ', 'ZZTEST', '000-000-1105', 'ตราด', 'Facebook', 'PAID',      '2026-10-08', '2026-10-20'),
  ('#L-991106', 991106, 'ZZLXA', 'ZZ1SET ฉ', 'ZZTEST', '000-000-1106', 'ตราด', 'Facebook', 'CANCELLED', '2026-10-09', '2026-10-20'),
  ('#L-991107', 991107, 'HQ',    'ZZ1SET HQ1', 'ZZTEST', '000-000-1107', 'ตราด', 'Facebook', 'WAITING', '2026-10-10', '2026-10-10'),
  ('#L-991108', 991108, 'HQ',    'ZZ1SET HQ2', 'ZZTEST', '000-000-1108', 'ตราด', 'เว็บไซต์', 'WAITING', '2026-10-11', '2026-09-01');
set local session_replication_role = origin;

do $$
declare
  hq uuid := (select id from profiles where role = 'SUPER_ADMIN' and status = 'active' limit 1);
  ป้าย constant text := 'ZZ1SET';
  ช่วงต้น constant date := '2026-10-01'; ช่วงท้าย constant date := '2026-10-31'; วันนี้ constant date := '2026-10-30';
  ตัวกรอง record; การ์ด jsonb; ทั้งหมด jsonb; ตามช่วง jsonb; ขั้น15 numeric; แหล่ง numeric; ชุดสาขา text[];
begin
  perform set_config('request.jwt.claims', json_build_object('sub', hq, 'role', 'authenticated', 'user_role', 'SUPER_ADMIN', 'dealer_code', '', 'email', 'hq@test')::text, true);
  perform set_config('role', 'authenticated', true);

  -- ทุกระดับที่หน้าเว็บส่ง (ทั้งเครือ · ดีลเลอร์ของข้อ) — การ์ด กราฟ ตาราง ใช้ชุดสาขาเดียวกัน ไม่มีคำค้น
  for ตัวกรอง in select * from (values ('ทั้งเครือ', null::text[]), ('ดีลเลอร์ ZZLXA', array['ZZLXA'])) v(ชื่อ, สาขา)
  loop
    การ์ด := kpi_cards('hq.leads', ช่วงต้น, ช่วงท้าย, null, วันนี้, case when ตัวกรอง.สาขา is null then null else jsonb_build_object('dealerCodes', to_jsonb(ตัวกรอง.สาขา)) end);
    ทั้งหมด := lead_summary(ตัวกรอง.สาขา, null, null, null, null, null, null, null, null);
    ตามช่วง := lead_summary(ตัวกรอง.สาขา, null, null, null, null, null, ช่วงต้น, ช่วงท้าย, null);
    ขั้น15 := (select coalesce(sum((x ->> 'count')::numeric), 0) from jsonb_array_elements(ทั้งหมด -> 'byStage') x where (x ->> 'stage')::int between 1 and 5);
    แหล่ง := (select coalesce(sum((x ->> 'count')::numeric), 0) from jsonb_array_elements(ตามช่วง -> 'bySource') x);
    perform lxtest.eq(ขั้น15, (การ์ด ->> 'open')::numeric, ตัวกรอง.ชื่อ || ': กราฟขั้น 1–5 (ไม่ผูกช่วง) = การ์ดลีดที่เปิดอยู่');
    perform lxtest.eq(แหล่ง, (การ์ด ->> 'new')::numeric, ตัวกรอง.ชื่อ || ': วงกลมแหล่งที่มา (ตามช่วง) = การ์ดลีดใหม่');
    perform lxtest.eq((leads_page(10, 0, null, ตัวกรอง.สาขา, null, null, null, null, null, null, false, วันนี้, 30, null, false, 0) ->> 'total')::numeric,
      (การ์ด ->> 'open')::numeric, ตัวกรอง.ชื่อ || ': ตารางกำลังดำเนินการ (ไม่ผูกช่วง) = การ์ดลีดที่เปิดอยู่');
    perform lxtest.eq((leads_page(10, 0, null, ตัวกรอง.สาขา, null, null, null, null, ช่วงต้น, ช่วงท้าย, false, วันนี้, 30, null, false, null) ->> 'total')::numeric,
      (การ์ด ->> 'new')::numeric, ตัวกรอง.ชื่อ || ': ตารางทั้งหมด (ตามช่วง) = การ์ดลีดใหม่');
    perform lxtest.eq((leads_page(10, 0, null, ตัวกรอง.สาขา, null, null, null, null, null, null, true, วันนี้, 30, null, false, 0) ->> 'total')::numeric,
      (การ์ด ->> 'idle')::numeric, ตัวกรอง.ชื่อ || ': ตารางค้างติดตาม 30 วัน = การ์ดไม่เคลื่อนไหว');
  end loop;

  -- ตัวกรองรายชื่อ (คำค้น · จังหวัดหน้างาน · ช่องทาง) ไม่เปลี่ยนการ์ด — กลับด้านจากเดิมที่การ์ดเดินตามตัวกรองเหล่านี้
  การ์ด := kpi_cards('hq.leads', ช่วงต้น, ช่วงท้าย, null, วันนี้, '{"dealerCodes":["ZZLXA"]}');
  perform lxtest.eq((kpi_cards('hq.leads', ช่วงต้น, ช่วงท้าย, null, วันนี้, jsonb_build_object('dealerCodes', jsonb_build_array('ZZLXA'), 'search', ป้าย, 'province', 'ตราด', 'source', 'Facebook')) = การ์ด)::int, 1,
    'ใส่คำค้น/จังหวัด/ช่องทาง แล้วการ์ดเท่าเดิม (คุมแค่รายชื่อ)');

  -- ค่าที่รู้แน่นอน (ระดับดีลเลอร์ของข้อ): เปิดอยู่ 4 · ใหม่ในช่วง 5 · ไม่เคลื่อนไหว 1 (ราย "ง เก่า" เงียบ 40 วัน) · ลีดของ HQ ป้ายเดียวกันไม่นับ
  การ์ด := kpi_cards('hq.leads', ช่วงต้น, ช่วงท้าย, null, วันนี้, '{"dealerCodes":["ZZLXA"]}');
  perform lxtest.eq((การ์ด ->> 'open')::numeric, 4, 'การ์ดลีดที่เปิดอยู่ = 4 (ไม่นับลีด HQ)');
  perform lxtest.eq((การ์ด ->> 'new')::numeric, 5, 'การ์ดลีดใหม่ = 5 (ไม่นับลีด HQ · ไม่นับรายนอกช่วง)');
  perform lxtest.eq((การ์ด ->> 'idle')::numeric, 1, 'การ์ดไม่เคลื่อนไหว = 1 (ลีด HQ ที่เงียบไม่นับ)');
  perform lxtest.eq((select count(*) from jsonb_array_elements(hq_drill('leads', ช่วงต้น, ช่วงท้าย, วันนี้) -> 'dealers') r where r ->> 'code' = 'HQ'), 0, 'แถวรายดีลเลอร์ไม่มี HQ');
  ตามช่วง := lead_summary(null, null, null, null, ป้าย, null, ช่วงต้น, ช่วงท้าย, null);
  perform lxtest.eq((select coalesce(sum((x ->> 'leads')::numeric), 0) from jsonb_array_elements(ตามช่วง -> 'byDealer') x where x ->> 'dealer_code' = 'HQ'), 0, 'lead_summary ไม่มีแถว HQ');
  perform lxtest.eq((select coalesce(sum((x ->> 'new')::numeric), 0) from jsonb_array_elements(ตามช่วง -> 'byMonth') x), 5, 'กราฟแนวโน้ม ลีดใหม่รวม = 5');
  -- ขอแถว HQ ตรง ๆ ยังได้ (กล่องโอน/หน้าเจาะแถว HQ)
  perform lxtest.eq((leads_page(10, 0, null, array['HQ'], null, null, null, ป้าย, null, null, false, วันนี้, 30, null, false, null) ->> 'total')::numeric, 2, 'leads_page ขอ HQ ตรง ๆ = 2');
  perform lxtest.eq((select coalesce(sum((x ->> 'count')::numeric), 0) from jsonb_array_elements(lead_summary(array['HQ'], null, null, null, ป้าย, null, null, null, null) -> 'bySource') x), 2, 'lead_summary ขอ HQ ตรง ๆ = 2');
end $$;

reset role;
do $$ begin
  if exists (select 1 from lxtest.fails) then raise exception 'FAIL: %', (select string_agg(what, E'\n') from lxtest.fails); end if;
  raise notice 'ALL PASS';
end $$;
rollback;
