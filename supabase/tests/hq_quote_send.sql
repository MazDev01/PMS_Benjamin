-- ── ด่าน 2: ขั้น 5–6 · ตารางสถานะแถว "HQ ส่งใบ" · กฎ "ใบ HQ ที่ส่งแล้วแก้ไม่ได้" (FLOW.html) ─────────────────────
--   ขั้น 5  ทำ BOQ — ใช้ราคาแม่แบบที่ HQ เห็นคนเดียว
--   ขั้น 6  ส่งใบ HQ ให้ดีลเลอร์ — ล็อกเวอร์ชัน · หยุดนับ 14 วัน
--   แถว "HQ ส่งใบ": คำขอ → ส่งใบแล้ว · ลีดเป็น "ได้ราคา HQ" (ใบ 0219 · เดิมคงเดิม) · อีเมลถึงดีลเลอร์
--   กฎ: ใบ HQ ที่ส่งแล้วแก้ไม่ได้ ต้องออกเวอร์ชันใหม่ · ใบลูกค้าเดิมยังผูกกับเวอร์ชันที่ใช้
-- รัน: docker exec -i <คอนเทนเนอร์ฐานทดสอบ> psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/hq_quote_send.sql
-- ทุกอย่างอยู่ในทรานแซกชันเดียวแล้ว rollback ท้ายไฟล์ · ผ่าน = "ALL PASS"
begin;

create schema flowtest;
create table flowtest.t_ctx as
select
  (select id from profiles where role = 'DEALER_ADMIN' and dealer_code = 'CNX' limit 1) as cnx_uid,
  (select id from profiles where role = 'DEALER_ADMIN' and dealer_code = 'RYG' limit 1) as ryg_uid,
  (select id from profiles where role = 'SUPER_ADMIN' limit 1)                          as hq_uid,
  (select array_agg(num_id order by num_id) from (
     select num_id from leads where dealer_code = 'CNX' and status in ('WAITING','BULLET') order by num_id limit 2) x) as lead_ids;
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
declare
  c record; r quote_requests; r2 quote_requests; h hq_quotes; h2 hq_quotes; q quotations; n int; st text; mailbody text;
  lines jsonb := '[{"name":"โครงเหล็ก","qty":100,"unit":"ตร.ม.","unitCost":2500},{"name":"หลังคา","qty":100,"unit":"ตร.ม.","unitCost":450.5}]';
