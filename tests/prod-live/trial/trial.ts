import { test, expect, type Page, type Browser } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

// ── ทดลองใช้เว็บแทนบอส (บอสสั่ง 21 ต.ค. 69) ───────────────────────────────────────────────────────────────────────
//   เดินตาม FLOW (docs/FLOW.html) D1–D9 ของดีลเลอร์ · H1–H12 ของ HQ ด้วยการกดหน้าเว็บเหมือนคนใช้จริง
//   บัญชีชั่วคราวเท่านั้น (live-hq · live-dealer ของสาขาทดสอบ ZZT · run.mjs setup) — สาขาใหม่จากขั้น H5 ใช้รหัส ZZU
//   ไม่เรียก API ตรงเพื่อทำงาน · อ่านฐานด้วยกุญแจฝั่งเซิร์ฟเวอร์เฉพาะเพื่อ "ตรวจผล" (อ่านอย่างเดียว)
//   ทุกขั้นถ่ายรูป + จดผล (ผ่าน/ตก · error บนหน้า · คำขอที่ตอบ 4xx/5xx) ลง LIVE_SHOTS_DIR/ผลทดลอง.json
//   ขั้นไหนตก จดไว้แล้วเดินต่อ — ไม่หยุดทั้งชุด (นี่คือการสำรวจ ไม่ใช่ข้อทดสอบประจำ)
//   ⛔ ห้ามกด "โอนอัตโนมัติทั้งหมด" (H6) — จะย้ายลีดจริงของ HQ · โอนเฉพาะลีดทดสอบทีละราย
const E = (k: string) => { const v = process.env[k]; if (!v) throw new Error(`ขาด ${k}`); return v; };
const HQ = E("LIVE_HQ_URL"), DEALER = E("LIVE_DEALER_URL");
const ผู้ดูแล = { email: E("LIVE_HQ_EMAIL"), password: E("LIVE_PASSWORD") };
const ดีลเลอร์ = { email: E("LIVE_DEALER_EMAIL"), password: E("LIVE_PASSWORD") };
const สาขา = E("LIVE_DEALER_CODE");
const svc = createClient(E("LIVE_SUPABASE_URL"), E("LIVE_SERVICE_KEY"), { auth: { persistSession: false } });
const โฟลเดอร์ = E("LIVE_SHOTS_DIR");
mkdirSync(โฟลเดอร์, { recursive: true });
const แท็ก = `${Date.now() % 100000}`;
const ชื่อ = (s: string) => `ZZTEST-ทดลอง-${s}-${แท็ก}`;
const สาขาใหม่ = "ZZU";

