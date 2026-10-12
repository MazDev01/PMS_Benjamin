import { readFileSync } from "node:fs";
import path from "node:path";

// ค่าตั้งต้นของเทสต์ที่ต้องใช้ backend จริง — แยกความลับออกจากโค้ด
//
// ทำไม: รหัสผ่านบัญชีทดสอบเคยเขียนไว้ตรง ๆ ในไฟล์เทสต์ → ติดไปกับ git history ตลอดกาล
// ตอนนี้อ่านจาก tests/.env.test (โดน .gitignore คุมด้วยกฎ .env*) หรือจาก process.env (CI)
// ดูรายการคีย์ที่ต้องตั้งได้ที่ tests/.env.example
//
// ไม่มีไฟล์/ไม่ได้ตั้งค่า = ไม่ใช่ error — ชุดเทสต์ที่ต้องใช้บัญชีจะข้ามตัวเองพร้อมบอกเหตุผล

function readEnvFile(file: string): Map<string, string> {
  const out = new Map<string, string>();
  try {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const s = line.trim();
      if (!s || s.startsWith("#")) continue;
      const i = s.indexOf("=");
      if (i > 0) out.set(s.slice(0, i).trim(), s.slice(i + 1).trim());
    }
  } catch { /* ไม่มีไฟล์ = ใช้ค่าจาก process.env อย่างเดียว */ }
  return out;
}

const ROOT = path.join(__dirname, "../..");
const appVars  = readEnvFile(path.join(ROOT, "apps/dealer/.env.local"));
const testVars = readEnvFile(path.join(ROOT, "tests/.env.test"));

/** ค่าที่แอปดีลเลอร์ใช้จริง (เป็นตัวกำหนดว่าหน้าเว็บดึงข้อมูลจากไหน)
 *  ⚠️ ต้องอ่าน process.env ก่อนไฟล์เสมอ — Next.js ก็ทำแบบเดียวกัน (ค่าที่สั่งจากบรรทัดคำสั่งชนะ .env.local)
 *  ถ้าอ่านไฟล์อย่างเดียว: สั่ง NEXT_PUBLIC_DATA_SOURCE=api แล้วแอปเป็นโหมด api จริง
 *  แต่เทสต์ยังเข้าใจว่าเป็นโหมด supabase → ข้ามชุด api ทิ้ง แล้วรายงานเขียวทั้งที่ไม่ได้ตรวจ */
export function appEnv(key: string): string {
  return process.env[key] ?? appVars.get(key) ?? "";
}

function testEnv(key: string): string {
  return process.env[key] ?? testVars.get(key) ?? "";
}

export const SUPABASE_URL = appEnv("NEXT_PUBLIC_SUPABASE_URL");
export const SUPABASE_ANON = appEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
/** แอปคุยกับ backend จริงอยู่หรือเปล่า (ไม่ใช่ชุดตัวอย่างในเครื่อง)
 *  ⚠️ "จริง" มีสองแบบแล้ว: supabase = ยิงเข้าฐานตรง · api = ผ่าน backend ของเราเอง (ระยะ 1)
 *  เทียบกับ "supabase" อย่างเดียวจะทำให้ทั้งชุดข้ามตัวเองเงียบ ๆ ตอนรันโหมด api
 *  แล้วรายงานว่า "ผ่าน" ทั้งที่ไม่ได้ทดสอบอะไรเลย — กับดักเดียวกับ REAL_BACKEND ฝั่งแอป */
const SRC = appEnv("NEXT_PUBLIC_DATA_SOURCE");
export const REAL_BACKEND = SRC === "supabase" || SRC === "api";

export type Account = { email: string; password: string };
type Role = "RYG" | "CNX" | "ADMIN";

function account(role: Role): Account {
  return { email: testEnv(`TEST_${role}_EMAIL`), password: testEnv(`TEST_${role}_PASSWORD`) };
}

export const RYG = account("RYG");     // ดีลเลอร์ระยอง
export const CNX = account("CNX");     // ดีลเลอร์เชียงใหม่ (ใช้ทดสอบการกันข้ามสาขา)
export const ADMIN = account("ADMIN"); // ผู้ดูแลสำนักงานใหญ่

const missing = ([["RYG", RYG], ["CNX", CNX], ["ADMIN", ADMIN]] as const)
  .filter(([, a]) => !a.email || !a.password).map(([r]) => r);

/** เหตุผลที่ต้องข้ามชุดเทสต์นี้ — คืน "" ถ้าพร้อมรัน */
export function skipReason(): string {
  if (!REAL_BACKEND) return "ข้ามเพราะแอปตั้งเป็นโหมด local (ชุดนี้ทดสอบ backend จริง)";
  if (!SUPABASE_URL || !SUPABASE_ANON) return "ข้ามเพราะ apps/dealer/.env.local ยังไม่มี URL/anon key";
  if (missing.length) return `ข้ามเพราะยังไม่ได้ตั้งบัญชีทดสอบ ${missing.join("/")} — ดู tests/.env.example`;
  return "";
}
