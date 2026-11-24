-- ── ใบ 0299: ลบผู้สนใจทีละราย (ถังขยะในแผง) = ลบแจ้งเตือนของรายนั้นด้วย + ล้างแจ้งเตือนกำพร้าอีกครั้ง (ผู้ตรวจ scn-prospect 23 พ.ย. 69) ──
-- เจอ: ลบผู้สนใจรายเดียวแล้วแจ้งเตือนของรายนั้นค้าง (prospect_followup_due:9492 บนฐาน dev) — ใบ 0294 แก้เฉพาะ "ยกเลิกทั้งชุดนำเข้า"
--   ทางลบรายเดียว = ลบแถวตรงจากตาราง (หน้าจอ · /api/v1/prospects) ไม่ผ่านคำสั่งของฐาน จึงไม่มีใครลบแจ้งเตือนตาม
-- แก้: ตัวกระตุ้นหลังลบบน dealer_prospects (ทุกทางลบ ทั้งรายเดียวและทั้งชุด) ลบตามกฎเดียวกับใบ 0294:
--   แจ้งเตือนชนิดผู้สนใจ (prospect_followup_due · prospect_idle · dedupe_key '<ชนิด>:<id>:…') + อีเมลที่ยังไม่ส่งซึ่งอ้างรายนั้น
--   อีเมลที่ส่งแล้วเก็บเป็นประวัติการส่ง · แจ้งเตือนชนิดอื่นไม่แตะ
--   ชุดล้างทดสอบที่ปิดตัวกระตุ้น (session_replication_role = replica) ไม่ผ่านตัวนี้ — ล้างกำพร้าครั้งเดียวด้านล่างเก็บตกของเก่า
-- ล้างครั้งเดียวตอนลงใบ (แบบเดียวกับ 0294 · ไม่มีตารางย้อนกลับ — แถวชี้ผู้สนใจที่ไม่มีแล้ว เปิดลิงก์ไม่เจอราย ไม่มีความหมายให้คืน)
-- ข้อทดสอบ: ซ้อมลงใบ tests/tools/migration-0299.test.mjs (นับก่อน/หลัง + ลบรายเดียวหลังลงใบ)

create or replace function public._prospect_deleted_cleanup()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  delete from notifications where kind in ('prospect_followup_due', 'prospect_idle') and split_part(dedupe_key, ':', 2) = old.id::text;
  delete from email_outbox where ref_table = 'dealer_prospects' and ref_id = old.id::text and status <> 'sent';
  return null;
end $function$;
revoke all on function public._prospect_deleted_cleanup() from public, anon, authenticated, service_role;

drop trigger if exists prospect_deleted_cleanup on public.dealer_prospects;
create trigger prospect_deleted_cleanup after delete on public.dealer_prospects
  for each row execute function public._prospect_deleted_cleanup();

-- ── ล้างครั้งเดียว: แจ้งเตือน/อีเมลค้างส่งที่ชี้ผู้สนใจที่ไม่มีแล้ว (ที่ค้างจากการลบรายเดียวก่อนใบนี้) ──
delete from public.notifications n
 where n.kind in ('prospect_followup_due', 'prospect_idle')
   and not exists (select 1 from public.dealer_prospects p where p.id::text = split_part(n.dedupe_key, ':', 2));
delete from public.email_outbox e
 where e.ref_table = 'dealer_prospects' and e.status <> 'sent'
   and not exists (select 1 from public.dealer_prospects p where p.id::text = e.ref_id);
