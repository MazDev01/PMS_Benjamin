-- ── ใบ 0239: กระดิ่ง/อีเมล/ข้อความของระบบแสดงปี พ.ศ. (บอสสั่ง 22 ต.ค. 69) ─────────────────────────────────────────────
--
-- ปัญหา: ข้อความที่ฐานสร้าง (กระดิ่ง · อีเมล · เหตุผลหมดอายุ · ข้อความปฏิเสธ) ใช้ to_char(…, 'DD/MM/YYYY') = ปี ค.ศ. (22/10/2026)
--   ขณะที่หน้าเว็บแสดงปี พ.ศ. ทุกที่ (lib/thaiDate.ts) — ผู้ใช้เห็นปีสองแบบปนกัน
-- ทางแก้: ฟังก์ชันกลาง th_date / th_datetime (วว/ดด/ปี พ.ศ. · เวลาไทย) แล้วนิยามฟังก์ชันที่แสดงวันที่ใหม่ทั้งหมด
--   ไล่จาก "นิยามล่าสุดในฐาน" (pg_get_functiondef หลังลงใบถึง 0238) ไม่ใช่จากไฟล์ใบ — เจอ 12 จุดใน 7 ฟังก์ชัน
--   (บอสนับ 14 จากไฟล์ 0231 = 6 + 0236 = 8 · ฟังก์ชันใน 0231 ถูก 0236 เขียนทับบางตัว · บางจุดอยู่ในใบอื่น)
--   นิยามแต่ละฟังก์ชันด้านล่าง = นิยามล่าสุดในฐานทุกตัวอักษร เปลี่ยนเฉพาะ to_char วันที่แสดง → th_date / th_datetime
--   ไม่แตะ 'YYYY' ในเลขที่เอกสาร (Q-RYG-2026-0001 · RQ-… · HQ-…) และวันที่แบบ ISO ที่ใช้เทียบ/เก็บ (YYYY-MM-DD)
-- ข้อความที่สร้างไปแล้วก่อนลงใบ (กระดิ่งเก่า · เหตุผลหมดอายุที่บันทึกไว้) ไม่ย้อนแก้ — เป็นบันทึกเหตุการณ์ ณ วันนั้น
-- ตัวตรวจในรอบตรวจเต็ม: supabase/tests/thai_year_display.sql (อ่าน pg_get_functiondef ทุกฟังก์ชัน · ห้ามรูปแบบปีที่แสดงเป็น ค.ศ.)

-- ═══ 1. ฟังก์ชันกลาง ═══════════════════════════════════════════════════════════════
create or replace function public.th_date(d date) returns text
  language sql immutable set search_path to 'public' as $$
  select case when d is null then null
              else to_char(d, 'DD/MM/') || (extract(year from d)::int + 543)::text end
$$;
comment on function public.th_date(date) is 'วันที่แสดงผล วว/ดด/ปี พ.ศ. (0239) — ข้อความทุกที่ที่ฐานสร้างต้องใช้ตัวนี้ ห้าม to_char(…, ''DD/MM/YYYY'')';
create or replace function public.th_datetime(t timestamptz) returns text
  language sql stable set search_path to 'public' as $$
  select case when t is null then null
              else th_date((t at time zone 'Asia/Bangkok')::date) || ' ' || to_char(t at time zone 'Asia/Bangkok', 'HH24:MI') end
