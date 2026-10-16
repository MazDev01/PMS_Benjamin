-- ── ย้อนฉุกเฉิน ขั้น 2: เปิดด่าน "ใบเสนอราคาใหม่ต้องทำจากใบ HQ" คืน (หลังโค้ดใหม่กลับขึ้นแล้ว) ─────────────────
-- ใบที่โค้ดเก่าออกระหว่างปิดด่าน (ไม่มีใบ HQ) ยังเปิดดู/ปิดการขายได้ตามเดิม — ด่านตรวจเฉพาะใบใหม่
-- ผลต้องเป็น ด่านใบHQ = เปิด · และ ใบที่ออกช่วงปิดด่าน = จำนวนใบที่ไม่มีใบ HQ ซึ่งสร้างหลังเวลาที่ใส่ (ไว้ให้ HQ ตามต่อ)
begin;
alter table public.quotations enable trigger quotations_hq_link_guard;
commit;
select case when tgenabled = 'D' then 'ปิด' else 'เปิด' end as "ด่านใบHQ",
       (select count(*) from public.quotations where hq_quote_id is null and created_at > now() - interval '7 days') as "ใบไม่มีใบHQใน7วัน"
  from pg_trigger where tgrelid = 'public.quotations'::regclass and tgname = 'quotations_hq_link_guard';
