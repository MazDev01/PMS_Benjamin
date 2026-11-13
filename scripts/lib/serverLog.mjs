// ── บันทึกข้อความจากเซิร์ฟเวอร์ทดสอบ (บอสสั่ง 12 พ.ย. 69 · เก็บหลักฐานอัตโนมัติตอนข้อทดสอบตก) ───────────────────────────
//   เดิม next start ของรอบตรวจทิ้งข้อความทั้งหมด (stdio: "ignore") — ข้อที่ตกเพราะเซิร์ฟเวอร์ (เช่น ตัดการเชื่อมต่อ ECONNRESET
//   ข้อ flow-a-safety รอบ deploy20) จึงไม่มีหลักฐานฝั่งเซิร์ฟเวอร์เลย
//   ตอนนี้: ทุกบรรทัดของ stdout/stderr ลงไฟล์ของรอบ ขึ้นต้นด้วยเวลา (มิลลิวินาที) · ตัวรายงาน tests/reporters/failure-evidence.ts
//   ตัดช่วงเวลาของข้อที่ตกไปวางข้าง trace + ภาพหน้าจอ
//   ชื่อส่งออกเป็นอังกฤษ: ตัวรายงาน (TS) ถูกแปลงเป็น CommonJS แล้วมองไม่เห็นชื่อส่งออกภาษาไทย (เหตุเดียวกับ testDbPsql.mjs)
//   โฟลเดอร์ = <ผลของรอบ>-server (ข้างโฟลเดอร์ผลของ playwright — ห้ามอยู่ข้างใน: playwright ล้างโฟลเดอร์ผลทุกครั้งที่เริ่ม)
// ข้อทดสอบ: tests/tools/failure-evidence.test.mjs
import { appendFileSync, mkdirSync, readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";

/** โฟลเดอร์บันทึกเซิร์ฟเวอร์ของรอบ */
export const serverLogDir = (runId, ราก = "node_modules/.cache/playwright-results") => path.join(ราก, `${runId}-server`);

/** ต่อ stdout/stderr ของโปรเซสเซิร์ฟเวอร์ลงไฟล์ — ทีละบรรทัด "<เวลา ms> <ชื่อ> <out|err> <ข้อความ>" */
export function attachServerLog(child, ไฟล์, ชื่อ) {
  mkdirSync(path.dirname(ไฟล์), { recursive: true });
  for (const [ช่อง, s] of [["out", child.stdout], ["err", child.stderr]]) {
    if (!s) continue;
    let ค้าง = "";
    s.setEncoding("utf8");
    s.on("data", d => {
      const ส่วน = (ค้าง + d).split(/\r?\n/);
      ค้าง = ส่วน.pop() ?? "";
      if (ส่วน.length) appendFileSync(ไฟล์, ส่วน.map(l => `${Date.now()} ${ชื่อ} ${ช่อง} ${l}`).join("\n") + "\n");
    });
    s.on("end", () => { if (ค้าง) appendFileSync(ไฟล์, `${Date.now()} ${ชื่อ} ${ช่อง} ${ค้าง}\n`); });
  }
}

/** บรรทัดของทุกไฟล์บันทึกในโฟลเดอร์ ที่เวลาอยู่ในช่วง [ตั้งแต่, ถึง] (ms) — เรียงตามเวลา */
export function serverLinesBetween(โฟลเดอร์, ตั้งแต่, ถึง) {
  if (!existsSync(โฟลเดอร์)) return [];
  const ออก = [];
  for (const f of readdirSync(โฟลเดอร์).filter(f => f.endsWith(".log"))) {
    for (const l of readFileSync(path.join(โฟลเดอร์, f), "utf8").split("\n")) {
      const t = Number(/^(\d{13}) /.exec(l)?.[1]);
      if (t >= ตั้งแต่ && t <= ถึง) ออก.push([t, l]);
    }
  }
  return ออก.sort((a, b) => a[0] - b[0]).map(([t, l]) => `${new Date(t + 7 * 3_600_000).toISOString().slice(11, 23)} ${l.slice(14)}`);
}
