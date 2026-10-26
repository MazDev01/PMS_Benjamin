// ── ตรวจฐานข้อมูล: สิทธิ์ทุกอย่างต้องตรงกับที่ใบแก้ฐานข้อมูลกำหนด ─────────────────────────────
//    (สิทธิ์เรียกคำสั่ง · สิทธิ์บนตาราง มุมมอง ตัวนับเลข · สิทธิ์รายคอลัมน์ · การเปิดกฎรายแถว)
//
// ทำไมต้องมี (พบ 13 ต.ค. 69):
//   1) ฐานทดสอบในเครื่องมีคำสั่ง 19 ตัวที่ใบแก้ฐานข้อมูลสั่งถอนสิทธิ์จากคนนอกไว้ แต่ในเครื่องกลับเรียกได้ทั้งคนนอกและผู้ใช้
//      (รวมตัวออกใบผ่าน และตัวนับจำนวนคำขอ) — ฐานในเครื่องถูกให้สิทธิ์คืนแบบเหมาครั้งหนึ่งนอกใบแก้ฐานข้อมูล
//   2) supabase/seed.sql เคยมี "grant all on all tables … to anon, authenticated, service_role" ซึ่งรันหลังใบ
//      จึงทับการถอนสิทธิ์ที่ใบทำไว้ — คนที่ยังไม่เข้าระบบอ่านมุมมองแม่แบบได้ ทั้งที่ใบ 0186 ถอนไว้
//   ผลของทั้งสองเรื่อง: ชุดทดสอบเรื่องสิทธิ์รันกับสิทธิ์ที่หลวมกว่าระบบจริงมาตลอด
//
// วิธีตรวจ: เทียบกับ "ค่าที่ควรเป็น" ซึ่งถ่ายมาจากฐานเปล่าที่สร้างจากใบแก้ฐานข้อมูลล้วน ๆ (ไม่รัน seed) — ไม่ได้เขียนรายการด้วยมือ
//   supabase/tests/expected-function-grants.json   สิทธิ์เรียกคำสั่ง
//   supabase/tests/expected-relation-grants.json   สิทธิ์บนตาราง/มุมมอง/ตัวนับเลข + สิทธิ์รายคอลัมน์ + การเปิดกฎรายแถว
//
// ใช้:
//   node scripts/db-audit-grants.mjs                       ตรวจฐานทดสอบในเครื่องที่แอปใช้อยู่ (ผ่าน Docker)
//   node scripts/db-audit-grants.mjs --print-sql           พิมพ์คำสั่ง SELECT (อ่านอย่างเดียว) ไว้รันในหน้า SQL ของระบบจริง
//   node scripts/db-audit-grants.mjs --actual ผล.json      ตรวจจากผลที่คัดลอกมาจากคำสั่งข้างบน (ไม่ต้องมีรหัสฐานจริงในเครื่อง)
//   node scripts/db-audit-grants.mjs --snapshot <คอนเทนเนอร์ฐานเปล่า>   ถ่ายค่าที่ควรเป็นใหม่ หลังเพิ่มใบแก้ฐานข้อมูล
//       (ฐานเปล่า = Supabase อีกตัวที่สร้างจากใบล้วน ๆ ใน worktree แยก คนละ port — ดู docs/GO-LIVE-CHECKLIST.md)
//
// ⚠️ ตัวนี้อ่านอย่างเดียวทุกโหมด · ค่าที่ควรเป็นผูกกับใบแก้ฐานข้อมูลใบล่าสุดตอนถ่าย — เพิ่มใบใหม่แล้วไม่ถ่ายใหม่ = ตก
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { localDbContainer } from "./lib/localDbContainer.mjs";
import { อาร์กิวเมนต์psql } from "./lib/testDbGuard.mjs";

const ไฟล์คำสั่ง = "supabase/tests/expected-function-grants.json";
const ไฟล์ตาราง = "supabase/tests/expected-relation-grants.json";
const ผู้ถือสิทธิ์ = ["anon", "authenticated", "service_role"];

// ── คำสั่งอ่านสิทธิ์ (อ่านอย่างเดียว) ────────────────────────────────────────────────
const SQL_คำสั่ง = `select coalesce(json_agg(json_build_object(
    'f', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
    'anon', has_function_privilege('anon', p.oid, 'execute'),
    'authenticated', has_function_privilege('authenticated', p.oid, 'execute'),
    'service_role', has_function_privilege('service_role', p.oid, 'execute'),
    'definer', p.prosecdef) order by p.proname, pg_get_function_identity_arguments(p.oid)), '[]'::json)
  from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'`;
