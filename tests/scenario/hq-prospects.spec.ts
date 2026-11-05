import { test, expect } from "@playwright/test";
import { ยืนยันส่งข้อมูลบริษัท } from "./prospectSteps";
import { createClient } from "@supabase/supabase-js";
import { ADMIN, RYG, skipReason } from "./supabaseEnv";
import { ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY } from "./adminEnv";
import { HQ_ORIGIN, loginUI, watchErrors, assertNoErrors, db, waitRow, specNS, ลูกค้าเป้าหมายรองรับสาขา } from "./funcHelpers";
import { กดตกลงในกล่องยืนยัน } from "./helpers";
import { ลบสาขาทดสอบตรง } from "./testDealers";
import { กรอกช่องบังคับใบที่ว่าง } from "./proposalFormFill";
import { ช่องผู้สนใจครบ, ช่องใบครบ, เบอร์ทดสอบ } from "./requiredFixtures";

// ── ลูกค้าเป้าหมายของสำนักงานใหญ่ = ผู้สนใจเป็นดีลเลอร์ (บอสสั่ง 14 ก.ย. 69) ─────────
//   "เพิ่มโมดูลลูกค้าเป้าหมายของทางฝั่ง HQ และเมื่อสำเร็จจากลูกค้าเป้าหมายจะกลายเป็นดีลเลอร์"
//
// สิ่งที่ต้องพิสูจน์:
//   1) ดีลเลอร์มองไม่เห็นรายชื่อนี้เลย (ข้อมูลอ่อนไหว — ผู้สนใจรายอื่นในพื้นที่เดียวกัน)
//   2) เซิร์ฟเวอร์ไม่ยอมให้นับ "เป็นดีลเลอร์แล้ว" ถ้าไม่ได้ผูกสาขาจริง
//   3) เส้นทางผ่านหน้าจอครบ: เพิ่ม → เปลี่ยนขั้น → ผูกกับดีลเลอร์ที่มีอยู่
//   4) สร้างดีลเลอร์ใหม่จากรายนี้ได้บัญชีจริง และกดซ้ำไม่ได้สาขาซ้อน
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(240_000);
test.describe.configure({ mode: "serial" });

const NS = specNS("PROSPECT");
const NEW_CODE = "ZZP";      // สร้างผ่านหน้าจอ
const DUP_CODE = "ZZQ";      // รหัสที่ใช้ลองสร้างซ้อน — ต้องไม่ถูกสร้างจริง
const NOACC_CODE = "ZZL";    // สาขาที่ไม่มีบัญชีเข้าระบบ (ลงทะเบียนตรง) — ใช้ทดสอบผูกกับดีลเลอร์ที่มีอยู่แล้ว

async function purgeNoAccountDealer() {
  if (!ADMIN_SERVICE_ROLE_KEY) return;
  const admin = createClient(ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  await admin.from("dealer_prospects").update({ dealer_code: null }).eq("dealer_code", NOACC_CODE).then(() => {}, () => {});
  await admin.from("dealers").delete().eq("code", NOACC_CODE);
}

async function adminToken(): Promise<string> {
  const sb = await db(ADMIN);
  return (await sb.auth.getSession()).data.session?.access_token ?? "";
}

// เก็บกวาดสาขาทดสอบด้วยสิทธิ์เซิร์ฟเวอร์โดยตรง — ไม่ผ่านเส้นทาง "ลบดีลเลอร์" ของระบบ (13 ต.ค. 69)
//   เดิมเรียกเส้นทางนั้น: วันที่เส้นทางพัง สาขาทดสอบค้างในฐาน แล้วข้อทดสอบอื่นที่ไม่เกี่ยวตกตาม (ดู testDealers.ts)
async function purgeDealer(code: string) {
  await ลบสาขาทดสอบตรง(code);
}

async function cleanupProspects() {
  const sb = await db(ADMIN);
  const { error } = await sb.from("dealer_prospects").delete().like("name", `${NS}%`);
  if (error) console.warn("[hq-prospects] ล้างข้อมูลทดสอบไม่สำเร็จ", error.message);
}

// ข้อ "ตั้งเป็นดีลเลอร์ใหม่" = ข้อทดสอบตามข้อตัดสินของบอส 15 ต.ค. 69 (เป้าในใบค่าแฟรนไชส์ชนะ · ใบ 0206):
//   แพ็กเกจ standard ตั้งเป้า 3,000,000 · ใบระบุ 12,000,000 → ตั้งเป็นดีลเลอร์ → เป้าสาขาต้องเป็น 12,000,000
//   (ก่อน 0206 ตัวดัก 0178/0179 ทับเป็น 3,000,000 — รอบปิดด่าน 3 ตกด้วยค่านี้จริง)
//   ไฟล์นี้อยู่โปรเจกต์ hq-settings (workers: 1) — แก้ค่ากลางชุดนี้ได้โดยไม่ชนไฟล์อื่น · คืนค่าเดิมหลังจบ
let ค่าตั้งเดิม: unknown = undefined;
async function ตั้งเป้าแพ็กเกจ3ล้าน() {
  if (!ADMIN_SERVICE_ROLE_KEY) return;
  const admin = createClient(ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const เดิม = ((await admin.from("hq_recruit_settings").select("config").eq("id", 1).maybeSingle()).data as { config: Record<string, unknown> } | null)?.config;
  if (!เดิม) return;
  ค่าตั้งเดิม = เดิม;
  const proposal = (เดิม.proposal && typeof เดิม.proposal === "object" ? เดิม.proposal : {}) as Record<string, unknown>;
  const { error } = await admin.from("hq_recruit_settings").update({ config: { ...เดิม, proposal: { ...proposal, packages: {
    standard: { annualTarget: 3_000_000, targetsByRegion: {} }, exclusive: { annualTarget: null, targetsByRegion: {} } } } } }).eq("id", 1);
  if (error) throw new Error(`ตั้งเป้าแพ็กเกจไม่สำเร็จ: ${error.message}`);
}
async function คืนค่าตั้งเดิม() {
  if (!ADMIN_SERVICE_ROLE_KEY || ค่าตั้งเดิม === undefined) return;
  const admin = createClient(ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  await admin.from("hq_recruit_settings").update({ config: ค่าตั้งเดิม }).eq("id", 1);
}

test.beforeAll(async () => {
  await ตั้งเป้าแพ็กเกจ3ล้าน();
  await cleanupProspects();
  await purgeNoAccountDealer();
  await purgeDealer(NEW_CODE);
  await purgeDealer(DUP_CODE);
});
test.afterAll(async () => {
  await cleanupProspects();
  await purgeNoAccountDealer();
  await purgeDealer(NEW_CODE);
  await purgeDealer(DUP_CODE);
  await คืนค่าตั้งเดิม();
});

test("[security] ดีลเลอร์มองไม่เห็น และเขียนลูกค้าเป้าหมายของสำนักงานใหญ่ไม่ได้", async () => {
  const hq = await db(ADMIN);
  const { error: hqErr } = await hq.from("dealer_prospects").insert({ ...ช่องผู้สนใจครบ(), name: `${NS}-ลับ`, phone: "0800000000" });
  expect(hqErr, "ผู้ดูแลสำนักงานใหญ่ต้องเพิ่มได้").toBeNull();

  const dealer = await db(RYG);
  const { data, error } = await dealer.from("dealer_prospects").select("id").like("name", `${NS}%`);
  expect(error).toBeNull();
  expect(data ?? [], "ดีลเลอร์ต้องไม่เห็นสักแถว (RLS กรองทิ้ง ไม่ใช่แค่ซ่อนเมนู)").toHaveLength(0);

  const { error: dealerErr } = await dealer.from("dealer_prospects").insert({ ...ช่องผู้สนใจครบ(), name: `${NS}-ปลอม` });
  expect(dealerErr, "ดีลเลอร์ต้องเพิ่มไม่ได้").not.toBeNull();
});

test("[api] ตั้งสถานะ “เป็นดีลเลอร์แล้ว” โดยไม่ผูกรหัสดีลเลอร์ ต้องถูกปฏิเสธที่เซิร์ฟเวอร์", async () => {
  const token = await adminToken();
  const res = await fetch(`${HQ_ORIGIN}/api/v1/prospects`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ name: `${NS}-สำเร็จปลอม`, status: "won" }),
  });
  expect(res.status).toBe(400);
  expect(((await res.json()) as { error?: string }).error ?? "").toMatch(/ผูกกับดีลเลอร์/);
});

