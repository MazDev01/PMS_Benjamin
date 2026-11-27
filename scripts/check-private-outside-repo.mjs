// ── ตัวตรวจ: สำรองฐานจริง + กุญแจ ต้องอยู่นอก repo (บอสสั่ง 26 พ.ย. 69) ──────────────────────────────────────────────
//
// เหตุ: repo เป็น public · git clean -fdx ลบของที่ ignore ได้ · AI ค้นไฟล์ทั้งโปรเจกต์แล้วอาจอ่านเจอข้อมูลลูกค้าจริง/กุญแจ
//   ที่จริง = C:/.claude/pms-private/prod-backups · prod-secrets (PMS_PRIVATE_ROOT ทับได้ · scripts/lib/localPaths.mjs)
// ตก เมื่อ: มีโฟลเดอร์ (หรือทางลัด) ชื่อ prod-backups / prod-secrets / pms-prod-backups / pms-prod-secrets ที่ใดก็ได้ใต้ราก repo
//   ราก repo = โฟลเดอร์หลัก (git rev-parse --git-common-dir) — รันในโฟลเดอร์เซสชันก็ตรวจทั้งโฟลเดอร์หลัก รวม .local และทุกเซสชัน
//   · รากส่วนตัว (PMS_PRIVATE_ROOT) ชี้เข้าใต้ repo = ตก
// ดูแค่ชื่อโฟลเดอร์ — ไม่เปิดไฟล์ข้างใน ไม่เดินเข้าโฟลเดอร์ที่เจอ · ไม่เดินตามทางลัด
// ข้ามเฉพาะ node_modules · .git · .next* · .turbo (ห้ามข้าม .local)
// ใช้: node scripts/check-private-outside-repo.mjs   (อยู่ใน pnpm checks) · ข้อทดสอบ tests/tools/private-outside-repo.test.mjs
import { readdirSync } from "node:fs";
import path from "node:path";
import { ห้ามเปิด, โฟลเดอร์หลัก, รากส่วนตัว } from "./lib/localPaths.mjs";

const ราก = โฟลเดอร์หลัก();
const ชื่อห้าม = new Set(ห้ามเปิด.map(n => n.toLowerCase()));
const ข้าม = (n) => n === "node_modules" || n === ".git" || n === ".turbo" || n.startsWith(".next");
const เจอ = [], อ่านไม่ได้ = [];
let โฟลเดอร์ = 0;

const เดิน = (d) => {
  let รายการ;
  try { รายการ = readdirSync(d, { withFileTypes: true }); } catch (e) { อ่านไม่ได้.push(`${path.relative(ราก, d) || "."} (${e.code ?? e.message})`); return; }
  โฟลเดอร์++;
  for (const e of รายการ) {
    const p = path.join(d, e.name);
    if (ชื่อห้าม.has(e.name.toLowerCase())) { เจอ.push(path.relative(ราก, p).split(path.sep).join("/")); continue; }   // ไม่เดินเข้า ไม่เปิดไฟล์
    if (e.isDirectory() && !e.isSymbolicLink() && !ข้าม(e.name)) เดิน(p);
  }
};
const เริ่ม = Date.now();
เดิน(ราก);

const r = path.relative(path.resolve(ราก), path.resolve(รากส่วนตัว()));
const รากส่วนตัวใต้repo = r === "" || (!r.startsWith("..") && !path.isAbsolute(r));

console.log(`โฟลเดอร์สำรองฐานจริง/กุญแจใต้ repo: ${เจอ.length} (ราก ${ราก} · เดิน ${โฟลเดอร์} โฟลเดอร์ · ${Date.now() - เริ่ม} ms · ที่ถูก ${รากส่วนตัว()})`);
if (อ่านไม่ได้.length) console.log(`  · เปิดโฟลเดอร์ไม่ได้ ${อ่านไม่ได้.length}: ${อ่านไม่ได้.slice(0, 5).join(", ")}`);
if (เจอ.length) {
  for (const x of เจอ) console.log(`  ✗ ${x}`);
  console.log(`  → ย้ายทั้งโฟลเดอร์ไปที่ ${รากส่วนตัว()}/ (ไม่เปิดไฟล์) · ห้ามสร้างโฟลเดอร์ชื่อนี้ใต้ repo · ข้อทดสอบใช้โฟลเดอร์ชั่วคราวนอก repo`);
  process.exitCode = 1;
}
if (รากส่วนตัวใต้repo) {
  console.log(`  ✗ รากส่วนตัว ${รากส่วนตัว()} อยู่ใต้ repo — ตั้ง PMS_PRIVATE_ROOT ให้อยู่นอก ${ราก}`);
  process.exitCode = 1;
}
