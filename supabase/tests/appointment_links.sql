-- ── ข้อทดสอบใบ 0274 (D): นัดหมายต้องผูกลีดหรือลูกค้าของสาขาเดียวกัน (บอสสั่ง 3 พ.ย. 69 · สร้างนัดจากปฏิทิน) ─────────────────
--   1) ไม่มีลีดและไม่มีลูกค้า = ฐานปฏิเสธ
--   2) ลีด/ลูกค้าของสาขาอื่น = ฐานปฏิเสธ (A เลือกของ B ไม่ได้)
--   3) ผูกลูกค้าอย่างเดียวได้ — ไม่ผูกลีดให้เอง · ผูกลีดของตัวเองได้ → งาน "นัดหมาย" ของลีดติ๊กเอง + ประวัติของลีดมีบรรทัดนัด
--   4) แก้สถานะนัดเดิมได้ (ไม่เปลี่ยนการผูก = ไม่ตรวจซ้ำ) · เปลี่ยนการผูกไปของสาขาอื่น / ถอดจนไม่มีอะไรผูก = ปฏิเสธ
--   ตกบนโค้ดก่อนใบ 0274: ไม่มีช่อง customer_id · นัดลอย ๆ / ผูกลีดเลขของสาขาอื่น บันทึกได้
-- รัน: docker exec -i <คอนเทนเนอร์ฐานทดสอบ> psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 < supabase/tests/appointment_links.sql
begin;
create schema aptest;
create function aptest.ok(p_cond boolean, p_what text) returns void language plpgsql as $$
begin if p_cond is not true then raise exception 'FAIL: %', p_what; end if; raise notice 'ok  %', p_what; end $$;
create function aptest.must_fail(p_sql text, p_like text, p_what text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if sqlerrm ilike '%' || p_like || '%' then raise notice 'ok  % (ถูกปฏิเสธ: %)', p_what, sqlerrm; return; end if;
    raise exception 'FAIL: % — ถูกปฏิเสธแต่ข้อความไม่ตรง: %', p_what, sqlerrm;
  end;
  raise exception 'FAIL: % — ควรถูกปฏิเสธแต่ผ่าน', p_what;
end $$;
create function aptest.as_a() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-00000000f001', 'role', 'authenticated',
    'user_role', 'DEALER_ADMIN', 'dealer_code', 'ZZAPA', 'email', 'zzap@example.test')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function aptest.as_admin() returns void language plpgsql as $$
begin perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '', true); end $$;
grant usage on schema aptest to authenticated;
grant execute on all functions in schema aptest to authenticated;

set local session_replication_role = replica;
insert into dealers (code, name, province, region, status, revenue_target) values
  ('ZZAPA', 'ZZTEST นัด A', 'ตราด', 'ตะวันออก', 'active', 0), ('ZZAPB', 'ZZTEST นัด B', 'ตราด', 'ตะวันออก', 'active', 0);
insert into auth.users (id, email, aud, role) values ('00000000-0000-4000-8000-00000000f001', 'zzap@example.test', 'authenticated', 'authenticated');
insert into profiles (id, role, dealer_code, name, status) values ('00000000-0000-4000-8000-00000000f001', 'DEALER_ADMIN', 'ZZAPA', 'ZZAP ดีลเลอร์', 'active');
insert into leads (id, num_id, dealer_code, company, contact, phone, province, status) values
  ('ZZAPA-L1', 995001, 'ZZAPA', 'ZZTEST ลีด A', 'คุณเอ', '000-000-0001', 'ตราด', 'BULLET'),
  ('ZZAPB-L1', 995002, 'ZZAPB', 'ZZTEST ลีด B', 'คุณบี', '000-000-0002', 'ตราด', 'BULLET');
insert into customers (id, dealer_code, name, company, province) values
  (995101, 'ZZAPA', 'ZZTEST ลูกค้า A', 'ZZTEST ลูกค้า A', 'ตราด'), (995102, 'ZZAPB', 'ZZTEST ลูกค้า B', 'ZZTEST ลูกค้า B', 'ตราด');
-- นัดเก่าของ A (ก่อนกฎนี้)
insert into appointments (id, dealer_code, lead_id, company, date, time, type, status) values
  (995201, 'ZZAPA', 995001, 'ZZTEST นัดเก่า', '2026-10-01', '10:00', 'visit', 'upcoming');
set local session_replication_role = origin;

