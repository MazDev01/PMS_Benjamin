import { test, expect, type Page } from "@playwright/test";
import { ADMIN, RYG, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { DEALER_ORIGIN, HQ_ORIGIN, db, loginUI } from "./funcHelpers";
import { adminClient } from "./testDealers";
import { settle } from "./helpers";
import { เตรียมใบHQ, ล้างใบHQทดสอบ, เลขลูกค้าเป้าหมายทดสอบ, type ใบHQพร้อมใช้ } from "./hqQuoteFixture";

// ── รายการเตือนของลีด + หน้า HQ เส้นทางการขาย ตาม FLOW ใหม่ 5 ขั้น (บอสสั่ง 27 ต.ค. 69 · ใบ 0250) ───────────────────────
//   1) แท็บประวัติ: รายการจัดกลุ่มตาม 5 ขั้น (ชื่อจาก leadStage.ts) · ไม่มี "ติดตามผล" "เจรจาต่อรอง" แบบเดิม
//   2) วันที่ในรายการเป็น พ.ศ. (ข้อมูลเดิมเก็บ "2026-06-02" ต้องขึ้น "2 มิ.ย. 2569")
//   3) ส่งคำขอราคา → "ส่งคำขอราคา" ถูกติ๊ก · HQ ส่งใบ → "ได้ใบ HQ" ถูกติ๊ก (ฐานติ๊กในคำสั่งเดียวกับเหตุการณ์)
//   4) ดีลเลอร์ติ๊กรายการของระบบเองไม่ได้ (ทั้งปุ่มบนจอ และสั่งที่ฐานตรง ๆ) · รายการติ๊กเองยังติ๊กได้
//   5) หน้า HQ เส้นทางการขาย: 5 ขั้นใหม่ · ลบได้เฉพาะรายการติ๊กเอง · ฐานไม่รับแม่แบบที่ตัดรายการของระบบ
//   ต้องตกบนโค้ดก่อนแก้: ไม่มีกลุ่ม 5 ขั้น · มี "เจรจาต่อรอง" · วันที่ ค.ศ. · ไม่มี "ส่งคำขอราคา" · ฐานยอมให้ติ๊กงานของระบบ
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.setTimeout(240_000);

const admin = adminClient();
const แท็ก = Date.now() % 100_000;
const ชื่อลีด = `ZZTEST-รายการเตือน5ขั้น-${แท็ก}`;
const เลข = เลขลูกค้าเป้าหมายทดสอบ();
let ใบ: ใบHQพร้อมใช้ | undefined;

test.beforeAll(async () => {
  // ลีดที่มีรายการแบบเดิม (ติดต่อแล้ว ติ๊ก "2026-06-02" · ติดตามผล · เจรจาต่อรอง) — เหมือนข้อมูลที่มีอยู่ก่อนใบ 0250
  const r = await admin.from("leads").insert({ id: `#L-${เลข}`, num_id: เลข, dealer_code: "RYG", company: ชื่อลีด, name: ชื่อลีด,
    contact: "ผู้ทดสอบ", phone: `08${String(เลข).slice(-8)}`, province: "ระยอง", status: "BULLET", assigned: "ทดสอบระบบ",
    tasks: [
      { key: "contact", label: "ติดต่อแล้ว", done: true, doneAt: "2026-06-02", doneBy: "ทดสอบระบบ" },
      { key: "collect", label: "เก็บข้อมูลลูกค้า", done: false },
      { key: "followup", label: "ติดตามผล", done: false },
      { key: "negotiate", label: "เจรจาต่อรอง", done: false },
    ] });
  expect(r.error, "ลีดทดสอบ").toBeNull();
});
test.afterAll(async () => {
  ล้างใบHQทดสอบ("RYG", [เลข, ...(ใบ ? [ใบ.leadNum] : [])]);
  await admin.from("leads").delete().eq("dealer_code", "RYG").eq("num_id", เลข);
});

async function เปิดรายการเตือน(page: Page, ชื่อ: string) {
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: "ตาราง" }).click().catch(() => {});
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").first().fill(ชื่อ);
  await page.locator("tbody tr").filter({ hasText: ชื่อ }).first().getByRole("button", { name: "ดูรายละเอียด" }).first().click({ timeout: 20_000 });
  await expect(async () => {
    await page.getByRole("button", { name: "ภาพรวม", exact: true }).first().click({ timeout: 5_000 });   // งานในแต่ละขั้นอยู่แท็บภาพรวม (28 ต.ค. 69)
    await expect(page.locator("[data-lead-tasks]")).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 40_000 });
  // ขั้นอื่นพับไว้ (28 ต.ค. 69) — กางทุกขั้นก่อนตรวจรายการ
  for (const b of await page.locator("[data-lead-tasks] button[aria-expanded='false']").all()) await b.click();
  return page.locator("[data-lead-tasks]");
}

