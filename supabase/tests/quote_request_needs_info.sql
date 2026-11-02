-- ── ข้อทดสอบใบ 0273 (ข้อ 11): ขอราคาจาก HQ ได้เมื่อ "เก็บข้อมูลลูกค้า" + "สรุปความต้องการ" ครบ (บอสสั่ง 2 พ.ย. 69) ──
--   1) ลีดข้อมูลไม่ครบ ยิงตรงเข้าฐาน = ปฏิเสธ พร้อมบอกช่องที่ขาด (ชื่อช่องตรง lib/fieldLabels.ts)
--   2) กรอกครบแล้ว (2 งานติ๊กเอง) = ขอได้ · "นัดหมาย" ยังไม่ทำก็ขอได้
--   3) คำขอที่ส่งไปแล้วก่อนกฎนี้ไม่กระทบ — ขอแก้ราคาบนลีดข้อมูลไม่ครบยังทำได้
--   ตกบนโค้ดก่อนใบ 0273: ลีดข้อมูลไม่ครบส่งคำขอได้
-- รัน: docker exec -i <คอนเทนเนอร์ฐานทดสอบ> psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 < supabase/tests/quote_request_needs_info.sql
begin;
create schema qntest;
create function qntest.ok(p_cond boolean, p_what text) returns void language plpgsql as $$
begin if p_cond is not true then raise exception 'FAIL: %', p_what; end if; raise notice 'ok  %', p_what; end $$;
create function qntest.must_fail(p_sql text, p_like text, p_what text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if sqlerrm ilike '%' || p_like || '%' then raise notice 'ok  % (ถูกปฏิเสธ: %)', p_what, sqlerrm; return; end if;
    raise exception 'FAIL: % — ถูกปฏิเสธแต่ข้อความไม่ตรง: %', p_what, sqlerrm;
  end;
  raise exception 'FAIL: % — ควรถูกปฏิเสธแต่ผ่าน', p_what;
end $$;
create function qntest.as_user(p_uid uuid, p_role text, p_dealer text) returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated',
    'user_role', p_role, 'dealer_code', p_dealer, 'email', 'zzqn@example.test')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function qntest.as_admin() returns void language plpgsql as $$
begin perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '', true); end $$;
grant usage on schema qntest to authenticated;
grant execute on all functions in schema qntest to authenticated;

-- ═══ ข้อมูลของข้อ: ZZQNI · L1 ข้อมูลครบ (ไม่มีนัดหมาย) · L2 ขาดโทรศัพท์ + พื้นที่ · L3 ขาดทุกช่องงาน · L4 ข้อมูลไม่ครบแต่ได้ใบ HQ แล้ว (ก่อนกฎ) ═══
set local session_replication_role = replica;
insert into dealers (code, name, province, region, status, revenue_target) values ('ZZQNI', 'ZZTEST ข้อมูลครบ', 'ตราด', 'ตะวันออก', 'active', 0);
insert into auth.users (id, email, aud, role) values ('00000000-0000-4000-8000-0000000d0001', 'zzqn@example.test', 'authenticated', 'authenticated');
insert into profiles (id, role, dealer_code, name, status) values ('00000000-0000-4000-8000-0000000d0001', 'DEALER_ADMIN', 'ZZQNI', 'ZZQN ดีลเลอร์', 'active');
insert into leads (id, num_id, dealer_code, company, contact, phone, province, project, area, note, status) values
  ('ZZQNI-L1', 994001, 'ZZQNI', 'ZZTEST ครบ', 'คุณครบ', '000-000-0001', 'ตราด', 'โกดัง 20x40', '800', 'หลังคาเมทัลชีท', 'WAITING'),
  ('ZZQNI-L2', 994002, 'ZZQNI', 'ZZTEST ขาด', 'คุณขาด', '', 'ตราด', 'โกดัง', '', 'สเปก', 'WAITING'),
  ('ZZQNI-L3', 994003, 'ZZQNI', 'ZZTEST งาน', 'คุณงาน', '000-000-0003', '', '', '0', '', 'BULLET'),
  ('ZZQNI-L4', 994004, 'ZZQNI', 'ZZTEST เดิม', '', '', 'ตราด', '', '', '', 'HQ_QUOTED');
