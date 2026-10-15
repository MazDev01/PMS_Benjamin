-- ── ด่าน 4: ใบค่าแฟรนไชส์ — ส่งแล้วแก้ไม่ได้ ต้องทำเวอร์ชันใหม่ · ปฏิเสธ/หมดอายุ → ปิดพร้อมเหตุผล (FLOW ช่วงที่ 1) ──────
--   ข้อตกลงกับบอส 15 ต.ค. 69: ใบค่าแฟรนไชส์แยกจากระบบใบ HQ ใช้ร่วมแค่หลัก "ส่งแล้วแก้ไม่ได้ ต้องทำเวอร์ชันใหม่" เป็นกฎของตัวเอง
--   ทุกข้อบังคับที่ฐาน (ไม่พึ่งหน้าจอ)
-- รัน: docker exec -i <คอนเทนเนอร์ฐานทดสอบ> psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/franchise_proposal_rules.sql
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
    'user_role', 'SUPER_ADMIN', 'dealer_code', '', 'email', 'hq@test')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function flowtest.as_dealer(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated',
    'user_role', 'DEALER_ADMIN', 'dealer_code', 'CNX', 'email', 'cnx@test')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function flowtest.as_root() returns void language plpgsql as $$
begin perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '', true); end $$;
grant usage on schema flowtest to authenticated;
grant execute on all functions in schema flowtest to authenticated;

do $$
declare
  hq  uuid := (select id from profiles where role = 'SUPER_ADMIN' limit 1);
  cnx uuid := (select id from profiles where role = 'DEALER_ADMIN' and dealer_code = 'CNX' limit 1);
  pid bigint; p1 dealer_package_proposals; p2 dealer_package_proposals; p3 dealer_package_proposals; x dealer_package_proposals; n int;