test("[func·dealer] รายการเตือน 5 ขั้น · ไม่มีงาน flow เก่า · วันที่ พ.ศ. · งานของระบบฐานติ๊กเอง ดีลเลอร์ติ๊กไม่ได้", async ({ page }) => {
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  const รายการ = await เปิดรายการเตือน(page, ชื่อลีด);

  // 1) จัดกลุ่ม 5 ขั้น ชื่อตาม leadStage.ts
  const ขั้น = ["ข้อมูลลูกค้า", "ขอราคา HQ", "ได้ใบ HQ", "ทำใบให้ลูกค้า", "รอลูกค้าตอบ"];
  for (const [i, ชื่อ] of ขั้น.entries())
    await expect.soft(page.locator(`[data-task-step="${i + 1}"]`).first(), `มีกลุ่มขั้น ${i + 1} ${ชื่อ}`).toContainText(ชื่อ, { timeout: 15_000 });
  for (const เก่า of ["เจรจาต่อรอง", "ติดตามผล"])
    await expect.soft(page.getByRole("checkbox", { name: new RegExp(`^${เก่า}`) }), `ไม่มี "${เก่า}" แบบเดิม`).toHaveCount(0);
  // รายการตั้งต้นใหม่ครบ (ระบบติ๊ก = ปุ่มปิด)
  for (const [ชื่อ, ระบบ] of [["ติดต่อแล้ว", false], ["เก็บข้อมูลลูกค้า", false], ["สรุปความต้องการ", false], ["นัดหมาย", true], ["ส่งคำขอราคา", true],
                             ["ได้ใบ HQ", true], ["จัดทำใบเสนอราคา", true], ["ส่งใบเสนอราคา", true], ["ติดตามลูกค้า", false]] as const) {
    const ช่อง = page.getByRole("checkbox", { name: new RegExp(`^${ชื่อ}`) }).first();
    await expect.soft(ช่อง, `มีรายการ "${ชื่อ}"`).toBeVisible();
    if (ระบบ) await expect.soft(ช่อง, `"${ชื่อ}" ระบบติ๊ก — กดเองไม่ได้`).toBeDisabled();
    else await expect.soft(ช่อง, `"${ชื่อ}" ติ๊กเองได้`).toBeEnabled();
  }
  // 2) วันที่ พ.ศ. (ข้อมูลเดิม "2026-06-02")
  const ติดต่อ = page.getByRole("checkbox", { name: /^ติดต่อแล้ว/ }).first();
  await expect.soft(ติดต่อ, "วันที่ทำเป็น พ.ศ.").toContainText("2 มิ.ย. 2569");
  await expect.soft(ติดต่อ, "ไม่แสดงวันที่ ค.ศ.").not.toContainText("2026");
  void รายการ;

  // 4) ดีลเลอร์สั่งติ๊กงานของระบบที่ฐานตรง ๆ ไม่ได้ · งานติ๊กเองยังติ๊กได้
  const sb = await db(RYG);
  const ระบบ = await sb.rpc("lead_apply", { p_id: `#L-${เลข}`, p_intent: { tasks: [{ key: "requestQuote", done: true }] } });
  expect.soft(ระบบ.error?.message ?? "", "ฐาน: ดีลเลอร์ติ๊กงานของระบบไม่ได้").toMatch(/system_task_locked/);
  const เอง = await sb.rpc("lead_apply", { p_id: `#L-${เลข}`, p_intent: { tasks: [{ key: "collect", done: true }] } });
  expect.soft(เอง.error?.message ?? "", "ฐาน: งานติ๊กเองยังติ๊กได้").toBe("");
  const แถว = (await admin.from("leads").select("status, tasks").eq("dealer_code", "RYG").eq("num_id", เลข).single()).data;
  expect.soft(แถว?.status, "ติ๊กงานเองไม่เปลี่ยนขั้นของลีด").toBe("BULLET");

  // 3) ส่งคำขอราคา → ฐานติ๊ก "ส่งคำขอราคา" · HQ ส่งใบ → "ได้ใบ HQ"
  ใบ = await เตรียมใบHQ(RYG, { dealerCode: "RYG", company: `${ชื่อลีด}-ใบ`, province: "ระยอง", lines: [{ name: "ZZTEST โครงหลัก", qty: 1, unit: "ชุด", unitCost: 1000 }] });
  const งาน = ((await admin.from("leads").select("tasks").eq("dealer_code", "RYG").eq("num_id", ใบ.leadNum).single()).data?.tasks ?? []) as { key: string; done: boolean; doneAt?: string }[];
  const ติ๊ก = (k: string) => งาน.find(t => t.key === k);
  expect.soft(ติ๊ก("requestQuote")?.done, "ส่งคำขอราคาแล้ว \"ส่งคำขอราคา\" ถูกติ๊ก").toBe(true);
  expect.soft(ติ๊ก("hqQuote")?.done, "HQ ส่งใบแล้ว \"ได้ใบ HQ\" ถูกติ๊ก").toBe(true);
  expect.soft(ติ๊ก("requestQuote")?.doneAt ?? "", "วันที่ที่ฐานติ๊กเป็น พ.ศ.").toMatch(/25\d\d/);
  const ช่องคำขอ = (await เปิดรายการเตือน(page, `${ชื่อลีด}-ใบ`), page.getByRole("checkbox", { name: /^ส่งคำขอราคา/ }).first());
  await expect.soft(ช่องคำขอ, "หน้าจอเห็นติ๊กแล้ว").toHaveAttribute("aria-checked", "true", { timeout: 15_000 });
});

