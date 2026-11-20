-- ── ใบ 0290: รายการในคำขอราคา — ดีลเลอร์พิมพ์รายการเอง (บอสสั่ง 20 พ.ย. 69) ─────────────────────────────────────
--   คำขอรับแถว { name, qty, unit } ไม่มีรหัสวัสดุ/ราคา · ไม่บังคับ · ตรวจชื่อ/จำนวน · ราคาที่ส่งมาไม่ถูกเก็บ · ขอแก้ราคาส่งรายการใหม่ได้
--   แถวแบบเดิม (templateId) ยังรับตามเดิม · ไม่มีแถวมีราคา = estimate_total ว่าง
-- รัน: docker exec -i <คอนเทนเนอร์ฐานทดสอบ> psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/request_items.sql
-- ตกบนฐานก่อนลงใบ 0290: _estimate_snapshot ปฏิเสธแถวไม่มี templateId ("ไม่พบวัสดุที่เลือก") · reprice ไม่มีอาร์กิวเมนต์ p_estimate
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
    'user_role', p_role, 'dealer_code', p_dealer, 'email', 'zzri@example.test')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
grant usage on schema flowtest to authenticated;
grant execute on all functions in schema flowtest to authenticated;

do $$
declare
  hq  uuid := (select id from profiles where role = 'SUPER_ADMIN' limit 1);
  ryg uuid := (select id from profiles where role = 'DEALER_ADMIN' and dealer_code = 'RYG' limit 1);
  n int := 970000 + (random() * 9000)::int;
  r quote_requests; r2 quote_requests;
begin
  perform flowtest.ok(hq is not null and ryg is not null, 'มีบัญชี HQ และดีลเลอร์ RYG');
  insert into leads (id, num_id, dealer_code, company, name, contact, phone, province, status, project, area, note)
  values ('#L-' || n, n, 'RYG', 'ZZRI บริษัททดสอบ', 'ZZRI บริษัททดสอบ', 'คุณทดสอบ', '000-000-0290', 'ระยอง', 'BULLET', 'ZZ งานทดสอบ', '100', 'ZZ สเปกทดสอบ');
  perform flowtest.as_user(ryg, 'DEALER_ADMIN', 'RYG');

  perform flowtest.must_fail(format($q$select quote_request_submit(%s, 'งาน', '', null, '', '', '[{"name":"","qty":1,"unit":"ตัน"}]')$q$, n), 'estimate_invalid', 'รายการไม่มีชื่อ = ปฏิเสธ');
  perform flowtest.must_fail(format($q$select quote_request_submit(%s, 'งาน', '', null, '', '', '[{"name":"เสา","qty":0,"unit":"ตัน"}]')$q$, n), 'estimate_invalid', 'จำนวน 0 = ปฏิเสธ');
  perform flowtest.must_fail(format($q$select quote_request_submit(%s, 'งาน', '', null, '', '', '[{"name":"เสา","qty":"x","unit":"ตัน"}]')$q$, n), 'estimate_invalid', 'จำนวนไม่ใช่ตัวเลข = ปฏิเสธ');

  r := quote_request_submit(n, 'ZZRI โกดังโครงเหล็ก', '', 800, '', 'ระยอง',
         jsonb_build_array(jsonb_build_object('name', '  เสาเหล็ก H-Beam  ', 'qty', 8.5, 'unit', 'ตัน', 'unitPrice', 99999),
                           jsonb_build_object('name', 'แผ่นหลังคาเมทัลชีท', 'qty', 760, 'unit', 'ตร.ม.')));
  perform flowtest.ok(jsonb_array_length(r.estimate_items) = 2
    and r.estimate_items -> 0 ->> 'name' = 'เสาเหล็ก H-Beam' and (r.estimate_items -> 0 ->> 'qty')::numeric = 8.5 and r.estimate_items -> 0 ->> 'unit' = 'ตัน'
    and r.estimate_items -> 1 ->> 'name' = 'แผ่นหลังคาเมทัลชีท', 'ดีลเลอร์พิมพ์ 2 รายการ → เก็บ ชื่อ (ตัดช่องว่าง) · จำนวน · หน่วย');
  perform flowtest.ok(not (r.estimate_items -> 0 ? 'unitPrice') and not (r.estimate_items -> 0 ? 'templateId'), 'ราคาที่ส่งมาไม่ถูกเก็บ (HQ ตีราคา) · ไม่มีรหัสวัสดุ');
  perform flowtest.ok(r.estimate_total is null, 'ไม่มีแถวมีราคา = ไม่มีราคาประเมิน (estimate_total ว่าง)');

  -- HQ เห็นรายการในคำขอ
  perform flowtest.as_user(hq, 'SUPER_ADMIN', '');
  perform flowtest.ok((select jsonb_array_length(estimate_items) from quote_requests where id = r.id) = 2, 'HQ เห็นรายการ 2 แถวในคำขอ');
  perform hq_quote_save(r.id, '[{"name":"เสาเหล็ก H-Beam","qty":8.5,"unit":"ตัน","unitCost":42000}]'::jsonb, current_date + 30);
  perform hq_quote_send(r.id);

  -- ขอแก้ราคาพร้อมรายการใหม่ · ไม่ส่งรายการ = คัดลอกของเดิม
  perform flowtest.as_user(ryg, 'DEALER_ADMIN', 'RYG');
  r2 := quote_request_reprice(r.id, 'ZZ ลูกค้าขอเพิ่มคาน', null, '[{"name":"คานเหล็ก H-Beam","qty":7,"unit":"ตัน"}]'::jsonb);
  perform flowtest.ok(jsonb_array_length(r2.estimate_items) = 1 and r2.estimate_items -> 0 ->> 'name' = 'คานเหล็ก H-Beam', 'ขอแก้ราคาส่งรายการใหม่ได้');
end $$;

select 'ALL PASS' as result;
rollback;