test("[H2] [func·hq] เพิ่มลูกค้าเป้าหมาย → เปลี่ยนขั้น → ผูกกับดีลเลอร์ที่มีอยู่แล้ว", async ({ page }) => {
  const errs = watchErrors(page);
  const name = `${NS}-ผูกสาขาเดิม`;
  const sb = await db(ADMIN);

  await loginUI(page, HQ_ORIGIN, "/hq/prospects", ADMIN);
  await page.getByRole("button", { name: "เพิ่มผู้สนใจ" }).first().click();
  const แก้ไข = page.getByRole("dialog", { name: "ข้อมูลผู้สนใจ" });
  await แก้ไข.locator("#pr-name").fill(name);
  await แก้ไข.locator("#pr-phone").fill("089 980 4558");
  await แก้ไข.getByRole("button", { name: "เพิ่มผู้สนใจ" }).click();
  const row = await waitRow<{ status: string }>(sb, "dealer_prospects", { name });
  expect(row.status).toBe("new");

  const แถว = page.getByRole("row", { name: new RegExp(name) });
  // เพิ่มเสร็จ ระบบเปิดแผงของรายนั้นที่แท็บงานให้เลย (แบบเดียวกับฝั่งดีลเลอร์ — บอสสั่ง 14 ก.ย. 69)
  //   ขั้นเปลี่ยนจากงานเท่านั้น ฟอร์มไม่มีช่องเลือกสถานะแล้ว
  await expect(แก้ไข.getByRole("tab", { name: "งาน/ความคืบหน้า" })).toHaveAttribute("aria-selected", "true", { timeout: 15_000 });
  await expect(แก้ไข.locator("#pr-status"), "ห้ามมีช่องเลือกสถานะเอง").toHaveCount(0);
  // งานแรกต้องมีบันทึกการติดต่อจริง — กดติ๊กแล้วพาไปฟอร์มบันทึกการติดต่อ ระบบติ๊กให้เอง
  await แก้ไข.getByRole("checkbox", { name: "ติดต่อครั้งแรก" }).click();
  await แก้ไข.locator("#pc-channel").selectOption("โทรศัพท์");
  await แก้ไข.locator("#pc-body").fill("สนใจเป็นดีลเลอร์ ขอข้อมูลบริษัท");
  await แก้ไข.getByRole("button", { name: "บันทึกการติดต่อ" }).last().click();
  await waitRow(sb, "dealer_prospects", { name, status: "contacted" });
  await แก้ไข.getByRole("tab", { name: "งาน/ความคืบหน้า" }).click();
  await expect(แก้ไข.getByRole("checkbox", { name: "ติดต่อครั้งแรก" })).toHaveAttribute("aria-checked", "true", { timeout: 15_000 });
  await แก้ไข.getByRole("checkbox", { name: "ส่งข้อมูลบริษัท" }).click();
  await ยืนยันส่งข้อมูลบริษัท(page);   // ขั้นนี้ = ยืนยันการส่ง (บอสตอบ P1 · 5 พ.ย. 69)
  await waitRow(sb, "dealer_prospects", { name, status: "profile_sent" });

  // ผูกกับดีลเลอร์เดิม = ปุ่มแยก กดได้เสมอ (บอสตัดสิน 5 พ.ย. 69) — ปุ่มตั้งเป็นดีลเลอร์ (สร้างใหม่) ปิดจนตอบรับ+ชำระครบ
  await expect(แก้ไข.locator("button[data-convert-ready]").first(), "ยังไม่ส่งใบ = ปุ่มตั้งเป็นดีลเลอร์ (สร้างใหม่) กดไม่ได้").toBeDisabled();
  await แก้ไข.locator("button[data-link-existing]").first().click();
  const ตั้ง = page.getByRole("dialog", { name: "ตั้งเป็นดีลเลอร์" });
  await expect(ตั้ง.getByLabel("ผูกกับดีลเลอร์ที่มีอยู่แล้ว"), "เปิดมาที่โหมดผูกดีลเลอร์เดิม").toBeChecked();
  // CNX ไม่ใช่ RYG — สเปกอื่นผูกลูกค้าเป้าหมายทดสอบกับ RYG อยู่ และหนึ่งสาขาผูกได้รายเดียว (บอสสั่ง 15 ก.ย. 69)
  await ตั้ง.locator("#cv-existing").selectOption("CNX");
  await ตั้ง.getByRole("button", { name: "ผูกกับดีลเลอร์นี้" }).click();

  await waitRow(sb, "dealer_prospects", { name, status: "won", dealer_code: "CNX" });
  // เป็นดีลเลอร์แล้ว = ไปอยู่หน้าดีลเลอร์ ไม่แสดงในหน้าลูกค้าเป้าหมาย (บอสสั่ง 15 ก.ย. 69)
  await expect(แถว, "เป็นดีลเลอร์แล้วต้องหายจากตารางลูกค้าเป้าหมาย").toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByLabel("กรองตามสถานะ").locator("option", { hasText: "เป็นดีลเลอร์แล้ว" }), "ไม่มีตัวกรองเป็นดีลเลอร์แล้ว").toHaveCount(0);
  assertNoErrors(errs, "หน้าผู้สนใจเป็นดีลเลอร์");
});

test("[api] ผูกกับดีลเลอร์ที่มีอยู่แล้ว: ตรวจที่เซิร์ฟเวอร์ · สาขาไม่มีบัญชีผูกได้แต่บอก · ผูกซ้ำ/ปิดใช้งานไม่ได้", async () => {
  test.skip(!ADMIN_SERVICE_ROLE_KEY, "เครื่องนี้ยังไม่ได้ตั้ง service_role");
  const admin = createClient(ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const sb = await db(ADMIN);
  const token = await adminToken();
  const ผูก = (prospectId: number, dealerCode: string) => fetch(`${HQ_ORIGIN}/api/admin/dealers/link-prospect`, {
    method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ prospectId, dealerCode }),
  });
  const เพิ่มราย = async (ชื่อ: string) =>
    ((await sb.from("dealer_prospects").insert({ ...ช่องผู้สนใจครบ(), name: `${NS}-${ชื่อ}`, status: "meeting" }).select("id").single()).data as { id: number }).id;

  // สาขาทดสอบที่ไม่มีบัญชีเข้าระบบ (ลงทะเบียนตรง แบบรายชื่อดีลเลอร์เดิมจาก Excel)
  expect((await admin.from("dealers").insert({ code: NOACC_CODE, name: "ZZTEST สาขาไม่มีบัญชี", province: "ระยอง", region: "ตะวันออก", revenue_target: 0, status: "active" })).error).toBeNull();

  const ก = await เพิ่มราย("ผูกสาขาไม่มีบัญชี");
  const ไม่มีสาขา = await ผูก(ก, "ZZX");
  expect(ไม่มีสาขา.status, "สาขาที่ไม่มีอยู่จริงต้องผูกไม่ได้").toBe(404);

  const ได้ = await ผูก(ก, NOACC_CODE);
  expect(ได้.status, await ได้.clone().text()).toBe(200);
  expect((await ได้.json() as { hasAccount: boolean }).hasAccount, "สาขาไม่มีบัญชีต้องผูกได้ แต่บอกหน้าจอ").toBe(false);
  await waitRow(sb, "dealer_prospects", { id: ก, status: "won", dealer_code: NOACC_CODE });

  const ข = await เพิ่มราย("ผูกซ้ำสาขาเดิม");
  const ซ้ำ = await ผูก(ข, NOACC_CODE);
  expect(ซ้ำ.status, "หนึ่งสาขาผูกได้รายเดียว").toBe(409);
  expect(((await ซ้ำ.json()) as { error: string }).error).toMatch(/ผูกกับลูกค้าเป้าหมาย/);
  expect(((await ผูก(ก, "CNX")).status), "รายที่เป็นดีลเลอร์แล้วผูกใหม่ไม่ได้").toBe(409);

  // ปลดรายแรกออก แล้วปิดใช้งานสาขา → ผูกไม่ได้เพราะปิดใช้งาน
  expect((await admin.from("dealer_prospects").delete().eq("id", ก)).error).toBeNull();
  expect((await admin.from("dealers").update({ status: "inactive" }).eq("code", NOACC_CODE)).error).toBeNull();
  const ปิด = await ผูก(ข, NOACC_CODE);
  expect(ปิด.status, "สาขาที่ปิดใช้งานต้องผูกไม่ได้").toBe(409);
  expect(((await ปิด.json()) as { error: string }).error).toMatch(/ปิดใช้งาน/);

  // ผู้ใช้ดีลเลอร์ยิงตรงต้องไม่ได้
  const ดีลเลอร์ = (await (await db(RYG)).auth.getSession()).data.session?.access_token ?? "";
  const โดนกัน = await fetch(`${HQ_ORIGIN}/api/admin/dealers/link-prospect`, {
    method: "POST", headers: { authorization: `Bearer ${ดีลเลอร์}`, "content-type": "application/json" },
    body: JSON.stringify({ prospectId: ข, dealerCode: "RYG" }),
  });
  expect(โดนกัน.status, "ดีลเลอร์ต้องผูกไม่ได้").toBe(403);
});

