-- ── กล่องขาออกอีเมล + อีเมลของคำขอราคา + งานตั้งเวลาตรวจคำขอเกิน 14 วัน ───────────────────────────
--
-- FLOW.html ตารางสถานะ: คำขอใหม่ / เกิน 14 วัน / ยกเลิกคำขอ / ขอแก้ราคา ต้องมีอีเมลถึง HQ
-- เดิมระบบไม่มีตัวส่งอีเมลของตัวเองเลย (มีแต่อีเมลของระบบยืนยันตัวตน)
--
-- โครง: ฐานข้อมูล "วางจดหมายลงกล่องขาออก" ในธุรกรรมเดียวกับเหตุการณ์ · ตัวส่ง (ฝั่งเซิร์ฟเวอร์) หยิบไปส่งทาง SMTP ทีหลัง
--   - เหตุการณ์สำเร็จ = จดหมายอยู่ในกล่องแน่นอน · เหตุการณ์ย้อนกลับ = จดหมายหายไปด้วย (ไม่มีอีเมลของสิ่งที่ไม่ได้เกิด)
--   - SMTP ล่ม = จดหมายค้างในกล่อง รอส่งรอบถัดไป ไม่ทำให้การส่งคำขอของดีลเลอร์ล้ม
--
-- ผู้รับฝั่ง HQ = รายชื่อใน hq_notif_rules.email_recipients (หน้าตั้งค่าแจ้งเตือนของ HQ) — ไม่ใช้อีเมลรายคน (ข้อตัดสิน 14 ต.ค. 69)
--   รายชื่อว่าง = ไม่มีจดหมาย · preflight ตกถ้ารายชื่อว่าง · คำขอเกินกำหนดจะถูกแจ้งเมื่อมีผู้รับ (ไม่ถือว่าแจ้งแล้วถ้ายังไม่มีใครรับ)

-- ═══ 1. กล่องขาออก ════════════════════════════════════════════════════════════════════
create table public.email_outbox (
  id              bigint generated always as identity primary key,
  kind            text not null,                       -- ชนิดของจดหมาย เช่น quote_request_new
  to_email        text not null,
  subject         text not null,
  body            text not null,                       -- ข้อความล้วน
  ref_table       text not null default '',
  ref_id          text not null default '',
  dedupe_key      text unique,                         -- กันจดหมายเรื่องเดียวกันถึงคนเดียวกันซ้ำ (ว่าง = ไม่กัน)
  status          text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts        integer not null default 0,
  last_error      text not null default '',
  next_attempt_at timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  sent_at         timestamptz
);
create index email_outbox_pending_idx on public.email_outbox (next_attempt_at) where status = 'pending';
create index email_outbox_ref_idx on public.email_outbox (ref_table, ref_id);
comment on table public.email_outbox is 'กล่องขาออกอีเมล — ฐานข้อมูลวางจดหมาย ตัวส่งฝั่งเซิร์ฟเวอร์หยิบไปส่ง · ผู้ใช้อ่าน/เขียนตรงไม่ได้';

-- แตะได้เฉพาะฝั่งเซิร์ฟเวอร์: มีที่อยู่อีเมลของคนอื่นและเนื้อความของทุกสาขา
alter table public.email_outbox enable row level security;
revoke all on table public.email_outbox from public, anon, authenticated;
grant all on table public.email_outbox to service_role;
create policy must_set_password_block on public.email_outbox as restrictive for all to authenticated
  using (not public.must_set_password()) with check (not public.must_set_password());

-- ═══ 2. รายชื่อผู้รับของ HQ ═══════════════════════════════════════════════════════════════
alter table public.hq_notif_rules add column if not exists email_recipients text[] not null default '{}';
comment on column public.hq_notif_rules.email_recipients is 'ที่อยู่อีเมลที่รับแจ้งเตือนของสำนักงานใหญ่ (คำขอใหม่ · เกิน 14 วัน · ยกเลิก · ขอแก้ราคา) — ตั้งในหน้าตั้งค่าแจ้งเตือน';