begin
  perform flowtest.ok(hq is not null and cnx is not null, 'มีบัญชี HQ และดีลเลอร์ตั้งต้น');
  perform flowtest.as_hq(hq);
  insert into dealer_prospects (name, province, status) values ('ZZFP ผู้สนใจทดสอบ', 'ระยอง', 'meeting') returning id into pid;
  insert into dealer_package_proposals (prospect_id, package, amount, terms, valid_until, contract_months, annual_target)
  values (pid, 'standard', 500000, 'เงื่อนไขเดิม', current_date + 30, 12, 12000000) returning * into p1;
  perform flowtest.ok(p1.version = 1 and p1.supersedes_id is null, 'ใบแรก = เวอร์ชัน 1');
  perform flowtest.must_fail(format($q$insert into dealer_package_proposals (prospect_id, package, status) values (%s, 'standard', 'accepted')$q$, pid), 'proposal_status', 'สร้างใบเป็นตอบรับตั้งแต่ต้นไม่ได้ (ข้ามขั้น)');
  perform flowtest.must_fail(format($q$insert into dealer_package_proposals (prospect_id, package, status, supersedes_id) values (%s, 'standard', 'sent', %s)$q$, pid, p1.id), 'proposal_', 'สร้างเวอร์ชันใหม่ที่ไม่ใช่ร่างไม่ได้');

  -- ── ร่างแก้ได้ · ส่งแล้วแก้ไม่ได้ ──
  update dealer_package_proposals set amount = 550000 where id = p1.id;
  update dealer_package_proposals set status = 'sent' where id = p1.id;
  perform flowtest.must_fail(format('update dealer_package_proposals set amount = 1 where id = %s', p1.id), 'proposal_locked', 'ส่งแล้วแก้ยอดไม่ได้');
  perform flowtest.must_fail(format('update dealer_package_proposals set annual_target = 1 where id = %s', p1.id), 'proposal_locked', 'ส่งแล้วแก้เป้ายอดซื้อไม่ได้');
  perform flowtest.must_fail(format('update dealer_package_proposals set contract_months = 1 where id = %s', p1.id), 'proposal_locked', 'ส่งแล้วแก้ระยะสัญญาไม่ได้');
  perform flowtest.must_fail(format('update dealer_package_proposals set note = %L where id = %s', 'แก้หมายเหตุ', p1.id), 'proposal_locked', 'ส่งแล้วแก้หมายเหตุไม่ได้');

  -- ── ทำเวอร์ชันใหม่ ──
  p2 := dealer_proposal_new_version(p1.id);
  perform flowtest.ok(p2.version = 2 and p2.supersedes_id = p1.id and p2.status = 'draft', 'เวอร์ชันใหม่ = ร่าง เวอร์ชัน 2 อ้างใบเดิม');
  perform flowtest.ok(p2.proposal_no = p1.proposal_no || '-V2', 'เลขใบเวอร์ชันใหม่ = เลขเดิม-V2');
  perform flowtest.ok(p2.amount = 550000 and p2.annual_target = 12000000 and p2.terms = 'เงื่อนไขเดิม' and p2.contract_months = 12, 'เวอร์ชันใหม่คัดลอกเนื้อหาใบเดิม');
  perform flowtest.ok((select status from dealer_package_proposals where id = p1.id) = 'sent', 'ยังไม่ส่งเวอร์ชันใหม่ ใบเดิมยังเปิดอยู่');
  perform flowtest.must_fail(format('select dealer_proposal_new_version(%s)', p1.id), 'proposal_draft_exists', 'มีร่างเวอร์ชันใหม่ค้างอยู่แล้ว ทำซ้ำไม่ได้');
  update dealer_package_proposals set amount = 480000 where id = p2.id;
  update dealer_package_proposals set status = 'sent' where id = p2.id;
  select * into x from dealer_package_proposals where id = p1.id;
  perform flowtest.ok(x.status = 'superseded' and x.amount = 550000, 'ส่งเวอร์ชันใหม่แล้ว ใบเดิม = ถูกแทนด้วยเวอร์ชันใหม่ (เนื้อหาเดิมไม่เปลี่ยน)');
  perform flowtest.must_fail(format('update dealer_package_proposals set status = %L where id = %s', 'accepted', p1.id), 'proposal_status', 'ใบที่ถูกแทนแล้ว ตอบรับไม่ได้');
  perform flowtest.must_fail(format('select dealer_proposal_new_version(%s)', p1.id), 'proposal_not_latest', 'ทำเวอร์ชันใหม่จากใบที่ถูกแทนแล้วไม่ได้');
  perform flowtest.must_fail(format('update dealer_package_proposals set status = %L where id = %s', 'superseded', p2.id), 'proposal_status', 'ตั้ง "ถูกแทน" เองไม่ได้');

  -- ── ปฏิเสธต้องมีเหตุผล ──
  perform flowtest.must_fail(format('update dealer_package_proposals set status = %L where id = %s', 'rejected', p2.id), 'proposal_close_reason', 'ปฏิเสธโดยไม่มีเหตุผลไม่ได้');
  perform flowtest.must_fail(format('update dealer_package_proposals set status = %L, close_reason = %L where id = %s', 'rejected', '   ', p2.id), 'proposal_close_reason', 'ปฏิเสธด้วยเหตุผลว่างไม่ได้');
  update dealer_package_proposals set status = 'rejected', close_reason = 'ผู้สนใจขอเลื่อนไปปีหน้า' where id = p2.id;
  select * into x from dealer_package_proposals where id = p2.id;
  perform flowtest.ok(x.status = 'rejected' and x.close_reason = 'ผู้สนใจขอเลื่อนไปปีหน้า' and x.closed_at is not null, 'ปฏิเสธแล้ว: เก็บเหตุผล + เวลาปิด');
  perform flowtest.must_fail(format('update dealer_package_proposals set close_reason = %L where id = %s', 'แก้เหตุผล', p2.id), 'proposal_locked', 'ปิดแล้วแก้เหตุผลไม่ได้');
  -- ปฏิเสธแล้วทำเวอร์ชันใหม่ได้ (เจรจาต่อ)
  p3 := dealer_proposal_new_version(p2.id);
  perform flowtest.ok(p3.version = 3 and p3.supersedes_id = p2.id and p3.proposal_no = p1.proposal_no || '-V3', 'ใบที่ปฏิเสธแล้วทำเวอร์ชัน 3 ต่อได้');
  update dealer_package_proposals set status = 'sent' where id = p3.id;
  perform flowtest.ok((select status from dealer_package_proposals where id = p2.id) = 'rejected', 'ส่งเวอร์ชันใหม่ ใบที่ปฏิเสธแล้วคงเป็นปฏิเสธ');

  -- ── หมดอายุ → ปิดพร้อมเหตุผล (งานตั้งเวลา) · หมดอายุแล้วตอบรับไม่ได้ ──
  perform flowtest.as_root();
  alter table dealer_package_proposals disable trigger dealer_package_proposals_before_write;
  update dealer_package_proposals set valid_until = current_date - 1, proposed_date = current_date - 40 where id = p3.id;
  alter table dealer_package_proposals enable trigger dealer_package_proposals_before_write;
  perform flowtest.as_hq(hq);
  perform flowtest.must_fail(format('update dealer_package_proposals set status = %L where id = %s', 'accepted', p3.id), 'proposal_expired', 'เลยวันยืนราคาแล้ว ตอบรับไม่ได้');
  perform flowtest.as_root();
  n := expire_dealer_proposals();
  select * into x from dealer_package_proposals where id = p3.id;
  perform flowtest.ok(n >= 1 and x.status = 'expired' and x.close_reason like 'หมดอายุ%' and x.closed_at is not null, 'งานตั้งเวลาปิดใบที่เลยวันยืนราคา พร้อมเหตุผล');
  perform flowtest.must_fail(format('update dealer_package_proposals set status = %L where id = %s', 'sent', p3.id), 'proposal_status', 'ใบหมดอายุกลับไปส่งใหม่ไม่ได้ (ต้องทำเวอร์ชันใหม่)');
  perform flowtest.ok(exists (select 1 from cron.job where command like '%expire_dealer_proposals%'), 'มีงานตั้งเวลาปิดใบหมดอายุ');

  -- ── สิทธิ์: ดีลเลอร์ทำเวอร์ชันใหม่/อ่านไม่ได้ · ลบได้เฉพาะร่าง ──
  perform flowtest.as_dealer(cnx);
  perform flowtest.must_fail(format('select dealer_proposal_new_version(%s)', p3.id), 'forbidden', 'ดีลเลอร์ทำเวอร์ชันใหม่ไม่ได้');
  perform flowtest.ok((select count(*) from dealer_package_proposals where prospect_id = pid) = 0, 'ดีลเลอร์มองไม่เห็นใบค่าแฟรนไชส์');
  perform flowtest.as_hq(hq);
  perform flowtest.must_fail(format('delete from dealer_package_proposals where id = %s', p1.id), 'proposal_locked', 'ใบที่ถูกแทนแล้วลบไม่ได้ (เก็บเป็นหลักฐาน)');
end $$;

\echo 'ALL PASS'
rollback;
