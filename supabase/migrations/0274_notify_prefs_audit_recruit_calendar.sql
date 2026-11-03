-- ── ใบ 0274: ตั้งค่าแจ้งเตือนรายเรื่อง · อีเมลผู้รับของดีลเลอร์ · บันทึกการใช้งานเฉพาะ HQ · หาดีลเลอร์ · นัดจากปฏิทิน ──
--    · ป้ายร่างล่าสุดของกล่องคำขอราคา HQ (บอสสั่ง 3 พ.ย. 69 · รวมใบเดียว ขึ้นฐานครั้งเดียว)
--
-- A) แจ้งเตือน (ทับกติกา FLOW เดิม "ไม่มีสวิตช์เปิด/ปิดรายหมวด"):
--    • notification_kinds.locked = เรื่องจำเป็น ปิดไม่ได้ (HQ: request_new · requests_overdue / ดีลเลอร์: hq_quote_sent · won_reverted · lead_from_hq)
--    • notification_kinds.goes_to = "กดแล้วไปไหน" ตามตาราง FLOW
--    • notification_prefs = กระดิ่ง/อีเมล เปิดปิดรายเรื่อง ต่อฝั่ง (HQ ชุดเดียว · ดีลเลอร์รายสาขา) · ไม่มีแถว = เปิด
--      เขียนได้ทาง notification_prefs_set ทางเดียว (ลงบันทึกการใช้งาน) · ตัวดักกันปิดเรื่องจำเป็นแม้เขียนตรงที่ฐาน
--    • _notify (ตัวกลางตัวเดียว ใบ 0231) อ่านค่านี้: กระดิ่งปิด = ไม่มีแจ้งเตือนในกระดิ่ง · อีเมลปิด = ไม่วางจดหมาย
--    • dealer_notify_recipients = รายชื่ออีเมลรับแจ้งเตือนของสาขา (แทนอีเมลติดต่อบัญชีเดียว ใบ 0194)
--      ยกอีเมลติดต่อที่ยืนยันแล้วมาเป็นรายการแรก (ไม่ต้องยืนยันซ้ำ) · เพิ่มเองได้อีก 5 · ต้องยืนยันด้วยโค้ดก่อนรับ
--      ห้ามอีเมลเข้าระบบของดีลเลอร์ (@dealer.benjaminpebsteel.com) · _dealer_notify_emails อ่านจากรายการนี้ (ยืนยันแล้วเท่านั้น)
-- B) บันทึกการใช้งาน: มุมมอง audit_log_hq = เฉพาะแถวที่คนของ HQ ทำ (บทบาท HQ_* / SUPER_ADMIN) · ไม่ลบอะไร
--    หน้า /hq/audit + กล่องกิจกรรมล่าสุดของแดชบอร์ด HQ อ่านจากมุมมองนี้ · แผงดีลเลอร์ › กิจกรรม คงเดิม (แถวของสาขานั้น)
-- C) หาดีลเลอร์: เหตุผลที่ไม่สำเร็จตั้งต้น (เติมเมื่อรายการว่างเท่านั้น) · อายุใบค่าแฟรนไชส์ตั้งต้น 7 วัน (เติมเมื่อยังไม่ได้ตั้ง)
--    ปฏิเสธ/หมดอายุต้องมีเหตุผล — ฐานกันอยู่แล้ว (ใบ 0207 dealer_package_proposals_before_write)
-- D) นัดหมาย: appointments.customer_id · ต้องผูกลีดหรือลูกค้าของสาขาเดียวกัน (ฐานกัน) · ไม่ผูกลีดล่าสุดให้เอง
-- E) hq_quote_board: draft_updated_at = วันแก้ร่างใบ HQ ล่าสุด (ร่างเท่านั้น · ไม่มี = null → หน้าจอ "—")
--
-- ข้อทดสอบ: supabase/tests/notify_prefs.sql · supabase/tests/audit_hq_only.sql · supabase/tests/appointment_links.sql
--           supabase/tests/recruit_defaults.sql · supabase/tests/hq_quote_board.sql (ร่างล่าสุด)

-- ═══ A1 · เรื่องจำเป็น + กดแล้วไปไหน ═══════════════════════════════════════════════════════════════
alter table public.notification_kinds add column if not exists locked boolean not null default false;
alter table public.notification_kinds add column if not exists goes_to text not null default '';
comment on column public.notification_kinds.locked is 'เรื่องจำเป็น — ปิดกระดิ่ง/อีเมลไม่ได้ (ใบ 0274)';
comment on column public.notification_kinds.goes_to is 'กดแล้วไปไหน (ข้อความตามตาราง FLOW · ใบ 0274)';

update public.notification_kinds k set locked = v.locked, goes_to = v.goes_to
  from (values
    ('hq_quote_sent',             true,  'แผงลีดนั้น'),
    ('hq_quote_expiring',         false, 'แผงลีดนั้น'),
    ('hq_quote_expired',          false, 'แผงลีดนั้น'),
    ('quote_expiring',            false, 'ใบเสนอราคานั้น'),
    ('appointment_due',           false, 'นัดนั้นในปฏิทิน'),
    ('lead_from_hq',              true,  'แผงลีดนั้น'),
    ('won_reverted',              true,  'แผงลีดนั้น'),
    ('request_new',               true,  'ใบ HQ ของคำขอนั้น'),
    ('request_reprice',           false, 'ใบ HQ ของคำขอนั้น'),
    ('requests_overdue',          true,  'กล่องงาน "ต้องตีราคา" (เกินกำหนดอยู่บนสุด)'),
    ('customer_accepted',         false, 'ใบ HQ ของคำขอนั้น (สั่งผลิต)'),
    ('franchise_payment_overdue', false, 'ใบค่าแฟรนไชส์นั้น'),
    ('request_cancelled',         false, 'คำขอนั้นในกล่องงาน (กลุ่ม ปิด/ยกเลิก)'),
    ('prospect_followup_due',     false, 'แผงผู้สนใจนั้น'),
    ('prospect_idle',             false, 'แผงผู้สนใจนั้น'),
    ('proposal_awaiting',         false, 'ใบค่าแฟรนไชส์นั้น'),
    ('proposal_expired',          false, 'ใบค่าแฟรนไชส์นั้น')
  ) as v(kind, locked, goes_to)
 where k.kind = v.kind;

do $$
begin
  if exists (select 1 from notification_kinds where goes_to = '') then
    raise exception 'notification_kinds: มีเรื่องที่ยังไม่ได้ระบุ "กดแล้วไปไหน" — เพิ่มในใบ 0274';
  end if;
end $$;

-- ═══ A2 · ค่าตั้งรายเรื่อง ═════════════════════════════════════════════════════════════════════════
create table public.notification_prefs (
  audience    text not null check (audience in ('dealer', 'hq')),
  dealer_code text not null default '',                               -- HQ = '' · ดีลเลอร์ = รหัสสาขา
  kind        text not null,
  bell        boolean not null default true,
  email       boolean not null default true,
  updated_at  timestamptz not null default now(),
  updated_by  text not null default '',
  primary key (audience, dealer_code, kind),
  foreign key (kind, audience) references public.notification_kinds (kind, audience) on delete cascade,
  constraint notification_prefs_owner check ((audience = 'hq') = (dealer_code = ''))
);
comment on table public.notification_prefs is 'เปิด/ปิดกระดิ่ง·อีเมล รายเรื่อง (ใบ 0274) — ไม่มีแถว = เปิด · เขียนทาง notification_prefs_set เท่านั้น · เรื่องจำเป็นปิดไม่ได้';

/** กันปิดเรื่องจำเป็น — ทุกทาง (คำสั่งของหน้าเว็บ · เขียนตรงที่ฐาน) */
create or replace function public.notification_prefs_guard() returns trigger
  language plpgsql set search_path to 'public' as $$
begin
  if (select locked from notification_kinds where kind = new.kind) and not (new.bell and new.email) then
    raise exception 'notify_locked: เรื่อง % เป็นเรื่องจำเป็น ปิดไม่ได้', new.kind;
  end if;
  if new.audience = 'dealer' and not exists (select 1 from dealers where code = new.dealer_code) then
    raise exception 'notify_owner: ไม่พบสาขา %', new.dealer_code;
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke all on function public.notification_prefs_guard() from public, anon, authenticated, service_role;
create trigger notification_prefs_guard before insert or update on public.notification_prefs
  for each row execute function public.notification_prefs_guard();

alter table public.notification_prefs enable row level security;
revoke all on table public.notification_prefs from public, anon, authenticated, service_role;
grant select on table public.notification_prefs to authenticated;
grant all on table public.notification_prefs to service_role;
create policy notification_prefs_read on public.notification_prefs for select to authenticated
  using ((audience = 'hq' and is_hq()) or (audience = 'dealer' and not is_hq() and dealer_code = auth_dealer()));

