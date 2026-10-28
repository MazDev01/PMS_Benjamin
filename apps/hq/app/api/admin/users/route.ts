// ── สร้าง/ลบ "ผู้ใช้สำนักงานใหญ่ (HQ)" พร้อมบัญชีเข้าระบบจริง (ต้องใช้ service_role) ──
//
// ทำไมต้องเป็น Route Handler ฝั่งเซิร์ฟเวอร์ (เหมือน /api/admin/dealers · H5):
//   สร้าง/ลบบัญชีใน auth.users ต้องใช้ service_role ซึ่ง "ห้ามอยู่ในเบราว์เซอร์เด็ดขาด"
//   (ใครถือคีย์นี้ข้าม RLS ได้ทั้งระบบ) — จึงทำได้เฉพาะที่นี่ ที่รันบนเซิร์ฟเวอร์เท่านั้น
//
// เดิม (บั๊ก): หน้า /hq/users กด "เพิ่มผู้ใช้ HQ" แล้วแค่เพิ่มแถวในหน่วยความจำ (id = Date.now())
//   ไม่มีบัญชี auth ผูกอยู่ → ผู้ใช้ใหม่ล็อกอินไม่ได้เลย · และลบไม่ได้จริง (มีแต่ปิดใช้งาน)
//
// ความปลอดภัยของ handler นี้ (ไล่ตามลำดับ):
//   1) ตรวจ JWT ของ "ผู้เรียก" ที่เซิร์ฟเวอร์เอง แล้วดูบทบาทจาก profiles จริง (ห้ามเชื่อหน้าจอ)
//   2) service_role อ่านจาก env ฝั่งเซิร์ฟเวอร์เท่านั้น (ไม่มี NEXT_PUBLIC_)
//   3) สร้างล้มเหลวกลางทาง = ลบ auth user ที่เพิ่งสร้างทิ้ง ไม่ให้เหลือบัญชีกำพร้า
//   4) ลบ = กันลบตัวเอง และกันลบ SUPER_ADMIN คนสุดท้าย (กันล็อกตัวเองออกจากระบบ)
import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit } from "@pms/shared/lib/rateLimit";
import { HQ_ROLES } from "@pms/shared/lib/permissions";
import { bad, authorizeAdmin, auditLog, withErrors, strongPassword, deleteAuthUserLoud } from "@pms/shared/lib/adminRoute";
import type { UserRole } from "@pms/shared/lib/mock";
import type { SupabaseClient } from "@supabase/supabase-js";
import { encryptSecret, dealerSecretReady } from "@pms/shared/lib/dealerSecret";

// รันบน Node เสมอ (ต้องใช้ service_role — ห้าม edge ที่อาจแคช env แปลก ๆ)
export const runtime = "nodejs";
import { ตรวจรหัสผ่านใหม่ } from "@pms/shared/lib/passwordRule";

// ขั้นตอนตรวจ service_role → JWT → บทบาท → สิทธิ์ ย้ายไปอยู่ที่ adminRoute.ts (ใช้ร่วมกับ route อื่น)
// permission "users:manage" ดู permissions.ts — แหล่งเดียวกับ RLS/ตัวแอป · SSOT
const NOT_CONFIGURED = "ยังไม่ได้ตั้งค่าเซิร์ฟเวอร์ (SUPABASE_SERVICE_ROLE_KEY) — จัดการผู้ใช้ HQ จากที่นี่ยังไม่ได้";
const DENY = "ไม่มีสิทธิ์จัดการผู้ใช้สำนักงานใหญ่";

// บทบาทที่อนุญาตให้ "ตั้ง" ให้ผู้ใช้ HQ (ฝั่งสำนักงานใหญ่เท่านั้น — ไม่ออกบัญชีดีลเลอร์จากที่นี่)
function isHQRole(r: string): r is UserRole { return (HQ_ROLES as readonly string[]).includes(r); }

