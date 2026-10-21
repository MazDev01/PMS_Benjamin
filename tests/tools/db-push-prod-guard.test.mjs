// ── ข้อทดสอบตัวเครื่องมือ db-push-prod (บอสสั่ง 20 ต.ค. 69) — ฐานในเครื่องเท่านั้น ไม่แตะฐานจริง ───────────────────────────
//   A) รันซ้อนกัน: มีงานอื่นถือล็อกอยู่ (โปรเซสที่ยังทำงาน) → db-push-prod และตัวสำรองต้องหยุดทันที (exit 3) บอกว่ารออะไร · ไม่ถึงขั้นลงใบ
//   B) ซ้อมกู้ไม่ผ่าน (PMS_DRILL_SABOTAGE ลบ 1 แถวในฐานที่กู้) → ต้องไม่ถึงขั้นลงใบ · บอกเหตุผลภาษาไทยว่าตารางไหนไม่ตรง
//   C) กรณีปกติ (ตัวคุม): สำรอง + ซ้อมกู้ผ่าน → ถึงขั้นลงใบ — พิสูจน์ว่า B ตกเพราะการซ้อมกู้ ไม่ใช่เพราะอย่างอื่น
//   ล็อกค้างของโปรเซสที่ตายแล้ว (ต้องเก็บกวาดแล้วไปต่อ) ตรวจที่ tests/unit/prodLock.test.ts
// รัน: npm run test:push-guard   (ต้องมี Docker + ฐานทดสอบ pms-dbcheck · ฐานซ้อมกู้ pms-blank ตัวสคริปต์เปิด/ปิดเอง)
import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { บันทึกเมื่อผ่าน } from "../../scripts/lib/migrationGate.mjs";
import os from "node:os";
import path from "node:path";

const tmp = mkdtempSync(path.join(os.tmpdir(), "pms-push-guard-"));
const LOCK = path.join(tmp, "prod.lock"), MARK = path.join(tmp, "marker.txt"), ROOT = path.join(tmp, "backups");
// บันทึก "ผ่านรอบตรวจเต็ม" ของใบปัจจุบันทุกใบ (แทนผลรอบตรวจจริง) — ข้อ A–F วัดเรื่องอื่น ต้องผ่านด่านใบก่อน (G–H วัดด่านนี้)
const RECORD = path.join(tmp, "gate-passed.json");
บันทึกเมื่อผ่าน({ ตก: 0, ตัวตรวจ: 0, dir: "supabase/migrations", record: RECORD, ป้าย: "ทดสอบเครื่องมือ" });
const base = { ...process.env, PMS_PUSH_TEST: "1", PMS_PROD_LOCK: LOCK, PMS_PUSH_TEST_MARKER: MARK, PMS_BACKUP_ROOT: ROOT, PMS_GATE_RECORD: RECORD };
delete base.PMS_PROD_LOCK_HELD; delete base.PMS_DRILL_SABOTAGE; delete base.PMS_FAKE_EMPTY; delete base.PMS_MIGRATIONS_DIR;
const รัน = (file, extraEnv = {}, a = []) => {
  const r = spawnSync("node", [file, ...a], { env: { ...base, ...extraEnv }, encoding: "utf8", maxBuffer: 1 << 28 });
  return { code: r.status, out: `${r.stdout}\n${r.stderr}` };
};
let ตก = 0;
const ผล = (ok, m, extra = "") => { if (!ok) ตก++; console.log(`${ok ? "✓" : "✗"} ${m}${!ok && extra ? `\n    ${extra.slice(-600).replace(/\n/g, "\n    ")}` : ""}`); };

