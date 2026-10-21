-- ── ข้อทดสอบใบ 0227–0228: ทำฉบับใหม่ (V2) จากใบที่ส่งแล้ว · ใบเดิมถูกแทนที่ · ห้ามลบใบที่ส่งแล้ว (บอสสั่ง 21 ต.ค. 69) ─────────
--   ส่ง V1 → ทำฉบับใหม่ → แก้ % → ส่ง V2 → V1 ถูกแทนที่ · ตอบรับ V1 ไม่ได้ · ตอบรับ V2 ได้ · มูลค่าลีดเปลี่ยนตาม V2
--   V2 แก้ชื่อลูกค้า/โครงการ/จังหวัด/พื้นที่ไม่ได้ · ลบใบที่ส่งแล้ว/ถูกแทนที่ไม่ได้ · ลบใบร่างได้
-- รัน: docker exec -i supabase_db_pms-dbcheck psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 < supabase/tests/quote_new_version.sql
-- ทรานแซกชันเดียวแล้ว rollback · รอบปิดด่านรันผ่าน tests/scenario/db-rule-tests.spec.ts · ผ่าน = "ALL PASS"
begin;
create schema nvtest;
create function nvtest.ok(p_cond boolean, p_what text) returns void language plpgsql as $$
begin if p_cond is not true then raise exception 'FAIL: %', p_what; end if; raise notice 'ok  %', p_what; end $$;
create function nvtest.must_fail(p_sql text, p_like text, p_what text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if sqlerrm ilike '%' || p_like || '%' then raise notice 'ok  % (ถูกปฏิเสธ)', p_what; return; end if;
    raise exception 'FAIL: % — ถูกปฏิเสธแต่ข้อความไม่ตรง: %', p_what, sqlerrm;
  end;
  raise exception 'FAIL: % — ควรถูกปฏิเสธแต่ผ่าน', p_what;
end $$;
create function nvtest.as_dealer() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.profiles where role = 'DEALER_ADMIN' and dealer_code = 'CNX' limit 1),
    'role', 'authenticated', 'user_role', 'DEALER_ADMIN', 'dealer_code', 'CNX')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function nvtest.as_hq() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.profiles where role = 'SUPER_ADMIN' limit 1),
    'role', 'authenticated', 'user_role', 'SUPER_ADMIN', 'dealer_code', '')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function nvtest.as_server() returns void language plpgsql as $$
begin perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '', true); perform set_config('role', 'service_role', true); end $$;
create function nvtest.as_db() returns void language plpgsql as $$
begin perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '', true); end $$;
create function nvtest.st(p_id text) returns text language sql as $$ select status::text from public.quotations where dealer_code = 'CNX' and id = p_id $$;
grant usage on schema nvtest to authenticated, service_role;
grant execute on all functions in schema nvtest to authenticated, service_role;

