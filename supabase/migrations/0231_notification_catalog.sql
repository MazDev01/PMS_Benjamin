-- ── ใบ 0231: แจ้งเตือนจากตารางกลางที่เดียว (บอสสั่ง 21 ต.ค. 69 · รอบ 4) ───────────────────────────────────────────
--
-- กติกา: แจ้งเตือนเหลือเฉพาะเรื่องที่คนรับต้องทำอะไรต่อ 12 ชนิด (ตาราง 11 แถวใน FLOW · แถว D6 มี 2 ชนิด)
--   ดีลเลอร์ (กระดิ่ง · อีเมล)
--     D1 HQ ส่งราคาแล้ว รวมราคาที่ขอแก้                       ✓ ✓
--     D2 ราคา HQ ใกล้หมดอายุ เหลือ 3 วัน                       ✓ ✓
--     D3 ราคา HQ หมดอายุแล้ว ลีดกลับเป็นรวบรวมความต้องการ        ✓ -
--     D4 ใบที่ส่งลูกค้าใกล้หมดอายุ เหลือ 3 วัน                   ✓ -
--     D5 นัดหมาย/ติดตามถึงกำหนดวันนี้                           ✓ -
--     D6 HQ ส่งลีดใหม่ให้ · HQ ย้อนการปิดการขาย                 ✓ ✓
--   HQ
--     H1 คำขอราคาใหม่                                          ✓ ✓
--     H2 ดีลเลอร์ขอแก้ราคา                                      ✓ ✓
--     H3 คำขอค้างเกิน 14 วัน สรุปรวมวันละครั้ง                    ✓ ✓
--     H4 ลูกค้าตอบรับ (ปิดการขายได้)                             ✓ ✓
--     H5 ใบค่าแฟรนไชส์เกินกำหนดชำระ                             ✓ -
--   ห้ามแจ้ง: สิ่งที่ผู้ใช้ทำเอง · สถานะที่ขยับจากสิ่งที่ตัวเองเพิ่งทำ · ลูกค้าปฏิเสธ · ดีลเลอร์ยกเลิกคำขอ
--
-- โครง
--   notification_kinds = ตารางกลาง (ชนิด · ใครได้ · กระดิ่ง/อีเมล · ข้อความ · กดแล้วไปไหน) — ที่เดียวในระบบ
--   _notify()          = ทางเดียวที่สร้างแจ้งเตือน (แถวกระดิ่ง + จดหมายในกล่องขาออก) · ชนิดที่ไม่อยู่ในตาราง = error
--   notifications      = แจ้งเตือนที่ส่งแล้ว · กระดิ่งทั้งสองแอปอ่านจากที่นี่อย่างเดียว · dedupe_key กันซ้ำ
--   notifications_scan = งานตั้งเวลา (D2 D4 D5 H3 H5) · รันกี่รอบก็ได้แจ้งครั้งเดียว
--   ตัวตรวจ supabase/tests/notification_catalog.sql: ฟังก์ชันอื่นที่เขียน notifications / email_outbox = ตก
--
-- ข้อตัดสิน 21 ต.ค. 69: ใบค่าแฟรนไชส์ไม่มีวันครบกำหนดชำระ → เพิ่มช่อง payment_due_on (ห้ามใช้ valid_until แทน · ว่าง = ไม่แจ้ง)
--                     ใบใกล้หมดอายุเตือน 3 วันตายตัว · สวิตช์เปิด/ปิดแจ้งเตือนรายหมวดในหน้าตั้งค่าเอาออก
-- ข้อทดสอบ: supabase/tests/notification_catalog.sql

-- ═══ 1. ตารางกลาง ═════════════════════════════════════════════════════════════════════════════════
create table public.notification_kinds (
  kind      text primary key,
  flow_row  text not null,                                         -- แถวในตาราง FLOW (D1–D6 · H1–H5)
  audience  text not null check (audience in ('dealer', 'hq')),
  bell      boolean not null,
  email     boolean not null,
  title     text not null,
  body      text not null,                                         -- {ชื่อ} แทนด้วยค่าจากเหตุการณ์
  href      text not null,                                         -- กดแล้วเปิดตรงเรื่องนั้น
  sort      integer not null,
  unique (kind, audience)
);
comment on table public.notification_kinds is 'ตารางกลางของแจ้งเตือน (ใบ 0231) — กระดิ่งทั้งสองแอปและอีเมลอ่านจากที่นี่ · เพิ่มเรื่องใหม่ต้องเพิ่มแถวที่นี่ + FLOW';

