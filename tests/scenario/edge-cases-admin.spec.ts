import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ADMIN, SUPABASE_URL, SUPABASE_ANON, skipReason } from "./supabaseEnv";
import { HQ_ORIGIN, ลูกค้าเป้าหมายรองรับสาขา } from "./funcHelpers";
import { ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY } from "./adminEnv";
import { open } from "./helpers";
import { ลบสาขาทดสอบตรง } from "./testDealers";

// ── Edge Case ฝั่งผู้ดูแล: ตั้งค่าที่เป็นไปไม่ได้ · ลบสาขาที่ยังมีข้อมูล ────────────
//
// สองเรื่องนี้ผิดแล้วแก้ยากกว่างานขายมาก:
//   • เป้ายอดขายติดลบ → เปอร์เซ็นต์ความสำเร็จเพี้ยนทั้งเครือ และเป้ารวมของบริษัทผิดตาม
//   • ลบสาขาที่ยังมีลูกค้าเป้าหมาย/ใบเสนอราคาค้าง → ข้อมูลกำพร้า ไม่มีเจ้าของ ย้อนกลับไม่ได้
//
// ใช้ "สาขาชั่วคราว" เสมอ ห้ามทดลองกับสาขาจริง — เทสต์ที่แก้ค่าของสาขาจริงแล้วลืมคืนค่า
// จะทำให้เป้าของสาขานั้นเพี้ยนค้างไว้ในระบบจริง
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(180_000);
test.describe.configure({ mode: "serial" });

const CODE = "ZZQA";                 // รหัสสาขาชั่วคราวของสเปกนี้ (A–Z ล้วน 2–5 ตัว)
const COMPANY = "ZZTEST-ADMINEDGE-ลูกค้าค้าง";

let adminTok = "";
let dealerLogin: { email: string; password: string } | null = null;

async function hqToken(): Promise<string> {
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false } });
  const { error } = await sb.auth.signInWithPassword(ADMIN);
  if (error) throw new Error(`ล็อกอินผู้ดูแล HQ ไม่ผ่าน: ${error.message}`);
  return (await sb.auth.getSession()).data.session?.access_token ?? "";
}

// เก็บกวาดสาขาทดสอบด้วยสิทธิ์เซิร์ฟเวอร์โดยตรง — ไม่ผ่านเส้นทาง "ลบดีลเลอร์" ของระบบ (13 ต.ค. 69)
//   เดิมเรียกเส้นทางนั้น: วันที่เส้นทางพัง สาขาทดสอบค้างในฐาน แล้วข้อทดสอบอื่นที่ไม่เกี่ยวตกตาม (ดู testDealers.ts)
async function purge() {
  await ลบสาขาทดสอบตรง(CODE);
}

