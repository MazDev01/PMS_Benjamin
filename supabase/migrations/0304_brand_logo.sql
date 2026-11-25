-- ── ใบ 0304: โลโก้ของระบบ HQ เปลี่ยนได้ (บอสสั่ง 24 พ.ย. 69 "ทำให้โลโก้เปลี่ยนได้") ──
-- HQ อัปที่ ตั้งค่า › บริษัท → แสดงมุมซ้ายบนเมนูทั้ง 2 แอป · ดีลเลอร์เปลี่ยนเองไม่ได้ · ไม่ตั้ง = โลโก้ Benjamin เดิม
-- หน้าเข้าระบบใช้โลโก้เดิมเสมอ (ยังไม่ล็อกอิน · ไม่เปิดให้ anon ตามใบ 0297)
-- รับเฉพาะ PNG / JPEG / WebP ≤ 1 MB — ฐานตรวจไบต์หัวไฟล์จริง ไม่เชื่อนามสกุล/ชนิดที่ผู้ส่งบอก (SVG ฝังสคริปต์ได้ = ไม่รับ)
--   ไม่เก็บชื่อไฟล์ที่ผู้ใช้อัป · mime มาจากไบต์
-- ตารางแยกจาก hq_company (hq_company ถูกอ่านทั้งแถวหลายจุด — ไม่ลากไฟล์ 1 MB ไปด้วย)
-- อ่าน: brand_logo_meta() = sha ของโลโก้ · ตัวไฟล์ brand_logo_bytes() — ทั้งคู่เฉพาะผู้ล็อกอิน (HQ และดีลเลอร์) · anon ไม่ได้
--       (เส้นทาง /api/v1/brand-logo อ่านด้วยใบผ่านของผู้ใช้ฝั่งเซิร์ฟเวอร์แล้วส่งไบต์ให้ — หน้าเว็บไม่ได้ base64 ผ่าน RPC)
--       ไม่ใช้กุญแจ service — แอปดีลเลอร์ไม่มีกุญแจนี้โดยตั้งใจ (คนรวมงานตัดสิน 25 พ.ย. 69)
-- เขียน: brand_logo_set(base64) / brand_logo_clear() เฉพาะ HQ ที่บัญชีใช้งานอยู่ (can_write_master) · จด audit_log
-- ข้อทดสอบ: supabase/tests/brand_logo.sql · tests/tools/migration-0304.test.mjs · tests/scenario/brand-logo-upload.spec.ts

create table if not exists public.brand_logo (
  id          int primary key default 1 check (id = 1),
  data        bytea not null,
  mime        text not null check (mime in ('image/png', 'image/jpeg', 'image/webp')),
  sha256      text not null,
  updated_at  timestamptz not null default now(),
  updated_by  text
);
alter table public.brand_logo enable row level security;
-- ไม่มี policy = เข้าตรงไม่ได้ทั้งอ่านและเขียน (ผ่านฟังก์ชันด้านล่างเท่านั้น)
revoke all on table public.brand_logo from public, anon, authenticated;

-- ไบต์หัวไฟล์ → ชนิด (null = ไม่รับ)
create or replace function public._brand_logo_mime(b bytea) returns text
  language sql immutable set search_path to 'public' as $$
  select case
    when length(b) >= 8 and substring(b from 1 for 8) = '\x89504e470d0a1a0a'::bytea then 'image/png'
    when length(b) >= 3 and substring(b from 1 for 3) = '\xffd8ff'::bytea then 'image/jpeg'
    when length(b) >= 12 and substring(b from 1 for 4) = '\x52494646'::bytea
                         and substring(b from 9 for 4) = '\x57454250'::bytea then 'image/webp'
  end
$$;
revoke all on function public._brand_logo_mime(bytea) from public, anon, authenticated, service_role;

create or replace function public.brand_logo_set(p_base64 text) returns text
  language plpgsql security definer set search_path to 'public' as $$
declare
  b bytea;
  m text;
  h text;
