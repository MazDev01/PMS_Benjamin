-- ── ข้อทดสอบใบ 0223: มูลค่าลีด = ยอดก่อน VAT ของใบเสนอราคาล่าสุด · ฐานเขียนเอง หน้าเว็บเขียนทับไม่ได้ ─────────────────
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
create function qvtest.as_db() returns void language plpgsql as $$
begin perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '', true); end $$;
create function qvtest.v(p_num int) returns numeric language sql as $$
  select quote_value from public.leads where dealer_code = 'CNX' and num_id = p_num $$;
create function qvtest.eq(p_got numeric, p_want numeric, p_what text) returns void language plpgsql as $$
begin
  if p_got is distinct from p_want then raise exception 'FAIL: % — ได้ % ควรได้ %', p_what, p_got, p_want; end if;
  raise notice 'ok  % (%)', p_what, coalesce(p_got::text, 'ไม่มี');
end $$;
-- ใบแบบเดิมวางตรงที่ฐาน (ปิดตัวกันใบไม่มีใบ HQ เฉพาะคำสั่งนี้) — ข้อนี้วัดตัวคำนวณมูลค่า ไม่ใช่ทางสร้างใบ
create function qvtest.quote(p_id text, p_num int, p_total numeric, p_at timestamptz) returns void language plpgsql as $$
begin
  alter table public.quotations disable trigger quotations_hq_link_guard;
  insert into public.quotations (id, dealer_code, deal_id, customer, project, total_value, status, date, created_at)
  values (p_id, 'CNX', p_num, 'ZZTEST-มูลค่าลีด', 'ZZTEST', p_total, 'draft', (p_at at time zone 'Asia/Bangkok')::date, p_at);
  alter table public.quotations enable trigger quotations_hq_link_guard;
end $$;

grant usage on schema qvtest to authenticated;
grant execute on all functions in schema qvtest to authenticated;

do $$
declare n int; m int; s numeric;
begin
  perform qvtest.as_db();
  n := (select coalesce(max(num_id), 0) from public.leads where dealer_code = 'CNX') + 1;
  m := n + 1;
  -- 1) ลีดใหม่: ยังไม่มีใบ = ไม่มีมูลค่า แม้จะส่งค่ามาเอง · ช่องประเมินราคาเดิม (value) ไม่ถูกนับ
  perform qvtest.as_dealer();
  insert into public.leads (id, num_id, dealer_code, company, name, contact, phone, province, status, value, quote_value)
  values ('#L-' || n, n, 'CNX', 'ZZTEST-มูลค่าลีด-ก', 'ZZTEST-มูลค่าลีด-ก', 'ผู้ทดสอบ', '000-000-' || lpad((n % 10000)::text, 4, '0'), 'เชียงใหม่', 'WAITING', '฿9,999,999', 777);
  perform qvtest.as_db();
  insert into public.leads (id, num_id, dealer_code, company, name, contact, phone, province, status)
  values ('#L-' || m, m, 'CNX', 'ZZTEST-มูลค่าลีด-ข', 'ZZTEST-มูลค่าลีด-ข', 'ผู้ทดสอบ', '000-000-' || lpad((m % 10000)::text, 4, '0'), 'เชียงใหม่', 'WAITING');
  perform qvtest.eq(qvtest.v(n), null, '1) ลีดใหม่ไม่มีใบ = ไม่มีมูลค่า (ค่าที่ส่งมาเองถูกทิ้ง)');

  -- 2) ใบแรก → มูลค่า = ยอดใบ · ใบที่ใหม่กว่า → เปลี่ยนตามใบใหม่สุด (ไม่ใช่ยอดสูงสุด/ผลรวม)
  perform qvtest.quote('Q-ZZQV-1', n, 500000, now() - interval '2 days');
  perform qvtest.eq(qvtest.v(n), 500000, '2) ใบแรก');
  perform qvtest.quote('Q-ZZQV-2', n, 420000, now() - interval '1 day');
  perform qvtest.eq(qvtest.v(n), 420000, '2) ใบใหม่สุดชนะ (ต่ำกว่าใบแรกก็ตาม)');
  perform qvtest.quote('Q-ZZQV-0', n, 900000, now() - interval '5 days');
  perform qvtest.eq(qvtest.v(n), 420000, '2) ใบเก่าที่บันทึกทีหลังไม่ทับใบใหม่สุด');

  -- 3) แก้ยอดใบล่าสุด → ตาม · แก้ยอดใบเก่า → ไม่กระทบ
  update public.quotations set total_value = 410000 where dealer_code = 'CNX' and id = 'Q-ZZQV-2';
  perform qvtest.eq(qvtest.v(n), 410000, '3) แก้ยอดใบล่าสุด');
  update public.quotations set total_value = 1 where dealer_code = 'CNX' and id = 'Q-ZZQV-1';
  perform qvtest.eq(qvtest.v(n), 410000, '3) แก้ยอดใบเก่าไม่กระทบ');

  -- 4) ย้ายใบล่าสุดไปลีดอื่น → ลีดเดิมกลับไปใช้ใบก่อนหน้า · ลีดใหม่ได้ยอดใบที่ย้ายมา
  --    (ใบเดิมย้ายลีดไม่ได้อยู่แล้ว — ปิดตัวล็อกเฉพาะคำสั่งนี้ เพื่อวัดว่าตัวคำนวณรับการย้ายได้ถ้าเกิดขึ้น เช่นงานดูแลระบบ)
  alter table public.quotations disable trigger quotations_legacy_lock;
  update public.quotations set deal_id = m where dealer_code = 'CNX' and id = 'Q-ZZQV-2';
  alter table public.quotations enable trigger quotations_legacy_lock;
  perform qvtest.eq(qvtest.v(n), 1, '4) ลีดเดิมใช้ใบก่อนหน้า');
  perform qvtest.eq(qvtest.v(m), 410000, '4) ลีดปลายทางได้ยอดใบ');

  -- 5) ลบใบ → คำนวณใหม่ · ลบหมด = ไม่มีมูลค่า
  delete from public.quotations where dealer_code = 'CNX' and id in ('Q-ZZQV-1', 'Q-ZZQV-0');
  perform qvtest.eq(qvtest.v(n), null, '5) ลบใบหมด = ไม่มีมูลค่า');

  -- 6) หน้าเว็บ (ดีลเลอร์) เขียนทับมูลค่าเองไม่ได้ — คำสั่งไม่ล้ม แต่ค่าคงเดิม
  perform qvtest.as_dealer();
  update public.leads set quote_value = 5, value = '฿5' where dealer_code = 'CNX' and num_id = m;
  perform qvtest.as_db();
  perform qvtest.eq(qvtest.v(m), 410000, '6) ดีลเลอร์เขียนทับมูลค่าไม่ได้');

  -- 7) สรุปยอดของ HQ รวมจากยอดใบล่าสุด ไม่ใช่ช่องประเมินราคา (ลีด ก มีประเมินราคา 9.99 ล้านแต่ไม่มีใบ)
  s := (select sum((x->>'value')::numeric) from jsonb_array_elements(
          public.lead_summary(array['CNX'], null, null, null, 'ZZTEST-มูลค่าลีด', null, null, null)->'byStatus') x);
  perform qvtest.eq(s, 410000, '7) lead_summary รวมจากยอดใบล่าสุด');
  raise notice 'ALL PASS';
end $$;
rollback;
