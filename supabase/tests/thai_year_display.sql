-- ── ตัวตรวจใบ 0239: ข้อความที่ฐานสร้างต้องแสดงปี พ.ศ. — ห้ามรูปแบบปี ค.ศ. ในนิยามฟังก์ชันล่าสุด (บอสสั่ง 22 ต.ค. 69) ───────
--   1) อ่านนิยามล่าสุดของทุกฟังก์ชันใน public (pg_get_functiondef หลังลงใบครบ) — ไม่นับจากไฟล์ใบ (ไฟล์เก่ามีนิยามที่ถูกเขียนทับแล้ว)
--      to_char ที่รูปแบบมีปี (Y) ต้องเป็นของที่อนุญาตเท่านั้น:
--        · วันที่แบบ ISO ที่ใช้เทียบ/เก็บ ไม่ใช่แสดง: 'YYYY-MM-DD' · 'YYYY-MM-DD"T"HH24:MI:SS' · 'YYYY-MM'
--        · ปีในเลขที่เอกสาร 'YYYY' (Q-RYG-2026-0001 · RQ-… · HQ-…) เฉพาะฟังก์ชันออกเลขที่ในรายการ
--      อย่างอื่นทั้งหมด (DD/MM/YYYY · DD-MM-YYYY · Mon YYYY ฯลฯ) = แสดงปี ค.ศ. → ตก
--   2) ฟังก์ชันกลาง th_date / th_datetime ให้ผลถูก (ปี +543 · เวลาไทย · ค่าว่างคืนว่าง)
--   3) ทางจริง: HQ ส่งใบ HQ → อีเมลแจ้งดีลเลอร์ "ยืนราคาถึง" เป็นปี พ.ศ.
-- รัน: docker exec -i supabase_db_pms-dbcheck psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 < supabase/tests/thai_year_display.sql
-- ทรานแซกชันเดียวแล้ว rollback · ผ่าน = "ALL PASS"
begin;
create schema tytest;
create function tytest.ok(p_cond boolean, p_what text) returns void language plpgsql as $$
begin if p_cond is not true then raise exception 'FAIL: %', p_what; end if; raise notice 'ok  %', p_what; end $$;
create function tytest.as_dealer() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.profiles where role = 'DEALER_ADMIN' and dealer_code = 'CNX' limit 1),
    'role', 'authenticated', 'user_role', 'DEALER_ADMIN', 'dealer_code', 'CNX')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function tytest.as_hq() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.profiles where role = 'SUPER_ADMIN' limit 1),
    'role', 'authenticated', 'user_role', 'SUPER_ADMIN', 'dealer_code', '')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function tytest.as_db() returns void language plpgsql as $$
begin perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '', true); end $$;
grant usage on schema tytest to authenticated, service_role;
grant execute on all functions in schema tytest to authenticated, service_role;

-- ═══ 1. นิยามล่าสุดทุกฟังก์ชัน: ห้ามรูปแบบปี ค.ศ. ที่แสดงผล ═══
do $$
declare
  r record; พบ text[] := '{}'; นับ int := 0;
  ออกเลขที่ constant text[] := array['create_quotation', 'next_quote_no', 'hq_quote_save', 'quote_request_submit', 'quote_request_reprice'];
