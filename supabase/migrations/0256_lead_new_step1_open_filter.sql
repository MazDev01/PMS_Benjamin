-- ── ใบ 0256: ลีดใหม่อยู่ขั้น "ข้อมูลลูกค้า" เสมอ · ตารางลีดค่าเริ่มต้น = ลีดที่ยังเปิดอยู่ (บอสสั่ง 28 ต.ค. 69) ─────────────────────
--
-- 1) ฟอร์มเพิ่มลูกค้าเป้าหมายเอาช่อง "ขั้นตอน" (ติดต่อแล้ว/รวบรวมความต้องการ) ออก — ลีดใหม่อยู่ขั้น 1 ข้อมูลลูกค้าเสมอ
--    เดิม (0232) ดีลเลอร์สร้างลีดเป็น WAITING หรือ BULLET ได้ (สองค่านี้คือขั้น 1 ทั้งคู่ แต่หน้าจอให้เลือกเหมือนเป็นสองขั้น)
--    ตอนนี้: ฐานตั้งสถานะลีดใหม่เป็น WAITING เอง (ส่ง ติดต่อแล้ว/รวบรวมความต้องการ มา = เก็บเป็น WAITING) · ส่งขั้นอื่นมา = ปฏิเสธ
--    ลีดเก่าที่เป็น BULLET คงไว้ (แสดงเป็นขั้นข้อมูลลูกค้าเหมือนเดิม · ไม่ย้ายข้อมูล) · งานของระบบ/กุญแจฝั่งเซิร์ฟเวอร์ไม่ตรวจ (เหมือนเดิม)
--    ยกจาก 0232 ข้อ 1 — เปลี่ยนเฉพาะเงื่อนไขตอนสร้าง ที่เหลือเหมือนเดิมทุกบรรทัด
-- 2) leads_page: p_stage = 0 = "กำลังดำเนินการ" (ขั้น 1–5) — ค่าเริ่มต้นของตารางลีดทั้งเครือ (HQ) · null = ทั้งหมด · 1–7 = ขั้นนั้น
--    ยกจาก 0251 — เปลี่ยนเฉพาะบรรทัดกรองขั้น · lead_summary ไม่เปลี่ยน (กราฟ/การ์ดนับตามช่วงเวลาเหมือนเดิม)
-- ข้อทดสอบ: supabase/tests/lead_new_step1_open_filter.sql

-- ═══ 1. ตัวดักทางเปลี่ยนสถานะ (ยกจาก 0232) ═══════════════════════════════════════════════════════════════════
create or replace function public.leads_status_one_path() returns trigger
  language plpgsql set search_path to 'public' as $$
declare ระบบ boolean := coalesce(current_setting('pms.flow_sync', true), '') = '1';
begin
  if coalesce(auth.role(), '') <> 'authenticated' and not ระบบ then return new; end if;   -- service role / งานในฐาน

  -- ข้อ 3 ปิดสำเร็จต้องมีใบที่ตอบรับ (ทุกบทบาท รวมคำสั่งของระบบ)
  if new.status = 'PAID' and (tg_op = 'INSERT' or old.status is distinct from 'PAID') and not exists (
       select 1 from quotations q
        where q.dealer_code = new.dealer_code and q.status = 'won'
          and (q.deal_id = new.num_id or (q.deal_id is null and q.customer = new.company))) then
    raise exception 'lead_won_needs_accepted_quote: ปิดการขายสำเร็จได้ทางเดียว — กด "ลูกค้าตอบรับ" ที่ใบเสนอราคาในแผงลูกค้าเป้าหมาย';
  end if;

  -- ลีดใหม่ = ขั้นข้อมูลลูกค้าเสมอ ฐานตั้งเอง (บอสสั่ง 28 ต.ค. 69) — ผู้ใช้ทุกบทบาท (รวม HQ)
  --   ส่งสถานะในขั้นข้อมูลลูกค้ามา (ติดต่อแล้ว/รวบรวมความต้องการ · ไคลเอนต์รุ่นเก่า) = ฐานเก็บเป็นสถานะตั้งต้น WAITING
  --   ส่งสถานะขั้นอื่นมา = ปฏิเสธ (หน้าเว็บตั้งขั้นเองไม่ได้)
  if tg_op = 'INSERT' and not ระบบ then
    if new.status is null or new.status in ('WAITING', 'BULLET') then
      new.status := 'WAITING';
    else
      raise exception 'lead_new_status_locked: ลูกค้าเป้าหมายใหม่เริ่มที่ขั้น "ข้อมูลลูกค้า" เสมอ — ระบบตั้งให้เอง ขั้นอื่นระบบเลื่อนให้ตามคำขอราคาและใบเสนอราคา';
    end if;
  end if;

  if ระบบ or is_hq() then return new; end if;

  -- ข้อ 1 ดีลเลอร์
  if tg_op = 'INSERT' then return new; end if;
  if new.status is not distinct from old.status then return new; end if;
  if new.status <> 'CANCELLED' then
    raise exception 'lead_status_one_path: เปลี่ยนสถานะเองได้เฉพาะ "ปิดไม่สำเร็จ" ที่กล่องขั้นต่อไป — ขั้นอื่นระบบเลื่อนให้เองตามคำขอราคาและใบเสนอราคา';
  end if;
  -- ข้อ 2 มีใบที่ส่งให้ลูกค้าอยู่ → ปิดที่ใบ
  if exists (select 1 from quotations q where q.dealer_code = new.dealer_code and q.deal_id = new.num_id and q.status = 'sent_to_client') then
    raise exception 'lead_has_sent_quote: มีใบเสนอราคาที่ส่งให้ลูกค้าอยู่ — ลูกค้าไม่เอา ให้กด "ลูกค้าปฏิเสธ" ที่ใบ (ระบบปิดลูกค้าเป้าหมายให้เอง)';
  end if;
  return new;
end $$;
revoke all on function public.leads_status_one_path() from public, anon, authenticated, service_role;

-- ═══ 2. leads_page: p_stage = 0 = ขั้น 1–5 (ยกจาก 0251) ═════════════════════════════════════════════════════════
create or replace function public.leads_page(p_limit integer, p_offset integer, p_status text DEFAULT NULL::text, p_dealer_codes text[] DEFAULT NULL::text[],
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
    -- 0 = กำลังดำเนินการ (ขั้น 1–5) · null = ทั้งหมด · 1–7 = ขั้นนั้น
    select * from f where p_stage is null or (p_stage = 0 and stage_no between 1 and 5) or stage_no = p_stage
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
revoke all on function public.leads_page(integer,integer,text,text[],text,text,text,text,date,date,boolean,date,integer,jsonb,boolean,integer) from public, anon, authenticated, service_role;
grant execute on function public.leads_page(integer,integer,text,text[],text,text,text,text,date,date,boolean,date,integer,jsonb,boolean,integer) to authenticated, service_role;
