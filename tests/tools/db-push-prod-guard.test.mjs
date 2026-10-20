// ── ข้อทดสอบตัวเครื่องมือ db-push-prod (บอสสั่ง 20 ต.ค. 69) — ฐานในเครื่องเท่านั้น ไม่แตะฐานจริง ───────────────────────────
//   A) รันซ้อนกัน: มีงานอื่นถือล็อกอยู่ (โปรเซสที่ยังทำงาน) → db-push-prod และตัวสำรองต้องหยุดทันที (exit 3) บอกว่ารออะไร · ไม่ถึงขั้นลงใบ
//   B) ซ้อมกู้ไม่ผ่าน (PMS_DRILL_SABOTAGE ลบ 1 แถวในฐานที่กู้) → ต้องไม่ถึงขั้นลงใบ · บอกเหตุผลภาษาไทยว่าตารางไหนไม่ตรง
//   C) กรณีปกติ (ตัวคุม): สำรอง + ซ้อมกู้ผ่าน → ถึงขั้นลงใบ — พิสูจน์ว่า B ตกเพราะการซ้อมกู้ ไม่ใช่เพราะอย่างอื่น
//   ล็อกค้างของโปรเซสที่ตายแล้ว (ต้องเก็บกวาดแล้วไปต่อ) ตรวจที่ tests/unit/prodLock.test.ts
// รัน: npm run test:push-guard   (ต้องมี Docker + ฐานทดสอบ pms-dbcheck · ฐานซ้อมกู้ pms-blank ตัวสคริปต์เปิด/ปิดเอง)
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = mkdtempSync(path.join(os.tmpdir(), "pms-push-guard-"));
const LOCK = path.join(tmp, "prod.lock"), MARK = path.join(tmp, "marker.txt"), ROOT = path.join(tmp, "backups");
const base = { ...process.env, PMS_PUSH_TEST: "1", PMS_PROD_LOCK: LOCK, PMS_PUSH_TEST_MARKER: MARK, PMS_BACKUP_ROOT: ROOT };
delete base.PMS_PROD_LOCK_HELD; delete base.PMS_DRILL_SABOTAGE;
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

rmSync(tmp, { recursive: true, force: true });
console.log(ตก ? `ตก ${ตก}` : "ผ่านทั้งหมด");
process.exitCode = ตก ? 1 : 0;
