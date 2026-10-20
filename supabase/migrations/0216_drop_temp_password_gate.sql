-- ── ใบ 0216: เอาด่าน "ยังไม่ตั้งรหัสของตัวเอง แตะข้อมูลไม่ได้" (ใบ 0187) ออก ─────────────────────────────
--
-- บอสอนุมัติ 19 ต.ค. 69 (หลังรอบ 1 ของงานไล่ flow) · ลงฐานจริงรวมกับใบของรอบ 2
--
-- เหตุผล (บอสตัดสิน 19 ต.ค. 69): ไม่มีขั้นบังคับตั้งรหัส/ยืนยันอีเมลใน flow แล้ว
--   แต่ด่านชั้นฐานข้อมูลยังอยู่ → บัญชีที่มีเครื่องหมาย must_change_password ค้าง (แม้แต่บัญชีเดียว)
--   จะเห็นข้อมูลว่างทั้งระบบโดยไม่มีอะไรบอก · หน้าจอไม่มีทางพาไปปลดเครื่องหมายแล้ว
--
-- สิ่งที่ทำ (ไม่ใช้ CASCADE — จะลบ dealers_directory ทิ้ง):
--   1) auth_role / auth_dealer กลับเป็นแบบก่อน 0187 (อ่านจากใบผ่านตรง ๆ · 0002 + search_path จาก 0096)
--   2) มุมมอง dealers_directory / master_catalog_public กลับเป็นแบบก่อน 0187 (0180 / 0186) + สิทธิ์ตาม 0199
--   3) ลบกฎจำกัด must_set_password_block ทุกตาราง (วนจาก pg_policies ไม่เขียนรายชื่อตายตัว)
--   4) ลบ must_set_password()
--   ไม่แตะ custom_access_token_hook — ช่อง must_change_password ในใบผ่านไม่มีใครอ่านแล้ว ปล่อยไว้ไม่มีผล (ลดความเสี่ยงระบบล็อกอิน)
--
-- ข้อทดสอบ: supabase/tests/no_temp_password_gate.sql (แทน temp_password_gate.sql · ต้องตกถ้ายังไม่ลงใบนี้)

-- 1) ตัวช่วยตรวจสิทธิ์ — create or replace คงสิทธิ์เรียกเดิม (0190)
create or replace function public.auth_role() returns text
  language sql stable set search_path to 'public'
  as $$ select coalesce(auth.jwt() ->> 'user_role', '') $$;

create or replace function public.auth_dealer() returns text
  language sql stable set search_path to 'public'
  as $$ select coalesce(auth.jwt() ->> 'dealer_code', '') $$;

-- 2) มุมมองที่อ่านด้วยสิทธิ์เจ้าของ — เอาเงื่อนไขด่านออก
create or replace view public.dealers_directory as
select
  code, name, province, region, status, created_at,
  case when is_hq() or code = auth_dealer() then revenue_target else null end as revenue_target,
  package,
  target_manual
from public.dealers;

create or replace view public.master_catalog_public as
  select id, name, spec, unit, image, subtypes, subtype_images, plans, subtype_plans, created_at
    from public.master_catalog;

-- create or replace view รีเซ็ต ACL — ตั้งซ้ำตาม 0180/0186/0199
revoke all on public.dealers_directory     from public, anon;
revoke all on public.master_catalog_public from public, anon;
revoke insert, update, delete, truncate, references, trigger on public.dealers_directory     from anon, authenticated, service_role;
revoke insert, update, delete, truncate, references, trigger on public.master_catalog_public from anon, authenticated, service_role;
grant select on public.dealers_directory     to authenticated, service_role;
grant select on public.master_catalog_public to authenticated, service_role;

-- 3) กฎจำกัดของด่านบนทุกตาราง (0187 + ตารางที่เพิ่มทีหลัง 0193/0194/0195/0208)
do $$
declare p record;
begin
  for p in select schemaname, tablename from pg_policies
            where schemaname = 'public' and policyname = 'must_set_password_block'
  loop
    execute format('drop policy must_set_password_block on %I.%I', p.schemaname, p.tablename);
  end loop;
end $$;

-- 4) ตัวตรวจด่าน — ไม่มีใครใช้แล้ว
drop function public.must_set_password();