-- ลบสาขา = ค่าตั้งแจ้งเตือนของสาขาหายตาม (ผูก FK ไม่ได้ เพราะแถวของ HQ ใช้รหัสว่าง)
create or replace function public.dealers_delete_notify_prefs() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
begin
  delete from notification_prefs where audience = 'dealer' and dealer_code = old.code;
  return old;
end $$;
revoke all on function public.dealers_delete_notify_prefs() from public, anon, authenticated, service_role;
create trigger dealers_delete_notify_prefs after delete on public.dealers
  for each row execute function public.dealers_delete_notify_prefs();

/** ฝั่งของผู้เรียก: HQ = ('hq','') · ดีลเลอร์ = ('dealer', สาขา) */
create or replace function public._notify_owner() returns table (audience text, dealer_code text)
  language sql stable security definer set search_path to 'public' as $$
  select case when is_hq() then 'hq' else 'dealer' end, case when is_hq() then '' else coalesce(auth_dealer(), '') end
$$;
revoke all on function public._notify_owner() from public, anon, authenticated, service_role;

/** ตารางเรื่องแจ้งเตือนของฝั่งผู้เรียก พร้อมค่าที่ตั้งไว้ — หน้าตั้งค่าอ่านจากที่นี่ (เรียงตาม FLOW) */
create or replace function public.notification_prefs_get() returns jsonb
  language plpgsql stable security definer set search_path to 'public' as $$
declare o record;
begin
  if auth.uid() is null then raise exception 'forbidden'; end if;
  select * into o from _notify_owner();
  if o.audience = 'dealer' and o.dealer_code = '' then raise exception 'forbidden: บัญชีนี้ไม่ได้สังกัดสาขา'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'kind', k.kind, 'flowRow', k.flow_row, 'title', k.title, 'goesTo', k.goes_to, 'locked', k.locked,
             'bellAvailable', k.bell, 'emailAvailable', k.email,
             'bell',  k.bell  and (k.locked or coalesce(p.bell, true)),
             'email', k.email and (k.locked or coalesce(p.email, true)))
           order by k.sort)
      from notification_kinds k
      left join notification_prefs p on p.audience = k.audience and p.dealer_code = o.dealer_code and p.kind = k.kind
     where k.audience = o.audience), '[]'::jsonb);
end $$;
revoke all on function public.notification_prefs_get() from public, anon, authenticated, service_role;
grant execute on function public.notification_prefs_get() to authenticated;

/** เปิด/ปิดกระดิ่ง·อีเมลของเรื่องหนึ่ง — HQ: ผู้ดูแล/ผู้บริหาร · ดีลเลอร์: ผู้ดูแลสาขา ตั้งได้เฉพาะสาขาตัวเอง */
create or replace function public.notification_prefs_set(p_kind text, p_bell boolean, p_email boolean) returns jsonb
  language plpgsql security definer set search_path to 'public' as $$
declare o record; k notification_kinds; ป้าย text;
begin
  select * into o from _notify_owner();
  if o.audience = 'hq' then
    if not can_write_master() then raise exception 'forbidden: ตั้งค่าแจ้งเตือนของ HQ ได้เฉพาะผู้ดูแลระบบ/ผู้บริหาร'; end if;
  elsif not (auth_role() = 'DEALER_ADMIN' and is_account_active() and o.dealer_code <> '') then
    raise exception 'forbidden: ตั้งค่าแจ้งเตือนได้เฉพาะผู้ดูแลสาขา';
  end if;
  select * into k from notification_kinds where kind = p_kind and audience = o.audience;
  if not found then raise exception 'notify_kind: เรื่อง "%" ไม่ใช่แจ้งเตือนของฝั่งนี้', p_kind; end if;
  if p_bell is null or p_email is null then raise exception 'notify_value: ต้องระบุเปิด/ปิดทั้งกระดิ่งและอีเมล'; end if;
  if k.locked and not (p_bell and p_email) then raise exception 'notify_locked: "%" เป็นเรื่องจำเป็น ปิดไม่ได้', k.title; end if;

  insert into notification_prefs (audience, dealer_code, kind, bell, email, updated_by)
  values (o.audience, o.dealer_code, p_kind, p_bell, p_email, audit_actor_name())
  on conflict (audience, dealer_code, kind) do update set bell = excluded.bell, email = excluded.email, updated_by = excluded.updated_by;

  ป้าย := k.title || ' · กระดิ่ง ' || case when not k.bell then '—' when p_bell then 'เปิด' else 'ปิด' end
       || ' · อีเมล ' || case when not k.email then '—' when p_email then 'เปิด' else 'ปิด' end
       || case when o.audience = 'dealer' then ' · ' || o.dealer_code else '' end;
  perform _audit_hq('ตั้งค่าแจ้งเตือน', ป้าย);
  return notification_prefs_get();
end $$;
revoke all on function public.notification_prefs_set(text, boolean, boolean) from public, anon, authenticated, service_role;
grant execute on function public.notification_prefs_set(text, boolean, boolean) to authenticated;

