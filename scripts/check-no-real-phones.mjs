// ── ตัวตรวจ: ไฟล์ที่ git เก็บห้ามมีเบอร์โทรรูปแบบจริง และห้ามมีข้อความที่บอกว่าข้อมูลมาจากฐานจริง (บอสสั่งด่วน 16 พ.ย. 69 ข้อ 5) ──────────
// ที่มา: ข้อมูลผู้สนใจตั้งต้นของเว็บ demo (hqProspectsSeed.ts) ดึงมาจากฐานจริง 169 ราย มีชื่อ/เบอร์คนจริง อยู่ใน repo ที่เคย public
//   และเว็บ demo สาธารณะส่งไฟล์นี้ให้เบราว์เซอร์ — คนรวมงานแทนเป็นข้อมูลปลอมแล้ว (49cf902c) · ตัวตรวจนี้กันไม่ให้กลับมาอีก
// กติกา: เบอร์ในไฟล์ที่ git เก็บใช้ได้เฉพาะ 000-000-NNNN (กติกาข้อมูลทดสอบ · memory test-baseline-fixture)
//   เบอร์รูปแบบจริง = มือถือ 06/08/09 + 8 หลัก · บ้าน 02–07 + 7 หลัก · +66 · คั่นด้วย - เว้นวรรค จุด หรือไม่คั่น
//   ข้อความที่บอกว่าข้อมูลสร้างจากฐาน·จริง = ตก (ป้ายบอกว่าไฟล์นั้นอาจมีข้อมูลคนจริง)
// ข้อยกเว้น: เจาะจงไฟล์ + บรรทัด + เหตุผล เท่านั้น · บรรทัดที่ยกเว้นไว้แต่ไม่มีอะไรให้ยกเว้นแล้ว = ตก (กันรายการค้าง/บรรทัดเลื่อน)
// รัน: อยู่ใน npm run checks + git pre-commit (scripts/git-hooks/pre-commit.mjs) · ไม่พิมพ์เบอร์เต็ม (ปิด 4 หลักท้าย)
// PMS_PHONE_ROOT = โฟลเดอร์จำลอง (ข้อทดสอบ tests/tools/no-real-phones.test.mjs) — เดินไฟล์ทั้งโฟลเดอร์แทน git
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ราก = process.env.PMS_PHONE_ROOT ? path.resolve(process.env.PMS_PHONE_ROOT) : process.cwd();

export const เบอร์รูปแบบจริง = /(?<![\d\w-])(?:\+66[-\s]?|0)(?:[689]\d[-\s.]?\d{3}[-\s.]?\d{4}|[2-7][-\s.]?\d{3}[-\s.]?\d{4})(?![\d\w])/g;
const ป้ายฐานจริง = "สร้างจาก" + "ฐานจริง";   // ต่อเป็นชิ้น — ไฟล์นี้เองจะได้ไม่ตก

/** ข้อยกเว้น (ไฟล์ · บรรทัด · เหตุผล) — เพิ่มได้เมื่อจำเป็นจริงเท่านั้น */
export const ยกเว้น = [
  ...[7, 16, 21, 22, 25, 28].map(บรรทัด => ({ ไฟล์: "tests/unit/formatPhone.test.ts", บรรทัด, เหตุผล: "ข้อทดสอบตัวจัดรูปแบบเบอร์ ต้องป้อนเลขรูปแบบจริง (มือถือ 10 หลัก/บ้าน 9 หลัก) จึงทดสอบการใส่ขีดได้" })),
  { ไฟล์: "docs/ข้อมูลที่ต้องกรอกก่อนเปิดใช้จริง.md", บรรทัด: 23, เหตุผล: "เบอร์บริษัท Benjamin (ข้อมูลบริษัทที่เปิดเผย ไม่ใช่บุคคล) — บอสยกเว้น 16 พ.ย. 69" },
  { ไฟล์: "scripts/seed-hq-settings.mjs", บรรทัด: 19, เหตุผล: "เบอร์บริษัท Benjamin เดียวกับเอกสารข้อมูลก่อนเปิดใช้ (ค่าตั้งต้นของข้อมูลบริษัท)" },
  { ไฟล์: "supabase/migrations/0190_explicit_function_grants.sql", บรรทัด: 16, เหตุผล: "คอมเมนต์ว่ารายชื่อฟังก์ชันอ่านจากฐานจริง (ชื่อฟังก์ชัน ไม่ใช่ข้อมูลคน · ใบปรับฐานที่ลงแล้วแก้ไม่ได้)" },
  { ไฟล์: "tests/unit/demoProspectsSeed.test.ts", บรรทัด: 1, เหตุผล: "ข้อทดสอบที่ตรวจว่าข้อมูล demo ไม่อ้างว่ามาจากฐานจริง (ข้อความในคอมเมนต์หัวไฟล์)" },
  { ไฟล์: "tests/unit/demoProspectsSeed.test.ts", บรรทัด: 24, เหตุผล: "ข้อทดสอบที่ตรวจว่าข้อมูล demo ไม่อ้างว่ามาจากฐานจริง (ชื่อข้อ)" },
];

