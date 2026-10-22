-- ── ใบ 0236: แจ้งเตือนคืน 3 เรื่องตาม FLOW (บอสสั่ง 21 ต.ค. 69 "เอาตาม flow") ───────────────────────────────────────
--
-- ใบ 0231 ตัด 3 เรื่องที่ FLOW มีช่อง "ใครได้แจ้งเตือน" ออกไปผิด — คืนให้ครบ (ตารางกลางรวม 14 แถว · 17 ชนิด)
--   H6 ดีลเลอร์ยกเลิกคำขอราคา (FLOW D3x)                         กระดิ่ง ✓ อีเมล ✓ → คำขอนั้น (กลุ่ม ปิด/ยกเลิก) + เหตุผล
--   H7 ผู้สนใจเป็นดีลเลอร์ถึงกำหนดติดตาม / ไม่ได้ติดต่อนาน (FLOW H2)  กระดิ่ง ✓ → แผงผู้สนใจนั้น
--   H8 ใบค่าแฟรนไชส์รอคำตอบนาน / เลยวันมีผล (FLOW H3)              กระดิ่ง ✓ → ใบนั้น
-- เกณฑ์วันเดิมของระบบ (hq_notif_rules.alerts · ค่าเริ่มต้นเดิม): ไม่ได้ติดต่อ 14 วัน · ใบรอคำตอบ 7 วัน
-- เลยวันมีผล: งานตั้งเวลา expire-dealer-proposals (ใบ 0207) ปิดใบเป็น "หมดอายุ" ทุกชั่วโมง → ตัวดักแจ้งตอนปิด
-- กติกาเดิม: ทางเดียว _notify · แจ้งครั้งเดียว (dedupe_key) · ไม่แจ้งคนทำเอง
-- ข้อทดสอบ: supabase/tests/notification_catalog.sql (ข้อ 12–15)

-- ═══ 1. เพิ่มแถวในตารางกลาง ═══════════════════════════════════════════════════════════════════════
insert into public.notification_kinds (kind, flow_row, audience, bell, email, title, body, href, sort) values
  ('request_cancelled',     'H6', 'hq', true, true,  'ดีลเลอร์ยกเลิกคำขอราคา',
     '{dealer} ยกเลิกคำขอ {request_no} · {company} — เหตุผล: {reason}', '/hq/quote-requests?open={request}', 160),
  ('prospect_followup_due', 'H7', 'hq', true, false, 'ผู้สนใจเป็นดีลเลอร์ถึงกำหนดติดตาม',
     '{name} · นัดติดตาม {due} ({late}) · ผู้ดูแล {assigned}', '/hq/prospects?open={prospect}', 170),
  ('prospect_idle',         'H7', 'hq', true, false, 'ผู้สนใจเป็นดีลเลอร์ไม่ได้ติดต่อนาน',
     '{name} · {detail} · ผู้ดูแล {assigned}', '/hq/prospects?open={prospect}', 171),
  ('proposal_awaiting',     'H8', 'hq', true, false, 'ใบค่าแฟรนไชส์รอคำตอบนาน',
     '{proposal_no} · {name} · ส่งแล้ว {days} วัน ยังไม่ตอบรับหรือปฏิเสธ', '/hq/proposals?open={proposal}', 180),
  ('proposal_expired',      'H8', 'hq', true, false, 'ใบค่าแฟรนไชส์เลยวันมีผล',
     '{proposal_no} · {name} · มีผลถึง {valid_until} ยังไม่มีคำตอบ — ระบบปิดใบเป็นหมดอายุ', '/hq/proposals?open={proposal}', 181);