insert into public.notification_kinds (kind, flow_row, audience, bell, email, title, body, href, sort) values
  ('hq_quote_sent',      'D1', 'dealer', true, true,  'HQ ส่งราคาแล้ว',
     'ราคาจาก HQ ของ {company} มาแล้ว ({request_no}) — ทำใบให้ลูกค้าได้เลย', '/leads?open={lead}', 10),
  ('hq_quote_expiring',  'D2', 'dealer', true, true,  'ราคา HQ ใกล้หมดอายุ',
     'ราคา HQ {quote_no} ของ {company} ยืนราคาถึง {valid_until} (อีก {days} วัน)', '/leads?open={lead}', 20),
  ('hq_quote_expired',   'D3', 'dealer', true, false, 'ราคา HQ หมดอายุ',
     'ราคา HQ ของ {company} หมดอายุ ลีดกลับเป็นรวบรวมความต้องการ — ขอราคาใหม่ได้', '/leads?open={lead}', 30),
  ('quote_expiring',     'D4', 'dealer', true, false, 'ใบเสนอราคาใกล้หมดอายุ',
     'ใบ {quote_no} ของ {customer} หมดอายุ {expiry} (อีก {days} วัน) ลูกค้ายังไม่ตอบ', '/quotations?open={quote}', 40),
  ('appointment_due',    'D5', 'dealer', true, false, 'นัดหมายวันนี้',
     '{type} — {company} เวลา {time} น.', '/calendar?open={appt}', 50),
  ('lead_from_hq',       'D6', 'dealer', true, true,  'HQ ส่งลีดใหม่ให้',
     'สำนักงานใหญ่โอนลูกค้าเป้าหมาย {company} ({province}) ให้แล้ว', '/leads?open={lead}', 60),
  ('won_reverted',       'D6', 'dealer', true, true,  'HQ ย้อนการปิดการขาย',
     'สำนักงานใหญ่ย้อนการตอบรับใบ {quote} ของ {company} — เหตุผล: {reason}', '/leads?open={lead}', 61),
  ('request_new',        'H1', 'hq',     true, true,  'คำขอราคาใหม่',
     '{dealer} ขอราคา {request_no} · {company} · {product}', '/hq/quote-requests?open={request}', 110),
  ('request_reprice',    'H2', 'hq',     true, true,  'ดีลเลอร์ขอแก้ราคา',
     '{dealer} ขอแก้ราคา {request_no} · {company} · {product}', '/hq/quote-requests?open={request}', 120),
  ('requests_overdue',   'H3', 'hq',     true, true,  'คำขอค้างเกิน 14 วัน',
     'คำขอที่ยังไม่ส่งใบ HQ และเลยกำหนด {count} รายการ: {list}', '/hq/quote-requests?overdue=1', 130),
  ('customer_accepted',  'H4', 'hq',     true, true,  'ลูกค้าตอบรับ (ปิดการขายได้)',
     '{dealer} · {company} ตอบรับใบตามราคา HQ {quote_no} — ใบ HQ เป็นคำสั่งผลิต', '/hq/quote-requests?open={request}', 140),
  ('franchise_payment_overdue', 'H5', 'hq', true, false, 'ใบค่าแฟรนไชส์เกินกำหนดชำระ',
     'ใบ {proposal_no} · {prospect} ครบกำหนดชำระ {due} ยังค้าง {outstanding} บาท', '/hq/proposals?open={proposal}', 150);

alter table public.notification_kinds enable row level security;
revoke all on table public.notification_kinds from public, anon, authenticated, service_role;
grant select on table public.notification_kinds to authenticated, service_role;
create policy notification_kinds_read on public.notification_kinds for select to authenticated using (true);

-- ═══ 2. แจ้งเตือนที่ส่งแล้ว ═══════════════════════════════════════════════════════════════════════
create table public.notifications (
  id          bigint generated always as identity primary key,
  kind        text not null,
  audience    text not null,
  dealer_code text references public.dealers (code) on delete cascade,   -- ผู้รับฝั่งดีลเลอร์ · HQ = ว่าง · ลบสาขา = แจ้งเตือนหายตาม
  title       text not null,
  body        text not null,
  href        text not null,
  dedupe_key  text not null unique,                                -- เรื่องเดียวกันแจ้งครั้งเดียว
  created_at  timestamptz not null default now(),
  foreign key (kind, audience) references public.notification_kinds (kind, audience),
  constraint notifications_recipient check ((audience = 'dealer') = (dealer_code is not null))
);
create index notifications_dealer_idx on public.notifications (dealer_code, created_at desc) where audience = 'dealer';
create index notifications_hq_idx on public.notifications (created_at desc) where audience = 'hq';
comment on table public.notifications is 'แจ้งเตือนที่ส่งแล้ว (ใบ 0231) — สร้างได้ทาง _notify() เท่านั้น · ผู้ใช้อ่านได้อย่างเดียว';

