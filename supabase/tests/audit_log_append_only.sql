-- ── ใบ 0241: บันทึกการใช้งานแก้/ลบไม่ได้ทุกบทบาท · ลบได้ 2 ทาง (บอสสั่ง 26 ต.ค. 69) ──────────────────────────────────────
--   ทุกบทบาท (ดีลเลอร์ · HQ · ผู้ดูแลสูงสุด · service_role · คำสั่งฐานตรง) แก้/ลบ/ล้างไม่ได้
--   ทาง 1 'retention': ลบได้เฉพาะแถวเก่ากว่า 2 ปี · ทาง 2 'test': ลบได้เฉพาะแถวทดสอบ — ปนแถวจริงแม้แถวเดียว = ทั้งคำสั่งถูกปฏิเสธ
--   audit_test_cleanup: เรียกได้เฉพาะ service_role · ห้ามลบทั้งตาราง · ลบได้แค่แถวทดสอบ
-- รัน: docker exec -i <คอนเทนเนอร์ฐานทดสอบ> psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/audit_log_append_only.sql
begin;
create schema flowtest;
create function flowtest.ok(p_cond boolean, p_what text) returns void language plpgsql as $$
begin if p_cond is not true then raise exception 'FAIL: %', p_what; end if; raise notice 'ok  %', p_what; end $$;
create function flowtest.must_fail(p_sql text, p_like text, p_what text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if sqlerrm ilike '%' || p_like || '%' then raise notice 'ok  % (ถูกปฏิเสธ)', p_what; return; end if;
    raise exception 'FAIL: % — ถูกปฏิเสธแต่ข้อความไม่ตรง: %', p_what, sqlerrm;
  end;
  raise exception 'FAIL: % — ควรถูกปฏิเสธแต่ผ่าน', p_what;
end $$;
create function flowtest.as_role(p_role text, p_user_role text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', p_role,
    'user_role', p_user_role, 'dealer_code', case when p_user_role like 'DEALER%' then 'CNX' else '' end)::text, true);
  perform set_config('role', p_role, true);
end $$;
create function flowtest.as_root() returns void language plpgsql as $$
begin perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '', true); end $$;
grant usage on schema flowtest to authenticated, service_role;
grant execute on all functions in schema flowtest to authenticated, service_role;

-- แถวจริง 3 แบบ (ต้องไม่หายทุกกรณี) + แถวทดสอบ 4 แบบ + แถวเก่ากว่า 2 ปี
create temp table ชุด (ป้าย text primary key, id bigint);
grant all on ชุด to authenticated, service_role;
with เพิ่ม as (
  insert into audit_log ("user", role, action, target, at) values
    ('ผู้ดูแลระบบสำนักงานใหญ่', 'SUPER_ADMIN', 'แก้ไขดีลเลอร์', 'RYG · ร้านจริง', now()),
    ('สมหญิง ขายดี', 'DEALER_ADMIN', 'สร้างใบเสนอราคา', 'CNX · Q-CNX-1', now()),
    ('ผู้ดูแลระบบสำนักงานใหญ่', 'SUPER_ADMIN', 'เข้าสู่ระบบ', 'Benjamin HQ', now()),
    ('live-hq-1@example.test', 'SUPER_ADMIN', 'แก้ไขดีลเลอร์', 'RYG · x', now()),
    ('บัญชีทดสอบชั่วคราว', 'SUPER_ADMIN', 'เข้าสู่ระบบ', 'Benjamin HQ', now()),
    ('ผู้ดูแลระบบสำนักงานใหญ่', 'SUPER_ADMIN', 'ส่งคำขอใบเสนอราคา', 'ZZT · RQ-1', now()),
    ('ผู้ดูแลระบบสำนักงานใหญ่', 'SUPER_ADMIN', 'ZZTEST แก้ไขดีลเลอร์', 'RYG · กิจกรรมแดชบอร์ด', now()),
    ('ผู้ดูแลระบบสำนักงานใหญ่', 'SUPER_ADMIN', 'แก้ไขดีลเลอร์', 'RYG · เก่ามาก', now() - interval '2 years 1 day')
  returning id, target, "user", action)
