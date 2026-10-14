-- ── ด่าน 3: ใบที่ won — ดีลเลอร์เปลี่ยนสถานะไม่ได้ · ย้อนได้เฉพาะ HQ และต้องลงไทม์ไลน์ว่าใครย้อน เมื่อไร ───────────
-- ข้อตัดสินของบอส 14 ต.ค. 69: กันทางอ้อมของกฎห้ามลบใบ won (ย้อน won → ไม่สำเร็จ แล้วลบ)
--   ทั้งใบเก่าและใบจากใบ HQ · ย้อนผ่านคำสั่ง quotation_revert_won() ของ HQ เท่านั้น (ต้องมีเหตุผล)
--   ย้ายข้อมูลดีลเลอร์ (move) ยังย้ายลูกค้าที่มีใบ won ได้ — เป็นการย้าย ไม่ใช่การลบหรือย้อนสถานะ
-- รัน: docker exec -i <คอนเทนเนอร์ฐานทดสอบ> psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/won_revert_hq_only.sql
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
  hq_name text;
  l1 int; c1 bigint; r quote_requests; h hq_quotes; q quotations; acts jsonb; n int; tot numeric;
  li jsonb := '[{"name":"ของเดิม","qty":1,"unit":"ชุด","unitPrice":1000}]';
  ten jsonb := '[{"name":"โครงเหล็ก","qty":1,"unit":"ชุด","unitCost":10}]';
