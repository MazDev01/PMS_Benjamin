-- ── ด่าน 3: ขั้น 7–11 · ตารางสถานะ (ส่งใบให้ลูกค้า / won / lost) · กฎใบลูกค้า (FLOW.html) ─────────────────────────
--   ขั้น 7  ทำใบให้ลูกค้า: ต้นทุน HQ + % (แก้รายบรรทัดได้)       ขั้น 8  ลูกค้าได้รับใบ → Lead QUOTED
--   ขั้น 10 ปิดการขาย (won) → Lead PAID · คำขอปิด won · อีเมลถึง HQ   ขั้น 11 สั่งผลิต: ล็อกราคา · ใบ HQ = สั่งผลิต
--   ลูกค้าปฏิเสธ → Lead CANCELLED + เหตุผล · คำขอปิด lost · ไม่มีอีเมล
--   กฎ: ปิดทางออกใบลูกค้าแบบเดิม (ไม่มีใบ HQ = สร้างไม่ได้ทุกทาง · ใบเดิมยังเปิดดูได้)
--       อายุใบลูกค้าไม่เกินใบ HQ (บังคับที่ฐาน) · ใบ HQ หมดอายุ → ใบลูกค้าที่ผูกอยู่หมดตาม
--       margin ที่ HQ เห็น: ต้นทุน 10 บวก 50% → ขาย 15 · บวก 5 บาท · 50% ของต้นทุน · 33.33% ของราคาขาย
-- รัน: docker exec -i <คอนเทนเนอร์ฐานทดสอบ> psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/customer_quote_rules.sql
begin;

create schema flowtest;
create table flowtest.t_ctx as
select
  (select id from profiles where role = 'DEALER_ADMIN' and dealer_code = 'CNX' limit 1) as cnx_uid,
  (select id from profiles where role = 'DEALER_ADMIN' and dealer_code = 'RYG' limit 1) as ryg_uid,
  (select id from profiles where role = 'SUPER_ADMIN' limit 1)                          as hq_uid,
  (select array_agg(num_id order by num_id) from (
     select num_id from leads where dealer_code = 'CNX' and status in ('WAITING','BULLET') order by num_id limit 3) x) as lead_ids,
  (select id from quotations where hq_quote_id is null order by created_at limit 1) as legacy_id;
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
/** ใบ HQ ที่ส่งแล้วสำหรับลูกค้าเป้าหมายของ CNX — คืนเลขใบ HQ */
create function flowtest.hq_for(p_lead int, p_lines jsonb, p_valid date) returns bigint language plpgsql as $$
declare c record; r quote_requests; h hq_quotes;
begin
  select * into c from flowtest.t_ctx;
  perform flowtest.as_dealer('CNX', c.cnx_uid);
  r := quote_request_submit(p_lead, 'โกดังและคลังสินค้า');
  perform flowtest.as_hq(c.hq_uid);
  perform hq_quote_save(r.id, p_lines, p_valid);
  h := hq_quote_send(r.id);
  perform flowtest.as_dealer('CNX', c.cnx_uid);
  return h.id;
end $$;
grant usage on schema flowtest to authenticated;
grant execute on all functions in schema flowtest to authenticated;

do $$
declare
  c record; h1 bigint; h2 bigint; h3 bigint; q quotations; m jsonb; n int; st text; rq quote_requests;
  ten jsonb := '[{"name":"โครงเหล็ก","qty":1,"unit":"ชุด","unitCost":10}]';
  two jsonb := '[{"name":"โครงเหล็ก","qty":100,"unit":"ตร.ม.","unitCost":2500},{"name":"หลังคา","qty":100,"unit":"ตร.ม.","unitCost":450.5}]';
