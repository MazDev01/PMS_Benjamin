-- ── ทดสอบใบ 0189: ลบดีลเลอร์ / ย้ายข้อมูลดีลเลอร์ กับคำขอราคาและใบ HQ · ผู้รับของใบ HQ ถูกจำไว้ตอนส่ง ──────
-- รัน: docker exec -i <คอนเทนเนอร์ฐานทดสอบ> psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/dealer_admin_quote_requests.sql
-- ทุกอย่างอยู่ในทรานแซกชันเดียวแล้ว rollback ท้ายไฟล์ — ไม่ทิ้งข้อมูลไว้ในฐาน
--   (ต้องทดสอบที่ระดับฐาน: ใบ HQ ที่ส่งแล้วลบไม่ได้แม้ด้วยสิทธิ์เซิร์ฟเวอร์ ข้อทดสอบผ่านหน้าเว็บจะเก็บกวาดตัวเองไม่ได้)
-- ผ่าน = บรรทัดสุดท้ายขึ้น "ALL PASS" · ตกข้อไหนหยุดที่ข้อนั้นพร้อมข้อความ
begin;

create schema flowtest;
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

do $$
declare
  ra bigint; rb bigint; rc bigint; h hq_quotes; n int; s text; t text; ev int;
begin
  -- เตรียม: สาขา ก (ต้นทาง) · สาขา ข (ปลายทาง) · สาขา ค (มีแต่คำขอราคา ใบ HQ ยังเป็นร่าง)
  insert into dealers (code, name, province, region, status) values
    ('ZTXA', 'สาขาทดสอบ ก', 'ระยอง', 'ตะวันออก', 'active'),
    ('ZTXB', 'สาขาทดสอบ ข', 'ระยอง', 'ตะวันออก', 'active'),
    ('ZTXC', 'สาขาทดสอบ ค', 'ระยอง', 'ตะวันออก', 'active');
  insert into leads (id, dealer_code, num_id, name, company, phone, province) values
    ('#T9-7', 'ZTXA', 990000007, 'ก', 'บจ. ทดสอบย้าย-หนึ่ง', '081-000-0001', 'ระยอง'),
    ('#T9-3', 'ZTXA', 990000003, 'ข', 'บจ. ทดสอบย้าย-สอง',  '081-000-0002', 'ระยอง'),
    ('#T9-5', 'ZTXC', 990000005, 'ค', 'บจ. ทดสอบย้าย-สาม',  '081-000-0003', 'ระยอง');
  insert into quote_requests (request_no, dealer_code, lead_num_id, status, due_at) values ('T9-RQ-A', 'ZTXA', 990000007, 'pricing', now() + interval '14 days') returning id into ra;
  insert into quote_requests (request_no, dealer_code, lead_num_id, status, due_at) values ('T9-RQ-B', 'ZTXA', 990000003, 'new',     now() + interval '14 days') returning id into rb;
  insert into quote_requests (request_no, dealer_code, lead_num_id, status, due_at) values ('T9-RQ-C', 'ZTXC', 990000005, 'pricing', now() + interval '14 days') returning id into rc;
  insert into hq_quotes (request_id, version, quote_no, total_cost) values (ra, 1, 'T9-HQ-A', 250000);
  insert into hq_quotes (request_id, version, quote_no, total_cost) values (rc, 1, 'T9-HQ-C', 90000);

  -- ══ ก. ผู้รับของใบ HQ ถูกจำไว้ตอนส่ง ══
  select * into h from hq_quotes where quote_no = 'T9-HQ-A';
  perform flowtest.ok(h.recipient_dealer_code = '' and h.recipient_dealer_name = '', 'ใบ HQ ฉบับร่างยังไม่มีผู้รับที่จำไว้');
  update hq_quotes set recipient_dealer_code = 'RYG', recipient_dealer_name = 'ปลอม' where quote_no = 'T9-HQ-A';
  select * into h from hq_quotes where quote_no = 'T9-HQ-A';
  perform flowtest.ok(h.recipient_dealer_code = '', 'ฉบับร่าง: ใส่ผู้รับเองไม่ได้ (ระบบล้างทิ้ง)');
  update hq_quotes set status = 'sent', sent_at = now(), recipient_dealer_code = 'RYG', recipient_dealer_name = 'ปลอม' where quote_no = 'T9-HQ-A';
  select * into h from hq_quotes where quote_no = 'T9-HQ-A';
  perform flowtest.ok(h.recipient_dealer_code = 'ZTXA' and h.recipient_dealer_name = 'สาขาทดสอบ ก',
    'ส่งใบ HQ → จำผู้รับเป็นสาขาเจ้าของคำขอ ณ ตอนส่ง (รหัส + ชื่อ) ไม่ใช่ค่าที่ผู้ส่งใส่มา');
  perform flowtest.must_fail('update hq_quotes set recipient_dealer_code = ''ZTXB'' where quote_no = ''T9-HQ-A''', 'hq_quote_locked', 'แก้รหัสผู้รับหลังส่ง');
  perform flowtest.must_fail('update hq_quotes set recipient_dealer_name = ''ชื่ออื่น'' where quote_no = ''T9-HQ-A''', 'hq_quote_locked', 'แก้ชื่อผู้รับหลังส่ง');
  insert into hq_quotes (request_id, version, quote_no, status, sent_at, recipient_dealer_code) values (rb, 1, 'T9-HQ-B', 'sent', now(), 'RYG');
  select * into h from hq_quotes where quote_no = 'T9-HQ-B';
  perform flowtest.ok(h.recipient_dealer_code = 'ZTXA' and h.recipient_dealer_name = 'สาขาทดสอบ ก', 'ใบ HQ ที่ถูกสร้างเป็น "ส่งแล้ว" ตั้งแต่แรก ก็ถูกจำผู้รับจากคำขอ');

  -- ══ ข. ลบสาขา ══
  perform flowtest.must_fail('select * from delete_dealer_atomic(''ZTXA'')', 'dealer_has_hq_quote',
    'สาขาที่มีใบ HQ ส่งแล้ว ลบไม่ได้ — เหตุผลต้องบอกว่ามีใบ HQ (ไม่ใช่แค่ "ยังมีข้อมูล")');
  perform flowtest.must_fail('select * from delete_dealer_atomic(''ZTXC'')', 'dealer_has_data:quote_requests:1',
    'สาขาที่มีคำขอราคา (ใบ HQ ยังเป็นร่าง) ลบไม่ได้ — เหตุผลคือคำขอราคา');

  -- ══ ค. ย้ายข้อมูล ก → ข ══
  select count(*) into ev from quote_request_events where request_id in (ra, rb);
  select string_agg(entity || '=' || moved, ',' order by entity) into s from move_dealer_data_atomic('ZTXA', 'ZTXB') where entity in ('quote_requests', 'hq_quotes', 'leads');
  perform flowtest.ok(s = 'hq_quotes=2,leads=2,quote_requests=2', 'ย้ายแล้วรายงานจำนวนลูกค้าเป้าหมาย คำขอราคา และใบ HQ ครบ (ได้ ' || coalesce(s, 'ว่าง') || ')');
  select count(*) into n from quote_requests where dealer_code = 'ZTXA';
  perform flowtest.ok(n = 0, 'ไม่มีคำขอราคาค้างที่สาขาต้นทาง');
  select string_agg(r.request_no || '→' || r.dealer_code || '/' || l.company, ' ' order by r.request_no) into s
    from quote_requests r join leads l on l.dealer_code = r.dealer_code and l.num_id = r.lead_num_id where r.id in (ra, rb);
  perform flowtest.ok(s = 'T9-RQ-A→ZTXB/บจ. ทดสอบย้าย-หนึ่ง T9-RQ-B→ZTXB/บจ. ทดสอบย้าย-สอง',
    'คำขอราคาไปอยู่สาขาปลายทาง และยังชี้ลูกค้าเป้าหมายรายเดิม (ได้ ' || coalesce(s, 'ว่าง') || ')');
  select l.company into t from hq_quotes q join quote_requests r on r.id = q.request_id
    join leads l on l.dealer_code = r.dealer_code and l.num_id = r.lead_num_id where q.quote_no = 'T9-HQ-A';
  perform flowtest.ok(t = 'บจ. ทดสอบย้าย-หนึ่ง', 'ใบ HQ ยังเป็นของลูกค้าเป้าหมายรายเดิมหลังย้าย');
  select count(*) into n from quote_request_events where request_id in (ra, rb);
  perform flowtest.ok(n = ev, 'ประวัติคำขอราคาเท่าเดิม ไม่หายและไม่งอก');

  -- ══ ง. ผู้รับที่จำไว้ไม่เปลี่ยนตามการย้ายหรือการเปลี่ยนชื่อสาขา ══
  select * into h from hq_quotes where quote_no = 'T9-HQ-A';
  perform flowtest.ok(h.recipient_dealer_code = 'ZTXA' and h.recipient_dealer_name = 'สาขาทดสอบ ก',
    'ออกใบ HQ ให้สาขา ก → ย้ายข้อมูลไป ข → ใบยังแสดงผู้รับเป็นสาขา ก (ได้ ' || h.recipient_dealer_code || ' · ' || h.recipient_dealer_name || ')');
  update dealers set name = 'สาขาทดสอบ ก (เปลี่ยนชื่อ)' where code = 'ZTXA';
  select * into h from hq_quotes where quote_no = 'T9-HQ-A';
  perform flowtest.ok(h.recipient_dealer_name = 'สาขาทดสอบ ก', 'เปลี่ยนชื่อสาขาทีหลัง ชื่อผู้รับบนใบที่ส่งแล้วไม่เปลี่ยน');
  update hq_quotes set status = 'ordered', ordered_at = now() where quote_no = 'T9-HQ-A';
  select * into h from hq_quotes where quote_no = 'T9-HQ-A';
  perform flowtest.ok(h.status = 'ordered' and h.recipient_dealer_code = 'ZTXA', 'เปลี่ยนสถานะใบที่ส่งแล้ว (ลูกค้าตอบรับ) ยังทำได้ และผู้รับไม่เปลี่ยน');

  -- ══ จ. หลังย้ายออกหมด ลบสาขาต้นทางได้ · สาขาปลายทางรับใบ HQ มาแล้วจึงลบไม่ได้ ══
  perform delete_dealer_atomic('ZTXA');
  select count(*) into n from dealers where code = 'ZTXA';
  perform flowtest.ok(n = 0, 'ย้ายออกหมดแล้ว ลบสาขาต้นทางได้');
  select * into h from hq_quotes where quote_no = 'T9-HQ-A';
  perform flowtest.ok(h.recipient_dealer_code = 'ZTXA' and h.recipient_dealer_name = 'สาขาทดสอบ ก', 'ลบสาขาต้นทางแล้ว ใบยังจำผู้รับเดิมไว้');
  perform flowtest.must_fail('select * from delete_dealer_atomic(''ZTXB'')', 'dealer_has_hq_quote', 'สาขาปลายทางที่รับใบ HQ มาแล้ว ลบไม่ได้');
  raise notice 'ALL PASS';
end $$;

rollback;
