// ── ผูกลูกค้าเป้าหมายกับ "ดีลเลอร์ที่มีอยู่แล้ว" (บอสสั่ง 15 ก.ย. 69 · เอาตามที่แนะนำ) ─────────
//
// เดิมหน้าจอผูกเองตรง ๆ (อัปเดตแถวลูกค้าเป้าหมายจากเบราว์เซอร์) — ไม่มีใครตรวจว่า:
//   • สาขานั้นมีอยู่จริงและเปิดใช้งานอยู่
//   • สาขานั้นยังไม่ถูกผูกกับลูกค้าเป้าหมายรายอื่น (คนเดียวกันถูกนับเป็นดีลเลอร์สองครั้ง)
//   • สาขานั้นมีบัญชีเข้าระบบหรือยัง
// ย้ายมาตรวจที่นี่ ใครยิงตรงก็โดนกฎเดียวกัน
//
// ⚙️ ไม่บังคับให้มีใบค่าแฟรนไชส์ที่ส่งแล้ว — ทางนี้ใช้บันทึกรายที่เป็นดีลเลอร์มาก่อนระบบนี้ (เช่น รายชื่อจาก Excel)
// ⚙️ สาขาที่ยังไม่มีบัญชีเข้าระบบ ผูกได้ แต่ตอบ hasAccount=false ให้หน้าจอเตือนให้ไปตั้งอีเมล/รหัสผ่าน
import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit } from "@pms/shared/lib/rateLimit";
import { bad, authorizeAdmin, auditLog, withErrors } from "@pms/shared/lib/adminRoute";

export const runtime = "nodejs";

const DENY = "ไม่มีสิทธิ์จัดการดีลเลอร์";
const NOT_CONFIGURED = "ยังไม่ได้ตั้งค่าเซิร์ฟเวอร์ (SUPABASE_SERVICE_ROLE_KEY) — ผูกกับดีลเลอร์จากที่นี่ยังไม่ได้";
const HQ_CODE = "HQ";

