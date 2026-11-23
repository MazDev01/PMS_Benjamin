-- ── ใบ 0293: นำเข้าผู้สนใจ — วันที่ลูกค้าทิ้งเบอร์รับวันเวลา + ตั้งติดต่อล่าสุด (บอสตัดสิน 23 พ.ย. 69 · แก้บั๊กนำเข้าจาก Google Sheets บนเว็บจริง) ──
-- เหตุ: ชีต Google ที่ created_time เป็นช่องชนิดวันที่ ส่งออก .xlsx เป็นเลขซีเรียล → หน้าเว็บแปลงเป็นวันเวลาไทย (lib/facebookLeadImport.เวลาเฟซบุ๊ก)
--   ส่ง entered_at แบบวันเวลา "YYYY-MM-DDTHH:mm:ss+07:00" — ใบ 0292 รับแค่ YYYY-MM-DD (09:00)
-- เปลี่ยน (คำสั่งเดิม hq_prospects_import(text, jsonb) · สิทธิ์เดิม · ใบ 0292 ลงฐานจริงแล้ว ไม่แก้ใบนั้น):
--   1) entered_at รับ YYYY-MM-DD (09:00 เวลาไทยเหมือนเดิม) · YYYY-MM-DD[T ]HH:mm[:ss] (ไม่มีเขตเวลา = เวลาไทย) · มีเขตเวลา Z/±HH[:MM]
--      ผิดรูปแบบ/ไม่มีจริง/เกินวันนี้ (ตามวันไทย) = ปฏิเสธทั้งชุด · created_at = วันเวลานั้น
--   2) entered_at → ติดต่อล่าสุด (last_contact_at) ด้วย (บอสเลือก) — ไม่สร้างบันทึกการติดต่อ · นัดติดตามวันนี้คงเดิม
--      แถวที่มีวันเริ่ม/วันติดตามในไฟล์ (ไฟล์ทีม) ติดต่อล่าสุด = วันล่าสุดในบันทึก (เหมือนเดิม · ไฟล์ทีมไม่ส่ง entered_at)
--   ไม่ส่ง entered_at = เหมือนใบ 0292 ทุกทาง · ไม่แปลงข้อมูลเก่า (บอสยกเลิกชุดเดิมแล้วนำเข้าใหม่หลังขึ้นเว็บ)
--   ยกเลิกทั้งชุดยังทำได้: ติดต่อล่าสุดไม่ใช่บันทึกการติดต่อ จึงไม่นับว่าถูกแตะ (_import_batch_touched นับจากบันทึก)
-- ข้อทดสอบ: supabase/tests/prospect_import_facebook.sql (ข้อ 6) · หน้าเว็บ prospect-import-facebook.spec

create or replace function public.hq_prospects_import(p_file text, p_rows jsonb) returns jsonb
  language plpgsql security definer set search_path to 'public' as $$
declare
  r jsonb; ชุด bigint; pid bigint; ลำดับ int := 0; เพิ่ม int := 0; แถวที่ text;
  ข้าม jsonb := '[]'::jsonb; เห็นแล้ว text[] := '{}'; เบอร์ text; ชื่อ text; สถานะ text; จังหวัด text; หมายเหตุติดต่อ text; เริ่ม date; ตาม date; วันนี้ date := (now() at time zone 'Asia/Bangkok')::date;
  วันบันทึก date[]; d date; aid bigint;
  ตามวันนี้ boolean; ไม่ครบ boolean; เข้าดิบ text; เข้า timestamptz; แบบเบอร์ text;
