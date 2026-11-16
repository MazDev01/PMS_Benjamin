-- ── ข้อทดสอบใบ 0285: ข้อความที่ฐานสร้าง (กระดิ่ง/อีเมล · ข้อความผิดพลาดของ hook) ไม่มีคำห้ามในคลังคำ (docs/glossary.md) ──
--   รายการคำ = scripts/lib/uiTerms.mjs (คำห้าม) ทุกคำ — tests/unit/uiTerms.test.ts ตรวจว่าไฟล์นี้มีครบ
--   ตกบนฐานก่อนลงใบ 0285: customer_accepted "ลูกค้าตอบรับ (ปิดการขายได้)" · hook "ระบบล็อกอิน"
-- รัน: docker exec -i <คอนเทนเนอร์ฐานทดสอบ> psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/ui_terms_db.sql
begin;
do $$
declare
  คำ text[] := array['ตัวแทนจำหน่าย', 'ตัวแทน', 'ใบเสนอแพ็กเกจ', 'โปรเจกต์', 'โปรเจค', 'ราคาส่ง HQ', 'ปิดดีล', 'ปิดการขายได้', 'ก๊อป', 'ล็อกอิน', 'เซสชัน', 'แอดมิน', 'เทมเพลต', 'กริด', 'โค้ดยืนยัน', 'ส่งโค้ด', 'เหตุผลที่เสีย', 'เหตุผลที่ปิดการขายไม่ได้', 'ลีด', 'ราคาส่งดีลเลอร์', 'โครงการ', 'เวอร์ชัน', 'คำขอราคา', 'ผู้ใช้งานและสิทธิ์', 'ผู้ใช้และสิทธิ์', 'เซลส์', 'ติดต่อผู้ดูแลระบบ', 'ม²', 'รีเซ็ตรหัสผ่าน', 'โหมดเดโม', 'โหมดสาธิต', 'โหมดทดลองใช้งาน', 'ราคาใช้ได้ถึง', ' vs ', 'รอบรวมงานฐาน', 'npx ', 'migration',
    -- ใบ 0286 (บอสอนุมัติ 11–12 พ.ย. 69): คำทับศัพท์ + โมดูล + คิวรอ
    'แดชบอร์ด', 'โปรไฟล์', 'โน้ต', 'อัปโหลด', 'อัปเดต', 'โควตา', 'ไทม์ไลน์', 'สเปก', 'โฟลเดอร์', 'ล็อกแล้ว', 'รีเฟรช', 'รีเซ็ต', 'แอป', 'ป๊อปอัป', 'เปอร์เซ็นต์', 'คิวรอ', 'โมดูล',
    -- คำบนการ์ด (บอสสั่ง 13 พ.ย. 69 · งาน A)
    'ถูกแทนที่', 'เจาะดูที่มา'];
  แบบ text[] := array['ดีล(?!เลอร์)', 'อัตราปิด(?!การขาย)', 'เพจ(?! ?Facebook)', 'รอโอน(?!เงิน)'];   -- regex (คำที่เป็นส่วนของคำอื่น เช่น ดีล ใน ดีลเลอร์)
  ฟ record;   -- ใบ 0286: ฟังก์ชันที่สร้างข้อความบนจอ
  k text; n int; ตัวอย่าง text; ข้อความhook text := public.hook_send_email('{}'::jsonb) #>> '{error,message}';
