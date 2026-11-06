-- ── ใบ 0280: คำขอราคาที่ส่งแล้วห้ามลบ · ยกเลิก = สถานะยกเลิกแล้ว + เหตุผล + ใคร เมื่อไร · ประวัติของลีด (บอสสั่ง 5 พ.ย. 69) ──
-- ต้องตกบนฐานก่อนลงใบ (ลบคำขอได้ · ไม่มีช่องคนยกเลิก) · ผ่านหลังลงใบ · ทรานแซกชันเดียวแล้ว rollback
--   1) ลบคำขอไม่ได้ทุกทาง (คำสั่งตรงของผู้ดูแลฐาน · บัญชี HQ) — ยกเว้นชุดล้างทดสอบที่ตั้งสวิตช์ pms.quote_request_delete = 'test'
--   2) ดีลเลอร์ยกเลิก = เหตุผลบังคับ · จดชื่อคนยกเลิก + เวลา · ประวัติของลีดมีบรรทัด "ยกเลิกคำขอราคา … · เหตุผล … · โดย …" · ยกเลิกแล้วก็ลบไม่ได้
--   3) กล่องคำขอ HQ: กลุ่ม "ยกเลิกแล้ว" มีคำขอนี้ + เหตุผล/ชื่อ/เวลา · กลุ่ม ปิด/ยกเลิก ยังมี · ไม่นับเป็นต้องตีราคา
--   5) HQ มีร่างใบ + ไฟล์แนบแล้วดีลเลอร์ยกเลิก = ยกเลิกสำเร็จ · ร่างและไฟล์ยังอยู่ · HQ แก้/ส่งร่างไม่ได้ (บอสตอบ 6 พ.ย. 69 · เดิมลบร่าง → ติดไฟล์ ยกเลิกไม่ได้)
--   4) กดยกเลิกฟอร์มขอราคา (ยังไม่ส่ง) = ประวัติของลีดมี "เริ่มขอราคาแล้วยกเลิก · โดย …" · ลีดของสาขาอื่น = ไม่พบ
-- รัน: docker exec -i <คอนเทนเนอร์ฐานทดสอบ> psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/quote_request_cancel_keep.sql
begin;
create schema qctest;
create function qctest.ok(p_cond boolean, p_what text) returns void language plpgsql as $$
begin if p_cond is not true then raise exception 'FAIL: %', p_what; end if; raise notice 'ok  %', p_what; end $$;
create function qctest.must_fail(p_sql text, p_like text, p_what text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if sqlerrm ilike '%' || p_like || '%' then raise notice 'ok  % (ถูกปฏิเสธ)', p_what; return; end if;
    raise exception 'FAIL: % — ถูกปฏิเสธแต่ข้อความไม่ตรง: %', p_what, sqlerrm;
  end;
  raise exception 'FAIL: % — ควรถูกปฏิเสธแต่ผ่าน', p_what;
end $$;
create function qctest.as_root() returns void language plpgsql as $$
begin perform set_config('role', 'none', true); perform set_config('request.jwt.claims', '', true); end $$;
create function qctest.as_user(p_uid uuid, p_role text, p_dealer text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated',
    'user_role', p_role, 'dealer_code', p_dealer, 'email', 'zzqc@example.test')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
grant usage on schema qctest to authenticated;
grant execute on all functions in schema qctest to authenticated;

do $$
declare
  hq  uuid := (select id from profiles where role = 'SUPER_ADMIN' limit 1);
  ryg uuid := (select id from profiles where role = 'DEALER_ADMIN' and dealer_code = 'RYG' limit 1);
  cnx uuid := (select id from profiles where role = 'DEALER_ADMIN' and dealer_code = 'CNX' limit 1);
  ชื่อryg text := (select coalesce(nullif(btrim(name), ''), 'zzqc@example.test') from profiles where id = (select id from profiles where role = 'DEALER_ADMIN' and dealer_code = 'RYG' limit 1));
  ลีด integer; rid bigint; rid2 bigint; hid bigint; เลข text := 'ZZT-QC-' || (random() * 1e9)::bigint; r quote_requests; บอร์ด jsonb; ท้าย text;
begin
  perform qctest.ok(hq is not null and ryg is not null and cnx is not null, 'มีบัญชี HQ · RYG · CNX');
  perform qctest.as_root();
  select num_id into ลีด from leads where dealer_code = 'RYG' and status not in ('PAID', 'CANCELLED') order by num_id limit 1;
  perform qctest.ok(ลีด is not null, 'มีลีดเปิดของ RYG ในข้อมูลตั้งต้น');
  insert into quote_requests (request_no, dealer_code, lead_num_id, due_at, product) values (เลข, 'RYG', ลีด, now() + interval '14 days', 'ZZT ทดสอบยกเลิก')
  returning id into rid;

  -- 1) ลบไม่ได้ทุกทาง
  perform qctest.must_fail(format('delete from quote_requests where id = %s', rid), 'request_no_delete', '1) ผู้ดูแลฐานลบคำขอตรง ๆ ไม่ได้');
  perform qctest.as_user(hq, 'SUPER_ADMIN', null);
  begin delete from quote_requests where id = rid; exception when others then null; end;
  perform qctest.as_root();
  perform qctest.ok(exists (select 1 from quote_requests where id = rid), '1) บัญชี HQ ลบคำขอไม่ได้ (แถวยังอยู่)');

  -- 2) ดีลเลอร์ยกเลิก
  perform qctest.as_user(ryg, 'DEALER_ADMIN', 'RYG');
  perform qctest.must_fail(format('select quote_request_cancel(%s, %L)', rid, '  '), 'reason_required', '2) ยกเลิกต้องมีเหตุผล');
  perform qctest.as_user(cnx, 'DEALER_ADMIN', 'CNX');
  perform qctest.must_fail(format('select quote_request_cancel(%s, %L)', rid, 'ZZT'), 'request_not_found', '2) สาขาอื่นยกเลิกไม่ได้');
  perform qctest.as_user(ryg, 'DEALER_ADMIN', 'RYG');
  r := quote_request_cancel(rid, 'ZZT ลูกค้าเลื่อนโครงการ');
  perform qctest.ok(r.status = 'cancelled' and r.cancel_reason = 'ZZT ลูกค้าเลื่อนโครงการ' and r.cancelled_at is not null and r.cancelled_by_name = ชื่อryg,
    '2) สถานะยกเลิกแล้ว + เหตุผล + ชื่อคนยกเลิก + เวลา');
  perform qctest.as_root();
  select a ->> 'text' into ท้าย from leads l, jsonb_array_elements(l.activities) with ordinality e(a, o) where l.dealer_code = 'RYG' and l.num_id = ลีด order by o desc limit 1;
  perform qctest.ok(ท้าย = format('ยกเลิกคำขอราคา %s · เหตุผล: ZZT ลูกค้าเลื่อนโครงการ · โดย %s', เลข, ชื่อryg), '2) ประวัติของลีดมีบรรทัดยกเลิกคำขอ (' || coalesce(ท้าย, 'ไม่มี') || ')');
  perform qctest.must_fail(format('delete from quote_requests where id = %s', rid), 'request_no_delete', '2) คำขอที่ยกเลิกแล้วก็ลบไม่ได้');
  perform qctest.as_user(ryg, 'DEALER_ADMIN', 'RYG');
  perform qctest.must_fail(format('select quote_request_cancel(%s, %L)', rid, 'ซ้ำ'), 'request_locked', '2) ยกเลิกซ้ำไม่ได้');

  -- 3) กล่องคำขอ HQ
  perform qctest.as_user(hq, 'SUPER_ADMIN', null);
  บอร์ด := hq_quote_board('cancelled', เลข);
  perform qctest.ok((บอร์ด -> 'counts' ->> 'cancelled')::int = 1 and (บอร์ด -> 'counts' ->> 'todo')::int = 0
    and (select e ->> 'cancel_reason' = 'ZZT ลูกค้าเลื่อนโครงการ' and e ->> 'cancelled_by_name' = ชื่อryg and e ->> 'cancelled_at' is not null and e ? 'supersedes_id'
           from jsonb_array_elements(บอร์ด -> 'rows') e where (e ->> 'id')::bigint = rid), '3) กลุ่มยกเลิกแล้วมีคำขอนี้ + เหตุผล/ชื่อ/เวลา · ไม่นับเป็นต้องตีราคา');
  perform qctest.ok(exists (select 1 from jsonb_array_elements(hq_quote_board('closed', เลข) -> 'rows') e where (e ->> 'id')::bigint = rid), '3) กลุ่มปิด/ยกเลิกยังมีคำขอนี้');
  perform qctest.ok(jsonb_array_length(hq_quote_board('todo', เลข) -> 'rows') = 0, '3) ไม่อยู่ในกลุ่มต้องตีราคา');

  -- 4) กดยกเลิกฟอร์มขอราคา (ยังไม่ส่ง)
  perform qctest.as_user(ryg, 'DEALER_ADMIN', 'RYG');
  perform lead_quote_request_abandoned(ลีด);
  perform qctest.as_root();
  select a ->> 'text' into ท้าย from leads l, jsonb_array_elements(l.activities) with ordinality e(a, o) where l.dealer_code = 'RYG' and l.num_id = ลีด order by o desc limit 1;
  perform qctest.ok(ท้าย = 'เริ่มขอราคาแล้วยกเลิก · โดย ' || ชื่อryg, '4) ประวัติของลีดมี "เริ่มขอราคาแล้วยกเลิก" + ใคร');
  perform qctest.as_user(cnx, 'DEALER_ADMIN', 'CNX');
  perform qctest.must_fail(format('select lead_quote_request_abandoned(%s)', ลีด), 'lead_not_found', '4) ลีดของสาขาอื่น = ไม่พบ');

  -- 5) ร่างใบ HQ + ไฟล์แนบ แล้วดีลเลอร์ยกเลิก
  perform qctest.as_root();
  insert into quote_requests (request_no, dealer_code, lead_num_id, due_at, product, status) values (เลข || '-B', 'RYG', ลีด, now() + interval '14 days', 'ZZT ร่างมีไฟล์', 'pricing')
  returning id into rid2;
  insert into hq_quotes (request_id, version, quote_no, status, line_items, total_cost, valid_until)
  values (rid2, 1, 'ZZT-QC-HQ-' || rid2, 'draft', '[{"name":"ZZT โครง","qty":1,"unit":"งาน","unitCost":1000}]', 1000, current_date + 30) returning id into hid;
  insert into quote_files (request_id, dealer_code, side, hq_quote_id, object_name, display_name, declared_size, status)
  values (rid2, 'RYG', 'hq', hid, 'zzt-qc-' || hid || '.pdf', 'ZZT แบบ.pdf', 10, 'ready');
  perform qctest.as_user(ryg, 'DEALER_ADMIN', 'RYG');
  r := quote_request_cancel(rid2, 'ZZT ยกเลิกตอนมีร่าง');
  perform qctest.ok(r.status = 'cancelled', '5) มีร่าง + ไฟล์แนบ = ยกเลิกสำเร็จ');
  perform qctest.as_root();
  perform qctest.ok(exists (select 1 from hq_quotes where id = hid and status = 'draft') and exists (select 1 from quote_files where hq_quote_id = hid),
    '5) ร่างใบ HQ และไฟล์แนบยังอยู่ (ดูย้อนได้)');
  perform qctest.as_user(hq, 'SUPER_ADMIN', null);
  perform qctest.must_fail(format('select hq_quote_send(%s)', rid2), 'request_stage', '5) HQ ส่งร่างของคำขอที่ยกเลิกไม่ได้');
  perform qctest.must_fail(format('select hq_quote_save(%s, %L::jsonb, current_date + 30, %L)', rid2, '[{"name":"ก","qty":1,"unit":"งาน","unitCost":1}]', ''), 'request_stage', '5) HQ แก้ร่างของคำขอที่ยกเลิกไม่ได้');
  perform qctest.ok(exists (select 1 from jsonb_array_elements(hq_quote_board('cancelled', เลข || '-B') -> 'rows') e where (e ->> 'id')::bigint = rid2 and e ->> 'hq_status' = 'draft'),
    '5) HQ เปิดดูร่างได้จากคำขอที่ยกเลิก (กลุ่มยกเลิกแล้ว)');

  -- 1) ชุดล้างข้อมูลทดสอบ: ตั้งสวิตช์แล้วลบได้
  perform qctest.as_root();
  perform set_config('pms.quote_request_delete', 'test', true);
  delete from quote_request_events where request_id = rid;
  delete from quote_requests where id = rid;
  perform set_config('pms.quote_request_delete', '', true);
  perform qctest.ok(not exists (select 1 from quote_requests where id = rid), '1) ชุดล้างทดสอบ (สวิตช์ test) ลบได้');
end $$;

select 'ALL PASS' as result;
rollback;
