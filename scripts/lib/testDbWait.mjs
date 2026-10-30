// ── ชุดทดสอบที่ใช้ฐานทดสอบ เจอเซสชันอื่นถือล็อกอยู่ → รายงาน "รอ" ไม่ใช่ "ตก" (บอสสั่ง 29 ต.ค. 69 · คิวข้อ 2) ─────────────────
//   เหตุ: รัน db-push-prod-guard นอกรอบตรวจขณะ ef ถือล็อก → คำสั่งย่อยหยุด (exit 3) → ชุดทดสอบนับเป็น "ตก 4" ทั้งที่ไม่มีอะไรพัง
//   เรียกตอนต้นชุดทดสอบ: ฐานว่าง / เราถือเอง (ตัวแม่ส่งรหัสมา · รอบตรวจเต็ม) / ล็อกค้างของโปรเซสที่ตายแล้ว = รันต่อ
//   เซสชันอื่นถืออยู่ = พิมพ์ "รอ" บอกว่าใครใช้ แล้วออกด้วยรหัส 75 (ไม่ใช่ 1 = ตก) · ไม่รอเอง (ไม่ค้างเงียบ)
//   แยกจาก testDbLock.mjs เพราะตัวนั้นสลับกุญแจ API ตอน import — ชุดทดสอบที่แค่ถามว่าฐานว่างไหมไม่ควรโดน
//   ข้อทดสอบ: tests/tools/testdb-wait.test.mjs
import os from "node:os";
import path from "node:path";
import { อ่านล็อก, ยังทำงานอยู่ } from "./fileLock.mjs";

export const รหัสรอ = 75;
const ไฟล์ล็อก = () => process.env.PMS_TESTDB_LOCK || path.join(os.homedir(), ".pms-testdb.lock");

/** ใครถือฐานทดสอบอยู่ (ที่ไม่ใช่เรา) · null = ว่าง/เราถือ/ล็อกค้างของโปรเซสที่ตายแล้ว */
export function ผู้ถือฐานอื่น() {
  const cur = อ่านล็อก(ไฟล์ล็อก());
  if (!cur || !ยังทำงานอยู่(cur.pid)) return null;
  if (process.env.PMS_TESTDB_LOCK_HELD && process.env.PMS_TESTDB_LOCK_HELD === cur.token) return null;
  return cur;
}

export function รอถ้าฐานไม่ว่าง(ชุด) {
  const cur = ผู้ถือฐานอื่น();
  if (!cur) return;
  console.log(`รอ — ${ชุด} ยังไม่ได้รัน: ฐานทดสอบถูก "${cur.งาน ?? "ไม่ทราบ"}"${cur.เซสชัน ? ` ของเซสชัน ${cur.เซสชัน}` : ""} ใช้อยู่ (ไม่ใช่ตก) · รันใหม่เมื่อฐานว่าง`);
  process.exit(รหัสรอ);
}
