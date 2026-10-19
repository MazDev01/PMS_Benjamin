// ── H5 · สร้างดีลเลอร์ "พร้อมบัญชีเข้าระบบจริง" (ต้องใช้ service_role) ────────────────
//
// ทำไมต้องเป็น Route Handler ฝั่งเซิร์ฟเวอร์:
//   การสร้างบัญชีใน auth.users ต้องใช้ service_role ซึ่ง "ห้ามอยู่ในเบราว์เซอร์เด็ดขาด"
//   (ใครถือคีย์นี้ข้าม RLS ได้ทั้งระบบ) — จึงทำได้เฉพาะที่นี่ ที่รันบนเซิร์ฟเวอร์เท่านั้น
//
// เดิม (บั๊ก H5): หน้า /hq/dealers สร้างเฉพาะแถวใน dealers + โชว์รหัสให้ก๊อป
//   แต่ไม่มีบัญชี auth ผูกอยู่ → ดีลเลอร์ใหม่ล็อกอินไม่ได้เลย · รหัสที่โชว์ไม่มีความหมายกับระบบใด
//
// ความปลอดภัยของ handler นี้ (ไล่ตามลำดับ):
//   1) ตรวจ JWT ของ "ผู้เรียก" ที่เซิร์ฟเวอร์เอง แล้วดูบทบาทจาก profiles จริง
//      — ห้ามเชื่อว่า route ถูกเรียกจากหน้าจอที่ถูกต้อง (ใครยิงตรงก็ถึง)
//   2) service_role อ่านจาก env ฝั่งเซิร์ฟเวอร์เท่านั้น (ไม่มี NEXT_PUBLIC_)
//   3) ล้มเหลวกลางทาง = ลบ auth user ที่เพิ่งสร้างทิ้ง ไม่ให้เหลือบัญชีกำพร้า
import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkRateLimit } from "@pms/shared/lib/rateLimit";
import {
  bad, authorizeAdmin, auditLog, withErrors, strongPassword, findDealerAccount, deleteAuthUserLoud,
  อีเมลถูกใช้แล้ว,
} from "@pms/shared/lib/adminRoute";
import { encryptSecret, dealerSecretReady } from "@pms/shared/lib/dealerSecret";
import { ตรวจรหัสผ่านใหม่ } from "@pms/shared/lib/passwordRule";
import { อีเมลเข้าระบบของสาขา } from "@pms/shared/lib/dealerLogin";

// รันบน Node เสมอ (ต้องใช้ service_role — ห้าม edge ที่อาจแคช env แปลก ๆ)
export const runtime = "nodejs";

// ใช้ตรวจ "อีเมลซ้ำ" กับระบบยืนยันตัวตนโดยตรง (ดู อีเมลถูกใช้แล้ว ใน adminRoute.ts)
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

// อีเมลเข้าระบบของสาขาที่ระบบตั้งให้ = <รหัสสาขา>@dealer.benjaminpebsteel.com (lib/dealerLogin.ts · 19 ต.ค. 69)

// ขั้นตอนตรวจ service_role → JWT → บทบาท → สิทธิ์ ย้ายไปอยู่ที่ adminRoute.ts (ใช้ร่วมกับ route อื่น)
// permission "dealers:manage" ผูกตรงกับ permissions.ts/RLS can_write_master · SSOT
const NOT_CONFIGURED = "ยังไม่ได้ตั้งค่าเซิร์ฟเวอร์ (SUPABASE_SERVICE_ROLE_KEY) — จัดการดีลเลอร์จากที่นี่ยังไม่ได้";
const DENY = "ไม่มีสิทธิ์จัดการดีลเลอร์";

async function must(p: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await p;
  if (error) throw new Error(error.message);
}

/** เก็บสำเนารหัสผ่าน (เข้ารหัส) ให้ HQ เปิดดูย้อนหลังได้ — บอสสั่ง 5 ส.ค. 69
 *  ล้มเหลวต้องไม่ทำให้การสร้าง/รีเซ็ตพัง (รหัสถูกตั้งที่ Auth ไปแล้ว) แต่ต้องดังพอให้รู้
 *  ถ้ายังไม่ตั้ง DEALER_SECRET_KEY จะ "ไม่เก็บ" ไม่ใช่เก็บเป็นข้อความเปล่า — ดู dealerSecret.ts */
async function rememberSecret(admin: SupabaseClient, code: string, password: string, by: string) {
  if (!dealerSecretReady()) {
    console.warn(`[dealer-secret] ยังไม่ได้ตั้ง DEALER_SECRET_KEY — ไม่เก็บสำเนารหัสของ ${code}`);
    return;
  }
  const secret = encryptSecret(password);
  if (!secret) { console.error(`[dealer-secret] เข้ารหัสรหัสของ ${code} ไม่สำเร็จ`); return; }
  const { error } = await admin.from("dealer_login_secrets")
    .upsert({ dealer_code: code, secret, updated_at: new Date().toISOString(), updated_by: by });
  if (error) console.error(`[dealer-secret] เก็บสำเนารหัสของ ${code} ไม่สำเร็จ`, error);
}

