-- ── รอบ 3 · ฉบับใหม่ ส่วนที่ 3: สรุปยอด/นับใบไม่นับใบที่ถูกแทนที่ (บอสสั่ง 21 ต.ค. 69) ─────────────────────────────────────────
--
-- ใบที่ถูกแทนที่ (V1) กับฉบับใหม่ (V2) คือข้อเสนอเดียวกัน — นับทั้งคู่ = จำนวนใบ/มูลค่าเสนอเกินจริง
-- คัดลอกนิยามปัจจุบันของ 4 คำสั่งมาทั้งตัว แล้วเพิ่มเงื่อนไข status <> 'superseded' ที่ต้นทางของแต่ละตัวเท่านั้น (ส่วนอื่นเหมือนเดิมทุกตัวอักษร)
--   ยอดขาย (ใบ won) ไม่กระทบ — ใบที่ถูกแทนที่ตอบรับไม่ได้อยู่แล้ว (0228)
-- create or replace คงสิทธิ์เรียกเดิมไว้ (0190)

-- ═══ dashboard_quote_summary ═══
CREATE OR REPLACE FUNCTION public.dashboard_quote_summary(p_start date, p_end date, p_dealer text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with f as (
    select
      status::text                                        as status,
      total_value,
      created_at,
      substring(date, 1, 10)::date                        as d,
      extract(year  from substring(date, 1, 10)::date)::int as y,
      extract(month from substring(date, 1, 10)::date)::int as mo,   -- 1..12
      coalesce(nullif(building_type, ''), nullif(project, '')) as product
    from quotations
    where status <> 'superseded'   -- ใบที่ถูกแทนที่ไม่นับ (0229)
      and date ~ '^\d{4}-\d{2}-\d{2}'
      and substring(date, 1, 10)::date between p_start and p_end
      and (p_dealer is null or coalesce(dealer_code, 'CNX') = p_dealer)
  )
  select jsonb_build_object(
    'byMonth', coalesce((select jsonb_agg(x order by x.y, x.m) from (
        select y, (mo - 1) as m,
          count(*)                                             as quotes,
          count(*) filter (where status = 'won')              as won,
          count(*) filter (where status = 'lost')             as lost,
          coalesce(sum(total_value) filter (where status = 'won'), 0) as won_val
        from f group by y, mo
      ) x), '[]'::jsonb),
    'byDay', coalesce((select jsonb_agg(x order by x.d) from (
        select to_char(d, 'YYYY-MM-DD') as d,
          count(*)                                             as quotes,
          count(*) filter (where status = 'won')              as won,
          count(*) filter (where status = 'lost')             as lost,
          coalesce(sum(total_value) filter (where status = 'won'), 0) as won_val
        from f group by d
      ) x), '[]'::jsonb),
    'byHour', coalesce((select jsonb_agg(x order by x.h) from (
        select extract(hour from (created_at at time zone 'Asia/Bangkok'))::int as h,
          count(*)                                             as quotes,
          count(*) filter (where status = 'won')              as won,
          coalesce(sum(total_value) filter (where status = 'won'), 0) as won_val
        from f where created_at is not null group by 1
      ) x), '[]'::jsonb),
    'byStatus', coalesce((select jsonb_agg(x) from (
        select status,
          count(*)                          as count,
          coalesce(sum(total_value), 0)     as value
        from f group by status
      ) x), '[]'::jsonb),
    'byProduct', coalesce((select jsonb_agg(x order by x.won_value desc, x.value desc) from (
        select product,
          coalesce(sum(total_value), 0)                                as value,
          count(*)                                                     as projects,
          coalesce(sum(total_value) filter (where status = 'won'), 0)  as won_value,
          count(*) filter (where status = 'won')                       as won_projects
        from f group by product
      ) x), '[]'::jsonb)
  );
$function$;

-- ═══ hq_quotations_summary ═══
CREATE OR REPLACE FUNCTION public.hq_quotations_summary(p_status text DEFAULT NULL::text, p_dealer_codes text[] DEFAULT NULL::text[], p_product_lines text[] DEFAULT NULL::text[], p_search text DEFAULT NULL::text, p_date_start date DEFAULT NULL::date, p_date_end date DEFAULT NULL::date, p_as_of date DEFAULT '2026-06-30'::date, p_search_dealers text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with f as (
    select
      coalesce(dealer_code, 'CNX')                          as dealer_code,
      status::text                                          as status,
      total_value,
      product_line,
      case when date ~ '^\d{4}-\d{2}-\d{2}' then substring(date, 1, 10)::date end as qdate,
      extract(year  from substring(date, 1, 10)::date)::int as y,
      extract(month from substring(date, 1, 10)::date)::int as mo,
      greatest(0, (p_as_of - substring(date, 1, 10)::date)) as aging_days
    from quotations
    where status <> 'superseded'   -- ใบที่ถูกแทนที่ไม่นับ (0229)
      and date ~ '^\d{4}-\d{2}-\d{2}'
      and (p_status        is null or status = p_status::quotation_status)
      and (p_dealer_codes  is null or coalesce(dealer_code, 'CNX') = any(p_dealer_codes))
      and (p_product_lines is null or product_line = any(p_product_lines))
      and (p_search is null
           or id ilike '%' || p_search || '%'
           or customer ilike '%' || p_search || '%'
           or coalesce(dealer_code, 'CNX') = any(coalesce(p_search_dealers, array[]::text[])))
      and (p_date_start    is null or substring(date, 1, 10)::date >= p_date_start)
      and (p_date_end      is null or substring(date, 1, 10)::date <= p_date_end)
  )
  select jsonb_build_object(
    'byDealer', coalesce((select jsonb_agg(x order by x.value desc) from (
        select dealer_code,
          count(*)                                                     as count,
          coalesce(sum(total_value), 0)                                as value,
          count(*) filter (where status <> 'draft')                    as sent,
          count(*) filter (where status = 'won')                       as won,
          count(*) filter (where status = 'lost')                      as lost,
          coalesce(sum(total_value) filter (where status = 'won'), 0)  as won_val,
          max(qdate)                                                   as latest
        from f group by dealer_code) x), '[]'::jsonb),
    'byMonth', coalesce((select jsonb_agg(x order by x.y, x.m) from (
        select y, (mo - 1) as m,
          count(*)                                                     as quotes,
          count(*) filter (where status = 'won')                       as won,
          count(*) filter (where status = 'lost')                      as lost,
          coalesce(sum(total_value) filter (where status = 'won'), 0)  as won_val
        from f group by y, mo) x), '[]'::jsonb),
    'byProduct', coalesce((select jsonb_agg(x order by x.value desc) from (
        select product_line as product,
          coalesce(sum(total_value), 0)  as value,
          count(*)                       as projects
        from f group by product_line) x), '[]'::jsonb),
    'aging', coalesce((select jsonb_agg(x) from (
        select
          case when aging_days <= 7 then '0-7'
               when aging_days <= 14 then '8-14'
               when aging_days <= 30 then '15-30'
               else '30+' end            as bucket,
          count(*)                       as count,
          coalesce(sum(total_value), 0)  as value
        from f where status = 'sent_to_client'
        group by 1) x), '[]'::jsonb)
  );
$function$;

-- ═══ network_quote_range ═══
CREATE OR REPLACE FUNCTION public.network_quote_range(p_start date, p_end date, p_dealer text DEFAULT NULL::text)
 RETURNS TABLE(dealer_code text, quotes bigint, won bigint, lost bigint, won_val numeric, quote_val numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select
    coalesce(dealer_code, 'CNX')                                   as dealer_code,
    count(*)                                                       as quotes,
    count(*) filter (where status = 'won')                        as won,
    count(*) filter (where status = 'lost')                       as lost,
    coalesce(sum(total_value) filter (where status = 'won'), 0)   as won_val,
    coalesce(sum(total_value), 0)                                 as quote_val
  from quotations
  where status <> 'superseded'   -- ใบที่ถูกแทนที่ไม่นับ (0229)
    and date ~ '^\d{4}-\d{2}-\d{2}'
    and substring(date, 1, 10)::date between p_start and p_end
    and (p_dealer is null or coalesce(dealer_code, 'CNX') = p_dealer)
  group by coalesce(dealer_code, 'CNX');
$function$;

-- ═══ dealer_rollup ═══
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
    where status <> 'superseded'   -- ใบที่ถูกแทนที่ไม่นับ (0229)
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
