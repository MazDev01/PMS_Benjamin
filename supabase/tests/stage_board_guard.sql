-- ── ข้อทดสอบใบ 0278: ขั้นผู้สนใจ — คนเลื่อนได้ทีละ 1 ขั้นไปข้างหน้า ห้ามข้าม ห้ามถอย · ระบบถอยตามใบได้ (บอสสั่ง 5 พ.ย. 69 · บอร์ดลากได้) ─────
--   1) ชื่อขั้น considering = "รอผู้สนใจตอบรับ" (prospect_status_th · _prospect_status_th) · ข้อความกันขั้นใช้ชื่อใหม่
--   2) คนถอยขั้นไม่ได้ (ทุกระยะ) · คนข้ามขั้นไม่ได้ · เดินหน้าทีละขั้นได้
--   3) ระบบเลื่อน/ถอยตามใบ: ส่งใบ = นัดคุยแล้ว → รอผู้สนใจตอบรับ · ใบถูกปฏิเสธ = ถอยกลับนัดคุยแล้ว (ตัวดักใบ · ชั้นตัวดัก 2)
--   4) คงเดิม: ไม่สำเร็จได้จากทุกขั้น · เปิดติดตามใหม่จากไม่สำเร็จได้ (เป็นดีลเลอร์แล้วเปลี่ยนไม่ได้ = hq-prospect-workflow.spec)
--   ข้อมูลปลอมทั้งหมด (000-000-NNNN) · ทรานแซกชันเดียวแล้ว rollback · ผ่าน = "ALL PASS"
--   ตกบนโค้ดก่อนใบ 0278: ชื่อขั้นยังเป็น "รอตัดสินใจ HQ" · คนถอยขั้นได้ทีละขั้น (abs = 1)
-- รัน: docker exec -i <คอนเทนเนอร์ฐานทดสอบ> psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 < supabase/tests/stage_board_guard.sql
begin;
create schema sbgtest;
create function sbgtest.ok(p_cond boolean, p_what text) returns void language plpgsql as $$
begin if p_cond is not true then raise exception 'FAIL: %', p_what; end if; raise notice 'ok  %', p_what; end $$;
create function sbgtest.must_fail(p_sql text, p_like text, p_what text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if sqlerrm ilike '%' || p_like || '%' then raise notice 'ok  % (ถูกปฏิเสธ: %)', p_what, sqlerrm; return; end if;
    raise exception 'FAIL: % — ถูกปฏิเสธแต่ข้อความไม่ตรง: %', p_what, sqlerrm;
  end;
  raise exception 'FAIL: % — ควรถูกปฏิเสธแต่ผ่าน', p_what;
end $$;
create function sbgtest.as_hq(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated',
    'user_role', 'SUPER_ADMIN', 'dealer_code', '', 'email', 'zzsbg@example.test')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
grant usage on schema sbgtest to authenticated;
grant execute on all functions in schema sbgtest to authenticated;

do $$
declare
  hq uuid := (select id from profiles where role = 'SUPER_ADMIN' limit 1);
  pid bigint; ใบ bigint;
  ขั้น text;
begin
  -- 1) ชื่อขั้นใหม่
  perform sbgtest.ok(prospect_status_th('considering') = 'รอผู้สนใจตอบรับ' and _prospect_status_th('considering') = 'รอผู้สนใจตอบรับ',
                     '1) ชื่อขั้น considering = รอผู้สนใจตอบรับ (ทั้งสองตัวสร้างข้อความ)');
  perform sbgtest.ok(hq is not null, 'มีบัญชี HQ ตั้งต้น');
  perform sbgtest.as_hq(hq);
  insert into dealer_prospects (name, province, status, phone) values ('ZZTEST-ขั้นบอร์ด', 'ตราด', 'new', '000-000-7801') returning id into pid;

  -- 2) เดินหน้าทีละขั้น · ข้ามไม่ได้ · ถอยไม่ได้
  perform sbgtest.must_fail(format('update dealer_prospects set status = %L where id = %s', 'profile_sent', pid), 'ห้ามข้ามขั้น', '2) รอติดต่อ → ส่งข้อมูลบริษัทแล้ว ข้ามขั้นไม่ได้');
  update dealer_prospects set status = 'contacted' where id = pid;
  perform sbgtest.must_fail(format('update dealer_prospects set status = %L where id = %s', 'new', pid), 'ย้อนขั้นไม่ได้', '2) ติดต่อแล้ว → รอติดต่อ คนถอยไม่ได้');
  update dealer_prospects set status = 'profile_sent' where id = pid;
  update dealer_prospects set status = 'meeting' where id = pid;
  perform sbgtest.must_fail(format('update dealer_prospects set status = %L where id = %s', 'profile_sent', pid), 'ย้อนขั้นไม่ได้', '2) นัดคุยแล้ว → ส่งข้อมูลบริษัทแล้ว คนถอยไม่ได้');
  perform sbgtest.must_fail(format('update dealer_prospects set status = %L where id = %s', 'contacted', pid), 'ย้อนขั้นไม่ได้', '2) ถอยหลายขั้นก็ไม่ได้');
  perform sbgtest.must_fail(format('update dealer_prospects set status = %L where id = %s', 'considering', pid), 'รอผู้สนใจตอบรับ', '1) ข้อความกันขั้นใช้ชื่อใหม่ (ยังไม่ส่งใบ)');

  -- 3) ระบบเลื่อน/ถอยตามใบ
  insert into dealer_package_proposals (prospect_id, amount, terms, valid_until, contract_months, annual_target, region, province)
  values (pid, 100000, 'ZZTEST', current_date + 30, 12, 1000000, 'ตะวันออก', 'ตราด') returning id into ใบ;
  update dealer_package_proposals set status = 'sent' where id = ใบ;
  select status into ขั้น from dealer_prospects where id = pid;
  perform sbgtest.ok(ขั้น = 'considering', '3) ส่งใบแล้ว ระบบเลื่อนเป็นรอผู้สนใจตอบรับ — ได้ ' || ขั้น);
  perform sbgtest.must_fail(format('update dealer_prospects set status = %L where id = %s', 'meeting', pid), 'ย้อนขั้นไม่ได้', '2) รอผู้สนใจตอบรับ → นัดคุยแล้ว คนถอยเองไม่ได้');
  update dealer_package_proposals set status = 'rejected', close_reason = 'ZZTEST ขอเลื่อน' where id = ใบ;
  select status into ขั้น from dealer_prospects where id = pid;
  perform sbgtest.ok(ขั้น = 'meeting', '3) ใบถูกปฏิเสธ ระบบถอยกลับนัดคุยแล้วได้ (ตัวดักใบ) — ได้ ' || ขั้น);

  -- 4) ไม่สำเร็จได้ทุกขั้น · เปิดติดตามใหม่ได้
  update dealer_prospects set status = 'lost', lost_reason = 'ZZTEST ไม่พร้อม' where id = pid;
  update dealer_prospects set status = 'meeting', lost_reason = null where id = pid;
  perform sbgtest.ok((select status from dealer_prospects where id = pid) = 'meeting', '4) ไม่สำเร็จ → เปิดติดตามใหม่ขั้นเดิมได้');
  update dealer_prospects set status = 'lost', lost_reason = 'ZZTEST ไม่พร้อม' where id = pid;
  update dealer_prospects set status = 'contacted', lost_reason = null where id = pid;
  perform sbgtest.ok((select status from dealer_prospects where id = pid) = 'contacted', '4) เปิดติดตามใหม่ไปขั้นก่อนหน้าได้ (กติกาเปิดใหม่เดิม)');
end $$;

select 'ALL PASS' as result;
rollback;
