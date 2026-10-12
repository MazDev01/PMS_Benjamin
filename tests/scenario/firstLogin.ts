// ── ตัวช่วยเทสต์: ข้ามหน้า "ตั้งรหัสผ่านใหม่ตอนเข้าระบบครั้งแรก" ─────────────────────────
//
// บัญชีที่สร้างจาก POST /api/admin/dealers ถูกทำเครื่องหมาย must_change_password (บอสสั่ง 15 ก.ย. 69)
// เทสต์ที่ "ไม่ได้ทดสอบหน้านั้น" แต่ต้องเข้าใช้หน้าอื่นของดีลเลอร์ด้วยบัญชีที่เพิ่งสร้าง ต้องปลดเครื่องหมายก่อน
// ไม่งั้นทุกหน้าจะติดอยู่ที่หน้าตั้งรหัส · หน้านั้นมีเทสต์ของตัวเองที่ first-login-password.spec.ts
import { createClient } from "@supabase/supabase-js";
import { ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY } from "./adminEnv";

export async function ข้ามตั้งรหัสครั้งแรก(email: string): Promise<void> {
  if (!ADMIN_SERVICE_ROLE_KEY || !email) return;
  const svc = createClient(ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const เป้า = email.trim().toLowerCase();
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await svc.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`อ่านรายชื่อบัญชีไม่สำเร็จ: ${error.message}`);
    const u = data.users.find(x => (x.email ?? "").toLowerCase() === เป้า);
    if (u) {
      const { error: upErr } = await svc.auth.admin.updateUserById(u.id, {
        app_metadata: { ...(u.app_metadata ?? {}), must_change_password: false },
      });
      if (upErr) throw new Error(`ปลดเครื่องหมายตั้งรหัสครั้งแรกของ ${email} ไม่สำเร็จ: ${upErr.message}`);
      return;
    }
    if (data.users.length < 1000) break;
  }
}
