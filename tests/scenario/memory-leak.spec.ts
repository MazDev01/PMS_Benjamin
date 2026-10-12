import { test, expect, type Page, type CDPSession } from "@playwright/test";
import { RYG, ADMIN, skipReason } from "./supabaseEnv";
import { DEALER_ORIGIN, HQ_ORIGIN, loginUI } from "./funcHelpers";
import { settle } from "./helpers";

// ── Memory Leak — เปิด/ปิดหน้าเดิม หรือเปลี่ยนหน้าซ้ำๆ นานๆ แล้วดูว่าหน่วยความจำ (JS heap)
//    ของเบราว์เซอร์โตขึ้นเรื่อยๆ ไม่มีที่สิ้นสุดไหม (สัญญาณของ event listener/subscription ที่ลืม cleanup)
// วิธี: บังคับ garbage collect ผ่าน CDP (HeapProfiler.collectGarbage) ก่อนวัดทุกครั้ง แล้วอ่านค่าจริง
//   ผ่าน Performance.getMetrics() (JSHeapUsedSize) — แม่นกว่า performance.memory.usedJSHeapSize
//   ทาง JS ตรง ๆ มาก (ทดลองแล้ว performance.memory คืนค่าเดิมเป๊ะทุกครั้งในเซสชันสั้น ๆ แบบนี้
//   เพราะ Chrome ปัดละเอียด/หน่วงการอัปเดตค่านั้นไว้กันการพิสูจน์ตัวตนผ่านพฤติกรรมหน่วยความจำ)
// เกณฑ์ตัดสิน: ไม่ใช่ "ห้ามโตเลย" (บางอย่างโตแล้วคงที่ได้ปกติ เช่น cache) แต่ต้อง "ไม่โตเป็นเส้นตรงไม่หยุด"
//   วัดจาก slope ของรอบหลัง ๆ (ควรเข้าใกล้ 0) เทียบกับรอบแรก ๆ (มักโตเพราะ warm-up/cache ครั้งแรก)
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(180_000);

async function newHeapSampler(page: Page): Promise<{ sample: () => Promise<number>; close: () => Promise<void> }> {
  const client: CDPSession = await page.context().newCDPSession(page);
  await client.send("Performance.enable");
  const sample = async () => {
    await client.send("HeapProfiler.enable").catch(() => {});
    await client.send("HeapProfiler.collectGarbage").catch(() => {});
    await client.send("HeapProfiler.disable").catch(() => {});
    const { metrics } = await client.send("Performance.getMetrics");
    return metrics.find(m => m.name === "JSHeapUsedSize")?.value ?? 0;
  };
  return { sample, close: () => client.detach().catch(() => {}) };
}

// เทียบ slope ของครึ่งหลังกับครึ่งแรก — รั่วจริงจะโตต่อเนื่องไม่หยุดทั้งสองครึ่ง (slope ใกล้เคียงกัน/ไม่ลดลง)
// ไม่รั่วจริงจะ "ชะลอ" ชัดเจนหลัง warm-up (ครึ่งหลัง slope ต่ำกว่าครึ่งแรกมาก หรือติดลบ)
function analyzeGrowth(samples: number[], label: string) {
  const n = samples.length;
  const mid = Math.floor(n / 2);
  const firstHalfGrowth = samples[mid - 1] - samples[0];
  const secondHalfGrowth = samples[n - 1] - samples[mid];
  const totalGrowthMB = (samples[n - 1] - samples[0]) / 1024 / 1024;
  console.log(`[memory] ${label}: samples(MB)=${samples.map(s => (s / 1024 / 1024).toFixed(2)).join(",")}`);
  console.log(`[memory] ${label}: โตครึ่งแรก=${(firstHalfGrowth / 1024 / 1024).toFixed(2)}MB · โตครึ่งหลัง=${(secondHalfGrowth / 1024 / 1024).toFixed(2)}MB · รวม=${totalGrowthMB.toFixed(2)}MB`);
  return { firstHalfGrowth, secondHalfGrowth, totalGrowthMB };
}

