// ── ฐานทดสอบต้องมีโครงสร้างตรงกับไฟล์ใบปรับฐานของผู้ถือล็อก (บอสสั่ง 26 ต.ค. 69) ─────────────────────────────────────
//
// เหตุ: เซสชันหนึ่งลองใบใหม่บนฐานทดสอบ (ใบ 0244 ของ ef) แล้วรอบตรวจรวมของอีกเซสชันรันบนฐานนั้น
//   ข้อทดสอบผ่านกับคำสั่งรุ่นที่ไม่อยู่ใน commit ที่ตรวจ — รอบตรวจรับรองของที่ไม่ได้ขึ้นเว็บ
// กติกา (เครื่องบังคับ ไม่ใช่ให้จำ): ทุกครั้งที่ขอล็อกฐานทดสอบ (รอบตรวจเต็ม · playwright · สคริปต์) เทียบ "ลายโครงสร้าง" ของฐาน
//   (ฟังก์ชัน · ตาราง/คอลัมน์ · ข้อบังคับ · ดัชนี · ตัวดัก · กฎรายแถว · ชนิดข้อมูล · สิทธิ์) กับลายที่ได้จากไฟล์ใบปรับฐาน
//   ในโฟลเดอร์ของผู้ขอ (supabase/migrations) · ไม่ตรง → บอกว่าอะไรไม่ตรง น่าจะมาจากเซสชันไหน → สร้างฐานใหม่จากไฟล์ของผู้ขอก่อนรัน
//   สร้างใหม่ไม่สำเร็จ = หยุด (ไม่ให้ล็อก) ห้ามรันต่อบนฐานที่ไม่ตรง
//   ลายของแต่ละ "ชุดใบ" (แฮชของไฟล์ใบทั้งหมด) จำไว้หลังสร้างใหม่ครั้งแรก (~/.pms-testdb-schema.json) — ชุดใบใหม่ = สร้างใหม่ 1 ครั้ง
// ผลที่ได้: เซสชันที่ลองใบใหม่ = ใบอยู่ในโฟลเดอร์ตัวเอง → ได้ฐานตามไฟล์ของตัวเอง · คนถัดไปขอล็อก = ฐานถูกสร้างใหม่ตามไฟล์ของคนนั้น
//   ลงคำสั่งด้วยมือที่ไม่มีไฟล์ใบ = ไม่ตรง → ถูกสร้างใหม่ทับ (ของที่ลองค้างไว้หายเสมอ)
// ข้อทดสอบ: tests/tools/testdb-schema.test.mjs
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export const ไฟล์ลาย = () => process.env.PMS_TESTDB_SCHEMA_CACHE || path.join(os.homedir(), ".pms-testdb-schema.json");
export const ที่ฐานทดสอบ = () => process.env.PMS_TEST_DB_DIR || "C:/.claude/pms-dbcheck";
const คอนเทนเนอร์ = process.env.PMS_TESTDB_CONTAINER || "supabase_db_pms-dbcheck";

/** แฮชของไฟล์ใบปรับฐานทั้งหมดในโฟลเดอร์ + ข้อมูลตั้งต้น (ชื่อ + เนื้อ · ไม่สนการขึ้นบรรทัดของ Windows) */
export function ชุดใบ(ราก) {
  const d = path.join(ราก, "supabase/migrations");
  if (!existsSync(d)) throw new Error(`ไม่พบโฟลเดอร์ใบปรับฐาน ${d}`);
  const h = createHash("sha256");
  for (const f of readdirSync(d).filter(f => f.endsWith(".sql")).sort()) h.update(f + "\0" + readFileSync(path.join(d, f), "utf8").replace(/\r\n/g, "\n") + "\0");
  // ข้อมูลตั้งต้น (tests/fixtures/test-baseline.sql) นับด้วย — ขั้นสร้างฐานใส่ไฟล์นี้หลังลงใบ · เดิมแก้ไฟล์นี้แล้วฐานไม่ถูกสร้างใหม่
  //   ข้อทดสอบรันบนข้อมูลรุ่นเก่าเงียบ ๆ (เจอ 27 ต.ค. 69: เติมข้อมูลบริษัทให้ RYG ในไฟล์ แต่ฐานทดสอบยังไม่มี → ส่งใบของ RYG ไม่ได้ทั้งชุด)
  const ตั้งต้น = path.join(ราก, "tests/fixtures/test-baseline.sql");
  if (existsSync(ตั้งต้น)) h.update("test-baseline.sql\0" + readFileSync(ตั้งต้น, "utf8").replace(/\r\n/g, "\n"));
  return h.digest("hex").slice(0, 16);
}

