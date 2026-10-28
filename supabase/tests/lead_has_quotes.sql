-- ── ข้อทดสอบใบ 0258: leads.has_quotes = มีคำขอราคา (ทุกสถานะ) หรือใบเสนอราคาที่ผูกลีด · ฐานเขียนเอง หน้าเว็บเขียนทับไม่ได้ ─────
--   ตารางลีดใช้ซ่อน/แสดงปุ่มลบ (บอสสั่ง 28 ต.ค. 69) — ต้องตรงกับตัวกันลบลีด 0217 (lead_has_quotes) ทุกกรณี
-- รัน: docker exec -i supabase_db_pms-dbcheck psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 < supabase/tests/lead_has_quotes.sql
-- ทรานแซกชันเดียวแล้ว rollback · รอบปิดด่านรันผ่าน tests/scenario/db-rule-tests.spec.ts · ผ่าน = "ALL PASS"
-- ตกบนโค้ดก่อนใบ 0258: ไม่มีคอลัมน์ has_quotes
begin;
create schema hqtest;
create function hqtest.as_dealer() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.profiles where role = 'DEALER_ADMIN' and dealer_code = 'CNX' limit 1),
    'role', 'authenticated', 'user_role', 'DEALER_ADMIN', 'dealer_code', 'CNX')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function hqtest.as_db() returns void language plpgsql as $$
begin perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '', true); end $$;
create function hqtest.v(p_num int) returns boolean language sql as $$
  select has_quotes from public.leads where dealer_code = 'CNX' and num_id = p_num $$;
create function hqtest.s(p_num int) returns int language sql as $$
  select reached_step from public.leads where dealer_code = 'CNX' and num_id = p_num $$;
create table hqtest.fails (what text);
create function hqtest.eq(p_got boolean, p_want boolean, p_what text) returns void language plpgsql as $$
begin
  if p_got is distinct from p_want then
    insert into hqtest.fails values (format('%s — ได้ %s ควรได้ %s', p_what, coalesce(p_got::text, 'ไม่มี'), p_want));
    raise notice 'FAIL %', p_what; return;
  end if;
  raise notice 'ok  % (%)', p_what, p_got;
end $$;
create function hqtest.lead(p_num int, p_tag text) returns void language plpgsql as $$
begin
  insert into public.leads (id, num_id, dealer_code, company, name, contact, phone, province, status)
  values ('#L-' || p_num, p_num, 'CNX', 'ZZTEST-มีคำขอ-' || p_tag, 'ZZTEST-มีคำขอ-' || p_tag, 'ผู้ทดสอบ',
          '000-000-' || lpad((p_num % 10000)::text, 4, '0'), 'เชียงใหม่', 'WAITING');
end $$;
grant usage on schema hqtest to authenticated;
grant execute on all functions in schema hqtest to authenticated;
grant select, insert on hqtest.fails to authenticated;

