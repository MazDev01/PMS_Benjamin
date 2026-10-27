-- ── ใบ 0251: เลขขั้นของลีด (1–5 · 6 ปิดสำเร็จ · 7 ปิดไม่สำเร็จ) ให้ฐานคิด — ตาราง/ตัวกรอง/กราฟลีดทั้งเครือของ HQ (บอสสั่ง 27 ต.ค. 69) ──
--
-- เหตุ: ตารางลีดแสดงชื่อสถานะภายใน (รอราคา HQ · เสนอราคา ฯลฯ) ไม่ตรงกับแถบ 5 ขั้นในแผงลีด → ทุกที่ต้องใช้ชื่อขั้นจาก leadStage.ts
--   หน้าลีดทั้งเครือของ HQ แบ่งหน้า/กรอง/นับที่ฐาน (leads_page · lead_summary) — ขั้น 3 กับ 4 สถานะเดียวกัน (ได้ราคา HQ)
--   ต่างกันแค่ "มีใบร่างให้ลูกค้าแล้ว" ฐานจึงต้องคิดเลขขั้นเอง ไม่งั้นกรอง/นับขั้น 3–4 ผิด
-- กติกาเดียวกับ ขั้นของลีด() ใน packages/shared/lib/leadStage.ts (ข้อทดสอบ supabase/tests/lead_stage_no.sql เทียบทุกสถานะ)
--   มีใบร่าง = ใบลูกค้าของดีลนี้ (deal_id = num_id สาขาเดียวกัน) ที่ยังเป็นร่าง
-- leads_page / lead_summary: เพิ่ม p_stage (กรองตามเลขขั้น) · แถวรายการมี stage_no (แอปอ่านเป็น stageNo) · สรุปมี byStage (byStatus คงไว้ให้ที่เรียกเดิม)
--   ลายเซ็นเปลี่ยน → ลบตัวเดิมแล้วสร้างใหม่ + ให้สิทธิ์เรียกชุดเดิม (ใบ 0190)

create or replace function public.lead_stage_no(p_dealer text, p_num integer, p_status lead_status) returns integer
  language sql stable set search_path to 'public' as $$
  select case p_status
    when 'WAITING' then 1 when 'BULLET' then 1
    when 'HQ_PRICING' then 2
    when 'HQ_QUOTED' then case when exists (select 1 from quotations q
                                             where q.dealer_code = coalesce(p_dealer, 'CNX') and q.deal_id = p_num and q.status = 'draft')
                               then 4 else 3 end
    when 'QUOTED' then 5 when 'FOLLOWUP' then 5 when 'NEGO' then 5
    when 'PAID' then 6
    when 'CANCELLED' then 7
  end
$$;
revoke all on function public.lead_stage_no(text, integer, lead_status) from public, anon;
grant execute on function public.lead_stage_no(text, integer, lead_status) to authenticated, service_role;

drop function if exists public.leads_page(integer,integer,text,text[],text,text,text,text,date,date,boolean,date,integer,jsonb,boolean);
create function public.leads_page(p_limit integer, p_offset integer, p_status text DEFAULT NULL::text, p_dealer_codes text[] DEFAULT NULL::text[],
  p_province text DEFAULT NULL::text, p_product text DEFAULT NULL::text, p_source text DEFAULT NULL::text, p_search text DEFAULT NULL::text,
  p_date_start date DEFAULT NULL::date, p_date_end date DEFAULT NULL::date, p_overdue boolean DEFAULT false, p_as_of date DEFAULT '2026-06-30'::date,
  p_default_days integer DEFAULT 7, p_follow_up_days jsonb DEFAULT NULL::jsonb, p_skip_count boolean DEFAULT false, p_stage integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with f as (
    select l.*, lead_stage_no(l.dealer_code, l.num_id, l.status) as stage_no from leads l
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
  ), g as (
    select * from f where p_stage is null or stage_no = p_stage
  )
  select jsonb_build_object(
    'total', case when p_skip_count then -1 else (select count(*) from g) end,
    'rows', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_date desc nulls last, x.num_id desc, x.dealer_code)
      from (
        select * from g
        order by created_date desc nulls last, num_id desc, dealer_code
        limit p_limit offset p_offset
      ) x
    ), '[]'::jsonb)
  )
$function$;
revoke all on function public.leads_page(integer,integer,text,text[],text,text,text,text,date,date,boolean,date,integer,jsonb,boolean,integer) from public, anon;
grant execute on function public.leads_page(integer,integer,text,text[],text,text,text,text,date,date,boolean,date,integer,jsonb,boolean,integer) to authenticated, service_role;

drop function if exists public.lead_summary(text[],text,text,text,text,text,date,date);
create function public.lead_summary(p_dealer_codes text[] DEFAULT NULL::text[], p_province text DEFAULT NULL::text, p_product text DEFAULT NULL::text,
  p_source text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_date_start date DEFAULT NULL::date,
  p_date_end date DEFAULT NULL::date, p_stage integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with f0 as (
    select
      coalesce(dealer_code, 'CNX')                as dealer_code,
      status::text                                as status,
      lead_stage_no(dealer_code, num_id, status)  as stage,
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
  ), f as (
    select * from f0 where p_stage is null or stage = p_stage
  )
  select jsonb_build_object(
    'byStatus', coalesce((select jsonb_agg(x) from (
        select status, count(*) as count, coalesce(sum(quote_value), 0) as value
        from f group by status) x), '[]'::jsonb),
    'byStage', coalesce((select jsonb_agg(x order by x.stage) from (
        select stage, count(*) as count, coalesce(sum(quote_value), 0) as value
        from f group by stage) x), '[]'::jsonb),
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
revoke all on function public.lead_summary(text[],text,text,text,text,text,date,date,integer) from public, anon;
grant execute on function public.lead_summary(text[],text,text,text,text,text,date,date,integer) to authenticated;
