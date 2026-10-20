-- ── ข้อทดสอบใบ 0217: กติกาปิดงานของลีด (บอสตัดสิน 19 ต.ค. 69 · รอบ 2 ช่วง ก ข้อ 3 · 4 · 6) ───────────────────────
--   ข้อ 3  ลีด PAID: ดีลเลอร์พาออกไม่ได้ (ทั้งคำสั่งบันทึกลีดและยิงตรง) · HQ ทำได้ทางเดียว = ย้อนการตอบรับ (ข้อ 4)
--   ข้อ 4  HQ ย้อนการตอบรับ → ลีดกลับสถานะก่อนปิด (จดไว้ตอนเข้า PAID) · ไม่มีประวัติ = เสนอราคา (QUOTED)
--   ข้อ 6  ดีลเลอร์ลบลีดที่มีคำขอราคา/ใบเสนอราคาไม่ได้ (ข้อความบอกให้ใช้ "เสียโอกาส") · ลีดเปล่าลบได้
-- รัน: docker exec -i supabase_db_pms-dbcheck psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 < supabase/tests/lead_close_rules.sql
-- ทรานแซกชันเดียวแล้ว rollback · รอบปิดด่านรันผ่าน tests/scenario/db-rule-tests.spec.ts · ผ่าน = "ALL PASS"
begin;
create schema closetest;
create function closetest.ok(p_cond boolean, p_what text) returns void language plpgsql as $$
begin if p_cond is not true then raise exception 'FAIL: %', p_what; end if; raise notice 'ok  %', p_what; end $$;
create function closetest.must_fail(p_sql text, p_like text, p_what text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if sqlerrm ilike '%' || p_like || '%' then raise notice 'ok  % (ถูกปฏิเสธ)', p_what; return; end if;
    raise exception 'FAIL: % — ถูกปฏิเสธแต่ข้อความไม่ตรง: %', p_what, sqlerrm;
  end;
  raise exception 'FAIL: % — ควรถูกปฏิเสธแต่ผ่าน', p_what;
end $$;
create function closetest.as_dealer() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.profiles where role = 'DEALER_ADMIN' and dealer_code = 'CNX' limit 1),
    'role', 'authenticated', 'user_role', 'DEALER_ADMIN', 'dealer_code', 'CNX')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function closetest.as_hq() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.profiles where role = 'SUPER_ADMIN' limit 1),
    'role', 'authenticated', 'user_role', 'SUPER_ADMIN', 'dealer_code', '')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function closetest.as_db() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;
grant usage on schema closetest to authenticated;
grant execute on all functions in schema closetest to authenticated;

do $$
declare
  v_paid int; v_id text; v_q text; v_st lead_status; v_bp lead_status; v_new int; v_req int; v_txt text;
