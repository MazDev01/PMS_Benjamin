-- ── ใบ 0282: HQ บทบาทเดียว "สำนักงานใหญ่" (บอสสั่ง 5 พ.ย. 69 · คนรวมงานส่งงาน 9 พ.ย. 69) ─────────────────────────────────
-- เดิม HQ มี 3 บทบาท (SUPER_ADMIN ผู้ดูแลระบบ · HQ_MANAGEMENT ผู้บริหาร · HQ_STAFF เจ้าหน้าที่) สิทธิ์ต่างกัน
--   บอสสั่ง: เหลือบทบาทเดียว ทำได้ทุกอย่าง · ฝั่งดีลเลอร์ไม่เปลี่ยน · ห้ามปิด/ลดสิทธิ์บัญชี HQ คนสุดท้ายที่ใช้งาน
-- ทำในใบนี้:
--   1) ค่าเดียวของ HQ = SUPER_ADMIN (ชื่อบนจอ "สำนักงานใหญ่") — แปลงผู้ใช้ HQ_MANAGEMENT / HQ_STAFF ทั้งหมด (ฐานจริง 5 พ.ย. 69: HQ มี SUPER_ADMIN 1 คน)
--      ค่า enum เดิมเก็บไว้ (Postgres ลบค่า enum ตรง ๆ ไม่ได้ ต้องสร้างชนิดใหม่ทั้งคอลัมน์ — เสี่ยงกว่าประโยชน์)
--      แต่กันด้วยข้อจำกัด profiles_hq_single_role: ตั้ง/แก้เป็นค่าเดิมไม่ได้อีก
--   2) กฎสิทธิ์ HQ ตัวเดียว = is_hq() (บทบาท SUPER_ADMIN) · ตัวอื่นเรียกตัวนี้: can_write_master · can_price_quotes · นโยบายแถว profiles
--      · guard_profile_privilege · quote_request_accept (ผู้รับผิดชอบ = ผู้ใช้ HQ)
--      kpi_cards / profiles_audit อ่านบทบาทของ "ผู้ใช้คนอื่น" (นับ/ลงบันทึกผู้ใช้ HQ) — ค่าเดิมในรายการมีในตารางไม่ได้แล้วตามข้อจำกัด
--      จึงไม่สร้างฟังก์ชันใหญ่ใหม่ในใบนี้ (ผลเท่าเดิม)
--   3) ห้ามปิด/ลบ/ลดสิทธิ์บัญชีสำนักงานใหญ่คนสุดท้ายที่ใช้งาน — ตัวดักเดิม guard_last_super_admin (0117) ข้อความใหม่ตามคำเรียก
--   4) ชื่อบทบาทในบันทึกใหม่ (_role_th): ค่าเดิมทุกตัวของ HQ = "สำนักงานใหญ่" · บันทึกเก่าไม่แก้แถว (หน้าจอแปลงตอนแสดง)
-- ใบนี้รันซ้ำได้ · ข้อทดสอบ: supabase/tests/hq_single_role.sql

-- ═══ 1) แปลงผู้ใช้ HQ เดิม ═══
--   ตัวดัก guard_profile_privilege ยอมเฉพาะคนที่เป็น HQ แก้บทบาท — ใบนี้รันในนามฐาน (ไม่มี JWT) จึงตั้งตัวตนชั่วคราวในทรานแซกชันนี้
select set_config('request.jwt.claims', '{"user_role":"SUPER_ADMIN"}', true);
update public.profiles set role = 'SUPER_ADMIN' where role in ('HQ_MANAGEMENT', 'HQ_STAFF');
select set_config('request.jwt.claims', '', true);
alter table public.profiles drop constraint if exists profiles_hq_single_role;
alter table public.profiles add constraint profiles_hq_single_role check (role not in ('HQ_MANAGEMENT', 'HQ_STAFF'));
comment on constraint profiles_hq_single_role on public.profiles is 'HQ บทบาทเดียว (ใบ 0282) — ค่า HQ_MANAGEMENT/HQ_STAFF เก็บไว้ในชนิดเพื่อบันทึกเก่า ตั้งให้ผู้ใช้ไม่ได้';

-- ═══ 2) กฎสิทธิ์ HQ ตัวเดียว ═══
create or replace function public.is_hq() returns boolean
  language sql stable set search_path to 'public'
  as $function$ select auth_role() = 'SUPER_ADMIN' $function$;

create or replace function public.can_write_master() returns boolean
  language sql stable set search_path to 'public'
  as $function$ select public.is_hq() and public.is_account_active() $function$;

