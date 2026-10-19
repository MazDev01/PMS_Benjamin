// ── ตัวช่วยเทสต์: ปลดเครื่องหมาย must_change_password / must_verify_email ของบัญชีหนึ่ง ─────────────
//
// บอสตัดสิน 19 ต.ค. 69: ไม่มีหน้าบังคับแล้ว และ POST /api/admin/dealers ไม่ตั้งเครื่องหมายแล้ว (ข้อทดสอบ dealer-no-forced-gate.spec.ts)
// แต่ด่านฐานข้อมูลใบ 0187 ยังอยู่: เครื่องหมายค้าง = อ่าน/เขียนข้อมูลไม่ได้ → ตัวช่วยนี้คงไว้เป็นตัวกัน ถ้าบัญชีใดยังถือเครื่องหมาย
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
        app_metadata: { ...(u.app_metadata ?? {}), must_change_password: false, must_verify_email: false },   // ข้ามด่านยืนยันอีเมลติดต่อด้วย (ด่าน 1) — ข้อทดสอบที่ใช้ตัวนี้ไม่ได้ทดสอบเรื่องนั้น
      });
      if (upErr) throw new Error(`ปลดเครื่องหมายตั้งรหัสครั้งแรกของ ${email} ไม่สำเร็จ: ${upErr.message}`);
      return;
    }
    if (data.users.length < 1000) break;
  }
}
