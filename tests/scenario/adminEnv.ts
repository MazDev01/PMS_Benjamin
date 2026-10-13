import { readFileSync } from "node:fs";
import path from "node:path";

// อ่าน service-role key สำหรับ global-setup/global-teardown เท่านั้น (Node-side, ไม่เคยถูกบันเดิลลงเบราว์เซอร์)
// ต่างจาก supabaseEnv.ts (อ่านแค่ anon key ที่ปลอดภัยฝั่ง client)
function readEnvFile(file: string): Map<string, string> {
  const out = new Map<string, string>();
  try {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const s = line.trim();
      if (!s || s.startsWith("#")) continue;
      const i = s.indexOf("=");
      if (i > 0) out.set(s.slice(0, i).trim(), s.slice(i + 1).trim());
    }
  } catch { /* ไม่มีไฟล์ */ }
  return out;
}

const ROOT = path.join(__dirname, "../..");
const hqVars = readEnvFile(path.join(ROOT, "apps/hq/.env.local"));

// ⚠️ อ่าน process.env ก่อนไฟล์ เหมือน supabaseEnv.ts (แก้ 13 ต.ค. 69)
//    เดิมอ่านไฟล์อย่างเดียว → สั่งรันชุดทดสอบกับฐานอีกตัว (NEXT_PUBLIC_SUPABASE_URL=…) แล้วแอปกับข้อทดสอบไปฐานใหม่
//    แต่ตัวเตรียม/เก็บกวาดข้อมูลยังยิงฐานเดิม = เตรียมข้อมูลผิดฐานโดยไม่มีอะไรบอก
export const ADMIN_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? hqVars.get("NEXT_PUBLIC_SUPABASE_URL") ?? "";
export const ADMIN_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? hqVars.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

/** เซิร์ฟเวอร์ตั้งค่า service_role ครบหรือยัง
 *
 *  ใช้บังคับให้เทสต์ "เข้มขึ้น" เมื่อเครื่องพร้อม — หลายเทสต์เคยเขียนว่า
 *  `expect([401, 501]).toContain(status)` คือยอมรับ 501 ("ยังไม่ได้ตั้งค่า") ว่าผ่านด้วย
 *  ซึ่งบนเครื่องที่ตั้งค่าครบแล้วกลายเป็นช่องให้ผ่านฟรี: ถ้าวันหนึ่งการตรวจสิทธิ์พังจนตอบ 501
 *  แทนที่จะเป็น 401/403 เทสต์ก็ยังเขียว (ผลตรวจสอบระบบรอบ 2 · เครื่องมือตรวจ)
 *
 *  วิธีใช้: `expect(statuses(401)).toContain(res.status())` — พร้อมแล้วเหลือ [401] เท่านั้น
 */
export const SERVICE_ROLE_READY = ADMIN_SERVICE_ROLE_KEY.length > 0;

/** รายการสถานะที่ยอมรับได้ — เครื่องที่ตั้งค่าครบจะไม่ยอมรับ 501 อีกต่อไป */
export function statuses(...expected: number[]): number[] {
  return SERVICE_ROLE_READY ? expected : [...expected, 501];
}