$$;
comment on function public.th_datetime(timestamptz) is 'วันเวลาแสดงผล วว/ดด/ปี พ.ศ. ชม:นาที ตามเวลาไทย (0239)';
-- ใช้ในฟังก์ชันที่รันด้วยสิทธิ์ผู้เรียก (ตัวดักของใบค่าแฟรนไชส์) ด้วย → ผู้ใช้ที่ล็อกอินต้องเรียกได้ · ฟังก์ชันคำนวณล้วน ไม่อ่านตาราง
revoke all on function public.th_date(date) from public, anon, authenticated, service_role;
revoke all on function public.th_datetime(timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.th_date(date) to authenticated, service_role;
grant execute on function public.th_datetime(timestamptz) to authenticated, service_role;

-- ═══ 2. ฟังก์ชันที่แสดงวันที่ (นิยามล่าสุด · เปลี่ยนเฉพาะวันที่แสดง) ═══════════════════════════════
CREATE OR REPLACE FUNCTION public._quote_request_mail_lines(r quote_requests)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select 'เลขคำขอ: ' || r.request_no || E'\n'
      || 'ดีลเลอร์: ' || r.dealer_code || coalesce(' · ' || (select d.name from dealers d where d.code = r.dealer_code), '') || E'\n'
      || 'ลูกค้าเป้าหมาย: ' || coalesce((select nullif(l.company, '') from leads l where l.dealer_code = r.dealer_code and l.num_id = r.lead_num_id), '—') || E'\n'
      || 'งานที่ขอ: ' || coalesce(nullif(r.product, ''), '—') || case when r.subtype <> '' then ' · ' || r.subtype else '' end || E'\n'
      || 'จังหวัดหน้างาน: ' || coalesce(nullif(r.province, ''), '—') || E'\n'
      || 'กำหนดส่งใบ HQ: ' || th_datetime(r.due_at) || ' น.'
$function$;

CREATE OR REPLACE FUNCTION public.dealer_package_proposals_before_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  y int;
  n int;
  p public.dealer_package_proposals;
  วันนี้ date := (now() at time zone 'Asia/Bangkok')::date;
begin
  if tg_op = 'INSERT' then
    new.closed_at := null; new.close_reason := null;
    -- ใบใหม่เริ่มได้ที่ร่าง หรือออกแล้วส่งทันที · ข้ามไปตอบรับ/ปฏิเสธ/หมดอายุตั้งแต่สร้างไม่ได้ (เดิมไม่ได้กันตอนสร้าง)
    if new.status not in ('draft', 'sent') then
      raise exception 'proposal_status: ใบค่าแฟรนไชส์ใหม่ต้องเริ่มที่ร่างหรือส่งแล้ว (ได้ %)', new.status;
    end if;
    if new.supersedes_id is null then
      new.version := 1;
      y := extract(year from (now() at time zone 'Asia/Bangkok'))::int;
      insert into dealer_proposal_counters(year, next_no) values (y, 2)
        on conflict (year) do update set next_no = dealer_proposal_counters.next_no + 1
        returning next_no - 1 into n;
      new.proposal_no := 'DP-' || y || '-' || lpad(n::text, 4, '0');
    else
      -- เวอร์ชันใหม่: ต่อจากใบล่าสุดของสาย ที่ส่งแล้ว/ปฏิเสธ/หมดอายุ · ห้ามมีร่างเวอร์ชันใหม่ค้าง
      select * into p from dealer_package_proposals where id = new.supersedes_id for update;
      if not found or p.prospect_id is distinct from new.prospect_id then
        raise exception 'proposal_version: ใบต้นทางไม่ใช่ของผู้สนใจรายนี้';
      end if;
      if exists (select 1 from dealer_package_proposals c where c.supersedes_id = p.id and c.status = 'draft') then
        raise exception 'proposal_draft_exists: ใบ % มีร่างเวอร์ชันใหม่ค้างอยู่แล้ว — แก้ร่างนั้นต่อ', p.proposal_no;
      end if;
      if exists (select 1 from dealer_package_proposals c where c.supersedes_id = p.id) then
        raise exception 'proposal_not_latest: ใบ % มีเวอร์ชันใหม่กว่าแล้ว — ทำต่อจากใบล่าสุด', p.proposal_no;
      end if;
      if p.status not in ('sent', 'rejected', 'expired') then
        raise exception 'proposal_status: ทำเวอร์ชันใหม่ได้เฉพาะใบที่ส่งแล้ว/ปฏิเสธ/หมดอายุ (ใบ % เป็น %)', p.proposal_no, p.status;
      end if;
      if new.status <> 'draft' then
        raise exception 'proposal_status: เวอร์ชันใหม่ต้องเริ่มจากร่าง';
      end if;
      new.version := p.version + 1;
      new.proposal_no := regexp_replace(p.proposal_no, '-V\d+$', '') || '-V' || new.version;
    end if;
  else
    new.id := old.id;
    new.prospect_id := old.prospect_id;
    new.proposal_no := old.proposal_no;
    new.created_at := old.created_at;
    new.version := old.version;
    new.supersedes_id := old.supersedes_id;

    if new.status is distinct from old.status then
      if not (
           (old.status = 'draft' and new.status = 'sent')
        or (old.status = 'sent'  and new.status in ('accepted', 'rejected', 'expired', 'superseded'))
      ) then
        raise exception 'proposal_status: เปลี่ยนสถานะใบค่าแฟรนไชส์จาก % เป็น % ไม่ได้', old.status, new.status;
      end if;
      -- ถูกแทน: มีเวอร์ชันถัดไปที่ส่งแล้วจริงเท่านั้น (ระบบตั้งให้ตอนส่งเวอร์ชันใหม่)
      if new.status = 'superseded' and not exists (
        select 1 from dealer_package_proposals c where c.supersedes_id = old.id and c.status <> 'draft'
      ) then
        raise exception 'proposal_status: ตั้ง "ถูกแทนด้วยเวอร์ชันใหม่" เองไม่ได้ — ส่งเวอร์ชันใหม่แล้วระบบตั้งให้';
      end if;
      -- หมดอายุ: เลยวันยืนราคาแล้วจริงเท่านั้น · เลยแล้วตอบรับไม่ได้
      if new.status = 'expired' and not (old.valid_until is not null and old.valid_until < วันนี้) then
        raise exception 'proposal_status: ใบ % ยังไม่เลยวันยืนราคา — ยังไม่หมดอายุ', old.proposal_no;
      end if;
      if new.status = 'accepted' and old.valid_until is not null and old.valid_until < วันนี้ then
        raise exception 'proposal_expired: ใบ % เลยวันยืนราคาแล้ว (%) — ตอบรับไม่ได้ ทำเวอร์ชันใหม่', old.proposal_no, th_date(old.valid_until);
      end if;
      if new.status in ('rejected', 'expired') and btrim(coalesce(new.close_reason, '')) = '' then
        raise exception 'proposal_close_reason: ปิดใบค่าแฟรนไชส์ (%) ต้องระบุเหตุผล', new.status;
      end if;
      if new.status in ('rejected', 'expired', 'superseded') then new.closed_at := now();
      else new.close_reason := old.close_reason; new.closed_at := old.closed_at;
      end if;
    else
      new.closed_at := old.closed_at;
      if new.close_reason is distinct from old.close_reason then
        raise exception 'proposal_locked: แก้เหตุผลได้เฉพาะตอนปิดใบ';
      end if;
    end if;

    if old.status <> 'draft' and (
         new.package         is distinct from old.package
      or new.region          is distinct from old.region
      or new.province        is distinct from old.province
      or new.amount          is distinct from old.amount
      or new.contract_months is distinct from old.contract_months
      or new.annual_target   is distinct from old.annual_target
      or new.terms           is distinct from old.terms
      or new.note            is distinct from old.note
      or new.proposed_date   is distinct from old.proposed_date
      or new.valid_until     is distinct from old.valid_until
    ) then
      raise exception 'proposal_locked: ใบที่ส่งแล้วแก้เนื้อหาไม่ได้ — ทำเวอร์ชันใหม่';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.dealer_proposals_expired_notify()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if exists (select 1 from dealer_prospects where id = new.prospect_id and status not in ('won', 'lost')) then
    perform _notify('proposal_expired', null, new.id::text,
      jsonb_build_object('proposal', new.id, 'proposal_no', new.proposal_no,
        'name', (select name from dealer_prospects where id = new.prospect_id), 'valid_until', th_date(new.valid_until)),
      'dealer_package_proposals', new.id::text);
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.expire_dealer_proposals()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare n integer;
begin
  update dealer_package_proposals
     set status = 'expired', close_reason = 'หมดอายุ — เลยวันยืนราคา ' || th_date(valid_until)
   where status = 'sent' and valid_until is not null and valid_until < (now() at time zone 'Asia/Bangkok')::date;
  get diagnostics n = row_count;
  return n;
end $function$;

CREATE OR REPLACE FUNCTION public.expire_hq_linked_quotations(p_as_of date DEFAULT ((now() AT TIME ZONE 'Asia/Bangkok'::text))::date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare n integer; r record;
begin
  update quotations q
     set status = 'expired', expired_reason = 'ใบ HQ ' || h.quote_no || ' หมดอายุ (ยืนราคาถึง ' || th_date(h.valid_until) || ')'
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
end $function$;

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
         string_agg(rq.request_no || ' · ' || rq.dealer_code || ' · กำหนด ' || th_date((rq.due_at at time zone 'Asia/Bangkok')::date)
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

CREATE OR REPLACE FUNCTION public.quote_requests_notify()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare h hq_quotes;
begin
  if tg_op = 'INSERT' then
    perform _notify(case when new.supersedes_id is not null then 'request_reprice' else 'request_new' end, null,
      new.id::text, _quote_request_vars(new), 'quote_requests', new.id::text, _quote_request_mail_lines(new));
  elsif new.status = 'quoted' and old.status in ('new', 'pricing') then          -- HQ ส่งใบ (ไม่นับย้อนการตอบรับ won → quoted)
    select * into h from hq_quotes where request_id = new.id;
    perform _notify('hq_quote_sent', new.dealer_code, new.id::text, _quote_request_vars(new), 'quote_requests', new.id::text,
      'เลขใบ HQ: ' || coalesce(h.quote_no, '—') || ' (เวอร์ชัน ' || coalesce(h.version::text, '—') || ')' || E'\n'
        || 'ยืนราคาถึง: ' || coalesce(th_date(h.valid_until), '—'));
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
end $function$;
