import { test, expect, type Page } from "@playwright/test";
import { open, settle } from "./helpers";
import { REAL_BACKEND } from "./supabaseEnv";

// ── การ์ด KPI ทุกใบ: ใต้ตัวเลขเหลือแค่หน่วยสั้น · คำอธิบาย/สูตรย้ายไป ⓘ ข้างชื่อการ์ด (บอสสั่ง 19 พ.ย. 69 "ข้อมูลแบบนี้เอาออก") ──
//   ภาพที่บอสส่ง: การ์ด "21 · งานขาย · ลูกค้าเป้าหมายที่เข้ามาในช่วงที่เลือก · อัตราปิดการขาย 70% (ลูกค้าเป้าหมายปิดสำเร็จ ÷ (ปิดสำเร็จ + ปิดไม่สำเร็จ))"
//   ตอนนี้: ชื่อการ์ด · ตัวเลข · หน่วยคำเดียว (ไม่มีก็ได้) · ลิงก์ดูรายละเอียด — ข้อความเดิมอยู่ใน ⓘ ครบ (ตัวกลาง KpiCard ใช้ทุกหน้า)
//   ตกบนโค้ดเดิม (d8239026): ใต้ตัวเลขมีบรรทัดอธิบาย/สูตร · ไม่มี [data-kpi-tip]
test.skip(() => !REAL_BACKEND, "ต้องมีฐานทดสอบ");

async function ตรวจการ์ด(page: Page, ที่: string) {
  const การ์ด = page.locator("[data-kpi-row] [data-kpi]");
  await expect(การ์ด.first(), `${ที่}: มีการ์ด`).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("[data-kpi-row]").first(), `${ที่}: การ์ดโหลดเสร็จ`).not.toContainText("กำลังโหลด", { timeout: 25_000 });
  const ข้อมูล = await การ์ด.evaluateAll(es => es.map(e => {
    // ข้อความที่เห็นบนการ์ด (innerText ไม่นับ ⓘ ที่ซ่อนอยู่)
    //   ไม่นับตัวเลขในวง % (data-kpi-ring) — เป็นกราฟิกข้างตัวเลข ไม่ใช่บรรทัดอธิบาย
    const วง = ((e.querySelector("[data-kpi-ring]") as HTMLElement | null)?.innerText ?? "").split("\n").map(s => s.trim()).filter(Boolean);
    const บรรทัด = (e as HTMLElement).innerText.split("\n").map(s => s.trim()).filter(Boolean).filter(b => !วง.includes(b));
    const หน่วย = e.querySelector("[data-kpi-unit]")?.textContent ?? "";
    const tip = e.querySelector("[data-kpi-tip] [data-info-tip-text]")?.textContent ?? "";
    return { kpi: e.getAttribute("data-kpi"), บรรทัด, หน่วย, tip, มีปุ่มซ้อน: !!e.matches("button") && !!e.querySelector("button") };
  }));
  for (const c of ข้อมูล) {
    // ชื่อ · ตัวเลข · หน่วยสั้น · ดูรายละเอียด = ไม่เกิน 4 บรรทัด
    expect(c.บรรทัด.length, `${ที่} ${c.kpi}: เห็นแค่ ชื่อ/ตัวเลข/หน่วย/ลิงก์ (${c.บรรทัด.join(" | ")})`).toBeLessThanOrEqual(4);
    expect(c.หน่วย, `${ที่} ${c.kpi}: หน่วยเป็นคำเดียว`).toMatch(/^[฀-๿A-Za-z%]{0,9}$/);
    for (const b of c.บรรทัด) expect(b, `${ที่} ${c.kpi}: ไม่มีประโยคอธิบาย/สูตรบนการ์ด`).not.toMatch(/ช่วงที่เลือก|÷|ไม่นับ|ตามช่วง|ปิดสำเร็จ\s*\d/);
    expect(c.มีปุ่มซ้อน, `${ที่} ${c.kpi}: ⓘ ในการ์ดที่กดได้ไม่ใช่ปุ่มซ้อนปุ่ม`).toBe(false);
  }
  return ข้อมูล;
}

test("[H·hq] การ์ด KPI หน้า HQ: ใต้ตัวเลขเหลือหน่วยสั้น · คำอธิบายอยู่ใน ⓘ (ข้อความเดิมครบ)", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const path of ["/hq/dashboard", "/hq/leads", "/hq/quotations", "/hq/pipeline"]) {
    await open(page, "hq", path);
    await settle(page);
    const ข้อมูล = await ตรวจการ์ด(page, path);
    if (path === "/hq/leads") {   // ลูกค้าเป้าหมายใหม่: "ราย · เข้ามาในช่วงที่เลือก" → หน่วย "ราย" · ⓘ "เข้ามาในช่วงที่เลือก"
      const ใหม่ = ข้อมูล.find(c => c.tip.includes("เข้ามาในช่วงที่เลือก"));
      expect(ใหม่, "/hq/leads: ⓘ มีข้อความเดิม เข้ามาในช่วงที่เลือก").toBeTruthy();
      expect(ใหม่!.หน่วย).toBe("ราย");
    }
    if (path === "/hq/quotations") {
      expect(ข้อมูล.some(c => c.tip.includes("ไม่นับฉบับร่างและฉบับเก่า")), "/hq/quotations: ⓘ มีข้อความเดิม (ไม่นับฉบับร่างและฉบับเก่า)").toBe(true);
    }
  }
  // ⓘ ชี้แล้วขึ้น · กดไอคอนในการ์ดที่กดได้ ไม่พาออกจากหน้า
  await open(page, "hq", "/hq/leads");
  await settle(page);
  const tip = page.locator("[data-kpi-row] [data-kpi] [data-kpi-tip]").first();
  await tip.locator('[role="button"], button').first().hover();
  await expect(tip.locator("[data-info-tip-text]"), "ชี้ ⓘ แล้วคำอธิบายขึ้น").toBeVisible();
  const ก่อน = page.url();
  await tip.locator('[role="button"], button').first().click();
  expect(page.url(), "กด ⓘ ไม่ทำให้การ์ดพาไปหน้าอื่น").toBe(ก่อน);
});

test("[D·dealer] การ์ด KPI หน้าดีลเลอร์: ใต้ตัวเลขเหลือหน่วยสั้น · คำอธิบายอยู่ใน ⓘ", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const path of ["/dashboard", "/leads", "/quotations", "/customers"]) {
    await open(page, "dealer", path);
    await settle(page);
    await ตรวจการ์ด(page, path);
  }
});
