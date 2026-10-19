-- ── หน้า 5: กล่องงานคำขอราคาของ HQ (hq_quote_board · ใบ 0215) — ตัวเลข/ลำดับ/ป้ายตรงกับข้อมูลที่รู้ค่าล่วงหน้า ─────────
--   ล้างตารางคำขอในรายการนี้ (ย้อนทั้งหมดตอนจบ) แล้วใส่ชุดข้อมูลที่กำหนดเอง → ทุกค่าตรวจเป็นค่าตายตัว
-- รัน: docker exec -i <คอนเทนเนอร์ฐานทดสอบ> psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/hq_quote_board.sql
begin;
create schema flowtest;
create function flowtest.ok(p_cond boolean, p_what text) returns void language plpgsql as $$
begin if p_cond is not true then raise exception 'FAIL: %', p_what; end if; raise notice 'ok  %', p_what; end $$;
create function flowtest.as_hq(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated',
    'user_role', 'SUPER_ADMIN', 'dealer_code', '', 'email', 'hq@test')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function flowtest.as_dealer(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated',
    'user_role', 'DEALER_ADMIN', 'dealer_code', 'CNX', 'email', 'cnx@test')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function flowtest.ids(p jsonb) returns int[] language sql as $$ select array(select (e->>'id')::int from jsonb_array_elements(p->'rows') e) $$;
create function flowtest.tags(p jsonb) returns text[] language sql as $$ select array(select e->>'tag' from jsonb_array_elements(p->'rows') e) $$;
grant usage on schema flowtest to authenticated;
grant execute on all functions in schema flowtest to authenticated;

-- ═══ ชุดข้อมูล (ปิดตัวดัก/กุญแจนอกในรายการนี้เท่านั้น — ใส่สถานะปลายทางตรง ๆ) ═══════════════════════════════
set local session_replication_role = replica;
delete from hq_quotes; delete from quote_request_events; delete from quote_requests;
delete from leads where company like 'ZZQB %';
insert into leads (id, num_id, dealer_code, company, name, phone, province, status) values
  ('#L-QB-1', 9601, 'RYG', 'ZZQB ล1', 'ZZQB ล1', '0800009601', 'ตราด', 'BULLET'),
  ('#L-QB-2', 9602, 'CNX', 'ZZQB ล2', 'ZZQB ล2', '0800009602', 'เชียงใหม่', 'BULLET'),
  ('#L-QB-3', 9603, 'RYG', 'ZZQB ล3', 'ZZQB ล3', '0800009603', 'ตราด', 'BULLET'),
  ('#L-QB-4', 9604, 'RYG', 'ZZQB ล4', 'ZZQB ล4', '0800009604', 'ตราด', 'BULLET');
