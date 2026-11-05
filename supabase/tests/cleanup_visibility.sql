-- ── ข้อทดสอบ: ขั้นล้างข้อมูลทดสอบเว็บจริงต้องรู้ตัวเมื่อบัญชีที่รันมองไม่เห็นทุกแถว (5 พ.ย. 69) ─────────────────────────────────
--   เหตุ: บอสรัน tests/prod-live/run.mjs cleanup จากหน้าจอคน ขึ้น "บันทึกการใช้งานทดสอบลบ 0" ทั้งที่มีแถวทดสอบ (ภายหลังลบจริง 54 แถว)
--   สมมติฐานต้นเหตุ: บัญชีที่ CLI ใช้ข้ามกฎสิทธิ์รายแถวไม่ได้ (ไม่ใช่ superuser · ไม่มี BYPASSRLS — สิทธิ์นี้ไม่สืบทอดผ่านการเป็นสมาชิกบทบาท)
--     → ตารางที่มีกฎสิทธิ์รายแถว (audit_log · dealers …) นับได้ 0 · ด่าน "ปนแถวจริง" = 0 · ด่านกันพลาดใน cleanup.sql หาแถวผิดไม่เจอ · "เหลือ 0" ผ่านเท็จ
--   จำลองด้วยบทบาทชั่วคราวที่ไม่มี BYPASSRLS (ทรานแซกชันเดียวแล้ว rollback · ไม่แตะฐานจริง):
--   1) บทบาทนั้นนับแถวทดสอบได้ 0 ทั้งที่มีแถว (กลไกที่ทำให้ "ลบ 0") · ตัวชี้ เห็นทุกแถว = false
--   2) บัญชีผู้ดูแลฐาน (ข้ามกฎได้) นับได้จริง · เห็นทุกแถว = true
--   3) ด่านแรกของ cleanup.sql ปฏิเสธบทบาทที่มองไม่เห็นทุกแถว (role_no_bypassrls) ก่อนแตะอะไร
--   ตัวชี้/ด่าน ต้องตรงกับไฟล์จริง: tests/tools/supabase-cli-rows.test.mjs ตรวจว่า cleanup-audit-count.sql · run.mjs · cleanup.sql ใช้นิพจน์นี้
-- รัน: docker exec -i <คอนเทนเนอร์ฐานทดสอบ> psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 < supabase/tests/cleanup_visibility.sql
begin;
create schema cvtest;
create function cvtest.ok(p_cond boolean, p_what text) returns void language plpgsql as $$
begin if p_cond is not true then raise exception 'FAIL: %', p_what; end if; raise notice 'ok  %', p_what; end $$;
create role zzt_cli_norls nologin;   -- แบบบัญชีล็อกอินของ CLI ที่ไม่มี BYPASSRLS
grant usage on schema public, cvtest to zzt_cli_norls;
grant select on public.audit_log, pg_catalog.pg_roles to zzt_cli_norls;
grant execute on function cvtest.ok(boolean, text) to zzt_cli_norls;

set local session_replication_role = replica;
insert into public.audit_log ("user", role, action, target) values ('live-cv@example.test', 'SUPER_ADMIN', 'ทดสอบ', 'ZZT · มองเห็น');
set local session_replication_role = origin;

create temp table cv_ผล (ใคร text, เห็นทุกแถว boolean, จะลบ bigint) on commit drop;
grant insert, select on cv_ผล to zzt_cli_norls;
-- นิพจน์เดียวกับ cleanup-audit-count.sql (เห็นทุกแถว + เงื่อนไขแถวทดสอบ ส่วนที่จับแถวข้างบน)
create function cvtest.นับ(p_ใคร text) returns void language sql as $$
  insert into cv_ผล select p_ใคร, (select rolsuper or rolbypassrls from pg_roles where rolname = current_user),
    count(*) filter (where "user" like 'live-%@example.test' or target like 'ZZT · %') from public.audit_log;
$$;
grant execute on function cvtest.นับ(text) to zzt_cli_norls;

set local role zzt_cli_norls;
select cvtest.นับ('ไม่มี BYPASSRLS');
reset role;
select cvtest.นับ('ผู้ดูแลฐาน');

do $$ begin
  perform cvtest.ok((select เห็นทุกแถว = false and จะลบ = 0 from cv_ผล where ใคร = 'ไม่มี BYPASSRLS'),
    '1) บทบาทไม่มี BYPASSRLS นับแถวทดสอบได้ 0 ทั้งที่มีแถว (กลไก "ลบ 0") · เห็นทุกแถว = false');
  perform cvtest.ok((select เห็นทุกแถว = true and จะลบ >= 1 from cv_ผล where ใคร = 'ผู้ดูแลฐาน'),
    '2) ผู้ดูแลฐานนับได้จริง · เห็นทุกแถว = true');
end $$;

-- 3) ด่านแรกของ cleanup.sql (ข้อความเดียวกับไฟล์จริง) ปฏิเสธบทบาทที่มองไม่เห็นทุกแถว
create function cvtest.ด่านแรก() returns text language plpgsql as $$
begin
  if not coalesce((select rolsuper or rolbypassrls from pg_roles where rolname = current_user), false) then
    raise exception 'role_no_bypassrls: บัญชีที่รัน (%) ข้ามกฎสิทธิ์รายแถวไม่ได้ — มองไม่เห็นทุกแถว ผลนับ/ลบเชื่อไม่ได้ ยกเลิกทั้งชุด', current_user;
  end if;
  return 'ผ่าน';
exception when others then return sqlerrm;
end $$;
grant execute on function cvtest.ด่านแรก() to zzt_cli_norls;
set local role zzt_cli_norls;
insert into cv_ผล select 'ด่าน:' || cvtest.ด่านแรก(), null, null;
reset role;
do $$ begin
  perform cvtest.ok(exists (select 1 from cv_ผล where ใคร like 'ด่าน:role_no_bypassrls:%'), '3) ด่านแรกของ cleanup.sql ปฏิเสธบทบาทที่มองไม่เห็นทุกแถว');
  perform cvtest.ok(cvtest.ด่านแรก() = 'ผ่าน', '3) ผู้ดูแลฐานผ่านด่านแรก');
end $$;

select 'ALL PASS' as result;
rollback;