alter table public.notifications enable row level security;
revoke all on table public.notifications from public, anon, authenticated, service_role;
grant select on table public.notifications to authenticated;
grant all on table public.notifications to service_role;
create policy notifications_read on public.notifications for select to authenticated
  using ((audience = 'hq' and is_hq()) or (audience = 'dealer' and not is_hq() and dealer_code = auth_dealer()));

-- ═══ 3. ทางเดียวที่สร้างแจ้งเตือน ═════════════════════════════════════════════════════════════════════
/** แทน {ชื่อ} ในข้อความด้วยค่าจากเหตุการณ์ · ค่าที่ไม่มี = "—" */
create or replace function public._notify_render(p_text text, p_vars jsonb) returns text
  language plpgsql immutable set search_path to 'public' as $$
declare r record; t text := p_text;
begin
  for r in select key, value from jsonb_each_text(coalesce(p_vars, '{}'::jsonb)) loop
    t := replace(t, '{' || r.key || '}', coalesce(nullif(btrim(r.value), ''), '—'));
  end loop;
  return regexp_replace(t, '\{[a-z_]+\}', '—', 'g');
end $$;
revoke all on function public._notify_render(text, jsonb) from public, anon, authenticated, service_role;

/** สร้างแจ้งเตือนหนึ่งเรื่อง — คืน true ถ้าสร้างใหม่ · false = เคยแจ้งแล้ว / คนทำเป็นผู้รับเอง
 *  p_once   = กุญแจของเรื่อง (เรื่องเดียวกันแจ้งครั้งเดียว)
 *  p_ref_*  = อ้างอิงของจดหมายในกล่องขาออก · p_detail = รายละเอียดเพิ่มท้ายอีเมล (ไม่ขึ้นกระดิ่ง) */
create or replace function public._notify(
  p_kind text, p_dealer text, p_once text, p_vars jsonb,
  p_ref_table text default '', p_ref_id text default '', p_detail text default ''
) returns boolean language plpgsql security definer set search_path to 'public' as $$
declare k notification_kinds; v_title text; v_body text; v_key text; v_subject text; n integer;
begin
  select * into k from notification_kinds where kind = p_kind;
  if not found then raise exception 'notify_unknown_kind: ชนิดแจ้งเตือน "%" ไม่อยู่ในตารางกลาง', p_kind; end if;
  if (k.audience = 'dealer') <> (coalesce(p_dealer, '') <> '') then
    raise exception 'notify_recipient: ชนิด % ต้อง%ระบุดีลเลอร์', p_kind, case when k.audience = 'dealer' then '' else 'ไม่' end;
  end if;
  -- สิ่งที่ผู้ใช้ทำเอง ไม่แจ้งตัวเอง
  if k.audience = 'hq' and is_hq() then return false; end if;
  if k.audience = 'dealer' and not is_hq() and auth_dealer() = p_dealer then return false; end if;

  v_title := _notify_render(k.title, p_vars);
  v_body  := _notify_render(k.body, p_vars);
  v_key   := p_kind || ':' || p_once;
  insert into notifications (kind, audience, dealer_code, title, body, href, dedupe_key)
  values (p_kind, k.audience, nullif(p_dealer, ''), v_title, v_body, _notify_render(k.href, p_vars), v_key)
  on conflict (dedupe_key) do nothing;
  get diagnostics n = row_count;
  if n = 0 then return false; end if;

  if k.email then
    -- หัวเรื่องอีเมล = ชื่อเรื่อง + ข้อความ (ตัดยาว) → อ่านจากกล่องจดหมายแล้วรู้ว่าเรื่องไหน
    v_subject := v_title || ' — ' || left(v_body, 120);
    v_body := v_body || case when p_detail <> '' then E'\n\n' || p_detail else '' end;
    if k.audience = 'hq' then
      perform _email_enqueue_hq(v_key, v_subject, v_body, p_ref_table, p_ref_id);
    else
      perform _email_enqueue_dealer(p_dealer, v_key, v_subject, v_body, p_ref_table, p_ref_id);
    end if;
  end if;
  return true;
