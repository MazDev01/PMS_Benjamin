-- ── ทดสอบโครง Flow ใหม่ ระยะ 2 (0186) บนฐานในเครื่อง ─────────────────────────────────
-- รัน: docker exec -i supabase_db_Benjamin-HQ-main psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/flow_phase2.sql
-- ทุกอย่างอยู่ในทรานแซกชันเดียวแล้ว rollback ท้ายไฟล์ — ไม่ทิ้งข้อมูลไว้ในฐาน
-- ผ่าน = บรรทัดสุดท้ายขึ้น "ALL PASS" · ตกข้อไหนหยุดที่ข้อนั้นพร้อมข้อความ
begin;

create schema flowtest;
create table flowtest.t_ctx as
select
  (select id from profiles where role = 'DEALER_ADMIN' and dealer_code = 'CNX' limit 1) as cnx_uid,
  (select id from profiles where role = 'DEALER_ADMIN' and dealer_code = 'RYG' limit 1) as ryg_uid,
  (select id from profiles where role = 'SUPER_ADMIN' limit 1)                          as hq_uid,
  (select array_agg(num_id order by num_id) from (
     select num_id from leads where dealer_code = 'CNX' and status in ('WAITING','BULLET') order by num_id limit 2) x) as lead_ids,
  (select id from customers where dealer_code = 'CNX' order by id limit 1)              as cust_id;
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
/** คำสั่งนี้ต้องถูกปฏิเสธ และข้อความต้องมีคำที่คาดไว้ */
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
  c record; l1 int; l2 int; r quote_requests; r2 quote_requests; h hq_quotes; q quotations; n int; s text; t text;
  lines jsonb := '[{"name":"โครงเหล็ก","qty":100,"unit":"ตร.ม.","unitCost":2500},{"name":"หลังคา","qty":100,"unit":"ตร.ม.","unitCost":450.5}]';
