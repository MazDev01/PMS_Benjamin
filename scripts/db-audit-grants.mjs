// ── ตรวจฐานข้อมูล: สิทธิ์เรียกคำสั่ง (execute) ต้องตรงกับที่ใบแก้ฐานข้อมูลกำหนด ────────────────────
//
// ทำไมต้องมี (พบ 13 ต.ค. 69): ฐานทดสอบในเครื่องมีคำสั่ง 19 ตัวที่ใบแก้ฐานข้อมูลสั่งถอนสิทธิ์จากคนนอกไว้
//   แต่ในเครื่องกลับเรียกได้ทั้งคนนอกและผู้ใช้ (รวมตัวออกใบผ่าน และตัวนับจำนวนคำขอ)
//   เทียบกับฐานเปล่าที่สร้างจากใบล้วน ๆ แล้วฐานเปล่าถูกต้องทุกตัว — ฐานในเครื่องถูกให้สิทธิ์คืนแบบเหมาครั้งหนึ่ง
//   นอกใบแก้ฐานข้อมูล (ไม่มีไฟล์ไหนใน repo ทำ) ผลคือชุดทดสอบเรื่องสิทธิ์รันกับสิทธิ์ที่หลวมกว่าระบบจริงมาตลอด
//
// วิธีตรวจ: เทียบสิทธิ์ของทุกฟังก์ชันใน public กับ "ค่าที่ควรเป็น" ซึ่งถ่ายมาจากฐานเปล่าที่สร้างจากใบแก้ฐานข้อมูลล้วน ๆ
//   (supabase/tests/expected-function-grants.json) — ไม่ได้เขียนรายการด้วยมือ
//
// ใช้:
//   node scripts/db-audit-grants.mjs                       ตรวจฐานทดสอบในเครื่อง (ผ่าน Docker)
//   node scripts/db-audit-grants.mjs --print-sql           พิมพ์คำสั่ง SELECT (อ่านอย่างเดียว) ไว้รันในหน้า SQL ของระบบจริง
//   node scripts/db-audit-grants.mjs --actual ผล.json      ตรวจจากผลที่คัดลอกมาจากคำสั่งข้างบน (ไม่ต้องมีรหัสฐานจริงในเครื่อง)
//   node scripts/db-audit-grants.mjs --snapshot <คอนเทนเนอร์ฐานเปล่า>   ถ่ายค่าที่ควรเป็นใหม่ หลังเพิ่มใบแก้ฐานข้อมูล
//       (ฐานเปล่า = Supabase อีกตัวที่สร้างจากใบล้วน ๆ ใน worktree แยก คนละ port — ดู docs/GO-LIVE-CHECKLIST.md)
//
// ⚠️ ตัวนี้อ่านอย่างเดียวทุกโหมด · ค่าที่ควรเป็นผูกกับใบแก้ฐานข้อมูลใบล่าสุดตอนถ่าย — เพิ่มใบใหม่แล้วไม่ถ่ายใหม่ = ตก
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";

const ไฟล์ค่าที่ควรเป็น = "supabase/tests/expected-function-grants.json";
const SQL = `select coalesce(json_agg(json_build_object(
    'f', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
    'anon', has_function_privilege('anon', p.oid, 'execute'),
    'authenticated', has_function_privilege('authenticated', p.oid, 'execute'),
    'service_role', has_function_privilege('service_role', p.oid, 'execute'),
    'definer', p.prosecdef) order by 1), '[]'::json)
  from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'`;
const args = process.argv.slice(2);
const ค่าของ = f => (args.includes(f) ? args[args.indexOf(f) + 1] : null);
const ใบล่าสุด = () => readdirSync("supabase/migrations").filter(f => /^\d{4}_.*\.sql$/.test(f)).sort().pop()?.slice(0, 4) ?? "";
const อ่านจากคอนเทนเนอร์ = c => JSON.parse(execFileSync("docker", ["exec", "-i", c, "psql", "-U", "postgres", "-d", "postgres", "-At", "-c", SQL.replace(/\s+/g, " ")],
  { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 32 * 1024 * 1024 }));

if (args.includes("--print-sql")) {
  console.log("-- รันในหน้า SQL ของระบบจริง (อ่านอย่างเดียว) แล้วคัดลอกผลในช่องเดียวที่ได้ไปเก็บเป็นไฟล์ .json");
  console.log("-- จากนั้น: node scripts/db-audit-grants.mjs --actual <ไฟล์นั้น>");
  console.log(SQL + ";");
  process.exit(0);
}

if (args.includes("--snapshot")) {
  const c = ค่าของ("--snapshot");
  if (!c) { console.error("❌ --snapshot ต้องตามด้วยชื่อคอนเทนเนอร์ของฐานเปล่า"); process.exit(1); }
  const ใบในฐาน = execFileSync("docker", ["exec", "-i", c, "psql", "-U", "postgres", "-d", "postgres", "-At", "-c",
    "select max(version) || ' ' || count(*) from supabase_migrations.schema_migrations"], { encoding: "utf8" }).trim().split(" ");
  if (ใบในฐาน[0] !== ใบล่าสุด()) { console.error(`❌ ฐานเปล่ามีถึงใบ ${ใบในฐาน[0]} แต่ในโฟลเดอร์มีถึงใบ ${ใบล่าสุด()} — สร้างฐานเปล่าใหม่ให้ครบก่อน`); process.exit(1); }
  const rows = อ่านจากคอนเทนเนอร์(c);
  writeFileSync(ไฟล์ค่าที่ควรเป็น, JSON.stringify({ migration: ใบในฐาน[0], functions: rows }, null, 1) + "\n");
  console.log(`ถ่ายค่าที่ควรเป็นแล้ว: ${rows.length} ฟังก์ชัน จากฐานเปล่าที่มีถึงใบ ${ใบในฐาน[0]} (${ใบในฐาน[1]} ใบ) → ${ไฟล์ค่าที่ควรเป็น}`);
  process.exit(0);
}

