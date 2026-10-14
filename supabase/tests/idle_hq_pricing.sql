-- ── ทดสอบใบ 0198: ระหว่าง "รอราคา HQ" ไม่นับว่าลูกค้าเป้าหมายนิ่ง (FLOW.html ขั้น 4–6) ─────────────────────────────
-- "ขั้น 4–6 คือช่วงที่ลูกบอลอยู่ที่ HQ ระบบจึงนับ 14 วันเฉพาะช่วงนี้ และไม่เตือนดีลเลอร์ว่า lead นิ่ง"
-- รัน: docker exec -i <คอนเทนเนอร์ฐานทดสอบ> psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/idle_hq_pricing.sql
begin;
create schema flowtest;
create function flowtest.ok(p_cond boolean, p_what text) returns void language plpgsql as $$
begin if p_cond is not true then raise exception 'FAIL: %', p_what; end if; raise notice 'ok  %', p_what; end $$;

do $$
declare j jsonb; ids text;
begin
  alter table leads disable trigger user;   -- วางสถานะตรง ๆ (ปกติรอราคา HQ มาจากคำสั่งส่งคำขอเท่านั้น)
  insert into leads (id, dealer_code, num_id, name, company, phone, province, status, created_label) values
    ('#IDLE-1', 'RYG', 976000001, 'ก', 'ZZIDLE-รวบรวม', '081-400-0001', 'ระยอง', 'BULLET', '1 ม.ค. 2569'),
    ('#IDLE-2', 'RYG', 976000002, 'ข', 'ZZIDLE-รอราคา', '081-400-0002', 'ระยอง', 'HQ_PRICING', '1 ม.ค. 2569');
  update leads set created_date = '2026-01-01', last_contact_at = '2026-01-01' where id in ('#IDLE-1', '#IDLE-2') and dealer_code = 'RYG';
  alter table leads enable trigger user;

  j := leads_page(p_limit => 500, p_offset => 0, p_status => null, p_dealer_codes => array['RYG'], p_province => null, p_product => null,
                  p_source => null, p_search => 'ZZIDLE', p_date_start => null, p_date_end => null, p_overdue => true,
                  p_as_of => '2026-10-14', p_default_days => 7, p_follow_up_days => null, p_skip_count => false);
  select string_agg(r ->> 'id', ',' order by r ->> 'id') into ids from jsonb_array_elements(j -> 'rows') r;
  perform flowtest.ok(ids = '#IDLE-1', 'ตัวกรอง "ค้างติดต่อ" ของหน้ารายการ: นับขั้นอื่น ไม่นับรอราคา HQ (ได้ ' || coalesce(ids, 'ว่าง') || ')');

  j := hq_alerts('2026-10-14', 48, null, 30, 30, 7, 30);
  perform flowtest.ok(position('ZZIDLE-รอราคา' in (j -> 'idle')::text) = 0 and position('ZZIDLE-รวบรวม' in (j -> 'idle')::text) > 0,
    'แจ้งเตือนลูกค้าเป้าหมายนิ่งของ HQ: นับขั้นอื่น ไม่นับรายที่รอราคา HQ');
  raise notice 'ALL PASS';
end $$;
rollback;