test.beforeAll(async () => {
  adminTok = await hqToken();
  await purge(); // เผื่อรอบก่อนหน้าค้าง
  const res = await fetch(`${HQ_ORIGIN}/api/admin/dealers`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${adminTok}` },
    body: JSON.stringify({ code: CODE, name: "ZZTEST-สาขาทดสอบผู้ดูแล", province: "นครปฐม", region: "กลาง", revenueTarget: 1_000_000, status: "active", prospectId: await ลูกค้าเป้าหมายรองรับสาขา(CODE) }),
  });
  const json = await res.json().catch(() => ({} as Record<string, string>));
  // ต้องดังถ้าเตรียมข้อมูลไม่สำเร็จ — ไม่งั้นเทสต์จะ "ผ่าน" ทั้งที่ไม่ได้วัดอะไรเลย
  if (!res.ok) throw new Error(`สร้างสาขาทดสอบไม่สำเร็จ (${res.status}): ${JSON.stringify(json)}`);
  dealerLogin = { email: String(json.email), password: String(json.password) };
});

test.afterAll(async () => { await purge(); });

test("[edge·hq] ตั้งเป้ายอดขายติดลบ → ต้องไม่ถูกบันทึกเป็นค่าติดลบ", async ({ page }) => {
  // ปุ่มแก้ไขย้ายจากแถวทะเบียนมาหน้ารายละเอียดดีลเลอร์ (บอสตัดสิน 19 ต.ค. 69 · รอบ 2 ช่วง ข)
  await open(page, "hq", `/hq/dealers/${CODE}`);
  await page.getByRole("button", { name: "แก้ไข", exact: true }).click({ timeout: 30_000 });

  // fill() พิมพ์ค่าลงช่องตรง ๆ — จำลองการพิมพ์เครื่องหมายลบโดยไม่ตั้งใจ (หรือจงใจ)
  // ช่องเป้าเป็น text แล้ว (26 ส.ค. 69 ใส่ลูกน้ำระหว่างพิมพ์) — ตัวช่องเองก็กรองเครื่องหมายลบทิ้ง
  // แต่ยังต้องยืนยันปลายทางว่าฐานข้อมูลไม่รับค่าติดลบ (กันคนยิงตรงข้าม API)
  const target = page.getByLabel("เป้ายอดขายทั้งปี").first();
  await target.fill("-5000000");
  await page.getByRole("button", { name: /บันทึก/ }).last().click();
  await page.waitForTimeout(2_500);

  // ตาราง dealers ถูกปิดสิทธิ์อ่านตรงไว้ (0091) — ต้องอ่านด้วย service_role เท่านั้น
  //   เคยอ่านด้วยบัญชี HQ ธรรมดาแล้วได้ 0 แถว → เทสต์ตกเพราะ "อ่านไม่ได้" ไม่ใช่เพราะค่าติดลบ
  const svc = createClient(ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data, error } = await svc.from("dealers").select("revenue_target").eq("code", CODE);
  expect(error, "ต้องอ่านเป้าของสาขาทดสอบกลับมาได้").toBeNull();
  expect(data?.length, "ต้องเจอแถวสาขาทดสอบ").toBe(1);
  expect(Number(data?.[0]?.revenue_target ?? -1),
    "เป้ายอดขายต้องไม่ติดลบ — ถ้าติดลบ เปอร์เซ็นต์ความสำเร็จและเป้ารวมทั้งเครือจะเพี้ยนตาม",
  ).toBeGreaterThanOrEqual(0);
});

test("[edge·hq] ลบสาขาที่ยังมีข้อมูลค้าง → ต้องลบไม่ได้ พร้อมบอกเหตุผล", async ({ page }) => {
  expect(dealerLogin, "ต้องได้บัญชีของสาขาทดสอบมาจากขั้นเตรียมข้อมูล").not.toBeNull();

  // ให้สาขาสร้างลูกค้าของตัวเองไว้ 1 ราย (เขียนในฐานะเจ้าของสาขา — HQ เขียนข้อมูลขายไม่ได้ตาม RLS)
  const dealerSb: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false } });
  // บัญชีที่สร้างจากสำนักงานใหญ่ยังไม่ได้ตั้งรหัสของตัวเอง → ฐานข้อมูลปฏิเสธทุกอย่างจนกว่าจะตั้ง (ใบ 0187)
  //   ข้อนี้ทดสอบการลบสาขา ไม่ใช่หน้าตั้งรหัส จึงปลดเครื่องหมายก่อน เหมือนข้ออื่นที่ใช้บัญชีสร้างใหม่
  await (await import("./firstLogin")).ข้ามตั้งรหัสครั้งแรก(dealerLogin!.email);
  const { error: loginErr } = await dealerSb.auth.signInWithPassword(dealerLogin!);
  expect(loginErr?.message ?? "", "ต้องล็อกอินเป็นสาขาทดสอบได้").toBe("");
  const { error: rpcErr } = await dealerSb.rpc("upsert_customer_for_company", {
    p_dealer: CODE,
    p_payload: {
      name: "คุณค้าง", company: COMPANY, email: "", phone: "",
      province: "นครปฐม", category: "โกดังสำเร็จรูป", status: "active",
      projects: 0, join_date: new Date().toISOString().slice(0, 10), owner: "ทดสอบ",
      initials: "ZZ", color: "#003366",
    },
  });
  expect(rpcErr?.message ?? "", "ต้องสร้างลูกค้าค้างไว้ได้ก่อนทดสอบการลบ").toBe("");

  // 1) เส้นทางลบของหน้าเว็บปิดแล้ว (410) · คำสั่งของฐานลบทั้งที่ยังมีข้อมูล → ต้องถูกปฏิเสธพร้อมเหตุผล
  //    รอบ 2 ช่วง ข (19 ต.ค. 69): หน้าเว็บเลิกลบดีลเลอร์ เส้นทางลบตอบ 410 — คำสั่งของฐาน delete_dealer_atomic ยังอยู่สำหรับงานดูแลระบบ
  const ทางเว็บ = await fetch(`${HQ_ORIGIN}/api/admin/dealers?code=${CODE}`, {
    method: "DELETE", headers: { authorization: `Bearer ${adminTok}` },
  });
  expect(ทางเว็บ.status, "เส้นทางลบดีลเลอร์ปิดแล้ว").toBe(410);
  const svc0 = createClient(ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const blocked = await svc0.rpc("delete_dealer_atomic", { p_code: CODE });
  expect(blocked.error?.message ?? "", "ต้องบอกเหตุผลว่าติดข้อมูลอะไร ไม่ใช่แค่ 'ลบไม่ได้'").toMatch(/dealer_has_data:customers:/);

  // 2) สาขาต้องยังอยู่ครบ — ห้ามลบครึ่งทาง (บัญชีหายแต่สาขาค้าง หรือกลับกัน)
  const svc = createClient(ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: still } = await svc.from("dealers").select("code").eq("code", CODE);
  expect(still?.length, "สาขาต้องยังอยู่หลังถูกปฏิเสธการลบ").toBe(1);
  const { error: reLogin } = await createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false } })
    .auth.signInWithPassword(dealerLogin!);
  expect(reLogin?.message ?? "", "บัญชีเข้าระบบของสาขาต้องยังใช้ได้ (ห้ามลบบัญชีทิ้งก่อนแล้วค่อย fail)").toBe("");

  // 3) เคลียร์ข้อมูลออกแล้วลบใหม่ → ต้องลบได้จริง (กฎต้องไม่เข้มจนลบสาขาไม่ได้เลย)
  await dealerSb.from("customers").delete().eq("dealer_code", CODE).eq("company", COMPANY);
  const ok = await svc.rpc("delete_dealer_atomic", { p_code: CODE });
  expect(ok.error?.message ?? "", "เคลียร์ข้อมูลแล้วต้องลบสาขาได้").toBe("");
  for (const m of (ok.data ?? []) as { member_id: string }[]) await svc.auth.admin.deleteUser(m.member_id).catch(() => {});
  const { data: gone } = await svc.from("dealers").select("code").eq("code", CODE);
  expect(gone ?? [], "สาขาต้องหายไปจริงหลังลบสำเร็จ").toEqual([]);
});
