import { test, expect, type Page } from "@playwright/test";
import { settle } from "./helpers";
import { RYG, skipReason } from "./supabaseEnv";
import { DEALER_ORIGIN, loginUI, db, waitRow, cleanup, specNS, nsTag } from "./funcHelpers";
import { ใบHQให้ลูกค้าเป้าหมายเดิม, ทำใบลูกค้าจากใบHQ } from "./hqQuoteFixture";

// ── ชื่อขั้นในตารางลีด = ขั้นที่ไฮไลต์ในแผงลีด ทุกขั้น (บอสสั่ง 27 ต.ค. 69) ─────────────────────────────────────────
//   เดิมคอลัมน์ "ขั้นตอน" แสดงชื่อสถานะภายใน (ติดต่อแล้ว · รอราคา HQ · ได้ราคา HQ · เสนอราคา) ไม่ตรงกับแถบ 5 ขั้นในแผงลีด
//   ข้อนี้พาลีดเดินจริงผ่านขั้น 1 → 2 → 3 → 4 → 5 (+ ปิดไม่สำเร็จจากข้อมูลตั้งต้น) แล้วเทียบ "ข้อความในช่องขั้นตอนของตาราง"
//   กับ "ขั้นที่ไฮไลต์ในแผงลีด" ของลีดเดียวกัน — อ่านช่องตามหัวคอลัมน์ "ขั้นตอน" (ไม่พึ่งเครื่องหมายในโค้ดใหม่) → บนโค้ดเดิมตก
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(240_000);
test.describe.configure({ mode: "serial" });

const NS = specNS("LSTAGE");
const tg = nsTag(NS);
test.beforeAll(async () => { await cleanup(await db(RYG), "RYG", NS); });
test.afterAll(async () => { await cleanup(await db(RYG), "RYG", NS); });

const ปกติ = (s: string) => s.replace(/[·✓]/g, " ").replace(/\s+/g, " ").trim();

/** ข้อความช่อง "ขั้นตอน" ของแถวลีด company ในตาราง และข้อความขั้นที่ไฮไลต์ในแผงลีด (null = ลีดปิดแล้ว ไม่มีขั้นปัจจุบัน) */
async function ขั้นในตารางและแผง(page: Page, company: string) {
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: "ตาราง" }).click().catch(() => {});
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(company);
  const row = page.locator("tbody tr").filter({ hasText: company }).first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  const หัว = await page.locator("thead th").allInnerTexts();
  const ช่อง = หัว.findIndex(h => h.replace(/\s+/g, "").startsWith("ขั้นตอน"));
  expect(ช่อง, `ตารางต้องมีคอลัมน์ "ขั้นตอน" (${หัว.join(" | ")})`).toBeGreaterThanOrEqual(0);
  const ในตาราง = (await row.locator("td").nth(ช่อง).innerText()).split("\n")[0].trim();
  await row.getByRole("button", { name: "ดูรายละเอียด" }).first().click();
  const แถบ = page.getByRole("list", { name: "ขั้นตอนการขาย" });
  await expect(แถบ).toBeVisible({ timeout: 15_000 });
  const ตอนนี้ = แถบ.locator('li[aria-current="step"]');
  const ในแผง = await ตอนนี้.count() ? (await ตอนนี้.innerText()).trim() : null;
  await page.keyboard.press("Escape").catch(() => {});
  return { ในตาราง, ในแผง };
}

async function เพิ่มลีด(page: Page, company: string) {
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: "เพิ่มลูกค้าเป้าหมาย" }).first().click();
  await page.getByPlaceholder("เช่น บริษัท ตัวอย่าง จำกัด").fill(company);
  await page.getByPlaceholder("ชื่อผู้ติดต่อ").fill("คุณขั้นตอน");
  await page.getByPlaceholder("0XX-XXX-XXXX").fill("081-000-0000");
  await page.getByRole("dialog").getByLabel("จังหวัด").first().selectOption({ index: 1 });
  await page.getByRole("button", { name: "บันทึก" }).click();
  return waitRow<{ num_id: number }>(await db(RYG), "leads", { company });
}

test("[ui·dealer] ชื่อในช่องขั้นตอนของตาราง = ขั้นที่ไฮไลต์ในแผงลีด ทุกขั้น (1–5 · ปิดไม่สำเร็จ)", async ({ page }) => {
  const sb = await db(RYG);
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  const เทียบ = async (company: string, ขั้น: string) => {
    const { ในตาราง, ในแผง } = await ขั้นในตารางและแผง(page, company);
    console.log(`[lead-stage] ${ขั้น}: ตาราง "${ในตาราง}" · แผง "${ในแผง}"`);
    expect(ในแผง, `${ขั้น}: แผงต้องไฮไลต์ขั้นปัจจุบัน`).not.toBeNull();
    expect(ปกติ(ในตาราง), `${ขั้น}: ชื่อในตารางต้องตรงกับขั้นที่ไฮไลต์ในแผงลีด`).toBe(ปกติ(ในแผง!));
  };

  // ขั้น 1 ข้อมูลลูกค้า
  const ก = tg("ขั้นตอนเดินจริง");
  const ลีดก = await เพิ่มลีด(page, ก);
  await เทียบ(ก, "ขั้น 1");
  // ขั้น 2 ขอราคา HQ (ลีดอีกราย — ส่งคำขอแล้ว HQ ยังไม่ส่งใบ)
  const ข = tg("ขั้นตอนรอราคา");
  const ลีดข = await เพิ่มลีด(page, ข);
  const r = await sb.rpc("quote_request_submit", { p_lead_num_id: ลีดข.num_id, p_product: "โกดังสำเร็จรูป" });
  expect(r.error?.message ?? "").toBe("");
  await เทียบ(ข, "ขั้น 2");
  // ขั้น 3 ได้ใบ HQ → ขั้น 4 ทำใบให้ลูกค้า (มีใบร่าง) → ขั้น 5 รอลูกค้าตอบ (ส่งใบแล้ว)
  const ใบ = await ใบHQให้ลูกค้าเป้าหมายเดิม(RYG, "RYG", ลีดก.num_id);
  await เทียบ(ก, "ขั้น 3");
  const q = await ทำใบลูกค้าจากใบHQ(RYG, ใบ, { customer: ก, status: "draft", extra: { deal_id: ลีดก.num_id } });
  await เทียบ(ก, "ขั้น 4");
  const s = await sb.rpc("quotation_send", { p_dealer: "RYG", p_id: q.id });
  expect(s.error?.message ?? "").toBe("");
  await เทียบ(ก, "ขั้น 5");

  // ปิดไม่สำเร็จ (ข้อมูลตั้งต้น) — แผงไม่มีขั้นปัจจุบัน ตารางต้องบอก "ปิดไม่สำเร็จ" ไม่ใช่ชื่อสถานะภายใน
  const { data: ปิด } = await sb.from("leads").select("company").eq("dealer_code", "RYG").eq("status", "CANCELLED").limit(1);
  if (ปิด?.[0]) {
    const { ในตาราง } = await ขั้นในตารางและแผง(page, ปิด[0].company as string);
    expect(ในตาราง, "ลีดปิดไม่สำเร็จ: ตารางแสดงชื่อขั้นกลาง").toBe("ปิดไม่สำเร็จ");
  }
});