begin
  select coalesce(nullif(btrim(name), ''), 'สำนักงานใหญ่') into hq_name from profiles where id = hq;
  select num_id into l1 from leads where dealer_code = 'CNX' and status in ('WAITING','BULLET') order by num_id limit 1;
  select id into c1 from customers where dealer_code = 'CNX' order by id limit 1;
  perform flowtest.ok(cnx is not null and hq is not null and l1 is not null and c1 is not null, 'มีข้อมูลตั้งต้นครบ');

  -- ใบเก่า won (ผูกลูกค้าเป้าหมาย l1 · ลูกค้า c1)
  alter table quotations disable trigger quotations_hq_link_guard;
  insert into quotations (id, dealer_code, customer, line_items, total_value, status, customer_id, deal_id)
  values ('ZZR-OLD-WON', 'CNX', 'ZZR เก่า', li, 1000, 'won', c1, l1);
  alter table quotations enable trigger quotations_hq_link_guard;

  -- ใบจากใบ HQ ที่ won
  perform flowtest.as_dealer(cnx);
  r := quote_request_submit(l1, 'โกดังและคลังสินค้า');
  perform flowtest.as_hq(hq);
  perform hq_quote_save(r.id, ten, current_date + 20); h := hq_quote_send(r.id);
  perform flowtest.as_dealer(cnx);
  select * into q from create_quotation('CNX', 'Q-', jsonb_build_object('customer', 'ZZR HQ won', 'status', 'sent_to_client',
    'date', to_char(current_date, 'DD/MM/YYYY'), 'line_items', '[{"name":"x","qty":1}]'::jsonb, 'hq_quote_id', h.id, 'markup_percent', 50));
  update quotations set status = 'won', customer_id = c1 where id = q.id and dealer_code = 'CNX';

  -- ══ ดีลเลอร์เปลี่ยนสถานะใบ won ไม่ได้ ══
  perform flowtest.must_fail($q$update quotations set status = 'lost', lost_reason = 'x' where id = 'ZZR-OLD-WON' and dealer_code = 'CNX'$q$, 'quote_won_locked', 'ใบเก่าที่ won: ดีลเลอร์ย้อนเป็นไม่สำเร็จไม่ได้');
  perform flowtest.must_fail(format($q$update quotations set status = 'lost', lost_reason = 'x' where id = %L and dealer_code = 'CNX'$q$, q.id), 'quote_won_locked', 'ใบจากใบ HQ ที่ won: ดีลเลอร์ย้อนเป็นไม่สำเร็จไม่ได้');
  perform flowtest.must_fail(format($q$update quotations set status = 'sent_to_client' where id = %L and dealer_code = 'CNX'$q$, q.id), 'quote_won_locked', 'ใบจากใบ HQ ที่ won: ดีลเลอร์ย้อนเป็นส่งแล้วไม่ได้');
  perform flowtest.must_fail(format($q$select quotation_revert_won('CNX', %L, 'ลูกค้ายกเลิก')$q$, q.id), 'forbidden', 'ดีลเลอร์เรียกคำสั่งย้อนของ HQ ไม่ได้');
  perform flowtest.as_root();
  perform flowtest.must_fail(format($q$update quotations set status = 'lost' where id = %L$q$, q.id), 'quote_won_locked', 'แก้ตรงที่ตาราง (สิทธิ์สูงสุด) ไม่ผ่านคำสั่งของ HQ ก็ย้อนไม่ได้');

  -- ══ HQ ย้อนได้ · ต้องมีเหตุผล · ลงไทม์ไลน์ว่าใคร เมื่อไร ══
  perform flowtest.as_hq(hq);
  perform flowtest.must_fail(format($q$select quotation_revert_won('CNX', %L, '  ')$q$, q.id), 'reason_required', 'HQ ย้อนต้องระบุเหตุผล');
  perform quotation_revert_won('CNX', q.id, 'ลูกค้ายกเลิกสัญญา');
  perform flowtest.as_root();
  perform flowtest.ok((select status from quotations where id = q.id) = 'sent_to_client', 'HQ ย้อนใบจากใบ HQ: won → ส่งแล้ว');
  perform flowtest.ok((select status from hq_quotes where id = h.id) = 'sent' and (select status from quote_requests where id = r.id) = 'quoted',
    'ย้อนแล้วใบ HQ กลับเป็นส่งแล้ว · คำขอกลับมาเปิด (ไม่นับยอดขาย HQ)');
  select activities into acts from leads where dealer_code = 'CNX' and num_id = l1;
  perform flowtest.ok(exists (select 1 from jsonb_array_elements(acts) a
                               where a ->> 'text' like '%ย้อนการตอบรับ%' || q.id || '%' and a ->> 'text' like '%' || hq_name || '%'
                                 and a ->> 'text' like '%ลูกค้ายกเลิกสัญญา%' and (a ->> 'date') ~ '\d{1,2} \S+ \d{4} · \d{2}:\d{2}'),
    'ไทม์ไลน์ของลูกค้าเป้าหมายบอกว่าใคร (' || hq_name || ') ย้อนใบไหน เมื่อไร และเพราะอะไร');
  select count(*) into n from audit_log where action like '%ย้อนการตอบรับ%' and target like '%' || q.id || '%' and at > now() - interval '1 minute';
  perform flowtest.ok(n = 1, 'บันทึกการใช้งานของ HQ มีรายการย้อน 1 รายการ');

  perform flowtest.as_hq(hq);
  perform quotation_revert_won('CNX', 'ZZR-OLD-WON', 'ข้อมูลเก่าผิด', 'lost');
  perform flowtest.must_fail($q$select quotation_revert_won('CNX', 'ZZR-OLD-WON', 'ซ้ำ')$q$, 'not_won', 'ย้อนใบที่ไม่ได้ won อยู่ไม่ได้');
  perform flowtest.as_root();
  perform flowtest.ok((select status from quotations where id = 'ZZR-OLD-WON') = 'lost'
                  and (select lost_reason from quotations where id = 'ZZR-OLD-WON') = 'ข้อมูลเก่าผิด', 'HQ ย้อนใบเก่า: won → ไม่สำเร็จ (พร้อมเหตุผล)');

  -- ══ ย้ายข้อมูลดีลเลอร์: ลูกค้าที่มีใบ won ย้ายได้ (ย้าย ไม่ใช่ลบ/ย้อน) ══
  insert into dealers (code, name, province, region, status) values ('ZZM1', 'ZZ ย้ายต้นทาง', 'ระยอง', 'ตะวันออก', 'active'), ('ZZM2', 'ZZ ย้ายปลายทาง', 'ระยอง', 'ตะวันออก', 'active');
  insert into customers (id, dealer_code, company, name) values (990901, 'ZZM1', 'ZZM ลูกค้ามีใบ won', 'ZZM ลูกค้ามีใบ won');
  alter table quotations disable trigger quotations_hq_link_guard;
  insert into quotations (id, dealer_code, customer, line_items, total_value, status, customer_id)
  values ('ZZM-Q-WON', 'ZZM1', 'ZZM ลูกค้ามีใบ won', li, 1000, 'won', 990901);
  alter table quotations enable trigger quotations_hq_link_guard;
  select total_value into tot from customers where dealer_code = 'ZZM1' and id = 990901;
  perform move_dealer_data_atomic('ZZM1', 'ZZM2');
  perform flowtest.ok((select dealer_code || '/' || status from quotations where id = 'ZZM-Q-WON') = 'ZZM2/won',
    'ย้ายข้อมูลดีลเลอร์: ใบ won ย้ายไปสาขาปลายทาง สถานะคงเป็น won');
  perform flowtest.ok((select total_value from customers where dealer_code = 'ZZM2' and id = 990901) = tot,
    'ย้ายข้อมูลดีลเลอร์: ลูกค้าที่มีใบ won ย้ายครบ ยอดสะสมไม่หาย (' || tot || ')');

  raise notice 'ALL PASS';
end $$;
rollback;