/** รายชื่อผู้รับต้องเป็นรูปแบบอีเมล ไม่ว่าง ไม่ซ้ำ — ตัดช่องว่างและทำเป็นตัวเล็กให้ก่อนเก็บ */
create or replace function public.hq_notif_rules_clean_recipients() returns trigger
  language plpgsql set search_path to 'public' as $$
declare e text; cleaned text[] := '{}';
begin
  foreach e in array coalesce(new.email_recipients, '{}') loop
    e := lower(btrim(e));
    if e = '' then continue; end if;
    if e !~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$' then
      raise exception 'email_recipients: "%" ไม่ใช่รูปแบบอีเมล', e;
    end if;
    if not (e = any(cleaned)) then cleaned := cleaned || e; end if;
  end loop;
  new.email_recipients := cleaned;
  return new;
end $$;
revoke all on function public.hq_notif_rules_clean_recipients() from public, anon, authenticated, service_role;
drop trigger if exists hq_notif_rules_clean_recipients on public.hq_notif_rules;
create trigger hq_notif_rules_clean_recipients before insert or update of email_recipients on public.hq_notif_rules
  for each row execute function public.hq_notif_rules_clean_recipients();

-- ═══ 3. วางจดหมายถึง HQ ═══════════════════════════════════════════════════════════════
/** วางจดหมายหนึ่งเรื่องถึงผู้รับของ HQ ทุกคน — คืนจำนวนฉบับที่วาง (0 = ยังไม่มีผู้รับ)
 *  ใช้ภายในตัวดักและงานตั้งเวลาเท่านั้น ไม่มีใครเรียกตรงได้ */
create or replace function public._email_enqueue_hq(p_kind text, p_subject text, p_body text, p_ref_table text, p_ref_id text)
  returns integer language plpgsql security definer set search_path to 'public' as $$
declare e text; n integer := 0; k integer;
begin
  foreach e in array coalesce((select email_recipients from hq_notif_rules where id = 1), '{}') loop
    insert into email_outbox (kind, to_email, subject, body, ref_table, ref_id, dedupe_key)
    values (p_kind, e, p_subject, p_body, p_ref_table, p_ref_id, p_kind || ':' || p_ref_id || ':' || e)
    on conflict (dedupe_key) do nothing;
    get diagnostics k = row_count;
    n := n + k;
  end loop;
  return n;
end $$;
revoke all on function public._email_enqueue_hq(text, text, text, text, text) from public, anon, authenticated, service_role;

/** ข้อความสรุปคำขอราคาที่ใช้ในจดหมายทุกชนิด */
create or replace function public._quote_request_mail_lines(r public.quote_requests)
  returns text language sql stable security definer set search_path to 'public' as $$
  select 'เลขคำขอ: ' || r.request_no || E'\n'
      || 'ดีลเลอร์: ' || r.dealer_code || coalesce(' · ' || (select d.name from dealers d where d.code = r.dealer_code), '') || E'\n'
      || 'ลูกค้าเป้าหมาย: ' || coalesce((select nullif(l.company, '') from leads l where l.dealer_code = r.dealer_code and l.num_id = r.lead_num_id), '—') || E'\n'
      || 'งานที่ขอ: ' || coalesce(nullif(r.product, ''), '—') || case when r.subtype <> '' then ' · ' || r.subtype else '' end || E'\n'
      || 'จังหวัดหน้างาน: ' || coalesce(nullif(r.province, ''), '—') || E'\n'
      || 'กำหนดส่งใบ HQ: ' || to_char(r.due_at at time zone 'Asia/Bangkok', 'DD/MM/YYYY HH24:MI') || ' น.'
$$;
revoke all on function public._quote_request_mail_lines(public.quote_requests) from public, anon, authenticated, service_role;

