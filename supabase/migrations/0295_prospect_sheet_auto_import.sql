-- ── ใบ 0295: ดึงผู้สนใจจาก Google Sheets อัตโนมัติทุกชั่วโมง + นำเข้า Facebook "เบอร์ซ้ำก็เอา ไม่ครบก็เอา" (บอสสั่ง 23 พ.ย. 69 ผ่านคนรวมงาน) ──
-- 1) นำเข้าแถว Facebook (ไฟล์/ชีต · แถวส่ง dup_ok) — ทับคำตัดสินเดิม "เบอร์ซ้ำไม่สร้างซ้ำ" เฉพาะไฟล์/ชีต Facebook:
--    · เบอร์ซ้ำ (ในไฟล์ หรือกับผู้สนใจที่มีอยู่) = นำเข้าเป็นรายใหม่ (หน้าจอติดป้าย "เบอร์ซ้ำ" บอกว่าซ้ำกับใคร — คำนวณจากเบอร์ ไม่เก็บช่องใหม่)
--    · ไม่มีชื่อ = ชื่อ "(ไม่มีชื่อ)" · ไม่มีเบอร์ = เบอร์ว่าง (บอสเลือก ก: ตัวกันช่องบังคับยอมเฉพาะสวิตช์ของคำสั่งนำเข้า · ฟอร์มมือบังคับเหมือนเดิม)
--      หน้าจอติดป้าย "ข้อมูลไม่ครบ" · ข้ามเฉพาะแถวที่ไม่มีทั้งชื่อและเบอร์
--    · แถวเดิมของชีตไม่นำเข้าซ้ำ: กุญแจแถว = ชื่อ|ตัวเลขเบอร์|วันเวลาทิ้งเบอร์ (เวลาไทย) เก็บใน prospect_import_keys ผูกชุด
--      เคยนำเข้าแล้ว (ชุดที่ยังไม่ยกเลิก) = ข้าม · ยกเลิกชุด = ลบกุญแจของชุด → นำเข้าใหม่ได้ · ลบผู้สนใจทีละราย = กุญแจคง (ดึงรอบถัดไปไม่คืนรายที่ลบ)
--      ไม่ใช้ id ของ Facebook: รายที่นำเข้าก่อนใบนี้ไม่มี id ให้เทียบ — กุญแจแบบเดียวกันทั้งของเก่า (เติมจากข้อมูลเดิม) และของใหม่
--    · ไฟล์ทีม (ไม่ส่ง dup_ok) = กติกาเดิมทุกข้อ · ฟอร์ม "เพิ่มผู้สนใจ" ไม่มีตัวกันเบอร์ซ้ำที่ฐาน (ไม่กระทบ)
-- 2) ดึงชีตอัตโนมัติ: ตั้งค่าแถวเดียว prospect_sheet_sync (ลิงก์ · เปิด/ปิด) ที่ฐาน — ตั้ง/ปิด = สิทธิ์นำเข้าเดิม + บันทึกการใช้งาน
--    · pg_cron ทุกชั่วโมง (นาทีที่ 7) → _cron_prospect_sheet() → pg_net เรียก /api/cron/prospect-sheet ของเว็บ HQ พร้อม Bearer รหัสลับเดิม
--      ที่อยู่ = ค่า Vault เดิมของงานส่งอีเมล (ใบ 0212 'cron_send_email_url') เปลี่ยนท้ายเป็น /api/cron/prospect-sheet · รหัสลับ 'cron_secret' เดิม
--      → ไม่มีค่า env/Vault ใหม่ · ใบนี้ไม่อ่าน/พิมพ์ค่า Vault (อ่านเฉพาะในฟังก์ชันตอนตัวตั้งเวลาทำงาน เหมือน 0212)
--      ทุกครั้งที่ตัวตั้งเวลาทำงานจดเวลา + "ส่งคำขอแล้ว"/"ตั้งค่าระบบไม่ครบ" ในแถวตั้งค่า → หน้าต่างนำเข้าเห็นว่าตัวตั้งเวลาไม่ทำงาน (ไม่เงียบ)
--    · เว็บ HQ ใช้ ตัวอ่านชีต/เตรียมแถวเฟซบุ๊ก/แถวส่งฐาน/hq_prospects_import ตัวเดิม (ไม่มีทางที่สอง) ผ่านคำสั่งของระบบ 3 ตัว (service_role เท่านั้น):
--      _prospect_sheet_claim (รับงาน + กันรันซ้อน 15 นาที) · _prospect_sheet_import (ห่อคำสั่งนำเข้าเดิม + แจ้งกระดิ่ง) · _prospect_sheet_finish (จดผล + เตือนพังวันละครั้ง)
--      ปุ่ม "ดึงตอนนี้" ในหน้าต่าง = ทางเดียวกัน (เว็บตรวจสิทธิ์นำเข้าของผู้กดก่อน · ไม่แจ้งกระดิ่งตัวเอง)
--    · แต่ละรอบ = 1 ชุดนำเข้า (ยกเลิกทั้งชุดได้เหมือนเดิม) · ไม่มีแถวใหม่ = ไม่สร้างชุด
--    · แจ้งเตือนใหม่ (ตารางกลาง · FLOW แถว H10): prospect_sheet_imported "นำเข้าจากชีตอัตโนมัติ N ราย" (N>0) · prospect_sheet_failed (วันละครั้ง)
-- 3) ยกเลิกชุด (ใบ 0294) ลบกุญแจแถวของชุดด้วย
-- 4) แปลงข้อมูล: เติมกุญแจแถวให้ผู้สนใจ Facebook ที่นำเข้าแล้ว (ชุดที่ยังไม่ยกเลิก) — กันดึงรอบแรกนำเข้ารายเดิมซ้ำเป็น "เบอร์ซ้ำ"
--    ไม่มีตารางสำรอง (ตั้งใจ): เพิ่มแถวในตารางใหม่อย่างเดียว ไม่แก้/ลบข้อมูลเดิม · ย้อนกลับ = ลบแถวในตารางใหม่
-- ข้อทดสอบ: supabase/tests/prospect_sheet_auto.sql · prospect_import_facebook.sql (ข้อซ้ำตรวจกลับด้าน) · ซ้อมลงใบ tests/tools/migration-0295.test.mjs
--          unit facebookLeadImport / prospectSheetSync · หน้าเว็บ prospect-import-facebook.spec

