-- ── ใบ 0248: ไทม์ไลน์ + ติ๊กงานของลีด ฐานทำเองในคำสั่งเดียวกับขั้นของใบ/นัดหมาย (บอสสั่ง 27 ต.ค. 69) ──────────────
--   ข้อนี้เรียกแค่คำสั่งของขั้นนั้น (ไม่มีคำสั่งตามหลังของหน้าเว็บ) = จำลองผู้ใช้ปิดหน้าทันทีหลังกด → บนฐานก่อนใบ 0248 ตก
-- รัน: docker exec -i <คอนเทนเนอร์ฐานทดสอบ> psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/quote_events_timeline_in_db.sql
begin;
create schema flowtest;
create function flowtest.ok(p_cond boolean, p_what text) returns void language plpgsql as $$
begin if p_cond is not true then raise exception 'FAIL: %', p_what; end if; raise notice 'ok  %', p_what; end $$;
create function flowtest.as_dealer(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated',
    'user_role', 'DEALER_ADMIN', 'dealer_code', 'CNX', 'email', 'cnx@test')::text, true);
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

-- ใบร่างจากใบ HQ ของลีด p_lead (สาขา CNX)
create function flowtest.draft_quote(p_lead int, p_company text, p_cnx uuid, p_hq uuid) returns quotations language plpgsql as $$
declare r quote_requests; h hq_quotes; q quotations;
begin
  perform flowtest.as_dealer(p_cnx);
  r := quote_request_submit(p_lead, 'โกดังและคลังสินค้า');
  perform flowtest.as_hq(p_hq);
  perform hq_quote_save(r.id, '[{"name":"โครงเหล็ก","qty":1,"unit":"ชุด","unitCost":1000}]'::jsonb, current_date + 20);
  h := hq_quote_send(r.id);
  perform flowtest.as_dealer(p_cnx);
  select * into q from create_quotation('CNX', 'Q-', jsonb_build_object('customer', p_company, 'status', 'draft',
    'date', to_char(current_date, 'DD/MM/YYYY'), 'line_items', '[{"name":"x","qty":1}]'::jsonb,
    'hq_quote_id', h.id, 'markup_percent', 0, 'deal_id', p_lead));
  return q;
end $$;
grant execute on function flowtest.draft_quote(int, text, uuid, uuid) to authenticated;
create function flowtest.acts(p_lead int) returns text language sql as $$
  select coalesce((select activities::text from leads where dealer_code = 'CNX' and num_id = p_lead), '') $$;
create function flowtest.done(p_lead int, p_key text) returns boolean language sql as $$
  select coalesce((select bool_or(coalesce((t ->> 'done')::boolean, false)) from leads l, jsonb_array_elements(l.tasks) t
                    where l.dealer_code = 'CNX' and l.num_id = p_lead and t ->> 'key' = p_key), false) $$;
grant execute on all functions in schema flowtest to authenticated;

do $$
declare
  cnx uuid := (select id from profiles where role = 'DEALER_ADMIN' and dealer_code = 'CNX' limit 1);
  hq  uuid := (select id from profiles where role = 'SUPER_ADMIN' limit 1);
  l1 int; l2 int; l3 int; q1 quotations; q2 quotations; res jsonb; นัด bigint; ก่อน int;