export const POST = withErrors("create-dealer", async (req: NextRequest) => {
  // ── 1) ตรวจ service_role + ยืนยันตัวตน + สิทธิ์ของ "ผู้เรียก" ที่เซิร์ฟเวอร์ (ห้ามเชื่อหน้าจอ) ──
  const authz = await authorizeAdmin(req, "dealers:manage", DENY, NOT_CONFIGURED);
  if (!authz.ok) return authz.res;
  const { admin, callerId, prof } = authz.auth;

  // กันยิงรัวแบบหลุดลูป (distributed ผ่าน DB · ดู rateLimit.ts)
  // 30/นาที: เดิม 10 ตึงเกินไปจนงานปกติชนเพดาน — การเปิดสาขาเป็นชุด (onboarding หลายสาขารวดเดียว
  // และชุดทดสอบโหลดที่สร้าง 10 สาขาพอดี) ชนบ่อยจนต้องล้างตัวนับด้วยมือ ซึ่งอันตรายกว่าตัวเพดานเอง
  // 30 ยังกันสคริปต์ที่หลุดลูปได้ (นับเป็นร้อย) แต่ไม่ขวางงานจริงของผู้ดูแล
  if (!(await checkRateLimit(admin, `create-dealer:${callerId}`, 30, 60))) {
    return bad(429, "สร้างดีลเลอร์ถี่เกินไป — รอสักครู่แล้วลองใหม่");
  }

  // ── 2) ตรวจ payload ──
  const body = (await req.json().catch(() => null)) as null | {
    code?: string; name?: string; province?: string; region?: string; revenueTarget?: number;
    email?: string; password?: string; prospectId?: number; provinces?: unknown;
  };
  if (!body) return bad(400, "รูปแบบข้อมูลไม่ถูกต้อง");
  const code = String(body.code ?? "").trim().toUpperCase();
  const name = String(body.name ?? "").trim();
  const province = String(body.province ?? "").trim();
  const region = String(body.region ?? "").trim();
  // let: ถ้าใบค่าแฟรนไชส์ระบุเป้ายอดซื้อต่อปี จะใช้ค่าจากใบแทน (ตรวจด้านล่างหลังผ่านด่านใบ)
  let revenueTarget = Number(body.revenueTarget ?? 0);
  if (!/^[A-Z]{2,5}$/.test(code)) return bad(400, "รหัสดีลเลอร์ต้องเป็นตัวอักษร A–Z 2–5 ตัว");
  if (!name || !province) return bad(400, "ต้องระบุชื่อและจังหวัด");
  // เป้ายอดขายต้องเป็นตัวเลขที่ใช้ได้จริง — ต้องเช็ค "ก่อน" สร้างบัญชี auth ไม่งั้นค่าเพี้ยน (NaN/ติดลบ)
  // จะไปพังตอน insert แล้วต้องย้อนลบบัญชีที่เพิ่งสร้างทิ้งฟรี ๆ ทั้งที่เป็นแค่ input ผิด
  if (!Number.isFinite(revenueTarget) || revenueTarget < 0) {
    return bad(400, "เป้ายอดขายต้องเป็นตัวเลขไม่ติดลบ");
  }

  // สาขาซ้ำ = ปฏิเสธก่อนแตะ auth (กันสร้าง auth user ทิ้งฟรี)
  const { data: dupe, error: dupeErr } = await admin.from("dealers").select("code").eq("code", code).maybeSingle();
  if (dupeErr) {
    console.error("[create-dealer] ตรวจรหัสซ้ำไม่สำเร็จ", dupeErr);
    return bad(503, "ตรวจสอบรหัสดีลเลอร์ไม่สำเร็จชั่วคราว — ลองใหม่อีกครั้ง");
  }
  if (dupe) return bad(409, `รหัส "${code}" มีอยู่แล้ว`);

  // ── ดีลเลอร์ต้องมาจากลูกค้าเป้าหมายที่สำเร็จแล้วเท่านั้น (บอสสั่ง 14 ก.ย. 69) ──
  //   ไม่มีการเพิ่มดีลเลอร์ตรง ๆ อีกต่อไป — บังคับที่เซิร์ฟเวอร์ ไม่ใช่แค่ถอดปุ่มออกจากหน้าจอ
  //   (ใครยิง API ตรงก็ต้องโดนกฎเดียวกัน)
  //   ตรวจ "ก่อน" สร้างบัญชี: รายนั้นต้องมีอยู่จริง และยังไม่เคยเป็นดีลเลอร์
  //   ไม่งั้นกดซ้ำ (หรือสองคนกดพร้อมกัน) จะได้สาขาซ้อนสองสาขาจากคนคนเดียว
  //   หมายเหตุ: สคริปต์ลงทะเบียนสาขาตั้งต้น (scripts/seed-dealers.mjs) ใช้กุญแจระบบโดยตรง ไม่ผ่านเส้นทางนี้
  if (body.prospectId == null) {
    return bad(400, "ดีลเลอร์ต้องสร้างจากลูกค้าเป้าหมายที่สำเร็จแล้ว — เริ่มที่หน้า “ลูกค้าเป้าหมาย (HQ)”");
  }
  const prospectId = Number(body.prospectId);
  // แพ็กเกจของสาขา = แพ็กเกจของใบหลัก → เป้ายอดขายเชื่อมกับแพ็กเกจ (0178 · บอสสั่ง 15 ก.ย. 69)
  let แพ็กเกจ: string | null = null;
  {
    if (!Number.isInteger(prospectId) || prospectId <= 0) return bad(400, "ไม่พบลูกค้าเป้าหมายที่อ้างถึง");
    const { data: pr, error: prErr } = await admin.from("dealer_prospects")
      .select("id, status, dealer_code").eq("id", prospectId).maybeSingle();
    if (prErr) {
      console.error("[create-dealer] ตรวจลูกค้าเป้าหมายไม่สำเร็จ", prErr);
      return bad(503, "ตรวจข้อมูลลูกค้าเป้าหมายไม่สำเร็จชั่วคราว — ลองใหม่อีกครั้ง");
    }
    if (!pr) return bad(404, "ไม่พบลูกค้าเป้าหมายรายนี้แล้ว — อาจถูกลบไปก่อนหน้า");
    if (pr.status === "won" && pr.dealer_code) return bad(409, `ลูกค้าเป้าหมายรายนี้เป็นดีลเลอร์แล้ว (รหัส ${pr.dealer_code})`);

    // ── ตกลง + ชำระ (ด่าน 4 · บอสตัดสิน 15 ต.ค. 69 · 0208) ──
    //   แปลงได้เมื่อ ใบค่าแฟรนไชส์ตอบรับ + ยอดชำระรวม (ไม่นับที่ยกเลิก) ≥ ยอดในใบ — ฐานข้อมูลตอบ (dealer_conversion_ready)
    //   ตรวจ "ก่อน" สร้างบัญชี ไม่ทิ้งบัญชีกำพร้า · ฐานข้อมูลบังคับซ้ำตอนเพิ่มแถวดีลเลอร์ (dealers.prospect_id)
    //   (เดิม 14 ก.ย. 69: แค่มีใบที่ส่งแล้วก็แปลงได้ แล้วระบบตั้งใบนั้นเป็นตอบรับให้เอง)
    const { data: ยังไม่พร้อม, error: พร้อมErr } = await admin.rpc("dealer_conversion_ready", { p_prospect: prospectId });
    if (พร้อมErr) {
      console.error("[create-dealer] ตรวจความพร้อมแปลงไม่สำเร็จ", พร้อมErr);
      return bad(503, "ตรวจใบค่าแฟรนไชส์ไม่สำเร็จชั่วคราว — ลองใหม่อีกครั้ง");
    }
    if (ยังไม่พร้อม) return bad(400, `ยังแปลงเป็นดีลเลอร์ไม่ได้ — ${ยังไม่พร้อม}`);
    const { data: ใบ, error: ใบErr } = await admin.from("dealer_package_proposals")
      .select("id, status, annual_target, package").eq("prospect_id", prospectId).eq("status", "accepted")
      .order("id", { ascending: false });
    if (ใบErr || !ใบ?.length) {
      console.error("[create-dealer] อ่านใบค่าแฟรนไชส์ที่ตอบรับไม่สำเร็จ", ใบErr);
      return bad(503, "ตรวจใบค่าแฟรนไชส์ไม่สำเร็จชั่วคราว — ลองใหม่อีกครั้ง");
    }
    // เป้ายอดขายรายปีของสาขา = เป้ายอดซื้อต่อปีในใบที่ตอบรับล่าสุด (0206: เป้าในใบชนะ) · ใบไม่ระบุ = ใช้ค่าที่ส่งมา (หน้าจอส่ง 0)
    const ใบหลัก = ใบ[0];
    แพ็กเกจ = ใบหลัก.package === "standard" || ใบหลัก.package === "exclusive" ? ใบหลัก.package : null;
    if (ใบหลัก.annual_target != null && Number.isFinite(Number(ใบหลัก.annual_target)) && Number(ใบหลัก.annual_target) >= 0) {
      revenueTarget = Number(ใบหลัก.annual_target);
    }
  }

  // ── จังหวัดที่ดูแล (ด่าน 4 · FLOW: แปลงเป็นดีลเลอร์ · HQ กำหนดจังหวัดที่ดูแล) ──
  //   ตรวจ "ก่อน" สร้างบัญชี: เป็นจังหวัดจริง · จังหวัดที่มีดีลเลอร์ดูแลอยู่แล้วเลือกได้ (ใบ 0214 · ยกเลิกหนึ่งจังหวัดหนึ่งดีลเลอร์ 16 ต.ค. 69)
  //   บันทึกพร้อมทะเบียนสาขาในข้อ 4
  //   ไม่ส่งมา = ไม่กำหนด (สคริปต์/ข้อทดสอบเดิม) · หน้าจอบังคับเลือกอย่างน้อย 1 จังหวัด
  const พื้นที่ = Array.isArray(body.provinces)
    ? [...new Set(body.provinces.map(x => String(x ?? "").trim()).filter(Boolean))] : [];
  if (Array.isArray(body.provinces) && พื้นที่.length === 0) return bad(400, "ต้องเลือกจังหวัดที่ดูแลอย่างน้อย 1 จังหวัด");
  if (พื้นที่.length > 80) return bad(400, "จังหวัดที่ดูแลมากเกินไป");
  if (พื้นที่.length) {
    const { data: มีจริง, error: e1 } = await admin.from("th_provinces").select("name").in("name", พื้นที่);
    if (e1) {
      console.error("[create-dealer] ตรวจจังหวัดที่ดูแลไม่สำเร็จ", e1);
      return bad(503, "ตรวจจังหวัดที่ดูแลไม่สำเร็จชั่วคราว — ลองใหม่อีกครั้ง");
    }
    const รู้จัก = new Set((มีจริง ?? []).map(r => String(r.name)));
    const ไม่รู้จัก = พื้นที่.filter(p => !รู้จัก.has(p));
    if (ไม่รู้จัก.length) return bad(400, `ไม่รู้จักจังหวัด: ${ไม่รู้จัก.join(", ")}`);
  }
  // ── อีเมล/รหัสผ่าน: HQ กรอกเองได้ (บอสสั่ง 20 ส.ค. 69) · ไม่กรอก = ระบบตั้งให้เหมือนเดิม ──
  //
  // ทำไมต้องให้กรอกเอง: สาขาจริงใช้อีเมลธุรกิจของตัวเอง (เช่น sales@cmsteelbuild.co.th)
  //   อีเมลที่ระบบประกอบจากรหัสสาขาไม่มีอยู่จริง — รับอีเมลยืนยัน/ลืมรหัสผ่านไม่ได้เลย
  //
  // ⚠️ ต้องตรวจที่เซิร์ฟเวอร์เสมอ ห้ามเชื่อว่าหน้าจอตรวจมาแล้ว (ใครยิง route ตรงก็ถึง)
  //    รหัสผ่านสั้น ๆ ที่หลุดเข้ามาทางนี้ = บัญชีของสาขาถูกเดารหัสได้จริง
  const อีเมลที่กรอก = String(body.email ?? "").trim().toLowerCase();
  const รหัสที่กรอก = String(body.password ?? "");
  if (อีเมลที่กรอก && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(อีเมลที่กรอก)) {
    return bad(400, "รูปแบบอีเมลไม่ถูกต้อง");
  }
  // กติการหัสผ่านชุดเดียวทั้งระบบ (ยาว ≥ 8 · ห้ามช่องว่าง) — ดู passwordRule.ts
  const ผิดกติกา = รหัสที่กรอก ? ตรวจรหัสผ่านใหม่(รหัสที่กรอก) : null;
  if (ผิดกติกา) return bad(400, ผิดกติกา);
  const email = อีเมลที่กรอก || อีเมลเข้าระบบของสาขา(code);
  const password = รหัสที่กรอก || strongPassword("PEB-");

  // ถามระบบยืนยันตัวตนก่อนว่าอีเมลนี้ว่างไหม — อีเมลที่เติมมาจากลูกค้าเป้าหมายอาจเป็นของบัญชีอื่นอยู่แล้ว
  //   ระบบยืนยันตัวตนตอบกรณีซ้ำเป็น 500 เนื้อความว่าง (ดู อีเมลถูกใช้แล้ว) → ถ้าไม่ถามก่อน ผู้ใช้จะได้
  //   "สร้างไม่สำเร็จชั่วคราว — ลองใหม่" ซึ่งลองกี่ครั้งก็ไม่สำเร็จ (PATCH/อนุมัติคำขอ/ดีลเลอร์แก้เอง ถามก่อนอยู่แล้ว)
  if ((await อีเมลถูกใช้แล้ว(SUPABASE_URL, SERVICE_KEY, email)) === true) {
    return bad(400, `อีเมล ${email} ถูกใช้ไปแล้วในระบบยืนยันตัวตน — ใช้อีเมลอื่น`);
  }

  // ── 3) สร้างบัญชี auth (ยืนยันอีเมลให้เลย เพราะเป็นบัญชีที่ HQ ออกให้) ──
  const { data: createdUser, error: createErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    // ⛔ ไม่ตั้งเครื่องหมาย must_change_password / must_verify_email แล้ว (บอสตัดสิน 19 ต.ค. 69 · เข้าแล้วเข้าหน้าหลักทันที)
    //   ฐานยังมีด่าน 0187: บัญชีที่มี must_change_password อ่าน/เขียนข้อมูลไม่ได้ — ตั้งเมื่อไร ดีลเลอร์เห็นทุกหน้าว่าง
    //   ข้อทดสอบ dealer-no-forced-gate.spec.ts (สร้างดีลเลอร์ผ่านเส้นทางนี้แล้วตรวจว่าไม่มีเครื่องหมาย)
  });
  if (createErr || !createdUser.user) {
    const msg = createErr?.message ?? "สร้างบัญชีเข้าระบบไม่สำเร็จ";
    // แยกให้ชัดว่าเป็นความผิดของ "คำขอ" หรือของ "ระบบ" — ผู้ใช้ทำต่างกันคนละเรื่อง
    //   400 = ผู้ใช้แก้เองได้ (เปลี่ยนรหัสสาขา) · 503 = ระบบขัดข้อง ให้ลองใหม่ ไม่ใช่ความผิดผู้ใช้
    // เดิมตอบ 400 พร้อมข้อความดิบจากระบบยืนยันตัวตนทุกกรณี — ผู้ใช้เห็นแล้วนึกว่าตัวเองกรอกผิด
    // แล้วลองแก้ข้อมูลไปเรื่อย ๆ ทั้งที่ปัญหาอยู่ที่เซิร์ฟเวอร์ · ทั้งยังเผยรายละเอียดภายในออกไปด้วย
    if (/already/i.test(msg)) return bad(400, `อีเมล ${email} ถูกใช้ไปแล้วในระบบยืนยันตัวตน`);
    console.error(`[create-dealer] สร้างบัญชีเข้าระบบของสาขา ${code} ไม่สำเร็จ`, createErr);
    return bad(503, "สร้างบัญชีเข้าระบบไม่สำเร็จชั่วคราว — ลองใหม่อีกครั้ง");
  }
  const uid = createdUser.user.id;

  // ── 4) ทะเบียนสาขา + โปรไฟล์ (ผูกกับบัญชีที่เพิ่งสร้าง) · ล้มเหลว = ย้อน auth user ──
  try {
    await must(admin.from("dealers").insert({
      code, name, province, region, revenue_target: revenueTarget, status: "active", package: แพ็กเกจ,
      prospect_id: prospectId,   // ด่านในฐาน (0208): ผูกผู้สนใจแล้วต้องตอบรับ + ชำระครบ
    }));
    if (พื้นที่.length) {
      await must(admin.from("dealer_territories").insert(พื้นที่.map(p => ({ province: p, dealer_code: code }))));
    }
    // profiles.id → auth.users(id) · บทบาทตั้งต้นของหัวสาขา = DEALER_ADMIN
    await must(admin.from("profiles").upsert({
      id: uid, role: "DEALER_ADMIN", dealer_code: code, name, status: "active",
    }, { onConflict: "id" }));
    // ชื่อบริษัทตั้งต้น = ชื่อที่ HQ ตั้งให้ตอนเปิดสาขา (บอสสั่ง 18 ส.ค. 69)
    //   เดิมช่อง "ชื่อบริษัท" ของสาขาว่างเอาไว้ → หัวเอกสาร/แถบบน/เมนูซ้ายเลยตกไปขึ้น "รหัสสาขา"
    //   จนกว่าสาขาจะไปกรอกเอง — ชื่อใน HQ กับที่สาขาเห็นจึงไม่ตรงกัน (ผู้ใช้แจ้ง)
    //   ⚙️ เป็นแค่ "ค่าตั้งต้น" — สาขาแก้ทีหลังได้ตามปกติที่หน้าตั้งค่า และจะไม่ทับของสาขาที่เคยตั้งไว้ (onConflict do nothing)
    const { error: setErr } = await admin.from("dealer_settings")
      .insert({ dealer_code: code, issuer: { company: name } });
    // ล้มตรงนี้ไม่ควรทำให้การสร้างสาขาล้มทั้งหมด — แต่ห้ามเงียบ ต้องมีร่องรอยให้ตามได้
    if (setErr && setErr.code !== "23505") console.error(`[create-dealer] ตั้งชื่อบริษัทตั้งต้นของสาขา ${code} ไม่สำเร็จ`, setErr);
  } catch (e) {
    // ย้อนทุกอย่างที่อาจสร้างไปแล้ว ไม่ให้เหลือบัญชี/แถวกำพร้า
    // ต้อง log ถ้าการย้อนเองล้มเหลว — ไม่งั้นเหลือของกำพร้าโดยไม่มีใครรู้ (คือบั๊กที่การย้อนพยายามกันอยู่แท้ ๆ)
    await deleteAuthUserLoud(admin, uid, "create-dealer");
    try {
      const { error: delErr } = await admin.from("dealers").delete().eq("code", code);
      if (delErr) console.error(`[create-dealer] ย้อนลบทะเบียนสาขา ${code} ไม่สำเร็จ`, delErr);
    } catch (re) { console.error(`[create-dealer] ย้อนลบทะเบียนสาขา ${code} ไม่สำเร็จ`, re); }
    // ถึงตรงนี้แปลว่าคำขอผ่านการตรวจความถูกต้องมาหมดแล้ว — ที่พังคือฝั่งเซิร์ฟเวอร์ ไม่ใช่ข้อมูลที่กรอก
    const ข้อความ = String((e as Error)?.message ?? e);
    // ยอดชำระถูกยกเลิกระหว่างตรวจกับเพิ่มแถว (ด่านในฐาน 0208) — บอกเหตุผลจริง
    const ยังไม่พร้อม = /conversion_not_ready: (.*)/.exec(ข้อความ);
    if (ยังไม่พร้อม) return bad(409, `ยังแปลงเป็นดีลเลอร์ไม่ได้ — ${ยังไม่พร้อม[1]}`);
    console.error(`[create-dealer] สร้างทะเบียน/โปรไฟล์สาขา ${code} ไม่สำเร็จ`, e);
    return bad(503, "สร้างดีลเลอร์ไม่สำเร็จชั่วคราว — ลองใหม่อีกครั้ง");
  }

  await rememberSecret(admin, code, password, String(prof.name ?? ""));
  await auditLog(admin, prof, "สร้างดีลเลอร์", `${code} · ${name}`);

  // ผูกลูกค้าเป้าหมายเข้ากับสาขาที่เพิ่งสร้าง — ล้มตรงนี้ "ไม่ย้อน" การสร้างสาขา
  //   (บัญชีใช้งานได้แล้ว รหัสผ่านถูกตั้งแล้ว ย้อนทิ้งจะเสียหายกว่า) แต่ต้องบอกหน้าจอให้รู้ ไม่เงียบ
  let prospectLinked = false;
  {
    const { error: linkErr } = await admin.from("dealer_prospects")
      .update({ status: "won", dealer_code: code, converted_at: new Date().toISOString(), lost_reason: null })
      .eq("id", prospectId);
    prospectLinked = !linkErr;
    if (linkErr) console.error(`[create-dealer] ผูกลูกค้าเป้าหมาย #${prospectId} กับสาขา ${code} ไม่สำเร็จ`, linkErr);
    else await auditLog(admin, prof, "ลูกค้าเป้าหมายเป็นดีลเลอร์แล้ว", `#${prospectId} → ${code} · ${name}`);
  }
  // คืนรหัสให้หน้าจอโชว์ให้ก๊อปไปแจ้งดีลเลอร์ (และเก็บสำเนาเข้ารหัสไว้ให้ HQ เปิดดูภายหลังได้)
  return NextResponse.json({ ok: true, email, password, prospectLinked });
});