const ไม่ตรวจ = /\.(png|jpe?g|gif|webp|ico|pdf|xlsx|docx|pptx|zip|woff2?|ttf|lock)$/i;
function รายชื่อไฟล์() {
  if (process.env.PMS_PHONE_ROOT) {
    const ผล = [];
    const เดิน = d => { for (const n of readdirSync(d)) { const p = path.join(d, n); if (statSync(p).isDirectory()) เดิน(p); else ผล.push(path.relative(ราก, p).split(path.sep).join("/")); } };
    เดิน(ราก);
    return ผล;
  }
  return execFileSync("git", ["ls-files", "-z"], { cwd: ราก, encoding: "utf8", maxBuffer: 256 << 20 }).split("\0").filter(Boolean);
}
const ปิดท้าย = s => s.replace(/\d{4}$/, "xxxx");

// รันเมื่อเรียกตรง (node scripts/check-no-real-phones.mjs) — import จากที่อื่น (ข้อทดสอบ/เครื่องมือ) ได้แค่รายการ/รูปแบบ
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) รัน();

function รัน() {
const เจอ = [];
const ใช้ยกเว้น = new Set();
let ตรวจ = 0;
for (const f of รายชื่อไฟล์()) {
  if (ไม่ตรวจ.test(f)) continue;
  let b; try { b = readFileSync(path.join(ราก, f)); } catch { continue; }
  if (b.includes(0) || b.length > 8_000_000) continue;
  ตรวจ++;
  b.toString("utf8").split(/\r?\n/).forEach((l, i) => {
    const เบอร์ = [...l.matchAll(เบอร์รูปแบบจริง)].map(m => m[0]);
    const ป้าย = l.includes(ป้ายฐานจริง);
    if (!เบอร์.length && !ป้าย) return;
    const y = ยกเว้น.findIndex(x => x.ไฟล์ === f && x.บรรทัด === i + 1);
    if (y >= 0) { ใช้ยกเว้น.add(y); return; }
    for (const x of เบอร์) เจอ.push(`${f}:${i + 1} · เบอร์รูปแบบจริง ${ปิดท้าย(x)}`);
    if (ป้าย) เจอ.push(`${f}:${i + 1} · ข้อความบอกว่าข้อมูลมาจากฐานจริง (ป้ายต้องห้าม)`);
  });
}
// ค้าง = ไฟล์ยังอยู่แต่บรรทัดนั้นไม่มีอะไรให้ยกเว้นแล้ว (บรรทัดเลื่อน/แก้แล้ว) · ไฟล์ที่ไม่มีแล้วไม่นับ (repo จำลองของข้อทดสอบอื่นไม่มีไฟล์เหล่านี้)
const ค้าง = ยกเว้น.filter((x, i) => !ใช้ยกเว้น.has(i) && existsSync(path.join(ราก, x.ไฟล์)))
  .map(x => `${x.ไฟล์}:${x.บรรทัด}`);

if (เจอ.length || ค้าง.length) {
  if (เจอ.length) {
    console.error(`✗ check-no-real-phones: เจอ ${เจอ.length} จุด (ตรวจ ${ตรวจ} ไฟล์)`);
    for (const x of เจอ.slice(0, 60)) console.error(`   ${x}`);
    if (เจอ.length > 60) console.error(`   …อีก ${เจอ.length - 60} จุด`);
    console.error("   แก้: ข้อมูลทดสอบ/ตัวอย่างใช้ 000-000-NNNN · ห้ามเก็บไฟล์ที่มีชื่อ/เบอร์คนจริง · ตัวอย่างรูปแบบที่จำเป็นจริง = เพิ่มข้อยกเว้นไฟล์+บรรทัด+เหตุผล");
  }
  if (ค้าง.length) {
    console.error(`✗ check-no-real-phones: ข้อยกเว้นที่ไม่มีอะไรให้ยกเว้นแล้ว (บรรทัดเลื่อน/แก้แล้ว) ${ค้าง.length} รายการ — แก้เลขบรรทัดหรือเอาออก:`);
    for (const x of ค้าง) console.error(`   ${x}`);
  }
  process.exit(1);
}
console.log(`✓ check-no-real-phones: ไฟล์ที่ git เก็บ ${ตรวจ} ไฟล์ ไม่มีเบอร์รูปแบบจริง/ป้ายข้อมูลจากฐานจริง · ข้อยกเว้น ${ยกเว้น.length} บรรทัด`);
}
