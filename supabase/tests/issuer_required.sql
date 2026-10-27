-- ── ใบ 0247: ส่ง/พิมพ์ใบเสนอราคาให้ลูกค้าไม่ได้จนกว่ากรอกข้อมูลบริษัทครบ (ชื่อบริษัท · ที่อยู่ · เลขผู้เสียภาษี) ─────────────
-- รัน: docker exec -i <คอนเทนเนอร์ฐานทดสอบ> psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/issuer_required.sql
-- สาขาทดสอบ ZZQ (ข้อมูลบริษัทยังไม่ครบ) · ZZR (สาขาอื่น ใช้ตรวจสิทธิ์) · ย้อนทั้งหมดตอนจบ
-- ข้อที่ต้องตกบนโค้ดก่อนใบ 0247: ทุกข้อ "ถูกปฏิเสธ" (เดิมส่ง/เปลี่ยนสถานะได้ · ไม่มีคำสั่ง quotation_print_data)
begin;
create schema flowtest;
create function flowtest.ok(p_cond boolean, p_what text) returns void language plpgsql as $$
begin if p_cond is not true then raise exception 'FAIL: %', p_what; end if; raise notice 'ok  %', p_what; end $$;
create function flowtest.must_fail(p_sql text, p_like text, p_what text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if sqlerrm ilike '%' || p_like || '%' then raise notice 'ok  % (ถูกปฏิเสธ: %)', p_what, sqlerrm; return; end if;
    raise exception 'FAIL: % — ถูกปฏิเสธแต่ข้อความไม่ตรง: %', p_what, sqlerrm;
  end;
  raise exception 'FAIL: % — ควรถูกปฏิเสธแต่ผ่าน', p_what;
end $$;
create function flowtest.ผู้ใช้(p_dealer text) returns uuid language sql immutable as $$ select md5('zzissuer-' || p_dealer)::uuid $$;
create function flowtest.as_user(p_role text, p_dealer text) returns void language plpgsql as $$
begin
  -- ผู้ใช้จริงของสาขา (profiles · สิทธิ์เขียนงานขายต้องเป็นบัญชีที่เปิดใช้อยู่) — สร้างไว้ในส่วนข้อมูลที่รู้ค่า
  perform set_config('request.jwt.claims', json_build_object('sub', flowtest.ผู้ใช้(p_dealer), 'role', 'authenticated',
    'user_role', p_role, 'dealer_code', p_dealer, 'email', 'zzissuer@example.test')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function flowtest.as_root() returns void language plpgsql as $$
begin perform set_config('role', 'none', true); perform set_config('request.jwt.claims', '', true); end $$;
grant usage on schema flowtest to authenticated;
grant execute on all functions in schema flowtest to authenticated;

-- ═══ ข้อมูลที่รู้ค่า ═══
select flowtest.as_root();
insert into dealers (code, name, province, status) values ('ZZQ', 'ZZQ สาขาทดสอบข้อมูลบริษัท', 'ระยอง', 'active'),
                                                         ('ZZR', 'ZZR สาขาอื่น', 'ตราด', 'active');
insert into auth.users (id, email, aud, role) values
  (flowtest.ผู้ใช้('ZZQ'), 'zzissuer-zzq@example.test', 'authenticated', 'authenticated'),
  (flowtest.ผู้ใช้('ZZR'), 'zzissuer-zzr@example.test', 'authenticated', 'authenticated');
insert into profiles (id, role, name, status, dealer_code) values
  (flowtest.ผู้ใช้('ZZQ'), 'DEALER_ADMIN', 'ZZQ ผู้ใช้', 'active', 'ZZQ'), (flowtest.ผู้ใช้('ZZR'), 'DEALER_ADMIN', 'ZZR ผู้ใช้', 'active', 'ZZR')
  on conflict (id) do update set role = excluded.role, name = excluded.name, status = 'active', dealer_code = excluded.dealer_code;
insert into dealer_settings (dealer_code, issuer) values ('ZZQ', '{"company":"","address":"","phone":"","taxId":""}');
set local session_replication_role = replica;   -- ใส่ใบตรง ๆ (ข้ามตัวดักใบ HQ) · ใบเก่าไม่มีใบ HQ ยังส่งได้ตามกติกาเดิม
insert into quotations (id, dealer_code, customer, status, total_value, date, issuer) values
  ('ZZQ-Q1', 'ZZQ', 'ZZQ ลูกค้า 1', 'draft',          100000, '2026-10-20', null),
  ('ZZQ-Q2', 'ZZQ', 'ZZQ ลูกค้า 2', 'draft',          200000, '2026-10-20', null),
  ('ZZQ-Q3', 'ZZQ', 'ZZQ ลูกค้า 3', 'sent_to_client', 300000, '2026-10-01', null),
  ('ZZQ-Q4', 'ZZQ', 'ZZQ ลูกค้า 4', 'draft',          400000, '2026-10-20',
     '{"company":"ZZQ บริษัทชื่อเดิม","address":"ZZQ ที่อยู่เดิม","phone":"000-000-0001","taxId":"0000000000001"}');
set local session_replication_role = origin;

do $$
declare k jsonb; n int;
begin
  -- ═══ ข้อมูลบริษัทยังไม่ครบ ═══
  perform flowtest.as_user('DEALER_ADMIN', 'ZZQ');
  perform flowtest.must_fail($q$select quotation_send('ZZQ', 'ZZQ-Q1')$q$, 'issuer_incomplete',
    'ส่งใบผ่านคำสั่งส่งใบ: ข้อมูลบริษัทว่าง = ปฏิเสธ');
  perform flowtest.must_fail($q$select quotation_send('ZZQ', 'ZZQ-Q1')$q$, 'ชื่อบริษัท · ที่อยู่ · เลขผู้เสียภาษี',
    'ข้อความปฏิเสธบอกช่องที่ยังขาดครบ 3 ช่อง');
  perform flowtest.must_fail($q$update quotations set status = 'sent_to_client' where dealer_code = 'ZZQ' and id = 'ZZQ-Q2'$q$, 'issuer_incomplete',
    'เปลี่ยนสถานะตรงที่ตาราง (ไม่ผ่านคำสั่งส่งใบ) = ปฏิเสธเหมือนกัน');
  perform flowtest.must_fail($q$select quotation_print_data('ZZQ', 'ZZQ-Q1')$q$, 'issuer_incomplete',
    'พิมพ์ใบ: ข้อมูลบริษัทว่าง = ปฏิเสธ');
  -- ใบร่างยังแก้ได้ตามปกติ
  update quotations set note = 'ZZQ แก้ใบร่าง' where dealer_code = 'ZZQ' and id = 'ZZQ-Q1';
  perform flowtest.ok((select note from quotations where dealer_code = 'ZZQ' and id = 'ZZQ-Q1') = 'ZZQ แก้ใบร่าง',
    'ใบร่างแก้ได้ตามปกติแม้ข้อมูลบริษัทยังไม่ครบ');
  perform flowtest.ok((select status::text from quotations where dealer_code = 'ZZQ' and id = 'ZZQ-Q2') = 'draft', 'ใบที่ถูกปฏิเสธยังเป็นใบร่าง');
  -- ใบที่ส่งไปแล้วก่อนหน้า: ส่งซ้ำได้ (ไม่ใช่การส่งครั้งใหม่)
  k := to_jsonb(quotation_send('ZZQ', 'ZZQ-Q3'));
  perform flowtest.ok(k ->> 'status' = 'sent_to_client', 'ใบที่ส่งแล้วก่อนหน้า ส่งซ้ำได้ (กติกาใช้กับการส่งครั้งใหม่)');
  -- ใบที่ตรึงข้อมูลบริษัทเดิมไว้ครบ พิมพ์ได้ด้วยชื่อเดิม (ใบเก่าคงชื่อเดิม)
  k := quotation_print_data('ZZQ', 'ZZQ-Q4');
  perform flowtest.ok(k #>> '{issuer,company}' = 'ZZQ บริษัทชื่อเดิม', format('ใบที่ตรึงข้อมูลบริษัทครบ พิมพ์ด้วยชื่อที่ตรึงไว้ (ได้ %s)', k));

  -- ═══ กรอกไม่ครบ / ช่องว่างล้วน ═══
  perform flowtest.as_root();
  update dealer_settings set issuer = '{"company":"ZZQ บริษัทใหม่","address":"ZZQ ที่อยู่ใหม่","phone":"","taxId":"   "}' where dealer_code = 'ZZQ';
  perform flowtest.as_user('DEALER_ADMIN', 'ZZQ');
  perform flowtest.must_fail($q$select quotation_send('ZZQ', 'ZZQ-Q1')$q$, '(ยังขาด: เลขผู้เสียภาษี)',
    'เลขผู้เสียภาษีเป็นช่องว่างล้วน = ยังขาด (บอกเฉพาะช่องที่ขาด)');
  perform flowtest.must_fail($q$select quotation_print_data('ZZQ', 'ZZQ-Q1')$q$, 'เลขผู้เสียภาษี', 'พิมพ์: ยังขาดเลขผู้เสียภาษี = ปฏิเสธ');

  -- ═══ กรอกครบ ═══
  perform flowtest.as_root();
  update dealer_settings set issuer = '{"company":"ZZQ บริษัทใหม่","address":"ZZQ ที่อยู่ใหม่","phone":"000-000-0002","taxId":"0000000000002"}' where dealer_code = 'ZZQ';
  perform flowtest.as_user('DEALER_ADMIN', 'ZZQ');
  k := to_jsonb(quotation_send('ZZQ', 'ZZQ-Q1'));
  perform flowtest.ok(k ->> 'status' = 'sent_to_client', 'ข้อมูลบริษัทครบ = ส่งใบได้');
  update quotations set status = 'sent_to_client' where dealer_code = 'ZZQ' and id = 'ZZQ-Q2';
  perform flowtest.ok((select status::text from quotations where dealer_code = 'ZZQ' and id = 'ZZQ-Q2') = 'sent_to_client', 'ข้อมูลครบ = เปลี่ยนสถานะได้');
  k := quotation_print_data('ZZQ', 'ZZQ-Q1');
  perform flowtest.ok(k -> 'issuer' = '{"company":"ZZQ บริษัทใหม่","address":"ZZQ ที่อยู่ใหม่","phone":"000-000-0002","taxId":"0000000000002"}'::jsonb
    and k ->> 'printedAt' is not null, format('พิมพ์ได้ · หัวกระดาษ = ข้อมูลบริษัทปัจจุบัน (ใบไม่ได้ตรึงไว้) (ได้ %s)', k));
  perform flowtest.must_fail($q$select count(*) from quotation_prints$q$, 'permission denied', 'ผู้ใช้อ่านบันทึกการพิมพ์ตรงไม่ได้');
  perform flowtest.must_fail($q$insert into quotation_prints (dealer_code, quote_id) values ('ZZQ', 'ZZQ-Q1')$q$, 'permission denied',
    'ผู้ใช้เขียนบันทึกการพิมพ์เองไม่ได้ (ต้องผ่านคำสั่งพิมพ์)');

  -- ═══ สิทธิ์ ═══
  perform flowtest.as_user('DEALER_ADMIN', 'ZZR');
  perform flowtest.must_fail($q$select quotation_print_data('ZZQ', 'ZZQ-Q1')$q$, 'forbidden', 'สาขาอื่นขอข้อมูลพิมพ์ใบของสาขานี้ไม่ได้');
  perform flowtest.must_fail($q$select quotation_print_data('ZZQ', 'ไม่มีใบนี้')$q$, 'forbidden', 'สาขาอื่นขอใบที่ไม่มีจริงก็ไม่ได้ (ไม่บอกว่ามี/ไม่มี)');
  perform flowtest.as_user('DEALER_ADMIN', 'ZZQ');
  perform flowtest.must_fail($q$select quotation_print_data('ZZQ', 'ไม่มีใบนี้')$q$, 'quote_not_found', 'ใบที่ไม่มีจริง = ไม่พบ');

  -- ═══ บันทึกเวลาพิมพ์ ═══
  perform flowtest.as_root();
  select count(*) into n from quotation_prints where dealer_code = 'ZZQ';
  perform flowtest.ok(n = 2, format('จดเวลาพิมพ์ทุกครั้งที่พิมพ์สำเร็จ (Q4 + Q1) · ครั้งที่ถูกปฏิเสธไม่จด (ได้ %s)', n));
  perform flowtest.ok((select count(*) from quotation_prints where dealer_code = 'ZZQ' and quote_id = 'ZZQ-Q1' and printed_at is not null) = 1,
    'บันทึกการพิมพ์มีเลขใบและเวลา');

  -- ═══ งานระบบ (ข้อมูลตั้งต้นของชุดทดสอบ) ไม่ผ่านกติกานี้ ═══
  update dealer_settings set issuer = '{}' where dealer_code = 'ZZQ';
  update quotations set status = 'draft' where dealer_code = 'ZZQ' and id = 'ZZQ-Q2';
  update quotations set status = 'sent_to_client' where dealer_code = 'ZZQ' and id = 'ZZQ-Q2';
  perform flowtest.ok((select status::text from quotations where dealer_code = 'ZZQ' and id = 'ZZQ-Q2') = 'sent_to_client',
    'งานระบบ (ไม่ใช่ผู้ใช้ที่เข้าระบบ) เปลี่ยนสถานะได้');
end $$;

select 'ALL PASS' as result;
rollback;
