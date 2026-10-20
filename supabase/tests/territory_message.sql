-- ── ข้อทดสอบใบ 0225: ลีดนอกพื้นที่ยังถูกปฏิเสธเหมือนเดิม แต่ข้อความไม่อ้างกฎ "หนึ่งจังหวัด หนึ่งดีลเลอร์" ที่ยกเลิกแล้ว (ใบ 0214) ──
-- รัน: docker exec -i supabase_db_pms-dbcheck psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 < supabase/tests/territory_message.sql
-- ทรานแซกชันเดียวแล้ว rollback · รอบปิดด่านรันผ่าน tests/scenario/db-rule-tests.spec.ts · ผ่าน = "ALL PASS"
begin;
create schema terrtest;
create function terrtest.as_dealer() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.profiles where role = 'DEALER_ADMIN' and dealer_code = 'CNX' limit 1),
    'role', 'authenticated', 'user_role', 'DEALER_ADMIN', 'dealer_code', 'CNX')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
grant usage on schema terrtest to authenticated;
grant execute on all functions in schema terrtest to authenticated;

do $$
declare p text; n int; msg text := '';
begin
  -- จังหวัดที่เป็นพื้นที่ของดีลเลอร์อื่น และไม่ใช่ของ CNX
  select t.province into p from dealer_territories t
   where t.dealer_code <> 'CNX' and t.province not in (select province from dealer_territories where dealer_code = 'CNX') limit 1;
  if p is null then raise exception 'FAIL: ข้อมูลตั้งต้นต้องมีจังหวัดของดีลเลอร์อื่น'; end if;
  n := (select coalesce(max(num_id), 0) from public.leads where dealer_code = 'CNX') + 1;
  perform terrtest.as_dealer();
  begin
    insert into public.leads (id, num_id, dealer_code, company, name, contact, phone, province, status)
    values ('#L-' || n, n, 'CNX', 'ZZTEST-นอกพื้นที่', 'ZZTEST-นอกพื้นที่', 'ผู้ทดสอบ', '000-000-' || lpad((n % 10000)::text, 4, '0'), p, 'WAITING');
  exception when others then msg := sqlerrm;
  end;
  perform set_config('role', 'postgres', true);
  if msg not like 'lead_outside_territory:%' then raise exception 'FAIL: ลีดนอกพื้นที่ต้องยังถูกปฏิเสธ (lead_outside_territory) — ได้: %', coalesce(nullif(msg, ''), 'บันทึกผ่าน'); end if;
  raise notice 'ok  ลีดนอกพื้นที่ยังถูกปฏิเสธ (%)', p;
  if msg like '%หนึ่งจังหวัด%' then raise exception 'FAIL: ข้อความยังอ้างกฎหนึ่งจังหวัดหนึ่งดีลเลอร์ที่ยกเลิกแล้ว: %', msg; end if;
  if msg not like '%ติดต่อสำนักงานใหญ่%' then raise exception 'FAIL: ข้อความต้องบอกทางไปต่อ (ติดต่อสำนักงานใหญ่): %', msg; end if;
  raise notice 'ok  ข้อความ: %', msg;
  raise notice 'ALL PASS';
end $$;
rollback;