-- ═══ กุญแจแถวที่นำเข้าแล้ว ═══════════════════════════════════════════════════════════════════════════════════════
create table public.prospect_import_keys (
  key        text primary key,
  batch_id   bigint not null references public.prospect_import_batches (id) on delete cascade,
  created_at timestamptz not null default now()
);
comment on table public.prospect_import_keys is 'กุญแจแถวไฟล์/ชีต Facebook ที่นำเข้าแล้ว (ใบ 0295) — ชื่อ|ตัวเลขเบอร์|วันเวลาทิ้งเบอร์ · ยกเลิกชุด = ลบ · เขียนผ่านคำสั่งของฐานเท่านั้น';
create index prospect_import_keys_batch_idx on public.prospect_import_keys (batch_id);
alter table public.prospect_import_keys enable row level security;
revoke all on table public.prospect_import_keys from public, anon, authenticated, service_role;
grant all on table public.prospect_import_keys to service_role;

-- กุญแจแถว: ชื่อ (ตัดช่องว่างหัวท้าย) | ตัวเลขเบอร์ | วันเวลาทิ้งเบอร์เวลาไทย YYYY-MM-DDTHH:MI:SS (ไม่มี = ว่าง)
--   หน้าเว็บคำนวณแบบเดียวกัน (lib/facebookLeadImport.กุญแจแถวเฟซบุ๊ก) เพื่อแยกแท็บ "เคยนำเข้าแล้ว" ในหน้าตัวอย่าง
create or replace function public._prospect_import_key(p_name text, p_digits text, p_entered timestamptz) returns text
  language sql immutable set search_path to 'public' as $$
  select btrim(coalesce(p_name, '')) || '|' || coalesce(p_digits, '') || '|'
      || coalesce(to_char(p_entered at time zone 'Asia/Bangkok', 'YYYY-MM-DD"T"HH24:MI:SS'), '');
$$;
revoke all on function public._prospect_import_key(text, text, timestamptz) from public, anon, authenticated, service_role;

-- กุญแจที่นำเข้าแล้วทั้งหมด (หน้าตัวอย่างแยกแท็บ "เคยนำเข้าแล้ว (ข้าม)") — สิทธิ์นำเข้าเดิม
create or replace function public.hq_prospect_import_keys() returns setof text
  language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not can_write_master() then raise exception 'forbidden: นำเข้าผู้สนใจได้เฉพาะผู้ดูแลระบบ/ผู้บริหารสำนักงานใหญ่'; end if;
  return query select k.key from prospect_import_keys k;
end $$;
revoke all on function public.hq_prospect_import_keys() from public, anon, authenticated, service_role;
grant execute on function public.hq_prospect_import_keys() to authenticated;

