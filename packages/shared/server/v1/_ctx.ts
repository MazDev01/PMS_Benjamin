// ── พื้นฐานของทุกเส้นทาง /api/v1 ─────────────────────────────────────────────────
//
// ระยะ 1 ของแผนแยก backend — ย้าย "ท่อส่งข้อมูล" มาที่เซิร์ฟเวอร์ ยังไม่ย้าย "กฎธุรกิจ"
//
// ⚠️ หลักสำคัญของระยะนี้: พฤติกรรมต้องเหมือนเดิมเป๊ะ
//   backend ทำงาน "ในนามผู้ใช้ที่เรียกมา" โดยส่งใบผ่าน (JWT) ของเขาต่อให้ฐานข้อมูล
//   ไม่ได้ใช้ service_role — RLS ทั้ง 72 กฎจึงยังบังคับเหมือนเดิมทุกประการ
//   ผู้ใช้เห็นข้อมูลชุดเดิม สิทธิ์เท่าเดิม ต่างแค่คำขอเดินผ่านเซิร์ฟเวอร์ของเราอีกทอด
//
//   ทำแบบนี้เพราะถ้าเปลี่ยนทั้ง "ทางเดิน" และ "กฎ" พร้อมกัน เวลาพังจะแยกไม่ออกว่า
//   พังเพราะย้ายท่อ หรือพังเพราะกฎเปลี่ยน · การย้าย service_role + กฎ อยู่ที่ระยะ 2 และ 4
import { NextResponse, type NextRequest } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { PageError } from "./_page";
import { BadInput } from "./_valid";
import { callerToken } from "./_cookie";

export const runtime = "nodejs";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
// ── จำกัดจำนวนคำขอต่อคนต่อนาที (ผลตรวจระบบ 19 ส.ค. 69) ──────────────────────────
//
// เดิมด่านนี้มีเฉพาะ /api/admin/* (7 เส้นทาง) ส่วนงานขายทั้งหมดยิงได้ไม่จำกัด
// บัญชีดีลเลอร์ที่ถูกขโมยจึงดูดข้อมูลทั้งสาขาออกไปได้เร็วมาก โดยไม่มีอะไรหน่วง
//
// โควตาตั้งจากการใช้งานจริง: เปิดหน้าหนึ่งยิงราว 13-14 คำขอ (วัดจริง 27 ส.ค. 69 · โหลดตาราง + สรุป + ตั้งค่า)
//   ยังหยุดสคริปต์ที่ไล่ดูดข้อมูลรัว ๆ ได้ทันทีเหมือนเดิม
//
// ⚠️ ทำไมถึงขยับขึ้นจาก 600/120 (27 ส.ค. 69): โควตานี้นับ "ต่อบัญชี" ไม่ใช่ "ต่อคน"
//    แต่ระบบออกแบบให้ 1 สาขา = 1 บัญชี — เซลส์ทั้งสาขาใช้บัญชีเดียวกัน
//    สาขาที่มีเซลส์ 5 คนทำงานพร้อมกันจึงได้โควตาจริงคนละ 120 คำขอ/นาที (~8 หน้า/นาที)
//    ช่วงงานเร่งจะชนเพดานทั้งที่ไม่มีใครทำอะไรผิด (เจอจริงในชุดทดสอบ: ขึ้น 429 ระหว่างรัน)
//    1,500/300 = สาขา 5 คน ได้คนละ ~300 อ่าน/นาที (~22 หน้า/นาที) ซึ่งเกินการใช้งานจริงมาก
//    ส่วนสคริปต์ดูดข้อมูลยังโดนหยุดอยู่ดี เพราะมันยิงหลักพัน-หมื่นต่อนาที ไม่ใช่หลักร้อย
//
// ตั้งค่าทับได้ด้วย env (ไม่ต้องแก้โค้ด): PMS_RATE_READ / PMS_RATE_WRITE
const เลขจาก = (v: string | undefined, ค่าเริ่มต้น: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : ค่าเริ่มต้น;
};
const LIMIT_READ  = { max: เลขจาก(process.env.PMS_RATE_READ, 1_500), windowSec: 60 };
const LIMIT_WRITE = { max: เลขจาก(process.env.PMS_RATE_WRITE, 300), windowSec: 60 };