// สิทธิ์ของแต่ละผู้ถือ เขียนเป็นรายการคั่นจุลภาค เรียงตามตัวอักษร (ว่าง = ไม่มีสิทธิ์เลย)
const สิทธิ์ของ = role => `(select coalesce(string_agg(pv, ',' order by pv), '')
       from unnest(case when c.relkind = 'S' then array['SELECT','UPDATE','USAGE']
                        else array['DELETE','INSERT','REFERENCES','SELECT','TRIGGER','TRUNCATE','UPDATE'] end) pv
      where case when c.relkind = 'S' then has_sequence_privilege('${role}', c.oid, pv)
                 else has_table_privilege('${role}', c.oid, pv) end)`;
const SQL_ตาราง = `select coalesce(json_agg(json_build_object(
    'r', c.relname, 'kind', c.relkind, 'rls', c.relrowsecurity,
    ${ผู้ถือสิทธิ์.map(r => `'${r}', ${สิทธิ์ของ(r)}`).join(",\n    ")}) order by c.relname), '[]'::json)
  from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p','v','m','S')`;
// สิทธิ์รายคอลัมน์ = สิทธิ์ที่ให้เฉพาะบางคอลัมน์ ทั้งที่ไม่มีสิทธิ์นั้นทั้งตาราง
const SQL_คอลัมน์ = `select coalesce(json_agg(json_build_object('c', q.c, 'role', q.r, 'privs', q.pvs) order by q.c, q.r), '[]'::json)
  from (select c.relname || '.' || a.attname as c, r,
               (select string_agg(pv, ',' order by pv) from unnest(array['INSERT','REFERENCES','SELECT','UPDATE']) pv
                 where has_column_privilege(r, c.oid, a.attnum, pv) and not has_table_privilege(r, c.oid, pv)) as pvs
          from pg_class c
          join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
         cross join unnest(array['anon','authenticated','service_role']) r
         where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p','v','m')) q
 where q.pvs is not null`;
const SQL = `select json_build_object(
  'functions', (${SQL_คำสั่ง}),
  'relations', (${SQL_ตาราง}),
  'columns',   (${SQL_คอลัมน์}))`;

const args = process.argv.slice(2);
const ค่าของ = f => (args.includes(f) ? args[args.indexOf(f) + 1] : null);
const ใบล่าสุด = () => readdirSync("supabase/migrations").filter(f => /^\d{4}_.*\.sql$/.test(f)).sort().pop()?.slice(0, 4) ?? "";
const psql = (c, sql) => execFileSync("docker", [...อาร์กิวเมนต์psql(c, { เขียน: false }), "-At", "-c", sql.replace(/\s+/g, " ")],
  { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 });
const อ่านจากคอนเทนเนอร์ = c => JSON.parse(psql(c, SQL));

if (args.includes("--print-sql")) {
  console.log("-- รันในหน้า SQL ของระบบจริง (อ่านอย่างเดียว) แล้วคัดลอกผลในช่องเดียวที่ได้ไปเก็บเป็นไฟล์ .json");
  console.log("-- จากนั้น: node scripts/db-audit-grants.mjs --actual <ไฟล์นั้น>");
  console.log(SQL + ";");
  process.exit(0);
}

if (args.includes("--snapshot")) {
  const c = ค่าของ("--snapshot");
  if (!c) { console.error("❌ --snapshot ต้องตามด้วยชื่อคอนเทนเนอร์ของฐานเปล่า"); process.exit(1); }
  const ใบในฐาน = psql(c, "select max(version) || ' ' || count(*) from supabase_migrations.schema_migrations").trim().split(" ");
  if (ใบในฐาน[0] !== ใบล่าสุด()) { console.error(`❌ ฐานเปล่ามีถึงใบ ${ใบในฐาน[0]} แต่ในโฟลเดอร์มีถึงใบ ${ใบล่าสุด()} — สร้างฐานเปล่าใหม่ให้ครบก่อน`); process.exit(1); }
  const j = อ่านจากคอนเทนเนอร์(c);
  writeFileSync(ไฟล์คำสั่ง, JSON.stringify({ migration: ใบในฐาน[0], functions: j.functions }, null, 1) + "\n");
  writeFileSync(ไฟล์ตาราง, JSON.stringify({ migration: ใบในฐาน[0], relations: j.relations, columns: j.columns }, null, 1) + "\n");
  console.log(`ถ่ายค่าที่ควรเป็นแล้ว จากฐานเปล่าที่มีถึงใบ ${ใบในฐาน[0]} (${ใบในฐาน[1]} ใบ): ${j.functions.length} ฟังก์ชัน → ${ไฟล์คำสั่ง} · ${j.relations.length} ตาราง/มุมมอง/ตัวนับเลข + สิทธิ์รายคอลัมน์ ${j.columns.length} รายการ → ${ไฟล์ตาราง}`);
  process.exit(0);
}

