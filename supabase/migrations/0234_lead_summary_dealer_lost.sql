-- ── ใบ 0234: สรุปลีดรายดีลเลอร์มี "ปิดไม่สำเร็จ" (รอบ 4 · บอสตัดสิน 21 ต.ค. 69 ข้อตัดสิน 5) ─────────────────────────
--
-- อัตราปิดการขาย = ลูกค้าเป้าหมายปิดสำเร็จ ÷ (ปิดสำเร็จ + ปิดไม่สำเร็จ) — นับจากลีด ไม่ใช่จากใบ · สูตรเดียวทุกหน้า (lib/winRate.ts)
--   หน้า ภาพรวมยอดขาย ต้องคิดรายดีลเลอร์ — byDealer เดิมมีแค่ won (PAID) → เติม lost (CANCELLED)
--   ช่วงเวลา = วันที่ลีดเข้ามา (created_date) แบบเดียวกับทุกหน้า · ส่วนอื่นของคำสั่งเหมือน 0223 ทุกบรรทัด
--   ⚠️ เส้นทางเว็บจริง (server/v1/metrics.ts) ต้องส่งช่อง lost ต่อด้วย (กับดักเดิม: ลืมส่งช่องใหม่ = NaN)
-- ข้อทดสอบ: supabase/tests/lead_summary_lost.sql

CREATE OR REPLACE FUNCTION public.lead_summary(p_dealer_codes text[] DEFAULT NULL::text[], p_province text DEFAULT NULL::text, p_product text DEFAULT NULL::text, p_source text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_date_start date DEFAULT NULL::date, p_date_end date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with f as (
    select
      coalesce(dealer_code, 'CNX')                as dealer_code,
      status::text                                as status,
      coalesce(nullif(source, ''), 'ไม่ระบุ')      as source_g,
      coalesce(nullif(product, ''), 'ไม่ระบุ')     as product_g,
      nullif(province, '')                        as province_g,
      lost_reason,
      quote_value,
      created_date,
      extract(year  from created_date)::int       as y,
      extract(month from created_date)::int       as mo
    from leads
    where (created_date is null or (p_date_start is null or created_date >= p_date_start))
      and (created_date is null or (p_date_end   is null or created_date <= p_date_end))
      and (p_dealer_codes is null or coalesce(dealer_code, 'CNX') = any(p_dealer_codes))
      and (p_province is null or province = p_province)
      and (p_product  is null or product = p_product)
      and (p_source   is null or coalesce(nullif(source, ''), 'ไม่ระบุ') = p_source)
      and (p_status   is null or status = p_status::lead_status)
      and (p_search is null
           or company ilike '%'||p_search||'%' or contact ilike '%'||p_search||'%'
           or province ilike '%'||p_search||'%' or product ilike '%'||p_search||'%'
           or assigned ilike '%'||p_search||'%' or id ilike '%'||p_search||'%'
           or dealer_code ilike '%'||p_search||'%')
  )
  select jsonb_build_object(
    'byStatus', coalesce((select jsonb_agg(x) from (
        select status, count(*) as count, coalesce(sum(quote_value), 0) as value
        from f group by status) x), '[]'::jsonb),
    'bySource', coalesce((select jsonb_agg(x order by x.count desc) from (
        select source_g as source, count(*) as count from f group by source_g) x), '[]'::jsonb),
    'byProduct', coalesce((select jsonb_agg(x order by x.count desc) from (
        select product_g as product, count(*) as count from f group by product_g) x), '[]'::jsonb),
    'byProvince', coalesce((select jsonb_agg(x order by x.province) from (
        select province_g as province, count(*) as count from f where province_g is not null group by province_g) x), '[]'::jsonb),
    'byLostReason', coalesce((select jsonb_agg(x order by x.count desc) from (
        select lost_reason as reason, count(*) as count, coalesce(sum(quote_value), 0) as value
        from f where status = 'CANCELLED' and lost_reason is not null and lost_reason <> ''
        group by lost_reason) x), '[]'::jsonb),
    'byMonth', coalesce((select jsonb_agg(x order by x.y, x.m) from (
        select y, (mo - 1) as m,
          count(*)                                     as new,
          count(*) filter (where status = 'PAID')      as won,
          count(*) filter (where status = 'CANCELLED') as lost,
          -- ราย (ไม่ใช่ใบ) ที่ไปถึงขั้นเสนอราคาแล้ว ของรุ่นที่เข้ามาเดือนนั้น
          count(*) filter (where status in ('QUOTED','FOLLOWUP','NEGO','PAID')) as quoted
        from f where created_date is not null group by y, mo) x), '[]'::jsonb),
    'byDealer', coalesce((select jsonb_agg(x) from (
        select dealer_code,
          count(*)                                                                 as leads,
          count(*) filter (where status in ('QUOTED','FOLLOWUP','NEGO','PAID'))    as quoted,
          -- ปิดการขายได้ = เป็นลูกค้าแล้ว · หน้าจอเอาไปหักออกเวลาต้องการเฉพาะรายที่ยังไล่อยู่
          count(*) filter (where status = 'PAID')                                  as won,
          -- ปิดไม่สำเร็จ (ใบ 0234) — ใช้คิดอัตราปิดการขายรายดีลเลอร์ = won ÷ (won + lost) สูตรกลาง lib/winRate.ts
          count(*) filter (where status = 'CANCELLED')                             as lost
        from f group by dealer_code) x), '[]'::jsonb)
  );
$function$;
