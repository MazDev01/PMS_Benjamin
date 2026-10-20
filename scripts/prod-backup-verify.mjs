// ── สำรองฐานเต็ม (โครง + ข้อมูล + ผู้ใช้ + ประวัติใบ) → ซ้อมกู้ลงฐานเปล่าในเครื่อง → เทียบจำนวนแถว/ตัวนับเลข/ที่เก็บไฟล์ ──────────
//
// บอสสั่ง 20 ต.ค. 69: ย้ายจาก C:\.claude\pms-prod-tools\backup-verify.sh เข้ามาใน repo (หายไปครั้งหนึ่งเพราะอยู่ในโฟลเดอร์ชั่วคราว)
//   และ db-push-prod เรียกตัวเดียวกันก่อนลงใบทุกครั้ง · ไม่มีรหัสลับในไฟล์นี้ (ฐานจริงใช้การผูกของ CLI ในโฟลเดอร์ pms-prod-ops)
//
// ใช้:  node scripts/prod-backup-verify.mjs [ชื่อโฟลเดอร์]                  ฐานจริง (ค่าตั้งต้น)
//       node scripts/prod-backup-verify.mjs --target local [ชื่อโฟลเดอร์]   ฐานทดสอบในเครื่อง (ใช้ทดสอบตัวเครื่องมือ)
// ผล:   exit 0 + "ผ่าน" เท่านั้นถึงเขียนฐานจริงต่อได้ · exit 1 = ไม่ผ่าน (บอกเหตุผลภาษาไทย) · exit 3 = มีงานอื่นถือล็อกอยู่
//
// ตั้งค่าได้ (มีค่าตั้งต้นของเครื่องนี้):
//   PMS_PROD_OPS_DIR       โฟลเดอร์ที่ CLI ผูกฐานจริงไว้ (C:/.claude/pms-prod-ops)
//   PMS_RESTORE_WORKDIR    โฟลเดอร์ supabase ของฐานเปล่าที่ใช้ซ้อมกู้ (C:/.claude/pms-restore-check · project pms-blank)
//   PMS_BACKUP_ROOT        ที่เก็บไฟล์สำรอง (C:/.claude/pms-prod-backups) — นอก repo เสมอ (มีข้อมูลลูกค้าจริง)
//   PMS_DRILL_SABOTAGE=1   ข้อทดสอบเท่านั้น (ใช้ได้กับ --target local เท่านั้น): ลบ 1 แถวในฐานที่กู้ ก่อนเทียบ → ต้องไม่ผ่าน
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ขอล็อก } from "./lib/prodLock.mjs";
import { loadTarget } from "./lib/targetEnv.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const ti = args.indexOf("--target");
const target = ti >= 0 ? args[ti + 1] : "prod";
const ชื่อ = args.filter((a, i) => !a.startsWith("--") && i !== ti + 1)[0]
  ?? `${new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 16).replace(/[:T]/g, "-")}-${target}`;
if (!["prod", "local"].includes(target)) { console.error("ใช้: node scripts/prod-backup-verify.mjs [--target prod|local] [ชื่อโฟลเดอร์]"); process.exit(2); }
if (process.env.PMS_DRILL_SABOTAGE === "1" && target !== "local") { console.error("⛔ PMS_DRILL_SABOTAGE ใช้ได้กับ --target local เท่านั้น"); process.exit(2); }

const OPS = process.env.PMS_PROD_OPS_DIR || "C:/.claude/pms-prod-ops";
const RESTORE = process.env.PMS_RESTORE_WORKDIR || "C:/.claude/pms-restore-check";
const ROOT = process.env.PMS_BACKUP_ROOT || "C:/.claude/pms-prod-backups";
const LOCAL_DB = "postgresql://postgres:postgres@127.0.0.1:55322/postgres";   // ฐานทดสอบ pms-dbcheck
const LOCAL_CONTAINER = "supabase_db_pms-dbcheck";
const SQL_COUNT = path.join(REPO, "scripts/sql/prod-count-all.sql");
const SQL_SEQ = path.join(REPO, "scripts/sql/prod-seq-check.sql");
const D = path.join(ROOT, ชื่อ);

