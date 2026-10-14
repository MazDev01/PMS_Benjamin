-- ── ระหว่าง "รอราคา HQ" ไม่นับว่าลูกค้าเป้าหมายนิ่ง (FLOW.html ขั้น 4–6 · ด่าน 1) ──────────────────────────────
--
-- FLOW.html: "ขั้น 4–6 คือช่วงที่ลูกบอลอยู่ที่ HQ ระบบจึงนับ 14 วันเฉพาะช่วงนี้ และไม่เตือนดีลเลอร์ว่า lead นิ่ง"
-- เดิมทุกจุดที่นับ "ค้างติดต่อ" ตัดเฉพาะปิดการขายแล้ว — รายที่รอราคา HQ จึงขึ้นเป็นค้างติดต่อทั้งที่ดีลเลอร์ทำอะไรไม่ได้
-- แก้ 3 จุดที่ฐานข้อมูลนับเอง (ตัวกรองค้างติดต่อของหน้ารายการ · ตัวเลขค้างติดต่อรายสาขา · แจ้งเตือนลูกค้าเป้าหมายนิ่งของ HQ)
--   ฝั่งหน้าจอแก้ที่ needsFollowUp() ในแพ็กเกจกลาง · นิยามเดิมทุกบรรทัด แก้เฉพาะรายการสถานะที่ไม่นับ
-- สิทธิ์เรียกคำสั่งไม่เปลี่ยน (create or replace คงสิทธิ์เดิม)

CREATE OR REPLACE FUNCTION public.leads_page(p_limit integer, p_offset integer, p_status text DEFAULT NULL::text, p_dealer_codes text[] DEFAULT NULL::text[], p_province text DEFAULT NULL::text, p_product text DEFAULT NULL::text, p_source text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_date_start date DEFAULT NULL::date, p_date_end date DEFAULT NULL::date, p_overdue boolean DEFAULT false, p_as_of date DEFAULT '2026-06-30'::date, p_default_days integer DEFAULT 7, p_follow_up_days jsonb DEFAULT NULL::jsonb, p_skip_count boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with f as (
    select * from leads
    where (created_date is null or p_date_start is null or created_date >= p_date_start)
      and (created_date is null or p_date_end   is null or created_date <= p_date_end)
      and (p_status        is null or status = p_status::lead_status)
      and (p_dealer_codes  is null or coalesce(dealer_code, 'CNX') = any(p_dealer_codes))
      and (p_province      is null or province = p_province)
      and (p_product       is null or product = p_product)
      and (p_source        is null or coalesce(nullif(source, ''), 'ไม่ระบุ') = p_source)
      and (p_search is null
           or company ilike '%'||p_search||'%' or contact ilike '%'||p_search||'%'
           or province ilike '%'||p_search||'%' or product ilike '%'||p_search||'%'
           or assigned ilike '%'||p_search||'%' or id ilike '%'||p_search||'%'
           or dealer_code ilike '%'||p_search||'%')
      and (not p_overdue or (
             status not in ('PAID', 'CANCELLED', 'HQ_PRICING')
             and last_contact_at is not null
             and (p_as_of - last_contact_at) > coalesce((p_follow_up_days ->> coalesce(dealer_code, 'CNX'))::int, p_default_days)))
  )
  select jsonb_build_object(
    'total', case when p_skip_count then -1 else (select count(*) from f) end,
    'rows', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_date desc nulls last, x.num_id desc, x.dealer_code)
      from (
        select * from f
        order by created_date desc nulls last, num_id desc, dealer_code
        limit p_limit offset p_offset
      ) x
    ), '[]'::jsonb)
  )
$function$;