test("[func·hq] ผูกกับสาขาที่ยังไม่มีบัญชี → เตือนก่อนผูก · ผูกแล้วมีปุ่มไปตั้งอีเมล/รหัสผ่าน", async ({ page }) => {
  test.skip(!ADMIN_SERVICE_ROLE_KEY, "เครื่องนี้ยังไม่ได้ตั้ง service_role");
  const errs = watchErrors(page);
  const admin = createClient(ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const sb = await db(ADMIN);
  // สาขาทดสอบไม่มีบัญชี (เทสต์ก่อนหน้าปิดใช้งานไว้) — เปิดใช้งานและปลดรายที่ผูกค้างก่อน
  await admin.from("dealers").upsert({ code: NOACC_CODE, name: "ZZTEST สาขาไม่มีบัญชี", province: "ระยอง", region: "ตะวันออก", revenue_target: 0, status: "active" });
  await admin.from("dealer_prospects").delete().eq("dealer_code", NOACC_CODE);
  const name = `${NS}-ผูกผ่านหน้าจอไม่มีบัญชี`;
  const { data: ins, error } = await sb.from("dealer_prospects").insert({ ...ช่องผู้สนใจครบ(), name, status: "meeting" }).select("id").single();
  expect(error).toBeNull();
  const id = (ins as { id: number }).id;

  await loginUI(page, HQ_ORIGIN, `/hq/prospects?open=${id}`, ADMIN);
  const แผง = page.getByRole("dialog", { name: "ข้อมูลผู้สนใจ" });
  await แผง.locator("button[data-link-existing]").first().click({ timeout: 30_000 });   // ผูกดีลเลอร์เดิม = ปุ่มแยก (บอสตัดสิน 5 พ.ย. 69)
  const ตั้ง = page.getByRole("dialog", { name: "ตั้งเป็นดีลเลอร์" });
  await expect(ตั้ง.getByLabel("ผูกกับดีลเลอร์ที่มีอยู่แล้ว")).toBeChecked();
  await ตั้ง.locator("#cv-existing").selectOption(NOACC_CODE);
  await expect(ตั้ง.getByText(`ดีลเลอร์ ${NOACC_CODE} ยังไม่มีบัญชีเข้าระบบ`), "ต้องเตือนก่อนกดผูก").toBeVisible({ timeout: 15_000 });
  await ตั้ง.getByRole("button", { name: "ผูกกับดีลเลอร์นี้" }).click();

  const เตือน = page.getByRole("dialog", { name: "ดีลเลอร์ยังไม่มีบัญชีเข้าระบบ" });
  await expect(เตือน, "ผูกแล้วต้องเตือนให้เห็นชัด").toBeVisible({ timeout: 20_000 });
  await waitRow(sb, "dealer_prospects", { id, status: "won", dealer_code: NOACC_CODE });
  await เตือน.getByRole("link", { name: "ไปตั้งอีเมล/รหัสผ่าน" }).click();
  await page.waitForURL(new RegExp(`/hq/dealers/${NOACC_CODE}`), { timeout: 30_000 });
  assertNoErrors(errs, "ผูกกับสาขาที่ไม่มีบัญชี");
});

test("[H5] [func·hq] ตั้งเป็นดีลเลอร์ใหม่ → ได้สาขาพร้อมบัญชี · กดซ้ำไม่ได้สาขาซ้อน", async ({ page }) => {
  const errs = watchErrors(page);
  const name = `${NS}-สาขาใหม่`;
  const sb = await db(ADMIN);
  const { data: ins, error } = await sb.from("dealer_prospects")
    .insert({ ...ช่องผู้สนใจครบ(), name, province: "ระยอง", status: "meeting" }).select("id").single();
  expect(error).toBeNull();
  const id = (ins as { id: number }).id;
  // ตกลง + ชำระ (ด่าน 4 · 0208): ใบตอบรับ + ชำระครบ — ใบนี้ไม่ระบุค่าแรกเข้า (ยอด 0) ตอบรับแล้วแปลงได้เลย
  const { data: ใบ, error: ใบErr } = await sb.from("dealer_package_proposals")
    .insert({ ...ช่องใบครบ(), prospect_id: id, status: "sent", proposed_date: "2026-09-14", contract_months: 12, annual_target: 12_000_000 }).select("id").single();
  expect(ใบErr).toBeNull();
  expect((await sb.from("dealer_package_proposals").update({ status: "accepted" }).eq("id", (ใบ as { id: number }).id)).error).toBeNull();

  await loginUI(page, HQ_ORIGIN, "/hq/prospects", ADMIN);
  await page.getByRole("row", { name: new RegExp(name) }).click();
  await page.getByRole("dialog", { name: "ข้อมูลผู้สนใจ" }).getByRole("button", { name: "ตั้งเป็นดีลเลอร์" }).click();
  const ตั้ง = page.getByRole("dialog", { name: "ตั้งเป็นดีลเลอร์" });
  // ภาค/จังหวัดเติมจากที่บันทึกไว้ให้แล้ว — ไม่ต้องเลือกซ้ำ
  await expect(ตั้ง.locator("#cv-province")).toHaveValue("ระยอง");
  await expect(ตั้ง.locator("#cv-region")).not.toHaveValue("");
  await expect(ตั้ง.getByText(/เป้ายอดขายรายปีของสาขาจะตั้งตามใบเสนอ .*฿12,000,000/), "ต้องบอกล่วงหน้าว่าเป้าจะตั้งตามใบไหน").toBeVisible();
  // จังหวัดที่ดูแล = จังหวัดที่ตั้ง 1 จังหวัดพอดี (บอสสั่ง 29 ต.ค. 69 · ใบ 0259)
  //   ใบ 0214 (บอสสั่ง 16 ต.ค. 69): จังหวัดเดียวมีดีลเลอร์ได้ไม่จำกัดสาขา — ระยองมี RYG ดูแลอยู่ก็เลือกได้ (บอกให้รู้ว่าใครดูแลอยู่)
  //   ยังไม่เลือกจังหวัด = สร้างไม่ได้
  const พื้นที่ดูแล = ตั้ง.locator("[data-territory-note]");
  await expect(พื้นที่ดูแล, "จังหวัดที่มีดีลเลอร์ดูแลอยู่แล้ว ต้องเลือกได้ และบอกว่าใครดูแลอยู่").toContainText(/ดูแลจังหวัด ระยอง · มี (?:[A-Z]+, )*RYG(?:, [A-Z]+)* ดูแลอยู่แล้ว/, { timeout: 15_000 });   // สาขาทดสอบที่รันพร้อมกันอาจดูแลระยองด้วย
  await ตั้ง.locator("#cv-code").fill(NEW_CODE);
  await ตั้ง.locator("#cv-province").selectOption("");
  await ตั้ง.getByRole("button", { name: "สร้างดีลเลอร์" }).click();
  await expect(ตั้ง.getByText("ต้องเลือกจังหวัดที่ดูแล 1 จังหวัดจากรายชื่อ"), "ไม่เลือกจังหวัดที่ดูแล ต้องสร้างไม่ได้").toBeVisible();
  await ตั้ง.locator("#cv-province").selectOption("ระยอง");   // ดีลเลอร์รายที่ 2 ของระยอง (ร่วมกับ RYG)
  await ตั้ง.getByRole("button", { name: "สร้างดีลเลอร์" }).click();

  await expect(page.getByText("สร้างดีลเลอร์สำเร็จ")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("link", { name: `ไปที่ดีลเลอร์ ${NEW_CODE}` }), "มีทางไปหน้าดีลเลอร์ที่เพิ่งสร้าง").toBeVisible();
  await page.getByRole("button", { name: "เสร็จแล้ว" }).click();
  await expect(page.getByRole("row", { name: new RegExp(name) }), "เป็นดีลเลอร์แล้วต้องหายจากตารางลูกค้าเป้าหมาย").toHaveCount(0, { timeout: 15_000 });
  await waitRow(sb, "dealers_directory", { code: NEW_CODE });   // อ่านผ่านมุมมอง: ผู้ใช้อ่านตาราง dealers ได้เฉพาะบางคอลัมน์ (ใบ 0091) select * ถูกปฏิเสธ
  await waitRow(sb, "dealer_prospects", { id, status: "won", dealer_code: NEW_CODE });
  // เป้ายอดขายรายปีของสาขา = เป้ายอดซื้อต่อปีในใบ (บอสสั่ง "เอา 3 ช่อง") · ใบนั้นกลายเป็นตอบรับ
  //   อ่านด้วยสิทธิ์ระบบ — ตาราง dealers ถอนสิทธิ์อ่านคอลัมน์เป้าจากผู้ใช้ทั่วไปแล้ว
  const svc = createClient(ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: สาขา } = await svc.from("dealers").select("revenue_target").eq("code", NEW_CODE).single();
  expect(Number((สาขา as { revenue_target: number } | null)?.revenue_target), "เป้าของสาขาต้องมาจากใบ (12,000,000) ไม่ใช่เป้าแพ็กเกจ (3,000,000)").toBe(12_000_000);
  await waitRow(sb, "dealer_package_proposals", { prospect_id: id, status: "accepted" });
  const { data: พื้นที่ } = await svc.from("dealer_territories").select("province").eq("dealer_code", NEW_CODE).order("province");
  expect((พื้นที่ ?? []).map(p => p.province), "จังหวัดที่เลือกต้องเป็นพื้นที่ของสาขาใหม่ 1 จังหวัดพอดี (ระยองที่ RYG ดูแลอยู่)").toEqual(["ระยอง"]);
  const { data: ระยอง } = await svc.from("dealer_territories").select("dealer_code").eq("province", "ระยอง");
  expect((ระยอง ?? []).map(r => r.dealer_code), "RYG ยังดูแลระยองอยู่ — ไม่ถูกแทนที่ (สาขาทดสอบที่รันพร้อมกันอาจดูแลระยองด้วย)").toEqual(expect.arrayContaining([NEW_CODE, "RYG"]));

  // ยิงซ้ำด้วยรายเดิม (เช่น กดสองครั้ง / สองคนกดพร้อมกัน) ต้องถูกปฏิเสธก่อนสร้างบัญชี
  const token = await adminToken();
  const again = await fetch(`${HQ_ORIGIN}/api/admin/dealers`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ code: DUP_CODE, name, province: "ระยอง", region: "ตะวันออก", revenueTarget: 0, prospectId: id }),
  });
  expect(again.status).toBe(409);
  const { data: ซ้อน } = await sb.from("dealers").select("code").eq("code", DUP_CODE);
  expect(ซ้อน ?? [], "ต้องไม่มีสาขาซ้อนถูกสร้าง").toHaveLength(0);
  assertNoErrors(errs, "ตั้งเป็นดีลเลอร์ใหม่");
});

