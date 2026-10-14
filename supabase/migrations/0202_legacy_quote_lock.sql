-- ── ปิดทางเดิมทางอ้อม: ใบเก่าที่ไม่มีใบ HQ (ด่าน 3 · ข้อตัดสินของบอส 14 ต.ค. 69) ──────────────────────────────────
--
-- ใบ 0201 ปิดการสร้างใบใหม่ที่ไม่มีใบ HQ แล้ว (คัดลอก = สร้างใหม่ = ถูกปฏิเสธด้วยตัวดักเดียวกัน)
-- ใบเก่ายังแก้ได้ตามข้อตัดสิน แต่ต้องไม่กลายเป็นทางออกราคาโดยไม่มีใบ HQ:
--   - ห้ามทำเวอร์ชันใหม่ (revision เปลี่ยน)
--   - ห้ามเปลี่ยนลูกค้าเป้าหมาย (deal_id) หรือลูกค้าที่ผูกอยู่ (customer_id) — ย้ายใบเก่าไปใช้กับงานอื่นไม่ได้
--   - ใบที่ปิดแล้ว (won / lost / expired) ล็อกทั้งใบ
--   ข้อยกเว้นเดียว: ผูกลูกค้าครั้งแรกจากค่าว่าง โดยไม่แตะช่องอื่น — คำสั่งปิดการขาย (relink_customer_quotes) ผูกใบกำพร้า
--     ของบริษัทเดียวกันให้ลูกค้าที่เพิ่งเกิด ถ้าล็อกตรงนี้ ดีลเลอร์ที่มีใบเก่าแพ้ไว้จะแปลงลูกค้าเป้าหมายเป็นลูกค้าไม่ได้
--   งานที่ฐานข้อมูลทำต่อเนื่องเอง (เช่น FK ON UPDATE CASCADE เมื่อเลขลูกค้า/ลูกค้าเป้าหมายเปลี่ยน) ไม่ถูกกัน — pg_trigger_depth() > 1
-- ใบที่ทำจากใบ HQ ไม่อยู่ในตัวดักนี้ (มีกฎของตัวเองแล้ว: 0183 / 0186 / 0201)

create or replace function public.quotations_legacy_lock() returns trigger
  language plpgsql set search_path to 'public' as $$
declare
  ผูกครั้งแรก boolean;
begin
  if old.hq_quote_id is not null or new.hq_quote_id is not null then return new; end if;
  if pg_trigger_depth() > 1 then return new; end if;

  -- ผูกลูกค้าครั้งแรกจากค่าว่าง และไม่มีช่องอื่นเปลี่ยน
  ผูกครั้งแรก := old.customer_id is null and new.customer_id is not null
    and (to_jsonb(new) - 'customer_id') = (to_jsonb(old) - 'customer_id');
  if ผูกครั้งแรก then return new; end if;

  if old.status in ('won', 'lost', 'expired') then
    raise exception 'legacy_quote_locked: ใบเสนอราคาเดิม (ไม่มีใบ HQ) ที่ปิดแล้วแก้ไม่ได้ — ทำใบใหม่จากใบ HQ แทน';
  end if;
  if new.revision is distinct from old.revision then
    raise exception 'legacy_quote_locked: ใบเสนอราคาเดิม (ไม่มีใบ HQ) ทำเวอร์ชันใหม่ไม่ได้ — ขอราคาจากสำนักงานใหญ่แล้วทำใบใหม่จากใบ HQ';
  end if;
  if new.deal_id is distinct from old.deal_id
     or (old.customer_id is not null and new.customer_id is distinct from old.customer_id) then
    raise exception 'legacy_quote_locked: ใบเสนอราคาเดิม (ไม่มีใบ HQ) ย้ายลูกค้าเป้าหมายหรือลูกค้าที่ผูกอยู่ไม่ได้';
  end if;
  return new;
end $$;
revoke all on function public.quotations_legacy_lock() from public, anon, authenticated, service_role;
drop trigger if exists quotations_legacy_lock on public.quotations;
create trigger quotations_legacy_lock before update on public.quotations
  for each row execute function public.quotations_legacy_lock();