begin
  select * into c from flowtest.t_ctx;
  perform flowtest.ok(c.cnx_uid is not null and c.hq_uid is not null and array_length(c.lead_ids, 1) = 3, 'มีข้อมูลตั้งต้นครบ');
  update hq_notif_rules set email_recipients = array['zz-hq-gate3@example.test'] where id = 1;

  -- ══ กฎ: ปิดทางออกใบลูกค้าแบบเดิม ══
  perform flowtest.as_dealer('CNX', c.cnx_uid);
  perform flowtest.must_fail($q$insert into quotations (id, dealer_code, quote_no, customer, total, status, date, line_items, items)
    values ('ZZ-Q-OLD1', 'CNX', 'ZZ-Q-OLD1', 'ZZ', 100, 'draft', '01/01/2569', '[]', 0)$q$, 'hq_quote_required', 'ทางเดิม: ดีลเลอร์สร้างใบที่ไม่มีใบ HQ ตรงที่ตารางไม่ได้');
  perform flowtest.must_fail($q$select create_quotation('CNX', 'Q-2026-', '{"customer":"ZZ","total":"100","status":"draft","date":"01/01/2569","line_items":[{"name":"x","qty":1,"unitPrice":100}],"items":1}'::jsonb)$q$,
    'hq_quote_required', 'ทางเดิม: สร้างผ่านคำสั่งออกเลขใบ (ที่หน้าจอ/API ใช้) ไม่ได้ถ้าไม่มีใบ HQ');
  perform flowtest.as_root();
  perform flowtest.must_fail($q$insert into quotations (id, dealer_code, quote_no, customer, total, status, date, line_items, items)
    values ('ZZ-Q-OLD2', 'CNX', 'ZZ-Q-OLD2', 'ZZ', 100, 'draft', '01/01/2569', '[]', 0)$q$, 'hq_quote_required', 'ทางเดิม: สิทธิ์สูงสุด/ฝั่งเซิร์ฟเวอร์ก็สร้างไม่ได้');
  if c.legacy_id is not null then
    perform flowtest.as_hq(c.hq_uid);
    perform flowtest.ok((select count(*) from quotations where id = c.legacy_id) = 1, 'ใบเดิมที่ไม่มีใบ HQ ยังเปิดดูได้');
  end if;

  -- ══ ขั้น 7: ทำใบให้ลูกค้าจากใบ HQ (ต้นทุน 10 · บวก 50%) ══
  h1 := flowtest.hq_for(c.lead_ids[1], ten, current_date + 20);
  select * into q from create_quotation('CNX', 'Q-2026-', jsonb_build_object('customer', 'ZZ ลูกค้า 10', 'total', '0', 'status', 'draft',
    'date', to_char(current_date, 'DD/MM/YYYY'), 'line_items', '[{"name":"x","qty":1}]'::jsonb, 'items', 1, 'hq_quote_id', h1, 'markup_percent', 50,
    'expiry', to_char(current_date + 60, 'YYYY-MM-DD')));
  perform flowtest.ok((q.line_items -> 0 ->> 'unitPrice')::numeric = 15 and q.total_value = 15 and q.material_cost = 10,
    'ขั้น 7: ต้นทุน 10 บวก 50% → ราคาขาย 15 · ต้นทุนรวม 10');
  perform flowtest.ok(q.expiry = to_char(current_date + 20, 'YYYY-MM-DD'), 'กฎอายุ: ใส่อายุเกินใบ HQ ถูกบังคับให้เท่าวันยืนราคาใบ HQ (' || q.expiry || ')');
  update quotations set expiry = to_char(current_date + 90, 'YYYY-MM-DD') where id = q.id and dealer_code = 'CNX' returning * into q;
  perform flowtest.ok(q.expiry = to_char(current_date + 20, 'YYYY-MM-DD'), 'กฎอายุ: แก้อายุทีหลังให้เกินใบ HQ ก็ไม่ได้');

  -- margin ที่ HQ เห็น
  perform flowtest.as_hq(c.hq_uid);
  m := quotation_margin('CNX', q.id);
  perform flowtest.ok((m -> 'lines' -> 0 ->> 'unitCost')::numeric = 10 and (m -> 'lines' -> 0 ->> 'markupPct')::numeric = 50
                  and (m -> 'lines' -> 0 ->> 'unitPrice')::numeric = 15 and (m -> 'lines' -> 0 ->> 'markupBaht')::numeric = 5,
    'margin รายบรรทัด: ต้นทุน 10 · 50% · ขาย 15 · บวก 5 บาท');
  perform flowtest.ok((m ->> 'costTotal')::numeric = 10 and (m ->> 'saleTotal')::numeric = 15 and (m ->> 'markupBaht')::numeric = 5
                  and (m ->> 'pctOfCost')::numeric = 50 and (m ->> 'pctOfSale')::numeric = 33.33,
    'margin ทั้งใบ: บวก 5 บาท · 50% ของต้นทุน · 33.33% ของราคาขาย (ได้ ' || m::text || ')');
  perform flowtest.as_dealer('RYG', c.ryg_uid);
  perform flowtest.ok(quotation_margin('CNX', q.id) is null, 'margin: ดีลเลอร์อื่นดูไม่ได้');

  -- ══ ขั้น 8: ส่งใบให้ลูกค้า → Lead QUOTED · คำขอคงเดิม ══
  perform flowtest.as_dealer('CNX', c.cnx_uid);
  update quotations set status = 'sent_to_client' where id = q.id and dealer_code = 'CNX';
  perform flowtest.as_root();
  select status into st from leads where dealer_code = 'CNX' and num_id = c.lead_ids[1];
  perform flowtest.ok(st = 'QUOTED', 'ขั้น 8: ส่งใบให้ลูกค้า → ลูกค้าเป้าหมาย QUOTED (ได้ ' || st || ')');
  perform flowtest.ok((select r.status from quote_requests r join hq_quotes h on h.request_id = r.id where h.id = h1) = 'quoted', 'ขั้น 8: คำขอคงเดิม (ส่งใบแล้ว)');

  -- ══ ขั้น 10–11: won → PAID · คำขอ won · ใบ HQ สั่งผลิต · อีเมลถึง HQ · ล็อกราคา ══
  perform flowtest.as_dealer('CNX', c.cnx_uid);
  update quotations set status = 'won', customer_id = (select id from customers where dealer_code = 'CNX' order by id limit 1) where id = q.id and dealer_code = 'CNX';
  perform flowtest.as_root();
  perform flowtest.ok((select status from leads where dealer_code = 'CNX' and num_id = c.lead_ids[1]) = 'PAID'
                  and (select status from hq_quotes where id = h1) = 'ordered'
                  and (select r.status from quote_requests r join hq_quotes h on h.request_id = r.id where h.id = h1) = 'won',
    'ขั้น 10–11: won → ลูกค้าเป้าหมาย PAID · ใบ HQ สั่งผลิต · คำขอปิด won');
  select count(*) into n from email_outbox o join hq_quotes h on o.ref_id = h.request_id::text
   where h.id = h1 and o.kind = 'customer_accepted' and o.to_email = 'zz-hq-gate3@example.test';
  perform flowtest.ok(n = 1, 'แถว won: อีเมลถึงผู้รับของ HQ 1 ฉบับ (ได้ ' || n || ')');
  perform flowtest.as_dealer('CNX', c.cnx_uid);
  perform flowtest.must_fail(format($q$update quotations set markup_percent = 80 where id = %L and dealer_code = 'CNX'$q$, q.id), 'quote_locked', 'ขั้น 11: สั่งผลิตแล้วแก้ % ไม่ได้');
  perform flowtest.must_fail(format($q$update quotations set line_items = '[]', total_value = 0 where id = %L and dealer_code = 'CNX'$q$, q.id), 'quote_locked', 'ขั้น 11: สั่งผลิตแล้วแก้รายการ/ยอดไม่ได้');
  perform flowtest.must_fail(format($q$update quotations set vat_percent = 0 where id = %L and dealer_code = 'CNX'$q$, q.id), 'quote_locked', 'ขั้น 11: สั่งผลิตแล้วแก้ภาษีไม่ได้');
  update quotations set note = 'ลูกค้าโอนมัดจำแล้ว' where id = q.id and dealer_code = 'CNX';
  perform flowtest.ok((select note from quotations where id = q.id) = 'ลูกค้าโอนมัดจำแล้ว', 'ขั้น 11: หมายเหตุยังแก้ได้ (ไม่ใช่ราคา)');

  -- ══ ลูกค้าปฏิเสธ → CANCELLED + เหตุผล · คำขอ lost · ไม่มีอีเมล ══
  h2 := flowtest.hq_for(c.lead_ids[2], two, current_date + 20);
  select * into q from create_quotation('CNX', 'Q-2026-', jsonb_build_object('customer', 'ZZ ลูกค้า lost', 'total', '0', 'status', 'sent_to_client',
    'date', to_char(current_date, 'DD/MM/YYYY'), 'line_items', '[{"name":"x","qty":1}]'::jsonb, 'items', 1, 'hq_quote_id', h2, 'markup_percent', 10));
  update quotations set status = 'lost', lost_reason = 'ราคาสูงกว่าคู่แข่ง' where id = q.id and dealer_code = 'CNX';
  perform flowtest.as_root();
  perform flowtest.ok((select status from leads where dealer_code = 'CNX' and num_id = c.lead_ids[2]) = 'CANCELLED'
                  and (select lost_reason from leads where dealer_code = 'CNX' and num_id = c.lead_ids[2]) = 'ราคาสูงกว่าคู่แข่ง'
                  and (select r.status from quote_requests r join hq_quotes h on h.request_id = r.id where h.id = h2) = 'lost',
    'ลูกค้าปฏิเสธ → ลูกค้าเป้าหมาย CANCELLED + เหตุผล · คำขอปิด lost');
  select count(*) into n from email_outbox o join hq_quotes h on o.ref_id = h.request_id::text where h.id = h2 and o.kind not in ('request_new', 'hq_quote_sent');
  perform flowtest.ok(n = 0, 'ลูกค้าปฏิเสธ: ไม่มีอีเมล (ตามตารางสถานะ)');

  -- ══ ใบ HQ หมดอายุ → ใบลูกค้าที่ผูกอยู่หมดตาม (ทั้งร่างและที่ส่งให้ลูกค้าแล้ว) ══
  h3 := flowtest.hq_for(c.lead_ids[3], ten, current_date + 2);
  select * into q from create_quotation('CNX', 'Q-2026-', jsonb_build_object('customer', 'ZZ ลูกค้า หมดอายุ', 'total', '0', 'status', 'draft',
    'date', to_char(current_date, 'DD/MM/YYYY'), 'line_items', '[{"name":"x","qty":1}]'::jsonb, 'items', 1, 'hq_quote_id', h3, 'markup_percent', 5));
  perform flowtest.as_root();
  n := expire_hq_linked_quotations(current_date + 1);
  perform flowtest.ok((select status from quotations where id = q.id) = 'draft', 'ใบ HQ ยังไม่หมดอายุ = ใบลูกค้ายังอยู่');
  n := expire_hq_linked_quotations(current_date + 3);
  perform flowtest.ok((select status from quotations where id = q.id) = 'expired' and n >= 1, 'ใบ HQ หมดอายุ → ใบลูกค้าที่ผูกอยู่หมดตาม (ร่างก็หมด)');
  perform flowtest.ok((select status from quotations where hq_quote_id = h1) = 'won', 'ใบที่ปิดการขายแล้วไม่ถูกทำให้หมดอายุ');

  raise notice 'ALL PASS';
end $$;
rollback;
