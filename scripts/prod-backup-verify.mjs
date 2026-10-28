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
//   PMS_FAKE_EMPTY=<ขั้น>   ข้อทดสอบเท่านั้น (--target local): จำลองคำสั่งของขั้นนั้นคืนผลว่าง (dump = ไฟล์สำรอง 2-data.sql ว่าง)
//   PMS_DRILL_SABOTAGE=1   ข้อทดสอบเท่านั้น (ใช้ได้กับ --target local เท่านั้น): ลบ 1 แถวในฐานที่กู้ ก่อนเทียบ → ต้องไม่ผ่าน
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ขอล็อก } from "./lib/prodLock.mjs";
import { loadTarget } from "./lib/targetEnv.mjs";
import { อ่านคำสั่งสำรอง } from "./lib/backupArgs.mjs";
import { ขอล็อกฐานทดสอบ } from "./lib/testDbLock.mjs";
import { อาร์กิวเมนต์psql } from "./lib/testDbGuard.mjs";
import { บันทึกผลซ้อมกู้ } from "./lib/prodBackupMark.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { target, ชื่อ } = อ่านคำสั่งสำรอง(process.argv.slice(2));
if (!["prod", "local"].includes(target)) { console.error("ใช้: node scripts/prod-backup-verify.mjs [--target prod|local] [ชื่อโฟลเดอร์]"); process.exit(2); }
if (process.env.PMS_FAKE_EMPTY && target !== "local") { console.error("⛔ PMS_FAKE_EMPTY ใช้ได้กับ --target local เท่านั้น"); process.exit(2); }
if (process.env.PMS_DRILL_SABOTAGE === "1" && target !== "local") { console.error("⛔ PMS_DRILL_SABOTAGE ใช้ได้กับ --target local เท่านั้น"); process.exit(2); }

const OPS = process.env.PMS_PROD_OPS_DIR || "C:/.claude/pms-prod-ops";
const RESTORE = process.env.PMS_RESTORE_WORKDIR || "C:/.claude/pms-restore-check";
const ROOT = process.env.PMS_BACKUP_ROOT || "C:/.claude/pms-prod-backups";
// ฐานทดสอบ pms-dbcheck — ต้นทางของ --target local · บัญชีเขียนของผู้ถือล็อก (ฐานทดสอบปิดบัญชีอื่นแล้ว · testDbGuard.mjs)
const LOCAL_DB = () => `postgresql://pms_writer:${encodeURIComponent(process.env.PMS_TESTDB_PG_PASSWORD ?? "")}@127.0.0.1:55322/postgres`;
const LOCAL_CONTAINER = "supabase_db_pms-dbcheck";
const SQL_COUNT = path.join(REPO, "scripts/sql/prod-count-all.sql");
const SQL_SEQ = path.join(REPO, "scripts/sql/prod-seq-check.sql");
const D = path.join(ROOT, ชื่อ);

// ผลกลางของฐานจริง (scripts/lib/prodBackupMark.mjs · บอสสั่ง 28 ต.ค. 69): เริ่มรอบ = "ไม่ผ่าน · กำลังสำรอง" ก่อนทำอะไร
//   ผลผ่านของรอบก่อนใช้ไม่ได้ทันที — รอบนี้ล้มกลางทาง สคริปต์ที่เขียนฐานจริง (prod-live) ต้องไม่รัน
const บันทึกผล = (ผ่าน, เหตุ = "") => { if (target === "prod") บันทึกผลซ้อมกู้({ ผ่าน, ชุด: ชื่อ, เหตุ }); };
บันทึกผล(false, "กำลังสำรอง");

// ไม่ผ่าน = โยนออกไปจบที่ท้ายไฟล์ (ไม่ใช่ process.exit ทันที — ขั้นล้างฐานซ้อมกู้ใน finally ต้องได้ทำเสมอ)
class ไม่ผ่านแล้ว extends Error {}
const ไม่ผ่าน = (m) => { throw new ไม่ผ่านแล้ว(m); };
const รัน = (cmd, a, opt = {}) => spawnSync(cmd, a, { encoding: "utf8", shell: process.platform === "win32", maxBuffer: 1 << 30, ...opt });
const psql = (container, sqlText, flags = ["-X", "-A", "-t"]) =>
  รัน("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", ...flags], { input: sqlText, shell: false });