end $$;
revoke all on function public._notify(text, text, text, jsonb, text, text, text) from public, anon, authenticated, service_role;

-- กล่องขาออก: p_kind = กุญแจของเรื่อง (ชนิด:เรื่อง) → กันซ้ำต่อเรื่อง × ผู้รับ · คอลัมน์ kind เก็บชนิดล้วน (ชื่อพารามิเตอร์คงเดิม แก้ชื่อไม่ได้)
create or replace function public._email_enqueue_hq(p_kind text, p_subject text, p_body text, p_ref_table text, p_ref_id text)
  returns integer language plpgsql security definer set search_path to 'public' as $$
declare e text; n integer := 0; k integer;
begin
  foreach e in array coalesce((select email_recipients from hq_notif_rules where id = 1), '{}') loop
    insert into email_outbox (kind, to_email, subject, body, ref_table, ref_id, dedupe_key)
    values (split_part(p_kind, ':', 1), e, p_subject, p_body, p_ref_table, p_ref_id, p_kind || ':' || e)
    on conflict (dedupe_key) do nothing;
    get diagnostics k = row_count;
    n := n + k;
  end loop;
  return n;
end $$;
revoke all on function public._email_enqueue_hq(text, text, text, text, text) from public, anon, authenticated, service_role;

create or replace function public._email_enqueue_dealer(p_dealer text, p_kind text, p_subject text, p_body text, p_ref_table text, p_ref_id text)
  returns integer language plpgsql security definer set search_path to 'public' as $$
declare e text; n integer := 0; k integer;
begin
  foreach e in array _dealer_notify_emails(p_dealer) loop          -- อีเมลติดต่อที่ยืนยันแล้วเท่านั้น
    insert into email_outbox (kind, to_email, subject, body, ref_table, ref_id, dedupe_key)
    values (split_part(p_kind, ':', 1), e, p_subject, p_body, p_ref_table, p_ref_id, p_kind || ':' || e)
    on conflict (dedupe_key) do nothing;
    get diagnostics k = row_count;
    n := n + k;
  end loop;
  return n;
end $$;
revoke all on function public._email_enqueue_dealer(text, text, text, text, text, text) from public, anon, authenticated, service_role;

-- ═══ 4. เหตุการณ์ของคำขอราคา (D1 · H1 · H2 · H4) — แทน quote_requests_email ═══════════════════════════════════
create or replace function public._quote_request_vars(r public.quote_requests) returns jsonb
  language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object(
    'request', r.id, 'request_no', r.request_no, 'lead', r.lead_num_id,
    'dealer', r.dealer_code || coalesce(' ' || (select nullif(d.name, '') from dealers d where d.code = r.dealer_code), ''),
    'company', (select nullif(l.company, '') from leads l where l.dealer_code = r.dealer_code and l.num_id = r.lead_num_id),
    'product', nullif(btrim(coalesce(r.product, '') || case when r.subtype <> '' then ' · ' || r.subtype else '' end), ''))
$$;
revoke all on function public._quote_request_vars(public.quote_requests) from public, anon, authenticated, service_role;

create or replace function public.quote_requests_notify() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
declare h hq_quotes;
begin
  if tg_op = 'INSERT' then
    perform _notify(case when new.supersedes_id is not null then 'request_reprice' else 'request_new' end, null,
      new.id::text, _quote_request_vars(new), 'quote_requests', new.id::text, _quote_request_mail_lines(new));
  elsif new.status = 'quoted' and old.status in ('new', 'pricing') then          -- HQ ส่งใบ (ไม่นับย้อนการตอบรับ won → quoted)
    select * into h from hq_quotes where request_id = new.id;
    perform _notify('hq_quote_sent', new.dealer_code, new.id::text, _quote_request_vars(new), 'quote_requests', new.id::text,
      'เลขใบ HQ: ' || coalesce(h.quote_no, '—') || ' (เวอร์ชัน ' || coalesce(h.version::text, '—') || ')' || E'\n'
        || 'ยืนราคาถึง: ' || coalesce(to_char(h.valid_until, 'DD/MM/YYYY'), '—'));
  elsif new.status = 'won' and old.status is distinct from 'won' then             -- ลูกค้าตอบรับ (ตอบรับซ้ำหลังย้อน = เรื่องใหม่)
    select * into h from hq_quotes where request_id = new.id;
    perform _notify('customer_accepted', null, new.id::text || ':' || extract(epoch from coalesce(new.closed_at, now()))::bigint,
      _quote_request_vars(new) || jsonb_build_object('quote_no', h.quote_no), 'quote_requests', new.id::text,
      _quote_request_mail_lines(new));
  end if;
  return new;
