// ── ตัวตรวจถาวร: ทุกตารางใน public ต้องเปิดกฎสิทธิ์รายแถว (row level security) — บอสสั่ง 9 พ.ย. 69 ─────────────────────
//
// ที่มา: ใบ 0280 รุ่นแรก (ec64977) สร้างตารางเครื่องหมายฐานทดสอบ public._pms_test_database ใน scripts/reset-test-db.mjs
//   โดยไม่เปิดกฎสิทธิ์รายแถว — ตารางใน public ที่ไม่เปิด = บัญชีผู้ใช้อ่าน/เขียนผ่าน REST ได้ถ้าเผลอให้สิทธิ์ตาราง
// กติกา (ตก = exit 1 · ไม่ต่อฐาน อ่านไฟล์อย่างเดียว):
//   ก. ใบปรับฐาน (supabase/migrations): ทุกตารางที่สร้างใน public (create table [if not exists] [public.]ชื่อ) ต้องมีคำสั่งเปิดกฎสิทธิ์รายแถว
//      ในใบเดียวกันหรือใบหลังจากนั้น — alter table [only] [public.]ชื่อ enable row level security
//      หรือรายชื่อตารางใน foreach … array[...] ของบล็อกที่สั่ง enable row level security (แบบใบ 0002)
//      ตารางที่ถูก drop table ทีหลัง = ไม่นับ · ตารางชั่วคราว (create temp table) = ไม่นับ
//   ข. สคริปต์/ข้อมูลตั้งต้นที่สร้างตารางใน public เอง (scripts/** · tests/fixtures/**) ต้องเปิดในไฟล์เดียวกัน
// คู่กับข้อทดสอบที่ฐานจริงตอนรอบตรวจ: supabase/tests/no_temp_password_gate.sql (ทุกตารางใน public ต้องเปิดกฎสิทธิ์รายแถว)
// PMS_RLS_ROOT = โฟลเดอร์จำลอง (ข้อทดสอบ tests/tools/public-rls.test.mjs)
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";

const ราก = process.env.PMS_RLS_ROOT ? path.resolve(process.env.PMS_RLS_ROOT) : process.cwd();
const ชื่อตาราง = String.raw`(?:public\.)?"?([A-Za-z_][\w฀-๿]*)"?`;
const สร้าง = new RegExp(String.raw`create\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?` + ชื่อตาราง, "gi");
const ชั่วคราว = /create\s+(?:global\s+|local\s+)?temp(?:orary)?\s+table/i;
const เปิด = new RegExp(String.raw`alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?` + ชื่อตาราง + String.raw`\s+enable\s+row\s+level\s+security`, "gi");
const ลบ = new RegExp(String.raw`drop\s+table\s+(?:if\s+exists\s+)?` + ชื่อตาราง, "gi");
const ไม่ใช่public = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?!public\.)"?[A-Za-z_]\w*"?\./i;

/** ตัดหมายเหตุ SQL (-- …) ออก ไม่ให้ชื่อในหมายเหตุนับเป็นคำสั่ง */
const ตัดหมายเหตุ = (s) => s.replace(/--[^\n]*/g, "");
/** ตารางที่สร้างใน public ของข้อความหนึ่งก้อน (ไม่นับตารางชั่วคราว/สคีมาอื่น) */
function ตารางที่สร้าง(s) {
  const ผล = [];
  for (const m of s.matchAll(สร้าง)) {
    const ก่อน = s.slice(Math.max(0, m.index - 40), m.index + m[0].length);
    if (ชั่วคราว.test(ก่อน.slice(-m[0].length - 25))) continue;
    if (ไม่ใช่public.test(s.slice(m.index, m.index + m[0].length + 2))) continue;
    ผล.push(m[1].toLowerCase());
  }
  return ผล;
}
/** ตารางที่เปิดกฎสิทธิ์รายแถว: คำสั่งตรง + รายชื่อใน foreach … array[...] ของบล็อกที่มี enable row level security */
function ตารางที่เปิด(s) {
  const ผล = new Set([...s.matchAll(เปิด)].map(m => m[1].toLowerCase()));
  for (const บล็อก of s.split(/\bdo\s+\$\$/i).slice(1)) {
    const ก้อน = บล็อก.split(/\$\$\s*;/)[0];
    if (!/enable\s+row\s+level\s+security/i.test(ก้อน)) continue;
    for (const a of ก้อน.matchAll(/array\s*\[([^\]]*)\]/gi)) for (const n of a[1].matchAll(/'([^']+)'/g)) ผล.add(n[1].toLowerCase());
  }
  return ผล;
}

function เดิน(d, ext, ออก = []) {
  if (!existsSync(d)) return ออก;
  for (const n of readdirSync(d)) {
    const p = path.join(d, n);
    if (statSync(p).isDirectory()) { if (n !== "node_modules" && !n.startsWith(".")) เดิน(p, ext, ออก); }
    else if (ext.test(n)) ออก.push(p);
  }
  return ออก;
}
const สัมพัทธ์ = p => path.relative(ราก, p).split(path.sep).join("/");
const ผิด = [];

// ก. ใบปรับฐาน — ไล่ตามลำดับเลขใบ
const ใบ = เดิน(path.join(ราก, "supabase/migrations"), /^\d{4}_.*\.sql$/).sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
const ค้าง = new Map();   // ตาราง → ใบที่สร้าง (ยังไม่เห็นคำสั่งเปิด)
for (const f of ใบ) {
  const s = ตัดหมายเหตุ(readFileSync(f, "utf8"));
  for (const t of ตารางที่สร้าง(s)) if (!ค้าง.has(t)) ค้าง.set(t, สัมพัทธ์(f));
  for (const t of ตารางที่เปิด(s)) ค้าง.delete(t);
  for (const m of s.matchAll(ลบ)) ค้าง.delete(m[1].toLowerCase());
}
for (const [t, f] of ค้าง) ผิด.push(`${f}: สร้างตาราง public.${t} แต่ไม่มีใบไหนเปิดกฎสิทธิ์รายแถว (alter table public.${t} enable row level security)`);

// ข. สคริปต์/ข้อมูลตั้งต้นที่สร้างตารางเอง — ต้องเปิดในไฟล์เดียวกัน
for (const f of [...เดิน(path.join(ราก, "scripts"), /\.(mjs|js|cjs|sql)$/), ...เดิน(path.join(ราก, "tests/fixtures"), /\.sql$/)]) {
  if (/^check-/.test(path.basename(f))) continue;   // ตัวตรวจอื่นมีแบบข้อความ "create table …" ไว้จับ ไม่ได้สร้างตารางจริง
  const s = readFileSync(f, "utf8");
  const สร้างแล้ว = ตารางที่สร้าง(s);
  if (!สร้างแล้ว.length) continue;
  const เปิดแล้ว = ตารางที่เปิด(s);
  for (const t of new Set(สร้างแล้ว)) if (!เปิดแล้ว.has(t)) ผิด.push(`${สัมพัทธ์(f)}: สร้างตาราง public.${t} แต่ไม่เปิดกฎสิทธิ์รายแถวในไฟล์เดียวกัน`);
}

if (ผิด.length) {
  console.error(`❌ check-public-rls: ตารางใน public ที่ไม่เปิดกฎสิทธิ์รายแถว ${ผิด.length} จุด`);
  for (const x of ผิด) console.error(`  ✗ ${x}`);
  process.exit(1);
}
console.log(`✓ check-public-rls: ทุกตารางใน public ที่ใบปรับฐาน/สคริปต์สร้าง เปิดกฎสิทธิ์รายแถวครบ (ตรวจ ${ใบ.length} ใบ)`);
