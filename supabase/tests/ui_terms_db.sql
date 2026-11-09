-- ── ข้อทดสอบใบ 0285: ข้อความที่ฐานสร้าง (กระดิ่ง/อีเมล · ข้อความผิดพลาดของ hook) ไม่มีคำห้ามในคลังคำ (docs/glossary.md) ──
--   รายการคำ = scripts/lib/uiTerms.mjs (คำห้าม) ทุกคำ — tests/unit/uiTerms.test.ts ตรวจว่าไฟล์นี้มีครบ
--   ตกบนฐานก่อนลงใบ 0285: customer_accepted "ลูกค้าตอบรับ (ปิดการขายได้)" · hook "ระบบล็อกอิน"
-- รัน: docker exec -i <คอนเทนเนอร์ฐานทดสอบ> psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/ui_terms_db.sql
begin;
do $$
declare
  คำ text[] := array['ตัวแทนจำหน่าย', 'ตัวแทน', 'ใบเสนอแพ็กเกจ', 'โปรเจกต์', 'โปรเจค', 'ราคาส่ง HQ', 'ปิดดีล', 'ปิดการขายได้', 'ก๊อป', 'ล็อกอิน', 'เซสชัน', 'แอดมิน', 'เทมเพลต', 'กริด', 'โค้ดยืนยัน', 'ส่งโค้ด', 'เหตุผลที่เสีย', 'เหตุผลที่ปิดการขายไม่ได้', 'ลีด', 'ราคาส่งดีลเลอร์', 'โครงการ', 'เวอร์ชัน', 'คำขอราคา', 'ผู้ใช้งานและสิทธิ์', 'ผู้ใช้และสิทธิ์', 'เซลส์', 'ติดต่อผู้ดูแลระบบ', 'ม²', 'รีเซ็ตรหัสผ่าน', 'โหมดเดโม', 'โหมดสาธิต', 'โหมดทดลองใช้งาน', 'ราคาใช้ได้ถึง', ' vs ', 'รอบรวมงานฐาน', 'npx ', 'migration'];
  แบบ text[] := array['ดีล(?!เลอร์)', 'อัตราปิด(?!การขาย)'];   -- regex (คำที่เป็นส่วนของคำอื่น เช่น ดีล ใน ดีลเลอร์)
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
  raise notice 'ALL PASS';
end $$;
select 'ALL PASS' as result;
rollback;