/** เก็บสำเนารหัสผ่าน (เข้ารหัส) ของผู้ใช้ HQ ให้เจ้าของบัญชีดูได้ที่หน้าโปรไฟล์ (/api/account/hq-secret)
 *  ยังไม่ตั้งกุญแจ = ลบสำเนาเก่าทิ้ง (ห้ามปล่อยรหัสเก่าที่ใช้ไม่ได้ค้างไว้) · ล้มเหลวไม่ทำให้การตั้งรหัสพัง แต่ต้องมีร่องรอย */
async function จำสำเนารหัสHQ(admin: SupabaseClient, userId: string, password: string) {
  const secret = dealerSecretReady() ? encryptSecret(password) : null;
  if (secret) {
    const { error } = await admin.from("hq_login_secrets")
      .upsert({ user_id: userId, secret, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) console.error(`[hq-user-secret] เก็บสำเนารหัสของ ${userId} ไม่สำเร็จ`, error);
  } else {
    const { error } = await admin.from("hq_login_secrets").delete().eq("user_id", userId);
    if (error) console.error(`[hq-user-secret] ลบสำเนารหัสเก่าของ ${userId} ไม่สำเร็จ`, error);
  }
}

async function must(p: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await p;
  if (error) throw new Error(error.message);
}

// ── สร้างผู้ใช้ HQ + บัญชีเข้าระบบจริง ──
export const POST = withErrors("create-user", async (req: NextRequest) => {
  const authz = await authorizeAdmin(req, "users:manage", DENY, NOT_CONFIGURED);
  if (!authz.ok) return authz.res;
  const { admin, callerId, prof } = authz.auth;

  // กันยิงรัว: สร้างผู้ใช้ HQ ได้ไม่เกิน 10 ครั้ง/นาที ต่อผู้เรียก (distributed ผ่าน DB · ดู rateLimit.ts)
  if (!(await checkRateLimit(admin, `create-user:${callerId}`, 10, 60))) {
    return bad(429, "สร้างผู้ใช้ถี่เกินไป — รอสักครู่แล้วลองใหม่");
  }

  const body = (await req.json().catch(() => null)) as null | {
    name?: string; email?: string; phone?: string; role?: string; department?: string;
    status?: string; avatar?: string; password?: string;
  };
  if (!body) return bad(400, "รูปแบบข้อมูลไม่ถูกต้อง");
  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const phone = String(body.phone ?? "").trim();
  const role = String(body.role ?? "").trim();
  const department = String(body.department ?? "").trim();
  const status = body.status === "inactive" ? "inactive" : "active";
  const avatar = typeof body.avatar === "string" ? body.avatar : "";
  if (!name) return bad(400, "ต้องระบุชื่อ");
  if (!/^\S+@\S+\.\S+$/.test(email)) return bad(400, "อีเมลไม่ถูกต้อง");
  if (!isHQRole(role)) return bad(400, "บทบาทไม่ถูกต้อง (ต้องเป็นผู้ใช้สำนักงานใหญ่)");
  // ตั้งบัญชีใหม่เป็น SUPER_ADMIN ได้เฉพาะผู้เรียกที่เป็น SUPER_ADMIN เอง — กันผู้บริหาร HQ
  // (ก็มีสิทธิ์ users:manage เหมือนกัน) ยกระดับบัญชีขึ้นไปเทียบเท่า/เหนือกว่าตัวเอง
  // ตรงกับกฎที่ RLS ของ profiles สงวนไว้อยู่แล้ว (0002_rls.sql) แต่ route นี้ใช้ service_role ข้าม RLS
  // จึงต้องบังคับซ้ำเองตรงนี้ (พบจากผลตรวจสอบตรรกะระบบ 31 ก.ค. 69)
  if (role === "SUPER_ADMIN" && String(prof.role) !== "SUPER_ADMIN") {
    return bad(403, "ตั้งบัญชีใหม่เป็นแอดมินสูงสุดได้เฉพาะแอดมินสูงสุดเท่านั้น");
  }

  // รหัสผ่านชั่วคราวที่ผู้ดูแลกรอกในฟอร์ม (15 ก.ย. 69) — เดิมช่องนี้แสดงอยู่แต่ไม่ถูกส่งมาใช้
  //   ไม่กรอก = สุ่มให้เหมือนเดิม · ตรวจกติกาเดียวกับทุกทาง (passwordRule.ts)
  const typedPassword = String(body.password ?? "");
  const ผิดกติกา = typedPassword ? ตรวจรหัสผ่านใหม่(typedPassword) : null;
  if (ผิดกติกา) return bad(400, ผิดกติกา);
  const password = typedPassword || strongPassword("BJ-");

  // สร้างบัญชี auth (ยืนยันอีเมลให้เลย เพราะเป็นบัญชีที่ HQ ออกให้)
  const { data: createdUser, error: createErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (createErr || !createdUser.user) {
    const msg = createErr?.message ?? "สร้างบัญชีเข้าระบบไม่สำเร็จ";
    // 400 = ผู้ใช้แก้เองได้ (เปลี่ยนอีเมล) · 503 = ระบบขัดข้อง ให้ลองใหม่ ไม่ใช่ความผิดผู้ใช้
    // เดิมตอบ 400 พร้อมข้อความดิบทุกกรณี ผู้ใช้จึงเข้าใจผิดว่ากรอกผิด แล้วไล่แก้ข้อมูลไปเรื่อย ๆ
    if (/already/i.test(msg)) return bad(400, `อีเมล ${email} ถูกใช้ไปแล้วในระบบยืนยันตัวตน`);
    console.error(`[create-user] สร้างบัญชีเข้าระบบ ${email} ไม่สำเร็จ`, createErr);
    return bad(503, "สร้างบัญชีเข้าระบบไม่สำเร็จชั่วคราว — ลองใหม่อีกครั้ง");
  }
  const uid = createdUser.user.id;

  // โปรไฟล์ผูกกับบัญชีที่เพิ่งสร้าง · dealer_code ว่าง = ผู้ใช้สำนักงานใหญ่ · contact_email = อีเมลล็อกอิน
  try {
    await must(admin.from("profiles").upsert({
      id: uid, role, dealer_code: "", name, department, phone, contact_email: email, status, avatar,
    }, { onConflict: "id" }));
  } catch (e) {
    // ย้อน auth user ที่เพิ่งสร้าง ไม่ให้เหลือบัญชีกำพร้า
    // ต้อง log ถ้าย้อนไม่สำเร็จ — ไม่งั้นเหลือบัญชีล็อกอินได้ที่ไม่มีโปรไฟล์ โดยไม่มีใครรู้
    // ต้องใช้ตัวช่วยที่เช็ก error ที่ "คืนกลับมาเป็นค่า" ด้วย — supabase-js ไม่โยน exception
    // เขียนเป็น try/catch เฉย ๆ จะดักไม่ติด แล้วบัญชีกำพร้าจะค้างโดยไม่มีใครรู้
    await deleteAuthUserLoud(admin, uid, "create-user");
    // คำขอผ่านการตรวจความถูกต้องมาหมดแล้ว — ที่พังคือฝั่งเซิร์ฟเวอร์ ไม่ใช่ข้อมูลที่กรอก
    console.error(`[create-user] สร้างโปรไฟล์ของ ${email} ไม่สำเร็จ`, e);
    return bad(503, "สร้างผู้ใช้ไม่สำเร็จชั่วคราว — ลองใหม่อีกครั้ง");
  }

  // คืนรหัสให้หน้าจอโชว์ครั้งเดียว · เก็บสำเนาเข้ารหัสให้เจ้าของบัญชีดูรหัสตัวเองได้ (หน้าโปรไฟล์)
  await จำสำเนารหัสHQ(admin, uid, password);
  await auditLog(admin, prof, "เพิ่มผู้ใช้ HQ", email);
  return NextResponse.json({ ok: true, id: uid, email, password });
});

// ── ลบผู้ใช้ HQ (hard delete) — ลบ auth.users แล้ว profile หายตาม (FK on delete cascade) ──
export const DELETE = withErrors("delete-user", async (req: NextRequest) => {
  const authz = await authorizeAdmin(req, "users:manage", DENY, NOT_CONFIGURED);
  if (!authz.ok) return authz.res;
  const { admin, callerId, prof } = authz.auth;

  // กันยิงรัว: ลบผู้ใช้ HQ ได้ไม่เกิน 10 ครั้ง/นาที ต่อผู้เรียก
  // เดิมเป็น handler เดียวในกลุ่มนี้ที่ไม่มี rate limit ทั้งที่ทำลายล้างที่สุด (พบจากตรวจสอบระบบ 5 ส.ค. 69)
  if (!(await checkRateLimit(admin, `delete-user:${callerId}`, 10, 60))) {
    return bad(429, "ลบผู้ใช้ถี่เกินไป — รอสักครู่แล้วลองใหม่");
  }

  const id = (new URL(req.url).searchParams.get("id") ?? "").trim();
  if (!id) return bad(400, "ไม่ได้ระบุผู้ใช้ที่จะลบ");
  if (id === callerId) return bad(400, "ลบบัญชีของตัวเองไม่ได้");

  const { data: target, error: targetErr } = await admin.from("profiles")
    .select("role, dealer_code, name").eq("id", id).maybeSingle();
  // อ่านไม่ได้ ≠ ไม่มีผู้ใช้ — ถ้ากลืนเป็น 404 จะไล่ปัญหาไม่ถูก และเสี่ยงข้ามด่านเช็ค SUPER_ADMIN ข้างล่าง
  if (targetErr) {
    console.error(`[delete-user] อ่านโปรไฟล์ ${id} ไม่สำเร็จ`, targetErr);
    return bad(503, "อ่านข้อมูลผู้ใช้ไม่สำเร็จชั่วคราว — ลองใหม่อีกครั้ง");
  }
  if (!target) return bad(404, "ไม่พบผู้ใช้นี้");
  // route นี้จัดการเฉพาะผู้ใช้สำนักงานใหญ่ — บัญชีดีลเลอร์ต้องจัดการที่หน้า /hq/dealers
  if (String(target.dealer_code ?? "")) return bad(400, "นี่เป็นบัญชีดีลเลอร์ — จัดการที่หน้า “ดีลเลอร์”");

  // ลบบัญชี SUPER_ADMIN ได้เฉพาะผู้เรียกที่เป็น SUPER_ADMIN เอง (เหตุผลเดียวกับตอนสร้าง — เหตุผลด้านบน)
  if (String(target.role) === "SUPER_ADMIN" && String(prof.role) !== "SUPER_ADMIN") {
    return bad(403, "ลบบัญชีแอดมินสูงสุดได้เฉพาะแอดมินสูงสุดเท่านั้น");
  }
  // กันลบ SUPER_ADMIN คนสุดท้าย (ไม่งั้นระบบจะไม่มีผู้ดูแลสูงสุดเหลือเลย)
  if (String(target.role) === "SUPER_ADMIN") {
    const { count, error: cntErr } = await admin.from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "SUPER_ADMIN").eq("dealer_code", "");
    // นับไม่ได้ = ห้ามเดาว่ายังเหลือคนอื่น ไม่งั้นอาจลบแอดมินสูงสุดคนสุดท้ายจนไม่มีใครเข้าระบบได้อีก
    if (cntErr) {
      console.error("[delete-user] นับจำนวนแอดมินสูงสุดไม่สำเร็จ", cntErr);
      return bad(503, "ตรวจสอบจำนวนผู้ดูแลระบบไม่สำเร็จชั่วคราว — ลองใหม่อีกครั้ง");
    }
    if ((count ?? 0) <= 1) return bad(400, "ลบผู้ดูแลระบบคนสุดท้ายไม่ได้");
  }

  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) {
    // บัญชีมีอยู่จริง (ตรวจไปแล้วข้างบน) และเงื่อนไขห้ามลบก็ผ่านหมด — พังตรงนี้คือฝั่งระบบ
    console.error(`[delete-user] ลบบัญชี ${id} ไม่สำเร็จ`, error);
    return bad(503, "ลบบัญชีไม่สำเร็จชั่วคราว — ลองใหม่อีกครั้ง");
  }
  await auditLog(admin, prof, "ลบผู้ใช้ HQ", String(target.name ?? id));
  return NextResponse.json({ ok: true });
});

