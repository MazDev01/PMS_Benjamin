// ── ไฟล์แนบ 2 ทาง ดีลเลอร์ ↔ HQ ในคำขอราคา (บอสสั่ง 2 พ.ย. 69 · ใบ 0273) ─────────────────────────────────────────────────
//   [D3] ดีลเลอร์แนบตอนส่งคำขอ + แนบเพิ่ม/ลบในแผงลีดได้ก่อน HQ ส่งใบ
//   [H8/H9] HQ เห็นไฟล์ดีลเลอร์ + ป้ายจำนวนไฟล์ในรายการคำขอ · แนบไฟล์ที่ใบ HQ ร่าง (ดีลเลอร์ยังไม่เห็น) · ส่งใบแล้วล็อก
//           กระดิ่งตอนส่งใบบอกจำนวนไฟล์ · ดีลเลอร์เห็น + ดาวน์โหลดไฟล์ HQ ได้ (ลิงก์มีอายุ)
//   [db] ดีลเลอร์ A อ่าน/แนบ/ลบ ของ B ไม่ได้ (ไฟล์ดีลเลอร์ + ไฟล์ HQ) · ชนิดผิด/เกินขนาด (แจ้ง + ขนาดจริง)/เกินจำนวน ถูกปฏิเสธที่เซิร์ฟเวอร์
//        ส่งใบแล้วแนบ/ลบไม่ได้ทั้ง 2 ฝั่ง · ฉบับใหม่ (ขอแก้ราคา) แนบใหม่ได้ ไฟล์ฉบับเก่ายังอยู่
//   ตกบนโค้ดเดิม: ไม่มีกล่องไฟล์แนบ / เส้นทาง /api/v1/quote-files / ถัง quote-files · ฐาน: supabase/tests/quote_request_files.sql
// ข้อมูล: สาขาของข้อ 2 สาขา (A ทำงานจริง · B = สาขาอื่น) — ล้างไฟล์ในถังด้วยตัวเก็บกวาดสาขา (testDealers.ts)
import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { ADMIN, skipReason } from "./supabaseEnv";
import { DEALER_ORIGIN, HQ_ORIGIN, db, loginUI, watchErrors, assertNoErrors } from "./funcHelpers";
import { settle } from "./helpers";
import { สร้างสาขาของข้อ, type สาขาของข้อ } from "./ownDealer";
import { ข้อมูลงานครบชุด, ล้างใบHQทดสอบ } from "./hqQuoteFixture";

test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.describe.configure({ mode: process.env.PMS_GATE_ALL === "1" ? "default" : "serial" });
test.setTimeout(240_000);

let A: สาขาของข้อ, B: สาขาของข้อ;
const เลขลีด = 1_950_000_000 + Math.floor(Math.random() * 400_000) * 10;
const บริษัท = () => `ZZTEST ไฟล์แนบ ${A.รหัส}`;
const ไฟล์ = (name: string, size = 2048, mimeType = "application/pdf") => ({ name, mimeType, buffer: Buffer.alloc(size, 65) });
const คำขอ: { id: number; hqPath?: string; dealerPath?: string; ใหม่?: number } = { id: 0 };

/** POST/DELETE เส้นทาง /api/v1/quote-files ในนามผู้ใช้ที่ล็อกอินในหน้านี้ (คุกกี้เดียวกับหน้าเว็บ) */
async function api(req: APIRequestContext, origin: string, method: "POST" | "DELETE" | "GET", q: string, body?: unknown) {
  const r = await req.fetch(`${origin}/api/v1/quote-files${q}`, { method, data: body === undefined ? undefined : JSON.stringify(body), headers: { "content-type": "application/json" } });
  return { status: r.status(), text: await r.text() };
}

async function เปิดแผงลีด(page: Page) {
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: "ตาราง" }).click().catch(() => {});
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(บริษัท());
  const row = page.locator("tbody tr").filter({ hasText: บริษัท() }).first();
  await expect(row).toBeVisible({ timeout: 25_000 });
  await row.getByRole("button", { name: "ดูรายละเอียด" }).first().click();
  await page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click();
  return page.locator("[data-panel='quote-request']");
}

