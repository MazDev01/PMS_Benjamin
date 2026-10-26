-- ── ใบ 0240: บันทึกการใช้งานของ HQ ฐานเขียนเองในคำสั่งเดียวกับการเปลี่ยน (บอสสั่ง 22 ต.ค. 69) ─────────────────────────
--   เดิมหน้าเว็บยิงคำขอบันทึกแยกหลังเปลี่ยนสำเร็จ — ผู้ใช้เปลี่ยนหน้าเร็ว คำขอถูกตัดทิ้ง = มีการเปลี่ยนแต่ไม่มีบันทึกว่าใครเปลี่ยน
--   ตรวจ: ทุกเหตุการณ์ที่หน้าเว็บเคยบันทึกเอง (ใบค่าแฟรนไชส์ · การชำระ · ผู้สนใจ · ดีลเลอร์ · ผู้ใช้ HQ · ตั้งค่า · ข้อมูลบริษัท
--         · ส่งออก/นำเข้า/คืนค่าการตั้งค่า · เข้า/ออกระบบ) ลงบันทึกครบ ชื่อผู้ทำคิดที่ฐาน · ผลข้างเคียงของตัวดักอื่น/ระบบเบื้องหลังไม่ลงซ้ำ
--         · บัญชีผู้ใช้เขียนตารางบันทึกเองไม่ได้แล้ว
-- รัน: docker exec -i <คอนเทนเนอร์ฐานทดสอบ> psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/audit_in_db.sql
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
create function flowtest.as_hq(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated',
    'user_role', 'SUPER_ADMIN', 'dealer_code', '', 'email', 'zzaudit-hq@example.test')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function flowtest.as_dealer(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated',
    'user_role', 'DEALER_ADMIN', 'dealer_code', 'CNX', 'email', 'zzaudit-cnx@example.test')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function flowtest.as_root() returns void language plpgsql as $$
begin perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '', true); end $$;
-- จำนวนบันทึกใหม่ (หลังจุดเริ่ม) ที่ตรงเรื่อง/เป้าหมาย — อ่านด้วยสิทธิ์เจ้าของ ไม่ขึ้นกับกฎการอ่าน
create function flowtest.n(p_from bigint, p_action text, p_target text default '%') returns int
language sql security definer set search_path = public as $$
  select count(*)::int from audit_log where id > p_from and action = p_action and target like p_target;
$$;
create function flowtest.mark() returns bigint language sql security definer set search_path = public as $$
  select coalesce(max(id), 0) from audit_log;
$$;
create function flowtest.who(p_from bigint) returns text language sql security definer set search_path = public as $$
  select string_agg(distinct "user", ',') from audit_log where id > p_from;
$$;
grant usage on schema flowtest to authenticated;
grant execute on all functions in schema flowtest to authenticated;

do $$
declare
  hq  uuid := (select id from profiles where role = 'SUPER_ADMIN' limit 1);
  cnx uuid := (select id from profiles where role = 'DEALER_ADMIN' and dealer_code = 'CNX' limit 1);
  staff uuid := gen_random_uuid();
  m bigint; pid bigint; p dealer_package_proposals; v2 dealer_package_proposals; pay bigint; ชื่อสาขา text; แถวCNX jsonb; ทุกสาขา jsonb;
