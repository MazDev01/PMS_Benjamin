-- ── ใบ 0261: แก้จังหวัดของผู้สนใจเป็นดีลเลอร์ที่สะกดไม่ตรงรายชื่อ 77 จังหวัด (บอสตัดสิน 29 ต.ค. 69) ─────────────────────
--
-- ที่มา: ผู้สนใจนำเข้าจาก Excel (พิมพ์เอง) — ฐานจริงนับแบบอ่านอย่างเดียว 29 ต.ค. 69: 170 ราย · ตรงแล้ว 78 · ว่าง 24
--   แปลงได้ 1 ต่อ 1 = 54 ราย (28 แบบ) · กำกวม/แปลงไม่ได้ = 14 ราย (รายงานบอสก่อนแก้ ไม่ใส่ชื่อ/เบอร์/อีเมล)
-- ข้อตัดสินของบอส:
--   1) ตารางแปลง 1 ต่อ 1 ใช้ได้ตามที่เสนอ (กทม → กรุงเทพมหานคร · ปทุม → ปทุมธานี · โคราช → นครราชสีมา ฯลฯ)
--   2) ชื่อเมือง 4 ชื่อแปลงได้: รังสิต → ปทุมธานี · สมุย → สุราษฎร์ธานี · พัทยา → ชลบุรี · หาดใหญ่ → สงขลา
--   3) หลายจังหวัด/ภาค (10 ราย): ย้ายข้อความเดิมไปต่อท้ายหมายเหตุ "จังหวัดที่ระบุไว้เดิม: ..." แล้วล้างช่องจังหวัดเป็นว่าง
--      ห้ามทิ้งข้อความเดิม · จำนวนผู้สนใจเท่าเดิม (ไม่ลบแถว)
-- กติกาที่ใช้ (ฟังก์ชัน _prospect_province_cleanup · ข้อทดสอบเรียกกับแถวของตัวเองได้):
--   ตรงรายชื่อแล้ว / ว่าง / "ทุกจังหวัด" (ผู้สนใจทั่วประเทศ · ใบ 0259) = ไม่แตะ
--   อยู่ในตารางแปลง = เปลี่ยนเป็นชื่อมาตรฐาน · ช่องภาค (region) ไม่แตะ
--   นอกนั้นทั้งหมด = ข้อความเดิมไปต่อท้ายหมายเหตุ + ล้างจังหวัด (ไม่เดาเพิ่มจากที่บอสอนุมัติ)
--   แก้ข้อมูลเดิม ไม่ใช่การทำงานของผู้ใช้ → ผู้เรียกปิดตัวดักระหว่างแก้ (ไม่เขียนประวัติ/บันทึกการใช้งานซ้ำทุกแถว · แบบเดียวกับส่วนซ่อมใบ 0252)
--   (ปิดตัวดักในตัวฟังก์ชันไม่ได้ — บทบาทของใบปรับฐานตั้ง session_replication_role ได้เฉพาะระดับใบ ไม่ใช่ในฟังก์ชัน)
-- ข้อทดสอบ: supabase/tests/prospect_province_cleanup.sql

create or replace function public._prospect_province_cleanup(p_ids bigint[] default null) returns jsonb
  language plpgsql security definer set search_path to 'public' as $$
declare แปลง int; ย้าย int;
begin
  with ตาราง(จาก, เป็น) as (values
    ('กทม', 'กรุงเทพมหานคร'), ('กทม.', 'กรุงเทพมหานคร'), ('ปทุม', 'ปทุมธานี'), ('ปุทม', 'ปทุมธานี'),
    ('โคราช', 'นครราชสีมา'), ('โคราข', 'นครราชสีมา'), ('สุราษฏ์', 'สุราษฎร์ธานี'), ('สุราษฐ์', 'สุราษฎร์ธานี'),
    ('นครศรีฯ', 'นครศรีธรรมราช'), ('นครศรี', 'นครศรีธรรมราช'), ('อุบล', 'อุบลราชธานี'), ('อุดร', 'อุดรธานี'),
    ('สมุทสาคร', 'สมุทรสาคร'), ('ประจวบ', 'ประจวบคีรีขันธ์'), ('จ.จันทบุรี', 'จันทบุรี'), ('ศรีษะเกษ', 'ศรีสะเกษ'),
    ('สกล', 'สกลนคร'), ('สรุบุรี', 'สระบุรี'), ('ปราจีน', 'ปราจีนบุรี'), ('สงชลา', 'สงขลา'), ('สิงบุรี', 'สิงห์บุรี'),
    ('กำแพงเพ็ช', 'กำแพงเพชร'), ('พีทลุง', 'พัทลุง'), ('สมุรปราการ', 'สมุทรปราการ'), ('เพชบูรณ์', 'เพชรบูรณ์'),
    ('อยุธยา', 'พระนครศรีอยุธยา'), ('เพรชบุรี', 'เพชรบุรี'), ('สุพรรณ', 'สุพรรณบุรี'),
    -- ชื่อเมือง 4 ชื่อ (บอสอนุมัติ 29 ต.ค. 69)
    ('รังสิต', 'ปทุมธานี'), ('สมุย', 'สุราษฎร์ธานี'), ('พัทยา', 'ชลบุรี'), ('หาดใหญ่', 'สงขลา')
  )
  update dealer_prospects p set province = t.เป็น
    from ตาราง t
   where btrim(p.province) = t.จาก and (p_ids is null or p.id = any(p_ids));
  get diagnostics แปลง = row_count;

  update dealer_prospects p
     set note = concat_ws(E'\n', nullif(btrim(coalesce(p.note, '')), ''), 'จังหวัดที่ระบุไว้เดิม: ' || btrim(p.province)),
         province = null
   where btrim(coalesce(p.province, '')) <> '' and btrim(p.province) <> 'ทุกจังหวัด'
     and not exists (select 1 from th_provinces t where t.name = btrim(p.province))
     and (p_ids is null or p.id = any(p_ids));
  get diagnostics ย้าย = row_count;
  return jsonb_build_object('แปลง', แปลง, 'ย้ายไปหมายเหตุ', ย้าย);
end $$;
revoke all on function public._prospect_province_cleanup(bigint[]) from public, anon, authenticated, service_role;

set local session_replication_role = replica;
do $$
declare ก่อน int := (select count(*) from dealer_prospects); r jsonb;
begin
  r := _prospect_province_cleanup();
  if (select count(*) from dealer_prospects) <> ก่อน then raise exception 'ใบ 0261: จำนวนผู้สนใจเปลี่ยน — หยุด'; end if;
  raise notice 'ใบ 0261: ผู้สนใจ % ราย · แปลงชื่อ % ราย · ย้ายข้อความไปหมายเหตุ % ราย · จังหวัดไม่ตรงที่เหลือ % ราย', ก่อน, r ->> 'แปลง', r ->> 'ย้ายไปหมายเหตุ',
    (select count(*) from dealer_prospects p where btrim(coalesce(p.province, '')) <> '' and p.province <> 'ทุกจังหวัด'
       and not exists (select 1 from th_provinces t where t.name = p.province));
end $$;
set local session_replication_role = origin;
