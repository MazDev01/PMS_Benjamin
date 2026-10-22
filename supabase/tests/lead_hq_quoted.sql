-- ── ข้อทดสอบใบ 0218/0219/0221: สถานะ "ได้ราคา HQ" และลีดที่ปิดแล้ว (บอสสั่ง 19–20 ต.ค. 69 · รอบ 2 ช่วง ก2) ─────────────
--   1) HQ ส่งใบ → ลีด รอราคา HQ → ได้ราคา HQ (ฐานขยับเอง)
--   2) ได้ราคา HQ ตั้งเองไม่ได้ · ออกเองไม่ได้ ยกเว้นเสียโอกาส (+ คำขอปิด lost ตาม) · งานติ๊กแล้วไม่เลื่อนขั้นเอง
--   3) ดีลเลอร์ส่งใบให้ลูกค้า → เสนอราคา
--   4) ใบ HQ หมดอายุ ขณะได้ราคา HQ → รวบรวมความต้องการ + ไทม์ไลน์ hq_expired (กระดิ่ง) · ใบ HQ ยังใช้ได้ = ไม่แตะ
--      ขอแก้ราคาต่อได้ → รอราคา HQ
--   5) ลีดปิดการขายสำเร็จ: ทำใบใหม่ / เปิดคำขอใหม่ ไม่ได้ (lead_closed)
-- รัน: docker exec -i supabase_db_pms-dbcheck psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 < supabase/tests/lead_hq_quoted.sql
-- ทรานแซกชันเดียวแล้ว rollback · รอบปิดด่านรันผ่าน tests/scenario/db-rule-tests.spec.ts · ผ่าน = "ALL PASS"
begin;
create schema qtest;
create function qtest.ok(p_cond boolean, p_what text) returns void language plpgsql as $$
begin if p_cond is not true then raise exception 'FAIL: %', p_what; end if; raise notice 'ok  %', p_what; end $$;
create function qtest.must_fail(p_sql text, p_like text, p_what text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if sqlerrm ilike '%' || p_like || '%' then raise notice 'ok  % (ถูกปฏิเสธ)', p_what; return; end if;
    raise exception 'FAIL: % — ถูกปฏิเสธแต่ข้อความไม่ตรง: %', p_what, sqlerrm;
  end;
  raise exception 'FAIL: % — ควรถูกปฏิเสธแต่ผ่าน', p_what;
end $$;
create function qtest.as_dealer() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);   -- หาบัญชีด้วยสิทธิ์ผู้ดูแลฐาน (ตัวตนเดิมอาจเป็นดีลเลอร์ที่มองไม่เห็นโปรไฟล์อื่น)
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.profiles where role = 'DEALER_ADMIN' and dealer_code = 'CNX' limit 1),
    'role', 'authenticated', 'user_role', 'DEALER_ADMIN', 'dealer_code', 'CNX')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function qtest.as_hq() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);   -- หาบัญชีด้วยสิทธิ์ผู้ดูแลฐาน (ตัวตนเดิมอาจเป็นดีลเลอร์ที่มองไม่เห็นโปรไฟล์อื่น)
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.profiles where role = 'SUPER_ADMIN' limit 1),
    'role', 'authenticated', 'user_role', 'SUPER_ADMIN', 'dealer_code', '')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function qtest.as_db() returns void language plpgsql as $$
