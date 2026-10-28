-- ── ข้อทดสอบใบ 0232: สถานะลีดเปลี่ยนได้ทางเดียว · ปิดสำเร็จต้องมีใบที่ลูกค้าตอบรับ (รอบ 4 · บอสสั่ง 21 ต.ค. 69) ─────────
--   ดีลเลอร์: สร้างลีดได้แค่ ติดต่อแล้ว/รวบรวมความต้องการ · เปลี่ยนเองได้แค่ปิดไม่สำเร็จ · มีใบส่งลูกค้าอยู่ = ปิดที่ลีดไม่ได้
--   ทุกบทบาท: ลีดเป็นปิดสำเร็จได้เฉพาะเมื่อมีใบของดีลที่ตอบรับแล้ว · งานไม่เลื่อนขั้น (deriveStage ถูกเมิน)
-- รัน: docker exec -i supabase_db_pms-dbcheck psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 < supabase/tests/lead_one_path.sql
-- ทรานแซกชันเดียวแล้ว rollback · ผ่าน = "ALL PASS"
begin;
create schema onepath;
create function onepath.ok(p_cond boolean, p_what text) returns void language plpgsql as $$
begin if p_cond is not true then raise exception 'FAIL: %', p_what; end if; raise notice 'ok  %', p_what; end $$;
create function onepath.must_fail(p_sql text, p_like text, p_what text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if sqlerrm ilike '%' || p_like || '%' then raise notice 'ok  % (ถูกปฏิเสธ)', p_what; return; end if;
    raise exception 'FAIL: % — ถูกปฏิเสธแต่ข้อความไม่ตรง: %', p_what, sqlerrm;
  end;
  raise exception 'FAIL: % — ควรถูกปฏิเสธแต่ผ่าน', p_what;
end $$;
create function onepath.as_dealer() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.profiles where role = 'DEALER_ADMIN' and dealer_code = 'CNX' limit 1),
    'role', 'authenticated', 'user_role', 'DEALER_ADMIN', 'dealer_code', 'CNX')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function onepath.as_hq() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.profiles where role = 'SUPER_ADMIN' limit 1),
    'role', 'authenticated', 'user_role', 'SUPER_ADMIN', 'dealer_code', '')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function onepath.as_db() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;
grant usage on schema onepath to authenticated;
grant execute on all functions in schema onepath to authenticated;

do $$
declare
  n1 int := 989000001; n2 int := 989000002; n3 int := 989000003; n4 int := 989000004;
  v_st lead_status;