-- ═══ A3 · อีเมลผู้รับแจ้งเตือนของดีลเลอร์ (รายการ) ════════════════════════════════════════════════════
create table public.dealer_notify_recipients (
  id          bigint generated always as identity primary key,
  dealer_code text not null references public.dealers (code) on delete cascade,
  email       text not null,
  is_contact  boolean not null default false,           -- อีเมลติดต่อของบัญชีผู้ดูแลสาขา (ยืนยันในหน้าบัญชี · ใบ 0194) ไม่นับในเพดาน 5
  verified_at timestamptz,                               -- ว่าง = รอยืนยัน → ไม่ได้รับแจ้งเตือน
  created_at  timestamptz not null default now(),
  created_by  text not null default '',
  unique (dealer_code, email),
  constraint dealer_notify_recipients_email_format check (email = lower(btrim(email)) and email ~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$'),
  constraint dealer_notify_recipients_not_login check (email !~ '@dealer\.benjaminpebsteel\.com$')
);
create index dealer_notify_recipients_dealer_idx on public.dealer_notify_recipients (dealer_code);
comment on table public.dealer_notify_recipients is 'อีเมลรับแจ้งเตือนของสาขา (ใบ 0274) — ยืนยันแล้วเท่านั้นที่ได้รับ · เพิ่มเองได้ 5 · ยืนยันได้ฝั่งเซิร์ฟเวอร์เท่านั้น';

/** ผู้ใช้ตั้ง "ยืนยันแล้ว" เองไม่ได้ (ทุกทาง) — ยืนยันได้ฝั่งเซิร์ฟเวอร์ (กรอกโค้ดถูก) หรือยกจากอีเมลติดต่อที่ยืนยันแล้ว */
create or replace function public.dealer_notify_recipients_guard() returns trigger
  language plpgsql set search_path to 'public' as $$
begin
  if auth.uid() is not null and coalesce(current_setting('pms.notify_recipient_sync', true), '') <> '1' then
    if tg_op = 'INSERT' then new.verified_at := null; new.is_contact := false;
    else new.verified_at := old.verified_at; new.is_contact := old.is_contact;
    end if;
  end if;
  if tg_op = 'UPDATE' then
    new.dealer_code := old.dealer_code;
    if new.email is distinct from old.email then new.verified_at := null; end if;   -- อีเมลเปลี่ยน = ต้องยืนยันใหม่
  end if;
  return new;
end $$;
revoke all on function public.dealer_notify_recipients_guard() from public, anon, authenticated, service_role;
create trigger dealer_notify_recipients_guard before insert or update on public.dealer_notify_recipients
  for each row execute function public.dealer_notify_recipients_guard();

alter table public.dealer_notify_recipients enable row level security;
revoke all on table public.dealer_notify_recipients from public, anon, authenticated, service_role;
grant select on table public.dealer_notify_recipients to authenticated;
grant all on table public.dealer_notify_recipients to service_role;
create policy dealer_notify_recipients_read on public.dealer_notify_recipients for select to authenticated
  using (is_hq() or dealer_code = auth_dealer());

-- โค้ดยืนยันของแต่ละรายการ (ฝั่งเซิร์ฟเวอร์เท่านั้น · เก็บแฮช)
create table public.dealer_notify_recipient_codes (
  recipient_id bigint primary key references public.dealer_notify_recipients (id) on delete cascade,
  code_hash    text not null,
  expires_at   timestamptz not null,
  attempts     integer not null default 0,
  sent_at      timestamptz not null default now()
);
comment on table public.dealer_notify_recipient_codes is 'โค้ดยืนยันอีเมลผู้รับแจ้งเตือน (ฉบับล่าสุดต่อรายการ) · ฝั่งเซิร์ฟเวอร์เท่านั้น';
alter table public.dealer_notify_recipient_codes enable row level security;
revoke all on table public.dealer_notify_recipient_codes from public, anon, authenticated, service_role;
grant all on table public.dealer_notify_recipient_codes to service_role;

-- ยกอีเมลติดต่อที่ยืนยันแล้ว (ใบ 0194) มาเป็นรายการแรก — ไม่ต้องยืนยันซ้ำ
insert into public.dealer_notify_recipients (dealer_code, email, is_contact, verified_at, created_by)
select distinct on (p.dealer_code, lower(btrim(p.contact_email)))
       p.dealer_code, lower(btrim(p.contact_email)), true, p.contact_email_verified_at, 'ยกจากอีเมลติดต่อ (ใบ 0274)'
  from public.profiles p
  join public.dealers d on d.code = p.dealer_code
 where p.role = 'DEALER_ADMIN' and p.status = 'active' and p.contact_email_verified_at is not null
   and lower(btrim(coalesce(p.contact_email, ''))) ~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$'
   and lower(btrim(p.contact_email)) !~ '@dealer\.benjaminpebsteel\.com$'
 order by p.dealer_code, lower(btrim(p.contact_email)), p.contact_email_verified_at
on conflict (dealer_code, email) do nothing;

/** อีเมลติดต่อในหน้าบัญชี (ใบ 0194) ยืนยันแล้ว = อยู่ในรายการ · เปลี่ยน/ล้างการยืนยัน = เอาแถวอีเมลติดต่อเดิมออก
 *  (HQ ยืนยันแทน ก็ผ่านทางนี้) — รายการคือที่เดียวที่ตัววางจดหมายอ่าน */
create or replace function public.profiles_contact_email_to_recipients() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
declare เดิม text := ''; ใหม่ text := lower(btrim(coalesce(new.contact_email, ''))); เดิมยืนยัน timestamptz;
begin
  if new.role <> 'DEALER_ADMIN' or coalesce(new.dealer_code, '') = '' then return new; end if;
  if tg_op = 'UPDATE' then เดิม := lower(btrim(coalesce(old.contact_email, ''))); เดิมยืนยัน := old.contact_email_verified_at; end if;
  perform set_config('pms.notify_recipient_sync', '1', true);
  if เดิมยืนยัน is not null and (เดิม <> ใหม่ or new.contact_email_verified_at is null) then
    delete from dealer_notify_recipients where dealer_code = new.dealer_code and email = เดิม and is_contact;
  end if;
  if new.contact_email_verified_at is not null and (เดิมยืนยัน is null or เดิม <> ใหม่)
     and ใหม่ ~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$' and ใหม่ !~ '@dealer\.benjaminpebsteel\.com$'
     and exists (select 1 from dealers where code = new.dealer_code) then
    insert into dealer_notify_recipients (dealer_code, email, is_contact, verified_at, created_by)
    values (new.dealer_code, ใหม่, true, new.contact_email_verified_at, 'อีเมลติดต่อของบัญชี')
    on conflict (dealer_code, email) do update set verified_at = coalesce(dealer_notify_recipients.verified_at, excluded.verified_at);
  end if;
  perform set_config('pms.notify_recipient_sync', '', true);
  return new;
end $$;
revoke all on function public.profiles_contact_email_to_recipients() from public, anon, authenticated, service_role;
create trigger profiles_contact_email_to_recipients after insert or update of contact_email, contact_email_verified_at on public.profiles
  for each row execute function public.profiles_contact_email_to_recipients();

/** ผู้รับแจ้งเตือนของสาขา = รายการที่ยืนยันแล้ว (แทนอีเมลติดต่อบัญชีเดียว ใบ 0194) — ว่าง = ไม่ส่ง */
create or replace function public._dealer_notify_emails(p_dealer text) returns text[]
  language sql stable security definer set search_path to 'public' as $$
  select coalesce(array_agg(r.email order by r.email), '{}')
    from dealer_notify_recipients r
   where r.dealer_code = p_dealer and r.verified_at is not null
$$;
revoke all on function public._dealer_notify_emails(text) from public, anon, authenticated, service_role;

/** รายการของสาขาผู้เรียก (ดีลเลอร์) หรือของสาขาที่ระบุ (HQ · แผงดีลเลอร์) */
create or replace function public.dealer_notify_recipients_list(p_dealer text default null) returns jsonb
  language plpgsql stable security definer set search_path to 'public' as $$
declare สาขา text := case when is_hq() then p_dealer else auth_dealer() end;
begin
  if auth.uid() is null then raise exception 'forbidden'; end if;
  if coalesce(สาขา, '') = '' then raise exception 'forbidden: ไม่ได้ระบุสาขา'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'email', email, 'verified', verified_at is not null,
                                                     'verifiedAt', verified_at, 'isContact', is_contact, 'createdAt', created_at)
                                  order by is_contact desc, created_at, id)
                     from dealer_notify_recipients where dealer_code = สาขา), '[]'::jsonb);
end $$;
revoke all on function public.dealer_notify_recipients_list(text) from public, anon, authenticated, service_role;
grant execute on function public.dealer_notify_recipients_list(text) to authenticated;

create or replace function public.dealer_notify_recipient_add(p_email text) returns jsonb
  language plpgsql security definer set search_path to 'public' as $$
declare e text := lower(btrim(coalesce(p_email, ''))); สาขา text := auth_dealer(); r dealer_notify_recipients;
begin
  if is_hq() or not (auth_role() = 'DEALER_ADMIN' and is_account_active()) or coalesce(สาขา, '') = '' then
    raise exception 'forbidden: เพิ่มอีเมลรับแจ้งเตือนได้เฉพาะผู้ดูแลสาขา';
  end if;
  if e !~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$' then raise exception 'notify_email_format: "%" ไม่ใช่รูปแบบอีเมล', e; end if;
  if e ~ '@dealer\.benjaminpebsteel\.com$' then
    raise exception 'notify_email_login: อีเมลเข้าระบบของดีลเลอร์ไม่มีกล่องจดหมายจริง — ใช้อีเมลที่ติดต่อได้จริง';
  end if;
  if exists (select 1 from dealer_notify_recipients where dealer_code = สาขา and email = e) then
    raise exception 'notify_email_dup: % อยู่ในรายชื่อแล้ว', e;
  end if;
  perform 1 from dealers where code = สาขา for update;   -- กันเพิ่มพร้อมกันทะลุเพดาน
  if (select count(*) from dealer_notify_recipients where dealer_code = สาขา and not is_contact) >= 5 then
    raise exception 'notify_email_limit: เพิ่มอีเมลได้ไม่เกิน 5 รายการ';
  end if;
  insert into dealer_notify_recipients (dealer_code, email, created_by) values (สาขา, e, audit_actor_name()) returning * into r;
  perform _audit_hq('เพิ่มอีเมลรับแจ้งเตือน', สาขา || ' · ' || e);
  return jsonb_build_object('id', r.id, 'email', r.email, 'verified', false, 'verifiedAt', null, 'isContact', false, 'createdAt', r.created_at);
end $$;
revoke all on function public.dealer_notify_recipient_add(text) from public, anon, authenticated, service_role;
grant execute on function public.dealer_notify_recipient_add(text) to authenticated;

create or replace function public.dealer_notify_recipient_remove(p_id bigint) returns void
  language plpgsql security definer set search_path to 'public' as $$
declare สาขา text := auth_dealer(); e text;
begin
  if is_hq() or not (auth_role() = 'DEALER_ADMIN' and is_account_active()) or coalesce(สาขา, '') = '' then
    raise exception 'forbidden: ลบอีเมลรับแจ้งเตือนได้เฉพาะผู้ดูแลสาขา';
  end if;
  delete from dealer_notify_recipients where id = p_id and dealer_code = สาขา returning email into e;
  if e is null then raise exception 'not_found: ไม่พบอีเมลนี้ในรายชื่อของสาขา'; end if;
  perform _audit_hq('ลบอีเมลรับแจ้งเตือน', สาขา || ' · ' || e);
end $$;
revoke all on function public.dealer_notify_recipient_remove(bigint) from public, anon, authenticated, service_role;
grant execute on function public.dealer_notify_recipient_remove(bigint) to authenticated;

-- ═══ A4 · ตัวกลางตัวเดียว (จาก 0231) อ่านค่าตั้งรายเรื่อง ═══════════════════════════════════════════════
/** สร้างแจ้งเตือนหนึ่งเรื่อง — คืน true ถ้าสร้างใหม่ (กระดิ่ง หรือจดหมาย) · false = เคยแจ้งแล้ว / คนทำเป็นผู้รับเอง / ผู้รับปิดไว้
 *  ค่าตั้งรายเรื่อง (ใบ 0274): กระดิ่งปิด = ไม่สร้างแถวกระดิ่ง · อีเมลปิด = ไม่วางจดหมาย · เรื่องจำเป็นไม่ดูค่าตั้ง
 *  กันซ้ำ: มีกระดิ่ง = กุญแจของแถวกระดิ่ง · กระดิ่งปิด = กุญแจของจดหมายแต่ละฉบับ (เรื่อง × ผู้รับ) */
