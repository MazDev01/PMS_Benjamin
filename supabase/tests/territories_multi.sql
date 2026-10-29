-- ── ทดสอบใบ 0214: ยกเลิก "หนึ่งจังหวัด หนึ่งดีลเลอร์" — จังหวัดเดียวมีดีลเลอร์ได้ไม่จำกัดสาขา (บอสสั่ง 16 ต.ค. 69) ──────────
-- รัน: docker exec -i <คอนเทนเนอร์ฐานทดสอบ> psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/territories_multi.sql
-- ทุกอย่างอยู่ในทรานแซกชันเดียวแล้ว rollback ท้ายไฟล์ · ผ่าน = บรรทัดสุดท้าย ALL PASS
-- กติกาที่คงไว้: ดีลเลอร์สร้างลีดได้ในจังหวัดที่ตัวเองดูแล · ลีดซ้ำในดีลเลอร์เดียวกันยังกัน · จังหวัดว่าง = คนแรกที่ส่งได้งาน
begin;
begin;

create schema flowtest;
create table flowtest.t_ctx as
select (select id from profiles where role = 'DEALER_ADMIN' and dealer_code = 'RYG' limit 1) as ryg_uid,
       (select id from profiles where role = 'DEALER_ADMIN' and dealer_code = 'CNX' limit 1) as cnx_uid,
       (select id from profiles where role = 'SUPER_ADMIN' limit 1) as hq_uid;
grant select on flowtest.t_ctx to authenticated;
create function flowtest.as_dealer(p_code text, p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated',
    'user_role', 'DEALER_ADMIN', 'dealer_code', p_code, 'email', lower(p_code) || '@test')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function flowtest.as_hq(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated',
    'user_role', 'SUPER_ADMIN', 'dealer_code', '', 'email', 'hq@test')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function flowtest.as_root() returns void language plpgsql as $$
begin perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '', true); end $$;
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
grant usage on schema flowtest to authenticated;
grant execute on all functions in schema flowtest to authenticated;
/** สร้างลูกค้าเป้าหมายใหม่ในนามดีลเลอร์ (ผ่านกฎทุกข้อของฐาน) */
create function flowtest.new_lead(p_dealer text, p_id text, p_company text, p_phone text, p_province text) returns void language plpgsql as $$
begin
  insert into leads (id, dealer_code, num_id, name, company, phone, province, status)
  values (p_id, p_dealer, 980000000 + (abs(hashtext(p_id)) % 9999999), p_company, p_company, p_phone, p_province, 'WAITING');
end $$;