begin
  -- ── ข้อมูลตั้งต้น (ตัวดักปิดไว้ชั่วคราว — สร้างสภาพที่ต้องการตรง ๆ) ──
  set local session_replication_role = replica;
  insert into leads (id, num_id, dealer_code, company, name, contact, phone, province, product, status)
  values ('#L-' || n2, n2, 'CNX', 'ZZTEST-onepath-2', 'ZZTEST-onepath-2', 'ผู้ทดสอบ', '0890000002', 'เชียงใหม่', 'โกดัง', 'QUOTED'),
         ('#L-' || n3, n3, 'CNX', 'ZZTEST-onepath-3', 'ZZTEST-onepath-3', 'ผู้ทดสอบ', '0890000003', 'เชียงใหม่', 'โกดัง', 'QUOTED'),
         ('#L-' || n4, n4, 'CNX', 'ZZTEST-onepath-4', 'ZZTEST-onepath-4', 'ผู้ทดสอบ', '0890000004', 'เชียงใหม่', 'โกดัง', 'QUOTED');
  insert into quotations (dealer_code, id, customer, project, status, deal_id, total, total_value, date, customer_id)
  values ('CNX', 'ZZ-OP-2', 'ZZTEST-onepath-2', 'p', 'sent_to_client', n2, '฿1', 1, current_date, null),
         ('CNX', 'ZZ-OP-3', 'ZZTEST-onepath-3', 'p', 'won', n3, '฿1', 1, current_date,
          (select id from customers where dealer_code = 'CNX' order by id limit 1));
  set local session_replication_role = origin;

  -- ── ดีลเลอร์ ──
  perform onepath.as_dealer();
  perform onepath.must_fail(format($s$insert into leads (id, num_id, dealer_code, company, name, contact, phone, province, product, status)
    values ('#L-%s', %s, 'CNX', 'ZZTEST-onepath-1', 'ZZTEST-onepath-1', 'ผู้ทดสอบ', '0890000001', 'เชียงใหม่', 'โกดัง', 'QUOTED')$s$, n1, n1),
    'lead_new_status_locked', 'ดีลเลอร์สร้างลีดใหม่ที่ขั้นเสนอราคา (ใบ 0256: ลีดใหม่ = ขั้นข้อมูลลูกค้าเสมอ)');
  insert into leads (id, num_id, dealer_code, company, name, contact, phone, province, product, status)
  values ('#L-' || n1, n1, 'CNX', 'ZZTEST-onepath-1', 'ZZTEST-onepath-1', 'ผู้ทดสอบ', '0890000001', 'เชียงใหม่', 'โกดัง', 'WAITING');
  perform onepath.ok(true, 'ดีลเลอร์สร้างลีดใหม่ที่ขั้นติดต่อแล้วได้');

  perform onepath.must_fail(format($s$select lead_apply('#L-%s', '{"stage":{"status":"BULLET"}}'::jsonb)$s$, n1), 'lead_status_one_path',
    'ดีลเลอร์ใช้คำสั่งบันทึกลีดเลื่อนขั้นเอง (ติดต่อแล้ว → รวบรวมความต้องการ)');
  perform onepath.must_fail(format($s$select lead_apply('#L-%s', '{"stage":{"status":"NEGO"}}'::jsonb)$s$, n1), 'lead_status_one_path',
    'ดีลเลอร์ตั้งเจรจาต่อรอง (เลิกใช้แล้ว)');
  perform onepath.must_fail(format('update leads set status = %L where dealer_code = %L and num_id = %s', 'FOLLOWUP', 'CNX', n1), 'lead_status_one_path',
    'ดีลเลอร์ยิงตรงเปลี่ยนสถานะ');
  perform onepath.must_fail(format($s$select lead_apply('#L-%s', '{"stage":{"status":"PAID"}}'::jsonb)$s$, n1), 'lead_won_needs_accepted_quote',
    'ดีลเลอร์ปิดสำเร็จที่ลีดโดยไม่มีใบที่ตอบรับ');

  -- งานไม่เลื่อนขั้น (deriveStage ที่แอปรุ่นเก่าส่งมาถูกเมิน)
  perform lead_apply('#L-' || n1, '{"tasks":[{"key":"contact","done":true},{"key":"collect","done":true},{"key":"requirement","done":true}],"deriveStage":"any"}'::jsonb);
  select status into v_st from leads where dealer_code = 'CNX' and num_id = n1;
  perform onepath.ok(v_st = 'WAITING', 'ติ๊กงานแล้วสถานะไม่ขยับ (ยังติดต่อแล้ว)');

  -- ปิดไม่สำเร็จที่กล่องขั้นต่อไป = ทางเดียวที่ดีลเลอร์เปลี่ยนเองได้
  perform lead_apply('#L-' || n1, '{"stage":{"status":"CANCELLED","lostReason":"ลูกค้าเลื่อนโครงการ"}}'::jsonb);
  select status into v_st from leads where dealer_code = 'CNX' and num_id = n1;
  perform onepath.ok(v_st = 'CANCELLED', 'ดีลเลอร์ปิดไม่สำเร็จได้ (ไม่มีใบที่ส่งลูกค้า)');
  perform onepath.must_fail(format($s$select lead_apply('#L-%s', '{"stage":{"status":"BULLET"}}'::jsonb)$s$, n1), 'lead_status_one_path',
    'ไม่มี "เปิดใหม่" — ดีลเลอร์พาลีดที่ปิดไม่สำเร็จกลับไม่ได้');

  -- มีใบส่งลูกค้าอยู่ → ปิดที่ลีดไม่ได้ ต้องกดลูกค้าปฏิเสธที่ใบ
  perform onepath.must_fail(format($s$select lead_apply('#L-%s', '{"stage":{"status":"CANCELLED","lostReason":"ทดสอบ"}}'::jsonb)$s$, n2), 'lead_has_sent_quote',
    'ดีลเลอร์ปิดไม่สำเร็จที่ลีดตอนมีใบส่งลูกค้าอยู่');

  -- ── คำสั่งของระบบ (pms.flow_sync · ลูกค้าตอบรับ/HQ ย้อน) ก็ปิดสำเร็จไม่ได้ถ้าไม่มีใบที่ตอบรับ ──
  --   (HQ ไม่มีสิทธิ์แก้แถวลีดตรง · ทางเดียวที่ลีดเป็นปิดสำเร็จคือคำสั่งของระบบหลังใบเป็น won)
  perform onepath.as_db();
  perform onepath.must_fail(format('select _lead_flow_set_status(%L, %s, %L)', 'CNX', n4, 'PAID'), 'lead_won_needs_accepted_quote',
    'คำสั่งของระบบตั้งปิดสำเร็จโดยไม่มีใบที่ตอบรับ');
  perform _lead_flow_set_status('CNX', n3, 'PAID');
  select status into v_st from leads where dealer_code = 'CNX' and num_id = n3;
  perform onepath.ok(v_st = 'PAID', 'มีใบที่ตอบรับแล้ว → ระบบปิดสำเร็จได้');

  -- ── งานในฐาน/กู้ข้อมูล (ไม่ใช่ผู้ใช้) ไม่ตรวจ ──
  perform onepath.as_db();
  update leads set status = 'PAID' where dealer_code = 'CNX' and num_id = n4;
  select status into v_st from leads where dealer_code = 'CNX' and num_id = n4;
  perform onepath.ok(v_st = 'PAID', 'งานในฐานข้อมูลไม่ถูกตัวดักนี้');

  raise notice 'ALL PASS';
end $$;
rollback;
