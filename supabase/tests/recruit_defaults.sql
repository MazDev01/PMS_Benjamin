-- ── ข้อทดสอบใบ 0274 (C): ตั้งค่า › หาดีลเลอร์ — ค่าตั้งต้นตาม FLOW H2–H5 (บอสสั่ง 3 พ.ย. 69) ─────────────────────────────
--   1) เหตุผลที่ไม่สำเร็จตั้งต้น 4 ข้อ (+ "อื่น ๆ (ระบุเอง)" ที่ฟอร์ม) — เติมเฉพาะเมื่อรายการว่าง · มีรายการเดิม = ไม่แตะ
--   2) อายุใบค่าแฟรนไชส์ตั้งต้น 7 วัน — เติมเฉพาะเมื่อยังไม่ได้ตั้ง · ตั้งไว้แล้ว = ไม่แตะ · ค่าอื่นในก้อนเดิมอยู่ครบ
--   3) ปฏิเสธ/หมดอายุใบค่าแฟรนไชส์โดยไม่มีเหตุผล = ฐานปฏิเสธ (กติกาเดิมใบ 0207 · คงไว้)
--   ตกบนโค้ดก่อนใบ 0274: ไม่มี _recruit_fill_defaults
-- รัน: docker exec -i <คอนเทนเนอร์ฐานทดสอบ> psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 < supabase/tests/recruit_defaults.sql
begin;
create schema rdtest;
create function rdtest.ok(p_cond boolean, p_what text) returns void language plpgsql as $$
begin if p_cond is not true then raise exception 'FAIL: %', p_what; end if; raise notice 'ok  %', p_what; end $$;
create function rdtest.must_fail(p_sql text, p_like text, p_what text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if sqlerrm ilike '%' || p_like || '%' then raise notice 'ok  % (ถูกปฏิเสธ: %)', p_what, sqlerrm; return; end if;
    raise exception 'FAIL: % — ถูกปฏิเสธแต่ข้อความไม่ตรง: %', p_what, sqlerrm;
  end;
  raise exception 'FAIL: % — ควรถูกปฏิเสธแต่ผ่าน', p_what;
end $$;

do $$
declare c jsonb; pid bigint; pr bigint;
begin
  -- ว่างทั้งก้อน → เติมครบ
  update hq_recruit_settings set config = '{"channels":["Facebook"]}'::jsonb where id = 1;
  perform _recruit_fill_defaults();
  c := (select config from hq_recruit_settings where id = 1);
  perform rdtest.ok(c->'lostReasons' = '["เงินทุนไม่พอ", "ยังไม่พร้อม", "เลือกแบรนด์อื่น", "ทำเลไม่เหมาะ"]'::jsonb, '1) รายการว่าง → เหตุผลตั้งต้น 4 ข้อ');
  perform rdtest.ok((c #>> '{proposal,validityDays}')::int = 7, '2) ยังไม่ได้ตั้งอายุใบ → 7 วัน');
  perform rdtest.ok(c->'channels' = '["Facebook"]'::jsonb, '2) ค่าอื่นในก้อนเดิมอยู่ครบ');

  -- รายการว่างแบบ [] ก็เติม · มีรายการเดิม/ตั้งอายุไว้แล้ว = ไม่แตะ
  update hq_recruit_settings set config = '{"lostReasons":[],"proposal":{"validityDays":30,"terms":"เดิม"}}'::jsonb where id = 1;
  perform _recruit_fill_defaults();
  c := (select config from hq_recruit_settings where id = 1);
  perform rdtest.ok(jsonb_array_length(c->'lostReasons') = 4 and (c #>> '{proposal,validityDays}')::int = 30 and c #>> '{proposal,terms}' = 'เดิม',
                    '1–2) [] = ว่าง → เติมเหตุผล · อายุใบที่ตั้งไว้ 30 วัน คงเดิม');
  update hq_recruit_settings set config = '{"lostReasons":["ย้ายไปทำธุรกิจอื่น"]}'::jsonb where id = 1;
  perform _recruit_fill_defaults();
  perform rdtest.ok((select config->'lostReasons' from hq_recruit_settings where id = 1) = '["ย้ายไปทำธุรกิจอื่น"]'::jsonb, '1) มีรายการเดิม = ไม่แตะ');

  -- ปฏิเสธ/หมดอายุต้องมีเหตุผล (ฐานกัน)
  insert into dealer_prospects (name, province) values ('ZZTEST-ผู้สนใจเหตุผล', 'ตราด') returning id into pid;
  insert into dealer_package_proposals (prospect_id, amount, status, valid_until, proposed_date) values (pid, 10000, 'sent', current_date - 1, current_date - 8) returning id into pr;
  perform rdtest.must_fail(format($q$update public.dealer_package_proposals set status = 'rejected' where id = %s$q$, pr), 'proposal_close_reason', '3) ปฏิเสธโดยไม่มีเหตุผล = ปฏิเสธ');
  perform rdtest.must_fail(format($q$update public.dealer_package_proposals set status = 'expired', close_reason = '  ' where id = %s$q$, pr), 'proposal_close_reason', '3) หมดอายุโดยเหตุผลว่าง = ปฏิเสธ');
  update dealer_package_proposals set status = 'rejected', close_reason = 'เงินทุนไม่พอ' where id = pr;
  perform rdtest.ok((select status from dealer_package_proposals where id = pr) = 'rejected', '3) มีเหตุผล = ปิดได้');
end $$;

select 'ALL PASS' as result;
rollback;
