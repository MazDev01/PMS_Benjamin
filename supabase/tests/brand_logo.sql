-- ── ข้อทดสอบใบ 0304: โลโก้ของระบบ HQ เปลี่ยนได้ (บอสสั่ง 24 พ.ย. 69) ─────────────────────────────────────
--   1) PNG / JPEG / WebP ผ่าน · sha เปลี่ยนตามไฟล์ · brand_logo_meta คืน sha (HQ และดีลเลอร์)
--   2) SVG · ข้อความปลอมนามสกุล .png · ไฟล์ว่าง · base64 เสีย = brand_logo_type · เกิน 1 MB = brand_logo_size (ไม่ทับโลโก้เดิม)
--   3) ดีลเลอร์เปลี่ยน/ล้างโลโก้ไม่ได้ · อ่านตารางตรงไม่ได้ · ตัวไฟล์ (brand_logo_bytes) ผู้ล็อกอินทั้ง HQ/ดีลเลอร์ได้แถวเดียว (ชนิด · sha · ไบต์)
--      · anon เรียกทั้ง sha และตัวไฟล์ไม่ได้ · ไม่ใช้กุญแจ service (แอปดีลเลอร์ไม่มีโดยตั้งใจ · คนรวมงานตัดสิน 25 พ.ย. 69)
--   4) brand_logo_clear = กลับโลโก้เดิม (meta = null) · จด audit_log ทั้งเปลี่ยนและล้าง · ไม่เก็บชื่อไฟล์
--   ตกบนโค้ดก่อนใบ 0304: ไม่มีฟังก์ชัน brand_logo_set
-- รัน: docker exec -i <คอนเทนเนอร์ฐานทดสอบ> psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 < supabase/tests/brand_logo.sql
begin;
create schema bltest;
create function bltest.ok(p_cond boolean, p_what text) returns void language plpgsql as $$
begin if p_cond is not true then raise exception 'FAIL: %', p_what; end if; raise notice 'ok  %', p_what; end $$;
-- ทำ f แล้วต้องโยนข้อผิดพลาดที่ขึ้นต้นด้วย p_prefix (หรือรหัส 42501 เมื่อ p_prefix = '42501')
create function bltest.err(p_sql text, p_prefix text, p_what text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if (p_prefix = '42501' and sqlstate = '42501') or sqlerrm like p_prefix || '%' then
      raise notice 'ok  %', p_what; return;
    end if;
    raise exception 'FAIL: % — ได้ข้อผิดพลาดอื่น: % (%)', p_what, sqlerrm, sqlstate;
  end;
  raise exception 'FAIL: % — ไม่ถูกปฏิเสธ', p_what;
end $$;
grant usage on schema bltest to authenticated, anon, service_role;
grant execute on all functions in schema bltest to authenticated, anon, service_role;

-- ไฟล์ตัวอย่าง (ไบต์หัวไฟล์จริง + ท้ายสุ่ม)
create table bltest.f (k text primary key, b64 text);
grant select on bltest.f to authenticated, anon;
insert into bltest.f values
  ('png',  encode('\x89504e470d0a1a0a0000000d49484452'::bytea || extensions.gen_random_bytes(64), 'base64')),
  ('jpg',  encode('\xffd8ffe000104a464946'::bytea || extensions.gen_random_bytes(64), 'base64')),
  ('webp', encode('\x52494646240000005745425056503820'::bytea || extensions.gen_random_bytes(64), 'base64')),
  ('svg',  encode(convert_to('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', 'UTF8'), 'base64')),
  ('fake', encode(convert_to('ไม่ใช่รูป แค่ตั้งชื่อ logo.png', 'UTF8'), 'base64')),
  ('big',  encode('\x89504e470d0a1a0a'::bytea || decode(repeat('00', 1048569), 'hex'), 'base64')),
  ('max',  encode('\x89504e470d0a1a0a'::bytea || decode(repeat('00', 1048568), 'hex'), 'base64'));

set local session_replication_role = replica;
delete from brand_logo;
set local session_replication_role = origin;

-- ── HQ ──
select set_config('request.jwt.claims', json_build_object('sub', (select id from profiles where role = 'SUPER_ADMIN' order by id limit 1),
  'role', 'authenticated', 'user_role', 'SUPER_ADMIN', 'dealer_code', '')::text, true);
set local role authenticated;
do $$
declare h1 text; h2 text; h3 text; a0 bigint := (select count(*) from audit_log where action = 'เปลี่ยนโลโก้ของระบบ');
begin
  perform bltest.ok(brand_logo_meta() is null, '4) ยังไม่ตั้ง = meta ว่าง (ใช้โลโก้เดิม)');
  h1 := brand_logo_set((select b64 from bltest.f where k = 'png'));
  perform bltest.ok(brand_logo_meta() = h1 and length(h1) = 64, '1) PNG ผ่าน · meta = sha ของไฟล์');
  h2 := brand_logo_set((select b64 from bltest.f where k = 'jpg'));
  perform bltest.ok(h2 <> h1 and brand_logo_meta() = h2, '1) JPEG ผ่าน · sha เปลี่ยนตามไฟล์');
  h3 := brand_logo_set((select b64 from bltest.f where k = 'webp'));
  perform bltest.ok(brand_logo_meta() = h3, '1) WebP ผ่าน');
  perform bltest.ok(brand_logo_set((select b64 from bltest.f where k = 'max')) is not null, '2) ขนาดพอดี 1 MB (1,048,576 ไบต์) ผ่าน');
  perform brand_logo_set((select b64 from bltest.f where k = 'webp'));
  perform bltest.ok((select count(*) from audit_log where action = 'เปลี่ยนโลโก้ของระบบ') = a0 + 5, '4) จด audit_log ทุกครั้งที่เปลี่ยน');
end $$;
select bltest.err($q$select brand_logo_set((select b64 from bltest.f where k = 'svg'))$q$, 'brand_logo_type', '2) SVG ถูกปฏิเสธ');
select bltest.err($q$select brand_logo_set((select b64 from bltest.f where k = 'fake'))$q$, 'brand_logo_type', '2) ข้อความที่ตั้งชื่อ .png ถูกปฏิเสธ (ตรวจไบต์จริง)');
select bltest.err($q$select brand_logo_set('')$q$, 'brand_logo_type', '2) ไฟล์ว่างถูกปฏิเสธ');
select bltest.err($q$select brand_logo_set('@@ไม่ใช่base64@@')$q$, 'brand_logo_type', '2) base64 เสียถูกปฏิเสธ');
select bltest.err($q$select brand_logo_set((select b64 from bltest.f where k = 'big'))$q$, 'brand_logo_size', '2) เกิน 1 MB 1 ไบต์ถูกปฏิเสธ');
select bltest.err($q$select * from brand_logo$q$, '42501', '3) HQ อ่านตารางตรงไม่ได้ (ผ่านฟังก์ชันเท่านั้น)');
do $$ begin
  perform bltest.ok((select count(*) from brand_logo_bytes()) = 1 and (select mime from brand_logo_bytes()) = 'image/webp', '3) HQ เรียกตัวไฟล์ได้แถวเดียว');
end $$;
reset role;
do $$ begin
  perform bltest.ok((select mime from brand_logo) = 'image/webp', '2) ไฟล์ที่ถูกปฏิเสธไม่ทับโลโก้เดิม');
  perform bltest.ok(not exists (select 1 from information_schema.columns where table_name = 'brand_logo' and column_name ~ 'name'), '4) ไม่เก็บชื่อไฟล์');
end $$;

-- ── ดีลเลอร์ ──
select set_config('request.jwt.claims', json_build_object('sub', (select id from profiles where role = 'DEALER_ADMIN' limit 1), 'role', 'authenticated',
  'user_role', 'DEALER_ADMIN', 'dealer_code', (select dealer_code from profiles where role = 'DEALER_ADMIN' limit 1))::text, true);
set local role authenticated;
do $$ begin
  perform bltest.ok(length(brand_logo_meta()) = 64, '1) ดีลเลอร์อ่าน sha ได้ (เมนูใช้โลโก้ของ HQ)');
  perform bltest.ok((select count(*) from brand_logo_bytes()) = 1, '3) ดีลเลอร์เรียกตัวไฟล์ได้แถวเดียว');
  perform bltest.ok((select mime from brand_logo_bytes()) = 'image/webp'
                    and (select sha256 from brand_logo_bytes()) = brand_logo_meta()
                    and substring(decode((select data_base64 from brand_logo_bytes()), 'base64') from 1 for 4) = decode('52494646', 'hex'),
                    '3) ดีลเลอร์ได้ชนิดที่ตรวจไว้ตอนอัป · sha ตรง · ไบต์ตรงกับที่ HQ อัป');
end $$;
select bltest.err($q$select * from brand_logo$q$, '42501', '3) ดีลเลอร์อ่านตารางตรงไม่ได้');
select bltest.err($q$select brand_logo_set((select b64 from bltest.f where k = 'png'))$q$, '42501', '3) ดีลเลอร์เปลี่ยนโลโก้ไม่ได้');
select bltest.err($q$select brand_logo_clear()$q$, '42501', '3) ดีลเลอร์ล้างโลโก้ไม่ได้');
reset role;

-- ── anon ──
select set_config('request.jwt.claims', '', true);
set local role anon;
select bltest.err($q$select brand_logo_meta()$q$, '42501', '3) anon อ่าน sha ไม่ได้ (หน้าเข้าระบบใช้โลโก้เดิม)');
select bltest.err($q$select * from brand_logo_bytes()$q$, '42501', '3) anon เรียกตัวไฟล์ไม่ได้');
reset role;

-- ── คอลัมน์ที่คืน = ชนิด · sha · ไบต์ เท่านั้น ──
do $$ begin
  perform bltest.ok((select array_agg(a order by a) from unnest((select proargnames from pg_proc where proname = 'brand_logo_bytes')) a)
                    = array['data_base64', 'mime', 'sha256'], '3) ตัวไฟล์คืนเฉพาะ ชนิด · sha · ไบต์ ไม่มีคอลัมน์อื่น');
  perform bltest.ok(not has_function_privilege('anon', 'public.brand_logo_bytes()', 'execute')
                    and has_function_privilege('authenticated', 'public.brand_logo_bytes()', 'execute'), '3) สิทธิ์ตัวไฟล์: authenticated ได้ · anon ไม่ได้');
end $$;

-- ── HQ ล้าง = กลับโลโก้เดิม ──
select set_config('request.jwt.claims', json_build_object('sub', (select id from profiles where role = 'SUPER_ADMIN' order by id limit 1),
  'role', 'authenticated', 'user_role', 'SUPER_ADMIN', 'dealer_code', '')::text, true);
set local role authenticated;
do $$
declare a0 bigint := (select count(*) from audit_log where action = 'กลับไปใช้โลโก้ Benjamin เดิม');
begin
  perform brand_logo_clear();
  perform bltest.ok(brand_logo_meta() is null, '4) กลับไปใช้โลโก้เดิม = meta ว่าง');
  perform bltest.ok((select count(*) from audit_log where action = 'กลับไปใช้โลโก้ Benjamin เดิม') = a0 + 1, '4) จด audit_log ตอนล้าง');
  perform brand_logo_clear();
  perform bltest.ok((select count(*) from audit_log where action = 'กลับไปใช้โลโก้ Benjamin เดิม') = a0 + 1, '4) ล้างซ้ำตอนไม่มีโลโก้ = ไม่จดซ้ำ');
end $$;
reset role;

select 'ALL PASS' as result;
rollback;
