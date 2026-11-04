-- ── ใบ 0276: ฐานกันช่องบังคับว่าง (บอสสั่ง 4 พ.ย. 69 · ชั้นที่สองต่อจากตัวกลาง <FieldLabel required> ของหน้าเว็บ) ──────
--
-- กติกา (ตกลงกับคนรวมงาน 4 พ.ย. 69):
--   · ใช้ trigger ไม่เพิ่ม CHECK — แถวเก่าบนฐานจริงที่ว่างอยู่แล้วต้องไม่ทำให้ใบลงไม่ได้ และแก้ช่องอื่นของแถวนั้นยังได้
--   · ตอนสร้าง (INSERT) บังคับเฉพาะที่หน้าเว็บบังคับครบทุกทางแล้ว: ใบค่าแฟรนไชส์ (ทุกช่อง) · ผู้สนใจ (เบอร์)
--     · ผู้รับผิดชอบ (ชื่อ) · ดีลเลอร์ (ชื่อ)
--   · ตอนแก้ (UPDATE) ปฏิเสธเฉพาะช่องที่ "เดิมมีค่า แล้วถูกแก้เป็นว่าง" — ช่องที่ว่างมาแต่เดิมไม่บังคับ (ไม่ขวางงานอื่นบนแถวเก่า)
--   · ส่งใบค่าแฟรนไชส์ (ร่าง → ส่งแล้ว) ต้องครบทุกช่องบังคับ
--   · ว่าง = null หรือมีแต่ช่องว่าง · "-" ผ่าน (ช่องข้อความ เช่น เลขผู้เสียภาษี/เงื่อนไข/ผู้ติดต่อ)
--   · ข้อมูลตั้งต้น (session_replication_role = replica) ไม่ผ่าน trigger อยู่แล้ว
--   · ข้อเสนอมีผลถึงก่อนวันที่เสนอ = CHECK dealer_package_proposals_valid_range เดิม · เลขอ้างอิงชำระ/บันทึกการติดต่อ/ช่องทาง = มีกันอยู่แล้ว
-- ข้อผิดพลาด: errcode 23514 ข้อความขึ้นต้น "required_field:" ตามด้วยชื่อช่องภาษาไทย
-- ข้อทดสอบ: supabase/tests/required_fields_guard.sql · รายการช่องฝั่งหน้าเว็บ: scripts/required-fields.json

create or replace function public.req_blank(v text) returns boolean
  language sql immutable set search_path to 'public' as $$ select btrim(coalesce(v, '')) = '' $$;
revoke all on function public.req_blank(text) from public, anon, authenticated, service_role;

-- เดิมมีค่า → ใหม่ว่าง
create or replace function public.req_blanked(o text, n text) returns boolean
  language sql immutable set search_path to 'public' as $$ select not public.req_blank(o) and public.req_blank(n) $$;
revoke all on function public.req_blanked(text, text) from public, anon, authenticated, service_role;

create or replace function public.req_fail(ช่อง text) returns void
  language plpgsql set search_path to 'public' as $$
begin
  raise exception 'required_field: ต้องกรอก "%" (ไม่มีข้อมูล ใส่ - ได้เฉพาะช่องข้อความ)', ช่อง using errcode = '23514';
end $$;
revoke all on function public.req_fail(text) from public, anon, authenticated, service_role;

-- ── ใบค่าแฟรนไชส์ ──────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.dealer_package_proposals_required() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'INSERT' or (old.status = 'draft' and new.status = 'sent') then
    if new.amount is null          then perform req_fail('ค่าแรกเข้า'); end if;
    if new.contract_months is null then perform req_fail('ระยะสัญญา'); end if;
    if new.annual_target is null   then perform req_fail('เป้ายอดซื้อต่อปี'); end if;
    if req_blank(new.region)       then perform req_fail('ภาค'); end if;
    if req_blank(new.province)     then perform req_fail('จังหวัด'); end if;
    if new.proposed_date is null   then perform req_fail('วันที่เสนอ'); end if;
    if new.valid_until is null     then perform req_fail('ข้อเสนอมีผลถึง'); end if;
    if req_blank(new.terms)        then perform req_fail('เงื่อนไข'); end if;
  else
    if old.amount is not null and new.amount is null                   then perform req_fail('ค่าแรกเข้า'); end if;
    if old.contract_months is not null and new.contract_months is null then perform req_fail('ระยะสัญญา'); end if;
    if old.annual_target is not null and new.annual_target is null     then perform req_fail('เป้ายอดซื้อต่อปี'); end if;
    if req_blanked(old.region, new.region)                             then perform req_fail('ภาค'); end if;
    if req_blanked(old.province, new.province)                         then perform req_fail('จังหวัด'); end if;
    if old.valid_until is not null and new.valid_until is null         then perform req_fail('ข้อเสนอมีผลถึง'); end if;
    if req_blanked(old.terms, new.terms)                               then perform req_fail('เงื่อนไข'); end if;
  end if;
  return new;