do $$
begin
  perform aptest.as_a();
  perform aptest.must_fail($q$insert into public.appointments (id, dealer_code, company, date, time, type, status) values (995301, 'ZZAPA', 'ZZTEST ลอย', '2026-11-10', '10:00', 'visit', 'upcoming')$q$,
                           'appointment_link', '1) ไม่มีลีดและลูกค้า = ปฏิเสธ');
  perform aptest.must_fail($q$insert into public.appointments (id, dealer_code, lead_id, company, date, time, type, status) values (995302, 'ZZAPA', 0, 'ZZTEST ลอย', '2026-11-10', '10:00', 'visit', 'upcoming')$q$,
                           'appointment_link', '1) ลีดเลข 0 = ไม่มีลีด = ปฏิเสธ');
  perform aptest.must_fail($q$insert into public.appointments (id, dealer_code, lead_id, company, date, time, type, status) values (995303, 'ZZAPA', 995002, 'ZZTEST ข้ามสาขา', '2026-11-10', '10:00', 'visit', 'upcoming')$q$,
                           'appointment_link', '2) ลีดของสาขา B = ปฏิเสธ');
  perform aptest.must_fail($q$insert into public.appointments (id, dealer_code, customer_id, company, date, time, type, status) values (995304, 'ZZAPA', 995102, 'ZZTEST ข้ามสาขา', '2026-11-10', '10:00', 'visit', 'upcoming')$q$,
                           'appointment_link', '2) ลูกค้าของสาขา B = ปฏิเสธ');

  insert into appointments (id, dealer_code, customer_id, company, date, time, type, status, note)
    values (995305, 'ZZAPA', 995101, 'ZZTEST ลูกค้า A', '2026-11-10', '13:00', 'design_meet', 'upcoming', 'ZZTEST');
  perform aptest.ok((select lead_id is null and customer_id = 995101 from appointments where dealer_code = 'ZZAPA' and id = 995305),
                    '3) ผูกลูกค้าอย่างเดียวได้ · ไม่ผูกลีดให้เอง');
  insert into appointments (id, dealer_code, lead_id, company, date, time, type, status, note)
    values (995306, 'ZZAPA', 995001, 'ZZTEST ลีด A', '2026-11-11', '09:30', 'visit', 'upcoming', 'ดูหน้างาน');
  perform aptest.as_admin();
  -- งานนัดหมายในแม่แบบ: รหัส appointment หรือชื่องานมีคำว่า "นัด" (เหมือน findAppointmentTask · ข้อทดสอบ quote_events_timeline_in_db.sql)
  perform aptest.ok(coalesce((select bool_or(coalesce((t ->> 'done')::boolean, false)) from leads l, jsonb_array_elements(l.tasks) t
                               where l.dealer_code = 'ZZAPA' and l.num_id = 995001 and t ->> 'key' = coalesce(
                                 (select t2 ->> 'key' from hq_sales_journey j, jsonb_array_elements(j.tasks) t2 where t2 ->> 'key' = 'appointment' limit 1),
                                 (select t2 ->> 'key' from hq_sales_journey j, jsonb_array_elements(j.tasks) t2 where t2 ->> 'label' like '%นัด%' limit 1))), false),
                    '3) ผูกลีดของตัวเอง → งาน "นัดหมาย" ของลีดติ๊กเอง');
  perform aptest.ok(position('นัดหมาย 2026-11-11 09:30 น. · ดูหน้างาน' in (select activities::text from leads where dealer_code = 'ZZAPA' and num_id = 995001)) > 0,
                    '3) ประวัติของลีดมีบรรทัดนัด');

  perform aptest.as_a();
  update appointments set status = 'done' where dealer_code = 'ZZAPA' and id = 995201;
  perform aptest.ok((select status from appointments where dealer_code = 'ZZAPA' and id = 995201) = 'done', '4) แก้สถานะนัดเดิมได้');
  perform aptest.must_fail($q$update public.appointments set lead_id = 995002 where dealer_code = 'ZZAPA' and id = 995306$q$,
                           'appointment_link', '4) เปลี่ยนไปผูกลีดของสาขาอื่น = ปฏิเสธ');
  perform aptest.must_fail($q$update public.appointments set customer_id = null where dealer_code = 'ZZAPA' and id = 995305$q$,
                           'appointment_link', '4) ถอดลูกค้าจนไม่มีอะไรผูก = ปฏิเสธ');
  perform aptest.as_admin();
end $$;

select 'ALL PASS' as result;
rollback;