// ── A) รันซ้อนกัน ──
{
  const ค้าง = spawn(process.execPath, ["-e", "setTimeout(()=>{}, 600000)"], { stdio: "ignore" });
  writeFileSync(LOCK, JSON.stringify({ token: "ทดสอบ", pid: ค้าง.pid, งาน: "สำรองฐานจริง + ซ้อมกู้", เริ่ม: new Date().toISOString() }));
  rmSync(MARK, { force: true });
  const p = รัน("scripts/db-push-prod.mjs");
  ผล(p.code === 3, `A1 db:push ตัวที่สองหยุดทันที (exit ${p.code})`, p.out);
  ผล(/มีงานอื่นกำลังแตะฐานจริงอยู่/.test(p.out) && /สำรองฐานจริง \+ ซ้อมกู้/.test(p.out), "A2 บอกว่ารองานอะไรอยู่", p.out);
  ผล(!existsSync(MARK), "A3 ไม่ถึงขั้นลงใบ");
  const b = รัน("scripts/prod-backup-verify.mjs", {}, ["--target", "local", "zz-ซ้อน"]);
  ผล(b.code === 3 && !existsSync(path.join(ROOT, "zz-ซ้อน")), `A4 ตัวสำรองที่มาทีหลังก็หยุด ไม่เริ่มสำรอง (exit ${b.code})`, b.out);
  ผล(existsSync(LOCK) && JSON.parse(readFileSync(LOCK, "utf8")).token === "ทดสอบ", "A5 ไม่ไปลบล็อกของงานที่กำลังรันอยู่");
  ค้าง.kill();
  rmSync(LOCK, { force: true });
}

// ── B) ซ้อมกู้ไม่ผ่าน → ไม่ลงใบ ──
{
  rmSync(MARK, { force: true });
  const p = รัน("scripts/db-push-prod.mjs", { PMS_DRILL_SABOTAGE: "1" });
  ผล(p.code !== 0, `B1 db:push จบแบบไม่สำเร็จ (exit ${p.code})`, p.out);
  ผล(!existsSync(MARK), "B2 ไม่ถึงขั้นลงใบ", p.out);
  ผล(/ซ้อมกู้แล้วข้อมูลไม่ครบ/.test(p.out) && /ตาราง th_provinces/.test(p.out) && /ไม่ลงใบ/.test(p.out), "B3 บอกเหตุผลภาษาไทย: ตารางไหนไม่ตรง และไม่ลงใบ", p.out);
  ผล(!existsSync(LOCK), "B4 ปล่อยล็อกแล้ว");
}

// ── C) กรณีปกติ ──
{
  rmSync(MARK, { force: true });
  const p = รัน("scripts/db-push-prod.mjs");
  ผล(p.code === 0 && existsSync(MARK), `C1 สำรอง + ซ้อมกู้ผ่าน → ถึงขั้นลงใบ (exit ${p.code})`, p.out);
  ผล(/✅ ผ่าน — สำรองและซ้อมกู้ครบ/.test(p.out), "C2 บอกว่าสำรองและซ้อมกู้ผ่าน", p.out);
  ผล(!existsSync(LOCK), "C3 ปล่อยล็อกแล้ว");
}

// ── D) คำสั่ง dump คืนไฟล์ว่าง → หยุดพร้อมข้อความภาษาไทยที่บอกขั้น · ไม่ขึ้น stack trace · ไม่ถึงขั้นลงใบ ──
//   (เหตุจริง 20 ต.ค. 69 15:59: ผลของคำสั่งภายนอกผิดรูป แล้วถูกส่งต่อเป็น undefined → TypeError ของ Node ขึ้นจอ)
const ไม่มีstack = (out) => !/TypeError|SyntaxError|ReferenceError|\n\s+at (file:|node:|.*\.m?js:\d+)/.test(out);
{
  rmSync(MARK, { force: true });
  const p = รัน("scripts/db-push-prod.mjs", { PMS_FAKE_EMPTY: "dump" });
  ผล(p.code !== 0 && !existsSync(MARK), `D1 dump ได้ไฟล์ว่าง → ไม่ลงใบ (exit ${p.code})`, p.out);
  ผล(/ขั้น "ดึงไฟล์สำรอง 2-data\.sql" ล้ม — ได้ไฟล์ว่างหรือเล็กผิดปกติ/.test(p.out), "D2 บอกเป็นภาษาไทยว่าขั้นไหนล้มและเพราะอะไร", p.out);
  ผล(ไม่มีstack(p.out), "D3 ไม่มี stack trace ของ Node", p.out);
  ผล(!existsSync(LOCK), "D4 ปล่อยล็อกแล้ว");
}

