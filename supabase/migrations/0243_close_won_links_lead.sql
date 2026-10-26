-- ── ใบ 0243: ปิดการขายแล้วฐานผูกลีดต้นทางกับลูกค้าเองในคำสั่งเดียวกัน (26 ต.ค. 69) ─────────────────────────────
--
-- เหตุ (เจอจากตัวนับข้อไม่นิ่ง · func-e2e-audit "ลบใบที่ won" ไม่นิ่งครบ 3 ครั้ง 21 + 26 ต.ค. 69 อาการเดียวกันทุกครั้ง):
--   กด "ลูกค้าตอบรับ" → close_won_quotation สร้าง/ผูกลูกค้า + ใบเป็น won + รวมยอด (ทรานแซกชันเดียว)
--   แต่ "ลีดต้นทาง → เลขลูกค้า" (leads.customer_id) แอปเขียนตามหลังอีกคำสั่ง (lead_apply fields.customerId)
--   ผู้ใช้รีเฟรช/ปิดหน้า/เน็ตหลุดในเสี้ยววินาทีนั้น → คำสั่งที่สองหาย (trace 26 ต.ค. 69: net::ERR_ABORTED)
--   = ลีดไม่ผูกลูกค้า เงียบ ๆ (หน้าลูกค้าไม่เห็นดีลนี้ · ปิดดีลถัดไปของลีดเดิมหาลูกค้าจากชื่อบริษัทแทนเลข)
--   ยอดเงิน/ลูกค้าซ้ำไม่กระทบ (ฐานกันอยู่แล้ว)
-- ที่แก้: ผูกลีดเจ้าของใบเป้าหมาย (quotations.deal_id = leads.num_id สาขาเดียวกัน) ในคำสั่งปิดการขายเลย
--   เฉพาะลีดที่ยังไม่ผูกลูกค้า — ลีดที่ผูกลูกค้าอื่นอยู่แล้วไม่แตะ · คำสั่งตามหลังของแอปเหลือเป็นค่าซ้ำ (ไม่มีผล)
--   ส่วนอื่นของคำสั่งเหมือนใบ 0145 ทุกบรรทัด · สิทธิ์เรียกคงเดิม (create or replace)
-- ข้อทดสอบ: supabase/tests/close_won_links_lead.sql
create or replace function public.close_won_quotation(p_dealer text, p_known_customer_id bigint, p_lead_company text, p_target_quote_id text, p_cascade_won boolean, p_customer_payload jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  cust   customers;
  result jsonb;
begin
  if not (can_write_sales() and p_dealer = auth_dealer()) then
    raise exception 'forbidden: no permission to close won for %', p_dealer;
  end if;

  -- ── ด่านใหม่: ต้องมีใบที่ส่งถึงลูกค้าแล้วอย่างน้อยหนึ่งใบ ──
  if p_target_quote_id is null and not exists (
    select 1 from quotations q
     where q.dealer_code = p_dealer
       and q.customer = p_lead_company
       and q.status <> 'draft'
  ) then
    raise exception 'no_sent_quotation: ปิดการขายสำเร็จไม่ได้ — ยังไม่มีใบเสนอราคาที่ส่งถึงลูกค้า';
  end if;

  if p_known_customer_id is not null then
    select * into cust from customers where dealer_code = p_dealer and id = p_known_customer_id;
  end if;

  if cust.id is null then
    cust := upsert_customer_for_company(p_dealer, p_customer_payload);
  end if;

  perform relink_customer_quotes(p_dealer, cust.id, p_lead_company, p_cascade_won);

  if p_target_quote_id is not null then
    update quotations set customer_id = cust.id, status = 'won'
     where dealer_code = p_dealer and id = p_target_quote_id;
    -- ใบ 0243: ลีดเจ้าของใบผูกลูกค้าในทรานแซกชันเดียวกัน (เดิมแอปเขียนตามหลัง → หายได้)
    update leads l set customer_id = cust.id
      from quotations q
     where q.dealer_code = p_dealer and q.id = p_target_quote_id and q.deal_id is not null
       and l.dealer_code = p_dealer and l.num_id = q.deal_id and l.customer_id is null;
  end if;

  cust := reconcile_customer_won_total(cust.id);

  -- ใบที่เกี่ยวข้องทั้งหมด: ตรงชื่อบริษัท (ทั้งที่เพิ่ง relink และที่เคยผูกอยู่ก่อนแล้วจากการปิดดีลก่อนหน้า)
  -- หรือคือใบเป้าหมายที่กำลังกด — ครอบทั้ง cascade case และ single-target case ในคำสั่งเดียว
  select jsonb_build_object(
    'customer', to_jsonb(cust),
    'quotations', coalesce(jsonb_agg(q), '[]'::jsonb)
  ) into result
  from quotations q
  where q.dealer_code = p_dealer and q.customer_id = cust.id
    and (q.customer = p_lead_company or q.id = p_target_quote_id);

  return result;
end $function$;