/** ตรวจโควตาของผู้เรียกเอง — นับด้วย client ของผู้ใช้คนนั้น ไม่ต้องใช้กุญแจระดับระบบ
 *
 *  ⚠️ แอปดีลเลอร์ไม่มี (และไม่ควรมี) กุญแจระดับระบบ ถ้าผูกด่านนี้ไว้กับกุญแจนั้น
 *     ฝั่งดีลเลอร์จะข้ามด่านทั้งหมดแบบเงียบ ๆ — ซึ่งเป็นฝั่งที่ต้องกันมากที่สุด
 *  คีย์ประกอบจาก auth.uid() ที่ฝั่งฐานข้อมูล (0146) ผู้เรียกเลือกไม่ได้ว่าจะนับให้ใคร
 *  fail-open: ตัวนับมีปัญหา = ปล่อยผ่าน ดีกว่าปิดบริการเพราะตัวนับพัง */
async function withinQuota(sb: SupabaseClient, scope: "read" | "write", max: number, windowSec: number): Promise<boolean> {
  try {
    const { data, error } = await sb.rpc("check_own_rate_limit", {
      p_scope: scope, p_max: max, p_window_seconds: windowSec,
    });
    if (error) { console.warn("[rateLimit] RPC ขัดข้อง — ปล่อยผ่าน", error.message); return true; }
    return data !== false;
  } catch (e) {
    console.warn("[rateLimit] ปล่อยผ่าน", e);
    return true;
  }
}

/** ตอบกลับแบบมีเหตุผลติดไปด้วยเสมอ — หน้าเว็บเอาไปแสดงตรง ๆ ได้
 *  code = รหัสของ Postgres (เช่น 23503 ชน FK) — ฝั่งแอปแปลงเป็นข้อความที่คนอ่านรู้เรื่องต่อ
 *  ไม่ส่งไปด้วยจะเสียความสามารถนั้นทั้งระบบ (friendlyError อ่านจาก DbError.code) */
export function fail(status: number, error: string, code?: string) {
  return NextResponse.json(code ? { error, code } : { error }, { status });
}

export function ok<T>(data: T) {
  // ข้อมูลผู้ใช้ห้ามถูกแคชโดยตัวกลางใด ๆ (คนละสาขาเห็นคนละชุด)
  return NextResponse.json(data as object, { headers: { "Cache-Control": "no-store, private" } });
}

/** สร้าง client ที่ "เป็นตัวผู้ใช้คนที่เรียกมา" — RLS ทำงานเหมือนตอนเบราว์เซอร์ยิงเอง
 *  ใบผ่านมาจาก cookie (ระยะ 4) หรือ header (สคริปต์ดูแลระบบ/ชุดทดสอบ) — ดู _cookie.ts */
