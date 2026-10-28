// ─── ล็อกบั๊ก 5 ข้อที่เจอจาก /scenario (17 ก.ค. 69) ไม่ให้ย้อนกลับ ───────────────
// 1. HQ ไม่ยุบเป็นคอลัมน์เดียวที่ ≤768px — .app.app-hq (0,2,0) ชนะ .app (0,1,0) ใน media query
//    (media query ไม่เพิ่ม specificity) → เนื้อหาถูกบีบเหลือ 244px อีก 524px ว่างเปล่า
// 2. /leads การ์ด "เกิน N วัน" ฮาร์ดโค้ด 7 ทั้งป้ายและตัวกรอง ทั้งที่ตัวเลขนับตามกฎของสาขา
// 3. HQ นับ "ต้องติดตาม" จากรายการสถานะ แต่ป้ายเขียน ">7 วัน" (ไม่ได้นับวันเลย)
// 4. รหัสผ่านดีลเลอร์โชว์เต็มทันทีที่เปิดแถว
// 5. คำว่า "อัตราปิด/ปิดได้ %" ถูกใช้กับหลายสูตร จนอ่านเหมือนตัวเลขขัดกัน
import { test, expect } from "@playwright/test";
import { open } from "./helpers";
import { adminClient } from "./testDealers";
import { REAL_BACKEND } from "./supabaseEnv";

// เทสต์ [2]/[3] seed กฎผ่าน localStorage ใช้ได้กับ "โหมด local" เท่านั้น —
// โหมด supabase แอปอ่านกฎจาก DB (dealer_lead_rules) ไม่ใช่ localStorage → seed ไม่มีผล
// (แพตเทิร์นเดียวกับ dealer-lead-rules.spec.ts — DB-path ตรวจที่ migration 0058/0059 + supabase-rls แล้ว)
const SEED_LOCAL_ONLY = "seed ผ่าน localStorage — ใช้โหมด local เท่านั้น (โหมด DB อ่านจาก dealer_lead_rules)";

// ข้อ 1 — HQ ต้องยุบเป็นคอลัมน์เดียวที่ ≤768px
test.describe("768px", () => {
  test.use({ viewport: { width: 768, height: 900 } });
  for (const p of ["/hq/dashboard", "/hq/leads", "/hq/quotations", "/hq/pipeline", "/hq/customers", "/hq/dealers", "/hq/settings", "/hq/audit"]) {
    test(`[1] ${p} เต็มจอ`, async ({ page }) => {
      await open(page, "hq", p);
      await page.waitForTimeout(700);
      const r = await page.evaluate(() => {
        const main = document.querySelector(".main") as HTMLElement;
        return { grid: getComputedStyle(document.querySelector(".app")!).gridTemplateColumns, over: main.scrollWidth - main.clientWidth };
      });
      expect(r.grid, "ต้องเป็นคอลัมน์เดียว").toBe("768px");
      expect(r.over, "ต้องไม่ล้นแนวนอน").toBeLessThanOrEqual(3);
    });
  }
});

