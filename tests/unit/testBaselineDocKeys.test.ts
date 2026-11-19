// ข้อมูลตั้งต้นฐานทดสอบ: dealer_settings.document ใช้คีย์ที่แอปอ่านเท่านั้น (19 พ.ย. 69 · ข้อแจ้งแยกงานข้อมูลตัวอย่าง ③)
//   เดิม 6 สาขาเก็บ vat/terms/prefix/running — แอปอ่าน vatPercent/termsAndConditions/quotePrefix/runningNumber → เงื่อนไขในใบพิมพ์ว่าง
//   ฐานจริงไม่มีคีย์เก่า (นับ 19 พ.ย. 69: 0 จาก 156) · ตัวส่งออก scripts/export-test-baseline.mjs แปลงคีย์ให้แล้ว
//   ตกบนโค้ดเดิม (97a8ab9e): BKK CBI KKN NMA PKT UBN มีคีย์เก่า
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const แถว = readFileSync(path.join(__dirname, "../fixtures/test-baseline.sql"), "utf8").split(/\r?\n/)
  .filter(l => l.startsWith("{\"dealer_code\"") && l.includes("\"document\""))
  .map(l => JSON.parse(l.replace(/,$/, "")) as { dealer_code: string; document: Record<string, unknown> | null });

describe("test-baseline: ตั้งค่าเอกสารของดีลเลอร์", () => {
  it("มีแถวตั้งค่าดีลเลอร์ให้ตรวจ", () => { expect(แถว.length).toBeGreaterThan(0); });
  it("ไม่มีคีย์รุ่นเก่า vat/terms/prefix/running (แอปไม่อ่าน)", () => {
    const เก่า = แถว.filter(r => r.document && ["vat", "terms", "prefix", "running"].some(k => k in r.document!)).map(r => r.dealer_code);
    expect(เก่า).toEqual([]);
  });
  it("vatPercent ที่มี เป็นตัวเลข (ฐานอ่าน document->>'vatPercent' ตอนคิด VAT · ใบ 0237)", () => {
    for (const r of แถว) if (r.document && "vatPercent" in r.document) expect(typeof r.document.vatPercent, r.dealer_code).toBe("number");
  });
});
