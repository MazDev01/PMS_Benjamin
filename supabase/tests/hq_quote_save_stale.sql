-- ── ใบ 0305: บันทึกใบ HQ ด้วยฉบับที่เปิดมาไม่ตรงกับใบในฐาน = ปฏิเสธ quote_stale ไม่ทับเงียบ ──
--   0) รูปคำสั่ง: มีตัวเดียว (6 ช่อง) · ผู้ใช้ที่ล็อกอินเรียกได้ · ไม่ล็อกอินเรียกไม่ได้
--   1) ยังไม่มีใบ: ฉบับว่าง = สร้างได้ · ส่งฉบับมาทั้งที่ยังไม่มีใบ = ปฏิเสธ (คำขอยังเป็นคำขอใหม่ ไม่ถูกรับเรื่องให้)
--   2) มีใบแล้ว: ฉบับตรง = บันทึกได้ · ฉบับเก่า / ฉบับว่าง (เปิดตอนยังไม่มีใบ แต่มีคนสร้างก่อน) = ปฏิเสธ · รายการในฐานไม่เปลี่ยน
--   3) ผู้เรียกเดิมที่ไม่ส่งฉบับ (สคริปต์ข้อมูลตัวอย่าง) = ทำงานแบบเดิม
--   4) เริ่มจากใบฉบับก่อน (hq_quote_copy_from): คำขอยังไม่มีร่าง = คัดลอกได้ · มีร่างแล้ว = ปฏิเสธ ไม่ทับร่าง
--   ทุกการบันทึกในไฟล์นี้อยู่ในทรานแซกชันเดียว (now() ไม่ขยับ) — "ฉบับเก่า" จึงจำลองด้วยเวลาก่อนเวลาในฐาน 1 วินาที
--   การชนกันจริงสองการเชื่อมต่อ = tests/scenario/hq-quote-save-stale.spec.ts
-- รัน: docker exec -i supabase_db_pms-dbcheck psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 < supabase/tests/hq_quote_save_stale.sql
-- ทรานแซกชันเดียวแล้ว rollback · ผ่าน = "ALL PASS"
begin;
create schema sttest;
create function sttest.ok(p_cond boolean, p_what text) returns void language plpgsql as $$
begin if p_cond is not true then raise exception 'FAIL: %', p_what; end if; raise notice 'ok  %', p_what; end $$;
create function sttest.must_fail(p_sql text, p_like text, p_what text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if sqlerrm ilike '%' || p_like || '%' then raise notice 'ok  % (ถูกปฏิเสธ)', p_what; return; end if;
    raise exception 'FAIL: % — ถูกปฏิเสธแต่ข้อความไม่ตรง: %', p_what, sqlerrm;
  end;
  raise exception 'FAIL: % — ควรถูกปฏิเสธแต่ผ่าน', p_what;
end $$;
create function sttest.as_dealer(p_code text) returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.profiles where role = 'DEALER_ADMIN' and dealer_code = p_code limit 1),
    'role', 'authenticated', 'user_role', 'DEALER_ADMIN', 'dealer_code', p_code)::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function sttest.as_hq() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.profiles where role = 'SUPER_ADMIN' limit 1),
    'role', 'authenticated', 'user_role', 'SUPER_ADMIN', 'dealer_code', '')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function sttest.as_db() returns void language plpgsql as $$
begin perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '', true); end $$;
create table sttest.r (k text primary key, v text);
grant usage on schema sttest to authenticated, service_role;
grant execute on all functions in schema sttest to authenticated, service_role;
grant all on sttest.r to authenticated;

-- ═══ 0. รูปคำสั่ง + สิทธิ์ ═══
do $$
declare sig regprocedure;
begin
  perform sttest.as_db();
  perform sttest.ok((select count(*) from pg_proc where proname = 'hq_quote_save' and pronamespace = 'public'::regnamespace) = 1, '0ก) hq_quote_save มีรูปเดียว (ตัวเดิม 4 ช่องถูกลบ — เรียกด้วยชื่อช่องไม่กำกวม)');
  sig := 'public.hq_quote_save(bigint,jsonb,date,text,boolean,timestamptz)'::regprocedure;
  perform sttest.ok(has_function_privilege('authenticated', sig, 'execute'), '0ข) ผู้ใช้ที่ล็อกอินเรียกได้');
  perform sttest.ok(not has_function_privilege('anon', sig, 'execute'), '0ค) ไม่ล็อกอินเรียกไม่ได้');
end $$;

