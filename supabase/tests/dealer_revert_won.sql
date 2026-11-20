-- ── ใบ 0288: ย้อนการตอบรับ (won) = ดีลเลอร์เจ้าของใบ ภายใน 7 วัน ต้องมีเหตุผล · HQ ดูอย่างเดียว ───────────
-- บอสตัดสิน 18 พ.ย. 69 (ทับ 14 ต.ค. 69 / ใบ 0204 "ย้อนได้เฉพาะ HQ")
--   ดีลเลอร์แก้สถานะใบ won ตรงที่ตารางยังไม่ได้ (ตัวดัก) — ต้องผ่านคำสั่ง quotation_revert_won() เท่านั้น
--   ย้อนได้: ใบของสาขาตัวเอง · ภายใน 7 วันหลังตอบรับ (quotation_won_at) · มีเหตุผล · เป็นส่งแล้ว/ไม่สำเร็จ
--   ย้อนไม่ได้: สาขาอื่น · เกิน 7 วัน · ไม่มีเหตุผล · HQ (เรียกตรง) · ตั้งธงเองแล้วแก้ตาราง
--   ผลเหมือนเดิม: ใบ HQ กลับส่งแล้ว · คำขอเปิด · ยอดลูกค้าลด · ไทม์ไลน์ลีด (ใคร เมื่อไร เพราะอะไร) · บันทึกการใช้งาน · แจ้ง HQ 1 รายการ
--   ย้ายข้อมูลดีลเลอร์ (move) ยังย้ายลูกค้าที่มีใบ won ได้ — เป็นการย้าย ไม่ใช่การลบหรือย้อนสถานะ
-- รัน: docker exec -i <คอนเทนเนอร์ฐานทดสอบ> psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/dealer_revert_won.sql
begin;
-- ปิดตัวดักของ quotations กลางรายการ (alter table … disable trigger) ต้องล็อกทั้งตาราง — ถือล็อกนั้นตั้งแต่ต้นรายการ
--   ก่อนถือแถว/ตัวนับใด ๆ: ถ้าขอกลางทาง ขณะถือตัวนับ/แถวอยู่ งานหน้าเว็บที่เขียนใบพร้อมกันค้างกันเอง (deadlock · พบที่ตารางใบค่าแฟรนไชส์ 4 พ.ย. 69)
lock table quotations in share row exclusive mode;
create schema flowtest;
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
create function flowtest.as_dealer(p_uid uuid, p_code text default 'CNX') returns void language plpgsql as $$
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
grant usage on schema flowtest to authenticated;
grant execute on all functions in schema flowtest to authenticated;

do $$
declare
  cnx uuid := (select id from profiles where role = 'DEALER_ADMIN' and dealer_code = 'CNX' limit 1);
  ryg uuid := (select id from profiles where role = 'DEALER_ADMIN' and dealer_code = 'RYG' limit 1);
  hq  uuid := (select id from profiles where role = 'SUPER_ADMIN' limit 1);
  cnx_name text;
  l1 int; c1 bigint; r quote_requests; h hq_quotes; q quotations; acts jsonb; n int; tot numeric; tot_after numeric;
  li jsonb := '[{"name":"ของเดิม","qty":1,"unit":"ชุด","unitPrice":1000}]';
  ten jsonb := '[{"name":"โครงเหล็ก","qty":1,"unit":"ชุด","unitCost":10}]';
