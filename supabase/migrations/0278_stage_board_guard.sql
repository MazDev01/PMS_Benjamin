-- ── ใบ 0278: stage_board_guard (จองโดยเซสชัน ef · npm run migration:new) ──
-- บอสสั่ง 5 พ.ย. 69 (บอร์ดผู้สนใจลากได้ · ข้อ ฉ ช ซ):
--   1. คนเลื่อนขั้นผู้สนใจได้ "ไปข้างหน้าทีละ 1 ขั้น" เท่านั้น — ห้ามข้าม ห้ามถอย (เดิม 0174 ยอมถอยทีละขั้น)
--      ระบบถอยได้ตามใบ: ใบค่าแฟรนไชส์ถูกปฏิเสธ/หมดอายุ → รอผู้สนใจตอบรับ กลับไปนัดคุยแล้ว (ตัวดัก dealer_package_proposals_log · 0177)
--      แยกด้วย pg_trigger_depth(): คำสั่งของคน (แอป/API) = ชั้น 1 · คำสั่งจากตัวดักใบ = ชั้น 2 ขึ้นไป · คำสั่งนำเข้าทั้งชุดเปิดสวิตช์ app.prospect_stage_system
--      คงเดิม: ไม่สำเร็จได้จากทุกขั้นก่อนเป็นดีลเลอร์ · เปิดติดตามใหม่จากไม่สำเร็จ · เป็นดีลเลอร์ต้องผูกรหัสสาขา · เป็นดีลเลอร์แล้วเปลี่ยนไม่ได้
--   2. ชื่อขั้น considering = "รอผู้สนใจตอบรับ" (เดิม "รอตัดสินใจ HQ" · 0268) — ตัวสร้างข้อความเท่านั้น ไม่แก้บันทึกเก่า/audit (แปลงตอนแสดง)
--   ข้อ ซ: นับฐานจริงแล้ว 170 ราย ขั้นตรงใบทั้งหมด → ใบนี้ไม่จัดขั้นข้อมูลเก่า
-- ข้อทดสอบ: supabase/tests/stage_board_guard.sql

create or replace function public.prospect_status_th(s text)
 returns text
 language sql
 immutable
 set search_path to 'public'
as $function$
  select case s
    when 'new' then 'รอติดต่อ'           when 'contacted' then 'ติดต่อแล้ว'
    when 'profile_sent' then 'ส่งข้อมูลบริษัทแล้ว' when 'meeting' then 'นัดคุยแล้ว'
    when 'considering' then 'รอผู้สนใจตอบรับ'  when 'won' then 'เป็นดีลเลอร์แล้ว'
    when 'lost' then 'ไม่สำเร็จ'          else s end
$function$;

create or replace function public._prospect_status_th(s text) returns text
language sql immutable set search_path = public as $$
  select case s when 'new' then 'รอติดต่อ' when 'contacted' then 'ติดต่อแล้ว' when 'profile_sent' then 'ส่งข้อมูลบริษัทแล้ว'
    when 'meeting' then 'นัดคุยแล้ว' when 'considering' then 'รอผู้สนใจตอบรับ' when 'won' then 'เป็นดีลเลอร์แล้ว'
    when 'lost' then 'ไม่สำเร็จ' else s end;
$$;

create or replace function public.dealer_prospects_stage_guard()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  a int := prospect_stage_no(old.status);
  b int := prospect_stage_no(new.status);
  -- ระบบเปลี่ยนเอง ไม่ใช่คนสั่งตรง: จากตัวดักอื่น (ใบค่าแฟรนไชส์ถูกปฏิเสธ/หมดอายุ) หรือคำสั่งนำเข้าทั้งชุด (ตั้งขั้นตามไฟล์ทีหลังบันทึกการติดต่อ · 0277)
  --   app.prospect_stage_system ตั้งได้จากฟังก์ชันในฐานเท่านั้น (แอปเรียก set_config ทาง API ไม่ได้)
  --   coalesce: ไม่ได้ตั้งสวิตช์ = null → "false or null" = null → "not ระบบ" = null → เงื่อนไขกันถอยไม่ทำงาน (เจอตอนทดสอบ 5 พ.ย. 69)
  ระบบ boolean := pg_trigger_depth() > 1 or coalesce(current_setting('app.prospect_stage_system', true), '') = 'on';
begin
  -- ติดต่อล่าสุดตั้งได้จากบันทึกการติดต่อทางเดียว — แอปส่งทั้งแถวกลับมา ห้ามทับค่าที่ตัวดักตั้งไว้
  if current_setting('app.prospect_contact', true) is distinct from 'on' then
    new.last_contact_at := old.last_contact_at;
  end if;

  if new.status is not distinct from old.status then return new; end if;

  if old.status = 'won' then
    raise exception 'prospect_stage: รายนี้เป็นดีลเลอร์แล้ว เปลี่ยนขั้นไม่ได้';
  end if;
  if new.status = 'won' then
    if new.dealer_code is null then
      raise exception 'prospect_stage: สถานะ “เป็นดีลเลอร์แล้ว” ต้องผูกกับดีลเลอร์';
    end if;
    return new;
  end if;
  if new.status = 'lost' then return new; end if;

  -- จากขั้นติดตามไปขั้นติดตาม (เปิดติดตามใหม่จากไม่สำเร็จ ไปขั้นเดิมได้เลย)
  if old.status <> 'lost' then
    if b < a and not ระบบ then
      raise exception 'prospect_stage: ย้อนขั้นไม่ได้ (% → %) — เลื่อนได้ทีละขั้นไปข้างหน้าเท่านั้น',
        prospect_status_th(old.status), prospect_status_th(new.status);
    end if;
    if abs(b - a) <> 1 then
      raise exception 'prospect_stage: เลื่อนขั้นได้ทีละขั้น ห้ามข้ามขั้น (% → %)',
        prospect_status_th(old.status), prospect_status_th(new.status);
    end if;
  end if;
  if new.status = 'considering' and not exists (
    select 1 from public.dealer_package_proposals
    where prospect_id = new.id and status in ('sent', 'accepted')
  ) then
    raise exception 'prospect_stage: ต้องส่งใบค่าแฟรนไชส์ก่อน ถึงจะเป็น “รอผู้สนใจตอบรับ”';
  end if;
  return new;
end $function$;
