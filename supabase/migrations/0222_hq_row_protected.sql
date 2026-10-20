-- ── ใบ 0222: แถว "HQ" ในทะเบียนดีลเลอร์ ลบไม่ได้ · ปิดใช้งานไม่ได้ · เปลี่ยนรหัสไม่ได้ (บอสตัดสิน 19 ต.ค. 69 · รอบ 2 ช่วง ข) ────────
--
-- แถว HQ เป็นเจ้าของลูกค้าเป้าหมายที่สำนักงานใหญ่ถือไว้ก่อนโอนให้ดีลเลอร์ (ใบ 0197) — ไม่ใช่ดีลเลอร์ขายของ
--   หน้าเว็บซ่อนแถวนี้จากรายชื่อดีลเลอร์และไม่นับในตัวเลขดีลเลอร์ทุกที่ (ช่วง ข) แต่แถวต้องคงอยู่ในฐาน
-- เดิม: แถว HQ ได้ปุ่มลบ/ปิดใช้งานเหมือนดีลเลอร์ทั่วไป · เส้นทางลบและคำสั่งลบของฐานไม่ได้กันรหัส HQ
-- ใหม่: ฐานปฏิเสธเองทุกทาง (รวม service role — เส้นทางผู้ดูแลใช้กุญแจฝั่งเซิร์ฟเวอร์) ยกเว้นงานกู้ข้อมูลที่ตั้ง pms.restore = '1'
-- ข้อทดสอบ: supabase/tests/hq_row_protected.sql
create or replace function public.dealers_hq_row_guard() returns trigger
  language plpgsql set search_path to 'public' as $$
begin
  if coalesce(current_setting('pms.restore', true), '') = '1' then return coalesce(new, old); end if;
  if tg_op = 'DELETE' and old.code = 'HQ' then
    raise exception 'hq_row_protected: แถว "สำนักงานใหญ่ (HQ)" ลบไม่ได้ — เป็นเจ้าของลูกค้าเป้าหมายของสำนักงานใหญ่';
  end if;
  if tg_op = 'UPDATE' and old.code = 'HQ' then
    if new.code is distinct from old.code then
      raise exception 'hq_row_protected: เปลี่ยนรหัสของแถว "สำนักงานใหญ่ (HQ)" ไม่ได้';
    end if;
    if new.status is distinct from old.status and new.status <> 'active' then
      raise exception 'hq_row_protected: ปิดใช้งานแถว "สำนักงานใหญ่ (HQ)" ไม่ได้';
    end if;
  end if;
  return coalesce(new, old);
end $$;
revoke all on function public.dealers_hq_row_guard() from public, anon, authenticated, service_role;

drop trigger if exists dealers_hq_row_guard on public.dealers;
create trigger dealers_hq_row_guard before update or delete on public.dealers
  for each row execute function public.dealers_hq_row_guard();
