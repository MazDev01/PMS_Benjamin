// ── ล็อกฐานทดสอบ pms-dbcheck: ทุกงานที่เขียนฐานทดสอบต้องถือล็อก (บอสสั่ง 22 ต.ค. 69) ───────────────────────────────
//
// เหตุ: ทุกเซสชันใช้ฐานทดสอบตัวเดียวกัน — ข้อทดสอบของเซสชันหนึ่งไปกวาด/เขียนทับข้อมูลของอีกเซสชันกลางทาง
//   (เคยต้องบอกกันเองทางข้อความว่า "ห้ามแตะฐานระหว่างรอบตรวจ" ซึ่งพึ่งความจำ — ตัวนี้กันด้วยเครื่องมือแทน)
// ใช้: รอบตรวจเต็ม (ถือตลอดรอบ · รอคิว) · playwright (global-setup) · reset-test-db · ข้อทดสอบฐาน
// กลไกเดียวกับตัวล็อกของ db:push (scripts/lib/fileLock.mjs) — คนละไฟล์ล็อก
//   ที่อยู่ไฟล์: PMS_TESTDB_LOCK (ข้อทดสอบใช้ที่อื่น) หรือ <โฟลเดอร์บ้าน>/.pms-testdb.lock
//   ตัวลูกของงานที่ถือล็อก ได้รหัสทาง PMS_TESTDB_LOCK_HELD → ไม่ล็อกซ้ำ
//   รอคิวแทนหยุด: PMS_TESTDB_LOCK_WAIT=<นาที> (รอบตรวจเต็มตั้งให้เอง)
import os from "node:os";
import path from "node:path";
import { ตัวล็อก } from "./fileLock.mjs";
import { ชื่อเซสชัน } from "./session.mjs";

export const ไฟล์ล็อกฐานทดสอบ = () => process.env.PMS_TESTDB_LOCK || path.join(os.homedir(), ".pms-testdb.lock");

/** @param {string} งาน @param {{ รอนาที?: number }} [opt] */
export function ขอล็อกฐานทดสอบ(งาน, { รอนาที = Number(process.env.PMS_TESTDB_LOCK_WAIT || 0) } = {}) {
  return ตัวล็อก({ path: ไฟล์ล็อกฐานทดสอบ(), envHeld: "PMS_TESTDB_LOCK_HELD", เรื่อง: "ใช้ฐานทดสอบ", เซสชัน: ชื่อเซสชัน() })(งาน, { รอ: รอนาที * 60_000 });
}