// ── E) คำสั่งนับแถวคืนผลว่าง (จุดที่ล้มจริง) → หยุดพร้อมข้อความภาษาไทย · ไม่มี stack trace ──
{
  rmSync(MARK, { force: true });
  const p = รัน("scripts/db-push-prod.mjs", { PMS_FAKE_EMPTY: "นับแถวทุกตารางของต้นทาง" });
  ผล(p.code !== 0 && !existsSync(MARK), `E1 นับแถวได้ผลว่าง → ไม่ลงใบ (exit ${p.code})`, p.out);
  ผล(/ขั้น "นับแถวทุกตารางของต้นทาง" ล้ม — คำสั่งสำเร็จแต่ไม่ได้ผลลัพธ์กลับมาเลย/.test(p.out), "E2 บอกเป็นภาษาไทยว่าขั้นไหนล้มและเพราะอะไร", p.out);
  ผล(ไม่มีstack(p.out), "E3 ไม่มี stack trace ของ Node", p.out);
}

// ── F) ชื่อโฟลเดอร์สำรองที่ db-push ตั้งให้ต้องไปถึงตัวสำรอง (ตรวจปลายทางรวม · ต้นเหตุที่ชื่อหายในโหมดฐานจริงพิสูจน์ที่ tests/unit/backupArgs.test.ts) ──
{
  const ชื่อ = readdirSync(ROOT);
  ผล(ชื่อ.some(n => n.endsWith("-ก่อน-db-push")) && !ชื่อ.some(n => /-(local|prod)$/.test(n)), `F1 โฟลเดอร์สำรองชื่อตามที่ db-push ตั้ง (${ชื่อ.join(", ")})`);
}

// ── G–H) ใบปรับฐานต้องผ่านรอบตรวจเต็มก่อนลง (บอสสั่ง 21 ต.ค. 69 · เหตุครั้งที่ 2: ใบ 0230 ลงฐานจริงก่อนรอบตรวจเต็มผ่าน) ──
//   หยุดก่อนสำรอง/ก่อนแตะฐาน · ไม่ถึงขั้นลงใบ · บอกเป็นภาษาไทยว่าใบไหนยังไม่ผ่าน · กรณีผ่านครบ = ข้อ C (ไปถึงขั้นลงใบ)
const ใบชุดทดลอง = (แก้) => {
  const d = path.join(tmp, `migrations-${Math.random().toString(36).slice(2, 8)}`);
  cpSync("supabase/migrations", d, { recursive: true });
  แก้(d);
  return d;
};
const ล่าสุด = readdirSync("supabase/migrations").filter(n => n.endsWith(".sql")).sort().at(-1);
for (const [ป้าย, แก้, ใบ, ข้อความ] of [
  ["G ใบใหม่ที่ยังไม่ผ่านรอบตรวจ", d => writeFileSync(path.join(d, "9999_zz_new.sql"), "select 1;\n"), "9999", /ใบ 9999 ยังไม่ผ่านรอบตรวจเต็ม รอให้ผ่านก่อน/],
  ["H แก้ใบหลังรอบตรวจผ่าน", d => appendFileSync(path.join(d, ล่าสุด), "\n-- แก้ทีหลัง\n"), ล่าสุด.split("_")[0],
    new RegExp(`ใบ ${ล่าสุด.split("_")[0]} ยังไม่ผ่านรอบตรวจเต็ม รอให้ผ่านก่อน \\(แก้ไฟล์หลังรอบตรวจผ่าน\\)`)],
]) {
  rmSync(MARK, { force: true });
  const ก่อน = existsSync(ROOT) ? readdirSync(ROOT).length : 0;
  const p = รัน("scripts/db-push-prod.mjs", { PMS_MIGRATIONS_DIR: ใบชุดทดลอง(แก้) });
  ผล(p.code === 4 && !existsSync(MARK), `${ป้าย[0]}1 ${ป้าย.slice(2)} → หยุด ไม่ลงใบ (exit ${p.code})`, p.out);
  ผล(ข้อความ.test(p.out), `${ป้าย[0]}2 บอกบนจอว่า "ใบ ${ใบ} ยังไม่ผ่านรอบตรวจเต็ม รอให้ผ่านก่อน"`, p.out);
  ผล((existsSync(ROOT) ? readdirSync(ROOT).length : 0) === ก่อน && !existsSync(LOCK), `${ป้าย[0]}3 หยุดก่อนเริ่มสำรอง · ไม่ค้างล็อก`);
}

rmSync(tmp, { recursive: true, force: true });
console.log(ตก ? `ตก ${ตก}` : "ผ่านทั้งหมด");
process.exitCode = ตก ? 1 : 0;