// ── HQ แก้อีเมลเข้าระบบ / ตั้งรหัสผ่านใหม่ให้ดีลเลอร์ (ปุ่ม "แก้อีเมล/รหัสผ่าน" หน้ารายละเอียดดีลเลอร์) ──
// ดีลเลอร์แก้เองได้ด้วย (/api/account · 2 ครั้ง แล้วต้องขออนุมัติ) — ทางนี้คือทางของสำนักงานใหญ่ ไม่นับโควตาของดีลเลอร์
// HQ พิมพ์รหัสเองได้ (บอสสั่ง 20 ส.ค. 69) · ไม่ส่งรหัสมา = สุ่มให้ · ตรวจกติกาเดียวกับทุกทาง (passwordRule.ts)
// ทุกครั้งที่เปลี่ยน: เก็บสำเนารหัส (ถ้าเปลี่ยนรหัส) · บันทึกประวัติ dealer_account_changes (by_self=false) · audit
export const PATCH = withErrors("reset-dealer-pw", async (req: NextRequest) => {
  const authz = await authorizeAdmin(req, "dealers:manage", DENY, NOT_CONFIGURED);
  if (!authz.ok) return authz.res;
  const { admin, callerId, prof } = authz.auth;

  // กันยิงรัว: รีเซ็ตรหัสผ่านได้ไม่เกิน 10 ครั้ง/นาที ต่อผู้เรียก
  if (!(await checkRateLimit(admin, `reset-dealer-pw:${callerId}`, 10, 60))) {
    return bad(429, "รีเซ็ตรหัสผ่านถี่เกินไป — รอสักครู่แล้วลองใหม่");
  }

  const code = (new URL(req.url).searchParams.get("code") ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2,5}$/.test(code)) return bad(400, "รหัสดีลเลอร์ไม่ถูกต้อง");

  // บัญชีเข้าระบบของสาขา = โปรไฟล์เดียวที่ dealer_code ตรงกับสาขานี้ (หนึ่งสาขาหนึ่งบัญชี — ดู H5)
  const found = await findDealerAccount(admin, code);
  if (!found.ok) return found.res;

  // ── HQ แก้อีเมล/ตั้งรหัสผ่านเองได้ (บอสสั่ง 20 ส.ค. 69) ────────────────────────
  //   ไม่ส่งอะไรมาเลย = "รีเซ็ตรหัสผ่าน" แบบเดิม (สุ่มรหัสให้)
  //   ส่ง email มา = เปลี่ยนอีเมลเข้าระบบของสาขา · ส่ง password มา = ตั้งรหัสตามที่กรอก
  //   ⚠️ ตรวจที่เซิร์ฟเวอร์เสมอ เหมือนตอนสร้าง — ห้ามเชื่อว่าหน้าจอตรวจมาแล้ว
  const แก้ = (await req.json().catch(() => null)) as null | { email?: string; password?: string };
  const อีเมลใหม่ = String(แก้?.email ?? "").trim().toLowerCase();
  const รหัสที่กรอก = String(แก้?.password ?? "");
  if (อีเมลใหม่ && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(อีเมลใหม่)) return bad(400, "รูปแบบอีเมลไม่ถูกต้อง");
  const ผิดกติกา = รหัสที่กรอก ? ตรวจรหัสผ่านใหม่(รหัสที่กรอก) : null;
  if (ผิดกติกา) return bad(400, ผิดกติกา);

  // ขอแก้เฉพาะอีเมล = ห้ามเปลี่ยนรหัสผ่านทิ้งโดยไม่ได้ขอ (สาขาที่ใช้รหัสเดิมอยู่จะหลุดทันที)
  const แก้อีเมลอย่างเดียว = !!อีเมลใหม่ && !รหัสที่กรอก;
  const password = แก้อีเมลอย่างเดียว ? "" : (รหัสที่กรอก || strongPassword("PEB-"));

  // ถามระบบยืนยันตัวตนก่อนว่าอีเมลใหม่ว่างไหม — กรณีซ้ำมันตอบ 500 เนื้อความว่าง จับจากข้อความไม่ได้
  if (อีเมลใหม่ && (await อีเมลถูกใช้แล้ว(SUPABASE_URL, SERVICE_KEY, อีเมลใหม่, found.id)) === true) {
    return bad(400, `อีเมล ${อีเมลใหม่} ถูกใช้ไปแล้วในระบบยืนยันตัวตน — ใช้อีเมลอื่น`);
  }
  // อีเมลเดิมไว้ลงประวัติ — ประวัติการเปลี่ยนบัญชีต้องครบทุกทาง (ดีลเลอร์แก้เอง/อนุมัติคำขอ/ลืมรหัส มีอยู่แล้ว ขาดทางนี้ทางเดียว)
  const { data: บัญชีเดิม } = await admin.auth.admin.getUserById(found.id);
  const อีเมลเดิม = บัญชีเดิม?.user?.email ?? null;
  // ⛔ เลิกตั้งเครื่องหมายบังคับตั้งรหัสให้บัญชีที่ยังไม่เคยเข้าระบบ (บอสตัดสิน 19 ต.ค. 69) — เหตุผลดูตอนสร้างบัญชีข้างบน
  const { data: updated, error: updateErr } = await admin.auth.admin.updateUserById(found.id, {
    ...(password ? { password } : {}),
    ...(อีเมลใหม่ ? { email: อีเมลใหม่, email_confirm: true } : {}),
  });
  if (updateErr || !updated.user) {
    const msg = updateErr?.message ?? "";
    // อีเมลชนกับบัญชีอื่น = ผู้ใช้แก้เองได้ (เปลี่ยนอีเมล) ไม่ใช่ระบบขัดข้อง
    if (/already|registered|exists/i.test(msg)) return bad(400, `อีเมล ${อีเมลใหม่} ถูกใช้ไปแล้วในระบบยืนยันตัวตน`);
    console.error(`[reset-dealer-pw] แก้บัญชีเข้าระบบของสาขา ${code} ไม่สำเร็จ`, updateErr);
    return bad(503, "แก้บัญชีเข้าระบบไม่สำเร็จชั่วคราว — ลองใหม่อีกครั้ง");
  }

  if (password) await rememberSecret(admin, code, password, String(prof.name ?? ""));
  // ประวัติการเปลี่ยนบัญชี — by_self=false = ไม่นับโควตาแก้เองของดีลเลอร์ (สำนักงานใหญ่เป็นคนเปลี่ยนให้)
  {
    const { error: logErr } = await admin.from("dealer_account_changes").insert({
      dealer_code: code,
      kind: อีเมลใหม่ && password ? "both" : อีเมลใหม่ ? "email" : "password",
      old_email: อีเมลใหม่ ? อีเมลเดิม : null, new_email: อีเมลใหม่ || null, by_self: false,
    });
    // ยังไม่ได้ติดตั้งตาราง (0165) = ไม่มีที่ให้บันทึก ไม่ใช่ความผิดพลาดของการแก้บัญชี
    if (logErr && logErr.code !== "42P01") console.error(`[reset-dealer-pw] บันทึกประวัติการเปลี่ยนบัญชีของ ${code} ไม่สำเร็จ`, logErr);
  }
  await auditLog(admin, prof,
    อีเมลใหม่ ? (password ? "แก้อีเมลและรหัสผ่านดีลเลอร์" : "แก้อีเมลเข้าระบบดีลเลอร์") : "รีเซ็ตรหัสผ่านดีลเลอร์",
    อีเมลใหม่ ? `${code} · ${อีเมลใหม่}` : code);
  return NextResponse.json({ ok: true, email: updated.user.email ?? "", password });
});

