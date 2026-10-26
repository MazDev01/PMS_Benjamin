// ── ตัวตรวจ: ทางลบ/แก้บันทึกการใช้งาน (audit_log) มีได้แค่ 2 ทาง (บอสสั่ง 26 ต.ค. 69 · ใบ 0241) ────────────────────────────
//   1) ลบอัตโนมัติเกิน 2 ปี — งานตั้งเวลาของใบ 0062 (สั่งใหม่ในใบ 0241 พร้อมสวิตช์ 'retention')
//   2) สคริปต์ล้างข้อมูลทดสอบ — เฉพาะแถว ZZT/live-* (สวิตช์ 'test' หรือ audit_test_cleanup ของ service_role)
//   ไฟล์อื่นที่ลบ/แก้/ล้างตาราง audit_log · เปิดสวิตช์ pms.audit_delete · เรียก audit_test_cleanup
//   · ปิดตัวดัก · นิยามตัวดักหรือกติกาแถวทดสอบใหม่ = ทางลบเพิ่มเข้ามา → ตัวตรวจตก (รอบตรวจเต็มตก)
//   เพิ่มไฟล์ในรายการอนุญาตได้เฉพาะเมื่อบอสสั่ง · ข้อทดสอบระดับฐาน (supabase/tests/*.sql) ได้รับยกเว้นเมื่อทั้งไฟล์ begin … rollback
//   อ่านเฉพาะไฟล์ที่ git เก็บ · ไม่นับคำอธิบาย · ข้อทดสอบ: tests/tools/audit-delete-paths.test.mjs
import { readFileSync } from "node:fs";
import { ไฟล์ที่gitเก็บ } from "./lib/gitFiles.mjs";

