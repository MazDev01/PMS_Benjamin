-- ── ใบ 0255: territory_on_province_fix (จองโดยเซสชัน flow-hq-a · npm run migration:new) ──
-- ดีลเลอร์ที่ยังไม่มีพื้นที่ แก้จังหวัดที่ตั้งให้ตรงรายชื่อแล้ว ต้องได้พื้นที่ (ผลตรวจเทียบ FLOW รอบ 5 แถว 7 + 9 · 28 ต.ค. 69)
--
-- อาการ (ฐาน dev):
--   หน้าดีลเลอร์ขึ้น "ดีลเลอร์ที่ยังไม่มีพื้นที่ 1 ราย … แก้จังหวัดในข้อมูลดีลเลอร์ให้ตรงรายชื่อ: BKK (กรุงเทพฯ)"
--   หน้าผู้สนใจเป็นดีลเลอร์ขึ้น "จังหวัดที่มีลูกค้าเป้าหมายแต่ยังไม่มีดีลเลอร์: กรุงเทพฯ (10)" ทั้งที่มีสาขา BKK
-- ต้นเหตุ:
--   1) ข้อมูล: ทะเบียน BKK ใช้ชื่อย่อ "กรุงเทพฯ" (ไม่อยู่ใน 77 จังหวัด) → ตอนย้ายพื้นที่ (ใบ 0195 ข้อ 3) ไม่จับคู่ให้ (ตั้งใจ · ระบบไม่เดา)
--      จึงไม่มีแถวใน dealer_territories · ลูกค้าเป้าหมายของ BKK ก็บันทึก "กรุงเทพฯ" มาก่อนใบ 0196
--   2) ตรรกะ: การ์ดบอก HQ ให้ "แก้จังหวัดในข้อมูลดีลเลอร์ให้ตรงรายชื่อ" แต่การแก้จังหวัดที่ตั้ง (dealers.province) ไม่เคยให้พื้นที่
--      — พื้นที่ถูกเขียนแค่ตอนสร้างดีลเลอร์ (api/admin/dealers) และไม่มีหน้าจอให้กำหนดพื้นที่ภายหลัง
--      ทำตามคำแนะนำแล้วการ์ดหาย แต่ดีลเลอร์ยังไม่มีพื้นที่ → จังหวัดนั้นยังนับเป็น "ยังไม่มีดีลเลอร์" · โอนลีดของ HQ หาสาขาไม่เจอ
-- ทางแก้ (ใบนี้):
--   แก้จังหวัดที่ตั้งของดีลเลอร์ที่ "ยังไม่มีพื้นที่เลย" เป็นชื่อในรายชื่อมาตรฐาน → ได้พื้นที่จังหวัดนั้นทันที (กติกาเดียวกับใบ 0195 ข้อ 3)
--   ดีลเลอร์ที่มีพื้นที่อยู่แล้ว ย้ายที่ตั้ง = พื้นที่ไม่เปลี่ยน (ที่ตั้งกับพื้นที่ดูแลเป็นคนละเรื่อง · ไม่เดาแทน HQ)
--   ชื่อที่ไม่อยู่ในรายชื่อ (ชื่อย่อ/สะกดผิด/"ทุกจังหวัด") = ไม่ให้พื้นที่ การ์ดยังขึ้นให้ HQ แก้ (ไม่เดาจับคู่ เหมือนเดิม)
--   เฉพาะตอนแก้ (update) — ตอนสร้างดีลเลอร์ ทางสร้างเขียนพื้นที่ที่ HQ เลือกเองอยู่แล้ว (ห้ามเติมซ้อน)
--   ไม่เติมย้อนหลังให้รายเดิม: ได้พื้นที่ = ดีลเลอร์อื่นสร้างลีดในจังหวัดนั้นไม่ได้ (leads_territory_guard) — เปลี่ยนพฤติกรรมบนระบบจริง
--     โดยไม่มีใครสั่ง · ให้เกิดเฉพาะตอน HQ กดแก้จังหวัดเอง
-- ข้อมูลตั้งต้นของฐานทดสอบ (BKK = "กรุงเทพฯ") ไม่แตะ — ใบนี้ไม่เดาแก้ชื่อย่อให้ · HQ แก้ที่ปุ่ม "แก้ไข" ของดีลเลอร์
-- ข้อทดสอบ: tests/scenario/dealer-territory-province-fix.spec.ts

create or replace function public.dealers_territory_on_province_fix() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
declare p text := btrim(coalesce(new.province, ''));
begin
  if new.code = 'HQ' or new.province is not distinct from old.province then return null; end if;
  if not exists (select 1 from th_provinces where name = p) then return null; end if;
  if exists (select 1 from dealer_territories where dealer_code = new.code) then return null; end if;
  insert into dealer_territories (province, dealer_code) values (p, new.code)
    on conflict (province, dealer_code) do nothing;
  return null;
end $$;
revoke all on function public.dealers_territory_on_province_fix() from public, anon, authenticated, service_role;

drop trigger if exists dealers_territory_on_province_fix on public.dealers;
create trigger dealers_territory_on_province_fix after update of province on public.dealers
  for each row execute function public.dealers_territory_on_province_fix();