insert into quote_requests (id, request_no, dealer_code, lead_num_id, product, status, due_at, root_id) values
  (994104, 'RQ-ZZQNI-4', 'ZZQNI', 994004, 'ZZTEST', 'quoted', now() + interval '14 days', 994104);
insert into hq_quotes (id, request_id, version, quote_no, status, total_cost, valid_until) values
  (994114, 994104, 1, 'HQ-ZZQNI-4', 'sent', 1000, current_date + 30);
set local session_replication_role = origin;

do $$
declare
  U constant uuid := '00000000-0000-4000-8000-0000000d0001';
  r quote_requests;
begin
  perform qntest.as_user(U, 'DEALER_ADMIN', 'ZZQNI');
  -- ══ 1) ไม่ครบ = ปฏิเสธ + บอกช่องที่ขาด ══
  perform qntest.must_fail('select quote_request_submit(994002, ''โกดัง'')', 'lead_incomplete: ข้อมูลลูกค้าเป้าหมายยังไม่ครบ — ขาด โทรศัพท์ · พื้นที่ (ตร.ม.)',
    'ขาดโทรศัพท์ + พื้นที่ = ปฏิเสธ บอก 2 ช่อง');
  perform qntest.must_fail('select quote_request_submit(994003, ''โกดัง'')', 'ขาด จังหวัดหน้างาน · งานที่ต้องการ · พื้นที่ (ตร.ม.) · สเปก / รายละเอียดงาน',
    'ข้อมูลลูกค้าครบแต่ข้อมูลงานไม่ครบ = ปฏิเสธ บอก 4 ช่อง');
  perform qntest.as_admin();
  perform qntest.ok(not exists (select 1 from quote_requests where dealer_code = 'ZZQNI' and lead_num_id in (994002, 994003)), 'ไม่มีคำขอเกิดขึ้น');
  perform qntest.ok((select status from leads where id = 'ZZQNI-L2') = 'WAITING', 'ลีดไม่ขยับขั้น');

  -- ══ 2) กรอกครบแล้วขอได้ — 2 งานติ๊กเอง · นัดหมายไม่บังคับ ══
  update leads set phone = '000-000-0002', area = '600' where id = 'ZZQNI-L2';
  perform qntest.ok(exists (select 1 from leads l, jsonb_array_elements(l.tasks) t where l.id = 'ZZQNI-L2' and t ->> 'key' = 'collect' and (t ->> 'done')::boolean)
                    and exists (select 1 from leads l, jsonb_array_elements(l.tasks) t where l.id = 'ZZQNI-L2' and t ->> 'key' = 'requirement' and (t ->> 'done')::boolean),
                    'กรอกครบแล้ว "เก็บข้อมูลลูกค้า" + "สรุปความต้องการ" ติ๊กเอง');
  perform qntest.as_user(U, 'DEALER_ADMIN', 'ZZQNI');
  r := quote_request_submit(994002, 'โกดัง');
  perform qntest.ok(r.id is not null, 'กรอกครบแล้วขอราคาได้');
  r := quote_request_submit(994001, 'โกดัง 20x40');
  perform qntest.as_admin();
  perform qntest.ok(not exists (select 1 from appointments where dealer_code = 'ZZQNI'), 'ไม่มีนัดหมายเลย ก็ขอราคาได้ (นัดหมายไม่บังคับ)');
  perform qntest.ok((select status from leads where id = 'ZZQNI-L1') = 'HQ_PRICING', 'ลีดที่ขอราคาแล้วขยับเป็นรอราคา HQ');

  -- ══ 3) คำขอที่ส่งไปแล้วก่อนกฎ: ขอแก้ราคาบนลีดข้อมูลไม่ครบยังได้ ══
  perform qntest.as_user(U, 'DEALER_ADMIN', 'ZZQNI');
  r := quote_request_reprice(994104, 'ลูกค้าขอปรับขนาด');
  perform qntest.ok(r.id is not null and r.supersedes_id = 994104, 'คำขอเดิม (ก่อนกฎ) ขอแก้ราคาได้ ไม่ตรวจข้อมูลครบซ้ำ');
  perform qntest.as_admin();
end $$;

select 'ALL PASS' as result;
rollback;