begin
  if not can_write_master() then raise exception 'forbidden: นำเข้าผู้สนใจได้เฉพาะผู้ดูแลระบบ/ผู้บริหารสำนักงานใหญ่'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'import_rows: ข้อมูลแถวไม่ถูกต้อง'; end if;
  if jsonb_array_length(p_rows) = 0 then raise exception 'import_rows: ไม่มีแถวให้นำเข้า'; end if;
  if jsonb_array_length(p_rows) > 1000 then raise exception 'import_limit: นำเข้าได้ครั้งละไม่เกิน 1,000 แถว (ส่งมา %)', jsonb_array_length(p_rows); end if;

  perform pg_advisory_xact_lock(hashtext('hq_prospects_import'));   -- สองชุดพร้อมกันไม่สร้างเบอร์ซ้ำ
  insert into prospect_import_batches (file_name, row_count, created_by)
  values (left(btrim(coalesce(p_file, '')), 200), jsonb_array_length(p_rows), audit_actor_name()) returning id into ชุด;
  perform set_config('pms.audit_skip', 'on', true);                 -- บันทึกการใช้งานแถวเดียวต่อชุด (ท้ายคำสั่ง)
  perform set_config('app.prospect_import', 'on', true);            -- บันทึกการติดต่อที่ชุดสร้าง = ติดรหัสชุด (ใบ 0277)

  for r in select * from jsonb_array_elements(p_rows) loop
    ลำดับ := ลำดับ + 1;
    แถวที่ := coalesce(r->>'row', ลำดับ::text);
    เบอร์ := _phone_digits(r->>'phone');
    ชื่อ := btrim(coalesce(r->>'name', ''));
    สถานะ := coalesce(nullif(r->>'status', ''), 'new');
    จังหวัด := nullif(btrim(coalesce(r->>'province', '')), '');
    -- รับเฉพาะ true แบบ boolean ของ JSON (ค่าอื่น/ไม่ส่ง = ทำแบบเดิม)
    ตามวันนี้ := coalesce(r->'follow_up_today' = 'true'::jsonb, false);
    ไม่ครบ := coalesce(r->'phone_incomplete' = 'true'::jsonb, false);
    if ชื่อ = '' then
      ข้าม := ข้าม || jsonb_build_object('row', แถวที่, 'reason', 'ไม่มีชื่อ'); continue;
    end if;
    -- แยกตัวแปรก่อน: plpgsql อ่านเงื่อนไข IF ถึงคำ THEN ตัวแรก (THEN ของ CASE ในเงื่อนไข = ใบพัง)
    แบบเบอร์ := case when ไม่ครบ then '^\d{1,15}$' else '^0\d{8,9}$' end;
    if เบอร์ !~ แบบเบอร์ then
      ข้าม := ข้าม || jsonb_build_object('row', แถวที่, 'reason', 'ไม่มีเบอร์โทรที่ถูกต้อง'); continue;
    end if;
    if เบอร์ = any(เห็นแล้ว) then
      ข้าม := ข้าม || jsonb_build_object('row', แถวที่, 'reason', 'เบอร์ซ้ำกับแถวก่อนหน้าในไฟล์'); continue;
    end if;
    if exists (select 1 from dealer_prospects p where _phone_digits(p.phone) = เบอร์) then
      ข้าม := ข้าม || jsonb_build_object('row', แถวที่, 'reason', 'เบอร์นี้มีผู้สนใจอยู่แล้ว'); continue;
    end if;
    if สถานะ not in ('new', 'contacted', 'profile_sent', 'lost') then
      raise exception 'import_status: แถว % ขั้น "%" นำเข้าไม่ได้ (ได้เฉพาะ รอติดต่อ · ติดต่อแล้ว · ส่งข้อมูลบริษัทแล้ว · ไม่สำเร็จ)', แถวที่, สถานะ;
    end if;
    if สถานะ = 'lost' and btrim(coalesce(r->>'lost_reason', '')) = '' then
      raise exception 'import_lost_reason: แถว % ไม่สำเร็จต้องมีเหตุผล', แถวที่;
    end if;
    if สถานะ = 'lost' and ตามวันนี้ then
      raise exception 'import_follow_up: แถว % ขั้นไม่สำเร็จตั้งนัดติดตามไม่ได้', แถวที่;
    end if;
    if จังหวัด is not null and not _province_ok(จังหวัด) then
      raise exception 'province_invalid: แถว % จังหวัด "%" ไม่อยู่ในรายชื่อ 77 จังหวัด', แถวที่, จังหวัด;
    end if;
    เริ่ม := nullif(r->>'first_contact', '')::date;
    ตาม := nullif(r->>'follow_up', '')::date;
    -- วันติดตามในไฟล์ทีม = วันที่ตามไปแล้ว (บอสสั่ง 5 พ.ย. 69) — อนาคตไม่ได้ (หน้าตรวจตัดออก + เก็บค่าเดิมในหมายเหตุ ก่อนส่งมา)
    if ตาม is not null and ตาม > วันนี้ then
      raise exception 'import_follow_up: แถว % วันติดตาม % เกินวันนี้ — วันติดตามคือวันที่ตามไปแล้ว', แถวที่, to_char(ตาม, 'YYYY-MM-DD');
    end if;
    -- วันที่ลูกค้าทิ้งเบอร์ (ใบ 0292 · ใบ 0293 รับวันเวลาด้วย) — YYYY-MM-DD (= 09:00 เวลาไทย) หรือ YYYY-MM-DD[T ]HH:mm[:ss] (ไม่มีเขตเวลา = เวลาไทย)
    --   หรือมีเขตเวลา (Z · ±HH[:MM]) · ผิดรูปแบบ/ไม่มีจริง/เกินวันนี้ (วันตามเวลาไทย) = ปฏิเสธทั้งชุด
    เข้าดิบ := nullif(btrim(coalesce(r->>'entered_at', '')), '');
    เข้า := null;
    if เข้าดิบ is not null then
      แบบเบอร์ := '^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}(:?\d{2})?)?)?$';
      if เข้าดิบ !~ แบบเบอร์ then
        raise exception 'import_entered_at: แถว % วันที่เข้ามา "%" ไม่ถูกต้อง (ต้องเป็น YYYY-MM-DD หรือ YYYY-MM-DD HH:mm:ss)', แถวที่, เข้าดิบ;
      end if;
      begin
        เข้า := case when เข้าดิบ ~ '^\d{4}-\d{2}-\d{2}$' then (เข้าดิบ::date + interval '9 hours') at time zone 'Asia/Bangkok'
                     when เข้าดิบ ~ '(Z|[+-]\d{2}(:?\d{2})?)$' then เข้าดิบ::timestamptz
                     else เข้าดิบ::timestamp at time zone 'Asia/Bangkok' end;
      exception when others then raise exception 'import_entered_at: แถว % วันที่เข้ามา "%" ไม่มีจริง', แถวที่, เข้าดิบ; end;
      if (เข้า at time zone 'Asia/Bangkok')::date > วันนี้ then
        raise exception 'import_entered_at: แถว % วันที่เข้ามา % เกินวันนี้', แถวที่, เข้าดิบ;
      end if;
    end if;
    เห็นแล้ว := เห็นแล้ว || เบอร์;

    insert into dealer_prospects (name, social, phone, email, province, region, channel, first_contact, follow_up, note, status, lost_reason, import_batch_id, created_at)
    values (left(ชื่อ, 200), nullif(left(btrim(coalesce(r->>'social', '')), 200), ''),
            case when ไม่ครบ then เบอร์                                           -- เบอร์ไม่ครบ (รวม 9 หลักมือถือขาดตัว) = ตัวเลขตามที่มี ไม่จัดรูปให้ดูเหมือนเบอร์บ้าน
                 when length(เบอร์) = 10 then substr(เบอร์, 1, 3) || '-' || substr(เบอร์, 4, 3) || '-' || substr(เบอร์, 7)
                 when length(เบอร์) = 9 then substr(เบอร์, 1, 2) || '-' || substr(เบอร์, 3, 3) || '-' || substr(เบอร์, 6)
                 else เบอร์ end,
            nullif(left(btrim(coalesce(r->>'email', '')), 200), ''),
            จังหวัด, (select t.region from th_provinces t where t.name = จังหวัด),
            nullif(left(btrim(coalesce(r->>'channel', '')), 50), ''), เริ่ม,
            case when ตามวันนี้ then วันนี้ end,                             -- ไม่ส่ง follow_up_today = นัดติดตามว่าง ให้ทีมตั้งเอง (ใบ 0277)
            nullif(left(btrim(coalesce(r->>'note', '')), 2000), ''), สถานะ,
            case when สถานะ = 'lost' then left(btrim(r->>'lost_reason'), 200) end, ชุด,
            coalesce(เข้า, now()))
    returning id into pid;
    -- วันที่ลูกค้าทิ้งเบอร์ = ติดต่อล่าสุดด้วย (บอสเลือก 23 พ.ย. 69 · ใบ 0293) — ตารางขึ้น "ติดต่อล่าสุด x วันก่อน" แทน "ยังไม่เคยติดต่อ"
    --   ตั้งที่ช่องติดต่อล่าสุดตรง ๆ ผ่านสวิตช์ระบบ (ตัวดักใส่แถวล้างค่าตอนเพิ่ม · ตัวกันขั้นยอมเฉพาะสวิตช์นี้) · ไม่สร้างบันทึกการติดต่อ
    if เข้า is not null then
      perform set_config('app.prospect_contact', 'on', true);
      update dealer_prospects set last_contact_at = เข้า where id = pid;
      perform set_config('app.prospect_contact', 'off', true);
    end if;
    -- ประวัติการติดต่อจากไฟล์ (บอสสั่ง 5 พ.ย. 69 · ใบ 0277):
    --   วันเริ่มติดต่อ + วันติดตาม (ที่ผ่านมา) = บันทึกการติดต่อวันละ 1 รายการ ลงวันที่ตามไฟล์ (09:00 เวลาไทย) · วันเดียวกัน = บันทึกเดียว
    --   หมายเหตุติดต่อในไฟล์ผูกกับบันทึกของวันล่าสุด · ไม่มีวันที่เลย = บันทึกหมายเหตุลงเวลานำเข้า (ติดต่อล่าสุดว่าง)
    --   ติดต่อล่าสุด = วันล่าสุดในสองช่อง · ไม่มีวันเริ่ม = ไม่เดาวันเริ่ม · ขั้นตั้งตามไฟล์ทีหลัง (ตัวดักบันทึกการติดต่อเลื่อน รอติดต่อ→ติดต่อแล้ว เอง)
    หมายเหตุติดต่อ := btrim(coalesce(r->>'contact_note', ''));
    วันบันทึก := array(select distinct x from unnest(array[เริ่ม, ตาม]) x where x is not null order by x);
    foreach d in array วันบันทึก loop
      insert into dealer_prospect_activities (prospect_id, kind, channel, body, import_batch_id)
      values (pid, 'contact', 'อื่น ๆ', left('จากไฟล์นำเข้า: '
        || case when d = เริ่ม and d = ตาม then 'เริ่มติดต่อ · ติดตาม' when d = เริ่ม then 'เริ่มติดต่อ' else 'ติดตาม' end
        || case when d = วันบันทึก[array_length(วันบันทึก, 1)] and หมายเหตุติดต่อ <> '' then ' · ' || หมายเหตุติดต่อ else '' end, 2000), ชุด)
      returning id into aid;
      -- ตัวดักตั้งเวลาเป็นตอนบันทึกเสมอ (กันปลอมย้อนหลังจากแอป) — คำสั่งนำเข้าในฐานลงวันตามไฟล์เอง
      update dealer_prospect_activities set created_at = (d::timestamp + interval '9 hours') at time zone 'Asia/Bangkok' where id = aid;
    end loop;
    if array_length(วันบันทึก, 1) is null and หมายเหตุติดต่อ <> '' then
      insert into dealer_prospect_activities (prospect_id, kind, channel, body, import_batch_id)
      values (pid, 'contact', 'อื่น ๆ', left('จากไฟล์นำเข้า: ' || หมายเหตุติดต่อ, 2000), ชุด);
    end if;
    if array_length(วันบันทึก, 1) is not null or หมายเหตุติดต่อ <> '' then
      perform set_config('app.prospect_contact', 'on', true);
      -- ขั้นตามไฟล์ (เช่น รอติดต่อ) ทับขั้นที่ตัวดักเลื่อนให้ · สวิตช์บอกตัวกันขั้นว่าเป็นระบบตั้ง (ตัวกันขั้นรุ่นถัดไปที่ห้ามคนถอยขั้นจะยอมทางนี้)
      perform set_config('app.prospect_stage_system', 'on', true);
      update dealer_prospects
         set last_contact_at = case when array_length(วันบันทึก, 1) is null then เข้า   -- ไม่มีวันในไฟล์ = วันที่เข้ามา (ใบ 0293 · ไม่ส่ง = ว่างเหมือนเดิม)
                                    else greatest((วันบันทึก[array_length(วันบันทึก, 1)]::timestamp + interval '9 hours') at time zone 'Asia/Bangkok',
                                                  coalesce(เข้า, '-infinity'::timestamptz)) end,
             first_contact = เริ่ม, follow_up = case when ตามวันนี้ then วันนี้ end, status = สถานะ
       where id = pid;
      perform set_config('app.prospect_stage_system', '', true);
      perform set_config('app.prospect_contact', 'off', true);
    end if;
    เพิ่ม := เพิ่ม + 1;
  end loop;

  perform set_config('app.prospect_import', '', true);
  perform set_config('pms.audit_skip', '', true);
  update prospect_import_batches set inserted = เพิ่ม, skipped = jsonb_array_length(ข้าม) where id = ชุด;
  perform _audit_hq('นำเข้าผู้สนใจเป็นดีลเลอร์', coalesce(nullif(btrim(p_file), ''), 'ไฟล์ไม่มีชื่อ') || ' · เพิ่ม ' || เพิ่ม || ' ราย · ข้าม ' || jsonb_array_length(ข้าม) || ' แถว · ชุด ' || ชุด);
  return jsonb_build_object('batch', ชุด, 'inserted', เพิ่ม, 'skipped', ข้าม);
end $$;
revoke all on function public.hq_prospects_import(text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.hq_prospects_import(text, jsonb) to authenticated;
