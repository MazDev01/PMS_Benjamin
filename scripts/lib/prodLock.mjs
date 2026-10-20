// ── ตัวล็อกงานที่แตะฐานจริง: สำรอง · ซ้อมกู้ · db:push ห้ามรันซ้อนกัน (บอสสั่ง 20 ต.ค. 69) ─────────────────────────
//
// เหตุจริง 20 ต.ค. 69 09:32: กำลังสำรองฐานจริง (pg_dump อ่านมุมมอง dealers_directory) พร้อมกับ db:push:prod ลงใบ 0216
//   ซึ่งแก้มุมมองเดียวกัน → deadlock · สำรองล้ม และใบลงไปก่อนมีจุดย้อนกลับที่ซ้อมกู้แล้ว
// วิธีกัน: ไฟล์ล็อกไฟล์เดียวต่อเครื่อง (ใช้ร่วมกันทุกหน้าต่าง/ทุกคนที่รันบนเครื่องนี้) สร้างแบบ "มีอยู่แล้ว = ล้ม" (wx)
//   ตัวที่มาทีหลังหยุดทันที พร้อมบอกว่ารออะไร ใครเริ่ม เมื่อไร · ตัวที่ตายไปแล้ว (pid ไม่อยู่) = ล็อกค้าง เก็บกวาดให้แล้วไปต่อ
//
// ที่อยู่ไฟล์: PMS_PROD_LOCK (ข้อทดสอบใช้ที่อื่น) หรือ <โฟลเดอร์บ้าน>/.pms-prod-ops.lock
// ตัวลูกที่ถูกเรียกจากตัวที่ถือล็อกอยู่แล้ว ส่ง PMS_PROD_LOCK_HELD=<รหัสล็อก> ต่อให้ → ไม่ล็อกซ้ำ
import { openSync, writeSync, closeSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export const lockPath = () => process.env.PMS_PROD_LOCK || path.join(os.homedir(), ".pms-prod-ops.lock");

function ยังทำงานอยู่(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; }
}

const อ่านล็อก = (p) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };

/**
 * ขอล็อก — ได้: คืน { token, release } · ไม่ได้ (มีอีกตัวรันอยู่): พิมพ์เหตุผลแล้ว process.exit(3)
 * @param {string} งาน ชื่องานที่จะแสดงให้ตัวที่มาทีหลังเห็น เช่น "db:push:prod" หรือ "สำรองฐานจริง + ซ้อมกู้"
 */
export function ขอล็อก(งาน) {
  const held = process.env.PMS_PROD_LOCK_HELD;
  const p = lockPath();
  if (held) {
    const cur = อ่านล็อก(p);
    if (cur?.token === held) return { token: held, release: () => {} };   // ตัวแม่ถือไว้ให้แล้ว
  }
  for (let ครั้ง = 0; ครั้ง < 2; ครั้ง++) {
    try {
      const fd = openSync(p, "wx");
      const token = `${process.pid}-${Date.now()}`;
      writeSync(fd, JSON.stringify({ token, pid: process.pid, งาน, เริ่ม: new Date().toISOString(), เครื่อง: os.hostname() }));
      closeSync(fd);
      let ปล่อยแล้ว = false;
      const release = () => {
        if (ปล่อยแล้ว) return; ปล่อยแล้ว = true;
        if (อ่านล็อก(p)?.token === token) rmSync(p, { force: true });
      };
      process.on("exit", release);
      for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, () => { release(); process.exit(130); });
      return { token, release };
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      const cur = อ่านล็อก(p);
      if (cur && !ยังทำงานอยู่(cur.pid)) {
        console.error(`⚠️ พบล็อกค้างของงาน "${cur.งาน}" (เริ่ม ${cur.เริ่ม} · โปรเซส ${cur.pid} ไม่ทำงานแล้ว) — เก็บกวาดแล้วไปต่อ`);
        rmSync(p, { force: true });
        continue;
      }
      const เริ่ม = cur?.เริ่ม ? new Date(cur.เริ่ม).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }) : "ไม่ทราบเวลา";
      console.error(`⛔ หยุด — มีงานอื่นกำลังแตะฐานจริงอยู่: "${cur?.งาน ?? "ไม่ทราบ"}" (เริ่ม ${เริ่ม} · โปรเซส ${cur?.pid ?? "?"})`);
      console.error(`   รอให้งานนั้นจบก่อนแล้วค่อยสั่ง "${งาน}" ใหม่ · ไฟล์ล็อก: ${p}`);
      process.exit(3);
    }
  }
  console.error(`⛔ หยุด — ขอล็อกไม่สำเร็จ (${p})`);
  process.exit(3);
}