end $$;
revoke all on function public.dealer_package_proposals_required() from public, anon, authenticated, service_role;
drop trigger if exists dealer_package_proposals_required on public.dealer_package_proposals;
create trigger dealer_package_proposals_required before insert or update on public.dealer_package_proposals
  for each row execute function public.dealer_package_proposals_required();

-- ── บริษัท HQ (หน้าตั้งค่า) ─────────────────────────────────────────────────────────────────────────────────────
create or replace function public.hq_company_required() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
begin
  if req_blanked(old.name, new.name)       then perform req_fail('ชื่อบริษัท'); end if;
  if req_blanked(old.tax_id, new.tax_id)   then perform req_fail('เลขประจำตัวผู้เสียภาษี'); end if;
  if req_blanked(old.phone, new.phone)     then perform req_fail('โทรศัพท์'); end if;
  if req_blanked(old.address, new.address) then perform req_fail('ที่อยู่'); end if;
  return new;
end $$;
revoke all on function public.hq_company_required() from public, anon, authenticated, service_role;
drop trigger if exists hq_company_required on public.hq_company;
create trigger hq_company_required before update on public.hq_company
  for each row execute function public.hq_company_required();

-- ── ดีลเลอร์ ─────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.dealers_required() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'INSERT' then
    if req_blank(new.name) then perform req_fail('ชื่อดีลเลอร์'); end if;
  else
    if req_blanked(old.name, new.name)         then perform req_fail('ชื่อดีลเลอร์'); end if;
    if req_blanked(old.region, new.region)     then perform req_fail('ภาค'); end if;
    if req_blanked(old.province, new.province) then perform req_fail('จังหวัดที่ตั้ง'); end if;
  end if;
  return new;
end $$;
revoke all on function public.dealers_required() from public, anon, authenticated, service_role;
drop trigger if exists dealers_required on public.dealers;
create trigger dealers_required before insert or update on public.dealers
  for each row execute function public.dealers_required();

-- ── ผู้ใช้ (ชื่อ) ────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.profiles_required() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
begin
  if req_blanked(old.name, new.name) then perform req_fail('ชื่อ'); end if;
  return new;
end $$;
revoke all on function public.profiles_required() from public, anon, authenticated, service_role;
drop trigger if exists profiles_required on public.profiles;
create trigger profiles_required before update on public.profiles
  for each row execute function public.profiles_required();

-- ── ลีด (ผู้ติดต่อ · โทรศัพท์ · จังหวัดหน้างาน) ── ชื่อบริษัทมี CHECK leads_company_nonempty อยู่แล้ว ─────────────────────
create or replace function public.leads_required() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
begin
  if req_blanked(old.contact, new.contact)   then perform req_fail('ผู้ติดต่อ'); end if;
  if req_blanked(old.phone, new.phone)       then perform req_fail('โทรศัพท์'); end if;
  if req_blanked(old.province, new.province) then perform req_fail('จังหวัดหน้างาน'); end if;
  return new;
end $$;
revoke all on function public.leads_required() from public, anon, authenticated, service_role;
drop trigger if exists leads_required on public.leads;
create trigger leads_required before update on public.leads
  for each row execute function public.leads_required();

-- ── ลูกค้า (ผู้ติดต่อ · โทรศัพท์) ── ชื่อบริษัทมี CHECK customers_company_not_blank อยู่แล้ว ─────────────────────────────
create or replace function public.customers_required() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
begin
  if req_blanked(old.name, new.name)   then perform req_fail('ผู้ติดต่อ'); end if;
  if req_blanked(old.phone, new.phone) then perform req_fail('โทรศัพท์'); end if;
  return new;