CREATE OR REPLACE FUNCTION public.dealer_rollup(p_year integer, p_as_of date DEFAULT '2026-06-30'::date, p_default_days integer DEFAULT 7, p_follow_up_days jsonb DEFAULT NULL::jsonb)
 RETURNS TABLE(dealer_code text, quotes bigint, won bigint, lost bigint, revenue numeric, open_leads bigint, stale_leads bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with qd as (
    select
      coalesce(dealer_code, 'CNX') as dealer_code,
      status,
      total_value,
      case when date ~ '^\d{4}-\d{2}-\d{2}'
           then extract(year from substring(date, 1, 10)::date)::int end as yr
    from quotations
  ),
  q as (
    select
      dealer_code,
      count(*)                                                             as quotes,
      count(*) filter (where status = 'won')                              as won,
      count(*) filter (where status = 'lost')                             as lost,
      coalesce(sum(total_value) filter (where status = 'won' and yr = p_year), 0) as revenue
    from qd
    group by dealer_code
  ),
  l as (
    select
      coalesce(dealer_code, 'CNX') as dealer_code,
      count(*) filter (where status not in ('PAID', 'CANCELLED')) as open_leads,
      count(*) filter (where status not in ('PAID', 'CANCELLED', 'HQ_PRICING')
        and last_contact_at is not null
        and (p_as_of - last_contact_at) > coalesce((p_follow_up_days ->> coalesce(dealer_code, 'CNX'))::int, p_default_days)
      ) as stale_leads
    from leads
    group by coalesce(dealer_code, 'CNX')
  )
  select
    coalesce(q.dealer_code, l.dealer_code)          as dealer_code,
    coalesce(q.quotes, 0)                           as quotes,
    coalesce(q.won, 0)                              as won,
    coalesce(q.lost, 0)                             as lost,
    coalesce(q.revenue, 0)                          as revenue,
    coalesce(l.open_leads, 0)                       as open_leads,
    coalesce(l.stale_leads, 0)                      as stale_leads
  from q
  full outer join l on q.dealer_code = l.dealer_code;
$function$;

CREATE OR REPLACE FUNCTION public.hq_alerts(p_as_of date DEFAULT '2026-06-30'::date, p_unassigned_default_hours integer DEFAULT 48, p_unassigned_per_dealer jsonb DEFAULT NULL::jsonb, p_lead_idle_days integer DEFAULT 30, p_quote_validity_days integer DEFAULT 30, p_quote_expiring_days integer DEFAULT 7, p_dealer_idle_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  select jsonb_build_object(
    -- 1) ลีดไร้ผู้รับผิดชอบ (รายใบ)
    'unassigned', coalesce((select jsonb_agg(x order by x.num_id) from (
        select num_id, dealer_code, coalesce(nullif(company,''), name) as company, province, value
        from leads
        where (assigned is null or btrim(assigned) = '')
          and status not in ('PAID','CANCELLED')
          and created_date is not null
          and (p_as_of - created_date) * 24
              > coalesce((p_unassigned_per_dealer ->> coalesce(dealer_code,'CNX'))::int, p_unassigned_default_hours)
      ) x), '[]'::jsonb),
    -- 2) ลีดเงียบ (ไม่ติดต่อเกินเกณฑ์ HQ)
    'idle', coalesce((select jsonb_agg(x order by x.idle_days desc) from (
        select num_id, dealer_code, coalesce(nullif(company,''), name) as company, assigned,
               (p_as_of - last_contact_at) as idle_days
        from leads
        where status not in ('PAID','CANCELLED','HQ_PRICING')
          and last_contact_at is not null
          and (p_as_of - last_contact_at) > p_lead_idle_days
      ) x), '[]'::jsonb),
    -- 3) ใบเสนอราคาใกล้หมดอายุ (ส่งแล้ว)
    'expiring', coalesce((select jsonb_agg(x order by x.days_left) from (
        select id as quote_no, customer, total_value as value, dealer_code,
               (substring(date,1,10)::date + p_quote_validity_days - p_as_of) as days_left
        from quotations
        where status = 'sent_to_client'
          and date ~ '^\d{4}-\d{2}-\d{2}'
          and (substring(date,1,10)::date + p_quote_validity_days - p_as_of) between 0 and p_quote_expiring_days
      ) x), '[]'::jsonb),
    -- 4) วันใบล่าสุดรายสาขา (client → idleDealers) — key = dealer_code ดิบ (null ไม่ผูกสาขาใด = ตรงกับ JS)
    'dealer_latest', coalesce((select jsonb_agg(x) from (
        select dealer_code,
               (p_as_of - max(substring(date,1,10)::date)) as idle_days
        from quotations where date ~ '^\d{4}-\d{2}-\d{2}' and dealer_code is not null
        group by dealer_code
      ) x), '[]'::jsonb),
    -- 5) อัตราปิดไม่สำเร็จรายสาขา (client → lostRate) — key = dealer_code ดิบ (null ไม่ผูกสาขาใด)
    'lost_rate', coalesce((select jsonb_agg(x) from (
        select dealer_code,
               count(*) filter (where status = 'CANCELLED') as lost,
               count(*) filter (where status in ('PAID','CANCELLED')) as closed
        from leads where dealer_code is not null group by dealer_code
      ) x), '[]'::jsonb)
  );
$function$;
