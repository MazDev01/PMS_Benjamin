// ── การ์ดบนกระดานต้องแสดงข้อมูลแบบแถวป้ายกำกับ (บอสสั่ง 20 ส.ค. 69) ─────────────
// อ้างอิงระบบเดิมที่บอสใช้อยู่: "หัวข้อ: ค่า" ทีละบรรทัด — โทรศัพท์ / อีเมล / จังหวัด /
// วันที่สร้าง / ติดต่อล่าสุด  และช่องที่ยังไม่มีข้อมูลต้องขึ้น "—" ไม่ใช่หายไปทั้งบรรทัด
import { test, expect } from "@playwright/test";
import { RYG, skipReason } from "./supabaseEnv";
import { openAs, settle } from "./helpers";
import { db } from "./funcHelpers";
import { ช่อง } from "../../packages/shared/lib/fieldLabels";

test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(180_000);

test("[ui·dealer] การ์ดกระดานแสดงป้ายกำกับครบทุกบรรทัด และไม่มีข้อมูลขึ้น —", async ({ page }) => {
  // การ์ดของลีดของข้อนี้เอง (ป้ายไม่ซ้ำ) — เดิมใช้การ์ดใบแรกของบอร์ด RYG ซึ่งอาจเป็นลีดที่ข้ออื่นกำลังสร้าง/ลบ (29 ต.ค. 69 · คิวข้อ 3)
  const ป้ายลีด = `ZZTEST-ป้ายการ์ด-${Date.now() % 100000}`   // ห้ามมีคำว่า "บอร์ด" — ชนปุ่มสลับมุมมอง "บอร์ด";
  const เลขลีด = 977_900_000 + (Date.now() % 100000);
  const ใส่ = await (await db(RYG)).from("leads").insert({ id: `#L-${เลขลีด}`, num_id: เลขลีด, dealer_code: "RYG", company: ป้ายลีด, name: ป้ายลีด,
    contact: "ผู้ทดสอบ", phone: "000-000-0302", province: "ระยอง", status: "WAITING" });
  expect(ใส่.error, `เตรียมลีดของข้อนี้ (${ใส่.error?.message ?? ""})`).toBeNull();
  try {
    await openAs(page, RYG, "dealer", "/leads");
    await settle(page);
    await page.getByRole("button", { name: "บอร์ด", exact: true }).click();

    // การ์ดตัวกลาง BoardCard (บอสสั่ง 13 พ.ย. 69 · 63c62a15) — หาการ์ดจาก data-board-card + ชื่อการ์ด (data-board-name)
    //   เดิมหาจากโครง div.card:has(> div > div[title]) ของการ์ดรุ่นก่อน → รอบ deploy23 17 พ.ย. หาการ์ดไม่เจอทั้งที่ขึ้นจอ
    const การ์ดทั้งหมด = page.locator("[data-board-card]:has([data-board-card-body])");
    await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(ป้ายลีด);
    const การ์ด = การ์ดทั้งหมด.filter({ has: page.locator("[data-board-name]", { hasText: ป้ายลีด }) }).first();
    await expect(การ์ด, "ต้องมีการ์ดอย่างน้อยหนึ่งใบ").toBeVisible({ timeout: 30_000 });
    // ตรวจกลับด้าน (บอสตัดสิน 5 พ.ย. 69 · ทับรอบ 4 ที่บอร์ดดูอย่างเดียว): บอร์ดลูกค้าเป้าหมายลากการ์ดได้ (ลากแล้วเด้งฟอร์มของขั้นนั้น)
    await expect(page.locator('[draggable="true"]').filter({ hasText: ป้ายลีด }), "การ์ดบนบอร์ดลากได้ (บอสตัดสิน 5 พ.ย. 69)").toHaveCount(1);

    // ช่องของการ์ดตัวกลาง (ช่องการ์ดบอร์ด ใน BoardCard.tsx · ชุดเดียวกับ board-card-shared.spec) — "สร้าง" เดิม = "เริ่มติดต่อ"
    const ช่องการ์ด = ["โทรศัพท์", "อีเมล", "จังหวัด", "เริ่มติดต่อ", "ติดต่อล่าสุด", "ติดตามครั้งถัดไป"];
    for (const ป้าย of ช่องการ์ด) {
      await expect(การ์ด.locator(`[data-board-field="${ป้าย}"]`).getByText(`${ป้าย}:`, { exact: true }), `การ์ดต้องมีบรรทัด "${ป้าย}:"`).toBeVisible();
    }
    expect(ช่อง.โทรศัพท์, "ชื่อช่องโทรศัพท์ตรงชุดช่องมาตรฐาน").toBe("โทรศัพท์");

    // ทุกบรรทัดต้องมีค่าต่อท้ายเสมอ — ถ้ายังไม่มีข้อมูลต้องเป็น "—" (ห้ามปล่อยว่าง)
    const บรรทัด = await การ์ด.evaluate((el, ป้าย) => ป้าย.map(k => ({ ป้าย: k, ค่า: (el.querySelector(`[data-board-value-of="${k}"]`)?.textContent ?? "").trim() })), ช่องการ์ด);
    expect(บรรทัด.length, `ต้องเจอครบ ${ช่องการ์ด.length} บรรทัด`).toBe(ช่องการ์ด.length);
    for (const b of บรรทัด) expect(b.ค่า, `บรรทัด ${b.ป้าย} ต้องมีค่าหรือขีด`).not.toBe("");
    // วันที่บนการ์ดต้องเป็นวันที่ไทยอ่านง่าย (เช่น "17 พ.ย. 2569") ไม่ใช่ค่าดิบจากฐาน (เจอรอบ deploy23 17 พ.ย. 69: "2026-11-17T04:33:05.906247+00:00")
    const เริ่ม = บรรทัด.find(b => b.ป้าย === "เริ่มติดต่อ")?.ค่า ?? "";
    expect(เริ่ม, "เริ่มติดต่อ = วันที่ไทย (ลีดของข้อนี้เพิ่งสร้าง)").toMatch(/^\d{1,2} [ก-๙.]+ \d{4}$/);
    expect(await การ์ด.innerText(), "การ์ดไม่มีวันที่รูปแบบดิบของฐาน (ISO)").not.toMatch(/\d{4}-\d{2}-\d{2}(T|\s\d{2}:)/);

    // หัวการ์ด = ชื่อบริษัท (เดิมเป็นแม่แบบ — เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69) · ไม่มีป้าย "สนใจ:" ซ้ำอีก
    const ลำดับ = await การ์ด.evaluate(el => {
      const t = (el.textContent ?? "").replace(/\s+/g, " ");
      return { หัว: (el.querySelector("[data-board-name]")?.textContent ?? "").trim(), เต็ม: t };
    });
    expect(ลำดับ.เต็ม, 'ป้าย "สนใจ:" ต้องถูกถอดออกแล้ว').not.toContain("สนใจ:");
    expect(ลำดับ.หัว, "หัวการ์ดต้องไม่ว่าง").not.toBe("");
    expect(ลำดับ.หัว, "หัวการ์ด = ชื่อบริษัทของลีดของข้อ").toBe(ป้ายลีด);
    const { data: ลีด } = await (await db(RYG)).from("leads").select("company").eq("dealer_code", "RYG").eq("company", ลำดับ.หัว).limit(1);
    expect(ลีด?.length ?? 0, `หัวการ์ด "${ลำดับ.หัว}" ต้องเป็นชื่อบริษัทของลูกค้าเป้าหมายจริงในสาขา`).toBe(1);

    // มูลค่าต้องแสดงที่เดียว (ป้ายด้านบน) ไม่ใช่ซ้ำกับหัวข้อ "มูลค่าโครงการ" เดิม
    await expect(การ์ด.getByText("มูลค่าโครงการ")).toHaveCount(0);

    // ราคา: ตรวจทุกการ์ดบนบอร์ด (ล้างช่องค้นก่อน — ลีดของข้อนี้ยังไม่มีใบ ราคาเป็น "—")
    await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill("");
    await expect(การ์ดทั้งหมด.nth(1), "ล้างช่องค้นแล้วบอร์ดกลับมีการ์ดของสาขา").toBeVisible({ timeout: 20_000 });
    // ราคาต้องเป็นตัวเต็ม ฿10,000,000.00 ไม่ใช่ตัวย่อ ฿10.0M (บอสสั่ง "แสดงราคาด้วย")
    // ลูกค้าเป้าหมายที่ยังไม่กรอกมูลค่าต้องขึ้น "—" ไม่ใช่ป้ายว่างเปล่า
    const ป้ายราคา = await การ์ดทั้งหมด.evaluateAll(cards =>
      cards.map(c => (c.querySelector("[data-board-value]")?.textContent ?? "").trim()));   // ป้ายมูลค่าของการ์ดตัวกลาง
    expect(ป้ายราคา.length, "ต้องมีการ์ดให้ตรวจ").toBeGreaterThan(0);
    for (const ราคา of ป้ายราคา) {
      expect(ราคา, "ทุกการ์ดต้องมีป้ายราคา (ไม่มีมูลค่า = ขีด)").not.toBe("");
      if (ราคา !== "—") expect(ราคา.replace(/\s/g, ""), "ราคาต้องเป็นตัวเต็มมีทศนิยมสองตำแหน่ง ไม่ใช่ ฿10.0M").toMatch(/^฿[\d,]+\.\d{2}$/);
    }
    expect(ป้ายราคา.some(r => /^฿[\d,]+\.\d{2}$/.test(r.replace(/\s/g, ""))), "ต้องมีอย่างน้อยหนึ่งการ์ดที่โชว์ราคาเต็ม").toBe(true);
  } finally {
    await (await db(RYG)).from("leads").delete().eq("dealer_code", "RYG").eq("num_id", เลขลีด);
  }
});