test.beforeAll(async () => {
  A = await สร้างสาขาของข้อ({ จังหวัด: "ตราด", ภาค: "ตะวันออก" });
  B = await สร้างสาขาของข้อ({ จังหวัด: "ตราด", ภาค: "ตะวันออก" });
  const r = await (await db(A.บัญชี)).from("leads").insert({ id: `#L-${เลขลีด}`, num_id: เลขลีด, dealer_code: A.รหัส, company: บริษัท(), name: บริษัท(),
    contact: "ผู้ทดสอบ", phone: `000-000-${String(เลขลีด).slice(-4)}`, province: "ตราด", status: "BULLET", ...ข้อมูลงานครบชุด });
  expect(r.error, "สร้างลีดของข้อ").toBeNull();
  // สาขา B มีคำขอของตัวเอง (ใช้ทดสอบข้ามสาขา)
  const rb = await (await db(B.บัญชี)).from("leads").insert({ id: `#L-${เลขลีด + 1}`, num_id: เลขลีด + 1, dealer_code: B.รหัส, company: `ZZTEST ไฟล์แนบ ${B.รหัส}`,
    name: "ZZTEST", contact: "ผู้ทดสอบ", phone: `000-000-${String(เลขลีด + 1).slice(-4)}`, province: "ตราด", status: "BULLET", ...ข้อมูลงานครบชุด });
  expect(rb.error, "สร้างลีดของสาขา B").toBeNull();
});
// ใบ HQ ที่ส่งแล้วลบด้วยกุญแจไม่ได้ (ตั้งใจ) → ล้างที่ฐานทดสอบตรง (รวมไฟล์ในถัง) ก่อนลบสาขา
test.afterAll(async () => { if (A) ล้างใบHQทดสอบ(A.รหัส, [เลขลีด]); await A?.ลบ(); await B?.ลบ(); });

