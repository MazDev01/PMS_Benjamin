-- ── ด่าน 3: ใบลูกค้าต้องมาจากใบ HQ · ล็อกราคาหลังสั่งผลิต · อีเมล won · margin · ใบหมดอายุตามใบ HQ (FLOW.html) ─────────
--
-- 1) ปิดทางออกใบลูกค้าแบบเดิม: ใบเสนอราคาใหม่ทุกใบต้องผูกใบ HQ (hq_quote_id) — ทุกทาง (หน้าจอ · API · คำสั่งออกเลข ·
--    เขียนตรง · ฝั่งเซิร์ฟเวอร์) ผ่านตัวดักเดียวกันที่ตาราง · ใบเดิมที่ไม่มีใบ HQ ยังเปิดดู/ปิดการขายได้ตามเดิม (ไม่ได้สร้างใหม่)
-- 2) ขั้น 11 "สั่งผลิต · ล็อกราคา": ใบที่ผูกใบ HQ และลูกค้าตอบรับแล้ว แก้ราคา/รายการ/ภาษีไม่ได้
--    ย้อนการตอบรับ (เปลี่ยนสถานะออกจาก won) ยังทำได้ — ตัวขยับสถานะของ Flow คืนใบ HQ/คำขอให้เอง (0183)
-- 3) ตารางสถานะแถว "ลูกค้าตอบรับ (won)" → อีเมลถึงผู้รับของ HQ · แถว "ลูกค้าปฏิเสธ" → ไม่มีอีเมล
-- 4) margin ที่ HQ เห็น (FLOW "% ที่ดีลเลอร์บวก — HQ ดู margin"): quotation_margin() คิดจากใบ HQ + ใบลูกค้าในฐาน
--    สิทธิ์ตามผู้เรียก (security invoker) — HQ เห็นทุกใบ · ดีลเลอร์เห็นของตัวเอง · ดีลเลอร์อื่นได้ null
-- 5) "ใบ HQ หมดอายุ ใบลูกค้าที่ผูกอยู่หมดตาม": งานตั้งเวลาทุกชั่วโมงทำให้ใบร่าง/ส่งแล้วที่ผูกใบ HQ หมดอายุ หมดอายุตาม
--    (อายุใบลูกค้าไม่เกินใบ HQ บังคับอยู่แล้วที่ quotations_hq_apply_markup · 0186)

-- ═══ 1. ใบใหม่ต้องมีใบ HQ ═══════════════════════════════════════════════════════════════════════════════════
create or replace function public.quotations_hq_link_guard() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
declare
  h hq_quotes;
  r quote_requests;
begin
  if tg_op = 'INSERT' and new.hq_quote_id is null then
    raise exception 'hq_quote_required: ใบเสนอราคาให้ลูกค้าต้องทำจากใบ HQ — ส่งคำขอราคาให้สำนักงานใหญ่ก่อน';
  end if;
  if tg_op = 'UPDATE' and old.hq_quote_id is not null and new.hq_quote_id is distinct from old.hq_quote_id then
    raise exception 'hq_link_locked: ใบเสนอราคานี้ผูกกับใบ HQ แล้ว เปลี่ยนไม่ได้ — ออกใบใหม่จากใบ HQ เวอร์ชันใหม่';
  end if;
  if new.hq_quote_id is null or (tg_op = 'UPDATE' and new.hq_quote_id is not distinct from old.hq_quote_id) then
    return new;
  end if;

  select * into h from hq_quotes where id = new.hq_quote_id;
  if found then select * into r from quote_requests where id = h.request_id; end if;
  if h.id is null or r.dealer_code is distinct from new.dealer_code or h.status = 'draft' then
    raise exception 'hq_link_invalid: ไม่พบใบ HQ นี้ในคำขอของสาขา';
  end if;
  if h.status <> 'sent' then
    raise exception 'hq_link_invalid: ใบ HQ % ใช้ออกใบใหม่ไม่ได้แล้ว (สถานะ %)', h.quote_no, h.status;
  end if;
  if new.deal_id is null then new.deal_id := r.lead_num_id;
  elsif new.deal_id <> r.lead_num_id then
    raise exception 'hq_link_invalid: ใบ HQ นี้เป็นของลูกค้าเป้าหมายรายอื่น';
  end if;
  return new;
end $$;
revoke all on function public.quotations_hq_link_guard() from public, anon, authenticated, service_role;
-- เดิมทำงานเฉพาะ "insert หรือแก้ hq_quote_id" — ยังพอสำหรับข้อ 1 (insert ทุกครั้งผ่านตัวดักนี้)

-- ═══ 2. สั่งผลิตแล้วล็อกราคา ════════════════════════════════════════════════════════════════════════════════
create or replace function public.quotations_won_lock() returns trigger
  language plpgsql set search_path to 'public' as $$
