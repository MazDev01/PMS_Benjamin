-- ── ใบ 0220: ดีลเลอร์เห็นแถวของสาขาตัวเองแถวเดียวในทะเบียนดีลเลอร์ (บอสสั่ง 20 ต.ค. 69 · รอบ 2 ช่วง ก2) ─────────────────
--
-- เดิม: dealers_directory ไม่มีเงื่อนไขแถว → ดีลเลอร์ทุกรายเห็นชื่อ จังหวัด ภาค สถานะ แพ็กเกจ ของดีลเลอร์ทั้ง 155 ราย
--   (เป้ายอดขายของสาขาอื่นถูกซ่อนอยู่แล้ว · ตรวจบนฐานจริง 20 ต.ค. 69 หลังลงใบ 0216)
-- ไล่แล้ว (ฝั่งดีลเลอร์อ่านทะเบียนนี้ 6 จุด — ใช้แค่แถวของตัวเองทั้งหมด ไม่มีขั้นไหนใน FLOW ต้องรู้ข้อมูลสาขาอื่น):
--   แดชบอร์ด (เป้ายอดขายของสาขา) · ชื่อร้านบนหัวจอ (useCurrentDealer) · รายการจังหวัดให้เลือก (ภาคของสาขา · useMyProvinces)
--   หน้าลูกค้า (ภาคของสาขา) · ตรวจว่าสาขายังเปิดใช้งาน (supabaseAuth stillValid / server v1 auth)
--   ตัวกรองดีลเลอร์ (FilterBar) และผลค้นหาดีลเลอร์ (Topbar) เปิดเฉพาะ HQ
-- ใหม่: HQ เห็นทั้งหมด · ดีลเลอร์เห็นแถวของตัวเอง · งานฝั่งเซิร์ฟเวอร์ (service role) เห็นทั้งหมดเหมือนเดิม
-- ข้อทดสอบ: supabase/tests/dealers_directory_own_row.sql · tests/scenario/flow-a2-hq-quoted.spec.ts (หน้าเว็บดีลเลอร์ทำงานปกติ)
create or replace view public.dealers_directory as
select
  code, name, province, region, status, created_at,
  case when is_hq() or code = auth_dealer() then revenue_target else null end as revenue_target,
  package,
  target_manual
from public.dealers
where is_hq() or code = auth_dealer() or coalesce(auth.role(), '') = 'service_role';

-- create or replace view รีเซ็ต ACL — ตั้งซ้ำตาม 0180/0199/0216
revoke all on public.dealers_directory from public, anon;
revoke insert, update, delete, truncate, references, trigger on public.dealers_directory from anon, authenticated, service_role;
grant select on public.dealers_directory to authenticated, service_role;