begin
  foreach k in array คำ loop
    select count(*), min(kind || ': ' || title || ' / ' || body) into n, ตัวอย่าง from notification_kinds where position(k in title) > 0 or position(k in body) > 0 or position(k in goes_to) > 0;
    if n > 0 then raise exception 'FAIL: แจ้งเตือนมีคำห้าม "%" % แถว (เช่น %)', k, n, ตัวอย่าง; end if;
    if position(k in (public.hook_send_email('{}'::jsonb) #>> '{error,message}')) > 0 then raise exception 'FAIL: ข้อความ hook_send_email มีคำห้าม "%"', k; end if;
  end loop;
  foreach k in array แบบ loop
    select count(*), min(kind || ': ' || title || ' / ' || body) into n, ตัวอย่าง from notification_kinds where title ~ k or body ~ k or goes_to ~ k;
    if n > 0 then raise exception 'FAIL: แจ้งเตือนมีคำห้าม (แบบ %) % แถว (เช่น %)', k, n, ตัวอย่าง; end if;
    if ข้อความhook ~ k then raise exception 'FAIL: ข้อความ hook_send_email มีคำห้าม (แบบ %)', k; end if;
  end loop;
  if position('ล็อกอิน' in (public.hook_send_email('{}'::jsonb) #>> '{error,message}')) > 0 then raise exception 'FAIL: hook ยังใช้ ล็อกอิน'; end if;
  if (public.hook_send_email('{}'::jsonb) #>> '{error,message}') not like 'auth_email_disabled:%' then raise exception 'FAIL: hook ต้องคงรหัส auth_email_disabled'; end if;
  if not exists (select 1 from notification_kinds where kind = 'customer_accepted' and title = 'ลูกค้าตอบรับ (ปิดการขายสำเร็จ)') then raise exception 'FAIL: customer_accepted ชื่อใหม่'; end if;
  -- ── ใบ 0286: ข้อความใน 11 ฟังก์ชันที่ผู้ใช้เห็น (ไม่นับหมายเหตุ --) ไม่มีคำห้าม · ผู้ทำงานที่ระบบติ๊กให้ = 'ระบบทำให้'
  --   ตกบนฐานก่อนลงใบ 0286: 'อัปเดตอัตโนมัติ' · 'สเปก / รายละเอียดงาน' · 'หัวข้อโน้ต' · 'อัปเดตราคา' · 'ไทม์ไลน์' · 'อัปโหลด' · 'โควตา' · 'คิวรอ'
  n := 0;
  for ฟ in select p.proname, regexp_replace(p.prosrc, '--[^\n]*', '', 'g') as src from pg_proc p join pg_namespace s on s.oid = p.pronamespace
            where s.nspname = 'public' and p.proname in ('_lead_info_tasks', '_lead_sync_append', '_lead_tasks_five_steps', 'lead_apply', 'quotations_created_lead_sync',
              '_lead_missing_for_quote', 'customer_notes_required', 'hq_materials_import', 'quote_files_object_guard', 'storage_quota_set', 'transfer_hq_leads') loop
    n := n + 1;
    foreach k in array คำ loop
      if position(k in ฟ.src) > 0 then raise exception 'FAIL: ฟังก์ชัน % มีคำห้าม "%"', ฟ.proname, k; end if;
    end loop;
    foreach k in array แบบ loop
      if ฟ.src ~ k then raise exception 'FAIL: ฟังก์ชัน % มีคำห้าม (แบบ %)', ฟ.proname, k; end if;
    end loop;
  end loop;
  if n <> 11 then raise exception 'FAIL: หาฟังก์ชันที่สร้างข้อความบนจอได้ % จาก 11 (ชื่อเปลี่ยน = แก้รายการในข้อทดสอบนี้)', n; end if;
  for ฟ in select p.proname, p.prosrc from pg_proc p join pg_namespace s on s.oid = p.pronamespace
            where s.nspname = 'public' and p.proname in ('_lead_info_tasks', '_lead_sync_append', '_lead_tasks_five_steps', 'lead_apply', 'quotations_created_lead_sync') loop
    if position('''ระบบทำให้''' in ฟ.prosrc) = 0 then raise exception 'FAIL: % ไม่ได้บันทึกผู้ทำโดยระบบเป็น ระบบทำให้', ฟ.proname; end if;
  end loop;
  -- ── คำบนการ์ด (บอสสั่ง 13 พ.ย. 69): quotations_version_guard ไม่มีคำห้ามนอกจาก 2 ข้อความที่แอปแปลเอง (แบบ ข · ไม่มีใบปรับฐาน)
  --   ข้อยกเว้นตรงตัว: ฟังก์ชัน quotations_version_guard + รหัส quote_superseded · quote_superseded_manual (ตัดเฉพาะบรรทัด raise ของ 2 รหัสนี้)
  --   แอปแปลที่ packages/shared/lib/dbMessages.ts (DbError + friendlyError · tests/unit/dbMessages.test.ts)
  --   ⚠️ ลบข้อยกเว้นนี้ในรอบที่มีใบปรับฐานถัดไป (แก้ข้อความในฐานเป็น "ฉบับเก่า" แล้วตรวจทั้งฟังก์ชัน) — คิวใน docs/FLOW.html กฎ card-words-nov13
  for ฟ in select p.proname, regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'),
              'raise exception ''quote_superseded(_manual)?:[^\n]*', '', 'g') as src
            from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = 'quotations_version_guard' loop
    foreach k in array คำ loop
      if position(k in ฟ.src) > 0 then raise exception 'FAIL: ฟังก์ชัน % มีคำห้าม "%" นอกข้อความที่ยกเว้น', ฟ.proname, k; end if;
    end loop;
  end loop;
  if not exists (select 1 from pg_proc where proname = 'quotations_version_guard') then raise exception 'FAIL: ไม่พบฟังก์ชัน quotations_version_guard (ชื่อเปลี่ยน = แก้ข้อยกเว้น)'; end if;
  raise notice 'ALL PASS';
end $$;
select 'ALL PASS' as result;
rollback;