begin perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '', true); end $$;
/** ลีดใหม่ของ CNX + คำขอราคา + HQ ส่งใบ (ยืนราคาถึง p_valid) — คืนเลขลีด */
create function qtest.lead_with_hq_quote(p_tag text, p_valid date) returns int language plpgsql as $$
declare n int; rid bigint;
begin
  perform qtest.as_db();
  n := (select coalesce(max(num_id), 0) from public.leads where dealer_code = 'CNX') + 1;
  insert into public.leads (id, num_id, dealer_code, company, name, contact, phone, province, status)
  values ('#L-' || n, n, 'CNX', 'ZZTEST-ได้ราคา-' || p_tag, 'ZZTEST-ได้ราคา-' || p_tag, 'ผู้ทดสอบ', '000-000-' || lpad((n % 10000)::text, 4, '0'), 'เชียงใหม่', 'BULLET');
  perform qtest.as_dealer();
  rid := (public.quote_request_submit(n, 'โกดังสำเร็จรูป')).id;
  perform qtest.as_hq();
  perform public.hq_quote_save(rid, '[{"name":"โครงเหล็ก","qty":1,"unit":"ชุด","unitCost":1000}]'::jsonb, (now() at time zone 'Asia/Bangkok')::date + 30);
  perform public.hq_quote_send(rid);
  if p_valid is not null then   -- ย้อนวันยืนราคาเพื่อจำลองหมดอายุ (ใบที่ส่งแล้วแก้ไม่ได้ — ปิดตัวกันชั่วคราวในทรานแซกชันนี้)
    perform qtest.as_db();
    alter table public.hq_quotes disable trigger hq_quotes_lock_sent;
    update public.hq_quotes set valid_until = p_valid where request_id = rid;
    alter table public.hq_quotes enable trigger hq_quotes_lock_sent;
  end if;
  perform qtest.as_db();
  return n;
end $$;
grant usage on schema qtest to authenticated;
grant execute on all functions in schema qtest to authenticated;

do $$
declare a int; b int; c int; d int; v_st lead_status; v_id text; v_req text; v_txt text; rid bigint; q quotations;
  วันนี้ date := (now() at time zone 'Asia/Bangkok')::date;
