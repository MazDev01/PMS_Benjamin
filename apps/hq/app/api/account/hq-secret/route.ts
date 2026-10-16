// ── ผู้ใช้สำนักงานใหญ่ "ดูรหัสผ่านของตัวเอง" โดยยืนยันด้วยเลขที่ส่งไปทางอีเมล ─────────
//
// บอสสั่ง 2 ก.ย. 69: หน้าโปรไฟล์ของผู้ดูแลต้องดูรหัสผ่านตัวเองได้ แบบเดียวกับฝั่งดีลเลอร์
//
// ⚠️ ข้อจำกัดที่เลี่ยงไม่ได้ (ต้องบอกผู้ใช้ตรง ๆ ไม่ใช่ปล่อยให้งง):
//   Supabase Auth เก็บรหัสผ่านเป็น hash ทางเดียว — อ่านกลับไม่ได้เลยแม้แต่ service_role
//   ระบบจึงเห็นรหัสได้เฉพาะ "ตอนที่ผู้ใช้พิมพ์เข้ามาเอง" คือตอนกดเปลี่ยนรหัสผ่านในหน้าโปรไฟล์
//   → บัญชีที่ยังไม่เคยเปลี่ยนรหัสผ่านผ่านหน้านี้ จะไม่มีสำเนาให้ดู ต้องเปลี่ยนหนึ่งครั้งก่อน
//
// สามคำสั่งในเส้นทางเดียว:
//   save   — เก็บสำเนา (เข้ารหัส) หลังผู้ใช้เปลี่ยนรหัสผ่านสำเร็จ · พิสูจน์ก่อนว่ารหัสนั้นใช้เข้าระบบได้จริง
//   send   — ส่งเลขยืนยันไปที่อีเมลของบัญชีตัวเอง
//   verify — ตรวจเลข แล้วคืนรหัสที่ถอดออกมา + ลงบันทึกการใช้งาน
//
// ทำไมต้องมีเลขจากอีเมล ไม่ใช่กดแล้วโชว์เลย: จอที่เปิดค้างไว้ในออฟฟิศ = ใครเดินมานั่งก็กดดูได้
//   บังคับให้เอาเลขจากกล่องจดหมายมากรอก = ต้องเข้าถึงอีเมลของบัญชีนั้นได้จริงก่อน
import { type NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { checkRateLimit } from "@pms/shared/lib/rateLimit";
import { auditLog, withErrors } from "@pms/shared/lib/adminRoute";
import { ตรวจรหัสผ่านใหม่ } from "@pms/shared/lib/passwordRule";
import { decryptSecret, encryptSecret, dealerSecretReady } from "@pms/shared/lib/dealerSecret";
import { callerToken } from "@pms/shared/server/v1/_cookie";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const ตอบ = (body: unknown, status = 200) => NextResponse.json(body, { status });

type ผู้เรียก = { admin: SupabaseClient; userId: string; email: string; name: string };

/** ผู้เรียกต้องเป็นบัญชีของสำนักงานใหญ่ (ไม่สังกัดสาขา) และยังเปิดใช้งานอยู่ */
async function ผู้ใช้HQที่เรียก(req: NextRequest): Promise<{ ok: true; who: ผู้เรียก } | { ok: false; res: NextResponse }> {
  if (!SUPABASE_URL || !SERVICE_KEY) return { ok: false, res: ตอบ({ error: "ยังไม่ได้ตั้งค่าเซิร์ฟเวอร์" }, 501) };
  const token = callerToken(req);
  if (!token) return { ok: false, res: ตอบ({ error: "unauthorized" }, 401) };

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: caller, error } = await admin.auth.getUser(token);
  if (error || !caller.user) return { ok: false, res: ตอบ({ error: "unauthorized" }, 401) };

  const { data: prof, error: profErr } = await admin
    .from("profiles").select("dealer_code, name, status").eq("id", caller.user.id).maybeSingle();
  if (profErr) {
    console.error("[hq-secret] อ่านโปรไฟล์ผู้เรียกไม่สำเร็จ", profErr);
    return { ok: false, res: ตอบ({ error: "ตรวจสอบสิทธิ์ไม่สำเร็จชั่วคราว — ลองใหม่อีกครั้ง" }, 503) };
  }
  if (!prof || String(prof.status ?? "active") !== "active") {
    return { ok: false, res: ตอบ({ error: "บัญชีนี้ถูกปิดการใช้งานแล้ว" }, 403) };
  }
  // สังกัดสาขา = ดีลเลอร์ ต้องไปใช้เส้นทางของดีลเลอร์ (/api/account/reveal) ซึ่งอ่านคนละตาราง
  if (String(prof.dealer_code ?? "").trim()) {
    return { ok: false, res: ตอบ({ error: "บัญชีนี้เป็นของดีลเลอร์ — ใช้หน้าบัญชีของดีลเลอร์แทน" }, 403) };
  }
  return { ok: true, who: { admin, userId: caller.user.id, email: caller.user.email ?? "", name: String(prof.name ?? "") } };
}

