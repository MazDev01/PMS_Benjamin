-- ── ข้อทดสอบใบ 0226: ใบเสนอราคาส่งให้ลูกค้าแล้ว ล็อกเนื้อหาทั้งใบ · ใบร่างแก้ได้ (รอบ 3 ข้อ 1 · บอสสั่ง 20 ต.ค. 69) ─────────
--   ใบร่าง: แก้ชื่อลูกค้า โครงการ จังหวัด พื้นที่ และ % ได้ · ราคาคิดจาก % ที่ฐาน (ส่งราคาเองไม่มีผล)
--   ส่งแล้ว: แก้ทุกช่องข้างบนไม่ได้ (ดีลเลอร์และฝั่งเซิร์ฟเวอร์) · เปลี่ยนสถานะ/เหตุผล/ผูกลูกค้ายังได้ · ส่งแถวเดิมกลับทั้งแถวไม่ถูกปฏิเสธ
-- รัน: docker exec -i supabase_db_pms-dbcheck psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 < supabase/tests/quote_sent_lock.sql
-- ทรานแซกชันเดียวแล้ว rollback · รอบปิดด่านรันผ่าน tests/scenario/db-rule-tests.spec.ts · ผ่าน = "ALL PASS"
begin;
create schema sltest;
create function sltest.ok(p_cond boolean, p_what text) returns void language plpgsql as $$
begin if p_cond is not true then raise exception 'FAIL: %', p_what; end if; raise notice 'ok  %', p_what; end $$;
create function sltest.must_fail(p_sql text, p_like text, p_what text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if sqlerrm ilike '%' || p_like || '%' then raise notice 'ok  % (ถูกปฏิเสธ)', p_what; return; end if;
    raise exception 'FAIL: % — ถูกปฏิเสธแต่ข้อความไม่ตรง: %', p_what, sqlerrm;
  end;
  raise exception 'FAIL: % — ควรถูกปฏิเสธแต่ผ่าน', p_what;
end $$;
create function sltest.as_dealer() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.profiles where role = 'DEALER_ADMIN' and dealer_code = 'CNX' limit 1),
    'role', 'authenticated', 'user_role', 'DEALER_ADMIN', 'dealer_code', 'CNX')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function sltest.as_hq() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.profiles where role = 'SUPER_ADMIN' limit 1),
    'role', 'authenticated', 'user_role', 'SUPER_ADMIN', 'dealer_code', '')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function sltest.as_server() returns void language plpgsql as $$
begin perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '', true); perform set_config('role', 'service_role', true); end $$;
create function sltest.as_db() returns void language plpgsql as $$
begin perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '', true); end $$;
grant usage on schema sltest to authenticated, service_role;
grant execute on all functions in schema sltest to authenticated, service_role;

