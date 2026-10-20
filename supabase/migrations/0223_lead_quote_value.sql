-- ── ใบ 0223: มูลค่าลีด = ยอดก่อน VAT ของใบเสนอราคาล่าสุด (บอสตัดสิน 20 ต.ค. 69 · รอบ 2 ช่วง ค ข้อ 5) ───────────────
--
-- เดิม: มูลค่าลีดทุกที่ (การ์ดโอกาสการขาย ตาราง/กระดานลีด แดชบอร์ด HQ ไฟล์ส่งออก) มาจากช่อง "ประเมินราคา" (leads.value)
--   ที่ดีลเลอร์พิมพ์เอง — เป็นตัวเลขเดา ไม่ใช่ราคา (ราคาจริงมาจากใบ HQ + % ของดีลเลอร์)
-- ใหม่: ช่องประเมินราคาเอาออกจากหน้าเว็บ · คอลัมน์ leads.value คงไว้ห้ามลบ (ข้อมูลเก่า)
--   leads.quote_value = total_value ของใบเสนอราคาล่าสุดที่ดีลเลอร์ "ส่งให้ลูกค้าแล้ว" (ส่งแล้ว/ตอบรับ/ปฏิเสธ/หมดอายุ · ไม่นับใบร่าง)
--   ของลีดนั้น (ใบที่ deal_id = num_id ของสาขาเดียวกัน เรียงตามเวลาที่ระบบบันทึก ใหม่สุดก่อน)
--   ใบ HQ (hq_quotes = ราคาทุนของดีลเลอร์) ไม่นับเลย · ยังไม่มีใบที่ส่งแล้ว = null (หน้าเว็บขึ้น "—" และไม่นับในยอดรวม) — บอสสั่ง 20 ต.ค. 69
--   ฐานเป็นคนเขียนค่าเองทุกครั้งที่ใบเกิด/เปลี่ยนยอด/ย้ายลีด/ถูกลบ — หน้าเว็บอ่านอย่างเดียว (เขียนเองถูกปฏิเสธ)
--   สรุปยอดของ HQ (lead_summary) เปลี่ยนไปรวมจาก quote_value
-- ข้อทดสอบ: supabase/tests/lead_quote_value.sql
alter table public.leads add column if not exists quote_value numeric;
comment on column public.leads.quote_value is
  'ยอดก่อน VAT ของใบเสนอราคาล่าสุดที่ส่งลูกค้าแล้วของลีด (ไม่นับใบร่าง · ไม่นับใบ HQ · ฐานเขียนเอง · ใบ 0223) · null = ยังไม่มีใบที่ส่งแล้ว · แทนช่องประเมินราคา (leads.value) ที่เลิกใช้บนหน้าเว็บ';

-- ค่าของลีดหนึ่งราย คำนวณจากใบจริงทุกครั้ง (ไม่สะสมจากค่าเดิม — ใบถูกลบ/ย้ายก็ได้ค่าถูกเสมอ)
create or replace function public._lead_quote_value(p_dealer text, p_num integer) returns numeric
  language sql stable security definer set search_path to 'public' as $$
  select q.total_value from quotations q
   where q.dealer_code = p_dealer and q.deal_id = p_num and coalesce(q.deal_id, 0) <> 0
     and q.status <> 'draft'   -- เฉพาะใบที่ส่งลูกค้าแล้ว (ส่งแล้ว/ตอบรับ/ปฏิเสธ/หมดอายุ) · ใบร่างไม่นับ (บอสสั่ง 20 ต.ค. 69)
   order by q.created_at desc nulls last, q.id desc
   limit 1
$$;
revoke all on function public._lead_quote_value(text, integer) from public, anon, authenticated, service_role;

create or replace function public._lead_refresh_quote_value(p_dealer text, p_num integer) returns void
  language plpgsql security definer set search_path to 'public' as $$
begin
  if p_dealer is null or coalesce(p_num, 0) = 0 then return; end if;
  perform set_config('pms.quote_value_sync', '1', true);
  update leads l set quote_value = _lead_quote_value(p_dealer, p_num)
   where l.dealer_code = p_dealer and l.num_id = p_num
     and l.quote_value is distinct from _lead_quote_value(p_dealer, p_num);
  perform set_config('pms.quote_value_sync', '', true);
