-- ── ด่าน 2: ตาราง "การมองเห็นข้อมูล — ข้อมูลแต่ละชิ้น ใครเห็นได้" (FLOW.html) ยิงตรงฐานทุกแถว ─────────────────────
--   ราคาแม่แบบ                      HQ เท่านั้น            (เมื่อเปิดสวิตช์ซ่อนราคา — ระบบจริงยังปิดจนกว่าใบ HQ ขึ้นระบบ)
--   แม่แบบ (รูป สเปก แบบ)            HQ + ดีลเลอร์ทุกราย
--   Lead · ลูกค้า · นัดหมาย           ดีลเลอร์เจ้าของ + HQ (อ่าน)
--   คำขอใบเสนอราคา                  ดีลเลอร์เจ้าของ + HQ
--   ใบ HQ (ต้นทุนดีลเลอร์)            HQ + ดีลเลอร์ที่ได้รับใบ
--   % ที่ดีลเลอร์บวก                  ดีลเลอร์เจ้าของ + HQ (ดู margin)
--   ใบเสนอราคาลูกค้า                 ดีลเลอร์เจ้าของ + HQ (อ่าน) · ลูกค้าเห็นราคาขายอย่างเดียว (หน้าพิมพ์/ส่งออก = ด่าน 3)
--   ผู้สนใจเป็นดีลเลอร์ · ใบค่าแฟรนไชส์ HQ เท่านั้น
-- "อ่าน" ของ HQ = แก้ข้อมูลขายของดีลเลอร์ตรงที่ตารางไม่ได้ (การโอนลูกค้าเป้าหมายของ HQ ทำผ่านคำสั่งของระบบ · ด่าน 1)
-- รัน: docker exec -i <คอนเทนเนอร์ฐานทดสอบ> psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/visibility.sql
begin;

create schema flowtest;
create table flowtest.t_ctx as
select
  (select id from profiles where role = 'DEALER_ADMIN' and dealer_code = 'CNX' limit 1) as cnx_uid,
  (select id from profiles where role = 'DEALER_ADMIN' and dealer_code = 'RYG' limit 1) as ryg_uid,
  (select id from profiles where role = 'SUPER_ADMIN' limit 1)                          as hq_uid,
  (select num_id from leads where dealer_code = 'CNX' and status in ('WAITING','BULLET') order by num_id limit 1) as lead_id;
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
/** นับแถวที่ผู้เรียกปัจจุบันเห็น */
create function flowtest.n(p_sql text) returns bigint language plpgsql as $$
declare v bigint; begin execute 'select count(*) from (' || p_sql || ') x' into v; return v; end $$;
/** คำสั่งเขียนนี้ต้องไม่มีผล: ถูกปฏิเสธ หรือกฎรายแถวกรองจนไม่โดนแถวไหน */
create function flowtest.no_write(p_sql text, p_what text) returns void language plpgsql as $$
declare k bigint;
begin
  begin execute p_sql; get diagnostics k = row_count;
  -- รับเฉพาะ "ไม่มีสิทธิ์" — error อื่น (เช่นพิมพ์ชื่อคอลัมน์ผิด) ต้องตก ไม่งั้นข้อนี้ผ่านทั้งที่ไม่ได้วัดสิทธิ์
  exception when insufficient_privilege then raise notice 'ok  % (ถูกปฏิเสธ)', p_what; return;
  end;
  if k > 0 then raise exception 'FAIL: % — เขียนได้ % แถว', p_what, k; end if;
  raise notice 'ok  % (ไม่โดนแถวไหน)', p_what;
end $$;
grant usage on schema flowtest to authenticated;
grant execute on all functions in schema flowtest to authenticated;

do $$
declare
  c record; r quote_requests; h hq_quotes; d_r quote_requests; d_h hq_quotes; cust bigint; appt text;
  lines jsonb := '[{"name":"โครงเหล็ก","qty":10,"unit":"ตร.ม.","unitCost":1000}]';
