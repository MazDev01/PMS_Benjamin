// ── ตัวต่อคิวแถวกลาง (บอสสั่ง 29 ต.ค. 69 · คิวรอบหน้าข้อ 3) ─────────────────────────────────────────────────────────
// แถวที่มีแถวเดียวทั้งระบบ (ผู้รับอีเมล HQ · ตั้งค่างานขาย · ข้อมูลบริษัท HQ · เป้า RYG · ตั้งค่าเอกสาร RYG ฯลฯ)
//   หลายไฟล์เขียนแล้วคืนค่าเดิม — รันพร้อมกัน (workers 3) = ไฟล์หนึ่งคืนค่าทับของอีกไฟล์ / อีกไฟล์อ่านเจอค่าชั่วคราว
//   ข้อที่ "เขียน" หรือ "ตรวจค่า" แถวนั้นต้องถือแถวนั้นก่อน · ข้อที่ไม่ยุ่งแถวนั้นรันพร้อมกันได้ตามเดิม (ไม่ลดความเร็วทั้งชุด)
// ใช้: ใช้แถวกลาง(test, "hq_notif_rules")   — ถือทุกข้อในไฟล์ (beforeEach/afterEach)
//      const ปล่อย = await ถือแถวกลาง("dealers.RYG.revenue_target"); try { … } finally { ปล่อย(); }
// ล็อก = โฟลเดอร์ (mkdir ทำได้ทีละราย) ใต้ test-results/.row-locks ของโฟลเดอร์นี้ — แยกตามเซสชันเพราะแต่ละเซสชันใช้ฐานทดสอบตอนถือล็อกฐานคนละช่วง
//   โปรเซสที่ถือหายไป (ตัวรันถูกฆ่า) = ล็อกค้าง → ยึดคืนเมื่อ pid ไม่อยู่แล้ว
import type { test as ตัวทดสอบ } from "@playwright/test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

export const แถวกลาง = [
  "hq_notif_rules",               // ผู้รับอีเมล HQ (id=1) + สรุปคำขอค้างรายวัน (requests_overdue วันละครั้งทั้งระบบ)
  "hq_sales_journey",             // งานตามขั้น/เหตุผลไม่สำเร็จ (id=1)
  "hq_company",                   // ข้อมูลบริษัท HQ (id=1)
  "dealers.RYG.revenue_target",   // เป้ายอดขายของ RYG
  "dealer_settings.RYG",          // ตั้งค่าเอกสาร/ชื่อบริษัท/% บวกของ RYG
  "hq_settings_import",           // นำเข้าตั้งค่า HQ กลับจากไฟล์ (ทับหลายแถวกลางพร้อมกัน)
] as const;
export type ชื่อแถวกลาง = (typeof แถวกลาง)[number];

const ที่ล็อก = path.resolve(__dirname, "../../test-results/.row-locks");
const ยังอยู่ = (pid: number) => { try { process.kill(pid, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code === "EPERM"; } };

async function ถือตัวเดียว(ชื่อ: ชื่อแถวกลาง, เพดานมิลลิวินาที: number): Promise<() => void> {
  const ที่ = path.join(ที่ล็อก, ชื่อ);
  mkdirSync(ที่ล็อก, { recursive: true });
  const เริ่ม = Date.now();
  for (;;) {
    try {
      mkdirSync(ที่);
      writeFileSync(path.join(ที่, "owner.json"), JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
      return () => rmSync(ที่, { recursive: true, force: true });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      try {
        const { pid } = JSON.parse(readFileSync(path.join(ที่, "owner.json"), "utf8")) as { pid: number };
        if (!ยังอยู่(pid)) { rmSync(ที่, { recursive: true, force: true }); continue; }
      } catch { /* เพิ่งสร้างโฟลเดอร์ ยังไม่เขียน owner — รอรอบหน้า */ }
      if (Date.now() - เริ่ม > เพดานมิลลิวินาที) throw new Error(`รอแถวกลาง "${ชื่อ}" เกิน ${Math.round(เพดานมิลลิวินาที / 1000)} วิ — ดู ${ที่}/owner.json`);
      await new Promise(r => setTimeout(r, 200));
    }
  }
}

// ถือหลายแถวพร้อมกัน — เรียงชื่อก่อนเสมอ (กันสองไฟล์ถือสลับลำดับแล้วรอกันเอง)
export async function ถือแถวกลาง(ชื่อ: ชื่อแถวกลาง | ชื่อแถวกลาง[], เพดานมิลลิวินาที = 600_000): Promise<() => void> {
  const ปล่อย: (() => void)[] = [];
  try {
    for (const n of [...new Set([ชื่อ].flat())].sort()) ปล่อย.push(await ถือตัวเดียว(n, เพดานมิลลิวินาที));
  } catch (e) { ปล่อย.reverse().forEach(f => f()); throw e; }
  return () => ปล่อย.reverse().forEach(f => f());
}

// ถือในฮุก/ในข้อ แล้วบวกเวลาที่ยืนรอคิวคืนให้เพดานของข้อ/ฮุกนั้นเท่าที่รอจริง
//   (ไม่ใช่เพิ่มเวลารอ: ตัวข้อได้เวลาทำงานเท่าเดิมทุกมิลลิวินาที · เวลารอคิวเกิดจากตัวต่อคิวนี้เอง)
export async function ถือแถวกลางชดเวลา(test: typeof ตัวทดสอบ, ชื่อ: ชื่อแถวกลาง | ชื่อแถวกลาง[]): Promise<() => void> {
  const เริ่ม = Date.now();
  const ปล่อย = await ถือแถวกลาง(ชื่อ);
  const รอ = Date.now() - เริ่ม;
  if (รอ > 0) test.info().setTimeout(test.info().timeout + รอ);
  return ปล่อย;
}

// ถือทุกข้อในไฟล์ (ข้อที่ไม่มี beforeAll/afterAll แก้แถวนั้น) — ไฟล์ที่ตั้งค่าแถวใน beforeAll ให้เรียก ถือแถวกลางชดเวลา ต้น beforeAll · ปล่อยท้าย afterAll
export function ใช้แถวกลาง(test: typeof ตัวทดสอบ, ...ชื่อ: ชื่อแถวกลาง[]) {
  let ปล่อย: (() => void) | null = null;
  test.beforeEach(async () => { ปล่อย = await ถือแถวกลางชดเวลา(test, ชื่อ); });
  test.afterEach(async () => { ปล่อย?.(); ปล่อย = null; });
}
