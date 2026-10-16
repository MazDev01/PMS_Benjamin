// ── ดีลเลอร์ขอ "ดูรหัสผ่านของตัวเอง" โดยยืนยันด้วยเลขที่ส่งไปทางอีเมล ─────────────────
//
// บอสสั่ง 1 ก.ย. 69: หน้าบัญชีของดีลเลอร์ต้องมีปุ่มดูรหัสผ่าน แต่กดแล้วต้องส่งเลขไปที่อีเมลก่อน
//   เอาเลขนั้นมากรอกจึงจะเห็นรหัส (กติกานี้ทับของเดิม 28 ส.ค. 69 ที่ห้ามดีลเลอร์ดูรหัสตัวเองเลย)
//
// ทำไมต้องมีเลขจากอีเมล ไม่ใช่กดแล้วโชว์เลย:
//   หน้าจอที่เปิดค้างไว้ในออฟฟิศ = ใครเดินมานั่งก็กดดูรหัสของสาขาได้ทันที
//   การบังคับให้เอาเลขจากอีเมลมากรอก = ต้องเข้าถึงอีเมลของสาขาได้จริงก่อน
//
// เลขยืนยันใช้ระบบ OTP ของ Supabase (ตัวเดียวกับที่ส่งลิงก์ลืมรหัสผ่าน) — ไม่ต้องต่อบริการอีเมลใหม่
//   • ขอเลข  = signInWithOtp({ shouldCreateUser: false }) → ส่งเมลไปที่อีเมลเข้าระบบของสาขานั้น
//   • ยืนยัน = verifyOtp({ type: "email" }) → ผ่านแล้วค่อยถอดรหัสสำเนาที่เก็บไว้ส่งกลับ
//   session ที่ได้จากการยืนยันถูกทิ้งทันที (ไม่ persist) — ใช้แค่พิสูจน์ว่าถือกล่องอีเมลนั้นจริง
//
// ⚠️ รหัสที่คืนมาคือ "สำเนาที่ระบบบันทึกไว้ตอนตั้งรหัสครั้งล่าสุด" (dealer_login_secrets)
//    ถ้าดีลเลอร์ไปตั้งรหัสใหม่ผ่านลิงก์อีเมล (ลืมรหัสผ่าน) สำเนาจะถูกลบทิ้งโดยตั้งใจ
//    → ตรงนั้นต้องบอกตรง ๆ ว่า "ระบบไม่มีสำเนา" ไม่ใช่คืนเลขเก่าที่ใช้ไม่ได้แล้ว
import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit } from "@pms/shared/lib/rateLimit";
import { auditLog, withErrors, รหัสผ่านยังเข้าระบบได้ } from "@pms/shared/lib/adminRoute";
import { decryptSecret, dealerSecretReady } from "@pms/shared/lib/dealerSecret";
import { dealerCors, dealerJson, ดีลเลอร์ที่เรียก, ปิดบางส่วนของอีเมล } from "@pms/shared/lib/dealerCaller";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: dealerCors(req) });
}