// ── ทุกคำสั่งภายนอกต้องถูกตรวจก่อนใช้ผล (เหตุจริง 20 ต.ค. 69 15:59: บอสรัน db:push แล้วล้มด้วย TypeError ของ Node
//    เพราะผลนับแถวที่ได้กลับมาไม่ใช่รูปที่คาด แล้วถูกส่งต่อเป็น undefined) ──────────────────────────────────────
//   ล้ม / หาโปรแกรมไม่เจอ / ได้ผลว่าง / ได้ผลผิดรูป → หยุดพร้อมบอก "ขั้นไหน · เพราะอะไร" เป็นภาษาไทย และเก็บผลดิบไว้ในโฟลเดอร์สำรอง
let ขั้นปัจจุบัน = "เริ่มต้น";
const ขั้น = (ชื่อ) => { ขั้นปัจจุบัน = ชื่อ; };
const บันทึกผลดิบ = (ไฟล์, r) => {
  try { if (existsSync(D)) writeFileSync(path.join(D, ไฟล์), `status=${r?.status} error=${r?.error?.message ?? "-"}
--- stdout ---
${r?.stdout ?? ""}
--- stderr ---
${r?.stderr ?? ""}`); } catch { /* เก็บไม่ได้ก็ไม่ทับข้อความหลัก */ }
  return existsSync(D) ? ` · ผลดิบ ${path.join(D, ไฟล์)}` : "";
};
/** รันแล้วตรวจ: ล้ม/หาโปรแกรมไม่เจอ = หยุด · ต้องการผล (ต้องมีผล) แต่ได้ว่าง = หยุด */
const รันตรวจ = (ชื่อขั้น, cmd, a, opt = {}, { ต้องมีผล = false, ไฟล์ผลดิบ = ".cmd.log" } = {}) => {
  const r = รัน(cmd, a, opt);
  const ปลอมว่าง = process.env.PMS_FAKE_EMPTY === ชื่อขั้น;   // ทดสอบเครื่องมือเท่านั้น (ใช้ได้กับ --target local) — จำลองคำสั่งคืนผลว่าง
  if (ปลอมว่าง) r.stdout = "";
  if (r.error) ไม่ผ่าน(`ขั้น "${ชื่อขั้น}" ล้ม — เรียกโปรแกรม ${cmd} ไม่ได้ (${r.error.code ?? r.error.message})${บันทึกผลดิบ(ไฟล์ผลดิบ, r)}`);
  if (r.status !== 0) ไม่ผ่าน(`ขั้น "${ชื่อขั้น}" ล้ม — คำสั่งจบด้วยรหัส ${r.status}: ${String(r.stderr || r.stdout || "").trim().split(/\r?\n/).slice(-2).join(" | ").slice(0, 300)}${บันทึกผลดิบ(ไฟล์ผลดิบ, r)}`);
  if (ต้องมีผล && !String(r.stdout ?? "").trim()) ไม่ผ่าน(`ขั้น "${ชื่อขั้น}" ล้ม — คำสั่งสำเร็จแต่ไม่ได้ผลลัพธ์กลับมาเลย (ว่าง)${บันทึกผลดิบ(ไฟล์ผลดิบ, r)}`);
  return r;
};
/** ผลของ supabase db query --output-format json → ค่าแรกของแถวแรก · ผิดรูป = หยุดพร้อมบอกว่าเจออะไร */
const ค่าแรก = (ชื่อขั้น, r) => {
  let j;
  try { j = JSON.parse(r.stdout); }
  catch { ไม่ผ่าน(`ขั้น "${ชื่อขั้น}" ล้ม — ผลที่ได้ไม่ใช่ JSON (ขึ้นต้นด้วย: ${JSON.stringify(String(r.stdout).trim().slice(0, 60))})${บันทึกผลดิบ(".count.log", r)}`); }
  const แถว = Array.isArray(j) ? j : j?.rows;
  if (!Array.isArray(แถว) || !แถว.length) ไม่ผ่าน(`ขั้น "${ชื่อขั้น}" ล้ม — ผลไม่มีแถวข้อมูล (ได้คีย์: ${j && typeof j === "object" ? Object.keys(j).join(", ") || "ไม่มี" : typeof j})${บันทึกผลดิบ(".count.log", r)}`);
  const v = Object.values(แถว[0] ?? {})[0];
  const ค่า = typeof v === "string" ? (() => { try { return JSON.parse(v); } catch { return undefined; } })() : v;
  if (!ค่า || typeof ค่า !== "object") ไม่ผ่าน(`ขั้น "${ชื่อขั้น}" ล้ม — แถวแรกไม่มีผลนับที่ใช้ได้${บันทึกผลดิบ(".count.log", r)}`);
  return ค่า;
};

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
  ขอล็อกฐานทดสอบ("สำรองฐานทดสอบ + ซ้อมกู้ (ทดสอบเครื่องมือ)", { รอนาที: Number(process.env.PMS_TESTDB_LOCK_WAIT || 0) });
  ต้นทางเลือก = ["--db-url", LOCAL_DB()];
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
  ขั้น(`ดึงไฟล์สำรอง ${f}`);
  const r = รัน("npx", ["supabase", "db", "dump", ...ต้นทางเลือก, ...extra, "-f", path.join(D, f)], { cwd: target === "prod" ? OPS : REPO });
  if (process.env.PMS_FAKE_EMPTY === "dump" && f === "2-data.sql") writeFileSync(path.join(D, f), "");   // ทดสอบเครื่องมือ: จำลองไฟล์สำรองว่าง
  if (r.error) ไม่ผ่าน(`ขั้น "ดึงไฟล์สำรอง ${f}" ล้ม — เรียกโปรแกรม npx ไม่ได้ (${r.error.code ?? r.error.message})`);
  const ขนาด = existsSync(path.join(D, f)) ? statSync(path.join(D, f)).size : 0;
  if (r.status !== 0 || ขนาด <= 100) {
    const ข้อความ = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
    const ชน = /deadlock detected/i.test(ข้อความ) ? " (ชนกับงานอื่นที่กำลังแก้ฐานพร้อมกัน — deadlock)" : "";
    writeFileSync(path.join(D, ".dump.log"), ข้อความ);
    ไม่ผ่าน(`ขั้น "ดึงไฟล์สำรอง ${f}" ล้ม — ${r.status !== 0 ? `คำสั่งจบด้วยรหัส ${r.status}` : `ได้ไฟล์ว่างหรือเล็กผิดปกติ (${ขนาด} ไบต์)`}${ชน} · รายละเอียด ${path.join(D, ".dump.log")}`);
  }
}