export const POST = withErrors("link-prospect", async (req: NextRequest) => {
  const authz = await authorizeAdmin(req, "dealers:manage", DENY, NOT_CONFIGURED);
  if (!authz.ok) return authz.res;
  const { admin, callerId, prof } = authz.auth;

  if (!(await checkRateLimit(admin, `link-prospect:${callerId}`, 30, 60))) {
    return bad(429, "ผูกกับดีลเลอร์ถี่เกินไป — รอสักครู่แล้วลองใหม่");
  }

  const body = (await req.json().catch(() => null)) as null | { prospectId?: number; dealerCode?: string };
  const prospectId = Number(body?.prospectId);
  const code = String(body?.dealerCode ?? "").trim().toUpperCase();
  if (!Number.isInteger(prospectId) || prospectId <= 0) return bad(400, "ไม่พบลูกค้าเป้าหมายที่อ้างถึง");
  if (!/^[A-Z]{2,5}$/.test(code) || code === HQ_CODE) return bad(400, "ต้องเลือกดีลเลอร์");

  // ── ลูกค้าเป้าหมายต้องมีอยู่จริง และยังไม่เป็นดีลเลอร์ ──
  const { data: pr, error: prErr } = await admin.from("dealer_prospects")
    .select("id, name, status, dealer_code").eq("id", prospectId).maybeSingle();
  if (prErr) {
    console.error("[link-prospect] อ่านลูกค้าเป้าหมายไม่สำเร็จ", prErr);
    return bad(503, "ตรวจข้อมูลลูกค้าเป้าหมายไม่สำเร็จชั่วคราว — ลองใหม่อีกครั้ง");
  }
  if (!pr) return bad(404, "ไม่พบลูกค้าเป้าหมายรายนี้แล้ว — อาจถูกลบไปก่อนหน้า");
  if (pr.status === "won") return bad(409, `ลูกค้าเป้าหมายรายนี้เป็นดีลเลอร์แล้ว (รหัส ${pr.dealer_code ?? "—"})`);

  // ── สาขาต้องมีอยู่จริงและเปิดใช้งานอยู่ ──
  const { data: dealer, error: dErr } = await admin.from("dealers")
    .select("code, name, status").eq("code", code).maybeSingle();
  if (dErr) {
    console.error("[link-prospect] อ่านทะเบียนสาขาไม่สำเร็จ", dErr);
    return bad(503, "ตรวจทะเบียนดีลเลอร์ไม่สำเร็จชั่วคราว — ลองใหม่อีกครั้ง");
  }
  if (!dealer) return bad(404, `ไม่พบดีลเลอร์รหัส "${code}" — อาจถูกลบไปแล้ว`);
  if (dealer.status !== "active") return bad(409, `ดีลเลอร์ ${code} ถูกปิดใช้งานอยู่ — เปิดใช้งานก่อนแล้วค่อยผูก`);

  // ── สาขาต้องยังไม่ถูกผูกกับลูกค้าเป้าหมายรายอื่น ──
  const { data: ผูกแล้ว, error: lErr } = await admin.from("dealer_prospects")
    .select("id, name").eq("dealer_code", code).neq("id", prospectId).limit(1);
  if (lErr) {
    console.error("[link-prospect] ตรวจการผูกซ้ำไม่สำเร็จ", lErr);
    return bad(503, "ตรวจข้อมูลลูกค้าเป้าหมายไม่สำเร็จชั่วคราว — ลองใหม่อีกครั้ง");
  }
  if (ผูกแล้ว?.length) {
    return bad(409, `ดีลเลอร์ ${code} ถูกผูกกับลูกค้าเป้าหมาย “${ผูกแล้ว[0].name}” อยู่แล้ว — หนึ่งสาขาผูกได้รายเดียว`);
  }

  // ── มีบัญชีเข้าระบบหรือยัง (ไม่ห้ามผูก แค่บอกหน้าจอ) ──
  const { count: บัญชี, error: aErr } = await admin.from("profiles")
    .select("id", { count: "exact", head: true }).eq("dealer_code", code);
  if (aErr) console.error(`[link-prospect] ตรวจบัญชีเข้าระบบของ ${code} ไม่สำเร็จ`, aErr);
  // ตรวจไม่ได้ = ไม่เตือน (ไม่ขึ้นข้อความผิดที่ดูเหมือนถูก) · มีร่องรอยใน log แล้ว
  const hasAccount = aErr ? true : (บัญชี ?? 0) > 0;

  const { error: upErr } = await admin.from("dealer_prospects")
    .update({ status: "won", dealer_code: code, converted_at: new Date().toISOString(), lost_reason: null })
    .eq("id", prospectId).neq("status", "won");
  if (upErr) {
    console.error(`[link-prospect] ผูก #${prospectId} กับ ${code} ไม่สำเร็จ`, upErr);
    return bad(503, "ผูกกับดีลเลอร์ไม่สำเร็จชั่วคราว — ลองใหม่อีกครั้ง");
  }

  // มีใบที่ส่งแล้วแต่ยังไม่มีใบตอบรับ → ใบล่าสุดที่ส่งแล้วถือว่าตอบรับ (กติกาเดียวกับสร้างดีลเลอร์ใหม่)
  //   ล้มตรงนี้ไม่ย้อนการผูก แต่ต้องมีร่องรอย
  const { data: ใบ } = await admin.from("dealer_package_proposals")
    .select("id, status, package").eq("prospect_id", prospectId).in("status", ["sent", "accepted"]).order("id", { ascending: false });
  if (ใบ?.length && !ใบ.some(x => x.status === "accepted")) {
    const { error: ตอบรับErr } = await admin.from("dealer_package_proposals").update({ status: "accepted" }).eq("id", ใบ[0].id);
    if (ตอบรับErr) console.error(`[link-prospect] ตั้งใบค่าแฟรนไชส์ #${ใบ[0].id} เป็นตอบรับไม่สำเร็จ`, ตอบรับErr);
  }
  // สาขาที่ยังไม่มีแพ็กเกจ → ใช้แพ็กเกจของใบหลัก (เป้ายอดขายเชื่อมกับแพ็กเกจ · 0178) · มีอยู่แล้วไม่ทับ
  if (ใบ?.length) {
    const ใบหลัก = ใบ.find(x => x.status === "accepted") ?? ใบ[0];
    const { error: pkErr } = await admin.from("dealers").update({ package: ใบหลัก.package }).eq("code", code).is("package", null);
    if (pkErr) console.error(`[link-prospect] ตั้งแพ็กเกจของ ${code} ไม่สำเร็จ`, pkErr);
  }

  await auditLog(admin, prof, "ลูกค้าเป้าหมายเป็นดีลเลอร์แล้ว",
    `#${prospectId} → ${code} · ${pr.name}${hasAccount ? "" : " (สาขายังไม่มีบัญชีเข้าระบบ)"}`);
  return NextResponse.json({ ok: true, hasAccount });
});
