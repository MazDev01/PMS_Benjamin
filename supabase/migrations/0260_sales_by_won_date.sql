-- ── ใบ 0260: ยอดขายทุกหน้านับตามวันที่ลูกค้าตอบรับ (บอสตัดสิน 29 ต.ค. 69) ───────────────────────────────────────────────
--
-- ข้อตัดสิน: ยอดขาย / ยอดรวมรายดีลเลอร์ / ยอดซื้อสะสม ทุกหน้านับตาม "วันที่ลูกค้าตอบรับ" ไม่ใช่วันออกใบ
--   ทั้งการกรองช่วงเวลาและการแยกปี · ใช้ฟังก์ชันกลางตัวเดียว
--   ตัวอย่างที่บอสให้: ใบออก ก.ย. ตอบรับ ต.ค. = ยอด ต.ค. · ใบออก ธ.ค. ปีก่อน ตอบรับ ม.ค. = ยอดปีนี้
-- ก่อนใบนี้: แดชบอร์ด HQ (0235) กับการ์ด KPI (0246/0253) ใช้วันตอบรับแล้ว (ตาราง quotation_won_at)
--   แต่อีก 6 ตัวคำนวณยังใช้วันออกใบ (quotations.date): dealer_rollup (ยอดทั้งปีเทียบเป้า) · dashboard_quote_summary
--   · hq_quotations_summary · network_quote_range · hq_customers_page (ซื้อล่าสุด/ตัวกรองช่วงที่ซื้อ) · kpi_cards 2 จุด
--   และหน้าเว็บอ่านวันตอบรับไม่ได้เลย (quotation_won_at ปิดสิทธิ์อ่านทั้งตาราง)
-- ใบนี้:
--   1) quotations.won_at = เวลาที่ลูกค้าตอบรับ — ฐานเขียนเอง (ตอนเปลี่ยนเป็นตอบรับ) · ออกจากตอบรับ = ว่าง · หน้าเว็บเขียนเองไม่ได้
--      เติมย้อนหลังจาก quotation_won_at (ค่าเดียวกับแดชบอร์ด HQ) · ใบตอบรับที่ไม่มีบันทึก = ว่าง → ใช้วันออกใบแทน (ห้ามเดา)
--   2) ฟังก์ชันกลาง _q_report_date(status, won_at, date): ใบตอบรับ = วันตอบรับ (เวลาไทย) · ใบอื่น = วันออกใบ
--      ใช้เป็น "วันที่ของแถว" ในทุกตัวคำนวณ → ยอดขาย/จำนวนตอบรับตามวันตอบรับ · จำนวนใบ/มูลค่าเสนอยังตามวันออกใบ
--      หน้าเว็บใช้ตัวเดียวกัน: lib/salesDate.ts วันที่ขายของใบ() (กติกาเดียวกันทุกตัวอักษร)
--   3) สร้าง 6 ตัวคำนวณใหม่จากนิยามล่าสุดทั้งตัว — เปลี่ยนเฉพาะนิพจน์วันที่ของแถว (สิทธิ์เรียกเดิมติดไปกับ create or replace)
-- ข้อทดสอบ: supabase/tests/sales_by_won_date.sql · tests/scenario/sales-by-won-date.spec.ts

alter table public.quotations add column if not exists won_at timestamptz;
comment on column public.quotations.won_at is
  'เวลาที่ลูกค้าตอบรับใบ (ฐานเขียนเองตอนเปลี่ยนเป็นตอบรับ · ใบ 0260) · ไม่ใช่ใบตอบรับ = ว่าง · ยอดขายทุกหน้านับตามวันนี้ (_q_report_date)';

-- ฐานเขียนเอง: เปลี่ยนเป็นตอบรับ = ตอนนี้ · ยังตอบรับอยู่ = คงค่าเดิม · ออกจากตอบรับ = ว่าง · งานกู้ข้อมูล (pms.restore) คงค่าที่ส่งมา
create or replace function public.quotations_won_at_column() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
begin
  if coalesce(current_setting('pms.restore', true), '') = '1' then return new; end if;
  if new.status = 'won' then
    new.won_at := case when tg_op = 'UPDATE' and old.status = 'won' then old.won_at else now() end;
  else
    new.won_at := null;
  end if;
  return new;
end $$;
revoke all on function public.quotations_won_at_column() from public, anon, authenticated, service_role;
drop trigger if exists quotations_won_at_column on public.quotations;
create trigger quotations_won_at_column before insert or update on public.quotations
  for each row execute function public.quotations_won_at_column();