/** เหตุการณ์ของคำขอราคาที่ต้องมีอีเมลถึง HQ (FLOW.html ตารางสถานะ) */
create or replace function public.quote_requests_email() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'INSERT' then
    if new.supersedes_id is not null then            -- แถว 7: ขอแก้ราคา (คำขอใหม่มาแทนคำขอเดิม)
      perform _email_enqueue_hq('quote_request_reprice',
        'ดีลเลอร์ขอแก้ราคา ' || new.request_no,
        'ดีลเลอร์ขอแก้ราคาจากใบ HQ เดิม ระบบเปิดคำขอใหม่และเริ่มนับ 14 วันใหม่' || E'\n\n' || _quote_request_mail_lines(new),
        'quote_requests', new.id::text);
    else                                             -- แถว 1: ดีลเลอร์ส่งคำขอ
      perform _email_enqueue_hq('quote_request_new',
        'คำขอใบเสนอราคาใหม่ ' || new.request_no,
        'มีคำขอใบเสนอราคาใหม่เข้าคิว' || E'\n\n' || _quote_request_mail_lines(new),
        'quote_requests', new.id::text);
    end if;
  elsif new.status = 'cancelled' and old.status is distinct from 'cancelled' then   -- แถว 6: ดีลเลอร์ยกเลิกคำขอ
    perform _email_enqueue_hq('quote_request_cancelled',
      'ดีลเลอร์ยกเลิกคำขอ ' || new.request_no,
      'ดีลเลอร์ยกเลิกคำขอใบเสนอราคา' || E'\n' || 'เหตุผล: ' || new.cancel_reason || E'\n\n' || _quote_request_mail_lines(new),
      'quote_requests', new.id::text);
  end if;
  return new;
end $$;
revoke all on function public.quote_requests_email() from public, anon, authenticated, service_role;
drop trigger if exists quote_requests_email on public.quote_requests;
create trigger quote_requests_email after insert or update of status on public.quote_requests
  for each row execute function public.quote_requests_email();

-- ═══ 4. งานตรวจคำขอเกิน 14 วัน (แถว 3) ════════════════════════════════════════════════════
/** คำขอที่ยังอยู่กับ HQ (ใหม่ / กำลังทำราคา) และเลยกำหนดส่งใบ → วางจดหมาย "เกินกำหนด" ครั้งเดียวต่อคำขอ
 *  คืนจำนวนคำขอที่แจ้งรอบนี้ · ยังไม่มีผู้รับ = ไม่จดว่าแจ้งแล้ว รอบถัดไปลองใหม่ */
create or replace function public.quote_requests_overdue_scan() returns integer
  language plpgsql security definer set search_path to 'public' as $$
declare r quote_requests; n integer := 0;
begin
  for r in select * from quote_requests
            where status in ('new', 'pricing') and due_at < now() and overdue_notified_at is null
            order by due_at for update skip locked loop
    if _email_enqueue_hq('quote_request_overdue',
         'คำขอเกินกำหนด 14 วัน ' || r.request_no,
         'คำขอใบเสนอราคานี้เลยกำหนดส่งใบ HQ แล้ว และยังไม่ได้ส่งใบ' || E'\n'
           || 'ผู้รับผิดชอบ: ' || coalesce(nullif(r.assignee_name, ''), 'ยังไม่มีผู้รับเรื่อง') || E'\n\n' || _quote_request_mail_lines(r),
         'quote_requests', r.id::text) > 0 then
      update quote_requests set overdue_notified_at = now() where id = r.id;
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;
revoke all on function public.quote_requests_overdue_scan() from public, anon, authenticated, service_role;
grant execute on function public.quote_requests_overdue_scan() to service_role;   -- ตัวส่งอีเมลฝั่งเซิร์ฟเวอร์เรียกได้ก่อนส่ง (ไม่ต้องรอรอบของงานตั้งเวลา)

-- ทุก 15 นาที · ทนทานต่อ pg_cron แบบเดียวกับใบ 0066: ยังเปิดไม่ได้ = ข้าม ไม่ทำให้ใบถัดไปพัง
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('quote-requests-overdue', '*/15 * * * *', $q$ select public.quote_requests_overdue_scan() $q$);
exception when others then
  raise notice 'ข้าม quote-requests-overdue cron: pg_cron ยังไม่พร้อม (%) — เปิด pg_cron แล้วรันใบนี้ใหม่', sqlerrm;
end $$;
