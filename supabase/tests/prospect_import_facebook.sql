-- ── ข้อทดสอบใบ 0292: นำเข้าไฟล์ลีด Facebook ผ่านคำสั่งนำเข้าเดิม (บอสสั่ง 20 พ.ย. 69) — ข้อมูลปลอมทั้งหมด (000-000-NNNN) ─────────
--   1) follow_up_today = นัดติดตามวันนี้ (เวลาไทย) · entered_at = created_at วันนั้น 09:00 · ไม่สร้างบันทึกการติดต่อ · ติดต่อล่าสุดว่าง · อีเมลเก็บ
--   2) phone_incomplete: เบอร์ไม่ครบ (มีตัวเลข 1–15 หลัก · บอส 20 พ.ย. 69 "ลงทั้งหมด") นำเข้าได้ เก็บตัวเลขตามที่มี ไม่จัดรูป (รวม 9 หลักมือถือขาดตัว) · ไม่มีตัวเลขเลย = ข้าม · ไม่ส่งคีย์ = เบอร์ไม่ครบข้ามเหมือนเดิม
--   3) ซ้ำที่ฐาน: ในไฟล์ / กับที่มีอยู่ / ชุดที่สอง (กดซ้ำ · สองแท็บ) = ข้าม ไม่สร้างซ้ำ
--   4) entered_at ผิดรูปแบบ / ไม่มีจริง / เกินวันนี้ = ปฏิเสธทั้งชุด · follow_up_today กับขั้นไม่สำเร็จ = ปฏิเสธ
--   5) ไม่ส่งคีย์ใหม่ = เหมือนใบ 0277 (นัดติดตามว่าง · created_at = ตอนนำเข้า)
--   ตกบนฐานก่อนใบ 0292: นัดติดตามว่างทุกแถว · เบอร์ไม่ครบถูกข้าม · entered_at/email ถูกทิ้ง
-- รัน: docker exec -i <คอนเทนเนอร์ฐานทดสอบ> psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 < supabase/tests/prospect_import_facebook.sql
begin;
create schema pftest;
create function pftest.ok(p_cond boolean, p_what text) returns void language plpgsql as $$
begin if p_cond is not true then raise exception 'FAIL: %', p_what; end if; raise notice 'ok  %', p_what; end $$;
create function pftest.must_fail(p_sql text, p_like text, p_what text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if sqlerrm ilike '%' || p_like || '%' then raise notice 'ok  % (ถูกปฏิเสธ: %)', p_what, sqlerrm; return; end if;
    raise exception 'FAIL: % — ถูกปฏิเสธแต่ข้อความไม่ตรง: %', p_what, sqlerrm;
  end;
  raise exception 'FAIL: % — ควรถูกปฏิเสธแต่ผ่าน', p_what;
end $$;
create function pftest.as_hq() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-0000000a7201', 'role', 'authenticated',
    'user_role', 'SUPER_ADMIN', 'dealer_code', '', 'email', 'zzpf@example.test')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function pftest.as_admin() returns void language plpgsql as $$
begin perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '', true); end $$;
grant usage on schema pftest to authenticated;
grant execute on all functions in schema pftest to authenticated;

set local session_replication_role = replica;
insert into auth.users (id, email, aud, role) values ('00000000-0000-4000-8000-0000000a7201', 'zzpf-hq@example.test', 'authenticated', 'authenticated');
insert into profiles (id, role, dealer_code, name, status) values ('00000000-0000-4000-8000-0000000a7201', 'SUPER_ADMIN', '', 'ZZPF ผู้ดูแล', 'active');
insert into dealer_prospects (name, phone, status) values ('ZZTEST-FB-มีอยู่แล้ว', '000-000-8299', 'new');
set local session_replication_role = origin;

do $$
declare r jsonb; p dealer_prospects; วันนี้ date := (now() at time zone 'Asia/Bangkok')::date;
  ไฟล์ text := format('ZZTEST-FB-ไฟล์ปลอม-%s.xlsx', txid_current());
