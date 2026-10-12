// ── สำรองข้อมูลทั้งฐานข้อมูลลงไฟล์ ────────────────────────────────────────────────
//
// ทำไมต้องมี (ตรวจพบ 7 ส.ค. 69 ระหว่างทำ Part 2):
//   ถามระบบสำรองข้อมูลของผู้ให้บริการตรง ๆ แล้วได้คำตอบว่า
//     {"pitr_enabled": false, "backups": []}
//   แปลว่า **ไม่มีข้อมูลสำรองอยู่เลยแม้แต่ชุดเดียว** ถ้าฐานข้อมูลเสียหรือมีคนลบผิด
//   ข้อมูลจะหายถาวร กู้ไม่ได้ — และวันเดียวกันนั้นก็เพิ่งมีการลบดีลเลอร์ 4 สาขาจริง
//   ซึ่งกู้กลับไม่ได้เลย เป็นตัวอย่างที่เกิดขึ้นแล้วจริง ๆ ว่าความเสี่ยงนี้ไม่ใช่เรื่องสมมติ
//
//   เอกสารนำขึ้นระบบเดิมเขียนว่า "ผู้ให้บริการสำรองให้อัตโนมัติ" — ข้อความนั้นไม่จริง
//   (แผนใช้งานปัจจุบันไม่มีการสำรองอัตโนมัติ) จึงต้องมีของเราเองที่ควบคุมได้และทดลองกู้ได้จริง
//
// ⚠️ ขอบเขตที่ทำได้จริง — ต้องรู้ก่อนใช้ ไม่ใช่คิดว่าครอบคลุมทุกอย่าง:
//   ✅ ข้อมูลธุรกิจทั้งหมด 23 ตาราง (ดีลเลอร์ ลูกค้า ลีด ใบเสนอราคา การตั้งค่า บันทึกการใช้งาน)
//   ⚠️ รายชื่อบัญชีผู้ใช้ — เก็บได้แค่ "ใครมีบัญชีบ้าง" (อีเมล/บทบาท/สาขา)
//      **รหัสผ่านสำรองไม่ได้** เพราะระบบยืนยันตัวตนไม่เปิดให้อ่านออกมา
//      → ถ้าต้องกู้จริง ผู้ใช้ทุกคนต้องตั้งรหัสผ่านใหม่ ระบบจะไม่กลับมาเองทั้งหมด
//   ❌ ไฟล์แนบที่อัปโหลด (รูป/เอกสาร) — อยู่คนละที่กับฐานข้อมูล ตัวนี้ไม่ได้สำรองให้
//
// 🔒 ไฟล์ที่ได้มีข้อมูลลูกค้าจริงและรหัสลับของดีลเลอร์ — ห้ามส่งต่อ ห้าม commit ขึ้น git
//    (โฟลเดอร์ backups/ ถูกกันไว้ใน .gitignore แล้ว)
//
// รัน: node scripts/backup.mjs [ชื่อโฟลเดอร์ปลายทาง]
import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync } from "node:fs";
import { loadTarget } from "./lib/targetEnv.mjs";
import path from "node:path";

const PAGE = 1000;   // ฐานข้อมูลคืนสูงสุด 1,000 แถวต่อคำขอ ขอมากกว่านี้ก็ได้เท่านี้ — ต้องไล่ทีละหน้า

// ⚠️ ตั้งแต่แยกฐานข้อมูล (11 ส.ค. 69) ห้ามอ่าน apps/hq/.env.local ตรง ๆ อีก — ไฟล์นั้นชี้ฐานทดสอบ
//    ถ้าอ่านผิดที่ จะได้ไฟล์สำรองของฐานทดสอบทั้งกองโดยไม่มีสัญญาณอะไรบอกเลย
//    (สำรองฐานทดสอบด้วยก็ได้ ถ้าตั้งใจ — ใส่ --test)
const target = loadTarget({ allowTest: true });
const URL_ = target.url, KEY = target.serviceKey;
const svc = createClient(URL_, KEY, { auth: { persistSession: false } });

/**
 * อ่านรายชื่อตาราง + คีย์หลัก จากสคีมาจริงของฐานข้อมูล
 * ⚠️ ห้าม hardcode รายชื่อตาราง — เพิ่มตารางใหม่แล้วลืมมาแก้ที่นี่ = ตารางนั้นไม่ถูกสำรอง
 *    และจะไม่มีใครรู้จนกว่าจะถึงวันที่ต้องกู้จริง ซึ่งสายไปแล้ว
 */
async function readSchema() {
  const res = await fetch(`${URL_}/rest/v1/`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
  const defs = (await res.json()).definitions ?? {};
  return Object.entries(defs).map(([table, d]) => ({
    table,
    pk: Object.entries(d.properties ?? {})
      .filter(([, p]) => /<pk\/>/.test(p.description ?? ""))
      .map(([c]) => c),
  }));
}

/** ดึงทั้งตารางแบบไล่ทีละหน้า — เรียงตามคีย์หลักเพื่อให้ลำดับคงที่ทุกครั้งที่สำรอง */
async function dumpTable(table, pk) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    let q = svc.from(table).select("*").range(from, from + PAGE - 1);
    for (const c of pk) q = q.order(c, { ascending: true });
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE) break;
  }
  return rows;
}