-- เติมย้อนหลัง: ค่าเดียวกับที่แดชบอร์ด HQ ใช้ (quotation_won_at · 0235) — ไม่ผ่านตัวดักอื่นของใบ (ใบตอบรับล็อกแก้ไข)
set local session_replication_role = replica;
update public.quotations q set won_at = w.won_at
  from public.quotation_won_at w
 where w.dealer_code = q.dealer_code and w.quote_id = q.id and q.status = 'won' and q.won_at is distinct from w.won_at;
set local session_replication_role = origin;

-- ═══ ฟังก์ชันกลาง: วันที่ของแถวในรายงาน ═══
--   ใบตอบรับ = วันที่ลูกค้าตอบรับ (เวลาไทย) · ไม่มีบันทึกวันตอบรับ / ใบอื่น = วันออกใบ (quotations.date รูปแบบ YYYY-MM-DD · อื่น = ว่าง)
create or replace function public._q_report_date(p_status text, p_won_at timestamptz, p_date text) returns date
  language sql stable set search_path to 'public' as $$
  select case
    when p_status = 'won' and p_won_at is not null then (p_won_at at time zone 'Asia/Bangkok')::date
    when p_date ~ '^\d{4}-\d{2}-\d{2}' then substring(p_date, 1, 10)::date
  end
$$;
-- เวลาของแถว (กราฟรายชั่วโมง): ใบตอบรับ = เวลาตอบรับ · ใบอื่น = เวลาที่ระบบบันทึกใบ
create or replace function public._q_report_at(p_status text, p_won_at timestamptz, p_created_at timestamptz) returns timestamptz
  language sql stable set search_path to 'public' as $$
  select case when p_status = 'won' and p_won_at is not null then p_won_at else p_created_at end
$$;
-- ตัวคำนวณบางตัวเป็นแบบสิทธิ์ผู้เรียก (language sql ไม่ใช่ security definer) — ต้องให้สิทธิ์เรียกฟังก์ชันกลาง (คำนวณล้วน ไม่อ่านตาราง)
revoke all on function public._q_report_date(text, timestamptz, text) from public, anon, authenticated, service_role;
grant execute on function public._q_report_date(text, timestamptz, text) to authenticated, service_role;
revoke all on function public._q_report_at(text, timestamptz, timestamptz) from public, anon, authenticated, service_role;
grant execute on function public._q_report_at(text, timestamptz, timestamptz) to authenticated, service_role;

-- ═══ dashboard_quote_summary (จาก 0229) ═══
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
      _q_report_at(status::text, won_at, created_at)      as created_at,   -- ใบตอบรับ = เวลาตอบรับ (กราฟรายชั่วโมง · 0260)
      _q_report_date(status::text, won_at, date)          as d,             -- ใบตอบรับ = วันตอบรับ · ใบอื่น = วันออกใบ (0260)
      extract(year  from _q_report_date(status::text, won_at, date))::int as y,
      extract(month from _q_report_date(status::text, won_at, date))::int as mo,   -- 1..12
      coalesce(nullif(building_type, ''), nullif(project, '')) as product
    from quotations
    where status <> 'superseded'   -- ใบที่ถูกแทนที่ไม่นับ (0229)
      and _q_report_date(status::text, won_at, date) between p_start and p_end
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

-- ═══ hq_quotations_summary (จาก 0229) ═══
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

-- ═══ network_quote_range (จาก 0229) ═══
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
    and _q_report_date(status::text, won_at, date) between p_start and p_end   -- ใบตอบรับ = ตามวันตอบรับ (0260)
    and (p_dealer is null or coalesce(dealer_code, 'CNX') = p_dealer)
  group by coalesce(dealer_code, 'CNX');
$function$;

-- ═══ dealer_rollup (จาก 0229) ═══
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
      extract(year from _q_report_date(status::text, won_at, date))::int as yr   -- ยอดขายของปี = ปีที่ลูกค้าตอบรับ (0260)
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

-- ═══ hq_customers_page (จาก 0254) ═══
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
        from (select province, count(*) as cnt from filtered where province is not null and province <> '' group by 1 order by 2 desc limit 10) x),
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

