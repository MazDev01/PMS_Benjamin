// ── ข้อทดสอบ: ตัวลูกปล่อยล็อกฐานทดสอบของงานแม่ไม่ได้ (รอบ deploy22 ตก 4 ข้อ · 13 พ.ย. 69 · คนรวมงานอนุมัติ) ─────────────────
//   เหตุ: ล็อกรอบตรวจเต็มถูกปล่อยกลางรอบ (15:51:17 · รอบจบ 16:24) → ขอ/ปล่อยใหม่ 24 ครั้ง สุ่มรหัส pms_writer ใหม่ทุกครั้ง
//     → ข้อที่ถือรหัสของรอบ "password authentication failed" / "read-only transaction"
//   (1) ตัวลูกเรียกคำสั่งช่วยปล่อย (testdb-lock-cli release --token <ของแม่> --key <ของแม่>) → ล็อกยังเป็นของแม่ · รหัสเขียนยังใช้ได้
//   (2) ตัวลูก import แล้วเรียก ปล่อยล็อกฐานทดสอบ(token, key) เอง → เหมือนกัน
//   (3) ตัวลูกขอล็อก (ได้ token ของแม่) แล้วเรียก release() → ไม่ปล่อย
//   (4) ตัวลูกที่ถือ token ของแม่ แต่ล็อกของแม่หายแล้ว → หยุด (exit 3) ไม่ขอล็อกใหม่ (ไฟล์ล็อกจำลอง · ไม่แตะฐาน)
//   (5) ทุกการขอปล่อยจด pid · ตัวแม่ · คำสั่ง ลงประวัติ (ไฟล์ประวัติจำลอง)
//   ตกบนโค้ดเดิม (20d6d10f): (1)(2) ล็อกถูกลบ + รหัสเขียนถูกสุ่มใหม่ · (4) ขอล็อกใหม่สำเร็จ exit 0
// ใช้ฐานทดสอบจริง (pms-dbcheck) · รันเดี่ยว = ถือล็อกเอง · ใต้รอบตรวจ = ใช้ล็อกของรอบ (ตัวแม่)
// รัน: node tests/tools/testdb-lock-release-guard.test.mjs
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { รอถ้าฐานไม่ว่าง } from "../../scripts/lib/testDbWait.mjs";
รอถ้าฐานไม่ว่าง("ข้อทดสอบตัวกันปล่อยล็อกฐานทดสอบ");

const ราก = process.cwd();
const lib = pathToFileURL(path.join(ราก, "scripts/lib/testDbLock.mjs")).href;
const cli = path.join(ราก, "scripts/testdb-lock-cli.mjs");
const { ขอล็อกฐานทดสอบ, ไฟล์ล็อกฐานทดสอบ } = await import(lib);
const { คอนเทนเนอร์ } = await import(pathToFileURL(path.join(ราก, "scripts/lib/testDbGuard.mjs")).href);

let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n   ${String(เพิ่ม).slice(0, 600)}`}`); };

