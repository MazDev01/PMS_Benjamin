-- ── ข้อทดสอบ: ทรานแซกชันล้างบันทึกการใช้งาน นับ = ลบ เมื่อล็อกตารางก่อน (ฝั่งล้างของ prod-live-cleanup-race · 5 พ.ย. 69 งาน "ลบ 0") ──
--   ทั้งไฟล์อยู่ในทรานแซกชันเดียวแล้ว rollback (ไม่มีอะไรถูกลบจริง)
--   คำสั่งล็อกบรรทัดล่าง ต้องตรงกับ tests/prod-live/cleanup.sql ทุกตัวอักษร — tests/tools/prod-live-cleanup-race.test.mjs ตรวจ
--     และตอนรันจำลองแข่ง ตัวทดสอบแทนบรรทัดนี้ด้วยบรรทัดจาก cleanup.sql จริง แล้วรันอีกการเชื่อมต่อแทรกแถวระหว่างหน่วง
--   รันเดี่ยว (db-rule-tests): ไม่มีใครแทรก → นับ 3 ลบ 3
begin;
create schema crtest;
create function crtest.ok(p_cond boolean, p_what text) returns void language plpgsql as $$
begin if p_cond is not true then raise exception 'FAIL: %', p_what; end if; raise notice 'ok  %', p_what; end $$;

set local session_replication_role = replica;
insert into public.audit_log ("user", role, action, target)
  select 'live-race@example.test', 'SUPER_ADMIN', 'จำลองแข่ง', 'ZZT · จำลองแข่ง' from generate_series(1, 3);
set local session_replication_role = origin;
select 'วางแถวแล้ว';

lock table public.audit_log in share row exclusive mode;
create temp table cr_ผล (ขั้น text, จำนวน bigint) on commit drop;
insert into cr_ผล select 'นับ', count(*) from public.audit_log where target = 'ZZT · จำลองแข่ง';
select pg_sleep(2.5);
set local pms.audit_delete = 'test'; set local pms.audit_backup = 'ข้อทดสอบจำลองแข่ง';
with ลบ as (delete from public.audit_log where target = 'ZZT · จำลองแข่ง' returning 1)
  insert into cr_ผล select 'ลบ', count(*) from ลบ;
select ขั้น || '=' || จำนวน from cr_ผล order by ขั้น;

do $$ begin
  perform crtest.ok((select จำนวน from cr_ผล where ขั้น = 'นับ') = 3 and (select จำนวน from cr_ผล where ขั้น = 'ลบ') = 3,
    'จำนวนที่นับหลังล็อกตาราง = จำนวนที่ลบ (3 = 3)');
end $$;

select 'ALL PASS' as result;
rollback;