// ── ลบดีลเลอร์ "พร้อมบัญชีเข้าระบบ" (hard delete) ────────────────────────────────────
// เดิม: ลบดีลเลอร์ทำได้แค่ลบแถว dealers (ผ่าน RLS) → บัญชี auth ของสาขายังค้าง = บัญชีกำพร้า
//   (ล็อกอินได้แต่ไม่มีสาขา · และรหัสสาขาเดิมกลับมาสร้างซ้ำไม่ได้เพราะอีเมลชนบัญชีเก่า)
// ที่นี่ลบให้ครบ: auth user ของผู้ใช้สังกัดสาขานี้ (profile หายตาม FK cascade) + แถว dealers
export const DELETE = withErrors("delete-dealer", async (req: NextRequest) => {
  // ยืนยันตัวตน + สิทธิ์ของผู้เรียกที่เซิร์ฟเวอร์ (เหมือน POST — ห้ามเชื่อหน้าจอ)
  const authz = await authorizeAdmin(req, "dealers:manage", DENY, NOT_CONFIGURED);
  if (!authz.ok) return authz.res;
  const { admin, callerId, prof } = authz.auth;

  // กันยิงรัวแบบหลุดลูป — เพดานสูงกว่าจุดอื่น (30/นาที) เพราะการเคลียร์สาขาทีละหลายสิบเป็นงานปกติ
  // ของผู้ดูแล (และของชุดทดสอบโหลด) ต่างจากการ "สร้าง" ที่ทำทีละรายเสมอ
  // ความเสี่ยงลบผิดถูกกันด้วยด่านอื่นอยู่แล้ว: สาขาที่ยังมีข้อมูลงานขายลบไม่ได้เลย (409)
  if (!(await checkRateLimit(admin, `delete-dealer:${callerId}`, 30, 60))) {
    return bad(429, "ลบดีลเลอร์ถี่เกินไป — รอสักครู่แล้วลองใหม่");
  }

  const code = (new URL(req.url).searchParams.get("code") ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2,5}$/.test(code)) return bad(400, "รหัสดีลเลอร์ไม่ถูกต้อง");

  // ── กันทำลายครึ่งทาง ──
  // ── ตรวจ + ลบทั้งชุดในธุรกรรมเดียว (RPC 0119) ──
  //
  // เดิมยิงคำสั่งลบทีละก้อนแยกกันจากที่นี่: responsible_persons → dealer_lead_rules → dealers
  //   สองก้อนแรกไม่เช็กผลด้วย · ถ้าก้อนสุดท้ายพลาด ค่าตั้งของสาขาหายไปแล้วและกู้กลับไม่ได้
  //   สาขายังอยู่ แต่ผู้รับผิดชอบ/กฎติดตามหายเกลี้ยง ขณะที่หน้าจอแจ้งว่า "ลบไม่สำเร็จ"
  //   → ผู้ดูแลไม่รู้เลยว่ามีของหายไปแล้ว (ผลตรวจสอบระบบรอบ 2 · Part 8)
  //
  // ตอนนี้ทั้งชุดอยู่ในฟังก์ชันเดียวที่ฐานข้อมูล = ธุรกรรมเดียว พังตรงไหนย้อนกลับให้หมดเอง
  // การลบ "บัญชีเข้าระบบ" ยังทำที่นี่ (SQL แตะสคีมา auth ไม่ได้) และทำหลังธุรกรรมสำเร็จเท่านั้น
  // ลูกค้าเป้าหมายที่กลายมาเป็นสาขานี้ — ต้องจำไว้ "ก่อน" ลบ เพราะลบสาขาแล้ว dealer_code ในแถวนั้นจะถูกล้างเป็นว่าง (0170)
  //   แล้วกลายเป็นรายที่ค้างสถานะ "เป็นดีลเลอร์แล้ว" แต่ไม่ผูกกับสาขาไหน (เจอจริงในฐานจริง: หฟก → SSS)
  //   บอสสั่ง 15 ก.ย. 69: "ลบไปแล้วลบไปเลย" → ลบรายนั้นทิ้งด้วยหลังลบสาขาสำเร็จ (ใบเสนอ/ประวัติหายตาม cascade)
  const { data: ต้นทาง, error: ต้นทางErr } = await admin.from("dealer_prospects").select("id, name").eq("dealer_code", code);
  if (ต้นทางErr) console.error(`[delete-dealer] อ่านลูกค้าเป้าหมายต้นทางของ ${code} ไม่สำเร็จ`, ต้นทางErr);

  const { data: memberRows, error: delErr } = await admin.rpc("delete_dealer_atomic", { p_code: code });
  if (delErr) {
    const msg = delErr.message ?? "";
    // สาขาที่มีใบ HQ ส่งแล้ว ลบไม่ได้ตลอดไป (ใบที่ส่งแล้วเป็นหลักฐานราคา ลบไม่ได้ · ใบ 0189) — บอกทางไปต่อ ไม่ใช่ให้ไปไล่ลบข้อมูล
    if (/dealer_has_hq_quote:/.test(msg)) {
      return bad(409, `สาขา "${code}" มีใบเสนอราคาจาก HQ แล้ว ลบไม่ได้ ใช้ปิดใช้งานหรือย้ายข้อมูลแทน`);
    }
    const hasData = /dealer_has_data:([a-z_]+):(\d+)/.exec(msg);
    if (hasData) {
      // บอกเป็นคำที่ผู้ดูแลใช้ ไม่ใช่ชื่อตารางในฐานข้อมูล · ตารางที่ไม่รู้จักแสดงชื่อเดิมไว้ (ดีกว่าไม่บอกอะไร)
      const TH: Record<string, string> = {
        leads: "ลูกค้าเป้าหมาย", quotations: "ใบเสนอราคา", customers: "ลูกค้า", appointments: "นัดหมาย",
        files: "ไฟล์", customer_notes: "บันทึกของลูกค้า", quote_requests: "คำขอราคา",
      };
      return bad(409, `สาขา "${code}" ยังมีข้อมูล (${TH[hasData[1]] ?? hasData[1]} ${hasData[2]} รายการ) — ต้องย้าย/ลบข้อมูลก่อนจึงจะลบสาขาได้`);
    }
    if (/dealer_not_found:/.test(msg)) return bad(404, `ไม่พบดีลเลอร์รหัส "${code}"`);
    if (/forbidden:/.test(msg)) return bad(403, DENY);
    console.error(`[delete-dealer] ลบสาขา ${code} ไม่สำเร็จ`, delErr);
    return bad(503, "ลบดีลเลอร์ไม่สำเร็จชั่วคราว — ลองใหม่อีกครั้ง");
  }
  const members = (memberRows ?? []) as { member_id: string }[];

  // ลบลูกค้าเป้าหมายต้นทางของสาขานี้ (จำรายชื่อไว้ก่อนลบสาขาแล้ว — ดูด้านบน) · ล้มตรงนี้ไม่ย้อนการลบสาขา แต่ต้องมีร่องรอย
  if (ต้นทาง?.length) {
    const { error: ลบต้นทางErr } = await admin.from("dealer_prospects").delete().in("id", ต้นทาง.map(p => p.id));
    if (ลบต้นทางErr) console.error(`[delete-dealer] ลบลูกค้าเป้าหมายต้นทางของ ${code} ไม่สำเร็จ`, ลบต้นทางErr);
    else await auditLog(admin, prof, "ลบลูกค้าเป้าหมายต้นทางของดีลเลอร์ที่ถูกลบ", `${code} · ${ต้นทาง.map(p => p.name).join(", ")}`);
  }

  // ประวัติ/คำขอเปลี่ยนบัญชีของรหัสนี้ (0165 · ผูกด้วยรหัสเฉย ๆ ไม่มีกุญแจนอก) delete_dealer_atomic ล้างให้ในธุรกรรมเดียวกัน
  //   ตั้งแต่ใบ 0189 — เดิมล้างซ้ำที่นี่อีกรอบ เอาออกแล้ว (ก่อนขึ้นระบบจริง ข้อ 8 · ลงฐานก่อนโค้ดเสมอ)
  //   ล็อกด้วย supabase/tests/delete_dealer_clears_account_history.sql

  // ลบบัญชี auth ของผู้ใช้สังกัดสาขา (profile หายตาม cascade) — ทำท้ายสุด
  // เก็บรายชื่อที่ลบไม่สำเร็จไว้บอกผู้เรียกตรง ๆ ไม่กลืนเงียบ — บัญชีที่ค้างคือช่องข้ามสาขาถ้ารหัสถูกใช้ซ้ำ
  const orphans: string[] = [];
  for (const m of members) {
    if (!(await deleteAuthUserLoud(admin, String(m.member_id), "delete-dealer"))) orphans.push(String(m.member_id));
  }

  if (orphans.length) {
    // ทะเบียนสาขาถูกลบไปแล้ว (ย้อนไม่ได้) แต่ต้องไม่รายงานว่าสำเร็จทั้งหมด — และห้ามนำรหัสนี้กลับมาใช้ใหม่
    // จนกว่าจะเคลียร์บัญชีค้างเสร็จ ไม่งั้นบัญชีเก่าจะเห็นข้อมูลของสาขาใหม่
    await auditLog(admin, prof, "ลบดีลเลอร์ (บัญชีค้าง)", `${code} · เหลือบัญชีที่ลบไม่สำเร็จ ${orphans.length} บัญชี`);
    // ── ต้องตอบว่า "สำเร็จบางส่วน" ไม่ใช่ "ล้มเหลว" ──
    // ทะเบียนสาขาถูกลบไปแล้วจริงและย้อนไม่ได้ · เดิมตอบ 500 ซึ่งหน้าจอตีความว่าลบไม่สำเร็จ
    // แล้ว "คงสาขาไว้บนหน้าจอ" ทั้งที่ในระบบไม่มีแล้ว — ผู้ดูแลเห็นสาขาที่ลบไปแล้วเหมือนฟื้นกลับมา
    // และเข้าใจผิดว่าไม่ต้องทำอะไรต่อ ทั้งที่ยังมีบัญชีค้างที่ต้องเคลียร์ (ผลตรวจรอบ 2 · ระดับสูง)
    return NextResponse.json({
      ok: true,
      warning: `ลบทะเบียนสาขา "${code}" เรียบร้อยแล้ว แต่ลบบัญชีเข้าระบบไม่สำเร็จ ${orphans.length} บัญชี — ` +
        `ห้ามนำรหัส "${code}" กลับมาใช้ใหม่จนกว่าผู้ดูแลระบบจะเคลียร์บัญชีค้างเสร็จ`,
    });
  }

  await auditLog(admin, prof, "ลบดีลเลอร์", code);
  return NextResponse.json({ ok: true });
});