end $$;
revoke all on function public.quote_requests_notify() from public, anon, authenticated, service_role;

drop trigger if exists quote_requests_email on public.quote_requests;
drop function if exists public.quote_requests_email();
create trigger quote_requests_notify after insert or update of status on public.quote_requests
  for each row execute function public.quote_requests_notify();

-- ═══ 5. D3 ราคา HQ หมดอายุ (ยกจาก 0219 · เพิ่มแจ้งเตือน) ══════════════════════════════════════════════════
create or replace function public.expire_hq_linked_quotations(p_as_of date default (now() at time zone 'Asia/Bangkok')::date)
  returns integer language plpgsql security definer set search_path to 'public' as $$
declare n integer; r record;
begin
  update quotations q
     set status = 'expired', expired_reason = 'ใบ HQ ' || h.quote_no || ' หมดอายุ (ยืนราคาถึง ' || to_char(h.valid_until, 'DD/MM/YYYY') || ')'
    from hq_quotes h
   where q.hq_quote_id = h.id
     and q.status in ('draft', 'sent_to_client')
     and h.valid_until is not null and h.valid_until < p_as_of;
  get diagnostics n = row_count;

  for r in
    select l.dealer_code, l.num_id, l.company,
           (select max(h.id) from quote_requests rq join hq_quotes h on h.request_id = rq.id
             where rq.dealer_code = l.dealer_code and rq.lead_num_id = l.num_id) as hq_id
      from leads l
     where l.status = 'HQ_QUOTED'
       and not exists (   -- ยังมีใบ HQ ที่ใช้ได้อยู่ = ไม่แตะ
         select 1 from quote_requests rq join hq_quotes h on h.request_id = rq.id
          where rq.dealer_code = l.dealer_code and rq.lead_num_id = l.num_id and rq.status = 'quoted'
            and h.status = 'sent' and (h.valid_until is null or h.valid_until >= p_as_of))
  loop
    perform _lead_flow_set_status(r.dealer_code, r.num_id, 'BULLET');
    -- ไทม์ไลน์ลีด (กระดิ่งไม่อ่านไทม์ไลน์แล้ว · ใบ 0231)
    perform set_config('pms.flow_sync', '1', true);
    update leads set activities = coalesce(activities, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'id', coalesce((select max((x ->> 'id')::numeric) from jsonb_array_elements(coalesce(activities, '[]'::jsonb)) x
                         where (x ->> 'id') ~ '^\d+(\.\d+)?$'), 0) + 1,
        'type', 'hq_expired', 'icon', 'doc',
        'date', _thai_date(now(), true),
        'at', now(),
        'text', 'ราคาจากสำนักงานใหญ่หมดอายุ — ขอราคาใหม่ได้ที่แท็บใบเสนอราคา (ขอแก้ราคา)'))
     where dealer_code = r.dealer_code and num_id = r.num_id;
    perform set_config('pms.flow_sync', '', true);
    perform _notify('hq_quote_expired', r.dealer_code, r.dealer_code || ':' || r.num_id || ':' || coalesce(r.hq_id::text, '-'),
      jsonb_build_object('lead', r.num_id, 'company', r.company), 'leads', r.dealer_code || ':' || r.num_id);
  end loop;
  return n;
end $$;
revoke all on function public.expire_hq_linked_quotations(date) from public, anon, authenticated, service_role;
grant execute on function public.expire_hq_linked_quotations(date) to service_role;

-- ═══ 6. D6 HQ ส่งลีดใหม่ให้ (โอนจากรหัส HQ) · HQ ย้อนการปิดการขาย ═══════════════════════════════════════════
create or replace function public.leads_from_hq_notify() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
begin
  perform _notify('lead_from_hq', new.dealer_code, new.id,
    jsonb_build_object('lead', new.num_id, 'company', new.company, 'province', new.province), 'leads', new.dealer_code || ':' || new.num_id);
  return new;
end $$;
revoke all on function public.leads_from_hq_notify() from public, anon, authenticated, service_role;
create trigger leads_from_hq_notify after update of dealer_code on public.leads
  for each row when (old.dealer_code = 'HQ' and new.dealer_code <> 'HQ')
  execute function public.leads_from_hq_notify();

