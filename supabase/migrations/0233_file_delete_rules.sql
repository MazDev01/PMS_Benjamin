-- ── ใบ 0233: กติกาลบไฟล์ (รอบ 4 · บอสตัดสิน 21 ต.ค. 69 ข้อตัดสิน 4) ─────────────────────────────────────────────
--
-- หน้าไฟล์ของดีลเลอร์ดูอย่างเดียว · ลบไฟล์ได้ที่แผงลีด/แผงลูกค้าเท่านั้น และ
--   1) ลบได้เฉพาะไฟล์ของสาขาตัวเอง (นโยบาย files_delete เดิมกันอยู่แล้ว: dealer_code = auth_dealer · HQ ลบไฟล์ดีลเลอร์ไม่ได้)
--   2) ไฟล์ของใบเสนอราคาที่ส่งให้ลูกค้าแล้ว (ส่งแล้ว/ตอบรับ/ปฏิเสธ/หมดอายุ/ถูกแทนที่) ลบไม่ได้ — ใบเป็นเอกสารที่ถึงมือลูกค้าแล้ว
--      ไฟล์ของใบ = แถวที่ระบบสร้างตอนออกใบ (ใบ 0210: หมวด "ใบเสนอราคา" · ชื่อมีเลขที่ใบ)
-- ไม่ตรวจ: service role / งานในฐาน (ลบดีลเลอร์ทั้งสาขา · ชุดล้างข้อมูลทดสอบ) — แบบเดียวกับตัวดักตัวอื่น
-- ข้อทดสอบ: supabase/tests/file_delete_rules.sql

create or replace function public.files_delete_guard() returns trigger
  language plpgsql set search_path to 'public' as $$
begin
  if coalesce(auth.role(), '') <> 'authenticated' then return old; end if;
  -- ตรวจเฉพาะ "ผู้ใช้ลบไฟล์เอง" (คำสั่งตรงจากแอป รันในบทบาท authenticated) — การลบต่อเนื่องในคำสั่งของระบบ
  --   (ลบลูกค้าทั้งก้อน delete_customer_cascade · ลบต่อเนื่องผ่าน FK) ให้กติกาของแถวแม่ตัดสินเอง (เช่น ใบ won ลบไม่ได้ 0203)
  if current_user <> 'authenticated' or pg_trigger_depth() > 1 then return old; end if;
  if old.category = 'ใบเสนอราคา' and exists (
       select 1 from quotations q
        where q.dealer_code = old.dealer_code and q.status <> 'draft' and position(q.id in old.name) > 0) then
    raise exception 'file_of_sent_quote: ไฟล์นี้เป็นใบเสนอราคาที่ส่งให้ลูกค้าแล้ว — ลบไม่ได้';
  end if;
  return old;
end $$;
revoke all on function public.files_delete_guard() from public, anon, authenticated, service_role;

drop trigger if exists files_delete_guard on public.files;
create trigger files_delete_guard before delete on public.files
  for each row execute function public.files_delete_guard();
