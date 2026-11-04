-- ── ข้อทดสอบใบ 0269: ลบช่องแพ็กเกจออกจากฐานถาวร (รอบที่ 2 · บอสสั่ง 30 ต.ค. 69 + 1 พ.ย. 69) ──
--   ไม่มีช่อง package ใน dealers · dealer_package_proposals · มุมมอง dealers_directory · ไม่มีฟังก์ชัน/มุมมอง/ข้อบังคับอ้างช่องนี้
--   ใบค่าแฟรนไชส์ยังบันทึก/ทำฉบับใหม่ได้ · ตัวบันทึกดีลเลอร์ (save_dealers) ยังทำงาน · ตารางอื่นไม่ถูกแตะ (ช่องเดิมของ 2 ตารางยังอยู่ครบ)
-- รัน: docker exec -i <คอนเทนเนอร์ฐานทดสอบ> psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 < supabase/tests/package_dropped.sql
-- ทรานแซกชันเดียวแล้ว rollback · ผ่าน = "ALL PASS" · ตกบนโค้ดก่อนใบ 0269: มีช่อง package
begin;
do $$
declare n int; ok boolean := true; msg text := ''; p dealer_package_proposals; v2 bigint;
begin
  select count(*) into n from information_schema.columns where table_schema = 'public' and column_name = 'package';
  if n <> 0 then raise exception 'FAIL: ยังมีช่อง package % ช่อง', n; end if;
  select count(*) into n from pg_proc pr join pg_namespace ns on ns.oid = pr.pronamespace where ns.nspname = 'public' and pr.prosrc ~* '\mpackage\M';
  if n <> 0 then raise exception 'FAIL: ยังมีฟังก์ชันอ้างช่อง package % ตัว', n; end if;
  select count(*) into n from pg_class c join pg_namespace ns on ns.oid = c.relnamespace where ns.nspname = 'public' and c.relkind in ('v', 'm') and pg_get_viewdef(c.oid) ~* '\mpackage\M';
  if n <> 0 then raise exception 'FAIL: ยังมีมุมมองอ้างช่อง package % ตัว', n; end if;
  select count(*) into n from pg_constraint where pg_get_constraintdef(oid) ~* '\mpackage\M';
  if n <> 0 then raise exception 'FAIL: ยังมีข้อบังคับอ้างช่อง package % ตัว', n; end if;
  -- ช่องอื่นของ 2 ตารางยังอยู่ (ลบเฉพาะช่องแพ็กเกจ)
  select count(*) into n from information_schema.columns where table_schema = 'public'
     and ((table_name = 'dealers' and column_name in ('code', 'name', 'province', 'region', 'revenue_target', 'status', 'target_manual', 'prospect_id'))
       or (table_name = 'dealer_package_proposals' and column_name in ('id', 'prospect_id', 'proposal_no', 'amount', 'contract_months', 'annual_target', 'status', 'version', 'supersedes_id')));
  if n <> 17 then raise exception 'FAIL: ช่องอื่นของตารางหายไป (เจอ % จาก 17)', n; end if;
  select count(*) into n from information_schema.columns where table_schema = 'public' and table_name = 'dealers_directory' and column_name in ('code', 'name', 'revenue_target', 'target_manual');
  if n <> 4 then raise exception 'FAIL: มุมมอง dealers_directory ช่องเดิมหาย (เจอ % จาก 4)', n; end if;
  raise notice 'ok  ไม่มีช่อง/ฟังก์ชัน/มุมมอง/ข้อบังคับอ้าง package · ช่องอื่นอยู่ครบ';
end $$;

-- ใบค่าแฟรนไชส์ยังบันทึก + ทำฉบับใหม่ได้ · ดีลเลอร์ยังบันทึกผ่าน save_dealers ได้ (ฟังก์ชันที่แก้ในใบนี้ทำงาน)
set local session_replication_role = replica;
insert into dealer_prospects (id, name, status, phone) values (991301, 'ZZTEST ผู้สนใจหลังลบแพ็กเกจ', 'new', '000-000-7708');
insert into dealers (code, name, province, region, revenue_target, status) values ('ZZPKD', 'ZZTEST ดีลเลอร์หลังลบแพ็กเกจ', 'ตราด', 'ตะวันออก', 1000000, 'active');
set local session_replication_role = origin;
do $$
declare p dealer_package_proposals; hq uuid := (select id from profiles where role = 'SUPER_ADMIN' and status = 'active' limit 1); ใหม่ bigint;
begin
  insert into dealer_package_proposals (id, prospect_id, proposal_no, amount, status, contract_months, annual_target, region, province, valid_until, terms) values (991311, 991301, 'FP-ZZPKD-1', 150000, 'draft', 12, 1000000, 'ตะวันออก', 'ตราด', (current_date) + 30, '-') returning * into p;
  update dealer_package_proposals set status = 'sent', proposed_date = current_date, valid_until = current_date + 30 where id = p.id;
  perform set_config('request.jwt.claims', json_build_object('sub', hq, 'role', 'authenticated', 'user_role', 'SUPER_ADMIN', 'dealer_code', '', 'email', 'hq@test')::text, true);
  perform set_config('role', 'authenticated', true);
  ใหม่ := (dealer_proposal_new_version(p.id)).id;
  if ใหม่ is null then raise exception 'FAIL: ทำฉบับใหม่ไม่ได้'; end if;
  perform save_dealers(jsonb_build_array(jsonb_build_object('code', 'ZZPKD', 'name', 'ZZTEST ชื่อใหม่', 'province', 'ตราด', 'region', 'ตะวันออก', 'revenue_target', 2000000, 'status', 'active')));
  if (select name from dealers where code = 'ZZPKD') <> 'ZZTEST ชื่อใหม่' then raise exception 'FAIL: save_dealers บันทึกไม่ได้'; end if;
  raise notice 'ok  ใบค่าแฟรนไชส์บันทึก/ทำฉบับใหม่ได้ · save_dealers ทำงาน';
  raise notice 'ALL PASS';
end $$;
rollback;
