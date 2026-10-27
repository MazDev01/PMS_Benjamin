-- ── ใบ 0249: กล่องคำขอราคา HQ รับกลุ่ม overdue / all (ช่องเลือกสถานะแทนแถวปุ่มกรอง) ───────────────────────────────
-- รัน: docker exec -i <คอนเทนเนอร์ฐานทดสอบ> psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/quote_board_groups.sql
-- คำขอทดสอบ 5 รายการ (ค้นด้วยเลขคำขอ ZZQBG-…) · ย้อนทั้งหมดตอนจบ
-- ข้อที่ต้องตกบนโค้ดก่อนใบ 0249: overdue / all ถูกปฏิเสธ invalid_group
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
grant usage on schema flowtest to authenticated;
grant execute on all functions in schema flowtest to authenticated;

set local session_replication_role = replica;   -- ใส่คำขอตรง ๆ (ข้ามตัวดักขั้นตอน)
insert into quote_requests (id, request_no, dealer_code, lead_num_id, product, status, submitted_at, due_at, closed_at, cancel_reason) values
  (990901, 'ZZQBG-1', 'RYG', 990901, 'ZZQBG งาน', 'new',       now() - interval '20 days', now() - interval '6 days', null, ''),   -- เกินกำหนด
  (990902, 'ZZQBG-2', 'RYG', 990902, 'ZZQBG งาน', 'pricing',   now() - interval '2 days',  now() + interval '12 days', null, ''),
  (990903, 'ZZQBG-3', 'RYG', 990903, 'ZZQBG งาน', 'quoted',    now() - interval '5 days',  now() + interval '9 days', null, ''),
  (990904, 'ZZQBG-4', 'RYG', 990904, 'ZZQBG งาน', 'won',       now() - interval '30 days', now() - interval '16 days', now() - interval '1 day', ''),
  (990905, 'ZZQBG-5', 'RYG', 990905, 'ZZQBG งาน', 'cancelled', now() - interval '1 day',   now() + interval '13 days', now(), 'ZZQBG ลูกค้าไม่สนใจ');
set local session_replication_role = origin;

do $$
declare b jsonb; ids int[];
begin
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'user_role', 'SUPER_ADMIN',
    'dealer_code', '', 'email', 'zzqbg@example.test')::text, true);
  perform set_config('role', 'authenticated', true);

  b := hq_quote_board('todo', 'zzqbg');
  perform flowtest.ok(b -> 'counts' = '{"todo":2,"overdue":1,"quoted":1,"won":1,"closed":1}'::jsonb, format('ตัวนับเหมือนเดิม (ได้ %s)', b -> 'counts'));
  perform flowtest.ok(jsonb_array_length(b -> 'rows') = 2, 'ต้องตีราคา = 2 แถว (เหมือนเดิม)');

  b := hq_quote_board('overdue', 'zzqbg');
  ids := array(select (x ->> 'id')::int from jsonb_array_elements(b -> 'rows') x);
  perform flowtest.ok(ids = array[990901], format('เกิน 14 วัน = เฉพาะคำขอที่เลยกำหนด (ได้ %s)', ids));
  perform flowtest.ok(jsonb_array_length(b -> 'rows') = (b #>> '{counts,overdue}')::int, 'จำนวนแถว = ตัวนับเกิน 14 วัน (การ์ด = แถว)');
  perform flowtest.ok((b -> 'rows' -> 0 ->> 'tag') = 'overdue', 'แถวในกลุ่มเกิน 14 วัน ติดป้ายเกิน 14 วัน');

  b := hq_quote_board('all', 'zzqbg');
  ids := array(select (x ->> 'id')::int from jsonb_array_elements(b -> 'rows') x);
  perform flowtest.ok(ids = array[990905, 990902, 990903, 990901, 990904], format('ทั้งหมด = ทุกกลุ่ม เรียงคำขอใหม่สุดก่อน (ได้ %s)', ids));
  perform flowtest.ok(jsonb_array_length(b -> 'rows') = (select sum(v::int) from jsonb_each_text(b -> 'counts') e(k, v) where k <> 'overdue'),
    'ทั้งหมด = ผลรวมทุกกลุ่ม (ไม่นับซ้ำ overdue)');

  b := hq_quote_board('quoted', 'zzqbg');
  perform flowtest.ok(jsonb_array_length(b -> 'rows') = 1 and (b -> 'rows' -> 0 ->> 'id') = '990903', 'ส่งแล้ว รอดีลเลอร์ = 1 แถว (เหมือนเดิม)');

  perform flowtest.must_fail($q$select hq_quote_board('nope', '')$q$, 'invalid_group', 'กลุ่มที่ไม่รู้จัก = ปฏิเสธ');
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'user_role', 'DEALER_ADMIN',
    'dealer_code', 'RYG', 'email', 'zzqbg@example.test')::text, true);
  perform flowtest.must_fail($q$select hq_quote_board('all', '')$q$, 'forbidden', 'ดีลเลอร์เรียกกล่องงานของ HQ ไม่ได้');
end $$;

select 'ALL PASS' as result;
rollback;
