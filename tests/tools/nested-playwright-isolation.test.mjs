// ── ข้อทดสอบ: ข้อทดสอบเครื่องมือที่รัน playwright ซ้อน ต้องไม่แตะของรอบตรวจเต็ม (รอบ deploy22 ครั้งที่ 4 ล้ม 16 พ.ย. 69) ──────────
//   เหตุ: flaky-ack.test.mjs รัน `playwright test -c <ชั่วคราว>` ด้วย cwd = รากโปรเจกต์ + env ของรอบทั้งชุด
//     → playwright ซ้อนล้างโฟลเดอร์ผล test-results ของรอบ (gate-logs/_tools.log หาย → test-prodbuild ตาย ENOENT)
//     + ได้ token/รหัสเขียนฐานทดสอบของรอบ · เขียนรายงาน JSON ทับไฟล์ของรอบ (PLAYWRIGHT_JSON_OUTPUT_NAME)
//   จำลองสภาพกลางรอบ: test-results/gate-logs/<ไฟล์บันทึก> · ล็อกจำลองที่โปรเซสนี้ถือ · env ของรอบ (token · รหัส · ไฟล์รายงาน JSON · PMS_GATE_*)
//   แล้วรันข้อทดสอบเครื่องมือที่รัน playwright ซ้อน (flaky-ack · gate-rerun) → หลังจบ:
//     (1) ไฟล์บันทึกของรอบยังอยู่ (2) ล็อกยังเป็นของเดิม (3) ไม่มีโฟลเดอร์ผลของข้อปลอมใน test-results ของราก (4) ไม่เขียนทับรายงาน JSON ของรอบ
//     (5) ตัวช่วย envตัวลูกแยกจากรอบ() ตัด env ของรอบ/ล็อกครบ
//   ตกบนโค้ดเดิม c4acc41d: playwright ซ้อนของ flaky-ack ล้าง test-results ของราก
// รัน: node tests/tools/nested-playwright-isolation.test.mjs (ไม่แตะฐาน · ล็อกจำลอง)
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n   ${String(เพิ่ม).slice(-800)}`}`); };
const ราก = process.cwd();

// (5) ตัวช่วยตัด env
let ช่วย = null;
try { ช่วย = await import(pathToFileURL(path.join(ราก, "scripts/lib/childEnv.mjs")).href); } catch (e) { ผล(false, "มีตัวช่วย scripts/lib/childEnv.mjs", e.message); }
if (ช่วย) {
  const e = ช่วย.envตัวลูกแยกจากรอบ({ PATH: "x", PMS_TESTDB_LOCK_HELD: "t", PMS_TESTDB_PG_PASSWORD: "k", PMS_GATE_FULL: "1", PMS_RUN_ID: "r", PLAYWRIGHT_JSON_OUTPUT_NAME: "f", TEST_WORKER_INDEX: "0", PMS_SERVER_LOG_DIR: "d", NODE_OPTIONS: "--import x", PMS_HQ_ORIGIN: "h" });
  ผล(JSON.stringify(Object.keys(e)) === JSON.stringify(["PATH"]), "(5) envตัวลูกแยกจากรอบ ตัด env ของรอบ/ล็อก/รายงานครบ คงของทั่วไป", JSON.stringify(e));
}

