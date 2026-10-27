-- ── ใบ 0247: ดีลเลอร์ส่ง/พิมพ์ใบเสนอราคาให้ลูกค้าไม่ได้จนกว่ากรอกข้อมูลบริษัทครบ (บอสสั่ง · เรื่อง 4 คิว ef 26 ต.ค. 69) ──
-- ครบ = ชื่อบริษัท · ที่อยู่ · เลขผู้เสียภาษี (dealer_settings.issuer · company / address / taxId) ไม่ว่าง
--   1) ส่ง: ตัวดักบนตาราง quotations — ทุกทางที่ผู้ใช้เปลี่ยนใบเป็น "ส่งให้ลูกค้าแล้ว" (quotation_send · เปลี่ยนสถานะตรง ·
--      set_quotation_status_reconciled · insert) ถูกปฏิเสธ ไม่ใช่แค่ปิดปุ่มบนหน้าเว็บ · ใบที่ส่งแล้วก่อนหน้า/ส่งซ้ำไม่กระทบ
--      ใบร่างสร้าง/แก้ได้ตามปกติ · ใช้กับผู้ใช้ที่เข้าระบบ (authenticated) — งานระบบ/ข้อมูลตั้งต้นของชุดทดสอบ (service_role/postgres) ไม่ผ่านกติกานี้
--   2) พิมพ์: พิมพ์ทำในเบราว์เซอร์ → ปุ่มพิมพ์ต้องขอข้อมูลพิมพ์จาก quotation_print_data ก่อน (บอสตัดสิน 26 ต.ค. 69)
--      ฐานตรวจข้อมูลบริษัทที่จะขึ้นหัวกระดาษว่าครบ · คืนข้อมูลบริษัทที่ใช้พิมพ์ · จดเวลาพิมพ์ลง quotation_prints
--      หัวกระดาษ = ข้อมูลบริษัทที่ตรึงไว้กับใบ (ถ้าครบ · ใบเก่าคงชื่อเดิม) ไม่งั้นใช้ข้อมูลบริษัทปัจจุบันของสาขา
-- ข้อทดสอบ: supabase/tests/issuer_required.sql · tests/scenario/issuer-required.spec.ts

/** ข้อมูลบริษัทครบ = ชื่อบริษัท ที่อยู่ เลขผู้เสียภาษี ไม่ว่าง (ช่องว่างล้วนนับว่าว่าง) */
create or replace function public._issuer_complete(p jsonb) returns boolean
  language sql immutable set search_path to 'public' as $$
  select coalesce(btrim(p ->> 'company'), '') <> '' and coalesce(btrim(p ->> 'address'), '') <> '' and coalesce(btrim(p ->> 'taxId'), '') <> ''
$$;
revoke all on function public._issuer_complete(jsonb) from public, anon, authenticated, service_role;

/** ช่องที่ยังขาด (ชื่อภาษาไทย คั่นด้วย " · ") — ใช้ในข้อความปฏิเสธ ให้ผู้ใช้รู้ว่าต้องกรอกอะไร */
create or replace function public._issuer_missing(p jsonb) returns text
  language sql immutable set search_path to 'public' as $$
  select concat_ws(' · ',
    case when coalesce(btrim(p ->> 'company'), '') = '' then 'ชื่อบริษัท' end,
    case when coalesce(btrim(p ->> 'address'), '') = '' then 'ที่อยู่' end,
    case when coalesce(btrim(p ->> 'taxId'), '') = '' then 'เลขผู้เสียภาษี' end)
$$;
revoke all on function public._issuer_missing(jsonb) from public, anon, authenticated, service_role;

/** ข้อมูลบริษัทปัจจุบันของสาขา (ไม่มีแถวตั้งค่า = {}) */
create or replace function public._dealer_issuer(p_dealer text) returns jsonb
  language sql stable security definer set search_path to 'public' as $$
  select coalesce((select issuer from dealer_settings where dealer_code = p_dealer), '{}'::jsonb)
$$;
revoke all on function public._dealer_issuer(text) from public, anon, authenticated, service_role;

