import { test, expect } from "@playwright/test";
import { ADMIN, RYG, skipReason, type Account } from "./supabaseEnv";
import { DEALER_ORIGIN, HQ_ORIGIN, loginUI } from "./funcHelpers";
import { settle } from "./helpers";

// ── หัวตารางบรรทัดเดียว ไม่ตัดคำ ทุกตาราง HQ + ดีลเลอร์ (บอสสั่ง 10 พ.ย. 69 · ต่อจากล็อกความกว้างคอลัมน์) ─────────────────
//   เดิม: ตารางพอดีจอ (.table-wrap.fit) ให้หัวขึ้นบรรทัดได้ → "ลูกค้าเป้า/หมาย" "อัตราปิดการ/ขาย" 2 บรรทัด
//   ตอนนี้: หัวบรรทัดเดียว (white-space: nowrap) · คอลัมน์ไม่แคบกว่าหัว · ใส่ไม่พอ = ลดขนาดตัวอักษรหัวทั้งแถว (useHeaderFit · ต่ำสุด 0.8)
//   วัด: ข้อความในหัวแต่ละช่องอยู่บรรทัดเดียว (กล่องตัวอักษรทุกชิ้นอยู่แนวเดียวกัน) · ไม่ถูกตัด · หน้าไม่มีแถบเลื่อนแนวนอน
//   ตกบนโค้ดเดิม: ภาพรวมยอดขาย/เจาะลึก/ทั้งเครือที่จอ 1366 หัวขึ้น 2 บรรทัด
test.skip(() => skipReason() !== "", skipReason());
test.setTimeout(600_000);

const สำนักงานใหญ่ = ["/hq/dashboard", "/hq/prospects", "/hq/proposals", "/hq/dealers?view=table", "/hq/pipeline", "/hq/quote-requests",
  "/hq/leads", "/hq/quotations", "/hq/customers", "/hq/audit", "/hq/users"];
const ดีลเลอร์ = ["/dashboard", "/leads", "/quotations", "/customers", "/calendar", "/files"];

for (const [แอป, origin, path, who, หน้า] of [
  ["HQ", HQ_ORIGIN, "/hq/login", ADMIN, สำนักงานใหญ่],
  ["ดีลเลอร์", DEALER_ORIGIN, "/login", RYG, ดีลเลอร์],
] as [string, string, string, Account, string[]][]) {
  test(`[ui·${แอป}] หัวตารางทุกหน้าบรรทัดเดียว ไม่ตัดคำ ไม่มีแถบเลื่อนแนวนอน ที่จอ 1366 / 1920`, async ({ page }) => {
    await loginUI(page, origin, path, who);
    const ผิด: string[] = [];
    for (const w of [1366, 1920]) {
      await page.setViewportSize({ width: w, height: 900 });
      for (const p of หน้า) {
        await page.goto(`${origin}${p}`, { waitUntil: "domcontentloaded" });
        await settle(page);
        if (แอป === "ดีลเลอร์" && p === "/leads") await page.getByRole("button", { name: "ตาราง", exact: true }).click();
        await page.locator("thead th").first().waitFor({ state: "visible", timeout: 5_000 }).catch(() => {});
        // ตัวปรับหัวตาราง (useHeaderFit) ทำงานในเฟรมถัดไป — รอให้ทุกตารางที่เห็นมีค่าตัวคูณแล้ว
        await expect.poll(() => page.evaluate(() => [...document.querySelectorAll<HTMLTableElement>(".table-wrap table")]
          .filter(t => t.offsetParent && t.querySelector("thead th")).every(t => t.dataset.thScale)), { message: `${p} @${w}: ตัวปรับหัวตารางทำงาน`, timeout: 10_000 }).toBe(true);
        const ปัญหา = await page.evaluate(() => {
          const out: string[] = [];
          for (const th of document.querySelectorAll<HTMLElement>("thead th")) {
            if (!th.offsetParent) continue;
            const ข้อความ = (th.textContent ?? "").replace(/\s+/g, " ").trim();
            if (!ข้อความ) continue;
            // กล่องตัวอักษรของทุกข้อความในช่อง (ไม่นับไอคอน) — บรรทัดเดียว = ขอบบนห่างกันไม่เกินครึ่งบรรทัด
            const ชิ้น: DOMRect[] = [];
            const เดิน = document.createTreeWalker(th, NodeFilter.SHOW_TEXT);
            for (let n = เดิน.nextNode(); n; n = เดิน.nextNode()) {
              if (!(n.textContent ?? "").trim()) continue;
              const r = document.createRange(); r.selectNodeContents(n);
              ชิ้น.push(...[...r.getClientRects()].filter(x => x.width > 0));
            }
            const สูง = parseFloat(getComputedStyle(th).fontSize) || 11;
            const บน = ชิ้น.map(x => x.top);
            if (บน.length && Math.max(...บน) - Math.min(...บน) > สูง * 0.5) out.push(`"${ข้อความ}" ขึ้นหลายบรรทัด`);
            if (th.scrollWidth > th.clientWidth + 1) out.push(`"${ข้อความ}" ถูกตัด (${th.clientWidth}/${th.scrollWidth})`);
          }
          const ล้น = document.documentElement.scrollWidth - document.documentElement.clientWidth;
          if (ล้น > 1) out.push(`หน้ามีแถบเลื่อนแนวนอน ${ล้น}px`);
          return out;
        });
        for (const x of ปัญหา) ผิด.push(`${p} @${w}: ${x}`);
      }
    }
    expect(ผิด, `${แอป}: หัวตารางที่ไม่ใช่บรรทัดเดียว/ถูกตัด/หน้าล้น`).toEqual([]);
  });
}