begin
  if old.hq_quote_id is not null and old.status = 'won' and new.status = 'won' and (
       new.line_items     is distinct from old.line_items     or new.total_value   is distinct from old.total_value
    or new.markup_percent is distinct from old.markup_percent or new.material_cost is distinct from old.material_cost
    or new.vat_percent    is distinct from old.vat_percent    or new.vat_amount    is distinct from old.vat_amount
    or new.wht_rate       is distinct from old.wht_rate       or new.wht_amount    is distinct from old.wht_amount
    or new.total_amount   is distinct from old.total_amount   or new.net_payable   is distinct from old.net_payable
    or new.total          is distinct from old.total          or new.expiry        is distinct from old.expiry) then
    raise exception 'quote_locked: ลูกค้าตอบรับและสั่งผลิตแล้ว ราคาถูกล็อก — แก้ราคา/รายการ/ภาษีไม่ได้';
  end if;
  return new;
end $$;
revoke all on function public.quotations_won_lock() from public, anon, authenticated, service_role;
drop trigger if exists quotations_won_lock on public.quotations;
create trigger quotations_won_lock before update on public.quotations
  for each row execute function public.quotations_won_lock();

-- ═══ 3. อีเมล: ลูกค้าตอบรับ → HQ ════════════════════════════════════════════════════════════════════════════
create or replace function public.quote_requests_email() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
declare h hq_quotes;
begin
  if tg_op = 'INSERT' then
    if new.supersedes_id is not null then            -- แถว 7: ขอแก้ราคา (คำขอใหม่มาแทนคำขอเดิม)
      perform _email_enqueue_hq('quote_request_reprice',
        'ดีลเลอร์ขอแก้ราคา ' || new.request_no,
        'ดีลเลอร์ขอแก้ราคาจากใบ HQ เดิม ระบบเปิดคำขอใหม่และเริ่มนับ 14 วันใหม่' || E'\n\n' || _quote_request_mail_lines(new),
        'quote_requests', new.id::text);
    else                                             -- แถว 1: ดีลเลอร์ส่งคำขอ
      perform _email_enqueue_hq('quote_request_new',
        'คำขอใบเสนอราคาใหม่ ' || new.request_no,
        'มีคำขอใบเสนอราคาใหม่เข้าคิว' || E'\n\n' || _quote_request_mail_lines(new),
        'quote_requests', new.id::text);
    end if;
  elsif new.status = 'cancelled' and old.status is distinct from 'cancelled' then   -- แถว 6: ดีลเลอร์ยกเลิกคำขอ
    perform _email_enqueue_hq('quote_request_cancelled',
      'ดีลเลอร์ยกเลิกคำขอ ' || new.request_no,
      'ดีลเลอร์ยกเลิกคำขอใบเสนอราคา' || E'\n' || 'เหตุผล: ' || new.cancel_reason || E'\n\n' || _quote_request_mail_lines(new),
      'quote_requests', new.id::text);
  elsif new.status = 'quoted' and old.status is distinct from 'quoted' then         -- แถว 4: HQ ส่งใบ → ดีลเลอร์
    select * into h from hq_quotes where request_id = new.id;
    perform _email_enqueue_dealer(new.dealer_code, 'hq_quote_sent',
      'ได้ราคาจากสำนักงานใหญ่แล้ว ' || new.request_no,
      'สำนักงานใหญ่ส่งใบเสนอราคา HQ ให้แล้ว เข้าระบบเพื่อดูรายการและทำใบเสนอราคาให้ลูกค้า' || E'\n\n'
        || 'เลขใบ HQ: ' || coalesce(h.quote_no, '—') || ' (เวอร์ชัน ' || coalesce(h.version::text, '—') || ')' || E'\n'
        || 'ยืนราคาถึง: ' || coalesce(to_char(h.valid_until, 'DD/MM/YYYY'), '—') || E'\n'
        || 'เลขคำขอ: ' || new.request_no || E'\n'
        || 'ลูกค้าเป้าหมาย: ' || coalesce((select nullif(l.company, '') from leads l where l.dealer_code = new.dealer_code and l.num_id = new.lead_num_id), '—') || E'\n'
        || 'งานที่ขอ: ' || coalesce(nullif(new.product, ''), '—') || case when new.subtype <> '' then ' · ' || new.subtype else '' end,
      'quote_requests', new.id::text);
  elsif new.status = 'won' and old.status is distinct from 'won' then               -- แถว 8: ลูกค้าตอบรับ → HQ (สั่งผลิต)
    select * into h from hq_quotes where request_id = new.id;
    perform _email_enqueue_hq('quote_request_won',
      'ลูกค้าตอบรับ — สั่งผลิตตามใบ ' || coalesce(h.quote_no, new.request_no),
      'ลูกค้าของดีลเลอร์ตอบรับใบเสนอราคาแล้ว ใบ HQ นี้เป็นคำสั่งผลิต' || E'\n'
        || 'เลขใบ HQ: ' || coalesce(h.quote_no, '—') || E'\n\n' || _quote_request_mail_lines(new),
      'quote_requests', new.id::text);
  end if;
  return new;
