-- ── ใบ 0268: ตัวเลขที่ฐานสำหรับหน้า HQ ที่ปรับตามแบบ (บอสสั่ง 30 ต.ค. 69 · รอบรวมงานฐาน) ──────────────────────────
-- 1. hq_customers_page · กราฟลูกค้าตามจังหวัดครบทุกจังหวัด + "ไม่ระบุจังหวัด" (เดิมตัด 10 อันดับ + ทิ้งลูกค้าไม่มีจังหวัด → ผลรวม ≠ การ์ด)
-- 2. hq_quotations_summary · เพิ่ม byMonthSent: ใบที่ส่ง (ตามวันที่ส่ง · ไม่นับร่าง/ถูกแทนที่) เทียบ ตอบรับ (ตามวันตอบรับ) รายเดือน
--      (byMonth เดิมนับใบร่างปน และนับตามวันของรายงาน) — byMonth เดิมคงไว้ (ที่อื่นยังใช้)
-- 3. hq_pipeline_months (ใหม่) · ผลงานรายดีลเลอร์รายเดือนของหน้าภาพรวมยอดขาย
-- 4. hq_dashboard · กราฟรายเดือน "ใบที่ส่ง" ไม่นับใบร่าง (เดิมนับปน · ป้ายเปลี่ยนเป็น "ใบที่ส่ง" ตามบอสสั่ง)
-- 5. prospect_status_th · _prospect_status_th · "รอตัดสินใจ" → "รอตัดสินใจ HQ" (ชื่อขั้นตาม FLOW)
-- 6. material_estimate_accuracy · เพิ่ม by_template = % คลาดเฉลี่ยรายวัสดุ (คอลัมน์ในแม่แบบวัสดุ ตาม FLOW)
-- ข้อทดสอบ: supabase/tests/hq_pages_monthly.sql
-- คัดตัวฟังก์ชัน 1–2 จาก 0260 (ฉบับล่าสุด) แล้วแก้เฉพาะจุดที่บอก — ส่วนอื่นเหมือนเดิมทุกบรรทัด

