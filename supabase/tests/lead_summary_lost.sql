-- ── ข้อทดสอบใบ 0234: สรุปลีดรายดีลเลอร์มีปิดสำเร็จ/ปิดไม่สำเร็จ ตรงกับนับจากตารางลีดจริง (อัตราปิดการขายสูตรกลาง) ─────────
-- รัน: docker exec -i supabase_db_pms-dbcheck psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 < supabase/tests/lead_summary_lost.sql
-- ทรานแซกชันเดียวแล้ว rollback · ผ่าน = "ALL PASS"
begin;
-- ทั้งรายการเห็นข้อมูลชุดเดียว (บอสสั่ง 29 ต.ค. 69 · คิวข้อ 3): เดิมนับจากตารางลีดกับเรียกตัวสรุปคนละคำสั่ง
--   ข้ออื่นที่รันพร้อมกัน commit ลีด CNX ที่ปิดแล้วแทรกระหว่างสองคำสั่ง = ตัวเลขคลาดกัน ทั้งที่ตัวสรุปถูก
--   repeatable read = ทุกคำสั่งในรายการเห็นภาพเดียวกัน (ไม่ล็อก ไม่รอใคร) · ตรวจเทียบเป๊ะเหมือนเดิม
set transaction isolation level repeatable read;
do $$
declare
  d jsonb; v_won int; v_lost int; s_won int; s_lost int;
begin
  -- เพิ่มลีดปิดไม่สำเร็จ 1 ราย (ข้อมูลทดสอบ · ปิดตัวดักชั่วคราว) แล้วดูว่าสรุปนับเพิ่มตาม
  set local session_replication_role = replica;
  insert into leads (id, num_id, dealer_code, company, name, contact, phone, province, product, status, created_date)
  values ('#L-989100001', 989100001, 'CNX', 'ZZTEST-sumlost', 'ZZTEST-sumlost', 'ผู้ทดสอบ', '0891000001', 'เชียงใหม่', 'โกดัง', 'CANCELLED', current_date);
  set local session_replication_role = origin;

  select count(*) filter (where status = 'PAID'), count(*) filter (where status = 'CANCELLED') into v_won, v_lost
    from leads where coalesce(dealer_code, 'CNX') = 'CNX';
  d := lead_summary(array['CNX']);
  select (x ->> 'won')::int, (x ->> 'lost')::int into s_won, s_lost
    from jsonb_array_elements(d -> 'byDealer') x where x ->> 'dealer_code' = 'CNX';
  if s_lost is null then raise exception 'FAIL: byDealer ไม่มีช่อง lost'; end if;
  if s_won <> v_won or s_lost <> v_lost then
    raise exception 'FAIL: สรุปไม่ตรงตาราง won % vs % · lost % vs %', s_won, v_won, s_lost, v_lost;
  end if;
  raise notice 'ok  byDealer CNX won=% lost=% ตรงกับตารางลีด', s_won, s_lost;
  raise notice 'ALL PASS';
end $$;
rollback;
