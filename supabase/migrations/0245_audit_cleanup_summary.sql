-- ── ใบ 0245: ลบแถวทดสอบในบันทึกการใช้งาน = ฐานเขียนบันทึกสรุป 1 แถวทุกครั้ง (บอสสั่ง 26 ต.ค. 69) ──────────────────────
--
-- คำสั่งบอส: "ตอนลบแถวทดสอบในบันทึกการใช้งาน ให้ฐานเขียนบันทึกสรุป 1 แถวทุกครั้ง: ลบโดยชุดล้างข้อมูลทดสอบ จำนวนกี่แถว
--   ช่วงวันที่ของแถวที่ลบ และชื่อชุดสำรองก่อนลบ บันทึกสรุปนี้ห้ามลบด้วยชุดล้าง"
-- ที่ทำ:
--   ① ตัวดักหลังคำสั่งลบ (ทั้งคำสั่ง) — ลบด้วยทางชุดล้างข้อมูลทดสอบ (สวิตช์ pms.audit_delete = 'test') แล้วมีแถวถูกลบ
--      → ฐานเพิ่มบันทึกสรุป 1 แถวในคำสั่งเดียวกัน: ผู้ทำ "ชุดล้างข้อมูลทดสอบ" · จำนวน · ช่วงวันที่ (ปี พ.ศ.) · ชื่อชุดสำรอง
--   ② ต้องระบุชื่อชุดสำรองก่อนลบ (pms.audit_backup) — ไม่ระบุ/ยังเป็นค่าตัวอย่าง = ทั้งคำสั่งลบถูกปฏิเสธ แถวไม่หาย
--   ③ บันทึกสรุปไม่ใช่แถวทดสอบ (_audit_is_test_row = เท็จ) → ชุดล้างลบไม่ได้ · ลบได้ทางเดียวคือลบอัตโนมัติเกิน 2 ปีเหมือนแถวจริง
--   ④ audit_test_cleanup (ทางของสคริปต์ที่ใช้กุญแจฝั่งเซิร์ฟเวอร์) รับชื่อชุดสำรองเพิ่ม (p_backup) — สิทธิ์เรียกคงเดิม (service_role)
-- ลบอัตโนมัติเกิน 2 ปี (สวิตช์ 'retention') ไม่เขียนบันทึกสรุป (คำสั่งบอสพูดถึงชุดล้างข้อมูลทดสอบเท่านั้น)
-- ข้อทดสอบ: supabase/tests/audit_cleanup_summary.sql

-- ═══ ①② ตัวดักหลังคำสั่งลบ ════════════════════════════════════════════════════════════════════════════════════════════
create or replace function public.audit_log_cleanup_summary() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
declare
  ทาง    text := coalesce(current_setting('pms.audit_delete', true), '');
  สำรอง  text := nullif(btrim(coalesce(current_setting('pms.audit_backup', true), '')), '');
  n      integer;
  ต้น    timestamptz;
  ปลาย   timestamptz;
begin
  if ทาง <> 'test' then return null; end if;
  select count(*), min(at), max(at) into n, ต้น, ปลาย from deleted_rows;
  if n = 0 then return null; end if;
  if สำรอง is null or สำรอง like '\_\_%' then
    raise exception 'audit_cleanup_backup: ลบแถวทดสอบในบันทึกการใช้งานต้องระบุชื่อชุดสำรองก่อนลบ (pms.audit_backup) — ไม่ได้ลบอะไร'
      using errcode = '42501';
  end if;
  insert into audit_log ("user", role, action, target)
  values ('ชุดล้างข้อมูลทดสอบ', 'ระบบ', 'ลบแถวทดสอบในบันทึกการใช้งาน',
          format('%s แถว · ช่วงวันที่ %s ถึง %s · ชุดสำรองก่อนลบ: %s', n, th_datetime(ต้น), th_datetime(ปลาย), สำรอง));
  return null;
end $$;
revoke all on function public.audit_log_cleanup_summary() from public, anon, authenticated, service_role;

drop trigger if exists audit_log_cleanup_summary on public.audit_log;
create trigger audit_log_cleanup_summary after delete on public.audit_log
  referencing old table as deleted_rows
  for each statement execute function public.audit_log_cleanup_summary();

-- ═══ ④ ทางของสคริปต์ที่ใช้กุญแจฝั่งเซิร์ฟเวอร์ — รับชื่อชุดสำรองด้วย ═════════════════════════════════════════════════════
drop function if exists public.audit_test_cleanup(bigint[], text, text);
create or replace function public.audit_test_cleanup(p_ids bigint[] default null, p_action_like text default null, p_target_like text default null, p_backup text default null)
  returns integer language plpgsql security definer set search_path to 'public' as $$
declare n integer;
begin
  if p_ids is null and p_action_like is null and p_target_like is null then
    raise exception 'audit_test_cleanup: ต้องระบุเงื่อนไขอย่างน้อยหนึ่งอย่าง (ห้ามลบทั้งตาราง)';
  end if;
  perform set_config('pms.audit_delete', 'test', true);
  perform set_config('pms.audit_backup', coalesce(p_backup, ''), true);
  delete from audit_log
   where (p_ids is null or id = any(p_ids))
     and (p_action_like is null or action like p_action_like)
     and (p_target_like is null or target like p_target_like);
  get diagnostics n = row_count;
  perform set_config('pms.audit_delete', '', true);
  perform set_config('pms.audit_backup', '', true);
  return n;
end $$;
revoke all on function public.audit_test_cleanup(bigint[], text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.audit_test_cleanup(bigint[], text, text, text) to service_role;