-- ═══ 2. H6 ยกเลิกคำขอ (ยกตัวดักจาก 0231 · เพิ่มแถว cancelled) ════════════════════════════════════════════
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
  elsif new.status = 'cancelled' and old.status is distinct from 'cancelled' then      -- H6 ดีลเลอร์ยกเลิกคำขอ (คืนตาม FLOW D3x · 21 ต.ค. 69)
    perform _notify('request_cancelled', null, new.id::text,
      _quote_request_vars(new) || jsonb_build_object('reason', new.cancel_reason), 'quote_requests', new.id::text,
      _quote_request_mail_lines(new));
  elsif new.status = 'won' and old.status is distinct from 'won' then             -- ลูกค้าตอบรับ (ตอบรับซ้ำหลังย้อน = เรื่องใหม่)
    select * into h from hq_quotes where request_id = new.id;
    perform _notify('customer_accepted', null, new.id::text || ':' || extract(epoch from coalesce(new.closed_at, now()))::bigint,
      _quote_request_vars(new) || jsonb_build_object('quote_no', h.quote_no), 'quote_requests', new.id::text,
      _quote_request_mail_lines(new));
  end if;
  return new;
end $$;
revoke all on function public.quote_requests_notify() from public, anon, authenticated, service_role;

-- ═══ 3. H8 เลยวันมีผล — ตัวดักตอนใบถูกปิดเป็นหมดอายุ ═══════════════════════════════════════════════════
create or replace function public.dealer_proposals_expired_notify() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
begin
  if exists (select 1 from dealer_prospects where id = new.prospect_id and status not in ('won', 'lost')) then
    perform _notify('proposal_expired', null, new.id::text,
      jsonb_build_object('proposal', new.id, 'proposal_no', new.proposal_no,
        'name', (select name from dealer_prospects where id = new.prospect_id), 'valid_until', to_char(new.valid_until, 'DD/MM/YYYY')),
      'dealer_package_proposals', new.id::text);
  end if;
  return new;
end $$;
revoke all on function public.dealer_proposals_expired_notify() from public, anon, authenticated, service_role;
create trigger dealer_proposals_expired_notify after update of status on public.dealer_package_proposals
  for each row when (old.status = 'sent' and new.status = 'expired')
  execute function public.dealer_proposals_expired_notify();

-- ═══ 4. งานตั้งเวลา (ยกจาก 0231 · เพิ่ม H7 H8) ═══════════════════════════════════════════════════════════
create or replace function public.notifications_scan(p_now timestamptz default now()) returns integer
  language plpgsql security definer set search_path to 'public' as $$