end $$;
revoke all on function public.quote_requests_email() from public, anon, authenticated, service_role;

-- ═══ 4. margin ════════════════════════════════════════════════════════════════════════════════════════════
/** margin ของใบลูกค้าหนึ่งใบ (ราคาก่อนภาษี) — รายบรรทัด: ต้นทุนจากใบ HQ · % · ราคาขาย · บวกเป็นบาท
 *  ทั้งใบ: บวกรวม (บาท) · % ของต้นทุน · % ของราคาขาย (ปัด 2 ตำแหน่ง) · ใบไม่ผูกใบ HQ / มองไม่เห็น = null */
create or replace function public.quotation_margin(p_dealer text, p_id text) returns jsonb
  language plpgsql stable security invoker set search_path to 'public' as $$
declare
  q quotations; h hq_quotes; v_lines jsonb := '[]'::jsonb; i int := 0; hl jsonb; ql jsonb;
  v_cost numeric := 0; v_sale numeric := 0; v_qty numeric; v_uc numeric; v_up numeric;
begin
  select * into q from quotations where dealer_code = p_dealer and id = p_id;
  if not found or q.hq_quote_id is null then return null; end if;
  select * into h from hq_quotes where id = q.hq_quote_id;
  if not found then return null; end if;
  for hl in select * from jsonb_array_elements(h.line_items) loop
    ql := q.line_items -> i;
    v_qty := (hl ->> 'qty')::numeric;
    v_uc  := (hl ->> 'unitCost')::numeric;
    v_up  := coalesce((ql ->> 'unitPrice')::numeric, v_uc);
    v_lines := v_lines || jsonb_build_object(
      'name', hl ->> 'name', 'qty', v_qty, 'unit', coalesce(hl ->> 'unit', ''),
      'unitCost', v_uc, 'markupPct', coalesce((ql ->> 'markupPct')::numeric, 0), 'unitPrice', v_up,
      'markupBaht', round((v_up - v_uc) * v_qty, 2));
    v_cost := v_cost + round(v_qty * v_uc, 2);
    v_sale := v_sale + round(v_qty * v_up, 2);
    i := i + 1;
  end loop;
  return jsonb_build_object(
    'hqQuoteNo', h.quote_no, 'lines', v_lines,
    'costTotal', v_cost, 'saleTotal', v_sale, 'markupBaht', v_sale - v_cost,
    'pctOfCost', case when v_cost > 0 then round((v_sale - v_cost) / v_cost * 100, 2) end,
    'pctOfSale', case when v_sale > 0 then round((v_sale - v_cost) / v_sale * 100, 2) end);
end $$;
revoke all on function public.quotation_margin(text, text) from public, anon, authenticated, service_role;
grant execute on function public.quotation_margin(text, text) to authenticated, service_role;

-- ═══ 5. ใบ HQ หมดอายุ → ใบลูกค้าที่ผูกอยู่หมดตาม ═══════════════════════════════════════════════════════════════
create or replace function public.expire_hq_linked_quotations(p_as_of date default (now() at time zone 'Asia/Bangkok')::date)
  returns integer language plpgsql security definer set search_path to 'public' as $$
declare n integer;
begin
  update quotations q
     set status = 'expired', expired_reason = 'ใบ HQ ' || h.quote_no || ' หมดอายุ (ยืนราคาถึง ' || to_char(h.valid_until, 'DD/MM/YYYY') || ')'
    from hq_quotes h
   where q.hq_quote_id = h.id
     and q.status in ('draft', 'sent_to_client')
     and h.valid_until is not null and h.valid_until < p_as_of;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.expire_hq_linked_quotations(date) from public, anon, authenticated, service_role;
grant execute on function public.expire_hq_linked_quotations(date) to service_role;

-- ทุกชั่วโมง · ทนทานต่อ pg_cron แบบเดียวกับใบ 0066/0193: ยังเปิดไม่ได้ = ข้าม
do $$
begin
  perform cron.unschedule('expire-hq-linked-quotations') where exists (select 1 from cron.job where jobname = 'expire-hq-linked-quotations');
  perform cron.schedule('expire-hq-linked-quotations', '5 * * * *', 'select public.expire_hq_linked_quotations()');
exception when others then
  raise notice 'ข้ามการตั้งเวลา expire-hq-linked-quotations: %', sqlerrm;
end $$;