do $$
declare n int; rid bigint; v1 text; v2 text; q quotations; ร่าง text; c1 bigint; ก่อน record; หลัง record;
begin
  perform nvtest.as_db();
  n := (select coalesce(max(num_id), 0) from public.leads where dealer_code = 'CNX') + 1;
  c1 := (select id from public.customers where dealer_code = 'CNX' order by id limit 1);
  insert into public.leads (id, num_id, dealer_code, company, name, contact, phone, province, status)
  values ('#L-' || n, n, 'CNX', 'ZZTEST-ฉบับใหม่', 'ZZTEST-ฉบับใหม่', 'ผู้ทดสอบ', '000-000-' || lpad((n % 10000)::text, 4, '0'), 'เชียงใหม่', 'BULLET');
  perform nvtest.as_dealer();
  rid := (public.quote_request_submit(n, 'โกดังสำเร็จรูป')).id;
  perform nvtest.as_hq();
  perform public.hq_quote_save(rid, '[{"name":"โครงเหล็ก","qty":1,"unit":"ชุด","unitCost":1000000}]'::jsonb, (now() at time zone 'Asia/Bangkok')::date + 30);
  perform public.hq_quote_send(rid);
  perform nvtest.as_dealer();
  v1 := (public.create_quotation('CNX', 'Q-', jsonb_build_object('customer', 'ZZTEST-ลูกค้า', 'project', 'ZZTEST-โครงการ', 'province', 'เชียงใหม่', 'area', '300',
    'total', '0', 'status', 'draft', 'date', (now() at time zone 'Asia/Bangkok')::date, 'vat_percent', 7,
    'line_items', '[{"name":"โครงเหล็ก","qty":1,"unit":"ชุด","unitPrice":0,"markupPct":10}]'::jsonb,
    'items', 1, 'hq_quote_id', (select id from hq_quotes where request_id = rid), 'deal_id', n, 'markup_percent', 10))).id;

  -- 0) ใบร่าง: ทำฉบับใหม่ไม่ได้ (แก้ใบร่างตรง ๆ ได้อยู่แล้ว)
  perform nvtest.must_fail(format('select quotation_new_version(%L, %L)', 'CNX', v1), 'quote_version_not_sent', '0) ใบร่างทำฉบับใหม่ไม่ได้');

  -- 1) ส่ง V1 → มูลค่าลีด = ยอด V1
  update quotations set status = 'sent_to_client' where dealer_code = 'CNX' and id = v1;
  perform nvtest.as_db();
  perform nvtest.ok((select quote_value from leads where dealer_code = 'CNX' and num_id = n) = 1100000, '1) ส่ง V1 แล้ว มูลค่าลีด = 1,100,000');

  -- 2) ทำฉบับใหม่ → ใบร่าง V2 เลขที่เดิม -V2 · คัดลอกลูกค้า/โครงการ/จังหวัด/พื้นที่/ภาษี · กดซ้ำได้ใบเดิม
  perform nvtest.as_dealer();
  q := public.quotation_new_version('CNX', v1);
  v2 := q.id;
  perform nvtest.ok(v2 = v1 || '-V2' and q.status = 'draft' and q.revision = 'V2' and q.supersedes_id = v1
    and q.customer = 'ZZTEST-ลูกค้า' and q.project = 'ZZTEST-โครงการ' and q.province = 'เชียงใหม่' and q.area = '300' and q.vat_percent = 7,
    '2) ฉบับใหม่ = ใบร่าง ' || v2 || ' (V2) คัดลอกลูกค้า โครงการ จังหวัด พื้นที่ ภาษี');
  perform nvtest.ok((public.quotation_new_version('CNX', v1)).id = v2 and (select count(*) from quotations where dealer_code = 'CNX' and supersedes_id = v1) = 1,
    '2) กดทำฉบับใหม่ซ้ำ ได้ใบร่างเดิม ไม่เกิดใบที่สอง');
  perform nvtest.ok(nvtest.st(v1) = 'sent_to_client', '2) V2 ยังเป็นร่าง ใบเดิมยังเป็นส่งแล้ว');

  -- 3) V2 แก้ % ได้ · แก้ลูกค้า/โครงการ/จังหวัด/พื้นที่/ภาษีไม่ได้
  update quotations set line_items = '[{"name":"โครงเหล็ก","qty":1,"unit":"ชุด","unitPrice":0,"markupPct":5}]'::jsonb, markup_percent = 5
   where dealer_code = 'CNX' and id = v2;
  perform nvtest.ok((select total_value from quotations where dealer_code = 'CNX' and id = v2) = 1050000, '3) V2 แก้ % เป็น 5 → 1,050,000');
  perform nvtest.must_fail(format('update quotations set customer = %L where dealer_code = %L and id = %L', 'ZZTEST-อื่น', 'CNX', v2), 'quote_version_locked', '3) V2 แก้ชื่อลูกค้าไม่ได้');
  perform nvtest.must_fail(format('update quotations set project = %L where dealer_code = %L and id = %L', 'ZZTEST-อื่น', 'CNX', v2), 'quote_version_locked', '3) V2 แก้โครงการไม่ได้');
  perform nvtest.must_fail(format('update quotations set province = %L where dealer_code = %L and id = %L', 'ลำพูน', 'CNX', v2), 'quote_version_locked', '3) V2 แก้จังหวัดไม่ได้');
  perform nvtest.must_fail(format('update quotations set area = %L where dealer_code = %L and id = %L', '999', 'CNX', v2), 'quote_version_locked', '3) V2 แก้พื้นที่ไม่ได้');
  perform nvtest.must_fail(format('update quotations set supersedes_id = null where dealer_code = %L and id = %L', 'CNX', v2), 'quote_version_link_locked', '3) V2 ตัดการผูกใบเดิมไม่ได้');
  update quotations set area = '300.0', building_type = coalesce(building_type, '') where dealer_code = 'CNX' and id = v2;
  perform nvtest.ok(true, '3) ส่งค่าเดิมคนละรูปแบบกลับมา (หน้าเว็บส่งทั้งแถว) ไม่ถูกปฏิเสธ');
  -- ใส่ฉบับใหม่เองโดยไม่ผ่านปุ่ม (เปลี่ยนลูกค้า) ไม่ได้
  perform nvtest.must_fail(format($s$select create_quotation('CNX', 'Q-', jsonb_build_object('customer', 'ZZTEST-แอบ', 'project', 'ZZTEST-โครงการ', 'province', 'เชียงใหม่',
      'area', '300', 'total', '0', 'status', 'draft', 'revision', 'V2', 'supersedes_id', %L, 'vat_percent', 7,
      'line_items', '[{"name":"โครงเหล็ก","qty":1,"unit":"ชุด","unitPrice":0,"markupPct":1}]'::jsonb, 'items', 1,
      'hq_quote_id', (select hq_quote_id from quotations where dealer_code = 'CNX' and id = %L), 'deal_id', %s))$s$, v1, v1, n),
    'quote_version_copy', '3) สร้างฉบับใหม่เองโดยเปลี่ยนลูกค้าไม่ได้');

  -- 4) ใบที่ส่งแล้วลบไม่ได้ · V2 ร่างลบได้ (แล้วทำใหม่)
  perform nvtest.must_fail(format('delete from quotations where dealer_code = %L and id = %L', 'CNX', v1), 'quote_sent_no_delete', '4) ดีลเลอร์ลบใบที่ส่งแล้วไม่ได้');
  perform nvtest.as_server();
  perform nvtest.must_fail(format('delete from quotations where dealer_code = %L and id = %L', 'CNX', v1), 'quote_sent_no_delete', '4) ฝั่งเซิร์ฟเวอร์ลบใบที่ส่งแล้วไม่ได้');
  perform nvtest.as_dealer();
  delete from quotations where dealer_code = 'CNX' and id = v2;
  perform nvtest.ok(not exists (select 1 from quotations where dealer_code = 'CNX' and id = v2), '4) ลบฉบับใหม่ที่ยังเป็นร่างได้');
  q := public.quotation_new_version('CNX', v1);
  perform nvtest.ok(q.id = v2, '4) ทำฉบับใหม่อีกครั้งได้เลขเดิม ' || v2);
  update quotations set line_items = '[{"name":"โครงเหล็ก","qty":1,"unit":"ชุด","unitPrice":0,"markupPct":5}]'::jsonb, markup_percent = 5
   where dealer_code = 'CNX' and id = v2;
  perform nvtest.as_db();
  perform nvtest.ok((select quote_value from leads where dealer_code = 'CNX' and num_id = n) = 1100000, '4) V2 ยังเป็นร่าง มูลค่าลีดยังเป็นยอด V1');
  perform nvtest.ok(_lead_quote_value('CNX', n) = 1100000, '4) ตัวคำนวณเอง: V2 ร่าง (1,050,000) ไม่นับ ใช้ยอด V1');
  perform nvtest.as_dealer();
  perform nvtest.must_fail(format('update quotations set status = %L where dealer_code = %L and id = %L', 'superseded', 'CNX', v1), 'quote_superseded_manual', '4) ตั้งใบเป็นถูกแทนที่เองไม่ได้');

  -- 5) ส่ง V2 → V1 ถูกแทนที่ · มูลค่าลีด = ยอด V2 · สรุปยอดเครือไม่นับ V1 ซ้ำ (0229)
  perform nvtest.as_db();
  select quotes, quote_val into ก่อน from network_quote_range((now() at time zone 'Asia/Bangkok')::date - 1, (now() at time zone 'Asia/Bangkok')::date + 1, 'CNX');
  perform nvtest.as_dealer();
  update quotations set status = 'sent_to_client' where dealer_code = 'CNX' and id = v2;
  perform nvtest.as_db();
  select quotes, quote_val into หลัง from network_quote_range((now() at time zone 'Asia/Bangkok')::date - 1, (now() at time zone 'Asia/Bangkok')::date + 1, 'CNX');
  perform nvtest.ok(หลัง.quotes = ก่อน.quotes - 1 and หลัง.quote_val = ก่อน.quote_val - 1100000,
    format('5) สรุปยอดเครือไม่นับใบที่ถูกแทนที่ (ใบ %s → %s · มูลค่าเสนอลด 1,100,000)', ก่อน.quotes, หลัง.quotes));
  perform nvtest.ok(not exists (select 1 from jsonb_array_elements(dashboard_quote_summary((now() at time zone 'Asia/Bangkok')::date - 1,
      (now() at time zone 'Asia/Bangkok')::date + 1, 'CNX') -> 'byStatus') e where e ->> 'status' = 'superseded'),
    '5) แดชบอร์ดสรุปใบไม่มีกลุ่มถูกแทนที่');
  perform nvtest.ok((select r.quotes from dealer_rollup(extract(year from now())::int) r where r.dealer_code = 'CNX')
                    = (select count(*) from quotations where coalesce(dealer_code, 'CNX') = 'CNX' and status <> 'superseded'),
    '5) สรุปรายดีลเลอร์นับใบไม่รวมใบที่ถูกแทนที่');
  perform nvtest.ok((select (e ->> 'count')::int from jsonb_array_elements(hq_quotations_summary(null, array['CNX'], null, null, null, null, null, null) -> 'byDealer') e)
                    = (select count(*) from quotations where coalesce(dealer_code, 'CNX') = 'CNX' and status <> 'superseded' and date ~ '^\d{4}-\d{2}-\d{2}'),
    '5) หน้าใบเสนอราคาทั้งเครือของ HQ นับใบไม่รวมใบที่ถูกแทนที่');
  perform nvtest.as_dealer();
  perform nvtest.ok(nvtest.st(v1) = 'superseded' and nvtest.st(v2) = 'sent_to_client', '5) ส่ง V2 → V1 เป็นถูกแทนที่');
  perform nvtest.as_db();
  perform nvtest.ok((select quote_value from leads where dealer_code = 'CNX' and num_id = n) = 1050000, '5) มูลค่าลีดเปลี่ยนตาม V2 = 1,050,000');
  perform nvtest.as_dealer();

  -- 6) ตอบรับ/ปฏิเสธ V1 ไม่ได้ · ลบ V1 ไม่ได้ · ทำฉบับใหม่จาก V1 ไม่ได้
  perform nvtest.must_fail(format('update quotations set status = %L, customer_id = %s where dealer_code = %L and id = %L', 'won', c1, 'CNX', v1), 'quote_superseded', '6) ตอบรับ V1 (ถูกแทนที่) ไม่ได้');
  perform nvtest.must_fail(format('update quotations set status = %L, lost_reason = %L where dealer_code = %L and id = %L', 'lost', 'ZZTEST', 'CNX', v1), 'quote_superseded', '6) ปฏิเสธ V1 (ถูกแทนที่) ไม่ได้');
  perform nvtest.must_fail(format('delete from quotations where dealer_code = %L and id = %L', 'CNX', v1), 'quote_sent_no_delete', '6) ลบ V1 (ถูกแทนที่) ไม่ได้');
  perform nvtest.must_fail(format('select quotation_new_version(%L, %L)', 'CNX', v1), 'quote_version_exists', '6) ทำฉบับใหม่จาก V1 ซ้ำไม่ได้');
  perform nvtest.must_fail(format('update quotations set project = %L where dealer_code = %L and id = %L', 'ZZTEST-แก้', 'CNX', v1), 'quote_sent_locked', '6) แก้ V1 ไม่ได้');

  -- 7) ตอบรับ V2 ได้ (ผูกลูกค้าตามขั้นปิดการขาย) · ลีดปิดการขายสำเร็จ · ลบ V2 ไม่ได้
  perform nvtest.as_db();
  update quotations set customer_id = c1 where dealer_code = 'CNX' and id = v2;
  perform nvtest.as_dealer();
  update quotations set status = 'won' where dealer_code = 'CNX' and id = v2;
  perform nvtest.as_db();
  perform nvtest.ok(nvtest.st(v2) = 'won' and nvtest.st(v1) = 'superseded'
    and (select status::text from leads where dealer_code = 'CNX' and num_id = n) = 'PAID'
    and (select quote_value from leads where dealer_code = 'CNX' and num_id = n) = 1050000, '7) ตอบรับ V2 ได้ · ลีดปิดการขาย · มูลค่า = V2');
  perform nvtest.must_fail(format('delete from quotations where dealer_code = %L and id = %L', 'CNX', v2), 'quote_won_locked', '7) ลบ V2 ที่ตอบรับแล้วไม่ได้');
  raise notice 'ALL PASS';
end $$;
rollback;