test("[api] สร้างดีลเลอร์โดยไม่ผูกลูกค้าเป้าหมาย ต้องถูกปฏิเสธ และไม่มีสาขาเกิดขึ้น (บอสสั่ง 14 ก.ย. 69)", async () => {
  const token = await adminToken();
  const res = await fetch(`${HQ_ORIGIN}/api/admin/dealers`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ code: DUP_CODE, name: `${NS}-สร้างตรง`, province: "ระยอง", region: "ตะวันออก", revenueTarget: 0 }),
  });
  expect(res.status, "ต้องปฏิเสธ — ดีลเลอร์ต้องมาจากลูกค้าเป้าหมายที่สำเร็จแล้วเท่านั้น").toBe(400);
  expect(((await res.json()) as { error?: string }).error ?? "", "ข้อความบอกว่าต้องเริ่มจากผู้สนใจเป็นดีลเลอร์ (ชื่อใหม่ รอบ 4)").toMatch(/ผู้สนใจ/);
  const { data } = await (await db(ADMIN)).from("dealers").select("code").eq("code", DUP_CODE);
  expect(data ?? [], "คำขอที่ถูกปฏิเสธต้องไม่สร้างสาขา").toHaveLength(0);
});

test("[ui·hq] ฟอร์มลูกค้าเป้าหมาย: เลือกภาคก่อนแล้วค่อยเลือกจังหวัด · มีทุกภาค (บอสสั่ง 14 ก.ย. 69)", async ({ page }) => {
  const errs = watchErrors(page);
  await loginUI(page, HQ_ORIGIN, "/hq/prospects", ADMIN);
  await page.getByRole("button", { name: "เพิ่มผู้สนใจ" }).first().click();
  const ฟอร์ม = page.getByRole("dialog", { name: "ข้อมูลผู้สนใจ" });
  const ภาค = ฟอร์ม.locator("#pr-region");
  const จังหวัด = ฟอร์ม.locator("#pr-province");

  await expect(ภาค, "ภาคต้องเริ่มที่ยังไม่ระบุ").toHaveValue("");
  expect((await จังหวัด.locator("option").allInnerTexts()).join(" "), "ยังไม่เลือกภาค → ให้เลือกภาคก่อน").toContain("เลือกภาคก่อน");
  expect((await ภาค.locator("option").allInnerTexts()).join(" "), "ต้องมีตัวเลือกทุกภาค").toContain("ทุกภาค");

  await ภาค.selectOption("ทุกภาค");
  await expect(จังหวัด, "ทุกภาค → จังหวัดเป็นทุกจังหวัดให้เอง").toHaveValue("ทุกจังหวัด");

  await ภาค.selectOption("อีสาน");
  const ตัวเลือก = await จังหวัด.locator("option").allInnerTexts();
  expect(ตัวเลือก, "เลือกอีสาน → ต้องมีจังหวัดในภาคอีสาน").toContain("บุรีรัมย์");
  expect(ตัวเลือก, "เลือกอีสาน → ต้องไม่มีจังหวัดภาคอื่นปน").not.toContain("ระยอง");

  const name = `${NS}-มีภาค`;
  await ฟอร์ม.locator("#pr-name").fill(name);
  await ฟอร์ม.locator("#pr-phone").fill(เบอร์ทดสอบ());   // เบอร์โทรเป็นช่องบังคับ (4 พ.ย. 69 · ใบ 0276)
  await จังหวัด.selectOption("บุรีรัมย์");
  await ฟอร์ม.getByRole("button", { name: "เพิ่มผู้สนใจ" }).click();
  await waitRow(await db(ADMIN), "dealer_prospects", { name, region: "อีสาน", province: "บุรีรัมย์" });
  assertNoErrors(errs, "ฟอร์มลูกค้าเป้าหมาย: ภาค/จังหวัด");
});

