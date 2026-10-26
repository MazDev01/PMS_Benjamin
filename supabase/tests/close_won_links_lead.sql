-- ── ใบ 0243: กด "ลูกค้าตอบรับ" แล้วฐานผูกลีดต้นทางกับลูกค้าเองในคำสั่งเดียวกัน (26 ต.ค. 69) ──────────────────────
--   เดิมแอปเขียน leads.customer_id ตามหลังอีกคำสั่ง → ผู้ใช้รีเฟรช/ปิดหน้าทันทีหลังกด = ลีดไม่ผูกลูกค้า เงียบ ๆ
--   ข้อนี้เรียกแค่คำสั่งปิดการขาย (ไม่ส่งคำสั่งตามหลังของแอป) = จำลองคำสั่งที่สองหาย → บนใบ 0145 ตก
-- รัน: docker exec -i <คอนเทนเนอร์ฐานทดสอบ> psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/close_won_links_lead.sql
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

-- ใบจากใบ HQ ที่ส่งถึงลูกค้าแล้ว ของลีด p_lead (สาขา CNX)
create function flowtest.sent_quote(p_lead int, p_company text, p_cnx uuid, p_hq uuid) returns quotations language plpgsql as $$
declare r quote_requests; h hq_quotes; q quotations;
begin
  perform flowtest.as_dealer(p_cnx);
  r := quote_request_submit(p_lead, 'โกดังและคลังสินค้า');
  perform flowtest.as_hq(p_hq);
  perform hq_quote_save(r.id, '[{"name":"โครงเหล็ก","qty":1,"unit":"ชุด","unitCost":1000}]'::jsonb, current_date + 20);
  h := hq_quote_send(r.id);
  perform flowtest.as_dealer(p_cnx);
  select * into q from create_quotation('CNX', 'Q-', jsonb_build_object('customer', p_company, 'status', 'sent_to_client',
    'date', to_char(current_date, 'DD/MM/YYYY'), 'line_items', '[{"name":"x","qty":1}]'::jsonb,
    'hq_quote_id', h.id, 'markup_percent', 0, 'deal_id', p_lead));
  return q;
end $$;
grant execute on function flowtest.sent_quote(int, text, uuid, uuid) to authenticated;

do $$
declare
  cnx uuid := (select id from profiles where role = 'DEALER_ADMIN' and dealer_code = 'CNX' limit 1);
  hq  uuid := (select id from profiles where role = 'SUPER_ADMIN' limit 1);
  l1 int; l2 int; c_other bigint; q1 quotations; q2 quotations; res jsonb; cust_id bigint; ก่อน int; หลัง int;
begin
  select num_id into l1 from leads where dealer_code = 'CNX' and status in ('WAITING','BULLET') and customer_id is null order by num_id limit 1;
  select num_id into l2 from leads where dealer_code = 'CNX' and status in ('WAITING','BULLET') and customer_id is null and num_id <> l1 order by num_id limit 1;
  select id into c_other from customers where dealer_code = 'CNX' order by id limit 1;
  perform flowtest.ok(cnx is not null and hq is not null and l1 is not null and l2 is not null and c_other is not null, 'มีข้อมูลตั้งต้นครบ');
  update leads set company = 'ZZT ผูกลีด ก' where dealer_code = 'CNX' and num_id = l1;
  update leads set company = 'ZZT ผูกลีด ข', customer_id = c_other where dealer_code = 'CNX' and num_id = l2;

  q1 := flowtest.sent_quote(l1, 'ZZT ผูกลีด ก', cnx, hq);
  perform flowtest.ok(q1.deal_id = l1, 'ใบจากใบ HQ ผูกกับลีดต้นทาง (deal_id)');

  -- ══ ลีดที่ยังไม่ผูกลูกค้า: ปิดการขาย = ผูกในคำสั่งเดียวกัน (ไม่มีคำสั่งตามหลังของแอป) ══
  perform flowtest.as_root();
  select count(*) into ก่อน from leads where customer_id is not null;
  perform flowtest.as_dealer(cnx);
  res := close_won_quotation('CNX', null, 'ZZT ผูกลีด ก', q1.id, false,
    jsonb_build_object('company', 'ZZT ผูกลีด ก', 'name', 'คุณทดสอบ', 'province', 'เชียงใหม่'));
  cust_id := (res -> 'customer' ->> 'id')::bigint;
  perform flowtest.as_root();
  perform flowtest.ok((select status from quotations where dealer_code = 'CNX' and id = q1.id) = 'won', 'ใบเป็น won');
  perform flowtest.ok((select customer_id from leads where dealer_code = 'CNX' and num_id = l1) = cust_id,
    'ลีดต้นทางผูกเลขลูกค้าแล้วทันทีที่ปิดการขาย — ไม่ต้องรอคำสั่งตามหลังของแอป');
  select count(*) into หลัง from leads where customer_id is not null;
  perform flowtest.ok(หลัง = ก่อน + 1, 'ผูกแค่ลีดเจ้าของใบแถวเดียว (ลีดอื่นทั้งฐานไม่ขยับ)');

  -- ══ ลีดที่ผูกลูกค้ารายอื่นอยู่แล้ว: ไม่ทับ ══
  q2 := flowtest.sent_quote(l2, 'ZZT ผูกลีด ข', cnx, hq);
  perform flowtest.as_dealer(cnx);
  res := close_won_quotation('CNX', null, 'ZZT ผูกลีด ข', q2.id, false,
    jsonb_build_object('company', 'ZZT ผูกลีด ข', 'name', 'คุณทดสอบ', 'province', 'เชียงใหม่'));
  perform flowtest.as_root();
  perform flowtest.ok((select customer_id from leads where dealer_code = 'CNX' and num_id = l2) = c_other,
    'ลีดที่ผูกลูกค้าอยู่แล้วไม่ถูกเปลี่ยนเป็นลูกค้ารายอื่น');
end $$;

select 'ALL PASS' as result;
rollback;