create or replace function public._notify(
  p_kind text, p_dealer text, p_once text, p_vars jsonb,
  p_ref_table text default '', p_ref_id text default '', p_detail text default ''
) returns boolean language plpgsql security definer set search_path to 'public' as $$
declare k notification_kinds; v_title text; v_body text; v_key text; v_subject text; n integer := 0;
        ตั้ง notification_prefs; กระดิ่ง boolean; อีเมล boolean;
begin
  select * into k from notification_kinds where kind = p_kind;
  if not found then raise exception 'notify_unknown_kind: ชนิดแจ้งเตือน "%" ไม่อยู่ในตารางกลาง', p_kind; end if;
  if (k.audience = 'dealer') <> (coalesce(p_dealer, '') <> '') then
    raise exception 'notify_recipient: ชนิด % ต้อง%ระบุดีลเลอร์', p_kind, case when k.audience = 'dealer' then '' else 'ไม่' end;
  end if;
  -- สิ่งที่ผู้ใช้ทำเอง ไม่แจ้งตัวเอง
  if k.audience = 'hq' and is_hq() then return false; end if;
  if k.audience = 'dealer' and not is_hq() and auth_dealer() = p_dealer then return false; end if;

  select * into ตั้ง from notification_prefs
   where audience = k.audience and dealer_code = coalesce(nullif(p_dealer, ''), '') and kind = p_kind;
  กระดิ่ง := k.bell  and (k.locked or coalesce(ตั้ง.bell, true));
  อีเมล   := k.email and (k.locked or coalesce(ตั้ง.email, true));
  if not กระดิ่ง and not อีเมล then return false; end if;

  v_title := _notify_render(k.title, p_vars);
  v_body  := _notify_render(k.body, p_vars);
  v_key   := p_kind || ':' || p_once;
  if กระดิ่ง then
    insert into notifications (kind, audience, dealer_code, title, body, href, dedupe_key)
    values (p_kind, k.audience, nullif(p_dealer, ''), v_title, v_body, _notify_render(k.href, p_vars), v_key)
    on conflict (dedupe_key) do nothing;
    get diagnostics n = row_count;
    if n = 0 then return false; end if;
  end if;

  if อีเมล then
    -- หัวเรื่องอีเมล = ชื่อเรื่อง + ข้อความ (ตัดยาว) → อ่านจากกล่องจดหมายแล้วรู้ว่าเรื่องไหน
    v_subject := v_title || ' — ' || left(v_body, 120);
    v_body := v_body || case when p_detail <> '' then E'\n\n' || p_detail else '' end;
    if k.audience = 'hq' then
      n := n + _email_enqueue_hq(v_key, v_subject, v_body, p_ref_table, p_ref_id);
    else
      n := n + _email_enqueue_dealer(p_dealer, v_key, v_subject, v_body, p_ref_table, p_ref_id);
    end if;
  end if;
  return n > 0;
end $$;
revoke all on function public._notify(text, text, text, jsonb, text, text, text) from public, anon, authenticated, service_role;

-- ═══ B · บันทึกการใช้งานเฉพาะที่ HQ ทำ ════════════════════════════════════════════════════════════
--   บทบาทของ HQ = HQ_* / SUPER_ADMIN (กติกาเดียวกับ is_hq) · ดีลเลอร์ (DEALER_*/DEALER) และงานเบื้องหลังของระบบ (บทบาทว่าง) ไม่แสดง
--   ไม่ลบแถวใด — แผงดีลเลอร์ › กิจกรรม (hq_dealer_panel) ยังอ่านตาราง audit_log ตามสาขาเหมือนเดิม
create or replace function public.audit_role_is_hq(p_role text) returns boolean
  language sql immutable set search_path to 'public' as $$ select coalesce(p_role, '') like 'HQ\_%' or coalesce(p_role, '') = 'SUPER_ADMIN' $$;
revoke all on function public.audit_role_is_hq(text) from public, anon, authenticated, service_role;
grant execute on function public.audit_role_is_hq(text) to authenticated, service_role;

create view public.audit_log_hq with (security_invoker = true) as
  select * from public.audit_log a where public.audit_role_is_hq(a.role);
comment on view public.audit_log_hq is 'บันทึกการใช้งานที่คนของ HQ ทำ (ใบ 0274) — หน้า /hq/audit + กิจกรรมล่าสุดของแดชบอร์ด HQ อ่านจากที่นี่ · กฎรายแถวของ audit_log ใช้ตาม';
revoke all on table public.audit_log_hq from public, anon, authenticated, service_role;
grant select on table public.audit_log_hq to authenticated, service_role;

-- ═══ C · หาดีลเลอร์: ค่าตั้งต้น (เติมเฉพาะที่ยังว่าง) ══════════════════════════════════════════════════
--   เหตุผลที่ไม่สำเร็จ: เงินทุนไม่พอ · ยังไม่พร้อม · เลือกแบรนด์อื่น · ทำเลไม่เหมาะ (+ "อื่น ๆ (ระบุเอง)" ที่ฟอร์มต่อท้ายให้เสมอ)
--   เติมครั้งเดียวในใบนี้ · ภายหลัง HQ ลบจนว่างเอง = ว่างตามที่ตั้ง (ไม่เติมกลับ)
create or replace function public._recruit_fill_defaults() returns void
  language plpgsql set search_path to 'public' as $$
