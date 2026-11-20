-- ── ใบ 0291: รายการของดีลเลอร์ในใบเสนอราคาที่ทำจากใบ HQ (บอสสั่ง 20 พ.ย. 69) ─────────────────────────────────────
--   แถวจากใบ HQ ประกอบที่ฐานเหมือนเดิม (ล็อก · แก้ได้แค่ %) + ต่อท้ายแถว source = 'dealer' (ราคาขายที่ดีลเลอร์กรอกเอง)
--   ยอดใบ = ทั้งสองส่วน · hq_lines_value = ยอดแถวใบ HQ · ส่วนต่างกำไร ฿ = จากแถวใบ HQ เท่านั้น · % = ฿ ÷ ยอดทั้งใบ
-- รัน: docker exec -i <คอนเทนเนอร์ฐานทดสอบ> psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/dealer_extra_lines.sql
-- ตกบนฐานก่อนลงใบ 0291: แถวของดีลเลอร์ถูกทิ้ง (ยอดใบ = แถวใบ HQ อย่างเดียว) · ไม่มีช่อง hq_lines_value
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
    'user_role', p_role, 'dealer_code', p_dealer, 'email', 'zzdl@example.test')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
grant usage on schema flowtest to authenticated;
grant execute on all functions in schema flowtest to authenticated;

do $$
declare
  hq  uuid := (select id from profiles where role = 'SUPER_ADMIN' limit 1);
  ryg uuid := (select id from profiles where role = 'DEALER_ADMIN' and dealer_code = 'RYG' limit 1);
  n int := 971000 + (random() * 9000)::int;
  r quote_requests; h hq_quotes; q quotations; m jsonb;
  แถวHQ jsonb := '[{"name":"เสาเหล็ก H-Beam","qty":10,"unit":"ตัน","unitCost":40000}]';
begin
  perform flowtest.ok(hq is not null and ryg is not null, 'มีบัญชี HQ และดีลเลอร์ RYG');
  insert into leads (id, num_id, dealer_code, company, name, contact, phone, province, status, project, area, note)
  values ('#L-' || n, n, 'RYG', 'ZZDL บริษัททดสอบ', 'ZZDL บริษัททดสอบ', 'คุณทดสอบ', '000-000-0291', 'ระยอง', 'BULLET', 'ZZ งานทดสอบ', '100', 'ZZ สเปกทดสอบ');
  perform flowtest.as_user(ryg, 'DEALER_ADMIN', 'RYG');
  r := quote_request_submit(n, 'ZZDL โกดังโครงเหล็ก');
  perform flowtest.as_user(hq, 'SUPER_ADMIN', '');
  perform hq_quote_save(r.id, แถวHQ, current_date + 30);
  h := hq_quote_send(r.id);

  -- ใบลูกค้า: แถวใบ HQ บวก 10% (400,000 → 440,000) + แถวของดีลเลอร์ 2 แถว (ผนัง 50,000 + หลังคา 30,000)
  perform flowtest.as_user(ryg, 'DEALER_ADMIN', 'RYG');
  select * into q from create_quotation('RYG', 'Q-2026-', jsonb_build_object('customer', 'ZZDL ลูกค้า', 'total', '0', 'status', 'draft',
    'date', to_char(current_date, 'DD/MM/YYYY'), 'items', 3, 'hq_quote_id', h.id, 'markup_percent', 10,
    'line_items', jsonb_build_array(
      jsonb_build_object('name', 'แก้ชื่อไม่ได้', 'qty', 999, 'markupPct', 10, 'unitPrice', 1),
      jsonb_build_object('source', 'dealer', 'name', 'ผนังเมทัลชีท (ดีลเลอร์จัดหาเอง)', 'qty', 500, 'unit', 'ตร.ม.', 'unitPrice', 100),
      jsonb_build_object('source', 'dealer', 'name', 'หลังคาเมทัลชีท', 'qty', 100, 'unit', 'ตร.ม.', 'unitPrice', 300))));
  perform flowtest.ok(jsonb_array_length(q.line_items) = 3, 'ใบมี 3 แถว: ใบ HQ 1 + ของดีลเลอร์ 2');
  perform flowtest.ok(q.line_items -> 0 ->> 'name' = 'เสาเหล็ก H-Beam' and (q.line_items -> 0 ->> 'qty')::numeric = 10
    and (q.line_items -> 0 ->> 'unitPrice')::numeric = 44000, 'แถวใบ HQ ยังล็อก (ชื่อ/จำนวนจากใบ HQ · ราคา = ต้นทุน × 1.10)');
  perform flowtest.ok(q.line_items -> 1 ->> 'source' = 'dealer' and (q.line_items -> 1 ->> 'unitPrice')::numeric = 100
    and q.line_items -> 2 ->> 'name' = 'หลังคาเมทัลชีท', 'แถวของดีลเลอร์ต่อท้าย · ราคาที่ดีลเลอร์กรอกเอง');
  perform flowtest.ok(q.total_value = 520000 and q.hq_lines_value = 440000, 'ยอดใบ 520,000 (ใบ HQ 440,000 + ของดีลเลอร์ 80,000) · hq_lines_value 440,000');

  perform flowtest.must_fail(format($q$update quotations set line_items = '[{"markupPct":10},{"source":"dealer","name":"","qty":1,"unitPrice":1}]' where dealer_code = 'RYG' and id = %L$q$, q.id),
    'dealer_line_invalid', 'แถวของดีลเลอร์ไม่มีชื่อ = ปฏิเสธ');
  perform flowtest.must_fail(format($q$update quotations set line_items = '[{"markupPct":10},{"source":"dealer","name":"x","qty":1,"unitPrice":-5}]' where dealer_code = 'RYG' and id = %L$q$, q.id),
    'dealer_line_invalid', 'ราคาติดลบ = ปฏิเสธ');

  -- ส่วนต่างที่ HQ เห็น (รายใบ): ฿ = 440,000 − 400,000 = 40,000 (แถวของดีลเลอร์ไม่มีต้นทุน = ส่วนต่าง 0) · % = 40,000 ÷ 520,000
  perform flowtest.as_user(hq, 'SUPER_ADMIN', '');
  select x into m from jsonb_array_elements(hq_quote_margins(array['RYG'], array[q.id])) x where x ->> 'id' = q.id limit 1;
  perform flowtest.ok(m is not null, 'หาส่วนต่างของใบได้');
  perform flowtest.ok((m ->> 'baht')::numeric = 40000 and (m ->> 'pct')::numeric = round(100.0 * 40000 / 520000, 1),
    'ส่วนต่างรายใบ ฿ จากแถวใบ HQ เท่านั้น · % ÷ ยอดทั้งใบ');
end $$;

select 'ALL PASS' as result;
rollback;
