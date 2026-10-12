-- ── ทดสอบโครง Flow ใหม่ ระยะ 1 (0182–0183) บนฐานในเครื่อง ─────────────────────────────────
-- รัน: docker exec -i supabase_db_Benjamin-HQ-main psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/flow_phase1.sql
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
  c record; l1 int; l2 int; r quote_requests; r2 quote_requests; h hq_quotes; n int; n_lost int; s text; t text;
  lines jsonb := '[{"name":"โครงเหล็ก","qty":100,"unit":"ตร.ม.","unitCost":2500},{"name":"หลังคา","qty":100,"unit":"ตร.ม.","unitCost":450.5}]';
begin
  select * into c from flowtest.t_ctx; l1 := c.lead_ids[1]; l2 := c.lead_ids[2];
  perform flowtest.ok(c.cnx_uid is not null and c.ryg_uid is not null and c.hq_uid is not null and l2 is not null and c.cust_id is not null,
                     'ข้อมูลตั้งต้นครบ (บัญชี CNX/RYG/HQ · ลูกค้าเป้าหมาย 2 ราย · ลูกค้า 1 ราย)');

  -- ══ ก. ดีลเลอร์ส่งคำขอ ══
  perform flowtest.as_hq(c.hq_uid);
  perform flowtest.must_fail(format('select quote_request_submit(%s, ''โกดัง'')', l1), 'forbidden', 'HQ ส่งคำขอแทนดีลเลอร์ไม่ได้');
  perform flowtest.as_dealer('RYG', c.ryg_uid);
  perform flowtest.must_fail(format('select quote_request_submit(%s, ''โกดัง'')', l1), 'lead_not_found', 'ดีลเลอร์อื่นส่งคำขอบนลูกค้าเป้าหมายของ CNX ไม่ได้');
  perform flowtest.as_dealer('CNX', c.cnx_uid);
  perform flowtest.must_fail(format('select quote_request_submit(%s, '' '')', l1), 'product_required', 'ไม่เลือกแม่แบบ ส่งคำขอไม่ได้');
  r := quote_request_submit(l1, 'โกดังและคลังสินค้า', '', 100, 'สูง 8 ม.');
  perform flowtest.ok(r.status = 'new' and r.request_no like 'RQ-%' and r.root_id = r.id, 'ส่งคำขอ → สถานะ ใหม่ มีเลขที่');
  perform flowtest.ok(r.due_at::date = (r.submitted_at + interval '14 days')::date, 'กำหนดส่งใบ = 14 วันนับจากวันส่งคำขอ');
  select status::text into s from leads where dealer_code = 'CNX' and num_id = l1;
  perform flowtest.ok(s = 'HQ_PRICING', 'ลูกค้าเป้าหมาย → รอราคา HQ เอง');
  perform flowtest.must_fail(format('select quote_request_submit(%s, ''โกดัง'')', l1), 'lead_stage', 'ส่งคำขอซ้ำบนรายเดิมไม่ได้');
  perform flowtest.must_fail(format('update leads set status = ''QUOTED'' where dealer_code = ''CNX'' and num_id = %s', l1), 'hq_pricing_locked', 'ดีลเลอร์เปลี่ยนสถานะออกจาก รอราคา HQ เองไม่ได้');
  perform flowtest.must_fail(format('update leads set status = ''HQ_PRICING'' where dealer_code = ''CNX'' and num_id = %s', l2), 'hq_pricing_locked', 'ดีลเลอร์ตั้ง รอราคา HQ เองไม่ได้');
  update leads set note = 'แก้โน้ตระหว่างรอราคา' where dealer_code = 'CNX' and num_id = l1;
  perform flowtest.ok(found, 'ระหว่างรอราคา ดีลเลอร์ยังแก้ข้อมูลอื่นของลูกค้าเป้าหมายได้');
  perform flowtest.must_fail(format('update quote_requests set status = ''quoted'' where id = %s; select 1/(select count(*) from quote_requests where id = %s and status = ''quoted'')', r.id, r.id), '', 'ดีลเลอร์เขียนตารางคำขอตรง ๆ ไม่ได้');

  -- ══ ข. การมองเห็น ══
  perform flowtest.as_dealer('RYG', c.ryg_uid);
  select count(*) into n from quote_requests where id = r.id;
  perform flowtest.ok(n = 0, 'ดีลเลอร์อื่นมองไม่เห็นคำขอของ CNX');
  perform flowtest.must_fail(format('select hq_quote_save(%s, ''[]''::jsonb)', r.id), 'forbidden', 'ดีลเลอร์ทำใบ HQ ไม่ได้');

  -- ══ ค. HQ ทำราคา ══
  perform flowtest.as_hq(c.hq_uid);
  perform flowtest.must_fail(format('select hq_quote_send(%s)', r.id), 'request_stage', 'ยังไม่รับเรื่อง ส่งใบไม่ได้');
  perform flowtest.must_fail(format('select hq_quote_save(%s, ''[{"name":"x","qty":0,"unitCost":1}]''::jsonb)', r.id), 'lines_invalid', 'จำนวน 0 บันทึกไม่ได้');
  h := hq_quote_save(r.id, lines);
  perform flowtest.ok(h.status = 'draft' and h.total_cost = 295050 and h.version = 1 and h.quote_no like 'HQ-%-V1', 'บันทึกร่างใบ HQ · ยอดรวมคิดจากรายการ (295,050) · V1');
  select * into r from quote_requests where id = r.id;
  perform flowtest.ok(r.status = 'pricing' and r.assignee = c.hq_uid and r.accepted_at is not null, 'เริ่มทำราคา = รับเรื่องให้เอง มีผู้รับผิดชอบ');
  perform flowtest.must_fail(format('select hq_quote_send(%s)', r.id), 'quote_validity', 'ไม่กำหนดวันยืนราคา ส่งใบไม่ได้');

  perform flowtest.as_dealer('CNX', c.cnx_uid);
  select count(*) into n from hq_quotes where request_id = r.id;
  perform flowtest.ok(n = 0, 'ดีลเลอร์มองไม่เห็นร่างใบ HQ');

  perform flowtest.as_hq(c.hq_uid);
  h := hq_quote_save(r.id, lines, current_date + 30, 'ราคารวมขนส่ง');
  h := hq_quote_send(r.id);
  select * into r from quote_requests where id = r.id;
  perform flowtest.ok(h.status = 'sent' and r.status = 'quoted' and r.quoted_at is not null, 'ส่งใบ HQ → คำขอ ส่งใบแล้ว หยุดนับ');
  perform flowtest.ok(h.sent_by = c.hq_uid and h.sent_by_name <> '' and h.sent_at is not null, 'ใบ HQ บันทึกผู้ส่งและเวลาส่ง');
  select status::text into s from leads where dealer_code = 'CNX' and num_id = l1;
  perform flowtest.ok(s = 'HQ_PRICING', 'HQ ส่งใบแล้ว ลูกค้าเป้าหมายคงเดิม');
  perform flowtest.must_fail(format('select hq_quote_save(%s, ''[{"name":"x","qty":1,"unitCost":1}]''::jsonb)', r.id), 'request_stage', 'ใบ HQ ที่ส่งแล้วแก้ผ่านคำสั่งไม่ได้');
  perform flowtest.as_root();
  perform flowtest.must_fail(format('update hq_quotes set total_cost = 1 where id = %s', h.id), 'hq_quote_locked', 'ใบ HQ ที่ส่งแล้ว แก้ตรงด้วยสิทธิ์ผู้ดูแลก็ไม่ได้');
  perform flowtest.must_fail(format('delete from hq_quotes where id = %s', h.id), 'hq_quote_locked', 'ใบ HQ ที่ส่งแล้วลบไม่ได้');

  -- ══ ง. ดีลเลอร์ทำใบให้ลูกค้า → ปิดการขาย ══
  perform flowtest.as_dealer('CNX', c.cnx_uid);
  select count(*) into n from hq_quotes where request_id = r.id;
  perform flowtest.ok(n = 1, 'ดีลเลอร์เจ้าของคำขอเห็นใบ HQ ที่ส่งแล้ว');
  perform flowtest.must_fail(format('select quote_request_cancel(%s, ''เปลี่ยนใจ'')', r.id), 'request_locked', 'HQ ส่งใบแล้ว ยกเลิกคำขอไม่ได้');
  perform flowtest.as_dealer('RYG', c.ryg_uid);
  perform flowtest.must_fail(format('insert into quotations (id, dealer_code, customer, hq_quote_id) values (''T-RYG-1'', ''RYG'', ''x'', %s)', h.id), 'hq_link_invalid', 'ดีลเลอร์อื่นเอาใบ HQ ของ CNX ไปออกใบไม่ได้');
  perform flowtest.as_dealer('CNX', c.cnx_uid);
  insert into quotations (id, dealer_code, customer, hq_quote_id, markup_percent) values ('T-CNX-1', 'CNX', 'ทดสอบ', h.id, 15);
  select deal_id into n from quotations where dealer_code = 'CNX' and id = 'T-CNX-1';
  perform flowtest.ok(n = l1, 'ใบของดีลเลอร์ผูกลูกค้าเป้าหมายตามใบ HQ ให้เอง');
  update quotations set status = 'sent_to_client' where dealer_code = 'CNX' and id = 'T-CNX-1';
  select status::text into s from leads where dealer_code = 'CNX' and num_id = l1;
  perform flowtest.ok(s = 'QUOTED', 'ดีลเลอร์ส่งใบให้ลูกค้า → ลูกค้าเป้าหมาย เสนอราคา');
  update quotations set status = 'won', customer_id = c.cust_id where dealer_code = 'CNX' and id = 'T-CNX-1';
  select * into r from quote_requests where id = r.id; select * into h from hq_quotes where id = h.id;
  select status::text into s from leads where dealer_code = 'CNX' and num_id = l1;
  perform flowtest.ok(r.status = 'won' and h.status = 'ordered' and h.ordered_at is not null and s = 'PAID',
                     'ลูกค้าตอบรับ → คำขอปิด (won) · ใบ HQ สั่งผลิต · ลูกค้าเป้าหมาย ปิดการขายสำเร็จ');
  update quotations set status = 'sent_to_client' where dealer_code = 'CNX' and id = 'T-CNX-1';
  select * into r from quote_requests where id = r.id; select * into h from hq_quotes where id = h.id;
  perform flowtest.ok(r.status = 'quoted' and h.status = 'sent' and h.ordered_at is null, 'ย้อนการตอบรับ → ใบ HQ กลับเป็นส่งแล้ว คำขอกลับมาเปิด');

  -- ══ จ. ยกเลิก / ขอแก้ราคา / ลูกค้าปฏิเสธ (รายที่ 2) ══
  r2 := quote_request_submit(l2, 'โรงงาน');
  perform flowtest.must_fail(format('select quote_request_cancel(%s, ''  '')', r2.id), 'reason_required', 'ยกเลิกคำขอต้องมีเหตุผล');
  r2 := quote_request_cancel(r2.id, 'ลูกค้าขอเลื่อน');
  select status::text into s from leads where dealer_code = 'CNX' and num_id = l2;
  perform flowtest.ok(r2.status = 'cancelled' and s = 'BULLET', 'ยกเลิกคำขอ → ลูกค้าเป้าหมายกลับ รวบรวมความต้องการ');
  r2 := quote_request_submit(l2, 'โรงงาน');
  perform flowtest.must_fail(format('select quote_request_reprice(%s, ''ลดสเปก'')', r2.id), 'request_stage', 'ยังไม่ได้ใบ HQ ขอแก้ราคาไม่ได้');
  perform flowtest.as_hq(c.hq_uid);
  perform hq_quote_save(r2.id, lines, current_date + 30); perform hq_quote_send(r2.id);
  perform flowtest.as_dealer('CNX', c.cnx_uid);
  insert into quotations (id, dealer_code, customer, hq_quote_id, status) values ('T-CNX-2', 'CNX', 'ทดสอบ 2', (select id from hq_quotes where request_id = r2.id), 'sent_to_client');
  r := quote_request_reprice(r2.id, 'ลูกค้าลดพื้นที่');
  select * into r2 from quote_requests where id = r2.id; select * into h from hq_quotes where request_id = r2.id;
  select status::text into s from leads where dealer_code = 'CNX' and num_id = l2;
  perform flowtest.ok(r2.status = 'superseded' and h.status = 'superseded' and r.status = 'new' and r.supersedes_id = r2.id
                     and r.root_id = r2.id and r.due_at > r2.due_at - interval '1 second' and s = 'HQ_PRICING',
                     'ขอแก้ราคา → คำขอ+ใบ HQ เดิมปิด · คำขอใหม่เริ่มนับใหม่ · ลูกค้าเป้าหมายกลับ รอราคา HQ');
  perform flowtest.must_fail('update quotations set status = ''won'', customer_id = ' || c.cust_id || ' where dealer_code = ''CNX'' and id = ''T-CNX-2''', 'hq_quote_unusable', 'ใบลูกค้าที่ผูกใบ HQ เวอร์ชันเก่า ปิดการขายไม่ได้');
  select status::text into s from quotations where dealer_code = 'CNX' and id = 'T-CNX-2';
  perform flowtest.ok(s = 'sent_to_client', 'ขอแก้ราคาแล้ว แต่ HQ ยังไม่ส่งเวอร์ชันใหม่ → ใบเดิมของดีลเลอร์ยังไม่ถูกปิด');
  select count(*) into n_lost from quotations where status = 'lost';
  perform flowtest.as_hq(c.hq_uid);
  h := hq_quote_save(r.id, lines, current_date + 30);
  perform flowtest.ok(h.version = 2 and h.quote_no like '%-V2', 'ใบ HQ ของคำขอแก้ราคา = เวอร์ชัน 2');
  perform hq_quote_send(r.id);
  perform flowtest.as_dealer('CNX', c.cnx_uid);
  select status::text, expired_reason into s, t from quotations where dealer_code = 'CNX' and id = 'T-CNX-2';
  perform flowtest.ok(s = 'expired' and t = 'ราคา HQ เปลี่ยนเวอร์ชัน', 'HQ ส่งเวอร์ชันใหม่ → ใบดีลเลอร์ของเวอร์ชันเก่าหมดอายุ พร้อมเหตุผล');
  select count(*) into n from quotations q join hq_quotes oh on oh.id = q.hq_quote_id
   where oh.request_id = r2.id and q.status in ('draft', 'sent_to_client');
  perform flowtest.ok(n = 0, 'ไม่เหลือใบดีลเลอร์ที่ยังเปิดอยู่กับเวอร์ชันเก่า');
  select count(*) into n from quotations where status = 'lost';
  select status::text into s from leads where dealer_code = 'CNX' and num_id = l2;
  perform flowtest.ok(n = n_lost and s = 'HQ_PRICING' and (select status from quote_requests where id = r.id) = 'quoted',
                     'ปิดเพราะเปลี่ยนเวอร์ชันไม่นับเป็นงานที่แพ้ — จำนวนใบที่ลูกค้าปฏิเสธเท่าเดิม · ลูกค้าเป้าหมายไม่ถูกปิด');
  insert into quotations (id, dealer_code, customer, hq_quote_id, status) values ('T-CNX-3', 'CNX', 'ทดสอบ 2', h.id, 'sent_to_client');
  update quotations set status = 'lost', lost_reason = 'ราคาสูงเกินงบประมาณ' where dealer_code = 'CNX' and id = 'T-CNX-3';
  select * into r from quote_requests where id = r.id;
  select status::text, lost_reason into s, lines from (select status, to_jsonb(lost_reason) as lost_reason from leads where dealer_code = 'CNX' and num_id = l2) x;
  perform flowtest.ok(r.status = 'lost' and r.lost_reason = 'ราคาสูงเกินงบประมาณ' and s = 'CANCELLED' and lines #>> '{}' = 'ราคาสูงเกินงบประมาณ',
                     'ลูกค้าปฏิเสธ → คำขอปิด (lost) · ลูกค้าเป้าหมาย ปิดไม่สำเร็จ + เหตุผล');

  -- ══ ฉ. เกินกำหนด 14 วัน + ประวัติ ══
  perform flowtest.as_root();
  select count(*) into n from quote_requests q where quote_request_overdue(q);
  perform flowtest.ok(n = 0, 'ยังไม่มีคำขอเกินกำหนด');
  insert into quote_requests (request_no, dealer_code, lead_num_id, product, due_at, status, submitted_at)
  select 'RQ-TEST-OVERDUE', 'CNX', num_id, 'x', now() - interval '1 day', 'pricing', now() - interval '15 days'
    from leads where dealer_code = 'CNX' and num_id not in (l1, l2) limit 1;
  select count(*) into n from quote_requests q where quote_request_overdue(q);
  perform flowtest.ok(n = 1, 'คำขอที่ค้างเกิน 14 วันและยังไม่ส่งใบ = เกินกำหนด');

  -- ══ ช. ใครตีราคาได้ — เอาบทบาทออกจากจุดตั้งค่าเดียว บทบาทนั้นทำ/ส่งใบไม่ได้ ══
  select id into n from quote_requests where request_no = 'RQ-TEST-OVERDUE';
  perform set_config('request.jwt.claims', json_build_object('sub', c.hq_uid, 'role', 'authenticated',
    'user_role', 'HQ_STAFF', 'dealer_code', '', 'email', 'staff@test')::text, true);
  perform set_config('role', 'authenticated', true);
  perform hq_quote_save(n, '[{"name":"x","qty":1,"unit":"ชุด","unitCost":1000}]'::jsonb, current_date + 30);
  perform flowtest.ok(true, 'เจ้าหน้าที่ HQ ทำใบ HQ ได้ (ค่าตั้งต้น: ทุกบทบาทของสำนักงานใหญ่)');
  perform flowtest.as_root();
  delete from quote_pricing_roles where role = 'HQ_STAFF';
  perform set_config('request.jwt.claims', json_build_object('sub', c.hq_uid, 'role', 'authenticated',
    'user_role', 'HQ_STAFF', 'dealer_code', '', 'email', 'staff@test')::text, true);
  perform set_config('role', 'authenticated', true);
  perform flowtest.must_fail(format('select hq_quote_send(%s)', n), 'forbidden', 'เอาบทบาทเจ้าหน้าที่ออกจากรายชื่อ → ส่งใบ HQ ไม่ได้');
  perform flowtest.must_fail(format('select hq_quote_save(%s, ''[{"name":"x","qty":1,"unitCost":1}]''::jsonb)', n), 'forbidden', 'และทำใบ HQ ไม่ได้');
  perform flowtest.as_hq(c.hq_uid);
  perform hq_quote_send(n);
  perform flowtest.ok(true, 'บทบาทที่ยังอยู่ในรายชื่อส่งใบได้ตามปกติ');
  perform flowtest.as_root();
  select count(*) into n from quote_request_events where request_id = r2.id;
  perform flowtest.ok(n = 4, 'ประวัติคำขอบันทึกครบทุกการเปลี่ยนสถานะ (ใหม่ → ทำราคา → ส่งใบ → ปิดเพราะขอแก้ราคา)');
  select count(*) into n from quotations where hq_quote_id is null;
  perform flowtest.ok(n > 0, 'ใบเสนอราคาเดิม (ไม่มีใบ HQ) ยังอยู่ครบ ไม่ถูกแตะ');
  raise notice 'ALL PASS';
end $$;

rollback;
