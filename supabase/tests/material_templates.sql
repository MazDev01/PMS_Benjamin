-- ── ใบ 0244: แม่แบบวัสดุ + ราคาประเมินเบื้องต้นตอนขอราคา (บอสสั่ง 26 ต.ค. 69) ───────────────────────────────────────
-- รัน: docker exec -i <คอนเทนเนอร์ฐานทดสอบ> psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/material_templates.sql
-- ต้องตกบนฐานก่อนลงใบ (ไม่มีตาราง/ช่อง/คำสั่ง) · ผ่านหลังลงใบ
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
create function flowtest.as_root() returns void language plpgsql as $$
begin perform set_config('role', 'none', true); perform set_config('request.jwt.claims', '', true); end $$;
create function flowtest.as_user(p_uid uuid, p_role text, p_dealer text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated',
    'user_role', p_role, 'dealer_code', p_dealer, 'email', 'zzmt@example.test')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
grant usage on schema flowtest to authenticated;
grant execute on all functions in schema flowtest to authenticated;

do $$
declare
  hq  uuid := (select id from profiles where role = 'SUPER_ADMIN' limit 1);
  ryg uuid := (select id from profiles where role = 'DEALER_ADMIN' and dealer_code = 'RYG' limit 1);
  n int := 980000 + (random() * 9000)::int;
  ผนัง bigint; ประตู bigint; ปิด bigint; rid bigint; rid2 bigint; r quote_requests; แถว jsonb; ค jsonb; บันทึกก่อน int;
