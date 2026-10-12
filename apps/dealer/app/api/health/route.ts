// เช็กสุขภาพของแอปดีลเลอร์ — ให้ตัวเฝ้าระวัง/ตัวจัดการเซิร์ฟเวอร์ยิงถามเป็นระยะ
// ตรรกะอยู่ที่ packages/shared/lib/healthCheck.ts (ใช้ร่วมกับแอป HQ แก้ที่เดียวมีผลทั้งสองแอป)
import { healthHandler } from "@pms/shared/lib/healthCheck";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";   // ห้ามแคช — ต้องเช็กสดทุกครั้งที่ถูกถาม

// แอปดีลเลอร์ไม่ต้องใช้ service_role (ไม่มี route ฝั่งผู้ดูแล) — ขอแค่ต่อฐานข้อมูลได้
export const GET = healthHandler("dealer", [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
]);
