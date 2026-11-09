-- ── ใบ 0279: นำเข้ารายการวัสดุจากไฟล์ + ยกเลิกทั้งชุด (บอสสั่ง 5 พ.ย. 69 · บอสตอบ 3 ข้อ = ก) ─────────────────────────────────────
-- ต้องตกบนฐานก่อนลงใบ (ไม่มีคำสั่ง hq_materials_import) · ผ่านหลังลงใบ · ทรานแซกชันเดียวแล้ว rollback
--   1) นำเข้า: ใหม่ = เพิ่ม (เปิดใช้ตามไฟล์ ว่าง = เปิด) · หมวด+ชื่อตรงของเดิม = อัปเดตแค่ราคา (หน่วย/เปิดใช้/หมวดเดิมไม่เปลี่ยน) · ราคาเท่าเดิม = ไม่นับ
--   2) ทั้งหมดหรือไม่เลย: หน่วยต่างจากของเดิม · ซ้ำกันในไฟล์ · ไม่มีชื่อ/หน่วย · ราคาไม่ใช่ตัวเลข = ปฏิเสธทั้งชุด ไม่มีอะไรถูกเขียน
--   3) ดีลเลอร์นำเข้า/ยกเลิกไม่ได้ · ห้ามลบวัสดุที่มีอยู่ผ่านการนำเข้า
--   4) ยกเลิกทั้งชุด = ลบที่เพิ่ม + คืนราคาเดิมและวันอัปเดตราคาเดิม · ยกเลิกซ้ำไม่ได้
--   5) ยกเลิกไม่ได้เมื่อมีคำขอราคาหลังนำเข้าใช้วัสดุในชุด · หรือวัสดุในชุดถูกแก้ราคาหลังนำเข้า
-- รัน: docker exec -i <คอนเทนเนอร์ฐานทดสอบ> psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/material_import.sql
begin;
lock table material_templates in share row exclusive mode;
create schema mitest;
create function mitest.ok(p_cond boolean, p_what text) returns void language plpgsql as $$
begin if p_cond is not true then raise exception 'FAIL: %', p_what; end if; raise notice 'ok  %', p_what; end $$;
create function mitest.must_fail(p_sql text, p_like text, p_what text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if sqlerrm ilike '%' || p_like || '%' then raise notice 'ok  % (ถูกปฏิเสธ)', p_what; return; end if;
    raise exception 'FAIL: % — ถูกปฏิเสธแต่ข้อความไม่ตรง: %', p_what, sqlerrm;
  end;
  raise exception 'FAIL: % — ควรถูกปฏิเสธแต่ผ่าน', p_what;
end $$;
create function mitest.as_root() returns void language plpgsql as $$
begin perform set_config('role', 'none', true); perform set_config('request.jwt.claims', '', true); end $$;
create function mitest.as_user(p_uid uuid, p_role text, p_dealer text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated',
    'user_role', p_role, 'dealer_code', p_dealer, 'email', 'zzmi@example.test')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
grant usage on schema mitest to authenticated;
grant execute on all functions in schema mitest to authenticated;

do $$
declare
  hq  uuid := (select id from profiles where role = 'SUPER_ADMIN' limit 1);
  ryg uuid := (select id from profiles where role = 'DEALER_ADMIN' and dealer_code = 'RYG' limit 1);
  ป text := 'ZZT นำเข้า ' || (900000 + (random() * 9000)::int);
  เดิม bigint; ผล jsonb; ชุด1 bigint; ชุด2 bigint; ชุด3 bigint; ใหม่1 bigint; วันเดิม timestamptz; ก่อน int; บันทึกก่อน int; rid bigint; ลิสต์ jsonb;
begin
  perform mitest.ok(hq is not null and ryg is not null, 'มีบัญชี HQ และดีลเลอร์ RYG');
  perform mitest.ok(to_regprocedure('public.hq_materials_import(text,jsonb)') is not null, 'มีคำสั่งนำเข้ารายการวัสดุ (ใบ 0279)');

  -- ของเดิม 1 รายการ (หมวด "ผนัง" หน่วย "ตร.ม." ราคา 100 ปิดใช้) · วันอัปเดตราคาย้อนหลังไว้ เพื่อตรวจการคืนวันเดิม
  perform mitest.as_root();
  insert into material_templates (category, name, unit, unit_price, active) values ('ผนัง', ป || ' เดิม', 'ตร.ม.', 100, false) returning id into เดิม;
  set local session_replication_role = replica;
  update material_templates set price_updated_at = '2026-01-15 09:00+07' where id = เดิม;
  set local session_replication_role = origin;
  select price_updated_at into วันเดิม from material_templates where id = เดิม;
  ก่อน := (select count(*) from material_templates);
  บันทึกก่อน := (select count(*) from audit_log where action = 'นำเข้ารายการวัสดุ');

  -- 3) ดีลเลอร์ไม่ได้
  perform mitest.as_user(ryg, 'DEALER_ADMIN', 'RYG');
  perform mitest.must_fail(format($q$select hq_materials_import('x.xlsx', '[{"name":"%s ดีลเลอร์","unit":"ชิ้น","unitPrice":1}]')$q$, ป), 'forbidden', '3) ดีลเลอร์นำเข้าไม่ได้');

  -- 2) ทั้งหมดหรือไม่เลย
  perform mitest.as_user(hq, 'SUPER_ADMIN', null);
  perform mitest.must_fail(format($q$select hq_materials_import('x.xlsx', '[{"name":"%1$s ใหม่ ก","unit":"ชิ้น","unitPrice":5},{"category":"ผนัง","name":"%1$s เดิม","unit":"แผ่น","unitPrice":120}]')$q$, ป),
    'unit_mismatch', '2) หน่วยต่างจากของเดิม = ปฏิเสธทั้งชุด');
  perform mitest.must_fail(format($q$select hq_materials_import('x.xlsx', '[{"name":"%1$s ซ้ำ","unit":"ชิ้น","unitPrice":5},{"name":" %1$s ซ้ำ ","unit":"ชิ้น","unitPrice":6}]')$q$, ป),
    'ซ้ำกันในไฟล์', '2) หมวด+ชื่อซ้ำกันในไฟล์ = ปฏิเสธทั้งชุด');
  perform mitest.must_fail(format($q$select hq_materials_import('x.xlsx', '[{"name":"%1$s ไม่มีหน่วย","unit":"","unitPrice":5}]')$q$, ป), 'ต้องมีชื่อวัสดุและหน่วย', '2) ไม่มีหน่วย = ปฏิเสธ');
  perform mitest.must_fail(format($q$select hq_materials_import('x.xlsx', '[{"name":"%1$s ราคาผิด","unit":"ชิ้น","unitPrice":"abc"}]')$q$, ป), 'ไม่ใช่ตัวเลข', '2) ราคาไม่ใช่ตัวเลข = ปฏิเสธ');
  perform mitest.must_fail(format($q$select hq_materials_import('x.xlsx', '[{"category":"ผนัง","name":"%1$s เดิม","unit":"ตร.ม.","unitPrice":100}]')$q$, ป), 'ไม่มีแถวที่เปลี่ยน', '1) ราคาเท่าเดิมทุกแถว = ไม่สร้างชุดเปล่า');
  perform mitest.as_root();
  perform mitest.ok((select count(*) from material_templates) = ก่อน and (select unit_price from material_templates where id = เดิม) = 100
    and not exists (select 1 from material_import_batches), '2) ชุดที่ถูกปฏิเสธไม่เขียนอะไรเลย');

  -- 1) นำเข้า: ใหม่ 2 (หนึ่งปิดใช้) + อัปเดตราคาของเดิม (หน่วยเขียนต่างตัวพิมพ์/ช่องว่างได้)
  perform mitest.as_user(hq, 'SUPER_ADMIN', null);
  ผล := hq_materials_import('ราคาวัสดุ.xlsx', format($q$[{"category":"หลังคา","name":"%1$s ใหม่ ก","unit":"แผ่น","unitPrice":250.555},
    {"category":"","name":"%1$s ใหม่ ข","unit":"ชิ้น","unitPrice":0,"active":false},
    {"category":" ผนัง ","name":"%1$s เดิม","unit":" ตร.ม. ","unitPrice":125,"active":true}]$q$, ป)::jsonb);
  ชุด1 := (ผล ->> 'batch')::bigint;
  perform mitest.ok((ผล ->> 'inserted')::int = 2 and (ผล ->> 'updated')::int = 1, '1) เพิ่ม 2 · อัปเดตราคา 1');
  perform mitest.as_root();
  select id into ใหม่1 from material_templates where name = ป || ' ใหม่ ก';
  perform mitest.ok((select unit_price = 250.56 and active and category = 'หลังคา' from material_templates where id = ใหม่1), '1) ใหม่: ราคาปัด 2 ตำแหน่ง · ว่าง = เปิดใช้');
  perform mitest.ok((select not active from material_templates where name = ป || ' ใหม่ ข'), '1) ใหม่: เปิดใช้ตามไฟล์ (ปิด)');
  perform mitest.ok((select unit_price = 125 and not active and unit = 'ตร.ม.' and category = 'ผนัง' and price_updated_at > วันเดิม from material_templates where id = เดิม),
    '1) อัปเดตราคา: เปลี่ยนแค่ราคา (เปิดใช้/หน่วย/หมวดเดิมคงไว้) · วันอัปเดตราคาเปลี่ยน');
  perform mitest.ok((select count(*) from material_import_changes where batch_id = ชุด1) = 3
    and (select old_price = 100 and new_price = 125 and old_price_updated_at = วันเดิม from material_import_changes where batch_id = ชุด1 and template_id = เดิม), '1) จดราคาเดิม→ใหม่ + วันเดิม');
  perform mitest.ok((select count(*) from audit_log where action = 'นำเข้ารายการวัสดุ') = บันทึกก่อน + 1, '1) บันทึกการใช้งานแถวเดียวต่อชุด');
  perform mitest.ok((select count(*) from material_templates) = ก่อน + 2, '3) นำเข้าไม่ลบวัสดุที่มีอยู่');

  perform mitest.as_user(hq, 'SUPER_ADMIN', null);
  ลิสต์ := hq_material_import_batches();
  perform mitest.ok((select (e ->> 'blocked') is null and (e ->> 'inserted')::int = 2 from jsonb_array_elements(ลิสต์) e where (e ->> 'id')::bigint = ชุด1), 'รายการชุด: ยกเลิกได้');
  perform mitest.as_user(ryg, 'DEALER_ADMIN', 'RYG');
  perform mitest.must_fail(format('select hq_materials_import_cancel(%s)', ชุด1), 'forbidden', '3) ดีลเลอร์ยกเลิกชุดไม่ได้');
  perform mitest.must_fail('select hq_material_import_batches()', 'forbidden', '3) ดีลเลอร์ดูรายการชุดไม่ได้');

  -- 4) ยกเลิกทั้งชุด
  perform mitest.as_user(hq, 'SUPER_ADMIN', null);
  ผล := hq_materials_import_cancel(ชุด1);
  perform mitest.ok((ผล ->> 'deleted')::int = 2 and (ผล ->> 'restored')::int = 1, '4) ยกเลิก: ลบที่เพิ่ม 2 · คืนราคา 1');
  perform mitest.as_root();
  perform mitest.ok((select count(*) from material_templates) = ก่อน and not exists (select 1 from material_templates where id = ใหม่1), '4) วัสดุที่ชุดเพิ่มหายหมด');
  perform mitest.ok((select unit_price = 100 and price_updated_at = วันเดิม from material_templates where id = เดิม), '4) คืนราคาเดิม + วันอัปเดตราคาเดิม');
  perform mitest.as_user(hq, 'SUPER_ADMIN', null);
  perform mitest.must_fail(format('select hq_materials_import_cancel(%s)', ชุด1), 'ยกเลิกไปแล้ว', '4) ยกเลิกซ้ำไม่ได้');
  perform mitest.as_root();
  perform mitest.ok((select price_updated_at = วันเดิม from material_templates where id = เดิม) is true, '4) สวิตช์คืนวันเดิมไม่ค้างหลังคำสั่ง');
  update material_templates set unit_price = 101 where id = เดิม;
  perform mitest.ok((select price_updated_at > วันเดิม from material_templates where id = เดิม), '4) แก้ราคาปกติหลังยกเลิก = วันอัปเดตราคาเปลี่ยนตามเดิม');
  update material_templates set unit_price = 100 where id = เดิม;

  -- 5) ยกเลิกไม่ได้: คำขอราคาหลังนำเข้าใช้วัสดุในชุด
  perform mitest.as_user(hq, 'SUPER_ADMIN', null);
  ชุด2 := (hq_materials_import('ชุด2.xlsx', format('[{"name":"%s ใช้แล้ว","unit":"ชิ้น","unitPrice":9}]', ป)::jsonb) ->> 'batch')::bigint;
  perform mitest.as_root();
  update material_import_batches set created_at = now() - interval '1 minute' where id = ชุด2;
  -- คำขอราคาจำลอง (หลังนำเข้า) ที่เลือกวัสดุในชุด — ปิดตัวดักไว้ ไม่ให้เกิดแจ้งเตือน/อีเมลตาม (ทรานแซกชันย้อนกลับทั้งหมด)
  set local session_replication_role = replica;
  insert into quote_requests (request_no, dealer_code, lead_num_id, due_at, estimate_items)
  select 'ZZT-MI-' || (random() * 1e9)::bigint, l.dealer_code, l.num_id, now() + interval '14 days',
         jsonb_build_array(jsonb_build_object('templateId', (select template_id from material_import_changes where batch_id = ชุด2), 'qty', 1))
    from leads l where l.dealer_code = 'RYG' order by l.num_id limit 1
  returning id into rid;
  set local session_replication_role = origin;
  perform mitest.ok(rid is not null, 'สร้างคำขอราคาจำลองที่ใช้วัสดุในชุดได้');
  perform mitest.as_user(hq, 'SUPER_ADMIN', null);
  perform mitest.must_fail(format('select hq_materials_import_cancel(%s)', ชุด2), 'มีคำขอใบเสนอราคาใช้วัสดุ', '5) มีคำขอใบเสนอราคาใช้วัสดุในชุดแล้ว = ยกเลิกไม่ได้');
  perform mitest.ok((select e ->> 'blocked' from jsonb_array_elements(hq_material_import_batches()) e where (e ->> 'id')::bigint = ชุด2) like 'มีคำขอใบเสนอราคา%', '5) รายการชุดบอกเหตุ');

  -- 5) ยกเลิกไม่ได้: แก้ราคาหลังนำเข้า
  ชุด3 := (hq_materials_import('ชุด3.xlsx', format('[{"category":"ผนัง","name":"%s เดิม","unit":"ตร.ม.","unitPrice":130}]', ป)::jsonb) ->> 'batch')::bigint;
  perform mitest.as_root();
  update material_templates set unit_price = 140 where id = เดิม;
  perform mitest.as_user(hq, 'SUPER_ADMIN', null);
  perform mitest.must_fail(format('select hq_materials_import_cancel(%s)', ชุด3), 'ถูกแก้ราคา', '5) แก้ราคาหลังนำเข้า = ยกเลิกไม่ได้ (ไม่ทับของที่แก้)');
  perform mitest.as_root();
end $$;

select 'ALL PASS' as result;
rollback;