begin
  perform flowtest.ok(hq is not null and ryg is not null, 'มีบัญชี HQ และดีลเลอร์ RYG');
  perform flowtest.ok(to_regclass('public.material_templates') is not null, 'มีตารางแม่แบบวัสดุ (ใหม่ ไม่ใช่ master_catalog)');
  perform flowtest.ok(to_regclass('public.master_catalog') is not null, 'ตารางแม่แบบเดิม (master_catalog) ยังอยู่ ไม่ถูกลบ');

  -- ── HQ ตั้งแม่แบบ ──
  perform flowtest.as_user(hq, 'SUPER_ADMIN', '');
  select count(*) into บันทึกก่อน from audit_log where action = 'บันทึกแม่แบบวัสดุ';
  perform material_templates_save(jsonb_build_array(
    jsonb_build_object('category', 'ZZMT ผนัง', 'name', 'ZZMT ผนังเมทัลชีท 0.35', 'unit', 'ตร.ม.', 'unitPrice', 285.5),
    jsonb_build_object('category', 'ZZMT ประตู', 'name', 'ZZMT ประตูม้วน 4x5 ม.', 'unit', 'ชุด', 'unitPrice', 42000),
    jsonb_build_object('category', 'ZZMT ประตู', 'name', 'ZZMT ประตูเก่าเลิกขาย', 'unit', 'ชุด', 'unitPrice', 1000, 'active', false)));
  select id into ผนัง from material_templates where name = 'ZZMT ผนังเมทัลชีท 0.35';
  select id into ประตู from material_templates where name = 'ZZMT ประตูม้วน 4x5 ม.';
  select id into ปิด from material_templates where name = 'ZZMT ประตูเก่าเลิกขาย';
  perform flowtest.ok(ผนัง is not null and ประตู is not null and ปิด is not null, 'HQ เพิ่มแม่แบบวัสดุได้ (หมวด · ชื่อ · หน่วย · ราคาต่อหน่วย)');
  perform flowtest.ok((select count(*) from audit_log where action = 'บันทึกแม่แบบวัสดุ') = บันทึกก่อน + 1, 'ฐานลงบันทึกการใช้งาน 1 แถวต่อการบันทึก');
  perform flowtest.must_fail(format($q$select material_templates_save('[{"name":"","unitPrice":1}]')$q$), 'rows_invalid', 'ชื่อว่างบันทึกไม่ได้');
  perform flowtest.must_fail(format($q$select material_templates_save('[{"name":"x","unitPrice":-1}]')$q$), 'rows_invalid', 'ราคาติดลบบันทึกไม่ได้');

  -- ── ดีลเลอร์: อ่านได้เฉพาะที่เปิดใช้ (เห็นราคา) · แก้ไม่ได้ทุกทาง ──
  perform flowtest.as_user(ryg, 'DEALER_ADMIN', 'RYG');
  perform flowtest.ok((select unit_price from material_templates where id = ผนัง) = 285.50, 'ดีลเลอร์เห็นราคาต่อหน่วยของแม่แบบที่เปิดใช้');
  perform flowtest.ok(not exists (select 1 from material_templates where id = ปิด), 'ดีลเลอร์ไม่เห็นแม่แบบที่ปิดใช้');
  perform flowtest.must_fail(format('update material_templates set unit_price = 1 where id = %s', ผนัง), 'permission denied', 'ดีลเลอร์แก้ราคาแม่แบบตรง ๆ ไม่ได้');
  perform flowtest.must_fail($q$insert into material_templates (name, unit_price) values ('ZZMT ของดีลเลอร์', 1)$q$, 'permission denied', 'ดีลเลอร์เพิ่มแม่แบบตรง ๆ ไม่ได้');
  perform flowtest.must_fail(format('delete from material_templates where id = %s', ผนัง), 'permission denied', 'ดีลเลอร์ลบแม่แบบตรง ๆ ไม่ได้');
  perform flowtest.must_fail(format($q$select material_templates_save('[{"id":%s,"name":"ZZMT ผนังเมทัลชีท 0.35","unitPrice":1}]')$q$, ผนัง), 'forbidden', 'ดีลเลอร์แก้ราคาผ่านคำสั่งบันทึกไม่ได้');

  -- ── ดีลเลอร์ขอราคาพร้อมเลือกวัสดุ 2 รายการ → ราคาประเมินคิดที่ฐาน ──
  insert into leads (id, num_id, dealer_code, company, name, contact, phone, province, status)
  values ('#L-' || n, n, 'RYG', 'ZZMT บริษัททดสอบ', 'ZZMT บริษัททดสอบ', 'คุณทดสอบ', '000-000-0043', 'ระยอง', 'BULLET');
  perform flowtest.must_fail(format($q$select quote_request_submit(%s, 'งาน', '', null, '', '', '[{"templateId":%s,"qty":1}]')$q$, n, ปิด), 'estimate_invalid', 'เลือกวัสดุที่ HQ ปิดใช้ไม่ได้');
  perform flowtest.must_fail(format($q$select quote_request_submit(%s, 'งาน', '', null, '', '', '[{"templateId":%s,"qty":0}]')$q$, n, ผนัง), 'estimate_invalid', 'จำนวน 0 ไม่ได้');
  r := quote_request_submit(n, 'ZZMT โกดัง 20x40 ม.', '', 800, '', 'ระยอง',
         jsonb_build_array(jsonb_build_object('templateId', ผนัง, 'qty', 820, 'unitPrice', 1), jsonb_build_object('templateId', ประตู, 'qty', 2)));
  rid := r.id;
  -- 820 × 285.50 = 234,110.00 · 2 × 42,000 = 84,000 → 318,110.00 (ราคาที่หน้าเว็บส่งมา unitPrice=1 ไม่ถูกใช้)
  perform flowtest.ok(r.estimate_total = 318110.00, 'วัสดุ 2 รายการ → ราคาประเมินถูก (318,110.00) คิดจากราคาแม่แบบ ไม่ใช่ราคาที่หน้าเว็บส่ง');
  perform flowtest.ok(jsonb_array_length(r.estimate_items) = 2
    and r.estimate_items -> 0 ->> 'name' = 'ZZMT ผนังเมทัลชีท 0.35' and r.estimate_items -> 0 ->> 'unit' = 'ตร.ม.'
    and (r.estimate_items -> 0 ->> 'unitPrice')::numeric = 285.50 and (r.estimate_items -> 0 ->> 'qty')::numeric = 820, 'คำขอเก็บสำเนา ชื่อ · หน่วย · จำนวน · ราคาต่อหน่วย ณ ตอนส่ง');
  perform flowtest.ok((select value from leads where num_id = n and dealer_code = 'RYG') is null, 'ราคาประเมินไม่ไปเป็นมูลค่าลีด (ไม่นับในมูลค่าโอกาสการขาย)');

  -- ── HQ เปลี่ยนราคาทีหลัง → คำขอเก่าไม่เปลี่ยน · วันที่อัปเดตราคาขยับเฉพาะแถวที่ราคาเปลี่ยน ──
  perform flowtest.as_root();
  -- เตรียมข้อมูล: ตั้งวันที่อัปเดตราคาย้อนหลังโดยข้ามตัวประทับ (ตัวประทับไม่ยอมให้แก้วันที่ตรง ๆ — ถูกต้องแล้ว)
  alter table material_templates disable trigger material_templates_touch;
  update material_templates set price_updated_at = now() - interval '10 days' where id in (ผนัง, ประตู);
  alter table material_templates enable trigger material_templates_touch;
  perform flowtest.as_user(hq, 'SUPER_ADMIN', '');
  perform material_templates_save(jsonb_build_array(
    jsonb_build_object('id', ผนัง, 'category', 'ZZMT ผนัง', 'name', 'ZZMT ผนังเมทัลชีท 0.35', 'unit', 'ตร.ม.', 'unitPrice', 310),
    jsonb_build_object('id', ประตู, 'category', 'ZZMT ประตู', 'name', 'ZZMT ประตูม้วน 4x5 ม.', 'unit', 'ชุด', 'unitPrice', 42000)));
  perform flowtest.ok((select unit_price from material_templates where id = ผนัง) = 310, 'HQ แก้ราคาได้');
  perform flowtest.ok((select price_updated_at > now() - interval '1 minute' from material_templates where id = ผนัง), 'ราคาเปลี่ยน → วันที่อัปเดตราคาเป็นวันนี้ (ฐานประทับเอง)');
  perform flowtest.ok((select price_updated_at < now() - interval '9 days' from material_templates where id = ประตู), 'ราคาไม่เปลี่ยน → วันที่อัปเดตราคาคงเดิม');
  select * into r from quote_requests where id = rid;
  perform flowtest.ok(r.estimate_total = 318110.00 and (r.estimate_items -> 0 ->> 'unitPrice')::numeric = 285.50, 'HQ เปลี่ยนราคาแล้ว คำขอเก่ายังเป็นราคา ณ ตอนส่ง');

  -- ── กล่องงาน HQ คืนรายการประเมิน (ใบ HQ เปิดมามีรายการจากคำขอ) ──
  select x into แถว from jsonb_array_elements(hq_quote_board('todo', 'ZZMT')->'rows') x where (x->>'id')::bigint = rid;
  perform flowtest.ok(jsonb_array_length(แถว->'estimate_items') = 2 and (แถว->>'estimate_total')::numeric = 318110.00, 'กล่องงาน HQ ได้รายการและราคาประเมินของคำขอ');

  -- ── HQ ส่งใบ → เก็บ % คลาด · ค่าเฉลี่ยในหน้าแม่แบบ ──
  perform hq_quote_save(rid, jsonb_build_array(jsonb_build_object('name', 'โครงสร้างรวม', 'qty', 1, 'unit', 'งาน', 'unitCost', 289191)),
                        ((now() at time zone 'Asia/Bangkok')::date + 30), '');
  perform hq_quote_send(rid);
  -- (318,110 − 289,191) ÷ 289,191 × 100 = 10.0
  perform flowtest.ok((select estimate_deviation_pct from quote_requests where id = rid) = 10.0, 'ส่งใบ HQ → เก็บ % ราคาประเมินคลาดจากยอดใบ HQ (+10.0%)');
  ค := material_estimate_accuracy();
  perform flowtest.ok((ค->>'n')::int >= 1 and ค->>'avg_abs_pct' is not null, 'HQ อ่านค่าเฉลี่ย % คลาดได้');

  -- ── ขอแก้ราคา → คำขอใหม่ถือรายการประเมินชุดเดิม ──
  perform flowtest.as_user(ryg, 'DEALER_ADMIN', 'RYG');
  perform flowtest.must_fail('select material_estimate_accuracy()', 'forbidden', 'ดีลเลอร์อ่านค่าเฉลี่ย % คลาดไม่ได้');
  r := quote_request_reprice(rid, 'ลูกค้าเพิ่มประตู', null);
  perform flowtest.ok(r.estimate_total = 318110.00 and jsonb_array_length(r.estimate_items) = 2 and r.estimate_deviation_pct is null, 'ขอแก้ราคา: คำขอใหม่ถือรายการประเมินเดิม (ยังไม่มี % คลาดจนกว่า HQ ส่งใบ)');

  -- ── ไม่เลือกวัสดุ = ไม่มีราคาประเมิน (ไม่บังคับ) ──
  perform flowtest.as_root();
  insert into leads (id, num_id, dealer_code, company, name, contact, phone, province, status)
  values ('#L-' || (n + 1), n + 1, 'RYG', 'ZZMT บริษัททดสอบ 2', 'ZZMT บริษัททดสอบ 2', 'คุณทดสอบ', '000-000-0044', 'ระยอง', 'BULLET');
  perform flowtest.as_user(ryg, 'DEALER_ADMIN', 'RYG');
  r := quote_request_submit(n + 1, 'ZZMT งานไม่เลือกวัสดุ');
  perform flowtest.ok(r.estimate_total is null and r.estimate_items = '[]'::jsonb, 'ไม่เลือกวัสดุก็ส่งคำขอได้ (ราคาประเมิน = ไม่มี)');
end $$;

select 'ALL PASS' as result;
rollback;
