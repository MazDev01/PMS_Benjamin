-- ── ใบ 0241: บันทึกการใช้งาน (audit_log) แก้/ลบไม่ได้ทุกบทบาท — เหลือทางลบ 2 ทาง (บอสสั่ง 26 ต.ค. 69) ─────────────────────
--
-- เหตุ: ใบ 0240 ให้ฐานบันทึกการใช้งานเอง → prod-live ทิ้งบันทึกของบัญชีชั่วคราวไว้บนฐานจริง (39 แถว · 26 ต.ค. 69)
--   บอสเลือก: ลบเฉพาะแถวทดสอบ (สาขา ZZT · บัญชีชั่วคราว live-*) ผ่านสคริปต์ล้างข้อมูลทดสอบ
--   และ "ผู้ใช้ทุกระดับรวมถึงผู้ดูแล HQ (SUPER_ADMIN) ลบหรือแก้บันทึกไม่ได้ กันที่ฐาน" · ปุ่มล้างบันทึก (คำสั่ง 14 ส.ค. 69) ยกเลิก
-- กติกา (ตัวดักที่ตาราง — ใช้กับทุกบทบาท รวม service_role ของเส้นทางผู้ดูแล):
--   แก้ (UPDATE) · ล้างทั้งตาราง (TRUNCATE) = ไม่ได้เลย
--   ลบ (DELETE) ได้ 2 ทางเท่านั้น และต้องเปิดสวิตช์ของทางนั้นในคำสั่งเดียวกัน (pms.audit_delete):
--     'retention' — งานลบอัตโนมัติ เฉพาะแถวเก่ากว่า 2 ปี (ใบ 0062 · งานตั้งเวลา audit-log-retention)
--     'test'      — สคริปต์ล้างข้อมูลทดสอบ เฉพาะแถวทดสอบ (_audit_is_test_row) · ปนแถวจริงแม้แถวเดียว = ทั้งคำสั่งถูกปฏิเสธ
--   สวิตช์ตั้งได้จากคำสั่งฐานข้อมูลตรง (สคริปต์ล้าง/งานตั้งเวลา) หรือ audit_test_cleanup (เฉพาะ service_role) — หน้าเว็บ/REST ตั้งเองไม่ได้
-- ตัวตรวจ: scripts/check-audit-delete-paths.mjs (มีทางลบบันทึกอื่นเพิ่มเข้ามา = รอบตรวจตก)
-- ข้อทดสอบ: supabase/tests/audit_log_append_only.sql · tests/tools/audit-cleanup.test.mjs

-- ═══ 1. แถวทดสอบ — ชุดเดียวที่ลบได้ด้วยสวิตช์ 'test' ═══════════════════════════════════════════════════════════════
--   บัญชีชั่วคราวของ prod-live: อีเมล live-*@example.test · ชื่อแสดง 'บัญชีทดสอบชั่วคราว' (tests/prod-live/run.mjs ตั้งให้ live-*)
--   ข้อมูลทดสอบ: ผู้ทำ/เป้าหมาย/การกระทำขึ้นต้นด้วย ZZT (สาขา ZZT · ZZTEST-…) — ข้อมูลจริงไม่มีทางขึ้นต้นแบบนี้ (check-test-leftovers)
--     การกระทำ ZZTEST… = แถวทดสอบที่ต้องหน้าตาเหมือนกิจกรรมจริงบนจอ (ข้อทดสอบแดชบอร์ด) — แดชบอร์ดไม่กรองจากการกระทำ
create or replace function public._audit_is_test_row(p_user text, p_target text, p_action text) returns boolean
  language sql immutable set search_path to 'public' as $$
  select coalesce(p_user, '') like 'live-%@example.test'
      or coalesce(p_user, '') = 'บัญชีทดสอบชั่วคราว'
      or coalesce(p_user, '') like 'ZZT%'
      or coalesce(p_target, '') like 'ZZT%'
      or coalesce(p_action, '') like 'ZZTEST%' $$;
