-- ── ใบ 0303: "อื่น ๆ (ระบุ)" ต้องมีในกล่องเหตุผลเสมอ (บอสสั่ง 24 พ.ย. 69 ดู localhost "ต้องมี อื่น ๆ ในหน้าปิดการขายไม่สำเร็จ บางทีจะไม่อยู่ในตัวเลือก") ──
-- เดิม: HQ ซ่อน/ลบตัวระบุเอง (free_text) ได้ → กล่องเหตุผล (ปิดไม่สำเร็จ · ลูกค้าปฏิเสธ · ผู้สนใจไม่สำเร็จ · ปฏิเสธใบค่าแฟรนไชส์) ไม่มีทางพิมพ์เหตุผลเอง
-- ตอนนี้: ตัวดักของรายการกลาง (option_lists_guard · ยกจากใบ 0296 · เพิ่มเฉพาะเงื่อนไขตัวระบุเอง) ปฏิเสธ
--   ลบตัวระบุเอง · ซ่อนตัวระบุเอง · เปลี่ยนตัวระบุเองเป็นตัวธรรมดา — แก้ชื่อ/เลื่อนลำดับได้ตามเดิม
--   ทางบันทึกของหน้าตั้งค่า (option_lists_save) ลบตัวที่ไม่อยู่ในชุด → ตัวดักนี้ปฏิเสธทั้งชุดพร้อมเหตุผล
-- หน้าเว็บ: กล่องเหตุผล/ช่องเลือกเหตุผลใส่ตัวระบุเองท้ายรายการเสมอ · หน้าตั้งค่าปิดปุ่มซ่อน/ลบของตัวนี้
-- ข้อมูลเดิม: ตัวระบุเองที่ถูกซ่อนไว้ → แสดง (แก้ตอนลงใบ · ปิดตัวดักไม่ต้อง: ตั้ง hidden = false ผ่านเงื่อนไขใหม่ได้)
-- ข้อทดสอบ: ซ้อมลงใบ tests/tools/migration-0303.test.mjs · tests/scenario/lost-reason-other.spec.ts

create or replace function public.option_lists_guard() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'DELETE' then
    -- ใบ 0303: ตัวระบุเอง ("อื่น ๆ (ระบุ)") ต้องมีในกล่องเหตุผลเสมอ — ลบไม่ได้ (แก้ชื่อได้)
    if old.free_text then
      raise exception 'option_other_locked: ตัวเลือก "%" ต้องมีให้เลือกเสมอ ลบไม่ได้ — แก้ชื่อได้', old.label;
    end if;
    if _option_in_use(old.list, old.code) then
      raise exception 'option_in_use: ตัวเลือก "%" มีข้อมูลใช้อยู่ ลบไม่ได้ — ซ่อนแทน', old.label;
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and (new.list is distinct from old.list or new.code is distinct from old.code) then
    raise exception 'option_code_locked: แก้รหัสของตัวเลือกไม่ได้ (ข้อมูลอ้างรหัสนี้) — แก้ชื่อแทน';
  end if;
  -- ใบ 0303: ตัวระบุเองซ่อนไม่ได้ · เปลี่ยนเป็นตัวธรรมดาไม่ได้ (กล่องเหตุผลต้องมีช่องพิมพ์เสมอ)
  if new.free_text and new.hidden then
    raise exception 'option_other_locked: ตัวเลือก "%" ต้องมีให้เลือกเสมอ ซ่อนไม่ได้ — แก้ชื่อได้', new.label;
  end if;
  if tg_op = 'UPDATE' and old.free_text and not new.free_text then
    raise exception 'option_other_locked: ตัวเลือก "%" ต้องเป็นตัวเลือกพิมพ์เองเสมอ', old.label;
  end if;
  new.label := replace(btrim(regexp_replace(new.label, '\s+', ' ', 'g')), 'อื่นๆ', 'อื่น ๆ');
  new.updated_at := now();
  return new;
end $$;
revoke all on function public.option_lists_guard() from public, anon, authenticated, service_role;
drop trigger if exists option_lists_guard on public.option_lists;
create trigger option_lists_guard before insert or update or delete on public.option_lists
  for each row execute function public.option_lists_guard();

-- ── ตัวระบุเองที่ถูกซ่อนไว้ก่อนใบนี้ → แสดง ──
update public.option_lists set hidden = false where free_text and hidden;