// ชื่อโฟลเดอร์จากอาร์กิวเมนต์แรกที่ไม่ใช่ตัวเลือก (กัน --test ถูกเอาไปใช้เป็นชื่อโฟลเดอร์)
const nameArg = process.argv.slice(2).find(a => !a.startsWith("--"));
const stamp = nameArg ?? new Date().toISOString().slice(0, 16).replace(/[:T]/g, "").replace(/(\d{8})(\d{4})/, "$1-$2");

// ── ที่เก็บไฟล์สำรอง — ตั้งออกนอกเครื่องได้ (เพิ่ม 14 ส.ค. 69) ────────────────────
// ความเสี่ยงที่ค้างอยู่: ไฟล์สำรองอยู่ในเครื่องเดียวกับที่ทำงาน — เครื่องพังคือเสียพร้อมกันทั้งคู่
// ไม่ต้องรอซื้อบริการอะไร แค่ชี้ไปโฟลเดอร์ที่ซิงก์ขึ้นคลาวด์อยู่แล้ว (OneDrive / Google Drive)
// หรือไดรฟ์สำรอง/ไดรฟ์เครือข่าย ก็ถือว่าอยู่นอกเครื่องแล้ว
//
//   ตั้งถาวร:   setx BACKUP_DIR "C:\Users\<ชื่อผู้ใช้>\OneDrive\benjamin-backups"
//   ครั้งเดียว: $env:BACKUP_DIR="D:\backups"; node scripts\backup.mjs
//
// ⚠️ ไฟล์สำรองมีข้อมูลลูกค้าจริงและรหัสลับดีลเลอร์ — ปลายทางต้องเป็นที่ที่คนนอกเข้าไม่ถึง
//    ห้ามชี้ไปโฟลเดอร์ที่แชร์ให้คนอื่น และห้ามชี้กลับเข้ามาในโปรเจกต์นี้ (จะหลุดขึ้น git)
const BASE = process.env.BACKUP_DIR?.trim() || "backups";
const dir = path.join(BASE, stamp);
mkdirSync(dir, { recursive: true });

console.log(`\n══ สำรองข้อมูล → ${dir} ══\n`);

const schema = await readSchema();
const manifest = { at: new Date().toISOString(), source: URL_, tables: {}, warnings: [] };
let total = 0, failed = 0;

for (const { table, pk } of schema) {
  try {
    const rows = await dumpTable(table, pk);
    writeFileSync(path.join(dir, `${table}.json`), JSON.stringify(rows, null, 1), "utf8");
    manifest.tables[table] = { rows: rows.length, pk };
    total += rows.length;
    console.log(`  ✅ ${table.padEnd(24)} ${String(rows.length).padStart(6)} แถว`);
  } catch (e) {
    failed++;
    manifest.tables[table] = { rows: -1, pk, error: String(e.message).slice(0, 120) };
    console.log(`  ❌ ${table.padEnd(24)} ${String(e.message).slice(0, 60)}`);
  }
}

// ── รายชื่อบัญชีผู้ใช้ (ไม่มีรหัสผ่าน — ระบบยืนยันตัวตนไม่เปิดให้อ่าน) ──
try {
  const { data, error } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(error.message);
  const users = (data?.users ?? []).map(u => ({
    id: u.id, email: u.email, created_at: u.created_at,
    last_sign_in_at: u.last_sign_in_at, user_metadata: u.user_metadata,
  }));
  writeFileSync(path.join(dir, "_auth_users.json"), JSON.stringify(users, null, 1), "utf8");
  manifest.tables._auth_users = { rows: users.length, pk: ["id"], note: "ไม่มีรหัสผ่าน — กู้แล้วต้องตั้งใหม่ทุกคน" };
  console.log(`  ✅ ${"_auth_users".padEnd(24)} ${String(users.length).padStart(6)} บัญชี  (ไม่มีรหัสผ่าน)`);
} catch (e) {
  failed++;
  console.log(`  ❌ _auth_users             ${String(e.message).slice(0, 60)}`);
}

manifest.warnings.push("ไม่ครอบคลุมรหัสผ่านผู้ใช้ — กู้แล้วทุกคนต้องตั้งรหัสผ่านใหม่");
manifest.warnings.push("ไม่ครอบคลุมไฟล์แนบที่อัปโหลด (เก็บคนละที่กับฐานข้อมูล)");
manifest.warnings.push("มีข้อมูลลูกค้าจริงและรหัสลับดีลเลอร์ — ห้ามส่งต่อ ห้าม commit");
writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

console.log(`\n  รวม ${total.toLocaleString()} แถว จาก ${schema.length} ตาราง`);
for (const w of manifest.warnings) console.log(`  ⚠️  ${w}`);
console.log(`\n${failed ? `❌ มี ${failed} รายการที่สำรองไม่สำเร็จ` : "✅ สำรองครบทุกตาราง"}\n`);
process.exit(failed ? 1 : 0);