do $$
declare n int; rid bigint; qid text; q quotations; ก่อน quotations; ช่อง text;
begin
  perform sltest.as_db();
  n := (select coalesce(max(num_id), 0) from public.leads where dealer_code = 'CNX') + 1;
  insert into public.leads (id, num_id, dealer_code, company, name, contact, phone, province, status)
  values ('#L-' || n, n, 'CNX', 'ZZTEST-ล็อกใบส่งแล้ว', 'ZZTEST-ล็อกใบส่งแล้ว', 'ผู้ทดสอบ', '000-000-' || lpad((n % 10000)::text, 4, '0'), 'เชียงใหม่', 'BULLET');
  perform sltest.as_dealer();
  rid := (public.quote_request_submit(n, 'โกดังสำเร็จรูป')).id;
  perform sltest.as_hq();
  perform public.hq_quote_save(rid, '[{"name":"โครงเหล็ก","qty":2,"unit":"ชุด","unitCost":1000000},{"name":"หลังคา","qty":1,"unit":"งาน","unitCost":500000}]'::jsonb,
    (now() at time zone 'Asia/Bangkok')::date + 30);
  perform public.hq_quote_send(rid);
  perform sltest.as_dealer();
  qid := (public.create_quotation('CNX', 'Q-', jsonb_build_object('customer', 'ZZTEST-ลูกค้าเดิม', 'project', 'ZZTEST-โครงการเดิม', 'province', 'เชียงใหม่', 'area', '100',
    'total', '0', 'status', 'draft', 'date', (now() at time zone 'Asia/Bangkok')::date,
    'line_items', '[{"name":"โครงเหล็ก","qty":2,"unit":"ชุด","unitPrice":0,"markupPct":10},{"name":"หลังคา","qty":1,"unit":"งาน","unitPrice":0,"markupPct":10}]'::jsonb,
    'items', 2, 'hq_quote_id', (select id from hq_quotes where request_id = rid), 'deal_id', n, 'markup_percent', 10))).id;
  select * into q from quotations where dealer_code = 'CNX' and id = qid;
  perform sltest.ok(q.status = 'draft' and q.total_value = 2750000, 'ตั้งต้น: ใบร่างจากใบ HQ +10% = 2,750,000');

  -- 1) ใบร่าง: แก้ชื่อลูกค้า โครงการ จังหวัด พื้นที่ และ % ได้ · ใส่ราคาเองไม่มีผล (ราคา = ต้นทุน × (1 + %))
  update quotations set customer = 'ZZTEST-ลูกค้าใหม่', project = 'ZZTEST-โครงการใหม่', province = 'ลำพูน', area = '250',
    line_items = '[{"name":"โครงเหล็ก","qty":2,"unit":"ชุด","unitPrice":1,"markupPct":20},{"name":"หลังคา","qty":1,"unit":"งาน","unitPrice":1,"markupPct":0}]'::jsonb
   where dealer_code = 'CNX' and id = qid;
  select * into q from quotations where dealer_code = 'CNX' and id = qid;
  perform sltest.ok(q.customer = 'ZZTEST-ลูกค้าใหม่' and q.project = 'ZZTEST-โครงการใหม่' and q.province = 'ลำพูน' and q.area = '250',
    '1) ใบร่าง: แก้ชื่อลูกค้า โครงการ จังหวัด พื้นที่ ได้');
  perform sltest.ok(q.total_value = 2900000 and (q.line_items -> 0 ->> 'unitPrice')::numeric = 1200000,
    '1) ใบร่าง: แก้ % ได้ · ราคาที่พิมพ์เองถูกทิ้ง คิดจาก % (2×1.2 ล้าน + 5 แสน = 2,900,000)');

  -- 2) ส่งให้ลูกค้า
  update quotations set status = 'sent_to_client' where dealer_code = 'CNX' and id = qid;
  select * into ก่อน from quotations where dealer_code = 'CNX' and id = qid;
  perform sltest.ok(ก่อน.status = 'sent_to_client', '2) ส่งให้ลูกค้าได้');

  -- 3) ส่งแล้ว: ดีลเลอร์แก้ทุกช่องไม่ได้
  foreach ช่อง in array array[
    format('customer = %L', 'ZZTEST-แอบเปลี่ยนลูกค้า'), format('project = %L', 'ZZTEST-แอบเปลี่ยนโครงการ'),
    format('province = %L', 'ลำปาง'), format('area = %L', '999'),
    $j$line_items = '[{"name":"โครงเหล็ก","qty":2,"unit":"ชุด","unitPrice":0,"markupPct":50},{"name":"หลังคา","qty":1,"unit":"งาน","unitPrice":0,"markupPct":0}]'::jsonb$j$,
    'markup_percent = 30', 'vat_percent = 0', 'wht_rate = 5', $j$revision = 'V9'$j$] loop
    perform sltest.must_fail(format('update quotations set %s where dealer_code = %L and id = %L', ช่อง, 'CNX', qid),
      'quote_sent_locked', '3) ดีลเลอร์: ใบส่งแล้วแก้ไม่ได้ — ' || split_part(ช่อง, ' =', 1));
  end loop;

  -- 4) ฝั่งเซิร์ฟเวอร์ (service role) ก็แก้ไม่ได้ — ล็อกอยู่ที่ตาราง ไม่ใช่ที่หน้าจอ
  perform sltest.as_server();
  perform sltest.must_fail(format('update quotations set customer = %L where dealer_code = %L and id = %L', 'ZZTEST-เซิร์ฟเวอร์', 'CNX', qid),
    'quote_sent_locked', '4) ฝั่งเซิร์ฟเวอร์: ใบส่งแล้วแก้ชื่อลูกค้าไม่ได้');
  perform sltest.must_fail(format($s$update quotations set line_items = '[{"name":"โครงเหล็ก","qty":2,"unit":"ชุด","unitPrice":0,"markupPct":1},{"name":"หลังคา","qty":1,"unit":"งาน","unitPrice":0,"markupPct":1}]'::jsonb where dealer_code = %L and id = %L$s$, 'CNX', qid),
    'quote_sent_locked', '4) ฝั่งเซิร์ฟเวอร์: ใบส่งแล้วแก้ % ไม่ได้');

  -- 5) ส่งแถวเดิมกลับทั้งแถว (แบบที่หน้าเว็บบันทึก) ไม่ถูกปฏิเสธ · ค่าไม่เปลี่ยน
  perform sltest.as_dealer();
  update quotations set customer = ก่อน.customer, project = ก่อน.project, province = ก่อน.province, area = ก่อน.area,
    line_items = ก่อน.line_items, markup_percent = ก่อน.markup_percent, vat_percent = ก่อน.vat_percent, wht_rate = ก่อน.wht_rate
   where dealer_code = 'CNX' and id = qid;
  select * into q from quotations where dealer_code = 'CNX' and id = qid;
  perform sltest.ok(q.total_value = ก่อน.total_value and q.customer = ก่อน.customer, '5) ส่งค่าเดิมกลับทั้งแถว ไม่ถูกปฏิเสธ');
  -- 5ข) ค่าเดียวกันคนละรูปแบบที่หน้าเว็บส่งกลับ (rowMappers.ts) ไม่นับว่าแก้: ว่าง ↔ "" · พื้นที่ "250" ↔ "250.0" · ว่าง ↔ "0"
  update quotations set area = '250.0', building_type = '' where dealer_code = 'CNX' and id = qid;
  perform sltest.ok(true, '5ข) พื้นที่ 250 → "250.0" และประเภทงานว่าง → "" ไม่ถูกปฏิเสธ');
  perform sltest.as_db();
  perform sltest.ok(_quote_lock_area(null) is not distinct from _quote_lock_area('0') and _quote_lock_area('') is not distinct from _quote_lock_area('0')
    and _quote_lock_area('450.50') = _quote_lock_area('450.5') and _quote_lock_area('450') is distinct from _quote_lock_area('451')
    and _quote_lock_text(null) is not distinct from _quote_lock_text('  ') and _quote_lock_text('ก') is distinct from _quote_lock_text('ข'),
    '5ข) ตัวเทียบ: ว่าง = "" = "0" (พื้นที่) · 450.50 = 450.5 · 450 ≠ 451 · ชื่อต่างกันยังนับว่าแก้');
  perform sltest.as_dealer();

  -- 6) ขั้นตอนขายยังเดินได้: ลูกค้าปฏิเสธ (พร้อมเหตุผล) · ผูกลูกค้า
  update quotations set status = 'lost', lost_reason = 'ZZTEST-ราคาสูง' where dealer_code = 'CNX' and id = qid;
  select * into q from quotations where dealer_code = 'CNX' and id = qid;
  perform sltest.ok(q.status = 'lost' and q.lost_reason = 'ZZTEST-ราคาสูง', '6) ส่งแล้ว → ลูกค้าปฏิเสธพร้อมเหตุผลได้');
  perform sltest.as_db();
  update quotations set customer_id = (select id from customers where dealer_code = 'CNX' order by id limit 1) where dealer_code = 'CNX' and id = qid;
  perform sltest.ok((select customer_id from quotations where dealer_code = 'CNX' and id = qid) is not null, '6) ผูกลูกค้าได้หลังส่ง (งานปิดการขาย)');
  perform sltest.must_fail(format('update quotations set project = %L where dealer_code = %L and id = %L', 'ZZTEST-หลังปฏิเสธ', 'CNX', qid),
    'quote_sent_locked', '6) ใบที่ปิดแล้ว (ปฏิเสธ) ก็แก้เนื้อหาไม่ได้');
  raise notice 'ALL PASS';
end $$;
rollback;
