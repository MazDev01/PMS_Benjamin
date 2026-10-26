// ── ตัวล็อกไฟล์กลาง: งานที่ห้ามรันซ้อนกันบนเครื่องเดียว (ยกจาก prodLock.mjs · 22 ต.ค. 69) ─────────────────────────────
//
// ใช้กับ: งานที่แตะฐานจริง (prodLock.mjs) · ฐานทดสอบ pms-dbcheck (testDbLock.mjs) · จองเลขใบปรับฐาน (migration-new.mjs)
// วิธี: ไฟล์ล็อกไฟล์เดียวต่อเครื่อง สร้างแบบ "มีอยู่แล้ว = ล้ม" (wx) — ใช้ร่วมกันทุกหน้าต่าง/ทุกโฟลเดอร์เซสชัน
//   มีคนถืออยู่ → รอ (ถ้าขอรอ) หรือหยุดทันที (exit 3) พร้อมบอกว่างานอะไร เซสชันไหน เริ่มเมื่อไร
//   ล็อกของโปรเซสที่ตายแล้ว (pid ไม่อยู่) = ล็อกค้าง เก็บกวาดให้แล้วไปต่อ
//   ตัวลูกที่ถูกเรียกจากตัวที่ถือล็อกอยู่แล้ว ส่งรหัสล็อกต่อทาง env (envHeld) → ไม่ล็อกซ้ำ ไม่รอตัวเอง
import { openSync, writeSync, closeSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";

export function ยังทำงานอยู่(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; }
}
export const อ่านล็อก = (p) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };
const นอน = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const เวลาไทย = (iso) => iso ? new Date(iso).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }) : "ไม่ทราบเวลา";

/**
 * @param {object} o
 * @param {string} o.path        ที่อยู่ไฟล์ล็อก
 * @param {string} o.envHeld     ชื่อ env ที่ตัวแม่ส่งรหัสล็อกให้ตัวลูก
 * @param {string} o.เรื่อง       คำบนจอ เช่น "แตะฐานจริง" / "ใช้ฐานทดสอบ"
 * @param {string} [o.เซสชัน]     ชื่อเซสชันที่ขอ (โชว์ให้คนที่มาทีหลังเห็น)
 */
export function ตัวล็อก({ path, envHeld, เรื่อง, เซสชัน = "" }) {
  /**
   * ขอล็อก — ได้: คืน { token, release } · ไม่ได้: พิมพ์เหตุผลแล้ว process.exit(3)
   * @param {string} งาน ชื่องานที่โชว์ให้ตัวที่มาทีหลังเห็น
   * @param {{ รอ?: number, เจ้าของ?: number }} [opt] รอได้นานสุดกี่มิลลิวินาที (0 = ไม่รอ หยุดทันที)
   *   เจ้าของ = pid ของโปรเซสที่ถือล็อกจริง (ค่าตั้งต้น = โปรเซสนี้) — คำสั่งช่วยขอล็อกแทนตัวแม่ (scripts/testdb-lock-cli.mjs)
   *   เจ้าของเป็นโปรเซสอื่น = ไม่ปล่อยเองตอนจบ (ตัวแม่ปล่อย · ตัวแม่ตายก่อน = ล็อกค้างที่คนถัดไปเก็บกวาดเอง)
   */
  return function ขอล็อก(งาน, { รอ = 0, เจ้าของ = process.pid } = {}) {
    const held = process.env[envHeld];
    if (held && อ่านล็อก(path)?.token === held) return { token: held, release: () => {} };   // ตัวแม่ถือไว้ให้แล้ว
    const หมดเวลา = Date.now() + รอ;
    let บอกแล้ว = false, อ่านไม่ได้ = 0;
    for (;;) {
      try {
        const fd = openSync(path, "wx");
        const token = `${process.pid}-${Date.now()}`;
        writeSync(fd, JSON.stringify({ token, pid: เจ้าของ, งาน, เซสชัน, เริ่ม: new Date().toISOString(), เครื่อง: os.hostname() }));
        closeSync(fd);
        let ปล่อยแล้ว = false;
        const release = () => {
          if (ปล่อยแล้ว) return; ปล่อยแล้ว = true;
          if (อ่านล็อก(path)?.token === token) rmSync(path, { force: true });
        };
        if (เจ้าของ === process.pid) {
          process.on("exit", release);
          for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, () => { release(); process.exit(130); });
        }
        return { token, release };
      } catch (e) {
        if (e.code !== "EEXIST") throw e;
        const cur = อ่านล็อก(path);
        if (cur && !ยังทำงานอยู่(cur.pid)) {
          console.error(`⚠️ พบล็อกค้างของงาน "${cur.งาน}"${cur.เซสชัน ? ` (เซสชัน ${cur.เซสชัน})` : ""} (เริ่ม ${cur.เริ่ม} · โปรเซส ${cur.pid} ไม่ทำงานแล้ว) — เก็บกวาดแล้วไปต่อ`);
          rmSync(path, { force: true });
          continue;
        }
        if (!cur && ++อ่านไม่ได้ < 50) { นอน(100); continue; }   // อีกตัวเพิ่งสร้างไฟล์ ยังเขียนไม่เสร็จ — ลองอ่านใหม่
        const ใคร = `"${cur?.งาน ?? "ไม่ทราบ"}"${cur?.เซสชัน ? ` ของเซสชัน ${cur.เซสชัน}` : ""} (เริ่ม ${เวลาไทย(cur?.เริ่ม)} · โปรเซส ${cur?.pid ?? "?"})`;
        if (Date.now() < หมดเวลา) {
          if (!บอกแล้ว) { console.error(`⏳ รอคิว — มีงานอื่น${เรื่อง}อยู่: ${ใคร}`); บอกแล้ว = true; }
          นอน(2000);
          continue;
        }
        console.error(`⛔ หยุด — มีงานอื่น${เรื่อง}อยู่: ${ใคร}`);
        console.error(`   รอให้งานนั้นจบก่อนแล้วค่อยสั่ง "${งาน}" ใหม่ · ไฟล์ล็อก: ${path}`);
        process.exit(3);
      }
    }
  };
}
