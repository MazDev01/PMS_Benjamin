-- ── ตั้งค่าที่ต้องมีเฉพาะ "Supabase ที่รันในเครื่อง" (Docker) ──────────────────────
--
-- ไฟล์นี้ทำงานเฉพาะตอน `supabase db reset` ในเครื่องเท่านั้น — ไม่ถูกส่งขึ้นฐานข้อมูลจริง
--
-- ทำไมต้องมี (1 ก.ย. 69): ย้ายชุดทดสอบจากคลาวด์มารันในเครื่อง (เพราะโปรเจกต์ทดสอบ
--   กินโควตา egress ขององค์กรจนเกิน) พอ reset แล้วสคริปต์ตั้งต้นข้อมูลขึ้น
--   "permission denied for table dealers" ทั้งที่ใช้กุญแจ service_role
--
--   สาเหตุ: บนคลาวด์ Supabase ตั้งสิทธิ์ให้ role ของ Data API (anon / authenticated /
--   service_role) ไว้ให้อัตโนมัติ แต่สแต็กในเครื่องไม่ได้ตั้งให้กับตารางที่ migration
--   ของเราสร้างขึ้นเอง → อ่าน/เขียนอะไรไม่ได้เลยแม้แต่ service_role
--
-- ⚠️ ให้สิทธิ์ตรงนี้ "ไม่ได้" ทำให้ข้อมูลหลุด — ทุกตารางยังมี RLS คุมอยู่เหมือนเดิม
--    (anon/authenticated ยังต้องผ่านกฎ 70+ ข้อ) นี่แค่ทำให้สภาพในเครื่องเหมือนคลาวด์
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables    in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
-- ⚠️ ห้าม grant ฟังก์ชันเป็นชุด — migration 0031/0032 ตั้งใจถอน execute ของฟังก์ชันอ่อนไหว
--    (ออกเลขใบเสนอราคา · หมดอายุใบเสนอราคา · hook ออกใบผ่าน) ถ้า grant ทับจะเปิดกลับให้ anon
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

-- ตารางที่ตั้งใจให้แตะได้เฉพาะฝั่งเซิร์ฟเวอร์ (service_role) — ถอนสิทธิ์คืนให้เหมือนคลาวด์
revoke all on public.dealer_login_secrets      from anon, authenticated;
revoke all on public.dealer_account_changes    from anon, authenticated;
revoke all on public.dealer_account_requests   from anon, authenticated;

-- วิว (view) ไม่ได้ถูก RLS คุมเหมือนตาราง — บนคลาวด์ anon ไม่มีสิทธิ์อยู่แล้ว
-- ถ้าปล่อยให้ grant ข้างบนครอบไปถึงวิว คนที่ยังไม่ล็อกอินจะอ่านทะเบียนสาขาได้
-- (เทสต์ anon-exposure.spec.ts จับได้ทันทีตอนย้ายมารันในเครื่อง 1 ก.ย. 69)
-- ปิดเฉพาะ "คนที่ยังไม่ล็อกอิน" (anon) — ผู้ใช้ที่ล็อกอินแล้วต้องอ่านทะเบียนสาขาได้
-- ไม่งั้นหน้าเจาะสาขาของสำนักงานใหญ่จะว่างเปล่าทั้งหน้า (เจอจริงตอนย้ายมารันในเครื่อง)
revoke all on public.dealers_directory from anon;
grant select on public.dealers_directory to authenticated, service_role;
-- มุมมองแม่แบบสำหรับดีลเลอร์ (ใบ 0186) — เหตุผลเดียวกับ dealers_directory:
--   มุมมองนี้อ่านด้วยสิทธิ์เจ้าของ (ข้ามกฎรายตาราง) ใบ 0186 ถอนสิทธิ์คนที่ยังไม่เข้าระบบไว้แล้ว
--   แต่บรรทัด "grant all on all tables" ข้างบนรันทีหลังใบ จึงให้สิทธิ์คืน → คนนอกอ่านรายการแม่แบบได้
--   (ชุดทดสอบ anon-exposure จับได้ 13 ต.ค. 69 บนฐานที่สร้างใหม่จากใบ · ฐานจริงไม่มีไฟล์นี้ จึงไม่โดน)
--   ⚠️ เพิ่มมุมมองใหม่ที่ข้ามกฎรายตารางเมื่อไร ต้องมาถอนสิทธิ์ซ้ำตรงนี้ด้วยทุกครั้ง
revoke all on public.master_catalog_public from anon;
grant select on public.master_catalog_public to authenticated, service_role;
