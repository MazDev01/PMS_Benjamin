// ── เป้าทั้งเครือ กับ ผลรวมเป้าที่แจกให้ดีลเลอร์ เป็นคนละค่า ต้องบอกส่วนต่างให้เห็น ──
//
// ที่มา (ผลตรวจภายนอก HQ-01 · 24 ส.ค. 69): แดชบอร์ดคิด % จาก "เป้าที่ผู้บริหารตั้ง"
// ส่วนหน้าดีลเลอร์คิดจาก "ผลรวมเป้าที่แจกลงไป" — สองเลขนี้ต่างกันได้โดยชอบธรรม
// แต่เดิมไม่มีที่ไหนบอกไว้เลย ผู้บริหารจึงเห็น % ขัดกันแล้วไม่รู้ว่าอันไหนจริง
import { test, expect } from "@playwright/test";
import { ADMIN, skipReason } from "./supabaseEnv";
import { openAs, settle } from "./helpers";
import { createClient } from "@supabase/supabase-js";
import { ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY } from "./adminEnv";

const db = createClient(ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY);
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(180_000);

test("[func·hq] หน้าตั้งค่าเป้าหมาย ต้องบอกผลรวมเป้าที่แจกให้ดีลเลอร์ตามจริง", async ({ page }) => {
  // แถว HQ (สำนักงานใหญ่ · เจ้าของลีดของ HQ) ไม่ใช่ดีลเลอร์ — ไม่นับในตัวเลขดีลเลอร์ทุกที่ (รอบ 2 ช่วง ข · flow-b-hq-dealers [ข·1])
  const { data } = await db.from("dealers").select("revenue_target").neq("code", "HQ");
  const แจก = (data ?? []).reduce((s, d) => s + Number(d.revenue_target || 0), 0);
  const ที่คาด = `฿${(แจก / 1e6).toFixed(1)}M`;

  await openAs(page, ADMIN, "hq", "/hq/settings");
  await settle(page);
  await page.getByRole("button", { name: /เป้าหมายยอดขาย/ }).first().click();
  await page.waitForTimeout(1200);

  // กล่องเทียบส่วนต่าง = บรรทัดที่มีทั้งข้อความและตัวเลข (ไม่ใช่คำอธิบายใต้ช่องกรอก)
  const กล่อง = page.locator("div").filter({ hasText: /^ผลรวมเป้าที่แจกให้ดีลเลอร์ \d+ สาขา:/ }).last();
  await expect(กล่อง, "ต้องมีกล่องเทียบเป้าทั้งเครือกับที่แจกจริง").toBeVisible({ timeout: 10_000 });
  const ข้อความ = (await กล่อง.innerText()).replace(/\s+/g, " ");
  console.log("บนจอ:", ข้อความ.slice(0, 160));
  console.log("ผลรวมจริงจากฐานข้อมูล:", ที่คาด);
  expect(ข้อความ, "ตัวเลขบนจอต้องตรงกับผลรวมเป้าดีลเลอร์จริง").toContain(ที่คาด);
});

// ── "ทำได้จริง" รายภูมิภาค ต้องตามยอดจริง แม้ยอดผลงานมาถึงหลังทะเบียนดีลเลอร์ (ผลตรวจเทียบ FLOW รอบ 5 แถว 33 · 28 ต.ค. 69) ──
//   เจอ: ตาราง "เป้าหมายรายภูมิภาค" ทำได้จริง ฿0 / 0% ทุกภาค ขณะที่ "ความคืบหน้าทั้งเครือ" ทำได้จริง ฿182.8M
//   ต้นเหตุ: ตัวรวมรายภูมิภาคคิดครั้งเดียวตอนทะเบียนดีลเลอร์มาถึง ไม่คิดใหม่ตอนยอดผลงานมาถึงทีหลัง
//   ข้อนี้หน่วงคำตอบยอดผลงานไว้ให้มาทีหลังเสมอ (บนเว็บจริงลำดับนี้เกิดเองแทบทุกครั้ง) แล้วเทียบผลรวมทุกภาคกับทั้งเครือ
const เป็นบาท = (t: string): number => {
  const m = /฿([\d.,]+)(M?)/.exec(t);
  if (!m) return NaN;
  const n = Number(m[1].replace(/,/g, ""));
  return m[2] ? n * 1e6 : n;
};
test("[func·hq] เป้าหมายรายภูมิภาค: ทำได้จริงรวมทุกภาค = ทั้งเครือ แม้ยอดมาถึงหลังทะเบียนดีลเลอร์", async ({ page }) => {
  await page.route(/\/api\/v1\/metrics\?k=dealerRollup|\/rest\/v1\/rpc\/dealer_rollup/, async route => {
    await new Promise(r => setTimeout(r, 2500));
    await route.continue();
  });
  await openAs(page, ADMIN, "hq", "/hq/settings");
  await settle(page);
  await page.getByRole("button", { name: /เป้าหมายยอดขาย/ }).first().click();

  const การ์ด = (ชื่อ: string) => page.locator("[data-section-card]").filter({ has: page.locator(".card-title", { hasText: ชื่อ }) });
  // ทั้งเครือ: รอจนยอดมาถึง (ก่อนมาขึ้น "—")
  let ทั้งเครือ = NaN;
  await expect.poll(async () => {
    const t = (await การ์ด("ความคืบหน้าทั้งเครือ").innerText()).replace(/\s+/g, " ");
    ทั้งเครือ = เป็นบาท(/ทำได้จริง ?(฿[\d.,]+M?)/.exec(t)?.[1] ?? "");
    return ทั้งเครือ;
  }, { message: "ยอดทั้งเครือต้องมาถึง", timeout: 30_000 }).toBeGreaterThan(0);

  // รายภูมิภาค: คอลัมน์ที่ 4 = ทำได้จริง · ผลรวมทุกภาคต้องเท่าทั้งเครือ (คลาดได้แค่จากการปัดเศษ ฿x.xM ต่อแถว)
  const ตาราง = การ์ด("เป้าหมายรายภูมิภาค").locator("tbody tr");
  let ผลรวม = 0, แถว = 0;
  await expect.poll(async () => {
    const ค่า = await ตาราง.locator("td:nth-child(4)").allInnerTexts();
    แถว = ค่า.length;
    ผลรวม = ค่า.reduce((s, t) => s + (เป็นบาท(t) || 0), 0);
    return Math.abs(ผลรวม - ทั้งเครือ) <= 0.06e6 * Math.max(1, แถว) + 0.06e6;
  }, { message: "ทำได้จริงรวมทุกภาคต้องเท่าทั้งเครือ (เดิมค้าง ฿0 ทุกภาค)", timeout: 20_000 }).toBe(true);
  console.log(`ทั้งเครือ ${ทั้งเครือ} · รวม ${แถว} ภาค ${ผลรวม}`);
});