test("[ui·hq] ฟอร์มผู้สนใจ: ชื่อ + เบอร์โทรเป็นช่องบังคับ — * แดง · ว่างแล้วกดเพิ่ม = ไม่บันทึก กรอบแดง ข้อความใต้ช่อง (บอสสั่ง 4 พ.ย. 69)", async ({ page }) => {
  const errs = watchErrors(page);
  await loginUI(page, HQ_ORIGIN, "/hq/prospects", ADMIN);
  await page.getByRole("button", { name: "เพิ่มผู้สนใจ" }).first().click();
  const ฟอร์ม = page.getByRole("dialog", { name: "ข้อมูลผู้สนใจ" });
  for (const id of ["pr-name", "pr-phone"]) {
    await expect(ฟอร์ม.locator(`label[for="${id}"] [data-required]`), `${id} ต้องมี * แดงจากตัวกลาง`).toHaveCount(1);
  }
  await expect(ฟอร์ม.locator('label[for="pr-email"] [data-required]'), "อีเมลไม่บังคับ = ไม่มี *").toHaveCount(0);

  const name = `${NS}-ไม่มีเบอร์`;
  await ฟอร์ม.locator("#pr-name").fill(name);
  await ฟอร์ม.locator("#pr-phone").fill("   ");
  await ฟอร์ม.getByRole("button", { name: "เพิ่มผู้สนใจ" }).click();
  await expect(ฟอร์ม, "ไม่บันทึก = หน้าต่างยังเปิด").toBeVisible();
  await expect(ฟอร์ม.locator("#pr-phone"), "เบอร์ว่าง = กรอบแดง").toHaveAttribute("aria-invalid", "true");
  await expect(ฟอร์ม.locator("[data-field-error]"), "ข้อความใต้ช่องเบอร์").toHaveText(["ต้องระบุเบอร์โทร"]);
  await expect(ฟอร์ม.locator("#pr-phone"), "เลื่อน/โฟกัสไปช่องแรกที่ขาด").toBeFocused();
  const { count } = await (await db(ADMIN)).from("dealer_prospects").select("id", { count: "exact", head: true }).eq("name", name);
  expect(count, "ต้องไม่มีแถวลงฐาน").toBe(0);

  // กรอกเบอร์แล้ว: ข้อความหาย · บันทึกได้
  await ฟอร์ม.locator("#pr-phone").fill(เบอร์ทดสอบ());
  await expect(ฟอร์ม.locator("[data-field-error]"), "แก้ช่องแล้วข้อความหาย").toHaveCount(0);
  await ฟอร์ม.getByRole("button", { name: "เพิ่มผู้สนใจ" }).click();
  await waitRow(await db(ADMIN), "dealer_prospects", { name });
  assertNoErrors(errs, "ฟอร์มผู้สนใจ: ช่องบังคับ");
});

test("[ui·hq] ตั้งเป็นดีลเลอร์: รหัส/ชื่อ/ภาค/จังหวัด เป็นช่องบังคับ — * แดง · ว่างแล้วกดยืนยัน = กรอบแดงทุกช่องที่ขาด (บอสสั่ง 4 พ.ย. 69)", async ({ page }) => {
  // ผู้สนใจที่พร้อมแปลง (ใบตอบรับ · ยอด 0) — ปุ่มสร้างดีลเลอร์กดได้ · ไม่กดจนสร้างจริง (ช่องบังคับไม่ครบ)
  const id = await ลูกค้าเป้าหมายรองรับสาขา("ZZRQC");
  await loginUI(page, HQ_ORIGIN, "/hq/prospects", ADMIN);
  await page.goto(`${HQ_ORIGIN}/hq/prospects?open=${id}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("dialog", { name: "ข้อมูลผู้สนใจ" }).getByRole("button", { name: "ตั้งเป็นดีลเลอร์" }).click();
  const ตั้ง = page.getByRole("dialog", { name: "ตั้งเป็นดีลเลอร์" });
  for (const id of ["cv-code", "cv-name", "cv-region", "cv-province"]) {
    await expect(ตั้ง.locator(`label[for="${id}"] [data-required]`), `${id} ต้องมี * แดงจากตัวกลาง`).toHaveCount(1);
  }
  await expect(ตั้ง.locator('label[for="cv-email"] [data-required]'), "อีเมลเว้นได้ = ไม่มี *").toHaveCount(0);
  await ตั้ง.locator("#cv-name").fill("");
  await expect(ตั้ง.getByRole("button", { name: "สร้างดีลเลอร์" }), "ใบพร้อมแปลงแล้ว = ปุ่มกดได้").toBeEnabled({ timeout: 15_000 });
  await ตั้ง.getByRole("button", { name: "สร้างดีลเลอร์" }).click();
  for (const id of ["cv-code", "cv-name", "cv-region"]) {
    await expect(ตั้ง.locator(`#${id}`), `${id} ว่าง = กรอบแดง`).toHaveAttribute("aria-invalid", "true");
  }
  await expect(ตั้ง.locator("#cv-province"), "จังหวัดว่าง = กรอบแดง").toHaveAttribute("aria-invalid", "true");
  await expect(ตั้ง.locator("[data-field-error]").first(), "ข้อความใต้ช่องแรก (รหัส)").toHaveText("รหัสดีลเลอร์ต้องเป็นตัวอักษร A–Z 2–5 ตัว (ห้ามมีตัวเลข)");
  await expect(ตั้ง.getByRole("alert").filter({ hasText: "กรอกให้ครบก่อนบันทึก: รหัสดีลเลอร์ · ชื่อดีลเลอร์ · ภาค · จังหวัดที่ตั้ง / ที่ดูแล" }),
    "แถบผิดพลาดสรุปช่องที่ขาดครบ (ไม่ซ้ำข้อความใต้ช่อง)").toHaveCount(1);
  await expect(ตั้ง.locator("#cv-code"), "โฟกัสช่องแรกที่ขาด").toBeFocused();
  await ตั้ง.locator("#cv-code").fill("ZZRQ");
  await expect(ตั้ง.locator("#cv-code"), "แก้ช่องแล้วกรอบแดงหาย").not.toHaveAttribute("aria-invalid", "true");
});

// ── ใบค่าแฟรนไชส์ (บอสสั่ง 14 ก.ย. 69: "เหมือนดีลเลอร์ที่ต้องมีใบเสนอราคา แต่อันนี้ของ HQ") ──

test("[api] ยังไม่มีใบค่าแฟรนไชส์ที่ส่งแล้ว → สร้างดีลเลอร์ไม่ได้ (ใบร่างไม่นับ)", async () => {
  const sb = await db(ADMIN);
  const name = `${NS}-ยังไม่ส่งใบ`;
  const { data: ins, error } = await sb.from("dealer_prospects").insert({ ...ช่องผู้สนใจครบ(), name, status: "considering" }).select("id").single();
  expect(error).toBeNull();
  const id = (ins as { id: number }).id;
  const { error: ใบErr } = await sb.from("dealer_package_proposals")
    .insert({ ...ช่องใบครบ(), prospect_id: id, status: "draft", proposed_date: "2026-09-14" });
  expect(ใบErr).toBeNull();

  const res = await fetch(`${HQ_ORIGIN}/api/admin/dealers`, {
    method: "POST",
    headers: { authorization: `Bearer ${await adminToken()}`, "content-type": "application/json" },
    body: JSON.stringify({ code: DUP_CODE, name, province: "ระยอง", region: "ตะวันออก", revenueTarget: 0, prospectId: id }),
  });
  expect(res.status, "มีแต่ใบร่าง ต้องสร้างดีลเลอร์ไม่ได้").toBe(400);
  expect(((await res.json()) as { error?: string }).error ?? "").toMatch(/ใบค่าแฟรนไชส์/);
  const { data } = await sb.from("dealers").select("code").eq("code", DUP_CODE);
  expect(data ?? [], "คำขอที่ถูกปฏิเสธต้องไม่สร้างสาขา").toHaveLength(0);
});