/** ปิดบางส่วนของอีเมลก่อนส่งกลับหน้าเว็บ — บอกได้ว่าส่งไปที่ไหนโดยไม่เปิดอีเมลเต็ม */
function ปิดบางส่วนของอีเมล(email: string): string {
  const [ชื่อ, โดเมน] = email.split("@");
  if (!โดเมน) return email;
  const เปิด = ชื่อ.slice(0, 2);
  return `${เปิด}${"•".repeat(Math.max(1, ชื่อ.length - 2))}@${โดเมน}`;
}

export const POST = withErrors("hq-own-password", async (req: NextRequest) => {
  const who = await ผู้ใช้HQที่เรียก(req);
  if (!who.ok) return who.res;
  const { admin, userId, email, name } = who.who;
  if (!ANON_KEY) return ตอบ({ error: "ยังไม่ได้ตั้งค่าเซิร์ฟเวอร์ — ใช้งานหน้านี้ยังไม่ได้" }, 501);

  const body = (await req.json().catch(() => null)) as null | { op?: string; code?: string; password?: string };
  const op = String(body?.op ?? "").trim();
  const sb = createClient(SUPABASE_URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

  // ── 1) เก็บสำเนาหลังเปลี่ยนรหัสผ่านสำเร็จ ──
  if (op === "save") {
    const password = String(body?.password ?? "");
    // กติกาเดียวกับทุกทางที่ตั้งรหัสผ่าน (เดิมรับ 6 ตัว ทั้งที่หน้าเปลี่ยนรหัสบังคับ 8)
    const ผิดกติกา = ตรวจรหัสผ่านใหม่(password);
    if (ผิดกติกา) return ตอบ({ error: ผิดกติกา }, 400);
    if (!dealerSecretReady()) {
      return ตอบ({ error: "ยังไม่ได้ตั้งกุญแจเข้ารหัสที่เซิร์ฟเวอร์ (DEALER_SECRET_KEY)" }, 501);
    }
    // ⚠️ ต้องพิสูจน์ก่อนว่ารหัสนี้ "ใช้เข้าระบบได้จริง" — ไม่งั้นใครยิง API ตรง ๆ ก็ยัดค่ามั่วเข้ามาได้
    //    แล้วเจ้าของบัญชีจะเปิดดูแล้วเห็นรหัสผิด ซึ่งแย่กว่าไม่มีสำเนาเสียอีก
    const { data: ลอง, error: ลองErr } = await sb.auth.signInWithPassword({ email, password });
    if (ลองErr || !ลอง.user || ลอง.user.id !== userId) {
      return ตอบ({ error: "รหัสผ่านที่ส่งมาใช้เข้าระบบไม่ได้ — ไม่บันทึกสำเนา" }, 400);
    }
    const secret = encryptSecret(password);
    if (!secret) return ตอบ({ error: "เข้ารหัสไม่สำเร็จ" }, 500);
    const { error: upErr } = await admin.from("hq_login_secrets")
      .upsert({ user_id: userId, secret, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (upErr) {
      console.error("[hq-secret] บันทึกสำเนารหัสไม่สำเร็จ", upErr);
      return ตอบ({ error: "บันทึกสำเนารหัสผ่านไม่สำเร็จ" }, 503);
    }
    return ตอบ({ saved: true });
  }

  // ── 2) ขอเลขยืนยันทางอีเมล ──
  if (op === "send") {
    // เพดานต่ำ: โควตาส่งอีเมลมีจำกัด และกันคนกดรัวจนกล่องจดหมายเต็ม
    if (!(await checkRateLimit(admin, `hq-reveal-send:${userId}`, 3, 900))) {
      return ตอบ({ error: "ขอเลขยืนยันถี่เกินไป — รอสัก 15 นาทีแล้วลองใหม่" }, 429);
    }
    // ไม่มีสำเนาก็ไม่ต้องส่งอีเมลให้เสียเที่ยว — บอกตั้งแต่ตรงนี้ว่าทำไมดูไม่ได้
    const { data: เก็บไว้ } = await admin.from("hq_login_secrets").select("user_id").eq("user_id", userId).maybeSingle();
    if (!เก็บไว้) {
      return ตอบ({
        error: "ระบบยังไม่มีสำเนารหัสผ่านของบัญชีนี้ — กดเปลี่ยนรหัสผ่านที่หน้านี้หนึ่งครั้งก่อน แล้วจะดูย้อนหลังได้",
      }, 404);
    }
    const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    if (error) {
      const msg = String(error.message ?? "");
      // อีเมลของระบบล็อกอินปิดอยู่ (Send Email Hook · ใบ 0213 · บอสสั่ง 16 ต.ค. 69)
      if (/auth_email_disabled/.test(msg)) {
        return ตอบ({ error: "ดูรหัสผ่านทางอีเมลปิดชั่วคราว — ติดต่อผู้ดูแลให้ตั้งรหัสใหม่ให้" }, 403);
      }
      if (/invalid/i.test(msg) && /email/i.test(msg)) {
        return ตอบ({ error: `ส่งเลขยืนยันไปที่ ${email} ไม่ได้ — อีเมลนี้ใช้ส่งจริงไม่ได้ ต้องเปลี่ยนอีเมลบัญชีก่อน` }, 400);
      }
      if (/rate|too many|429/i.test(msg)) return ตอบ({ error: "ขอเลขยืนยันถี่เกินไป — รอสักครู่แล้วลองใหม่" }, 429);
      console.error("[hq-secret] ส่งเลขยืนยันไม่สำเร็จ", error);
      return ตอบ({ error: "ส่งเลขยืนยันไม่สำเร็จ — ลองใหม่อีกครั้ง" }, 502);
    }
    await auditLog(admin, { name, role: "SUPER_ADMIN" }, "ขอเลขยืนยันเพื่อดูรหัสผ่านของตัวเอง", "");
    return ตอบ({ sentTo: ปิดบางส่วนของอีเมล(email) });
  }

  // ── 3) ยืนยันเลข แล้วคืนรหัสผ่าน ──
  if (op === "verify") {
    const ที่กรอก = String(body?.code ?? "").trim();
    const เลข = ที่กรอก.replace(/\D/g, "");
    // รับได้ทั้งเลขและลิงก์ที่ก๊อปมาทั้งอัน (แม่แบบอีเมลมาตรฐานของผู้ให้บริการมีแต่ลิงก์)
    const ลิงก์ = /^https?:\/\//i.test(ที่กรอก) || ที่กรอก.includes("token=");
    if (!ลิงก์ && เลข.length < 6) return ตอบ({ error: "กรอกเลขยืนยันจากอีเมล หรือวางลิงก์ที่ได้จากอีเมล" }, 400);
    // กันเดาเลขทีละหลาย ๆ ครั้ง
    if (!(await checkRateLimit(admin, `hq-reveal-verify:${userId}`, 5, 900))) {
      return ตอบ({ error: "กรอกเลขผิดหลายครั้งเกินไป — รอสัก 15 นาทีแล้วขอเลขใหม่" }, 429);
    }
    let token_hash = "";
    if (ลิงก์) {
      try { token_hash = new URL(ที่กรอก).searchParams.get("token") ?? ""; }
      catch { token_hash = (ที่กรอก.split("token=")[1] ?? "").split("&")[0]; }
      if (!token_hash) return ตอบ({ error: "ลิงก์ไม่ถูกต้อง — ก๊อปลิงก์จากอีเมลมาทั้งอัน" }, 400);
    }
    const { data, error } = ลิงก์
      ? await sb.auth.verifyOtp({ token_hash, type: "magiclink" })
      : await sb.auth.verifyOtp({ email, token: เลข, type: "email" });
    if (error || !data.user) {
      return ตอบ({ error: "เลขยืนยัน/ลิงก์ไม่ถูกต้องหรือหมดอายุแล้ว — ขอใหม่แล้วลองอีกครั้ง" }, 400);
    }
    // ใบผ่านที่เพิ่งได้ต้องเป็นของคนเดียวกัน (กันสลับอีเมลกลางทาง)
    if (data.user.id !== userId) return ตอบ({ error: "เลขยืนยันไม่ตรงกับบัญชีที่กำลังใช้งาน" }, 403);

    if (!dealerSecretReady()) {
      return ตอบ({ error: "ยังไม่ได้ตั้งกุญแจถอดรหัสที่เซิร์ฟเวอร์ (DEALER_SECRET_KEY) — ดูรหัสผ่านไม่ได้" }, 501);
    }
    const { data: row, error: readErr } = await admin
      .from("hq_login_secrets").select("secret").eq("user_id", userId).maybeSingle();
    if (readErr) {
      console.error("[hq-secret] อ่านสำเนารหัสไม่สำเร็จ", readErr);
      return ตอบ({ error: "อ่านรหัสผ่านไม่สำเร็จชั่วคราว — ลองใหม่อีกครั้ง" }, 503);
    }
    const password = row?.secret ? decryptSecret(String(row.secret)) : null;
    if (!password) {
      return ตอบ({ error: "ระบบยังไม่มีสำเนารหัสผ่านของบัญชีนี้ — เปลี่ยนรหัสผ่านหนึ่งครั้งก่อน" }, 404);
    }
    // เปิดดูรหัสต้องมีร่องรอยเสมอ
    await auditLog(admin, { name, role: "SUPER_ADMIN" }, "เปิดดูรหัสผ่านของตัวเอง (ยืนยันด้วยเลขทางอีเมล)", "");
    return ตอบ({ password });
  }

  return ตอบ({ error: "คำสั่งไม่ถูกต้อง" }, 400);
});