begin
  select * into c from flowtest.t_ctx; l1 := c.lead_ids[1]; l2 := c.lead_ids[2];

  -- เตรียม: CNX ขอราคา → HQ ส่งใบ HQ (ต้นทุนรวม 295,050 · ยืนราคา 10 วัน)
  perform flowtest.as_dealer('CNX', c.cnx_uid);
  r := quote_request_submit(l1, 'โกดังและคลังสินค้า');
  perform flowtest.as_hq(c.hq_uid);
  perform hq_quote_save(r.id, lines, current_date + 10); h := hq_quote_send(r.id);

  -- ══ ก. ใบลูกค้าตรงกับใบ HQ · ราคา = ต้นทุน × (1 + %) ══
  perform flowtest.as_dealer('CNX', c.cnx_uid);
  insert into quotations (id, dealer_code, customer, hq_quote_id, markup_percent, line_items, total_value, expiry)
  values ('T2-CNX-1', 'CNX', 'ทดสอบระยะ 2', h.id, 20,
          '[{"name":"ของปลอม","qty":1,"unit":"ชุด","unitPrice":1},{"name":"x","qty":9,"unitPrice":9,"markupPct":10},{"name":"เกินมา","qty":5,"unitPrice":5}]'::jsonb,
          999, to_char(current_date + 60, 'YYYY-MM-DD'))
  returning * into q;
  perform flowtest.ok(jsonb_array_length(q.line_items) = 2
                      and q.line_items -> 0 ->> 'name' = 'โครงเหล็ก' and (q.line_items -> 0 ->> 'qty')::numeric = 100
                      and q.line_items -> 1 ->> 'name' = 'หลังคา',
                     'รายการและจำนวนในใบลูกค้ามาจากใบ HQ เสมอ — ชื่อ/จำนวน/บรรทัดเกินที่หน้าจอส่งมาไม่มีผล');
  perform flowtest.ok((q.line_items -> 0 ->> 'unitPrice')::numeric = 3000 and (q.line_items -> 0 ->> 'markupPct')::numeric = 20,
                     'บรรทัดที่ไม่ใส่ % ใช้ % ทั้งใบ: 2,500 × 1.20 = 3,000');
  perform flowtest.ok((q.line_items -> 1 ->> 'unitPrice')::numeric = 495.55 and (q.line_items -> 1 ->> 'markupPct')::numeric = 10,
                     'บรรทัดที่ใส่ % เอง ใช้ % ของบรรทัด: 450.50 × 1.10 = 495.55');
  perform flowtest.ok(q.total_value = 349555 and q.material_cost = 295050,
                     'ยอดรวมคิดจากรายการ (349,555) ไม่ใช่ยอดที่ส่งมา · ต้นทุนรวมตามใบ HQ (295,050)');
  perform flowtest.ok(q.line_items::text not like '%unitCost%', 'ในใบของดีลเลอร์ไม่มีต้นทุนต่อหน่วย');
  perform flowtest.ok(q.expiry = to_char(current_date + 10, 'YYYY-MM-DD'), 'อายุใบลูกค้าที่ใส่เกิน ถูกตัดให้เท่าวันยืนราคาของใบ HQ');
  perform flowtest.must_fail('update quotations set markup_percent = -1 where dealer_code = ''CNX'' and id = ''T2-CNX-1''', 'markup_negative', '% ทั้งใบติดลบไม่ได้');
  perform flowtest.must_fail('update quotations set line_items = ''[{"markupPct":-5}]''::jsonb where dealer_code = ''CNX'' and id = ''T2-CNX-1''', 'markup_negative', '% รายบรรทัดติดลบไม่ได้');
  update quotations set line_items = '[{"markupPct":0},{"markupPct":0}]'::jsonb where dealer_code = 'CNX' and id = 'T2-CNX-1' returning * into q;
  perform flowtest.ok(q.total_value = 295050, '% เป็น 0 ได้ (ขายเท่าต้นทุน) · ยอดรวมเท่าต้นทุน');
  update quotations set expiry = to_char(current_date + 3, 'YYYY-MM-DD') where dealer_code = 'CNX' and id = 'T2-CNX-1' returning * into q;
  perform flowtest.ok(q.expiry = to_char(current_date + 3, 'YYYY-MM-DD'), 'อายุใบลูกค้าสั้นกว่าใบ HQ ได้');

  -- เป้าดีลเลอร์วัดจากยอดซื้อจาก HQ: บวก % ต่างกัน ยอดซื้อจาก HQ (ต้นทุนรวม) ต้องเท่ากัน
  insert into quotations (id, dealer_code, customer, hq_quote_id, markup_percent) values ('T2-CNX-1B', 'CNX', 'ทดสอบระยะ 2', h.id, 55) returning * into q;
  perform flowtest.ok(q.material_cost = 295050 and q.total_value > 349555, 'บวก % สูงขึ้น ยอดขายลูกค้าเพิ่ม แต่ยอดซื้อจาก HQ เท่าเดิม');
  delete from quotations where dealer_code = 'CNX' and id = 'T2-CNX-1B';

  -- ══ ข. ใบ HQ หมดอายุ → ส่งให้ลูกค้า/ปิดการขายไม่ได้ ══
  perform flowtest.as_root();
  alter table hq_quotes disable trigger hq_quotes_lock_sent;   -- จำลองเวลาผ่านไป (ใบที่ส่งแล้วแก้วันไม่ได้ตามกฎ)
  update hq_quotes set valid_until = current_date - 1 where id = h.id;
  alter table hq_quotes enable trigger hq_quotes_lock_sent;
  perform flowtest.as_dealer('CNX', c.cnx_uid);
  perform flowtest.must_fail('update quotations set status = ''sent_to_client'' where dealer_code = ''CNX'' and id = ''T2-CNX-1''', 'hq_quote_expired', 'ใบ HQ หมดอายุ → ส่งใบให้ลูกค้าไม่ได้');
  perform flowtest.must_fail('update quotations set status = ''won'', customer_id = ' || c.cust_id || ' where dealer_code = ''CNX'' and id = ''T2-CNX-1''', 'hq_quote_expired', 'ใบ HQ หมดอายุ → ปิดการขายไม่ได้');
  select * into r from quote_requests where id = r.id;
  perform flowtest.ok(r.status = 'quoted', 'คำขอยังเปิดอยู่ ให้ดีลเลอร์ขอแก้ราคาเพื่อรับใบใหม่ได้');

  -- ══ ค. ใบแบบเดิม (ไม่ผูกใบ HQ): สร้างใหม่ไม่ได้แล้ว (ด่าน 3 · 0201) · ใบเดิมที่มีอยู่ไม่ถูกแตะ ══
  perform flowtest.must_fail($q$insert into quotations (id, dealer_code, customer, line_items, total_value)
    values ('T2-CNX-NEW', 'CNX', 'ใบแบบเดิม', '[{"name":"ของเดิม","qty":2,"unit":"ชุด","unitPrice":500}]'::jsonb, 1000)$q$,
    'hq_quote_required', 'ใบที่ไม่ผูกใบ HQ สร้างใหม่ไม่ได้ (ปิดทางเดิม)');
  perform flowtest.as_root();
  alter table quotations disable trigger quotations_hq_link_guard;   -- จำลองใบเก่าที่มีอยู่ก่อนปิดทางเดิม
  insert into quotations (id, dealer_code, customer, line_items, total_value)
  values ('T2-CNX-OLD', 'CNX', 'ใบแบบเดิม', '[{"name":"ของเดิม","qty":2,"unit":"ชุด","unitPrice":500}]'::jsonb, 1000);
  alter table quotations enable trigger quotations_hq_link_guard;
  perform flowtest.as_dealer('CNX', c.cnx_uid);
  update quotations set line_items = '[{"name":"ของเดิม","qty":3,"unit":"ชุด","unitPrice":500}]'::jsonb, total_value = 1500
   where dealer_code = 'CNX' and id = 'T2-CNX-OLD' returning * into q;
  perform flowtest.ok(q.line_items -> 0 ->> 'name' = 'ของเดิม' and q.total_value = 1500 and q.material_cost = 0, 'ใบเดิมที่ไม่ผูกใบ HQ ยังแก้ได้แบบเดิม (ไม่ถูกคิดราคาใหม่)');

  -- ══ ง. ราคาแม่แบบ: สวิตช์ HQ เห็นคนเดียว ══
  select count(*) into n from master_catalog;
  perform flowtest.ok(n > 0, 'สวิตช์ปิด (ค่าตั้งต้น): ดีลเลอร์ยังอ่านแม่แบบพร้อมราคาได้แบบเดิม');
  perform flowtest.as_root(); update hq_policy set hide_catalog_price = true;
  perform flowtest.as_dealer('CNX', c.cnx_uid);
  select count(*) into n from master_catalog;
  perform flowtest.ok(n = 0, 'สวิตช์เปิด: ดีลเลอร์อ่านตารางราคาแม่แบบไม่ได้เลย');
  select count(*) into n from master_catalog_public;
  perform flowtest.ok(n > 0, 'สวิตช์เปิด: ดีลเลอร์ยังเห็นแม่แบบ (รูป สเปก แบบ) ผ่านมุมมองที่ไม่มีราคา');
  select count(*) into n from information_schema.columns where table_schema = 'public' and table_name = 'master_catalog_public'
     and column_name in ('price', 'subtype_prices', 'price_history');
  perform flowtest.ok(n = 0, 'มุมมองของดีลเลอร์ไม่มีคอลัมน์ราคา / ราคาแม่แบบย่อย / ประวัติราคา');
  perform flowtest.as_hq(c.hq_uid);
  select count(*) into n from master_catalog;
  perform flowtest.ok(n > 0, 'สวิตช์เปิด: HQ ยังเห็นราคาแม่แบบครบ');
  perform flowtest.as_root(); update hq_policy set hide_catalog_price = false;

  -- ══ จ. ลูกค้าเป้าหมาย: เบอร์/จังหวัดบังคับ · กันซ้ำในดีลเลอร์เดียวกัน ══
  perform flowtest.as_dealer('CNX', c.cnx_uid);
  perform flowtest.must_fail('insert into leads (id, dealer_code, num_id, name, company, phone, province) values (''#T2-1'', ''CNX'', 880000001, ''ก'', ''บจ. ทดสอบซ้ำ'', '''', ''เชียงใหม่'')', 'lead_phone_required', 'ลูกค้าเป้าหมายใหม่ไม่มีเบอร์โทร สร้างไม่ได้');
  perform flowtest.must_fail('insert into leads (id, dealer_code, num_id, name, company, phone, province) values (''#T2-1'', ''CNX'', 880000001, ''ก'', ''บจ. ทดสอบซ้ำ'', ''081-234-5678'', '' '')', 'lead_province_required', 'ลูกค้าเป้าหมายใหม่ไม่มีจังหวัด สร้างไม่ได้');
  insert into leads (id, dealer_code, num_id, name, company, phone, province) values ('#T2-1', 'CNX', 880000001, 'ก', 'บจ. ทดสอบซ้ำ', '081-234-5678', 'เชียงใหม่');
  perform flowtest.must_fail('insert into leads (id, dealer_code, num_id, name, company, phone, province) values (''#T2-2'', ''CNX'', 880000002, ''ก'', ''  บจ.  ทดสอบซ้ำ '', ''0812345678'', ''เชียงใหม่'')', 'lead_duplicate', 'ชื่อ + เบอร์ซ้ำ (ต่างแค่ช่องว่าง/ขีด) กับรายที่เปิดอยู่ สร้างไม่ได้');
  insert into leads (id, dealer_code, num_id, name, company, phone, province) values ('#T2-3', 'CNX', 880000003, 'ก', 'บจ. ทดสอบซ้ำ', '089-999-9999', 'เชียงใหม่');
  perform flowtest.ok(true, 'ชื่อเดียวกันแต่เบอร์ต่าง สร้างได้');
  insert into leads (id, dealer_code, num_id, name, company, phone, province, customer_id) values ('#T2-4', 'CNX', 880000004, 'ก', 'บจ. ทดสอบซ้ำ', '081-234-5678', 'เชียงใหม่', c.cust_id);
  perform flowtest.ok(true, 'ลูกค้าเดิม (เพิ่มงานขายใหม่จากหน้าลูกค้า) ไม่นับว่าซ้ำ');
  insert into leads (id, dealer_code, num_id, name, company, phone, province, customer_id) values ('#T2-4B', 'CNX', 880000014, 'ก', 'บจ. ลูกค้าเก่าไม่มีเบอร์', '', '', c.cust_id);
  perform flowtest.ok(true, 'งานขายใหม่ของลูกค้าเดิมที่ไม่มีเบอร์/จังหวัดในระบบ ยังเพิ่มได้');
  -- ข้อยกเว้นลูกค้าเดิมใช้ได้เฉพาะลูกค้าจริงของดีลเลอร์เดียวกัน (FK leads_customer_fk: dealer_code + customer_id)
  perform flowtest.must_fail('insert into leads (id, dealer_code, num_id, name, company, phone, province, customer_id) values (''#T2-X1'', ''CNX'', 880000021, ''ก'', ''บจ. อ้างลูกค้ามั่ว'', '''', '''', 2000000001)', 'leads_customer_fk', 'อ้าง customer_id ที่ไม่มีอยู่ + ไม่มีเบอร์ → ถูกปฏิเสธ');
  perform flowtest.as_root();   -- ดีลเลอร์มองไม่เห็นลูกค้าของสาขาอื่น ต้องหาเลขด้วยสิทธิ์ผู้ดูแล
  select id into n from customers where dealer_code = 'RYG' and id not in (select id from customers where dealer_code = 'CNX') limit 1;
  perform flowtest.as_dealer('CNX', c.cnx_uid);
  perform flowtest.ok(n is not null, 'มีลูกค้าของ RYG ที่เลขไม่ชนกับ CNX ให้ใช้ทดสอบ');
  perform flowtest.must_fail(format('insert into leads (id, dealer_code, num_id, name, company, phone, province, customer_id) values (''#T2-X2'', ''CNX'', 880000022, ''ก'', ''บจ. อ้างลูกค้าสาขาอื่น'', '''', '''', %s)', n), 'leads_customer_fk', 'อ้าง customer_id ของดีลเลอร์อื่น + ไม่มีเบอร์ → ถูกปฏิเสธ');
  perform flowtest.must_fail('update leads set phone = ''081 234 5678'' where dealer_code = ''CNX'' and id = ''#T2-3''', 'lead_duplicate', 'แก้เบอร์ให้ไปชนกับรายที่เปิดอยู่ไม่ได้');
  perform flowtest.as_dealer('RYG', c.ryg_uid);
  insert into leads (id, dealer_code, num_id, name, company, phone, province) values ('#T2-R', 'RYG', 880000009, 'ก', 'บจ. ทดสอบซ้ำ', '081-234-5678', 'ระยอง');
  perform flowtest.ok(true, 'ดีลเลอร์คนละรายมีงานชื่อ + เบอร์เดียวกันได้ (พื้นที่ทับกันได้)');
  perform flowtest.as_dealer('CNX', c.cnx_uid);
  update leads set status = 'CANCELLED' where dealer_code = 'CNX' and id = '#T2-1';
  insert into leads (id, dealer_code, num_id, name, company, phone, province) values ('#T2-5', 'CNX', 880000005, 'ก', 'บจ. ทดสอบซ้ำ', '081-234-5678', 'เชียงใหม่');
  perform flowtest.ok(true, 'รายเดิมปิดไปแล้ว สร้างรายใหม่ชื่อ + เบอร์เดิมได้');
  perform flowtest.must_fail('update leads set status = ''WAITING'' where dealer_code = ''CNX'' and id = ''#T2-1''', 'lead_duplicate', 'เปิดรายที่ปิดแล้วกลับมาชนกับรายที่เปิดอยู่ไม่ได้');
  -- รอบ 4 (ใบ 0232): ไม่ชนรายอื่นก็เปิดกลับไม่ได้ — ดีลเลอร์ไม่มี "เปิดใหม่" แล้ว (ทดสอบใน lead_one_path.sql)
  perform flowtest.as_root();
  update leads set phone = '' where dealer_code = 'CNX' and id = '#T2-3';
  perform flowtest.as_dealer('CNX', c.cnx_uid);
  update leads set note = 'แก้รายเก่าที่ไม่มีเบอร์' where dealer_code = 'CNX' and id = '#T2-3';
  perform flowtest.ok(found, 'รายเดิมที่ไม่มีเบอร์โทร (ข้อมูลเก่า) ยังแก้ได้ (เลื่อนขั้นเองไม่ได้แล้ว · ใบ 0232)');

  -- ══ ฉ. งานซ้ำข้ามดีลเลอร์ → HQ เห็น และใช้ BOQ เดิมได้ ══
  r := quote_request_submit(880000005, 'โรงงาน');
  perform flowtest.as_hq(c.hq_uid);
  perform hq_quote_save(r.id, lines, current_date + 20); h := hq_quote_send(r.id);
  perform flowtest.as_dealer('RYG', c.ryg_uid);
  r2 := quote_request_submit(880000009, 'โรงงาน');
  perform flowtest.must_fail(format('select * from quote_request_duplicates(%s)', r2.id), 'forbidden', 'ดีลเลอร์ดูรายการงานซ้ำข้ามดีลเลอร์ไม่ได้');
  perform flowtest.as_hq(c.hq_uid);
  select count(*), min(d.dealer_code), min(d.hq_quote_no) into n, s, t from quote_request_duplicates(r2.id) d;
  perform flowtest.ok(n = 1 and s = 'CNX' and t = h.quote_no, 'HQ เห็นว่าคำขอของ RYG ซ้ำกับงานที่ CNX ยื่นก่อน พร้อมเลขใบ HQ เดิม');
  h := hq_quote_copy_from(r2.id, h.id);
  perform flowtest.ok(h.status = 'draft' and h.total_cost = 295050 and h.request_id = r2.id, 'ใช้ BOQ เดิม → ได้ร่างใบ HQ ราคาเดียวกันสำหรับ RYG');
  raise notice 'ALL PASS';
end $$;

rollback;