/** ไฟล์ที่ได้รับอนุญาต พร้อมเหตุผล (ทางลบ 2 ทางที่บอสอนุญาต + ไฟล์ที่นิยามกติกา) */
const อนุญาต = new Map([
  ["supabase/migrations/0062_audit_log_retention.sql", "ทางที่ 1: ลบอัตโนมัติเกิน 2 ปี (ใบเดิม)"],
  ["supabase/migrations/0241_audit_log_append_only.sql", "นิยามตัวดัก + ทางที่ 1 (สวิตช์ retention) + ทางที่ 2 (audit_test_cleanup)"],
  ["tests/prod-live/cleanup.sql", "ทางที่ 2: สคริปต์ล้างข้อมูลทดสอบของ prod-live (ZZT/live-*)"],
  ["tests/prod-live/email-send-cleanup.mjs", "ทางที่ 2: ล้างแถวทดสอบส่งอีเมลจริง (ZZT)"],
  ["scripts/backup-drill.mjs", "ทางที่ 2: ลบแถวซ้อมกู้ (ติดป้าย ZZT)"],
  ["tests/scenario/audit-integrity.spec.ts", "ทางที่ 2 (ล้างแถว ZZTEST) + ข้อทดสอบที่พยายามแก้/ลบแล้วต้องถูกปฏิเสธ"],
  ["tests/scenario/flow-d-leftovers.spec.ts", "ทางที่ 2: ล้างแถว ZZTEST ที่ข้อทดสอบสร้าง"],
  ["tests/scenario/hq-dashboard.spec.ts", "ทางที่ 2: ล้างแถวทดสอบแดชบอร์ด (สวิตช์ test)"],
  ["scripts/check-audit-delete-paths.mjs", "ตัวตรวจนี้เอง"],
  ["tests/tools/audit-cleanup.test.mjs", "ข้อทดสอบชุดล้าง prod-live (ทำเงื่อนไขกว้างเกินเพื่อพิสูจน์ · ทรานแซกชันย้อนกลับ)"],
  ["tests/tools/audit-delete-paths.test.mjs", "ข้อทดสอบของตัวตรวจนี้ (วางทางลบปลอมใน repo จำลอง)"],
]);
const แบบ = [
  /\.from\(\s*["'`]audit_log["'`]\s*\)\s*\.\s*(delete|update|upsert)\s*\(/i,
  /\bdelete\s+from\s+(public\.)?"?audit_log\b/i,
  /\bupdate\s+(public\.)?"?audit_log"?\s+set\b/i,
  /\btruncate\s+(table\s+)?(public\.)?"?audit_log\b/i,
  /\balter\s+table\s+(public\.)?"?audit_log"?\s+(disable|enable)\s+trigger\b/i,
  /\bdrop\s+trigger\b[^;]*\baudit_log_guard/i,
  /\bfunction\s+(public\.)?(audit_log_guard|_audit_is_test_row|audit_test_cleanup)\s*\(/i,
  /pms\.audit_delete/,
  /\baudit_test_cleanup\b/,
];

const เจอ = [];
for (const f of ไฟล์ที่gitเก็บ(["apps", "packages", "scripts", "tests", "supabase"], { ext: /\.(ts|tsx|mjs|js|cjs|sql)$/ })) {
  const ทาง = f.replaceAll("\\", "/");
  if (อนุญาต.has(ทาง)) continue;
  const ข้อความ = readFileSync(f, "utf8");
  // ข้อทดสอบระดับฐาน: ทั้งไฟล์อยู่ในทรานแซกชันที่ย้อนกลับเสมอ (db-rule-tests) — ไม่มีอะไรถูกลบจริง
  if (/^supabase\/tests\/[^/]+\.sql$/.test(ทาง)) {
    const โค้ด = ข้อความ.replace(/--.*$/gm, "").trim();
    if (/^begin\s*;/i.test(โค้ด) && /\brollback\s*;\s*$/i.test(โค้ด)) continue;
  }
  // ใบปรับฐานเก่า (ก่อน 0241) = ประวัติที่ลงฐานจริงแล้ว แก้ย้อนหลังไม่ได้ · ใบใหม่หลัง 0241 ตรวจทุกใบ
  const ใบ = /^supabase\/migrations\/(\d{4})_/.exec(ทาง);
  if (ใบ && Number(ใบ[1]) < 241) continue;
  let ในคำอธิบาย = false;
  ข้อความ.split(/\r?\n/).forEach((บรรทัด, i) => {
    let ตัด = บรรทัด;
    if (ในคำอธิบาย) { const จบ = ตัด.indexOf("*/"); if (จบ < 0) return; ตัด = ตัด.slice(จบ + 2); ในคำอธิบาย = false; }
    ตัด = ตัด.replace(/\/\*.*?\*\//g, "");
    const เริ่ม = ตัด.indexOf("/*"); if (เริ่ม >= 0) { ตัด = ตัด.slice(0, เริ่ม); ในคำอธิบาย = true; }
    ตัด = ตัด.replace(/(^|[^:"'`])\/\/.*$/, "$1");
    if (ทาง.endsWith(".sql")) ตัด = ตัด.replace(/--.*$/, "");
    if (แบบ.some(re => re.test(ตัด))) เจอ.push(`${ทาง}:${i + 1}\n      ${บรรทัด.trim().slice(0, 120)}`);
  });
}
if (เจอ.length) {
  console.error(`✗ check-audit-delete-paths: มีทางลบ/แก้บันทึกการใช้งานนอก 2 ทางที่บอสอนุญาต ${เจอ.length} จุด`);
  console.error("  (ลบอัตโนมัติเกิน 2 ปี · สคริปต์ล้างข้อมูลทดสอบ ZZT/live-* — บอสสั่ง 26 ต.ค. 69 · ใบ 0241)");
  for (const x of เจอ) console.error(`  ${x}`);
  process.exit(1);
}
console.log(`✓ check-audit-delete-paths: ทางลบบันทึกการใช้งานมีแค่ 2 ทาง (ไฟล์ที่อนุญาต ${อนุญาต.size} ไฟล์)`);
