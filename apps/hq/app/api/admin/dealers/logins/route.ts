// ── อีเมลที่ดีลเลอร์ใช้เข้าระบบ "ของจริง" (HQ เท่านั้น) ────────────────────────────
//
// ทำไมต้องถามเซิร์ฟเวอร์ ไม่คำนวณเอาเองที่หน้าจอ:
//   เดิมหน้าจัดการดีลเลอร์เดาอีเมลจากรหัสสาขา (`cnx@dealer.benjaminpebsteel.com`) ซึ่งเป็นสูตรที่ใช้
//   เฉพาะบัญชีที่ "สร้างผ่านหน้าจอนี้" เท่านั้น · 7 สาขาที่มีอยู่จริงใช้อีเมลธุรกิจของตัวเอง
//   (เช่น CNX = sales@cmsteelbuild.co.th) → HQ คัดลอกอีเมลที่ไม่มีอยู่จริงไปคู่กับรหัสผ่านที่ถูกต้อง
//   แล้วเข้าระบบไม่ได้ ทั้งที่บัญชีปกติดี (ผู้ใช้แจ้งเข้ามาจริง 6 ส.ค. 69)
//
// อีเมลไม่ใช่ความลับ แต่ต้องใช้ service_role อ่าน เพราะเก็บอยู่ใน auth.users ไม่ใช่ตาราง profiles
// จึงกันด้วยสิทธิ์เดียวกับการจัดการดีลเลอร์ และไม่ส่งอะไรนอกจาก "รหัสสาขา → อีเมล"
import { NextResponse, type NextRequest } from "next/server";
import { authorizeAdmin, withErrors, bad } from "@pms/shared/lib/adminRoute";
import { checkRateLimit } from "@pms/shared/lib/rateLimit";

export const runtime = "nodejs";

export const GET = withErrors("list-dealer-logins", async (req: NextRequest) => {
  const authz = await authorizeAdmin(
    req, "dealers:manage", "ไม่มีสิทธิ์ดูข้อมูลเข้าระบบของดีลเลอร์",
    "ยังไม่ได้ตั้งค่าเซิร์ฟเวอร์ (SUPABASE_SERVICE_ROLE_KEY) — ดูอีเมลเข้าระบบของดีลเลอร์ยังไม่ได้",
  );
  if (!authz.ok) return authz.res;
  const { admin, callerId } = authz.auth;

  // กันยิงรัว — เส้นทางนี้เป็นเส้นเดียวใน 5 เส้นของ /api/admin/* ที่ไม่เคยมีตัวจำกัด
  //   (ผลตรวจสอบระบบ 7 ส.ค. 69 · M-2) · ถึงอีเมลจะไม่ใช่ความลับ แต่ถ้าบัญชีผู้ดูแลถูกยึด
  //   ผู้บุกรุกกวาดอีเมลเข้าระบบของ "ทุกสาขา" ออกไปทำรายการต่อได้ในคำขอเดียว โดยไม่มีอะไรชะลอ
  // 30 ครั้ง/นาที = เท่ากับเส้นทางอ่าน/จัดการดีลเลอร์เส้นอื่น (สูงพอสำหรับการกดใช้งานจริง)
  if (!(await checkRateLimit(admin, `list-dealer-logins:${callerId}`, 30, 60))) {
    return bad(429, "เรียกดูข้อมูลเข้าระบบถี่เกินไป — รอสักครู่แล้วลองใหม่");
  }

  const { data: profs, error } = await admin
    .from("profiles").select("id, dealer_code").neq("dealer_code", "");
  if (error) {
    console.error("[list-dealer-logins] อ่านรายชื่อบัญชีสาขาไม่สำเร็จ", error);
    return NextResponse.json({ error: "อ่านข้อมูลเข้าระบบไม่สำเร็จชั่วคราว — ลองใหม่อีกครั้ง" }, { status: 503 });
  }

  // อีเมลอยู่ใน auth.users — ต้องไล่ทีละหน้า (ค่าเริ่มต้นของ Supabase คืนมาไม่ครบถ้ามีบัญชีเยอะ)
  const byId = new Map<string, string>();
  for (let page = 1; page <= 10; page++) {
    const { data, error: listErr } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (listErr) {
      console.error("[list-dealer-logins] อ่านบัญชีเข้าระบบไม่สำเร็จ", listErr);
      return NextResponse.json({ error: "อ่านข้อมูลเข้าระบบไม่สำเร็จชั่วคราว — ลองใหม่อีกครั้ง" }, { status: 503 });
    }
    for (const u of data.users) if (u.email) byId.set(u.id, u.email);
    if (data.users.length < 200) break;
  }

  // สาขาที่หาบัญชีไม่เจอ จะไม่มีคีย์ในผลลัพธ์ — หน้าจอต้องขึ้น "—" ตามจริง ห้ามเดาอีเมลแทน
  const logins: Record<string, string> = {};
  for (const p of profs ?? []) {
    const email = byId.get(String(p.id));
    if (email) logins[String(p.dealer_code)] = email;
  }

  return NextResponse.json({ ok: true, logins }, { headers: { "Cache-Control": "no-store, private" } });
});