begin
  insert into hq_recruit_settings (id, config) values (1, '{}'::jsonb) on conflict (id) do nothing;
  update hq_recruit_settings
     set config = jsonb_set(config, '{lostReasons}', '["เงินทุนไม่พอ", "ยังไม่พร้อม", "เลือกแบรนด์อื่น", "ทำเลไม่เหมาะ"]'::jsonb, true),
         updated_at = now()
   where id = 1 and coalesce(jsonb_array_length(case when jsonb_typeof(config -> 'lostReasons') = 'array' then config -> 'lostReasons' end), 0) = 0;
  update hq_recruit_settings
     set config = jsonb_set(case when jsonb_typeof(config -> 'proposal') = 'object' then config else jsonb_set(config, '{proposal}', '{}'::jsonb, true) end,
                            '{proposal,validityDays}', '7'::jsonb, true),
         updated_at = now()
   where id = 1 and coalesce(jsonb_typeof(config #> '{proposal,validityDays}'), 'null') <> 'number';
end $$;
revoke all on function public._recruit_fill_defaults() from public, anon, authenticated, service_role;
select public._recruit_fill_defaults();

-- ═══ D · นัดหมายผูกลีดหรือลูกค้าของสาขาเดียวกัน ══════════════════════════════════════════════════════
alter table public.appointments add column if not exists customer_id bigint;
alter table public.appointments add column if not exists location text not null default '';
comment on column public.appointments.location is 'สถานที่นัด (ใบ 0274 · ฟอร์มนัดจากปฏิทิน) — ว่าง = ไม่ระบุ';
comment on column public.appointments.customer_id is 'ลูกค้าของสาขาเดียวกัน (ใบ 0274 · นัดจากปฏิทิน) — นัดต้องมีลีดหรือลูกค้า · ไม่ผูกลีดล่าสุดให้เอง';

create or replace function public.appointments_link_guard() returns trigger
  language plpgsql set search_path to 'public' as $$
begin
  if coalesce(new.lead_id, 0) = 0 then new.lead_id := null; end if;
  -- แก้นัดเดิมโดยไม่เปลี่ยนการผูก = ไม่ตรวจซ้ำ (นัดเก่าที่ลีดถูกลบไปแล้วยังแก้สถานะได้)
  if tg_op = 'UPDATE' and new.lead_id is not distinct from old.lead_id and new.customer_id is not distinct from old.customer_id
     and new.dealer_code = old.dealer_code then
    return new;
  end if;
  if new.lead_id is null and new.customer_id is null then
    raise exception 'appointment_link: นัดหมายต้องผูกกับลูกค้าเป้าหมายหรือลูกค้า';
  end if;
  if new.lead_id is not null and not exists (select 1 from leads l where l.dealer_code = new.dealer_code and l.num_id = new.lead_id) then
    raise exception 'appointment_link: ไม่พบลูกค้าเป้าหมายนี้ในสาขา %', new.dealer_code;
  end if;
  if new.customer_id is not null and not exists (select 1 from customers c where c.dealer_code = new.dealer_code and c.id = new.customer_id) then
    raise exception 'appointment_link: ไม่พบลูกค้านี้ในสาขา %', new.dealer_code;
  end if;
  return new;
end $$;
revoke all on function public.appointments_link_guard() from public, anon, authenticated, service_role;
drop trigger if exists appointments_link_guard on public.appointments;
create trigger appointments_link_guard before insert or update on public.appointments
  for each row execute function public.appointments_link_guard();

-- ═══ B2 · แดชบอร์ด HQ (จาก 0268) — กิจกรรมล่าสุดอ่านมุมมอง audit_log_hq แทนการกรองด้วยคำในเรื่อง ═══
create or replace function public.hq_dashboard(p_start date, p_end date, p_dealer text default null, p_today date default null)
  returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare
  วันนี้ date := coalesce(p_today, (now() at time zone 'Asia/Bangkok')::date);
  วัน int := greatest(1, p_end - p_start + 1);
  เป้าปี numeric;
  ต้นเดือน date;
  งานวันนี้ jsonb; การ์ด jsonb; อันดับ jsonb; แนวโน้ม jsonb; รายเดือน jsonb; ภาค jsonb; กิจกรรม jsonb;
  จำนวนดีลเลอร์ int;
begin
  if not is_hq() then raise exception 'forbidden: เฉพาะสำนักงานใหญ่'; end if;
  if p_start is null or p_end is null or p_end < p_start then raise exception 'bad_range: ช่วงเวลาไม่ถูกต้อง'; end if;
  ต้นเดือน := (date_trunc('month', วันนี้) - interval '11 months')::date;

  if p_dealer is null then select annual_target into เป้าปี from hq_targets where id = 1;
  else select revenue_target into เป้าปี from dealers where code = p_dealer; end if;
  เป้าปี := nullif(coalesce(เป้าปี, 0), 0);

  -- ── วันนี้ต้องทำ (ไม่ขึ้นกับตัวกรอง) ──
  select jsonb_build_object(
      'requestsOpen',    (select count(*) from quote_requests where status in ('new', 'pricing')),
      'requestsOverdue', (select count(*) from quote_requests where status in ('new', 'pricing') and now() > due_at),
      'franchiseOverdue', (select jsonb_build_object('count', count(*), 'amount', coalesce(sum(ค้าง), 0),
                                    'ids', coalesce(jsonb_agg(id order by payment_due_on, id), '[]'::jsonb))
                             from (select p.id, p.payment_due_on,
                                          coalesce(p.amount, 0) - coalesce((select sum(amount) from dealer_proposal_payments x
                                                                             where x.proposal_id = p.id and x.cancelled_at is null), 0) as ค้าง
                                     from dealer_package_proposals p
                                    where p.status = 'accepted' and p.payment_due_on is not null
                                      and p.payment_due_on < (now() at time zone 'Asia/Bangkok')::date) y
                            where ค้าง > 0))
    into งานวันนี้;

  -- ── ใบตอบรับ (ยอดขาย) ตามวันตอบรับ · ใบในช่วง · ลีดในช่วง ──
  select jsonb_build_object(
      'sales',      (select coalesce(sum(value), 0) from _hd_won(p_dealer) where d between p_start and p_end),
      'target',     case when เป้าปี is null then null else round(เป้าปี * วัน / 365) end,
      'annualTarget', เป้าปี,
      'days',       วัน,
      'leadsNew',   (select count(*) from leads where dealer_code <> 'HQ' and (p_dealer is null or dealer_code = p_dealer)
                       and created_date between p_start and p_end),
      'quotesSent', (select count(*) from quotations where dealer_code <> 'HQ' and (p_dealer is null or dealer_code = p_dealer)
                       and status in ('sent_to_client', 'won', 'lost', 'expired')
                       and date ~ '^\d{4}-\d{2}-\d{2}' and substring(date, 1, 10)::date between p_start and p_end),
      'closedWon',  (select count(*) from leads where dealer_code <> 'HQ' and (p_dealer is null or dealer_code = p_dealer)
                       and created_date between p_start and p_end and status = 'PAID'),
      'closedLost', (select count(*) from leads where dealer_code <> 'HQ' and (p_dealer is null or dealer_code = p_dealer)
                       and created_date between p_start and p_end and status = 'CANCELLED'))
    into การ์ด;

  -- ── 10 อันดับ: เฉพาะดีลเลอร์ที่มียอดขายในช่วง ──
  select coalesce(jsonb_agg(x order by x.sales desc, x.code), '[]'::jsonb) into อันดับ
    from (select d.code, d.name, s.sales,
                 case when coalesce(d.revenue_target, 0) = 0 then null else round(d.revenue_target * วัน / 365) end as target,
                 (select count(*) from leads l where l.dealer_code = d.code and l.created_date between p_start and p_end and l.status = 'PAID') as "closedWon",
                 (select count(*) from leads l where l.dealer_code = d.code and l.created_date between p_start and p_end and l.status = 'CANCELLED') as "closedLost"
            from (select dealer_code, sum(value) as sales from _hd_won(p_dealer) where d between p_start and p_end group by 1 having sum(value) > 0) s
            join dealers d on d.code = s.dealer_code
           where d.code <> 'HQ'
           order by s.sales desc, d.code limit 10) x;

  select jsonb_build_object(
      'byMonth', coalesce((select jsonb_agg(x order by x.y, x.m) from (
          select extract(year from d)::int as y, extract(month from d)::int - 1 as m, sum(value) as sales
            from _hd_won(p_dealer) where d between p_start and p_end group by 1, 2) x), '[]'::jsonb),
      'byDay',   coalesce((select jsonb_agg(x order by x.d) from (
          select to_char(d, 'YYYY-MM-DD') as d, sum(value) as sales
            from _hd_won(p_dealer) where d between p_start and p_end group by d) x), '[]'::jsonb),
      'byHour',  coalesce((select jsonb_agg(x order by x.h) from (
          select h, sum(value) as sales from _hd_won(p_dealer) where d between p_start and p_end group by h) x), '[]'::jsonb))
    into แนวโน้ม;

  -- ── 12 เดือนย้อนหลัง (ไม่ขึ้นกับตัวกรองเวลา) ──
  select coalesce(jsonb_agg(jsonb_build_object('y', extract(year from m)::int, 'm', extract(month from m)::int - 1,
           'leads',  (select count(*) from leads where dealer_code <> 'HQ' and (p_dealer is null or dealer_code = p_dealer)
                        and created_date >= m and created_date < m + interval '1 month'),
           'quotes', (select count(*) from quotations where dealer_code <> 'HQ' and (p_dealer is null or dealer_code = p_dealer)
                        and status in ('sent_to_client', 'won', 'lost', 'expired') and date ~ '^\d{4}-\d{2}-\d{2}'   -- ใบที่ส่ง ไม่นับร่าง/ถูกแทนที่ (0268)
                        and substring(date, 1, 10)::date >= m and substring(date, 1, 10)::date < m + interval '1 month'),
           'won',    (select count(*) from _hd_won(p_dealer) where d >= m and d < m + interval '1 month'),
           'sales',  (select coalesce(sum(value), 0) from _hd_won(p_dealer) where d >= m and d < m + interval '1 month'))
         order by m), '[]'::jsonb)
    into รายเดือน
    from generate_series(ต้นเดือน, date_trunc('month', วันนี้)::date, interval '1 month') as g(m);

  -- ── ดีลเลอร์ตามภาค ──
  select count(*) into จำนวนดีลเลอร์ from dealers where code <> 'HQ' and (p_dealer is null or code = p_dealer);
  select coalesce(jsonb_agg(x order by x.dealers desc, x.region), '[]'::jsonb) into ภาค
    from (select coalesce(nullif(btrim(d.region), ''), 'ไม่ระบุ') as region, count(*) as dealers,
                 coalesce(sum((select sum(value) from _hd_won(p_dealer) w where w.dealer_code = d.code and w.d between p_start and p_end)), 0) as sales
            from dealers d where d.code <> 'HQ' and (p_dealer is null or d.code = p_dealer)
           group by 1) x;

  -- ── กิจกรรมล่าสุด ──
  select coalesce(jsonb_agg(x order by x.at desc, x.id desc), '[]'::jsonb) into กิจกรรม
    from (select id, "user", action, target, at from audit_log_hq a                -- เฉพาะที่คนของ HQ ทำ (ใบ 0274 · กติกาเดียวกับ /hq/audit)
           where (a.at at time zone 'Asia/Bangkok')::date between p_start and p_end
             and coalesce(a."user", '') <> 'บัญชีทดสอบชั่วคราว'             -- บัญชีชั่วคราวของ prod-live (tests/prod-live/run.mjs)
             and coalesce(a."user", '') !~* '@example\.test$|^zz'
             and coalesce(a.target, '') !~* 'ZZTEST|ZZLOAD|ZZE2E'
             and coalesce(a.target, '') !~ '(^|[ →])ZZ[A-Z0-9]*( |$)'       -- สาขาทดสอบ ZZ*
           order by a.at desc, a.id desc limit 50) x;

  return jsonb_build_object('today', งานวันนี้, 'cards', การ์ด, 'top', อันดับ, 'trend', แนวโน้ม,
    'monthly', รายเดือน, 'monthlyTarget', case when เป้าปี is null then null else round(เป้าปี / 12) end,
    'regions', ภาค, 'dealerCount', จำนวนดีลเลอร์, 'activity', กิจกรรม);
end $$;

-- ═══ E · กล่องคำขอราคา HQ (จาก 0249) — เพิ่มวันแก้ร่างใบ HQ ล่าสุด (draft_updated_at) · อื่นเหมือนเดิมทุกตัว ═══
CREATE OR REPLACE FUNCTION public.hq_quote_board(p_group text DEFAULT 'todo'::text, p_q text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  q text := lower(btrim(coalesce(p_q, '')));
  นับ jsonb; แถว jsonb;
begin
  if not is_hq() then raise exception 'forbidden: เฉพาะสำนักงานใหญ่'; end if;
  if p_group not in ('todo', 'overdue', 'quoted', 'won', 'closed', 'all') then raise exception 'invalid_group: %', p_group; end if;

  with ค as (
    select r.*, coalesce(d.name, '') as dealer_name, coalesce(l.company, '') as lead_company,
           coalesce(l.contact, '') as lead_contact, coalesce(l.phone, '') as lead_phone,
           coalesce(l.email, '') as lead_email, coalesce(l.address, '') as lead_address,
           h.status as hq_status, h.valid_until, h.quote_no,
           case when h.status = 'draft' then h.updated_at end as draft_updated_at,   -- แก้ร่างใบ HQ ล่าสุด (ใบ 0274)
           case when r.status in ('new', 'pricing') then 'todo' when r.status = 'quoted' then 'quoted'
                when r.status = 'won' then 'won' else 'closed' end as กลุ่ม
      from quote_requests r
      left join dealers d on d.code = r.dealer_code
      left join leads l on l.dealer_code = r.dealer_code and l.num_id = r.lead_num_id
      left join hq_quotes h on h.request_id = r.id
     where q = '' or lower(concat_ws(' ', r.request_no, r.dealer_code, d.name, l.company, r.product, r.subtype, r.province)) like '%' || q || '%'
  )
  select jsonb_build_object(
           'todo',    count(*) filter (where กลุ่ม = 'todo'),
           'overdue', count(*) filter (where กลุ่ม = 'todo' and due_at < now()),
           'quoted',  count(*) filter (where กลุ่ม = 'quoted'),
           'won',     count(*) filter (where กลุ่ม = 'won'),
           'closed',  count(*) filter (where กลุ่ม = 'closed')),
         coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'request_no', request_no, 'dealer_code', dealer_code, 'dealer_name', dealer_name,
           'lead_num_id', lead_num_id, 'lead_company', lead_company, 'product', product, 'subtype', subtype,
           'lead_contact', lead_contact, 'lead_phone', lead_phone, 'lead_email', lead_email, 'lead_address', lead_address,
           'estimate_items', estimate_items, 'estimate_total', estimate_total, 'estimate_deviation_pct', estimate_deviation_pct,
           'area', area, 'province', province, 'spec', spec, 'status', status, 'hq_status', hq_status, 'quote_no', quote_no,
           'valid_until', valid_until, 'draft_updated_at', draft_updated_at, 'submitted_at', submitted_at, 'due_at', due_at, 'quoted_at', quoted_at,
           'closed_at', closed_at, 'assignee_name', assignee_name, 'supersedes_id', supersedes_id,
           'waiting_days', greatest(0, floor(extract(epoch from (now() - submitted_at)) / 86400))::int,
           'tag', case
             when status in ('new', 'pricing') and due_at < now() then 'overdue'
             when status in ('new', 'pricing') and supersedes_id is not null then 'reprice'
             when status = 'pricing' and hq_status = 'draft' then 'draft'
             when status = 'new' then 'new'
             else status end)
           order by
             case when p_group in ('todo', 'overdue') then due_at end asc,
             case when p_group = 'all' then submitted_at end desc,
             case when p_group = 'quoted' then valid_until end asc nulls last,
             case when p_group in ('won', 'closed') then coalesce(closed_at, updated_at) end desc,
             id asc)
           filter (where p_group = 'all' or กลุ่ม = p_group or (p_group = 'overdue' and กลุ่ม = 'todo' and due_at < now())), '[]'::jsonb)
    into นับ, แถว
    from ค;

  return jsonb_build_object('counts', นับ, 'rows', แถว);
