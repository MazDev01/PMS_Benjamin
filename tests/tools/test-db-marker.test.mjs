// ── ข้อทดสอบ: ตัวตรวจเครื่องหมายฐานทดสอบ (scripts/check-test-db-marker.mjs · ใบ 0280 · คนรวมงานสั่ง 9 พ.ย. 69) ─────────────────
//   ก. สร้างนอก reset-test-db = ตก · reset-test-db ไม่สร้าง = ตก
//   ข. ใบปรับฐานอ้างนอก to_regclass = ตก · ใบ 0280 ไม่เช็กเครื่องหมาย = ตก · หมายเหตุ (--) = ผ่าน
//   ค. ชุดล้างเว็บจริง / สคริปต์ฐานจริงอ้างชื่อ = ตก · ง. ข้อทดสอบ SQL drop/create = ตก (rename ผ่าน)
//   จ. ของจริงในโฟลเดอร์นี้ผ่าน · อ่านไฟล์อย่างเดียว ไม่แตะฐาน · รัน: node tests/tools/test-db-marker.test.mjs
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const ที่ = path.join("test-results", `test-db-marker-${process.pid}`);
let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n   ${String(เพิ่ม).slice(-600)}`}`); };
const ตรวจ = (root) => { const r = spawnSync(process.execPath, ["scripts/check-test-db-marker.mjs"], { encoding: "utf8", env: { ...process.env, PMS_TDM_ROOT: root } }); return { ...r, ออก: (r.stdout ?? "") + (r.stderr ?? "") }; };
const ดี = {
  "scripts/reset-test-db.mjs": `const x = "create table if not exists public._pms_test_database (a int);";`,
  "supabase/migrations/0280_x.sql": `-- เครื่องหมาย public._pms_test_database\n  and to_regclass('public._pms_test_database') is not null then return old; end if;`,
  "supabase/tests/a.sql": `alter table public._pms_test_database rename to _pms_test_database_ปิดชั่วคราว;`,
};
let n = 0;
function จำลอง(แก้) {
  const r = path.join(ที่, String(n++));
  for (const [f, เนื้อ] of Object.entries({ ...ดี, ...แก้ })) {
    if (เนื้อ == null) continue;
    const p = path.join(r, f); mkdirSync(path.dirname(p), { recursive: true }); writeFileSync(p, เนื้อ);
  }
  return r;
}
ผล(ตรวจ(จำลอง({})).status === 0, "ชุดที่ถูกต้อง = ผ่าน", ตรวจ(จำลอง({})).ออก);
const ผิด = {
  "ก. สร้างในใบปรับฐาน": { "supabase/migrations/0290_y.sql": "create table public._pms_test_database (a int);" },
  "ก. สร้างในข้อมูลตั้งต้น": { "tests/fixtures/x.sql": "create table if not exists _pms_test_database ();" },
  "ก. reset-test-db ไม่สร้าง": { "scripts/reset-test-db.mjs": "// _pms_test_database ไม่ได้สร้าง" },
  "ข. ใบปรับฐานอ้างนอก to_regclass": { "supabase/migrations/0291_z.sql": "insert into public._pms_test_database default values;" },
  "ข. ใบ 0280 ไม่เช็กเครื่องหมาย": { "supabase/migrations/0280_x.sql": "-- ไม่มีการเช็ก _pms_test_database" },
  "ค. ชุดล้างเว็บจริงอ้างชื่อ": { "tests/prod-live/cleanup.sql": "select to_regclass('public._pms_test_database');" },
  "ค. สคริปต์ลงฐานจริงอ้างชื่อ": { "scripts/db-push-prod.mjs": "const t = '_pms_test_database';" },
  "ค. สคริปต์อ่านฐานจริงอ้างชื่อ": { "scripts/prod-query.mjs": "// _pms_test_database" },
  "ง. ข้อทดสอบ SQL drop": { "supabase/tests/b.sql": "drop table if exists public._pms_test_database;" },
};
for (const [ชื่อ, แก้] of Object.entries(ผิด)) { const r = ตรวจ(จำลอง(แก้)); ผล(r.status === 1, `${ชื่อ} = ตก`, r.ออก); }
{ const r = spawnSync(process.execPath, ["scripts/check-test-db-marker.mjs"], { encoding: "utf8" }); ผล(r.status === 0, "จ. ของจริงในโฟลเดอร์นี้ผ่าน", (r.stdout ?? "") + (r.stderr ?? "")); }
rmSync(ที่, { recursive: true, force: true });
console.log(ตก ? `FAIL ${ตก}` : "ALL PASS");
process.exit(ตก ? 1 : 0);