-- ═══ kpi_cards (จาก 0253) ═══
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
      'proposalWaiting', (select count(*) from dealer_package_proposals where status = 'sent' and (ชุด is null or prospect_id::text = any(ชุด))),
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

  elsif p_page = 'hq.leads' then
    return (select jsonb_build_object(
      'open',      count(*) filter (where l.dealer_code <> 'HQ' and l.status not in ('PAID', 'CANCELLED')),
      'new',       count(*) filter (where l.dealer_code <> 'HQ' and l.created_date between ช่วงต้น and ช่วงท้าย),
      'hqWaiting', (select count(*) from leads h where h.dealer_code = 'HQ' and h.status not in ('PAID', 'CANCELLED')),
      -- ไม่เคลื่อนไหวเกิน 30 วัน = กติกาเดียวกับตัวกรอง "ค้างติดตาม" ของรายการลีด (leads_page p_overdue) ที่ 30 วัน:
      --   ยังเปิด ไม่ใช่รอราคา HQ (รอฝั่ง HQ ไม่ใช่ดีลเลอร์เงียบ) · มีวันติดต่อล่าสุด และห่างจากวันนี้เกิน 30 วัน
      'idle',      count(*) filter (where l.dealer_code <> 'HQ' and l.status not in ('PAID', 'CANCELLED', 'HQ_PRICING')
                                     and l.last_contact_at is not null and วันนี้ - l.last_contact_at > 30))
      from leads l
     where (p_dealer is null or l.dealer_code = p_dealer)
       -- ตัวกรองของรายการ = กติกาเดียวกับ leads_page (สาขา · จังหวัด · ช่องทาง · คำค้น)
       and (ชุดสาขา is null or coalesce(l.dealer_code, 'CNX') = any(ชุดสาขา))
       and (จังหวัด is null or l.province = จังหวัด)
       and (ช่องทาง is null or coalesce(nullif(l.source, ''), 'ไม่ระบุ') = ช่องทาง)
       and (คำค้น is null or l.company ilike '%' || คำค้น || '%' or l.contact ilike '%' || คำค้น || '%' or l.province ilike '%' || คำค้น || '%'
            or l.product ilike '%' || คำค้น || '%' or l.assigned ilike '%' || คำค้น || '%' or l.id ilike '%' || คำค้น || '%'
            or l.dealer_code ilike '%' || คำค้น || '%'));

  elsif p_page = 'hq.quotations' then
    -- ตัวกรองของตาราง = กติกาเดียวกับ hq_quotations_summary (0229): สาขา (ดีลเลอร์/ภาค/จังหวัดของดีลเลอร์) · คำค้น (เลขใบ/ลูกค้า/สาขาที่ชื่อตรงคำค้น)
    select count(*) filter (where q.status in ('sent_to_client', 'won', 'lost', 'expired')
                              and q.date ~ '^\d{4}-\d{2}-\d{2}' and substring(q.date, 1, 10)::date between ช่วงต้น and ช่วงท้าย),
           count(*) filter (where q.status = 'won'
                              and _q_report_date(q.status::text, q.won_at, q.date) between ช่วงต้น and ช่วงท้าย),   -- ตามวันตอบรับ (0260)
           count(*) filter (where q.status = 'sent_to_client')
      into ส่ง, ได้, รอ
      from quotations q
     where q.dealer_code <> 'HQ' and (p_dealer is null or q.dealer_code = p_dealer)
       and (ชุดสาขา is null or coalesce(q.dealer_code, 'CNX') = any(ชุดสาขา))
       and (คำค้น is null or q.id ilike '%' || คำค้น || '%' or q.customer ilike '%' || คำค้น || '%'
            or coalesce(q.dealer_code, 'CNX') = any(coalesce(ชุดสาขาค้น, array[]::text[])));
    return jsonb_build_object(
      'sent',       ส่ง,
      'awaiting',   รอ,
      'won',        (select jsonb_build_object('count', count(*), 'value', coalesce(sum(w.value), 0))
                       from _kpi_won(p_dealer) w join quotations q on q.dealer_code = w.dealer_code and q.id = w.quote_id
                      where w.d between ช่วงต้น and ช่วงท้าย
                        and (ชุดสาขา is null or coalesce(q.dealer_code, 'CNX') = any(ชุดสาขา))
                        and (คำค้น is null or q.id ilike '%' || คำค้น || '%' or q.customer ilike '%' || คำค้น || '%'
                             or coalesce(q.dealer_code, 'CNX') = any(coalesce(ชุดสาขาค้น, array[]::text[])))),
      'acceptRate', case when ส่ง = 0 then null else round(100.0 * ได้ / ส่ง, 1) end);

  elsif p_page = 'hq.customers' then
    -- ตัวกรองของตาราง = กติกาเดียวกับ hq_customers_page (0159): สาขา · จังหวัด (ภาค → จังหวัด) · คำค้น (ชื่อบริษัท/จังหวัด)
    --   · ช่วงที่ซื้อล่าสุด (วันที่ของใบ won ล่าสุดของลูกค้า · ไม่มีใบ = ไม่เข้าเกณฑ์เมื่อเปิดตัวกรองนี้)
    ซื้อจาก := nullif(f ->> 'boughtFrom', '')::date;
    ซื้อถึง := nullif(f ->> 'boughtTo', '')::date;
    return (with ซื้อล่าสุด as (
      select q.dealer_code, q.customer_id, max(_q_report_date(q.status::text, q.won_at, q.date)) as d   -- ซื้อล่าสุด = วันตอบรับ (0260)
        from quotations q where q.status = 'won' and q.customer_id is not null and _q_report_date(q.status::text, q.won_at, q.date) is not null
       group by 1, 2
    ), ค as (
      select c.* from customers c
        left join ซื้อล่าสุด b on b.dealer_code = c.dealer_code and b.customer_id = c.id
       where c.dealer_code <> 'HQ'
         and (ชุดสาขา is null or c.dealer_code = any(ชุดสาขา))
         and (ชุดจังหวัด is null or c.province = any(ชุดจังหวัด))
         and (คำค้น is null or c.company ilike '%' || คำค้น || '%' or c.province ilike '%' || คำค้น || '%')
         and (ซื้อจาก is null or b.d >= ซื้อจาก) and (ซื้อถึง is null or b.d <= ซื้อถึง)
    ), ขาย as (
      -- ไม่มีตัวกรองลูกค้า = ใบ won ทุกใบ (รวมใบที่ไม่ผูกลูกค้า) · มีตัวกรอง = เฉพาะใบของลูกค้าที่ผ่านตัวกรอง
      select w.customer_id, coalesce(nullif(ค.company, ''), ค.name, q.customer) as company, w.dealer_code, sum(w.value) as value
        from _kpi_won(null) w join quotations q on q.dealer_code = w.dealer_code and q.id = w.quote_id
        left join ค on ค.id = w.customer_id and ค.dealer_code = w.dealer_code
       where w.d between ช่วงต้น and ช่วงท้าย
         and (ชุดสาขา is null or w.dealer_code = any(ชุดสาขา))
         and (ชุดจังหวัด is null and คำค้น is null and ซื้อจาก is null and ซื้อถึง is null or ค.id is not null)
       group by 1, 2, 3
    )
    select jsonb_build_object(
      'total',   (select count(*) from ค),
      'new',     (select count(*) from ค where join_date ~ '^\d{4}-\d{2}-\d{2}' and substring(join_date, 1, 10)::date between ช่วงต้น and ช่วงท้าย),
      'sales',   (select coalesce(sum(value), 0) from ขาย),
      'dealers', jsonb_build_object('with', (select count(distinct ค.dealer_code) from ค join dealers x on x.code = ค.dealer_code),
                                    'of',   (select count(*) from dealers where code <> 'HQ' and (ชุดสาขา is null or code = any(ชุดสาขา)))),
      -- รายชื่อให้หน้าเว็บแสดงเมื่อกดการ์ด (ตารางหลักแบ่งหน้าที่ฐาน กรองวันที่เป็นลูกค้าไม่ได้) · ไม่เกิน 100 ราย
      'newList', (select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'company', coalesce(nullif(n.company, ''), n.name), 'dealerCode', n.dealer_code,
                                                            'joinDate', substring(n.join_date, 1, 10)) order by n.join_date desc, n.id desc), '[]'::jsonb)
                    from (select * from ค where join_date ~ '^\d{4}-\d{2}-\d{2}' and substring(join_date, 1, 10)::date between ช่วงต้น and ช่วงท้าย
                           order by join_date desc, id desc limit 100) n),
      'salesList', (select coalesce(jsonb_agg(jsonb_build_object('id', s.customer_id, 'company', s.company, 'dealerCode', s.dealer_code, 'value', s.value)
                                              order by s.value desc, s.customer_id), '[]'::jsonb)
                      from (select * from ขาย order by value desc limit 100) s)));

  elsif p_page = 'hq.audit' then
    return (select jsonb_build_object(
      'actionsToday',   count(*) filter (where (a.at at time zone 'Asia/Bangkok')::date = วันนี้),
      'usersToday',     count(distinct a."user") filter (where (a.at at time zone 'Asia/Bangkok')::date = วันนี้),
      'impersonations', count(*) filter (where a.action = 'เข้าระบบแทนดีลเลอร์' and (a.at at time zone 'Asia/Bangkok')::date between ช่วงต้น and ช่วงท้าย),
      'reversals',      count(*) filter (where (a.action like 'ย้อน%' or a.action like 'ยกเลิก%') and (a.at at time zone 'Asia/Bangkok')::date between ช่วงต้น and ช่วงท้าย))
      from audit_log a
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
