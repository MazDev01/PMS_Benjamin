import { redirect } from "next/navigation";

// ── /reset-password ปิดแล้ว (บอสตัดสิน 19 ต.ค. 69 · รอบ 2 ช่วง ก) ─────────────────────────────────────────────
//   เดิมเป็นปลายทางของลิงก์รีเซ็ตรหัสทางอีเมล — อีเมลล็อกอินปิดทั้งระบบแล้ว (ใบ 0213) · หน้าเดิมยอมรับทุกคนที่เข้าระบบอยู่
//   URL เดิมพาไปหน้าหลัก (ยังไม่เข้าระบบ = พาไปหน้าเข้าสู่ระบบเอง) · ข้อทดสอบ: tests/scenario/flow-a-safety.spec.ts
export default function ResetPasswordRemoved() {
  redirect("/hq/dashboard");
}