export function asCaller(req: NextRequest): SupabaseClient | null {
  const token = callerToken(req);
  if (!token || !URL_ || !ANON) return null;
  return createClient(URL_, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

/** ห่อ handler: จับ error ที่หลุดออกมา ไม่ให้ stack trace โผล่ถึงเบราว์เซอร์ แต่ต้องมี log ฝั่งเซิร์ฟเวอร์ */
export function handler(
  name: string,
  fn: (req: NextRequest, sb: SupabaseClient) => Promise<Response>,
) {
  return async (req: NextRequest): Promise<Response> => {
    const sb = asCaller(req);
    if (!sb) return fail(401, "ยังไม่ได้เข้าสู่ระบบ");
    // ด่านจำกัดจำนวนคำขอ — อ่านกับเขียนแยกถังกัน (โหลดหน้าจอไม่ควรกินโควตาของการบันทึก)
    const เขียน = req.method !== "GET" && req.method !== "HEAD";
    const { max, windowSec } = เขียน ? LIMIT_WRITE : LIMIT_READ;
    if (!(await withinQuota(sb, เขียน ? "write" : "read", max, windowSec))) {
      console.warn(`[api/v1/${name}] เกินโควตา (${เขียน ? "write" : "read"})`);
      return fail(429, "คำขอถี่เกินไป — รอสักครู่แล้วลองใหม่อีกครั้ง");
    }
    try {
      return await fn(req, sb);
    } catch (e) {
      // ข้อมูลขาเข้าผิดรูป — ผู้เรียกแก้เองได้ ต้องบอกให้ชัดว่าช่องไหนผิด ไม่ใช่ 503 "ระบบขัดข้อง"
      if (e instanceof BadInput) return fail(400, e.message);
      // error ของฐานข้อมูลที่หลุดออกมาระหว่างไล่หน้า — ต้องส่งข้อความจริงกลับไป ไม่ใช่กลืนเป็น "ขัดข้อง"
      if (e instanceof PageError) return dbFail(name, e);
      console.error(`[api/v1/${name}]`, e);
      return fail(503, "ระบบขัดข้องชั่วคราว — ลองใหม่อีกครั้ง");
    }
  };
}

// ── รหัสข้อผิดพลาดของฐานข้อมูล → รหัสสถานะ HTTP ที่ถูกต้อง ───────────────────
//
// เดิมทุกอย่างตอบ 503 "ระบบขัดข้อง" เหมือนกันหมด (ตรวจพบ 27 ส.ค. 69 จากการยิงจริง) ซึ่งผิดสองทาง:
//   1) ใบผ่านหมดอายุระหว่างใช้งาน → หน้าเว็บเห็น "ระบบขัดข้อง" แทนที่จะรู้ว่าต้องเข้าระบบใหม่
//      (ตัวต่ออายุใบผ่านฝั่งหน้าเว็บดูรหัส 401 เป็นสัญญาณ — 503 จึงไม่มีอะไรเกิดขึ้นเลย)
//   2) ข้อความดิบของฐานข้อมูลหลุดถึงเบราว์เซอร์ เช่น ชื่อตารางและชื่อกฎความปลอดภัย
//      ("new row violates row-level security policy for table \"hq_policy\"")
//
// กติกา: รหัสที่ "เรารู้ว่าแปลว่าอะไร" ให้ตอบสถานะที่ถูกและข้อความที่คนอ่านรู้เรื่อง
//        ส่วน P0001 คือข้อความที่ฟังก์ชันของเราเองตั้งใจเขียนให้ผู้ใช้อ่าน — ส่งต่อตามจริง
//        รหัสที่ไม่รู้จัก ยังเป็น 503 แต่ไม่ส่งข้อความดิบออกไป (log ไว้ฝั่งเซิร์ฟเวอร์ครบแล้ว)
const แปลงรหัส: Record<string, { status: number; message?: string }> = {
  PGRST301: { status: 401, message: "เซสชันหมดอายุ — กรุณาเข้าสู่ระบบใหม่" },
  PGRST303: { status: 401, message: "เซสชันหมดอายุ — กรุณาเข้าสู่ระบบใหม่" },
  "42501":  { status: 403, message: "ไม่มีสิทธิ์ทำรายการนี้" },
  PGRST116: { status: 404, message: "ไม่พบข้อมูลที่ต้องการ — อาจถูกลบหรือย้ายไปแล้ว" },
  "23505":  { status: 409, message: "มีข้อมูลนี้อยู่แล้วในระบบ" },
  "23503":  { status: 409, message: "ทำรายการไม่ได้ — ยังมีข้อมูลอื่นผูกอยู่กับรายการนี้" },
  "23514":  { status: 400, message: "ข้อมูลไม่ผ่านเงื่อนไขที่ระบบกำหนด" },
  "23502":  { status: 400, message: "ข้อมูลไม่ครบ — มีช่องที่จำเป็นถูกเว้นว่าง" },
  "22P02":  { status: 400, message: "รูปแบบข้อมูลไม่ถูกต้อง" },
  "22001":  { status: 400, message: "ข้อความยาวเกินที่ระบบรับได้" },
};

/** แปลง error ของ supabase เป็นคำตอบ — ต้องไม่กลืนเงียบ (บทเรียนซ้ำ ๆ ของโปรเจกต์นี้) */
export function dbFail(name: string, error: { message: string; code?: string }) {
  console.error(`[api/v1/${name}] ฐานข้อมูลปฏิเสธ`, error);
  const code = error.code ?? "";
  const msg = error.message ?? "";

  // ข้อความที่ฟังก์ชันของเราเอง raise ขึ้นมา (P0001) = เขียนไว้ให้ผู้ใช้อ่านโดยตรง ส่งต่อทั้งดุ้น
  //   ขึ้นต้นด้วย not_found: = ของที่อ้างถึงไม่มีอยู่ ไม่ใช่ระบบพัง
  if (code === "P0001") {
    const notFound = /^not_found:/i.test(msg);
    const forbidden = /^forbidden:/i.test(msg);
    return fail(notFound ? 404 : forbidden ? 403 : 400, msg, code);
  }
  const m = แปลงรหัส[code];
  if (m) return fail(m.status, m.message ?? msg, code);

  // ── ที่เก็บไฟล์ (Storage) ส่ง error คนละรูปแบบ — ไม่มีช่อง code ให้ ────────────
  // รหัสจริงถูกยัดอยู่ในข้อความ ("database error, code: 23514") หรือบอกเป็นคำ
  // ("new row violates row-level security policy" · "Object not found")
  // ถ้าไม่แกะ จะกลายเป็น 503 "ระบบขัดข้อง" ทั้งที่เป็นเรื่องสิทธิ์/ชนิดไฟล์ที่ผู้ใช้แก้เองได้
  const รหัสในข้อความ = msg.match(/code:\s*([0-9A-Z]{5})/)?.[1] ?? "";
  const m2 = แปลงรหัส[รหัสในข้อความ];
  if (m2) {
    const ชนิดไฟล์ = รหัสในข้อความ === "23514";
    return fail(m2.status, ชนิดไฟล์ ? "ชนิดไฟล์นี้ไม่รองรับ — รับเฉพาะ PDF/Word/Excel/PowerPoint/DWG/DXF/รูปภาพ" : (m2.message ?? msg), รหัสในข้อความ);
  }
  if (/row-level security|permission denied|not authorized/i.test(msg))
    return fail(403, "ไม่มีสิทธิ์ทำรายการนี้", "42501");
  // ⚠️ จับเฉพาะ "ไม่พบตัวไฟล์/แถวที่ขอ" เท่านั้น — ห้ามรวม "does not exist" (relation/column ไม่มีอยู่)
  //    เพราะนั่นคือระบบเราเองพัง ต้องเป็น 503 ให้ตัวเฝ้าระวังเห็น ไม่ใช่ 404 ที่ดูเหมือนเรื่องปกติ
  if (/not found/i.test(msg))
    return fail(404, "ไม่พบข้อมูลที่ต้องการ — อาจถูกลบหรือย้ายไปแล้ว");
  if (/jwt|token/i.test(msg))
    return fail(401, "เซสชันหมดอายุ — กรุณาเข้าสู่ระบบใหม่");
  // ไม่รู้จัก = ถือว่าระบบมีปัญหาจริง · ห้ามส่งข้อความดิบของฐานข้อมูลออกไป
  return fail(503, "ระบบขัดข้องชั่วคราว — ลองใหม่อีกครั้ง", code || undefined);
}