if (!existsSync(ไฟล์ค่าที่ควรเป็น)) { console.error(`❌ ยังไม่มี ${ไฟล์ค่าที่ควรเป็น} — ถ่ายจากฐานเปล่าก่อนด้วย --snapshot`); process.exit(1); }
const ควรเป็น = JSON.parse(readFileSync(ไฟล์ค่าที่ควรเป็น, "utf8"));
if (ควรเป็น.migration !== ใบล่าสุด()) {
  console.log(`  ✗ ค่าที่ควรเป็นถ่ายไว้ตอนใบ ${ควรเป็น.migration} แต่ตอนนี้มีถึงใบ ${ใบล่าสุด()} — สร้างฐานเปล่าจากใบทั้งหมดแล้วถ่ายใหม่ (--snapshot)`);
  console.log("สิทธิ์เรียกคำสั่งไม่ตรงกับใบแก้ฐานข้อมูล: ตรวจไม่ได้ (ค่าที่ควรเป็นเก่ากว่าใบแก้ฐานข้อมูล)");
  process.exit(1);
}

let จริง, ที่มา;
const ไฟล์ผล = ค่าของ("--actual");
if (ไฟล์ผล) {
  let j = JSON.parse(readFileSync(ไฟล์ผล, "utf8"));
  // หน้า SQL บางแบบห่อผลเป็น [{ coalesce: [...] }] หรือ [{ json_agg: [...] }]
  while (Array.isArray(j) && j.length === 1 && j[0] && !("f" in j[0])) j = Object.values(j[0])[0];
  if (typeof j === "string") j = JSON.parse(j);
  จริง = j; ที่มา = `ไฟล์ ${ไฟล์ผล}`;
} else {
  const c = process.env.PMS_DB_CONTAINER ?? "supabase_db_Benjamin-HQ-main";
  try { จริง = อ่านจากคอนเทนเนอร์(c); ที่มา = "ฐานทดสอบในเครื่อง"; }
  catch (e) { console.log(`สิทธิ์เรียกคำสั่งไม่ตรงกับใบแก้ฐานข้อมูล: ข้าม (ต่อฐานทดสอบในเครื่องไม่ได้ — ${String(e?.message ?? e).split("\n")[0].slice(0, 60)})`); process.exit(0); }
}

const ใคร = { anon: "คนที่ยังไม่เข้าระบบ", authenticated: "ผู้ใช้ที่เข้าระบบ", service_role: "ฝั่งเซิร์ฟเวอร์ (service_role)" };
const m = new Map(จริง.map(r => [r.f, r]));
const พบ = [];
for (const e of ควรเป็น.functions) {
  const a = m.get(e.f);
  if (!a) { พบ.push({ f: e.f, msg: "ไม่มีฟังก์ชันนี้ในฐานที่ตรวจ (ใบแก้ฐานข้อมูลขึ้นไม่ครบ?)", หลวม: false }); continue; }
  for (const role of ["anon", "authenticated", "service_role"]) {
    if (a[role] !== e[role]) พบ.push({ f: e.f, หลวม: a[role] === true, definer: e.definer,
      msg: a[role] ? `${ใคร[role]}เรียกได้ ทั้งที่ใบแก้ฐานข้อมูลถอนสิทธิ์ไว้` : `${ใคร[role]}เรียกไม่ได้ ทั้งที่ใบแก้ฐานข้อมูลให้สิทธิ์ไว้` });
  }
}
for (const a of จริง) if (!ควรเป็น.functions.some(e => e.f === a.f)) พบ.push({ f: a.f, msg: "มีในฐานที่ตรวจ แต่ไม่มีในใบแก้ฐานข้อมูล", หลวม: a.anon || a.authenticated });

for (const p of พบ.sort((x, y) => Number(y.หลวม) - Number(x.หลวม) || x.f.localeCompare(y.f))) {
  console.log(`  ✗ ${p.f.length > 70 ? p.f.slice(0, 67) + "…" : p.f}${p.definer ? "  [สิทธิ์สูง]" : ""}\n      ${p.msg}`);
}
if (พบ.length) console.log("      สิทธิ์ต้องมาจากใบแก้ฐานข้อมูลเท่านั้น — ฐานที่ตรวจถูกให้/ถอนสิทธิ์นอกใบ · สร้างฐานใหม่จากใบ หรือหาว่าคำสั่งไหนให้สิทธิ์คืน");
console.log(`สิทธิ์เรียกคำสั่งไม่ตรงกับใบแก้ฐานข้อมูล: ${พบ.length} จุด · หลวมกว่าที่ควร ${พบ.filter(p => p.หลวม).length} (${ที่มา} · เทียบ ${ควรเป็น.functions.length} ฟังก์ชัน ณ ใบ ${ควรเป็น.migration})`);
process.exit(พบ.length ? 1 : 0);
