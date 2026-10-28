-- ── ใบ 0251: เลขขั้นของลีดที่ฐานคิด ต้องตรงกับ ขั้นของลีด() ใน packages/shared/lib/leadStage.ts ทุกสถานะ (บอสสั่ง 27 ต.ค. 69) ──
--   ① ตารางสถานะ → เลขขั้น ครบทุกสถานะ (ขั้น 3/4 แยกด้วยใบร่าง)  ② เส้นทางจริง: ได้ใบ HQ = 3 → ทำใบร่าง = 4
--   ③ leads_page กรอง p_stage + แถวมี stage_no  ④ lead_summary.byStage นับตรง
-- รัน: docker exec -i <คอนเทนเนอร์ฐานทดสอบ> psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/lead_stage_no.sql
begin;
create schema flowtest;
create function flowtest.ok(p_cond boolean, p_what text) returns void language plpgsql as $$
begin if p_cond is not true then raise exception 'FAIL: %', p_what; end if; raise notice 'ok  %', p_what; end $$;
create function flowtest.as_dealer(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated',
    'user_role', 'DEALER_ADMIN', 'dealer_code', 'CNX', 'email', 'cnx@test')::text, true);
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
grant usage on schema flowtest to authenticated;
grant execute on all functions in schema flowtest to authenticated;

do $$
declare
  cnx uuid := (select id from profiles where role = 'DEALER_ADMIN' and dealer_code = 'CNX' limit 1);
  hq  uuid := (select id from profiles where role = 'SUPER_ADMIN' limit 1);
  l1 int; r quote_requests; h hq_quotes; q quotations; หน้า jsonb; สรุป jsonb; n4 int;
begin
  -- ① ตารางสถานะ → เลขขั้น (ลีดเลข -1 ไม่มีใบ = ไม่มีใบร่าง)
  perform flowtest.ok(lead_stage_no('CNX', -1, 'WAITING') = 1 and lead_stage_no('CNX', -1, 'BULLET') = 1, 'ติดต่อแล้ว/รวบรวมความต้องการ = ขั้น 1');
  perform flowtest.ok(lead_stage_no('CNX', -1, 'HQ_PRICING') = 2, 'รอราคา HQ = ขั้น 2');
  perform flowtest.ok(lead_stage_no('CNX', -1, 'HQ_QUOTED') = 3, 'ได้ราคา HQ ไม่มีใบร่าง = ขั้น 3');
  perform flowtest.ok(lead_stage_no('CNX', -1, 'QUOTED') = 5, 'เสนอราคา = ขั้น 5');
  -- สถานะเก่า (ติดตามผล/เจรจาต่อรอง) เลิกใช้แล้ว ไม่มีขั้น (ใบ 0257)
  perform flowtest.ok(lead_stage_no('CNX', -1, 'FOLLOWUP') is null and lead_stage_no('CNX', -1, 'NEGO') is null, 'สถานะเก่าไม่มีขั้นแล้ว (ใบ 0257)');
  perform flowtest.ok(lead_stage_no('CNX', -1, 'PAID') = 6 and lead_stage_no('CNX', -1, 'CANCELLED') = 7, 'ปิดสำเร็จ = 6 · ปิดไม่สำเร็จ = 7');

  -- ② เส้นทางจริง: ขอราคา (2) → HQ ส่งใบ (3) → ทำใบร่าง (4)
  select num_id into l1 from leads where dealer_code = 'CNX' and status in ('WAITING','BULLET') order by num_id limit 1;
  perform flowtest.ok(cnx is not null and hq is not null and l1 is not null, 'มีข้อมูลตั้งต้นครบ');
  update leads set company = 'ZZT ขั้นลีด' where dealer_code = 'CNX' and num_id = l1;
  perform flowtest.as_dealer(cnx);
  r := quote_request_submit(l1, 'โกดังและคลังสินค้า');
  perform flowtest.as_root();
  perform flowtest.ok(lead_stage_no('CNX', l1, (select status from leads where dealer_code = 'CNX' and num_id = l1)) = 2, 'ส่งคำขอราคาแล้ว = ขั้น 2');
  perform flowtest.as_hq(hq);
  perform hq_quote_save(r.id, '[{"name":"โครงเหล็ก","qty":1,"unit":"ชุด","unitCost":1000}]'::jsonb, current_date + 20);
  h := hq_quote_send(r.id);
  perform flowtest.as_root();
  perform flowtest.ok(lead_stage_no('CNX', l1, (select status from leads where dealer_code = 'CNX' and num_id = l1)) = 3, 'HQ ส่งใบแล้ว ยังไม่มีใบร่าง = ขั้น 3');
  perform flowtest.as_dealer(cnx);
  select * into q from create_quotation('CNX', 'Q-', jsonb_build_object('customer', 'ZZT ขั้นลีด', 'status', 'draft',
    'date', to_char(current_date, 'DD/MM/YYYY'), 'line_items', '[{"name":"x","qty":1}]'::jsonb,
    'hq_quote_id', h.id, 'markup_percent', 0, 'deal_id', l1));
  perform flowtest.as_root();
  perform flowtest.ok(lead_stage_no('CNX', l1, (select status from leads where dealer_code = 'CNX' and num_id = l1)) = 4, 'มีใบร่างให้ลูกค้าแล้ว = ขั้น 4');

  -- ③ leads_page: กรองขั้น 4 ได้ลีดนี้ · แถวมี stage_no · ขั้นอื่นไม่มีลีดนี้
  perform flowtest.as_dealer(cnx);
  หน้า := leads_page(50, 0, p_dealer_codes => array['CNX'], p_search => 'ZZT ขั้นลีด', p_stage => 4);
  perform flowtest.ok((หน้า ->> 'total')::int = 1 and (หน้า -> 'rows' -> 0 ->> 'stage_no')::int = 4, 'leads_page p_stage=4 ได้ลีดนี้ แถวมี stage_no = 4');
  หน้า := leads_page(50, 0, p_dealer_codes => array['CNX'], p_search => 'ZZT ขั้นลีด', p_stage => 3);
  perform flowtest.ok((หน้า ->> 'total')::int = 0, 'leads_page p_stage=3 ไม่มีลีดนี้ (สถานะเดียวกัน แยกด้วยใบร่าง)');
  หน้า := leads_page(50, 0, p_dealer_codes => array['CNX']);
  perform flowtest.ok(not exists (select 1 from jsonb_array_elements(หน้า -> 'rows') x where x ->> 'stage_no' is null), 'ทุกแถวของ leads_page มี stage_no');

  -- ④ lead_summary.byStage
  สรุป := lead_summary(p_dealer_codes => array['CNX'], p_search => 'ZZT ขั้นลีด');
  perform flowtest.ok((select (x ->> 'count')::int from jsonb_array_elements(สรุป -> 'byStage') x where (x ->> 'stage')::int = 4) = 1,
    'lead_summary.byStage นับลีดนี้ในขั้น 4');
  select count(*) into n4 from leads where dealer_code = 'CNX' and lead_stage_no(dealer_code, num_id, status) = 4;
  สรุป := lead_summary(p_dealer_codes => array['CNX'], p_stage => 4);
  perform flowtest.ok(coalesce((select sum((x ->> 'count')::int) from jsonb_array_elements(สรุป -> 'byStage') x), 0) = n4,
    'lead_summary p_stage=4 นับเท่ากับนับจากตารางตรง ๆ');
end $$;

select 'ALL PASS' as result;
rollback;