test("[security] ใบค่าแฟรนไชส์: ดีลเลอร์มองไม่เห็น · ข้ามจากร่างไปตอบรับไม่ได้ · ส่งแล้วแก้เนื้อหา/ลบไม่ได้", async () => {
  const sb = await db(ADMIN);
  const { data: pr, error } = await sb.from("dealer_prospects").insert({ ...ช่องผู้สนใจครบ(), name: `${NS}-ตรวจกติกาใบ` }).select("id").single();
  expect(error).toBeNull();
  const { data: ใบ, error: ใบErr } = await sb.from("dealer_package_proposals")
    .insert({ ...ช่องใบครบ(), prospect_id: (pr as { id: number }).id, proposed_date: "2026-09-14", proposal_no: "ปลอม-001" })
    .select("id, proposal_no, status").single();
  expect(ใบErr).toBeNull();
  const row = ใบ as { id: number; proposal_no: string; status: string };
  expect(row.status, "ใบใหม่ต้องเริ่มที่ร่าง").toBe("draft");
  expect(row.proposal_no, "เลขที่ใบต้องออกโดยฐานข้อมูล ผู้เรียกกำหนดเองไม่ได้").toMatch(/^DP-\d{4}-\d{4}$/);

  const ข้ามขั้น = await sb.from("dealer_package_proposals").update({ status: "accepted" }).eq("id", row.id).select();
  expect(ข้ามขั้น.error, "ร่าง → ตอบรับ ข้ามขั้นไม่ได้").not.toBeNull();

  const ส่ง = await sb.from("dealer_package_proposals").update({ status: "sent" }).eq("id", row.id).select().single();
  expect(ส่ง.error, "ร่าง → ส่งแล้ว ต้องได้").toBeNull();

  const แก้ = await sb.from("dealer_package_proposals").update({ amount: 1 }).eq("id", row.id).select();
  expect(แก้.error, "ใบที่ส่งแล้วแก้เนื้อหาไม่ได้").not.toBeNull();
  const แก้ระยะ = await sb.from("dealer_package_proposals").update({ contract_months: 24 }).eq("id", row.id).select();
  expect(แก้ระยะ.error, "ใบที่ส่งแล้วแก้ระยะสัญญาไม่ได้").not.toBeNull();
  const แก้เป้า = await sb.from("dealer_package_proposals").update({ annual_target: 1 }).eq("id", row.id).select();
  expect(แก้เป้า.error, "ใบที่ส่งแล้วแก้เป้ายอดซื้อต่อปีไม่ได้").not.toBeNull();
  const ลบ = await sb.from("dealer_package_proposals").delete().eq("id", row.id).select();
  expect(ลบ.error, "ใบที่ส่งแล้วลบไม่ได้").not.toBeNull();

  const dealer = await db(RYG);
  const { data: เห็น } = await dealer.from("dealer_package_proposals").select("id").eq("id", row.id);
  expect(เห็น ?? [], "ดีลเลอร์ต้องไม่เห็นใบค่าแฟรนไชส์ของสำนักงานใหญ่").toHaveLength(0);
});