const ล็อก = ขอล็อกฐานทดสอบ("ข้อทดสอบตัวกันปล่อยล็อก (ตัวแม่)", { รอนาที: 120 });
const token = process.env.PMS_TESTDB_LOCK_HELD, key = process.env.PMS_TESTDB_PG_PASSWORD;
const ของแม่ = () => { try { return JSON.parse(readFileSync(ไฟล์ล็อกฐานทดสอบ(), "utf8")).token === token; } catch { return false; } };
const เขียนได้ = () => {
  const r = spawnSync("docker", ["exec", "-i", "-e", `PGPASSWORD=${key}`, คอนเทนเนอร์, "psql", "-h", "127.0.0.1", "-U", "pms_writer", "-d", "postgres", "-At", "-c", "select 1"], { encoding: "utf8" });
  return { ได้: r.stdout.trim() === "1", ออก: (r.stderr || r.stdout).trim() };
};
// ตัวลูก = โปรเซสกลางอีกชั้น (คำสั่งช่วยที่ตัวลูกเรียก มีตัวแม่เป็นตัวลูก ไม่ใช่เจ้าของล็อก) · env ของแม่ส่งต่อทั้งหมด
const ตัวลูก = (โค้ด) => spawnSync(process.execPath, ["--input-type=module", "-e", โค้ด], { encoding: "utf8", env: process.env, cwd: ราก });
try {
  ผล(!!token && !!key && ของแม่() && เขียนได้().ได้, "ตั้งต้น: ถือล็อก · รหัสเขียนใช้ได้", JSON.stringify({ token: !!token, key: !!key, ของแม่: ของแม่(), ...เขียนได้() }));

  // (1) ตัวลูกเรียกคำสั่งช่วยปล่อยด้วย token/กุญแจของแม่
  let r = ตัวลูก(`import { spawnSync } from "node:child_process"; const r = spawnSync(process.execPath, [${JSON.stringify(cli)}, "release", "--token", process.env.PMS_TESTDB_LOCK_HELD, "--key", process.env.PMS_TESTDB_PG_PASSWORD], { encoding: "utf8" }); process.stdout.write(r.stderr || "");`);
  let w = เขียนได้();
  ผล(ของแม่() && w.ได้, "(1) ตัวลูกเรียกคำสั่งช่วยปล่อยล็อกของแม่ → ล็อกยังเป็นของแม่ · รหัสเขียนยังใช้ได้", `ของแม่=${ของแม่()} · ${w.ออก} · ${r.stdout}${r.stderr}`);

  // (2) ตัวลูกเรียก ปล่อยล็อกฐานทดสอบ() เอง
  r = ตัวลูก(`const { ปล่อยล็อกฐานทดสอบ } = await import(${JSON.stringify(lib)}); ปล่อยล็อกฐานทดสอบ(process.env.PMS_TESTDB_LOCK_HELD, process.env.PMS_TESTDB_PG_PASSWORD);`);
  w = เขียนได้();
  ผล(ของแม่() && w.ได้, "(2) ตัวลูกเรียก ปล่อยล็อกฐานทดสอบ() → ล็อกยังเป็นของแม่ · รหัสเขียนยังใช้ได้", `ของแม่=${ของแม่()} · ${w.ออก} · ${r.stderr}`);

  // (3) ตัวลูกขอล็อก (ได้ของแม่) แล้วปล่อย
  r = ตัวลูก(`const { ขอล็อกฐานทดสอบ } = await import(${JSON.stringify(lib)}); const l = ขอล็อกฐานทดสอบ("ตัวลูกของข้อทดสอบ"); l.release();`);
  w = เขียนได้();
  ผล(r.status === 0 && ของแม่() && w.ได้, "(3) ตัวลูกขอล็อก (ใช้ของแม่) แล้ว release() → ไม่ปล่อยของแม่", `exit ${r.status} · ของแม่=${ของแม่()} · ${w.ออก} · ${r.stderr}`);
} finally {
  ล็อก.release();
}

// (4)(5) ไฟล์ล็อก/ประวัติจำลอง (ไม่แตะฐาน) — ตัวลูกถือ token ของแม่ที่หายไปแล้ว
const ที่ = mkdtempSync(path.join(os.tmpdir(), "pms-lock-guard-"));
const envจำลอง = { ...process.env, PMS_TESTDB_LOCK: path.join(ที่, "lock"), PMS_TESTDB_LOCK_HISTORY: path.join(ที่, "history.jsonl"), PMS_TESTDB_LOCK_HELD: "99999-1" };
const r4 = spawnSync(process.execPath, ["--input-type=module", "-e", `const { ขอล็อกฐานทดสอบ } = await import(${JSON.stringify(lib)}); ขอล็อกฐานทดสอบ("ตัวลูกที่ล็อกแม่หายแล้ว"); console.log("ได้ล็อกใหม่");`], { encoding: "utf8", env: envจำลอง, cwd: ราก });
ผล(r4.status === 3 && !existsSync(envจำลอง.PMS_TESTDB_LOCK) && !/ได้ล็อกใหม่/.test(r4.stdout), "(4) ล็อกของแม่หายแล้ว → ตัวลูกหยุด (exit 3) ไม่ขอล็อกใหม่", `exit ${r4.status} · ไฟล์ล็อก=${existsSync(envจำลอง.PMS_TESTDB_LOCK)} · ${r4.stdout}${r4.stderr}`);
const ประวัติ = existsSync(envจำลอง.PMS_TESTDB_LOCK_HISTORY) ? readFileSync(envจำลอง.PMS_TESTDB_LOCK_HISTORY, "utf8").trim().split("\n").map(l => JSON.parse(l)) : [];
const แถว = ประวัติ.find(x => x.token === "99999-1");
ผล(!!แถว?.เตือน && Number.isInteger(แถว.pid) && Number.isInteger(แถว.ตัวแม่) && typeof แถว.คำสั่ง === "string", "(5) จดประวัติ: เตือน + pid + ตัวแม่ + คำสั่ง", JSON.stringify(ประวัติ));
rmSync(ที่, { recursive: true, force: true });

console.log(ตก ? `\n✗ ตก ${ตก} ข้อ` : "\nALL PASS");
process.exit(ตก ? 1 : 0);
