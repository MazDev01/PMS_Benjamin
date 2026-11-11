// ── ตัวรายงานชื่อข้อทดสอบไม่นิ่ง (บอสสั่ง 11 พ.ย. 69) ───────────────────────────────────────────────────────────────
//   ทุกครั้งที่ playwright รัน (ทดสอบส่วนตัว · ไฟล์เดี่ยว · ทุกช่วงของรอบตรวจเต็ม · รันซ้ำไฟล์ที่ตก) ข้อที่ตกครั้งแรกแล้วผ่านตอนรันซ้ำ
//   ขึ้นชื่อท้ายผลชัด ๆ — ไม่ใช่แค่ตัวเลข "1 flaky" · ไม่นับว่าผ่าน: รายงานชื่อ + เข้ารายการรอบหน้า (รอบตรวจเต็ม = รอบอสรับทราบ · scripts/lib/flakyAck.mjs)
//   ใช้ใน playwright.config.ts (reporter ค่าตั้งต้น) และ scripts/test-prodbuild.mjs (--reporter=line,json,<ไฟล์นี้>)
// ข้อทดสอบ: tests/tools/flaky-ack.test.mjs
import type { Reporter, TestCase, TestResult } from "@playwright/test/reporter";
import path from "node:path";

export default class ชื่อข้อไม่นิ่ง implements Reporter {
  private ข้อ = new Map<string, TestCase>();
  onTestEnd(test: TestCase, _r: TestResult) {
    if (test.outcome() === "flaky") this.ข้อ.set(test.id, test);
    else this.ข้อ.delete(test.id);
  }
  onEnd() {
    const รายการ = [...this.ข้อ.values()].map(t => `${path.basename(t.location.file)}:${t.location.line} › ${t.titlePath().slice(3).join(" › ") || t.title}`);
    if (!รายการ.length) return;
    const ออก = [`\n⚠️ ข้อทดสอบไม่นิ่ง ${รายการ.length} ข้อ (ตกครั้งแรก ผ่านตอนรันซ้ำ — ไม่นับว่าผ่าน · รายงานชื่อ + เข้ารายการรอบหน้า):`,
      ...รายการ.map((k, i) => `   ${i + 1}. ${k}`)];
    process.stdout.write(ออก.join("\n") + "\n");
  }
  printsToStdio() { return false; }
}