end $$;
revoke all on function public.customers_required() from public, anon, authenticated, service_role;
drop trigger if exists customers_required on public.customers;
create trigger customers_required before update on public.customers
  for each row execute function public.customers_required();

-- ── นัดหมาย (ประเภท · วันที่ · เวลา) ──────────────────────────────────────────────────────────────────────────────
create or replace function public.appointments_required() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
begin
  if req_blanked(old.type, new.type) then perform req_fail('ประเภทนัด'); end if;
  if req_blanked(old.date, new.date) then perform req_fail('วันที่นัด'); end if;
  if req_blanked(old.time, new.time) then perform req_fail('เวลานัด'); end if;
  return new;
end $$;
revoke all on function public.appointments_required() from public, anon, authenticated, service_role;
drop trigger if exists appointments_required on public.appointments;
create trigger appointments_required before update on public.appointments
  for each row execute function public.appointments_required();

-- ── ตั้งค่าดีลเลอร์: ผู้ออกใบ + ใบเสนอราคา ────────────────────────────────────────────────────────────────────────
create or replace function public.dealer_settings_required() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
begin
  if req_blanked(old.issuer->>'company', new.issuer->>'company') then perform req_fail('ผู้ออกใบ · ชื่อบริษัท'); end if;
  if req_blanked(old.issuer->>'taxId', new.issuer->>'taxId')     then perform req_fail('ผู้ออกใบ · เลขผู้เสียภาษี'); end if;
  if req_blanked(old.issuer->>'phone', new.issuer->>'phone')     then perform req_fail('ผู้ออกใบ · โทรศัพท์'); end if;
  if req_blanked(old.issuer->>'address', new.issuer->>'address') then perform req_fail('ผู้ออกใบ · ที่อยู่'); end if;
  if req_blanked(old.document->>'vatPercent', new.document->>'vatPercent') then perform req_fail('ใบเสนอราคา · VAT %'); end if;
  if req_blanked(old.document->>'validityDays', new.document->>'validityDays') then perform req_fail('ใบเสนอราคา · อายุใบ (วัน)'); end if;
  return new;
end $$;
revoke all on function public.dealer_settings_required() from public, anon, authenticated, service_role;
drop trigger if exists dealer_settings_required on public.dealer_settings;
create trigger dealer_settings_required before update on public.dealer_settings
  for each row execute function public.dealer_settings_required();

-- ── ผู้รับผิดชอบ (ชื่อ) ───────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.responsible_persons_required() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
begin
  if req_blank(new.name) and (tg_op = 'INSERT' or not req_blank(old.name)) then perform req_fail('ชื่อ-นามสกุล'); end if;
  return new;
end $$;
revoke all on function public.responsible_persons_required() from public, anon, authenticated, service_role;
drop trigger if exists responsible_persons_required on public.responsible_persons;
create trigger responsible_persons_required before insert or update on public.responsible_persons
  for each row execute function public.responsible_persons_required();

-- ── โน้ตลูกค้า (หัวข้อ) ───────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.customer_notes_required() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
begin
  if req_blanked(old.title, new.title) then perform req_fail('หัวข้อโน้ต'); end if;
  return new;
end $$;
revoke all on function public.customer_notes_required() from public, anon, authenticated, service_role;
drop trigger if exists customer_notes_required on public.customer_notes;
create trigger customer_notes_required before update on public.customer_notes
  for each row execute function public.customer_notes_required();

-- ── ผู้สนใจเป็นดีลเลอร์ (เบอร์โทร) ── ชื่อมี CHECK dealer_prospects_name_check อยู่แล้ว ───────────────────────────────────
create or replace function public.dealer_prospects_required() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
begin
  if req_blank(new.phone) and (tg_op = 'INSERT' or not req_blank(old.phone)) then perform req_fail('เบอร์โทร'); end if;
  return new;
end $$;
revoke all on function public.dealer_prospects_required() from public, anon, authenticated, service_role;
drop trigger if exists dealer_prospects_required on public.dealer_prospects;
create trigger dealer_prospects_required before insert or update on public.dealer_prospects
  for each row execute function public.dealer_prospects_required();