begin
  select num_id into l1 from leads where dealer_code = 'CNX' and status in ('WAITING','BULLET') and customer_id is null order by num_id limit 1;
  select num_id into l2 from leads where dealer_code = 'CNX' and status in ('WAITING','BULLET') and customer_id is null and num_id <> l1 order by num_id limit 1;
  select num_id into l3 from leads where dealer_code = 'CNX' and status in ('WAITING','BULLET') and num_id not in (l1, l2) order by num_id limit 1;
  perform flowtest.ok(cnx is not null and hq is not null and l1 is not null and l2 is not null and l3 is not null, 'มีข้อมูลตั้งต้นครบ');
  update leads set company = 'ZZT ไทม์ไลน์ ก', tasks = '[]'::jsonb where dealer_code = 'CNX' and num_id = l1;
  update leads set company = 'ZZT ไทม์ไลน์ ข' where dealer_code = 'CNX' and num_id = l2;

  -- ══ ส่งใบให้ลูกค้า: บรรทัด "ส่งใบ … ให้ลูกค้า" + ติ๊ก จัดทำ/ส่งใบ ══
  q1 := flowtest.draft_quote(l1, 'ZZT ไทม์ไลน์ ก', cnx, hq);
  perform flowtest.as_dealer(cnx);
  perform quotation_send('CNX', q1.id);
  perform flowtest.as_root();
  perform flowtest.ok(position('ส่งใบเสนอราคา ' || q1.id || ' (V1) ให้ลูกค้า' in flowtest.acts(l1)) > 0, 'ส่งใบ → ไทม์ไลน์มีบรรทัดส่งใบ (ฐานจดเอง)');
  perform flowtest.ok(flowtest.done(l1, 'sendQuote') and flowtest.done(l1, 'makeQuote'), 'ส่งใบ → งานจัดทำ/ส่งใบติ๊กแล้ว (ฐานติ๊กเอง)');

  -- ══ ลูกค้าตอบรับ: คำสั่งปิดการขายคำสั่งเดียว → ไทม์ไลน์ "ลูกค้าตอบรับ" ครบ ══
  perform flowtest.as_dealer(cnx);
  res := close_won_quotation('CNX', null, 'ZZT ไทม์ไลน์ ก', q1.id, false,
    jsonb_build_object('company', 'ZZT ไทม์ไลน์ ก', 'name', 'คุณทดสอบ', 'province', 'เชียงใหม่'));
  perform flowtest.as_root();
  perform flowtest.ok(position('ใบเสนอราคา ' || q1.id || ' (V1) — ลูกค้าตอบรับ' in flowtest.acts(l1)) > 0,
    'ตอบรับ → ไทม์ไลน์มีบรรทัดลูกค้าตอบรับ ทั้งที่ไม่มีคำสั่งตามหลังของหน้าเว็บ');
  perform flowtest.ok((select count(*) from leads l, jsonb_array_elements(l.activities) a where l.dealer_code = 'CNX' and l.num_id = l1
                         and a ->> 'text' like '%' || q1.id || '%ลูกค้าตอบรับ%') = 1, 'บรรทัดลูกค้าตอบรับมีบรรทัดเดียว (ไม่ซ้ำ)');

  -- ══ ลูกค้าปฏิเสธ ══
  q2 := flowtest.draft_quote(l2, 'ZZT ไทม์ไลน์ ข', cnx, hq);
  perform flowtest.as_dealer(cnx);
  perform quotation_send('CNX', q2.id);
  update quotations set status = 'lost' where dealer_code = 'CNX' and id = q2.id;
  perform flowtest.as_root();
  perform flowtest.ok(position('ใบเสนอราคา ' || q2.id || ' (V1) — ลูกค้าปฏิเสธ' in flowtest.acts(l2)) > 0, 'ปฏิเสธ → ไทม์ไลน์มีบรรทัดลูกค้าปฏิเสธ');

  -- ══ ระบบเปลี่ยนเอง (ไม่ใช่ขั้นของผู้ใช้) → ไม่จด: ผูกเลขลูกค้าอย่างเดียว ══
  select jsonb_array_length(activities) into ก่อน from leads where dealer_code = 'CNX' and num_id = l2;
  update quotations set updated_at = now() where dealer_code = 'CNX' and id = q2.id;
  perform flowtest.ok((select jsonb_array_length(activities) from leads where dealer_code = 'CNX' and num_id = l2) = ก่อน,
    'แก้ช่องของระบบอย่างเดียว → ไม่มีบรรทัดไทม์ไลน์เพิ่ม');

  -- ══ ลงนัดหมาย: ติ๊กงานนัดหมาย + บรรทัด "นัดหมาย …" ══
  update leads set tasks = '[]'::jsonb where dealer_code = 'CNX' and num_id = l3;
  perform flowtest.as_dealer(cnx);
  select next_entity_id('CNX', 'appointments') into นัด;
  insert into appointments (id, dealer_code, company, lead_id, date, time, type, status, note)
    values (นัด, 'CNX', 'ZZT นัด', l3, '2026-11-02', '10:00', 'meeting', 'scheduled', 'ดูหน้างาน');
  perform flowtest.as_root();
  perform flowtest.ok(position('นัดหมาย 2026-11-02 10:00 น. · ดูหน้างาน' in flowtest.acts(l3)) > 0, 'ลงนัด → ไทม์ไลน์มีบรรทัดนัดหมาย (ฐานจดเอง)');
  -- งานนัดหมายในแม่แบบ: รหัส appointment หรือชื่องานมีคำว่า "นัด" (เหมือน findAppointmentTask)
  perform flowtest.ok(flowtest.done(l3, coalesce(
      (select t ->> 'key' from hq_sales_journey j, jsonb_array_elements(j.tasks) t where t ->> 'key' = 'appointment' limit 1),
      (select t ->> 'key' from hq_sales_journey j, jsonb_array_elements(j.tasks) t where t ->> 'label' like '%นัด%' limit 1))),
    'ลงนัด → งานนัดหมายติ๊กแล้ว (ฐานติ๊กเอง)');
end $$;

select 'ALL PASS' as result;
rollback;
