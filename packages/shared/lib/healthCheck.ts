// ── เช็กว่าระบบ "ยังใช้งานได้จริง" ไม่ใช่แค่ "เซิร์ฟเวอร์ยังไม่ตาย" ────────────────────
//
// ทำไมต้องมี: ทุกบริการที่ใช้รันระบบจริง (Vercel · เซิร์ฟเวอร์บริษัท · ตัวเฝ้าระวัง) ต้องมีที่อยู่
//   สักที่ให้ยิงถามเป็นระยะว่า "ยังไหวไหม" ถ้าไม่มี จะรู้ว่าระบบล่มก็ต่อเมื่อผู้ใช้โทรมาแจ้ง
//
// ⚠️ ต้องเช็ก "ของที่ถ้าพังแล้วผู้ใช้ใช้งานไม่ได้จริง" ไม่ใช่แค่ตอบ 200 กลับไปเฉย ๆ
//   ตัวที่ตอบ 200 ตลอดไม่ว่าอะไรจะเกิดขึ้น = ไม่มีประโยชน์ เพราะจะไม่มีวันแจ้งเตือน
//   ที่นี่จึงยิงถามฐานข้อมูลจริงด้วย — ถ้าฐานข้อมูลล่ม แอปก็ใช้งานไม่ได้ ต้องถือว่าไม่ไหว
//
// ⚠️ ห้ามใส่ข้อมูลลับหรือรายละเอียดภายในลงในคำตอบ — ที่อยู่นี้เปิดให้เรียกได้โดยไม่ต้องล็อกอิน
//   (ตัวเฝ้าระวังส่วนใหญ่เรียกแบบไม่มีสิทธิ์) จึงบอกแค่ "ไหว/ไม่ไหว" กับเวลาที่ใช้ ไม่บอกสาเหตุดิบ
import { NextResponse } from "next/server";

type Check = { name: string; ok: boolean; ms: number };

async function checkDatabase(): Promise<Check> {
  const started = Date.now();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (!url || !key) return { name: "database", ok: false, ms: 0 };
  try {
    // ยิงถาม "ตารางจริง" ไม่ใช่หน้าแรกของบริการ — ต้องพิสูจน์ว่าฐานข้อมูลตอบได้จริง
    //   (เคยลองยิง /rest/v1/ เฉย ๆ แล้วได้ 401 ตลอด เพราะปลายทางนั้นต้องการสิทธิ์เพิ่ม
    //    ผลคือหน้าเช็กสุขภาพรายงานว่า "ไม่ไหว" ทั้งที่ระบบใช้งานได้ปกติ — 7 ส.ค. 69)
    // ผู้ไม่ล็อกอินจะได้ 0 แถวกลับมาตามกฎความปลอดภัย ซึ่งไม่เป็นไร — เราดูแค่ว่า "ตอบ 200 ไหม"
    // ตั้งเวลาไว้ 5 วินาที: นานกว่านี้ถือว่าไม่ไหวแล้ว ผู้ใช้ก็คงรอไม่ไหวเหมือนกัน
    const res = await fetch(`${url}/rest/v1/dealers?select=code&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(5_000),
      cache: "no-store",
    });
    return { name: "database", ok: res.ok, ms: Date.now() - started };
  } catch {
    return { name: "database", ok: false, ms: Date.now() - started };
  }
}

/** ค่าตั้งต้นที่ขาดไม่ได้ — ขาดข้อไหนแอปทำงานไม่ครบ ต้องรู้ตั้งแต่ตอนนำขึ้นระบบ ไม่ใช่ตอนผู้ใช้กด */
function checkConfig(required: string[]): Check {
  const missing = required.filter(k => !process.env[k]);
  return { name: "config", ok: missing.length === 0, ms: 0 };
}

/**
 * สร้าง handler ของหน้าเช็กสุขภาพ — ใช้ร่วมกันทั้งสองแอป
 * ok  = 200 · ไม่ไหว = 503 (ตัวเฝ้าระวังดูรหัสนี้เป็นหลัก ไม่ได้อ่านเนื้อหา)
 */
export function healthHandler(appName: string, requiredEnv: string[]) {
  return async function GET() {
    const checks = [checkConfig(requiredEnv), await checkDatabase()];
    const ok = checks.every(c => c.ok);
    return NextResponse.json(
      {
        app: appName,
        status: ok ? "ok" : "degraded",
        checks: checks.map(c => ({ name: c.name, ok: c.ok, ms: c.ms })),
        // commit ที่เว็บนี้รันอยู่ (Vercel ใส่ให้ตอน build) — ใช้ยืนยันหลังขึ้นระบบว่าเว็บจริงเป็น commit ใหม่แล้ว
        //   โดยไม่ต้องล็อกอิน Vercel (บอสสั่ง 21 ต.ค. 69) · repo เป็นสาธารณะ เลข commit จึงไม่ใช่ข้อมูลลับ · ในเครื่อง = null
        commit: process.env.VERCEL_GIT_COMMIT_SHA ? process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7) : null,
        at: new Date().toISOString(),
      },
      { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
    );
  };
}
