-- ── ใบ 0282: HQ บทบาทเดียว "สำนักงานใหญ่" (บอสสั่ง 5 พ.ย. 69) ──────────────────────────────────────────────────────────
-- ต้องตกบนฐานก่อนลงใบ (ตั้งบทบาท HQ_STAFF ได้ · เจ้าหน้าที่แก้ข้อมูลกลางไม่ได้ · ข้อความกันคนสุดท้ายเดิม) · ผ่านหลังลงใบ · rollback ทั้งไฟล์
--   1) ไม่มีผู้ใช้ HQ_MANAGEMENT/HQ_STAFF เหลือ · ตั้ง/แก้เป็นค่าเดิมไม่ได้ (ข้อจำกัด profiles_hq_single_role)
--   2) บัญชีสำนักงานใหญ่ทำได้ทุกอย่างของ HQ: is_hq · can_write_master · can_price_quotes · แก้บทบาท/สถานะผู้ใช้อื่น · เพิ่มผู้ใช้ (นโยบายแถว)
--      โทเคนเก่าที่ยังเป็น HQ_STAFF/HQ_MANAGEMENT = ไม่ใช่ HQ (กฎตัวเดียว · ต่ออายุโทเคนได้บทบาทใหม่จากฐาน)
--   3) ห้ามปิด/ลบ/ลดสิทธิ์บัญชีสำนักงานใหญ่คนสุดท้ายที่ใช้งาน (last_hq_account) · มีอีกคนที่ใช้งาน = ปิดได้
--   4) ชื่อบทบาทในบันทึกใหม่: ค่าเดิมทุกตัวของ HQ = "สำนักงานใหญ่" · ฝั่งดีลเลอร์ไม่เปลี่ยน
-- รัน: docker exec -i <คอนเทนเนอร์ฐานทดสอบ> psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/hq_single_role.sql
begin;
create schema hsrtest;
create function hsrtest.ok(p_cond boolean, p_what text) returns void language plpgsql as $$
begin if p_cond is not true then raise exception 'FAIL: %', p_what; end if; raise notice 'ok  %', p_what; end $$;
create function hsrtest.must_fail(p_sql text, p_like text, p_what text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if sqlerrm ilike '%' || p_like || '%' then raise notice 'ok  % (ถูกปฏิเสธ)', p_what; return; end if;
    raise exception 'FAIL: % — ถูกปฏิเสธแต่ข้อความไม่ตรง: %', p_what, sqlerrm;
  end;
  raise exception 'FAIL: % — ควรถูกปฏิเสธแต่ผ่าน', p_what;
end $$;
create function hsrtest.as_root() returns void language plpgsql as $$
begin perform set_config('role', 'none', true); perform set_config('request.jwt.claims', '', true); end $$;
create function hsrtest.as_user(p_uid uuid, p_role text) returns void language plpgsql as $$
begin
  perform hsrtest.as_root();
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'user_role', p_role, 'email', 'zzhsr@example.test')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
-- ตัวตนตาม JWT แต่สิทธิ์ฐาน (ฟังก์ชันภายในบางตัวไม่เปิดให้บัญชีเรียกตรง)
create function hsrtest.claims(p_uid uuid, p_role text) returns void language plpgsql as $$
begin perform hsrtest.as_root(); perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'user_role', p_role)::text, true); end $$;
grant usage on schema hsrtest to authenticated;
grant execute on all functions in schema hsrtest to authenticated;

do $$
declare
  hq uuid := (select id from profiles where role = 'SUPER_ADMIN' and status = 'active' order by created_at limit 1);
  ใหม่ uuid := gen_random_uuid();
  คนอื่น uuid[];