begin
  perform pftest.as_hq();
  r := public.hq_prospects_import(ไฟล์, jsonb_build_array(
    jsonb_build_object('row', '10.26:2', 'name', 'ZZTEST-FB-หนึ่ง', 'phone', '0000008201', 'email', 'zzfb1@example.test', 'province', 'ขอนแก่น',
      'channel', 'Facebook', 'status', 'new', 'note', 'โฆษณา: ZZ แคมเปญตัวแทน · จังหวัดในไฟล์: ขอนแก่นครับ',
      'follow_up_today', true, 'entered_at', to_char(วันนี้ - 20, 'YYYY-MM-DD')),
    jsonb_build_object('row', '10.26:3', 'name', 'ZZTEST-FB-ไม่ครบ', 'phone', '0000082', 'channel', 'Facebook', 'status', 'new',
      'follow_up_today', true, 'phone_incomplete', true, 'entered_at', to_char(วันนี้ - 3, 'YYYY-MM-DD')),
    jsonb_build_object('row', '10.26:4', 'name', 'ZZTEST-FB-สั้นมาก', 'phone', '0000', 'status', 'new', 'follow_up_today', true, 'phone_incomplete', true),
    jsonb_build_object('row', '10.26:5', 'name', 'ZZTEST-FB-มือถือขาดตัว', 'phone', '000008213', 'status', 'new', 'follow_up_today', true, 'phone_incomplete', true),
    jsonb_build_object('row', '10.26:6', 'name', 'ZZTEST-FB-ไม่มีเบอร์', 'phone', 'ไม่ให้เบอร์', 'status', 'new', 'follow_up_today', true, 'phone_incomplete', true),
    jsonb_build_object('row', '11.26:2', 'name', 'ZZTEST-FB-ซ้ำในไฟล์', 'phone', '000-000-8201', 'status', 'new', 'follow_up_today', true),
    jsonb_build_object('row', '11.26:3', 'name', 'ZZTEST-FB-ซ้ำของเดิม', 'phone', '0000008299', 'status', 'new', 'follow_up_today', true),
    jsonb_build_object('row', '11.26:4', 'name', 'ZZTEST-FB-ไม่ส่งคีย์', 'phone', '0000083', 'status', 'new')));
  perform pftest.as_admin();
  perform pftest.ok((r->>'inserted')::int = 4, '1) นำเข้า 4 ราย (หนึ่ง · ไม่ครบ · สั้นมาก · มือถือขาดตัว)');
  perform pftest.ok(jsonb_array_length(r->'skipped') = 4, '2-3) ข้าม 4 แถว: ไม่มีเบอร์ · ซ้ำในไฟล์ · ซ้ำของเดิม · ไม่ส่งคีย์เบอร์ไม่ครบ');
  perform pftest.ok(exists (select 1 from jsonb_array_elements(r->'skipped') x where x->>'row' = '11.26:2' and x->>'reason' = 'เบอร์ซ้ำกับแถวก่อนหน้าในไฟล์'), '3) ซ้ำในไฟล์');
  perform pftest.ok(exists (select 1 from jsonb_array_elements(r->'skipped') x where x->>'row' = '11.26:3' and x->>'reason' = 'เบอร์นี้มีผู้สนใจอยู่แล้ว'), '3) ซ้ำกับที่มีอยู่');
  perform pftest.ok(exists (select 1 from jsonb_array_elements(r->'skipped') x where x->>'row' = '10.26:6' and x->>'reason' = 'ไม่มีเบอร์โทรที่ถูกต้อง'), '2) ไม่มีตัวเลขเบอร์เลย = ข้าม');
  perform pftest.ok(exists (select 1 from jsonb_array_elements(r->'skipped') x where x->>'row' = '11.26:4' and x->>'reason' = 'ไม่มีเบอร์โทรที่ถูกต้อง'), '5) ไม่ส่ง phone_incomplete = เบอร์ไม่ครบข้ามเหมือนเดิม');

  select * into p from dealer_prospects where name = 'ZZTEST-FB-หนึ่ง';
  perform pftest.ok(p.follow_up = วันนี้ and p.status = 'new', '1) นัดติดตาม = วันนี้ · ขั้นรอติดต่อ');
  perform pftest.ok(p.created_at = ((วันนี้ - 20)::timestamp + interval '9 hours') at time zone 'Asia/Bangkok', '1) created_at = วันที่ลูกค้าทิ้งเบอร์ 09:00');
  -- ใบ 0293 (บอสเลือก 23 พ.ย. 69): วันที่ลูกค้าทิ้งเบอร์ = ติดต่อล่าสุดด้วย · ไม่มีบันทึกการติดต่อ (ข้อถัดไป) · วันเริ่มยังว่าง
  perform pftest.ok(p.last_contact_at = p.created_at and p.first_contact is null, '1) ติดต่อล่าสุด = วันที่ลูกค้าทิ้งเบอร์ · วันเริ่มว่าง');
  perform pftest.ok(not exists (select 1 from dealer_prospect_activities a where a.prospect_id = p.id and a.kind = 'contact'), '1) ไม่สร้างบันทึกการติดต่อ');
  perform pftest.ok(p.email = 'zzfb1@example.test' and p.channel = 'Facebook' and p.phone = '000-000-8201' and p.province = 'ขอนแก่น', '1) อีเมล · แหล่งที่มา · เบอร์จัดรูป · จังหวัด');
  select * into p from dealer_prospects where name = 'ZZTEST-FB-ไม่ครบ';
  perform pftest.ok(p.phone = '0000082' and p.follow_up = วันนี้, '2) เบอร์ไม่ครบเก็บตัวเลขตามที่มี + นัดวันนี้');
  perform pftest.ok((select phone from dealer_prospects where name = 'ZZTEST-FB-สั้นมาก') = '0000', '2) สั้นมาก (4 หลัก) ยังนำเข้า · ตัวเลขตามที่มี');
  perform pftest.ok((select phone from dealer_prospects where name = 'ZZTEST-FB-มือถือขาดตัว') = '000008213', '2) 9 หลักที่ไม่ครบ = ไม่จัดรูปเป็นเบอร์บ้าน');

  -- 3) ชุดที่สอง (กดซ้ำ/สองแท็บ) ด้วยไฟล์เดียวกัน = ข้ามทั้งหมด ไม่สร้างซ้ำ
  perform pftest.as_hq();
  r := public.hq_prospects_import(ไฟล์, jsonb_build_array(
    jsonb_build_object('row', '10.26:2', 'name', 'ZZTEST-FB-หนึ่ง', 'phone', '0000008201', 'status', 'new', 'follow_up_today', true),
    jsonb_build_object('row', '10.26:3', 'name', 'ZZTEST-FB-ไม่ครบ', 'phone', '0000082', 'status', 'new', 'follow_up_today', true, 'phone_incomplete', true)));
  perform pftest.as_admin();
  perform pftest.ok((r->>'inserted')::int = 0 and jsonb_array_length(r->'skipped') = 2, '3) นำเข้าซ้ำทั้งชุด = ข้ามทั้งหมด');
  perform pftest.ok((select count(*) from dealer_prospects where name like 'ZZTEST-FB-หนึ่ง%' or name = 'ZZTEST-FB-ไม่ครบ') = 2, '3) ไม่มีรายซ้ำในตาราง');

  -- 4) ปฏิเสธทั้งชุด
  perform pftest.as_hq();
  perform pftest.must_fail($q$select public.hq_prospects_import('ZZTEST-FB-ผิด', '[{"name":"ZZTEST-FB-x","phone":"0000008211","entered_at":"20/10/2026"}]')$q$, 'import_entered_at', '4) entered_at ผิดรูปแบบ');
  perform pftest.must_fail($q$select public.hq_prospects_import('ZZTEST-FB-ผิด', '[{"name":"ZZTEST-FB-x","phone":"0000008211","entered_at":"2026-02-30"}]')$q$, 'import_entered_at', '4) entered_at ไม่มีจริง');
  perform pftest.must_fail(format($q$select public.hq_prospects_import('ZZTEST-FB-ผิด', '[{"name":"ZZTEST-FB-x","phone":"0000008211","entered_at":"%s"}]')$q$, to_char(วันนี้ + 1, 'YYYY-MM-DD')), 'import_entered_at', '4) entered_at เกินวันนี้');
  perform pftest.must_fail($q$select public.hq_prospects_import('ZZTEST-FB-ผิด', '[{"name":"ZZTEST-FB-x","phone":"0000008211","status":"lost","lost_reason":"ยังไม่พร้อม","follow_up_today":true}]')$q$, 'import_follow_up', '4) ไม่สำเร็จ + นัดวันนี้');
  perform pftest.as_admin();
  perform pftest.ok(not exists (select 1 from dealer_prospects where phone = '000-000-8211'), '4) ชุดที่ถูกปฏิเสธไม่บันทึกแถวใด');

  -- 5) ไม่ส่งคีย์ใหม่ = เหมือนเดิม (นัดติดตามว่าง · created_at = ตอนนำเข้า)
  perform pftest.as_hq();
  r := public.hq_prospects_import(ไฟล์ || '-เดิม', '[{"name":"ZZTEST-FB-แบบเดิม","phone":"0000008212","status":"new"}]');
  perform pftest.as_admin();
  select * into p from dealer_prospects where name = 'ZZTEST-FB-แบบเดิม';
  perform pftest.ok(p.follow_up is null and p.created_at = now() and p.email is null, '5) ไม่ส่งคีย์ใหม่ = นัดติดตามว่าง · created_at ตอนนำเข้า · อีเมลว่าง');