// ส่วนของ schema public + กฎรายแถวของ storage — ไม่รวม pms_lock (ตัวกันของฐานทดสอบเอง) · ไม่รวมข้อมูล/ค่าตัวนับ
const sqlลาย = `
select x from (
  select 'fn|' || p.oid::regprocedure::text || '|' || md5(replace(pg_get_functiondef(p.oid), chr(13), '')) || '|' || coalesce(array_to_string(p.proacl, ','), '') as x
    from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind in ('f', 'p')
  union all select 'rel|' || c.relname || '|' || c.relkind::text || '|' || c.relrowsecurity::text || '|' || coalesce(array_to_string(c.relacl, ','), '')
    from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v', 'm', 'p', 'S', 'f')
  union all select 'col|' || c.relname || '.' || a.attname || '|' || format_type(a.atttypid, a.atttypmod) || '|' || a.attnotnull::text::text
                   || '|' || coalesce(pg_get_expr(d.adbin, d.adrelid), '') || '|' || coalesce(array_to_string(a.attacl, ','), '')
    from pg_attribute a join pg_class c on c.oid = a.attrelid left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v', 'm', 'p') and a.attnum > 0 and not a.attisdropped
  union all select 'con|' || conrelid::regclass::text || '|' || conname || '|' || md5(pg_get_constraintdef(oid))
    from pg_constraint where connamespace = 'public'::regnamespace
  union all select 'idx|' || indexrelid::regclass::text || '|' || md5(pg_get_indexdef(indexrelid))
    from pg_index i join pg_class c on c.oid = i.indrelid where c.relnamespace = 'public'::regnamespace
  union all select 'trg|' || tgrelid::regclass::text || '|' || tgname || '|' || md5(pg_get_triggerdef(oid)) || '|' || tgenabled::text
    from pg_trigger where not tgisinternal and tgrelid in (select oid from pg_class where relnamespace in ('public'::regnamespace, 'storage'::regnamespace))
  union all select 'pol|' || schemaname || '.' || tablename || '|' || policyname || '|' || md5(coalesce(qual, '') || '|' || coalesce(with_check, '') || '|' || array_to_string(roles, ',') || '|' || cmd || '|' || permissive::text)
    from pg_policies where schemaname in ('public', 'storage')
  union all select 'view|' || c.relname || '|' || md5(pg_get_viewdef(c.oid))
    from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('v', 'm')
  union all select 'type|' || t.typname || '|' || coalesce((select string_agg(e.enumlabel, ',' order by e.enumsortorder) from pg_enum e where e.enumtypid = t.oid), '')
    from pg_type t where t.typnamespace = 'public'::regnamespace and t.typtype in ('e', 'd', 'c') and not exists (select 1 from pg_class c where c.reltype = t.oid and c.relkind <> 'c')
) s order by x;`;