-- ต้องตีราคา 4: เกินกำหนด (ทำราคาอยู่) · ขอแก้ราคา (ใหม่ มีเวอร์ชันก่อน) · ร่างค้าง · ใหม่
-- รอดีลเลอร์ 2: ราคาหมดอายุ +5 วัน · +20 วัน · สั่งผลิต 1 · ปิด 3: แทนที่แล้ว (-3 วัน) · ไม่ได้งาน (-2 วัน) · ยกเลิก (-1 ชม.)
insert into quote_requests (id, request_no, dealer_code, lead_num_id, product, province, status, supersedes_id, submitted_at, due_at, quoted_at, closed_at, cancel_reason) values
  (9501, 'QB-1',  'RYG', 9601, 'โกดัง',   'ตราด',     'pricing',    null, now() - interval '20 days', now() - interval '6 days',  null, null, ''),
  (9502, 'QB-2',  'CNX', 9602, 'โรงงาน',  'เชียงใหม่', 'new',        9508, now() - interval '1 day',   now() + interval '13 days', null, null, ''),
  (9503, 'QB-3',  'RYG', 9603, 'หลังคา',  'ตราด',     'pricing',    null, now() - interval '4 days',  now() + interval '10 days', null, null, ''),
  (9504, 'QB-4',  'RYG', 9604, 'โกดัง',   'ตราด',     'new',        null, now(),                      now() + interval '14 days', null, null, ''),
  (9505, 'QB-5',  'RYG', 9605, 'โกดัง',   'ตราด',     'quoted',     null, now() - interval '9 days',  now() + interval '5 days',  now() - interval '2 days', null, ''),
  (9506, 'QB-6',  'CNX', 9606, 'โกดัง',   'เชียงใหม่', 'quoted',     null, now() - interval '8 days',  now() + interval '6 days',  now() - interval '1 day',  null, ''),
  (9507, 'QB-7',  'RYG', 9607, 'โกดัง',   'ตราด',     'won',        null, now() - interval '30 days', now() - interval '16 days', now() - interval '20 days', now() - interval '1 day', ''),
  (9508, 'QB-8',  'CNX', 9602, 'โรงงาน',  'เชียงใหม่', 'superseded', null, now() - interval '12 days', now() + interval '2 days',  now() - interval '5 days', now() - interval '3 days', ''),
  (9509, 'QB-9',  'RYG', 9609, 'โกดัง',   'ตราด',     'lost',       null, now() - interval '25 days', now() - interval '11 days', now() - interval '10 days', now() - interval '2 days', ''),
  (9510, 'QB-10', 'RYG', 9610, 'โกดัง',   'ตราด',     'cancelled',  null, now() - interval '3 days',  now() + interval '11 days', null, now() - interval '1 hour', 'ลูกค้ายกเลิกโครงการ');
insert into hq_quotes (id, request_id, version, quote_no, status, line_items, total_cost, valid_until, sent_at, ordered_at) values
  (9701, 9503, 1, 'HQ-QB-3', 'draft',   '[]', 0,      null,                      null,                      null),
  (9702, 9505, 1, 'HQ-QB-5', 'sent',    '[]', 100000, current_date + 5,          now() - interval '2 days', null),
  (9703, 9506, 1, 'HQ-QB-6', 'sent',    '[]', 200000, current_date + 20,         now() - interval '1 day',  null),
  (9704, 9507, 1, 'HQ-QB-7', 'ordered', '[]', 300000, current_date - 1,          now() - interval '20 days', now() - interval '1 day');
set local session_replication_role = origin;

do $$
declare
  hq  uuid := (select id from profiles where role = 'SUPER_ADMIN' limit 1);
  cnx uuid := (select id from profiles where role = 'DEALER_ADMIN' and dealer_code = 'CNX' limit 1);
  b jsonb;