for (const f of [ไฟล์คำสั่ง, ไฟล์ตาราง]) if (!existsSync(f)) { console.error(`❌ ยังไม่มี ${f} — ถ่ายจากฐานเปล่าก่อนด้วย --snapshot`); process.exit(1); }
const ควรเป็น = JSON.parse(readFileSync(ไฟล์คำสั่ง, "utf8"));
const ควรเป็นตาราง = JSON.parse(readFileSync(ไฟล์ตาราง, "utf8"));
for (const [ชื่อ, ใบ] of [[ไฟล์คำสั่ง, ควรเป็น.migration], [ไฟล์ตาราง, ควรเป็นตาราง.migration]]) {
  if (ใบ !== ใบล่าสุด()) {
    console.log(`  ✗ ${ชื่อ} ถ่ายไว้ตอนใบ ${ใบ} แต่ตอนนี้มีถึงใบ ${ใบล่าสุด()} — สร้างฐานเปล่าจากใบทั้งหมดแล้วถ่ายใหม่ (--snapshot)`);
    console.log("สิทธิ์ไม่ตรงกับใบแก้ฐานข้อมูล: ตรวจไม่ได้ (ค่าที่ควรเป็นเก่ากว่าใบแก้ฐานข้อมูล)");
    process.exit(1);
  }
}

let จริง, ที่มา;
const ไฟล์ผล = ค่าของ("--actual");
if (ไฟล์ผล) {
  let j = JSON.parse(readFileSync(ไฟล์ผล, "utf8"));
  // หน้า SQL บางแบบห่อผลเป็น [{ json_build_object: {...} }] หรือ [{ coalesce: [...] }]
  while (Array.isArray(j) && j.length === 1 && j[0] && !("f" in j[0])) j = Object.values(j[0])[0];
  if (typeof j === "string") j = JSON.parse(j);
  // ผลจากคำสั่งรุ่นแรก (ก่อน 13 ต.ค. 69 รอบสอง) เป็นรายการฟังก์ชันล้วน — ตรวจได้เฉพาะสิทธิ์เรียกคำสั่ง
  จริง = Array.isArray(j) ? { functions: j } : j; ที่มา = `ไฟล์ ${ไฟล์ผล}`;
} else {
  try { จริง = อ่านจากคอนเทนเนอร์(localDbContainer()); ที่มา = `ฐานทดสอบในเครื่อง ${localDbContainer()}`; }
  catch (e) { console.log(`สิทธิ์ไม่ตรงกับใบแก้ฐานข้อมูล: ข้าม (ต่อฐานทดสอบในเครื่องไม่ได้ — ${String(e?.message ?? e).split("\n")[0].slice(0, 60)})`); process.exit(0); }
}

const ใคร = { anon: "คนที่ยังไม่เข้าระบบ", authenticated: "ผู้ใช้ที่เข้าระบบ", service_role: "ฝั่งเซิร์ฟเวอร์ (service_role)" };
const ชนิด = { r: "ตาราง", p: "ตาราง", v: "มุมมอง", m: "มุมมอง", S: "ตัวนับเลข" };
const ชุด = s => new Set(String(s ?? "").split(",").filter(Boolean));
const พบ = [];   // { หมวด, ชื่อ, msg, หลวม }

