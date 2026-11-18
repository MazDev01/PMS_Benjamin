import { test, expect, type Page } from "@playwright/test";
import { ADMIN, RYG, skipReason } from "./supabaseEnv";
import { HQ_ORIGIN, DEALER_ORIGIN, loginUI } from "./funcHelpers";
import { settle } from "./helpers";

// ── แถบแท็บ: ไอคอนอยู่ "หน้า" (ซ้าย) ข้อความ บรรทัดเดียวกัน (บอสสั่ง 18 พ.ย. 69) ──────────────────────────────────────
//   บั๊ก: HQ › คำขอใบเสนอราคา แท็บ "ต้องตีราคา (10) / ประวัติคำขอ (165)" ไอคอนอยู่ข้างบนตัวหนังสือ
//   ต้นเหตุ: .tab-item (globals.css) ไม่เป็น flex · svg เป็น block → ขึ้นบรรทัดใหม่ (หน้าตั้งค่าตั้ง flex เองจึงไม่เป็น)
//   แก้ที่ตัวกลาง .tab-item (inline-flex · กลางแนวตั้ง · ระยะ 7px) — ทุกแถบแท็บ HQ + ดีลเลอร์
//   ตรวจทุกแท็บที่มีไอคอน: ไอคอนอยู่ซ้ายของข้อความ (ขอบขวาไอคอน ≤ ขอบซ้ายข้อความ) · กึ่งกลางแนวตั้งต่างกันไม่เกิน 3px
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(120_000);

async function ตรวจแท็บ(page: Page, ชื่อ: string) {
  const แท็บ = page.locator(".tab-item:has(svg)");
  await expect(แท็บ.first(), `${ชื่อ}: มีแท็บที่มีไอคอน`).toBeVisible({ timeout: 30_000 });
  const ผล = await แท็บ.evaluateAll(els => els.map(b => {
    const svg = b.querySelector("svg")!.getBoundingClientRect();
    const r = document.createRange();
    const ข้อความ = [...b.childNodes].filter(n => n.nodeType === Node.TEXT_NODE && n.textContent!.trim());
    if (!ข้อความ.length) return { แท็บ: b.textContent!.trim(), มีข้อความ: false, ซ้าย: true, ระดับ: 0 };
    r.setStartBefore(ข้อความ[0]); r.setEndAfter(ข้อความ[ข้อความ.length - 1]);
    const t = r.getBoundingClientRect();
    return { แท็บ: b.textContent!.trim(), มีข้อความ: true, ซ้าย: svg.right <= t.left + 1,
      ระดับ: Math.round(Math.abs((svg.top + svg.bottom) / 2 - (t.top + t.bottom) / 2)) };
  }));
  for (const x of ผล) {
    expect(x.ซ้าย, `${ชื่อ} แท็บ "${x.แท็บ}": ไอคอนอยู่ซ้ายของข้อความ (ไม่อยู่ข้างบน)`).toBe(true);
    expect(x.ระดับ, `${ชื่อ} แท็บ "${x.แท็บ}": ไอคอนกับข้อความระดับเดียวกัน (ต่าง ≤ 3px)`).toBeLessThanOrEqual(3);
  }
}

for (const [path, ชื่อ] of [["/hq/quote-requests", "HQ คำขอใบเสนอราคา"], ["/hq/settings", "HQ ตั้งค่า"]] as const) {
  test(`[ui·hq] ${ชื่อ}: ไอคอนแท็บอยู่หน้าข้อความ บรรทัดเดียวกัน`, async ({ page }) => {
    await loginUI(page, HQ_ORIGIN, path, ADMIN);
    await settle(page);
    await ตรวจแท็บ(page, ชื่อ);
  });
}
test("[ui·ดีลเลอร์] ตั้งค่า: ไอคอนแท็บอยู่หน้าข้อความ บรรทัดเดียวกัน", async ({ page }) => {
  await loginUI(page, DEALER_ORIGIN, "/settings", RYG);
  await settle(page);
  await ตรวจแท็บ(page, "ดีลเลอร์ ตั้งค่า");
});
