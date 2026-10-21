-- ── รอบ 3 · ใบเสนอราคาฉบับใหม่ (V2) ส่วนที่ 1: สถานะ "ถูกแทนที่" + ช่องผูกฉบับเดิม (บอสสั่ง 21 ต.ค. 69) ─────────────────────
--
-- ลูกค้าต่อรองใบที่ส่งแล้ว → ดีลเลอร์ทำฉบับใหม่ (V2) จากใบเดิมได้เอง · ส่ง V2 แล้วใบเดิมเป็น "ถูกแทนที่" อ่านได้อย่างเดียว
-- แยกไฟล์จากกติกา (0228) เพราะค่าใหม่ของ enum ใช้ในทรานแซกชันเดียวกับที่เพิ่มไม่ได้

alter type public.quotation_status add value if not exists 'superseded';

-- V2 ชี้กลับไปใบเดิม (เลขที่ใบในสาขาเดียวกัน) · null = ใบฉบับแรก
alter table public.quotations add column if not exists supersedes_id text;
create unique index if not exists quotations_one_next_version
  on public.quotations (dealer_code, supersedes_id) where supersedes_id is not null;
comment on column public.quotations.supersedes_id is
  'ใบฉบับก่อนหน้าที่ใบนี้มาแทน (เลขที่ใบในสาขาเดียวกัน) — ใบหนึ่งมีฉบับถัดไปได้ใบเดียว · ตั้งผ่าน quotation_new_version() เท่านั้น';