begin
  for r in
    select p.proname, m[1] as fmt
      from pg_proc p join pg_namespace s on s.oid = p.pronamespace
      cross join lateral regexp_matches(pg_get_functiondef(p.oid), 'to_char\s*\((?:[^()]|\([^()]*\))*?,\s*''([^'']*)''\s*\)', 'gi') m
     where s.nspname = 'public' and p.prokind in ('f', 'p')
  loop
    นับ := นับ + 1;
    continue when r.fmt !~* 'y';
    continue when r.fmt in ('YYYY-MM-DD', 'YYYY-MM-DD"T"HH24:MI:SS', 'YYYY-MM');
    continue when r.fmt = 'YYYY' and r.proname = any(ออกเลขที่);
    พบ := พบ || (r.proname || ' → ''' || r.fmt || '''');
  end loop;
  perform tytest.ok(นับ > 20, '1ก) ตัวตรวจอ่านเจอ to_char ในนิยามฟังก์ชันจริง (' || นับ || ' จุด — กันตัวตรวจอ่านไม่เจออะไรแล้วผ่านเปล่า ๆ)');
  perform tytest.ok(cardinality(พบ) = 0, '1ข) ไม่มีรูปแบบปี ค.ศ. ที่แสดงผลในนิยามฟังก์ชันล่าสุด'
    || case when cardinality(พบ) > 0 then ' — พบ: ' || array_to_string(พบ, ' | ') else '' end);
  perform tytest.ok(not exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
      where s.nspname = 'public' and p.prokind in ('f', 'p') and pg_get_functiondef(p.oid) ilike '%DD/MM/YYYY%'),
    '1ค) ไม่เหลือข้อความ DD/MM/YYYY ในนิยามฟังก์ชันใด');
end $$;

-- ═══ 2. ฟังก์ชันกลาง ═══
do $$
begin
  perform tytest.ok(public.th_date('2026-10-22') = '22/10/2569', '2ก) th_date 2026-10-22 → 22/10/2569');
  perform tytest.ok(public.th_date('2027-01-05') = '05/01/2570', '2ข) ข้ามปี 2027-01-05 → 05/01/2570');
  perform tytest.ok(public.th_date(null) is null, '2ค) ค่าว่าง → ว่าง (coalesce เดิมยังทำงาน)');
  perform tytest.ok(public.th_datetime('2026-10-21T17:30:00Z') = '22/10/2569 00:30', '2ง) th_datetime ใช้เวลาไทย (17:30 UTC = 00:30 วันถัดไป)');
  perform tytest.as_dealer();
  perform tytest.ok(public.th_date('2026-10-22') = '22/10/2569', '2จ) ผู้ใช้ที่ล็อกอินเรียกได้ (ใช้ในตัวดักที่รันด้วยสิทธิ์ผู้เรียก)');
  perform tytest.as_db();
end $$;

-- ═══ 3. ทางจริง: HQ ส่งใบ HQ → อีเมลแจ้งดีลเลอร์ ยืนราคาถึง = ปี พ.ศ. ═══
do $$
declare n int; rid bigint; ยืนราคา date := (now() at time zone 'Asia/Bangkok')::date + 30; เนื้อ text;
begin
  perform tytest.as_db();
  n := (select coalesce(max(num_id), 0) from public.leads where dealer_code = 'CNX') + 1;
  insert into public.leads (id, num_id, dealer_code, company, name, contact, phone, province, status)
  values ('#L-' || n, n, 'CNX', 'ZZTEST-ปีไทย', 'ZZTEST-ปีไทย', 'ผู้ทดสอบ', '000-000-' || lpad((n % 10000)::text, 4, '0'), 'เชียงใหม่', 'BULLET');
  perform tytest.as_dealer();
  rid := (public.quote_request_submit(n, 'โกดังสำเร็จรูป')).id;
  perform tytest.as_hq();
  perform public.hq_quote_save(rid, '[{"name":"โครงเหล็ก","qty":1,"unit":"ชุด","unitCost":1000}]'::jsonb, ยืนราคา);
  perform public.hq_quote_send(rid);
  perform tytest.as_db();
  select string_agg(coalesce(subject, '') || ' ' || coalesce(body, ''), ' ') into เนื้อ
    from public.email_outbox where ref_table = 'quote_requests' and ref_id = rid::text;
  perform tytest.ok(เนื้อ is not null, '3ก) ส่งใบ HQ แล้วมีอีเมลแจ้งดีลเลอร์');
  perform tytest.ok(เนื้อ like '%ยืนราคาถึง: ' || public.th_date(ยืนราคา) || '%', '3ข) อีเมล "ยืนราคาถึง" เป็นปี พ.ศ. (' || public.th_date(ยืนราคา) || ')');
  perform tytest.ok(เนื้อ not like '%' || to_char(ยืนราคา, 'DD/MM/YYYY') || '%', '3ค) ไม่มีวันที่ปี ค.ศ. ในอีเมล');
end $$;

do $$ begin raise notice 'ALL PASS'; end $$;
rollback;
