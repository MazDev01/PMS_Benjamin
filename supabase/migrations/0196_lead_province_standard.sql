-- ── จังหวัดหน้างานของลูกค้าเป้าหมายต้องอยู่ในรายชื่อจังหวัดมาตรฐาน (ด่าน 1 · กฎพื้นที่) ─────────────────────────
--
-- ช่องโหว่ของกฎพื้นที่ (ใบ 0195): จังหวัดที่สะกดไม่ตรงรายชื่อ (ชื่อย่อ "กรุงเทพฯ" · สะกดผิด) ไม่ตรงกับพื้นที่ของใคร
--   จึงถูกนับเป็น "จังหวัดว่าง" — ดีลเลอร์เลี่ยงพื้นที่ของรายอื่นได้ด้วยการพิมพ์ชื่อจังหวัดคนละแบบ = ขัด FLOW.html
--
-- กติกา (ข้อตัดสินของบอส 14 ต.ค. 69): ลูกค้าเป้าหมายใหม่ หรือแก้จังหวัด → จังหวัดต้องอยู่ใน th_provinces (77 จังหวัด)
--   บังคับทุกทาง รวมสำนักงานใหญ่และการนำเข้าด้วยกุญแจฝั่งเซิร์ฟเวอร์ — ทางเข้าที่ยกเว้นคือทางที่ใช้เลี่ยงได้
--   ข้อมูลเดิมไม่ถูกตรวจย้อนหลัง (แบบเดียวกับข้อจำกัด NOT VALID): ทำงานเฉพาะตอนสร้าง และตอนช่องจังหวัดถูกแก้
--   จังหวัดว่าง ("") ไม่ตรวจ — รายเดิมที่ไม่มีจังหวัด (ระบบจริง 80 ราย) และงานขายใหม่ของลูกค้าเดิม · รายใหม่บังคับกรอกอยู่แล้ว (ใบ 0186)
--   ใช้ตัวดักแทนกุญแจนอก: ช่องจังหวัดของรายเดิมเป็นค่าว่าง "" ซึ่งกุญแจนอกไม่ยอม

-- ทำงานด้วยสิทธิ์เจ้าของ: อ่านรายชื่อจังหวัดได้เสมอ ไม่ขึ้นกับกฎรายแถวของผู้เรียก
--   (บัญชีที่ยังไม่ตั้งรหัสอ่านตารางใดไม่ได้เลย — ใบ 0187 — ถ้าใช้สิทธิ์ผู้เรียก ข้อความจะผิดเป็น "จังหวัดไม่อยู่ในรายชื่อ")
create or replace function public.leads_province_standard() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
declare p text := btrim(coalesce(new.province, ''));
begin
  if tg_op = 'UPDATE' and new.province is not distinct from old.province then return new; end if;
  if p = '' then return new; end if;
  if not exists (select 1 from th_provinces where name = p) then
    raise exception 'lead_province_invalid: จังหวัด "%" ไม่อยู่ในรายชื่อจังหวัดมาตรฐาน — เลือกจากรายชื่อ 77 จังหวัด', p;
  end if;
  return new;
end $$;
revoke all on function public.leads_province_standard() from public, anon, authenticated, service_role;

-- ชื่อเรียงก่อน leads_territory_guard (ตัวดักทำงานตามลำดับชื่อ) — ตรวจว่าเป็นจังหวัดจริงก่อน แล้วค่อยตรวจพื้นที่
drop trigger if exists leads_province_standard on public.leads;
create trigger leads_province_standard before insert or update of province on public.leads
  for each row execute function public.leads_province_standard();
