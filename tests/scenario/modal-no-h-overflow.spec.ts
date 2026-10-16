// ── ฟอร์มในกล่องต้องไม่ล้นแนวนอน (บอสทัก 28 ส.ค. 69) ────────────────────────────
//
// อาการที่บอสเจอ: ฟอร์มในกล่องมีแถบเลื่อนแนวนอนโผล่ใต้ฟอร์ม ต้องลากไปมาถึงจะเห็นครบ
// ต้นเหตุ: <input> มีความกว้างขั้นต่ำในตัวราว 170px และ flexbox จะไม่ยอมย่อให้ต่ำกว่านั้น
//   ถ้าไม่สั่ง minWidth:0 → แถวช่องกรอกล้นกล่อง
//
// เดิมวัดที่ฟอร์มแก้ไขแม่แบบ (หน้า /hq/master) — หน้านั้นลบแล้ว 16 ต.ค. 69 (เอาแม่แบบออกทั้งระบบ)
//   ย้ายมาวัดที่ฟอร์มที่ใช้บ่อยที่สุดแทน: กล่อง "เพิ่มลูกค้าเป้าหมาย" ของดีลเลอร์ (แถวช่องกรอกหลายช่องเรียงกัน)
//
// ⚠️ การขยายกล่องให้กว้างขึ้นอย่างเดียว "ไม่ใช่การแก้" — แค่ทำให้พ้นอาการที่จอใหญ่
//    เทสต์จึงวัดที่จอแคบด้วย ถ้าวันหนึ่งมีคนเอา minWidth:0 ออก จะจับได้ทันที
import { test, expect } from "@playwright/test";
import { RYG, skipReason } from "./supabaseEnv";
import { DEALER_ORIGIN, loginUI } from "./funcHelpers";
import { settle } from "./helpers";

test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");

for (const กว้าง of [1280, 900]) {
  test(`[ui·dealer] กล่องเพิ่มลูกค้าเป้าหมายต้องไม่ล้นแนวนอน ที่จอกว้าง ${กว้าง}`, async ({ page }) => {
    await page.setViewportSize({ width: กว้าง, height: 900 });
    await loginUI(page, DEALER_ORIGIN, "/login", RYG);
    await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
    await settle(page);
    await page.getByRole("button", { name: "เพิ่มลูกค้าเป้าหมาย" }).first().click();
    const กล่อง = page.getByRole("dialog", { name: "เพิ่มลูกค้าเป้าหมาย" });
    await expect(กล่อง.getByPlaceholder("เช่น บริษัท ตัวอย่าง จำกัด")).toBeVisible({ timeout: 15_000 });

    const ล้น = await กล่อง.evaluate(root => {
      const ผล: { cls: string; scroll: number; client: number }[] = [];
      for (const el of [root, ...Array.from(root.querySelectorAll("*"))] as HTMLElement[]) {
        if (el.scrollWidth - el.clientWidth > 1) {
          ผล.push({ cls: `${el.tagName}.${(el.className || "").toString().slice(0, 40)}`, scroll: el.scrollWidth, client: el.clientWidth });
        }
      }
      return ผล;
    });
    expect(ล้น, "ต้องไม่มีอะไรในฟอร์มล้นแนวนอน (แถบเลื่อนล่างจะโผล่)").toEqual([]);
  });
}