end $function$;

revoke all on function public.hq_quote_board(text, text) from public, anon, authenticated, service_role;
grant execute on function public.hq_quote_board(text, text) to authenticated;

-- ═══ B3 · การ์ด KPI (จาก 0271) — หน้า /hq/audit นับจากมุมมอง audit_log_hq (ชุดเดียวกับตาราง/ตัวกรอง/ส่งออก) · หน้าอื่นเหมือนเดิมทุกตัว ═══
create or replace function public.kpi_cards(
  p_page text, p_start date default null, p_end date default null, p_dealer text default null, p_today date default null,
  p_filters jsonb default null
) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  วันนี้ date := coalesce(p_today, (now() at time zone 'Asia/Bangkok')::date);
  ต้นปี date;
  ต้นสัปดาห์ date;
  ช่วงต้น date := p_start;
  ช่วงท้าย date := p_end;
  สาขา text;
  ได้ int; เสีย int; ส่ง int; รอ int; เป้า numeric; ยอด numeric;
  f jsonb := coalesce(p_filters, '{}'::jsonb);
  ชุด text[];
  ชุดสาขา text[];
  ชุดจังหวัด text[];
  ชุดสาขาค้น text[];
  ซื้อจาก date;
  ซื้อถึง date;
  จังหวัด text := nullif(btrim(coalesce(f ->> 'province', '')), '');
  ช่องทาง text := nullif(btrim(coalesce(f ->> 'source', '')), '');
  คำค้น text := nullif(lower(btrim(coalesce(f ->> 'search', ''))), '');
