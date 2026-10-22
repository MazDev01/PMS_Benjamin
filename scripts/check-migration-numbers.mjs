// ── ตัวตรวจ: เลขใบปรับฐานไม่ซ้ำ ไม่ข้ามเลข (บอสสั่ง 22 ต.ค. 69) ──────────────────────────────────────────────────────
//   หลายเซสชันตั้งเลขใบพร้อมกัน → ซ้ำได้ (สองใบเลขเดียวกัน = ลำดับลงฐานไม่แน่นอน) หรือข้าม (ใบที่จองแล้วหาย/ยังไม่ส่ง)
//   จองเลขด้วย npm run migration:new เสมอ · ตัวนี้อยู่ใน npm run checks (ขั้นแรกของรอบตรวจเต็ม) → ซ้ำ/ข้าม = รอบตรวจตก
//   ข้ามเลข: โฟลเดอร์รวมงาน (ไม่มี .pms-session.json) ห้ามเด็ดขาด — ใบต้องลงฐานจริงตามลำดับเลข
//     เซสชันลูก: ข้ามได้เฉพาะเลขที่ "เซสชันอื่นจองไว้" (บันทึกการจองของ migration:new) — ยังไม่ merge เข้ามาไม่ใช่ความผิด
//     คนรวมงานต้อง merge ตามลำดับเลข (scripts/session-merge.mjs ตรวจด้วยตัวนี้หลัง merge → ขาดช่วง = ไม่ยอม)
// รัน: node scripts/check-migration-numbers.mjs [โฟลเดอร์ใบ]
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const โฟลเดอร์ = process.argv[2] ?? "supabase/migrations";
const เซสชันลูก = existsSync(".pms-session.json") ? JSON.parse(readFileSync(".pms-session.json", "utf8")) : null;
/** เลขที่เซสชันอื่นจองไว้ (เฉพาะตอนรันในเซสชันลูก) */
const จองโดยคนอื่น = new Map();
if (เซสชันลูก) {
  try {
    const f = process.env.PMS_MIGRATION_RESERVATIONS
      || path.resolve(execFileSync("git", ["rev-parse", "--git-common-dir"], { encoding: "utf8" }).trim(), "pms-migration-reservations.json");
    for (const j of JSON.parse(readFileSync(f, "utf8"))) if (j.เซสชัน !== เซสชันลูก.ชื่อ) จองโดยคนอื่น.set(Number(j.เลข), j.เซสชัน);
  } catch { /* ยังไม่มีบันทึกการจอง */ }
}
/** เลขที่ข้ามได้ พร้อมเหตุผล — เพิ่มได้เฉพาะของเก่าที่ลงฐานจริงไปแล้ว */
const ข้ามได้ = new Map([
  [51, "ประวัติเดิม: ใบ 0051 ไม่เคยมีตั้งแต่แรก ฐานจริงลง 0050 → 0052 ไปแล้ว (บอสรับ 22 ต.ค. 69)"],
]);

const ไฟล์ = readdirSync(โฟลเดอร์).filter(f => f.endsWith(".sql")).sort();
const ผิด = [];
const ตามเลข = new Map();
for (const f of ไฟล์) {
  const m = /^(\d{4})_[a-z0-9_]+\.sql$/.exec(f);
  if (!m) { ผิด.push(`${f} — ชื่อไฟล์ต้องเป็น NNNN_ชื่อ.sql (ภาษาอังกฤษตัวเล็ก) · ใช้ npm run migration:new`); continue; }
  const n = Number(m[1]);
  ตามเลข.set(n, [...(ตามเลข.get(n) ?? []), f]);
}
for (const [n, fs] of ตามเลข) if (fs.length > 1) ผิด.push(`เลข ${String(n).padStart(4, "0")} ซ้ำ ${fs.length} ใบ: ${fs.join(" · ")}`);
const เลข = [...ตามเลข.keys()].sort((a, b) => a - b);
for (let n = 1; n <= (เลข.at(-1) ?? 0); n++) {
  if (!ตามเลข.has(n) && !ข้ามได้.has(n) && !จองโดยคนอื่น.has(n)) ผิด.push(`ข้ามเลข ${String(n).padStart(4, "0")} — ไม่มีไฟล์ใบนี้ (จองแล้วไม่ได้ส่ง หรือตั้งเลขเอง)`);
}
for (const n of ข้ามได้.keys()) if (ตามเลข.has(n)) ผิด.push(`เลข ${String(n).padStart(4, "0")} อยู่ในรายการข้ามได้ แต่มีไฟล์แล้ว — เอาออกจากรายการ`);

if (ผิด.length) {
  console.error("✗ check-migration-numbers: เลขใบปรับฐานผิด");
  for (const x of ผิด) console.error(`  ${x}`);
  process.exit(1);
}
console.log(`✓ check-migration-numbers: ใบปรับฐาน ${ไฟล์.length} ใบ เลขไม่ซ้ำ ไม่ข้าม (ถึง ${String(เลข.at(-1) ?? 0).padStart(4, "0")} · ยกเว้น ${[...ข้ามได้.keys()].map(n => String(n).padStart(4, "0")).join(", ")})`);
