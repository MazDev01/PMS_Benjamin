// ── ตัวตรวจ: สวิตช์ "ซ่อนราคาแม่แบบจากดีลเลอร์" ห้ามเปิดก่อน Flow ใบ HQ ขึ้นระบบ ─────────────
//
// ทำไมต้องมี (ข้อตัดสิน 13 ต.ค. 69):
//   เปิดสวิตช์ (hq_policy.hide_catalog_price) แล้วดีลเลอร์อ่านราคาแม่แบบไม่ได้เลย
//   ถ้าตอนนั้นยังไม่มีทางรับราคาจากสำนักงานใหญ่ (ใบ HQ) = ดีลเลอร์ออกใบเสนอราคาไม่ได้ทั้งเครือ
//   โดยไม่มี error อะไรบอก — เห็นแค่รายการแม่แบบว่าง
//
// "Flow ใบ HQ ขึ้นระบบแล้ว" วัดจากของจริง: มีใบ HQ ที่ส่งถึงดีลเลอร์แล้วอย่างน้อย 1 ใบ
//   (ตารางมีอยู่เฉย ๆ ไม่พอ — ต้องมีคนใช้ทางใหม่ได้จริงก่อนปิดทางเก่า)
//
// แยกเป็นฟังก์ชันล้วนเพื่อให้ทดสอบได้ (tests/unit/priceSwitchPreflight.test.ts) · preflight.mjs เป็นคนป้อนค่า

/**
 * @param {{ switchOn: boolean | null, sentHqQuotes: number | null }} x
 *   switchOn     — ค่าสวิตช์ · null = ฐานนี้ยังไม่มีสวิตช์ (ยังไม่ได้ขึ้นใบ 0186)
 *   sentHqQuotes — จำนวนใบ HQ ที่ส่งแล้ว/สั่งผลิตแล้ว · null = อ่านไม่ได้ (ยังไม่มีตาราง = ยังไม่มี Flow ใบ HQ)
 * @returns {{ ok: boolean, detail: string }}
 */
export function ตรวจสวิตช์ซ่อนราคา({ switchOn, sentHqQuotes }) {
  if (switchOn === null || switchOn === undefined) {
    return { ok: true, detail: "ฐานนี้ยังไม่มีสวิตช์ (ยังไม่ขึ้น Flow ใหม่) — ดีลเลอร์อ่านราคาแม่แบบได้ตามเดิม" };
  }
  if (!switchOn) return { ok: true, detail: "ปิดอยู่ — ดีลเลอร์อ่านราคาแม่แบบได้ตามเดิม" };
  const n = Number(sentHqQuotes);
  if (sentHqQuotes === null || sentHqQuotes === undefined || !Number.isFinite(n) || n <= 0) {
    return {
      ok: false,
      detail: "⚠ เปิดอยู่ แต่ยังไม่มีใบ HQ ที่ส่งถึงดีลเลอร์เลย — ดีลเลอร์ออกใบเสนอราคาไม่ได้ทั้งเครือ · ปิดสวิตช์ก่อน (hq_policy.hide_catalog_price = false)",
    };
  }
  return { ok: true, detail: `เปิดอยู่ · Flow ใบ HQ ใช้งานแล้ว (${n} ใบที่ส่งถึงดีลเลอร์)` };
}
