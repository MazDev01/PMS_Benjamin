-- Benjamin PMS — ด่าน 4 · เป้าสาขา = เป้าในใบค่าแฟรนไชส์ (ข้อตัดสินของบอส 15 ต.ค. 69)
--
-- กติกาใหม่ (ทับ 0178/0179):
--   • เป้าของแพ็กเกจ = ค่าตั้งต้นที่เติมให้ตอนออกใบค่าแฟรนไชส์ใหม่เท่านั้น
--   • ตั้งเป็นดีลเลอร์แล้ว เป้าสาขา = เป้าในใบ (เส้นทางสร้างดีลเลอร์ใส่ค่านี้ให้)
--   • แก้เป้าของแพ็กเกจทีหลัง ต้องไม่ทับเป้าของดีลเลอร์ที่มีอยู่แล้ว
--
-- เดิม: ตัวดัก dealers_package_target เขียนทับเป้าด้วยเป้าแพ็กเกจทุกครั้งที่สร้าง/แก้ดีลเลอร์
--       และ hq_recruit_settings_sync_targets ไล่ทับเป้าทุกดีลเลอร์เมื่อแก้หน้าตั้งค่า
--   → ใบระบุ 12,000,000 แต่สาขาได้ 3,000,000 โดยไม่มีอะไรบอก HQ (รอบปิดด่าน 3)
-- คงฟังก์ชัน package_annual_target ไว้ — ยังใช้อ่านค่าตั้งต้นของใบใหม่
-- ข้อทดสอบ: supabase/tests/franchise_target.sql

drop trigger if exists dealers_package_target on public.dealers;
drop trigger if exists hq_recruit_settings_sync_targets on public.hq_recruit_settings;
drop function if exists public.dealers_package_target();
drop function if exists public.hq_recruit_settings_sync_targets();