/** ลายโครงสร้างของฐานทดสอบตอนนี้ (อ่านอย่างเดียว · บัญชี pms_reader) — บรรทัดละสิ่ง "ชนิด|ชื่อ|ลาย…" */
export function ลายโครงสร้าง() {
  const r = spawnSync("docker", ["exec", "-i", "-e", "PGPASSWORD=pms_reader", คอนเทนเนอร์, "psql", "-X", "-At", "-h", "127.0.0.1", "-U", "pms_reader", "-d", "postgres", "-v", "ON_ERROR_STOP=1"],
    { input: sqlลาย, encoding: "utf8", maxBuffer: 256 << 20 });
  if (r.status !== 0) throw new Error(`อ่านโครงสร้างฐานทดสอบไม่ได้: ${(r.stderr ?? "").trim().slice(0, 300)}`);
  return r.stdout.split(/\r?\n/).filter(Boolean);
}

const ชื่อของ = (บรรทัด) => บรรทัด.split("|").slice(0, 2).join("|");
/** ส่วนต่าง: เกิน (มีในฐาน ไม่มีในไฟล์) · ขาด (มีในไฟล์ ไม่มีในฐาน) · ต่าง (ชื่อเดียวกัน เนื้อ/สิทธิ์ต่าง) */
export function เทียบ(ที่ควรเป็น, ที่เป็น) {
  const ควร = new Map(ที่ควรเป็น.map(l => [ชื่อของ(l), l])), เป็น = new Map(ที่เป็น.map(l => [ชื่อของ(l), l]));
  const เกิน = [...เป็น.keys()].filter(k => !ควร.has(k));
  const ขาด = [...ควร.keys()].filter(k => !เป็น.has(k));
  const ต่าง = [...เป็น.keys()].filter(k => ควร.has(k) && ควร.get(k) !== เป็น.get(k));
  return { เกิน, ขาด, ต่าง, ตรง: !เกิน.length && !ขาด.length && !ต่าง.length };
}

export const อ่านแคช = () => { try { return JSON.parse(readFileSync(ไฟล์ลาย(), "utf8")); } catch { return {}; } };
export function จำลาย(ชุด, ลาย, เซสชัน) {
  const แคช = อ่านแคช();
  แคช[ชุด] = { ลาย, เมื่อ: new Date().toISOString(), เซสชัน };
  // เก็บแค่ 20 ชุดล่าสุด
  const เรียง = Object.entries(แคช).sort((a, b) => Date.parse(b[1].เมื่อ) - Date.parse(a[1].เมื่อ)).slice(0, 20);
  writeFileSync(ไฟล์ลาย(), JSON.stringify(Object.fromEntries(เรียง)));
}

