// ── ตัวตรวจ: ไฟล์ที่รันกับฐานจริงได้ ต้องไม่ตั้ง/กระโดดตัวนับเลขเอกสาร (บอสสั่ง 19 ต.ค. 69) ──────────────────────
//
// ที่มา: ข้อทดสอบในเครื่องข้อหนึ่งสั่ง restore_sync_sequences ขณะข้ออื่นใส่เลขลำดับเอง 6 หลัก → ตัวนับเลขคำขอกระโดด
//   เลขคำขอ RQ-ปี-ลำดับ (5 หลัก) ถูกตัดแล้วชนกัน ส่งคำขอราคาไม่ได้ทั้งชุด — ถ้าเกิดบนฐานจริง = ดีลเลอร์ทั้งเครือขอราคาไม่ได้
//   หรือย้อนตัวนับ = เลขเอกสารซ้ำกับใบที่ออกให้ลูกค้าไปแล้ว
// ไฟล์ที่ตรวจ: ทุกไฟล์ใน tests/prod-live/ + สคริปต์ใน scripts/ ที่อ่านค่าเชื่อมต่อฐานจริง (.env.production.local · loadTarget · --prod)
// ตก เมื่อเจอ: setval(...) · restore_sync_sequences · เขียนตาราง quote_counters / entity_counters / dealer_proposal_counters
//   ยกเว้นบรรทัดในรายการข้างล่าง (พร้อมเหตุผล) เท่านั้น
//
// ใช้: node scripts/check-prod-counter-safety.mjs   (อยู่ใน pnpm checks)
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";

const ตัวนับ = "(quote_counters|entity_counters|dealer_proposal_counters)";
const กฎ = [
  [/\bsetval\s*\(/i, "ตั้งตัวนับลำดับ (setval)"],
  [/restore_sync_sequences/, "ตั้งตัวนับลำดับทั้งฐาน (restore_sync_sequences)"],
  [new RegExp(`from\\(\\s*["'\`]${ตัวนับ}["'\`]\\s*\\)\\s*\\.(upsert|update|insert|delete)`), "เขียนตารางตัวนับเลขเอกสาร"],
  [new RegExp(`clear\\(\\s*["'\`]${ตัวนับ}["'\`]`), "ล้างตารางตัวนับเลขเอกสาร"],
  [new RegExp(`\\b(update|delete\\s+from|insert\\s+into|truncate)\\s+(public\\.)?${ตัวนับ}\\b`, "i"), "เขียนตารางตัวนับเลขเอกสาร (SQL)"],
];
// [ไฟล์, บรรทัดที่ยอม, เหตุผล]
const ยกเว้น = [
  ["scripts/restore.mjs", /rpc\("restore_sync_sequences"\)/, "กู้ข้อมูลจากชุดสำรองแล้วต้องตั้งตัวนับให้ตรงกับข้อมูลที่กู้ (กันกับดักกู้แล้วบันทึกใหม่ไม่ได้ · 0131)"],
  ["tests/prod-live/cleanup.sql", /where dealer_code = 'ZZT'/, "ลบตัวนับของสาขาทดสอบชั่วคราว ZZT เท่านั้น"],
  ["scripts/go-live-reset.mjs", /clear\("(entity|quote)_counters"/, "ใช้ก่อนเปิดระบบครั้งเดียว · หยุดเองเมื่อมีคำขอราคาของดีลเลอร์จริง (ตัวกัน 19 ต.ค. 69)"],
];

const ไฟล์ = [];
const เดิน = d => { for (const n of readdirSync(d)) { const p = path.join(d, n); statSync(p).isDirectory() ? เดิน(p) : ไฟล์.push(p); } };
if (existsSync("tests/prod-live")) เดิน("tests/prod-live");
for (const n of readdirSync("scripts")) {
  const p = path.join("scripts", n);
  if (!statSync(p).isFile() || !/\.(mjs|js|ts|sql)$/.test(n) || n === "check-prod-counter-safety.mjs") continue;
  const t = readFileSync(p, "utf8");
  if (/\.env\.production\.local|loadTarget\(|--prod\b/.test(t)) ไฟล์.push(p);
}

const เจอ = [];
for (const f of ไฟล์) {
  const rel = f.split(path.sep).join("/");
  readFileSync(f, "utf8").split(/\r?\n/).forEach((บรรทัด, i) => {
    if (/^\s*(\/\/|--|\*)/.test(บรรทัด)) return;   // บรรทัดคำอธิบาย
    for (const [re, ชนิด] of กฎ) {
      if (!re.test(บรรทัด)) continue;
      if (ยกเว้น.some(([ff, ok]) => ff === rel && ok.test(บรรทัด))) continue;
      เจอ.push(`${rel}:${i + 1} · ${ชนิด}`);
    }
  });
}
console.log(`ไฟล์ที่รันกับฐานจริงได้ซึ่งตั้ง/กระโดดตัวนับเลขเอกสาร: ${เจอ.length} (ตรวจ ${ไฟล์.length} ไฟล์ · ยกเว้นมีเหตุผล ${ยกเว้น.length} จุด)`);
if (เจอ.length) {
  for (const x of เจอ) console.log(`  ✗ ${x}`);
  console.log("  → ห้ามตั้ง/ย้อน/กระโดดตัวนับบนฐานจริง · จำเป็นจริงต้องเพิ่มในรายการยกเว้นพร้อมเหตุผล และบอสอนุมัติ");
  process.exitCode = 1;
}