begin
  -- ใบ won ของ CNX ที่ผูกลีด PAID (ข้อมูลตั้งต้น · ใบเดิมไม่มีใบ HQ — HQ ย้อนได้ตาม 0205)
  select q.id, l.num_id, l.id into v_q, v_paid, v_id
    from quotations q join leads l on l.dealer_code = q.dealer_code and l.num_id = q.deal_id
   where q.dealer_code = 'CNX' and q.status = 'won' and l.status = 'PAID' order by q.id limit 1;
  perform closetest.ok(v_q is not null, 'มีใบ won ของ CNX ที่ผูกลีด PAID ในข้อมูลตั้งต้น');

  -- ── ข้อ 3: ดีลเลอร์พาออกจาก PAID ไม่ได้ ──
  perform closetest.as_dealer();
  perform closetest.must_fail(format($s$select lead_apply(%L, '{"stage":{"status":"NEGO"}}'::jsonb)$s$, v_id), 'lead_won_locked',
    'ดีลเลอร์ใช้คำสั่งบันทึกลีด พาลีด PAID กลับเป็นเจรจาต่อรอง');
  perform closetest.must_fail(format($s$select lead_apply(%L, '{"stage":{"status":"CANCELLED","lostReason":"ทดสอบ"}}'::jsonb)$s$, v_id), 'lead_won_locked',
    'ดีลเลอร์พาลีด PAID เป็นปิดไม่สำเร็จ');
  perform closetest.must_fail(format('update leads set status = %L where dealer_code = %L and num_id = %s', 'QUOTED', 'CNX', v_paid), 'lead_won_locked',
    'ดีลเลอร์ยิงตรงเปลี่ยนสถานะลีด PAID');
  -- ข้อมูลอื่นของลีด PAID ยังแก้ได้ (โน้ต/รายงาน) — กันแค่สถานะ
  perform lead_apply(v_id, '{"fields":{"report":"บันทึกหลังปิดการขาย"}}'::jsonb);
  select status into v_st from leads where dealer_code = 'CNX' and num_id = v_paid;
  perform closetest.ok(v_st = 'PAID', 'ดีลเลอร์แก้รายงานของลีด PAID ได้ สถานะยังเป็น PAID');

  -- HQ ทำได้คนเดียว: ทางของ HQ คือ "ย้อนการตอบรับ" (ข้อ 4 ข้างล่าง) — HQ แก้ลีดของดีลเลอร์ตรง ๆ ไม่ได้อยู่แล้ว (สิทธิ์รายแถว)

  -- ── ข้อ 4: จดสถานะก่อนปิด + HQ ย้อนการตอบรับ → ลีดกลับ ──
  perform closetest.as_db();
  update leads set status = 'NEGO' where dealer_code = 'CNX' and num_id = v_paid;     -- งานในฐาน (ไม่ใช่ผู้ใช้) ตั้งฉากทดสอบ
  update leads set status = 'PAID' where dealer_code = 'CNX' and num_id = v_paid;
  select status_before_paid into v_bp from leads where dealer_code = 'CNX' and num_id = v_paid;
  perform closetest.ok(v_bp = 'NEGO', 'เข้า PAID แล้วฐานจดสถานะก่อนปิด = เจรจาต่อรอง');

  perform closetest.as_dealer();
  perform closetest.must_fail(format($s$select quotation_revert_won('CNX', %L, 'ทดสอบ')$s$, v_q), 'forbidden', 'ดีลเลอร์ย้อนการตอบรับเอง');

  perform closetest.as_hq();
  perform quotation_revert_won('CNX', v_q, 'ลูกค้าขอเลื่อนตัดสินใจ (ทดสอบ)');
  select status, status_before_paid into v_st, v_bp from leads where dealer_code = 'CNX' and num_id = v_paid;
  select x ->> 'text' into v_txt from leads, jsonb_array_elements(activities) x
   where dealer_code = 'CNX' and num_id = v_paid order by (x ->> 'id')::numeric desc limit 1;
  perform closetest.ok(v_st = 'NEGO', 'HQ ย้อนการตอบรับ → ลีดกลับเป็น "เจรจาต่อรอง" (สถานะก่อนปิด) — ได้ ' || v_st);
  perform closetest.ok(v_bp is null, 'ล้างช่องสถานะก่อนปิดหลังย้อน');
  perform closetest.ok(v_txt like '%ลูกค้าเป้าหมายกลับเป็น "เจรจาต่อรอง"%', 'ไทม์ไลน์บอกว่าลีดกลับเป็นอะไร');

  -- ไม่มีประวัติ (ปิดก่อนใบ 0217) → เสนอราคา · ย้อนเป็น "ไม่สำเร็จ" ก็ใช้กติกาเดียวกัน
  perform closetest.as_db();
  update quotations set status = 'won' where dealer_code = 'CNX' and id = v_q;
  update leads set status = 'PAID' where dealer_code = 'CNX' and num_id = v_paid;
  update leads set status_before_paid = null where dealer_code = 'CNX' and num_id = v_paid;
  perform closetest.as_hq();
  perform quotation_revert_won('CNX', v_q, 'ทดสอบไม่มีประวัติ', 'lost');
  select status into v_st from leads where dealer_code = 'CNX' and num_id = v_paid;
  perform closetest.ok(v_st = 'QUOTED', 'ไม่มีประวัติก่อนปิด → ลีดกลับเป็น "เสนอราคา" — ได้ ' || v_st);

  -- ── ข้อ 6: ลบลีด ──
  perform closetest.as_dealer();
  perform closetest.must_fail(format('delete from leads where dealer_code = %L and num_id = %s', 'CNX', v_paid), 'lead_has_quotes',
    'ดีลเลอร์ลบลีดที่มีใบเสนอราคา');
  perform closetest.as_db();
  select num_id into v_req from leads l where dealer_code = 'CNX' and status = 'BULLET'
     and not exists (select 1 from quotations q where q.dealer_code = l.dealer_code and q.deal_id = l.num_id) order by num_id limit 1;
  insert into quote_requests (request_no, dealer_code, lead_num_id, product, status, submitted_at, due_at)
  values ('ZZTEST-RQ-0217', 'CNX', v_req, 'โกดังสำเร็จรูป', 'new', now(), now() + interval '14 days');
  perform closetest.as_dealer();
  perform closetest.must_fail(format('delete from leads where dealer_code = %L and num_id = %s', 'CNX', v_req), 'เสียโอกาส',
    'ดีลเลอร์ลบลีดที่มีคำขอราคา (ข้อความบอกให้ใช้ "เสียโอกาส")');

  perform closetest.as_db();
  v_new := (select max(num_id) from leads where dealer_code = 'CNX') + 1;
  insert into leads (id, num_id, dealer_code, company, name, contact, phone, province, status)
  values ('#L-' || v_new, v_new, 'CNX', 'ZZTEST-ลีดเปล่า', 'ZZTEST-ลีดเปล่า', 'ผู้ทดสอบ', '000-000-0001', 'เชียงใหม่', 'WAITING');
  perform closetest.as_dealer();
  delete from leads where dealer_code = 'CNX' and num_id = v_new;
  perform closetest.as_db();
  perform closetest.ok(not exists (select 1 from leads where dealer_code = 'CNX' and num_id = v_new), 'ดีลเลอร์ลบลีดที่ยังไม่มีคำขอ/ใบได้');

  raise notice 'ALL PASS';
end $$;
rollback;
