-- ── ใบ 0272: ส่วนต่างรายใบของหน้าใบเสนอราคาทั้งเครือ (บอสสั่ง 2 พ.ย. 69 รอบบ่าย · จองโดยเซสชัน ef) ──
-- HQ ดูว่าดีลเลอร์ขายต่อเท่าไหร่ รายใบ: ราคาส่ง HQ · ราคาขายลูกค้า · ส่วนต่าง ฿ · ส่วนต่าง % (คอลัมน์ในตาราง + แผงใบ)
-- สูตรเดียวกับการ์ด "ส่วนต่างกำไรเฉลี่ย" ของภาพรวมยอดขาย (kpi_cards hq.pipeline · 0271 / hq_pipeline_dealers 0264):
--   ราคาส่ง HQ = hq_quotes.total_cost ของใบ HQ ที่ใบลูกค้าทำมา · ราคาขาย = quotations.total_value (ก่อน VAT)
--   ส่วนต่าง ฿ = ขาย − ราคาส่ง · ส่วนต่าง % = ส่วนต่าง ÷ ขาย × 100 (ปัด 1 ตำแหน่ง · ขาย 0 = null)
--   → เฉลี่ยถ่วงของใบตอบรับในช่วง (Σ ส่วนต่าง ÷ Σ ขาย) = การ์ด · ใบที่ไม่ได้ทำจากใบ HQ = ไม่มีแถว (หน้าจอขึ้น "—" ไม่กุ)
-- รายบรรทัดยังอยู่ที่ quotation_margin (0201) เหมือนเดิม — ฟังก์ชันนี้รวมหลายใบในคำขอเดียวให้ตารางแบ่งหน้า
-- สิทธิ์: HQ เท่านั้น (ดีลเลอร์เรียก = forbidden — ไม่เห็นราคาส่งของสาขาอื่นทางนี้)
-- ข้อทดสอบ: supabase/tests/hq_quote_margins.sql · tests/scenario/hq-quote-margins.spec.ts

create or replace function public.hq_quote_margins(p_dealers text[], p_ids text[])
  returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not is_hq() then raise exception 'forbidden: เฉพาะสำนักงานใหญ่'; end if;
  if coalesce(array_length(p_dealers, 1), 0) <> coalesce(array_length(p_ids, 1), 0) then
    raise exception 'bad_keys: รหัสสาขากับเลขที่ใบต้องจำนวนเท่ากัน';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'dealer', q.dealer_code, 'id', q.id, 'hqQuoteNo', h.quote_no,
             'hqCost', h.total_cost, 'sale', q.total_value, 'baht', q.total_value - h.total_cost,
             'pct', case when coalesce(q.total_value, 0) = 0 then null
                         else round(100.0 * (q.total_value - h.total_cost) / q.total_value, 1) end)
           order by k.n)
      from unnest(p_dealers, p_ids) with ordinality as k(dealer, id, n)
      join quotations q on q.dealer_code = k.dealer and q.id = k.id
      join hq_quotes h on h.id = q.hq_quote_id), '[]'::jsonb);
end $$;
revoke all on function public.hq_quote_margins(text[], text[]) from public, anon, authenticated, service_role;
grant execute on function public.hq_quote_margins(text[], text[]) to authenticated, service_role;
