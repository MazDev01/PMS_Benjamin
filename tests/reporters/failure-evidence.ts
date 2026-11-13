// ── ตัวรายงานหลักฐานตอนข้อทดสอบตก (บอสสั่ง 12 พ.ย. 69 · ข้อไม่นิ่งที่ทำให้เกิดซ้ำในเครื่องไม่ได้) ─────────────────────────────
//   ข้อที่ตก (ทุกครั้ง รวมครั้งแรกของข้อที่ไม่นิ่ง) ได้หลักฐาน 3 อย่างในโฟลเดอร์ของข้อนั้น:
//     1) trace.zip — บันทึกการทำงานทุกขั้น + คำขอเครือข่าย + คอนโซลของหน้าเว็บ (playwright.config: trace retain-on-failure)
//     2) ภาพหน้าจอ (screenshot only-on-failure)
//     3) server-log.txt — ข้อความจากเซิร์ฟเวอร์ (stdout/stderr ของ next start) ช่วงเวลาที่ข้อนั้นรัน ±2 วินาที
//        (scripts/lib/serverLog.mjs · scripts/test-prodbuild.mjs ส่งที่อยู่โฟลเดอร์มาทาง PMS_SERVER_LOG_DIR)
//   ช่วงเวลานั้นเซิร์ฟเวอร์ไม่พิมพ์อะไรเลย = เขียนว่าไม่มี (ไม่ปล่อยไฟล์หาย — คนอ่านจะได้รู้ว่าเก็บแล้วแต่ว่าง)
//   ไม่รอ ไม่รันซ้ำ ไม่เปลี่ยนผลของข้อ — เก็บของอย่างเดียว
// ข้อทดสอบ: tests/tools/failure-evidence.test.mjs
import type { Reporter, TestCase, TestResult } from "@playwright/test/reporter";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { serverLinesBetween } from "../../scripts/lib/serverLog.mjs";

const ขอบ = 2_000;

export default class หลักฐานตอนตก implements Reporter {
  onTestEnd(test: TestCase, r: TestResult) {
    if (r.status === "passed" || r.status === "skipped") return;
    const โฟลเดอร์ = process.env.PMS_SERVER_LOG_DIR;
    if (!โฟลเดอร์) return;   // ไม่ใช่รอบที่ test-prodbuild สตาร์ทเซิร์ฟเวอร์เอง (เช่น โหมดพัฒนา) — ไม่มีไฟล์ให้ตัด
    const เริ่ม = r.startTime.getTime();
    const บรรทัด = serverLinesBetween(โฟลเดอร์, เริ่ม - ขอบ, เริ่ม + r.duration + ขอบ);
    // วางข้าง trace/ภาพหน้าจอของครั้งนั้น (โฟลเดอร์ของไฟล์แนบ) · ไม่มีไฟล์แนบ = โฟลเดอร์บันทึกเซิร์ฟเวอร์/ข้อตก
    const แนบ = r.attachments.find(a => a.path)?.path;
    const ที่ = แนบ ? path.dirname(แนบ) : path.join(โฟลเดอร์, "ข้อตก", `${path.basename(test.location.file)}-${test.location.line}-ครั้ง${r.retry}`);
    mkdirSync(ที่, { recursive: true });
    const หัว = `ข้อ: ${path.basename(test.location.file)}:${test.location.line} › ${test.title}\nครั้งที่: ${r.retry} · สถานะ: ${r.status} · worker ${r.workerIndex}\n` +
      `ช่วงเวลา (เวลาไทย): ${new Date(เริ่ม - ขอบ + 7 * 3_600_000).toISOString().slice(11, 23)} – ${new Date(เริ่ม + r.duration + ขอบ + 7 * 3_600_000).toISOString().slice(11, 23)}\n\n`;
    writeFileSync(path.join(ที่, "server-log.txt"), หัว + (บรรทัด.length ? บรรทัด.join("\n") : "(เซิร์ฟเวอร์ไม่พิมพ์ข้อความใดในช่วงนี้)") + "\n");
  }
  printsToStdio() { return false; }
}
