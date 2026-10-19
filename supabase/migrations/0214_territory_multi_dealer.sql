-- ── ยกเลิก "หนึ่งจังหวัด หนึ่งดีลเลอร์" — จังหวัดเดียวมีดีลเลอร์ได้ไม่จำกัดสาขา (บอสสั่ง 16 ต.ค. 69) ───────────────
--
-- เปลี่ยนจากใบ 0195:
--   - เอาดัชนีห้ามซ้ำรายจังหวัด (dealer_territories_one_owner) และตัวกัน territory_taken ออก
--   - ป้าย legacy (ทับซ้อนเดิม) ไม่ใช้แล้ว: ล้างป้ายเป็น false — แถวพื้นที่ทุกแถวคงอยู่ (ห้ามลบข้อมูลพื้นที่เดิม)
--     คอลัมน์ legacy คงไว้ (ไม่ drop) เพื่อไม่กระทบข้อมูล/สำรองเดิม
--   - มุมมองจังหวัดทับซ้อน (territory_overlaps) + คำสั่งเคลียร์ทับซ้อน (territory_resolve_overlap) เอาออก — หน้า "พื้นที่ทับซ้อน" ของ HQ เอาออก
-- คงเดิม (ไม่แตะ):
--   - คู่ (จังหวัด, ดีลเลอร์) ยังห้ามซ้ำ (unique เดิมของตาราง)
--   - leads_territory_guard: ดีลเลอร์สร้างลีดได้ในจังหวัดที่ตัวเองดูแล · จังหวัดที่มีคนดูแลแต่ไม่ใช่ตัวเอง = ไม่ได้
--     · จังหวัดว่าง = คนแรกที่ส่งได้งาน · ลีดซ้ำในดีลเลอร์เดียวกันยังกันตามเดิม
--   - การโอนลีดของ HQ (0197): จังหวัดที่มีสาขาเดียว = โอนอัตโนมัติ · หลายสาขา = HQ ต้องเลือกสาขาเอง (ระบบไม่เลือกให้)
-- ข้อทดสอบ: supabase/tests/territories_multi.sql · tests/scenario/territory-multi-dealer.spec.ts

drop index if exists public.dealer_territories_one_owner;

drop trigger if exists dealer_territories_guard on public.dealer_territories;
drop function if exists public.dealer_territories_guard();

update public.dealer_territories set legacy = false where legacy;
comment on column public.dealer_territories.legacy is 'ไม่ใช้แล้ว (ใบ 0214) — เดิมคือป้ายพื้นที่ทับซ้อนก่อนมีกฎหนึ่งจังหวัดหนึ่งดีลเลอร์ · คงคอลัมน์ไว้ ค่าเป็น false ทั้งหมด';
comment on table public.dealer_territories is 'พื้นที่ (จังหวัด) ที่ดีลเลอร์ดูแล — จังหวัดเดียวมีหลายดีลเลอร์ได้ (ใบ 0214) · คู่จังหวัด+ดีลเลอร์ห้ามซ้ำ';

drop function if exists public.territory_resolve_overlap(text, text);
drop view if exists public.territory_overlaps;