// ── ตั้งรหัสผ่านใหม่ให้ผู้ใช้ HQ (ผู้ดูแลสูงสุดเท่านั้น) ──────────────────────────────
//
// ที่มา (บอสสั่ง 14 ส.ค. 69): "ผู้ดูแลระบบต้องเปลี่ยนรหัสของผู้ใช้สำนักงานใหญ่ได้ทุกคน"
//
// เดิมมีทางเดียวคือ "ส่งลิงก์ตั้งรหัสใหม่ทางอีเมล" ซึ่งพึ่งอีเมลล้วน ๆ — ใช้ไม่ได้จริงเมื่อ:
//   • ยังไม่ได้ตั้ง SMTP ของตัวเอง (บริการเดโมของ Supabase จำกัดปริมาณ/โดเมน)
//   • ผู้ใช้เข้าอีเมลไม่ได้ / อีเมลติดต่อในระบบไม่ตรงกับอีเมลที่ใช้ล็อกอินจริง
//   และ Supabase ตอบ "ส่งแล้ว" เสมอแม้อีเมลผิด → ผู้ดูแลไม่มีทางรู้ว่าไม่มีใครได้ลิงก์
// เส้นทางนี้จึงตั้งรหัสให้ตรง ๆ แล้วคืนรหัสมาโชว์ครั้งเดียว (แนวเดียวกับรีเซ็ตรหัสของดีลเลอร์)
//
// ด่านที่ล้อมไว้:
//   1) เฉพาะ SUPER_ADMIN — users:manage ยังกว้างไป (ผู้บริหาร HQ ก็มี) การตั้งรหัสให้คนอื่น
//      = สวมสิทธิ์เข้าระบบแทนเขาได้ จึงต้องจำกัดที่บทบาทสูงสุดเท่านั้น
//   2) เปลี่ยนได้เฉพาะ "ผู้ใช้ฝั่งสำนักงานใหญ่" — บัญชีดีลเลอร์มีเส้นทางของตัวเองที่เก็บรหัสไว้ให้ HQ ดู
//      (PATCH /api/admin/dealers) ถ้าตั้งจากที่นี่ รหัสที่เก็บไว้จะไม่ตรงกับของจริงทันที
//   3) จำกัด 10 ครั้ง/นาที · บันทึก audit ทุกครั้ง (ใครเปลี่ยนรหัสให้ใคร)
export const PATCH = withErrors("reset-hq-user-pw", async (req: NextRequest) => {
  const authz = await authorizeAdmin(req, "users:manage", DENY, NOT_CONFIGURED);
  if (!authz.ok) return authz.res;
  const { admin, callerId, prof } = authz.auth;

  if (String(prof?.role) !== "SUPER_ADMIN") {
    return bad(403, "ตั้งรหัสผ่านให้ผู้ใช้คนอื่นได้เฉพาะผู้ดูแลสูงสุด");
  }
  if (!(await checkRateLimit(admin, `reset-hq-user-pw:${callerId}`, 10, 60))) {
    return bad(429, "ตั้งรหัสผ่านถี่เกินไป — รอสักครู่แล้วลองใหม่");
  }

  const id = (new URL(req.url).searchParams.get("id") ?? "").trim();
  if (!id) return bad(400, "ไม่ได้ระบุผู้ใช้");

  // ต้องเป็นผู้ใช้ฝั่งสำนักงานใหญ่จริง — อ่านจาก profiles ไม่เชื่อสิ่งที่หน้าจอส่งมา
  const { data: target, error: profErr } = await admin
    .from("profiles").select("id, name, role, dealer_code").eq("id", id).maybeSingle();
  if (profErr) {
    console.error("[reset-hq-user-pw] อ่านโปรไฟล์ปลายทางไม่สำเร็จ", profErr);
    return bad(503, "อ่านข้อมูลผู้ใช้ไม่สำเร็จชั่วคราว — ลองใหม่อีกครั้ง");
  }
  if (!target) return bad(404, "ไม่พบผู้ใช้รายนี้");
  if (String(target.dealer_code ?? "") !== "" || !isHQRole(String(target.role))) {
    return bad(400, "เส้นทางนี้ใช้ได้เฉพาะผู้ใช้สำนักงานใหญ่ — บัญชีดีลเลอร์ให้รีเซ็ตที่หน้าทะเบียนดีลเลอร์");
  }

  // ผู้ดูแลตั้งรหัสเองได้ (บอสสั่ง 14 ส.ค. 69 — "เปลี่ยนแบบไม่ต้องส่งอีเมลยืนยัน")
  //   ไม่ส่งอะไรมา = ให้เซิร์ฟเวอร์สุ่มให้เหมือนเดิม
  //   ความยาวขั้นต่ำ 8 = เกณฑ์เดียวกับตอนผู้ใช้เปลี่ยนรหัสตัวเอง (supabaseAuth.ts) ไม่ตั้งคนละมาตรฐาน
  const body = await req.json().catch(() => null) as { password?: string } | null;
  // ไม่ตัดช่องว่างทิ้งเงียบ ๆ แล้ว — ปฏิเสธพร้อมบอกเหตุผล (กติกาเดียวกับทุกทางใน passwordRule.ts)
  const typed = String(body?.password ?? "");
  const ผิดกติกา = typed ? ตรวจรหัสผ่านใหม่(typed) : null;
  if (ผิดกติกา) return bad(400, ผิดกติกา);
  const password = typed || strongPassword("BJ-");
  const { data: updated, error: updateErr } = await admin.auth.admin.updateUserById(id, { password });
  if (updateErr || !updated.user) {
    console.error(`[reset-hq-user-pw] ตั้งรหัสผ่านใหม่ให้ ${id} ไม่สำเร็จ`, updateErr);
    return bad(503, "ตั้งรหัสผ่านไม่สำเร็จชั่วคราว — ลองใหม่อีกครั้ง");
  }

  // สำเนาที่เจ้าของบัญชีเปิดดูได้ต้องเป็นรหัสใหม่ — เดิมไม่อัปเดต เจ้าของเปิดดูแล้วเห็นรหัสเก่าที่ใช้ไม่ได้
  await จำสำเนารหัสHQ(admin, id, password);

  // บันทึกว่าเป็นรหัสที่ผู้ดูแลตั้งเองหรือระบบสุ่มให้ — ต่างกันตอนตรวจย้อนหลัง (ห้ามบันทึกตัวรหัส)
  await auditLog(admin, prof, "ตั้งรหัสผ่านใหม่ให้ผู้ใช้ HQ",
    `${target.name ?? ""} · ${updated.user.email ?? ""} · ${typed ? "ผู้ดูแลตั้งเอง" : "ระบบสุ่มให้"}`);
  return NextResponse.json({ ok: true, email: updated.user.email ?? "", password });
});