revoke all on function public._audit_is_test_row(text, text, text) from public, anon, authenticated, service_role;

-- ═══ 2. ตัวดักที่ตาราง ═══════════════════════════════════════════════════════════════════════════════════════════
-- security definer: ตัวดักต้องเรียก _audit_is_test_row ได้ไม่ว่าใครเป็นคนลบ (กติกานั้นปิดสิทธิ์จากทุกบัญชี) · ข้อความ "ปิดแล้ว" ต้องถึงทุกบทบาท
create or replace function public.audit_log_guard() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
declare ทาง text := coalesce(current_setting('pms.audit_delete', true), '');
begin
  if tg_op = 'DELETE' then
    if ทาง = 'retention' and old.at < now() - interval '2 years' then return old; end if;
    if ทาง = 'test' and _audit_is_test_row(old."user", old.target, old.action) then return old; end if;
  end if;
  raise exception 'audit_append_only: ปิดแล้ว — บันทึกการใช้งานแก้หรือลบไม่ได้ทุกบทบาท (รวมผู้ดูแลสูงสุด) · ลบได้ 2 ทาง: ลบอัตโนมัติเกิน 2 ปี · สคริปต์ล้างข้อมูลทดสอบ (แถว ZZT/live-*)'
    using errcode = '42501';
end $$;
revoke all on function public.audit_log_guard() from public, anon, authenticated, service_role;

drop trigger if exists audit_log_guard_row on public.audit_log;
create trigger audit_log_guard_row before update or delete on public.audit_log
  for each row execute function public.audit_log_guard();
drop trigger if exists audit_log_guard_truncate on public.audit_log;
create trigger audit_log_guard_truncate before truncate on public.audit_log
  for each statement execute function public.audit_log_guard();

-- ═══ 3. งานลบอัตโนมัติเกิน 2 ปี (ใบ 0062) — เปิดสวิตช์ 'retention' ในคำสั่งเดียวกัน ═════════════════════════════════
do $$
begin
  perform cron.schedule(
    'audit-log-retention',
    '0 3 * * *',                                                  -- ทุกวัน 03:00 (เหมือนเดิม)
    $q$ select set_config('pms.audit_delete', 'retention', true); delete from public.audit_log where at < now() - interval '2 years' $q$
  );
exception when others then
  raise notice 'ข้าม audit-log retention: pg_cron ยังไม่พร้อม (%) — เปิด pg_cron แล้วรันใบนี้ใหม่', sqlerrm;
end $$;

-- ═══ 4. ทางลบของสคริปต์ล้างข้อมูลทดสอบที่ใช้กุญแจฝั่งเซิร์ฟเวอร์ (supabase-js ตั้งสวิตช์เองไม่ได้) ═════════════════════
--   ลบได้เฉพาะแถวทดสอบ — ตัวดักตรวจทีละแถวอีกชั้น · คืนจำนวนที่ลบ · เรียกได้เฉพาะ service_role
create or replace function public.audit_test_cleanup(p_ids bigint[] default null, p_action_like text default null, p_target_like text default null)
  returns integer language plpgsql security definer set search_path to 'public' as $$
declare n integer;
begin
  if p_ids is null and p_action_like is null and p_target_like is null then
    raise exception 'audit_test_cleanup: ต้องระบุเงื่อนไขอย่างน้อยหนึ่งอย่าง (ห้ามลบทั้งตาราง)';
  end if;
  perform set_config('pms.audit_delete', 'test', true);
  delete from audit_log
   where (p_ids is null or id = any(p_ids))
     and (p_action_like is null or action like p_action_like)
     and (p_target_like is null or target like p_target_like);
  get diagnostics n = row_count;
  perform set_config('pms.audit_delete', '', true);
  return n;
end $$;
revoke all on function public.audit_test_cleanup(bigint[], text, text) from public, anon, authenticated, service_role;
grant execute on function public.audit_test_cleanup(bigint[], text, text) to service_role;