begin
  select * into c from flowtest.t_ctx;
  perform flowtest.ok(c.cnx_uid is not null and c.ryg_uid is not null and c.hq_uid is not null and c.lead_id is not null,
    'มีข้อมูลตั้งต้นครบ (CNX · RYG · HQ · ลูกค้าเป้าหมายของ CNX)');

  -- เตรียม: CNX ขอราคา → HQ ส่งใบ (ใบที่ส่งแล้ว) · อีกคำขอเป็นร่างที่ยังไม่ส่ง · ใบลูกค้าบวก 25%
  perform flowtest.as_dealer('CNX', c.cnx_uid);
  r := quote_request_submit(c.lead_id, 'โกดังและคลังสินค้า');
  perform flowtest.as_hq(c.hq_uid);
  perform hq_quote_save(r.id, lines, current_date + 30);
  h := hq_quote_send(r.id);
  perform flowtest.as_root();
  insert into leads (id, dealer_code, num_id, name, company, phone, province, status, created_label)
  values ('#ZZVIS-2', 'CNX', 978000002, 'ก', 'ZZVIS-ร่าง', '081-600-0002', 'เชียงใหม่', 'BULLET', '1 ม.ค. 2569');
  perform flowtest.as_dealer('CNX', c.cnx_uid);
  d_r := quote_request_submit(978000002, 'โกดังและคลังสินค้า');
  perform flowtest.as_hq(c.hq_uid);
  d_h := hq_quote_save(d_r.id, lines, current_date + 30);
  perform flowtest.as_dealer('CNX', c.cnx_uid);
  insert into quotations (id, dealer_code, quote_no, customer, total, status, date, hq_quote_id, markup_percent, line_items, items)
  values ('ZZ-Q-VIS', 'CNX', 'ZZ-Q-VIS', 'ZZ ลูกค้า', 0, 'draft', to_char(current_date, 'DD/MM/YYYY'), h.id, 25, '[]', 0);
  perform flowtest.as_root();
  select id into cust from customers where dealer_code = 'CNX' order by id limit 1;
  select id::text into appt from appointments where dealer_code = 'CNX' order by id limit 1;
  perform flowtest.ok(cust is not null, 'มีลูกค้าของ CNX ในฐานทดสอบ');

  -- ══ ราคาแม่แบบ: HQ เท่านั้น (เปิดสวิตช์ซ่อนราคา) ══
  update hq_policy set hide_catalog_price = true;
  perform flowtest.as_dealer('CNX', c.cnx_uid);
  perform flowtest.ok(flowtest.n('select 1 from master_catalog') = 0, 'ราคาแม่แบบ: ดีลเลอร์อ่านตารางที่มีราคาไม่ได้');
  perform flowtest.ok(not exists (select 1 from information_schema.columns where table_name = 'master_catalog_public'
                                   and column_name ilike any (array['%price%', '%cost%'])), 'ราคาแม่แบบ: มุมมองที่ดีลเลอร์อ่านไม่มีคอลัมน์ราคา');
  perform flowtest.as_hq(c.hq_uid);
  perform flowtest.ok(flowtest.n('select 1 from master_catalog') > 0, 'ราคาแม่แบบ: HQ อ่านได้');

  -- ══ แม่แบบ (รูป สเปก แบบ): HQ + ดีลเลอร์ทุกราย ══
  perform flowtest.as_dealer('CNX', c.cnx_uid);
  perform flowtest.ok(flowtest.n('select 1 from master_catalog_public') > 0, 'แม่แบบ: ดีลเลอร์ CNX เห็น');
  perform flowtest.as_dealer('RYG', c.ryg_uid);
  perform flowtest.ok(flowtest.n('select 1 from master_catalog_public') > 0, 'แม่แบบ: ดีลเลอร์ RYG เห็น');
  perform flowtest.as_root();
  update hq_policy set hide_catalog_price = false;

  -- ══ Lead · ลูกค้า · นัดหมาย: ดีลเลอร์เจ้าของ + HQ (อ่าน) ══
  perform flowtest.as_dealer('RYG', c.ryg_uid);
  perform flowtest.ok(flowtest.n(format('select 1 from leads where dealer_code = %L and num_id = %s', 'CNX', c.lead_id)) = 0, 'Lead: ดีลเลอร์อื่นไม่เห็น');
  perform flowtest.ok(flowtest.n(format('select 1 from customers where id = %s', cust)) = 0, 'ลูกค้า: ดีลเลอร์อื่นไม่เห็น');
  perform flowtest.ok(appt is null or flowtest.n(format('select 1 from appointments where id::text = %L', appt)) = 0, 'นัดหมาย: ดีลเลอร์อื่นไม่เห็น');
  perform flowtest.no_write(format('update leads set note = note where dealer_code = %L and num_id = %s', 'CNX', c.lead_id), 'Lead: ดีลเลอร์อื่นแก้ไม่ได้');
  perform flowtest.as_dealer('CNX', c.cnx_uid);
  perform flowtest.ok(flowtest.n(format('select 1 from leads where dealer_code = %L and num_id = %s', 'CNX', c.lead_id)) = 1
                  and flowtest.n(format('select 1 from customers where id = %s', cust)) = 1, 'Lead · ลูกค้า: ดีลเลอร์เจ้าของเห็น');
  perform flowtest.as_hq(c.hq_uid);
  perform flowtest.ok(flowtest.n(format('select 1 from leads where dealer_code = %L and num_id = %s', 'CNX', c.lead_id)) = 1
                  and flowtest.n(format('select 1 from customers where id = %s', cust)) = 1
                  and (appt is null or flowtest.n(format('select 1 from appointments where id::text = %L', appt)) = 1), 'Lead · ลูกค้า · นัดหมาย: HQ อ่านได้');
  perform flowtest.no_write(format('update leads set note = note where dealer_code = %L and num_id = %s', 'CNX', c.lead_id), 'Lead: HQ แก้ตรงที่ตารางไม่ได้ (อ่านอย่างเดียว)');
  perform flowtest.no_write(format('update customers set name = name where id = %s', cust), 'ลูกค้า: HQ แก้ไม่ได้');
  perform flowtest.no_write(format('delete from leads where dealer_code = %L and num_id = %s', 'CNX', c.lead_id), 'Lead: HQ ลบไม่ได้');
  perform flowtest.no_write($q$insert into leads (id, dealer_code, num_id, name, company, phone, province, status) values ('#ZZVIS-HQ', 'CNX', 978000009, 'ก', 'ZZVIS-HQ', '081-600-0009', 'เชียงใหม่', 'WAITING')$q$, 'Lead: HQ สร้างให้ดีลเลอร์ตรงที่ตารางไม่ได้');
  perform flowtest.no_write(format('update appointments set note = note where dealer_code = %L', 'CNX'), 'นัดหมาย: HQ แก้ไม่ได้');

  -- ══ คำขอใบเสนอราคา: ดีลเลอร์เจ้าของ + HQ ══
  perform flowtest.as_dealer('CNX', c.cnx_uid);
  perform flowtest.ok(flowtest.n(format('select 1 from quote_requests where id = %s', r.id)) = 1, 'คำขอ: ดีลเลอร์เจ้าของเห็น');
  perform flowtest.as_dealer('RYG', c.ryg_uid);
  perform flowtest.ok(flowtest.n(format('select 1 from quote_requests where id = %s', r.id)) = 0, 'คำขอ: ดีลเลอร์อื่นไม่เห็น');
  perform flowtest.ok(flowtest.n(format('select 1 from quote_request_events where request_id = %s', r.id)) = 0, 'คำขอ: ดีลเลอร์อื่นไม่เห็นประวัติคำขอ');
  perform flowtest.as_hq(c.hq_uid);
  perform flowtest.ok(flowtest.n(format('select 1 from quote_requests where id = %s', r.id)) = 1, 'คำขอ: HQ เห็น');

  -- ══ ใบ HQ (ต้นทุนดีลเลอร์): HQ + ดีลเลอร์ที่ได้รับใบ ══
  perform flowtest.ok(flowtest.n(format('select 1 from hq_quotes where id in (%s, %s)', h.id, d_h.id)) = 2, 'ใบ HQ: HQ เห็นทั้งที่ส่งแล้วและร่าง');
  perform flowtest.as_dealer('CNX', c.cnx_uid);
  perform flowtest.ok(flowtest.n(format('select 1 from hq_quotes where id = %s', h.id)) = 1, 'ใบ HQ: ดีลเลอร์ที่ได้รับใบเห็น');
  perform flowtest.ok(flowtest.n(format('select 1 from hq_quotes where id = %s', d_h.id)) = 0, 'ใบ HQ: ร่างที่ยังไม่ส่ง ดีลเลอร์ไม่เห็น');
  perform flowtest.no_write(format('update hq_quotes set note = %L where id = %s', 'x', h.id), 'ใบ HQ: ดีลเลอร์แก้ไม่ได้');
  perform flowtest.as_dealer('RYG', c.ryg_uid);
  perform flowtest.ok(flowtest.n(format('select 1 from hq_quotes where id = %s', h.id)) = 0, 'ใบ HQ: ดีลเลอร์อื่นไม่เห็น');

  -- ══ % ที่ดีลเลอร์บวก + ใบเสนอราคาลูกค้า: ดีลเลอร์เจ้าของ + HQ (อ่าน / ดู margin) ══
  perform flowtest.as_dealer('CNX', c.cnx_uid);
  perform flowtest.ok((select markup_percent from quotations where id = 'ZZ-Q-VIS') = 25, '% ที่บวก: ดีลเลอร์เจ้าของเห็น');
  perform flowtest.as_dealer('RYG', c.ryg_uid);
  perform flowtest.ok(flowtest.n($q$select 1 from quotations where id = 'ZZ-Q-VIS'$q$) = 0, '% ที่บวก · ใบลูกค้า: ดีลเลอร์อื่นไม่เห็น');
  perform flowtest.no_write($q$update quotations set markup_percent = 0 where id = 'ZZ-Q-VIS'$q$, 'ใบลูกค้า: ดีลเลอร์อื่นแก้ไม่ได้');
  perform flowtest.as_hq(c.hq_uid);
  perform flowtest.ok((select markup_percent from quotations where id = 'ZZ-Q-VIS') = 25, '% ที่บวก: HQ เห็น (ดู margin)');
  perform flowtest.no_write($q$update quotations set markup_percent = 0 where id = 'ZZ-Q-VIS'$q$, 'ใบลูกค้า: HQ แก้ไม่ได้ (อ่านอย่างเดียว)');
  perform flowtest.no_write($q$delete from quotations where id = 'ZZ-Q-VIS'$q$, 'ใบลูกค้า: HQ ลบไม่ได้');

  -- ══ ผู้สนใจเป็นดีลเลอร์ · ใบค่าแฟรนไชส์: HQ เท่านั้น ══
  perform flowtest.as_dealer('CNX', c.cnx_uid);
  perform flowtest.ok(flowtest.n('select 1 from dealer_prospects') = 0 and flowtest.n('select 1 from dealer_prospect_activities') = 0,
    'ผู้สนใจเป็นดีลเลอร์ · ใบค่าแฟรนไชส์: ดีลเลอร์ไม่เห็นเลย');
  perform flowtest.no_write($q$insert into dealer_prospects (name) values ('ZZVIS-ผู้สนใจ')$q$, 'ผู้สนใจ: ดีลเลอร์สร้างไม่ได้');
  perform flowtest.as_root();
  insert into dealer_prospects (name) values ('ZZVIS-ผู้สนใจของ HQ');
  select count(*) into cust from dealer_prospects;
  perform flowtest.as_hq(c.hq_uid);
  perform flowtest.ok(cust > 0 and flowtest.n('select 1 from dealer_prospects') = cust, 'ผู้สนใจ: HQ เห็นครบ (' || cust || ' ราย)');

  raise notice 'ALL PASS';
end $$;
rollback;
