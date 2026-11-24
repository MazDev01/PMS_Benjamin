-- ── ใบ 0302: ลูกค้าปฏิเสธใบเสนอราคา → กระดิ่ง HQ (บอสตัดสิน 23 พ.ย. 69 ข้อ 15 · ตารางแจ้งเตือนกลาง แถว H11) ──
-- เดิม (รอบ 4 · 21 ต.ค. 69): ลูกค้าปฏิเสธอยู่ในกฎ "ห้ามแจ้ง" — HQ ไม่เห็นว่าดีลเลอร์เสียงานเพราะอะไรจนกว่าจะเปิดหน้ารายงาน
-- ตอนนี้: ใบที่ส่งให้ลูกค้าแล้ว (sent_to_client) เปลี่ยนเป็นลูกค้าปฏิเสธ (lost) = กระดิ่ง HQ "ลูกค้าปฏิเสธ · ดีลเลอร์ … · เหตุผล …"
--   · กระดิ่งเท่านั้น ไม่ส่งอีเมล (บอสสั่ง) · ปิดได้ที่ ตั้งค่า › การแจ้งเตือน (ไม่ใช่เรื่องจำเป็น) · ดีลเลอร์ (คนกดเอง) ไม่ได้แจ้ง
--   · เหตุผล = ชื่อจากรายการกลาง lead_lost_reason (ใบ 0301) — "อื่น ๆ: ข้อความ" สำหรับตัวระบุเอง
--   · ไม่นับ: ใบหมดอายุ/ถูกแทน (ไม่ใช่ lost) · ย้อนการตอบรับ won → lost (มีแจ้ง H9 อยู่แล้ว · ไม่ซ้ำสองเรื่อง)
--   · ทุกทางที่เปลี่ยนสถานะ (หน้าจอ · /api/v1 · เขียนตรง) ผ่านตัวกระตุ้นนี้ตัวเดียว
-- ข้อทดสอบ: supabase/tests/notification_catalog.sql (ข้อ 0 · ข้อ 5) · tests/scenario/flow-c-value-bell-cards.spec.ts

insert into public.notification_kinds (kind, flow_row, audience, bell, email, title, body, href, sort, locked, goes_to) values
  ('quote_rejected', 'H11', 'hq', true, false, 'ลูกค้าปฏิเสธ',
     'ดีลเลอร์ {dealer} · {company} · ใบ {quote} — เหตุผล: {reason}', '/hq/quotations?open={quote}', 200, false, 'ใบเสนอราคานั้น')
on conflict (kind, audience) do nothing;

create or replace function public._quote_rejected_notify() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
declare
  ชื่อดีลเลอร์ text;
  บริษัท text;
begin
  select coalesce(nullif(btrim(name), ''), code) into ชื่อดีลเลอร์ from dealers where code = new.dealer_code;
  select nullif(btrim(company), '') into บริษัท from leads where dealer_code = new.dealer_code and num_id = new.deal_id;
  perform _notify('quote_rejected', '', new.dealer_code || ':' || new.id || ':' || extract(epoch from clock_timestamp())::bigint,
    jsonb_build_object('dealer', coalesce(ชื่อดีลเลอร์, new.dealer_code), 'quote', new.id,
      'company', coalesce(บริษัท, nullif(btrim(new.customer), ''), nullif(btrim(new.project), ''), '—'),
      'reason', coalesce(_option_label('lead_lost_reason', new.lost_reason), 'ไม่ได้ระบุ')),
    'quotations', new.dealer_code || ':' || new.id);
  return null;
end $$;
revoke all on function public._quote_rejected_notify() from public, anon, authenticated, service_role;

drop trigger if exists quotations_rejected_notify on public.quotations;
create trigger quotations_rejected_notify after update of status on public.quotations
  for each row when (old.status = 'sent_to_client' and new.status = 'lost')
  execute function public._quote_rejected_notify();
