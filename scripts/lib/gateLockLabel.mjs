// ── ป้ายบนล็อกฐานทดสอบของ test:prodbuild — บอกตามจริงว่ารันแบบไหน (คนรวมงานขอ 9 พ.ย. 69) ─────────────────────────────
//   เหตุ: เดิมเขียน "รอบตรวจเต็ม (…)" ทุกครั้ง แม้รันแบบระบุไฟล์ → เซสชันอื่นที่รอคิวเข้าใจผิดว่ามีคนรันรอบเต็มเอง (เกิด 2 ครั้งใน 9 พ.ย. 69)
//   รอบตรวจเต็ม = ไม่ระบุไฟล์ (อาร์กิวเมนต์ --reporter… ไม่นับเป็นไฟล์) · เจาะช่วง prod-live = PMS_GATE_ONLY_LIVE=1 · อื่น ๆ = ทดสอบบางไฟล์ (n ไฟล์)
//   ข้อทดสอบ: tests/unit/gateLockLabel.test.ts

/** @param {{ args: string[]; onlyLive: boolean; sha: string }} p */
export function ป้ายล็อกรอบทดสอบ({ args, onlyLive, sha }) {
  const ย่อ = String(sha ?? "").slice(0, 7);
  if (onlyLive) return `เจาะช่วง prod-live (${ย่อ})`;
  const ไฟล์ = args.filter(a => !a.startsWith("--"));
  const เป็นรอบเต็ม = !args.some(a => !a.startsWith("--reporter"));
  if (เป็นรอบเต็ม) return `รอบตรวจเต็ม (${ย่อ})`;
  return `ทดสอบบางไฟล์ (${ไฟล์.length} ไฟล์ · ${ย่อ})`;
}