-- ── 1) ส่ง: กันที่ตาราง ──
create or replace function public.quotations_issuer_required() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
declare ข้อมูล jsonb;
begin
  if coalesce(auth.role(), '') <> 'authenticated' then return new; end if;   -- งานระบบ/ข้อมูลตั้งต้น
  if new.dealer_code = 'HQ' or new.status::text <> 'sent_to_client' then return new; end if;
  if tg_op = 'UPDATE' and old.status::text = 'sent_to_client' then return new; end if;   -- ส่งซ้ำ/แก้ใบที่ส่งแล้ว ไม่ใช่การส่งครั้งใหม่
  ข้อมูล := _dealer_issuer(new.dealer_code);
  if not _issuer_complete(ข้อมูล) then
    raise exception 'issuer_incomplete: กรอกข้อมูลบริษัทให้ครบก่อนส่งใบเสนอราคาให้ลูกค้า (ยังขาด: %)', _issuer_missing(ข้อมูล)
      using hint = 'ตั้งค่า › ข้อมูลบริษัท';
  end if;
  return new;
end $$;
revoke all on function public.quotations_issuer_required() from public, anon, authenticated, service_role;

drop trigger if exists quotations_issuer_required on public.quotations;
create trigger quotations_issuer_required before insert or update of status on public.quotations
  for each row execute function public.quotations_issuer_required();

-- ── 2) พิมพ์: ขอข้อมูลพิมพ์จากฐาน + จดเวลาพิมพ์ ──
create table if not exists public.quotation_prints (
  id          bigint generated always as identity primary key,
  dealer_code text not null,
  quote_id    text not null,
  printed_at  timestamptz not null default now(),
  printed_by  uuid default auth.uid()
);
create index if not exists quotation_prints_quote on public.quotation_prints (dealer_code, quote_id, printed_at desc);
alter table public.quotation_prints enable row level security;
-- ผู้ใช้เขียน/อ่านผ่าน quotation_print_data เท่านั้น (ไม่มีนโยบาย · ไม่มีสิทธิ์ตรง) · งานระบบ (service_role) อ่าน/ลบได้ — เก็บกวาดสาขาทดสอบ
revoke all on table public.quotation_prints from public, anon, authenticated, service_role;
grant select, delete on table public.quotation_prints to service_role;

create or replace function public.quotation_print_data(p_dealer text, p_id text) returns jsonb
  language plpgsql volatile security definer set search_path to 'public' as $$
declare
  ใบ quotations;
  ข้อมูล jsonb;
  เวลา timestamptz := now();
begin
  if not (is_hq() or (coalesce(auth_dealer(), '') <> '' and auth_dealer() = p_dealer)) then
    raise exception 'forbidden: ไม่มีสิทธิ์พิมพ์ใบเสนอราคาของสาขา %', p_dealer;
  end if;
  select * into ใบ from quotations where dealer_code = p_dealer and id = p_id;
  if not found then raise exception 'quote_not_found: ไม่พบใบเสนอราคา % ของสาขา %', p_id, p_dealer; end if;
  -- หัวกระดาษ: ข้อมูลที่ตรึงไว้กับใบ (ครบ) → ไม่งั้นข้อมูลปัจจุบันของสาขา
  ข้อมูล := case when _issuer_complete(coalesce(ใบ.issuer, '{}'::jsonb)) then ใบ.issuer else _dealer_issuer(p_dealer) end;
  if not _issuer_complete(ข้อมูล) then
    raise exception 'issuer_incomplete: กรอกข้อมูลบริษัทให้ครบก่อนพิมพ์ใบเสนอราคา (ยังขาด: %)', _issuer_missing(ข้อมูล)
      using hint = 'ตั้งค่า › ข้อมูลบริษัท';
  end if;
  insert into quotation_prints (dealer_code, quote_id, printed_at) values (p_dealer, p_id, เวลา);
  return jsonb_build_object(
    'issuer', jsonb_build_object('company', btrim(ข้อมูล ->> 'company'), 'address', btrim(ข้อมูล ->> 'address'),
                                 'phone', coalesce(ข้อมูล ->> 'phone', ''), 'taxId', btrim(ข้อมูล ->> 'taxId')),
    'printedAt', เวลา);
end $$;
revoke all on function public.quotation_print_data(text, text) from public, anon, authenticated, service_role;
grant execute on function public.quotation_print_data(text, text) to authenticated;
