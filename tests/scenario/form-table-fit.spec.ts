import { test, expect, type Page, type Locator } from "@playwright/test";
import { ADMIN, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { HQ_ORIGIN, DEALER_ORIGIN, db, loginUI, watchErrors, assertNoErrors } from "./funcHelpers";
import { settle, เปิดใบHQในกล่องงาน } from "./helpers";
import { เตรียมใบHQ, ล้างใบHQทดสอบ, เลขลูกค้าเป้าหมายทดสอบ, ข้อมูลงานครบชุด, type ใบHQพร้อมใช้ } from "./hqQuoteFixture";
import { กรอกข้อมูลบริษัททดสอบ } from "./testDealers";
import { สร้างสาขาของข้อ, type สาขาของข้อ } from "./ownDealer";

// ── ตารางกรอกในหน้าต่าง 820: ช่องในแถวไม่ทับกัน · หัวคอลัมน์ไม่ถูกตัด (บอสสั่งแก้ก่อนปิดรอบ 11 พ.ย. 69 · บั๊กงานหน้าต่าง 820) ──
//   เจอ: หน้าต่างทำใบ HQ ช่องหน่วยทับช่องราคาต่อหน่วย · หัว "ลำดับ" ถูกตัดเป็น "ลำ…" · คำบรรยายเหนือตารางเขียน "ต้นทุนต่อหน่วย" ไม่ตรงหัว "ราคาต่อหน่วย"
//   ตรวจทุกตารางกรอกแบบเดียวกันในหน้าต่าง 820 ที่จอ 1366 และ 1920:
//     ใบ HQ (ทำใบ) · เพิ่มวัสดุหลายแถว (HQ ตั้งค่า) · ฟอร์มขอราคาของดีลเลอร์ (ราคาประเมินวัสดุ) · ฟอร์มทำใบเสนอราคาดีลเลอร์ (บวก %)
//   เกณฑ์ทุกแถว: ช่องกรอก/เลือก/ปุ่ม อยู่ในกรอบช่องตาราง (ไม่ล้นไปช่องข้าง) · ช่องที่อยู่แนวเดียวกันห่างกันอย่างน้อย 4px (กรอบไม่ซ้อน)
//     · หัวคอลัมน์บรรทัดเดียวไม่ถูกตัด · ช่องรายการกว้างสุด
//   ตกบนโค้ดเดิม: ช่องหน่วยกว้างขั้นต่ำ 96px ในคอลัมน์ 11.5% → ล้นทับช่องราคา · หัว "ลำดับ" 7% ถูกตัด
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.setTimeout(300_000);

const แท็ก = Date.now() % 100000;
const บริษัทขอราคา = `ZZTEST-ช่องทับ-ขอราคา-${แท็ก}`;
const บริษัทใบHQ = `ZZTEST-ช่องทับ-ใบHQ-${แท็ก}`;
const บริษัททำใบ = `ZZTEST-ช่องทับ-ทำใบ-${แท็ก}`;
let สาขา: สาขาของข้อ, ใบทำใบ: ใบHQพร้อมใช้ | null = null;
const เลขขอราคา = เลขลูกค้าเป้าหมายทดสอบ(), เลขใบHQ = เลขลูกค้าเป้าหมายทดสอบ();

// ข้อมูลตั้งที่ beforeAll ครั้งเดียว · ข้อ HQ ไม่ใช้ใบที่บันทึกแล้ว · ใบ HQ ของฝั่งดีลเลอร์เตรียมใน beforeAll เดียวกัน
//   ⚠️ เดิมแยก 2 ข้อขนานกัน = beforeAll รัน 2 ชุดพร้อมกัน → hq_quote_save ชนกัน "deadlock detected" (ครั้งแรก 11 พ.ย. 69) · ไฟล์นี้รันทีละข้อ
test.describe.configure({ mode: "serial" });
test.beforeAll(async () => {
  สาขา = await สร้างสาขาของข้อ({ จังหวัด: "ตราด" });
  await กรอกข้อมูลบริษัททดสอบ(สาขา.รหัส);
  const sd = await db(สาขา.บัญชี);
  for (const [เลข, ชื่อ] of [[เลขขอราคา, บริษัทขอราคา], [เลขใบHQ, บริษัทใบHQ]] as const)
    expect((await sd.from("leads").insert({ id: `#L-${เลข}`, num_id: เลข, dealer_code: สาขา.รหัส, company: ชื่อ, name: ชื่อ, contact: "ผู้ทดสอบ",
      phone: `08${String(เลข).slice(-8)}`, province: "ตราด", status: "BULLET", ...ข้อมูลงานครบชุด })).error, `ลูกค้าเป้าหมาย ${ชื่อ}`).toBeNull();
  expect((await sd.rpc("quote_request_submit", { p_lead_num_id: เลขใบHQ, p_product: "โกดัง" })).error, "คำขอสำหรับหน้าต่างทำใบ HQ").toBeNull();
  ใบทำใบ = await เตรียมใบHQ(สาขา.บัญชี, { dealerCode: สาขา.รหัส, company: บริษัททำใบ, province: "ตราด",
    lines: [{ name: "เหล็กโครงสร้างรูปพรรณ", qty: 38, unit: "ตัน", unitCost: 32_000 }, { name: "แผ่นหลังคาเมทัลชีท", qty: 2240, unit: "ตร.ม.", unitCost: 350 }] });
});
test.afterAll(async () => {
  if (สาขา) ล้างใบHQทดสอบ(สาขา.รหัส, [เลขขอราคา, เลขใบHQ, ...(ใบทำใบ ? [ใบทำใบ.leadNum] : [])]);
  await สาขา?.ลบ();
});

/** วัดตาราง: ช่องในแถวล้นกรอบช่อง/ชิดกันเกิน · หัวคอลัมน์ถูกตัด → รายการปัญหา (ว่าง = ผ่าน) */
async function ตรวจตาราง(ตาราง: Locator, ชื่อ: string) {
  await expect(ตาราง, `${ชื่อ}: ตารางขึ้น`).toBeVisible({ timeout: 25_000 });
  await expect(ตาราง.locator("tbody tr").first(), `${ชื่อ}: มีแถว`).toBeVisible();
  const ผล = await ตาราง.evaluate(t => {
    const ปัญหา: string[] = [];
    const ข้อความ = (e: Element) => (e.getAttribute("aria-label") || e.textContent || e.tagName).trim().slice(0, 30);
    t.querySelectorAll("thead th").forEach(th => {
      const h = th as HTMLElement;
      if ((h.textContent ?? "").trim() && h.scrollWidth > h.clientWidth + 1) ปัญหา.push(`หัว "${h.textContent!.trim()}" ถูกตัด (${h.scrollWidth} > ${h.clientWidth})`);
    });
    t.querySelectorAll("tbody tr").forEach((tr, ri) => {
      const ช่อง: { e: Element; r: DOMRect }[] = [];
      tr.querySelectorAll("td").forEach(td => {
        const c = td.getBoundingClientRect();
        td.querySelectorAll("input, select, button, textarea").forEach(e => {
          const r = e.getBoundingClientRect();
          if (!r.width || !r.height) return;
          if (r.left < c.left - 0.5 || r.right > c.right + 0.5) ปัญหา.push(`แถว ${ri + 1}: "${ข้อความ(e)}" ล้นกรอบช่อง (${Math.round(r.left)}–${Math.round(r.right)} นอก ${Math.round(c.left)}–${Math.round(c.right)})`);
          ช่อง.push({ e, r });
        });
      });
      ช่อง.sort((a, b) => a.r.left - b.r.left);
      for (let i = 0; i < ช่อง.length; i++) for (let j = i + 1; j < ช่อง.length; j++) {
        const a = ช่อง[i].r, b = ช่อง[j].r;
        const แนวเดียว = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
        if (แนวเดียว && b.left - a.right < 4) ปัญหา.push(`แถว ${ri + 1}: "${ข้อความ(ช่อง[i].e)}" กับ "${ข้อความ(ช่อง[j].e)}" ห่าง ${Math.round(b.left - a.right)}px (ต้อง ≥ 4 · ติดลบ = ทับ)`);
      }
    });
    const หัว = [...t.querySelectorAll("thead th")].map(th => ({ t: (th.textContent ?? "").trim(), w: th.getBoundingClientRect().width }));
    const รายการ = หัว.find(h => h.t === "รายการ" || h.t === "ชื่อวัสดุ");
    if (รายการ && หัว.some(h => h.t && h !== รายการ && h.w > รายการ.w + 0.5)) ปัญหา.push(`ช่องรายการไม่กว้างสุด ${JSON.stringify(หัว.map(h => [h.t, Math.round(h.w)]))}`);
    return ปัญหา;
  });
  expect(ผล, `${ชื่อ}: ช่องในแถวไม่ทับกัน · หัวไม่ถูกตัด`).toEqual([]);
}

const จอ = [{ width: 1366, height: 768 }, { width: 1920, height: 1080 }];

test("[ui·hq] ตารางกรอกในหน้าต่าง 820: ใบ HQ (ทำใบ) + เพิ่มวัสดุหลายแถว — ช่องไม่ทับกัน หัวไม่ถูกตัด (1366 · 1920)", async ({ page }) => {
  const errs = watchErrors(page);
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  for (const ขนาด of จอ) {
    await page.setViewportSize(ขนาด);
    await page.goto(`${HQ_ORIGIN}/hq/quote-requests`, { waitUntil: "domcontentloaded" }); await settle(page);
    const { ใบ } = await เปิดใบHQในกล่องงาน(page, บริษัทใบHQ);
    if (await ใบ.getByLabel("ชื่อรายการ 1").count() === 0) await ใบ.getByRole("button", { name: "เพิ่มรายการอื่น" }).click();   // ไม่ใช่การข้าม: ใบเปล่าบางแบบยังไม่มีแถวว่าง
    await ใบ.getByLabel("ชื่อรายการ 1").fill("แผ่นหลังคาเมทัลชีท");
    await ใบ.getByLabel("จำนวน 1").fill("2240");
    await ใบ.getByLabel("ต้นทุนต่อหน่วย 1").fill("350");
    await ตรวจตาราง(ใบ.getByRole("table", { name: "รายการ BOQ" }), `ใบ HQ @${ขนาด.width}`);
    // คำบรรยายเหนือตารางใช้คำเดียวกับหัวคอลัมน์ "ราคาต่อหน่วย"
    const คำบรรยาย = ใบ.locator("[data-boq-table] > div").first();
    await expect(คำบรรยาย, "คำบรรยายเหนือตาราง = ราคาต่อหน่วย (ตรงหัวคอลัมน์)").toContainText("ราคาต่อหน่วย");
    await expect(คำบรรยาย).not.toContainText("ต้นทุนต่อหน่วย");
    await page.keyboard.press("Escape");

    // หน้าต่างเพิ่มวัสดุหลายแถว (HQ › ตั้งค่า › รายการวัสดุ) เอาออก — รายการวัสดุเอาออกทั้งระบบ (บอสสั่ง 20 พ.ย. 69)
  }
  assertNoErrors(errs, "ตารางกรอก HQ");
});

async function เปิดแผงลีด(page: Page, company: string) {
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" }); await settle(page);
  await page.getByRole("button", { name: "ตาราง", exact: true }).click().catch(() => {});
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(company);
  const แถว = page.locator("tbody tr").filter({ hasText: company }).first();
  await expect(แถว).toBeVisible({ timeout: 20_000 });
  await แถว.locator("td").first().click();
}

test("[ui·dealer] ตารางกรอกในหน้าต่าง 820: ฟอร์มทำใบ (บวก %) — ช่องไม่ทับกัน หัวไม่ถูกตัด (1366 · 1920)", async ({ page }) => {
  const errs = watchErrors(page);
  await loginUI(page, DEALER_ORIGIN, "/login", สาขา.บัญชี);
  for (const ขนาด of จอ) {
    await page.setViewportSize(ขนาด);
    // ฟอร์มขอราคา: ตารางราคาประเมินวัสดุเอาออก (บอสสั่ง 20 พ.ย. 69 · ตรวจกลับด้าน: ไม่มีกล่องวัสดุ)
    await เปิดแผงลีด(page, บริษัทขอราคา);
    await page.getByRole("status", { name: "ขั้นต่อไป" }).getByRole("button", { name: /ขอราคาจาก HQ/ }).click();
    await expect(page.locator("#qr-product"), "ฟอร์มขอราคาเปิด").toBeVisible({ timeout: 20_000 });
    await expect(page.locator("[data-box='material-estimate']"), "ไม่มีกล่องเลือกวัสดุ/ราคาประเมิน").toHaveCount(0);

    await เปิดแผงลีด(page, บริษัททำใบ);
    await page.locator('[data-panel="next-step"]:not([aria-busy]) [data-next-step="make_quote"]').click({ timeout: 20_000 });
    const ฟอร์ม = page.locator("[data-editor='hq-markup']");
    await ตรวจตาราง(ฟอร์ม.locator("table").first(), `ฟอร์มทำใบ (บวก %) @${ขนาด.width}`);
  }
  assertNoErrors(errs, "ตารางกรอกดีลเลอร์");
});
