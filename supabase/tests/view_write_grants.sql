-- ── ทดสอบใบ 0199: ดีลเลอร์เขียนผ่านมุมมองไม่ได้ อ่านได้ตามเดิม ─────────────────────────────────────────────
-- ช่องโหว่ที่ปิด (พบ 14 ต.ค. 69 ตอนเริ่มด่าน 2): มุมมองแบบง่ายเขียนผ่านได้ และทำงานด้วยสิทธิ์เจ้าของ
--   ดีลเลอร์จึงแก้ชื่อ/สถานะของดีลเลอร์รายอื่น (dealers_directory) และแก้/ลบแม่แบบสินค้า (master_catalog_public) ได้
--   โดยข้ามกฎรายแถวของตารางจริง
-- รัน: docker exec -i <คอนเทนเนอร์ฐานทดสอบ> psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/view_write_grants.sql
begin;
create schema flowtest;
create function flowtest.ok(p_cond boolean, p_what text) returns void language plpgsql as $$
begin if p_cond is not true then raise exception 'FAIL: %', p_what; end if; raise notice 'ok  %', p_what; end $$;
/** คำสั่งนี้ต้องถูกปฏิเสธเพราะไม่มีสิทธิ์ (ไม่ใช่ผ่านแบบ 0 แถว) */
create function flowtest.denied(p_sql text, p_what text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when insufficient_privilege then raise notice 'ok  % (ถูกปฏิเสธ)', p_what; return;
  end;
  raise exception 'FAIL: % — ควรถูกปฏิเสธแต่ผ่าน', p_what;
end $$;
grant usage on schema flowtest to authenticated;
grant execute on all functions in schema flowtest to authenticated;

do $$
declare
  ryg uuid := (select id from profiles where role = 'DEALER_ADMIN' and dealer_code = 'RYG' limit 1);
  cat text := (select id::text from master_catalog order by id limit 1);
  n int;
begin
  perform flowtest.ok(ryg is not null and cat is not null, 'มีบัญชีดีลเลอร์ RYG และแม่แบบสินค้าในฐานทดสอบ');
  perform set_config('request.jwt.claims', json_build_object('sub', ryg, 'role', 'authenticated',
    'user_role', 'DEALER_ADMIN', 'dealer_code', 'RYG', 'email', 'ryg@test')::text, true);
  perform set_config('role', 'authenticated', true);

  -- อ่านได้ตามเดิม
  select count(*) into n from dealers_directory;
  perform flowtest.ok(n > 1, 'ดีลเลอร์ยังอ่านรายชื่อดีลเลอร์ได้ (' || n || ' แถว)');
  select count(*) into n from master_catalog_public;
  perform flowtest.ok(n > 0, 'ดีลเลอร์ยังอ่านแม่แบบสินค้าได้ (' || n || ' แถว)');

  -- เขียนผ่านมุมมองไม่ได้ทุกแบบ
  perform flowtest.denied($q$update dealers_directory set status = 'inactive' where code = 'CNX'$q$, 'รายชื่อดีลเลอร์: แก้แถวของดีลเลอร์อื่น');
  perform flowtest.denied($q$update dealers_directory set name = name where code = 'RYG'$q$, 'รายชื่อดีลเลอร์: แก้แถวของตัวเอง');
  perform flowtest.denied($q$delete from dealers_directory where code = 'CNX'$q$, 'รายชื่อดีลเลอร์: ลบ');
  perform flowtest.denied($q$insert into dealers_directory (code, name, province, region, status) values ('ZZV', 'ZZTEST', 'ระยอง', 'ตะวันออก', 'active')$q$, 'รายชื่อดีลเลอร์: เพิ่ม');
  perform flowtest.denied(format($q$update master_catalog_public set name = name || '-x' where id::text = %L$q$, cat), 'แม่แบบสินค้า: แก้');
  perform flowtest.denied(format($q$delete from master_catalog_public where id::text = %L$q$, cat), 'แม่แบบสินค้า: ลบ');
  perform flowtest.denied($q$insert into master_catalog_public (name) values ('ZZTEST-แม่แบบ')$q$, 'แม่แบบสินค้า: เพิ่ม');
  raise notice 'ALL PASS';
end $$;
rollback;
