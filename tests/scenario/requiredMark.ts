import { expect, type Locator } from "@playwright/test";

// ── ตรวจ * แดงของช่องบังคับ (ตัวกลาง FieldLabel · บอสสั่ง 4 พ.ย. 69) ─────────────────────────────────────────────────────
//   * วาดด้วย CSS ([data-required]::after · globals.css) ไม่ใช่ตัวอักษรใน DOM — ข้อความป้าย/ชื่อช่องจึงเท่าเดิม ("อีเมล" ไม่ใช่ "อีเมล*")
//   (รอบตรวจ deploy16 4 พ.ย. 69: * เป็นตัวอักษร → getByLabel("รหัสสาขา", exact) หาไม่เจอ)
//   ข้อทดสอบตรวจที่ตัวที่วาดจริง: มีเครื่องหมาย 1 ตัว · ::after เป็น "*" · สีแดง
export const สีแดง = (c: string) => { const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c); return !!m && +m[1] >= 180 && +m[2] <= 90 && +m[3] <= 90; };

/** ป้ายช่องมี * แดง (เห็นบนจอ) */
export async function ต้องมีดาวแดง(ป้าย: Locator, ชื่อ: string) {
  await expect(ป้าย, `ป้าย "${ชื่อ}" ต้องมองเห็น`).toBeVisible({ timeout: 15_000 });
  const ดาว = ป้าย.locator("[data-required]");
  await expect(ดาว, `ป้าย "${ชื่อ}" ต้องมี * จากตัวกลาง 1 ตัว`).toHaveCount(1);
  const { ตัว, สี } = await ดาว.evaluate(e => { const s = getComputedStyle(e, "::after"); return { ตัว: s.content, สี: s.color }; });
  expect(ตัว.replace(/["']/g, "").split("/")[0].trim(), `* ของ "${ชื่อ}" ต้องวาดเป็น "*" (ได้ ${ตัว})`).toBe("*");
  expect(สีแดง(สี), `* ของ "${ชื่อ}" ต้องเป็นสีแดง (ได้ ${สี})`).toBe(true);
}

/** ป้ายช่องไม่บังคับ = ไม่มี * */
export async function ต้องไม่มีดาว(ป้าย: Locator, ชื่อ: string) {
  await expect(ป้าย, `ป้าย "${ชื่อ}"`).toBeVisible({ timeout: 15_000 });
  await expect(ป้าย.locator("[data-required]"), `ช่อง "${ชื่อ}" ไม่บังคับ — ห้ามมี *`).toHaveCount(0);
  expect(await ป้าย.innerText(), `ช่อง "${ชื่อ}" ไม่บังคับ — ห้ามมี *`).not.toContain("*");
}

/** ชื่อป้ายตามที่ผู้ใช้อ่าน + " *" เมื่อเป็นช่องบังคับ (ใช้เทียบรายการป้ายตามลำดับ) */
export const ป้ายพร้อมดาว = (ป้าย: Locator) => ป้าย.evaluateAll(els => els.map(e =>
  `${(e as HTMLElement).innerText.trim()}${e.querySelector("[data-required]") ? " *" : ""}`));