// ── 2. นับต้นทาง ──
const นับต้นทาง = (sqlFile, ชื่อขั้น) => {
  ขั้น(ชื่อขั้น);
  if (target === "prod") {
    const r = รันตรวจ(ชื่อขั้น, "npx", ["supabase", "db", "query", "--linked", "-f", sqlFile, "--output-format", "json"], { cwd: OPS }, { ต้องมีผล: true, ไฟล์ผลดิบ: ".count.log" });
    return ค่าแรก(ชื่อขั้น, r);
  }
  const r = รันตรวจ(ชื่อขั้น, "docker", [...อาร์กิวเมนต์psql(LOCAL_CONTAINER, { เขียน: false }), "-X", "-A", "-t"],
    { input: readFileSync(sqlFile, "utf8"), shell: false }, { ต้องมีผล: true, ไฟล์ผลดิบ: ".count.log" });
  try { const ค่า = JSON.parse(r.stdout.trim()); if (ค่า && typeof ค่า === "object") return ค่า; } catch { /* ด้านล่าง */ }
  return ไม่ผ่าน(`ขั้น "${ชื่อขั้น}" ล้ม — ผลนับไม่ใช่ JSON ที่ใช้ได้${บันทึกผลดิบ(".count.log", r)}`);
};
const นับก่อน = นับต้นทาง(SQL_COUNT, "นับแถวทุกตารางของต้นทาง"), ตัวนับก่อน = นับต้นทาง(SQL_SEQ, "อ่านตัวนับเลขและที่เก็บไฟล์ของต้นทาง");
ขั้น("ซ้อมกู้ลงฐานเปล่า");
writeFileSync(path.join(D, "0-counts.json"), JSON.stringify(นับก่อน));
writeFileSync(path.join(D, "0-seq.json"), JSON.stringify(ตัวนับก่อน));

