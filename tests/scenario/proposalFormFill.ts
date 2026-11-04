import { expect, type Locator } from "@playwright/test";

// ── ฟอร์มใบค่าแฟรนไชส์: กรอกช่องบังคับที่ยังว่าง (บอสสั่ง 4 พ.ย. 69 · ตัวกลางช่องบังคับ) ─────────────────────────────
//   ค่าแรกเข้า · ระยะสัญญา · เป้ายอดซื้อต่อปี · ภาค · จังหวัด · วันที่เสนอ · ข้อเสนอมีผลถึง · เงื่อนไข ขาดช่องเดียว = บันทึกไม่ได้
//   ข้อทดสอบที่วัดเรื่องอื่น (สถานะ/เวอร์ชัน/การชำระ) เรียกก่อนกด "บันทึกใบ" — ช่องที่ข้อทดสอบกรอกเองแล้วไม่ทับ
//   ภาคว่างแต่จังหวัดเติมจากผู้สนใจแล้ว = เลือกภาคที่จังหวัดนั้นยังอยู่ (เปลี่ยนภาคแล้วจังหวัดนอกภาคถูกล้าง)
const วันนี้ = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const อีก = (วัน: number) => new Date(Date.now() + 7 * 3_600_000 + วัน * 86_400_000).toISOString().slice(0, 10);

export async function กรอกช่องบังคับใบที่ว่าง(ฟอร์ม: Locator): Promise<void> {
  const ว่าง = async (sel: string) => (await ฟอร์ม.locator(sel).count()) > 0 && (await ฟอร์ม.locator(sel).inputValue()).trim() === "";
  for (const [sel, ค่า] of [["#pp-amount", "50,000"], ["#pp-months", "12"], ["#pp-target", "1,000,000"]] as const) {
    if (await ว่าง(sel)) await ฟอร์ม.locator(sel).fill(ค่า);
  }
  if (await ว่าง("#pp-region")) {
    const จังหวัดเดิม = await ฟอร์ม.locator("#pp-province").inputValue();
    const ภาค = (await ฟอร์ม.locator("#pp-region option").evaluateAll(os => os.map(o => (o as HTMLOptionElement).value))).filter(Boolean);
    for (const r of ภาค) {
      await ฟอร์ม.locator("#pp-region").selectOption(r);
      if (!จังหวัดเดิม || (await ฟอร์ม.locator("#pp-province").inputValue()) === จังหวัดเดิม) break;
    }
  }
  if (await ว่าง("#pp-province")) {
    const จ = (await ฟอร์ม.locator("#pp-province option").evaluateAll(os => os.map(o => (o as HTMLOptionElement).value))).filter(Boolean);
    await ฟอร์ม.locator("#pp-province").selectOption(จ[0]);
  }
  if (await ว่าง("#pp-date")) await ฟอร์ม.locator("#pp-date").fill(วันนี้());
  if (await ว่าง("#pp-valid")) await ฟอร์ม.locator("#pp-valid").fill(อีก(30));
  if (await ว่าง("#pp-terms")) await ฟอร์ม.locator("#pp-terms").fill("-");
  await expect(ฟอร์ม.locator("[data-field-error]"), "ช่องบังคับครบ ไม่มีข้อความผิดค้าง").toHaveCount(0);
}