// ── 1) สิทธิ์เรียกคำสั่ง ──
{
  const m = new Map(จริง.functions.map(r => [r.f, r]));
  for (const e of ควรเป็น.functions) {
    const a = m.get(e.f);
    if (!a) { พบ.push({ หมวด: "คำสั่ง", ชื่อ: e.f, msg: "ไม่มีฟังก์ชันนี้ในฐานที่ตรวจ (ใบแก้ฐานข้อมูลขึ้นไม่ครบ?)", หลวม: false }); continue; }
    for (const role of ผู้ถือสิทธิ์) {
      if (a[role] !== e[role]) พบ.push({ หมวด: "คำสั่ง", ชื่อ: e.f + (e.definer ? "  [สิทธิ์สูง]" : ""), หลวม: a[role] === true,
        msg: a[role] ? `${ใคร[role]}เรียกได้ ทั้งที่ใบแก้ฐานข้อมูลถอนสิทธิ์ไว้` : `${ใคร[role]}เรียกไม่ได้ ทั้งที่ใบแก้ฐานข้อมูลให้สิทธิ์ไว้` });
    }
  }
  for (const a of จริง.functions) if (!ควรเป็น.functions.some(e => e.f === a.f)) พบ.push({ หมวด: "คำสั่ง", ชื่อ: a.f, msg: "มีในฐานที่ตรวจ แต่ไม่มีในใบแก้ฐานข้อมูล", หลวม: a.anon || a.authenticated });
}

// ── 2) สิทธิ์บนตาราง มุมมอง ตัวนับเลข + การเปิดกฎรายแถว ──
const ตรวจตาราง = Array.isArray(จริง.relations);
if (ตรวจตาราง) {
  const m = new Map(จริง.relations.map(r => [r.r, r]));
  for (const e of ควรเป็นตาราง.relations) {
    const a = m.get(e.r), ป้าย = `${ชนิด[e.kind] ?? e.kind} ${e.r}`;
    if (!a) { พบ.push({ หมวด: "ตาราง", ชื่อ: ป้าย, msg: "ไม่มีในฐานที่ตรวจ (ใบแก้ฐานข้อมูลขึ้นไม่ครบ?)", หลวม: false }); continue; }
    if (e.rls && !a.rls) พบ.push({ หมวด: "ตาราง", ชื่อ: ป้าย, msg: "กฎรายแถวถูกปิด ทั้งที่ใบแก้ฐานข้อมูลเปิดไว้", หลวม: true });
    if (!e.rls && a.rls) พบ.push({ หมวด: "ตาราง", ชื่อ: ป้าย, msg: "กฎรายแถวถูกเปิด ทั้งที่ใบแก้ฐานข้อมูลไม่ได้เปิด", หลวม: false });
    for (const role of ผู้ถือสิทธิ์) {
      const มี = ชุด(a[role]), ควร = ชุด(e[role]);
      const เกิน = [...มี].filter(p => !ควร.has(p)), ขาด = [...ควร].filter(p => !มี.has(p));
      if (เกิน.length) พบ.push({ หมวด: "ตาราง", ชื่อ: ป้าย, หลวม: true, msg: `${ใคร[role]}มีสิทธิ์เกินใบแก้ฐานข้อมูล: ${เกิน.join(", ")}` });
      if (ขาด.length) พบ.push({ หมวด: "ตาราง", ชื่อ: ป้าย, หลวม: false, msg: `${ใคร[role]}ขาดสิทธิ์ที่ใบแก้ฐานข้อมูลให้ไว้: ${ขาด.join(", ")}` });
    }
  }
  for (const a of จริง.relations) if (!ควรเป็นตาราง.relations.some(e => e.r === a.r))
    พบ.push({ หมวด: "ตาราง", ชื่อ: `${ชนิด[a.kind] ?? a.kind} ${a.r}`, msg: "มีในฐานที่ตรวจ แต่ไม่มีในใบแก้ฐานข้อมูล", หลวม: Boolean(a.anon || a.authenticated) });

  // ── 2ข) กฎตายตัว: มุมมองห้ามให้ผู้ใช้เขียนผ่าน (พบ 14 ต.ค. 69 · ใบ 0199) ──
  //   มุมมองแบบง่ายเขียนผ่านได้ และทำงานด้วยสิทธิ์เจ้าของ = ข้ามกฎรายแถวของตารางจริง
  //   (ดีลเลอร์แก้สถานะดีลเลอร์อื่นผ่าน dealers_directory · แก้/ลบแม่แบบผ่าน master_catalog_public)
  //   ตรวจทั้งฐานจริงและค่าที่ถ่ายไว้ — ไม่งั้นถ่ายค่าจากฐานที่หลวมอยู่แล้ว ช่องโหว่จะกลายเป็น "ค่าที่ควรเป็น"
  const เขียน = ["INSERT", "UPDATE", "DELETE", "TRUNCATE"];
  for (const [แหล่ง, rows] of [["ฐานที่ตรวจ", จริง.relations], ["ค่าที่ถ่ายไว้", ควรเป็นตาราง.relations]]) {
    for (const a of rows) {
      if (a.kind !== "v" && a.kind !== "m") continue;
      for (const role of ["anon", "authenticated"]) {
        const ผิด = [...ชุด(a[role])].filter(p => เขียน.includes(p));
        if (ผิด.length) พบ.push({ หมวด: "ตาราง", ชื่อ: `มุมมอง ${a.r}`, หลวม: true,
          msg: `${ใคร[role]}เขียนผ่านมุมมองได้ (${แหล่ง}): ${ผิด.join(", ")} — มุมมองต้องอ่านอย่างเดียว` });
      }
    }
  }

  // ── 3) สิทธิ์รายคอลัมน์ ──
  const k = x => `${x.c}|${x.role}`;
  const mc = new Map((จริง.columns ?? []).map(x => [k(x), x])), ec = new Map(ควรเป็นตาราง.columns.map(x => [k(x), x]));
  for (const key of new Set([...mc.keys(), ...ec.keys()])) {
    const a = mc.get(key), e = ec.get(key), x = a ?? e;
    const มี = ชุด(a?.privs), ควร = ชุด(e?.privs);
    const เกิน = [...มี].filter(p => !ควร.has(p)), ขาด = [...ควร].filter(p => !มี.has(p));
    if (เกิน.length) พบ.push({ หมวด: "คอลัมน์", ชื่อ: `คอลัมน์ ${x.c}`, หลวม: true, msg: `${ใคร[x.role]}มีสิทธิ์รายคอลัมน์เกินใบแก้ฐานข้อมูล: ${เกิน.join(", ")}` });
    if (ขาด.length) พบ.push({ หมวด: "คอลัมน์", ชื่อ: `คอลัมน์ ${x.c}`, หลวม: false, msg: `${ใคร[x.role]}ขาดสิทธิ์รายคอลัมน์ที่ใบแก้ฐานข้อมูลให้ไว้: ${ขาด.join(", ")}` });
  }
}

