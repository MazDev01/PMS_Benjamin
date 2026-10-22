// ── เข้าระบบแทนดีลเลอร์ (impersonate) โดยไม่ต้องรู้/รีเซ็ตรหัสผ่านของดีลเลอร์ ──────────
//
// เดิมเข้าใจว่าทำไม่ได้เพราะรหัสผ่านดีลเลอร์ถูก hash ไว้ใน Supabase Auth — แต่ service_role
// ไม่จำเป็นต้อง "รู้" รหัสผ่านเพื่อสร้าง session ให้ผู้ใช้คนอื่น: Supabase Admin API มี
// generateLink(type: "magiclink") ที่ออก one-time token ยืนยันตัวตนแทนรหัสผ่านได้ตรง ๆ
// (กลไกเดียวกับ "ลืมรหัสผ่าน" — ต่างกันที่ HQ เป็นผู้ขอแทนดีลเลอร์ ไม่ใช่ดีลเลอร์ขอเอง)
//
// ลิงก์ที่ได้ใช้ครั้งเดียวแล้วหมดอายุ (Supabase บังคับ) — เปิดในแท็บใหม่ไปยังแอปดีลเลอร์
// (คนละ origin กับ HQ · session เก็บแบบ sessionStorage แยกต่อแท็บอยู่แล้ว — ดู supabase/client.ts)
// จึงไม่กระทบ session ของ HQ เองในแท็บปัจจุบันเลย
//
// ⚠️ ต้องตั้งค่าเพิ่มที่ Supabase Dashboard (ดู .env.example): เพิ่ม URL ของแอปดีลเลอร์
//    (NEXT_PUBLIC_DEALER_APP_URL) ลงใน Authentication → URL Configuration → Redirect URLs
//    ไม่งั้น generateLink จะสำเร็จแต่ redirect หลังคลิกลิงก์จะถูกปฏิเสธ
import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit } from "@pms/shared/lib/rateLimit";
import { bad, authorizeAdmin, auditLog, withErrors, findDealerAccount } from "@pms/shared/lib/adminRoute";

export const runtime = "nodejs";

// ไม่มีค่าสำรอง (เดิมเขียนพอร์ตในเครื่องไว้) — ไม่ได้ตั้ง = บอกตรง ๆ ดีกว่าส่งลิงก์ไปเครื่องคนละที่ (ตัวตรวจ check-hardcoded-ports · 22 ต.ค. 69)
const DEALER_APP_URL = process.env.NEXT_PUBLIC_DEALER_APP_URL ?? "";