-- ═══ ช่องบังคับเบอร์: ยอมเบอร์ว่างเฉพาะคำสั่งนำเข้า (สวิตช์ในธุรกรรม · ผู้ใช้ตั้งเองผ่าน API ไม่ได้) ═══════════════════════
create or replace function public.dealer_prospects_required() returns trigger
  language plpgsql security definer set search_path to 'public' as $function$
begin
  if req_blank(new.phone) and (tg_op = 'INSERT' or not req_blank(old.phone))
     and not (tg_op = 'INSERT' and coalesce(current_setting('app.prospect_import_blank_phone', true), '') = 'on') then
    perform req_fail('เบอร์โทร');
  end if;
  return new;
end $function$;

-- ═══ คำสั่งนำเข้า (ยกจากใบ 0293 · เปลี่ยน: ผู้เรียกที่เป็นตัวดึงอัตโนมัติ · แถว Facebook ยอมซ้ำ/ไม่ครบ · กุญแจแถว) ═══════════════
create or replace function public.hq_prospects_import(p_file text, p_rows jsonb) returns jsonb
  language plpgsql security definer set search_path to 'public' as $$
declare
  r jsonb; ชุด bigint; pid bigint; ลำดับ int := 0; เพิ่ม int := 0; แถวที่ text;
  ข้าม jsonb := '[]'::jsonb; เห็นแล้ว text[] := '{}'; เบอร์ text; ชื่อ text; สถานะ text; จังหวัด text; หมายเหตุติดต่อ text; เริ่ม date; ตาม date; วันนี้ date := (now() at time zone 'Asia/Bangkok')::date;
  วันบันทึก date[]; d date; aid bigint;
  ตามวันนี้ boolean; ไม่ครบ boolean; เข้าดิบ text; เข้า timestamptz; แบบเบอร์ text;
  ยอมซ้ำ boolean; กุญแจ text; กุญแจที่เห็น text[] := '{}'; เคยนำเข้า int := 0;
