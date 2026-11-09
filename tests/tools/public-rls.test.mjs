// ── ข้อทดสอบ: ตัวตรวจถาวร "ทุกตารางใน public ต้องเปิดกฎสิทธิ์รายแถว" (scripts/check-public-rls.mjs · บอสสั่ง 9 พ.ย. 69) ─────────
//   ก. ใบสร้างตารางแล้วไม่เปิด = ตก · เปิดในใบเดียวกัน / ใบหลัง / foreach array แบบใบ 0002 = ผ่าน · drop ทีหลัง = ผ่าน
//      ตารางชั่วคราว / สคีมาอื่น / ชื่อในหมายเหตุ = ไม่นับ
//   ข. สคริปต์สร้างตารางใน public แล้วไม่เปิดในไฟล์เดียวกัน = ตก
//   ค. ตกบนโค้ดเดิม: scripts/reset-test-db.mjs ของใบ 0280 รุ่นก่อนแก้ (commit ec64977 · ตารางเครื่องหมายไม่เปิดกฎสิทธิ์รายแถว)
//   ง. ของจริงในโฟลเดอร์นี้ผ่าน · อ่านไฟล์อย่างเดียว ไม่แตะฐาน · รัน: node tests/tools/public-rls.test.mjs
import { spawnSync, execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const ที่ = path.join("test-results", `public-rls-${process.pid}`);
let ตก = 0, n = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n   ${String(เพิ่ม).slice(-600)}`}`); };
const ตรวจ = (root) => { const r = spawnSync(process.execPath, ["scripts/check-public-rls.mjs"], { encoding: "utf8", env: { ...process.env, PMS_RLS_ROOT: root } }); return { ...r, ออก: (r.stdout ?? "") + (r.stderr ?? "") }; };
function จำลอง(ไฟล์) {
  const r = path.join(ที่, String(n++));
  for (const [f, เนื้อ] of Object.entries(ไฟล์)) { const p = path.join(r, f); mkdirSync(path.dirname(p), { recursive: true }); writeFileSync(p, เนื้อ); }
  return r;
}
const ใบ = (เลข, sql) => ({ [`supabase/migrations/${เลข}_x.sql`]: sql });
const ผ่าน = {
  "เปิดในใบเดียวกัน": ใบ("0001", "create table public.a (id int);\nalter table public.a enable row level security;"),
  "เปิดในใบหลัง": { ...ใบ("0001", "create table if not exists b (id int);"), ...ใบ("0002", "alter table only public.b enable row level security;") },
  "foreach array แบบใบ 0002": { ...ใบ("0001", "create table c (id int); create table d (id int);"),
    ...ใบ("0002", "do $$ declare t text; begin foreach t in array array['c','d'] loop execute format('alter table %I enable row level security', t); end loop; end $$;") },
  "drop ทีหลัง": { ...ใบ("0001", "create table e (id int);"), ...ใบ("0002", "drop table if exists public.e;") },
  "ตารางชั่วคราว/สคีมาอื่น/หมายเหตุ": ใบ("0001", "create temp table t1 (id int);\ncreate table supabase_migrations.x (id int);\n-- create table public.ในหมายเหตุ (id int);"),
  "สคริปต์เปิดในไฟล์เดียวกัน": { "scripts/x.mjs": `const q = "create table if not exists public.m (a int);\\nalter table public.m enable row level security;";` },
};
for (const [ชื่อ, ไฟล์] of Object.entries(ผ่าน)) { const r = ตรวจ(จำลอง(ไฟล์)); ผล(r.status === 0, `ก. ${ชื่อ} = ผ่าน`, r.ออก); }
const ตกได้ = {
  "ใบสร้างแล้วไม่เปิด": ใบ("0001", "create table public.f (id int);"),
  "เปิดตารางอื่น ไม่ใช่ตารางที่สร้าง": ใบ("0001", "create table g (id int);\nalter table h enable row level security;"),
  "สคริปต์สร้างแล้วไม่เปิด": { "scripts/y.mjs": `const q = "create table if not exists public._marker (a int);";` },
  "ข้อมูลตั้งต้นสร้างแล้วไม่เปิด": { "tests/fixtures/z.sql": "create table public.zz (a int);" },
};
for (const [ชื่อ, ไฟล์] of Object.entries(ตกได้)) { const r = ตรวจ(จำลอง(ไฟล์)); ผล(r.status === 1, `ก/ข. ${ชื่อ} = ตก`, r.ออก); }
// ค. โค้ดเดิม: ใบ 0280 รุ่นก่อนแก้ (ec64977) — ตารางเครื่องหมายฐานทดสอบไม่เปิดกฎสิทธิ์รายแถว
{
  let เดิม = "";
  try { เดิม = execFileSync("git", ["show", "ec64977:scripts/reset-test-db.mjs"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); } catch { /* ไม่มีประวัติ git */ }
  if (!เดิม) ผล(false, "ค. อ่าน scripts/reset-test-db.mjs ของ commit ec64977 ได้ (ต้องมีประวัติ git)");
  else { const r = ตรวจ(จำลอง({ "scripts/reset-test-db.mjs": เดิม })); ผล(r.status === 1 && /_pms_test_database/.test(r.ออก), "ค. ใบ 0280 รุ่นก่อนแก้ (ec64977) = ตก", r.ออก); }
}
{ const r = spawnSync(process.execPath, ["scripts/check-public-rls.mjs"], { encoding: "utf8" }); ผล(r.status === 0, "ง. ของจริงในโฟลเดอร์นี้ผ่าน", (r.stdout ?? "") + (r.stderr ?? "")); }
rmSync(ที่, { recursive: true, force: true });
console.log(ตก ? `FAIL ${ตก}` : "ALL PASS");
process.exit(ตก ? 1 : 0);
