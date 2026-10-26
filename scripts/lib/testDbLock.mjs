// ── ล็อกฐานทดสอบ pms-dbcheck: ทุกงานที่เขียนฐานทดสอบต้องถือล็อก (บอสสั่ง 22 ต.ค. 69) ───────────────────────────────
//
// เหตุ: ทุกเซสชันใช้ฐานทดสอบตัวเดียวกัน — ข้อทดสอบของเซสชันหนึ่งไปกวาด/เขียนทับข้อมูลของอีกเซสชันกลางทาง
//   (เคยต้องบอกกันเองทางข้อความว่า "ห้ามแตะฐานระหว่างรอบตรวจ" ซึ่งพึ่งความจำ — ตัวนี้กันด้วยเครื่องมือแทน)
// ใช้: รอบตรวจเต็ม (ถือตลอดรอบ · รอคิว) · playwright (playwright.config.ts) · reset-test-db · ข้อทดสอบฐาน
// กลไกเดียวกับตัวล็อกของ db:push (scripts/lib/fileLock.mjs) — คนละไฟล์ล็อก
//   ที่อยู่ไฟล์: PMS_TESTDB_LOCK (ข้อทดสอบใช้ที่อื่น) หรือ <โฟลเดอร์บ้าน>/.pms-testdb.lock
//   ตัวลูกของงานที่ถือล็อก ได้รหัสทาง PMS_TESTDB_LOCK_HELD → ไม่ล็อกซ้ำ
//   รอคิวแทนหยุด: PMS_TESTDB_LOCK_WAIT=<นาที> (รอบตรวจเต็มตั้งให้เอง)
// ── 26 ต.ค. 69 (บอสสั่ง): เขียนไม่ได้ถ้าไม่ถือล็อก — ได้ล็อก = กุญแจเขียนใหม่ (scripts/lib/testDbGuard.mjs) ใส่ process.env
//   ให้ตัวลูกทุกตัว (รหัส psql · กุญแจ API) · ปล่อยล็อก = สุ่มกุญแจทิ้ง (เฉพาะถ้ากุญแจยังเป็นของเรา — ผู้ถือคนถัดไปไม่โดนทับ)
//   ไฟล์ล็อกอยู่ที่อื่น (PMS_TESTDB_LOCK) = ข้อทดสอบกลไกล็อก ไม่แตะฐาน
//   ประวัติผู้ถือล็อก ~/.pms-testdb-lock-history.jsonl → ตัวตรวจของค้างบอกได้ว่าแถวมาจากเซสชันไหน (บอสสั่ง 26 ต.ค. 69)
import { appendFileSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ตัวล็อก } from "./fileLock.mjs";
import { ชื่อเซสชัน } from "./session.mjs";
import { เปิดการเขียน, ปิดการเขียน } from "./testDbGuard.mjs";
import "./testDbFetchKey.mjs";   // โปรเซสที่ขอล็อกเองก็สลับกุญแจ API ด้วย (ตัวลูกได้ทาง NODE_OPTIONS)

export const ไฟล์ล็อกฐานทดสอบ = () => process.env.PMS_TESTDB_LOCK || path.join(os.homedir(), ".pms-testdb.lock");
export const ไฟล์ประวัติล็อก = () => process.env.PMS_TESTDB_LOCK_HISTORY || path.join(os.homedir(), ".pms-testdb-lock-history.jsonl");
const คุมฐานจริง = () => !process.env.PMS_TESTDB_LOCK;   // ไฟล์ล็อกที่อื่น = ข้อทดสอบกลไกล็อก

/** @param {string} งาน @param {{ รอนาที?: number }} [opt] */
export function ขอล็อกฐานทดสอบ(งาน, { รอนาที = Number(process.env.PMS_TESTDB_LOCK_WAIT || 0) } = {}) {
  const ตัวแม่ = process.env.PMS_TESTDB_LOCK_HELD;
  const ล็อก = ตัวล็อก({ path: ไฟล์ล็อกฐานทดสอบ(), envHeld: "PMS_TESTDB_LOCK_HELD", เรื่อง: "ใช้ฐานทดสอบ", เซสชัน: ชื่อเซสชัน() })(งาน, { รอ: รอนาที * 60_000 });
  if (ตัวแม่ && ตัวแม่ === ล็อก.token) return ล็อก;   // ตัวแม่ถือไว้ และเปิดการเขียนให้แล้ว (กุญแจมาทาง env)
  process.env.PMS_TESTDB_LOCK_HELD = ล็อก.token;
  if (!คุมฐานจริง()) return ล็อก;
  let กุญแจ;
  try { กุญแจ = เปิดการเขียน(); Object.assign(process.env, กุญแจ); }
  catch (e) { ล็อก.release(); console.error(`⛔ ${e.message}`); process.exit(4); }
  try { appendFileSync(ไฟล์ประวัติล็อก(), JSON.stringify({ token: ล็อก.token, เซสชัน: ชื่อเซสชัน(), งาน, เริ่ม: new Date().toISOString() }) + "\n"); } catch { /* ประวัติเป็นของช่วยเท่านั้น */ }
  let ปิดแล้ว = false;
  const ปิด = () => {
    if (ปิดแล้ว) return; ปิดแล้ว = true;
    ปิดการเขียน(กุญแจ.PMS_TESTDB_PG_PASSWORD);
    try { appendFileSync(ไฟล์ประวัติล็อก(), JSON.stringify({ token: ล็อก.token, จบ: new Date().toISOString() }) + "\n"); } catch { /* */ }
  };
  process.on("exit", ปิด);
  return { token: ล็อก.token, release: () => { ปิด(); ล็อก.release(); } };
}

/** ช่วงที่แต่ละเซสชันถือล็อก [{ เซสชัน, งาน, เริ่ม, จบ? }] (ใหม่สุดท้ายสุด) */
export function ประวัติผู้ถือล็อก() {
  let บรรทัด = [];
  try { บรรทัด = readFileSync(ไฟล์ประวัติล็อก(), "utf8").split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l)); } catch { return []; }
  const ช่วง = new Map();
  for (const x of บรรทัด) {
    if (x.เริ่ม) ช่วง.set(x.token, { เซสชัน: x.เซสชัน, งาน: x.งาน, เริ่ม: x.เริ่ม });
    else if (x.จบ && ช่วง.has(x.token)) ช่วง.get(x.token).จบ = x.จบ;
  }
  return [...ช่วง.values()];
}

/** ผู้ถือล็อกตอนเวลานั้น (ISO/Date) · ไม่เจอ = null */
export function ใครถือล็อกตอน(เวลา) {
  const t = new Date(เวลา).getTime();
  if (!Number.isFinite(t)) return null;
  return ประวัติผู้ถือล็อก().filter(x => Date.parse(x.เริ่ม) <= t && (!x.จบ || t <= Date.parse(x.จบ))).at(-1) ?? null;
}