test.describe("อื่น ๆ", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  // ข้อ 2 — การ์ด/ตัวกรองฝั่งดีลเลอร์ ต้องใช้เกณฑ์ของสาขา
  test("[2] /leads ป้ายกับตัวกรองตรงกับกฎที่ตั้ง", async ({ page }) => {
    test.skip(REAL_BACKEND, SEED_LOCAL_ONLY);
    await page.addInitScript(() => localStorage.setItem("dealer_lead_rules", JSON.stringify({ CNX: { followUpAlertDays: 3, unassignedAlertHours: 48 } })));
    await open(page, "dealer", "/leads");
    const card = page.locator(".card").filter({ hasText: /^เกิน \d+ วัน/ }).first();
    await expect(card).toContainText("เกิน 3 วัน");
    await expect(page.getByText("เกิน 7 วัน")).toHaveCount(0);
  });

  // ข้อ 3 — HQ ต้องนับตามเกณฑ์รายสาขา ไม่ใช่รายการสถานะ
  test("[3] HQ ต้องติดตามด่วน ขยับตามกฎสาขา", async ({ page }) => {
    test.skip(REAL_BACKEND, SEED_LOCAL_ONLY);
    await page.addInitScript(() => localStorage.setItem("dealer_lead_rules", JSON.stringify({ CNX: { followUpAlertDays: 1, unassignedAlertHours: 48 } })));
    await open(page, "hq", "/hq/leads");
    const card = page.locator("button.card").filter({ hasText: "ต้องติดตามด่วน" }).first();
    await expect(card).toContainText("แล้วแต่สาขา");           // หลายสาขา = สรุปเป็นช่วง
    await expect(page.getByText("ยังไม่ติดตาม (>7 วัน)")).toHaveCount(0);
    await expect(page.getByRole("columnheader", { name: "เตือน 7 วัน" })).toHaveCount(0);
  });

  // ข้อ 4 — รหัสผ่านต้องถูกปิดบัง
  test("[4] รหัสผ่านดีลเลอร์ถูกปิดบัง", async ({ page }) => {
    await open(page, "hq", "/hq/dealers?view=table");   // หน้าเริ่มเป็นการ์ด — เทสต์นี้ใช้แถวตาราง
    await page.locator("table tbody tr").first().click();
    // ต้องขึ้นจุดไข่ปลา + ปุ่มให้กดดู — ไม่ใช่โชว์รหัสมาเลย
    // (เดิมช่องนี้เป็นช่องปิดบังธรรมดาที่ค่าเป็น "—" เสมอ · ตอนนี้ดึงรหัสจริงตอนกดดูได้แล้ว
    //  จึงต้องยืนยันว่ายัง "ไม่ดึงมาก่อนกด" ตามที่ออกแบบไว้)
    await expect(page.getByRole("button", { name: /ดูรหัสผ่าน/ })).toBeVisible();
    const panel = await page.locator(".erp").innerText();
    expect(panel.includes("••••••••••••"), "ต้องปิดบังรหัสไว้ก่อน").toBe(true);
    expect(/PEB-[A-Za-z0-9]{6,}/.test(panel), "ต้องไม่เห็นรหัสจริงก่อนกดปุ่มดู").toBe(false);
  });

  // ข้อ 5 — คำที่เคยชนกัน ต้องแยกออกจากกัน
  test("[5] ป้ายอัตราต่าง ๆ แยกกันชัด", async ({ page }) => {
    // นับฐาน "ก่อน" ตั้งแต่ก่อนเปิดหน้า (หน้าโหลดตัวเลขตอนเปิด) แล้วนับ "หลัง" หลังอ่านจอ = คร่อมเวลาที่หน้าเว็บดึงข้อมูลจริง
    //   เดิมนับทั้งสองครั้งหลังหน้าโหลดแล้ว — ข้อทดสอบอื่นปิดลีดของสาขาเดียวกันระหว่างนั้น จอ 46% ฐาน 50% ทั้งสองครั้ง (ไม่นิ่ง 3 ครั้ง 28–29 ต.ค. 69)
    const วันนี้ = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
    const ต้นปี = `${วันนี้.slice(0, 4)}-01-01`;
    const อัตราทุกสาขา = async () => {
      const { data, error } = await adminClient().from("leads").select("dealer_code, status, created_date")
        .or(`created_date.is.null,and(created_date.gte.${ต้นปี},created_date.lte.${วันนี้})`);
      expect(error, `อ่านลีดจากฐานไม่ได้: ${error?.message}`).toBeNull();
      const นับ = new Map<string, { ได้: number; เสีย: number }>();
      for (const l of data ?? []) {
        const n = นับ.get(l.dealer_code) ?? { ได้: 0, เสีย: 0 };
        if (l.status === "PAID") n.ได้++; else if (l.status === "CANCELLED") n.เสีย++;
        นับ.set(l.dealer_code, n);
      }
      return (code: string) => { const n = นับ.get(code) ?? { ได้: 0, เสีย: 0 }; return n.ได้ + n.เสีย === 0 ? "—" : `${Math.round(n.ได้ / (n.ได้ + n.เสีย) * 100)}%`; };
    };
    const ก่อน = await อัตราทุกสาขา();
    await open(page, "hq", "/hq/pipeline");
    await expect(page.getByText(/ของมูลค่า/).first()).toBeVisible();          // "ปิดได้ X% ของมูลค่า"
    const tbl = page.locator(".card").filter({ hasText: "ตัวเลขการปิดการขาย รายดีลเลอร์" }).first();
    await expect(tbl).not.toContainText("ชุดเดียวกับกราฟด้านบน");
    // คำอธิบายสูตรใต้ตารางถูกเอาออก (บอสสั่ง 22 ก.ย. 69 · commit 4e269ac "เอาคำอธิบายใต้ตารางผลงานออก")
    await expect(tbl).not.toContainText("อัตราปิด = ปิดได้ ÷");
    // รอบ 4 (บอสตัดสิน 21 ต.ค. 69 ข้อ 5): คอลัมน์ "อัตราปิด" (เดิมคิดจากใบ) → "อัตราปิดการขาย" สูตรกลางเดียวทุกหน้า
    //   = ลูกค้าเป้าหมายปิดสำเร็จ ÷ (ปิดสำเร็จ + ปิดไม่สำเร็จ) ของลีดที่เข้ามาในช่วง (ค่าตั้งต้น "ปีนี้") · ไม่มีลีดที่ปิด = "—"
    //   คอลัมน์ ปิดได้/ปิดไม่ได้ ยังเป็นจำนวน "ใบ" — ตรวจสูตรอัตราด้วยการนับลีดจากฐานเองทีละแถว
    const หัว = (await tbl.locator("thead th").allInnerTexts()).map(t => t.trim());
    const ช่อง = (ชื่อ: string) => หัว.findIndex(h => h === ชื่อ);
    const [iได้, iไม่ได้, iอัตรา] = [ช่อง("ปิดได้"), ช่อง("ปิดไม่ได้"), ช่อง("อัตราปิดการขาย")];
    expect([iได้, iไม่ได้, iอัตรา].every(i => i >= 0), `ต้องมีคอลัมน์ ปิดได้ / ปิดไม่ได้ / อัตราปิดการขาย แยกกัน (ได้: ${หัว.join(" · ")})`).toBe(true);
    expect(หัว.includes("อัตราปิด"), "ไม่มีคอลัมน์ชื่อเก่า \"อัตราปิด\" แล้ว").toBe(false);
    const แถว = tbl.locator("tbody tr");
    const จำนวน = await แถว.count();
    expect(จำนวน, "ตารางต้องมีดีลเลอร์อย่างน้อย 1 แถว").toBeGreaterThan(0);
    const ทุกแถว = [];
    for (let r = 0; r < จำนวน; r++) ทุกแถว.push((await แถว.nth(r).locator("td").allInnerTexts()).map(t => t.trim()));
    const หลัง = await อัตราทุกสาขา();
    // ข้อทดสอบอื่นที่รันพร้อมกันเพิ่ม/ปิดลีดได้ — ยอมรับถ้าตรงกับฐานก่อนเปิดหน้า หรือหลังอ่านจอ
    for (const เซลล์ of ทุกแถว)
      expect([ก่อน(เซลล์[0]), หลัง(เซลล์[0])], `แถว ${เซลล์[0]}: อัตราปิดการขาย ${เซลล์[iอัตรา]} ต้องเท่ากับสูตรกลางจากลีด`).toContain(เซลล์[iอัตรา]);
  });
});