begin
  select coalesce(nullif(btrim(name), ''), '') into cnx_name from profiles where id = cnx;
  select num_id into l1 from leads where dealer_code = 'CNX' and status in ('WAITING','BULLET') order by num_id limit 1;
  select id into c1 from customers where dealer_code = 'CNX' order by id limit 1;
  perform flowtest.ok(cnx is not null and ryg is not null and hq is not null and l1 is not null and c1 is not null, 'มีข้อมูลตั้งต้นครบ');

  -- ใบจากใบ HQ ที่ won (ผ่านคำสั่งปกติ — quotation_won_at บันทึกวันตอบรับ = ตอนนี้)
  perform flowtest.as_dealer(cnx);
  r := quote_request_submit(l1, 'โกดังและคลังสินค้า');
  perform flowtest.as_hq(hq);
  perform hq_quote_save(r.id, ten, current_date + 20); h := hq_quote_send(r.id);
  perform flowtest.as_dealer(cnx);
  select * into q from create_quotation('CNX', 'Q-', jsonb_build_object('customer', 'ZZR HQ won', 'status', 'sent_to_client',
    'date', to_char(current_date, 'DD/MM/YYYY'), 'line_items', '[{"name":"x","qty":1}]'::jsonb, 'hq_quote_id', h.id, 'markup_percent', 50));
  update quotations set status = 'won', customer_id = c1 where id = q.id and dealer_code = 'CNX';
  perform flowtest.as_root();
  perform flowtest.ok(exists (select 1 from quotation_won_at where dealer_code = 'CNX' and quote_id = q.id), 'ใบ won มีวันตอบรับที่ฐาน');

  -- ใบเก่า won (ผูกลูกค้าเป้าหมาย l1 · ลูกค้า c1) — สร้างหลังใบจากใบ HQ: ใบ 0252 ตั้งลีดเป็น PAID ทันทีที่มีใบ won
  alter table quotations disable trigger quotations_hq_link_guard;
  insert into quotations (id, dealer_code, customer, line_items, total_value, status, customer_id, deal_id)
  values ('ZZR-OLD-WON', 'CNX', 'ZZR เก่า', li, 1000, 'won', c1, l1);
  alter table quotations enable trigger quotations_hq_link_guard;
  -- ใบเก่าอีกใบ ตอบรับเกิน 7 วัน (ถอยวันตอบรับที่ฐาน)
  alter table quotations disable trigger quotations_hq_link_guard;
  insert into quotations (id, dealer_code, customer, line_items, total_value, status, customer_id)
  values ('ZZR-OLD-WON-8D', 'CNX', 'ZZR เก่า 8 วัน', li, 1000, 'won', c1);
  alter table quotations enable trigger quotations_hq_link_guard;
  update quotation_won_at set won_at = now() - interval '8 days' where dealer_code = 'CNX' and quote_id = 'ZZR-OLD-WON-8D';
  -- ยอดลูกค้าก่อนย้อน = หลังใส่ใบ won ทั้งหมดแล้ว (เดิมอ่านก่อนใส่ใบเก่า 2 ใบ → ยอดหลังย้อนมากกว่าก่อนย้อน)
  select total_value into tot from customers where dealer_code = 'CNX' and id = c1;

  -- ══ แก้สถานะใบ won ตรงที่ตารางยังไม่ได้ (ทุกคน) ══
  perform flowtest.as_dealer(cnx);
  perform flowtest.must_fail($q$update quotations set status = 'lost', lost_reason = 'x' where id = 'ZZR-OLD-WON' and dealer_code = 'CNX'$q$, 'quote_won_locked', 'ใบเก่าที่ won: ดีลเลอร์แก้สถานะตรงที่ตารางไม่ได้');
  perform flowtest.must_fail(format($q$update quotations set status = 'sent_to_client' where id = %L and dealer_code = 'CNX'$q$, q.id), 'quote_won_locked', 'ใบจากใบ HQ ที่ won: ดีลเลอร์แก้สถานะตรงที่ตารางไม่ได้');
  -- ธงของคำสั่งย้อน: ตั้งเองแล้วแก้ตารางไม่ผ่าน — ธงเก่า "1" · ธงของใบอื่น
  perform set_config('pms.revert_won', '1', true);
  perform flowtest.must_fail(format($q$update quotations set status = 'lost', lost_reason = 'x' where id = %L and dealer_code = 'CNX'$q$, q.id), 'quote_won_locked', 'ตั้งธงแบบเดิม "1" เองแล้วแก้สถานะไม่ได้');
  perform set_config('pms.revert_won', 'CNX:ZZR-OLD-WON-8D', true);
  perform flowtest.must_fail($q$update quotations set status = 'lost', lost_reason = 'x' where id = 'ZZR-OLD-WON' and dealer_code = 'CNX'$q$, '_locked', 'ตั้งธงของใบอื่นแล้วแก้สถานะใบนี้ไม่ได้');
  perform set_config('pms.revert_won', '', true);
  perform flowtest.as_root();
  perform flowtest.must_fail(format($q$update quotations set status = 'lost' where id = %L$q$, q.id), 'quote_won_locked', 'แก้ตรงที่ตาราง (สิทธิ์สูงสุด) ไม่ผ่านคำสั่งย้อนก็ย้อนไม่ได้');

  -- ══ HQ ย้อนไม่ได้ (ดูอย่างเดียว) ══
  perform flowtest.as_hq(hq);
  perform flowtest.must_fail(format($q$select quotation_revert_won('CNX', %L, 'ลูกค้ายกเลิก')$q$, q.id), 'forbidden', 'HQ เรียกคำสั่งย้อนตรงไม่ได้');
  -- HQ ตั้งธงของใบแล้วแก้ตาราง: สิทธิ์แถว (RLS) ไม่ให้ HQ แก้ใบของดีลเลอร์อยู่แล้ว (0 แถว) หรือตัวดักปฏิเสธ — ทั้งสองทางใบต้องยังตอบรับ
  perform set_config('pms.revert_won', 'CNX:' || q.id, true);
  begin
    update quotations set status = 'lost', lost_reason = 'x' where id = q.id and dealer_code = 'CNX';
  exception when others then null;
  end;
  perform set_config('pms.revert_won', '', true);
  perform flowtest.as_root();
  perform flowtest.ok((select status from quotations where id = q.id) = 'won', 'HQ ตั้งธงของใบแล้วแก้ตาราง ใบยังตอบรับ (ย้อนไม่ได้)');

  -- ══ ดีลเลอร์สาขาอื่น · ไม่มีเหตุผล · เกิน 7 วัน ไม่ได้ ══
  perform flowtest.as_dealer(ryg, 'RYG');
  perform flowtest.must_fail(format($q$select quotation_revert_won('CNX', %L, 'ลูกค้ายกเลิก')$q$, q.id), 'forbidden', 'ดีลเลอร์สาขาอื่นย้อนใบของ CNX ไม่ได้');
  perform flowtest.as_dealer(cnx);
  perform flowtest.must_fail(format($q$select quotation_revert_won('CNX', %L, '  ')$q$, q.id), 'reason_required', 'ย้อนต้องระบุเหตุผล');
  perform flowtest.must_fail($q$select quotation_revert_won('CNX', 'ZZR-OLD-WON-8D', 'ลูกค้ายกเลิก')$q$, 'revert_window', 'ตอบรับเกิน 7 วัน ย้อนไม่ได้');

  -- ══ ดีลเลอร์เจ้าของใบย้อนได้ · ผลเหมือนเดิม · ไทม์ไลน์ · บันทึกการใช้งาน · แจ้ง HQ 1 รายการ ══
  perform quotation_revert_won('CNX', q.id, 'ลูกค้ายกเลิกสัญญา');
  perform flowtest.as_root();
  perform flowtest.ok((select status from quotations where id = q.id) = 'sent_to_client', 'ดีลเลอร์ย้อนใบจากใบ HQ: won → ส่งแล้ว');
  perform flowtest.ok((select status from hq_quotes where id = h.id) = 'sent' and (select status from quote_requests where id = r.id) = 'quoted',
    'ย้อนแล้วใบ HQ กลับเป็นส่งแล้ว · คำขอกลับมาเปิด (ไม่นับยอดขาย HQ)');
  perform flowtest.ok(not exists (select 1 from quotation_won_at where dealer_code = 'CNX' and quote_id = q.id), 'ย้อนแล้ววันตอบรับถูกลบ');
  select total_value into tot_after from customers where dealer_code = 'CNX' and id = c1;
  perform flowtest.ok(tot_after < tot, 'ยอดลูกค้าลดตามใบที่ย้อน (' || tot || ' → ' || tot_after || ')');
  select activities into acts from leads where dealer_code = 'CNX' and num_id = l1;
  perform flowtest.ok(exists (select 1 from jsonb_array_elements(acts) a
                               where a ->> 'text' like '%ย้อนการตอบรับ%' || q.id || '%' and a ->> 'text' like '%ลูกค้ายกเลิกสัญญา%'
                                 and (cnx_name = '' or a ->> 'text' like '%' || cnx_name || '%') and (a ->> 'date') ~ '\d{1,2} \S+ \d{4} · \d{2}:\d{2}'),
    'ไทม์ไลน์ของลูกค้าเป้าหมายบอกว่าใครย้อนใบไหน เมื่อไร และเพราะอะไร');
  select count(*) into n from audit_log where action like '%ย้อนการตอบรับ%' and target like '%' || q.id || '%' and at > now() - interval '1 minute';
  perform flowtest.ok(n = 1, 'บันทึกการใช้งานมีรายการย้อน 1 รายการ');
  select count(*) into n from notifications where kind = 'won_reverted_by_dealer' and audience = 'hq' and body like '%' || q.id || '%' and body like '%ลูกค้ายกเลิกสัญญา%';
  perform flowtest.ok(n = 1, 'แจ้ง HQ 1 รายการ (H9)');
  select count(*) into n from notifications where kind = 'won_reverted' and body like '%' || q.id || '%';
  perform flowtest.ok(n = 0, 'ไม่แจ้งดีลเลอร์ (ดีลเลอร์ทำเอง)');

  perform flowtest.as_dealer(cnx);
  perform quotation_revert_won('CNX', 'ZZR-OLD-WON', 'ข้อมูลเก่าผิด', 'lost');
  perform flowtest.must_fail($q$select quotation_revert_won('CNX', 'ZZR-OLD-WON', 'ซ้ำ')$q$, 'not_won', 'ย้อนใบที่ไม่ได้ won อยู่ไม่ได้');
  perform flowtest.as_root();
  perform flowtest.ok((select status from quotations where id = 'ZZR-OLD-WON') = 'lost'
                  and (select lost_reason from quotations where id = 'ZZR-OLD-WON') = 'ข้อมูลเก่าผิด', 'ดีลเลอร์ย้อนใบเก่า: won → ไม่สำเร็จ (พร้อมเหตุผล)');

  -- ══ ย้ายข้อมูลดีลเลอร์: ลูกค้าที่มีใบ won ย้ายได้ (ย้าย ไม่ใช่ลบ/ย้อน) ══
  insert into dealers (code, name, province, region, status) values ('ZZM1', 'ZZ ย้ายต้นทาง', 'ระยอง', 'ตะวันออก', 'active'), ('ZZM2', 'ZZ ย้ายปลายทาง', 'ระยอง', 'ตะวันออก', 'active');
  insert into customers (id, dealer_code, company, name) values (990901, 'ZZM1', 'ZZM ลูกค้ามีใบ won', 'ZZM ลูกค้ามีใบ won');
  alter table quotations disable trigger quotations_hq_link_guard;
  insert into quotations (id, dealer_code, customer, line_items, total_value, status, customer_id)
  values ('ZZM-Q-WON', 'ZZM1', 'ZZM ลูกค้ามีใบ won', li, 1000, 'won', 990901);
  alter table quotations enable trigger quotations_hq_link_guard;
  select total_value into tot from customers where dealer_code = 'ZZM1' and id = 990901;
  perform move_dealer_data_atomic('ZZM1', 'ZZM2');
  perform flowtest.ok((select dealer_code || '/' || status from quotations where id = 'ZZM-Q-WON') = 'ZZM2/won',
    'ย้ายข้อมูลดีลเลอร์: ใบ won ย้ายไปสาขาปลายทาง สถานะคงเป็น won');
  perform flowtest.ok((select total_value from customers where dealer_code = 'ZZM2' and id = 990901) = tot,
    'ย้ายข้อมูลดีลเลอร์: ลูกค้าที่มีใบ won ย้ายครบ ยอดสะสมไม่หาย (' || tot || ')');

  raise notice 'ALL PASS';
end $$;
rollback;