-- ย้อนการตอบรับ (ยกจาก 0217 · เพิ่มแจ้งเตือนก่อนจดบันทึกการใช้งาน)
create or replace function public.quotation_revert_won(p_dealer text, p_id text, p_reason text, p_to quotation_status default 'sent_to_client')
  returns quotations language plpgsql security definer set search_path to 'public' as $$
declare
  q quotations; l leads; v_actor text; v_max bigint; v_when text; v_label text;
  v_back lead_status; v_back_label text;
begin
  if not is_hq() then raise exception 'forbidden: ย้อนการตอบรับได้เฉพาะสำนักงานใหญ่'; end if;
  if btrim(coalesce(p_reason, '')) = '' then raise exception 'reason_required: ต้องระบุเหตุผลที่ย้อนการตอบรับ'; end if;
  if p_to not in ('sent_to_client', 'lost') then raise exception 'invalid_target: ย้อนได้เป็น "ส่งแล้ว" หรือ "ไม่สำเร็จ" เท่านั้น'; end if;
  select * into q from quotations where dealer_code = p_dealer and id = p_id for update;
  if not found then raise exception 'quote_not_found: ไม่พบใบเสนอราคานี้'; end if;
  if q.status <> 'won' then raise exception 'not_won: ใบนี้ไม่ได้อยู่ในสถานะตอบรับ (สถานะ %)', q.status; end if;

  select coalesce(nullif(btrim(name), ''), audit_actor()) into v_actor from profiles where id = auth.uid();
  v_actor := coalesce(v_actor, audit_actor());
  v_label := case p_to when 'lost' then 'ไม่สำเร็จ' else 'ส่งแล้ว' end;

  perform set_config('pms.revert_won', '1', true);
  update quotations set status = p_to, lost_reason = case when p_to = 'lost' then btrim(p_reason) else lost_reason end
   where dealer_code = p_dealer and id = p_id returning * into q;
  perform set_config('pms.revert_won', '', true);

  if q.deal_id is not null then
    select * into l from leads where dealer_code = p_dealer and num_id = q.deal_id for update;
    if found then
      -- ลีดกลับไปสถานะก่อนปิดการขาย (ไม่มีประวัติ = เสนอราคา) — เฉพาะลีดที่ยังอยู่ PAID
      if l.status = 'PAID' then
        v_back := coalesce(nullif(l.status_before_paid, 'PAID'), 'QUOTED');
        v_back_label := ('{"WAITING":"ติดต่อแล้ว","BULLET":"รวบรวมความต้องการ","HQ_PRICING":"รอราคา HQ","QUOTED":"เสนอราคา",'
          '"FOLLOWUP":"ติดตามผล","NEGO":"เจรจาต่อรอง","CANCELLED":"ปิดการขายไม่สำเร็จ"}'::jsonb) ->> v_back::text;
      end if;
      v_when := to_char(now() at time zone 'Asia/Bangkok', 'FMDD') || ' ' ||
        (array['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'])[extract(month from now() at time zone 'Asia/Bangkok')::int]
        || ' ' || (extract(year from now() at time zone 'Asia/Bangkok')::int + 543) || ' · ' || to_char(now() at time zone 'Asia/Bangkok', 'HH24:MI');
      select coalesce(max((x ->> 'id')::bigint), 0) into v_max
        from jsonb_array_elements(coalesce(l.activities, '[]'::jsonb)) x where (x ->> 'id') ~ '^\d+$';
      perform set_config('pms.flow_sync', '1', true);
      update leads set
          status = coalesce(v_back, status),
          status_before_paid = case when v_back is not null then null else status_before_paid end,
          activities = coalesce(activities, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
          'id', v_max + 1, 'type', 'doc', 'icon', 'doc', 'date', v_when,
          'text', 'สำนักงานใหญ่ (' || v_actor || ') ย้อนการตอบรับใบเสนอราคา ' || p_id || ' → ' || v_label
                  || coalesce(' · ลูกค้าเป้าหมายกลับเป็น "' || v_back_label || '"', '') || ' · เหตุผล: ' || btrim(p_reason)))
       where dealer_code = p_dealer and num_id = q.deal_id;
      perform set_config('pms.flow_sync', '', true);
    end if;
  end if;

  -- แจ้งดีลเลอร์ (D6 · ใบ 0231)
  perform _notify('won_reverted', p_dealer, p_dealer || ':' || p_id || ':' || extract(epoch from clock_timestamp())::bigint,
    jsonb_build_object('lead', q.deal_id, 'quote', p_id, 'company', coalesce(l.company, nullif(q.customer, ''), q.project),
      'reason', btrim(p_reason)),
    'quotations', p_dealer || ':' || p_id);

  insert into audit_log("user", role, action, target)
  values (v_actor, coalesce(auth.jwt() ->> 'user_role', 'HQ'), 'ย้อนการตอบรับใบเสนอราคา',
          p_dealer || ' · ' || p_id || ' → ' || v_label || ' · ' || btrim(p_reason));
  return q;
