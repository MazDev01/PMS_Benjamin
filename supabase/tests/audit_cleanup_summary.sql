-- ── ใบ 0245: ลบแถวทดสอบในบันทึกการใช้งาน = ฐานเขียนบันทึกสรุป 1 แถว · ต้องมีชื่อชุดสำรอง · ชุดล้างลบบันทึกสรุปไม่ได้ (บอสสั่ง 26 ต.ค. 69)
-- รัน: docker exec -i <คอนเทนเนอร์ฐานทดสอบ> psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/audit_cleanup_summary.sql
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
create function flowtest.as_role(p_role text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', p_role, 'user_role', 'SUPER_ADMIN', 'dealer_code', '')::text, true);
  perform set_config('role', p_role, true);
end $$;
create function flowtest.as_root() returns void language plpgsql as $$
begin perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '', true); end $$;
grant usage on schema flowtest to authenticated, service_role;
grant execute on all functions in schema flowtest to authenticated, service_role;

do $$
declare
  ทดสอบ bigint[]; จริง bigint; สรุป record; n int; ก่อน int;
  วัน1 timestamptz := timestamptz '2026-10-15 09:05:00+07';
  วัน2 timestamptz := timestamptz '2026-10-20 18:30:00+07';
begin
  insert into audit_log ("user", role, action, target, at) values ('ผู้ดูแลระบบสำนักงานใหญ่', 'SUPER_ADMIN', 'แก้ไขดีลเลอร์', 'RYG · ร้านจริง', now()) returning id into จริง;
  with เพิ่ม as (insert into audit_log ("user", role, action, target, at) values
      ('live-hq-1@example.test', 'SUPER_ADMIN', 'แก้ไขดีลเลอร์', 'ZZT · x', วัน1),
      ('บัญชีทดสอบชั่วคราว', 'SUPER_ADMIN', 'เข้าสู่ระบบ', 'Benjamin HQ', วัน2),
      ('ผู้ดูแลระบบสำนักงานใหญ่', 'SUPER_ADMIN', 'ส่งคำขอใบเสนอราคา', 'ZZT · RQ-1', วัน1 + interval '1 day') returning id)
  select array_agg(id) into ทดสอบ from เพิ่ม;

  -- ═══ ② ไม่ระบุชื่อชุดสำรอง = ทั้งคำสั่งลบถูกปฏิเสธ แถวไม่หาย ═══
  perform set_config('pms.audit_delete', 'test', true);
  perform set_config('pms.audit_backup', '', true);
  perform flowtest.must_fail(format('delete from audit_log where id = any(%L::bigint[])', ทดสอบ), 'ชื่อชุดสำรอง', 'ลบแถวทดสอบโดยไม่ระบุชื่อชุดสำรอง → ถูกปฏิเสธ');
  perform set_config('pms.audit_backup', '__ชุดสำรองก่อนลบ__', true);
  perform flowtest.must_fail(format('delete from audit_log where id = any(%L::bigint[])', ทดสอบ), 'ชื่อชุดสำรอง', 'ชื่อชุดสำรองยังเป็นค่าตัวอย่าง (ลืมแทน) → ถูกปฏิเสธ');
  perform flowtest.ok((select count(*) from audit_log where id = any(ทดสอบ)) = 3, 'ถูกปฏิเสธแล้วแถวทดสอบยังอยู่ครบ (ไม่ลบครึ่ง ๆ)');

  -- ═══ ① ลบด้วยชุดล้าง = บันทึกสรุป 1 แถว: ผู้ทำ · จำนวน · ช่วงวันที่ (พ.ศ.) · ชื่อชุดสำรอง ═══
  select count(*) into ก่อน from audit_log where "user" = 'ชุดล้างข้อมูลทดสอบ';
  perform set_config('pms.audit_backup', '2026-10-26-ก่อนลบบันทึกการใช้งานทดสอบ', true);
  delete from audit_log where id = any(ทดสอบ);
  get diagnostics n = row_count;
  perform flowtest.ok(n = 3, 'ลบแถวทดสอบได้ 3 แถว');
  perform flowtest.ok((select count(*) from audit_log where "user" = 'ชุดล้างข้อมูลทดสอบ') = ก่อน + 1, 'ฐานเขียนบันทึกสรุป 1 แถวต่อการลบ 1 ครั้ง');
  select * into สรุป from audit_log where "user" = 'ชุดล้างข้อมูลทดสอบ' order by id desc limit 1;
  perform flowtest.ok(สรุป.action = 'ลบแถวทดสอบในบันทึกการใช้งาน' and สรุป.role = 'ระบบ', 'บันทึกสรุป: ผู้ทำ = ชุดล้างข้อมูลทดสอบ · การกระทำชัด');
  perform flowtest.ok(สรุป.target like '3 แถว · %', 'บันทึกสรุป: จำนวนแถวที่ลบ (3)');
  perform flowtest.ok(สรุป.target like '%ช่วงวันที่ 15/10/2569 09:05 ถึง 20/10/2569 18:30%', format('บันทึกสรุป: ช่วงวันที่ของแถวที่ลบ (ปี พ.ศ. · เวลาไทย) — ได้: %s', สรุป.target));
  perform flowtest.ok(สรุป.target like '%ชุดสำรองก่อนลบ: 2026-10-26-ก่อนลบบันทึกการใช้งานทดสอบ', 'บันทึกสรุป: ชื่อชุดสำรองก่อนลบ');

  -- ═══ ③ บันทึกสรุปห้ามลบด้วยชุดล้าง (ไม่ใช่แถวทดสอบ) ═══
  perform flowtest.must_fail(format('delete from audit_log where id = %s', สรุป.id), 'ปิดแล้ว', 'ชุดล้าง (สวิตช์ test) ลบบันทึกสรุปไม่ได้');
  perform set_config('pms.audit_delete', '', true);
  perform set_config('pms.audit_backup', '', true);
  perform flowtest.as_role('service_role');
  perform flowtest.must_fail(format('select audit_test_cleanup(array[%s]::bigint[], null, null, %L)', สรุป.id, 'ชุดใดก็ได้'), 'ปิดแล้ว', 'คำสั่งล้างของสคริปต์ (audit_test_cleanup) ลบบันทึกสรุปไม่ได้');
  perform flowtest.must_fail(format('select audit_test_cleanup(null, %L, null, %L)', 'ลบแถวทดสอบ%', 'ชุดใดก็ได้'), 'ปิดแล้ว', 'คำสั่งล้างเลือกด้วยชื่อการกระทำของบันทึกสรุป → ถูกปฏิเสธ');
  perform flowtest.as_root();
  perform flowtest.ok(exists (select 1 from audit_log where id = สรุป.id), 'บันทึกสรุปยังอยู่');

  -- ═══ ④ audit_test_cleanup: ต้องมีชื่อชุดสำรอง · ลบแล้วเขียนบันทึกสรุป ═══
  insert into audit_log ("user", role, action, target) values ('live-x@example.test', 'SUPER_ADMIN', 'ทดสอบ', 'ZZT · ล้างสรุป');
  perform flowtest.as_role('service_role');
  perform flowtest.must_fail('select audit_test_cleanup(null, null, ''ZZT · ล้างสรุป'')', 'ชื่อชุดสำรอง', 'คำสั่งล้างไม่ส่งชื่อชุดสำรอง → ถูกปฏิเสธ');
  perform flowtest.ok(audit_test_cleanup(null, null, 'ZZT · ล้างสรุป', 'ฐานทดสอบ (audit_cleanup_summary)') = 1, 'คำสั่งล้างส่งชื่อชุดสำรอง → ลบได้');
  perform flowtest.as_root();
  perform flowtest.ok((select target from audit_log where "user" = 'ชุดล้างข้อมูลทดสอบ' order by id desc limit 1) like '1 แถว · %ชุดสำรองก่อนลบ: ฐานทดสอบ (audit_cleanup_summary)', 'คำสั่งล้างก็เขียนบันทึกสรุป (1 แถว · ชื่อชุดสำรอง)');

  -- ═══ ลบไม่ถูกแถวไหนเลย = ไม่เขียนบันทึกสรุป · ลบอัตโนมัติเกิน 2 ปีไม่เขียน ═══
  select count(*) into ก่อน from audit_log where "user" = 'ชุดล้างข้อมูลทดสอบ';
  perform set_config('pms.audit_delete', 'test', true);
  perform set_config('pms.audit_backup', 'ชุดใดก็ได้', true);
  delete from audit_log where target = 'ไม่มีแถวนี้';
  perform set_config('pms.audit_delete', 'retention', true);
  insert into audit_log ("user", role, action, target, at) values ('ผู้ดูแลระบบสำนักงานใหญ่', 'SUPER_ADMIN', 'แก้ไขดีลเลอร์', 'RYG · เก่ามาก', now() - interval '2 years 1 day');
  delete from audit_log where target = 'RYG · เก่ามาก';
  perform set_config('pms.audit_delete', '', true);
  perform flowtest.ok((select count(*) from audit_log where "user" = 'ชุดล้างข้อมูลทดสอบ') = ก่อน, 'ลบไม่ถูกแถวไหน / ลบอัตโนมัติเกิน 2 ปี → ไม่เขียนบันทึกสรุป');
  perform flowtest.ok(exists (select 1 from audit_log where id = จริง), 'แถวจริงไม่ถูกแตะ');
end $$;

select 'ALL PASS' as result;
rollback;