declare
  วันนี้ date := (p_now at time zone 'Asia/Bangkok')::date;
  r record; n integer := 0; v_list text; v_count integer; v_detail text;
  เกณฑ์ jsonb := coalesce((select alerts from hq_notif_rules where id = 1), '{}'::jsonb);
  v_idle  integer := coalesce(nullif((เกณฑ์ -> 'prospectIdle' ->> 'days')::integer, 0), 14);
  v_await integer := coalesce(nullif((เกณฑ์ -> 'proposalAwaiting' ->> 'days')::integer, 0), 7);
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
  -- H7 ผู้สนใจเป็นดีลเลอร์ถึงกำหนดติดตาม (ยังติดตามอยู่ · วันนัด ≤ วันนี้) — นัดใหม่ = เรื่องใหม่
  for r in
    select p.* from dealer_prospects p
     where p.status not in ('won', 'lost') and p.follow_up is not null and p.follow_up <= วันนี้
  loop
    if _notify('prospect_followup_due', null, r.id::text || ':' || r.follow_up,
         jsonb_build_object('prospect', r.id, 'name', r.name, 'due', to_char(r.follow_up, 'DD/MM/YYYY'),
           'late', case when r.follow_up < วันนี้ then 'เลยมา ' || (วันนี้ - r.follow_up) || ' วัน' else 'วันนี้' end,
           'assigned', r.assigned),
         'dealer_prospects', r.id::text) then n := n + 1; end if;
  end loop;

  -- H7 ผู้สนใจเป็นดีลเลอร์ไม่ได้ติดต่อนาน (เกณฑ์เดิม alerts.prospectIdle.days · ไม่ได้ตั้ง = 14 วัน)
  --   นับจากติดต่อล่าสุด · ยังไม่เคยติดต่อ นับจากวันที่เพิ่มรายชื่อ — ติดต่อใหม่แล้วเงียบอีก = เรื่องใหม่
  for r in
    select p.*, (วันนี้ - (coalesce(p.last_contact_at, p.created_at) at time zone 'Asia/Bangkok')::date) as เงียบ
      from dealer_prospects p
     where p.status not in ('won', 'lost')
       and (วันนี้ - (coalesce(p.last_contact_at, p.created_at) at time zone 'Asia/Bangkok')::date) >= v_idle
  loop
    if _notify('prospect_idle', null, r.id::text || ':' || coalesce(r.last_contact_at, r.created_at)::text,
         jsonb_build_object('prospect', r.id, 'name', r.name, 'assigned', r.assigned,
           'detail', case when r.last_contact_at is null then 'ยังไม่เคยบันทึกการติดต่อ (เพิ่มมา ' || r.เงียบ || ' วัน)'
                          else 'ไม่ได้ติดต่อ ' || r.เงียบ || ' วัน' end),
         'dealer_prospects', r.id::text) then n := n + 1; end if;
  end loop;

  -- H8 ใบค่าแฟรนไชส์รอคำตอบนาน (เกณฑ์เดิม alerts.proposalAwaiting.days · ไม่ได้ตั้ง = 7 วัน)
  --   นับจากวันที่เสนอ · ไม่ได้กรอก นับจากแก้ล่าสุด (ส่งแล้วเนื้อหาล็อก) · ผู้สนใจที่จบแล้วไม่ตาม · เลยวันมีผลอยู่อีกเรื่อง
  for r in
    select p.*, dp.name as prospect_name,
           (วันนี้ - coalesce(p.proposed_date, (p.updated_at at time zone 'Asia/Bangkok')::date)) as รอ
      from dealer_package_proposals p join dealer_prospects dp on dp.id = p.prospect_id
     where p.status = 'sent' and dp.status not in ('won', 'lost')
       and not (p.valid_until is not null and p.valid_until < วันนี้)
       and (วันนี้ - coalesce(p.proposed_date, (p.updated_at at time zone 'Asia/Bangkok')::date)) >= v_await
  loop
    if _notify('proposal_awaiting', null, r.id::text,
         jsonb_build_object('proposal', r.id, 'proposal_no', r.proposal_no, 'name', r.prospect_name, 'days', r.รอ),
         'dealer_package_proposals', r.id::text) then n := n + 1; end if;
  end loop;

  -- H8 ใบค่าแฟรนไชส์เลยวันมีผล — ปกติงานตั้งเวลา expire-dealer-proposals ปิดใบเป็น "หมดอายุ" แล้วตัวดักแจ้ง
  --   ตรงนี้กันกรณีงานนั้นยังไม่ได้รัน (ใบยังส่งแล้วอยู่แต่เลยวัน) · กุญแจเดียวกับตัวดัก = ไม่ซ้ำ
  for r in
    select p.*, dp.name as prospect_name from dealer_package_proposals p join dealer_prospects dp on dp.id = p.prospect_id
     where p.status = 'sent' and dp.status not in ('won', 'lost') and p.valid_until is not null and p.valid_until < วันนี้
  loop
    if _notify('proposal_expired', null, r.id::text,
         jsonb_build_object('proposal', r.id, 'proposal_no', r.proposal_no, 'name', r.prospect_name, 'valid_until', to_char(r.valid_until, 'DD/MM/YYYY')),
         'dealer_package_proposals', r.id::text) then n := n + 1; end if;
  end loop;
  return n;
end $$;
revoke all on function public.notifications_scan(timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.notifications_scan(timestamptz) to service_role;
