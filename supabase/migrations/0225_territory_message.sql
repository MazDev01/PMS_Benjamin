-- ── ใบ 0225: ข้อความแจ้งเมื่อลีดอยู่นอกพื้นที่ ไม่ให้อ้างกฎ "หนึ่งจังหวัด หนึ่งดีลเลอร์" ที่ยกเลิกแล้ว (รอบ 2 ช่วง ง) ─────
--
-- ใบ 0214 ยกเลิกกฎหนึ่งจังหวัดหนึ่งดีลเลอร์ (จังหวัดเดียวมีหลายดีลเลอร์ได้) แต่ข้อความใน leads_territory_guard ยังอ้างกฎเดิม
-- เปลี่ยนเฉพาะข้อความ — การทำงานเหมือนเดิมทุกอย่าง (รหัสข้อผิดพลาด lead_outside_territory คงเดิม)
-- ข้อทดสอบ: supabase/tests/territory_message.sql
CREATE OR REPLACE FUNCTION public.leads_territory_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  p text := btrim(coalesce(new.province, ''));
  v_key text; v_dup text;
begin
  if coalesce(auth.role(), '') <> 'authenticated' then return new; end if;
  if coalesce(current_setting('pms.flow_sync', true), '') = '1' then return new; end if;
  if is_hq() then return new; end if;
  if tg_op = 'UPDATE' and new.province is not distinct from old.province then return new; end if;
  if p = '' or new.customer_id is not null then return new; end if;

  if exists (select 1 from dealer_territories t where t.province = p and t.dealer_code = new.dealer_code) then
    return new;                                                     -- พื้นที่ของตัวเอง (รวมพื้นที่ทับซ้อนเดิม)
  end if;
  if exists (select 1 from dealer_territories t where t.province = p) then
    raise exception 'lead_outside_territory: หน้างานจังหวัด % ไม่อยู่ในพื้นที่ของคุณ (เป็นพื้นที่ของดีลเลอร์อื่น) — ติดต่อสำนักงานใหญ่ถ้าต้องการเพิ่มจังหวัดที่ดูแล', p;
  end if;

  -- จังหวัดว่าง: งานเดียวกันที่ดีลเลอร์อื่นยื่นไว้ก่อนและยังเปิดอยู่ = ยื่นซ้ำไม่ได้
  if regexp_replace(coalesce(new.phone, ''), '\D', '', 'g') = '' then return new; end if;
  v_key := lead_dedupe_key(new.company, new.phone);
  perform pg_advisory_xact_lock(hashtextextended('free-province#' || p || '#' || v_key, 0));
  select l.dealer_code into v_dup from leads l
   where l.dealer_code <> new.dealer_code and btrim(l.province) = p
     and lead_dedupe_key(l.company, l.phone) = v_key
     and l.status not in ('PAID', 'CANCELLED') and l.customer_id is null
   limit 1;
  if v_dup is not null then
    raise exception 'lead_taken: งานนี้ในจังหวัด % มีดีลเลอร์อื่นยื่นไว้ก่อนแล้ว — จังหวัดที่ยังว่าง ใครยื่นก่อนได้งาน', p;
  end if;
  return new;
end $function$;
