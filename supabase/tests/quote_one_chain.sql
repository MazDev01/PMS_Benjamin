-- ── ข้อทดสอบใบ 0230: ใบ HQ หนึ่งใบ มีใบลูกค้าที่ยังไม่ถูกแทนที่ได้สายเดียว (บอสสั่ง 21 ต.ค. 69) ──────────────────────────
--   สำเนาใบที่ส่งแล้วไม่ได้ (ฐาน) · ใบร่างทำสำเนาได้ แต่ส่งได้สายเดียว · ฉบับใหม่ของสายเดิมยังทำ/ส่งได้
-- รัน: docker exec -i supabase_db_pms-dbcheck psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 < supabase/tests/quote_one_chain.sql
-- ทรานแซกชันเดียวแล้ว rollback · รอบปิดด่านรันผ่าน tests/scenario/db-rule-tests.spec.ts · ผ่าน = "ALL PASS"
begin;
create schema octest;
create function octest.ok(p_cond boolean, p_what text) returns void language plpgsql as $$
begin if p_cond is not true then raise exception 'FAIL: %', p_what; end if; raise notice 'ok  %', p_what; end $$;
create function octest.must_fail(p_sql text, p_like text, p_what text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if sqlerrm ilike '%' || p_like || '%' then raise notice 'ok  % (ถูกปฏิเสธ)', p_what; return; end if;
    raise exception 'FAIL: % — ถูกปฏิเสธแต่ข้อความไม่ตรง: %', p_what, sqlerrm;
  end;
  raise exception 'FAIL: % — ควรถูกปฏิเสธแต่ผ่าน', p_what;
end $$;
create function octest.as_dealer() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.profiles where role = 'DEALER_ADMIN' and dealer_code = 'CNX' limit 1),
    'role', 'authenticated', 'user_role', 'DEALER_ADMIN', 'dealer_code', 'CNX')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function octest.as_hq() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.profiles where role = 'SUPER_ADMIN' limit 1),
    'role', 'authenticated', 'user_role', 'SUPER_ADMIN', 'dealer_code', '')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function octest.as_db() returns void language plpgsql as $$
begin perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '', true); end $$;
-- ใบลูกค้าจากใบ HQ แบบที่หน้าเว็บสร้าง · สำเนา = คำสั่งเดียวกันซ้ำ (ใบใหม่ที่ไม่ใช่ฉบับใหม่)
create function octest.ใบ(p_num int, p_hq bigint) returns text language sql as $$
  select (public.create_quotation('CNX', 'Q-', jsonb_build_object('customer', 'ZZTEST-สายเดียว', 'project', 'ZZTEST', 'province', 'เชียงใหม่',
    'total', '0', 'status', 'draft', 'date', (now() at time zone 'Asia/Bangkok')::date,
    'line_items', '[{"name":"โครงเหล็ก","qty":1,"unit":"ชุด","unitPrice":0,"markupPct":10}]'::jsonb,
    'items', 1, 'hq_quote_id', p_hq, 'deal_id', p_num, 'markup_percent', 10))).id $$;
grant usage on schema octest to authenticated;
grant execute on all functions in schema octest to authenticated;

do $$
declare n int; rid bigint; hq bigint; a text; b text; v2 text;
begin
  perform octest.as_db();
  n := (select coalesce(max(num_id), 0) from public.leads where dealer_code = 'CNX') + 1;
  insert into public.leads (id, num_id, dealer_code, company, name, contact, phone, province, status)
  values ('#L-' || n, n, 'CNX', 'ZZTEST-สายเดียว', 'ZZTEST-สายเดียว', 'ผู้ทดสอบ', '000-000-' || lpad((n % 10000)::text, 4, '0'), 'เชียงใหม่', 'BULLET');
  perform octest.as_dealer();
  rid := (public.quote_request_submit(n, 'โกดังสำเร็จรูป')).id;
  perform octest.as_hq();
  perform public.hq_quote_save(rid, '[{"name":"โครงเหล็ก","qty":1,"unit":"ชุด","unitCost":1000000}]'::jsonb, (now() at time zone 'Asia/Bangkok')::date + 30);
  perform public.hq_quote_send(rid);
  hq := (select id from hq_quotes where request_id = rid);
  perform octest.as_dealer();

  -- 1) ใบร่างทำสำเนาได้ (ร่างสองใบของใบ HQ เดียวกัน)
  a := octest.ใบ(n, hq);
  b := octest.ใบ(n, hq);
  perform octest.ok(a is not null and b is not null and a <> b, '1) ใบร่างทำสำเนาได้ (' || a || ' · ' || b || ')');

  -- 2) ส่งใบแรก → ส่งใบร่างอีกสายของใบ HQ เดียวกันไม่ได้
  update quotations set status = 'sent_to_client' where dealer_code = 'CNX' and id = a;
  perform octest.must_fail(format('update quotations set status = %L where dealer_code = %L and id = %L', 'sent_to_client', 'CNX', b),
    'quote_chain_exists', '2) ส่งใบร่างอีกสายของใบ HQ เดียวกันไม่ได้');

  -- 3) สำเนาใบที่ส่งแล้ว (ใบใหม่ที่ไม่ใช่ฉบับใหม่) ไม่ได้
  perform octest.must_fail(format('select octest.ใบ(%s, %s)', n, hq), 'quote_chain_exists', '3) สร้างสำเนาใบที่ส่งแล้วไม่ได้');

  -- 4) ฉบับใหม่ของสายเดิมยังทำและส่งได้ · ใบเดิมถูกแทนที่ · อีกสายยังส่ง/สร้างไม่ได้
  v2 := (public.quotation_new_version('CNX', a)).id;
  update quotations set status = 'sent_to_client' where dealer_code = 'CNX' and id = v2;
  perform octest.ok((select status::text from quotations where dealer_code = 'CNX' and id = a) = 'superseded'
    and (select status::text from quotations where dealer_code = 'CNX' and id = v2) = 'sent_to_client', '4) ฉบับใหม่ของสายเดิมส่งได้ ใบเดิมถูกแทนที่');
  perform octest.must_fail(format('update quotations set status = %L where dealer_code = %L and id = %L', 'sent_to_client', 'CNX', b),
    'quote_chain_exists', '4) ใบร่างอีกสายยังส่งไม่ได้ (สายเดิมมี V2 ส่งอยู่)');
  perform octest.must_fail(format('select octest.ใบ(%s, %s)', n, hq), 'quote_chain_exists', '4) สร้างใบใหม่อีกสายไม่ได้');

  -- 5) ลบใบร่างที่ค้างได้ตามปกติ
  delete from quotations where dealer_code = 'CNX' and id = b;
  perform octest.ok(not exists (select 1 from quotations where dealer_code = 'CNX' and id = b), '5) ลบใบร่างอีกสายได้');
  raise notice 'ALL PASS';
end $$;
rollback;
