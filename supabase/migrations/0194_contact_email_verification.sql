-- ── อีเมลติดต่อของดีลเลอร์: ต้องยืนยันด้วยโค้ดก่อนรับแจ้งเตือน (ด่าน 1) ─────────────────────────────────
--
-- ที่มา (14 ต.ค. 69): อีเมลแจ้งเตือนถึงดีลเลอร์ใช้ profiles.contact_email (ห้ามใช้อีเมลเข้าระบบ @partner-agent.co.th ซึ่งไม่มีจริง)
--   ระบบจริงกรอกแล้ว 0 จาก 155 บัญชี · ที่กรอกเองโดยไม่ยืนยัน = พิมพ์ผิดแล้วแจ้งเตือนหายเงียบ
--
-- กติกา:
--   - สถานะ "ยืนยันแล้ว" ตั้งได้ทางเดียวคือฝั่งเซิร์ฟเวอร์ (กรอกโค้ดถูก หรือ HQ ยืนยันแทน) — ผู้ใช้ตั้งเองไม่ได้
--   - เปลี่ยนอีเมลติดต่อเมื่อไร สถานะยืนยันถูกล้างทันที (ตัวดักที่ฐาน) แถบเตือนจึงกลับมาเอง
--   - แจ้งเตือนถึงดีลเลอร์ใช้เฉพาะอีเมลที่ยืนยันแล้ว (_dealer_notify_emails) — ยังไม่ยืนยัน = ไม่ส่ง ไม่ใช่ส่งไปที่อยู่ที่ยังไม่รู้ว่าถูก
--   ด่านยืนยันอีเมลอยู่ที่หน้าจอเท่านั้น ไม่ปิดข้อมูลที่ฐาน (ข้อตัดสิน 14 ต.ค. 69: เป็นเรื่องการแจ้งเตือน ไม่ใช่ความปลอดภัย
--   — บังคับที่ฐานแล้ว SMTP ล่ม ดีลเลอร์ใหม่ทุกรายจะถูกล็อกออกจากข้อมูล)

alter table public.profiles add column if not exists contact_email_verified_at timestamptz;
comment on column public.profiles.contact_email_verified_at is 'เวลาที่ยืนยันอีเมลติดต่อ (ว่าง = ยังไม่ยืนยัน) · ตั้งได้เฉพาะฝั่งเซิร์ฟเวอร์ · ล้างเองเมื่อ contact_email เปลี่ยน';

create or replace function public.profiles_contact_email_verify_guard() returns trigger
  language plpgsql set search_path to 'public' as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then new.contact_email_verified_at := null; end if;
    return new;
  end if;
  if new.contact_email is distinct from old.contact_email then
    new.contact_email_verified_at := null;                         -- อีเมลใหม่ = ต้องยืนยันใหม่ (ทุกทาง รวมฝั่งเซิร์ฟเวอร์)
  elsif auth.uid() is not null and new.contact_email_verified_at is distinct from old.contact_email_verified_at then
    new.contact_email_verified_at := old.contact_email_verified_at; -- ผู้ใช้ตั้ง/ล้างสถานะยืนยันเองไม่ได้
  end if;
  return new;
end $$;
revoke all on function public.profiles_contact_email_verify_guard() from public, anon, authenticated, service_role;
drop trigger if exists profiles_contact_email_verify_guard on public.profiles;
create trigger profiles_contact_email_verify_guard before insert or update on public.profiles
  for each row execute function public.profiles_contact_email_verify_guard();

-- ═══ โค้ดยืนยัน (ฝั่งเซิร์ฟเวอร์เท่านั้น) ═════════════════════════════════════════════════════
create table public.contact_email_codes (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  code_hash  text not null,                    -- เก็บเฉพาะค่าแฮช ไม่เก็บโค้ดตรง ๆ
  expires_at timestamptz not null,
  attempts   integer not null default 0,
  sent_at    timestamptz not null default now()
);
comment on table public.contact_email_codes is 'โค้ดยืนยันอีเมลติดต่อที่ยังไม่ใช้ (ฉบับล่าสุดต่อบัญชี) · ฝั่งเซิร์ฟเวอร์เท่านั้น';
alter table public.contact_email_codes enable row level security;
revoke all on table public.contact_email_codes from public, anon, authenticated;
grant all on table public.contact_email_codes to service_role;
create policy must_set_password_block on public.contact_email_codes as restrictive for all to authenticated
  using (not public.must_set_password()) with check (not public.must_set_password());

-- ═══ ผู้รับแจ้งเตือนของดีลเลอร์ ═══════════════════════════════════════════════════════════
/** อีเมลติดต่อที่ยืนยันแล้วของบัญชีดีลเลอร์ (ผู้ดูแลสาขา) — ว่าง = ยังไม่มีใครรับ ไม่ส่ง
 *  ใช้ภายในตัวดักที่วางจดหมายถึงดีลเลอร์ (ด่าน 2: HQ ส่งใบ) ไม่มีใครเรียกตรงได้ */
create or replace function public._dealer_notify_emails(p_dealer text) returns text[]
  language sql stable security definer set search_path to 'public' as $$
  select coalesce(array_agg(distinct lower(btrim(p.contact_email)) order by lower(btrim(p.contact_email))), '{}')
    from profiles p
   where p.dealer_code = p_dealer and p.role = 'DEALER_ADMIN' and p.status = 'active'
     and btrim(p.contact_email) <> '' and p.contact_email_verified_at is not null
$$;
revoke all on function public._dealer_notify_emails(text) from public, anon, authenticated, service_role;