// จำลองสภาพกลางรอบ
const ผลรอบ = path.join(ราก, "test-results"), บันทึก = path.join(ผลรอบ, "gate-logs", `_tools-sim-${process.pid}.log`);
const มีโฟลเดอร์ผลเดิม = existsSync(ผลรอบ), มีโฟลเดอร์บันทึกเดิม = existsSync(path.dirname(บันทึก));
mkdirSync(path.dirname(บันทึก), { recursive: true });
writeFileSync(บันทึก, "บันทึกของรอบ (จำลอง)\n");
const ที่ = mkdtempSync(path.join(os.tmpdir(), "pms-nested-pw-"));
const ล็อก = path.join(ที่, "lock"), รายงานรอบ = path.join(ผลรอบ, `gate-report.tools-sim-${process.pid}.json`);
const token = `${process.pid}-${Date.now()}`;
writeFileSync(ล็อก, JSON.stringify({ token, pid: process.pid, งาน: "รอบตรวจเต็ม (จำลอง)", เริ่ม: new Date().toISOString() }));
writeFileSync(รายงานรอบ, "{\"รายงานของรอบ\":true}\n");
const envรอบ = { ...process.env, PMS_TESTDB_LOCK: ล็อก, PMS_TESTDB_LOCK_HISTORY: path.join(ที่, "h.jsonl"), PMS_TESTDB_LOCK_HELD: token, PMS_TESTDB_PG_PASSWORD: "รหัสของรอบ",
  PLAYWRIGHT_JSON_OUTPUT_NAME: รายงานรอบ, PMS_GATE_FULL: "1", PMS_RUN_ID: `sim-${process.pid}` };
try {
  for (const ไฟล์ of ["tests/tools/flaky-ack.test.mjs", "tests/tools/gate-rerun.test.mjs"]) {
    const r = spawnSync(process.execPath, [ไฟล์], { cwd: ราก, encoding: "utf8", env: envรอบ, maxBuffer: 64 << 20, timeout: 900_000 });
    const ออก = (r.stdout ?? "") + (r.stderr ?? "");
    ผล(/ALL PASS/.test(ออก), `${ไฟล์}: ยังผ่านเองภายใต้ env ของรอบ`, ออก);
    ผล(existsSync(บันทึก), `(1) ${ไฟล์}: ไฟล์บันทึกของรอบ (test-results/gate-logs) ยังอยู่`, ออก);
    let ของล็อก = ""; try { ของล็อก = JSON.parse(readFileSync(ล็อก, "utf8")).token; } catch { /* */ }
    ผล(ของล็อก === token, `(2) ${ไฟล์}: ล็อกยังเป็นของเดิม`, `ไฟล์ล็อก: ${ของล็อก || "ไม่มี"}`);
    const ปลอม = existsSync(ผลรอบ) ? readdirSync(ผลรอบ).filter(n => /ปลอม|sim/.test(n) && !n.startsWith("gate-report.tools-sim")) : [];
    ผล(ปลอม.length === 0, `(3) ${ไฟล์}: ไม่มีโฟลเดอร์ผลของข้อจำลองใน test-results ของราก`, ปลอม.join(" · "));
    ผล(existsSync(รายงานรอบ) && readFileSync(รายงานรอบ, "utf8").includes("รายงานของรอบ"), `(4) ${ไฟล์}: ไม่เขียนทับรายงาน JSON ของรอบ`);
    // คืนสภาพก่อนไฟล์ถัดไป (ผลของไฟล์หนึ่งไม่ไปทำให้ไฟล์ถัดไปตก)
    if (!existsSync(บันทึก)) { mkdirSync(path.dirname(บันทึก), { recursive: true }); writeFileSync(บันทึก, "บันทึกของรอบ (จำลอง)\n"); }
    writeFileSync(รายงานรอบ, "{\"รายงานของรอบ\":true}\n");
    for (const n of ปลอม) rmSync(path.join(ผลรอบ, n), { recursive: true, force: true });
  }
} finally {
  rmSync(บันทึก, { force: true });
  rmSync(รายงานรอบ, { force: true });
  // เก็บกวาดเฉพาะที่ข้อนี้สร้าง (โฟลเดอร์ที่มีอยู่ก่อนไม่แตะ)
  if (!มีโฟลเดอร์ผลเดิม) rmSync(ผลรอบ, { recursive: true, force: true });
  else if (!มีโฟลเดอร์บันทึกเดิม) rmSync(path.dirname(บันทึก), { recursive: true, force: true });
  rmSync(ที่, { recursive: true, force: true });
}

console.log(ตก ? `\n✗ ตก ${ตก} ข้อ` : "\nALL PASS");
process.exit(ตก ? 1 : 0);
