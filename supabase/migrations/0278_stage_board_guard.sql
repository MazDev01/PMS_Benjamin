-- ── ใบ 0278: stage_board_guard (จองโดยเซสชัน ef · npm run migration:new) ──
-- บอสสั่ง 5 พ.ย. 69 (บอร์ดผู้สนใจลากได้ · ข้อ ฉ ช ซ):
--   1. คนเลื่อนขั้นผู้สนใจได้ "ไปข้างหน้าทีละ 1 ขั้น" เท่านั้น — ห้ามข้าม ห้ามถอย (เดิม 0174 ยอมถอยทีละขั้น)
--      ระบบถอยได้ตามใบ: ใบค่าแฟรนไชส์ถูกปฏิเสธ/หมดอายุ → รอผู้สนใจตอบรับ กลับไปนัดคุยแล้ว (ตัวดัก dealer_package_proposals_log · 0177)
--      แยกด้วย pg_trigger_depth(): คำสั่งของคน (แอป/API) = ชั้น 1 · คำสั่งจากตัวดักใบ = ชั้น 2 ขึ้นไป · คำสั่งนำเข้าทั้งชุดเปิดสวิตช์ app.prospect_stage_system
--      คงเดิม: ไม่สำเร็จได้จากทุกขั้นก่อนเป็นดีลเลอร์ · เปิดติดตามใหม่จากไม่สำเร็จ · เป็นดีลเลอร์ต้องผูกรหัสสาขา · เป็นดีลเลอร์แล้วเปลี่ยนไม่ได้
--   2. ชื่อขั้น considering = "รอผู้สนใจตอบรับ" (เดิม "รอตัดสินใจ HQ" · 0268) — ตัวสร้างข้อความเท่านั้น ไม่แก้บันทึกเก่า/audit (แปลงตอนแสดง)
--   3. ยกเลิกงานล่าสุดที่ติ๊กในแผง = ถอยได้ 1 ขั้นทางเดียว (บอสตอบ 5 พ.ย. 69 "ยกเลิกงานล่าสุดที่ติ๊กได้เหมือนเดิม")
--      ผ่านคำสั่ง prospect_undo_last_task(id) เท่านั้น (ทำในนามผู้เรียก · สิทธิ์แก้ = กฎสิทธิ์รายแถวเดิม · ลงประวัติ + บันทึกการใช้งาน)
--      เปลี่ยนขั้นตรง (แอป/API/ลากบนบอร์ด) ถอยยังไม่ได้ · ถอยเกิน 1 ขั้นไม่ได้ทุกทาง
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
  -- ยกเลิกงานล่าสุด (prospect_undo_last_task ตั้งสวิตช์นี้ในคำสั่งเดียว) — ถอยได้ 1 ขั้นเท่านั้น
  ยกเลิกงาน boolean := coalesce(current_setting('app.prospect_stage_undo', true), '') = 'on';
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
    if b < a and not ระบบ and not (ยกเลิกงาน and b = a - 1) then
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

-- ── ยกเลิกงานล่าสุดที่ติ๊กในแผง = ถอย 1 ขั้น (ทางเดียวที่คนถอยขั้นได้) ──
--   สิทธิ์ = กฎเดียวกับกฎสิทธิ์รายแถวของการแก้ผู้สนใจ (dealer_prospects_write = can_write_master) ตรวจตรงในคำสั่ง
--   security definer: ตัวสร้างชื่อขั้น (prospect_status_th) ไม่ได้เปิดให้ผู้ใช้เรียกตรง
--   ประวัติขั้น (dealer_prospects_log) ใช้ข้อความ "ยกเลิกงานล่าสุด · เดิม → ใหม่" · บันทึกการใช้งานลงเองจากตัวดักเดิม
create or replace function public.prospect_undo_last_task(p_id bigint) returns public.dealer_prospects
  language plpgsql security definer set search_path to 'public' as $$
declare
  p public.dealer_prospects;
  ก่อน text;
begin
  if not can_write_master() then raise exception 'forbidden: ยกเลิกงานผู้สนใจได้เฉพาะผู้ดูแลระบบ/ผู้บริหารสำนักงานใหญ่'; end if;
  select * into p from public.dealer_prospects where id = p_id for update;
  if p.id is null then raise exception 'prospect_undo: ไม่พบผู้สนใจ'; end if;
  ก่อน := case p.status when 'contacted' then 'new' when 'profile_sent' then 'contacted'
                        when 'meeting' then 'profile_sent' when 'considering' then 'meeting' else null end;
  if ก่อน is null then raise exception 'prospect_undo: ขั้น % ยกเลิกงานไม่ได้ (ไม่มีงานที่ติ๊กไว้ หรือปิดแล้ว)', prospect_status_th(p.status); end if;
  perform set_config('app.prospect_stage_undo', 'on', true);
  perform set_config('app.prospect_step_note', 'ยกเลิกงานล่าสุด · ' || prospect_status_th(p.status) || ' → ' || prospect_status_th(ก่อน), true);
  update public.dealer_prospects set status = ก่อน where id = p_id returning * into p;
  perform set_config('app.prospect_stage_undo', '', true);
  perform set_config('app.prospect_step_note', '', true);
  return p;
end $$;
revoke all on function public.prospect_undo_last_task(bigint) from public, anon, service_role;
grant execute on function public.prospect_undo_last_task(bigint) to authenticated;
