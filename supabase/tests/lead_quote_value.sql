-- ── ข้อทดสอบใบ 0223: มูลค่าลีด = ยอดก่อน VAT ของใบเสนอราคาล่าสุดที่ "ส่งลูกค้าแล้ว" · ฐานเขียนเอง หน้าเว็บเขียนทับไม่ได้ ─────
--   นับ ส่งแล้ว/ตอบรับ/ปฏิเสธ/หมดอายุ · ไม่นับใบร่าง · ไม่นับใบ HQ (ราคาทุนของดีลเลอร์) — บอสสั่ง 20 ต.ค. 69
-- รัน: docker exec -i supabase_db_pms-dbcheck psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 < supabase/tests/lead_quote_value.sql
-- ทรานแซกชันเดียวแล้ว rollback · รอบปิดด่านรันผ่าน tests/scenario/db-rule-tests.spec.ts · ผ่าน = "ALL PASS"
begin;
create schema qvtest;
create function qvtest.as_dealer() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.profiles where role = 'DEALER_ADMIN' and dealer_code = 'CNX' limit 1),
    'role', 'authenticated', 'user_role', 'DEALER_ADMIN', 'dealer_code', 'CNX')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function qvtest.as_hq() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.profiles where role = 'SUPER_ADMIN' limit 1),
    'role', 'authenticated', 'user_role', 'SUPER_ADMIN', 'dealer_code', '')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function qvtest.as_db() returns void language plpgsql as $$
begin perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '', true); end $$;
create function qvtest.v(p_num int) returns numeric language sql as $$
  select quote_value from public.leads where dealer_code = 'CNX' and num_id = p_num $$;
-- ข้อที่ตกจดไว้แล้วรันต่อ (ไม่หยุดที่ข้อแรก) — ทดสอบกลับด้านจะได้เห็นว่ากรณีไหนตกบ้าง · จบแล้วรายงานรวม
create table qvtest.fails (what text);
create function qvtest.eq(p_got numeric, p_want numeric, p_what text) returns void language plpgsql as $$
begin
  if p_got is distinct from p_want then
    insert into qvtest.fails values (format('%s — ได้ %s ควรได้ %s', p_what, coalesce(p_got::text, 'ไม่มี'), coalesce(p_want::text, 'ไม่มี')));
    raise notice 'FAIL %', p_what; return;
  end if;
  raise notice 'ok  % (%)', p_what, coalesce(p_got::text, 'ไม่มี = "—"');
end $$;
create function qvtest.lead(p_num int, p_tag text, p_status lead_status) returns void language plpgsql as $$
begin
  insert into public.leads (id, num_id, dealer_code, company, name, contact, phone, province, status)
  values ('#L-' || p_num, p_num, 'CNX', 'ZZTEST-มูลค่าลีด-' || p_tag, 'ZZTEST-มูลค่าลีด-' || p_tag, 'ผู้ทดสอบ',
          '000-000-' || lpad((p_num % 10000)::text, 4, '0'), 'เชียงใหม่', p_status);
end $$;
-- ใบลูกค้าแบบเดิมวางตรงที่ฐาน (ปิดตัวกันใบไม่มีใบ HQ เฉพาะคำสั่งนี้) — ข้อนี้วัดตัวคำนวณมูลค่า ไม่ใช่ทางสร้างใบ
create function qvtest.quote(p_id text, p_num int, p_total numeric, p_at timestamptz, p_status quotation_status) returns void language plpgsql as $$
begin
  alter table public.quotations disable trigger quotations_hq_link_guard;
  insert into public.quotations (id, dealer_code, deal_id, customer, project, total_value, status, date, created_at, customer_id)
  values (p_id, 'CNX', p_num, 'ZZTEST-มูลค่าลีด', 'ZZTEST', p_total, p_status, (p_at at time zone 'Asia/Bangkok')::date, p_at,
          (select id from public.customers where dealer_code = 'CNX' order by id limit 1));   -- ใบตอบรับต้องผูกลูกค้า (quotations_won_requires_customer)
  alter table public.quotations enable trigger quotations_hq_link_guard;
end $$;
grant usage on schema qvtest to authenticated;
grant execute on all functions in schema qvtest to authenticated;
grant select, insert on qvtest.fails to authenticated;

