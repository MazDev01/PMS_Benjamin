import { test, expect, type Page } from "@playwright/test";
import { settle, เลือกตัวกรอง } from "./helpers";
import { RYG, skipReason } from "./supabaseEnv";
import { NS as ฐานNS } from "./global-setup";
import { DEALER_ORIGIN, loginUI, db, waitRow, cleanup, specNS, nsTag } from "./funcHelpers";
import { ใบHQให้ลูกค้าเป้าหมายเดิม, ทำใบลูกค้าจากใบHQ, เติมข้อมูลลีดก่อนขอราคา } from "./hqQuoteFixture";

// ── ชื่อขั้นในตารางลีด = ขั้นที่ไฮไลต์ในแผงลีด ทุกขั้น (บอสสั่ง 27 ต.ค. 69) ─────────────────────────────────────────
//   เดิมคอลัมน์ "ขั้น" แสดงชื่อสถานะภายใน (ติดต่อแล้ว · รอราคา HQ · ได้ราคา HQ · เสนอราคา) ไม่ตรงกับแถบ 5 ขั้นในแผงลีด
//   ข้อนี้พาลีดเดินจริงผ่านขั้น 1 → 2 → 3 → 4 → 5 (+ ปิดไม่สำเร็จจากข้อมูลตั้งต้น) แล้วเทียบ "ข้อความในช่องขั้นตอนของตาราง"
//   กับ "ขั้นที่ไฮไลต์ในแผงลีด" ของลีดเดียวกัน — อ่านช่องตามหัวคอลัมน์ "ขั้น" (ไม่พึ่งเครื่องหมายในโค้ดใหม่) → บนโค้ดเดิมตก
// 9 พ.ย. 69 (บอสสั่ง · ใบ 0284): ยุบ "ทำใบให้ลูกค้า" + "รอลูกค้าตอบ" เป็น "เสนอราคาลูกค้า" — แถบ 4 ขั้น ขั้นละ 25%
//   ป้ายย่อยใต้ชื่อขั้นในตารางบอก "ทำใบแล้ว (ยังไม่ส่ง)" / "ส่งให้ลูกค้าแล้ว" · ไม่มีชื่อขั้นเดิมบนจอ (ตกบนโค้ดก่อนยุบ: ขั้น 5 ช่อง · ขั้นละ 20%)
// 28 ต.ค. 69 (บอสสั่ง): ขั้นตอนกับความคืบหน้าแยกคอลัมน์ · ชื่อขั้นไม่มีเลขลำดับนำหน้า ทั้งตารางและแถบในแผงลีด
//   ช่อง "ขั้น" = ชื่อขั้นล้วน ไม่มีแถบ · ช่อง "ความคืบหน้า" = แถบ + % (ขั้นละ 20%) เต็มเท่าเลขขั้นที่ไฮไลต์ในแผง
//   ปิดไม่สำเร็จ = สีแดงตามขั้นไกลสุดที่เคยไปถึง (leads.reached_step ที่ฐานคิด · ใบ 0258 · บอสสั่ง 28 ต.ค. 69 ตารางตามรูป)
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(240_000);
test.describe.configure({ mode: "serial" });

const NS = specNS("LSTAGE");
const tg = nsTag(NS);
test.beforeAll(async () => { await cleanup(await db(RYG), "RYG", NS); });
test.afterAll(async () => { await cleanup(await db(RYG), "RYG", NS); });

const ปกติ = (s: string) => s.replace(/[·✓]/g, " ").replace(/\s+/g, " ").trim();