export const POST = withErrors("impersonate-dealer", async (req: NextRequest) => {
  const authz = await authorizeAdmin(
    req, "dealers:manage", "ไม่มีสิทธิ์จัดการดีลเลอร์",
    "ยังไม่ได้ตั้งค่าเซิร์ฟเวอร์ (SUPABASE_SERVICE_ROLE_KEY) — เข้าระบบแทนดีลเลอร์จากที่นี่ยังไม่ได้",
  );
  if (!authz.ok) return authz.res;
  if (!DEALER_APP_URL) return bad(503, "ยังไม่ได้ตั้งค่าเซิร์ฟเวอร์ (NEXT_PUBLIC_DEALER_APP_URL) — ไม่รู้ที่อยู่แอปดีลเลอร์ จึงเข้าระบบแทนไม่ได้");
  const { admin, callerId, prof } = authz.auth;

  // เข้าระบบแทนคือการเข้าถึงบัญชีคนอื่นเต็มรูปแบบ — จำกัดถี่กว่าจุดอื่นเล็กน้อย
  if (!(await checkRateLimit(admin, `impersonate-dealer:${callerId}`, 10, 60))) {
    return bad(429, "ขอเข้าระบบแทนถี่เกินไป — รอสักครู่แล้วลองใหม่");
  }

  const code = (new URL(req.url).searchParams.get("code") ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2,5}$/.test(code)) return bad(400, "รหัสดีลเลอร์ไม่ถูกต้อง");

  // ต้องมีบัญชีของสาขานี้จริงและมีบัญชีเดียวเท่านั้น — ถ้าอ่านไม่ได้/เจอหลายบัญชี ต้องบอกให้ต่างกัน
  const found = await findDealerAccount(admin, code);
  if (!found.ok) return found.res;

  // ⛔ ห้ามประกอบอีเมลจากรหัสสาขาเด็ดขาด — ต้องใช้อีเมลของบัญชีที่ค้นเจอจริงเท่านั้น
  //
  // เดิมบรรทัดนี้เป็น `${code.toLowerCase()}@dealer.benjaminpebsteel.com` ซึ่งเป็นสูตรของบัญชีที่สร้าง
  // ผ่านหน้าจัดการดีลเลอร์เท่านั้น · 7 สาขาที่มีอยู่จริงใช้อีเมลธุรกิจของตัวเอง
  // (CNX = sales@cmsteelbuild.co.th) → อีเมลที่ประกอบขึ้นมา "ไม่มีอยู่จริง"
  // และ generateLink แบบ magiclink จะ *สร้างบัญชีใหม่ให้อัตโนมัติ* เมื่อไม่พบอีเมลนั้น
  // ผลคือ 2 เรื่องพร้อมกัน (พบจากชุดตรวจรับ 6 ส.ค. 69):
  //   1) "เข้าระบบแทนดีลเลอร์" ไม่ได้เข้าเป็นดีลเลอร์จริง แต่เข้าเป็นบัญชีเปล่าที่เพิ่งถูกสร้าง
  //      → HQ เห็นหน้าจอว่างเปล่า ไม่ใช่ข้อมูลของสาขานั้น = ฟีเจอร์นี้ใช้ไม่ได้จริงทุกสาขา
  //   2) ทุกครั้งที่กด จะทิ้งบัญชีผีไว้ในระบบ (ไม่มีโปรไฟล์ ไม่สังกัดสาขา) สะสมไปเรื่อย ๆ
  const { data: acct, error: acctErr } = await admin.auth.admin.getUserById(found.id);
  if (acctErr || !acct?.user?.email) {
    console.error(`[impersonate-dealer] อ่านอีเมลบัญชีของสาขา ${code} ไม่สำเร็จ`, acctErr);
    return bad(503, "อ่านบัญชีเข้าระบบของดีลเลอร์ไม่สำเร็จชั่วคราว — ลองใหม่อีกครั้ง");
  }
  const email = acct.user.email;

  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: `${DEALER_APP_URL}/dashboard?impersonated=1` },
  });
  if (linkErr || !link) {
    // รหัสสาขาถูกตรวจไปแล้ว และอีเมลก็อ่านมาจากบัญชีจริง — พังตรงนี้คือฝั่งระบบ ไม่ใช่คำขอผิด
    console.error(`[impersonate-dealer] สร้างลิงก์เข้าระบบของสาขา ${code} ไม่สำเร็จ`, linkErr);
    return bad(503, "สร้างลิงก์เข้าระบบไม่สำเร็จชั่วคราว — ลองใหม่อีกครั้ง");
  }

  // บันทึกทันทีตอนออกลิงก์ (ไม่ใช่ตอนคลิก) — ลิงก์นี้ = สิทธิ์เข้าถึงเต็มรูปแบบ ต้องมีร่องรอยเสมอ
  // ── ส่งใบผ่านไปที่แอปดีลเลอร์เอง ไม่ใช้ลิงก์ยืนยันของ Supabase ตรง ๆ (แก้ 20 ส.ค. 69) ──
  //
  // ลิงก์ของ Supabase จะพากลับไปปลายทางที่ขอไว้ "ก็ต่อเมื่อ" ปลายทางนั้นอยู่ในรายการที่อนุญาต
  //   (Authentication → URL Configuration → Redirect URLs) ถ้าไม่อยู่ มันไม่แจ้งอะไรเลย
  //   แค่เงียบ ๆ แล้วพาไป Site URL ของโปรเจกต์แทน → เปิดแท็บมาเจอหน้าเปล่า/หน้า error
  //   (บอสแจ้งว่ากดแล้วไม่ได้ · ตรวจของจริงพบ redirect_to=http://127.0.0.1:3000)
  //
  // ตอนนี้ส่ง "ใบผ่านครั้งเดียว" ไปที่หน้า /impersonate ของแอปดีลเลอร์ แล้วให้หน้านั้นแลกเป็น session เอง
  //   ไม่ต้องพึ่งการตั้งค่าใน Supabase อีก ใช้ได้เหมือนกันทั้งตอนพัฒนาและระบบจริง
  //   ใส่ไว้หลัง # เพื่อไม่ให้ใบผ่านถูกส่งไปกับคำขอ HTTP (ไม่ไปโผล่ใน log ของตัวกลางใด ๆ)
  const tokenHash = link.properties?.hashed_token;
  if (!tokenHash) {
    console.error(`[impersonate-dealer] ลิงก์ของสาขา ${code} ไม่มี hashed_token`);
    return bad(503, "สร้างลิงก์เข้าระบบไม่สำเร็จชั่วคราว — ลองใหม่อีกครั้ง");
  }

  await auditLog(admin, prof, "เข้าระบบแทนดีลเลอร์", code);
  return NextResponse.json({ ok: true, link: `${DEALER_APP_URL}/impersonate#th=${encodeURIComponent(tokenHash)}` });
});