end $$;
revoke all on function public.quotation_revert_won(text, text, text, quotation_status) from public, anon, authenticated, service_role;
grant execute on function public.quotation_revert_won(text, text, text, quotation_status) to authenticated;

-- ═══ 7. H5 วันครบกำหนดชำระของใบค่าแฟรนไชส์ (ข้อตัดสิน 21 ต.ค. 69) ════════════════════════════════════════════
alter table public.dealer_package_proposals add column if not exists payment_due_on date;
comment on column public.dealer_package_proposals.payment_due_on is
  'วันครบกำหนดชำระค่าแฟรนไชส์ (HQ กรอก · ใบ 0231) — ว่าง = ไม่แจ้งเตือนเกินกำหนด · คนละเรื่องกับ valid_until (วันยืนข้อเสนอ)';

-- ═══ 8. งานตั้งเวลา (D2 · D4 · D5 · H3 · H5) ════════════════════════════════════════════════════════════
/** ตรวจเรื่องที่ขึ้นกับวันเวลา — รันกี่รอบก็แจ้งเรื่องละครั้ง (dedupe_key) · คืนจำนวนเรื่องที่แจ้งใหม่รอบนี้
 *  เรื่องรายวันเริ่มแจ้งตั้งแต่ 07:00 น. (เวลาไทย) ของวันนั้น — ไม่ปลุกตอนเที่ยงคืน */
create or replace function public.notifications_scan(p_now timestamptz default now()) returns integer
  language plpgsql security definer set search_path to 'public' as $$
declare
  วันนี้ date := (p_now at time zone 'Asia/Bangkok')::date;
  r record; n integer := 0; v_list text; v_count integer; v_detail text;
