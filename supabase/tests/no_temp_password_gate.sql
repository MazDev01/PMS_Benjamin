-- ── ข้อทดสอบใบ 0216: ไม่มีด่าน "ยังไม่ตั้งรหัส แตะข้อมูลไม่ได้" ที่ชั้นฐานข้อมูลแล้ว ───────────────────
-- รัน: docker exec -i supabase_db_pms-dbcheck psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 < supabase/tests/no_temp_password_gate.sql
-- อยู่ในทรานแซกชันเดียวแล้ว rollback — ไม่ทิ้งข้อมูล · รอบปิดด่านรันผ่าน tests/scenario/db-rule-tests.spec.ts
begin;
-- ผ่าน = บรรทัดสุดท้ายขึ้น "ALL PASS" · พิสูจน์ว่าจับได้จริง: รันโดยไม่มีใบ 0216 ต้องตก
-- แทน supabase/tests/temp_password_gate.sql (ข้อตรวจ RLS ทุกตารางยกมาไว้ที่นี่)

do $$
declare
  v_missing text;
  v_uid uuid := (select id from profiles where role = 'DEALER_ADMIN' and dealer_code = 'CNX' limit 1);
  claims_ok   jsonb := jsonb_build_object('sub', v_uid, 'role', 'authenticated', 'user_role', 'DEALER_ADMIN', 'dealer_code', 'CNX');
  -- บัญชีที่ยังมีเครื่องหมายค้าง ทั้งช่องบนสุดของใบผ่าน (0187) และใน app_metadata
  claims_flag jsonb := claims_ok || jsonb_build_object('must_change_password', true,
                                                        'app_metadata', jsonb_build_object('must_change_password', true, 'must_verify_email', true));
  n_ok int; n_flag int; p_ok int; p_flag int; t_flag numeric; hq_ok boolean;
begin
  -- ── โครงสร้าง: ด่านหายครบ ──
  select string_agg(tablename, ', ') into v_missing from pg_policies where schemaname = 'public' and policyname = 'must_set_password_block';
  if v_missing is not null then raise exception 'FAIL: ยังมีกฎจำกัดของด่านตั้งรหัสที่ตาราง: %', v_missing; end if;
  raise notice 'ok  ไม่มีกฎจำกัด must_set_password_block เหลือ';

  if exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'must_set_password') then
    raise exception 'FAIL: ยังมีคำสั่ง must_set_password()';
  end if;
  raise notice 'ok  ไม่มีคำสั่ง must_set_password()';

  select string_agg(c.relname, ', ') into v_missing from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'v' and pg_get_viewdef(c.oid) ilike '%must_set_password%';
  if v_missing is not null then raise exception 'FAIL: มุมมองที่ยังอ้างด่านตั้งรหัส: %', v_missing; end if;
  raise notice 'ok  มุมมองไม่อ้างด่านตั้งรหัสแล้ว';

  select string_agg(p.proname, ', ') into v_missing from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prosrc ilike '%must_change_password%' and p.proname <> 'custom_access_token_hook';
  if v_missing is not null then raise exception 'FAIL: คำสั่งที่ยังอ่านเครื่องหมาย must_change_password: %', v_missing; end if;
  raise notice 'ok  ไม่มีคำสั่งไหนอ่านเครื่องหมาย (ยกเว้นตัวออกใบผ่าน ที่ใส่ช่องไว้เฉย ๆ)';

  -- ── ยังต้องคงไว้: ทุกตารางเปิดกฎรายแถว (ยกมาจาก temp_password_gate.sql) ──
  select string_agg(c.relname, ', ') into v_missing from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and not c.relrowsecurity;
  if v_missing is not null then raise exception 'FAIL: ตารางที่ไม่ได้เปิดกฎสิทธิ์รายแถว: %', v_missing; end if;
  raise notice 'ok  ทุกตารางใน public ยังเปิดกฎสิทธิ์รายแถว';

  -- ── พฤติกรรม: บัญชีมีเครื่องหมายค้าง เห็นข้อมูลเท่าบัญชีปกติ ──
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', claims_ok::text, true);
  select count(*) into n_ok from leads;
  select count(*) into p_ok from profiles;
  if n_ok = 0 then raise exception 'FAIL: ข้อมูลตั้งต้นของ CNX ว่าง — ทดสอบต่อไม่ได้'; end if;

  perform set_config('request.jwt.claims', claims_flag::text, true);
  if auth_dealer() <> 'CNX' or auth_role() <> 'DEALER_ADMIN' then
    raise exception 'FAIL: บัญชีมีเครื่องหมายค้างยังถูกมองว่าไม่มีสาขา/บทบาท (auth_dealer=%, auth_role=%)', auth_dealer(), auth_role();
  end if;
  select count(*) into n_flag from leads;
  select count(*) into p_flag from profiles;
  if n_flag <> n_ok or p_flag <> p_ok then
    raise exception 'FAIL: บัญชีมีเครื่องหมายค้างเห็นข้อมูลไม่เท่าบัญชีปกติ (ลีด %/% · โปรไฟล์ %/%)', n_flag, n_ok, p_flag, p_ok;
  end if;
  raise notice 'ok  บัญชีมีเครื่องหมายค้าง เห็นลีด % แถว / โปรไฟล์ % แถว เท่าบัญชีปกติ', n_flag, p_flag;

  select revenue_target into t_flag from dealers_directory where code = 'CNX';
  if not found then raise exception 'FAIL: บัญชีมีเครื่องหมายค้างไม่เห็นแถวสาขาตัวเองใน dealers_directory'; end if;
  raise notice 'ok  เห็นแถวสาขาตัวเองในทะเบียน (เป้า %)', coalesce(t_flag::text, 'ว่าง');

  -- เขียนได้ด้วย (ด่านเดิมปิดทั้งอ่านและเขียน) — ทรานแซกชันนี้ rollback ทิ้ง
  update leads set report = report where dealer_code = 'CNX' and num_id = (select min(num_id) from leads where dealer_code = 'CNX');
  if not found then raise exception 'FAIL: บัญชีมีเครื่องหมายค้างเขียนลีดของสาขาตัวเองไม่ได้'; end if;
  raise notice 'ok  บัญชีมีเครื่องหมายค้างเขียนลีดของสาขาตัวเองได้';

  -- ── สิทธิ์อื่นไม่หลวมตาม: ดีลเลอร์ยังไม่ใช่ HQ · คนไม่เข้าระบบยังไม่เห็นอะไร ──
  select is_hq() into hq_ok;
  if hq_ok then raise exception 'FAIL: บัญชีดีลเลอร์ถูกมองเป็น HQ'; end if;
  begin
    perform hq_quote_board('todo', '');
    raise exception 'FAIL: ดีลเลอร์เรียกกล่องงาน HQ ได้';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
  raise notice 'ok  ดีลเลอร์ยังเรียกกล่องงาน HQ ไม่ได้';

  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true);
  begin
    select count(*) into n_flag from leads;
  exception when insufficient_privilege then n_flag := 0;
  end;
  if n_flag <> 0 then raise exception 'FAIL: คนไม่เข้าระบบเห็นลีด % แถว', n_flag; end if;
  raise notice 'ok  คนไม่เข้าระบบยังไม่เห็นลีด';

  perform set_config('role', 'postgres', true);
  raise notice 'ALL PASS';
end $$;
rollback;