// ไม่ผ่าน = โยนออกไปจบที่ท้ายไฟล์ (ไม่ใช่ process.exit ทันที — ขั้นล้างฐานซ้อมกู้ใน finally ต้องได้ทำเสมอ)
class ไม่ผ่านแล้ว extends Error {}
const ไม่ผ่าน = (m) => { throw new ไม่ผ่านแล้ว(m); };
const รัน = (cmd, a, opt = {}) => spawnSync(cmd, a, { encoding: "utf8", shell: process.platform === "win32", maxBuffer: 1 << 30, ...opt });
const psql = (container, sqlText, flags = ["-X", "-A", "-t"]) =>
  รัน("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", ...flags], { input: sqlText, shell: false });
const ค่าแรก = (out) => { const j = JSON.parse(out); const v = Object.values(j.rows?.[0] ?? {})[0]; return typeof v === "string" ? JSON.parse(v) : v; };

try {
const ล็อก = ขอล็อก(target === "prod" ? "สำรองฐานจริง + ซ้อมกู้" : "สำรองฐานทดสอบ + ซ้อมกู้ (ทดสอบเครื่องมือ)");
process.env.PMS_PROD_LOCK_HELD = ล็อก.token;

// ── 0. ปลายทางถูกตัว ──
let ต้นทางเลือก;
if (target === "prod") {
  const { ref } = loadTarget({ quiet: true });
  const ผูก = existsSync(path.join(OPS, "supabase/.temp/project-ref")) ? readFileSync(path.join(OPS, "supabase/.temp/project-ref"), "utf8").trim() : "";
  if (!ref || ผูก !== ref) ไม่ผ่าน(`โฟลเดอร์ ${OPS} ไม่ได้ผูกฐานจริง (ผูกอยู่: ${ผูก || "ไม่มี"})`);
  ต้นทางเลือก = ["--linked"];
} else {
  ต้นทางเลือก = ["--db-url", LOCAL_DB];
}
if (existsSync(D)) ไม่ผ่าน(`มีโฟลเดอร์อยู่แล้ว: ${D}`);
mkdirSync(D, { recursive: true });
console.log(`🗄️  สำรอง${target === "prod" ? "ฐานจริง" : "ฐานทดสอบในเครื่อง"} → ${D}`);

// ── 1. ดึงไฟล์สำรอง 5 ชุด ──
const ชุด = [
  ["1-schema.sql", []],
  // ฐานทดสอบในเครื่องใช้ระบบล็อกอินรุ่นใหม่กว่าฐานซ้อมกู้ (auth.one_time_tokens คอลัมน์ไม่ตรง) — ตัดตารางรหัสชั่วคราวนี้ออกเฉพาะตอนทดสอบ
  //   ไม่อยู่ในรายการเทียบอยู่แล้ว · ฐานจริงสำรองครบทุกตารางเหมือนเดิม (กู้ลงฐานซ้อมกู้ผ่าน 20 ต.ค. 69)
  ["2-data.sql", ["--data-only", ...(target === "local" ? ["-x", "auth.one_time_tokens"] : [])]],
  ["3-auth-data.sql", ["--data-only", "--schema", "auth"]],
  ["4-migration-history.sql", ["--data-only", "--schema", "supabase_migrations"]],
  ["4a-migration-history-schema.sql", ["--schema", "supabase_migrations"]],
];
for (const [f, extra] of ชุด) {
  const r = รัน("npx", ["supabase", "db", "dump", ...ต้นทางเลือก, ...extra, "-f", path.join(D, f)], { cwd: target === "prod" ? OPS : REPO });
  const ขนาด = existsSync(path.join(D, f)) ? statSync(path.join(D, f)).size : 0;
  if (r.status !== 0 || ขนาด <= 100) {
    const ข้อความ = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
    const ชน = /deadlock detected/i.test(ข้อความ) ? " (ชนกับงานอื่นที่กำลังแก้ฐานพร้อมกัน — deadlock)" : "";
    writeFileSync(path.join(D, ".dump.log"), ข้อความ);
    ไม่ผ่าน(`ดึงไฟล์สำรอง ${f} ไม่สำเร็จ${ชน} · รายละเอียด ${path.join(D, ".dump.log")}`);
  }
}

// ── 2. นับต้นทาง ──
const นับต้นทาง = (sqlFile) => {
  if (target === "prod") {
    const r = รัน("npx", ["supabase", "db", "query", "--linked", "-f", sqlFile, "--output-format", "json"], { cwd: OPS });
    if (r.status !== 0) ไม่ผ่าน(`นับแถวฐานจริงไม่สำเร็จ: ${(r.stderr || r.stdout).slice(-300)}`);
    return ค่าแรก(r.stdout);
  }
  const r = psql(LOCAL_CONTAINER, readFileSync(sqlFile, "utf8"));
  if (r.status !== 0) ไม่ผ่าน(`นับแถวฐานทดสอบไม่สำเร็จ: ${r.stderr.slice(-300)}`);
  return JSON.parse(r.stdout.trim());
};
const นับก่อน = นับต้นทาง(SQL_COUNT), ตัวนับก่อน = นับต้นทาง(SQL_SEQ);
writeFileSync(path.join(D, "0-counts.json"), JSON.stringify(นับก่อน));
writeFileSync(path.join(D, "0-seq.json"), JSON.stringify(ตัวนับก่อน));

// ── 3. ฐานเปล่าสำหรับซ้อมกู้ (เปิดเองถ้ายังไม่เปิด แล้วปิดคืน) ──
const projectId = (readFileSync(path.join(RESTORE, "supabase/config.toml"), "utf8").match(/^project_id\s*=\s*"([^"]+)"/m) ?? [])[1];
if (!projectId) ไม่ผ่าน(`อ่าน project_id ของฐานซ้อมกู้ไม่ได้ (${RESTORE})`);
const BLANK = `supabase_db_${projectId}`;
if (BLANK === LOCAL_CONTAINER) ไม่ผ่าน("ฐานซ้อมกู้ต้องไม่ใช่ฐานทดสอบตัวเดียวกับต้นทาง");
const เปิดอยู่ = รัน("docker", ["ps", "--format", "{{.Names}}"], { shell: false }).stdout.split(/\r?\n/).includes(BLANK);
if (!เปิดอยู่) {
  console.log(`   เปิดฐานซ้อมกู้ (${projectId}) …`);
  const r = รัน("npx", ["supabase", "start", "--workdir", RESTORE, "-x", "studio,imgproxy,edge-runtime,logflare,vector,inbucket,postgres-meta,pooler"], { cwd: REPO });
  if (r.status !== 0) ไม่ผ่าน(`เปิดฐานซ้อมกู้ไม่สำเร็จ: ${(r.stderr || r.stdout).slice(-300)}`);
}
const ปิดฐานซ้อมกู้ = () => { if (!เปิดอยู่) รัน("npx", ["supabase", "stop", "--workdir", RESTORE], { cwd: REPO }); };

try {
  const ล้าง = รัน("npx", ["supabase", "db", "reset", "--workdir", RESTORE], { cwd: REPO });
  if (ล้าง.status !== 0) {
    const ท้าย = `${ล้าง.stdout ?? ""}\n${ล้าง.stderr ?? ""}`.trim().split(/\r?\n/).slice(-3).join(" | ");
    ไม่ผ่าน(`ล้างฐานซ้อมกู้ไม่สำเร็จ: ${ท้าย}`);
  }

  // ── 4. กู้ ──
  for (const f of ["1-schema.sql", "4a-migration-history-schema.sql", "4-migration-history.sql", "2-data.sql"]) {
    const r = psql(BLANK, readFileSync(path.join(D, f), "utf8"), ["-X", "-q", "-v", "ON_ERROR_STOP=1"]);
    const ผิด = `${r.stdout}\n${r.stderr}`.split(/\r?\n/).filter(l => /error|fatal/i.test(l)).slice(0, 2).join(" | ");
    if (r.status !== 0 || ผิด) ไม่ผ่าน(`กู้ไฟล์ ${f} ไม่สำเร็จ: ${ผิด || r.status}`);
  }
  if (process.env.PMS_DRILL_SABOTAGE === "1") {
    // ข้ามกฎเชื่อมตาราง/ตัวดัก (replica) ให้ลบได้จริง · ต้องลบได้ 1 แถว ไม่งั้นการจำลองไม่มีผล ข้อทดสอบจะหลอกตัวเอง
    const r = psql(BLANK, "set session_replication_role = replica; delete from public.th_provinces where ctid = (select ctid from public.th_provinces limit 1);", ["-X"]);
    if (!/DELETE 1/.test(r.stdout)) throw new Error(`จำลองการกู้ไม่ครบไม่สำเร็จ: ${r.stdout} ${r.stderr}`);
    console.log("   (ข้อทดสอบ) ลบ 1 แถวในฐานที่กู้ เพื่อจำลองการกู้ที่ไม่ครบ");
  }

  // ── 5. เทียบ ──
  const นับหลัง = JSON.parse(psql(BLANK, readFileSync(SQL_COUNT, "utf8")).stdout.trim());
  const ตัวนับหลัง = JSON.parse(psql(BLANK, readFileSync(SQL_SEQ, "utf8")).stdout.trim());
  const ตาราง = [...new Set([...Object.keys(นับก่อน), ...Object.keys(นับหลัง)])];
  const แถวไม่ตรง = ตาราง.filter(k => Number(นับก่อน[k]) !== Number(นับหลัง[k]));
  const ตัวนับไม่ตรง = Object.keys(ตัวนับก่อน.seqs ?? {}).filter(k => String(ตัวนับก่อน.seqs[k]) !== String(ตัวนับหลัง.seqs?.[k]));
  console.log(`   ตาราง ${ตาราง.length} · แถวไม่ตรง ${แถวไม่ตรง.length} · ที่เก็บไฟล์ ${ตัวนับก่อน.buckets}/${ตัวนับหลัง.buckets} · ไฟล์ ${ตัวนับก่อน.objects}/${ตัวนับหลัง.objects} · ตัวนับเลขต่าง ${ตัวนับไม่ตรง.length}`);
  const ปัญหา = [
    ...แถวไม่ตรง.map(k => `ตาราง ${k}: ต้นทาง ${นับก่อน[k] ?? "ไม่มี"} แถว · กู้ได้ ${นับหลัง[k] ?? "ไม่มี"} แถว`),
    ...ตัวนับไม่ตรง.map(k => `ตัวนับเลข ${k}: ต้นทาง ${ตัวนับก่อน.seqs[k]} · กู้ได้ ${ตัวนับหลัง.seqs?.[k]}`),
    ...(ตัวนับก่อน.buckets !== ตัวนับหลัง.buckets ? [`ที่เก็บไฟล์: ต้นทาง ${ตัวนับก่อน.buckets} · กู้ได้ ${ตัวนับหลัง.buckets}`] : []),
    ...(ตัวนับก่อน.objects !== ตัวนับหลัง.objects ? [`ไฟล์ในที่เก็บ: ต้นทาง ${ตัวนับก่อน.objects} · กู้ได้ ${ตัวนับหลัง.objects}`] : []),
  ];
  if (ปัญหา.length) {
    writeFileSync(path.join(D, "ไม่ผ่าน.txt"), ปัญหา.join("\n"));
    for (const p of ปัญหา.slice(0, 10)) console.error(`   ✗ ${p}`);
    ไม่ผ่าน(`ซ้อมกู้แล้วข้อมูลไม่ครบ ${ปัญหา.length} จุด (รายการเต็ม ${path.join(D, "ไม่ผ่าน.txt")})`);
  }
} finally {
  // ฐานซ้อมกู้มีข้อมูลจริงของลูกค้า — ล้างทิ้งเสมอ ไม่ว่าผ่านหรือไม่
  const r = รัน("node", ["scripts/reset-test-db.mjs", "--workdir", RESTORE], { cwd: REPO });
  if (r.status !== 0) console.error("⚠️ คืนฐานซ้อมกู้เป็นข้อมูลตั้งต้นไม่สำเร็จ — ข้อมูลจริงอาจค้างในเครื่อง ตรวจด้วยมือ");
  ปิดฐานซ้อมกู้();
}
writeFileSync(path.join(D, "ผ่าน.txt"), new Date().toISOString());
console.log(`✅ ผ่าน — สำรองและซ้อมกู้ครบ · ${D}`);
} catch (e) {
  if (!(e instanceof ไม่ผ่านแล้ว)) throw e;
  console.error(`❌ ไม่ผ่าน — ${e.message}`);
  console.error("   ห้ามเขียนฐานจริงต่อจนกว่าจะสำรองและซ้อมกู้ผ่าน");
  process.exitCode = 1;
}