-- ═══ เตรียม: ลีด → ดีลเลอร์ขอราคา (คำขอใหม่ ยังไม่มีใบ HQ) ═══
do $$
declare n int; rid bigint;
begin
  perform sttest.as_db();
  n := (select coalesce(max(num_id), 0) from public.leads where dealer_code = 'CNX') + 1;
  insert into public.leads (id, num_id, dealer_code, company, name, contact, phone, province, status, project, area, note)
  values ('#L-' || n, n, 'CNX', 'ZZTEST-ใบทับ0305', 'ZZTEST-ใบทับ0305', 'ผู้ทดสอบ', '000-000-' || lpad((n % 10000)::text, 4, '0'), 'เชียงใหม่', 'BULLET', 'ZZ งานทดสอบ', '100', 'ZZ สเปกทดสอบ');
  perform sttest.as_dealer('CNX');
  rid := (public.quote_request_submit(n, 'โกดังสำเร็จรูป')).id;
  perform sttest.as_db();
  insert into sttest.r values ('rid', rid::text);
end $$;

-- ═══ 1. ยังไม่มีใบ ═══
do $$
declare rid bigint := (select v::bigint from sttest.r where k = 'rid'); h hq_quotes;
  วัน date := (now() at time zone 'Asia/Bangkok')::date + 30;
begin
  perform sttest.as_hq();
  perform sttest.must_fail(format('select public.hq_quote_save(%s, %L::jsonb, %L::date, %L, true, %L::timestamptz)', rid,
    '[{"name":"โครงเหล็ก","qty":1,"unit":"ชุด","unitCost":1000}]', วัน, '', now() - interval '1 hour'),
    'มีคนแก้ใบนี้ก่อนคุณ โหลดใหม่ก่อนบันทึก', '1ก) ส่งฉบับมาทั้งที่ยังไม่มีใบ → ปฏิเสธด้วยข้อความที่บอสกำหนด');
  perform sttest.as_db();
  perform sttest.ok(not exists (select 1 from public.hq_quotes where request_id = rid), '1ข) ถูกปฏิเสธแล้วไม่มีใบเกิดขึ้น');
  perform sttest.ok((select status from public.quote_requests where id = rid) = 'new', '1ค) ถูกปฏิเสธแล้วคำขอไม่ถูกรับเรื่องให้ (ยังเป็นคำขอใหม่)');
  perform sttest.as_hq();
  h := public.hq_quote_save(rid, '[{"name":"โครงเหล็ก","qty":1,"unit":"ชุด","unitCost":1000}]'::jsonb, วัน, 'คนแรก', true, null);
  perform sttest.ok(h.id is not null and h.total_cost = 1000 and h.note = 'คนแรก', '1ง) ฉบับว่าง (เปิดตอนยังไม่มีใบ) → สร้างร่างได้');
  perform sttest.as_db();
  insert into sttest.r values ('t1', h.updated_at::text);
end $$;

-- ═══ 2. มีใบแล้ว ═══
do $$
declare rid bigint := (select v::bigint from sttest.r where k = 'rid'); h hq_quotes; t1 timestamptz := (select v::timestamptz from sttest.r where k = 't1');
  วัน date := (now() at time zone 'Asia/Bangkok')::date + 30; ก่อน hq_quotes;
begin
  perform sttest.as_db();
  ก่อน := (select q from public.hq_quotes q where request_id = rid);
  perform sttest.as_hq();
  perform sttest.must_fail(format('select public.hq_quote_save(%s, %L::jsonb, %L::date, %L, true, null)', rid,
    '[{"name":"คนที่สอง","qty":9,"unit":"ชุด","unitCost":9}]', วัน, 'คนที่สอง'),
    'quote_stale', '2ก) เปิดตอนยังไม่มีใบ (ฉบับว่าง) แต่มีคนสร้างร่างก่อน → ปฏิเสธ');
  perform sttest.must_fail(format('select public.hq_quote_save(%s, %L::jsonb, %L::date, %L, true, %L::timestamptz)', rid,
    '[{"name":"คนที่สอง","qty":9,"unit":"ชุด","unitCost":9}]', วัน, 'คนที่สอง', t1 - interval '1 second'),
    'มีคนแก้ใบนี้ก่อนคุณ โหลดใหม่ก่อนบันทึก', '2ข) ฉบับเก่ากว่าใบในฐาน → ปฏิเสธ');
  perform sttest.must_fail(format('select public.hq_quote_save(%s, %L::jsonb, %L::date, %L, true, %L::timestamptz)', rid,
    '[{"name":"คนที่สอง","qty":9,"unit":"ชุด","unitCost":9}]', วัน, 'คนที่สอง', t1 + interval '1 microsecond'),
    'quote_stale', '2ค) ต่างกันแค่ 1 ไมโครวินาที → ปฏิเสธ (เทียบละเอียดเท่าที่ฐานเก็บ)');
  perform sttest.as_db();
  perform sttest.ok((select q.line_items = ก่อน.line_items and q.note = 'คนแรก' and q.total_cost = 1000 and q.updated_at = ก่อน.updated_at
    from public.hq_quotes q where request_id = rid), '2ง) ถูกปฏิเสธทุกครั้ง → ใบในฐานยังเป็นของคนแรกทุกช่อง');
  perform sttest.as_hq();
  h := public.hq_quote_save(rid, '[{"name":"โครงเหล็ก","qty":2,"unit":"ชุด","unitCost":1000}]'::jsonb, วัน, 'แก้ต่อ', true, t1);
  perform sttest.ok(h.total_cost = 2000 and h.note = 'แก้ต่อ', '2จ) ฉบับตรงกับใบในฐาน → บันทึกได้');
