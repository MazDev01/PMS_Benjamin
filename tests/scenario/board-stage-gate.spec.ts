// ── ย้ายขั้นบนกระดาน: ข้ามงานไม่ได้ · ถอยหลังต้องยืนยัน (บอสสั่ง 21 ส.ค. 69) ────────
//
// ทำไมต้องมี: ลากการ์ดข้ามไปขั้นท้าย ๆ ได้เลย = ขั้นของดีลบอกว่าทำถึงตรงนั้นแล้ว
// ทั้งที่งานจริงยังไม่ได้ทำ → รายงานของสำนักงานใหญ่อ่านผิดทั้งชุด
import { test, expect } from "@playwright/test";
import { กดยกเลิกในกล่องยืนยัน } from "./helpers";
import { RYG, skipReason } from "./supabaseEnv";
import { DEALER_ORIGIN, loginUI, db, cleanup, specNS, nsTag } from "./funcHelpers";
import { settle } from "./helpers";

const NS = specNS("BGATE");
const tg = nsTag(NS);
const COMPANY = tg("ด่านกระดาน");

test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(240_000);
test.describe.configure({ mode: "serial" });

async function seedLead(ติ๊กถึง: number) {
  const sb = await db(RYG);
  const numId = 940000 + (Date.now() % 9000);
  const { data: j } = await sb.from("hq_sales_journey").select("tasks").eq("id", 1).maybeSingle();
  const tpl = (j?.tasks as { key: string; label: string }[] | null) ?? [];
  await sb.from("leads").delete().eq("dealer_code", "RYG").eq("company", COMPANY);
  await sb.from("leads").insert({ phone: "081-999-0101",
    id: `#L-${numId}`, num_id: numId, dealer_code: "RYG", company: COMPANY, name: COMPANY,
    contact: "ผู้ทดสอบ", province: "ระยอง", product: "โกดังสำเร็จรูป", status: "WAITING",
    value: "500000", area: "120", assigned: "ผู้ทดสอบ",
    tasks: tpl.map((t, i) => ({ key: t.key, label: t.label, done: i < ติ๊กถึง,
      ...(i < ติ๊กถึง ? { doneAt: "1 ส.ค. 2569 · 10:00", doneBy: "ผู้ทดสอบ" } : {}) })),
  });
  return tpl;
}
test.afterAll(async () => { await cleanup(await db(RYG), "RYG", NS); });

async function เปิดเมนูขั้น(page: import("@playwright/test").Page) {
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: "ตาราง" }).click();
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(COMPANY);
  const row = page.locator("tbody tr").filter({ hasText: COMPANY }).first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.locator("button.badge").first().click();
  await expect(page.locator('[data-menu="stage"]')).toBeVisible({ timeout: 10_000 });
}

test("[func] งานยังไม่ครบ → ย้ายขั้นไม่ได้ และบอกว่าเหลืองานอะไร", async ({ page }) => {
  const tpl = await seedLead(1);                 // ติ๊กแค่งานแรก
  test.skip(tpl.length < 4, "เส้นทางการขายในฐานทดสอบสั้นเกินกว่าจะทดสอบ");
  const sb = await db(RYG);
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await เปิดเมนูขั้น(page);

  await page.locator('[data-menu="stage"]').getByText("เจรจาต่อรอง", { exact: true }).click();

  // ต้องบอกว่าเหลืองานอะไร และขั้นในฐานข้อมูลต้องไม่ขยับ
  await expect(page.getByText(/ย้ายขั้นไม่ได้ — เหลือ/), "ต้องบอกว่าเหลืองานอะไรบ้าง")
    .toBeVisible({ timeout: 15_000 });

  // ★ ต้อง "เด้งไปทำงานนั้น" ให้เลย ไม่ใช่แค่บอกว่าเหลืออะไร (บอสสั่ง 21 ส.ค. 69)
  //   งานที่ค้างงานแรกของชุดนี้คือ "เก็บข้อมูลลูกค้า/นัดหมาย" → ต้องเปิดแผงของดีลนั้นให้ทำต่อได้ทันที
  await expect(page.getByRole("button", { name: "งาน", exact: true }).first()
    .or(page.getByRole("button", { name: /เพิ่มนัดหมาย|บันทึกนัดหมาย/ }).first()),
  "ต้องพาไปหน้าที่ลงมือทำงานนั้นได้ทันที").toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1500);
  const st = (await sb.from("leads").select("status").eq("company", COMPANY).single()).data?.status;
  expect(st, "งานไม่ครบแล้วขั้นต้องไม่ขยับ").toBe("WAITING");
});

test("[func] งานครบแล้ว → ย้ายขั้นเดินหน้าได้", async ({ page }) => {
  const tpl = await seedLead(99);                // ติ๊กครบทุกงาน
  test.skip(tpl.length < 4, "เส้นทางการขายในฐานทดสอบสั้นเกินกว่าจะทดสอบ");
  const sb = await db(RYG);
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await เปิดเมนูขั้น(page);
  await page.locator('[data-menu="stage"]').getByText("เจรจาต่อรอง", { exact: true }).click();

  await expect.poll(async () =>
    (await sb.from("leads").select("status").eq("company", COMPANY).single()).data?.status,
    { timeout: 20_000, message: "งานครบแล้วต้องย้ายขั้นได้" }).toBe("NEGO");
});

test("[func] ถอยขั้นกลับ → ต้องถามยืนยันก่อน · กดยกเลิกแล้วขั้นต้องไม่เปลี่ยน", async ({ page }) => {
  await seedLead(99);
  const sb = await db(RYG);
  await sb.from("leads").update({ status: "NEGO" }).eq("company", COMPANY);
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);

  await เปิดเมนูขั้น(page);
  await page.locator('[data-menu="stage"]').getByText("ติดต่อแล้ว", { exact: true }).click();
  const ถาม = await กดยกเลิกในกล่องยืนยัน(page);   // กล่องยืนยันของระบบ (sonner) ไม่ใช่กล่องเบราว์เซอร์แล้ว
  await page.waitForTimeout(1500);

  expect(ถาม, "ถอยขั้นต้องมีกล่องยืนยันเสมอ").toMatch(/ย้อนขั้น/);
  const st = (await sb.from("leads").select("status").eq("company", COMPANY).single()).data?.status;
  expect(st, "กดยกเลิกแล้วขั้นต้องไม่เปลี่ยน").toBe("NEGO");
});