do $$
declare n int; m int; h int; w int; x int; rid bigint; s numeric; st text;
begin
  perform qvtest.as_db();
  n := (select coalesce(max(num_id), 0) from public.leads where dealer_code = 'CNX') + 1;
  m := n + 1; h := n + 2; w := n + 3;

  -- 1) ลีดใหม่: ยังไม่มีใบ = ไม่มีมูลค่า แม้จะส่งค่ามาเอง · ช่องประเมินราคาเดิม (value) ไม่ถูกนับ
  perform qvtest.as_dealer();
  insert into public.leads (id, num_id, dealer_code, company, name, contact, phone, province, status, value, quote_value)
  values ('#L-' || n, n, 'CNX', 'ZZTEST-มูลค่าลีด-ก', 'ZZTEST-มูลค่าลีด-ก', 'ผู้ทดสอบ', '000-000-' || lpad((n % 10000)::text, 4, '0'), 'เชียงใหม่', 'WAITING', '฿9,999,999', 777);
  perform qvtest.as_db();
  perform qvtest.lead(m, 'ข', 'WAITING');
  perform qvtest.eq(qvtest.v(n), null, '1) ลีดใหม่ไม่มีใบ = ไม่มีมูลค่า (ค่าที่ส่งมาเองถูกทิ้ง)');

  -- 2) [บอสสั่ง กรณี 1] มีแค่ใบ HQ (ราคาทุนของดีลเลอร์) ยังไม่มีใบลูกค้า → "—"
  perform qvtest.lead(h, 'มีแค่ใบHQ', 'BULLET');
  perform qvtest.as_dealer();
  rid := (public.quote_request_submit(h, 'โกดังสำเร็จรูป')).id;
  perform qvtest.as_hq();
  perform public.hq_quote_save(rid, '[{"name":"โครงเหล็ก","qty":1,"unit":"ชุด","unitCost":3000000}]'::jsonb, (now() at time zone 'Asia/Bangkok')::date + 30);
  perform public.hq_quote_send(rid);
  perform qvtest.as_db();
  perform qvtest.eq(qvtest.v(h), null, '[กรณี 1] มีแค่ใบ HQ (ทุน 3,000,000) ยังไม่มีใบลูกค้า = "—"');
  perform qvtest.eq(_lead_quote_value('CNX', h), null, '[กรณี 1] ตัวคำนวณเอง: มีแค่ใบ HQ = "—" (ไม่อ่านใบ HQ)');
  -- ดีลเลอร์ทำใบลูกค้าจากใบ HQ แต่ยังเป็นใบร่าง → ยัง "—" · ส่งให้ลูกค้าแล้ว → ได้ยอดใบลูกค้า (ทุน +10%) ไม่ใช่ยอดทุน
  perform qvtest.as_dealer();
  perform public.create_quotation('CNX', 'Q-', jsonb_build_object('customer', 'ZZTEST-มูลค่าลีด-มีแค่ใบHQ', 'project', 'ZZTEST', 'total', '0', 'status', 'draft',
    'date', (now() at time zone 'Asia/Bangkok')::date, 'line_items', '[{"name":"โครงเหล็ก","qty":1,"unit":"ชุด","unitPrice":0,"markupPct":10}]'::jsonb,
    'items', 1, 'hq_quote_id', (select id from hq_quotes where request_id = rid), 'deal_id', h, 'markup_percent', 10));
  perform qvtest.as_db();
  perform qvtest.eq(qvtest.v(h), null, '2) ใบลูกค้ายังเป็นใบร่าง = ยัง "—"');
  update public.quotations set status = 'sent_to_client' where dealer_code = 'CNX' and deal_id = h;
  perform qvtest.eq(qvtest.v(h), 3300000, '2) ส่งใบลูกค้าแล้ว = ยอดใบลูกค้า (ไม่ใช่ทุนจากใบ HQ)');

  -- 3) [บอสสั่ง กรณี 2] ใบที่ส่งแล้ว 1 ใบ แล้วตามด้วยใบร่างที่ยอดต่างกัน → ใช้ยอดของใบที่ส่งแล้ว
  perform qvtest.lead(w, 'ส่งแล้วตามด้วยร่าง', 'WAITING');
  perform qvtest.quote('Q-ZZQV-S1', w, 500000, now() - interval '2 days', 'sent_to_client');
  perform qvtest.quote('Q-ZZQV-D2', w, 777000, now() - interval '1 day', 'draft');
  perform qvtest.eq(qvtest.v(w), 500000, '[กรณี 2] ส่งแล้ว 500,000 + ใบร่างใหม่กว่า 777,000 = ใช้ใบที่ส่งแล้ว');
  update public.quotations set total_value = 888000 where dealer_code = 'CNX' and id = 'Q-ZZQV-D2';
  perform qvtest.eq(qvtest.v(w), 500000, '3) แก้ยอดใบร่าง ไม่กระทบ');
  update public.quotations set status = 'sent_to_client' where dealer_code = 'CNX' and id = 'Q-ZZQV-D2';
  perform qvtest.eq(qvtest.v(w), 888000, '3) ใบร่างส่งลูกค้าแล้ว = กลายเป็นใบที่ส่งล่าสุด');

  -- 4) ใบที่ส่งแล้วหลายใบ → ใบที่ระบบบันทึกล่าสุดชนะ (ไม่ใช่ยอดสูงสุด/ผลรวม) · ใบเก่าที่บันทึกทีหลังไม่ทับ · ตอบรับ/ปฏิเสธ/หมดอายุก็นับ
  perform qvtest.quote('Q-ZZQV-1', n, 500000, now() - interval '3 days', 'sent_to_client');
  perform qvtest.eq(qvtest.v(n), 500000, '4) ใบแรกที่ส่งแล้ว');
  perform qvtest.quote('Q-ZZQV-2', n, 420000, now() - interval '1 day', 'sent_to_client');
  perform qvtest.eq(qvtest.v(n), 420000, '4) ใบใหม่สุดชนะ แม้ยอดต่ำกว่า');
  perform qvtest.quote('Q-ZZQV-0', n, 900000, now() - interval '5 days', 'expired');
  perform qvtest.eq(qvtest.v(n), 420000, '4) ใบเก่าที่บันทึกทีหลังไม่ทับใบใหม่สุด');
  -- ใบส่งแล้วแก้ยอดไม่ได้ (0226) — ปิดตัวล็อกเฉพาะคำสั่งนี้ เพื่อวัดว่าตัวคำนวณตามยอดที่เปลี่ยน (เช่นงานดูแลระบบ)
  alter table public.quotations disable trigger quotations_zz_sent_lock;
  update public.quotations set total_value = 410000 where dealer_code = 'CNX' and id = 'Q-ZZQV-2';
  alter table public.quotations enable trigger quotations_zz_sent_lock;
  perform qvtest.eq(qvtest.v(n), 410000, '4) แก้ยอดใบล่าสุด');

  -- 4ข) ใบที่ปิดแล้วก็นับ: ตอบรับ / ปฏิเสธ / หมดอายุ (ใบเดียวของลีดนั้น)
  x := n + 10;
  foreach st in array array['won', 'lost', 'expired'] loop
    x := x + 1;
    perform qvtest.lead(x, 'สถานะ-' || st, 'WAITING');
    perform qvtest.quote('Q-ZZQV-' || st, x, 123000, now(), st::quotation_status);
    perform qvtest.eq(qvtest.v(x), 123000, '4ข) ใบสถานะ ' || st || ' นับเป็นมูลค่า');
  end loop;

  -- 5) ย้ายใบล่าสุดไปลีดอื่น → ลีดเดิมใช้ใบก่อนหน้า · ลบหมด = ไม่มีมูลค่า
  --    (ใบเดิมย้ายลีดไม่ได้อยู่แล้ว — ปิดตัวล็อกเฉพาะคำสั่งนี้ เพื่อวัดว่าตัวคำนวณรับการย้ายได้ถ้าเกิดขึ้น เช่นงานดูแลระบบ)
  alter table public.quotations disable trigger quotations_legacy_lock;
  update public.quotations set deal_id = m where dealer_code = 'CNX' and id = 'Q-ZZQV-2';
  alter table public.quotations enable trigger quotations_legacy_lock;
  perform qvtest.eq(qvtest.v(n), 500000, '5) ลีดเดิมใช้ใบที่ส่งแล้วก่อนหน้า');
  perform qvtest.eq(qvtest.v(m), 410000, '5) ลีดปลายทางได้ยอดใบ');
  -- ใบที่ส่งแล้วลบไม่ได้ (0228) — ปิดตัวดักเฉพาะคำสั่งนี้ เพื่อวัดว่าตัวคำนวณรับการลบได้ (เช่นงานดูแลระบบ)
  alter table public.quotations disable trigger quotations_no_delete_won;
  delete from public.quotations where dealer_code = 'CNX' and id in ('Q-ZZQV-1', 'Q-ZZQV-0');
  alter table public.quotations enable trigger quotations_no_delete_won;
  perform qvtest.eq(qvtest.v(n), null, '5) ลบใบหมด = ไม่มีมูลค่า');

  -- 6) หน้าเว็บ (ดีลเลอร์) เขียนทับมูลค่าเองไม่ได้ — คำสั่งไม่ล้ม แต่ค่าคงเดิม
  perform qvtest.as_dealer();
  update public.leads set quote_value = 5, value = '฿5' where dealer_code = 'CNX' and num_id = m;
  perform qvtest.as_db();
  perform qvtest.eq(qvtest.v(m), 410000, '6) ดีลเลอร์เขียนทับมูลค่าไม่ได้');

  -- 7) สรุปยอดของ HQ รวมจากยอดใบที่ส่งแล้วล่าสุด ไม่ใช่ช่องประเมินราคา (ลีด ก มีประเมินราคา 9.99 ล้านแต่ไม่มีใบ)
  s := (select sum((e->>'value')::numeric) from jsonb_array_elements(
          public.lead_summary(array['CNX'], null, null, null, 'ZZTEST-มูลค่าลีด', null, null, null)->'byStatus') e);
  perform qvtest.eq(s, 410000 + 3300000 + 888000 + 3 * 123000, '7) lead_summary รวมจากยอดใบที่ส่งแล้วล่าสุด');
  if exists (select 1 from qvtest.fails) then
    raise exception 'FAIL % ข้อ: %', (select count(*) from qvtest.fails), (select string_agg(what, ' | ') from qvtest.fails);
  end if;
  raise notice 'ALL PASS';
end $$;
rollback;