/** ข้อความช่อง "ขั้น" ของแถวลีด company ในตาราง และข้อความขั้นที่ไฮไลต์ในแผงลีด (null = ลีดปิดแล้ว ไม่มีขั้นปัจจุบัน) */
async function ขั้นในตารางและแผง(page: Page, company: string, ทั้งหมด = false) {
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: "ตาราง", exact: true }).click().catch(() => {});
  // ค่าเริ่มต้นของตัวกรองซ่อนลีดที่ปิดแล้ว (กำลังดำเนินการ · 28 ต.ค. 69) — ลีดปิดแล้วต้องเลือก "ทั้งหมด"
  if (ทั้งหมด) await เลือกตัวกรอง(page, "ขั้น", "ทั้งหมด");   // ช่องตัวกรองเป็นตัวกลางทำเอง (บอสสั่ง 11 พ.ย. 69 แทน <select>)
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(company);
  const row = page.locator("tbody tr").filter({ hasText: company }).first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  const หัว = await page.locator("thead th").allInnerTexts();
  const ช่อง = หัว.findIndex(h => h.replace(/\s+/g, "").startsWith("ขั้น"));
  expect(ช่อง, `ตารางต้องมีคอลัมน์ "ขั้น" (${หัว.join(" | ")})`).toBeGreaterThanOrEqual(0);
  const ช่องคืบหน้า = หัว.findIndex(h => h.replace(/\s+/g, "").startsWith("ความคืบหน้า"));
  expect(ช่องคืบหน้า, `ตารางต้องมีคอลัมน์ "ความคืบหน้า" แยกจาก "ขั้น" (${หัว.join(" | ")})`).toBeGreaterThanOrEqual(0);
  const เซลล์ขั้น = row.locator("td").nth(ช่อง);
  // บรรทัดแรก = ชื่อขั้น · บรรทัดถัดไป (ถ้ามี) = ป้ายย่อยของขั้นเสนอราคาลูกค้า
  const [ในตาราง, ...ย่อย] = (await เซลล์ขั้น.innerText()).trim().split(/\n+/).map(x => x.trim()).filter(Boolean);
  const ป้ายย่อย = ย่อย.join(" ") || null;
  expect(await เซลล์ขั้น.getByRole("img").count(), "ช่องขั้นตอนไม่มีแถบความคืบหน้าซ้อน").toBe(0);
  const ป้ายแถบ = await row.locator("td").nth(ช่องคืบหน้า).getByRole("img").getAttribute("aria-label");
  const ร้อย = Number(ป้ายแถบ?.match(/ความคืบหน้า (\d+)%/)?.[1] ?? NaN);
  expect(ร้อย % 25, `ความคืบหน้าเป็นขั้นละ 25% (4 ขั้น · ${ป้ายแถบ})`).toBe(0);
  expect(await row.locator("td").nth(ช่องคืบหน้า).locator("[data-progress-cell]").count(), "แถบความคืบหน้า 4 ช่อง").toBe(4);
  const คืบหน้า = ร้อย / 25;
  await row.getByRole("button", { name: "ดูรายละเอียด" }).first().click();
  const แถบ = page.getByRole("list", { name: "ขั้นการขาย" });
  await expect(แถบ).toBeVisible({ timeout: 15_000 });
  const ตอนนี้ = แถบ.locator('li[aria-current="step"]');
  const ในแผง = await ตอนนี้.count() ? (await ตอนนี้.innerText()).trim() : null;
  // ลำดับขั้นที่ไฮไลต์ = ตำแหน่งใน 4 ช่อง · ทุกช่องในแผงมีเลขลำดับนำหน้า (บอสสั่ง 13 พ.ย. 69 · กลับด้าน 28 ต.ค. 69)
  const ทุกช่อง = (await แถบ.locator("li").allInnerTexts()).map(ปกติ);
  expect(ทุกช่อง.filter(t => !/^[1-4]\. /.test(t)), "แถบ 4 ขั้นในแผงลีดขึ้นต้นด้วยเลขลำดับ").toEqual([]);
  expect(ทุกช่อง, "แถบในแผงลีด = 4 ขั้นชื่อชุด 13 พ.ย. 69").toEqual(["1. เก็บข้อมูลลูกค้า", "2. รอราคาจาก HQ", "3. ได้ราคาจาก HQ แล้ว", "4. ทำใบเสนอราคาให้ลูกค้า"]);
  const ลำดับในแผง = ในแผง == null ? null : ทุกช่อง.indexOf(ปกติ(ในแผง)) + 1;
  await page.keyboard.press("Escape").catch(() => {});
  return { ในตาราง, ในแผง, คืบหน้า, ลำดับในแผง, ป้ายแถบ, ป้ายย่อย };
}