begin
  if not can_write_master() then
    raise exception 'forbidden: เฉพาะสำนักงานใหญ่' using errcode = '42501';
  end if;
  begin
    b := decode(regexp_replace(coalesce(p_base64, ''), '\s', '', 'g'), 'base64');
  exception when others then
    raise exception 'brand_logo_type: ไฟล์โลโก้ต้องเป็น PNG JPG หรือ WebP';
  end;
  if b is null or length(b) = 0 then
    raise exception 'brand_logo_type: ไฟล์โลโก้ต้องเป็น PNG JPG หรือ WebP';
  end if;
  if length(b) > 1048576 then
    raise exception 'brand_logo_size: ไฟล์โลโก้ใหญ่เกิน 1 MB';
  end if;
  m := _brand_logo_mime(b);
  if m is null then
    raise exception 'brand_logo_type: ไฟล์โลโก้ต้องเป็น PNG JPG หรือ WebP';
  end if;
  h := encode(extensions.digest(b, 'sha256'), 'hex');
  insert into brand_logo (id, data, mime, sha256, updated_at, updated_by)
  values (1, b, m, h, now(), audit_actor())
  on conflict (id) do update set data = excluded.data, mime = excluded.mime, sha256 = excluded.sha256,
                                 updated_at = excluded.updated_at, updated_by = excluded.updated_by;
  insert into audit_log("user", role, action, target)
  values (audit_actor(), coalesce(auth.jwt() ->> 'user_role', ''), 'เปลี่ยนโลโก้ของระบบ',
          m || ' · ' || length(b) || ' ไบต์');
  return h;
end $$;
revoke all on function public.brand_logo_set(text) from public, anon, authenticated, service_role;
grant execute on function public.brand_logo_set(text) to authenticated;

create or replace function public.brand_logo_clear() returns void
  language plpgsql security definer set search_path to 'public' as $$
begin
  if not can_write_master() then
    raise exception 'forbidden: เฉพาะสำนักงานใหญ่' using errcode = '42501';
  end if;
  if exists (select 1 from brand_logo) then
    delete from brand_logo where id = 1;
    insert into audit_log("user", role, action, target)
    values (audit_actor(), coalesce(auth.jwt() ->> 'user_role', ''), 'กลับไปใช้โลโก้ Benjamin เดิม', '');
  end if;
end $$;
revoke all on function public.brand_logo_clear() from public, anon, authenticated, service_role;
grant execute on function public.brand_logo_clear() to authenticated;

-- sha ของโลโก้ปัจจุบัน (null = ใช้โลโก้เดิม) — ทุกคนที่ล็อกอิน (HQ และดีลเลอร์)
create or replace function public.brand_logo_meta() returns text
  language sql stable security definer set search_path to 'public' as $$
  select sha256 from brand_logo where id = 1 and auth.uid() is not null
$$;
revoke all on function public.brand_logo_meta() from public, anon, authenticated, service_role;
grant execute on function public.brand_logo_meta() to authenticated;

-- ตัวไฟล์ — เส้นทาง /api/v1/brand-logo ฝั่งเซิร์ฟเวอร์อ่านด้วยใบผ่านของผู้ใช้ (asCaller) แล้วส่งไบต์ให้ <img>
--   ⚠️ ไม่ใช้กุญแจ service: แอปดีลเลอร์ไม่มี SUPABASE_SERVICE_ROLE_KEY โดยตั้งใจ (docs/VERCEL.md · คนรวมงานตัดสิน 25 พ.ย. 69 ทาง ก)
--   คืนเฉพาะแถวโลโก้ (ชนิดที่ตรวจไว้ตอนอัป · sha · ไบต์) · ผู้ล็อกอินทุกคน (HQ และดีลเลอร์) · anon ไม่ได้
create or replace function public.brand_logo_bytes() returns table (mime text, sha256 text, data_base64 text)
  language sql stable security definer set search_path to 'public' as $$
  select mime, sha256, encode(data, 'base64') from brand_logo where id = 1 and auth.uid() is not null
$$;
revoke all on function public.brand_logo_bytes() from public, anon, authenticated, service_role;
grant execute on function public.brand_logo_bytes() to authenticated;
