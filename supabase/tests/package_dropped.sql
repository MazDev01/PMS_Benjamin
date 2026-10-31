-- ── ข้อทดสอบใบ 0267: ใบค่าแฟรนไชส์บันทึกได้โดยไม่มีแพ็กเกจ (บอสสั่ง 30 ต.ค. 69) ──
-- รัน: docker exec -i <คอนเทนเนอร์ฐานทดสอบ> psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 < supabase/tests/package_optional.sql
-- ทรานแซกชันเดียวแล้ว rollback · ผ่าน = "ALL PASS" · ตกบนโค้ดก่อนใบ 0267: package not null
begin;
set local session_replication_role = replica;
insert into dealer_prospects (id, name, status) values (991301, 'ZZTEST ผู้สนใจไม่มีแพ็กเกจ', 'new');
set local session_replication_role = origin;
do $$
declare ok boolean := true; msg text := '';
begin
  begin
    insert into dealer_package_proposals (id, prospect_id, proposal_no, amount, status) values (991311, 991301, 'FP-ZZPKG-1', 150000, 'draft');
  exception when others then ok := false; msg := sqlerrm; end;
  if not ok then raise exception 'FAIL: ใบไม่มีแพ็กเกจบันทึกไม่ได้ — %', msg; end if;
  if (select package from dealer_package_proposals where id = 991311) is not null then raise exception 'FAIL: แพ็กเกจต้องว่าง (ไม่เติมให้เอง)'; end if;
  raise notice 'ALL PASS';
end $$;
rollback;
