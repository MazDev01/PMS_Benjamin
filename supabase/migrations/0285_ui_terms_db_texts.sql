-- ── ใบ 0285: คำบนจอที่ฐานสร้าง ให้ตรงคลังคำ (จองโดยเซสชัน ef · บอสสั่ง 9 พ.ย. 69 "ตรวจคำที่ดูแปลกทั้ง 2 แอป" · docs/glossary.md) ──
-- ข้อความที่ฐานเขียนเอง (กระดิ่ง/อีเมล · ข้อความผิดพลาด) แก้ได้ทางใบปรับฐานเท่านั้น · แถวที่ส่งไปแล้ว (notifications · email_outbox ·
-- audit_log) ไม่แก้ย้อนหลัง — มีผลกับข้อความที่สร้างหลังลงใบนี้ · รันซ้ำได้ (create or replace · update ด้วยคีย์)
--   1) กระดิ่ง/อีเมล HQ "ลูกค้าตอบรับ (ปิดการขายได้)" → "ลูกค้าตอบรับ (ปิดการขายสำเร็จ)" (คลังคำ: เลิกใช้ "ปิดการขายได้")
--   2) ข้อความผิดพลาดของ Send Email Hook "อีเมลของระบบล็อกอินปิดอยู่" → "อีเมลของระบบเข้าระบบปิดอยู่" (ทั้งระบบใช้ "เข้าระบบ")
--      คงรหัสนำหน้า auth_email_disabled: (ข้อทดสอบ/หน้าเว็บจับด้วยรหัสนี้)
-- ข้อทดสอบ: supabase/tests/ui_terms_db.sql (ข้อความของฐานไม่มีคำห้ามในคลังคำ)

update public.notification_kinds set title = 'ลูกค้าตอบรับ (ปิดการขายสำเร็จ)'
 where kind = 'customer_accepted' and title = 'ลูกค้าตอบรับ (ปิดการขายได้)';

create or replace function public.hook_send_email(event jsonb) returns jsonb
  language plpgsql stable set search_path to '' as $$
begin
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message', 'auth_email_disabled: อีเมลของระบบเข้าระบบปิดอยู่ — ลืมรหัสผ่าน ติดต่อ HQ'));
end $$;
comment on function public.hook_send_email(jsonb) is
  'Send Email Hook ของ Supabase Auth — ปฏิเสธทุกคำขอส่งอีเมลของระบบเข้าระบบ (ลืมรหัสผ่าน/เลขเข้าระบบ) · ใบ 0213 · ข้อความใบ 0285';
revoke all on function public.hook_send_email(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.hook_send_email(jsonb) to supabase_auth_admin;
