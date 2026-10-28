-- ── ใบ 0256: ลีดใหม่อยู่ขั้น "ข้อมูลลูกค้า" เสมอ · leads_page p_stage = 0 = กำลังดำเนินการ (บอสสั่ง 28 ต.ค. 69) ─────────────
-- รัน: docker exec -i <คอนเทนเนอร์ฐานทดสอบ> psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/lead_new_step1_open_filter.sql
-- ลีดทดสอบ ZZNS · ย้อนทั้งหมดตอนจบ (rollback)
-- ข้อที่ต้องตกบนโค้ดก่อนใบ 0256: ดีลเลอร์สร้างลีดเป็น "รวบรวมความต้องการ" ได้ · HQ สร้างลีดขั้นอื่นได้ · p_stage = 0 ไม่กรองอะไร (ไม่มีขั้น 0)
begin;
create schema nstest;
create function nstest.ok(p_cond boolean, p_what text) returns void language plpgsql as $$
begin if p_cond is not true then raise exception 'FAIL: %', p_what; end if; raise notice 'ok  %', p_what; end $$;
create function nstest.must_fail(p_sql text, p_like text, p_what text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if sqlerrm ilike '%' || p_like || '%' then raise notice 'ok  % (ถูกปฏิเสธ)', p_what; return; end if;
    raise exception 'FAIL: % — ถูกปฏิเสธแต่ข้อความไม่ตรง: %', p_what, sqlerrm;
  end;
  raise exception 'FAIL: % — ควรถูกปฏิเสธแต่ผ่าน', p_what;
end $$;
create function nstest.ผู้ใช้(p_role text, p_dealer text) returns uuid language sql stable as $$
  select id from profiles where role::text = p_role and coalesce(dealer_code, '') = p_dealer and status::text = 'active' order by id limit 1 $$;
create function nstest.as_user(p_role text, p_dealer text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', nstest.ผู้ใช้(p_role, p_dealer), 'role', 'authenticated',
    'user_role', p_role, 'dealer_code', p_dealer, 'email', 'zzns@example.test')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function nstest.as_root() returns void language plpgsql as $$
begin perform set_config('role', 'none', true); perform set_config('request.jwt.claims', '', true); end $$;
grant usage on schema nstest to authenticated;
grant execute on all functions in schema nstest to authenticated;

do $$
declare r jsonb;
begin
  -- ดีลเลอร์: สร้างลีดใหม่ได้เฉพาะสถานะตั้งต้น (ขั้นข้อมูลลูกค้า)
  perform nstest.as_user('DEALER_ADMIN', 'RYG');
  insert into leads (id, num_id, dealer_code, company, name, phone, province, status, assigned)
    values ('#L-ZZNS1', 990951, 'RYG', 'ZZNS ลีด 1', 'ZZNS ลีด 1', '000-000-0951', 'ระยอง', 'WAITING', 'ทดสอบระบบ');
  perform nstest.ok((select status::text from leads where dealer_code = 'RYG' and num_id = 990951) = 'WAITING', 'ลีดใหม่ = ขั้นข้อมูลลูกค้า');
  -- ส่ง "รวบรวมความต้องการ" มา (ไคลเอนต์รุ่นเก่า) = ฐานตั้งเป็นสถานะตั้งต้นเอง
  insert into leads (id, num_id, dealer_code, company, name, phone, province, status, assigned)
    values ('#L-ZZNS2', 990952, 'RYG', 'ZZNS ลีด 2', 'ZZNS ลีด 2', '000-000-0952', 'ระยอง', 'BULLET', 'ทดสอบระบบ');
  perform nstest.ok((select status::text from leads where dealer_code = 'RYG' and num_id = 990952) = 'WAITING',
    'ดีลเลอร์ส่ง "รวบรวมความต้องการ" ตอนสร้าง → ฐานตั้งเป็นขั้นข้อมูลลูกค้าตั้งต้นเอง (หน้าเว็บตั้งสถานะเองไม่ได้)');
  perform nstest.must_fail($q$insert into leads (id, num_id, dealer_code, company, name, phone, province, status, assigned)
      values ('#L-ZZNS3', 990953, 'RYG', 'ZZNS ลีด 3', 'ZZNS ลีด 3', '000-000-0953', 'ระยอง', 'QUOTED', 'ทดสอบระบบ')$q$,
    'lead_new_status_locked', 'ดีลเลอร์ส่ง "เสนอราคา" ตอนสร้าง = ปฏิเสธ');

  -- HQ ก็ส่งสถานะอื่นตอนสร้างไม่ได้
  perform nstest.as_user('SUPER_ADMIN', '');
  perform nstest.must_fail($q$insert into leads (id, num_id, dealer_code, company, name, phone, province, status, assigned)
      values ('#L-ZZNS4', 990954, 'RYG', 'ZZNS ลีด 4', 'ZZNS ลีด 4', '000-000-0954', 'ระยอง', 'QUOTED', 'ทดสอบระบบ')$q$,
    'lead_new_status_locked', 'HQ ส่ง "เสนอราคา" ตอนสร้าง = ปฏิเสธ');

  -- leads_page: p_stage = 0 = กำลังดำเนินการ (ขั้น 1–5) · ไม่มีลีดปิดแล้ว · null = ทั้งหมด
  perform nstest.as_user('SUPER_ADMIN', '');
  r := leads_page(1000, 0, p_stage => 0);
  perform nstest.ok(jsonb_array_length(r -> 'rows') > 0, 'กำลังดำเนินการ: มีลีด');
  perform nstest.ok(not exists (select 1 from jsonb_array_elements(r -> 'rows') x where x ->> 'status' in ('PAID', 'CANCELLED')),
    'กำลังดำเนินการ: ไม่มีลีดปิดสำเร็จ/ปิดไม่สำเร็จ');
  perform nstest.ok((r ->> 'total')::int = (select count(*) from leads where status not in ('PAID', 'CANCELLED')),
    'กำลังดำเนินการ: นับเท่าลีดที่ยังไม่ปิดทั้งเครือ');
  perform nstest.ok((leads_page(1, 0) ->> 'total')::int = (select count(*) from leads), 'ไม่ส่งขั้น = ทั้งหมด (รวมลีดปิดแล้ว)');
  perform nstest.ok((leads_page(1, 0, p_stage => 6) ->> 'total')::int = (select count(*) from leads where status = 'PAID'), 'ขั้น 6 = ปิดสำเร็จ');
  perform nstest.as_root();
end $$;

select 'ALL PASS' as result;
rollback;
