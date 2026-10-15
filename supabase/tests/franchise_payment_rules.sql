-- ── ด่าน 4: ตกลง + ชำระ → แปลงเป็นดีลเลอร์ (ข้อตัดสินของบอส 15 ต.ค. 69) ───────────────────────────────────────────
--   บันทึกการชำระได้หลายครั้ง (วันที่ · ยอด > 0 · เลขอ้างอิง) เฉพาะ HQ · แก้/ลบไม่ได้ ผิดให้ยกเลิกพร้อมเหตุผลแล้วบันทึกใหม่
--   แปลงเป็นดีลเลอร์ได้เมื่อ ใบตอบรับ + ยอดชำระรวม (ไม่นับที่ยกเลิก) ≥ ยอดในใบ — บังคับที่ฐาน (ตอนเพิ่มแถวดีลเลอร์ที่ผูกผู้สนใจ)
-- รัน: docker exec -i <คอนเทนเนอร์ฐานทดสอบ> psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/franchise_payment_rules.sql
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
  pid bigint; p dealer_package_proposals; pay1 bigint; pay2 bigint; x record; n int;
  เพิ่มสาขา text;
begin
  perform flowtest.ok(hq is not null and cnx is not null, 'มีบัญชี HQ และดีลเลอร์ตั้งต้น');
  perform flowtest.as_hq(hq);
  insert into dealer_prospects (name, province, status) values ('ZZFPAY ผู้สนใจทดสอบ', 'ตราด', 'considering') returning id into pid;
  insert into dealer_package_proposals (prospect_id, package, amount, valid_until, status)
  values (pid, 'standard', 300000, current_date + 30, 'sent') returning * into p;
  เพิ่มสาขา := format($q$insert into dealers (code, name, province, region, revenue_target, status, prospect_id)
                       values ('ZZPAY', 'ZZTEST สาขาชำระ', 'ตราด', 'ตะวันออก', 0, 'active', %s)$q$, pid);

  -- ── บันทึกการชำระได้เฉพาะใบที่ตอบรับ ──
  perform flowtest.must_fail(format($q$insert into dealer_proposal_payments (proposal_id, paid_on, amount, reference) values (%s, current_date, 100000, 'TR-1')$q$, p.id),
    'payment_not_accepted', 'ใบยังไม่ตอบรับ บันทึกการชำระไม่ได้');
  perform flowtest.as_root(); perform flowtest.must_fail(เพิ่มสาขา, 'conversion_not_ready', 'ใบยังไม่ตอบรับ → แปลงเป็นดีลเลอร์ไม่ได้'); perform flowtest.as_hq(hq);
  update dealer_package_proposals set status = 'accepted' where id = p.id;

  -- ── ข้อมูลการชำระต้องครบ ──
  perform flowtest.must_fail(format($q$insert into dealer_proposal_payments (proposal_id, paid_on, amount, reference) values (%s, current_date, 0, 'TR-0')$q$, p.id), 'amount', 'ยอด 0 ไม่ได้');
  perform flowtest.must_fail(format($q$insert into dealer_proposal_payments (proposal_id, paid_on, amount, reference) values (%s, current_date, -5, 'TR-0')$q$, p.id), 'amount', 'ยอดติดลบไม่ได้');
  perform flowtest.must_fail(format($q$insert into dealer_proposal_payments (proposal_id, paid_on, amount, reference) values (%s, current_date, 100, '  ')$q$, p.id), 'reference', 'ไม่มีเลขอ้างอิงไม่ได้');

  -- ── ชำระ 1 งวดไม่ครบ → แปลงไม่ได้ ──
  insert into dealer_proposal_payments (proposal_id, paid_on, amount, reference) values (p.id, current_date, 200000, 'TR-1') returning id into pay1;
  perform flowtest.ok(dealer_proposal_paid_total(p.id) = 200000, 'ยอดชำระรวม 200,000');
  perform flowtest.ok(dealer_conversion_ready(pid) like '%ยังชำระไม่ครบ%', 'ตรวจความพร้อม: บอกว่ายังชำระไม่ครบ');
  perform flowtest.as_root(); perform flowtest.must_fail(เพิ่มสาขา, 'conversion_not_ready', 'ชำระ 1 งวดไม่ครบ → แปลงเป็นดีลเลอร์ไม่ได้'); perform flowtest.as_hq(hq);

  -- ── ชำระงวดที่ 2 ครบ → แปลงได้ (ตรวจในรายการย่อย แล้วย้อน) ──
  insert into dealer_proposal_payments (proposal_id, paid_on, amount, reference) values (p.id, current_date, 100000, 'TR-2') returning id into pay2;
  perform flowtest.ok(dealer_conversion_ready(pid) is null, 'ชำระครบ 300,000: พร้อมแปลง');
  perform flowtest.as_root();
  begin
    execute เพิ่มสาขา;
    perform flowtest.ok(exists (select 1 from dealers where code = 'ZZPAY'), 'ชำระครบ → แปลงเป็นดีลเลอร์ได้');
    raise exception 'ย้อนรายการย่อย';
  exception when others then
    if sqlerrm <> 'ย้อนรายการย่อย' then raise; end if;
  end;
  perform flowtest.as_hq(hq);

  -- ── แก้/ลบไม่ได้ · ยกเลิกต้องมีเหตุผล · ยกเลิกแล้วไม่นับ ──
  perform flowtest.must_fail(format('update dealer_proposal_payments set amount = 1 where id = %s', pay1), 'payment_locked', 'แก้ยอดชำระไม่ได้');
  perform flowtest.must_fail(format('update dealer_proposal_payments set reference = %L where id = %s', 'X', pay1), 'payment_locked', 'แก้เลขอ้างอิงไม่ได้');
  perform flowtest.must_fail(format('delete from dealer_proposal_payments where id = %s', pay1), 'permission denied', 'HQ ลบบันทึกการชำระไม่ได้ (ไม่มีสิทธิ์ลบ)');
  perform flowtest.as_root();
  perform flowtest.must_fail(format('delete from dealer_proposal_payments where id = %s', pay1), 'payment_locked', 'สิทธิ์ระบบลบบันทึกการชำระตรงก็ไม่ได้ (ตัวดัก)');
  perform flowtest.as_hq(hq);
  perform flowtest.must_fail(format('update dealer_proposal_payments set cancel_reason = %L where id = %s', ' ', pay2), 'payment_cancel_reason', 'ยกเลิกโดยไม่มีเหตุผลไม่ได้');
  update dealer_proposal_payments set cancel_reason = 'โอนซ้ำ คืนเงินแล้ว' where id = pay2;
  select * into x from dealer_proposal_payments where id = pay2;
  perform flowtest.ok(x.cancelled_at is not null and x.cancel_reason = 'โอนซ้ำ คืนเงินแล้ว', 'ยกเลิกแล้ว: เก็บเหตุผล + เวลา');
  perform flowtest.must_fail(format('update dealer_proposal_payments set cancel_reason = %L where id = %s', 'แก้เหตุผล', pay2), 'payment_locked', 'ยกเลิกแล้วแก้อีกไม่ได้');
  perform flowtest.ok(dealer_proposal_paid_total(p.id) = 200000, 'ยอดที่ยกเลิกไม่นับ');
  -- ── ยกเลิกงวดหนึ่งจนยอดไม่ครบ → แปลงไม่ได้ ──
  perform flowtest.as_root(); perform flowtest.must_fail(เพิ่มสาขา, 'conversion_not_ready', 'ยกเลิกงวดจนยอดไม่ครบ → แปลงเป็นดีลเลอร์ไม่ได้'); perform flowtest.as_hq(hq);
  -- บันทึกใหม่แทนงวดที่ยกเลิก → ครบอีกครั้ง
  insert into dealer_proposal_payments (proposal_id, paid_on, amount, reference) values (p.id, current_date, 100000, 'TR-3');
  perform flowtest.ok(dealer_conversion_ready(pid) is null, 'บันทึกใหม่แทนงวดที่ยกเลิก: พร้อมแปลงอีกครั้ง');

  -- ── HQ เพิ่มดีลเลอร์ตรงที่ตารางต้องผูกผู้สนใจ (ข้ามด่านชำระไม่ได้) ──
  perform flowtest.must_fail($q$insert into dealers (code, name, province, region, revenue_target, status) values ('ZZPAX', 'ZZTEST ไม่ผูก', 'ตราด', 'ตะวันออก', 0, 'active')$q$,
    'conversion_needs_prospect', 'HQ เพิ่มดีลเลอร์ตรงโดยไม่ผูกผู้สนใจไม่ได้');

  -- ── ดีลเลอร์บันทึก/อ่านการชำระไม่ได้ ──
  perform flowtest.as_dealer(cnx);
  perform flowtest.must_fail(format($q$insert into dealer_proposal_payments (proposal_id, paid_on, amount, reference) values (%s, current_date, 999, 'HACK')$q$, p.id),
    '', 'ดีลเลอร์บันทึกการชำระ → ถูกปฏิเสธ');
  perform flowtest.ok((select count(*) from dealer_proposal_payments) = 0, 'ดีลเลอร์มองไม่เห็นบันทึกการชำระ');
  perform flowtest.ok(dealer_proposal_paid_total(p.id) = 0, 'ดีลเลอร์อ่านยอดชำระรวมของใบไม่ได้ (ได้ 0)');
  perform flowtest.must_fail(format('select dealer_conversion_ready(%s)', pid), 'forbidden', 'ดีลเลอร์ถามความพร้อมแปลงไม่ได้');
  perform flowtest.as_root();
  perform flowtest.ok((select count(*) from dealer_proposal_payments where proposal_id = p.id and reference = 'HACK') = 0, 'ไม่มีบันทึกของดีลเลอร์หลุดเข้าฐาน');
end $$;

\echo 'ALL PASS'
rollback;
