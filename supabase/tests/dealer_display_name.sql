-- ── ใบ 0281: ข้อความกระดิ่ง/อีเมลถึง HQ ใช้ชื่อดีลเลอร์แทนรหัส · ชื่อซ้ำ = "ชื่อ (รหัส)" เฉพาะคู่ที่ซ้ำ (บอสตอบ 6 พ.ย. 69) ─────────
-- ต้องตกบนฐานก่อนลงใบ (ไม่มี _dealer_display_name · {dealer} = "รหัส ชื่อ") · ผ่านหลังลงใบ · ทรานแซกชันเดียวแล้ว rollback
--   1) ชื่อไม่ซ้ำ = ชื่ออย่างเดียว · ชื่อซ้ำ 2 ราย = "ชื่อ (รหัส)" ทั้งคู่ · ไม่รู้จักรหัส = รหัส · แถว HQ ไม่นับเป็นชื่อซ้ำ
--   2) {dealer} ของแจ้งเตือนคำขอราคา + บรรทัด "ดีลเลอร์:" ในอีเมลถึง HQ = ชื่อแสดง (ไม่มีรหัสนำหน้า)
-- รัน: docker exec -i <คอนเทนเนอร์ฐานทดสอบ> psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/dealer_display_name.sql
begin;
create schema ddtest;
create function ddtest.ok(p_cond boolean, p_what text) returns void language plpgsql as $$
begin if p_cond is not true then raise exception 'FAIL: %', p_what; end if; raise notice 'ok  %', p_what; end $$;

do $$
declare r quote_requests; ชื่อ text; v jsonb; บรรทัด text;
begin
  perform ddtest.ok(to_regprocedure('public._dealer_display_name(text)') is not null, 'มีตัวกลางชื่อแสดงของดีลเลอร์ (ใบ 0281)');
  set local session_replication_role = replica;   -- ดีลเลอร์ทดสอบชั่วคราว (ไม่ให้ตัวดักสร้างบัญชี/แจ้งเตือนตาม)
  insert into dealers (code, name, province) values ('ZZDA', 'ZZT ชื่อซ้ำ', 'ระยอง'), ('ZZDB', ' zzt ชื่อซ้ำ ', 'ระยอง'), ('ZZDC', 'ZZT ชื่อเดียว', 'ระยอง');
  set local session_replication_role = origin;

  -- 1) ชื่อแสดง
  perform ddtest.ok(_dealer_display_name('ZZDA') = 'ZZT ชื่อซ้ำ (ZZDA)' and _dealer_display_name('ZZDB') = 'zzt ชื่อซ้ำ (ZZDB)', '1) ชื่อซ้ำ (ไม่สนตัวพิมพ์/ช่องว่าง) = "ชื่อ (รหัส)" ทั้งคู่');
  perform ddtest.ok(_dealer_display_name('ZZDC') = 'ZZT ชื่อเดียว', '1) ชื่อไม่ซ้ำ = ชื่ออย่างเดียว');
  perform ddtest.ok(_dealer_display_name('ZZ-ไม่มี') = 'ZZ-ไม่มี', '1) ไม่รู้จักรหัส = รหัส (ไม่เดาชื่อ)');
  select name into ชื่อ from dealers where code = 'RYG';
  perform ddtest.ok(_dealer_display_name('RYG') = btrim(ชื่อ), '1) ดีลเลอร์ตั้งต้น RYG = ชื่ออย่างเดียว');

  -- 2) {dealer} ของแจ้งเตือน + บรรทัดอีเมลถึง HQ
  select * into r from quote_requests order by id limit 1;
  if r.id is null then
    set local session_replication_role = replica;
    insert into quote_requests (request_no, dealer_code, lead_num_id, due_at)
    select 'ZZT-DD-1', l.dealer_code, l.num_id, now() + interval '14 days' from leads l where l.dealer_code = 'RYG' order by l.num_id limit 1 returning * into r;
    set local session_replication_role = origin;
  end if;
  r.dealer_code := 'ZZDA';
  v := _quote_request_vars(r);
  perform ddtest.ok(v ->> 'dealer' = 'ZZT ชื่อซ้ำ (ZZDA)', '2) {dealer} แจ้งเตือน = ชื่อแสดง (ชื่อซ้ำมีรหัสในวงเล็บ) · ได้ ' || coalesce(v ->> 'dealer', 'ว่าง'));
  r.dealer_code := 'ZZDC';
  v := _quote_request_vars(r);
  perform ddtest.ok(v ->> 'dealer' = 'ZZT ชื่อเดียว', '2) {dealer} แจ้งเตือน = ชื่ออย่างเดียว ไม่มีรหัสนำหน้า · ได้ ' || coalesce(v ->> 'dealer', 'ว่าง'));
  บรรทัด := _quote_request_mail_lines(r);
  -- ใบ 0285: ขึ้นบรรทัดด้วย LF เท่านั้น ไม่ขึ้นกับขึ้นบรรทัดของไฟล์ใบ (เดิม checkout แบบ CRLF ได้ CR LF → ข้อถัดไปตก)
  perform ddtest.ok(position(chr(13) in บรรทัด) = 0 and (length(บรรทัด) - length(replace(บรรทัด, chr(10), ''))) = 5, '2) อีเมลถึง HQ: 6 บรรทัด ขึ้นบรรทัดด้วย LF ไม่มี CR');
  perform ddtest.ok(บรรทัด like '%ดีลเลอร์: ZZT ชื่อเดียว' || E'\n' || '%' and บรรทัด not like '%ZZDC%', '2) อีเมลถึง HQ: "ดีลเลอร์: ชื่อ" ไม่มีรหัส');
end $$;

select 'ALL PASS' as result;
rollback;