end $$;
revoke all on function public._lead_refresh_quote_value(text, integer) from public, anon, authenticated, service_role;

create or replace function public.quotations_lead_quote_value() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then perform _lead_refresh_quote_value(old.dealer_code, old.deal_id); end if;
  if tg_op in ('INSERT', 'UPDATE') then perform _lead_refresh_quote_value(new.dealer_code, new.deal_id); end if;
  return null;
end $$;
revoke all on function public.quotations_lead_quote_value() from public, anon, authenticated, service_role;

drop trigger if exists quotations_lead_quote_value on public.quotations;
create trigger quotations_lead_quote_value
  after insert or delete or update of total_value, deal_id, dealer_code, status on public.quotations
  for each row execute function public.quotations_lead_quote_value();

-- หน้าเว็บ/คนนอกเขียน quote_value เองไม่ได้ (ทั้งตอนสร้างและแก้) — ค่ามาจากใบเท่านั้น
--   ยกเว้นตัวคำนวณข้างบน (pms.quote_value_sync) และงานกู้ข้อมูล (pms.restore)
create or replace function public.leads_quote_value_guard() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
begin
  if coalesce(current_setting('pms.quote_value_sync', true), '') = '1'
     or coalesce(current_setting('pms.restore', true), '') = '1' then return new; end if;
  if tg_op = 'INSERT' then
    new.quote_value := _lead_quote_value(new.dealer_code, new.num_id);   -- ลีดใหม่ยังไม่มีใบ = null
  elsif new.quote_value is distinct from old.quote_value then
    new.quote_value := old.quote_value;   -- เงียบ ๆ คงค่าเดิม: แอปที่ส่งทั้งแถวมาจะไม่ล้ม แต่ทับค่าไม่ได้
  end if;
  return new;
end $$;
revoke all on function public.leads_quote_value_guard() from public, anon, authenticated, service_role;

drop trigger if exists leads_quote_value_guard on public.leads;
create trigger leads_quote_value_guard before insert or update on public.leads
  for each row execute function public.leads_quote_value_guard();

-- ย้ายลีดข้ามสาขา/เปลี่ยนเลข: คำนวณใหม่ตามใบของเจ้าของใหม่
create or replace function public.leads_quote_value_rekey() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
begin
  perform _lead_refresh_quote_value(new.dealer_code, new.num_id);
  return null;
end $$;
revoke all on function public.leads_quote_value_rekey() from public, anon, authenticated, service_role;
drop trigger if exists leads_quote_value_rekey on public.leads;
create trigger leads_quote_value_rekey after update of dealer_code, num_id on public.leads
  for each row execute function public.leads_quote_value_rekey();

-- เติมค่าให้ลีดที่มีอยู่ (นับก่อน/หลังไว้ตรวจ)
do $$
declare n_before int; n_after int;
begin
  select count(*) into n_before from leads where quote_value is not null;
  perform set_config('pms.quote_value_sync', '1', true);
  update leads l set quote_value = _lead_quote_value(l.dealer_code, l.num_id)
   where l.quote_value is distinct from _lead_quote_value(l.dealer_code, l.num_id);
  perform set_config('pms.quote_value_sync', '', true);
  select count(*) into n_after from leads where quote_value is not null;
  raise notice 'ใบ 0223: ลีดที่มียอดใบล่าสุด ก่อน % ราย → หลัง % ราย', n_before, n_after;
end $$;

-- สรุปยอดของ HQ: มูลค่ารวมต่อขั้น/ต่อเหตุผลเสียโอกาส มาจากยอดใบล่าสุด ไม่ใช่ช่องประเมินราคา
create or replace function public.lead_summary(p_dealer_codes text[] DEFAULT NULL::text[], p_province text DEFAULT NULL::text, p_product text DEFAULT NULL::text, p_source text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_date_start date DEFAULT NULL::date, p_date_end date DEFAULT NULL::date)
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
          count(*) filter (where status = 'PAID')                                  as won
        from f group by dealer_code) x), '[]'::jsonb)
  );
$function$;