// ── 3. ฐานเปล่าสำหรับซ้อมกู้ (เปิดเองถ้ายังไม่เปิด แล้วปิดคืน) ──
const projectId = (readFileSync(path.join(RESTORE, "supabase/config.toml"), "utf8").match(/^project_id\s*=\s*"([^"]+)"/m) ?? [])[1];
if (!projectId) ไม่ผ่าน(`อ่าน project_id ของฐานซ้อมกู้ไม่ได้ (${RESTORE})`);
const BLANK = `supabase_db_${projectId}`;
if (BLANK === LOCAL_CONTAINER) ไม่ผ่าน("ฐานซ้อมกู้ต้องไม่ใช่ฐานทดสอบตัวเดียวกับต้นทาง");
ขั้น("ตรวจว่าฐานซ้อมกู้เปิดอยู่ไหม");
const เปิดอยู่ = รันตรวจ("ตรวจว่าฐานซ้อมกู้เปิดอยู่ไหม", "docker", ["ps", "--format", "{{.Names}}"], { shell: false }).stdout.split(/\r?\n/).includes(BLANK);
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
  // นับฐานที่กู้ — ตรวจผลก่อนใช้เหมือนฝั่งต้นทาง
  const นับในฐานกู้ = (sqlFile, ชื่อขั้น) => {
    ขั้น(ชื่อขั้น);
    const r = รันตรวจ(ชื่อขั้น, "docker", ["exec", "-i", BLANK, "psql", "-U", "postgres", "-d", "postgres", "-X", "-A", "-t"],
      { input: readFileSync(sqlFile, "utf8"), shell: false }, { ต้องมีผล: true, ไฟล์ผลดิบ: ".restore-count.log" });
    try { const ค่า = JSON.parse(r.stdout.trim()); if (ค่า && typeof ค่า === "object") return ค่า; } catch { /* ด้านล่าง */ }
    return ไม่ผ่าน(`ขั้น "${ชื่อขั้น}" ล้ม — ผลนับไม่ใช่ JSON ที่ใช้ได้${บันทึกผลดิบ(".restore-count.log", r)}`);
  };
  const นับหลัง = นับในฐานกู้(SQL_COUNT, "นับแถวทุกตารางของฐานที่กู้");
  const ตัวนับหลัง = นับในฐานกู้(SQL_SEQ, "อ่านตัวนับเลขและที่เก็บไฟล์ของฐานที่กู้");
  ขั้น("เทียบต้นทางกับฐานที่กู้");
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
  //   เดิมใช้ reset-test-db.mjs (ล้าง + เติมข้อมูลตั้งต้นของฐานทดสอบ) — โฟลเดอร์ซ้อมกู้ไม่มีใบปรับฐาน ขั้นเติมจึงล้มทุกครั้ง
  //   แล้วขึ้นเตือน "ข้อมูลจริงอาจค้าง" ทั้งที่ขั้นล้างทำไปแล้ว (พบ 20 ต.ค. 69) → ล้างอย่างเดียว แล้วตรวจว่าว่างจริง
  const ล้างทิ้ง = รัน("npx", ["supabase", "db", "reset", "--workdir", RESTORE], { cwd: REPO });
  const ตรวจว่าง = รัน("docker", ["exec", "-i", BLANK, "psql", "-U", "postgres", "-d", "postgres", "-X", "-A", "-t", "-c",
    "select (select count(*) from auth.users) + (select count(*) from information_schema.tables where table_schema = 'public')"], { shell: false });
  const เหลือ = ตรวจว่าง.status === 0 ? Number(String(ตรวจว่าง.stdout).trim()) : NaN;
  if (ล้างทิ้ง.status !== 0 || เหลือ !== 0) {
    console.error(`⚠️ ล้างฐานซ้อมกู้ไม่สำเร็จ (ล้าง: รหัส ${ล้างทิ้ง.status} · ตรวจว่าง: ${Number.isNaN(เหลือ) ? "ตรวจไม่ได้" : `เหลือ ${เหลือ}`}) — ข้อมูลจริงอาจค้างในฐาน ${BLANK} ตรวจด้วยมือ`);
  } else console.log("   ล้างฐานซ้อมกู้แล้ว (ตรวจแล้วว่าง)");
  ปิดฐานซ้อมกู้();
}
writeFileSync(path.join(D, "ผ่าน.txt"), new Date().toISOString());
บันทึกผล(true);
console.log(`✅ ผ่าน — สำรองและซ้อมกู้ครบ · ${D}`);
} catch (e) {
  // ข้อผิดพลาดที่ไม่ได้คาดไว้ก็ต้องจบด้วยข้อความภาษาไทยที่บอกขั้น — ห้ามขึ้น stack trace ของ Node ให้ผู้ใช้เห็น (บอสสั่ง 20 ต.ค. 69)
  console.error(e instanceof ไม่ผ่านแล้ว
    ? `❌ ไม่ผ่าน — ${e.message}`
    : `❌ ไม่ผ่าน — เครื่องมือล้มที่ขั้น "${ขั้นปัจจุบัน}" (ข้อผิดพลาดภายใน: ${e?.message ?? e})`);
  console.error("   ห้ามเขียนฐานจริงต่อจนกว่าจะสำรองและซ้อมกู้ผ่าน");
  บันทึกผล(false, e instanceof ไม่ผ่านแล้ว ? e.message : `เครื่องมือล้มที่ขั้น ${ขั้นปัจจุบัน}`);
  process.exitCode = 1;
}
