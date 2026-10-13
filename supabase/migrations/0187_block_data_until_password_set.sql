-- ── บัญชีที่ยังถือรหัสชั่วคราว ต้องแตะข้อมูลไม่ได้จนกว่าจะตั้งรหัสของตัวเอง — บังคับที่ฐานข้อมูล ──────
--
-- ช่องโหว่ (พบ 13 ต.ค. 69 · ยืนยันด้วยข้อทดสอบยิงจริง temp-password-data-access.spec.ts):
--   "เข้าระบบครั้งแรกต้องตั้งรหัสใหม่" บังคับอยู่แค่ที่หน้าจอ (FirstPasswordGate)
--   กฎสิทธิ์ของฐานข้อมูลและ /api/v1 ไม่เคยดูเครื่องหมาย must_change_password
--   → ผู้ถือรหัสชั่วคราวจากสำนักงานใหญ่ ยิงตรงฐานหรือผ่าน /api/v1 อ่าน-เขียนข้อมูลของสาขานั้นได้
--     โดยไม่ต้องผ่านหน้าตั้งรหัส (ไม่ข้ามสาขา — กฎแยกสาขายังบังคับ)
--
-- เครื่องหมายเก็บที่ไหน: auth.users.raw_app_meta_data (app_metadata) — ตั้ง/ล้างโดยเส้นทางของสำนักงานใหญ่
--   ด้วยสิทธิ์เซิร์ฟเวอร์เท่านั้น · ผู้ใช้แก้เองได้เฉพาะ user_metadata จึงล้างเครื่องหมายนี้เองไม่ได้
--
-- วิธีปิด (จุดเดียว ครอบทุกทางเข้า — REST ตรง · /api/v1 · คำสั่งของระบบ):
--   1) ตัวออกใบผ่านยกเครื่องหมายขึ้นเป็น claim ชั้นบน
--   2) must_set_password() อ่าน claim นั้น
--   3) auth_dealer() / auth_role() คืนค่าว่างเมื่อยังไม่ตั้งรหัส → is_hq() · can_write_*() และทุกคำสั่งของระบบ
--      ที่ตรวจสิทธิ์ผ่านตัวช่วยชุดนี้ ปฏิเสธเองทั้งหมด
--   4) ทุกตารางมีกฎ "จำกัด" (restrictive) ซ้ำอีกชั้น — ครอบตารางที่อ่านได้ทุกคน (แม่แบบ · ค่าตั้งของสำนักงานใหญ่)
--   5) มุมมองที่อ่านด้วยสิทธิ์เจ้าของ กรองเองด้วยเงื่อนไขเดียวกัน
--   ข้อยกเว้นของด่าน (อ่านอย่างเดียว · ของตัวเองเท่านั้น): แถวโปรไฟล์ของตัวเอง และแถวสาขาของตัวเองในรายชื่อดีลเลอร์
--     — หน้าจอต้องอ่านสองอย่างนี้เพื่อยืนยันว่าบัญชี/สาขายังเปิดอยู่ ก่อนแสดงหน้าตั้งรหัส
--
-- ⚠️ ไม่ยกเว้นการเข้าระบบแทนดีลเลอร์: ใบผ่านที่ได้เป็นของบัญชีนั้นเอง จึงติดด่านเดียวกัน (ตั้งใจ)
-- ⚠️ ตั้งรหัสแล้วใบผ่านเดิมยังมีเครื่องหมายเก่า — แต่การตั้งรหัสยกเลิกใบผ่านทุกใบอยู่แล้ว หน้าจอจึงพาเข้าระบบใหม่
--    ใบผ่านใบใหม่ไม่มีเครื่องหมาย เห็นข้อมูลได้ทันที
-- ⚠️ ไม่ครอบ 2 คำสั่งที่ไม่ใช่ข้อมูลของสาขา: catalog_price_hidden() (ค่าเปิด/ปิดตัวเดียว) · package_annual_target() (ตัวเลขเป้าของแพ็กเกจ)

-- ═══ 1. ตัวออกใบผ่าน: ยกเครื่องหมายขึ้นเป็น claim ═══════════════════════════════════════
-- (นิยามเดิมทุกบรรทัด เพิ่มเฉพาะส่วน must_change_password — สร้างจากตัวที่ใช้งานอยู่ ไม่ได้พิมพ์ใหม่)
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  claims jsonb := coalesce(event -> 'claims', '{}'::jsonb);
  p record;
