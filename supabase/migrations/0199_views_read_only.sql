-- ── มุมมองอ่านอย่างเดียว: ปิดสิทธิ์เขียนผ่าน dealers_directory และ master_catalog_public (14 ต.ค. 69) ─────────────
--
-- ช่องโหว่ (พบตอนเริ่มด่าน 2 · ยืนยันในฐานทดสอบด้วยทรานแซกชันที่ย้อนกลับ):
--   มุมมองแบบง่ายเขียนผ่านได้ และทำงานด้วยสิทธิ์ของเจ้าของ (ไม่ใช่ security_invoker) — การเขียนผ่านมุมมองจึงข้ามกฎรายแถว
--   ของตารางจริงไปเลย ผู้ใช้ที่เข้าระบบมีสิทธิ์ INSERT/UPDATE/DELETE/TRUNCATE บนทั้งสองมุมมอง (ค่าตั้งต้นของรุ่นฐาน
--   + ใบ 0191 ที่ถ่ายสิทธิ์ตามฐานเปล่ามาเขียนไว้ตายตัว) ผลคือ
--     dealers_directory      — ดีลเลอร์รายหนึ่งแก้ชื่อ/จังหวัด/ภาค/สถานะของดีลเลอร์รายอื่นได้ (ตั้งปิดใช้งาน = ตัดอีกรายออกจากระบบ)
--     master_catalog_public  — ดีลเลอร์แก้และลบแม่แบบสินค้าของสำนักงานใหญ่ได้
-- แก้: ถอนสิทธิ์เขียนทุกแบบ เหลืออ่านอย่างเดียว หน้าจอไม่ได้เขียนผ่านมุมมองเหล่านี้เลย (เขียนที่ตารางจริงหรือผ่านเซิร์ฟเวอร์)
--   ⚠️ ไม่ตั้ง security_invoker บน dealers_directory — หน้ารายชื่อดีลเลอร์อ่านผ่านสิทธิ์เจ้าของ (ตาราง dealers ปิดอ่านตรง · 0091/0109)
--   ฝั่งเซิร์ฟเวอร์ (service_role) ก็ไม่ได้เขียนผ่านมุมมอง — ถอนด้วย ให้ตรงกับใบ 0191 ที่แก้ให้ไม่มีมุมมองไหนได้สิทธิ์ทั้งหมด
-- รันซ้ำได้: revoke สิ่งที่ไม่มีอยู่แล้วไม่ error (ระบบจริงอาจถูกถอนด้วยมือไปก่อน)
-- ตัวตรวจถาวร: scripts/db-audit-grants.mjs (มุมมองที่ให้ผู้ใช้เขียนผ่าน = ตก) · ข้อทดสอบ: supabase/tests/view_write_grants.sql

revoke insert, update, delete, truncate, references, trigger on public.dealers_directory     from anon, authenticated, service_role;
revoke insert, update, delete, truncate, references, trigger on public.master_catalog_public from anon, authenticated, service_role;
grant select on public.dealers_directory     to authenticated, service_role;
grant select on public.master_catalog_public to authenticated, service_role;
