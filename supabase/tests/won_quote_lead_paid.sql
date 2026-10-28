-- ── ใบ 0252: ใบที่ลูกค้าตอบรับแล้ว = ลีดปิดการขายสำเร็จเสมอ (บอสสั่ง 28 ต.ค. 69 · บั๊ก L037) ─────────────────────────────
-- รัน: docker exec -i <คอนเทนเนอร์ฐานทดสอบ> psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/won_quote_lead_paid.sql
-- ลีด/ใบทดสอบ ZZWP · ย้อนทั้งหมดตอนจบ (rollback)
-- ข้อที่ต้องตกบนโค้ด/ข้อมูลก่อนใบ 0252:
--   ① ข้อมูลตั้งต้นมีลีดที่ใบตอบรับแล้วแต่ไม่ใช่ปิดสำเร็จ (22 ราย) · ② ใบแบบเดิม won แล้วลีดไม่ขยับ · ③ ลีดออกจาก PAID ได้ทั้งที่ใบยังตอบรับ
begin;
create schema wptest;
create function wptest.ok(p_cond boolean, p_what text) returns void language plpgsql as $$
begin if p_cond is not true then raise exception 'FAIL: %', p_what; end if; raise notice 'ok  %', p_what; end $$;
create function wptest.must_fail(p_sql text, p_like text, p_what text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if sqlerrm ilike '%' || p_like || '%' then raise notice 'ok  % (ถูกปฏิเสธ)', p_what; return; end if;
    raise exception 'FAIL: % — ถูกปฏิเสธแต่ข้อความไม่ตรง: %', p_what, sqlerrm;
  end;
  raise exception 'FAIL: % — ควรถูกปฏิเสธแต่ผ่าน', p_what;
end $$;
create function wptest.ผู้ใช้(p_role text, p_dealer text) returns uuid language sql stable as $$
  select id from profiles where role::text = p_role and coalesce(dealer_code, '') = p_dealer and status::text = 'active' order by id limit 1 $$;
create function wptest.as_user(p_role text, p_dealer text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', wptest.ผู้ใช้(p_role, p_dealer), 'role', 'authenticated',
    'user_role', p_role, 'dealer_code', p_dealer, 'email', 'zzwp@example.test')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function wptest.as_root() returns void language plpgsql as $$
begin perform set_config('role', 'none', true); perform set_config('request.jwt.claims', '', true); end $$;
create function wptest.สถานะ(p_num int) returns text language sql as $$ select status::text from leads where dealer_code = 'RYG' and num_id = p_num $$;
grant usage on schema wptest to authenticated;
grant execute on all functions in schema wptest to authenticated;

-- ① ข้อมูลที่ค้างอยู่ในฐาน (ข้อมูลตั้งต้นของฐานทดสอบมีลีดแบบนี้ก่อนใบ 0252) ต้องถูกซ่อมหมด
do $$ begin
  perform wptest.ok(not exists (
    select 1 from leads l where l.status <> 'PAID'
       and exists (select 1 from quotations q where q.dealer_code = l.dealer_code and q.deal_id = l.num_id and q.status = 'won')),
    'ไม่มีลีดที่ใบตอบรับแล้วแต่ไม่ใช่ปิดสำเร็จ (ข้อมูลเดิมถูกซ่อม)');
end $$;

-- ข้อมูลทดสอบ: ลีดเสนอราคา + ใบแบบเดิม (ไม่มีใบ HQ) ที่ส่งให้ลูกค้าแล้ว · ลีดปิดสำเร็จ + ใบ won (ย้อนได้)
set local session_replication_role = replica;
insert into leads (id, num_id, dealer_code, company, name, phone, province, status, assigned) values
  ('#L-ZZWP1', 990901, 'RYG', 'ZZWP ลีด 1', 'ZZWP ลีด 1', '000-000-0901', 'ระยอง', 'QUOTED', 'ทดสอบระบบ'),
  ('#L-ZZWP2', 990902, 'RYG', 'ZZWP ลีด 2', 'ZZWP ลีด 2', '000-000-0902', 'ระยอง', 'PAID', 'ทดสอบระบบ');
update leads set status_before_paid = 'QUOTED' where dealer_code = 'RYG' and num_id = 990902;
insert into quotations (id, dealer_code, quote_no, customer, project, total, total_value, status, date, items, line_items, customer_id, deal_id) values
  ('Q-ZZWP-1', 'RYG', 'Q-ZZWP-1', 'ZZWP ลีด 1', 'ZZWP', '฿100,000', 100000, 'sent_to_client', '2026-10-01', 1, '[]',
   (select id from customers where dealer_code = 'RYG' order by id limit 1), 990901),
  ('Q-ZZWP-2', 'RYG', 'Q-ZZWP-2', 'ZZWP ลีด 2', 'ZZWP', '฿100,000', 100000, 'won', '2026-10-01', 1, '[]',
   (select id from customers where dealer_code = 'RYG' order by id limit 1), 990902);
set local session_replication_role = origin;

do $$ begin
  -- ② ใบแบบเดิมเปลี่ยนเป็นตอบรับ → ฐานตั้งลีดเป็นปิดสำเร็จในคำสั่งเดียวกัน
  perform wptest.as_user('DEALER_ADMIN', 'RYG');
  update quotations set status = 'won' where dealer_code = 'RYG' and id = 'Q-ZZWP-1';
  perform wptest.ok((select status::text from quotations where dealer_code = 'RYG' and id = 'Q-ZZWP-1') = 'won',
    'ใบเปลี่ยนเป็นตอบรับจริง (คำสั่งไม่ถูกสิทธิ์รายแถวกรองทิ้งเงียบ ๆ)');
  perform wptest.ok(wptest.สถานะ(990901) = 'PAID', format('ใบแบบเดิมตอบรับ → ลีดปิดสำเร็จ (ได้ %s)', wptest.สถานะ(990901)));
  perform wptest.ok((select status_before_paid::text from leads where dealer_code = 'RYG' and num_id = 990901) = 'QUOTED',
    'จำขั้นก่อนปิดไว้ (ย้อนการตอบรับกลับขั้นเดิมได้)');

  -- ③ ลีดออกจากปิดสำเร็จไม่ได้ ทั้งที่ใบยังตอบรับอยู่ — ทุกบทบาท รวมกุญแจฝั่งเซิร์ฟเวอร์/งานในฐาน
  perform wptest.as_root();
  perform wptest.must_fail($q$update leads set status = 'QUOTED' where dealer_code = 'RYG' and num_id = 990902$q$,
    'lead_won_not_paid', 'กุญแจฝั่งเซิร์ฟเวอร์ตั้งลีดที่ใบตอบรับแล้วกลับเป็นเสนอราคา = ปฏิเสธ');
  perform wptest.must_fail($q$update leads set status = 'CANCELLED', lost_reason = 'ทดสอบ' where dealer_code = 'RYG' and num_id = 990902$q$,
    'lead_won_not_paid', 'ปิดไม่สำเร็จทั้งที่ใบตอบรับแล้ว = ปฏิเสธ');
  perform wptest.ok(wptest.สถานะ(990902) = 'PAID', 'ลีดยังปิดสำเร็จ');

  -- ย้อนการตอบรับ (HQ · ใบ won → ส่งแล้ว แล้วลีดกลับขั้นเดิม ในคำสั่งเดียว) ยังทำได้
  perform wptest.as_user('SUPER_ADMIN', '');
  perform quotation_revert_won('RYG', 'Q-ZZWP-2', 'ทดสอบย้อน', 'sent_to_client');
  perform wptest.as_root();
  perform wptest.ok(wptest.สถานะ(990902) = 'QUOTED', format('HQ ย้อนการตอบรับ → ลีดกลับเสนอราคา (ได้ %s)', wptest.สถานะ(990902)));
end $$;

select 'ALL PASS' as result;
rollback;