begin
  select * into c from flowtest.t_ctx;
  perform flowtest.ok(c.cnx_uid is not null and c.hq_uid is not null and array_length(c.lead_ids, 1) = 2, 'มีข้อมูลตั้งต้นครบ (CNX · HQ · ลูกค้าเป้าหมาย 2 ราย)');

  -- ผู้รับอีเมลฝั่งดีลเลอร์: CNX ยืนยันอีเมลติดต่อแล้ว · RYG มีอีเมลแต่ยังไม่ยืนยัน
  update profiles set contact_email = 'zz-cnx-contact@example.test' where id = c.cnx_uid;
  update profiles set contact_email_verified_at = now() where id = c.cnx_uid;
  update profiles set contact_email = 'zz-ryg-contact@example.test' where id = c.ryg_uid;
  delete from email_outbox where to_email like 'zz-%@example.test';

  -- ══ ขั้น 3–5: ดีลเลอร์ขอราคา → HQ ทำ BOQ (ร่างยังแก้ได้ · ดีลเลอร์ยังไม่เห็นร่าง) ══
  perform flowtest.as_dealer('CNX', c.cnx_uid);
  r := quote_request_submit(c.lead_ids[1], 'โกดังและคลังสินค้า');
  perform flowtest.as_hq(c.hq_uid);
  h := hq_quote_save(r.id, lines, current_date + 30, 'ร่างแรก');
  h := hq_quote_save(r.id, lines || '[{"name":"รางน้ำ","qty":10,"unit":"ม.","unitCost":100}]', current_date + 30, 'ร่างสอง');
  perform flowtest.ok(h.status = 'draft' and h.total_cost = 296050 and h.version = 1, 'ขั้น 5: ร่างใบ HQ แก้ซ้ำได้ ยอดรวมคิดจากรายการ (296,050) · เวอร์ชัน 1');
  perform flowtest.as_dealer('CNX', c.cnx_uid);
  perform flowtest.ok((select count(*) from hq_quotes where id = h.id) = 0, 'ขั้น 5: ดีลเลอร์ยังไม่เห็นร่างใบ HQ');
  perform flowtest.must_fail(format('select hq_quote_save(%s, %L::jsonb, current_date + 30)', r.id, lines), 'forbidden', 'ขั้น 5: ดีลเลอร์ทำใบ HQ เองไม่ได้');

  -- ══ ขั้น 6 + แถว "HQ ส่งใบ" ══
  perform flowtest.as_hq(c.hq_uid);
  h := hq_quote_send(r.id);
  perform flowtest.as_root();
  select status into st from quote_requests where id = r.id;
  perform flowtest.ok(h.status = 'sent' and st = 'quoted', 'แถว HQ ส่งใบ: ใบ HQ = ส่งแล้ว · คำขอ = ส่งใบแล้ว');
  select status into st from leads where dealer_code = 'CNX' and num_id = c.lead_ids[1];
  perform flowtest.ok(st = 'HQ_QUOTED', 'แถว HQ ส่งใบ: ลีดเป็นได้ราคา HQ (ใบ 0219) — ได้ ' || st);

  select count(*), max(o.body) into n, mailbody from email_outbox o where kind = 'hq_quote_sent' and ref_id = r.id::text and to_email = 'zz-cnx-contact@example.test';
  perform flowtest.ok(n = 1, 'แถว HQ ส่งใบ: อีเมลถึงดีลเลอร์ที่ยืนยันอีเมลติดต่อแล้ว 1 ฉบับ (ได้ ' || n || ')');
  perform flowtest.ok(position(h.quote_no in mailbody) > 0 and position(r.request_no in mailbody) > 0, 'อีเมลบอกเลขใบ HQ และเลขคำขอ');
  perform flowtest.ok(position('296,050' in mailbody) = 0 and position('296050' in mailbody) = 0 and position('2,500' in mailbody) = 0 and position('2500.' in mailbody) = 0,
    'อีเมลไม่มีตัวเลขต้นทุน (อีเมลส่งต่อถึงลูกค้าได้ง่าย — ดูต้นทุนในระบบ)');
  select count(*) into n from email_outbox where kind = 'hq_quote_sent' and ref_id = r.id::text and to_email not in ('zz-cnx-contact@example.test');
  perform flowtest.ok(n = 0, 'อีเมลส่งใบไม่ไปถึงผู้รับของ HQ หรือดีลเลอร์อื่น');

  -- ส่งซ้ำไม่ได้ · อีเมลไม่ซ้ำ
  perform flowtest.as_hq(c.hq_uid);
  perform flowtest.must_fail(format('select hq_quote_send(%s)', r.id), 'request_stage', 'ขั้น 6: ส่งใบซ้ำไม่ได้');

  -- ══ ขั้น 6: หยุดนับ 14 วัน — เลยกำหนดแล้วแต่ส่งใบแล้ว ไม่ขึ้นเกินกำหนด ══
  perform flowtest.as_root();
  update quote_requests set due_at = now() - interval '1 day' where id = r.id;
  update hq_notif_rules set email_recipients = array['zz-hq@example.test'] where id = 1;
  perform quote_requests_overdue_scan();
  select count(*) into n from email_outbox where kind = 'quote_request_overdue' and ref_id = r.id::text;
  perform flowtest.ok(n = 0, 'ขั้น 6: ส่งใบแล้วหยุดนับ 14 วัน — งานตรวจเกินกำหนดไม่แจ้งคำขอนี้');

  -- ══ กฎ: ใบ HQ ที่ส่งแล้วแก้ไม่ได้ ══
  perform flowtest.as_hq(c.hq_uid);
  perform flowtest.must_fail(format('select hq_quote_save(%s, %L::jsonb, current_date + 30)', r.id, lines), 'request_stage', 'กฎ: บันทึกรายการทับใบที่ส่งแล้วไม่ได้');
  perform flowtest.as_root();
  perform flowtest.must_fail(format('update hq_quotes set line_items = ''[]'' where id = %s', h.id), 'hq_quote_locked', 'กฎ: แก้รายการใบที่ส่งแล้วตรงที่ตารางไม่ได้ (แม้สิทธิ์สูงสุด)');
  perform flowtest.must_fail(format('update hq_quotes set total_cost = 1 where id = %s', h.id), 'hq_quote_locked', 'กฎ: แก้ยอดรวมใบที่ส่งแล้วไม่ได้');
  perform flowtest.must_fail(format('update hq_quotes set valid_until = current_date + 99 where id = %s', h.id), 'hq_quote_locked', 'กฎ: แก้วันยืนราคาใบที่ส่งแล้วไม่ได้');
  perform flowtest.must_fail(format('delete from hq_quotes where id = %s', h.id), 'hq_quote_locked', 'กฎ: ลบใบที่ส่งแล้วไม่ได้');

  -- ══ กฎ: ออกเวอร์ชันใหม่ · ใบลูกค้าเดิมยังผูกกับเวอร์ชันที่ใช้ ══
  perform flowtest.as_dealer('CNX', c.cnx_uid);
  insert into quotations (id, dealer_code, quote_no, customer, total, status, date, hq_quote_id, markup_percent, line_items, items)
  values ('ZZ-Q-HQSEND', 'CNX', 'ZZ-Q-HQSEND', 'ZZ ลูกค้า', 0, 'draft', to_char(current_date, 'DD/MM/YYYY'), h.id, 20, '[]', 0)
  returning * into q;
  r2 := quote_request_reprice(r.id, 'ลูกค้าขอเพิ่มพื้นที่');
  perform flowtest.as_hq(c.hq_uid);
  perform hq_quote_save(r2.id, lines, current_date + 30);
  h2 := hq_quote_send(r2.id);
  perform flowtest.as_root();
  perform flowtest.ok(h2.version = 2 and h2.quote_no like '%-V2', 'กฎ: ขอแก้ราคา = ใบ HQ เวอร์ชันใหม่ (' || h2.quote_no || ')');
  perform flowtest.ok((select status from hq_quotes where id = h.id) = 'superseded'
                  and (select line_items from hq_quotes where id = h.id) = h.line_items, 'กฎ: เวอร์ชันเดิมถูกแทนที่ แต่เนื้อใบเดิมไม่เปลี่ยน');
  perform flowtest.ok((select hq_quote_id from quotations where id = q.id) = h.id, 'กฎ: ใบลูกค้าเดิมยังผูกกับเวอร์ชันที่ใช้ (V1)');
  select count(*) into n from email_outbox where kind = 'hq_quote_sent' and ref_id = r2.id::text and to_email = 'zz-cnx-contact@example.test';
  perform flowtest.ok(n = 1, 'ส่งเวอร์ชันใหม่ = อีเมลถึงดีลเลอร์อีกฉบับ');

  -- ══ อีเมลไม่ไปที่อยู่ที่ยังไม่ยืนยัน ══
  perform flowtest.as_root();
  update profiles set contact_email_verified_at = null where id = c.cnx_uid;
  perform flowtest.as_dealer('CNX', c.cnx_uid);
  r := quote_request_submit(c.lead_ids[2], 'โกดังและคลังสินค้า');
  perform flowtest.as_hq(c.hq_uid);
  perform hq_quote_save(r.id, lines, current_date + 30);
  perform hq_quote_send(r.id);
  perform flowtest.as_root();
  select count(*) into n from email_outbox where kind = 'hq_quote_sent' and ref_id = r.id::text;
  perform flowtest.ok(n = 0, 'ดีลเลอร์ยังไม่ยืนยันอีเมลติดต่อ = ไม่ส่งอีเมล (ส่งใบได้ตามปกติ)');

  raise notice 'ALL PASS';
end $$;
rollback;
