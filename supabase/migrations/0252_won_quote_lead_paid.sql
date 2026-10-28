-- ── ใบ 0252: ใบที่ลูกค้าตอบรับแล้ว = ลีดปิดการขายสำเร็จเสมอ (บอสสั่ง 28 ต.ค. 69 · บั๊ก L037) ─────────────────────────────
--
-- อาการ: แผงลีดขึ้น "ปิดการขายสำเร็จ · ลูกค้าตอบรับแล้ว" (กล่องขั้นต่อไปอ่านจากใบ) แต่แถบ 5 ขั้น/ป้ายในตารางยังเป็น "5 รอลูกค้าตอบ"
--   (อ่านจากสถานะลีดผ่าน leadStage.ts) → ใบ won แต่ลีดไม่ใช่ PAID
-- ต้นเหตุ:
--   1) ข้อมูลตั้งต้นของฐานทดสอบ/ฐาน dev (tests/fixtures/test-baseline.sql ส่งออกจากฐานทดสอบรุ่นก่อนทางเดียว) มีลีด 22 ราย
--      ที่ใบตอบรับแล้วแต่ลีดค้างขั้นอื่น — ใบแบบเดิม (ไม่มีใบ HQ) ทั้งหมด · ฐานจริงนับแล้ว 0 ราย (อ่านอย่างเดียว 28 ต.ค. 69)
--   2) ช่องโหว่ในฐาน: ตัวขยับลีดตามใบ (quotations_flow_sync · 0219) ทำงานเฉพาะใบที่ทำจากใบ HQ
--      ใบแบบเดิมที่ยังเปิดอยู่เปลี่ยนเป็น won ได้ (0202 ล็อกเฉพาะใบที่ปิดแล้ว) แต่ลีดไม่ขยับ
--      และไม่มีอะไรกันลีดออกจาก PAID ทั้งที่ใบยังตอบรับอยู่
-- ใบนี้:
--   ก) ใบแบบเดิมเปลี่ยนเป็น won → ฐานตั้งลีดของดีลนั้นเป็น PAID ในคำสั่งเดียวกัน (ใบจากใบ HQ มีอยู่แล้วใน 0219)
--   ข) ตัวกัน (AFTER trigger ตรวจทันที): ลีดที่มีใบ won ของดีลนั้น (deal_id = num_id) ต้องเป็น PAID · ทุกบทบาทรวม service role
--      ลำดับที่ทำให้ตรวจทันทีได้: ใบ → won = ตัวขยับลีดทำก่อนตัวกัน (quotations_flow_sync · quotations_legacy_won_lead_paid เรียงชื่อก่อน
--      quotations_won_must_be_paid) · ย้อนการตอบรับ = เปลี่ยนใบก่อน แล้วค่อยพาลีดกลับขั้นเดิม (quotation_revert_won)
--      ไม่ใช้แบบตรวจตอนจบธุรกรรม (deferred) — สคริปต์ที่แก้ใบแล้ว ALTER TABLE quotations ในธุรกรรมเดียวกันจะพัง (pending trigger events)
--   ค) ซ่อมข้อมูลที่ค้าง: ลีดที่มีใบ won แต่ไม่ใช่ PAID → PAID (จำขั้นเดิมใน status_before_paid ไว้ย้อนได้) · ฐานจริง 0 แถว
-- ข้อทดสอบ: supabase/tests/won_quote_lead_paid.sql

-- ═══ ก. ใบแบบเดิม won → ลีด PAID ══════════════════════════════════════════════════════════════════════════════
create or replace function public.quotations_legacy_won_lead_paid() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
begin
  if new.hq_quote_id is not null or new.deal_id is null or new.status <> 'won' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'won' and old.deal_id is not distinct from new.deal_id then return new; end if;
  perform _lead_flow_set_status(new.dealer_code, new.deal_id, 'PAID');
  return new;
end $$;
revoke all on function public.quotations_legacy_won_lead_paid() from public, anon, authenticated, service_role;
drop trigger if exists quotations_legacy_won_lead_paid on public.quotations;
create trigger quotations_legacy_won_lead_paid after insert or update of status, deal_id on public.quotations
  for each row execute function public.quotations_legacy_won_lead_paid();

-- ═══ ข. ตัวกัน: ใบ won = ลีด PAID ═══════════════════════════════════════════════════════════════════════════════════
create or replace function public._lead_won_must_be_paid(p_dealer text, p_num integer) returns void
  language plpgsql security definer set search_path to 'public' as $$
declare s lead_status;
begin
  if p_num is null then return; end if;
  select status into s from leads where dealer_code = p_dealer and num_id = p_num;
  if not found or s = 'PAID' then return; end if;
  if exists (select 1 from quotations where dealer_code = p_dealer and deal_id = p_num and status = 'won') then
    raise exception 'lead_won_not_paid: ลูกค้าเป้าหมายที่มีใบเสนอราคาที่ลูกค้าตอบรับแล้ว ต้องเป็น "ปิดการขายสำเร็จ" — ถ้าตอบรับผิด ให้สำนักงานใหญ่ย้อนการตอบรับที่ใบ';
  end if;
end $$;
revoke all on function public._lead_won_must_be_paid(text, integer) from public, anon, authenticated, service_role;

create or replace function public.leads_won_must_be_paid() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
begin
  perform _lead_won_must_be_paid(new.dealer_code, new.num_id);
  return null;
end $$;
revoke all on function public.leads_won_must_be_paid() from public, anon, authenticated, service_role;

create or replace function public.quotations_won_must_be_paid() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
begin
  if new.status = 'won' then perform _lead_won_must_be_paid(new.dealer_code, new.deal_id); end if;
  return null;
end $$;
revoke all on function public.quotations_won_must_be_paid() from public, anon, authenticated, service_role;

drop trigger if exists leads_won_must_be_paid on public.leads;
create trigger leads_won_must_be_paid after insert or update of status on public.leads
  for each row execute function public.leads_won_must_be_paid();
drop trigger if exists quotations_won_must_be_paid on public.quotations;
create trigger quotations_won_must_be_paid after insert or update of status, deal_id on public.quotations
  for each row execute function public.quotations_won_must_be_paid();

-- ═══ ค. ซ่อมข้อมูลที่ค้าง ═══════════════════════════════════════════════════════════════════════════════════
--   ตั้งตรง (ไม่ผ่านตัวดักลีด) — จำขั้นเดิมไว้ใน status_before_paid ให้ย้อนการตอบรับกลับได้ถูกขั้น
--   ปิดไม่สำเร็จที่มีใบ won = ข้อมูลขัดกันเอง → ใบชนะ (ลูกค้าตอบรับจริง) · ล้างเหตุผลที่เสีย
set session_replication_role = replica;
update public.leads l
   set status_before_paid = l.status, status = 'PAID', lost_reason = case when l.status = 'CANCELLED' then null else l.lost_reason end
 where l.status <> 'PAID'
   and exists (select 1 from public.quotations q where q.dealer_code = l.dealer_code and q.deal_id = l.num_id and q.status = 'won');
set session_replication_role = origin;