test("[H3] [H4] [H5] [func·hq] ออกใบค่าแฟรนไชส์ → ร่าง/ส่งแล้วยังสร้างไม่ได้ → ตอบรับ + ชำระไม่ครบ สร้างไม่ได้ → ครบ สร้างได้ → ยกเลิกงวดจนไม่ครบ สร้างไม่ได้", async ({ page }) => {
  const errs = watchErrors(page);
  const sb = await db(ADMIN);
  const name = `${NS}-ออกใบผ่านหน้าจอ`;
  const { data: pr, error } = await sb.from("dealer_prospects").insert({ ...ช่องผู้สนใจครบ(), name, province: "ชลบุรี", status: "meeting" }).select("id").single();
  expect(error).toBeNull();
  const prospectId = (pr as { id: number }).id;

  await loginUI(page, HQ_ORIGIN, "/hq/prospects", ADMIN);
  await page.getByLabel("ค้นหาผู้สนใจ").fill(name);
  await page.getByRole("row", { name: new RegExp(name) }).click();
  const แก้ไข = page.getByRole("dialog", { name: "ข้อมูลผู้สนใจ" });
  // ปุ่มลัดบนหัวแผงบอสสั่งเอาออก (14 ก.ย. 69) — ออกใบจากแท็บใบค่าแฟรนไชส์
  await แก้ไข.getByRole("tab", { name: /ใบค่าแฟรนไชส์/ }).click();
  await แก้ไข.getByRole("button", { name: "ออกใบค่าแฟรนไชส์" }).click();

  // ฟอร์มเปิดในแท็บเลย ไม่เด้งหน้าต่าง (บอสสั่ง 15 ก.ย. 69 "ไม่ต้องทำเป็นป็อบอัพ ทำเป็นเปิดในหน้านั้นเลย")
  const ใบ = แก้ไข.getByRole("region", { name: "ใบค่าแฟรนไชส์" });
  await expect(ใบ, "ฟอร์มต้องอยู่ในแท็บของหน้าต่างลูกค้าเป้าหมาย").toBeVisible();
  await expect(page.getByRole("dialog", { name: "ใบค่าแฟรนไชส์" }), "ต้องไม่มีหน้าต่างเด้งซ้อน").toHaveCount(0);
  await expect(แก้ไข.getByRole("button", { name: "ออกใบค่าแฟรนไชส์" }), "เปิดฟอร์มแล้วซ่อนปุ่มออกใบซ้ำ").toHaveCount(0);
  // แพ็กเกจลบออกจากฐานถาวรแล้ว (ใบ 0269 · บอสสั่ง 1 พ.ย. 69) — เดิมตรวจ "ไม่เลือกแพ็กเกจ = บันทึกไม่ได้" · กลับด้าน: ฟอร์มต้องไม่มีช่อง/ข้อความแพ็กเกจเลย
  await expect(ใบ.locator("#pp-package"), "ไม่มีช่องเลือกแพ็กเกจ").toHaveCount(0);
  await expect(ใบ.getByText(/แพ็กเกจ/), "ฟอร์มไม่บังคับ/ไม่พูดถึงแพ็กเกจ").toHaveCount(0);
  await expect(ใบ.locator("#pp-province"), "จังหวัดเติมจากลูกค้าเป้าหมายให้").toHaveValue("ชลบุรี");
  await ใบ.locator("#pp-amount").fill("150000");
  await expect(ใบ.locator("#pp-amount"), "ช่องเงินต้องขึ้นลูกน้ำ").toHaveValue("150,000");
  await ใบ.locator("#pp-months").fill("12");
  await ใบ.locator("#pp-target").fill("2000000");
  await expect(ใบ.locator("#pp-target"), "เป้ายอดซื้อต้องขึ้นลูกน้ำ").toHaveValue("2,000,000");
  await กรอกช่องบังคับใบที่ว่าง(ใบ);   // ช่องบังคับครบก่อนบันทึก (4 พ.ย. 69)
  await ใบ.getByRole("button", { name: "บันทึกใบ" }).click();

  const แถวใบ = await waitRow<{ id: number; proposal_no: string; status: string; amount: number; contract_months: number; annual_target: number }>(
    sb, "dealer_package_proposals", { prospect_id: prospectId });
  expect(แถวใบ.status).toBe("draft");
  expect(Number(แถวใบ.amount)).toBe(150000);
  expect(Number(แถวใบ.contract_months)).toBe(12);
  expect(Number(แถวใบ.annual_target)).toBe(2_000_000);
  await expect(แก้ไข.getByText(แถวใบ.proposal_no)).toBeVisible();
  await expect(ใบ, "บันทึกแล้วฟอร์มปิด กลับเป็นรายการใบ").toHaveCount(0);

  // ── ตกลง + ชำระ (ด่าน 4 · บอสตัดสิน 15 ต.ค. 69 · ฐานข้อมูลบังคับ 0208) ──
  const ตั้ง = page.getByRole("dialog", { name: "ตั้งเป็นดีลเลอร์" });
  const ปุ่มสร้าง = ตั้ง.getByRole("button", { name: "สร้างดีลเลอร์" });
  const เปิดกล่องตั้ง = async () => { await แก้ไข.getByRole("button", { name: "ตั้งเป็นดีลเลอร์" }).first().click(); await expect(ตั้ง).toBeVisible(); };
  // ยังไม่พร้อม (5 พ.ย. 69 · บอสสั่ง): ปุ่ม "ตั้งเป็นดีลเลอร์" ในแผงกดไม่ได้ + บอกเหตุผล (ตรวจกลับด้านจากเดิมที่กดเปิดกล่องได้)
  //   กล่องยังตรวจได้ทางปุ่ม "ผูกกับดีลเลอร์เดิม" (กดได้เสมอ) แล้วสลับเป็นสร้างใหม่ — ข้อความฐาน + ปุ่มสร้างปิด เหมือนเดิม
  const ยังตั้งไม่ได้ = async (เหตุในแผง: RegExp, เหตุในกล่อง: RegExp) => {
    await expect(แก้ไข.locator("button[data-convert-ready]").first(), "ยังไม่พร้อม = ปุ่มตั้งเป็นดีลเลอร์กดไม่ได้").toBeDisabled({ timeout: 15_000 });
    await expect(แก้ไข.locator("button[data-convert-ready]").first()).toHaveAttribute("title", เหตุในแผง);
    await แก้ไข.locator("button[data-link-existing]").first().click();
    await expect(ตั้ง).toBeVisible();
    await ตั้ง.getByRole("radio", { name: /สร้างดีลเลอร์ใหม่/ }).check();
    await expect(ตั้ง.getByText(เหตุในกล่อง)).toBeVisible({ timeout: 15_000 });
    await expect(ปุ่มสร้าง).toBeDisabled();
    await ปิดกล่องตั้ง();
  };
  const ปิดกล่องตั้ง = async () => { await ตั้ง.getByRole("button", { name: "ยกเลิก" }).click(); await expect(ตั้ง).toHaveCount(0); };

  // ยังเป็นร่าง → กดสร้างไม่ได้ พร้อมบอกเหตุผล
  await ยังตั้งไม่ได้(/ต้องส่งใบค่าแฟรนไชส์/, /ยังไม่มีใบค่าแฟรนไชส์ที่ตอบรับ/);

  // ส่งแล้ว (ยังไม่ตอบรับ) → ยังสร้างไม่ได้
  await แก้ไข.getByLabel(`สถานะใบ ${แถวใบ.proposal_no}`).selectOption("sent");
  await กดตกลงในกล่องยืนยัน(page);
  await waitRow(sb, "dealer_package_proposals", { id: แถวใบ.id, status: "sent" });
  await ยังตั้งไม่ได้(/รอผู้สนใจตอบรับ/, /ยังไม่มีใบค่าแฟรนไชส์ที่ตอบรับ/);

  // ตอบรับ → บันทึกการชำระงวดแรก 100,000 จาก 150,000 → ยังสร้างไม่ได้ (บอกยอดค้าง)
  await แก้ไข.getByLabel(`สถานะใบ ${แถวใบ.proposal_no}`).selectOption("accepted");
  await กดตกลงในกล่องยืนยัน(page);
  await waitRow(sb, "dealer_package_proposals", { id: แถวใบ.id, status: "accepted" });
  // รอบ 4 (บอสตัดสิน ข้อ 7): บันทึก/ยกเลิกการชำระที่หน้า "ใบค่าแฟรนไชส์" ที่เดียว — แผงผู้สนใจดูอย่างเดียว
  await expect(แก้ไข.getByRole("region", { name: `การชำระ ${แถวใบ.proposal_no}` }).getByRole("button", { name: "บันทึกการชำระ" }),
    "แผงผู้สนใจ: ไม่มีปุ่มบันทึกการชำระ").toHaveCount(0);
  const ชำระ = page.getByRole("region", { name: `การชำระ ${แถวใบ.proposal_no}` });
  const ไปหน้าใบ = async () => {
    await page.goto(`${HQ_ORIGIN}/hq/proposals?q=${encodeURIComponent(แถวใบ.proposal_no)}`, { waitUntil: "domcontentloaded" });
    const แถว = page.getByRole("row", { name: new RegExp(`เปิดใบค่าแฟรนไชส์ ${แถวใบ.proposal_no} `) }).first();
    await expect(แถว).toBeVisible({ timeout: 25_000 });
    // การ์ด/ตารางเลื่อนเข้าตามแอนิเมชันตอนเปิดหน้า — กดกลางแอนิเมชัน = คลิกลงที่ตำแหน่งที่แถวเลื่อนพ้นไปแล้ว แผงไม่เปิด
    //   (ไม่นิ่ง 3 ครั้ง 27–28 ต.ค. 69 · ภาพจากบันทึกการทดสอบ: กดหลังแถวขึ้น ~0.1 วิ ตารางยังจางและกำลังขยับ) → รอแอนิเมชันจบจริงก่อนกด
    await page.waitForFunction(() => document.getAnimations().every(a => a.playState !== "running"), null, { timeout: 15_000 });
    await แถว.click();
    await expect(ชำระ).toBeVisible({ timeout: 15_000 });
  };
  const กลับแผง = async () => {
    await page.goto(`${HQ_ORIGIN}/hq/prospects?open=${prospectId}`, { waitUntil: "domcontentloaded" });
    await expect(แก้ไข).toBeVisible({ timeout: 25_000 });
    await แก้ไข.getByRole("tab", { name: /ใบค่าแฟรนไชส์/ }).click();
  };
  await ไปหน้าใบ();
  await ชำระ.getByLabel("ยอดชำระ").fill("100000");
  await ชำระ.getByLabel("เลขอ้างอิง").fill("TR-ZZ-1");
  await ชำระ.getByRole("button", { name: "บันทึกการชำระ" }).click();
  await waitRow(sb, "dealer_proposal_payments", { proposal_id: แถวใบ.id, reference: "TR-ZZ-1" });
  await expect(ชำระ.getByTestId(`ยอดชำระ-${แถวใบ.proposal_no}`)).toContainText("ค้าง 50,000.00");
  await กลับแผง();
  await expect(แก้ไข.getByTestId(`ยอดชำระ-${แถวใบ.proposal_no}`), "แผงผู้สนใจเห็นยอดค้างเดียวกัน").toContainText("ค้าง 50,000.00", { timeout: 15_000 });
  await ยังตั้งไม่ได้(/ยังชำระไม่ครบ — จ่ายแล้ว 100,000 \/ 150,000 บาท/, /ยังชำระไม่ครบ/);   // ชำระ 1 งวดไม่ครบ → สร้างไม่ได้

  // งวดที่ 2 ครบ → สร้างได้
  await ไปหน้าใบ();
  await ชำระ.getByLabel("ยอดชำระ").fill("50000");
  await ชำระ.getByLabel("เลขอ้างอิง").fill("TR-ZZ-2");
  await ชำระ.getByRole("button", { name: "บันทึกการชำระ" }).click();
  await waitRow(sb, "dealer_proposal_payments", { proposal_id: แถวใบ.id, reference: "TR-ZZ-2" });
  await expect(ชำระ.getByTestId(`ยอดชำระ-${แถวใบ.proposal_no}`)).toContainText("ครบแล้ว");
  await กลับแผง();
  await เปิดกล่องตั้ง();
  await expect(ปุ่มสร้าง, "ชำระครบ → สร้างได้").toBeEnabled({ timeout: 15_000 });
  await ปิดกล่องตั้ง();

  // ยกเลิกงวดที่ 2 (ต้องมีเหตุผล) → ยอดไม่ครบอีก → สร้างไม่ได้
  await ไปหน้าใบ();
  await ชำระ.getByRole("button", { name: "ยกเลิกการชำระ TR-ZZ-2" }).click();
  const ถาม = page.getByRole("alertdialog", { name: /ยกเลิกการชำระ/ });
  await expect(ถาม.getByRole("button", { name: "ยกเลิกการชำระ" }), "ยังไม่กรอกเหตุผล ยกเลิกไม่ได้").toBeDisabled();
  await ถาม.getByLabel("เหตุผลที่ยกเลิก").fill("บันทึกยอดผิด");
  await ถาม.getByRole("button", { name: "ยกเลิกการชำระ" }).click();
  await waitRow(sb, "dealer_proposal_payments", { proposal_id: แถวใบ.id, reference: "TR-ZZ-2", cancel_reason: "บันทึกยอดผิด" });
  await expect(ชำระ.getByText("ยกเลิกแล้ว: บันทึกยอดผิด")).toBeVisible();
  await กลับแผง();
  await ยังตั้งไม่ได้(/ยังชำระไม่ครบ — จ่ายแล้ว 100,000 \/ 150,000 บาท/, /ยังชำระไม่ครบ/);   // ยกเลิกงวดจนยอดไม่ครบ → สร้างไม่ได้
  assertNoErrors(errs, "ออกใบค่าแฟรนไชส์ + ตกลง + ชำระ");
});