do $$
declare n int; r int; q int; rid bigint; ลบได้ boolean;
begin
  perform hqtest.as_db();
  n := (select coalesce(max(num_id), 0) from public.leads where dealer_code = 'CNX') + 1;
  r := n + 1; q := n + 2;

  -- 1) ลีดใหม่ = ยังไม่มีคำขอ/ใบ แม้ส่งค่ามาเอง
  perform hqtest.as_dealer();
  insert into public.leads (id, num_id, dealer_code, company, name, contact, phone, province, status, has_quotes)
  values ('#L-' || n, n, 'CNX', 'ZZTEST-มีคำขอ-ก', 'ZZTEST-มีคำขอ-ก', 'ผู้ทดสอบ', '000-000-' || lpad((n % 10000)::text, 4, '0'), 'เชียงใหม่', 'WAITING', true);
  perform hqtest.as_db();
  perform hqtest.eq(hqtest.v(n), false, '1) ลีดใหม่ = ไม่มีคำขอ/ใบ (ค่าที่ส่งมาเองถูกทิ้ง)');
  perform hqtest.eq(hqtest.s(n) = 1, true, '1) ลีดใหม่ ขั้นที่ไปถึง = 1 (ข้อมูลลูกค้า)');

  -- 2) ส่งคำขอราคา → มี · ยกเลิกคำขอแล้ว (ลีดกลับขั้นต้น) ก็ยังมี — ลบไม่ได้ตามกฎ 0217
  perform hqtest.lead(r, 'ข');
  perform hqtest.as_dealer();
  rid := (public.quote_request_submit(r, 'โกดังสำเร็จรูป')).id;
  perform hqtest.as_db();
  perform hqtest.eq(hqtest.v(r), true, '2) ส่งคำขอราคาแล้ว = มี');
  perform hqtest.eq(hqtest.s(r) = 2, true, '2) ส่งคำขอราคาแล้ว ขั้นที่ไปถึง = 2');
  perform hqtest.as_dealer();
  perform public.quote_request_cancel(rid, 'ทดสอบยกเลิก', false);
  perform hqtest.as_db();
  perform hqtest.eq(hqtest.v(r), true, '2) ยกเลิกคำขอแล้ว (ลีดกลับขั้นต้น) ยังนับว่ามีคำขอ = ลบไม่ได้');

  -- 3) หน้าเว็บเขียนทับเป็น "ไม่มี" ไม่ได้
  perform hqtest.as_dealer();
  update public.leads set has_quotes = false, reached_step = 5 where dealer_code = 'CNX' and num_id = r;
  perform hqtest.as_db();
  perform hqtest.eq(hqtest.v(r), true, '3) หน้าเว็บเขียน has_quotes = false เองไม่ได้ (คงค่าเดิม)');
  perform hqtest.eq(hqtest.s(r) = 2, true, '3) หน้าเว็บเขียน reached_step เองไม่ได้ (คงค่าเดิม)');

  -- 4) ใบเสนอราคาผูกลีด (วางตรงที่ฐาน · ปิดตัวกันใบไม่มีใบ HQ เฉพาะคำสั่งนี้) → มี · ลบใบออก → กลับเป็นไม่มี
  perform hqtest.lead(q, 'ค');
  alter table public.quotations disable trigger quotations_hq_link_guard;
  insert into public.quotations (id, dealer_code, deal_id, customer, project, total_value, status, date)
  values ('ZZTEST-QHQ-' || q, 'CNX', q, 'ZZTEST-มีคำขอ', 'ZZTEST', 1000, 'draft', current_date);
  alter table public.quotations enable trigger quotations_hq_link_guard;
  perform hqtest.eq(hqtest.v(q), true, '4) มีใบร่างผูกลีด = มี');
  perform hqtest.eq(hqtest.s(q) = 4, true, '4) มีใบร่าง ขั้นที่ไปถึง = 4 (ทำใบให้ลูกค้า)');
  delete from public.quotations where id = 'ZZTEST-QHQ-' || q;   -- ลบได้เฉพาะใบร่าง (ใบที่ส่งแล้วฐานกัน quote_sent_no_delete)
  perform hqtest.eq(hqtest.v(q), false, '4) ลบใบร่างออกแล้ว = ไม่มี (ลบลีดได้อีกครั้ง)');
  perform hqtest.eq(hqtest.s(q) = 1, true, '4) ลบใบร่างออกแล้ว ขั้นที่ไปถึงกลับเป็น 1');
  -- ใบที่ส่งถึงลูกค้าแล้ว (ลีด r ที่มีคำขออยู่แล้ว) → ขั้นที่ไปถึง = 5
  alter table public.quotations disable trigger quotations_hq_link_guard;
  insert into public.quotations (id, dealer_code, deal_id, customer, project, total_value, status, date)
  values ('ZZTEST-QHQ-' || r, 'CNX', r, 'ZZTEST-มีคำขอ', 'ZZTEST', 1000, 'sent_to_client', current_date);
  alter table public.quotations enable trigger quotations_hq_link_guard;
  perform hqtest.eq(hqtest.s(r) = 5, true, '4) ส่งใบถึงลูกค้าแล้ว ขั้นที่ไปถึง = 5');

  -- 5) ตรงกับตัวกันลบ 0217 ทุกแถว: has_quotes = false ⇔ ลบได้
  perform hqtest.eq((select bool_and(has_quotes = _lead_has_quotes(dealer_code, num_id)) from public.leads), true,
    '5) ทุกลีดในฐาน has_quotes ตรงกับเงื่อนไขกันลบ (เติมค่าตอนลงใบครบ)');
  perform hqtest.eq((select bool_and(reached_step = _lead_reached_step(dealer_code, num_id)) from public.leads), true,
    '5) ทุกลีดในฐาน reached_step ตรงกับประวัติคำขอ/ใบ (เติมค่าตอนลงใบครบ)');
  begin
    delete from public.leads where dealer_code = 'CNX' and num_id = r;
    ลบได้ := true;
  exception when others then ลบได้ := false;
  end;
  perform hqtest.eq(ลบได้, false, '5) ลีดที่ has_quotes = true ฐานไม่ให้ลบ');
  delete from public.leads where dealer_code = 'CNX' and num_id = q;
  perform hqtest.eq(exists (select 1 from public.leads where dealer_code = 'CNX' and num_id = q), false, '5) ลีดที่ has_quotes = false ลบได้');

  if exists (select 1 from hqtest.fails) then
    raise exception 'FAIL % ข้อ: %', (select count(*) from hqtest.fails), (select string_agg(what, ' · ') from hqtest.fails);
  end if;
end $$;

select 'ALL PASS' as result;
rollback;
