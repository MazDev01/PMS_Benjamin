// ── กับดัก: เช็ค DATA_SOURCE === "supabase" เพื่อถามว่า "มี backend จริงไหม" ──────
//
// คำถามสองข้อนี้เคยเป็นข้อเดียวกันตอนมีแค่ 2 โหมด (local / supabase) แต่ตอนนี้แยกกันแล้ว:
//   • "ใช้อะแดปเตอร์ตัวไหน"  → DATA_SOURCE   (local | supabase | api)
//   • "มีบัญชี/สิทธิ์/ข้อมูลจริงไหม" → REAL_BACKEND  (supabase หรือ api)
//
// ทำไมต้องมีตัวตรวจ: พลาดเรื่องนี้แล้ว "ไม่มีอะไรฟ้อง" — หน้าจอไม่พัง ไม่มี error ในคอนโซล
// แค่ข้อมูลไม่ขึ้นเฉย ๆ เหมือนยังไม่มีข้อมูลจริง ๆ (กับดักเดียวกับ silent-failure ทั้งหลาย)
// เจอมาแล้ว 2 รอบตอนย้าย backend ระยะ 1:
//   รอบแรก  ล็อกอินไม่ได้ทั้งระบบ (ทุกด่านตกไปใช้ทางเดโม)
//   รอบสอง  หน้า HQ เจาะสาขาโชว์ลูกค้าเป้าหมาย 0 แถว ทั้งที่ในฐานมี 9 ราย
//           (hook ทั้ง 18 จุดใน useNetworkData.ts bail out เงียบ ๆ)
//
// ที่ยกเว้นได้มีแค่จุดที่ถามว่า "ใช้อะแดปเตอร์ตัวไหน" จริง ๆ เท่านั้น
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { ไฟล์ที่gitเก็บ } from "./lib/gitFiles.mjs";

const ROOT = process.cwd();
const SCAN = ["packages/shared", "apps/hq/app", "apps/dealer/app"];
/** ไฟล์ที่ถามว่า "ใช้อะแดปเตอร์ตัวไหน" จริง ๆ — อันเดียวที่เทียบกับ "supabase" ตรง ๆ ได้ */
const ALLOWED = new Set([
  "packages/shared/lib/data/config.ts",
  "packages/shared/lib/data/index.ts",
]);
const RE = /DATA_SOURCE\s*[!=]==\s*["']supabase["']/;

// อ่านเฉพาะไฟล์ที่ git เก็บ (scripts/lib/gitFiles.mjs) — ไม่อ่านผล build ทุกชื่อโฟลเดอร์ (.next-r4 ฯลฯ · 22 ต.ค. 69)

const hits = [];
for (const base of SCAN) {
  const dir = path.join(ROOT, base);
  try { statSync(dir); } catch { continue; }
  for (const file of ไฟล์ที่gitเก็บ([dir], { ext: /\.tsx?$/ })) {
    const rel = path.relative(ROOT, file).split(path.sep).join("/");
    if (ALLOWED.has(rel)) continue;
    const lines = readFileSync(file, "utf8").split(/\r?\n/);
    lines.forEach((line, i) => { if (RE.test(line)) hits.push(`${rel}:${i + 1}  ${line.trim()}`); });
  }
}

console.log(`\nจุดที่ถาม "มี backend จริงไหม" ผิดวิธี: ${hits.length}`);
if (hits.length) {
  for (const h of hits) console.log("  " + h);
  console.log('\nใช้ REAL_BACKEND จาก @pms/shared/lib/data/config แทน — โหมด api ก็เป็นของจริงเหมือนกัน');
  process.exit(1);
}
