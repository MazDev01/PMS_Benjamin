-- ── ด่าน 3 · ปิดทางเดิม (ทางอ้อม): ใบเก่าที่ไม่มีใบ HQ ─────────────────────────────────────────────────────────
-- ข้อตัดสินของบอส (14 ต.ค. 69): ใบเก่ายังแก้ได้ แต่ต้องกันทางอ้อมที่ฐานข้อมูล
--   - ใบเก่าที่ไม่มีใบ HQ: ห้ามคัดลอก · ห้ามทำเวอร์ชันใหม่ · ห้ามเปลี่ยนลูกค้าเป้าหมายหรือลูกค้าที่ผูกอยู่
--   - ใบเก่าที่ปิดแล้ว (won / lost / หมดอายุ): ล็อกทั้งใบ
--   ข้อยกเว้นเดียว: ผูกลูกค้าครั้งแรกจากค่าว่าง (คำสั่งปิดการขายผูกใบกำพร้าของบริษัทเดียวกัน — ไม่ใช่การเปลี่ยนลูกค้าที่ผูกอยู่)
-- รัน: docker exec -i <คอนเทนเนอร์ฐานทดสอบ> psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/legacy_quote_lock.sql
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
grant usage on schema flowtest to authenticated;
grant execute on all functions in schema flowtest to authenticated;

do $$
declare
  cnx uuid := (select id from profiles where role = 'DEALER_ADMIN' and dealer_code = 'CNX' limit 1);
  l1 int; l2 int; c1 bigint; c2 bigint; n int;
  li jsonb := '[{"name":"ของเดิม","qty":2,"unit":"ชุด","unitPrice":500}]';
