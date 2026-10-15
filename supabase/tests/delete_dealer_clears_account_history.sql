-- ── ลบสาขาแล้ว ประวัติ/คำขอเปลี่ยนบัญชีของรหัสนั้นต้องหายตามในคำสั่งเดียว (ใบ 0189 · ก่อนขึ้นระบบจริง ข้อ 8) ─────────
--   สองตารางนี้ผูกสาขาด้วยรหัสเฉย ๆ (ไม่มีกุญแจนอก) และรหัสสาขานำกลับมาใช้ใหม่ได้
--   ไม่ล้าง = สาขาใหม่รับโควตาแก้บัญชี/คำขอค้างของสาขาเก่า (พบจริง 31 ส.ค. 69: รหัส ZQJ เห็น "ใช้ไปแล้ว 1/2" ตั้งแต่วันแรก)
--   ข้อทดสอบนี้ล็อกว่า delete_dealer_atomic ล้างเอง — เส้นทางลบดีลเลอร์จึงเลิกล้างซ้ำในโค้ดได้
-- รัน: docker exec -i <คอนเทนเนอร์ฐานทดสอบ> psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/delete_dealer_clears_account_history.sql
begin;
create schema flowtest;
create function flowtest.ok(p_cond boolean, p_what text) returns void language plpgsql as $$
begin if p_cond is not true then raise exception 'FAIL: %', p_what; end if; raise notice 'ok  %', p_what; end $$;

insert into dealers (code, name, province, region, revenue_target, status) values ('ZZDH', 'ZZTEST ลบแล้วล้างประวัติ', 'ตราด', 'ตะวันออก', 0, 'active');
insert into dealer_account_changes (dealer_code, kind, old_email, new_email, by_self) values ('ZZDH', 'email', 'a@example.test', 'b@example.test', true);
insert into dealer_account_requests (dealer_code, kind, new_email, status) values ('ZZDH', 'email', 'c@example.test', 'pending');
-- รหัสอื่นต้องไม่ถูกแตะ
insert into dealer_account_changes (dealer_code, kind, by_self) values ('RYG', 'password', true);

do $$
begin
  perform delete_dealer_atomic('ZZDH');
  perform flowtest.ok(not exists (select 1 from dealers where code = 'ZZDH'), 'ลบสาขาแล้ว');
  perform flowtest.ok((select count(*) from dealer_account_changes where dealer_code = 'ZZDH') = 0, 'ประวัติเปลี่ยนบัญชีของรหัสนี้หายตาม');
  perform flowtest.ok((select count(*) from dealer_account_requests where dealer_code = 'ZZDH') = 0, 'คำขอเปลี่ยนบัญชีของรหัสนี้หายตาม');
  perform flowtest.ok((select count(*) from dealer_account_changes where dealer_code = 'RYG' and kind = 'password' and by_self) >= 1, 'ของรหัสอื่นไม่ถูกแตะ');
end $$;

\echo 'ALL PASS'
rollback;
