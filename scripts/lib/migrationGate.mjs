// ── ใบปรับฐานต้องผ่านรอบตรวจเต็มก่อนลงฐานจริง (บอสสั่ง 21 ต.ค. 69 · เหตุครั้งที่ 2: ใบ 0230 ลงฐานจริงก่อนรอบตรวจเต็มผ่าน) ──
//
//   รอบตรวจเต็มผ่าน (ตก 0 + ตัวตรวจท้ายรอบผ่าน) → บันทึกลายนิ้วมือ (sha256) ของไฟล์ใบปรับฐานทุกไฟล์ลง supabase/gate-passed-migrations.json
//   db:push:prod ตรวจก่อนเริ่มสำรอง: ทุกไฟล์ใบต้องอยู่ในบันทึกและลายนิ้วมือตรงกัน
//     ใบใหม่ที่ยังไม่ผ่านรอบตรวจ หรือแก้หลังรอบตรวจผ่าน = หยุด ไม่ลงใบ บอกว่า "ใบ XXXX ยังไม่ผ่านรอบตรวจเต็ม รอให้ผ่านก่อน"
//   ตรวจทุกไฟล์ ไม่ใช่เฉพาะใบที่ยังไม่ลง — ใบเก่าที่ถูกแก้ทีหลังก็ต้องหยุดเหมือนกัน (ประวัติใบต้องตรงกับที่ทดสอบแล้ว)
//   ลายนิ้วมือคิดหลังแปลงขึ้นบรรทัดเป็น \n — git ในเครื่องแปลง CRLF/LF ได้ ไฟล์เดียวกันต้องได้ค่าเดียวกัน
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const โฟลเดอร์ใบ = () => process.env.PMS_MIGRATIONS_DIR ?? "supabase/migrations";
export const ไฟล์บันทึก = () => process.env.PMS_GATE_RECORD ?? "supabase/gate-passed-migrations.json";

/** ลายนิ้วมือของไฟล์ใบทุกไฟล์ในโฟลเดอร์ { "0226_xxx.sql": "sha256" } */
export function ลายนิ้วมือใบ(dir = โฟลเดอร์ใบ()) {
  const ผล = {};
  for (const f of readdirSync(dir).filter(n => n.endsWith(".sql")).sort()) {
    const เนื้อ = readFileSync(path.join(dir, f), "utf8").replace(/\r\n/g, "\n");
    ผล[f] = createHash("sha256").update(เนื้อ, "utf8").digest("hex");
  }
  return ผล;
}

/** บันทึกเฉพาะเมื่อรอบตรวจเต็มผ่านจริง (ตก 0 และตัวตรวจท้ายรอบผ่าน) · คืน true เมื่อเขียน */
export function บันทึกเมื่อผ่าน({ ตก, ตัวตรวจ, dir = โฟลเดอร์ใบ(), record = ไฟล์บันทึก(), ป้าย = "" }) {
  if (ตก !== 0 || ตัวตรวจ !== 0) return false;
  const ใบ = ลายนิ้วมือใบ(dir);
  writeFileSync(record, JSON.stringify({
    คำอธิบาย: "ใบปรับฐานที่ผ่านรอบตรวจเต็มแล้ว — เขียนโดย scripts/test-prodbuild.mjs เท่านั้น ห้ามแก้มือ (db:push:prod ตรวจกับไฟล์นี้)",
    บันทึกเมื่อ: new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 19).replace("T", " "),
    รอบ: ป้าย, จำนวน: Object.keys(ใบ).length, ใบ,
  }, null, 1) + "\n");
  return true;
}

/** ตรวจก่อนลงใบ · คืน { ผ่าน, ไม่ผ่าน: [{ ใบ: "0230", ไฟล์, เหตุ: "ใหม่" | "แก้หลังรอบตรวจ" }] } */
export function ตรวจใบก่อนลง(dir = โฟลเดอร์ใบ(), record = ไฟล์บันทึก()) {
  const บันทึก = existsSync(record) ? (JSON.parse(readFileSync(record, "utf8")).ใบ ?? {}) : {};
  const ไม่ผ่าน = [];
  for (const [ไฟล์, ค่า] of Object.entries(ลายนิ้วมือใบ(dir))) {
    if (บันทึก[ไฟล์] === ค่า) continue;
    ไม่ผ่าน.push({ ใบ: ไฟล์.split("_")[0], ไฟล์, เหตุ: บันทึก[ไฟล์] ? "แก้หลังรอบตรวจ" : "ใหม่" });
  }
  return { ผ่าน: ไม่ผ่าน.length === 0, ไม่ผ่าน };
}

/** ข้อความบนจอ (ภาษาไทย) ของใบที่ไม่ผ่าน */
export const ข้อความไม่ผ่าน = (ไม่ผ่าน) => ไม่ผ่าน.map(x =>
  `ใบ ${x.ใบ} ยังไม่ผ่านรอบตรวจเต็ม รอให้ผ่านก่อน${x.เหตุ === "แก้หลังรอบตรวจ" ? " (แก้ไฟล์หลังรอบตรวจผ่าน)" : ""}`);