begin
  select num_id into l1 from leads where dealer_code = 'CNX' order by num_id limit 1;
  select num_id into l2 from leads where dealer_code = 'CNX' and num_id <> l1 order by num_id limit 1;
  select id into c1 from customers where dealer_code = 'CNX' order by id limit 1;
  select id into c2 from customers where dealer_code = 'CNX' and id <> c1 order by id limit 1;
  perform flowtest.ok(l1 is not null and l2 is not null and c1 is not null and c2 is not null, 'มีลูกค้าเป้าหมาย 2 ราย และลูกค้า 2 รายของ CNX');

  -- ใบเก่า (ก่อนปิดทางเดิม) — วางตรงโดยปิดตัวดักสร้างใบชั่วคราว
  alter table quotations disable trigger quotations_hq_link_guard;
  insert into quotations (id, dealer_code, customer, line_items, total_value, status, revision, deal_id, customer_id) values
    ('ZZL-OPEN',  'CNX', 'ZZL บริษัทเก่า', li, 1000, 'sent_to_client', 'V1', l1, c1),
    ('ZZL-DRAFT', 'CNX', 'ZZL บริษัทเก่า', li, 1000, 'draft',          'V1', l1, null),
    ('ZZL-WON',   'CNX', 'ZZL บริษัทเก่า', li, 1000, 'won',            'V1', l1, c1),
    ('ZZL-LOST',  'CNX', 'ZZL บริษัทกำพร้า', li, 1000, 'lost',         'V1', null, null),
    ('ZZL-EXP',   'CNX', 'ZZL บริษัทเก่า', li, 1000, 'expired',        'V1', l1, c1);
  alter table quotations enable trigger quotations_hq_link_guard;

  perform set_config('request.jwt.claims', json_build_object('sub', cnx, 'role', 'authenticated',
    'user_role', 'DEALER_ADMIN', 'dealer_code', 'CNX', 'email', 'cnx@test')::text, true);
  perform set_config('role', 'authenticated', true);

  -- ══ ห้ามคัดลอก ══
  perform flowtest.must_fail($q$insert into quotations (id, dealer_code, customer, line_items, total_value, deal_id)
    select 'ZZL-COPY', dealer_code, customer, line_items, total_value, deal_id from quotations where id = 'ZZL-OPEN'$q$,
    'hq_quote_required', 'ใบเก่า: คัดลอกเป็นใบใหม่ตรงที่ตารางไม่ได้');
  perform flowtest.must_fail($q$select create_quotation('CNX', 'Q-', (select to_jsonb(q) - 'id' - 'dealer_code' - 'created_at' from quotations q where id = 'ZZL-OPEN'))$q$,
    'hq_quote_required', 'ใบเก่า: คัดลอกผ่านคำสั่งออกเลขใบ (ทางของปุ่มทำสำเนา) ไม่ได้');

  -- ══ ห้ามทำเวอร์ชันใหม่ ══
  perform flowtest.must_fail($q$update quotations set revision = 'V2' where id = 'ZZL-OPEN' and dealer_code = 'CNX'$q$, 'legacy_quote_locked', 'ใบเก่า: ขึ้นเวอร์ชันใหม่ไม่ได้');

  -- ══ ห้ามเปลี่ยนลูกค้าเป้าหมาย / ลูกค้าที่ผูกอยู่ ══
  perform flowtest.must_fail(format($q$update quotations set deal_id = %s where id = 'ZZL-OPEN' and dealer_code = 'CNX'$q$, l2), 'legacy_quote_locked', 'ใบเก่า: ย้ายไปลูกค้าเป้าหมายรายอื่นไม่ได้');
  perform flowtest.must_fail($q$update quotations set deal_id = null where id = 'ZZL-OPEN' and dealer_code = 'CNX'$q$, 'legacy_quote_locked', 'ใบเก่า: ถอดลูกค้าเป้าหมายออกไม่ได้');
  perform flowtest.must_fail(format($q$update quotations set customer_id = %s where id = 'ZZL-OPEN' and dealer_code = 'CNX'$q$, c2), 'legacy_quote_locked', 'ใบเก่า: เปลี่ยนลูกค้าที่ผูกอยู่ไม่ได้');
  perform flowtest.must_fail($q$update quotations set customer_id = null where id = 'ZZL-OPEN' and dealer_code = 'CNX'$q$, 'legacy_quote_locked', 'ใบเก่า: ถอดลูกค้าที่ผูกอยู่ออกไม่ได้');

  -- ══ ใบเก่าที่ส่งลูกค้าแล้ว: แก้รายการ/ยอดไม่ได้แล้ว (ใบ 0226 · รอบ 3 บอสสั่ง 20 ต.ค. 69 "ส่งลูกค้าแล้วล็อกทั้งหมด") · หมายเหตุยังแก้ได้ ══
  perform flowtest.must_fail($q$update quotations set line_items = '[{"name":"ของเดิม","qty":3,"unit":"ชุด","unitPrice":500}]', total_value = 1500
   where id = 'ZZL-OPEN' and dealer_code = 'CNX'$q$, 'quote_sent_locked', 'ใบเก่าที่ส่งแล้ว: แก้รายการ/ยอดไม่ได้ (0226)');
  update quotations set note = 'แก้หมายเหตุ' where id = 'ZZL-OPEN' and dealer_code = 'CNX';
  perform flowtest.ok((select note from quotations where id = 'ZZL-OPEN') = 'แก้หมายเหตุ', 'ใบเก่าที่ยังไม่ปิด: แก้หมายเหตุได้');
  update quotations set status = 'sent_to_client' where id = 'ZZL-DRAFT' and dealer_code = 'CNX';
  perform flowtest.ok((select status from quotations where id = 'ZZL-DRAFT') = 'sent_to_client', 'ใบเก่าที่ยังไม่ปิด: ส่งให้ลูกค้าได้');

  -- ══ ใบเก่าที่ปิดแล้ว: ล็อกทั้งใบ ══
  perform flowtest.must_fail($q$update quotations set note = 'x' where id = 'ZZL-WON' and dealer_code = 'CNX'$q$, 'legacy_quote_locked', 'ใบเก่าที่ตอบรับแล้ว: แก้หมายเหตุก็ไม่ได้');
  perform flowtest.must_fail($q$update quotations set status = 'sent_to_client' where id = 'ZZL-WON' and dealer_code = 'CNX'$q$, 'quote_won_locked', 'ใบเก่าที่ตอบรับแล้ว: เปลี่ยนสถานะไม่ได้ (ย้อนได้เฉพาะ HQ · 0204)');
  perform flowtest.must_fail($q$update quotations set total_value = 1, line_items = '[{"name":"x","qty":1,"unit":"ชุด","unitPrice":1}]' where id = 'ZZL-LOST' and dealer_code = 'CNX'$q$, 'legacy_quote_locked', 'ใบเก่าที่ลูกค้าปฏิเสธ: แก้ราคาไม่ได้');
  perform flowtest.must_fail($q$update quotations set status = 'draft' where id = 'ZZL-EXP' and dealer_code = 'CNX'$q$, 'legacy_quote_locked', 'ใบเก่าที่หมดอายุ: เปิดกลับมาใช้ไม่ได้');
  perform flowtest.must_fail($q$update quotations set expiry = '2099-01-01' where id = 'ZZL-EXP' and dealer_code = 'CNX'$q$, 'legacy_quote_locked', 'ใบเก่าที่หมดอายุ: ต่ออายุไม่ได้');

  -- ══ ข้อยกเว้น: ผูกลูกค้าครั้งแรกจากค่าว่าง (คำสั่งปิดการขายผูกใบกำพร้าของบริษัทเดียวกัน) ══
  select count(*) into n from relink_customer_quotes('CNX', c2, 'ZZL บริษัทกำพร้า', false);
  perform flowtest.ok(n = 1 and (select customer_id from quotations where id = 'ZZL-LOST') = c2 and (select status from quotations where id = 'ZZL-LOST') = 'lost',
    'ข้อยกเว้น: ใบเก่าที่ปิดแล้วและยังไม่ผูกลูกค้า ผูกลูกค้าครั้งแรกได้ (สถานะ/ราคาไม่เปลี่ยน)');
  perform flowtest.must_fail(format($q$update quotations set customer_id = %s where id = 'ZZL-LOST' and dealer_code = 'CNX'$q$, c1), 'legacy_quote_locked', 'ผูกแล้วเปลี่ยนเป็นลูกค้ารายอื่นไม่ได้');

  raise notice 'ALL PASS';
end $$;
rollback;