end $$;

-- ═══ 3. ผู้เรียกเดิม (ไม่ส่งฉบับ) ═══
do $$
declare rid bigint := (select v::bigint from sttest.r where k = 'rid'); h hq_quotes;
begin
  perform sttest.as_hq();
  h := public.hq_quote_save(rid, '[{"name":"โครงเหล็ก","qty":3,"unit":"ชุด","unitCost":1000}]'::jsonb, (now() at time zone 'Asia/Bangkok')::date + 30, 'แบบเดิม');
  perform sttest.ok(h.total_cost = 3000 and h.note = 'แบบเดิม', '3ก) เรียก 4 ช่องแบบเดิม → บันทึกได้ ไม่ตรวจฉบับ');
  perform sttest.as_dealer('CNX');
  perform sttest.must_fail(format('select public.hq_quote_save(%s, %L::jsonb, null, %L, true, null)', rid, '[{"name":"x","qty":1,"unit":"ชุด","unitCost":1}]', ''),
    'forbidden', '3ข) ดีลเลอร์บันทึกใบ HQ ไม่ได้ (ตรวจสิทธิ์ก่อนตรวจฉบับ)');
end $$;

-- ═══ 4. เริ่มจากใบฉบับก่อน ═══
do $$
declare rid bigint := (select v::bigint from sttest.r where k = 'rid'); n int; r2 bigint; r3 bigint; src hq_quotes; h hq_quotes; ก่อน hq_quotes;
  วัน date := (now() at time zone 'Asia/Bangkok')::date + 30;
begin
  perform sttest.as_db();
  n := (select coalesce(max(num_id), 0) from public.leads where dealer_code = 'CNX') + 1;
  insert into public.leads (id, num_id, dealer_code, company, name, contact, phone, province, status, project, area, note)
  values ('#L-' || n, n, 'CNX', 'ZZTEST-ใบทับ0305-ต้นทาง', 'ZZTEST-ใบทับ0305-ต้นทาง', 'ผู้ทดสอบ', '000-000-' || lpad(((n + 1) % 10000)::text, 4, '0'), 'เชียงใหม่', 'BULLET', 'ZZ งานทดสอบ', '100', 'ZZ สเปกทดสอบ'),
         ('#L-' || (n + 1), n + 1, 'CNX', 'ZZTEST-ใบทับ0305-ปลายทาง', 'ZZTEST-ใบทับ0305-ปลายทาง', 'ผู้ทดสอบ', '000-000-' || lpad(((n + 2) % 10000)::text, 4, '0'), 'เชียงใหม่', 'BULLET', 'ZZ งานทดสอบ', '100', 'ZZ สเปกทดสอบ');
  perform sttest.as_dealer('CNX');
  r2 := (public.quote_request_submit(n, 'โกดังสำเร็จรูป')).id;
  r3 := (public.quote_request_submit(n + 1, 'โกดังสำเร็จรูป')).id;
  perform sttest.as_hq();
  perform public.hq_quote_save(r2, '[{"name":"ต้นทาง","qty":1,"unit":"ชุด","unitCost":7000}]'::jsonb, วัน, 'ต้นทาง');
  src := public.hq_quote_send(r2);
  perform sttest.as_db();
  ก่อน := (select q from public.hq_quotes q where request_id = rid);
  perform sttest.as_hq();
  perform sttest.must_fail(format('select public.hq_quote_copy_from(%s, %s)', rid, src.id), 'quote_stale',
    '4ก) คำขอที่มีร่างอยู่แล้ว กดเริ่มจากใบฉบับก่อน → ปฏิเสธ (ไม่ทับร่าง)');
  perform sttest.as_db();
  perform sttest.ok((select q.line_items = ก่อน.line_items and q.updated_at = ก่อน.updated_at from public.hq_quotes q where request_id = rid), '4ข) ร่างเดิมไม่ถูกแตะ');
  perform sttest.as_hq();
  h := public.hq_quote_copy_from(r3, src.id);
  perform sttest.ok(h.status = 'draft' and h.request_id = r3 and h.total_cost = 7000, '4ค) คำขอที่ยังไม่มีร่าง → คัดลอกจากใบฉบับก่อนได้');
end $$;

do $$ begin raise notice 'ALL PASS'; end $$;
rollback;