do $$
declare c record; n int; s text;
begin
  select * into c from flowtest.t_ctx;
  -- ใบ 0259 (บอสสั่ง 29 ต.ค. 69): ดีลเลอร์ 1 ราย = 1 จังหวัดพอดี = จังหวัดที่ตั้ง (ฐานให้พื้นที่เอง) · จังหวัดเดียวหลายสาขาได้
  --   → "ดีลเลอร์รายที่ 2 ของจังหวัด" = สาขาทดสอบใหม่ที่ตั้งจังหวัดเดียวกัน (ZZMA · ZZMB ลำพูน)
  -- ══ ก. HQ เพิ่มดีลเลอร์รายที่ 2 ในจังหวัดเดียวกันได้ ══
  perform flowtest.as_hq(c.hq_uid);
  insert into dealers (code, name, province, region, status) values ('ZZMA', 'ZZTEST ลำพูน A', 'ลำพูน', 'เหนือ', 'active');
  insert into dealers (code, name, province, region, status) values ('ZZMB', 'ZZTEST ลำพูน B', 'ลำพูน', 'เหนือ', 'active');
  perform flowtest.as_root();
  perform flowtest.ok((select count(*) from dealer_territories where province = 'ลำพูน') = 2, 'จังหวัดเดียวมีดีลเลอร์ดูแล 2 ราย');
  perform flowtest.must_fail('insert into dealer_territories (province, dealer_code) values (''ลำพูน'', ''ZZMA'')',
    'duplicate key', 'ดีลเลอร์เดิมซ้ำจังหวัดเดิมไม่ได้ (คู่จังหวัด+ดีลเลอร์ยังห้ามซ้ำ)');
  perform flowtest.must_fail('insert into dealer_territories (province, dealer_code) values (''น่าน'', ''ZZMA'')',
    'dealer_territor', 'ดีลเลอร์รายเดียวดูแลจังหวัดที่ 2 ไม่ได้ (ใบ 0259)');
  perform flowtest.ok(not exists (select 1 from dealer_territories where legacy), 'ไม่มีป้ายทับซ้อน (legacy) เหลือ');
  perform flowtest.ok(to_regclass('public.territory_overlaps') is null, 'มุมมองจังหวัดทับซ้อนเอาออกแล้ว');
  perform flowtest.ok(to_regprocedure('public.territory_resolve_overlap(text,text)') is null, 'คำสั่งเคลียร์จังหวัดทับซ้อนเอาออกแล้ว');

  -- ══ ข. ดีลเลอร์ทั้ง 2 รายสร้างลีดในจังหวัดนั้นได้ ══
  perform flowtest.as_dealer('ZZMA', c.ryg_uid);
  perform flowtest.new_lead('ZZMA', '#ZZM-1', 'บจ. ลำพูนหนึ่ง', '0810000001', 'ลำพูน');
  perform flowtest.as_dealer('ZZMB', c.cnx_uid);
  perform flowtest.new_lead('ZZMB', '#ZZM-2', 'บจ. ลำพูนสอง', '0810000002', 'ลำพูน');
  perform flowtest.as_root();
  perform flowtest.ok((select count(*) from leads where id in ('#ZZM-1', '#ZZM-2')) = 2, 'สร้างลีดในจังหวัดที่ดูแลร่วมกันได้ทั้งคู่');

  -- ══ ค. กติกาที่คงไว้ ══
  perform flowtest.as_dealer('RYG', c.ryg_uid);
  perform flowtest.must_fail('select flowtest.new_lead(''RYG'', ''#ZZM-3'', ''บจ. นอกพื้นที่'', ''0810000003'', ''เชียงใหม่'')',
    'lead_outside_territory', 'สร้างลีดในจังหวัดที่มีดีลเลอร์อื่นดูแล (ตัวเองไม่ได้ดูแล) ไม่ได้');
  perform flowtest.new_lead('RYG', '#ZZM-4', 'บจ. จังหวัดว่าง', '0810000004', 'น่าน');
  perform flowtest.as_dealer('CNX', c.cnx_uid);
  perform flowtest.must_fail('select flowtest.new_lead(''CNX'', ''#ZZM-5'', ''บจ. จังหวัดว่าง'', ''0810000004'', ''น่าน'')',
    'lead_taken', 'จังหวัดว่าง: งานเดียวกันที่ดีลเลอร์อื่นยื่นก่อน = คนแรกได้');

  -- ══ ง. โอนลีดของ HQ: หลายสาขา = HQ เลือก · สาขาเดียว = อัตโนมัติ ══
  perform flowtest.as_root();
  insert into dealers (code, name, province, region, status) values ('ZZMN', 'ZZTEST น่าน', 'น่าน', 'เหนือ', 'active');
  perform flowtest.as_hq(c.hq_uid);
  select string_agg(province || ':' || mode || ':' || array_to_string(dealer_codes, '+'), ' ' order by province) into s
    from (select t.province, case when count(*) = 1 then 'auto' else 'choose' end as mode, array_agg(t.dealer_code order by t.dealer_code) as dealer_codes
            from dealer_territories t where t.province in ('ลำพูน', 'น่าน') group by t.province) x;
  perform flowtest.ok(s = 'น่าน:auto:ZZMN ลำพูน:choose:ZZMA+ZZMB', 'พื้นที่: น่านสาขาเดียว · ลำพูนสองสาขา');
  perform flowtest.as_root();
  raise notice 'ALL PASS';
end $$;

rollback;