begin
  -- ผู้เรียก: HQ ที่มีสิทธิ์นำเข้า · หรือตัวดึงชีตอัตโนมัติ (ใบ 0295) ผ่านตัวห่อ _prospect_sheet_import (service_role เท่านั้น ตั้งสวิตช์ในธุรกรรมเอง)
  if not (can_write_master() or (auth.role() = 'service_role' and coalesce(current_setting('app.prospect_sheet_auto', true), '') = 'on')) then
    raise exception 'forbidden: นำเข้าผู้สนใจได้เฉพาะผู้ดูแลระบบ/ผู้บริหารสำนักงานใหญ่';
  end if;
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
    เบอร์ := coalesce(_phone_digits(r->>'phone'), '');
    ชื่อ := btrim(coalesce(r->>'name', ''));
    สถานะ := coalesce(nullif(r->>'status', ''), 'new');
    จังหวัด := nullif(btrim(coalesce(r->>'province', '')), '');
    -- รับเฉพาะ true แบบ boolean ของ JSON (ค่าอื่น/ไม่ส่ง = ทำแบบเดิม)
    ตามวันนี้ := coalesce(r->'follow_up_today' = 'true'::jsonb, false);
    ไม่ครบ := coalesce(r->'phone_incomplete' = 'true'::jsonb, false);
    -- แถวจากไฟล์/ชีต Facebook (dup_ok · บอสสั่ง 23 พ.ย. 69 "เบอร์ซ้ำก็เอา ไม่ครบก็เอา เอาทุกข้อมูล" · ใบ 0295):
    --   เบอร์ซ้ำ (ในไฟล์/กับรายที่มีอยู่) = นำเข้า (หน้าจอติดป้าย "เบอร์ซ้ำ") · ไม่มีชื่อ = "(ไม่มีชื่อ)" · ไม่มีเบอร์ = เบอร์ว่าง
    --   ข้ามเฉพาะ: ไม่มีชื่อและไม่มีเบอร์ · แถวที่เคยนำเข้าแล้ว (กุญแจแถวอยู่ใน prospect_import_keys ของชุดที่ยังไม่ยกเลิก)
    --   ไฟล์ทีม (ไม่ส่ง dup_ok) = กติกาเดิมทุกข้อ
    ยอมซ้ำ := coalesce(r->'dup_ok' = 'true'::jsonb, false);
    -- แยกตัวแปรก่อน: plpgsql อ่านเงื่อนไข IF ถึงคำ THEN ตัวแรก (THEN ของ CASE ในเงื่อนไข = ใบพัง)
    แบบเบอร์ := case when ไม่ครบ then '^\d{1,15}$' else '^0\d{8,9}$' end;
    if ยอมซ้ำ then
      if ชื่อ = '' and เบอร์ = '' then
        ข้าม := ข้าม || jsonb_build_object('row', แถวที่, 'reason', 'ไม่มีชื่อและไม่มีเบอร์'); continue;
      end if;
      if เบอร์ <> '' and เบอร์ !~ แบบเบอร์ then
        ข้าม := ข้าม || jsonb_build_object('row', แถวที่, 'reason', 'ไม่มีเบอร์โทรที่ถูกต้อง'); continue;
      end if;
    else
      if ชื่อ = '' then
        ข้าม := ข้าม || jsonb_build_object('row', แถวที่, 'reason', 'ไม่มีชื่อ'); continue;
      end if;
      if เบอร์ !~ แบบเบอร์ then
        ข้าม := ข้าม || jsonb_build_object('row', แถวที่, 'reason', 'ไม่มีเบอร์โทรที่ถูกต้อง'); continue;
      end if;
      if เบอร์ = any(เห็นแล้ว) then
        ข้าม := ข้าม || jsonb_build_object('row', แถวที่, 'reason', 'เบอร์ซ้ำกับแถวก่อนหน้าในไฟล์'); continue;
      end if;
      if exists (select 1 from dealer_prospects p where _phone_digits(p.phone) = เบอร์) then
        ข้าม := ข้าม || jsonb_build_object('row', แถวที่, 'reason', 'เบอร์นี้มีผู้สนใจอยู่แล้ว'); continue;
      end if;
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
    -- แถวที่เคยนำเข้าแล้ว (ใบ 0295 · กุญแจ = ชื่อ|ตัวเลขเบอร์|วันเวลาทิ้งเบอร์ เวลาไทย) — ดึงชีตทุกชั่วโมงไม่เพิ่มแถวเดิมซ้ำ
    กุญแจ := null;
    if ยอมซ้ำ then
      กุญแจ := _prospect_import_key(ชื่อ, เบอร์, เข้า);
      if กุญแจ = any(กุญแจที่เห็น) or exists (select 1 from prospect_import_keys k where k.key = กุญแจ) then
        เคยนำเข้า := เคยนำเข้า + 1;
        ข้าม := ข้าม || jsonb_build_object('row', แถวที่, 'reason', 'เคยนำเข้าแล้ว'); continue;
      end if;
      กุญแจที่เห็น := กุญแจที่เห็น || กุญแจ;
    end if;
    if เบอร์ <> '' then เห็นแล้ว := เห็นแล้ว || เบอร์; end if;

    -- ไม่มีเบอร์ (เฉพาะแถว Facebook) = เบอร์ว่าง · ตัวกันช่องบังคับยอมเฉพาะสวิตช์นี้ (ฟอร์มมือยังบังคับ · ใบ 0295)
    perform set_config('app.prospect_import_blank_phone', case when เบอร์ = '' then 'on' else '' end, true);
    insert into dealer_prospects (name, social, phone, email, province, region, channel, first_contact, follow_up, note, status, lost_reason, import_batch_id, created_at)
    values (left(case when ชื่อ = '' then '(ไม่มีชื่อ)' else ชื่อ end, 200), nullif(left(btrim(coalesce(r->>'social', '')), 200), ''),
            case when เบอร์ = '' then null
                 when ไม่ครบ then เบอร์                                           -- เบอร์ไม่ครบ (รวม 9 หลักมือถือขาดตัว) = ตัวเลขตามที่มี ไม่จัดรูปให้ดูเหมือนเบอร์บ้าน
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
    perform set_config('app.prospect_import_blank_phone', '', true);
    if กุญแจ is not null then insert into prospect_import_keys (key, batch_id) values (กุญแจ, ชุด) on conflict (key) do nothing; end if;
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
  return jsonb_build_object('batch', ชุด, 'inserted', เพิ่ม, 'skipped', ข้าม, 'already', เคยนำเข้า);
end $$;
revoke all on function public.hq_prospects_import(text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.hq_prospects_import(text, jsonb) to authenticated;


-- ═══ ยกเลิกชุด (ยกจากใบ 0294 · เพิ่ม: ลบกุญแจแถวของชุด → แถวเดิมนำเข้าใหม่ได้) ═══════════════════════════════════════════
create or replace function public.hq_prospects_import_cancel(p_batch bigint)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare b prospect_import_batches; แตะ int; n int; รหัส text[];
begin
  if not can_write_master() then raise exception 'forbidden: ยกเลิกการนำเข้าได้เฉพาะผู้ดูแลระบบ/ผู้บริหารสำนักงานใหญ่'; end if;
  select * into b from prospect_import_batches where id = p_batch for update;
  if not found then raise exception 'not_found: ไม่พบชุดนำเข้านี้'; end if;
  if b.cancelled_at is not null then raise exception 'import_cancelled: ชุดนี้ยกเลิกไปแล้ว'; end if;
  แตะ := _import_batch_touched(p_batch);
  if แตะ > 0 then
    raise exception 'import_in_use: ยกเลิกทั้งชุดไม่ได้ — มี % รายที่ถูกแตะแล้วหลังนำเข้า (บันทึกการติดต่อ · เปลี่ยนขั้น · ออกใบค่าแฟรนไชส์)', แตะ;
  end if;
  -- แจ้งเตือน/อีเมลค้างส่งของรายในชุด (ใบ 0294) — อ้างด้วยข้อความ ไม่มีกุญแจนอก จึงไม่หายตามผู้สนใจ
  รหัส := array(select id::text from dealer_prospects where import_batch_id = p_batch);
  delete from notifications where kind in ('prospect_followup_due', 'prospect_idle') and split_part(dedupe_key, ':', 2) = any(รหัส);
  delete from email_outbox where ref_table = 'dealer_prospects' and ref_id = any(รหัส) and status <> 'sent';
  -- กุญแจแถวของชุด (ใบ 0295) — ยกเลิกแล้วนำเข้าแถวเดิมใหม่ได้
  delete from prospect_import_keys where batch_id = p_batch;
  perform set_config('pms.audit_skip', 'on', true);
  delete from dealer_prospects where import_batch_id = p_batch;
  get diagnostics n = row_count;
  perform set_config('pms.audit_skip', '', true);
  update prospect_import_batches set cancelled_at = now(), cancelled_by = audit_actor_name() where id = p_batch;
  perform _audit_hq('ยกเลิกการนำเข้าผู้สนใจ', coalesce(nullif(b.file_name, ''), 'ไฟล์ไม่มีชื่อ') || ' · ลบ ' || n || ' ราย · ชุด ' || p_batch);
  return jsonb_build_object('batch', p_batch, 'deleted', n);
end $function$;
revoke all on function public.hq_prospects_import_cancel(bigint) from public, anon, authenticated, service_role;
grant execute on function public.hq_prospects_import_cancel(bigint) to authenticated;

-- ═══ ตั้งค่าดึงชีตอัตโนมัติ (แถวเดียว) ═══════════════════════════════════════════════════════════════════════════════
create table public.prospect_sheet_sync (
  id              int primary key default 1 check (id = 1),
  url             text not null default '',
  enabled         boolean not null default false,
  updated_by      text not null default '',
  updated_at      timestamptz,
  last_run_at     timestamptz,                 -- เว็บดึงชีตล่าสุด (อัตโนมัติหรือกด "ดึงตอนนี้")
  last_ok         boolean,
  last_result     text not null default '',    -- ข้อความผลล่าสุด (แสดงในหน้าต่าง)
  last_batch      bigint,
  last_tick_at    timestamptz,                 -- ตัวตั้งเวลาของฐานทำงานล่าสุด
  last_tick_note  text not null default '',    -- ส่งคำขอแล้ว · ตั้งค่าระบบไม่ครบ
  running_since   timestamptz,                 -- กันรันซ้อน (เกิน 15 นาที = ถือว่าค้าง รับงานใหม่ได้)
  fail_notified_on date                         -- เตือน "ดึงไม่สำเร็จ" ล่าสุด (วันละครั้ง)
);
comment on table public.prospect_sheet_sync is 'ตั้งค่าดึงผู้สนใจจาก Google Sheets อัตโนมัติ (ใบ 0295) — แถวเดียว · เขียนผ่านคำสั่งของฐานเท่านั้น';
insert into public.prospect_sheet_sync (id) values (1) on conflict (id) do nothing;
alter table public.prospect_sheet_sync enable row level security;
revoke all on table public.prospect_sheet_sync from public, anon, authenticated, service_role;
grant all on table public.prospect_sheet_sync to service_role;

-- สถานะ (หน้าต่างนำเข้า) — HQ ที่มีสิทธิ์นำเข้า
create or replace function public.hq_prospect_sheet_sync() returns jsonb
  language plpgsql stable security definer set search_path to 'public' as $$
declare s prospect_sheet_sync;
begin
  if not can_write_master() then raise exception 'forbidden: นำเข้าผู้สนใจได้เฉพาะผู้ดูแลระบบ/ผู้บริหารสำนักงานใหญ่'; end if;
  select * into s from prospect_sheet_sync where id = 1;
  return jsonb_build_object('url', coalesce(s.url, ''), 'enabled', coalesce(s.enabled, false), 'updatedBy', coalesce(s.updated_by, ''),
    'updatedAt', s.updated_at, 'lastRunAt', s.last_run_at, 'lastOk', s.last_ok, 'lastResult', coalesce(s.last_result, ''),
    'lastBatch', s.last_batch, 'lastTickAt', s.last_tick_at, 'lastTickNote', coalesce(s.last_tick_note, ''),
    'running', s.running_since is not null and s.running_since > now() - interval '15 minutes', 'now', now());
end $$;
revoke all on function public.hq_prospect_sheet_sync() from public, anon, authenticated, service_role;
grant execute on function public.hq_prospect_sheet_sync() to authenticated;

-- ตั้งลิงก์ + เปิด/ปิด — สิทธิ์นำเข้าเดิม · ลงบันทึกการใช้งาน (ไม่ลงลิงก์เต็ม: รหัสชีต 6 ตัวแรก)
create or replace function public.hq_prospect_sheet_sync_set(p_url text, p_enabled boolean) returns jsonb
  language plpgsql security definer set search_path to 'public' as $$
declare ลิงก์ text := btrim(coalesce(p_url, '')); รหัส text; เดิม prospect_sheet_sync;
begin
  if not can_write_master() then raise exception 'forbidden: ตั้งดึงชีตอัตโนมัติได้เฉพาะผู้ดูแลระบบ/ผู้บริหารสำนักงานใหญ่'; end if;
  if ลิงก์ <> '' and ลิงก์ !~ '^https://docs\.google\.com/spreadsheets/d/[A-Za-z0-9_-]{20,128}([/?#][^\s]*)?$' then
    raise exception 'sheet_url: ลิงก์ต้องเป็นลิงก์ Google Sheets (https://docs.google.com/spreadsheets/d/…)';
  end if;
  if coalesce(p_enabled, false) and ลิงก์ = '' then raise exception 'sheet_url: เปิดดึงอัตโนมัติต้องมีลิงก์ Google Sheets'; end if;
  if length(ลิงก์) > 2000 then raise exception 'sheet_url: ลิงก์ยาวเกินไป'; end if;
  select * into เดิม from prospect_sheet_sync where id = 1 for update;
  update prospect_sheet_sync set url = ลิงก์, enabled = coalesce(p_enabled, false), updated_by = audit_actor_name(), updated_at = now() where id = 1;
  รหัส := substring(ลิงก์ from '/d/([A-Za-z0-9_-]{6})');
  if เดิม.enabled is distinct from coalesce(p_enabled, false) or เดิม.url is distinct from ลิงก์ then
    perform _audit_hq(case when coalesce(p_enabled, false) then 'เปิดดึงผู้สนใจจากชีตอัตโนมัติ' else 'ปิดดึงผู้สนใจจากชีตอัตโนมัติ' end,
                      case when รหัส is null then 'ไม่มีลิงก์' else 'ชีต ' || รหัส || '…' end);
  end if;
  return hq_prospect_sheet_sync();
end $$;
revoke all on function public.hq_prospect_sheet_sync_set(text, boolean) from public, anon, authenticated, service_role;
grant execute on function public.hq_prospect_sheet_sync_set(text, boolean) to authenticated;

-- ── คำสั่งของระบบ (เว็บ HQ เรียกด้วย service_role เท่านั้น · ผู้ใช้/anon เรียกไม่ได้) ──
-- รับงาน: ปิด/ไม่มีลิงก์ = ไม่ทำ · รอบก่อนยังไม่จบภายใน 15 นาที = ไม่ทำ (กันรันซ้อน) · กด "ดึงตอนนี้" ทำได้แม้ปิดอัตโนมัติ (ต้องมีลิงก์)
create or replace function public._prospect_sheet_claim(p_manual boolean) returns jsonb
  language plpgsql security definer set search_path to 'public' as $$
declare s prospect_sheet_sync;
begin
  select * into s from prospect_sheet_sync where id = 1 for update;
  if not found or (not s.enabled and not coalesce(p_manual, false)) then return jsonb_build_object('status', 'off'); end if;
  if s.url = '' then return jsonb_build_object('status', 'no_url'); end if;
  if s.running_since is not null and s.running_since > now() - interval '15 minutes' then return jsonb_build_object('status', 'busy'); end if;
  update prospect_sheet_sync set running_since = now() where id = 1;
  return jsonb_build_object('status', 'run', 'url', s.url);
end $$;
revoke all on function public._prospect_sheet_claim(boolean) from public, anon, authenticated, service_role;
grant execute on function public._prospect_sheet_claim(boolean) to service_role;

-- นำเข้า: ห่อคำสั่งนำเข้าเดิม (ทางเดียว) · ชุดลงชื่อผู้ทำ · แจ้งกระดิ่ง HQ เมื่อนำเข้า > 0 (ไม่แจ้งเมื่อผู้ใช้กดเอง)
create or replace function public._prospect_sheet_import(p_file text, p_rows jsonb, p_actor text, p_notify boolean) returns jsonb
  language plpgsql security definer set search_path to 'public' as $$
declare ผล jsonb; ชุด bigint; เพิ่ม int;
begin
  perform set_config('app.prospect_sheet_auto', 'on', true);
  ผล := hq_prospects_import(p_file, p_rows);
  perform set_config('app.prospect_sheet_auto', '', true);
  ชุด := (ผล->>'batch')::bigint; เพิ่ม := coalesce((ผล->>'inserted')::int, 0);
  update prospect_import_batches set created_by = left(coalesce(nullif(btrim(p_actor), ''), 'ดึงอัตโนมัติ'), 100) where id = ชุด;
  if เพิ่ม > 0 and coalesce(p_notify, false) then
    perform _notify('prospect_sheet_imported', null, 'batch:' || ชุด, jsonb_build_object('count', เพิ่ม, 'batch', ชุด));
  end if;
  return ผล;
end $$;
revoke all on function public._prospect_sheet_import(text, jsonb, text, boolean) from public, anon, authenticated, service_role;
grant execute on function public._prospect_sheet_import(text, jsonb, text, boolean) to service_role;

-- จบงาน: จดผล · ปลดล็อก · ดึงอัตโนมัติไม่สำเร็จ = เตือนกระดิ่งวันละครั้ง (กดเองเห็นผลบนจออยู่แล้ว ไม่เตือน)
create or replace function public._prospect_sheet_finish(p_ok boolean, p_result text, p_batch bigint, p_manual boolean) returns void
  language plpgsql security definer set search_path to 'public' as $$
declare วันนี้ date := (now() at time zone 'Asia/Bangkok')::date; s prospect_sheet_sync;
begin
  select * into s from prospect_sheet_sync where id = 1 for update;
  update prospect_sheet_sync set last_run_at = now(), last_ok = coalesce(p_ok, false), last_result = left(coalesce(p_result, ''), 500),
         last_batch = coalesce(p_batch, last_batch), running_since = null where id = 1;
  if not coalesce(p_ok, false) and not coalesce(p_manual, false) and s.fail_notified_on is distinct from วันนี้ then
    update prospect_sheet_sync set fail_notified_on = วันนี้ where id = 1;
    perform _notify('prospect_sheet_failed', null, วันนี้::text, jsonb_build_object('reason', left(coalesce(p_result, ''), 200)));
  end if;
end $$;
revoke all on function public._prospect_sheet_finish(boolean, text, bigint, boolean) from public, anon, authenticated, service_role;
grant execute on function public._prospect_sheet_finish(boolean, text, bigint, boolean) to service_role;

-- ═══ แจ้งเตือน (ตารางกลาง · FLOW แถว H10 · ขั้น H2) ═══════════════════════════════════════════════════════════════
insert into public.notification_kinds (kind, flow_row, audience, bell, email, title, body, href, sort, locked, goes_to) values
  ('prospect_sheet_imported', 'H10', 'hq', true, false, 'นำเข้าจากชีตอัตโนมัติ',
     'นำเข้าจากชีตอัตโนมัติ {count} ราย (ชุด {batch}) — ยกเลิกทั้งชุดได้ในหน้าต่างนำเข้า', '/hq/prospects', 190, false, 'หน้าผู้สนใจเป็นดีลเลอร์'),
  ('prospect_sheet_failed', 'H10', 'hq', true, false, 'ดึงชีตอัตโนมัติไม่สำเร็จ',
     '{reason} — ดูสถานะในหน้าต่างนำเข้าจาก Google Sheets', '/hq/prospects', 191, false, 'หน้าผู้สนใจเป็นดีลเลอร์')
on conflict (kind, audience) do nothing;

-- ═══ ตัวตั้งเวลา: pg_cron ทุกชั่วโมง → เว็บ HQ /api/cron/prospect-sheet (แบบใบ 0212) ══════════════════════════════════════
--   ที่อยู่/รหัสลับอ่านจาก Vault ตอนทำงานเท่านั้น (ไม่อยู่ในใบ · ไม่พิมพ์ออก) · จดเวลาทำงาน + ผลการตั้งค่าในแถวตั้งค่าทุกครั้ง
create or replace function public._cron_prospect_sheet() returns void
  language plpgsql security definer set search_path = '' as $$
declare v_url text; v_secret text; v_on boolean;
begin
  select enabled into v_on from public.prospect_sheet_sync where id = 1;
  begin
    select decrypted_secret into v_url from vault.decrypted_secrets where name = 'cron_send_email_url';
    select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cron_secret';
  exception when others then v_url := null; v_secret := null;
  end;
  if coalesce(v_url, '') !~ '/api/cron/send-email' or coalesce(v_secret, '') = '' then
    update public.prospect_sheet_sync set last_tick_at = now(), last_tick_note = 'ตั้งค่าระบบไม่ครบ' where id = 1;
    return;
  end if;
  update public.prospect_sheet_sync set last_tick_at = now(), last_tick_note = 'ส่งคำขอแล้ว' where id = 1;
  if not coalesce(v_on, false) then return; end if;
  perform net.http_get(
    url := regexp_replace(v_url, '/api/cron/send-email.*$', '/api/cron/prospect-sheet'),
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret),
    timeout_milliseconds := 120000
  );
end $$;
revoke all on function public._cron_prospect_sheet() from public, anon, authenticated, service_role;

do $$
begin
  create extension if not exists pg_net with schema extensions;
  create extension if not exists pg_cron;
  perform cron.schedule('prospect-sheet', '7 * * * *', $q$ select public._cron_prospect_sheet() $q$);
exception when others then
  raise notice 'ข้าม prospect-sheet cron: pg_cron/pg_net ยังไม่พร้อม (%) — หน้าต่างนำเข้าจะขึ้น "ตัวตั้งเวลายังไม่เคยทำงาน"', sqlerrm;
end $$;

-- ═══ แปลงข้อมูล: กุญแจแถวของผู้สนใจ Facebook ที่นำเข้าแล้ว (ชุดที่ยังไม่ยกเลิก) ════════════════════════════════════════
--   created_at ของรายนำเข้า = วันเวลาทิ้งเบอร์ (ใบ 0292/0293) → กุญแจตรงกับแถวเดิมในชีต · ไม่แก้/ลบข้อมูลเดิม
insert into public.prospect_import_keys (key, batch_id)
select distinct on (k) k, p.import_batch_id
  from (select public._prospect_import_key(p.name, public._phone_digits(p.phone), p.created_at) as k, p.import_batch_id, p.id
          from public.dealer_prospects p
          join public.prospect_import_batches b on b.id = p.import_batch_id and b.cancelled_at is null
         where p.channel = 'Facebook') p
 order by k, p.id
on conflict (key) do nothing;

-- ═══ ถอนสิทธิ์ตัวนับเลข (sequence) ที่ใบเก่าเปิดให้คนนอกโดยไม่ตั้งใจ (คนรวมงานสั่ง 23 พ.ย. 69 · พบตอนถ่ายค่าสิทธิ์ใหม่) ═════════════════
--   ค่าตั้งต้นของสคีมา public ให้ anon/authenticated ใช้ตัวนับเลขทุกตัวที่สร้างใหม่ → anon เลื่อนเลข/อ่านเลขล่าสุดได้ (เช่น hqd_move_0287_id_seq · ใบ 0287)
--   anon ไม่ได้เพิ่มแถวเองในตารางใดเลย (กฎ RLS ทุกตัวต้องเข้าระบบ · งานของคนนอกทำผ่านคำสั่งของฐาน) → ถอนจาก anon ทุกตัว
--   authenticated: ถอนเฉพาะตัวนับของตารางที่ผู้ใช้ไม่ได้เขียนตรง (hqd_move_0287 = ตารางย้อนกลับของระบบ) · ตัวอื่นคงไว้ (หน้าเว็บเพิ่มแถวตรงผ่านกฎ RLS)
--   ตาราง (ไม่ใช่ตัวนับ) ที่ค่าตั้งต้นให้ anon ไว้ ป้องกันด้วยกฎ RLS ที่ต้องเข้าระบบ — ไม่แตะในใบนี้ (แจ้งคนรวมงานแยก)
do $$
declare s record;
begin
  for s in select c.relname from pg_class c
            where c.relnamespace = 'public'::regnamespace and c.relkind = 'S'
              and ((case when c.relkind = 'S' then has_sequence_privilege('anon', c.oid, 'USAGE') end) or (case when c.relkind = 'S' then has_sequence_privilege('anon', c.oid, 'SELECT') end) or (case when c.relkind = 'S' then has_sequence_privilege('anon', c.oid, 'UPDATE') end))
  loop
    execute format('revoke all on sequence public.%I from anon, public', s.relname);
  end loop;
end $$;
revoke all on sequence public.hqd_move_0287_id_seq from anon, authenticated, public;