begin
  perform flowtest.ok(hq is not null and cnx is not null, 'มีบัญชี HQ และดีลเลอร์ตั้งต้น');

  -- ── บัญชีผู้ใช้เขียนตารางบันทึกเองไม่ได้ (ฐานบันทึกเท่านั้น) ──
  perform flowtest.as_hq(hq);
  --   ใช้ชื่อจริงของบัญชีนั้น = ผ่านกฎเดิม (0115) ทุกข้อ · ต้องถูกปฏิเสธเพราะไม่มีสิทธิ์เขียนตารางแล้วเท่านั้น
  perform flowtest.must_fail(format($q$insert into audit_log("user", role, action, target) values (%L, 'SUPER_ADMIN', 'ZZTEST-เขียนเอง', 'x')$q$,
    (select name from profiles where id = hq)), 'permission denied', 'HQ เขียนบันทึกการใช้งานเองตรง ๆ ไม่ได้');

  -- ── ผู้สนใจเป็นดีลเลอร์ ──
  m := flowtest.mark();
  insert into dealer_prospects (name, province, status) values ('ZZAUDIT ผู้สนใจ', 'ตราด', 'meeting') returning id into pid;
  perform flowtest.ok(flowtest.n(m, 'เพิ่มผู้สนใจเป็นดีลเลอร์', 'ZZAUDIT ผู้สนใจ') = 1, 'เพิ่มผู้สนใจ → บันทึก 1 แถว');
  perform flowtest.ok(flowtest.who(m) = (select name from profiles where id = hq), 'ชื่อผู้ทำ = ชื่อในโปรไฟล์ของบัญชีที่เข้าระบบ (คิดที่ฐาน · แบบเดียวกับบันทึกเดิม)');
  m := flowtest.mark();
  update dealer_prospects set note = 'โทรคุยแล้ว' where id = pid;
  perform flowtest.ok(flowtest.n(m, 'แก้ไขผู้สนใจเป็นดีลเลอร์', 'ZZAUDIT ผู้สนใจ') = 1, 'แก้ไขผู้สนใจ → บันทึก');
  m := flowtest.mark();
  update dealer_prospects set note = 'โทรคุยแล้ว' where id = pid;
  perform flowtest.ok(flowtest.n(m, 'แก้ไขผู้สนใจเป็นดีลเลอร์') = 0, 'บันทึกซ้ำค่าเดิม (ไม่มีอะไรเปลี่ยน) → ไม่ลงบันทึก');

  -- ── ใบค่าแฟรนไชส์: ออก · แก้ร่าง · ตั้งวันครบกำหนด · ส่ง ──
  m := flowtest.mark();
  insert into dealer_package_proposals (prospect_id, package, amount, valid_until) values (pid, 'standard', 300000, current_date + 30) returning * into p;
  perform flowtest.ok(flowtest.n(m, 'ออกใบค่าแฟรนไชส์', p.proposal_no || ' · ZZAUDIT ผู้สนใจ · Standard') = 1, 'ออกใบ → บันทึก (เลขที่ · ผู้สนใจ · แพ็กเกจ)');
  m := flowtest.mark();
  update dealer_package_proposals set amount = 250000 where id = p.id;
  perform flowtest.ok(flowtest.n(m, 'แก้ไขใบค่าแฟรนไชส์', p.proposal_no || ' · ZZAUDIT ผู้สนใจ') = 1, 'แก้ใบร่าง → บันทึก');
  m := flowtest.mark();
  update dealer_package_proposals set payment_due_on = date '2026-11-30' where id = p.id;
  perform flowtest.ok(flowtest.n(m, 'ตั้งวันครบกำหนดชำระค่าแฟรนไชส์', p.proposal_no || ' · 30/11/2569') = 1, 'ตั้งวันครบกำหนดชำระ → บันทึก (ปี พ.ศ.)');
  perform flowtest.ok(flowtest.n(m, 'แก้ไขใบค่าแฟรนไชส์') = 0, 'ตั้งวันครบกำหนด ไม่นับเป็นแก้ไขใบ');
  m := flowtest.mark();
  update dealer_package_proposals set payment_due_on = null where id = p.id;
  perform flowtest.ok(flowtest.n(m, 'ตั้งวันครบกำหนดชำระค่าแฟรนไชส์', p.proposal_no || ' · ล้างวัน') = 1, 'ล้างวันครบกำหนด → บันทึก "ล้างวัน"');
  m := flowtest.mark();
  update dealer_package_proposals set status = 'sent' where id = p.id;
  perform flowtest.ok(flowtest.n(m, 'เปลี่ยนสถานะใบค่าแฟรนไชส์', p.proposal_no || ' · ZZAUDIT ผู้สนใจ → ส่งแล้ว') = 1, 'ส่งใบ → บันทึกเปลี่ยนสถานะ');
  perform flowtest.ok((select status from dealer_prospects where id = pid) = 'considering', 'ส่งใบแล้วขั้นผู้สนใจเลื่อนเอง (ตัวดักเดิม 0174)');
  perform flowtest.ok(flowtest.n(m, 'เปลี่ยนขั้นผู้สนใจเป็นดีลเลอร์') = 0, 'ขั้นที่ตัวดักเลื่อนให้เอง ไม่ลงเป็นการกระทำของผู้ใช้');

  -- ── ทำเวอร์ชันใหม่ · ส่งเวอร์ชันใหม่ (ใบเดิมถูกแทนที่เอง ไม่ลงบันทึก) · ลบร่าง ──
  m := flowtest.mark();
  select * into v2 from dealer_proposal_new_version(p.id);
  perform flowtest.ok(flowtest.n(m, 'ทำเวอร์ชันใหม่ใบค่าแฟรนไชส์', p.proposal_no || ' → ' || v2.proposal_no || ' · ZZAUDIT ผู้สนใจ') = 1, 'ทำเวอร์ชันใหม่ → บันทึก (เดิม → ใหม่)');
  perform flowtest.ok(flowtest.n(m, 'ออกใบค่าแฟรนไชส์') = 0, 'เวอร์ชันใหม่ไม่นับเป็นออกใบใหม่');
  m := flowtest.mark();
  update dealer_package_proposals set status = 'sent' where id = v2.id;
  perform flowtest.ok((select status from dealer_package_proposals where id = p.id) = 'superseded', 'ส่งเวอร์ชันใหม่ ใบเดิมถูกแทนที่เอง');
  perform flowtest.ok(flowtest.n(m, 'เปลี่ยนสถานะใบค่าแฟรนไชส์') = 1, 'ลงแค่ใบที่ผู้ใช้ส่ง ไม่ลงใบที่ระบบแทนที่ให้');
  m := flowtest.mark();
  insert into dealer_package_proposals (prospect_id, package, amount) values (pid, 'exclusive', 1) returning * into p;
  delete from dealer_package_proposals where id = p.id;
  perform flowtest.ok(flowtest.n(m, 'ลบใบค่าแฟรนไชส์ (ร่าง)', p.proposal_no || ' · ZZAUDIT ผู้สนใจ') = 1, 'ลบใบร่าง → บันทึก');

  -- ── ตอบรับพร้อมเหตุผล/การชำระ: บันทึก · ยกเลิก ──
  m := flowtest.mark();
  update dealer_package_proposals set status = 'accepted' where id = v2.id;
  perform flowtest.ok(flowtest.n(m, 'เปลี่ยนสถานะใบค่าแฟรนไชส์', v2.proposal_no || ' · ZZAUDIT ผู้สนใจ → ตอบรับ') = 1, 'ตอบรับใบ → บันทึก');
  m := flowtest.mark();
  insert into dealer_proposal_payments (proposal_id, paid_on, amount, reference) values (v2.id, current_date, 1234.5, 'TR-ZZ1') returning id into pay;
  perform flowtest.ok(flowtest.n(m, 'บันทึกการชำระค่าแฟรนไชส์', v2.proposal_no || ' · 1,234.50 บาท · TR-ZZ1') = 1, 'บันทึกการชำระ → บันทึก (ยอด · เลขอ้างอิง)');
  m := flowtest.mark();
  update dealer_proposal_payments set cancel_reason = 'ใส่ยอดผิด' where id = pay;
  perform flowtest.ok(flowtest.n(m, 'ยกเลิกการชำระค่าแฟรนไชส์', v2.proposal_no || ' · 1,234.50 บาท · ใส่ยอดผิด') = 1, 'ยกเลิกการชำระ → บันทึกพร้อมเหตุผล');

  -- ── เปลี่ยนขั้นผู้สนใจเอง · ลบผู้สนใจ (ใบที่ลบตามไปเองไม่ลงซ้ำ) ──
  m := flowtest.mark();
  update dealer_prospects set status = 'lost', lost_reason = 'ไม่พร้อมลงทุน' where id = pid;
  perform flowtest.ok(flowtest.n(m, 'เปลี่ยนขั้นผู้สนใจเป็นดีลเลอร์', 'ZZAUDIT ผู้สนใจ · รอตัดสินใจ → ไม่สำเร็จ') = 1, 'เปลี่ยนขั้นผู้สนใจ → บันทึก (เดิม → ใหม่)');
  perform flowtest.ok(flowtest.n(m, 'แก้ไขผู้สนใจเป็นดีลเลอร์') = 0, 'เปลี่ยนขั้นไม่ลงซ้ำเป็นแก้ไข');
  m := flowtest.mark();
  delete from dealer_prospects where id = pid;
  perform flowtest.ok(flowtest.n(m, 'ลบผู้สนใจเป็นดีลเลอร์', 'ZZAUDIT ผู้สนใจ') = 1, 'ลบผู้สนใจ → บันทึก');
  perform flowtest.ok(flowtest.n(m, 'ลบใบค่าแฟรนไชส์ (ร่าง)') = 0, 'ใบที่ลบตามผู้สนใจไปเอง ไม่ลงบันทึกซ้ำ');

  -- ── ดีลเลอร์ (ผ่าน save_dealers ทางเดียวกับหน้าเว็บ) ──
  --   แถวที่ส่งเตรียมด้วยสิทธิ์เจ้าของ (บัญชีผู้ใช้อ่านตาราง dealers ตรงไม่ได้ — หน้าเว็บอ่านผ่านมุมมอง) แล้วสั่งในนาม HQ
  perform flowtest.as_root();
  ชื่อสาขา := (select name from dealers where code = 'CNX');
  แถวCNX := (select to_jsonb(d) from dealers d where code = 'CNX');
  perform flowtest.as_hq(hq);
  m := flowtest.mark();
  perform save_dealers(jsonb_build_array(แถวCNX || jsonb_build_object('status', 'inactive')));
  perform flowtest.ok(flowtest.n(m, 'ปิดใช้งานดีลเลอร์', 'CNX · ' || ชื่อสาขา) = 1, 'ปิดใช้งานดีลเลอร์ → บันทึก');
  perform flowtest.ok(flowtest.n(m, 'แก้ไขดีลเลอร์') = 0, 'ปิดใช้งานอย่างเดียว ไม่นับเป็นแก้ไข');
  m := flowtest.mark();
  perform save_dealers(jsonb_build_array(แถวCNX || jsonb_build_object('status', 'active', 'name', 'ZZAUDIT ชื่อใหม่')));
  perform flowtest.ok(flowtest.n(m, 'เปิดใช้งานดีลเลอร์', 'CNX · ZZAUDIT ชื่อใหม่') = 1, 'เปิดใช้งานดีลเลอร์ → บันทึก');
  perform flowtest.ok(flowtest.n(m, 'แก้ไขดีลเลอร์', 'CNX · ZZAUDIT ชื่อใหม่') = 1, 'แก้ชื่อดีลเลอร์ → บันทึกแก้ไข');
  perform flowtest.as_root();
  ทุกสาขา := (select jsonb_agg(to_jsonb(d)) from dealers d where code <> 'HQ');
  perform flowtest.as_hq(hq);
  m := flowtest.mark();
  perform save_dealers(ทุกสาขา);
  perform flowtest.ok(flowtest.n(m, 'แก้ไขดีลเลอร์') = 0 and flowtest.n(m, 'ปิดใช้งานดีลเลอร์') = 0, 'บันทึกรายชื่อทั้งชุดที่ไม่มีอะไรเปลี่ยน → ไม่ลงบันทึก');

  -- ── ผู้ใช้ HQ (แผงผู้ใช้) ──
  perform flowtest.as_root();
  insert into auth.users (id, email, aud, role) values (staff, 'zzaudit-staff@example.test', 'authenticated', 'authenticated');
  insert into profiles (id, role, name, status) values (staff, 'HQ_STAFF', 'ZZAUDIT เจ้าหน้าที่', 'active')
    on conflict (id) do update set role = 'HQ_STAFF', name = 'ZZAUDIT เจ้าหน้าที่', status = 'active', dealer_code = null;
  perform flowtest.as_hq(hq);
  m := flowtest.mark();
  update profiles set role = 'HQ_MANAGEMENT' where id = staff;
  perform flowtest.ok(flowtest.n(m, 'เปลี่ยนบทบาทผู้ใช้', 'zzaudit-staff@example.test: เจ้าหน้าที่สำนักงานใหญ่ → ผู้บริหารสำนักงานใหญ่') = 1, 'เปลี่ยนบทบาทผู้ใช้ → บันทึก');
  m := flowtest.mark();
  update profiles set department = 'บัญชี' where id = staff;
  perform flowtest.ok(flowtest.n(m, 'แก้ไขผู้ใช้', 'zzaudit-staff@example.test') = 1, 'แก้ไขผู้ใช้ → บันทึก');
  m := flowtest.mark();
  update profiles set status = 'inactive' where id = staff;
  perform flowtest.ok(flowtest.n(m, 'ปิดใช้งานผู้ใช้', 'zzaudit-staff@example.test') = 1, 'ปิดใช้งานผู้ใช้ → บันทึก');
  update profiles set status = 'active' where id = staff;
  perform flowtest.ok(flowtest.n(m, 'เปิดใช้งานผู้ใช้', 'zzaudit-staff@example.test') = 1, 'เปิดใช้งานผู้ใช้ → บันทึก');

  -- ── ตั้งค่า · ข้อมูลบริษัท (ทางเดียวกับหน้าเว็บ: upsert แถวเดียว) ──
  m := flowtest.mark();
  insert into hq_targets (id, annual_target) values (1, 123456789) on conflict (id) do update set annual_target = excluded.annual_target;
  perform flowtest.ok(flowtest.n(m, 'บันทึกการตั้งค่า', 'เป้าหมายยอดขาย') = 1, 'บันทึกแท็บเป้าหมาย → บันทึก');
  m := flowtest.mark();
  insert into hq_targets (id, annual_target) values (1, 123456789) on conflict (id) do update set annual_target = excluded.annual_target;
  perform flowtest.ok(flowtest.n(m, 'บันทึกการตั้งค่า') = 0, 'บันทึกค่าเดิมซ้ำ → ไม่ลงบันทึก');
  m := flowtest.mark();
  update hq_policy set quote_validity_days = quote_validity_days + 1 where id = 1;
  update hq_notif_rules set lead_idle_days = lead_idle_days + 1 where id = 1;
  update hq_sales_journey set lost = lost || array['ZZAUDIT เหตุผล'] where id = 1;
  update hq_recruit_settings set config = config || '{"zzaudit": 1}'::jsonb where id = 1;
  perform flowtest.ok(flowtest.n(m, 'บันทึกการตั้งค่า', 'นโยบายใบเสนอราคา') = 1, 'นโยบายใบเสนอราคา → บันทึก');
  perform flowtest.ok(flowtest.n(m, 'บันทึกการตั้งค่า', 'การแจ้งเตือน') = 1, 'การแจ้งเตือน → บันทึก');
  perform flowtest.ok(flowtest.n(m, 'บันทึกการตั้งค่า', 'เส้นทางการขาย') = 1, 'เส้นทางการขาย → บันทึก');
  perform flowtest.ok(flowtest.n(m, 'บันทึกการตั้งค่า', 'หาดีลเลอร์') = 1, 'หาดีลเลอร์ → บันทึก');
  m := flowtest.mark();
  insert into hq_company (id, name) values (1, 'ZZAUDIT บริษัท') on conflict (id) do update set name = excluded.name;
  perform flowtest.ok(flowtest.n(m, 'บันทึกข้อมูลบริษัท', 'ZZAUDIT บริษัท') = 1, 'บันทึกข้อมูลบริษัท → บันทึก');

  -- ── ส่งออก/นำเข้า/คืนค่าการตั้งค่า (คำสั่งฐานที่บันทึกเอง · ไม่ลงรายตาราง) ──
  m := flowtest.mark();
  perform hq_settings_audit_export('การตั้งค่าเบญจมิน-2026-10-22.xlsx');
  perform flowtest.ok(flowtest.n(m, 'ส่งออกการตั้งค่า', 'การตั้งค่าเบญจมิน-2026-10-22.xlsx') = 1, 'ส่งออกการตั้งค่า → บันทึก');
  m := flowtest.mark();
  perform hq_settings_restore('import', 'สำรอง.xlsx', '{"vat": 7}'::jsonb, '{"annual_target": 1}'::jsonb, null, null, '{"name": "ZZAUDIT นำเข้า"}'::jsonb);
  perform flowtest.ok(flowtest.n(m, 'นำเข้าการตั้งค่า (กู้คืน)', 'สำรอง.xlsx') = 1, 'นำเข้าการตั้งค่า → บันทึก 1 แถว (ชื่อไฟล์)');
  perform flowtest.ok(flowtest.n(m, 'บันทึกการตั้งค่า') = 0 and flowtest.n(m, 'บันทึกข้อมูลบริษัท') = 0, 'นำเข้าไม่ลงซ้ำรายตาราง');
  perform flowtest.ok((select name from hq_company where id = 1) = 'ZZAUDIT นำเข้า', 'นำเข้าเขียนค่าจริง');
  m := flowtest.mark();
  perform hq_settings_restore('reset', null, '{"vat": 7}'::jsonb, null, null, '["ราคาสูง"]'::jsonb, null);
  perform flowtest.ok(flowtest.n(m, 'คืนค่าเริ่มต้น', 'นโยบาย/เป้าหมาย/กฎแจ้งเตือน/เหตุผลปิดการขาย') = 1, 'คืนค่าเริ่มต้น → บันทึก 1 แถว');
  perform flowtest.ok(flowtest.n(m, 'บันทึกการตั้งค่า') = 0, 'คืนค่าไม่ลงซ้ำรายตาราง');
  perform flowtest.must_fail($q$select hq_settings_restore('อื่น', null, null, null, null, null, null)$q$, 'invalid', 'ชนิดการกู้คืนต้องเป็น import/reset');

  -- ── เข้า/ออกระบบ ──
  m := flowtest.mark();
  perform audit_auth_event('เข้าสู่ระบบ');
  perform audit_auth_event('ออกจากระบบ');
  perform flowtest.ok(flowtest.n(m, 'เข้าสู่ระบบ') = 1 and flowtest.n(m, 'ออกจากระบบ') = 1, 'เข้า/ออกระบบของ HQ → บันทึก');
  perform flowtest.must_fail($q$select audit_auth_event('ลบทุกอย่าง')$q$, 'invalid', 'บันทึกเข้าระบบได้แค่ 2 เรื่อง');

  -- ── ดีลเลอร์: ไม่มีสิทธิ์คำสั่งของ HQ · เข้าระบบไม่ลงบันทึกของ HQ ──
  perform flowtest.as_dealer(cnx);
  m := flowtest.mark();
  perform audit_auth_event('เข้าสู่ระบบ');
  perform flowtest.ok(flowtest.n(m, 'เข้าสู่ระบบ') = 0, 'ดีลเลอร์เข้าระบบ ไม่ลงบันทึกของ HQ (เหมือนเดิม)');
  perform flowtest.must_fail($q$select hq_settings_audit_export('x.xlsx')$q$, 'forbidden', 'ดีลเลอร์สั่งบันทึกส่งออกการตั้งค่าไม่ได้');
  perform flowtest.must_fail($q$select hq_settings_restore('reset', null, null, null, null, null, null)$q$, 'forbidden', 'ดีลเลอร์กู้คืนการตั้งค่าไม่ได้');

  -- ── ระบบเบื้องหลัง/เส้นทางผู้ดูแล (ไม่มีผู้ใช้ในคำขอ) ไม่ลงซ้ำ — เส้นทางผู้ดูแลบันทึกชื่อคนทำเองอยู่แล้ว ──
  perform flowtest.as_root();
  m := flowtest.mark();
  update dealers set name = 'ZZAUDIT โดยระบบ' where code = 'CNX';
  insert into dealer_prospects (name, province, status) values ('ZZAUDIT โดยระบบ', 'ตราด', 'new');
  perform flowtest.ok(flowtest.n(m, 'แก้ไขดีลเลอร์') = 0 and flowtest.n(m, 'เพิ่มผู้สนใจเป็นดีลเลอร์') = 0, 'ไม่มีผู้ใช้ในคำขอ → ไม่ลงบันทึก');
end $$;

select 'ALL PASS' as result;
rollback;
