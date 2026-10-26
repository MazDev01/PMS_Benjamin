-- ── ใบ 0242: กล่องงานคำขอของ HQ คืนข้อมูลลูกค้าของลีด (ผู้ติดต่อ · โทร · อีเมล · ที่อยู่) — งานชุดช่องมาตรฐาน 26 ต.ค. 69 ───────
-- รัน: docker exec -i <คอนเทนเนอร์ฐานทดสอบ> psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/quote_board_customer_info.sql
begin;
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
create function flowtest.as_user(p_uid uuid, p_role text, p_dealer text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated',
    'user_role', p_role, 'dealer_code', p_dealer, 'email', 'zzqb@example.test')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
grant usage on schema flowtest to authenticated;
grant execute on all functions in schema flowtest to authenticated;

do $$
declare
  hq  uuid := (select id from profiles where role = 'SUPER_ADMIN' limit 1);
  ryg uuid := (select id from profiles where role = 'DEALER_ADMIN' and dealer_code = 'RYG' limit 1);
  n int := 990000 + (random() * 9000)::int; rid bigint; แถว jsonb;
begin
  perform flowtest.ok(hq is not null and ryg is not null, 'มีบัญชี HQ และดีลเลอร์ RYG');
  perform flowtest.as_user(ryg, 'DEALER_ADMIN', 'RYG');
  insert into leads (id, num_id, dealer_code, company, name, contact, phone, email, address, province, status)
  values ('#L-' || n, n, 'RYG', 'ZZQB บริษัททดสอบ', 'ZZQB บริษัททดสอบ', 'คุณผู้ติดต่อ ทดสอบ', '000-000-0042', 'zzqb-lead@example.test', '42 ถ.ทดสอบ', 'ระยอง', 'BULLET');
  rid := (quote_request_submit(n, 'โกดังเก็บสินค้า 20x40 ม.', '', 800, 'สเปกทดสอบ', 'ระยอง')).id;

  perform flowtest.as_user(hq, 'SUPER_ADMIN', '');
  select r into แถว from jsonb_array_elements(hq_quote_board('todo', 'ZZQB')->'rows') r where (r->>'id')::bigint = rid;
  perform flowtest.ok(แถว is not null, 'HQ เห็นคำขอในกล่องงาน');
  perform flowtest.ok(แถว->>'lead_company' = 'ZZQB บริษัททดสอบ', 'ชื่อบริษัท (เดิม)');
  perform flowtest.ok(แถว->>'lead_contact' = 'คุณผู้ติดต่อ ทดสอบ', 'ผู้ติดต่อจากลีด');
  perform flowtest.ok(แถว->>'lead_phone' = '000-000-0042', 'โทรศัพท์จากลีด');
  perform flowtest.ok(แถว->>'lead_email' = 'zzqb-lead@example.test', 'อีเมลจากลีด');
  perform flowtest.ok(แถว->>'lead_address' = '42 ถ.ทดสอบ', 'ที่อยู่จากลีด');
  perform flowtest.ok(แถว->>'area' = '800' and แถว->>'province' = 'ระยอง', 'ข้อมูลงานคงเดิม');

  perform flowtest.as_user(ryg, 'DEALER_ADMIN', 'RYG');
  perform flowtest.must_fail($q$select hq_quote_board('todo', '')$q$, 'forbidden', 'ดีลเลอร์อ่านกล่องงานของ HQ ไม่ได้ (เหมือนเดิม)');
end $$;

select 'ALL PASS' as result;
rollback;