/** น่าจะมาจากเซสชันไหน — ใบในประวัติของฐานที่ไม่มีในไฟล์ (เจ้าของเลขจอง) · ชื่อสิ่งที่ไม่ตรงอยู่ในใบของเซสชันไหน · ใครถือล็อกตั้งแต่ลายล่าสุด */
export function ที่มาที่น่าจะเป็น(ส่วนต่าง, ราก, { ประวัติล็อก = [], ลายล่าสุดเมื่อ } = {}) {
  const บอก = [];
  // ① ใบที่ลงในฐานแต่ไม่มีไฟล์ในโฟลเดอร์นี้
  const r = spawnSync("docker", ["exec", "-i", "-e", "PGPASSWORD=pms_reader", คอนเทนเนอร์, "psql", "-X", "-At", "-h", "127.0.0.1", "-U", "pms_reader", "-d", "postgres",
    "-c", "select version || '|' || coalesce(name, '') from supabase_migrations.schema_migrations"], { encoding: "utf8" });
  const ไฟล์ = new Set(readdirSync(path.join(ราก, "supabase/migrations")).map(f => f.slice(0, 4)));
  const เกินใบ = (r.stdout ?? "").split(/\r?\n/).filter(Boolean).map(l => l.split("|")).filter(([v]) => !ไฟล์.has(v));
  let จอง = [];
  try {
    const gitDir = spawnSync("git", ["rev-parse", "--git-common-dir"], { cwd: ราก, encoding: "utf8" }).stdout.trim();
    จอง = JSON.parse(readFileSync(path.resolve(ราก, gitDir, "pms-migration-reservations.json"), "utf8"));
  } catch { /* ไม่มีบันทึกการจอง */ }
  const เจ้าของเลข = (v) => (Array.isArray(จอง) ? จอง : []).find(y => y?.เลข === v)?.เซสชัน ?? null;
  for (const [v, n] of เกินใบ) บอก.push(`ฐานมีใบ ${v} (${n}) ที่ไม่มีไฟล์ในโฟลเดอร์นี้${เจ้าของเลข(v) ? ` — เลขนี้จองโดยเซสชัน ${เจ้าของเลข(v)}` : ""}`);
  // ② ชื่อสิ่งที่ไม่ตรง อยู่ในไฟล์ใบของเซสชันไหน (โฟลเดอร์ C:/.claude/pms-wt/<ชื่อ>) แต่ไม่อยู่ในไฟล์ของโฟลเดอร์นี้
  const ชื่อสั้น = [...new Set([...ส่วนต่าง.เกิน, ...ส่วนต่าง.ต่าง].map(k => k.split("|")[1].replace(/\(.*$/, "").replace(/^public\./, "").split(".")[0]))].slice(0, 30);
  const ที่เซสชัน = process.env.PMS_WT_DIR || "C:/.claude/pms-wt";
  const ของเรา = readdirSync(path.join(ราก, "supabase/migrations")).filter(f => f.endsWith(".sql"));
  if (existsSync(ที่เซสชัน)) for (const s of readdirSync(ที่เซสชัน)) {
    const d = path.join(ที่เซสชัน, s, "supabase/migrations");
    if (!existsSync(d) || path.resolve(path.join(ที่เซสชัน, s)) === path.resolve(ราก)) continue;
    const ใบใหม่ = readdirSync(d).filter(f => f.endsWith(".sql") && !ของเรา.includes(f));
    const เจอ = ใบใหม่.filter(f => { const t = readFileSync(path.join(d, f), "utf8"); return ชื่อสั้น.some(n => n && t.includes(n)); });
    if (เจอ.length) บอก.push(`เซสชัน ${s} มีใบ ${เจอ.join(", ")} ที่แตะสิ่งที่ไม่ตรง (ไม่อยู่ในโฟลเดอร์นี้)`);
  }
  // ③ ใครถือล็อกตั้งแต่ลายที่ตรงล่าสุด
  if (ลายล่าสุดเมื่อ) {
    const หลังจากนั้น = [...new Set(ประวัติล็อก.filter(x => Date.parse(x.เริ่ม) >= Date.parse(ลายล่าสุดเมื่อ)).map(x => x.เซสชัน))];
    if (หลังจากนั้น.length) บอก.push(`ถือล็อกฐานทดสอบหลังลายที่ตรงล่าสุด (${new Date(ลายล่าสุดเมื่อ).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}): ${หลังจากนั้น.join(", ")}`);
  }
  return บอก.length ? บอก : ["ระบุเซสชันไม่ได้ (ไม่พบใบหรือไฟล์ของเซสชันใดที่ตรงกับสิ่งที่ไม่ตรง)"];
}

/** สร้างฐานทดสอบใหม่จากไฟล์ใบของโฟลเดอร์ ราก (ผู้ถือล็อกเรียก · env มีกุญแจของรอบแล้ว) — คืน true = สำเร็จ */
export function สร้างใหม่จากไฟล์(ราก) {
  const r = spawnSync(process.execPath, [path.join(ราก, "scripts/reset-test-db.mjs"), "--workdir", ที่ฐานทดสอบ(), "--migrations-from", ราก],
    { cwd: ราก, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: process.env, maxBuffer: 256 << 20 });
  return { ok: r.status === 0, ข้อความ: ((r.stdout ?? "") + (r.stderr ?? "")).split(/\r?\n/).filter(l => l && !/^NOTICE|^Applying/.test(l)).slice(-25).join("\n") };
}