export const POST = withErrors("dealer-reveal-password", async (req: NextRequest) => {
  const who = await ดีลเลอร์ที่เรียก(req);
  if (!who.ok) return who.res;
  const { admin, userId, email, dealerCode, name } = who.who;
  if (!ANON_KEY) return dealerJson(req, { error: "ยังไม่ได้ตั้งค่าเซิร์ฟเวอร์ — ดูรหัสผ่านยังไม่ได้" }, 501);

  const body = (await req.json().catch(() => null)) as null | { op?: string; code?: string };
  const op = String(body?.op ?? "").trim();
  const sb = createClient(SUPABASE_URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

  // ── 1) ขอเลขยืนยัน ──
  if (op === "send") {
    // เพดานต่ำ: ระบบส่งอีเมลของผู้ให้บริการมีโควตาจำกัด และกันคนกดรัวจนกล่องจดหมายเต็ม
    if (!(await checkRateLimit(admin, `reveal-send:${userId}`, 3, 900))) {
      return dealerJson(req, { error: "ขอเลขยืนยันถี่เกินไป — รอสัก 15 นาทีแล้วลองใหม่" }, 429);
    }
    // ไม่มีสำเนารหัสก็ไม่ต้องส่งอีเมลให้เสียเที่ยว — บอกตั้งแต่ตรงนี้ว่าดูไม่ได้เพราะอะไร
    const { data: เก็บไว้ } = await admin.from("dealer_login_secrets").select("dealer_code").eq("dealer_code", dealerCode).maybeSingle();
    if (!เก็บไว้) {
      return dealerJson(req, {
        // ไม่มีสำเนาได้หลายสาเหตุ (ตั้งรหัสใหม่ผ่านลิงก์อีเมล / สำเนาเก่าใช้ไม่ได้แล้วถูกลบ / เซิร์ฟเวอร์เก็บไม่สำเร็จ)
        //   — ห้ามเดาสาเหตุเดียวให้ผู้ใช้ บอกสิ่งที่ทำต่อได้แทน
        error: "ระบบไม่มีสำเนารหัสผ่านล่าสุดของสาขานี้ — ดูย้อนหลังไม่ได้ ตั้งรหัสใหม่ด้านล่าง หรือแจ้งสำนักงานใหญ่",
      }, 404);
    }
    const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    if (error) {
      const msg = String(error.message ?? "");
      // อีเมลของระบบล็อกอินปิดอยู่ (Send Email Hook · ใบ 0213 · บอสสั่ง 16 ต.ค. 69) — บอกตรง ๆ ไม่ใช่ "ลองใหม่"
      if (/auth_email_disabled/.test(msg)) {
        return dealerJson(req, { error: "ดูรหัสผ่านทางอีเมลปิดชั่วคราว — ลืมรหัสผ่าน ติดต่อ HQ" }, 403);
      }
      // อีเมลโดเมนสมมติ = ส่งไม่ถึงตัวจริง ต้องบอกให้ชัดว่าต้องแก้อีเมลก่อน ไม่ใช่ "ลองใหม่"
      if (/invalid/i.test(msg) && /email/i.test(msg)) {
        return dealerJson(req, { error: `ส่งเลขยืนยันไปที่ ${email} ไม่ได้ — อีเมลนี้ใช้ส่งจริงไม่ได้ แจ้งสำนักงานใหญ่ให้แก้อีเมลเข้าระบบก่อน` }, 400);
      }
      if (/rate|too many|429/i.test(msg)) {
        return dealerJson(req, { error: "ขอเลขยืนยันถี่เกินไป — รอสักครู่แล้วลองใหม่" }, 429);
      }
      console.error(`[reveal] ส่งเลขยืนยันให้ ${dealerCode} ไม่สำเร็จ`, error);
      return dealerJson(req, { error: "ส่งเลขยืนยันไม่สำเร็จ — ลองใหม่อีกครั้ง" }, 502);
    }
    await auditLog(admin, { name, role: "DEALER" }, "ขอเลขยืนยันเพื่อดูรหัสผ่านของตัวเอง", dealerCode);
    return dealerJson(req, { sentTo: ปิดบางส่วนของอีเมล(email) });
  }

  // ── 2) ยืนยันเลข แล้วคืนรหัสผ่าน ──
  if (op === "verify") {
    const ที่กรอก = String(body?.code ?? "").trim();
    const เลข = ที่กรอก.replace(/\D/g, "");
    // ── รับได้ทั้ง "เลข 6 หลัก" และ "ลิงก์ที่ก๊อปมาจากอีเมล" ────────────────────────
    //
    // อีเมลของผู้ให้บริการ (แม่แบบ Magic Link มาตรฐาน) มีแต่ลิงก์ ไม่มีเลข 6 หลัก
    //   จนกว่าจะแก้แม่แบบให้ใส่ {{ .Token }} เข้าไป (ทำที่หน้าจัดการโปรเจกต์)
    // ถ้ารับแต่เลข = ผู้ใช้เปิดอีเมลแล้วไม่เจอเลข แล้วไปต่อไม่ได้เลย (บอสเจอจริง 1 ก.ย. 69)
    //   จึงรับลิงก์ด้วย — ดึงค่า token ในลิงก์มาใช้ยืนยันแทน ได้ผลเหมือนกัน
    const ลิงก์ = /^https?:\/\//i.test(ที่กรอก) || ที่กรอก.includes("token=");
    if (!ลิงก์ && เลข.length < 6) {
      return dealerJson(req, { error: "กรอกเลขยืนยันจากอีเมล หรือวางลิงก์ที่ได้จากอีเมล" }, 400);
    }
    // กันเดาเลขทีละหลาย ๆ ครั้ง (6 หลัก = เดาได้ถ้าปล่อยให้ยิงไม่จำกัด)
    if (!(await checkRateLimit(admin, `reveal-verify:${userId}`, 5, 900))) {
      return dealerJson(req, { error: "กรอกเลขผิดหลายครั้งเกินไป — รอสัก 15 นาทีแล้วขอเลขใหม่" }, 429);
    }
    let token_hash = "";
    if (ลิงก์) {
      try { token_hash = new URL(ที่กรอก).searchParams.get("token") ?? ""; }
      catch { token_hash = (ที่กรอก.split("token=")[1] ?? "").split("&")[0]; }
      if (!token_hash) return dealerJson(req, { error: "ลิงก์ไม่ถูกต้อง — ก๊อปลิงก์จากอีเมลมาทั้งอัน" }, 400);
    }
    const { data, error } = ลิงก์
      ? await sb.auth.verifyOtp({ token_hash, type: "magiclink" })
      : await sb.auth.verifyOtp({ email, token: เลข, type: "email" });
    if (error || !data.user) {
      return dealerJson(req, { error: "เลขยืนยัน/ลิงก์ไม่ถูกต้องหรือหมดอายุแล้ว — ขอใหม่แล้วลองอีกครั้ง" }, 400);
    }
    // ใบผ่านที่เพิ่งได้จากการยืนยันต้องเป็นของคนเดียวกันเท่านั้น (กันสลับอีเมลกลางทาง)
    if (data.user.id !== userId) return dealerJson(req, { error: "เลขยืนยันไม่ตรงกับบัญชีที่กำลังใช้งาน" }, 403);

    if (!dealerSecretReady()) {
      return dealerJson(req, { error: "ยังไม่ได้ตั้งกุญแจถอดรหัสที่เซิร์ฟเวอร์ (DEALER_SECRET_KEY) — ดูรหัสผ่านไม่ได้" }, 501);
    }
    const { data: row, error: readErr } = await admin
      .from("dealer_login_secrets").select("secret").eq("dealer_code", dealerCode).maybeSingle();
    if (readErr) {
      console.error(`[reveal] อ่านสำเนารหัสของ ${dealerCode} ไม่สำเร็จ`, readErr);
      return dealerJson(req, { error: "อ่านรหัสผ่านไม่สำเร็จชั่วคราว — ลองใหม่อีกครั้ง" }, 503);
    }
    const password = row?.secret ? decryptSecret(String(row.secret)) : null;
    if (!password) {
      return dealerJson(req, {
        error: "ระบบไม่มีสำเนารหัสผ่านล่าสุดของสาขานี้ — ตั้งรหัสใหม่แทนการดูย้อนหลัง",
      }, 404);
    }
    // สำเนาเก่าที่ใช้เข้าระบบไม่ได้แล้ว (เช่น ตั้งรหัสใหม่ผ่านลิงก์อีเมลแล้วสำเนาไม่ถูกลบ) = ห้ามโชว์ ลบทิ้งแล้วบอกตรง ๆ
    if ((await รหัสผ่านยังเข้าระบบได้(email, password)) === false) {
      const { error: ลบErr } = await admin.from("dealer_login_secrets").delete().eq("dealer_code", dealerCode);
      if (ลบErr) console.error(`[reveal] ลบสำเนารหัสที่ใช้ไม่ได้แล้วของ ${dealerCode} ไม่สำเร็จ`, ลบErr);
      return dealerJson(req, {
        error: "รหัสที่ระบบบันทึกไว้ใช้เข้าระบบไม่ได้แล้ว (อาจเคยตั้งรหัสใหม่ผ่านลิงก์ในอีเมล) — ตั้งรหัสใหม่แทนการดูย้อนหลัง",
      }, 404);
    }
    // เปิดดูรหัสต้องมีร่องรอยเสมอ — สำนักงานใหญ่เห็นว่าใครเปิดดูเมื่อไหร่ (เหมือนฝั่ง HQ กดดู)
    await auditLog(admin, { name, role: "DEALER" }, "ดีลเลอร์เปิดดูรหัสผ่านของตัวเอง (ยืนยันด้วยเลขทางอีเมล)", dealerCode);
    return dealerJson(req, { password });
  }

  return dealerJson(req, { error: "คำสั่งไม่ถูกต้อง" }, 400);
});
