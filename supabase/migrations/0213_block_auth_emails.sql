-- ── ปิดอีเมลของระบบล็อกอินทั้งหมด (ลืมรหัสผ่าน · เลขเข้าระบบ) — บอสสั่ง 16 ต.ค. 69 ─────────────────────────
--
-- ที่มา: อีเมลล็อกอินของทุกบัญชีบนระบบจริงเป็นโดเมนที่เราไม่ได้คุม
--   ดีลเลอร์ 155 บัญชี = <รหัสสาขา>@partner-agent.co.th (โดเมนที่ยังไม่มีใครจด) · ผู้ดูแลเคยเป็น @benjamin.com (โดเมนจริงของคนอื่น)
--   ใครคุมโดเมนนั้นได้ = สั่ง /auth/v1/recover หรือ /auth/v1/otp ให้ส่งลิงก์/เลขเข้าระบบไปที่โดเมนตัวเอง แล้วยึดบัญชีได้
--   ซ่อนปุ่มในแอปอย่างเดียวไม่พอ — endpoint ของ Supabase เรียกตรงได้ด้วยกุญแจสาธารณะ
--
-- ตัวกัน: Send Email Hook ของ Supabase Auth ชี้มาที่ฟังก์ชันนี้ → ทุกคำขอส่งอีเมลของระบบล็อกอินถูกปฏิเสธ (403)
--   ครอบทุกชนิด (recovery · magiclink/OTP · signup · invite · email_change · reauthentication)
--   เพราะแอปไม่ได้ใช้อีเมลของระบบล็อกอินกับงานอื่นแล้ว: สร้าง/แก้บัญชีผ่านคำสั่งผู้ดูแล (ไม่ส่งเมล) · ปิดสมัครเองแล้ว
--   ปฏิเสธดีกว่าคืน {} — คืน {} = Supabase ถือว่า hook ส่งแล้ว จดหมายหายเงียบ ไม่มีใครรู้
--   อีเมลแจ้งเตือนของระบบ (กล่องขาออก email_outbox · ใบ 0193/0212) ไม่ผ่านทางนี้ ไม่กระทบ
--
-- ⚠️ ต้องเปิด hook ด้วย: Supabase Dashboard → Authentication → Hooks → Send Email Hook → Postgres → public.hook_send_email
--    (ในเครื่อง: supabase/config.toml [auth.hook.send_email]) · ลงใบนี้อย่างเดียวโดยไม่เปิด hook = ยังไม่กันอะไร
-- เปิดคืน: ปิด hook ใน Dashboard (เมื่อทุกบัญชีย้ายไปอีเมลจริงที่ยืนยันแล้ว)
-- ข้อทดสอบ: tests/scenario/auth-email-blocked.spec.ts

create or replace function public.hook_send_email(event jsonb) returns jsonb
  language plpgsql stable set search_path to '' as $$
begin
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message', 'auth_email_disabled: อีเมลของระบบล็อกอินปิดอยู่ — ลืมรหัสผ่าน ติดต่อ HQ'));
end $$;

comment on function public.hook_send_email(jsonb) is
  'Send Email Hook ของ Supabase Auth — ปฏิเสธทุกคำขอส่งอีเมลของระบบล็อกอิน (ลืมรหัสผ่าน/เลขเข้าระบบ) · ใบ 0213 · 16 ต.ค. 69';

revoke all on function public.hook_send_email(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.hook_send_email(jsonb) to supabase_auth_admin;
