// ── ผลสำรอง+ซ้อมกู้ล่าสุดของฐานจริง: ทุกสคริปต์ที่เขียนฐานจริงต้องเห็น "ผ่าน" ภายใน 30 นาที (บอสสั่ง 28 ต.ค. 69) ───────────
// เหตุ: 28 ต.ค. 69 ซ้อมกู้ตก แต่คำสั่งที่ต่อด้วย ";" ปล่อย prod-live เขียนสาขาทดสอบลงฐานจริงต่อ — ให้เครื่องกัน ไม่ใช่จำ
// ไฟล์ผลกลาง (นอก repo): <PMS_BACKUP_ROOT>/ผลซ้อมกู้ล่าสุด.json { ผ่าน, เวลา, ชุด, เหตุ }
//   scripts/prod-backup-verify.mjs (--target prod) เขียน "ไม่ผ่าน · กำลังสำรอง" ทันทีที่เริ่ม → ผ่านแล้วค่อยเขียน "ผ่าน"
//   (รอบใหม่ล้มกลางทาง = ผลผ่านเก่าใช้ไม่ได้)
// ผู้ตรวจ: tests/prod-live/run.mjs --target prod (setup · test · files · trial · cleanup) — ไม่มี/ไม่ผ่าน/เก่าเกิน = ไม่รัน ก่อนต่อฐาน
// ข้อทดสอบ: tests/tools/prod-live-guard.test.mjs
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const นาทีที่ยอม = 30;
export const ไฟล์ผลซ้อมกู้ = () => process.env.PMS_BACKUP_RESULT
  || path.join(process.env.PMS_BACKUP_ROOT || "C:/.claude/pms-prod-backups", "ผลซ้อมกู้ล่าสุด.json");

export function บันทึกผลซ้อมกู้({ ผ่าน, ชุด, เหตุ = "" }) {
  const f = ไฟล์ผลซ้อมกู้();
  mkdirSync(path.dirname(f), { recursive: true });
  writeFileSync(f, JSON.stringify({ ผ่าน, เวลา: new Date().toISOString(), ชุด, เหตุ }, null, 2) + "\n");
}

/** คืน { ชุด } ถ้ามีผล "ผ่าน" ภายใน 30 นาทีล่าสุด · ไม่งั้นคืน { ปัญหา: ข้อความ } (ผู้เรียกต้องหยุดก่อนแตะฐานจริง) */
export function ผลสำรองล่าสุด({ now = Date.now() } = {}) {
  const f = ไฟล์ผลซ้อมกู้();
  if (!existsSync(f)) return { ปัญหา: `ไม่มีผลสำรอง+ซ้อมกู้ (${f}) — รัน npm run backup:verify ให้ผ่านก่อน` };
  let j;
  try { j = JSON.parse(readFileSync(f, "utf8")); } catch { return { ปัญหา: `อ่านผลสำรอง+ซ้อมกู้ไม่ได้ (${f}) — รัน npm run backup:verify ใหม่` }; }
  if (j.ผ่าน !== true) return { ปัญหา: `ผลสำรอง+ซ้อมกู้ล่าสุดไม่ผ่าน (${j.ชุด ?? "?"}${j.เหตุ ? ` · ${j.เหตุ}` : ""}) — แก้ให้ผ่านก่อน ห้ามเขียนฐานจริง` };
  const อายุ = (now - Date.parse(j.เวลา)) / 60_000;
  if (!(อายุ >= 0) || อายุ > นาทีที่ยอม) return { ปัญหา: `ผลสำรอง+ซ้อมกู้เก่าเกิน ${นาทีที่ยอม} นาที (ผ่านเมื่อ ${Number.isFinite(อายุ) ? Math.round(อายุ) : "?"} นาทีก่อน · ${j.ชุด}) — รัน npm run backup:verify ใหม่` };
  if (!j.ชุด) return { ปัญหา: "ผลสำรอง+ซ้อมกู้ไม่มีชื่อชุดสำรอง — รัน npm run backup:verify ใหม่" };
  return { ชุด: j.ชุด };
}

/** ด่านก่อนแตะฐานจริง: ไม่มีผล "ผ่าน" ภายใน 30 นาที = พิมพ์เหตุแล้วออกรหัส 3 ทันที (ไม่ต่อฐาน) · ผ่าน = คืนชื่อชุดสำรอง */
export function กันฐานจริง(งาน) {
  const r = ผลสำรองล่าสุด();
  if (r.ปัญหา) { console.error(`⛔ ไม่รัน ${งาน} บนฐานจริง — ${r.ปัญหา}`); process.exit(3); }
  return r.ชุด;
}