// ── สถานะผู้สนใจหลังส่งใบ เดินตามใบเอง (บอสสั่ง 5 พ.ย. 69) ────────────────────────────────────────────────────────────
//   ส่งใบแล้ว = รอผู้สนใจตอบรับ · ตอบรับยังจ่ายไม่ครบ = รอชำระ (จ่ายแล้ว x / y บาท) · ตอบรับ+ชำระครบ = พร้อมตั้งเป็นดีลเลอร์ · ตั้งแล้ว = เป็นดีลเลอร์แล้ว
//   ปุ่ม "ตั้งเป็นดีลเลอร์" กดไม่ได้ + บอกเหตุผลจนชำระครบ · พร้อม = ปุ่มเด่นกดได้
//   ตกบนโค้ดเดิม: ป้าย "รอตัดสินใจ HQ" ทุกขั้นย่อย · ปุ่มตั้งเป็นดีลเลอร์กดได้ตลอด
const SUB_CODE = "ZZPS";
test("[ui·hq] สถานะผู้สนใจหลังส่งใบ 4 ขั้นตามใบ · ปุ่มตั้งเป็นดีลเลอร์กดไม่ได้จนชำระครบ", async ({ page }) => {
  const errs = watchErrors(page);
  await purgeDealer(SUB_CODE);
  const sb = await db(ADMIN);
  const name = `${NS}-สถานะตามใบ`;
  const { data: pr, error } = await sb.from("dealer_prospects").insert({ ...ช่องผู้สนใจครบ(), name, region: "เหนือ", province: "ตาก", status: "meeting" }).select("id").single();
  expect(error).toBeNull();
  const id = (pr as { id: number }).id;
  const ใบ = await sb.from("dealer_package_proposals").insert({ ...ช่องใบครบ(), prospect_id: id, status: "sent", amount: 50_000, region: "เหนือ", province: "ตาก" }).select("id").single();
  expect(ใบ.error?.message ?? "").toBe("");
  const ใบId = (ใบ.data as { id: number }).id;

  await loginUI(page, HQ_ORIGIN, "/hq/prospects", ADMIN);
  const ตรวจขั้น = async (ป้าย: string, พร้อม: boolean) => {
    await page.goto(`${HQ_ORIGIN}/hq/prospects`, { waitUntil: "domcontentloaded" });
    await page.getByLabel("ค้นหาผู้สนใจ").fill(name);
    const แถว = page.getByRole("row", { name: new RegExp(name) });
    await expect(แถว.locator(".badge").first(), `ตาราง: ${ป้าย}`).toHaveText(ป้าย, { timeout: 20_000 });
    for (const เดิม of ["รอตัดสินใจ HQ", "รอตัดสินใจ"]) await expect(แถว, `ไม่มีชื่อเดิม "${เดิม}"`).not.toContainText(เดิม);
    await แถว.click();
    const แผง = page.getByRole("dialog", { name: "ข้อมูลผู้สนใจ" });
    await แผง.getByRole("tab", { name: /งาน/ }).click();
    await expect(แผง.getByTestId("journey-status"), `แท็บงาน: ${ป้าย}`).toHaveText(ป้าย, { timeout: 20_000 });
    const ปุ่มในงาน = แผง.locator("button[data-convert-ready]").filter({ hasText: "ตั้งเป็นดีลเลอร์" }).last();
    const ปุ่มหัว = แผง.locator("button[data-convert-ready]").first();
    for (const ปุ่ม of [ปุ่มหัว, ปุ่มในงาน]) {
      if (พร้อม) await expect(ปุ่ม, "พร้อม = กดได้").toBeEnabled();
      else await expect(ปุ่ม, "ยังไม่พร้อม = กดไม่ได้").toBeDisabled();
      await expect(ปุ่ม).toHaveAttribute("data-convert-ready", พร้อม ? "1" : "0");
    }
    if (!พร้อม) await expect(แผง.locator("[data-convert-blocked]"), "บอกเหตุผลที่ยังตั้งไม่ได้").toBeVisible();
    else await expect(แผง.locator("[data-convert-blocked]")).toHaveCount(0);
    return แผง;
  };
  // 1) ส่งใบแล้ว
  let แผง = await ตรวจขั้น("รอผู้สนใจตอบรับ", false);
  await expect(แผง.locator("[data-convert-blocked]")).toContainText("รอผู้สนใจตอบรับใบค่าแฟรนไชส์");
  // 2) ตอบรับ ยังไม่จ่าย → จ่ายบางส่วน
  expect((await sb.from("dealer_package_proposals").update({ status: "accepted" }).eq("id", ใบId)).error).toBeNull();
  แผง = await ตรวจขั้น("รอชำระ (จ่ายแล้ว 0 / 50,000 บาท)", false);
  expect((await sb.from("dealer_proposal_payments").insert({ proposal_id: ใบId, paid_on: "2026-11-05", amount: 20_000, reference: `TR-${NS}-1` })).error).toBeNull();
  แผง = await ตรวจขั้น("รอชำระ (จ่ายแล้ว 20,000 / 50,000 บาท)", false);
  await expect(แผง.locator("[data-convert-blocked]")).toContainText("ยังชำระไม่ครบ — จ่ายแล้ว 20,000 / 50,000 บาท");
  // 3) ชำระครบ
  expect((await sb.from("dealer_proposal_payments").insert({ proposal_id: ใบId, paid_on: "2026-11-05", amount: 30_000, reference: `TR-${NS}-2` })).error).toBeNull();
  await ตรวจขั้น("พร้อมตั้งเป็นดีลเลอร์", true);
  // 4) ตั้งเป็นดีลเลอร์ → เป็นดีลเลอร์แล้ว
  const res = await fetch(`${HQ_ORIGIN}/api/admin/dealers`, {
    method: "POST", headers: { authorization: `Bearer ${await adminToken()}`, "content-type": "application/json" },
    body: JSON.stringify({ code: SUB_CODE, name, province: "ตาก", region: "เหนือ", revenueTarget: 0, prospectId: id }),
  });
  expect(res.status, await res.text()).toBe(200);
  const { data: หลัง } = await sb.from("dealer_prospects").select("status, dealer_code").eq("id", id).single();
  expect(หลัง, "ตั้งแล้ว = เป็นดีลเลอร์แล้ว").toMatchObject({ status: "won", dealer_code: SUB_CODE });
  await purgeDealer(SUB_CODE);
  assertNoErrors(errs, "สถานะผู้สนใจตามใบ");
});