for (const p of พบ.sort((x, y) => Number(y.หลวม) - Number(x.หลวม) || x.หมวด.localeCompare(y.หมวด) || x.ชื่อ.localeCompare(y.ชื่อ))) {
  console.log(`  ✗ ${p.ชื่อ.length > 78 ? p.ชื่อ.slice(0, 75) + "…" : p.ชื่อ}\n      ${p.msg}`);
}
if (พบ.length) console.log("      สิทธิ์ต้องมาจากใบแก้ฐานข้อมูลเท่านั้น — ฐานที่ตรวจถูกให้/ถอนสิทธิ์นอกใบ (เช่นจาก seed.sql หรือสั่งมือ) · สร้างฐานใหม่จากใบ หรือหาว่าคำสั่งไหนให้สิทธิ์คืน");
if (!ตรวจตาราง) console.log("  ⚠ ไฟล์ผลนี้มาจากคำสั่งรุ่นเก่า มีแต่สิทธิ์เรียกคำสั่ง — ยังไม่ได้ตรวจตาราง/มุมมอง/คอลัมน์ · รันคำสั่งจาก --print-sql ใหม่");
const นับ = ห => พบ.filter(p => p.หมวด === ห).length;
const ชิ้นที่หลวม = new Set(พบ.filter(p => p.หลวม && p.หมวด !== "คำสั่ง").map(p => p.ชื่อ)).size;
console.log(`สิทธิ์ไม่ตรงกับใบแก้ฐานข้อมูล: ${พบ.length} จุด · หลวมกว่าที่ควร ${พบ.filter(p => p.หลวม).length}`
  + ` (คำสั่ง ${นับ("คำสั่ง")} · ตาราง/มุมมอง/ตัวนับเลข ${นับ("ตาราง")} · คอลัมน์ ${นับ("คอลัมน์")} · ตาราง/มุมมอง/คอลัมน์ที่หลวมกว่าใบ ${ชิ้นที่หลวม} ตัว)`
  + `\n  ${ที่มา} · เทียบ ${ควรเป็น.functions.length} ฟังก์ชัน${ตรวจตาราง ? ` + ${ควรเป็นตาราง.relations.length} ตาราง/มุมมอง/ตัวนับเลข` : ""} ณ ใบ ${ควรเป็น.migration}`);
process.exit(พบ.length ? 1 : 0);