begin
  perform flowtest.as_hq(hq);

  -- จำนวน 4 กลุ่ม (+ เกินกำหนดในกลุ่มต้องตีราคา)
  b := hq_quote_board('todo', '');
  perform flowtest.ok(b->'counts' = '{"todo":4,"overdue":1,"quoted":2,"won":1,"closed":3}'::jsonb, 'จำนวน 4 กลุ่ม: ต้องตีราคา 4 (เกิน 1) · รอดีลเลอร์ 2 · สั่งผลิต 1 · ปิด 3 — ได้ ' || (b->'counts')::text);
  -- ต้องตีราคา: กำหนดส่งใกล้สุดก่อน · ป้ายตรงสถานะจริง
  perform flowtest.ok(flowtest.ids(b) = array[9501, 9503, 9502, 9504], 'ต้องตีราคา เรียงกำหนดส่งใกล้สุดก่อน (เกินกำหนดบนสุด) — ได้ ' || flowtest.ids(b)::text);
  perform flowtest.ok(flowtest.tags(b) = array['overdue', 'draft', 'reprice', 'new'], 'ป้าย: เกินกำหนด · ร่างค้าง · ขอแก้ราคา · ใหม่ — ได้ ' || flowtest.tags(b)::text);
  perform flowtest.ok((b->'rows'->0->>'waiting_days')::int = 20, 'รอมาแล้ว 20 วัน (นับจากวันส่งคำขอ)');
  perform flowtest.ok(b->'rows'->0->>'lead_company' = 'ZZQB ล1' and b->'rows'->0->>'dealer_name' <> '', 'แถวมีชื่อลูกค้าเป้าหมายและชื่อดีลเลอร์');
  perform flowtest.ok(b->'rows'->1->>'hq_status' = 'draft', 'แถวร่างค้างบอกสถานะใบ HQ = draft');

  -- รอดีลเลอร์: ราคาใกล้หมดอายุก่อน · สั่งผลิต · ปิด: ปิดล่าสุดก่อน
  b := hq_quote_board('quoted', '');
  perform flowtest.ok(flowtest.ids(b) = array[9505, 9506], 'รอดีลเลอร์ เรียงราคาใกล้หมดอายุก่อน — ได้ ' || flowtest.ids(b)::text);
  perform flowtest.ok(flowtest.tags(b) = array['quoted', 'quoted'], 'ป้ายรอดีลเลอร์ = quoted');
  b := hq_quote_board('won', '');
  perform flowtest.ok(flowtest.ids(b) = array[9507], 'สั่งผลิต 1 แถว');
  b := hq_quote_board('closed', '');
  perform flowtest.ok(flowtest.ids(b) = array[9510, 9509, 9508], 'ปิด/ยกเลิก เรียงปิดล่าสุดก่อน — ได้ ' || flowtest.ids(b)::text);
  perform flowtest.ok(flowtest.tags(b) = array['cancelled', 'lost', 'superseded'], 'ป้ายปิด = สถานะคำขอ');

  -- คำค้นเดียวกันกรองทั้งจำนวนและรายการ (รหัสดีลเลอร์ · ชื่อลูกค้าเป้าหมาย · ไม่สนตัวพิมพ์)
  b := hq_quote_board('todo', '  cnx ');
  perform flowtest.ok(b->'counts' = '{"todo":1,"overdue":0,"quoted":1,"won":0,"closed":1}'::jsonb, 'ค้น cnx: จำนวนทุกกลุ่มกรองด้วย — ได้ ' || (b->'counts')::text);
  perform flowtest.ok(flowtest.ids(b) = array[9502], 'ค้น cnx: รายการต้องตีราคาเหลือ QB-2');
  b := hq_quote_board('todo', 'zzqb ล3');
  perform flowtest.ok(flowtest.ids(b) = array[9503] and (b->'counts'->>'quoted')::int = 0, 'ค้นชื่อลูกค้าเป้าหมาย: เหลือ QB-3');
  b := hq_quote_board('todo', 'ไม่มีคำนี้แน่นอน');
  perform flowtest.ok(b->'rows' = '[]'::jsonb and (b->'counts'->>'todo')::int = 0, 'ค้นไม่เจอ: รายการว่าง จำนวน 0');

  -- กลุ่มที่ไม่รู้จักถูกปฏิเสธ
  begin
    perform hq_quote_board('ทั้งหมด', '');
    raise exception 'FAIL: กลุ่มที่ไม่รู้จักผ่านได้';
  exception when others then
    if sqlerrm not like 'invalid_group%' then raise; end if;
    raise notice 'ok  กลุ่มที่ไม่รู้จักถูกปฏิเสธ';
  end;

  -- ดีลเลอร์เรียกกล่องงานของ HQ ไม่ได้
  perform flowtest.as_dealer(cnx);
  begin
    perform hq_quote_board('todo', '');
    raise exception 'FAIL: ดีลเลอร์เรียกกล่องงาน HQ ได้';
  exception when others then
    if sqlerrm not like 'forbidden%' then raise; end if;
    raise notice 'ok  ดีลเลอร์เรียกกล่องงาน HQ ไม่ได้ (ถูกปฏิเสธ)';
  end;
end $$;

\echo 'ALL PASS'
rollback;