begin
  perform hsrtest.ok(hq is not null, 'มีบัญชีสำนักงานใหญ่ที่ใช้งาน');

  -- 1) ไม่มีค่าเดิมเหลือ · ตั้งเป็นค่าเดิมไม่ได้
  perform hsrtest.ok(not exists (select 1 from profiles where role in ('HQ_MANAGEMENT', 'HQ_STAFF')), '1) ไม่มีผู้ใช้ HQ_MANAGEMENT/HQ_STAFF เหลือ');
  insert into auth.users (id, email, instance_id, aud, role) values (ใหม่, 'zzhsr-' || left(ใหม่::text, 8) || '@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  -- ผู้ใช้ใหม่ของ HQ (โปรไฟล์อาจถูกสร้างตามจากตัวดักของ auth.users) — ตั้งเป็นบัญชีสำนักงานใหญ่ที่ใช้งาน
  insert into profiles (id, name, role, status) values (ใหม่, 'ZZTEST ผู้ใช้ HQ ใบ 0282', 'SUPER_ADMIN', 'active')
    on conflict (id) do update set name = excluded.name, role = 'SUPER_ADMIN', status = 'active', dealer_code = null;
  perform hsrtest.as_user(hq, 'SUPER_ADMIN');   -- ในนามสำนักงานใหญ่ (ผ่านตัวดักสิทธิ์) — ข้อจำกัดต้องกันเอง
  perform hsrtest.must_fail(format('update profiles set role = %L where id = %L', 'HQ_STAFF', ใหม่), 'profiles_hq_single_role', '1) แก้เป็น HQ_STAFF ไม่ได้');
  perform hsrtest.must_fail(format('update profiles set role = %L where id = %L', 'HQ_MANAGEMENT', ใหม่), 'profiles_hq_single_role', '1) แก้เป็น HQ_MANAGEMENT ไม่ได้');
  perform hsrtest.as_root();
  perform hsrtest.must_fail(format('insert into profiles (id, name, role, status) values (%L, %L, %L, %L)', gen_random_uuid(), 'ZZTEST', 'HQ_STAFF', 'active'), 'profiles_hq_single_role', '1) เพิ่มบัญชีใหม่เป็น HQ_STAFF ไม่ได้ (แม้คำสั่งตรงของฐาน)');

  -- 2) บัญชีสำนักงานใหญ่ (รวมอดีตเจ้าหน้าที่ที่ถูกแปลง) ทำได้ทุกอย่างของ HQ
  perform hsrtest.claims(ใหม่, 'SUPER_ADMIN');
  perform hsrtest.ok(is_hq() and can_write_master() and can_price_quotes(), '2) สำนักงานใหญ่: is_hq · แก้ข้อมูลกลาง · ตีราคา ได้ครบ');
  perform hsrtest.claims(ใหม่, 'HQ_STAFF');
  perform hsrtest.ok(not is_hq() and not can_write_master() and not can_price_quotes(), '2) โทเคนบทบาทเดิม HQ_STAFF = ไม่ใช่ HQ (กฎตัวเดียว)');
  perform hsrtest.claims(ใหม่, 'HQ_MANAGEMENT');
  perform hsrtest.ok(not is_hq() and not can_write_master(), '2) โทเคนบทบาทเดิม HQ_MANAGEMENT = ไม่ใช่ HQ');
  perform hsrtest.claims(ใหม่, 'DEALER_ADMIN');
  perform hsrtest.ok(not is_hq() and can_write_sales() is not null, '2) ฝั่งดีลเลอร์ไม่เปลี่ยน (ไม่ใช่ HQ)');

  -- 3) ห้ามปิดคนสุดท้าย: ปิดบัญชี HQ อื่นทั้งหมดก่อน (ในนามสำนักงานใหญ่ · มีอีกคนอยู่ = ปิดได้)
  perform hsrtest.as_user(hq, 'SUPER_ADMIN');
  select array_agg(id) into คนอื่น from profiles where role = 'SUPER_ADMIN' and status = 'active' and id <> ใหม่;
  update profiles set status = 'inactive' where id = any(คนอื่น);
  perform hsrtest.ok((select count(*) from profiles where role = 'SUPER_ADMIN' and status = 'active') = 1, '3) มีอีกคนใช้งาน = ปิดบัญชีสำนักงานใหญ่ได้ · เหลือคนเดียว');
  perform hsrtest.as_user(ใหม่, 'SUPER_ADMIN');
  perform hsrtest.must_fail(format('update profiles set status = %L where id = %L', 'inactive', ใหม่), 'last_hq_account', '3) ปิดบัญชีสำนักงานใหญ่คนสุดท้ายไม่ได้');
  perform hsrtest.as_root();
  perform hsrtest.must_fail(format('update profiles set status = %L where id = %L', 'inactive', ใหม่), 'last_hq_account', '3) คำสั่งตรงของฐานก็ปิดคนสุดท้ายไม่ได้');
  perform hsrtest.must_fail(format('update profiles set role = %L, dealer_code = %L where id = %L', 'DEALER_ADMIN', 'RYG', ใหม่), 'last_hq_account', '3) ลดสิทธิ์คนสุดท้ายเป็นดีลเลอร์ไม่ได้');
  perform hsrtest.must_fail(format('delete from profiles where id = %L', ใหม่), 'last_hq_account', '3) ลบคนสุดท้ายไม่ได้');

  -- 4) ชื่อบทบาทในบันทึกใหม่
  perform hsrtest.ok(_role_th('SUPER_ADMIN') = 'สำนักงานใหญ่' and _role_th('HQ_MANAGEMENT') = 'สำนักงานใหญ่' and _role_th('HQ_STAFF') = 'สำนักงานใหญ่'
    and _role_th('DEALER_ADMIN') = 'DEALER_ADMIN', '4) ชื่อบทบาท HQ ทุกค่า = สำนักงานใหญ่ · ดีลเลอร์ไม่เปลี่ยน');
end $$;

select 'ALL PASS' as result;
rollback;