type ผล = { ลำดับ: number; รหัส: string; ชื่อ: string; จอ: string; ผ่าน: boolean; ข้อความ: string; error: string[]; คาดว่าถูกปฏิเสธ?: boolean; หมายเหตุ?: string };
const บันทึก: ผล[] = [];
let ลำดับ = 0;
const errsOf = new Map<Page, string[]>();
function ฟัง(page: Page) {
  const arr: string[] = [];
  page.on("pageerror", e => arr.push(`[pageerror] ${e.message.slice(0, 200)}`));
  page.on("console", m => { if (m.type() === "error") arr.push(`[console] ${m.text().slice(0, 200)}`); });
  page.on("response", r => {
    if (r.status() >= 400 && /\/api\/|supabase\.co|127\.0\.0\.1:5532/.test(r.url()))
      arr.push(`[http ${r.status()}] ${r.request().method()} ${r.url().replace(/^https?:\/\/[^/]+/, "").replace(/\?.*$/, "")}`);
  });
  errsOf.set(page, arr);
}
async function เงียบ(page: Page) { await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {}); }
async function ขั้น(รหัส: string, ชื่อขั้น: string, page: Page, fn: () => Promise<unknown>, opt: { คาดว่าถูกปฏิเสธ?: boolean; หมายเหตุ?: string } = {}) {
  ลำดับ++;
  const errs = errsOf.get(page) ?? [];
  const เริ่ม = errs.length;
  let ผ่าน = true, ข้อความ = "";
  try { await fn(); } catch (e) { ผ่าน = false; ข้อความ = String((e as Error).message ?? e).split("\n").filter(Boolean).slice(0, 3).join(" | ").slice(0, 400); }
  await เงียบ(page);
  await page.waitForTimeout(600);
  const vp = page.viewportSize();
  const จอ = vp && vp.width < 600 ? "มือถือ" : "จอกว้าง";
  const ไฟล์ = `${String(ลำดับ).padStart(3, "0")}-${รหัส}-${ชื่อขั้น}-${จอ}.png`.replace(/[\\/:*?"<>|]/g, "-");
  await page.screenshot({ path: path.join(โฟลเดอร์, ไฟล์), fullPage: true }).catch(() => {});
  บันทึก.push({ ลำดับ, รหัส, ชื่อ: ชื่อขั้น, จอ, ผ่าน, ข้อความ, error: errs.slice(เริ่ม), ...opt });
  writeFileSync(path.join(โฟลเดอร์, "ผลทดลอง.json"), JSON.stringify(บันทึก, null, 1));
  console.log(`${ผ่าน ? "✓" : "✗"} ${รหัส} ${ชื่อขั้น} (${จอ})${ข้อความ ? ` — ${ข้อความ}` : ""}${errs.length > เริ่ม ? ` · error ${errs.length - เริ่ม}` : ""}`);
  return ผ่าน;
}
async function เข้าระบบ(page: Page, origin: string, p: string, who: { email: string; password: string }) {
  await page.goto(`${origin}${p}`, { waitUntil: "domcontentloaded" });
  await เงียบ(page);
  const email = page.locator("#login-email"), pass = page.getByLabel(/รหัสผ่าน/i).first();
  for (let i = 0; i < 6; i++) {
    await email.fill(who.email); await pass.fill(who.password);
    await page.waitForTimeout(300);
    if (await email.inputValue() === who.email && await pass.inputValue() === who.password) break;
  }
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).first().click();
  await page.waitForFunction(() => !location.pathname.includes("/login"), null, { timeout: 30_000 });
  await เงียบ(page);
}
// อ่านฐาน (ตรวจผลเท่านั้น)
const ลีด = async (company: string) => (await svc.from("leads").select("num_id, status, quote_value").eq("dealer_code", สาขา).eq("company", company).maybeSingle()).data;
const คำขอของ = async (num: number) => (await svc.from("quote_requests").select("id, status, request_no").eq("dealer_code", สาขา).eq("lead_num_id", num).order("id", { ascending: false })).data ?? [];
const ใบของ = async (num: number) => (await svc.from("quotations").select("id, status, revision, total_value").eq("dealer_code", สาขา).eq("deal_id", num).order("created_at")).data ?? [];

async function เปิดลีด(d: Page, company: string, แท็บ?: string) {
  await d.goto(`${DEALER}/leads`, { waitUntil: "domcontentloaded" });
  await เงียบ(d);
  await d.getByRole("button", { name: "ตาราง" }).click().catch(() => {});
  await d.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(company);
  const row = d.locator("tbody tr").filter({ hasText: company }).first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.locator("td").first().click();
  if (แท็บ) await d.getByRole("button", { name: แท็บ, exact: true }).first().click();
}
async function เพิ่มลีด(d: Page, company: string, phone: string, province = "ระยอง", กดซ้ำ = false) {
  await d.goto(`${DEALER}/leads`, { waitUntil: "domcontentloaded" });
  await เงียบ(d);
  await d.getByRole("button", { name: "เพิ่มลูกค้าเป้าหมาย" }).first().click();
  const กล่อง = d.getByRole("dialog", { name: "เพิ่มลูกค้าเป้าหมาย" });
  await d.getByPlaceholder("เช่น บริษัท ตัวอย่าง จำกัด").fill(company);
  await d.getByPlaceholder("ชื่อผู้ติดต่อ").fill("คุณทดลอง");
  await d.getByPlaceholder("0XX-XXX-XXXX").fill(phone);
  await กล่อง.getByLabel("จังหวัด").first().selectOption(province);
  const ปุ่ม = d.getByRole("button", { name: "บันทึก" });
  if (กดซ้ำ) await ปุ่ม.dblclick(); else await ปุ่ม.click();
}
async function ขอราคา(d: Page, company: string, กดซ้ำ = false) {
  await เปิดลีด(d, company, "ใบเสนอราคา");
  const แผง = d.locator("[data-panel='quote-request']");
  await แผง.getByRole("button", { name: "ขอราคาจาก HQ" }).click();
  await แผง.getByLabel("งานที่ขอราคา").fill("ทดลอง — โกดัง");
  await แผง.getByLabel("สเปก / รายละเอียด").fill("ทดลอง — โกดัง 20x30 ม.");
  const ส่ง = แผง.getByRole("button", { name: "ส่งคำขอ" });
  if (กดซ้ำ) await ส่ง.dblclick(); else await ส่ง.click();
  await expect(แผง.getByText("ใหม่", { exact: true })).toBeVisible({ timeout: 20_000 });
}
async function HQตีราคาและส่ง(h: Page, company: string, ต้นทุน = "1000") {
  await h.goto(`${HQ}/hq/quote-requests`, { waitUntil: "domcontentloaded" });
  await เงียบ(h);
  await h.getByLabel("ค้นหาคำขอ").fill(company);
  const row = h.getByRole("list", { name: "รายการคำขอ" }).getByRole("button", { name: company }).first();
  await row.click();
  const กล่อง = h.getByRole("region", { name: "ใบ HQ" });
  if (await กล่อง.getByLabel("ชื่อรายการ 1").count() === 0) await กล่อง.getByRole("button", { name: "เพิ่มรายการอื่น" }).click();
  await กล่อง.getByLabel("ชื่อรายการ 1").fill("ทดลอง — โครงสร้างเหล็ก");
  await กล่อง.getByLabel("จำนวน 1").fill("100");
  await กล่อง.getByLabel("หน่วย 1", { exact: true }).fill("ตร.ม.");
  await กล่อง.getByLabel("ต้นทุนต่อหน่วย 1").fill(ต้นทุน);
  await กล่อง.getByRole("button", { name: "ส่งใบ HQ ให้ดีลเลอร์" }).click();
  await ตกลง(h);
}
async function ตกลง(page: Page) {
  const box = page.locator(".pms-confirm, [role='alertdialog']").last();
  await expect(box).toBeVisible({ timeout: 10_000 });
  await box.locator(".pms-confirm-actions button, button").last().click();
}

test.describe.configure({ mode: "serial" });

test("ทดลอง · จอกว้าง · D1–D9 · H1–H12", async ({ browser }) => {
  const ctxD = await browser.newContext(), ctxH = await browser.newContext();
  const d = await ctxD.newPage(), h = await ctxH.newPage();
  ฟัง(d); ฟัง(h);
  const ก = ชื่อ("ก"), ข = ชื่อ("ข-ยกเลิก"), ค = ชื่อ("ค-ปฏิเสธ"), ผู้สนใจ = ชื่อ("ผู้สนใจ");
  const เบอร์ = (n: number) => `000-${String(Number(แท็ก) % 1000).padStart(3, "0")}-${String(n).padStart(4, "0")}`;

  // ── เข้าระบบ ──
  await ขั้น("H1", "HQ เข้าระบบ", h, () => เข้าระบบ(h, HQ, "/hq/login", ผู้ดูแล));
  await ขั้น("D1", "ดีลเลอร์เข้าระบบ (อีเมลเต็ม)", d, async () => { await เข้าระบบ(d, DEALER, "/login", ดีลเลอร์); await expect(d).toHaveURL(/dashboard/); });
  await ขั้น("D1x", "ดีลเลอร์กดย้อนกลับหลังเข้าระบบ", d, async () => { await d.goBack(); await เงียบ(d); await d.goForward().catch(() => {}); });

  // ── H11 ตั้งจังหวัดที่ดูแลให้สาขาทดสอบ (ดีลเลอร์สร้างลีดได้เฉพาะในพื้นที่ตัวเอง) ──
  await ขั้น("H11", "HQ เปิดหน้าดีลเลอร์สาขาทดสอบ", h, async () => {
    await h.goto(`${HQ}/hq/dealers/${สาขา}`, { waitUntil: "domcontentloaded" }); await เงียบ(h);
    await expect(h.getByText(สาขา).first()).toBeVisible();
  });
  await ขั้น("H11", "HQ เปิดหน้าต่างแก้ไขข้อมูลดีลเลอร์ แล้วกดบันทึกโดยไม่แก้อะไร", h, async () => {
    await h.getByRole("button", { name: /^แก้ไข/ }).first().click();
    const แผง = h.getByRole("dialog").last();
    await expect(แผง).toBeVisible();
    await แผง.getByRole("button", { name: /บันทึก/ }).last().click();
    await expect(แผง).toBeHidden({ timeout: 10_000 });
  });

  // ── D2 สร้างลูกค้าเป้าหมาย (+ กดซ้ำ · ซ้ำชื่อ+เบอร์ · ช่องว่าง) ──
  await ขั้น("D2", "เปิดฟอร์มเพิ่มลูกค้าเป้าหมาย แล้วกดบันทึกทั้งที่ช่องว่าง", d, async () => {
    await d.goto(`${DEALER}/leads`, { waitUntil: "domcontentloaded" }); await เงียบ(d);
    await d.getByRole("button", { name: "เพิ่มลูกค้าเป้าหมาย" }).first().click();
    await d.getByRole("button", { name: "บันทึก" }).click();
  }, { คาดว่าถูกปฏิเสธ: true });
  await ขั้น("D2", "เบอร์โทรผิดรูป (ตัวอักษร)", d, async () => {
    await d.getByPlaceholder("เช่น บริษัท ตัวอย่าง จำกัด").fill(ชื่อ("เบอร์ผิด"));
    await d.getByPlaceholder("ชื่อผู้ติดต่อ").fill("คุณทดลอง");
    await d.getByPlaceholder("0XX-XXX-XXXX").fill("abc-xyz");
    await d.getByRole("dialog", { name: "เพิ่มลูกค้าเป้าหมาย" }).getByLabel("จังหวัด").first().selectOption("ระยอง");
    await d.getByRole("button", { name: "บันทึก" }).click();
  }, { คาดว่าถูกปฏิเสธ: true });
  await ขั้น("D2", "เพิ่มลูกค้าเป้าหมาย (กดบันทึกสองครั้งติด)", d, async () => {
    await เพิ่มลีด(d, ก, เบอร์(1), "ระยอง", true);
    await expect.poll(async () => (await svc.from("leads").select("id").eq("dealer_code", สาขา).eq("company", ก)).data?.length ?? 0, { timeout: 20_000 }).toBeGreaterThan(0);
    const n = (await svc.from("leads").select("id").eq("dealer_code", สาขา).eq("company", ก)).data?.length ?? 0;
    if (n !== 1) throw new Error(`กดสองครั้งได้ลีด ${n} รายการ (ควรได้ 1)`);
  });
  await ขั้น("D2", "สร้างลีดซ้ำชื่อ+เบอร์เดิม (ต้องเห็นข้อความบอกว่าซ้ำ)", d, async () => {
    await เพิ่มลีด(d, ก, เบอร์(1));
    const เห็น = await d.getByText(/ซ้ำ|เปิดอยู่แล้ว|มีลูกค้าเป้าหมายชื่อ/).first().isVisible({ timeout: 4000 }).catch(() => false)
      || await d.getByText(/ซ้ำ|เปิดอยู่แล้ว|มีลูกค้าเป้าหมายชื่อ/).first().waitFor({ timeout: 4000 }).then(() => true).catch(() => false);
    await d.screenshot({ path: path.join(โฟลเดอร์, `${String(ลำดับ + 1).padStart(3, "0")}-D2-ทันทีหลังกดบันทึกลีดซ้ำ-จอกว้าง.png`) });
    if (!เห็น) throw new Error("ฐานปฏิเสธลีดซ้ำ แต่หน้าเว็บไม่ขึ้นข้อความให้ผู้ใช้รู้");
    await d.waitForTimeout(1500);
    const n = (await svc.from("leads").select("id").eq("dealer_code", สาขา).eq("company", ก)).data?.length ?? 0;
    if (n !== 1) throw new Error(`สร้างซ้ำได้ (${n} รายการ)`);
  }, { คาดว่าถูกปฏิเสธ: true });
  await ขั้น("D2", "สร้างลีดนอกพื้นที่ (ชลบุรี — ภาคเดียวกันแต่ไม่ได้ดูแล · ต้องเห็นข้อความ)", d, async () => {
    await เพิ่มลีด(d, ชื่อ("นอกพื้นที่"), เบอร์(9), "ชลบุรี");
    const เห็น = await d.getByText(/ไม่อยู่ในพื้นที่/).first().waitFor({ timeout: 5000 }).then(() => true).catch(() => false);
    if (!เห็น) throw new Error("ฐานปฏิเสธลีดนอกพื้นที่ แต่หน้าเว็บไม่ขึ้นข้อความให้ผู้ใช้รู้");
    await d.waitForTimeout(1500);
    const n = (await svc.from("leads").select("id").eq("dealer_code", สาขา).eq("company", ชื่อ("นอกพื้นที่"))).data?.length ?? 0;
    if (n !== 0) throw new Error("สร้างลีดนอกพื้นที่ได้");
  }, { คาดว่าถูกปฏิเสธ: true });
  await ขั้น("D2", "รีเฟรชกลางฟอร์ม (กรอกแล้วยังไม่บันทึก)", d, async () => {
    await d.getByRole("button", { name: "เพิ่มลูกค้าเป้าหมาย" }).first().click().catch(() => {});
    await d.getByPlaceholder("เช่น บริษัท ตัวอย่าง จำกัด").fill(ชื่อ("รีเฟรช"));
    await d.reload(); await เงียบ(d);
  });
  await ขั้น("D2", "เพิ่มลีด ข และ ค", d, async () => { await เพิ่มลีด(d, ข, เบอร์(2)); await d.waitForTimeout(1500); await เพิ่มลีด(d, ค, เบอร์(3)); await d.waitForTimeout(1500); });

  // ── D3 ขอราคา (+ กดซ้ำ) · D3x ยกเลิกคำขอ ──
  await ขั้น("D3", "ขอราคาจาก HQ (กดส่งคำขอสองครั้งติด)", d, async () => {
    await ขอราคา(d, ก, true);
    const l = await ลีด(ก);
    const ks = await คำขอของ(l!.num_id);
    if (ks.length !== 1) throw new Error(`กดสองครั้งได้คำขอ ${ks.length} ใบ`);
    if (l!.status !== "HQ_PRICING") throw new Error(`ลีดเป็น ${l!.status} (ควรรอราคา HQ)`);
  });
  await ขั้น("D3", "ขอราคาลีด ข และ ค", d, async () => { await ขอราคา(d, ข); await ขอราคา(d, ค); });
  await ขั้น("D3x", "ยกเลิกคำขอโดยไม่ใส่เหตุผล", d, async () => {
    await เปิดลีด(d, ข, "ใบเสนอราคา");
    const แผง = d.locator("[data-panel='quote-request']");
    await แผง.getByRole("button", { name: "ยกเลิกคำขอ" }).click();
    await แผง.getByRole("button", { name: "ยืนยันยกเลิก" }).click();
    await expect(แผง.getByText("ต้องระบุเหตุผล")).toBeVisible();
  }, { คาดว่าถูกปฏิเสธ: true });
  await ขั้น("D3x", "ยกเลิกคำขอพร้อมเหตุผล", d, async () => {
    const แผง = d.locator("[data-panel='quote-request']");
    await แผง.getByLabel("เหตุผลที่ยกเลิก").fill("ลูกค้าขอเลื่อนโครงการ");
    await แผง.getByRole("button", { name: "ยืนยันยกเลิก" }).click();
    await expect.poll(async () => (await คำขอของ((await ลีด(ข))!.num_id))[0]?.status, { timeout: 20_000 }).toBe("cancelled");
    const s = (await ลีด(ข))!.status;
    if (!["BULLET", "CANCELLED"].includes(s)) throw new Error(`ลีดหลังยกเลิกเป็น ${s}`);
  });

  // ── H7 รับคำขอ (ดูอย่างเดียว) · H8 ตีราคา (ช่องผิดรูป) · H9 ส่งใบ ──
  await ขั้น("H7", "HQ เปิดกล่องคำขอ เลือกคำขอ (ดูอย่างเดียว ไม่เปลี่ยนสถานะ)", h, async () => {
    await h.goto(`${HQ}/hq/quote-requests`, { waitUntil: "domcontentloaded" }); await เงียบ(h);
    await h.getByLabel("ค้นหาคำขอ").fill(ก);
    await h.getByRole("list", { name: "รายการคำขอ" }).getByRole("button", { name: ก }).first().click();
    await h.waitForTimeout(1500);
    const s = (await คำขอของ((await ลีด(ก))!.num_id))[0]?.status;
    if (s !== "new") throw new Error(`เปิดดูแล้วสถานะเป็น ${s} (ควรคงใหม่)`);
  });
  await ขั้น("H8", "ต้นทุนผิดรูป (ตัวอักษร / ติดลบ)", h, async () => {
    const กล่อง = h.getByRole("region", { name: "ใบ HQ" });
    if (await กล่อง.getByLabel("ชื่อรายการ 1").count() === 0) await กล่อง.getByRole("button", { name: "เพิ่มรายการอื่น" }).click();
    await กล่อง.getByLabel("ชื่อรายการ 1").fill("ทดลอง — โครงสร้างเหล็ก");
    await กล่อง.getByLabel("จำนวน 1").fill("-5");
    await กล่อง.getByLabel("ต้นทุนต่อหน่วย 1").click();
    await h.keyboard.type("abc");   // ช่องตัวเลข: คนพิมพ์ตัวอักษรได้ไหม
    await h.waitForTimeout(800);
  }, { คาดว่าถูกปฏิเสธ: true });
  await ขั้น("H8", "ตีราคา → บันทึกร่าง (สถานะเป็นกำลังตีราคา)", h, async () => {
    const กล่อง = h.getByRole("region", { name: "ใบ HQ" });
    await กล่อง.getByLabel("จำนวน 1").fill("100");
    await กล่อง.getByLabel("หน่วย 1", { exact: true }).fill("ตร.ม.");
    await กล่อง.getByLabel("ต้นทุนต่อหน่วย 1").fill("1000");
    await กล่อง.getByRole("button", { name: /บันทึกร่าง/ }).click();
    await expect.poll(async () => (await คำขอของ((await ลีด(ก))!.num_id))[0]?.status, { timeout: 20_000 }).toBe("pricing");
  });
  await ขั้น("H9", "ส่งใบ HQ ให้ดีลเลอร์", h, async () => {
    await h.getByRole("region", { name: "ใบ HQ" }).getByRole("button", { name: "ส่งใบ HQ ให้ดีลเลอร์" }).click();
    await ตกลง(h);
    await expect.poll(async () => (await คำขอของ((await ลีด(ก))!.num_id))[0]?.status, { timeout: 20_000 }).toBe("quoted");
  });

  // ── D4 ได้ใบ HQ · D5x ขอแก้ราคา · H9 ส่งใหม่ ──
  await ขั้น("D4", "ดีลเลอร์เห็นป้ายได้ราคา HQ", d, async () => {
    await d.goto(`${DEALER}/leads`, { waitUntil: "domcontentloaded" }); await เงียบ(d);
    await d.getByRole("button", { name: "ตาราง" }).click().catch(() => {});
    await d.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(ก);
    await expect(d.locator("tbody tr").filter({ hasText: ก }).getByText("ได้ราคา HQ", { exact: true })).toBeVisible({ timeout: 20_000 });
  });
  await ขั้น("D5x", "ขอแก้ราคา", d, async () => {
    await เปิดลีด(d, ก, "ใบเสนอราคา");
    const แผง = d.locator("[data-panel='quote-request']");
    await แผง.getByRole("button", { name: "ขอแก้ราคา" }).click();
    await แผง.getByLabel("เหตุผลที่ขอแก้ราคา").fill("ลูกค้าลดพื้นที่");
    await แผง.getByRole("button", { name: "ส่งขอแก้ราคา" }).click();
    await expect.poll(async () => (await ลีด(ก))?.status, { timeout: 20_000 }).toBe("HQ_PRICING");
  });
  await ขั้น("H9", "HQ ตีราคาคำขอแก้ราคาแล้วส่ง (เวอร์ชัน 2)", h, () => HQตีราคาและส่ง(h, ก, "900"));
  await ขั้น("H9", "HQ ตีราคาและส่งลีด ค", h, () => HQตีราคาและส่ง(h, ค, "1200"));

  // ── D5 ทำใบให้ลูกค้า (% ผิดรูป) · D6 ส่ง (กดซ้ำ) · เปิดสองแท็บ ──
  await ขั้น("D5", "ทำใบให้ลูกค้า ใส่ % ผิดรูป (ติดลบ)", d, async () => {
    await เปิดลีด(d, ก, "ใบเสนอราคา");
    await d.getByRole("button", { name: /ทำใบให้ลูกค้า/ }).click({ timeout: 20_000 });
    await d.locator("[data-editor='hq-markup']").getByLabel("% ที่บวก 1").fill("-10");
    await d.waitForTimeout(800);
  }, { คาดว่าถูกปฏิเสธ: true });
  await ขั้น("D5", "ทำใบให้ลูกค้า บวก 15% → สร้างใบเสนอราคา", d, async () => {
    await d.locator("[data-editor='hq-markup']").getByLabel("% ที่บวก 1").fill("15");
    await d.getByRole("button", { name: "สร้างใบเสนอราคา" }).last().click();
    await expect.poll(async () => (await ใบของ((await ลีด(ก))!.num_id)).length, { timeout: 20_000 }).toBe(1);
  });
  await ขั้น("D6", "ส่งใบให้ลูกค้า (กดสองครั้งติด)", d, async () => {
    await d.goto(`${DEALER}/quotations`, { waitUntil: "domcontentloaded" }); await เงียบ(d);
    await d.getByPlaceholder(/ค้นหา/).first().fill(ก);
    await d.locator("tbody tr").filter({ hasText: ก }).first().getByTitle("ส่งให้ลูกค้า").dblclick();
    await expect.poll(async () => (await ใบของ((await ลีด(ก))!.num_id))[0]?.status, { timeout: 20_000 }).toBe("sent_to_client");
    await expect.poll(async () => (await ลีด(ก))?.status, { timeout: 20_000 }).toBe("QUOTED");
  });
  const แท็บสอง = await ctxD.newPage(); ฟัง(แท็บสอง);
  await ขั้น("D6", "เปิดสองแท็บ: แท็บสองเห็นสถานะส่งแล้ว", แท็บสอง, async () => {
    await แท็บสอง.goto(`${DEALER}/quotations`, { waitUntil: "domcontentloaded" }); await เงียบ(แท็บสอง);
    await แท็บสอง.getByPlaceholder(/ค้นหา/).first().fill(ก);
    await expect(แท็บสอง.locator("tbody tr").filter({ hasText: ก }).first().getByText("ส่งแล้ว", { exact: true })).toBeVisible();
  });

  // ── D7 ติดตาม: ติ๊กงาน + นัดหมาย ──
  await ขั้น("D7", "ติ๊กงานติดตาม + นัดหมาย", d, async () => {
    await เปิดลีด(d, ก);
    const งาน = d.getByRole("button", { name: /^งาน/ }).first();
    if (await งาน.count()) await งาน.click();
    await d.getByRole("button", { name: /นัดหมาย/ }).first().click();
  }, { หมายเหตุ: "สำรวจปุ่มติดตาม/นัดหมาย" });

  // ── ทำฉบับใหม่ V2 → ส่ง · D8 ตอบรับ ──
  await ขั้น("D8", "ทำฉบับใหม่ (ลูกค้าต่อรอง) → บวก 10% → บันทึก → ส่ง V2", d, async () => {
    await d.goto(`${DEALER}/quotations`, { waitUntil: "domcontentloaded" }); await เงียบ(d);
    await d.getByPlaceholder(/ค้นหา/).first().fill(ก);
    await d.locator("tbody tr").filter({ hasText: ก }).first().getByTitle("ทำฉบับใหม่").click();
    await d.getByRole("table", { name: "รายการในใบเสนอราคา (จากใบ HQ)" }).getByLabel("% ที่บวก 1").fill("10");
    await d.getByRole("button", { name: "บันทึก", exact: true }).click();
    await เงียบ(d);
    const v1 = (await ใบของ((await ลีด(ก))!.num_id))[0].id;
    await d.locator("tbody tr").filter({ hasText: `${v1}-V2` }).first().getByTitle("ส่งให้ลูกค้า").click();
    await expect.poll(async () => (await ใบของ((await ลีด(ก))!.num_id)).map(q => q.status).join(","), { timeout: 20_000 }).toBe("superseded,sent_to_client");
  });
  await ขั้น("D8", "ลูกค้าตอบรับ V2", d, async () => {
    const v1 = (await ใบของ((await ลีด(ก))!.num_id))[0].id;
    await d.reload(); await เงียบ(d);
    await d.getByPlaceholder(/ค้นหา/).first().fill(ก);
    await d.locator("tbody tr").filter({ hasText: `${v1}-V2` }).first().locator("td").nth(1).click();
    await d.getByRole("button", { name: /ลูกค้าตอบรับ/ }).first().click();
    await ตกลง(d);
    await expect.poll(async () => (await ลีด(ก))?.status, { timeout: 30_000 }).toBe("PAID");
  });

  // ── D8x ลูกค้าปฏิเสธ (ลีด ค) ──
  await ขั้น("D8x", "ลีด ค: ทำใบ → ส่ง → ลูกค้าปฏิเสธ (ลองยืนยันโดยไม่เลือกเหตุผลก่อน)", d, async () => {
    await เปิดลีด(d, ค, "ใบเสนอราคา");
    await d.getByRole("button", { name: /ทำใบให้ลูกค้า/ }).click({ timeout: 20_000 });
    await d.locator("[data-editor='hq-markup']").getByLabel("% ที่บวก 1").fill("12");
    await d.getByRole("button", { name: "สร้างใบเสนอราคา" }).last().click();
    await d.goto(`${DEALER}/quotations`, { waitUntil: "domcontentloaded" }); await เงียบ(d);
    await d.getByPlaceholder(/ค้นหา/).first().fill(ค);
    await d.locator("tbody tr").filter({ hasText: ค }).first().getByTitle("ส่งให้ลูกค้า").click();
    await expect.poll(async () => (await ใบของ((await ลีด(ค))!.num_id))[0]?.status, { timeout: 20_000 }).toBe("sent_to_client");
    await d.reload(); await เงียบ(d);
    await d.getByPlaceholder(/ค้นหา/).first().fill(ค);
    await d.locator("tbody tr").filter({ hasText: ค }).first().locator("td").nth(1).click();
    await d.getByRole("button", { name: /ลูกค้าปฏิเสธ/ }).first().click();
    const ยืนยัน = d.getByRole("button", { name: /^ยืนยัน/ }).last();
    if (await ยืนยัน.isEnabled().catch(() => false)) { await ยืนยัน.click().catch(() => {}); }
  });
  await ขั้น("D8x", "ลูกค้าปฏิเสธ เลือกเหตุผลแล้วยืนยัน", d, async () => {
    await d.getByRole("button", { name: "ราคาสูงเกินงบประมาณ" }).click();
    await d.getByRole("button", { name: /^ยืนยัน/ }).last().click();
    await expect.poll(async () => (await ลีด(ค))?.status, { timeout: 20_000 }).toBe("CANCELLED");
  });

  // ── H10 ย้อนการตอบรับ ──
  await ขั้น("H10", "HQ ย้อนการตอบรับ (ไม่ใส่เหตุผลก่อน แล้วใส่เหตุผล)", h, async () => {
    await h.goto(`${HQ}/hq/quotations`, { waitUntil: "domcontentloaded" }); await เงียบ(h);
    await h.getByPlaceholder(/ค้นหาเลขที่/).fill(ก);
    await h.locator("tbody tr").filter({ hasText: "ตอบรับ" }).filter({ hasText: ก.slice(0, 12) }).first().click().catch(async () => {
      await h.locator("tbody tr").first().click();
    });
    await h.getByRole("button", { name: /ย้อนเป็นส่งให้ลูกค้าแล้ว/ }).click();
    const ย้อน = h.getByRole("button", { name: "ย้อนการตอบรับ", exact: true });
    await ย้อน.click().catch(() => {});   // ไม่ใส่เหตุผลก่อน — ต้องไม่ผ่าน
    await h.waitForTimeout(800);
    await h.getByPlaceholder("เหตุผลที่ย้อน").fill("ทดลองย้อนการตอบรับ");
    await ย้อน.click();
    await expect.poll(async () => (await ใบของ((await ลีด(ก))!.num_id)).map(q => q.status).join(","), { timeout: 20_000 }).toBe("superseded,sent_to_client");
  });

  // ── H6 โอนลีดของ HQ (ลีดทดสอบรายเดียว) ──
  await ขั้น("H6", "HQ เปิดลูกค้าเป้าหมายทั้งเครือ (สำรวจปุ่มโอน — ไม่กดโอนทั้งหมด)", h, async () => {
    await h.goto(`${HQ}/hq/leads`, { waitUntil: "domcontentloaded" }); await เงียบ(h);
  }, { หมายเหตุ: "ไม่กดโอนอัตโนมัติทั้งหมด (ลีดจริง)" });

  // ── H2–H5 หาดีลเลอร์ใหม่ ──
  await ขั้น("H2", "เพิ่มผู้สนใจโดยไม่กรอกอะไร", h, async () => {
    await h.goto(`${HQ}/hq/prospects`, { waitUntil: "domcontentloaded" }); await เงียบ(h);
    await h.getByRole("button", { name: "เพิ่มลูกค้าเป้าหมาย" }).first().click();
    await h.getByRole("dialog", { name: "ข้อมูลลูกค้าเป้าหมาย" }).getByRole("button", { name: "เพิ่มลูกค้าเป้าหมาย" }).click();
  }, { คาดว่าถูกปฏิเสธ: true });
  const แผงผู้สนใจ = h.getByRole("dialog", { name: "ข้อมูลลูกค้าเป้าหมาย" });
  await ขั้น("H2", "เพิ่มผู้สนใจ + บันทึกการติดต่อ + ติ๊กงาน", h, async () => {
    await แผงผู้สนใจ.locator("#pr-name").fill(ผู้สนใจ);
    await แผงผู้สนใจ.locator("#pr-phone").fill(เบอร์(7));
    await แผงผู้สนใจ.locator("#pr-region").selectOption("ตะวันออก");
    await แผงผู้สนใจ.locator("#pr-province").selectOption("ตราด");
    await แผงผู้สนใจ.locator("#pr-channel").selectOption({ index: 1 });
    await แผงผู้สนใจ.locator("#pr-assigned").selectOption({ index: 1 }).catch(() => {});
    await แผงผู้สนใจ.getByRole("button", { name: "เพิ่มลูกค้าเป้าหมาย" }).click();
    await expect(แผงผู้สนใจ.getByRole("tab", { name: "งาน/ความคืบหน้า" })).toHaveAttribute("aria-selected", "true", { timeout: 15_000 });
    await แผงผู้สนใจ.getByRole("checkbox", { name: "ติดต่อครั้งแรก" }).click();
    await แผงผู้สนใจ.locator("#pc-body").fill("ทดลอง — สนใจเป็นดีลเลอร์");
  });
  await ขั้น("H2", "กดบันทึกการติดต่อโดยไม่เลือกช่องทาง", h, async () => {
    await แผงผู้สนใจ.getByRole("button", { name: "บันทึกการติดต่อ" }).last().click();
    await h.waitForTimeout(1200);
  }, { คาดว่าถูกปฏิเสธ: true, หมายเหตุ: "ดูว่ามีข้อความบอกให้เลือกช่องทางไหม" });
  const สถานะผู้สนใจ = async () => (await svc.from("dealer_prospects").select("status").eq("name", ผู้สนใจ).maybeSingle()).data?.status;
  await ขั้น("H2", "เลือกช่องทาง → บันทึกการติดต่อ → ติ๊กส่งข้อมูลบริษัท → นัดคุย (สถานะเลื่อนตามขั้น)", h, async () => {
    await แผงผู้สนใจ.locator("#pc-channel").selectOption("โทรศัพท์");
    await แผงผู้สนใจ.getByRole("button", { name: "บันทึกการติดต่อ" }).last().click();
    await expect.poll(สถานะผู้สนใจ, { timeout: 20_000 }).toBe("contacted");
    await แผงผู้สนใจ.getByRole("tab", { name: "งาน/ความคืบหน้า" }).click();
    await แผงผู้สนใจ.getByRole("checkbox", { name: "ส่งข้อมูลบริษัท" }).click();
    await expect.poll(สถานะผู้สนใจ, { timeout: 20_000 }).toBe("profile_sent");
    await แผงผู้สนใจ.getByRole("checkbox", { name: "นัดคุยรายละเอียด" }).click();
    await expect.poll(สถานะผู้สนใจ, { timeout: 20_000 }).toBe("meeting");
  });
  let เลขใบ = "";
  await ขั้น("H3", "ออกใบค่าแฟรนไชส์ (ค่าแรกเข้าผิดรูปก่อน) → บันทึก → ส่ง", h, async () => {
    await แผงผู้สนใจ.getByRole("tab", { name: /ใบค่าแฟรนไชส์/ }).click();
    await แผงผู้สนใจ.getByRole("button", { name: "ออกใบค่าแฟรนไชส์" }).click();
    const ฟอร์ม = แผงผู้สนใจ.getByRole("region", { name: "ใบค่าแฟรนไชส์" });
    await ฟอร์ม.locator("#pp-amount").fill("abc").catch(() => {});
    await ฟอร์ม.locator("#pp-package").selectOption({ index: 1 });
    await ฟอร์ม.locator("#pp-amount").fill("100000");
    await ฟอร์ม.locator("#pp-months").fill("12");
    await ฟอร์ม.locator("#pp-target").fill("5000000");
    await ฟอร์ม.getByRole("button", { name: "บันทึกใบ" }).click();
    const pr = (await svc.from("dealer_prospects").select("id").eq("name", ผู้สนใจ).single()).data!;
    await expect.poll(async () => (await svc.from("dealer_package_proposals").select("proposal_no").eq("prospect_id", pr.id)).data?.length ?? 0, { timeout: 20_000 }).toBe(1);
    เลขใบ = (await svc.from("dealer_package_proposals").select("proposal_no").eq("prospect_id", pr.id).single()).data!.proposal_no;
    await แผงผู้สนใจ.getByLabel(`สถานะใบ ${เลขใบ}`).selectOption("sent");
    await ตกลง(h).catch(() => {});
    await expect.poll(สถานะผู้สนใจ, { timeout: 20_000 }).toBe("considering");
  });
  await ขั้น("H4", "ตอบรับ + บันทึกการชำระ (ยอดผิดรูปก่อน)", h, async () => {
    await แผงผู้สนใจ.getByLabel(`สถานะใบ ${เลขใบ}`).selectOption("accepted");
    await ตกลง(h).catch(() => {});
    const ชำระ = แผงผู้สนใจ.getByRole("region", { name: `การชำระ ${เลขใบ}` });
    await ชำระ.getByLabel("ยอดชำระ").fill("-100");
    await ชำระ.getByRole("button", { name: "บันทึกการชำระ" }).click().catch(() => {});
    await ชำระ.getByLabel("ยอดชำระ").fill("100000");
    await ชำระ.getByLabel("เลขอ้างอิง").fill("TR-TRIAL-1");
    await ชำระ.getByRole("button", { name: "บันทึกการชำระ" }).click();
    await expect(ชำระ.getByTestId(`ยอดชำระ-${เลขใบ}`)).toContainText("ครบแล้ว", { timeout: 20_000 });
  });
  await ขั้น("H5", `ตั้งเป็นดีลเลอร์ (รหัส ${สาขาใหม่} · ตราด)`, h, async () => {
    await แผงผู้สนใจ.getByRole("button", { name: "ตั้งเป็นดีลเลอร์" }).first().click();
    const ตั้ง = h.getByRole("dialog", { name: "ตั้งเป็นดีลเลอร์" });
    await ตั้ง.locator("#cv-code").fill(สาขาใหม่);
    const ตราด = ตั้ง.getByRole("group", { name: /จังหวัดที่ดูแล/ }).getByLabel("ดูแลจังหวัด ตราด");
    if (!(await ตราด.isChecked())) await ตราด.check();
    await ตั้ง.getByRole("button", { name: "สร้างดีลเลอร์" }).click();
    await expect(h.getByText("สร้างดีลเลอร์สำเร็จ")).toBeVisible({ timeout: 30_000 });
  });
  await ขั้น("H5", "ปิดหน้าต่างสร้างสำเร็จ", h, async () => { await h.getByRole("button", { name: "เสร็จแล้ว" }).click(); });

  // ── H11 ดูแลดีลเลอร์: เข้าระบบแทน · ดูรหัสผ่าน · ปิด/เปิดใช้งาน (สาขาทดสอบเท่านั้น) ──
  await ขั้น("H11", "หน้าดีลเลอร์ ค้นหาสาขาทดสอบ", h, async () => {
    await h.goto(`${HQ}/hq/dealers`, { waitUntil: "domcontentloaded" }); await เงียบ(h);
    await h.getByPlaceholder(/ค้นหา/).first().fill(สาขาใหม่);
  });
  await ขั้น("H11", `เข้าระบบแทนดีลเลอร์ ${สาขาใหม่}`, h, async () => {
    const [แท็บใหม่] = await Promise.all([
      h.context().waitForEvent("page", { timeout: 15_000 }).catch(() => null),
      h.getByRole("button", { name: /เข้าระบบ/ }).first().click(),
    ]);
    const ปลายทาง = แท็บใหม่ ?? h;
    ฟัง(ปลายทาง);
    await ปลายทาง.waitForLoadState("domcontentloaded");
    await เงียบ(ปลายทาง);
    await ปลายทาง.screenshot({ path: path.join(โฟลเดอร์, `${String(ลำดับ + 1).padStart(3, "0")}-H11-หน้าที่เข้าระบบแทน-จอกว้าง.png`), fullPage: true });
    if (แท็บใหม่) await แท็บใหม่.close();
  });
  await ขั้น("H11", `รายละเอียดดีลเลอร์ ${สาขาใหม่} (ดูรหัสผ่าน · ปิดใช้งาน)`, h, async () => {
    await h.goto(`${HQ}/hq/dealers/${สาขาใหม่}`, { waitUntil: "domcontentloaded" }); await เงียบ(h);
    const ดู = h.getByRole("button", { name: /ดูรหัสผ่าน/ }).first();
    if (await ดู.count()) await ดู.click();
  });

  // ── H12 ภาพรวม ──
  for (const [p, n] of [["/hq/dashboard", "แดชบอร์ดสำนักงานใหญ่"], ["/hq/pipeline", "ภาพรวมยอดขาย"], ["/hq/quotations", "ใบเสนอราคาทั้งเครือ"], ["/hq/customers", "ลูกค้าทั้งเครือ"], ["/hq/audit", "บันทึกการใช้งาน"], ["/hq/proposals", "ใบค่าแฟรนไชส์"]] as const) {
    await ขั้น("H12", n, h, async () => { await h.goto(`${HQ}${p}`, { waitUntil: "domcontentloaded" }); await เงียบ(h); });
  }
  // ── ดีลเลอร์: หน้าที่เหลือ + D9 บัญชี ──
  for (const [p, n] of [["/dashboard", "แดชบอร์ด"], ["/customers", "ลูกค้า"], ["/calendar", "ปฏิทิน"], ["/files", "ไฟล์"], ["/settings", "ตั้งค่า"]] as const) {
    await ขั้น("D", n, d, async () => { await d.goto(`${DEALER}${p}`, { waitUntil: "domcontentloaded" }); await เงียบ(d); });
  }
  await ขั้น("D9", "บัญชี: เปลี่ยนรหัสผ่านใส่รหัสใหม่ไม่ตรงกัน (ไม่ส่งโค้ดอีเมลจริง)", d, async () => {
    await d.goto(`${DEALER}/settings/account`, { waitUntil: "domcontentloaded" }); await เงียบ(d);
    const ช่อง = d.locator("input[type='password']");
    const n = await ช่อง.count();
    if (n >= 2) { await ช่อง.nth(n - 2).fill("Abcdef123!"); await ช่อง.nth(n - 1).fill("Abcdef999!"); }
    const ปุ่ม = d.getByRole("button", { name: /เปลี่ยนรหัสผ่าน|บันทึกรหัสผ่าน/ }).first();
    if (await ปุ่ม.count() && await ปุ่ม.isEnabled()) await ปุ่ม.click();
  }, { คาดว่าถูกปฏิเสธ: true });

  await ctxD.close(); await ctxH.close();
});

test("ทดลอง · จอมือถือ (390×844)", async ({ browser }) => {
  const opts = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
  const ctxD = await browser.newContext(opts), ctxH = await browser.newContext(opts);
  const d = await ctxD.newPage(), h = await ctxH.newPage();
  ฟัง(d); ฟัง(h);
  const มือถือ = ชื่อ("มือถือ");
  await ขั้น("D1", "ดีลเลอร์เข้าระบบ", d, () => เข้าระบบ(d, DEALER, "/login", ดีลเลอร์));
  await ขั้น("D2", "เพิ่มลูกค้าเป้าหมายบนมือถือ", d, async () => {
    await เพิ่มลีด(d, มือถือ, `000-${String(Number(แท็ก) % 1000).padStart(3, "0")}-0008`);
    await expect.poll(async () => (await ลีด(มือถือ))?.num_id ?? 0, { timeout: 20_000 }).toBeGreaterThan(0);
  });
  await ขั้น("D3", "เปิดแผงลีด แท็บใบเสนอราคา บนมือถือ", d, () => เปิดลีด(d, มือถือ, "ใบเสนอราคา"));
  await ขั้น("D3", "ขอราคาจาก HQ บนมือถือ", d, () => ขอราคา(d, มือถือ));
  for (const [p, n] of [["/dashboard", "แดชบอร์ด"], ["/leads", "ลูกค้าเป้าหมาย"], ["/quotations", "ใบเสนอราคา"], ["/customers", "ลูกค้า"], ["/calendar", "ปฏิทิน"], ["/settings", "ตั้งค่า"], ["/settings/account", "บัญชี"]] as const) {
    await ขั้น("D", n, d, async () => { await d.goto(`${DEALER}${p}`, { waitUntil: "domcontentloaded" }); await เงียบ(d); });
  }
  await ขั้น("D", "เปิดเมนูบนมือถือ", d, async () => { await d.getByRole("button", { name: /เมนู/ }).first().click(); });
  await ขั้น("H1", "HQ เข้าระบบ", h, () => เข้าระบบ(h, HQ, "/hq/login", ผู้ดูแล));
  await ขั้น("H7", "กล่องคำขอบนมือถือ เปิดคำขอ", h, async () => {
    await h.goto(`${HQ}/hq/quote-requests`, { waitUntil: "domcontentloaded" }); await เงียบ(h);
    await h.getByLabel("ค้นหาคำขอ").fill(มือถือ);
    await h.getByRole("list", { name: "รายการคำขอ" }).getByRole("button", { name: มือถือ }).first().click();
  });
  await ขั้น("H9", "ตีราคาและส่งใบ HQ บนมือถือ", h, () => HQตีราคาและส่ง(h, มือถือ));
  await ขั้น("D5", "ทำใบให้ลูกค้าบนมือถือ", d, async () => {
    await เปิดลีด(d, มือถือ, "ใบเสนอราคา");
    await d.getByRole("button", { name: /ทำใบให้ลูกค้า/ }).click({ timeout: 20_000 });
    await d.locator("[data-editor='hq-markup']").getByLabel("% ที่บวก 1").fill("10");
    await d.getByRole("button", { name: "สร้างใบเสนอราคา" }).last().click();
    await expect.poll(async () => (await ใบของ((await ลีด(มือถือ))!.num_id)).length, { timeout: 20_000 }).toBe(1);
  });
  for (const [p, n] of [["/hq/dashboard", "แดชบอร์ดสำนักงานใหญ่"], ["/hq/prospects", "ผู้สนใจเป็นดีลเลอร์"], ["/hq/proposals", "ใบค่าแฟรนไชส์"], ["/hq/dealers", "ดีลเลอร์"], ["/hq/pipeline", "ภาพรวมยอดขาย"], ["/hq/leads", "ลูกค้าเป้าหมายทั้งเครือ"], ["/hq/quotations", "ใบเสนอราคาทั้งเครือ"], ["/hq/settings", "ตั้งค่า"]] as const) {
    await ขั้น("H12", n, h, async () => { await h.goto(`${HQ}${p}`, { waitUntil: "domcontentloaded" }); await เงียบ(h); });
  }
  await ctxD.close(); await ctxH.close();
  const ตก = บันทึก.filter(x => !x.ผ่าน && !x.คาดว่าถูกปฏิเสธ).length;
  console.log(`\nสรุป: ${บันทึก.length} ขั้น · ตกไม่คาด ${ตก} · มี error บนหน้า ${บันทึก.filter(x => x.error.length).length} ขั้น · ผลอยู่ที่ ${path.join(โฟลเดอร์, "ผลทดลอง.json")}`);
});
void (null as unknown as Browser);
