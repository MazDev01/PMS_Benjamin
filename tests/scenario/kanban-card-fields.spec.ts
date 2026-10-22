// ── การ์ดบนกระดานต้องแสดงข้อมูลแบบแถวป้ายกำกับ (บอสสั่ง 20 ส.ค. 69) ─────────────
// อ้างอิงระบบเดิมที่บอสใช้อยู่: "หัวข้อ: ค่า" ทีละบรรทัด — โทรศัพท์ / อีเมล / จังหวัด /
// วันที่สร้าง / ติดต่อล่าสุด  และช่องที่ยังไม่มีข้อมูลต้องขึ้น "—" ไม่ใช่หายไปทั้งบรรทัด
import { test, expect } from "@playwright/test";
import { RYG, skipReason } from "./supabaseEnv";
import { openAs, settle } from "./helpers";
import { db } from "./funcHelpers";

test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(180_000);

test("[ui·dealer] การ์ดกระดานแสดงป้ายกำกับครบทุกบรรทัด และไม่มีข้อมูลขึ้น —", async ({ page }) => {
  await openAs(page, RYG, "dealer", "/leads");
  await settle(page);
  await page.getByRole("button", { name: "บอร์ด" }).click();

  // รอบ 4: การ์ดบนบอร์ดลากไม่ได้แล้ว (ดูอย่างเดียว · เปลี่ยนขั้นที่กล่องขั้นต่อไปในแผง) — หาการ์ดจากโครงหัวการ์ด (ชื่อบริษัท)
  const การ์ดทั้งหมด = page.locator("div.card:has(> div > div[title])");
  const การ์ด = การ์ดทั้งหมด.first();
  await expect(การ์ด, "ต้องมีการ์ดอย่างน้อยหนึ่งใบ").toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[draggable="true"]'), "การ์ดบนบอร์ดลากไม่ได้แล้ว").toHaveCount(0);

  for (const ป้าย of ["โทรศัพท์:", "อีเมล:", "จังหวัด:", "สร้าง:", "ติดต่อล่าสุด:"]) {
    await expect(การ์ด.getByText(ป้าย, { exact: true }), `การ์ดต้องมีบรรทัด "${ป้าย}"`).toBeVisible();
  }

  // ทุกบรรทัดต้องมีค่าต่อท้ายเสมอ — ถ้ายังไม่มีข้อมูลต้องเป็น "—" (ห้ามปล่อยว่าง)
  const บรรทัด = await การ์ด.evaluate(el =>
    Array.from(el.querySelectorAll("span"))
      .filter(s => /^(โทรศัพท์|อีเมล|จังหวัด|สร้าง|ติดต่อล่าสุด):$/.test(s.textContent ?? ""))
      .map(s => ({ ป้าย: s.textContent, ค่า: (s.nextElementSibling?.textContent ?? "").trim() })));
  expect(บรรทัด.length, "ต้องเจอครบ 5 บรรทัด").toBe(5);
  for (const b of บรรทัด) expect(b.ค่า, `บรรทัด ${b.ป้าย} ต้องมีค่าหรือขีด`).not.toBe("");

  // หัวการ์ด = ชื่อบริษัท (เดิมเป็นแม่แบบ — เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69) · ไม่มีป้าย "สนใจ:" ซ้ำอีก
  const ลำดับ = await การ์ด.evaluate(el => {
    const t = (el.textContent ?? "").replace(/\s+/g, " ");
    return { หัว: (el.firstElementChild?.textContent ?? "").trim(), เต็ม: t };
  });
  expect(ลำดับ.เต็ม, 'ป้าย "สนใจ:" ต้องถูกถอดออกแล้ว').not.toContain("สนใจ:");
  expect(ลำดับ.หัว, "หัวการ์ดต้องไม่ว่าง").not.toBe("");
  const { data: ลีด } = await (await db(RYG)).from("leads").select("company").eq("dealer_code", "RYG").eq("company", ลำดับ.หัว).limit(1);
  expect(ลีด?.length ?? 0, `หัวการ์ด "${ลำดับ.หัว}" ต้องเป็นชื่อบริษัทของลูกค้าเป้าหมายจริงในสาขา`).toBe(1);

  // มูลค่าต้องแสดงที่เดียว (ป้ายด้านบน) ไม่ใช่ซ้ำกับหัวข้อ "มูลค่าโครงการ" เดิม
  await expect(การ์ด.getByText("มูลค่าโครงการ")).toHaveCount(0);

  // ราคาต้องเป็นตัวเต็ม ฿10,000,000.00 ไม่ใช่ตัวย่อ ฿10.0M (บอสสั่ง "แสดงราคาด้วย")
  // ลูกค้าเป้าหมายที่ยังไม่กรอกมูลค่าต้องขึ้น "—" ไม่ใช่ป้ายว่างเปล่า
  const ป้ายราคา = await การ์ดทั้งหมด.evaluateAll(cards =>
    cards.map(c => {
      const chip = c.querySelector('span[style*="rgb(227, 240, 251)"]');
      return (chip?.textContent ?? "").trim();
    }));
  expect(ป้ายราคา.length, "ต้องมีการ์ดให้ตรวจ").toBeGreaterThan(0);
  for (const ราคา of ป้ายราคา) {
    expect(ราคา, "ทุกการ์ดต้องมีป้ายราคา (ไม่มีมูลค่า = ขีด)").not.toBe("");
    if (ราคา !== "—") expect(ราคา.replace(/\s/g, ""), "ราคาต้องเป็นตัวเต็มมีทศนิยมสองตำแหน่ง ไม่ใช่ ฿10.0M").toMatch(/^฿[\d,]+\.\d{2}$/);
  }
  expect(ป้ายราคา.some(r => /^฿[\d,]+\.\d{2}$/.test(r.replace(/\s/g, ""))), "ต้องมีอย่างน้อยหนึ่งการ์ดที่โชว์ราคาเต็ม").toBe(true);
});