test("[func·hq] ตั้งค่า › เส้นทางการขาย: 5 ขั้นใหม่ · ลบได้เฉพาะรายการติ๊กเอง · ฐานไม่รับแม่แบบที่ตัดรายการของระบบ", async ({ page }) => {
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await page.goto(`${HQ_ORIGIN}/hq/settings`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: "เส้นทางการขาย" }).first().click();
  for (const [i, ชื่อ] of ["ข้อมูลลูกค้า", "ขอราคา HQ", "ได้ใบ HQ", "ทำใบให้ลูกค้า", "รอลูกค้าตอบ"].entries())
    await expect.soft(page.locator(`[data-journey-step="${i + 1}"]`), `ขั้น ${i + 1} ${ชื่อ}`).toContainText(ชื่อ, { timeout: 15_000 });
  // ป้ายขั้นไม่มีเลขลำดับ (บอสสั่ง 28 ต.ค. 69) — แถวขั้นต้องขึ้นต้นด้วยชื่อขั้น ไม่ใช่เลข
  for (const [i, ชื่อ] of ["ข้อมูลลูกค้า", "ขอราคา HQ", "ได้ใบ HQ", "ทำใบให้ลูกค้า", "รอลูกค้าตอบ"].entries())
    expect.soft((await page.locator(`[data-journey-step="${i + 1}"]`).innerText()).trim(), `ขั้น ${ชื่อ}: ไม่มีเลขลำดับนำหน้า`).toMatch(new RegExp(`^${ชื่อ}`));
  for (const ชื่อ of ["นัดหมาย", "ส่งคำขอราคา", "ได้ใบ HQ", "จัดทำใบเสนอราคา", "ส่งใบเสนอราคา"])
    await expect.soft(page.getByRole("button", { name: `ลบงาน ${ชื่อ}` }), `"${ชื่อ}" ระบบติ๊ก — ลบไม่ได้`).toHaveCount(0);
  await expect.soft(page.getByRole("button", { name: "ลบงาน ติดตามลูกค้า" }), "รายการติ๊กเองลบได้").toHaveCount(1);
  for (const เก่า of ["ติดตามผล", "เจรจาต่อรอง"])
    await expect.soft(page.locator(`input[value="${เก่า}"]`), `ไม่มี "${เก่า}"`).toHaveCount(0);

  const hq = await db(ADMIN);
  const เดิม = (await admin.from("hq_sales_journey").select("tasks").eq("id", 1).single()).data?.tasks as { key: string }[];
  const ตัด = await hq.from("hq_sales_journey").update({ tasks: (เดิม ?? []).filter(t => t.key !== "requestQuote") }).eq("id", 1);
  if (!ตัด.error) await admin.from("hq_sales_journey").update({ tasks: เดิม }).eq("id", 1);   // ฐานยอม (ผิด) = คืนค่าทันที ไม่ให้กระทบชุดอื่น
  expect.soft(ตัด.error?.message ?? "", "ฐาน: HQ ตัดรายการของระบบไม่ได้").toMatch(/system_task_locked/);
  const ปัจจุบัน = (await admin.from("hq_sales_journey").select("tasks").eq("id", 1).single()).data?.tasks as { key: string }[];
  expect.soft((ปัจจุบัน ?? []).some(t => t.key === "requestQuote"), "แม่แบบยังมีรายการของระบบครบ").toBe(true);
});