-- ราคา HQ: เดิมอ่านจากตาราง quote_pricing_roles (3 บทบาท) — ตอนนี้ = HQ ที่ใช้งาน (ตารางเดิมคงไว้ ไม่มีใครอ่านแล้ว)
create or replace function public.can_price_quotes() returns boolean
  language sql stable security definer set search_path to 'public'
  as $$ select public.is_hq() and public.is_account_active() $$;
delete from public.quote_pricing_roles where role <> 'SUPER_ADMIN';
comment on table public.quote_pricing_roles is 'เลิกใช้ (ใบ 0282 · HQ บทบาทเดียว) — can_price_quotes() = is_hq() และบัญชีใช้งานอยู่';

create or replace function public.guard_profile_privilege() returns trigger
  language plpgsql security definer set search_path to 'public'
as $function$
begin
  if public.is_hq() then
    return new;   -- สำนักงานใหญ่จัดการสิทธิ์ผู้อื่นได้ (บทบาทเดียว · ใบ 0282)
  end if;
  if new.role        is distinct from old.role
     or new.dealer_code is distinct from old.dealer_code
     or new.status      is distinct from old.status then
    raise exception 'แก้บทบาท/สาขา/สถานะของตัวเองไม่ได้';
  end if;
  return new;
end $function$;

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert with check ((select public.is_hq()));
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update using ((select public.is_hq())) with check ((select public.is_hq()));
drop policy if exists profiles_delete on public.profiles;
create policy profiles_delete on public.profiles for delete using ((select public.is_hq()));

create or replace function public.quote_request_accept(p_id bigint, p_assignee uuid default null::uuid)
  returns quote_requests language plpgsql security definer set search_path to 'public'
as $function$
declare
  r      quote_requests;
  v_who  uuid := coalesce(p_assignee, auth.uid());
  v_name text;
begin
  if not can_price_quotes() then raise exception 'forbidden: เฉพาะสำนักงานใหญ่เท่านั้นที่รับคำขอได้'; end if;
  select coalesce(name, '') into v_name from profiles
   where id = v_who and role = 'SUPER_ADMIN';   -- ผู้ใช้สำนักงานใหญ่ (บทบาทเดียว · ใบ 0282)
  if not found then raise exception 'assignee_invalid: ผู้รับผิดชอบต้องเป็นผู้ใช้ของสำนักงานใหญ่'; end if;

  select * into r from quote_requests where id = p_id for update;
  if not found then raise exception 'request_not_found: ไม่พบคำขอนี้'; end if;
  if r.status not in ('new', 'pricing') then
    raise exception 'request_stage: รับเรื่องได้เฉพาะคำขอที่ยังไม่ได้ส่งใบ (สถานะ %)', r.status;
  end if;

  update quote_requests
     set status = 'pricing', assignee = v_who, assignee_name = v_name,
         accepted_at = coalesce(accepted_at, now())
   where id = p_id returning * into r;
  return r;
end $function$;

-- ═══ 3) ห้ามปิด/ลบ/ลดสิทธิ์บัญชีสำนักงานใหญ่คนสุดท้ายที่ใช้งาน ═══
create or replace function public.guard_last_super_admin() returns trigger
  language plpgsql security definer set search_path to 'public'
as $function$
declare remaining integer;
begin
  -- สนใจเฉพาะกรณีที่ "เลิกเป็นบัญชีสำนักงานใหญ่ที่ใช้งาน": ถูกลบ · เปลี่ยนบทบาท · ถูกปิดการใช้งาน
  if tg_op = 'UPDATE' and new.role = 'SUPER_ADMIN' and new.status = 'active' then
    return new;
  end if;
  if old.role <> 'SUPER_ADMIN' or old.status <> 'active' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  select count(*) into remaining from profiles where role = 'SUPER_ADMIN' and status = 'active' and id <> old.id;
  if remaining = 0 then
    raise exception 'last_hq_account: ห้ามปิด ลบ หรือลดสิทธิ์บัญชีสำนักงานใหญ่คนสุดท้ายที่ใช้งาน — เพิ่มบัญชีสำนักงานใหญ่คนใหม่ก่อน';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $function$;

-- ═══ 4) ชื่อบทบาทในบันทึกใหม่: ค่าเดิมทุกตัวของ HQ = "สำนักงานใหญ่" ═══
create or replace function public._role_th(r text) returns text
  language sql immutable set search_path to 'public'
as $function$
  select case when r in ('SUPER_ADMIN', 'HQ_MANAGEMENT', 'HQ_STAFF') then 'สำนักงานใหญ่' else r end;
$function$;