insert into ชุด select case
    when target = 'RYG · ร้านจริง' then 'จริง1' when target = 'CNX · Q-CNX-1' then 'จริง2'
    when target = 'Benjamin HQ' and "user" <> 'บัญชีทดสอบชั่วคราว' then 'จริง3'
    when "user" like 'live-%' then 'ทดสอบlive' when "user" = 'บัญชีทดสอบชั่วคราว' then 'ทดสอบชื่อชั่วคราว'
    when target like 'ZZT · %' then 'ทดสอบZZT' when action like 'ZZTEST%' then 'ทดสอบZZTEST' else 'เก่า' end, id from เพิ่ม;

do $$
declare
  จริง bigint[] := (select array_agg(id) from ชุด where ป้าย like 'จริง%');
  ทดสอบ bigint[] := (select array_agg(id) from ชุด where ป้าย like 'ทดสอบ%');
  เก่า bigint := (select id from ชุด where ป้าย = 'เก่า');
  n int;
begin
  -- ═══ 1. ทุกบทบาทแก้/ลบ/ล้างไม่ได้ ═══
  perform flowtest.as_role('authenticated', 'SUPER_ADMIN');
  perform flowtest.must_fail(format('delete from audit_log where id = %s', จริง[1]), 'permission denied', 'ผู้ดูแลสูงสุด (หน้าเว็บ) ลบบันทึกไม่ได้');
  perform flowtest.must_fail(format('update audit_log set action = %L where id = %s', 'แก้', จริง[1]), 'permission denied', 'ผู้ดูแลสูงสุด (หน้าเว็บ) แก้บันทึกไม่ได้');
  perform flowtest.as_role('authenticated', 'DEALER_ADMIN');
  perform flowtest.must_fail(format('delete from audit_log where id = %s', จริง[2]), 'permission denied', 'ดีลเลอร์ลบบันทึกไม่ได้');
  perform flowtest.as_role('service_role', 'SUPER_ADMIN');   -- เส้นทางผู้ดูแลของเซิร์ฟเวอร์ (ปุ่มล้างบันทึกเดิม)
  perform flowtest.must_fail(format('delete from audit_log where id = %s', จริง[1]), 'ปิดแล้ว', 'service_role (เส้นทางผู้ดูแล) ลบบันทึกไม่ได้ — ฐานตอบ "ปิดแล้ว"');
  perform flowtest.must_fail('delete from audit_log where at >= ''1970-01-01''', 'ปิดแล้ว', 'ล้างบันทึกทั้งหมดแบบปุ่มเดิม → ฐานตอบ "ปิดแล้ว"');
  perform flowtest.must_fail(format('update audit_log set action = %L where id = %s', 'แก้', จริง[1]), 'ปิดแล้ว', 'service_role แก้บันทึกไม่ได้');
  perform flowtest.must_fail('truncate audit_log', 'ปิดแล้ว', 'service_role ล้างทั้งตารางไม่ได้');
  perform flowtest.as_root();
  perform flowtest.must_fail(format('delete from audit_log where id = %s', ทดสอบ[1]), 'ปิดแล้ว', 'คำสั่งฐานตรง ไม่เปิดสวิตช์ → ลบแม้แถวทดสอบก็ไม่ได้');
  perform flowtest.must_fail(format('update audit_log set action = %L where id = %s', 'แก้', ทดสอบ[1]), 'ปิดแล้ว', 'แก้แถวทดสอบก็ไม่ได้ (แก้ไม่ได้ทุกกรณี)');

  -- ═══ 2. ทาง 2 สวิตช์ 'test': ลบได้เฉพาะแถวทดสอบ · ปนแถวจริง = ทั้งคำสั่งถูกปฏิเสธ ═══
  perform set_config('pms.audit_delete', 'test', true);
  perform set_config('pms.audit_backup', 'ฐานทดสอบ (audit_log_append_only)', true);   -- ใบ 0245
  perform flowtest.must_fail(format('delete from audit_log where id = any(%L::bigint[])', ทดสอบ || จริง[3]), 'ปิดแล้ว', 'สวิตช์ test: เงื่อนไขกว้างจนปนแถวจริง 1 แถว → ทั้งคำสั่งถูกปฏิเสธ');
  perform flowtest.ok((select count(*) from audit_log where id = any(ทดสอบ)) = 4, 'ปนแถวจริงแล้วถูกปฏิเสธ → แถวทดสอบก็ไม่ถูกลบ (ทั้งคำสั่งย้อนกลับ)');
  perform flowtest.must_fail(format('update audit_log set action = %L where id = %s', 'แก้', ทดสอบ[1]), 'ปิดแล้ว', 'สวิตช์ test ก็แก้บันทึกไม่ได้');
  delete from audit_log where id = any(ทดสอบ);
  get diagnostics n = row_count;
  perform flowtest.ok(n = 4, 'สวิตช์ test: ลบแถวทดสอบได้ครบ 4 แบบ (live- · ชื่อบัญชีชั่วคราว · ZZT · การกระทำ ZZTEST)');
  perform flowtest.must_fail(format('delete from audit_log where id = %s', เก่า), 'ปิดแล้ว', 'สวิตช์ test ลบแถวเก่า (ไม่ใช่แถวทดสอบ) ไม่ได้');
  perform set_config('pms.audit_delete', '', true);

  -- ═══ 3. ทาง 1 สวิตช์ 'retention': เฉพาะแถวเก่ากว่า 2 ปี ═══
  perform set_config('pms.audit_delete', 'retention', true);
  perform flowtest.must_fail(format('delete from audit_log where id = %s', จริง[1]), 'ปิดแล้ว', 'สวิตช์ retention ลบแถวที่ยังไม่ถึง 2 ปีไม่ได้');
  delete from audit_log where id = เก่า;
  get diagnostics n = row_count;
  perform flowtest.ok(n = 1, 'สวิตช์ retention: ลบแถวเก่ากว่า 2 ปีได้');
  perform set_config('pms.audit_delete', '', true);

  -- ═══ 4. audit_test_cleanup (ทางของสคริปต์ที่ใช้กุญแจฝั่งเซิร์ฟเวอร์) ═══
  insert into audit_log ("user", role, action, target) values ('live-x@example.test', 'SUPER_ADMIN', 'ทดสอบ', 'ZZT · ล้าง');
  perform flowtest.as_role('authenticated', 'SUPER_ADMIN');
  perform flowtest.must_fail('select audit_test_cleanup(null, null, ''ZZT%'')', 'permission denied', 'ผู้ใช้หน้าเว็บ (แม้ผู้ดูแลสูงสุด) เรียกคำสั่งล้างไม่ได้');
  perform flowtest.as_role('service_role', 'SUPER_ADMIN');
  perform flowtest.must_fail('select audit_test_cleanup()', 'ต้องระบุเงื่อนไข', 'คำสั่งล้างไม่มีเงื่อนไข (ลบทั้งตาราง) → ถูกปฏิเสธ');
  perform flowtest.must_fail('select audit_test_cleanup(null, null, ''%'')', 'ปิดแล้ว', 'คำสั่งล้างเงื่อนไขกว้าง (ปนแถวจริง) → ถูกปฏิเสธทั้งคำสั่ง');
  perform flowtest.ok(audit_test_cleanup(null, null, 'ZZT · ล้าง', 'ฐานทดสอบ (audit_log_append_only)') = 1, 'คำสั่งล้าง: ลบแถวทดสอบได้ (คืนจำนวนที่ลบ)');
  perform flowtest.must_fail(format('delete from audit_log where id = %s', จริง[1]), 'ปิดแล้ว', 'หลังเรียกคำสั่งล้าง สวิตช์ไม่ค้าง — ลบตรงยังไม่ได้');
  perform flowtest.as_root();

  -- ═══ 5. แถวจริงอยู่ครบหลังทุกข้อ ═══
  perform flowtest.ok((select count(*) from audit_log where id = any(จริง)) = 3, 'แถวจริงทั้ง 3 แบบยังอยู่ครบ');
end $$;
\echo 'audit_log_append_only: ALL PASS'
rollback;