begin
  -- ── 1 ──
  a := qtest.lead_with_hq_quote('ก', null);
  select status, id into v_st, v_id from leads where dealer_code = 'CNX' and num_id = a;
  perform qtest.ok(v_st = 'HQ_QUOTED', '1) HQ ส่งใบ → ลีดเป็น "ได้ราคา HQ" — ได้ ' || v_st);

  -- ── 2 ──
  perform qtest.as_dealer();
  perform qtest.must_fail(format($s$select lead_apply(%L, '{"stage":{"status":"NEGO"}}'::jsonb)$s$, v_id), 'hq_quoted_locked', '2) ดีลเลอร์พาออกจากได้ราคา HQ ไปเจรจาต่อรองเอง');
  perform qtest.must_fail(format('update leads set status = %L where dealer_code = %L and num_id = %s', 'HQ_QUOTED', 'CNX',
    (select num_id from leads where dealer_code = 'CNX' and status = 'WAITING' limit 1)), 'hq_quoted_locked', '2) ดีลเลอร์ตั้ง "ได้ราคา HQ" เอง');
  perform lead_apply(v_id, '{"deriveStage":"any","tasks":[]}'::jsonb);
  select status into v_st from leads where dealer_code = 'CNX' and num_id = a;
  perform qtest.ok(v_st = 'HQ_QUOTED', '2) งานติ๊กแล้วไม่เลื่อนขั้นออกจากได้ราคา HQ เอง');

  b := qtest.lead_with_hq_quote('ข', null);
  perform qtest.as_dealer();
  perform lead_apply((select id from leads where dealer_code = 'CNX' and num_id = b), '{"stage":{"status":"CANCELLED","lostReason":"ลูกค้าเลือกเจ้าอื่น"}}'::jsonb);
  perform qtest.as_db();
  select status::text into v_req from quote_requests where dealer_code = 'CNX' and lead_num_id = b;
  perform qtest.ok(v_req = 'lost', '2) เสียโอกาสตอนได้ราคา HQ → คำขอปิด lost ตาม — ได้ ' || v_req);

  -- ── 3 ──
  perform qtest.as_dealer();
  q := create_quotation('CNX', 'Q-', jsonb_build_object('customer', 'ZZTEST-ได้ราคา-ก', 'project', 'x', 'total', '0', 'status', 'draft',
         'line_items', '[{"name":"โครงเหล็ก","qty":1,"unit":"ชุด","unitPrice":0,"markupPct":10}]'::jsonb, 'items', 1,
         'hq_quote_id', (select h.id from hq_quotes h join quote_requests r on r.id = h.request_id where r.dealer_code = 'CNX' and r.lead_num_id = a),
         'deal_id', a));
  select status into v_st from leads where dealer_code = 'CNX' and num_id = a;
  perform qtest.ok(v_st = 'HQ_QUOTED', '3) ทำใบร่างให้ลูกค้า ยังเป็นได้ราคา HQ');
  update quotations set status = 'sent_to_client' where dealer_code = 'CNX' and id = q.id;
  select status into v_st from leads where dealer_code = 'CNX' and num_id = a;
  perform qtest.ok(v_st = 'QUOTED', '3) ส่งใบให้ลูกค้า → เสนอราคา — ได้ ' || v_st);

  -- ── 4 ──
  c := qtest.lead_with_hq_quote('ค', วันนี้ - 1);   -- หมดอายุแล้ว
  d := qtest.lead_with_hq_quote('ง', null);         -- ยังใช้ได้
  perform expire_hq_linked_quotations();
  select status into v_st from leads where dealer_code = 'CNX' and num_id = c;
  perform qtest.ok(v_st = 'BULLET', '4) ใบ HQ หมดอายุ ขณะได้ราคา HQ → รวบรวมความต้องการ — ได้ ' || v_st);
  select x ->> 'text' into v_txt from leads, jsonb_array_elements(activities) x where dealer_code = 'CNX' and num_id = c and x ->> 'type' = 'hq_expired';
  perform qtest.ok(v_txt like '%หมดอายุ%ขอราคาใหม่%', '4) ไทม์ไลน์จดเหตุการณ์ราคา HQ หมดอายุ (กระดิ่งอ่านจากตรงนี้)');
  select status into v_st from leads where dealer_code = 'CNX' and num_id = d;
  perform qtest.ok(v_st = 'HQ_QUOTED', '4) ใบ HQ ยังใช้ได้ → ไม่แตะ');
  perform expire_hq_linked_quotations();
  perform qtest.ok((select count(*) from leads, jsonb_array_elements(activities) x where dealer_code = 'CNX' and num_id = c and x ->> 'type' = 'hq_expired') = 1,
    '4) รันซ้ำไม่จดซ้ำ');
  perform qtest.as_dealer();
  rid := (select id from quote_requests where dealer_code = 'CNX' and lead_num_id = c and status = 'quoted');
  perform quote_request_reprice(rid, 'ราคาหมดอายุ ขอใหม่');
  perform qtest.as_db();
  select status into v_st from leads where dealer_code = 'CNX' and num_id = c;
  perform qtest.ok(v_st = 'HQ_PRICING', '4) ขอแก้ราคาหลังหมดอายุ → รอราคา HQ — ได้ ' || v_st);

  -- ── 5 ──
  -- ตั้งฉาก "ปิดสำเร็จแล้ว" ตรง ๆ (ปิดตัวดักชั่วคราว) — ทางของระบบตอนนี้ต้องมีใบที่ตอบรับ (ใบ 0232) ซึ่งไม่ใช่สิ่งที่ข้อนี้ทดสอบ
  set local session_replication_role = replica;
  update leads set status = 'PAID' where dealer_code = 'CNX' and num_id = d;
  set local session_replication_role = origin;
  perform qtest.as_dealer();
  perform qtest.must_fail(format($s$select create_quotation('CNX', 'Q-', jsonb_build_object('customer','x','project','x','total','0','status','draft',
      'line_items','[{"name":"โครงเหล็ก","qty":1,"unit":"ชุด","unitPrice":0,"markupPct":0}]'::jsonb,'items',1,
      'hq_quote_id',(select h.id from hq_quotes h join quote_requests r on r.id = h.request_id where r.dealer_code = 'CNX' and r.lead_num_id = %s),'deal_id',%s))$s$, d, d),
    'lead_closed', '5) ลีดปิดการขายแล้ว ทำใบใหม่ไม่ได้');
  perform qtest.must_fail(format('select quote_request_reprice((select id from quote_requests where dealer_code = %L and lead_num_id = %s), %L)', 'CNX', d, 'ขอใหม่'),
    'lead_closed', '5) ลีดปิดการขายแล้ว ขอแก้ราคาไม่ได้');

  raise notice 'ALL PASS';
end $$;
rollback;