begin
  select pr.role                                as role,
         coalesce(pr.dealer_code, '')           as dealer_code,
         pr.status::text                        as user_status,
         coalesce(d.status::text, 'active')     as dealer_status
    into p
    from public.profiles pr
    left join public.dealers d on d.code = pr.dealer_code
   where pr.id = (event ->> 'user_id')::uuid;

  -- ไม่มีโปรไฟล์ = ไม่ใส่ claim สิทธิ์ให้ (พฤติกรรมเดิมของ 0005 — RLS จะปฏิเสธเอง)
  if not found then
    return jsonb_set(event, '{claims}', claims);
  end if;

  -- บัญชีหรือสาขาถูกปิด → ไม่ออก token
  if p.user_status <> 'active' or (p.dealer_code <> '' and p.dealer_status <> 'active') then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 403,
      'message',   'บัญชีนี้ถูกปิดใช้งาน — กรุณาติดต่อผู้ดูแลระบบ'));
  end if;

  claims := jsonb_set(claims, '{user_role}',   to_jsonb(p.role::text));
  claims := jsonb_set(claims, '{dealer_code}', to_jsonb(p.dealer_code));
  -- เครื่องหมาย "ยังไม่ได้ตั้งรหัสผ่านของตัวเอง" (0187) — ยกขึ้นเป็น claim ชั้นบนแบบเดียวกับ user_role / dealer_code
  --   ต้นทางคือ app_metadata ของบัญชี ซึ่งแก้ได้เฉพาะฝั่งเซิร์ฟเวอร์ (ผู้ใช้เรียก auth.updateUser แก้เองไม่ได้)
  claims := jsonb_set(claims, '{must_change_password}',
                      to_jsonb(coalesce(claims #>> '{app_metadata,must_change_password}', 'false') = 'true'));
  return jsonb_set(event, '{claims}', claims);
end;
$function$;

-- ═══ 2. ตัวอ่านเครื่องหมาย ═════════════════════════════════════════════════════════════
/** บัญชีนี้ยังไม่ได้ตั้งรหัสผ่านของตัวเองหรือเปล่า — อ่านจากใบผ่าน
 *  ดูทั้ง claim ชั้นบน (จากตัวออกใบผ่าน) และ app_metadata ตรง ๆ: ใบผ่านที่ออกก่อนใบ 0187 ไม่มี claim ชั้นบน
 *  แต่มี app_metadata เสมอ — ต้องไม่มีช่วงที่ใบผ่านเก่าหลุดด่าน */
create or replace function public.must_set_password() returns boolean
  language sql stable set search_path to 'public' as $$
    select coalesce(auth.jwt() ->> 'must_change_password', 'false') = 'true'
        or coalesce(auth.jwt() #>> '{app_metadata,must_change_password}', 'false') = 'true'
  $$;

-- ═══ 3. ตัวช่วยตรวจสิทธิ์: ยังไม่ตั้งรหัส = ไม่มีสาขา ไม่มีบทบาท ═══════════════════════════
create or replace function public.auth_dealer() returns text
  language sql stable set search_path to 'public' as $$
    select case when public.must_set_password() then '' else coalesce(auth.jwt() ->> 'dealer_code', '') end
  $$;

create or replace function public.auth_role() returns text
  language sql stable set search_path to 'public' as $$
    select case when public.must_set_password() then '' else coalesce(auth.jwt() ->> 'user_role', '') end
  $$;

-- ═══ 4. กฎจำกัดซ้ำบนทุกตาราง ═══════════════════════════════════════════════════════════
-- กฎแบบ restrictive ถูกนำไป "และ" กับกฎอนุญาตทุกข้อ — ตารางที่เปิดอ่านให้ทุกคนที่เข้าระบบก็ถูกปิดด้วย
-- วนทุกตารางที่เปิด RLS ใน public (ไม่เขียนรายชื่อตายตัว)
-- ตารางที่เพิ่มทีหลังต้องมีกฎนี้ด้วย — supabase/tests/temp_password_gate.sql ตกถ้าตารางไหนไม่มี
do $$
declare t record;
begin
  for t in select c.relname from pg_class c
            where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relrowsecurity
  loop
    execute format('drop policy if exists must_set_password_block on public.%I', t.relname);
    -- ข้อยกเว้นเดียว: อ่าน "แถวโปรไฟล์ของตัวเอง" ได้ — หน้าจอต้องใช้ยืนยันว่าบัญชียังเปิดใช้งานอยู่ก่อนพาไปหน้าตั้งรหัส
    --   ไม่ยกเว้น = ตัวตรวจของแอป (stillValid) อ่านไม่เจอแถว → เข้าใจว่าบัญชีถูกลบ → เตะออกไปหน้าเข้าสู่ระบบ
    --   = บัญชีที่ต้องตั้งรหัส "เข้าไปตั้งรหัสไม่ได้เลย" (ข้อทดสอบ first-login-password จับได้ 13 ต.ค. 69 ก่อนขึ้นจริง)
    --   แก้ไข/เพิ่มโปรไฟล์ยังถูกปฏิเสธ (with check ไม่มีข้อยกเว้น)
    execute format(
      'create policy must_set_password_block on public.%I as restrictive for all to authenticated '
      'using (not public.must_set_password()%s) with check (not public.must_set_password())',
      t.relname, case when t.relname = 'profiles' then ' or id = auth.uid()' else '' end);
  end loop;
end $$;

-- ═══ 5. มุมมองที่อ่านด้วยสิทธิ์เจ้าของ (ข้ามกฎรายตาราง) ต้องกรองเอง ═════════════════════════
create or replace view public.dealers_directory as
 SELECT code,
    name,
    province,
    region,
    status,
    created_at,
        CASE
            WHEN is_hq() OR code = auth_dealer() THEN revenue_target
            ELSE NULL::numeric
        END AS revenue_target,
    package,
    target_manual
   FROM dealers
  -- ยังไม่ตั้งรหัส: เห็นได้เฉพาะแถวของสาขาตัวเอง (หน้าจอใช้ตรวจว่าสาขายังเปิดอยู่ก่อนพาไปหน้าตั้งรหัส — เหตุผลเดียวกับโปรไฟล์)
  --   อ่านรหัสสาขาจากใบผ่านตรง ๆ เพราะ auth_dealer() คืนค่าว่างให้บัญชีกลุ่มนี้ · เป้ายอดขายยังเป็นค่าว่าง (เงื่อนไขในคอลัมน์ใช้ auth_dealer())
  WHERE NOT public.must_set_password() OR code = coalesce(auth.jwt() ->> 'dealer_code', '');

create or replace view public.master_catalog_public as
  select id, name, spec, unit, image, subtypes, subtype_images, plans, subtype_plans, created_at
    from public.master_catalog
   where not public.must_set_password();

-- ═══ 6. คำสั่งภายในของระบบ: ผู้ใช้และคนนอกเรียกเองไม่ได้ ════════════════════════════════════
-- ทั้งสามตัวถูกถอนสิทธิ์ไว้ในใบเดิมอยู่แล้ว (0131 · 0005/0032 · 0065) — สั่งซ้ำตรงนี้เพื่อให้ฐานที่ถูกให้สิทธิ์คืนนอกใบ
--   (ฐานทดสอบในเครื่อง · พบ 13 ต.ค. 69) กลับมาถูกต้อง และกันกรณีฐานจริงเคยถูกแตะแบบเดียวกัน · รันซ้ำได้ ไม่มีผลกับฐานที่ถูกอยู่แล้ว
-- restore_sync_sequences(): ตั้งตัวนับเลขใหม่ทั้งฐาน — สคริปต์กู้ข้อมูลเรียกด้วยกุญแจ service_role เท่านั้น
revoke all on function public.restore_sync_sequences() from public, anon, authenticated;
grant execute on function public.restore_sync_sequences() to service_role;
-- custom_access_token_hook(): ตัวออกใบผ่าน — ระบบยืนยันตัวตนเรียกเท่านั้น (ตามเอกสารของ Supabase)
revoke all on function public.custom_access_token_hook(jsonb) from public, anon, authenticated;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
-- check_rate_limit(): ตัวนับจำนวนคำขอของเส้นทางผู้ดูแล — เรียกด้วยกุญแจ service_role เท่านั้น (packages/shared/lib/rateLimit.ts)
revoke all on function public.check_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;
