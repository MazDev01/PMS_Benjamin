-- ── ทดสอบใบ 0197: โอนลูกค้าเป้าหมายจาก HQ ให้ดีลเลอร์ (ด่าน 1 · FLOW.html "HQ ไม่คุยกับลูกค้าปลายทางโดยตรง") ──────
-- รัน: docker exec -i <คอนเทนเนอร์ฐานทดสอบ> psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/lead_transfer.sql
-- ทุกอย่างอยู่ในทรานแซกชันเดียวแล้ว rollback ท้ายไฟล์ · ผ่าน = บรรทัดสุดท้ายขึ้น "ALL PASS"
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

do $$
declare c record; n int; s text; new_num int;
begin
  select * into c from flowtest.t_ctx;
  -- จังหวัดว่าง = บึงกาฬ (ไม่มีข้อทดสอบไหนตั้งสาขาที่นี่ · เดิมตราด แต่สาขาทดสอบที่รันพร้อมกันตั้งที่ตราด = ได้พื้นที่ตามใบ 0259)
  -- เตรียม: รหัส HQ (ระบบจริงมีลูกค้าเป้าหมายใต้รหัสนี้ 252 ราย) · ลำพูนทับซ้อน RYG + CNX · บึงกาฬว่าง
  insert into dealers (code, name, province, region, status) values ('HQ', 'สำนักงานใหญ่', 'กรุงเทพมหานคร', 'กลาง', 'active') on conflict (code) do nothing;
  -- ลำพูนมี 2 สาขาดูแล = สาขาทดสอบ 2 สาขาจังหวัดเดียวกัน (ดีลเลอร์ 1 ราย = 1 จังหวัดพอดี · ใบ 0259 · ฐานให้พื้นที่ตามจังหวัดที่ตั้งเอง)
  insert into dealers (code, name, province, region, status) values ('ZZLPA', 'ZZTEST ลำพูน A', 'ลำพูน', 'เหนือ', 'active'), ('ZZLPB', 'ZZTEST ลำพูน B', 'ลำพูน', 'เหนือ', 'active');
  insert into leads (id, dealer_code, num_id, name, company, phone, province, status, note, activities) values
    ('#HQ-1', 'HQ', 970000001, 'ก', 'บจ. โอนระยองหนึ่ง', '081-200-0001', 'ระยอง', 'WAITING', 'โน้ตจาก HQ',
       '[{"id":1,"date":"1 ต.ค. 2569 · 09:00","text":"HQ รับเรื่องจากเว็บไซต์","type":"note","icon":"note"}]'),
    ('#HQ-2', 'HQ', 970000002, 'ข', 'บจ. โอนระยองสอง', '081-200-0002', 'ระยอง', 'WAITING', '', '[]'),
    ('#HQ-3', 'HQ', 970000003, 'ค', 'บจ. โอนลำพูน', '081-200-0003', 'ลำพูน', 'WAITING', '', '[]'),
    ('#HQ-4', 'HQ', 970000004, 'ง', 'บจ. ไม่มีจังหวัด', '081-200-0004', '', 'WAITING', '', '[]'),
    ('#HQ-5', 'HQ', 970000005, 'จ', 'บจ. จังหวัดว่าง', '081-200-0005', 'บึงกาฬ', 'WAITING', '', '[]');
  insert into appointments (id, dealer_code, lead_id, date, company, note)
  values (970000001, 'HQ', 970000001, '2026-10-20', 'บจ. โอนระยองหนึ่ง', 'นัดดูหน้างาน');

  -- ══ ก. แผนการโอน ══
  perform flowtest.as_dealer('RYG', c.ryg_uid);
  perform flowtest.must_fail('select * from hq_lead_transfer_plan()', 'forbidden', 'ดีลเลอร์ดูแผนการโอนของ HQ ไม่ได้');
  perform flowtest.must_fail('select transfer_hq_leads_auto()', 'forbidden', 'ดีลเลอร์สั่งโอนไม่ได้');
  perform flowtest.as_hq(c.hq_uid);
  select string_agg(coalesce(nullif(province, ''), '(ไม่มีจังหวัด)') || ':' || mode || ':' || leads || ':' || array_to_string(dealer_codes, '+'), ' ' order by province)
    into s from hq_lead_transfer_plan() where province in ('ระยอง', 'ลำพูน', 'บึงกาฬ', '');
  perform flowtest.ok(s = '(ไม่มีจังหวัด):queue:1: บึงกาฬ:queue:1: ระยอง:auto:2:RYG ลำพูน:choose:1:ZZLPA+ZZLPB',
    'แผน: ดีลเลอร์รายเดียว = โอนอัตโนมัติ · ทับซ้อน = HQ เลือก · ไม่มีจังหวัด/จังหวัดว่าง = คิวรอ (ได้ ' || coalesce(s, 'ว่าง') || ')');

  -- ══ ข. HQ กดยืนยันโอนอัตโนมัติเป็นชุด ══
  n := transfer_hq_leads_auto();
  perform flowtest.ok(n >= 2, 'โอนอัตโนมัติทั้งชุด (จังหวัดที่มีดีลเลอร์รายเดียว)');
  perform flowtest.as_root();
  select num_id into new_num from leads where dealer_code = 'RYG' and company = 'บจ. โอนระยองหนึ่ง';
  perform flowtest.ok(new_num is not null and not exists (select 1 from leads where dealer_code = 'HQ' and company like 'บจ. โอนระยอง%'),
    'ลูกค้าเป้าหมายไปอยู่ที่ RYG และไม่เหลือที่ HQ');
  perform flowtest.ok((select id = '#L-' || (40321 + num_id) from leads where dealer_code = 'RYG' and company = 'บจ. โอนระยองหนึ่ง'),
    'ได้เลขใหม่ตามเลขของดีลเลอร์ปลายทาง (ไม่ชนกับของเดิมของ RYG)');
  perform flowtest.ok((select note = 'โน้ตจาก HQ' and activities -> 0 ->> 'text' = 'HQ รับเรื่องจากเว็บไซต์'
                         and (activities -> -1 ->> 'text') like 'รับโอนจากสำนักงานใหญ่%'
                         from leads where dealer_code = 'RYG' and company = 'บจ. โอนระยองหนึ่ง'),
    'ประวัติและโน้ตย้ายตาม + บรรทัดบอกว่ารับโอนจาก HQ');
  perform flowtest.ok(exists (select 1 from appointments where dealer_code = 'RYG' and lead_id = new_num and note = 'นัดดูหน้างาน')
                      and not exists (select 1 from appointments where dealer_code = 'HQ' and company = 'บจ. โอนระยองหนึ่ง'),
    'นัดหมายย้ายตาม และชี้ลูกค้าเป้าหมายรายเดิม (เลขใหม่)');
  perform flowtest.as_dealer('RYG', c.ryg_uid);
  perform flowtest.ok((select count(*) from leads where company like 'บจ. โอนระยอง%') = 2, 'RYG เห็นลูกค้าเป้าหมายที่รับโอนในฐานะเจ้าของ');
  perform flowtest.as_dealer('CNX', c.cnx_uid);
  perform flowtest.ok((select count(*) from leads where company like 'บจ. โอนระยอง%') = 0, 'ดีลเลอร์อื่นไม่เห็น');
  perform flowtest.as_hq(c.hq_uid);
  perform flowtest.ok((select count(*) from leads where dealer_code = 'HQ' and company like 'บจ. โอนระยอง%') = 0, 'HQ ไม่ได้เป็นเจ้าของอีกต่อไป');

  -- ══ ค. จังหวัดทับซ้อน: HQ เลือกดีลเลอร์เป็นชุดต่อจังหวัด ══
  perform flowtest.must_fail('select transfer_hq_leads(''ลำพูน'', ''BKK'')', 'transfer_not_owner', 'โอนให้ดีลเลอร์ที่ไม่ได้ดูแลจังหวัดนั้นไม่ได้');
  n := transfer_hq_leads('ลำพูน', 'ZZLPB');
  perform flowtest.ok(n = 1 and exists (select 1 from leads where dealer_code = 'ZZLPB' and company = 'บจ. โอนลำพูน'), 'จังหวัดหลายสาขา HQ เลือกสาขาที่ 2 → โอนให้สาขานั้น');

  -- ══ ง. ไม่มีจังหวัด / จังหวัดว่าง = คิวรอ ไม่โอน ══
  perform flowtest.must_fail('select transfer_hq_leads('''', ''RYG'')', 'transfer_queue', 'ลูกค้าเป้าหมายที่ไม่มีจังหวัด โอนไม่ได้ (อยู่ในคิวรอ)');
  perform flowtest.must_fail('select transfer_hq_leads(''บึงกาฬ'', ''RYG'')', 'transfer_not_owner', 'จังหวัดว่าง โอนไม่ได้ (อยู่ในคิวรอ)');
  perform flowtest.ok((select count(*) from leads where dealer_code = 'HQ' and company in ('บจ. ไม่มีจังหวัด', 'บจ. จังหวัดว่าง')) = 2, 'คิวรอยังอยู่ที่ HQ ครบ');
  perform flowtest.as_root();
  raise notice 'ALL PASS';
end $$;

rollback;