test("[memory] เปิด-ปิดแผงรายละเอียดลูกค้าเป้าหมายซ้ำ 15 รอบ → หน่วยความจำต้องไม่โตต่อเนื่องไม่หยุด", async ({ page }) => {
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "ตาราง" }).click();
  await expect(page.locator("tbody tr").first()).toBeVisible({ timeout: 15_000 });
  const heap = await newHeapSampler(page);

  const samples: number[] = [];
  samples.push(await heap.sample());
  for (let i = 0; i < 15; i++) {
    const row = page.locator("tbody tr").first();
    await row.getByRole("button", { name: "ดูรายละเอียด" }).first().click();
    // getByTitle("ปิด") แบบไม่ exact ชนกับปุ่มกรอง "กรอง: อัตราปิดการขาย" (มีคำว่า "ปิด" อยู่ในนั้นด้วย)
    const closeBtn = page.getByTitle("ปิด", { exact: true });
    await expect(closeBtn).toBeVisible({ timeout: 8_000 });
    await closeBtn.click();
    await expect(closeBtn).toHaveCount(0, { timeout: 8_000 });
    if (i % 3 === 2) samples.push(await heap.sample()); // สุ่มตัวอย่างทุก 3 รอบ กันช้าเกิน
  }
  samples.push(await heap.sample());
  await heap.close();

  const { secondHalfGrowth, totalGrowthMB } = analyzeGrowth(samples, "เปิด-ปิดแผงลูกค้าเป้าหมาย 15 รอบ");
  // เกณฑ์: โตรวมทั้งหมดไม่เกิน 15MB (หน้านี้มีข้อมูล seed ไม่มาก) และครึ่งหลังต้องไม่โตต่อเนื่องแรงเท่าครึ่งแรก
  expect(totalGrowthMB, `หน่วยความจำโตรวม ${totalGrowthMB.toFixed(2)}MB จาก 15 รอบเปิด-ปิด`).toBeLessThan(15);
  expect(secondHalfGrowth, "ครึ่งหลังต้องไม่โตต่อเนื่องไม่หยุด (สัญญาณรั่ว)").toBeLessThan(8 * 1024 * 1024);
});

// คลิกลิงก์แถบเมนูจริง (Next.js client-side navigation ไม่ reload หน้า) แทน page.goto() — goto()
// รีเซ็ต JS context ทั้งหมดทุกครั้งจึงวัดการรั่วของ SPA จริงไม่ได้เลย (ทดลองแล้วโตเป็น 0.00MB
// ทุกตัวอย่าง ซึ่งไม่ใช่ผลจริง — เป็นเพราะ heap ถูกรีเซ็ตพร้อมหน้าใหม่ทุกครั้ง)
test("[memory] สลับหน้าไปมา (ดีลเลอร์) 20 รอบ ผ่านเมนูจริง (client-side nav) → หน่วยความจำต้องไม่โตต่อเนื่องไม่หยุด", async ({ page }) => {
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  const labels = ["แดชบอร์ด", "ลูกค้าเป้าหมาย", "ใบเสนอราคา", "ลูกค้า"];
  await page.goto(`${DEALER_ORIGIN}/dashboard`, { waitUntil: "domcontentloaded" });
  await settle(page);
  const heap = await newHeapSampler(page);

  const samples: number[] = [];
  samples.push(await heap.sample());
  for (let i = 0; i < 20; i++) {
    const label = labels[i % labels.length];
    await page.getByRole("link", { name: label, exact: true }).click();
    await page.waitForTimeout(500); // เผื่อ effect/fetch เริ่มทำงานก่อนไปหน้าถัดไป
    if (i % 4 === 3) samples.push(await heap.sample());
  }
  samples.push(await heap.sample());
  await heap.close();

  const { secondHalfGrowth, totalGrowthMB } = analyzeGrowth(samples, "สลับหน้าดีลเลอร์ 20 รอบ (client-side)");
  expect(totalGrowthMB, `หน่วยความจำโตรวม ${totalGrowthMB.toFixed(2)}MB จาก 20 รอบสลับหน้า`).toBeLessThan(25);
  expect(secondHalfGrowth, "ครึ่งหลังต้องไม่โตต่อเนื่องไม่หยุด (สัญญาณรั่ว)").toBeLessThan(12 * 1024 * 1024);
});

test("[memory·hq] สลับหน้า HQ (มีกราฟ) 15 รอบ ผ่านเมนูจริง (client-side nav) → หน่วยความจำต้องไม่โตต่อเนื่องไม่หยุด", async ({ page }) => {
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  const labels = ["แดชบอร์ดสำนักงานใหญ่", "ภาพรวมยอดขาย", "ใบเสนอราคาทั้งเครือ", "ลูกค้าทั้งเครือ"];
  await page.goto(`${HQ_ORIGIN}/hq/dashboard`, { waitUntil: "domcontentloaded" });
  await settle(page);
  const heap = await newHeapSampler(page);

  const samples: number[] = [];
  samples.push(await heap.sample());
  for (let i = 0; i < 15; i++) {
    const label = labels[i % labels.length];
    await page.getByRole("link", { name: label, exact: true }).click();
    await page.waitForTimeout(600);
    if (i % 3 === 2) samples.push(await heap.sample());
  }
  samples.push(await heap.sample());
  await heap.close();

  const { secondHalfGrowth, totalGrowthMB } = analyzeGrowth(samples, "สลับหน้า HQ (มีกราฟ) 15 รอบ (client-side)");
  expect(totalGrowthMB, `หน่วยความจำโตรวม ${totalGrowthMB.toFixed(2)}MB จาก 15 รอบสลับหน้า HQ`).toBeLessThan(30);
  expect(secondHalfGrowth, "ครึ่งหลังต้องไม่โตต่อเนื่องไม่หยุด (สัญญาณรั่ว)").toBeLessThan(15 * 1024 * 1024);
});
