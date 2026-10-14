-- ── ด่าน 3: ใบที่ลูกค้าตอบรับแล้ว (won) ห้ามลบ — ทั้งใบเก่าและใบที่มาจากใบ HQ (ข้อตัดสินของบอส 14 ต.ค. 69) ──────────
--   ใบ won คือยอดขายที่ปิดแล้ว (ใบจากใบ HQ = คำสั่งผลิต) ลบทิ้งได้ = ยอดขาย/ยอดลูกค้าหายเงียบ ๆ
--   ใบ lost / หมดอายุ ลบได้เหมือนเดิม
-- รัน: docker exec -i <คอนเทนเนอร์ฐานทดสอบ> psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/won_quote_no_delete.sql
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
  l1 int; l2 int; c1 bigint; r quote_requests; h hq_quotes; q quotations; r2 quote_requests; h2 hq_quotes; q2 quotations;
  li jsonb := '[{"name":"ของเดิม","qty":1,"unit":"ชุด","unitPrice":1000}]';
  ten jsonb := '[{"name":"โครงเหล็ก","qty":1,"unit":"ชุด","unitCost":10}]';
begin
  select num_id into l1 from leads where dealer_code = 'CNX' and status in ('WAITING','BULLET') order by num_id limit 1;
  select num_id into l2 from leads where dealer_code = 'CNX' and status in ('WAITING','BULLET') and num_id <> l1 order by num_id limit 1;
  select id into c1 from customers where dealer_code = 'CNX' order by id limit 1;
  perform flowtest.ok(cnx is not null and hq is not null and l1 is not null and l2 is not null and c1 is not null, 'มีข้อมูลตั้งต้นครบ');

  -- ใบเก่า won / lost / expired
  alter table quotations disable trigger quotations_hq_link_guard;
  insert into quotations (id, dealer_code, customer, line_items, total_value, status, customer_id) values
    ('ZZW-OLD-WON',  'CNX', 'ZZW เก่า', li, 1000, 'won',     c1),
    ('ZZW-OLD-LOST', 'CNX', 'ZZW เก่า', li, 1000, 'lost',    null),
    ('ZZW-OLD-EXP',  'CNX', 'ZZW เก่า', li, 1000, 'expired', null);
  alter table quotations enable trigger quotations_hq_link_guard;

  -- ใบจากใบ HQ: won 1 ใบ · lost 1 ใบ
  perform flowtest.as_dealer(cnx);
  r := quote_request_submit(l1, 'โกดังและคลังสินค้า');
  r2 := quote_request_submit(l2, 'โกดังและคลังสินค้า');
  perform flowtest.as_hq(hq);
  perform hq_quote_save(r.id, ten, current_date + 20);  h := hq_quote_send(r.id);
  perform hq_quote_save(r2.id, ten, current_date + 20); h2 := hq_quote_send(r2.id);
  perform flowtest.as_dealer(cnx);
  select * into q from create_quotation('CNX', 'Q-', jsonb_build_object('customer', 'ZZW HQ won', 'status', 'sent_to_client',
    'date', to_char(current_date, 'DD/MM/YYYY'), 'line_items', '[{"name":"x","qty":1}]'::jsonb, 'hq_quote_id', h.id, 'markup_percent', 50));
  update quotations set status = 'won', customer_id = c1 where id = q.id and dealer_code = 'CNX';
  select * into q2 from create_quotation('CNX', 'Q-', jsonb_build_object('customer', 'ZZW HQ lost', 'status', 'sent_to_client',
    'date', to_char(current_date, 'DD/MM/YYYY'), 'line_items', '[{"name":"x","qty":1}]'::jsonb, 'hq_quote_id', h2.id, 'markup_percent', 50));
  update quotations set status = 'lost', lost_reason = 'ทดสอบ' where id = q2.id and dealer_code = 'CNX';

  -- ══ won ห้ามลบ ══
  perform flowtest.must_fail($q$delete from quotations where id = 'ZZW-OLD-WON' and dealer_code = 'CNX'$q$, 'quote_won_locked', 'ใบเก่าที่ won: ดีลเลอร์ลบไม่ได้');
  perform flowtest.must_fail(format($q$delete from quotations where id = %L and dealer_code = 'CNX'$q$, q.id), 'quote_won_locked', 'ใบจากใบ HQ ที่ won: ดีลเลอร์ลบไม่ได้');
  perform flowtest.must_fail(format('select delete_customer_cascade(%s)', c1), 'quote_won_locked', 'ลบลูกค้าที่มีใบ won ผ่านคำสั่งลบทั้งก้อนไม่ได้ (ใบ won ต้องไม่หายตามไป)');
  perform flowtest.as_root();
  perform flowtest.must_fail($q$delete from quotations where id = 'ZZW-OLD-WON'$q$, 'quote_won_locked', 'ใบเก่าที่ won: สิทธิ์สูงสุดก็ลบไม่ได้');
  perform flowtest.must_fail(format($q$delete from quotations where id = %L$q$, q.id), 'quote_won_locked', 'ใบจากใบ HQ ที่ won: สิทธิ์สูงสุดก็ลบไม่ได้');

  -- ══ lost / หมดอายุ ลบได้เหมือนเดิม ══
  perform flowtest.as_dealer(cnx);
  delete from quotations where id in ('ZZW-OLD-LOST', 'ZZW-OLD-EXP') and dealer_code = 'CNX';
  perform flowtest.ok((select count(*) from quotations where id in ('ZZW-OLD-LOST', 'ZZW-OLD-EXP')) = 0, 'ใบเก่าที่ lost / หมดอายุ ลบได้');
  delete from quotations where id = q2.id and dealer_code = 'CNX';
  perform flowtest.ok((select count(*) from quotations where id = q2.id) = 0, 'ใบจากใบ HQ ที่ lost ลบได้');
  perform flowtest.ok((select count(*) from quotations where id in ('ZZW-OLD-WON', q.id)) = 2, 'ใบ won ยังอยู่ครบ');

  raise notice 'ALL PASS';
end $$;
rollback;