async function เพิ่มลีด(page: Page, company: string) {
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: "เพิ่มลูกค้าเป้าหมาย" }).first().click();
  await page.getByPlaceholder("เช่น บริษัท ตัวอย่าง จำกัด").fill(company);
  await page.getByPlaceholder("ชื่อผู้ติดต่อ").fill("คุณขั้นตอน");
  await page.getByPlaceholder("0XX-XXX-XXXX").fill("000-000-9023");
  await page.getByRole("dialog").getByLabel("จังหวัด").first().selectOption({ index: 1 });
  await page.getByRole("button", { name: "บันทึก", exact: true }).click();
  return waitRow<{ num_id: number }>(await db(RYG), "leads", { company });
}

test("[ui·dealer] ชื่อในช่องขั้นตอนของตาราง = ขั้นที่ไฮไลต์ในแผงลีด ทุกขั้น (1–4 · ปิดไม่สำเร็จ) · ป้ายทำใบแล้ว/ส่งแล้ว", async ({ page }) => {
  const sb = await db(RYG);
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  const เทียบ = async (company: string, ขั้น: string, ป้ายย่อยที่ต้องเห็น: string | null = null) => {
    const { ในตาราง, ในแผง, คืบหน้า, ลำดับในแผง, ป้ายย่อย } = await ขั้นในตารางและแผง(page, company);
    console.log(`[lead-stage] ${ขั้น}: ตาราง "${ในตาราง}" (${ป้ายย่อย ?? "—"}) · ความคืบหน้า ${คืบหน้า}/4 · แผง "${ในแผง}" (ช่องที่ ${ลำดับในแผง})`);
    expect(ป้ายย่อย, `${ขั้น}: ป้ายย่อยใต้ชื่อขั้น`).toBe(ป้ายย่อยที่ต้องเห็น);
    expect(`${ในตาราง} ${ป้ายย่อย ?? ""}`, `${ขั้น}: ไม่มีชื่อขั้นเดิม`).not.toMatch(/ทำใบให้ลูกค้า|รอลูกค้าตอบ/);
    expect(ในแผง, `${ขั้น}: แผงต้องไฮไลต์ขั้นปัจจุบัน`).not.toBeNull();
    expect(ปกติ(ในตาราง), `${ขั้น}: ชื่อในตารางต้องตรงกับขั้นที่ไฮไลต์ในแผงลีด`).toBe(ปกติ(ในแผง!));
    // ป้ายขั้นเปิดอยู่มีเลขลำดับนำหน้า · ปิดสำเร็จ/ไม่สำเร็จไม่มีเลข (บอสสั่ง 13 พ.ย. 69 · กลับด้าน 28 ต.ค. 69)
    expect(ในตาราง, `${ขั้น}: ป้ายในตาราง = "n. ชื่อขั้น" หรือ ปิด…`).toMatch(/^([1-4]\. |ปิด)/);
    expect(คืบหน้า, `${ขั้น}: แถบความคืบหน้าเต็มเท่าขั้นที่ไฮไลต์ในแผงลีด`).toBe(ลำดับในแผง);
  };

  // ขั้น 1 ข้อมูลลูกค้า
  const ก = tg("ขั้นตอนเดินจริง");
  const ลีดก = await เพิ่มลีด(page, ก);
  await เทียบ(ก, "ขั้น 1");
  // ขั้น 2 ขอราคา HQ (ลีดอีกราย — ส่งคำขอแล้ว HQ ยังไม่ส่งใบ)
  const ข = tg("ขั้นตอนรอราคา");
  const ลีดข = await เพิ่มลีด(page, ข);
  await เติมข้อมูลลีดก่อนขอราคา(sb, "RYG", ลีดข.num_id);   // ฟอร์มเพิ่มลีดกรอกแค่ข้อมูลลูกค้า (ใบ 0273)
  const r = await sb.rpc("quote_request_submit", { p_lead_num_id: ลีดข.num_id, p_product: "โกดังสำเร็จรูป" });
  expect(r.error?.message ?? "").toBe("");
  await เทียบ(ข, "ขั้น 2");
  // ขั้น 3 ได้ใบ HQ → ขั้น 4 เสนอราคาลูกค้า: ทำใบแล้ว (ใบร่าง) → ส่งให้ลูกค้าแล้ว (ขั้นเดียวกัน · เดิมแยกเป็นขั้น 4/5)
  const ใบ = await ใบHQให้ลูกค้าเป้าหมายเดิม(RYG, "RYG", ลีดก.num_id);
  await เทียบ(ก, "ขั้น 3");
  const q = await ทำใบลูกค้าจากใบHQ(RYG, ใบ, { customer: ก, status: "draft", extra: { deal_id: ลีดก.num_id } });
  await เทียบ(ก, "ขั้น 4 ทำใบแล้ว", "ยังไม่ส่ง");
  const s = await sb.rpc("quotation_send", { p_dealer: "RYG", p_id: q.id });
  expect(s.error?.message ?? "").toBe("");
  await เทียบ(ก, "ขั้น 4 ส่งแล้ว", "ส่งแล้ว");

  // ปิดไม่สำเร็จ (ข้อมูลตั้งต้น) — แผงไม่มีขั้นปัจจุบัน ตารางต้องบอก "ปิดไม่สำเร็จ" ไม่ใช่ชื่อสถานะภายใน
  //   ไม่นิ่งรอบ deploy24 (17 พ.ย. 69): เดิมหยิบ "ลีดปิดไม่สำเร็จรายไหนก็ได้ของ RYG" แถวแรก → ได้ ZZTEST-ขั้นต่อไป-ปิด-… ของ lead-next-step
  //   ซึ่งลบลีดของตัวเองตอนจบ (afterAll) ระหว่างข้อนี้ค้นในตาราง → แถวหายก่อนขึ้น 20 วิ · ตอนนี้หยิบเฉพาะข้อมูลตั้งต้น (ZZTEST-BASE · global-setup
  //   ไม่มีข้อไหนลบระหว่างรอบ) เรียงตาม num_id ให้ได้รายเดิมทุกครั้ง · ไม่เจอ = ตก (เดิมข้ามเงียบด้วย if)
  const { data: ปิด } = await sb.from("leads").select("company, reached_step").eq("dealer_code", "RYG").eq("status", "CANCELLED")
    .like("company", `${ฐานNS}-%`).order("num_id").limit(1);
  expect(ปิด?.[0], "ข้อมูลตั้งต้นมีลีด RYG ปิดไม่สำเร็จ (global-setup)").toBeTruthy();
  const { ในตาราง, คืบหน้า, ป้ายแถบ } = await ขั้นในตารางและแผง(page, ปิด![0].company as string, true);
  expect(ในตาราง, "ลีดปิดไม่สำเร็จ: ตารางแสดงชื่อขั้นกลาง").toBe("ปิดไม่สำเร็จ");
  expect(คืบหน้า, "ลีดปิดไม่สำเร็จ: แถบเต็มเท่าขั้นไกลสุดที่เคยไปถึง (ฐานคิด)").toBe(Number(ปิด![0].reached_step));
  expect(ป้ายแถบ, "ลีดปิดไม่สำเร็จ: แถบบอกว่าปิดไม่สำเร็จ (สีแดง)").toContain("ปิดไม่สำเร็จ");
});