begin
  ต้นปี := date_trunc('year', วันนี้)::date;
  ต้นสัปดาห์ := วันนี้ - (extract(isodow from วันนี้)::int - 1);
  if (ช่วงต้น is null) <> (ช่วงท้าย is null) or ช่วงท้าย < ช่วงต้น then raise exception 'bad_range: ช่วงเวลาไม่ถูกต้อง'; end if;
  if jsonb_typeof(f) <> 'object' then raise exception 'bad_filters: ตัวกรองต้องเป็นก้อนข้อมูล'; end if;
  if jsonb_typeof(f -> 'ids') = 'array' then ชุด := array(select jsonb_array_elements_text(f -> 'ids')); end if;
  if jsonb_typeof(f -> 'dealerCodes') = 'array' then ชุดสาขา := array(select jsonb_array_elements_text(f -> 'dealerCodes')); end if;
  if jsonb_typeof(f -> 'searchDealers') = 'array' then ชุดสาขาค้น := array(select jsonb_array_elements_text(f -> 'searchDealers')); end if;
  if jsonb_typeof(f -> 'provinces') = 'array' then ชุดจังหวัด := array(select jsonb_array_elements_text(f -> 'provinces')); end if;

  -- ══ หน้าดีลเลอร์ — สาขาของผู้เรียกเท่านั้น (ไม่มีช่วง = ทุกช่วงเวลา) ══
  if p_page like 'dealer.%' then
    สาขา := auth_dealer();
    if coalesce(สาขา, '') = '' or สาขา = 'HQ' then raise exception 'forbidden: เฉพาะดีลเลอร์'; end if;

    if p_page = 'dealer.dashboard' then
      select nullif(coalesce(revenue_target, 0), 0) into เป้า from dealers where code = สาขา;
      select coalesce(sum(w.value), 0) into ยอด from _kpi_won(สาขา) w where w.d between ต้นปี and วันนี้;
      select count(*) filter (where status = 'PAID'), count(*) filter (where status = 'CANCELLED') into ได้, เสีย
        from leads where dealer_code = สาขา and (ช่วงต้น is null or created_date between ช่วงต้น and ช่วงท้าย);
      return jsonb_build_object(
        'target',   jsonb_build_object('annual', เป้า, 'ytd', ยอด, 'pct', case when เป้า is null then null else round(100 * ยอด / เป้า) end),
        'pipeline', (select jsonb_build_object('count', count(*), 'value', coalesce(sum(quote_value), 0))
                       from leads where dealer_code = สาขา and status not in ('PAID', 'CANCELLED')),
        'awaiting', (select jsonb_build_object('count', count(*), 'value', coalesce(sum(total_value), 0))
                       from quotations where dealer_code = สาขา and status = 'sent_to_client'),
        'won',      jsonb_build_object('count', ได้, 'lost', เสีย, 'rate', case when ได้ + เสีย = 0 then null else round(100.0 * ได้ / (ได้ + เสีย)) end));

    elsif p_page = 'dealer.leads' then
      return (select jsonb_build_object(
        'open',            count(*) filter (where l.status not in ('PAID', 'CANCELLED')),
        'hqPricing',       count(*) filter (where l.status = 'HQ_PRICING'),
        -- ใบร่างของลีด = กติกาเดียวกับหน้าเว็บ (lib/leadQuote.ts quoteBelongsToLead): ผูกดีล = เลขดีลตรง · ไม่ผูก = ลูกค้าเดียวกัน หรือชื่อบริษัทตรง
        'hqQuotedNoDraft', count(*) filter (where l.status = 'HQ_QUOTED' and not exists (
                              select 1 from quotations q where q.dealer_code = l.dealer_code and q.status = 'draft'
                                 and case when q.deal_id is not null then q.deal_id = l.num_id
                                          else (l.customer_id is not null and q.customer_id = l.customer_id) or q.customer = l.company end)),
        'awaitingClient',  count(*) filter (where l.status in ('QUOTED', 'FOLLOWUP', 'NEGO')))
        from leads l where l.dealer_code = สาขา and (ชุด is null or l.id = any(ชุด)));

    elsif p_page = 'dealer.quotations' then
      return jsonb_build_object(
        'drafts',   (select count(*) from quotations where dealer_code = สาขา and status = 'draft' and (ชุด is null or id = any(ชุด))),
        'awaiting', (select count(*) from quotations where dealer_code = สาขา and status = 'sent_to_client' and (ชุด is null or id = any(ชุด))),
        'won',      (select jsonb_build_object('count', count(*), 'value', coalesce(sum(w.value), 0))
                       from _kpi_won(สาขา) w where (ช่วงต้น is null or w.d between ช่วงต้น and ช่วงท้าย) and (ชุด is null or w.quote_id = any(ชุด))),
        'expiring', (select count(*) from quotations q where q.dealer_code = สาขา and q.status = 'sent_to_client' and (ชุด is null or q.id = any(ชุด))
                       and _quote_valid_until(q) between วันนี้ and วันนี้ + 3));

    elsif p_page = 'dealer.customers' then
      return jsonb_build_object(
        'total',    (select count(*) from customers where dealer_code = สาขา and (ชุด is null or id::text = any(ชุด))),
        -- ลูกค้าใหม่ = วันที่เป็นลูกค้า (join_date · ช่องเดียวกับที่หน้าเว็บแสดง/กรอง) อยู่ในช่วง
        'new',      (select count(*) from customers where dealer_code = สาขา and join_date ~ '^\d{4}-\d{2}-\d{2}' and (ชุด is null or id::text = any(ชุด))
                       and (ช่วงต้น is null or substring(join_date, 1, 10)::date between ช่วงต้น and ช่วงท้าย)),
        'sales',    (select coalesce(sum(w.value), 0) from _kpi_won(สาขา) w
                      where (ช่วงต้น is null or w.d between ช่วงต้น and ช่วงท้าย) and (ชุด is null or w.customer_id::text = any(ชุด))),
        'openDeal', (select count(distinct customer_id) from leads where dealer_code = สาขา and customer_id is not null
                       and status not in ('PAID', 'CANCELLED') and (ชุด is null or customer_id::text = any(ชุด))));

    elsif p_page = 'dealer.calendar' then
      return (select jsonb_build_object(
        'today',    count(*) filter (where ว = วันนี้),
        'week',     count(*) filter (where ว between ต้นสัปดาห์ and ต้นสัปดาห์ + 6),
        'overdue',  count(*) filter (where ว < วันนี้ and coalesce(a.status, '') not in ('done', 'cancelled')),   -- 0253: นัดที่ยกเลิกแล้วไม่ใช่ "ยังไม่ปิด"
        'doneWeek', count(*) filter (where ว between ต้นสัปดาห์ and ต้นสัปดาห์ + 6 and a.status = 'done'))
        from (select status, case when date ~ '^\d{4}-\d{2}-\d{2}' then substring(date, 1, 10)::date end as ว
                from appointments where dealer_code = สาขา and (ชุด is null or id::text = any(ชุด))) a);
    end if;
    raise exception 'invalid_page: %', p_page;
  end if;

  -- ══ หน้า HQ ══
  if not is_hq() then raise exception 'forbidden: เฉพาะสำนักงานใหญ่'; end if;
  if p_dealer is not null and not exists (select 1 from dealers where code = p_dealer and code <> 'HQ') then
    raise exception 'invalid_dealer: %', p_dealer;
  end if;
  -- การ์ด "ในช่วงนี้" ของหน้า HQ ต้องมีช่วง (หน้าที่ไม่มีตัวกรองส่งเดือนนี้มา)
  if ช่วงต้น is null and p_page not in ('hq.dealers', 'hq.users') then raise exception 'bad_range: ต้องระบุช่วงเวลา'; end if;

  if p_page = 'hq.prospects' then
    return jsonb_build_object(
      'talking',   (select count(*) from dealer_prospects where status in ('new', 'contacted', 'profile_sent', 'meeting', 'considering')
                      and (ชุด is null or id::text = any(ชุด))),
      'followDue', (select count(*) from dealer_prospects where status in ('new', 'contacted', 'profile_sent', 'meeting', 'considering')
                      and follow_up is not null and follow_up <= วันนี้ and (ชุด is null or id::text = any(ชุด))),
      -- ไม่ได้ติดต่อ 14 วัน (บอสสั่ง 1 พ.ย. 69 · แทน "รอตอบใบค่าแฟรนไชส์") = สูตรเดียวกับตัวกรอง idle14 ของหน้าผู้สนใจ (prospectJourney.ไม่ได้ติดต่อเกิน):
      --   ยังติดตามอยู่ (ไม่ใช่ won/lost) · นับจากติดต่อล่าสุด ไม่เคยติดต่อ = วันเพิ่มรายชื่อ · วันตามเวลาไทย · ห่าง ≥ 14 วัน
      'idle14',    (select count(*) from dealer_prospects where status not in ('won', 'lost')
                      and (coalesce(last_contact_at, created_at) at time zone 'Asia/Bangkok')::date <= วันนี้ - 14
                      and (ชุด is null or id::text = any(ชุด))),
      'converted', (select count(*) from dealer_prospects where status = 'won' and converted_at is not null and (ชุด is null or id::text = any(ชุด))
                      and (converted_at at time zone 'Asia/Bangkok')::date between ช่วงต้น and ช่วงท้าย));

  elsif p_page = 'hq.proposals' then
    return (select jsonb_build_object(
      'waiting',  (select count(*) from dealer_package_proposals where status = 'sent' and (ชุด is null or id::text = any(ชุด))),
      -- ids = เลขใบ ให้หน้าเว็บกรองตารางตรงกับตัวเลข (กดการ์ด) — ฐานตัดสินว่าใบไหนค้าง/เกินกำหนด ไม่คิดซ้ำในเบราว์เซอร์
      'unpaid',   jsonb_build_object('count', count(*) filter (where ค้าง > 0), 'amount', coalesce(sum(ค้าง) filter (where ค้าง > 0), 0),
                                     'ids', coalesce(jsonb_agg(id order by id) filter (where ค้าง > 0), '[]'::jsonb)),
      'overdue',  jsonb_build_object('count', count(*) filter (where ค้าง > 0 and payment_due_on < วันนี้),
                                     'amount', coalesce(sum(ค้าง) filter (where ค้าง > 0 and payment_due_on < วันนี้), 0),
                                     'ids', coalesce(jsonb_agg(id order by id) filter (where ค้าง > 0 and payment_due_on < วันนี้), '[]'::jsonb)),
      'paid',     (select jsonb_build_object('count', count(*), 'amount', coalesce(sum(x.amount), 0),
                                             'ids', coalesce(jsonb_agg(distinct x.proposal_id), '[]'::jsonb)) from dealer_proposal_payments x
                    where x.cancelled_at is null and x.paid_on between ช่วงต้น and ช่วงท้าย and (ชุด is null or x.proposal_id::text = any(ชุด))))
      from (select p.id, p.payment_due_on, coalesce(p.amount, 0) - coalesce((select sum(x.amount) from dealer_proposal_payments x
                                                                              where x.proposal_id = p.id and x.cancelled_at is null), 0) as ค้าง
              from dealer_package_proposals p where p.status = 'accepted' and (ชุด is null or p.id::text = any(ชุด))) y);

  elsif p_page = 'hq.dealers' then
    return (select jsonb_build_object(
      'total',    count(*),
      'active',   count(*) filter (where status = 'active'),
      'moving',   count(*) filter (where เคลื่อนไหว),
      'idle',     count(*) filter (where not เคลื่อนไหว),
      -- รหัสสาขา ให้หน้าเว็บกรองตารางตรงกับตัวเลข (กดการ์ด) — ฐานตัดสินว่าสาขาไหนเคลื่อนไหว
      'movingCodes', coalesce(jsonb_agg(code order by code) filter (where เคลื่อนไหว), '[]'::jsonb),
      'idleCodes',   coalesce(jsonb_agg(code order by code) filter (where not เคลื่อนไหว), '[]'::jsonb))
      from (select code, status, _dealer_active_since(code, วันนี้ - 30) as เคลื่อนไหว from dealers
             where code <> 'HQ' and (ชุด is null or code = any(ชุด))) x);

  elsif p_page = 'hq.pipeline' then
    -- เป้า: ทั้งเครือ = เป้าทั้งเครือ (hq_targets) · เลือกดีลเลอร์/กรองสาขา = ผลรวมเป้าของสาขาที่เหลือ (กติกาเดียวกับหน้าภาพรวมยอดขาย)
    if p_dealer is not null then select revenue_target into เป้า from dealers where code = p_dealer;
    elsif ชุดสาขา is not null then select sum(revenue_target) into เป้า from dealers where code = any(ชุดสาขา) and code <> 'HQ';
    else select annual_target into เป้า from hq_targets where id = 1; end if;
    เป้า := nullif(coalesce(เป้า, 0), 0);
    select count(*) filter (where status = 'PAID'), count(*) filter (where status = 'CANCELLED') into ได้, เสีย
      from leads where dealer_code <> 'HQ' and (p_dealer is null or dealer_code = p_dealer) and (ชุดสาขา is null or dealer_code = any(ชุดสาขา))
       and created_date between ช่วงต้น and ช่วงท้าย;
    return jsonb_build_object(
      'sales',   jsonb_build_object('value', (select coalesce(sum(w.value), 0) from _kpi_won(p_dealer) w
                                               where w.d between ช่วงต้น and ช่วงท้าย and (ชุดสาขา is null or w.dealer_code = any(ชุดสาขา))),
                                    'target', case when เป้า is null then null else round(เป้า * (ช่วงท้าย - ช่วงต้น + 1) / 365) end),
      'winRate', jsonb_build_object('won', ได้, 'lost', เสีย, 'rate', case when ได้ + เสีย = 0 then null else round(100.0 * ได้ / (ได้ + เสีย)) end),
      -- margin เฉลี่ย = ส่วนบวกของใบลูกค้า won ที่ผูกใบ HQ (ตอบรับในช่วง) เป็น % ของราคาขาย · สูตรเดียวกับ hq_overview 0209
      'margin',  (select jsonb_build_object('quotes', count(*), 'pct', case when coalesce(sum(q.total_value), 0) = 0 then null
                           else round(100.0 * (sum(q.total_value) - sum(h.total_cost)) / sum(q.total_value), 1) end)
                    from quotations q join hq_quotes h on h.id = q.hq_quote_id
                    join quotation_won_at w on w.dealer_code = q.dealer_code and w.quote_id = q.id
                   where q.status = 'won' and q.dealer_code <> 'HQ' and (p_dealer is null or q.dealer_code = p_dealer)
                     and (ชุดสาขา is null or q.dealer_code = any(ชุดสาขา))
                     and (w.won_at at time zone 'Asia/Bangkok')::date between ช่วงต้น and ช่วงท้าย),
      -- ถึงเป้า = ณ ตอนนี้: ยอดตั้งแต่ต้นปี ≥ เป้าทั้งปีของสาขา · นับเฉพาะสาขาที่ตั้งเป้าแล้ว
      'onTarget', (select jsonb_build_object('reached', count(*) filter (where t.ytd >= t.revenue_target), 'of', count(*),
                                             'codes', coalesce(jsonb_agg(t.code order by t.code) filter (where t.ytd >= t.revenue_target), '[]'::jsonb))
                     from (select x.code, x.revenue_target,
                                  (select coalesce(sum(w.value), 0) from _kpi_won(x.code) w where w.d between ต้นปี and วันนี้) as ytd
                             from dealers x where x.code <> 'HQ' and coalesce(x.revenue_target, 0) > 0
                              and (p_dealer is null or x.code = p_dealer) and (ชุดสาขา is null or x.code = any(ชุดสาขา))) t));

  -- ══ 3 หน้าเจาะลึก (ใบ 0271 · บอสสั่ง 2 พ.ย. 69): การ์ด = ผลรวมแถวรายดีลเลอร์ของ hq_drill ชุดเดียวกับตาราง/แผงที่มา ══
  --   ตัวกรองที่ใช้ = สาขา (p_dealer · dealerCodes) เท่านั้น — ระดับ ภูมิภาค/จังหวัด/ดีลเลอร์ ของหน้าส่งมาเป็นชุดสาขา · ไม่นับแถว HQ
  elsif p_page in ('hq.leads', 'hq.quotations', 'hq.customers') then
    if ช่วงต้น is null then raise exception 'bad_range: ต้องระบุช่วงเวลา'; end if;
    return (with ร as (
      select r from jsonb_array_elements(hq_drill(substring(p_page from 4), ช่วงต้น, ช่วงท้าย, วันนี้) -> 'dealers') r
       where (p_dealer is null or r->>'code' = p_dealer) and (ชุดสาขา is null or r->>'code' = any(ชุดสาขา))
    ), ส as (
      select coalesce(sum((r->>'leads')::int), 0) as leads, coalesce(sum((r->>'open')::int), 0) as open, coalesce(sum((r->>'qr')::int), 0) as qr,
             coalesce(sum((r->>'stale')::int), 0) as stale, coalesce(sum((r->>'sent')::int), 0) as sent, coalesce(sum((r->>'wait')::int), 0) as wait,
             coalesce(sum((r->>'won')::int), 0) as won, coalesce(sum((r->>'sales')::numeric), 0) as sales,
             coalesce(sum((r->>'cust')::int), 0) as cust, coalesce(sum((r->>'newc')::int), 0) as newc,
             count(*) filter (where (r->>'cust')::int > 0) as withc, count(*) as n
        from ร)
    select case p_page
      when 'hq.leads' then jsonb_build_object('open', open, 'new', leads, 'qr', qr, 'idle', stale)
      when 'hq.quotations' then jsonb_build_object('sent', sent, 'awaiting', wait, 'won', jsonb_build_object('count', won, 'value', sales),
                                                   'acceptRate', case when sent = 0 then null else round(100.0 * won / sent, 1) end)
      else jsonb_build_object('total', cust, 'new', newc, 'dealers', jsonb_build_object('with', withc, 'of', n)) end
      from ส);

  elsif p_page = 'hq.audit' then
    return (select jsonb_build_object(
      'actionsToday',   count(*) filter (where (a.at at time zone 'Asia/Bangkok')::date = วันนี้),
      'usersToday',     count(distinct a."user") filter (where (a.at at time zone 'Asia/Bangkok')::date = วันนี้),
      'impersonations', count(*) filter (where a.action = 'เข้าระบบแทนดีลเลอร์' and (a.at at time zone 'Asia/Bangkok')::date between ช่วงต้น and ช่วงท้าย),
      'reversals',      count(*) filter (where (a.action like 'ย้อน%' or a.action like 'ยกเลิก%') and (a.at at time zone 'Asia/Bangkok')::date between ช่วงต้น and ช่วงท้าย))
      from audit_log_hq a                                          -- เฉพาะที่คนของ HQ ทำ (ใบ 0274 · ชุดเดียวกับตาราง/ส่งออกของหน้า)
     where not _audit_is_test_row(a."user", a.target, a.action)   -- นิยามแถวทดสอบตัวเดียวกับตัวล้างบันทึก (0241)
       and (ชุด is null or a.id::text = any(ชุด)));

  elsif p_page = 'hq.users' then
    return (select jsonb_build_object(
      'total',      count(*),
      'active',     count(*) filter (where p.status = 'active'),
      'inactive',   count(*) filter (where p.status <> 'active'),
      'signedIn30', count(*) filter (where u.last_sign_in_at >= now() - interval '30 days'))
      from profiles p left join auth.users u on u.id = p.id
     where p.role in ('SUPER_ADMIN', 'HQ_MANAGEMENT', 'HQ_STAFF') and (ชุด is null or p.id::text = any(ชุด)));
  end if;
  raise exception 'invalid_page: %', p_page;
end $$;
revoke all on function public.kpi_cards(text, date, date, text, date, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.kpi_cards(text, date, date, text, date, jsonb) to authenticated;