test("[D3] [flow·dealer] แนบไฟล์ตอนส่งคำขอ + แนบเพิ่ม/ลบในแผงลีด ก่อน HQ ส่งใบ", async ({ page }) => {
  const errs = watchErrors(page);
  await loginUI(page, DEALER_ORIGIN, "/login", A.บัญชี);
  const แผง = await เปิดแผงลีด(page);
  await page.getByRole("status", { name: "ขั้นต่อไป" }).getByRole("button", { name: /ขอราคาจาก HQ/ }).click();
  await แผง.locator("#qr-files").setInputFiles([ไฟล์("แบบบ้าน ชั้น 1.pdf", 4096), ไฟล์("ไวรัส.exe", 10, "application/octet-stream")]);
  await expect(แผง.getByRole("alert"), "หน้าเว็บบอกชนิดที่ไม่รับก่อนส่ง").toContainText("ไวรัส.exe");
  await expect(แผง.locator("[data-pending-file]"), "เหลือไฟล์ที่รับได้ 1 ไฟล์").toHaveCount(1);
  await แผง.getByRole("button", { name: "ส่งคำขอ" }).click();
  const กล่อง = แผง.locator("[data-panel='quote-files']");
  const ของดีลเลอร์ = กล่อง.locator("[data-files-side='dealer'] [data-file-row]");
  await expect(ของดีลเลอร์, "ไฟล์ตามคำขอไปแล้ว").toHaveCount(1, { timeout: 30_000 });
  await expect(ของดีลเลอร์.first()).toHaveAttribute("data-file-name", "แบบบ้าน ชั้น 1.pdf");
  await expect(ของดีลเลอร์.first(), "ขนาดจริงจากถัง").toContainText("4.0 KB");
  คำขอ.id = Number((await (await db(A.บัญชี)).from("quote_requests").select("id").eq("dealer_code", A.รหัส).eq("lead_num_id", เลขลีด).single()).data!.id);

  // แนบเพิ่ม 2 ไฟล์ในกล่อง แล้วลบ 1
  await กล่อง.getByLabel("เลือกไฟล์แนบ").setInputFiles([ไฟล์("ราคาเดิม.xlsx", 1500, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"), ไฟล์("ผัง.dwg", 3000, "application/octet-stream")]);
  await expect(ของดีลเลอร์, "แนบเพิ่มได้ก่อน HQ ส่งใบ").toHaveCount(3, { timeout: 30_000 });
  await กล่อง.getByRole("button", { name: "ลบ ราคาเดิม.xlsx" }).click();
  await page.getByRole("button", { name: "ลบไฟล์" }).click();
  await expect(ของดีลเลอร์, "ลบได้ก่อน HQ ส่งใบ").toHaveCount(2, { timeout: 20_000 });
  const ใน = (await (await db(A.บัญชี)).rpc("quote_files_list", { p_request_id: คำขอ.id })).data as { name: string; path: string }[];
  expect(ใน.map(f => f.name).sort(), "ฐานเหลือ 2 ไฟล์").toEqual(["ผัง.dwg", "แบบบ้าน ชั้น 1.pdf"]);
  คำขอ.dealerPath = ใน.find(f => f.name === "ผัง.dwg")!.path;
  assertNoErrors(errs, "ดีลเลอร์แนบไฟล์");
});

test("[H8] [flow·hq] HQ เห็นไฟล์ดีลเลอร์ + ป้ายจำนวน · แนบไฟล์ที่ใบ HQ ร่าง (ดีลเลอร์ยังไม่เห็น)", async ({ page }) => {
  const errs = watchErrors(page);
  const hq = await db(ADMIN);
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await page.goto(`${HQ_ORIGIN}/hq/quote-requests`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByLabel("ค้นหาคำขอ").fill(บริษัท());
  const แถว = page.getByRole("list", { name: "รายการคำขอ" }).locator("li").filter({ hasText: บริษัท() });
  await expect(แถว.getByTestId("row-files"), "ป้ายจำนวนไฟล์ในรายการคำขอ").toHaveAttribute("data-dealer-files", "2", { timeout: 30_000 });
  await expect(แถว.getByTestId("row-files")).toHaveAttribute("data-hq-files", "0");
  await แถว.getByRole("button").first().click();
  const ใบ = page.getByRole("region", { name: "ใบ HQ" });
  const กล่อง = ใบ.locator("[data-panel='quote-files']");
  await expect(กล่อง.locator("[data-files-side='dealer'] [data-file-row]"), "HQ เห็นไฟล์จากดีลเลอร์").toHaveCount(2, { timeout: 30_000 });
  await expect(กล่อง.locator("[data-files-side='dealer'] [data-file-row] button[aria-label^='ลบ']"), "HQ ลบไฟล์ของดีลเลอร์ไม่ได้").toHaveCount(0);
  await expect(กล่อง.getByTestId("files-locked"), "ยังไม่มีร่าง = ต้องบันทึกร่างก่อน").toHaveText("บันทึกร่างใบ HQ ก่อนแนบไฟล์");

  // ร่างใบ HQ (ทางเดียวกับปุ่มบันทึกร่าง) แล้วเปิดใหม่
  const valid = new Date(Date.now() + 7 * 3_600_000 + 30 * 86_400_000).toISOString().slice(0, 10);
  expect((await hq.rpc("hq_quote_save", { p_request_id: คำขอ.id, p_lines: [{ name: "โครงเหล็ก", qty: 1, unit: "ชุด", unitCost: 100000 }], p_valid_until: valid, p_note: "" })).error).toBeNull();
  await page.reload({ waitUntil: "domcontentloaded" }); await settle(page);
  await page.getByLabel("ค้นหาคำขอ").fill(บริษัท());
  await แถว.getByRole("button").first().click();
  await ใบ.locator("[data-panel='quote-files']").getByLabel("เลือกไฟล์แนบ").setInputFiles([ไฟล์("แบบที่ HQ แก้.pdf", 6000)]);
  await expect(ใบ.locator("[data-files-side='hq'] [data-file-row]"), "HQ แนบไฟล์ของใบร่างได้").toHaveCount(1, { timeout: 30_000 });
  await expect(แถว.getByTestId("row-files"), "ป้ายจำนวนไฟล์ HQ ขยับตาม").toHaveAttribute("data-hq-files", "1", { timeout: 20_000 });
  const ทั้งหมด = (await hq.rpc("quote_files_list", { p_request_id: คำขอ.id })).data as { side: string; path: string }[];
  คำขอ.hqPath = ทั้งหมด.find(f => f.side === "hq")!.path;

  const ของดีลเลอร์ = (await (await db(A.บัญชี)).rpc("quote_files_list", { p_request_id: คำขอ.id })).data as { side: string }[];
  expect(ของดีลเลอร์.filter(f => f.side === "hq"), "ดีลเลอร์ยังไม่เห็นไฟล์ของใบ HQ ร่าง").toHaveLength(0);
  const ลิงก์ = await (await db(A.บัญชี)).storage.from("quote-files").createSignedUrl(คำขอ.hqPath, 60);
  expect(ลิงก์.data?.signedUrl ?? null, "ดีลเลอร์ขอลิงก์ไฟล์ HQ ร่างตรง ๆ ไม่ได้").toBeNull();
  assertNoErrors(errs, "HQ แนบไฟล์ร่าง");
});

test("[H9] [flow·dealer] ส่งใบ HQ แล้ว: กระดิ่งบอกจำนวนไฟล์ · ดีลเลอร์เห็น + ดาวน์โหลดไฟล์ HQ · ไฟล์ล็อกทั้ง 2 ฝั่ง", async ({ page }) => {
  const errs = watchErrors(page);
  const hq = await db(ADMIN);
  expect((await hq.rpc("hq_quote_send", { p_request_id: คำขอ.id })).error, "HQ ส่งใบ").toBeNull();
  const แจ้ง = (await (await db(A.บัญชี)).from("notifications").select("body").eq("dedupe_key", `hq_quote_sent:${คำขอ.id}`).single()).data;
  expect(แจ้ง?.body ?? "", "กระดิ่งตอนส่งใบ HQ บอกจำนวนไฟล์แนบ").toContain("ไฟล์แนบจาก HQ 1 ไฟล์");

  await loginUI(page, DEALER_ORIGIN, "/login", A.บัญชี);
  const แผง = await เปิดแผงลีด(page);
  const กล่อง = แผง.locator("[data-panel='quote-files']");
  const ของHQ = กล่อง.locator("[data-files-side='hq'] [data-file-row]");
  await expect(ของHQ, "ดีลเลอร์เห็นไฟล์ HQ หลังส่งใบ").toHaveCount(1, { timeout: 30_000 });
  await expect(ของHQ.first()).toContainText(/ใบ HQ .+ เวอร์ชัน 1/);
  await expect(กล่อง.getByTestId("files-locked"), "ไฟล์ของดีลเลอร์ล็อกแล้ว").toBeVisible();
  await expect(กล่อง.locator("button[aria-label^='ลบ']"), "ไม่มีปุ่มลบหลังส่งใบ").toHaveCount(0);
  // ดาวน์โหลดผ่านลิงก์มีอายุ — ได้ไฟล์เดิมครบไบต์
  const ลิงก์ = await api(page.request, DEALER_ORIGIN, "GET", `?view=url&path=${encodeURIComponent(คำขอ.hqPath!)}`);
  expect(ลิงก์.status, "ขอลิงก์ดาวน์โหลดไฟล์ HQ ได้").toBe(200);
  const url = JSON.parse(ลิงก์.text) as string;
  const ไฟล์จริง = await page.request.get(url);
  expect(ไฟล์จริง.status()).toBe(200);
  expect((await ไฟล์จริง.body()).length, "ได้ไฟล์ครบไบต์").toBe(6000);

  // ล็อก: ดีลเลอร์แนบ/ลบไม่ได้ · HQ แนบ/ลบไม่ได้ (ฐาน/ถังกัน — ยิงตรงที่เซิร์ฟเวอร์)
  const แนบ = await api(page.request, DEALER_ORIGIN, "POST", "", { op: "reserve", requestId: คำขอ.id, side: "dealer", name: "หลังส่ง.pdf", size: 10 });
  expect(แนบ.text, "ดีลเลอร์แนบหลังส่งใบ = ฐานปฏิเสธ").toContain("file_locked");
  const ลบ = await api(page.request, DEALER_ORIGIN, "DELETE", `?path=${encodeURIComponent(คำขอ.dealerPath!)}`);
  expect(ลบ.status, "ดีลเลอร์ลบไฟล์ของตัวเองหลังส่งใบ = ถังปฏิเสธ").toBe(409);
  const hqลบ = await hq.storage.from("quote-files").remove([คำขอ.hqPath!]);
  expect(hqลบ.data ?? [], "HQ ลบไฟล์ของใบที่ส่งแล้ว = ถังปฏิเสธ").toHaveLength(0);
  const hqแนบ = await hq.rpc("quote_file_reserve", { p_request_id: คำขอ.id, p_side: "hq", p_name: "หลังส่ง.pdf", p_size: 10 });
  expect(hqแนบ.error?.message ?? "", "HQ แนบหลังส่งใบ = ฐานปฏิเสธ").toContain("file_locked");
  assertNoErrors(errs, "ดีลเลอร์ดูไฟล์ HQ");
});

test("[db] ข้ามสาขา: B อ่าน/แนบ/ลบ ไฟล์ของ A ไม่ได้ ทั้งไฟล์ดีลเลอร์และไฟล์ HQ (ฐาน + เส้นทาง API)", async ({ page }) => {
  const sbB = await db(B.บัญชี);
  const รายการ = await sbB.rpc("quote_files_list", { p_request_id: คำขอ.id });
  expect(รายการ.error?.message ?? "", "B ดูรายการไฟล์ของคำขอ A ไม่ได้").toContain("forbidden");
  for (const [ชื่อ, path] of [["ไฟล์ดีลเลอร์", คำขอ.dealerPath!], ["ไฟล์ HQ", คำขอ.hqPath!]] as const) {
    const ลิงก์ = await sbB.storage.from("quote-files").createSignedUrl(path, 60);
    expect(ลิงก์.data?.signedUrl ?? null, `B ขอลิงก์${ชื่อ}ของ A ไม่ได้`).toBeNull();
    const ดาวน์โหลด = await sbB.storage.from("quote-files").download(path);
    expect(ดาวน์โหลด.data, `B ดาวน์โหลด${ชื่อ}ของ A ไม่ได้`).toBeNull();
    const ลบ = await sbB.storage.from("quote-files").remove([path]);
    expect(ลบ.data ?? [], `B ลบ${ชื่อ}ของ A ไม่ได้`).toHaveLength(0);
  }
  const จอง = await sbB.rpc("quote_file_reserve", { p_request_id: คำขอ.id, p_side: "dealer", p_name: "แอบ.pdf", p_size: 10 });
  expect(จอง.error?.message ?? "", "B แนบไฟล์ในคำขอของ A ไม่ได้").toContain("forbidden");
  // ทางเว็บจริง (เส้นทาง API ในนาม B)
  await loginUI(page, DEALER_ORIGIN, "/login", B.บัญชี);
  const ลิงก์ = await api(page.request, DEALER_ORIGIN, "GET", `?view=url&path=${encodeURIComponent(คำขอ.hqPath!)}`);
  expect(ลิงก์.status, "B ขอลิงก์ไฟล์ HQ ของ A ทาง API ไม่ได้").not.toBe(200);
  const รายการAPI = await api(page.request, DEALER_ORIGIN, "GET", `?request=${คำขอ.id}`);
  expect(รายการAPI.status, "B ดูรายการไฟล์ของ A ทาง API ไม่ได้").not.toBe(200);
  // ไฟล์ยังอยู่ครบ
  expect(((await (await db(ADMIN)).rpc("quote_files_list", { p_request_id: คำขอ.id })).data as unknown[]).length, "ไฟล์ของ A ยังอยู่ครบ 3").toBe(3);
});

test("[db] ชนิดผิด / เกิน 20 MB / เกิน 10 ไฟล์ ถูกปฏิเสธที่เซิร์ฟเวอร์ · ฉบับใหม่แนบได้ ไฟล์ฉบับเก่ายังอยู่", async ({ page }) => {
  const sbA = await db(A.บัญชี), hq = await db(ADMIN);
  // ขอแก้ราคา → คำขอใหม่ (ยังอยู่กับ HQ = ฝั่งดีลเลอร์แนบได้)
  const ใหม่ = await sbA.rpc("quote_request_reprice", { p_id: คำขอ.id, p_reason: "ZZTEST ลูกค้าขอปรับ" });
  expect(ใหม่.error).toBeNull();
  คำขอ.ใหม่ = Number((ใหม่.data as { id: number }).id);

  await loginUI(page, DEALER_ORIGIN, "/login", A.บัญชี);
  const ชนิด = await api(page.request, DEALER_ORIGIN, "POST", "", { op: "reserve", requestId: คำขอ.ใหม่, side: "dealer", name: "หน้าเว็บ.html", size: 10 });
  expect(ชนิด.text, "ชนิด .html = เซิร์ฟเวอร์ปฏิเสธ").toContain("file_type");
  const ใหญ่ = await api(page.request, DEALER_ORIGIN, "POST", "", { op: "reserve", requestId: คำขอ.ใหม่, side: "dealer", name: "ใหญ่.pdf", size: 20 * 1024 * 1024 + 1 });
  expect(ใหญ่.text, "แจ้งขนาดเกิน 20 MB = เซิร์ฟเวอร์ปฏิเสธ").toContain("file_size");
  // แจ้งขนาดเล็กแต่ไฟล์จริงเกิน 20 MB → ถังปฏิเสธตอนอัปโหลด (ไม่เชื่อค่าที่หน้าเว็บส่ง)
  const จอง = await api(page.request, DEALER_ORIGIN, "POST", "", { op: "reserve", requestId: คำขอ.ใหม่, side: "dealer", name: "หลอกขนาด.pdf", size: 1000 });
  expect(จอง.status, "จองที่ได้").toBe(200);
  const { path, token } = JSON.parse(จอง.text) as { path: string; token: string };
  const อัป = await sbA.storage.from("quote-files").uploadToSignedUrl(path, token, Buffer.alloc(20 * 1024 * 1024 + 1024, 66), { contentType: "application/pdf" });
  expect(อัป.error?.message ?? "", "ไฟล์จริงเกิน 20 MB = ถังปฏิเสธ").toMatch(/exceeded the maximum allowed size|too large|413/i);
  expect(((await sbA.rpc("quote_files_list", { p_request_id: คำขอ.ใหม่ })).data as { name: string }[]).some(f => f.name === "หลอกขนาด.pdf"), "ไฟล์เกินขนาดไม่ขึ้นในรายการ").toBe(false);
  // อัปโหลดตรงเข้าถังโดยไม่จอง = ถังปฏิเสธ
  const แอบ = await sbA.storage.from("quote-files").upload(`${A.รหัส}/${คำขอ.ใหม่}/d/แอบไม่จอง.pdf`, Buffer.alloc(10, 1), { contentType: "application/pdf" });
  expect(แอบ.error, "อัปโหลดเข้าถังโดยไม่จอง = ถังปฏิเสธ").not.toBeNull();
  // เกิน 10 ไฟล์ต่อคำขอ (ฉบับใหม่นับใหม่) — ทางเว็บจริง (จอง → ลิงก์อัปโหลด)
  for (let i = 1; i <= 9; i++) {
    const r = await api(page.request, DEALER_ORIGIN, "POST", "", { op: "reserve", requestId: คำขอ.ใหม่, side: "dealer", name: `ไฟล์ ${i}.csv`, size: 10 });
    expect(r.status, `จองไฟล์ที่ ${i}`).toBe(200);
    const t = JSON.parse(r.text) as { path: string; token: string };
    expect((await sbA.storage.from("quote-files").uploadToSignedUrl(t.path, t.token, Buffer.alloc(10, 67), { contentType: "text/csv" })).error, `อัปโหลดไฟล์ที่ ${i}`).toBeNull();
  }
  // ที่จองไว้ "หลอกขนาด" (ยังไม่ครบ 30 นาที) นับเป็น 1 → ครบ 10 แล้ว
  const เกิน = await api(page.request, DEALER_ORIGIN, "POST", "", { op: "reserve", requestId: คำขอ.ใหม่, side: "dealer", name: "ไฟล์ 11.csv", size: 10 });
  expect(เกิน.text, "ไฟล์ที่ 11 = เซิร์ฟเวอร์ปฏิเสธ").toContain("file_count");

  // HQ ฉบับใหม่: ร่าง → แนบ → รายการทั้งสายมีไฟล์ HQ ทั้ง 2 ฉบับ
  const valid = new Date(Date.now() + 7 * 3_600_000 + 30 * 86_400_000).toISOString().slice(0, 10);
  expect((await hq.rpc("hq_quote_save", { p_request_id: คำขอ.ใหม่, p_lines: [{ name: "โครงเหล็ก", qty: 1, unit: "ชุด", unitCost: 90000 }], p_valid_until: valid, p_note: "" })).error).toBeNull();
  const จองHQ = await hq.rpc("quote_file_reserve", { p_request_id: คำขอ.ใหม่, p_side: "hq", p_name: "แบบฉบับ 2.pdf", p_size: 10 });
  expect(จองHQ.error).toBeNull();
  expect((await hq.storage.from("quote-files").upload((จองHQ.data as { path: string }).path, Buffer.alloc(10, 68), { contentType: "application/pdf" })).error).toBeNull();
  const สาย = (await hq.rpc("quote_files_list", { p_request_id: คำขอ.ใหม่ })).data as { side: string; version: number | null; path: string }[];
  expect(สาย.filter(f => f.side === "hq").map(f => f.version).sort(), "ไฟล์ HQ ทั้งฉบับ 1 และฉบับ 2 อยู่ในรายการ").toEqual([1, 2]);
  expect(สาย.some(f => f.path === คำขอ.hqPath), "ไฟล์ฉบับเก่าไม่ถูกทับ").toBe(true);
});

test("[ui·hq] ตั้งค่า › พื้นที่เก็บไฟล์: ใช้ไปตามจริง · ยังไม่ตั้งโควตา = ไม่มีหลอด · ตั้งแล้วหลอดเทียบโควตา", async ({ page }) => {
  const errs = watchErrors(page);
  const hq = await db(ADMIN);
  const เดิม = ((await hq.rpc("storage_usage")).data as { quotaGb: number | null }).quotaGb;
  try {
    expect((await hq.rpc("storage_quota_set", { p_gb: null })).error).toBeNull();
    await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
    await page.goto(`${HQ_ORIGIN}/hq/settings`, { waitUntil: "domcontentloaded" });
    await settle(page);
    await page.getByRole("button", { name: "พื้นที่เก็บไฟล์" }).click();
    const แผง = page.locator("[data-panel='storage-usage']");
    await expect(แผง.getByTestId("storage-quota"), "ยังไม่ตั้งโควตา = บอกตรง ๆ").toContainText("ยังไม่ได้ตั้งโควตา", { timeout: 20_000 });
    await expect(แผง.getByTestId("storage-bar"), "ยังไม่ตั้งโควตา = ไม่มีหลอดเทียบ").toHaveCount(0);
    // ขนาดในตารางของถังไฟล์แนบ = ขนาดจริงจากฐาน (ข้อนี้มีไฟล์ของข้อก่อนอยู่แล้ว)
    const จริง = ((await hq.rpc("storage_usage")).data as { buckets: { bucket: string; bytes: number }[] }).buckets.find(b => b.bucket === "quote-files")!;
    expect(Number(จริง.bytes), "ถังไฟล์แนบมีไฟล์ของข้อนี้").toBeGreaterThan(0);
    await expect(แผง.locator("tr[data-bucket='quote-files']"), "แถวถังไฟล์แนบแสดงขนาดจริง (อ่านจากถังขณะแสดง)").toHaveAttribute("data-bytes", /^\d+$/);
    await แผง.getByLabel("โควตาพื้นที่เก็บไฟล์ (GB)").fill("100");
    await page.getByRole("button", { name: "บันทึก", exact: true }).click();
    await expect.poll(async () => ((await hq.rpc("storage_usage")).data as { quotaGb: number | null }).quotaGb, { timeout: 20_000, message: "ฐานได้โควตา 100 GB" }).toBe(100);
    await expect(แผง.getByTestId("storage-bar"), "ตั้งโควตาแล้วมีหลอดเทียบ").toBeVisible({ timeout: 20_000 });
    await expect(แผง.getByTestId("storage-quota")).toContainText("100 GB");
    assertNoErrors(errs, "ตั้งค่าพื้นที่เก็บไฟล์");
  } finally {
    await hq.rpc("storage_quota_set", { p_gb: เดิม });
  }
});
