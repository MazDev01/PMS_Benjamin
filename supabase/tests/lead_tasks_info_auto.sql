-- ── ใบ 0263: งานขั้นข้อมูลลูกค้า — ไม่มี "ติดต่อแล้ว" · "เก็บข้อมูลลูกค้า"/"สรุปความต้องการ" ระบบติ๊กเองเมื่อข้อมูลครบ ──────────────
-- รัน: docker exec -i <คอนเทนเนอร์ฐานทดสอบ> psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/lead_tasks_info_auto.sql
-- ลีดทดสอบ ZZLI · ย้อนทั้งหมดตอนจบ
-- ข้อที่ต้องตกบนโค้ดก่อนใบ 0263: แม่แบบยังมี "ติดต่อแล้ว" · ข้อมูลครบแล้วไม่ติ๊ก · ดีลเลอร์ยังติ๊กเองได้
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
create function flowtest.ผู้ใช้(p_role text, p_dealer text) returns uuid language sql stable as $$
  select id from profiles where role::text = p_role and coalesce(dealer_code, '') = p_dealer and status::text = 'active' order by id limit 1 $$;
create function flowtest.as_user(p_role text, p_dealer text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', flowtest.ผู้ใช้(p_role, p_dealer), 'role', 'authenticated',
    'user_role', p_role, 'dealer_code', p_dealer, 'email', 'zzli@example.test')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function flowtest.as_root() returns void language plpgsql as $$
begin perform set_config('role', 'none', true); perform set_config('request.jwt.claims', '', true); end $$;
create function flowtest.ติ๊ก(p_num int, p_key text) returns boolean language sql as $$
  select coalesce((select (t ->> 'done')::boolean from leads l, jsonb_array_elements(l.tasks) t
                    where l.dealer_code = 'RYG' and l.num_id = p_num and t ->> 'key' = p_key limit 1), false) $$;
create function flowtest.มีรายการ(p_num int, p_key text) returns boolean language sql as $$
  select exists (select 1 from leads l, jsonb_array_elements(l.tasks) t where l.dealer_code = 'RYG' and l.num_id = p_num and t ->> 'key' = p_key) $$;
grant usage on schema flowtest to authenticated;
grant execute on all functions in schema flowtest to authenticated;

do $$ begin
  -- แม่แบบ: ไม่มี "ติดต่อแล้ว" · สองรายการเป็นของระบบ
  perform flowtest.ok(not exists (select 1 from hq_sales_journey j, jsonb_array_elements(j.tasks) t where j.id = 1 and t ->> 'key' = 'contact'),
    'แม่แบบของ HQ ไม่มี "ติดต่อแล้ว"');
  perform flowtest.ok((select bool_and(coalesce((t ->> 'auto')::boolean, false)) from hq_sales_journey j, jsonb_array_elements(j.tasks) t
                        where j.id = 1 and t ->> 'key' in ('collect', 'requirement')) is true
                      and (select count(*) from hq_sales_journey j, jsonb_array_elements(j.tasks) t where j.id = 1 and t ->> 'key' in ('collect', 'requirement')) = 2,
    'แม่แบบของ HQ: เก็บข้อมูลลูกค้า / สรุปความต้องการ เป็นรายการของระบบ');
  perform flowtest.ok(not exists (select 1 from jsonb_array_elements(_lead_task_template_default()) t where t ->> 'key' = 'contact'),
    'แม่แบบตั้งต้นไม่มี "ติดต่อแล้ว"');
  perform flowtest.ok(not exists (select 1 from leads, jsonb_array_elements(case when jsonb_typeof(tasks) = 'array' then tasks else '[]' end) t
                                   where t ->> 'key' = 'contact'),
    'ลีดที่มีอยู่ไม่มี "ติดต่อแล้ว" แล้ว');

  -- ดีลเลอร์สร้างลีด: ข้อมูลลูกค้าครบ ข้อมูลงานยังไม่ครบ
  perform flowtest.as_user('DEALER_ADMIN', 'RYG');
  insert into leads (id, num_id, dealer_code, company, name, contact, phone, province, status)
    values ('#L-ZZLI1', 990901, 'RYG', 'ZZLI ลีด 1', 'ZZLI ลีด 1', 'คุณทดสอบ', '000-000-0901', 'ระยอง', 'WAITING');
  perform flowtest.ok(flowtest.ติ๊ก(990901, 'collect'), 'สร้างลีดข้อมูลลูกค้าครบ → ติ๊ก เก็บข้อมูลลูกค้า');
  perform flowtest.ok(not flowtest.ติ๊ก(990901, 'requirement'), 'ข้อมูลงานยังไม่ครบ → สรุปความต้องการยังไม่ติ๊ก');
  perform flowtest.ok(not flowtest.มีรายการ(990901, 'contact'), 'ลีดใหม่ไม่มี "ติดต่อแล้ว"');

  -- แก้ข้อมูลงานให้ครบทีหลัง → ติ๊ก · พื้นที่ 0 = ไม่ครบ
  update leads set project = 'โกดัง', area = '0', note = 'สเปกทดสอบ' where dealer_code = 'RYG' and num_id = 990901;
  perform flowtest.ok(not flowtest.ติ๊ก(990901, 'requirement'), 'พื้นที่ 0 = ข้อมูลงานไม่ครบ → ยังไม่ติ๊ก');
  update leads set area = '1200' where dealer_code = 'RYG' and num_id = 990901;
  perform flowtest.ok(flowtest.ติ๊ก(990901, 'requirement'), 'กรอกข้อมูลงานครบทีหลัง → ติ๊ก สรุปความต้องการ');

  -- ลบข้อมูลจนไม่ครบ → ติ๊กหาย
  update leads set note = '' where dealer_code = 'RYG' and num_id = 990901;
  perform flowtest.ok(not flowtest.ติ๊ก(990901, 'requirement'), 'ลบสเปกออก → ติ๊ก สรุปความต้องการ หาย');
  update leads set contact = '' where dealer_code = 'RYG' and num_id = 990901;
  perform flowtest.ok(not flowtest.ติ๊ก(990901, 'collect'), 'ลบผู้ติดต่อออก → ติ๊ก เก็บข้อมูลลูกค้า หาย');

  -- ดีลเลอร์ติ๊กเองไม่ได้
  perform flowtest.must_fail($q$update leads set tasks = (select jsonb_agg(case when t ->> 'key' = 'collect' then t || '{"done":true}' else t end)
                                 from jsonb_array_elements(tasks) t) where dealer_code = 'RYG' and num_id = 990901$q$,
    'system_task_locked', 'ดีลเลอร์ติ๊ก เก็บข้อมูลลูกค้า เอง');
  perform flowtest.must_fail($q$select lead_apply('#L-ZZLI1', '{"tasks":[{"key":"requirement","done":true}]}'::jsonb)$q$,
    'system_task_locked', 'ดีลเลอร์ติ๊ก สรุปความต้องการ เองผ่านคำสั่งบันทึกลีด');

  -- ลีดที่ปิดแล้วไม่แตะ
  perform flowtest.as_root();
  perform flowtest.ok(_lead_info_tasks('[]'::jsonb, 'PAID', '', 'บ', 'ค', '0', 'ระยอง', 'ง', '10', 'ส') = '[]'::jsonb,
    'ลีดปิดแล้ว → ไม่ติ๊กเพิ่ม');
end $$;

select 'ALL PASS' as result;
rollback;
