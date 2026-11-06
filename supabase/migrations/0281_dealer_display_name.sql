-- ── ใบ 0281: ข้อความกระดิ่ง/อีเมลถึง HQ ใช้ชื่อดีลเลอร์แทนรหัส (บอสตอบ 6 พ.ย. 69 · ฉบับใหม่เท่านั้น) ─────────────────────────
--   ฝั่ง HQ แสดงชื่อดีลเลอร์แทนรหัสทุกที่บนจอ — ข้อความที่ฐานสร้างตอนแจ้งเตือน/ส่งอีเมล (ใบ 0231 · 0236 · 0239) ต้องตามด้วย
--   • _dealer_display_name(รหัส): ชื่อดีลเลอร์ · ชื่อซ้ำกับดีลเลอร์อื่น = "ชื่อ (รหัส)" เฉพาะคู่ที่ซ้ำ (ฐานจริงมี 1 คู่ จังหวัดเดียวกัน) · ไม่มีชื่อ = รหัส
--     กติกาเดียวกับหน้าเว็บ packages/shared/lib/dealerDisplayName.ts (ไม่นับแถว HQ)
--   • {dealer} ของแจ้งเตือน H1 คำขอใหม่ · H2 ขอแก้ราคา · H4 ลูกค้าตอบรับ · H6 ยกเลิกคำขอ (_quote_request_vars)
--   • อีเมลถึง HQ "ดีลเลอร์: …" (_quote_request_mail_lines) · รายการคำขอค้างเกิน 14 วัน H3 (notifications_scan · คัดจาก 0239 เปลี่ยนแค่รหัส → ชื่อ)
--   ข้อความที่เก็บไว้แล้ว (แจ้งเตือนเก่า · อีเมลที่ส่งแล้ว · บันทึกการใช้งาน · ประวัติผู้สนใจ) ไม่แก้ (บอสตอบข้อ 2)
-- ข้อทดสอบ: supabase/tests/dealer_display_name.sql

create or replace function public._dealer_display_name(p_code text) returns text
  language sql stable security definer set search_path to 'public' as $$
  select case
    when d.code is null then p_code
    when nullif(btrim(d.name), '') is null then d.code
    when exists (select 1 from dealers o where o.code <> d.code and o.code <> 'HQ' and lower(btrim(o.name)) = lower(btrim(d.name)))
      then btrim(d.name) || ' (' || d.code || ')'
    else btrim(d.name) end
    from (select p_code as c) x left join dealers d on d.code = x.c
$$;
revoke all on function public._dealer_display_name(text) from public, anon, authenticated, service_role;

-- {dealer} ของแจ้งเตือนคำขอราคา (จาก 0231 · เปลี่ยนแค่ dealer)
create or replace function public._quote_request_vars(r public.quote_requests) returns jsonb
  language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object(
    'request', r.id, 'request_no', r.request_no, 'lead', r.lead_num_id,
    'dealer', _dealer_display_name(r.dealer_code),
    'company', (select nullif(l.company, '') from leads l where l.dealer_code = r.dealer_code and l.num_id = r.lead_num_id),
    'product', nullif(btrim(coalesce(r.product, '') || case when r.subtype <> '' then ' · ' || r.subtype else '' end), ''))
$$;
revoke all on function public._quote_request_vars(public.quote_requests) from public, anon, authenticated, service_role;

-- บรรทัดในอีเมลถึง HQ (จาก 0239 · เปลี่ยนแค่บรรทัดดีลเลอร์)
create or replace function public._quote_request_mail_lines(r quote_requests) returns text
  language sql stable security definer set search_path to 'public' as $function$
  select 'เลขคำขอ: ' || r.request_no || E'
'
      || 'ดีลเลอร์: ' || _dealer_display_name(r.dealer_code) || E'
'
      || 'ลูกค้าเป้าหมาย: ' || coalesce((select nullif(l.company, '') from leads l where l.dealer_code = r.dealer_code and l.num_id = r.lead_num_id), '—') || E'
'
      || 'งานที่ขอ: ' || coalesce(nullif(r.product, ''), '—') || case when r.subtype <> '' then ' · ' || r.subtype else '' end || E'
'
      || 'จังหวัดหน้างาน: ' || coalesce(nullif(r.province, ''), '—') || E'
'
      || 'กำหนดส่งใบ HQ: ' || th_datetime(r.due_at) || ' น.'
$function$;
revoke all on function public._quote_request_mail_lines(public.quote_requests) from public, anon, authenticated, service_role;

-- สแกนแจ้งเตือน (จาก 0239 ทุกตัวอักษร · เปลี่ยนแค่รายการ H3: รหัสดีลเลอร์ → ชื่อแสดง)
CREATE OR REPLACE FUNCTION public.notifications_scan(p_now timestamp with time zone DEFAULT now())
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
         jsonb_build_object('lead', r.lead_num_id, 'quote_no', r.hq_no, 'valid_until', th_date(r.hq_valid),
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
           'expiry', th_date(r.exp), 'days', r.exp - วันนี้),
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
         string_agg(rq.request_no || ' · ' || _dealer_display_name(rq.dealer_code) || ' · กำหนด ' || th_date((rq.due_at at time zone 'Asia/Bangkok')::date)
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
           'due', th_date(r.payment_due_on), 'outstanding', to_char(r.outstanding, 'FM999,999,999,990.00')),
         'dealer_package_proposals', r.id::text) then n := n + 1; end if;
  end loop;
  -- H7 ผู้สนใจเป็นดีลเลอร์ถึงกำหนดติดตาม (ยังติดตามอยู่ · วันนัด ≤ วันนี้) — นัดใหม่ = เรื่องใหม่
  for r in
    select p.* from dealer_prospects p
     where p.status not in ('won', 'lost') and p.follow_up is not null and p.follow_up <= วันนี้
  loop
    if _notify('prospect_followup_due', null, r.id::text || ':' || r.follow_up,
         jsonb_build_object('prospect', r.id, 'name', r.name, 'due', th_date(r.follow_up),
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
         jsonb_build_object('proposal', r.id, 'proposal_no', r.proposal_no, 'name', r.prospect_name, 'valid_until', th_date(r.valid_until)),
         'dealer_package_proposals', r.id::text) then n := n + 1; end if;
  end loop;
  return n;
end $function$;

revoke all on function public.notifications_scan(timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.notifications_scan(timestamptz) to service_role;
