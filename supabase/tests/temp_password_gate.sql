-- ── ทดสอบด่าน "ยังไม่ตั้งรหัสของตัวเอง แตะข้อมูลไม่ได้" (ใบ 0187) ที่ระดับฐานข้อมูล ───────────────
-- รัน: docker exec -i supabase_db_Benjamin-HQ-main psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/temp_password_gate.sql
-- อยู่ในทรานแซกชันเดียวแล้ว rollback — ไม่ทิ้งข้อมูล · ผ่าน = บรรทัดสุดท้ายขึ้น "ALL PASS"
-- (ชุดยิงด้วยใบผ่านจริงทั้ง REST และ /api/v1 อยู่ที่ tests/scenario/temp-password-data-access.spec.ts)
begin;

do $$
declare
  v_missing text;
  v_uid uuid := (select id from profiles where role = 'DEALER_ADMIN' and dealer_code = 'CNX' limit 1);
  n int; n_ok int;
  claims_ok  jsonb := jsonb_build_object('sub', v_uid, 'role', 'authenticated', 'user_role', 'DEALER_ADMIN', 'dealer_code', 'CNX');
begin
  -- ── ทุกตารางใน public ต้องมีกฎจำกัดของด่านนี้ — ตารางใหม่ที่ลืมใส่ = ช่องโหว่กลับมาเฉพาะตารางนั้น ──
  select string_agg(c.relname, ', ') into v_missing
    from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
     and not exists (select 1 from pg_policy p where p.polrelid = c.oid and p.polname = 'must_set_password_block' and not p.polpermissive);
  if v_missing is not null then
    raise exception 'FAIL: ตารางที่ยังไม่มีกฎ must_set_password_block (เพิ่มในใบแก้ฐานข้อมูลของตารางนั้น): %', v_missing;
  end if;
  raise notice 'ok  ทุกตารางใน public มีกฎจำกัดของด่านตั้งรหัส';

  select string_agg(c.relname, ', ') into v_missing
    from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and not c.relrowsecurity;
  if v_missing is not null then raise exception 'FAIL: ตารางที่ไม่ได้เปิดกฎสิทธิ์รายแถว: %', v_missing; end if;
  raise notice 'ok  ทุกตารางใน public เปิดกฎสิทธิ์รายแถว';

  -- มุมมองที่อ่านด้วยสิทธิ์เจ้าของ (ข้ามกฎรายตาราง) ต้องกรองด้วยเงื่อนไขเดียวกัน
  select string_agg(c.relname, ', ') into v_missing
    from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'v'
     and coalesce((select option_value from pg_options_to_table(c.reloptions) where option_name = 'security_invoker'), 'false') <> 'true'
     and pg_get_viewdef(c.oid) not ilike '%must_set_password()%';
  if v_missing is not null then raise exception 'FAIL: มุมมองที่ข้ามกฎรายตารางแต่ไม่ได้กรองด่านตั้งรหัส: %', v_missing; end if;
  raise notice 'ok  มุมมองที่ข้ามกฎรายตารางกรองด่านตั้งรหัสครบ';

  -- ── คำสั่งสิทธิ์สูงที่ผู้ใช้เรียกได้ (ข้ามกฎรายตาราง) ต้องผ่านตัวช่วยตรวจสิทธิ์ที่รู้จักด่านนี้ ──
  --   ตัวช่วยที่รู้จักด่าน: auth_dealer / auth_role (คืนค่าว่างเมื่อยังไม่ตั้งรหัส) และทุกตัวที่ต่อจากสองตัวนี้
  --   ตัวที่ไม่ผ่านตัวช่วยเลย ต้องอยู่ในรายการยกเว้นข้างล่าง พร้อมเหตุผลว่าทำไมปล่อยได้
  --   (คำสั่งใหม่ที่ลืมตรวจสิทธิ์ = ตก · รายการยกเว้นที่ไม่มีคำสั่งนั้นแล้ว = ตก)
  with ยกเว้น(name, reason) as (values
    ('catalog_price_hidden',     'คืนค่าเปิด/ปิดตัวเดียวของสวิตช์ซ่อนราคา ไม่มีข้อมูลของสาขา — กฎของตารางแม่แบบเรียกใช้ จึงต้องเรียกได้ทุกบัญชี'),
    ('package_annual_target',    'คืนตัวเลขเป้าของแพ็กเกจตามภาค เป็นค่าตั้งของสำนักงานใหญ่ ไม่ใช่ข้อมูลของสาขา (ข้อตัดสิน 13 ต.ค. 69: ปล่อยได้)'),
    ('check_own_rate_limit',     'ตัวนับจำนวนคำขอของผู้เรียกเอง (อิง auth.uid) — ไม่คืนข้อมูลของสาขา และต้องทำงานก่อนตั้งรหัสเพื่อจำกัดการยิงถี่'),
    ('is_account_active',        'ตอบแค่ว่าบัญชีของผู้เรียกเองยังเปิดใช้งานไหม (อิง auth.uid) — เป็นตัวช่วยที่กฎสิทธิ์เรียกใช้'),
    ('is_own_identity',          'ตอบแค่ว่าแถวนั้นเป็นของผู้เรียกเองไหม (อิง auth.uid) — เป็นตัวช่วยที่กฎสิทธิ์เรียกใช้')
  ), เปิดอยู่ as (
    select p.proname from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' and p.prosecdef and p.prorettype <> 'trigger'::regtype
       and has_function_privilege('authenticated', p.oid, 'execute')
       and p.prosrc !~ '(auth_dealer|auth_role|is_hq|can_write_|can_price_quotes|must_set_password)'
  )
  select string_agg(x, ' · ') into v_missing from (
    select 'ไม่ผ่านด่านและไม่อยู่ในรายการยกเว้น: ' || o.proname as x from เปิดอยู่ o where not exists (select 1 from ยกเว้น e where e.name = o.proname)
    union all
    select 'รายการยกเว้นที่ไม่มีคำสั่งนี้เปิดอยู่แล้ว: ' || e.name from ยกเว้น e where not exists (select 1 from เปิดอยู่ o where o.proname = e.name)
    union all
    select 'รายการยกเว้นไม่มีเหตุผล: ' || e.name from ยกเว้น e where length(btrim(e.reason)) < 20
  ) z;
  if v_missing is not null then raise exception 'FAIL: %', v_missing; end if;
  raise notice 'ok  คำสั่งสิทธิ์สูงที่ผู้ใช้เรียกได้ ผ่านด่านครบ (ยกเว้น 5 ตัวที่ระบุเหตุผลไว้ และไม่มีตัวไหนคืนข้อมูลของสาขา)';

  -- ── ใบผ่านปกติ: เห็นข้อมูลของสาขา ──
  perform set_config('request.jwt.claims', claims_ok::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into n_ok from leads;
  if n_ok = 0 then raise exception 'FAIL: ข้อมูลตั้งต้นของ CNX ว่าง — ทดสอบต่อไม่ได้'; end if;
  if auth_dealer() <> 'CNX' or auth_role() <> 'DEALER_ADMIN' or must_set_password() then raise exception 'FAIL: ใบผ่านปกติถูกมองว่าติดด่าน'; end if;
  raise notice 'ok  ใบผ่านปกติ: เห็นลูกค้าเป้าหมายของสาขา % ราย', n_ok;

  -- ── ใบผ่านที่มี claim ชั้นบน (จากตัวออกใบผ่าน) ──
  perform set_config('request.jwt.claims', (claims_ok || '{"must_change_password": true}')::text, true);
  select count(*) into n from leads;
  if n <> 0 or auth_dealer() <> '' or auth_role() <> '' or can_write_sales() then raise exception 'FAIL: claim ชั้นบน = true แต่ยังแตะข้อมูลได้ (เห็น % แถว)', n; end if;
  select count(*) into n from master_catalog;
  if n <> 0 then raise exception 'FAIL: ยังอ่านแม่แบบได้ % แถว', n; end if;
  select count(*) into n from master_catalog_public;
  if n <> 0 then raise exception 'FAIL: ยังอ่านมุมมองแม่แบบได้ % แถว', n; end if;
  raise notice 'ok  claim ชั้นบน: อ่านลูกค้าเป้าหมาย / แม่แบบ / มุมมองแม่แบบ ไม่ได้ และไม่มีสิทธิ์เขียน';

  -- ── ข้อยกเว้นของด่าน: อ่านได้เฉพาะ "ของตัวเอง" สองอย่างที่หน้าจอต้องใช้ก่อนแสดงหน้าตั้งรหัส ──
  --   (ไม่มีข้อยกเว้นนี้ = แอปเข้าใจว่าบัญชี/สาขาถูกลบ แล้วเตะออกไปหน้าเข้าสู่ระบบ — เข้าไปตั้งรหัสไม่ได้เลย)
  select count(*), count(*) filter (where code = 'CNX') into n, n_ok from dealers_directory;
  if n <> 1 or n_ok <> 1 then raise exception 'FAIL: รายชื่อดีลเลอร์ต้องเห็นเฉพาะสาขาตัวเอง 1 แถว (เห็น % แถว เป็นของตัวเอง %)', n, n_ok; end if;
  if (select revenue_target from dealers_directory where code = 'CNX') is not null then raise exception 'FAIL: ยังไม่ตั้งรหัสแต่เห็นเป้ายอดขายของสาขา'; end if;
  select count(*), count(*) filter (where id = v_uid) into n, n_ok from profiles;
  if n <> 1 or n_ok <> 1 then raise exception 'FAIL: โปรไฟล์ต้องเห็นเฉพาะของตัวเอง 1 แถว (เห็น % แถว)', n; end if;
  begin
    update profiles set name = 'แก้ด้วยรหัสชั่วคราว' where id = v_uid;
    if found then raise exception 'FAIL: ยังไม่ตั้งรหัสแต่แก้โปรไฟล์ตัวเองได้'; end if;
  exception when insufficient_privilege or check_violation then null;
  end;
  raise notice 'ok  ข้อยกเว้นของด่าน: เห็นเฉพาะโปรไฟล์และแถวสาขาของตัวเอง (ไม่เห็นเป้ายอดขาย) · แก้โปรไฟล์ไม่ได้';

  -- ── ใบผ่านรุ่นเก่า (ออกก่อนใบ 0187): ไม่มี claim ชั้นบน มีแต่ app_metadata — ต้องติดด่านเหมือนกัน ──
  perform set_config('request.jwt.claims', (claims_ok || '{"app_metadata": {"must_change_password": true}}')::text, true);
  select count(*) into n from leads;
  if n <> 0 or not must_set_password() then raise exception 'FAIL: ใบผ่านรุ่นเก่า (มีแต่ app_metadata) หลุดด่าน เห็น % แถว', n; end if;
  raise notice 'ok  ใบผ่านรุ่นเก่าที่มีแต่ app_metadata ติดด่านเหมือนกัน';

  -- ── ผู้ใช้ใส่ค่าใน user_metadata เองเพื่อหลอกว่าตั้งแล้ว — ไม่มีผล ──
  perform set_config('request.jwt.claims', (claims_ok || '{"must_change_password": true, "user_metadata": {"must_change_password": false}}')::text, true);
  select count(*) into n from leads;
  if n <> 0 then raise exception 'FAIL: user_metadata ล้างเครื่องหมายได้ เห็น % แถว', n; end if;
  raise notice 'ok  ค่าใน user_metadata (ผู้ใช้แก้เองได้) ไม่มีผลต่อด่าน';

  -- ── เขียนตรง: ถูกกฎปฏิเสธ ──
  begin
    insert into leads (id, dealer_code, num_id, name, company, phone, province)
    values ('#GATE-1', 'CNX', 880200001, 'ก', 'บจ. ทดสอบด่านตั้งรหัส', '081-555-0144', 'เชียงใหม่');
    raise exception 'FAIL: ยังไม่ตั้งรหัสแต่เพิ่มลูกค้าเป้าหมายได้';
  exception when insufficient_privilege or check_violation then
    raise notice 'ok  ยังไม่ตั้งรหัส: เพิ่มลูกค้าเป้าหมายถูกปฏิเสธ';
  end;

  -- ── ตัวออกใบผ่านยกเครื่องหมายขึ้นเป็น claim ชั้นบน ──
  perform set_config('role', 'postgres', true);
  if (custom_access_token_hook(jsonb_build_object('user_id', v_uid, 'claims', jsonb_build_object('app_metadata', jsonb_build_object('must_change_password', true))))
        #>> '{claims,must_change_password}') <> 'true' then
    raise exception 'FAIL: ตัวออกใบผ่านไม่ได้ยกเครื่องหมายขึ้นเป็น claim';
  end if;
  if (custom_access_token_hook(jsonb_build_object('user_id', v_uid, 'claims', '{}'::jsonb)) #>> '{claims,must_change_password}') <> 'false' then
    raise exception 'FAIL: บัญชีปกติต้องได้ claim เป็น false';
  end if;
  raise notice 'ok  ตัวออกใบผ่าน: มีเครื่องหมาย → claim true · บัญชีปกติ → claim false';
  raise notice 'ALL PASS';
end $$;

rollback;