-- ═══ 1 · hq_customers_page (จาก 0260) ═══
create or replace function public.hq_customers_page(
  p_search        text default null,
  p_dealer_code   text default null,
  p_provinces     text[] default null,
  p_building_type text default null,
  p_bought_from   date default null,
  p_bought_to     date default null,
  p_limit         int default 50,
  p_offset        int default 0
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  result jsonb;
  s text := nullif(btrim(coalesce(p_search, '')), '');
begin
  if not is_hq() then
    raise exception 'forbidden: HQ only';
  end if;

  with subtype_map(subtype, parent) as (
    values
      ('โกดังเก็บสินค้าทั่วไป','โกดังสำเร็จรูป'), ('โกดังเก็บสินค้าเกษตร','โกดังสำเร็จรูป'),
      ('โกดังห้องเย็น','โกดังสำเร็จรูป'), ('คลังกระจายสินค้า','โกดังสำเร็จรูป'), ('โกดังเก็บวัตถุดิบ','โกดังสำเร็จรูป'),
      ('โรงงานอาหาร','โรงงาน'), ('โรงงานผลิตเหล็ก','โรงงาน'), ('โรงงานพลาสติก','โรงงาน'),
      ('โรงงานสิ่งทอ','โรงงาน'), ('โรงงานอิเล็กทรอนิกส์','โรงงาน'), ('โรงงานยา','โรงงาน'), ('โรงงานทั่วไป','โรงงาน'),
      ('อาคารสำนักงาน','อาคารสำเร็จรูปทุกประเภท'), ('โชว์รูม','อาคารสำเร็จรูปทุกประเภท'),
      ('อาคารพาณิชย์','อาคารสำเร็จรูปทุกประเภท'), ('อาคารเรียน','อาคารสำเร็จรูปทุกประเภท'), ('สถานพยาบาล','อาคารสำเร็จรูปทุกประเภท'),
      ('ออกแบบเฉพาะโครงการ','งานตามแบบของลูกค้า'), ('อาคารผสมผสาน','งานตามแบบของลูกค้า'), ('งานโครงสร้างพิเศษ','งานตามแบบของลูกค้า'),
      ('ปรับปรุงโกดังเดิม','งานรีโนเวท'), ('ต่อเติมอาคาร','งานรีโนเวท'), ('เปลี่ยนหลังคา','งานรีโนเวท'), ('เสริมโครงสร้าง','งานรีโนเวท'),
      ('โรงยิมอเนกประสงค์','สนามกีฬาในร่ม'), ('สนามแบดมินตัน','สนามกีฬาในร่ม'),
      ('สนามบาสเกตบอล','สนามกีฬาในร่ม'), ('สระว่ายน้ำในร่ม','สนามกีฬาในร่ม')
  ),
  -- ใบที่ลูกค้าตอบรับ (won) แต่ละใบ — พก dealer_code ติดมาด้วยเสมอ (customer_id เป็นเลขต่อสาขา)
  won_quotes as (
    select
      q.customer_id,
      q.dealer_code,
      coalesce(q.total_value, 0) as total_value,
      coalesce(sm.parent, nullif(q.building_type, '')) as building_type,
      case when sm.parent is not null then q.building_type else null end as template,
      _q_report_date(q.status::text, q.won_at, q.date) as won_date   -- วันที่ลูกค้าตอบรับ (0260 · เดิมใช้วันออกใบ)
    from quotations q
    left join subtype_map sm on sm.subtype = q.building_type
    where q.status = 'won' and q.customer_id is not null
  ),
  -- ยอดซื้อรวม = ผลรวมใบที่ตอบรับ "ทุกใบ" (ไม่ตัดใบที่วันที่ไม่ใช่รูปแบบ ISO — ต้องตรงกับแท็บประวัติที่นับทุกใบ won)
  cust_total as (
    select dealer_code, customer_id, sum(total_value) as total_value
    from won_quotes
    group by dealer_code, customer_id
  ),
  won_quotes_d as (
    select * from won_quotes where won_date is not null
  ),
  cust_agg as (
    select
      dealer_code,
      customer_id,
      coalesce(array_agg(distinct building_type) filter (where building_type is not null), '{}') as building_types,
      coalesce(array_agg(distinct template) filter (where template is not null), '{}') as templates,
      max(won_date) as last_purchase_at,
      count(*) as building_count
    from won_quotes_d
    group by dealer_code, customer_id
  ),
  base as (
    select
      c.id, c.company as name, c.dealer_code, coalesce(d.name, c.dealer_code) as dealer_name,
      c.province,
      coalesce(ct.total_value, 0) as total_value,   -- กติกาเดียวกับแท็บประวัติ: รวมใบ won (ไม่อ่าน customers.total_value)
      c.name as contact, c.phone, c.email, c.address,
      coalesce(ca.building_types, '{}') as building_types,
      coalesce(ca.templates, '{}') as templates,
      ca.last_purchase_at,
      coalesce(ca.building_count, 0) > 1 as is_repeat
    from customers c
    left join dealers d on d.code = c.dealer_code
    left join cust_total ct on ct.customer_id = c.id and ct.dealer_code = c.dealer_code
    left join cust_agg ca on ca.customer_id = c.id and ca.dealer_code = c.dealer_code
  ),
  filtered as (
    select * from base b
    where
      (s is null or b.name ilike '%'||s||'%' or b.province ilike '%'||s||'%')
      and (p_dealer_code is null or b.dealer_code = p_dealer_code)
      and (p_provinces is null or b.province = any(p_provinces))
      and (p_building_type is null or p_building_type = any(b.building_types))
      and (p_bought_from is null or b.last_purchase_at >= p_bought_from)
      and (p_bought_to   is null or b.last_purchase_at <= p_bought_to)
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'kpi', (select jsonb_build_object(
      'total', count(*),
      'active', count(*) filter (where last_purchase_at is not null and last_purchase_at >= (current_date - interval '12 months')),
      'revenue', coalesce(sum(total_value), 0),
      'repeat', count(*) filter (where is_repeat)
    ) from filtered),
    'charts', jsonb_build_object(
      'byType', (select coalesce(jsonb_agg(jsonb_build_object('label', t, 'value', cnt) order by cnt desc), '[]'::jsonb)
        from (select unnest(building_types) as t, count(*) as cnt from filtered group by 1) x),
      'bySubtype', (select coalesce(jsonb_agg(jsonb_build_object('label', t, 'value', cnt) order by cnt desc), '[]'::jsonb)
        from (select unnest(templates) as t, count(*) as cnt from filtered group by 1) x),
      'byProvince', (select coalesce(jsonb_agg(jsonb_build_object('label', province, 'value', cnt) order by cnt desc), '[]'::jsonb)
        -- ครบทุกจังหวัด + "ไม่ระบุจังหวัด" (0268) → ผลรวม = ลูกค้าทั้งหมด = ผลรวมตามดีลเลอร์ = จำนวนแถวตาราง (เดิมตัด 10 อันดับ + ทิ้งลูกค้าไม่มีจังหวัด)
        from (select coalesce(nullif(btrim(province), ''), 'ไม่ระบุจังหวัด') as province, count(*) as cnt from filtered group by 1) x),
      'byDealer', (select coalesce(jsonb_agg(jsonb_build_object('code', dealer_code, 'name', dealer_name, 'value', cnt) order by cnt desc), '[]'::jsonb)
        from (select dealer_code, dealer_name, count(*) as cnt from filtered group by 1, 2) x),
      'revenueByDealer', (select coalesce(jsonb_agg(jsonb_build_object('code', dealer_code, 'revenue', rev) order by rev desc), '[]'::jsonb)
        from (select dealer_code, sum(total_value) as rev from filtered group by 1) x)
    ),
    'rows', (select coalesce(jsonb_agg(row_to_json(p)), '[]'::jsonb) from (
      select id, name, dealer_code, dealer_name, province, total_value, building_types, templates,
             last_purchase_at, contact, phone, email, address
      from filtered
      order by total_value desc, id asc
      limit p_limit offset p_offset
    ) p)
  ) into result;

  return result;
end $$;

-- ═══ 2 · hq_quotations_summary (จาก 0260) ═══
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
      case when date ~ '^\d{4}-\d{2}-\d{2}' then substring(date, 1, 10)::date end as qdate,   -- วันออกใบ (ใบล่าสุด · อายุใบ)
      extract(year  from _q_report_date(status::text, won_at, date))::int as y,     -- ใบตอบรับ = เดือนที่ตอบรับ (0260)
      extract(month from _q_report_date(status::text, won_at, date))::int as mo,
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
      and (p_date_start    is null or _q_report_date(status::text, won_at, date) >= p_date_start)   -- ใบตอบรับ = ตามวันตอบรับ (0260)
      and (p_date_end      is null or _q_report_date(status::text, won_at, date) <= p_date_end)
  )
  select jsonb_build_object(
    -- ใบที่ส่ง (ตามวันที่ส่ง · ไม่นับร่าง/ถูกแทนที่) เทียบ ตอบรับ (ตามวันลูกค้าตอบรับ) รายเดือน (0268)
    --   กติกาเดียวกับการ์ด kpi_cards('hq.quotations') "ส่งลูกค้าในช่วงนี้" / "ตอบรับ" · ไม่นับใบของ HQ · ตัวกรองสาขา/คำค้นชุดเดียวกับ f
    'byMonthSent', coalesce((select jsonb_agg(x order by x.y, x.m) from (
        select y, m, sum(sent)::int as sent, sum(won)::int as won from (
          select extract(year from substring(q.date, 1, 10)::date)::int as y, extract(month from substring(q.date, 1, 10)::date)::int - 1 as m, 1 as sent, 0 as won
            from quotations q
           where q.status in ('sent_to_client', 'won', 'lost', 'expired') and q.date ~ '^\d{4}-\d{2}-\d{2}'
             and (p_date_start is null or substring(q.date, 1, 10)::date >= p_date_start) and (p_date_end is null or substring(q.date, 1, 10)::date <= p_date_end)
             and coalesce(q.dealer_code, 'CNX') <> 'HQ'
             and (p_dealer_codes is null or coalesce(q.dealer_code, 'CNX') = any(p_dealer_codes))
             and (p_search is null or q.id ilike '%' || p_search || '%' or q.customer ilike '%' || p_search || '%'
                  or coalesce(q.dealer_code, 'CNX') = any(coalesce(p_search_dealers, array[]::text[])))
          union all
          select extract(year from _q_report_date('won', q.won_at, q.date))::int, extract(month from _q_report_date('won', q.won_at, q.date))::int - 1, 0, 1
            from quotations q
           where q.status = 'won' and q.date ~ '^\d{4}-\d{2}-\d{2}'
             and (p_date_start is null or _q_report_date('won', q.won_at, q.date) >= p_date_start) and (p_date_end is null or _q_report_date('won', q.won_at, q.date) <= p_date_end)
             and coalesce(q.dealer_code, 'CNX') <> 'HQ'
             and (p_dealer_codes is null or coalesce(q.dealer_code, 'CNX') = any(p_dealer_codes))
             and (p_search is null or q.id ilike '%' || p_search || '%' or q.customer ilike '%' || p_search || '%'
                  or coalesce(q.dealer_code, 'CNX') = any(coalesce(p_search_dealers, array[]::text[])))
        ) u group by y, m) x), '[]'::jsonb),
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

-- ═══ 3 · hq_pipeline_months (ใหม่) — ผลงานรายดีลเลอร์รายเดือน: แท็บ "รายเดือน" + ที่มารายเดือนของการ์ดตอนเลือกดีลเลอร์ ═══
--   กติกาเดียวกับ hq_pipeline_dealers (0264) ทุกตัว แต่แยกเดือนตามวันของเรื่องนั้น (ลีด = วันเข้ามา · ใบ = วันที่ส่ง · ยอดขาย/ส่วนต่าง = วันตอบรับ)
--   เดือนต้น/ท้ายตัดตามช่วง → ผลรวมทุกเดือนของทุกดีลเลอร์ = แถวรวม hq_pipeline_dealers = การ์ด (ยอดขาย · ลีด · ใบที่ส่ง · ปิดได้/ไม่ได้ · ส่วนต่าง)
--   annualTarget = เป้าทั้งปีของสาขา (หน้าเว็บแสดงเป้ารายเดือน = เป้าทั้งปี ÷ 12 ตามแบบ)
create or replace function public.hq_pipeline_months(p_start date, p_end date, p_dealers text[] default null)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not is_hq() then raise exception 'forbidden: เฉพาะสำนักงานใหญ่'; end if;
  if p_start is null or p_end is null or p_end < p_start then raise exception 'bad_range: ช่วงเวลาไม่ถูกต้อง'; end if;
  return coalesce((
    with ดีล as (select d.code, nullif(coalesce(d.revenue_target, 0), 0) as annual from dealers d
                 where d.code <> 'HQ' and (p_dealers is null or d.code = any(p_dealers))),
    เรื่อง as (
      select l.dealer_code as code, date_trunc('month', l.created_date)::date as mo, 1 as leads, 0 as quotes,
             (l.status = 'PAID')::int as won, (l.status = 'CANCELLED')::int as lost, 0::numeric as sales, 0::numeric as msale, 0::numeric as mcost, 0 as mq
        from leads l join ดีล on ดีล.code = l.dealer_code where l.created_date between p_start and p_end
      union all
      select q.dealer_code, date_trunc('month', _q_report_date('sent', null, q.date))::date, 0, 1, 0, 0, 0, 0, 0, 0
        from quotations q join ดีล on ดีล.code = q.dealer_code
       where q.status::text not in ('draft', 'superseded') and _q_report_date('sent', null, q.date) between p_start and p_end
      union all
      select ดีล.code, date_trunc('month', w.d)::date, 0, 0, 0, 0, w.value, 0, 0, 0
        from ดีล cross join lateral _kpi_won(ดีล.code) w where w.d between p_start and p_end
      union all
      select q.dealer_code, date_trunc('month', (w.won_at at time zone 'Asia/Bangkok')::date)::date, 0, 0, 0, 0, 0, q.total_value, h.total_cost, 1
        from quotations q join ดีล on ดีล.code = q.dealer_code join hq_quotes h on h.id = q.hq_quote_id
        join quotation_won_at w on w.dealer_code = q.dealer_code and w.quote_id = q.id
       where q.status = 'won' and (w.won_at at time zone 'Asia/Bangkok')::date between p_start and p_end)
    select jsonb_agg(jsonb_build_object(
             'code', g.code, 'y', extract(year from g.mo)::int, 'm', extract(month from g.mo)::int - 1,
             'leads', g.leads, 'quotes', g.quotes, 'won', g.won, 'lost', g.lost, 'sales', g.sales,
             'marginSale', g.msale, 'marginCost', g.mcost, 'marginQuotes', g.mq, 'annualTarget', ดีล.annual)
           order by g.mo, g.code)
      from (select code, mo, sum(leads)::int as leads, sum(quotes)::int as quotes, sum(won)::int as won, sum(lost)::int as lost,
                   sum(sales) as sales, sum(msale) as msale, sum(mcost) as mcost, sum(mq)::int as mq
              from เรื่อง group by code, mo) g
      join ดีล on ดีล.code = g.code), '[]'::jsonb);
end $$;
revoke all on function public.hq_pipeline_months(date, date, text[]) from public, anon, authenticated, service_role;
grant execute on function public.hq_pipeline_months(date, date, text[]) to authenticated;

-- ═══ 4 · hq_dashboard (จาก 0235) — กราฟรายเดือน "ใบที่ส่ง" ไม่นับร่าง/ถูกแทนที่ ═══
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
    from (select id, "user", action, target, at from audit_log a
           where (a.at at time zone 'Asia/Bangkok')::date between p_start and p_end
             and a.action !~ 'ลูกค้าเป้าหมาย|ใบเสนอราคา|ปิดการขาย'          -- งานขายรายวันของสาขา (isDealerSalesAudit · mock.ts)
             and coalesce(a."user", '') <> 'บัญชีทดสอบชั่วคราว'             -- บัญชีชั่วคราวของ prod-live (tests/prod-live/run.mjs)
             and coalesce(a."user", '') !~* '@example\.test$|^zz'
             and coalesce(a.target, '') !~* 'ZZTEST|ZZLOAD|ZZE2E'
             and coalesce(a.target, '') !~ '(^|[ →])ZZ[A-Z0-9]*( |$)'       -- สาขาทดสอบ ZZ*
           order by a.at desc, a.id desc limit 50) x;

  return jsonb_build_object('today', งานวันนี้, 'cards', การ์ด, 'top', อันดับ, 'trend', แนวโน้ม,
    'monthly', รายเดือน, 'monthlyTarget', case when เป้าปี is null then null else round(เป้าปี / 12) end,
    'regions', ภาค, 'dealerCount', จำนวนดีลเลอร์, 'activity', กิจกรรม);
end $$;

-- ═══ 5 · ชื่อขั้นผู้สนใจในฐาน = "รอตัดสินใจ HQ" (จาก 0184 · 0240) ═══
CREATE OR REPLACE FUNCTION public.prospect_status_th(s text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case s
    when 'new' then 'รอติดต่อ'           when 'contacted' then 'ติดต่อแล้ว'
    when 'profile_sent' then 'ส่งข้อมูลบริษัทแล้ว' when 'meeting' then 'นัดคุยแล้ว'
    when 'considering' then 'รอตัดสินใจ HQ'  when 'won' then 'เป็นดีลเลอร์แล้ว'
    when 'lost' then 'ไม่สำเร็จ'          else s end
$function$;

create or replace function public._prospect_status_th(s text) returns text
language sql immutable set search_path = public as $$
  select case s when 'new' then 'รอติดต่อ' when 'contacted' then 'ติดต่อแล้ว' when 'profile_sent' then 'ส่งข้อมูลบริษัทแล้ว'
    when 'meeting' then 'นัดคุยแล้ว' when 'considering' then 'รอตัดสินใจ HQ' when 'won' then 'เป็นดีลเลอร์แล้ว'
    when 'lost' then 'ไม่สำเร็จ' else s end;
$$;

-- ═══ 6 · material_estimate_accuracy (จาก 0244) + by_template: % คลาดเฉลี่ยรายวัสดุ ═══
create or replace function public.material_estimate_accuracy() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare ผล jsonb;
begin
  if not is_hq() then raise exception 'forbidden: เฉพาะสำนักงานใหญ่'; end if;
  select jsonb_build_object('n', count(*), 'avg_abs_pct', round(avg(abs(estimate_deviation_pct)), 1), 'avg_pct', round(avg(estimate_deviation_pct), 1))
    into ผล from quote_requests where estimate_deviation_pct is not null;
  -- รายวัสดุ (0268): คำขอหนึ่งนับครั้งเดียวต่อวัสดุ แม้เลือกวัสดุเดิมหลายบรรทัด
  return ผล || jsonb_build_object('by_template', coalesce((
    select jsonb_agg(jsonb_build_object('id', t.id, 'n', t.n, 'avg_pct', t.avg_pct) order by t.id)
      from (select (i ->> 'templateId')::bigint as id, count(distinct r.id) as n, round(avg(r.estimate_deviation_pct), 1) as avg_pct
              from quote_requests r cross join lateral (select distinct on (x ->> 'templateId') x as i from jsonb_array_elements(r.estimate_items) x) e
             where r.estimate_deviation_pct is not null and (i ->> 'templateId') ~ '^\d+$'
             group by 1) t), '[]'::jsonb));
end $$;