begin
  if extract(hour from p_now at time zone 'Asia/Bangkok') < 7 then return 0; end if;

  -- D2 ราคา HQ ใกล้หมดอายุ (ใบ HQ ที่ยังใช้อยู่ · เหลือ 0–3 วัน)
  for r in
    select rq.*, h.id as hq_id, h.quote_no as hq_no, h.valid_until as hq_valid
      from hq_quotes h join quote_requests rq on rq.id = h.request_id
     where h.status = 'sent' and rq.status = 'quoted'
       and h.valid_until between วันนี้ and วันนี้ + 3
  loop
    if _notify('hq_quote_expiring', r.dealer_code, r.hq_id::text || ':' || r.hq_valid,
         jsonb_build_object('lead', r.lead_num_id, 'quote_no', r.hq_no, 'valid_until', to_char(r.hq_valid, 'DD/MM/YYYY'),
           'days', r.hq_valid - วันนี้,
           'company', (select nullif(l.company, '') from leads l where l.dealer_code = r.dealer_code and l.num_id = r.lead_num_id)),
         'hq_quotes', r.hq_id::text) then n := n + 1; end if;
  end loop;

  -- D4 ใบที่ส่งลูกค้าใกล้หมดอายุ (เหลือ 0–3 วัน · วันหมดอายุแบบเดียวกับงานตั้งเวลา expire-quotations)
  for r in
    select q.*, x.exp from quotations q
     cross join lateral (select case
             when q.expiry ~ '^\d{4}-\d{2}-\d{2}$' then q.expiry::date
             when q.date ~ '^\d{4}-\d{2}-\d{2}' then substring(q.date, 1, 10)::date
               + coalesce((select quote_validity_days from hq_policy where id = 1), 30)
           end as exp) x
     where q.status = 'sent_to_client' and x.exp between วันนี้ and วันนี้ + 3
  loop
    if _notify('quote_expiring', r.dealer_code, r.dealer_code || ':' || r.id || ':' || r.exp,
         jsonb_build_object('quote', r.id, 'quote_no', coalesce(nullif(r.quote_no, ''), r.id), 'customer', coalesce(nullif(r.customer, ''), r.project),
           'expiry', to_char(r.exp, 'DD/MM/YYYY'), 'days', r.exp - วันนี้),
         'quotations', r.dealer_code || ':' || r.id) then n := n + 1; end if;
  end loop;

  -- D5 นัดหมาย/ติดตามถึงกำหนดวันนี้
  for r in
    select a.* from appointments a
     where a.date = to_char(วันนี้, 'YYYY-MM-DD') and coalesce(a.status, '') not in ('done', 'cancelled')
  loop
    if _notify('appointment_due', r.dealer_code, r.dealer_code || ':' || r.id || ':' || r.date,
         jsonb_build_object('appt', r.id, 'company', r.company, 'time', r.time,
           'type', case r.type when 'follow_up' then 'ติดตาม' when 'visit' then 'นัดพบลูกค้า' when 'site_visit' then 'ดูหน้างาน'
                               when 'design_meet' then 'นัดนำเสนอสินค้า' when 'presentation' then 'นำเสนอราคา'
                               when 'contract_sign' then 'เซ็นสัญญาซื้อขาย' when 'meeting' then 'ประชุม' when 'call' then 'โทร'
                               when 'close' then 'ปิดการขาย' else 'นัดหมาย' end),
         'appointments', r.dealer_code || ':' || r.id) then n := n + 1; end if;
  end loop;

  -- H3 คำขอค้างเกิน 14 วัน — สรุปรวมวันละครั้ง
  select count(*), string_agg(rq.request_no, ', ' order by rq.due_at),
         string_agg(rq.request_no || ' · ' || rq.dealer_code || ' · กำหนด ' || to_char(rq.due_at at time zone 'Asia/Bangkok', 'DD/MM/YYYY')
                    || ' · ' || coalesce(nullif(rq.assignee_name, ''), 'ยังไม่มีผู้รับเรื่อง'), E'\n' order by rq.due_at)
    into v_count, v_list, v_detail
    from quote_requests rq where rq.status in ('new', 'pricing') and rq.due_at < p_now;
  if v_count > 0 and _notify('requests_overdue', null, วันนี้::text,
       jsonb_build_object('count', v_count, 'list', v_list), 'quote_requests', '', v_detail) then n := n + 1; end if;

  -- H5 ใบค่าแฟรนไชส์เกินกำหนดชำระ (ตอบรับแล้ว · เลยวันครบกำหนด · ยอดชำระยังไม่ครบ)
  for r in
    select p.*, dp.name as prospect_name,
           coalesce(p.amount, 0) - coalesce((select sum(x.amount) from dealer_proposal_payments x
                                              where x.proposal_id = p.id and x.cancelled_at is null), 0) as outstanding
      from dealer_package_proposals p join dealer_prospects dp on dp.id = p.prospect_id
     where p.status = 'accepted' and p.payment_due_on is not null and p.payment_due_on < วันนี้
  loop
    if r.outstanding > 0 and _notify('franchise_payment_overdue', null, r.id::text || ':' || r.payment_due_on,
         jsonb_build_object('proposal', r.id, 'proposal_no', r.proposal_no, 'prospect', r.prospect_name,
           'due', to_char(r.payment_due_on, 'DD/MM/YYYY'), 'outstanding', to_char(r.outstanding, 'FM999,999,999,990.00')),
         'dealer_package_proposals', r.id::text) then n := n + 1; end if;
  end loop;
  return n;
end $$;
revoke all on function public.notifications_scan(timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.notifications_scan(timestamptz) to service_role;

-- ชื่อเดิมที่ตัวส่งอีเมล (โค้ดรุ่นก่อน) เรียกก่อนส่ง — ทางผ่านไปตัวใหม่ จนกว่าโค้ดรุ่นใหม่ขึ้นครบ
create or replace function public.quote_requests_overdue_scan() returns integer
  language sql security definer set search_path to 'public' as $$ select public.notifications_scan() $$;
revoke all on function public.quote_requests_overdue_scan() from public, anon, authenticated, service_role;
grant execute on function public.quote_requests_overdue_scan() to service_role;

do $$
begin
  perform cron.unschedule('quote-requests-overdue') where exists (select 1 from cron.job where jobname = 'quote-requests-overdue');
  perform cron.schedule('notifications-scan', '*/15 * * * *', $q$ select public.notifications_scan() $q$);
exception when others then
  raise notice 'ข้ามการตั้งเวลา notifications-scan: pg_cron ยังไม่พร้อม (%)', sqlerrm;
end $$;
