// ── ตัวตรวจ: ห้ามมีโดเมนอีเมลเข้าระบบเดิมของดีลเลอร์เหลือในโค้ด/ข้อมูลตั้งต้น (บอสสั่ง 19 ต.ค. 69) ──────────────
//
// โดเมนเดิมยังไม่มีใครจด — ใครจดได้ + Send Email Hook ถูกปิด = รับลิงก์รีเซ็ตรหัสของทุกสาขาได้
//   บัญชีดีลเลอร์ย้ายไป <รหัสสาขา>@dealer.benjaminpebsteel.com แล้ว (lib/dealerLogin.ts · migrate-dealer-login-domain.mjs)
//   โค้ดที่ยังประกอบอีเมลด้วยโดเมนเดิม = สาขาใหม่กลับไปใช้โดเมนที่คนอื่นจดได้
// ตรวจทุกไฟล์ข้อความใน repo (ที่ git เก็บ + ไฟล์ใหม่ที่ยังไม่ commit) รวมข้อทดสอบ สคริปต์ เอกสาร ข้อมูลตั้งต้น
// ยกเว้น:
//   • supabase/migrations/ — ใบที่ลงแล้วแก้ย้อนหลังไม่ได้ (มีชื่อโดเมนในคำอธิบายประวัติ)
//   • ตัวย้ายโดเมน 2 ไฟล์ (ต้องรู้ชื่อโดเมนเดิมถึงจะหาบัญชีที่ต้องย้ายได้) และไฟล์นี้เอง
//
// ใช้: node scripts/check-no-old-login-domain.mjs   (อยู่ใน pnpm checks)
import { readFileSync, existsSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";

const ชื่อเดิม = ["partner", "agent"].join("-");   // ประกอบตอนรัน — ไฟล์นี้จะได้ไม่เจอตัวเอง (ยกเว้นไว้อยู่แล้วอีกชั้น)
const กฎ = new RegExp(`${ชื่อเดิม}(\\.|\\\\\\.)co(\\.|\\\\\\.)th|${ชื่อเดิม}`, "i");
const ยกเว้น = [
  /^supabase\/migrations\//,
  /^scripts\/lib\/loginDomainMigration\.mjs$/,
  /^scripts\/migrate-dealer-login-domain\.mjs$/,
  /^scripts\/check-no-old-login-domain\.mjs$/,
];
const ไฟล์ = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" })
  .split(/\r?\n/).filter(Boolean).filter(f => !ยกเว้น.some(r => r.test(f)));

const เจอ = [];
for (const f of ไฟล์) {
  if (!existsSync(f) || statSync(f).size > 5_000_000) continue;
  const buf = readFileSync(f);
  if (buf.includes(0)) continue;                     // ไฟล์ไบนารี (รูป/ฟอนต์/xlsx)
  buf.toString("utf8").split(/\r?\n/).forEach((บรรทัด, i) => { if (กฎ.test(บรรทัด)) เจอ.push(`${f}:${i + 1}`); });
}

console.log(`โดเมนเข้าระบบเดิมของดีลเลอร์ที่ยังเหลือในโค้ด/ข้อมูลตั้งต้น: ${เจอ.length} (ตรวจ ${ไฟล์.length} ไฟล์)`);
if (เจอ.length) {
  for (const x of เจอ.slice(0, 30)) console.log(`  ✗ ${x}`);
  console.log("  → ใช้ อีเมลเข้าระบบของสาขา() / DEALER_LOGIN_DOMAIN จาก packages/shared/lib/dealerLogin.ts แทน");
  process.exitCode = 1;
}