end $$;

-- ── 6) ใบ 0293: entered_at วันเวลา (ซีเรียลจาก Google Sheets ที่หน้าเว็บแปลงแล้ว · ข้อความ · ISO) → created_at + ติดต่อล่าสุด ตรงวันเวลา ──
--      ไม่สร้างบันทึกการติดต่อ · ยกเลิกทั้งชุดได้ (ติดต่อล่าสุดไม่นับว่าถูกแตะ) · รูปแบบผิด/เกินวันนี้ = ปฏิเสธ
do $$
declare r jsonb; b bigint; วันนี้ date := (now() at time zone 'Asia/Bangkok')::date;
  ก date := (now() at time zone 'Asia/Bangkok')::date - 26; ข date := (now() at time zone 'Asia/Bangkok')::date - 30;
  ไฟล์ text := format('ZZTEST-FB-วันเวลา-%s.xlsx', txid_current()); p dealer_prospects;
begin
  perform pftest.as_hq();
  r := public.hq_prospects_import(ไฟล์, jsonb_build_array(
    jsonb_build_object('row', 's:2', 'name', 'ZZTEST-FB-เวลาไทย', 'phone', '0000008231', 'status', 'new', 'follow_up_today', true, 'entered_at', to_char(ก, 'YYYY-MM-DD') || 'T20:23:54+07:00'),
    jsonb_build_object('row', 's:3', 'name', 'ZZTEST-FB-ข้อความ', 'phone', '0000008232', 'status', 'new', 'follow_up_today', true, 'entered_at', to_char(ข, 'YYYY-MM-DD') || ' 02:47:05'),
    jsonb_build_object('row', 's:4', 'name', 'ZZTEST-FB-UTC', 'phone', '0000008233', 'status', 'new', 'follow_up_today', true, 'entered_at', to_char(ข, 'YYYY-MM-DD') || 'T23:30:00Z')));
  b := (r->>'batch')::bigint;
  perform pftest.as_admin();
  perform pftest.ok((r->>'inserted')::int = 3, '6) นำเข้า 3 ราย (วันเวลา 3 รูปแบบ)');
  select * into p from dealer_prospects where name = 'ZZTEST-FB-เวลาไทย';
  perform pftest.ok(p.created_at = (ก + time '20:23:54') at time zone 'Asia/Bangkok' and p.last_contact_at = p.created_at, '6) +07:00 → created_at/ติดต่อล่าสุด ตรงวันเวลา');
  select * into p from dealer_prospects where name = 'ZZTEST-FB-ข้อความ';
  perform pftest.ok(p.created_at = (ข + time '02:47:05') at time zone 'Asia/Bangkok' and p.last_contact_at = p.created_at, '6) ไม่มีเขตเวลา = เวลาไทย');
  select * into p from dealer_prospects where name = 'ZZTEST-FB-UTC';
  perform pftest.ok(p.created_at = (ข + time '23:30:00') at time zone 'UTC' and (p.created_at at time zone 'Asia/Bangkok')::date = ข + 1, '6) Z = เวลาสากล (วันไทยถัดไป)');
  perform pftest.ok(p.follow_up = วันนี้ and p.status = 'new', '6) นัดติดตามวันนี้ · รอติดต่อ คงเดิม');
  perform pftest.ok(not exists (select 1 from dealer_prospect_activities a join dealer_prospects x on x.id = a.prospect_id
                                where x.import_batch_id = b and a.kind = 'contact'), '6) ไม่สร้างบันทึกการติดต่อ');
  perform pftest.ok(_import_batch_touched(b) = 0, '6) ติดต่อล่าสุดจากไฟล์ไม่นับว่าถูกแตะ');
  perform pftest.as_hq();
  perform pftest.ok((public.hq_prospects_import_cancel(b)->>'deleted')::int = 3, '6) ยกเลิกทั้งชุดได้ (ชุดที่นำเข้าจากชีต)');
  perform pftest.must_fail(format($q$select public.hq_prospects_import('ZZTEST-FB-ผิด', '[{"name":"ZZTEST-FB-x","phone":"0000008239","entered_at":"%s 25:00"}]')$q$, to_char(ก, 'YYYY-MM-DD')), 'import_entered_at', '6) เวลาผิด = ปฏิเสธ');
  perform pftest.must_fail(format($q$select public.hq_prospects_import('ZZTEST-FB-ผิด', '[{"name":"ZZTEST-FB-x","phone":"0000008239","entered_at":"%sT01:00:00+07:00"}]')$q$, to_char(วันนี้ + 1, 'YYYY-MM-DD')), 'import_entered_at', '6) วันเวลาเกินวันนี้ = ปฏิเสธ');
  perform pftest.as_admin();
end $$;

select 'ALL PASS' as result;
rollback;
