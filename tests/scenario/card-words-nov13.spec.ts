import { test, expect } from "@playwright/test";
import { ADMIN, skipReason } from "./supabaseEnv";
import { HQ_ORIGIN, loginUI, watchErrors, assertNoErrors } from "./funcHelpers";
import { settle } from "./helpers";

// ── คำบนการ์ด (บอสสั่ง 13 พ.ย. 69 · งาน A) — ทุกหน้า HQ ที่มีการ์ดตัวเลข ─────────────────────────────────────────────
//   การ์ดใบที่ส่งลูกค้า: ชื่อ "ใบเสนอราคาที่ส่งลูกค้า" · บรรทัดเล็ก "ในช่วงที่เลือก (ไม่นับฉบับร่างและฉบับเก่า)" (หน้าหลัก · ใบเสนอราคาทั้งเครือ)
//   ปุ่มบนการ์ดภาพรวมยอดขาย/หน้าเจาะลึก = "ดูรายละเอียด" · คำห้ามบนการ์ด/ทั้งหน้า: คำเก่าของสถานะฉบับเก่า + ปุ่มเจาะดูเดิม
//   คำห้ามต่อเป็นชิ้น (ไฟล์ข้อทดสอบ) · งานหน้าตา ไม่ต้องพิสูจน์บนโค้ดเดิม (คนรวมงานสั่ง 13 พ.ย. 69)
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(180_000);
const คำห้าม = ["ถูก" + "แทนที่", "เจาะดู" + "ที่มา", "ส่งลูกค้า" + "ในช่วงนี้"];
const ช่วง = "ในช่วงที่เลือก (ไม่นับฉบับร่างและฉบับเก่า)";

test("[ui·hq] คำบนการ์ดทุกหน้า: ใบเสนอราคาที่ส่งลูกค้า · ไม่นับฉบับร่างและฉบับเก่า · ดูรายละเอียด · ไม่มีคำเก่า", async ({ page }) => {
  const errs = watchErrors(page);
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  for (const path of ["/hq/dashboard", "/hq/pipeline", "/hq/quotations", "/hq/leads", "/hq/customers"]) {
    await page.goto(`${HQ_ORIGIN}${path}`, { waitUntil: "domcontentloaded" });
    await settle(page);
    const แถวการ์ด = page.locator("[data-kpi-row]").nth(0);
    await expect(แถวการ์ด, `${path}: มีการ์ดตัวเลข`).toBeVisible({ timeout: 25_000 });
    await expect(แถวการ์ด, `${path}: การ์ดโหลดเสร็จ`).not.toContainText("กำลังโหลด…", { timeout: 25_000 });
    const ข้อความ = await page.locator(".content").first().innerText();
    expect(คำห้าม.filter(k => ข้อความ.includes(k)), `${path}: ไม่มีคำเก่าบนหน้า`).toEqual([]);
    if (path === "/hq/dashboard" || path === "/hq/quotations") {
      const การ์ด = page.locator(`[data-kpi-row] [data-kpi="${path === "/hq/dashboard" ? "quotes" : "sent"}"]`);   // หน้าหลัก = การ์ด quotes · ใบเสนอราคาทั้งเครือ = sent
      await expect(การ์ด, `${path}: การ์ดใบที่ส่งลูกค้า`).toContainText("ใบเสนอราคาที่ส่งลูกค้า");
      await expect(การ์ด, `${path}: บรรทัดเล็กของการ์ด`).toContainText(ช่วง);
    }
    if (path === "/hq/pipeline") {
      const ปุ่ม = page.locator("[data-kpi-row]").getByText("ดูรายละเอียด", { exact: true });
      expect(await ปุ่ม.count(), "ภาพรวมยอดขาย: ปุ่มบนการ์ด = ดูรายละเอียด ครบ 4 ใบ").toBeGreaterThanOrEqual(4);
    }
  }
  assertNoErrors(errs, "คำบนการ์ด");
});
