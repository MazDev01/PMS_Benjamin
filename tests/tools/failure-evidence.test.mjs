// ── ข้อทดสอบ: หลักฐานตอนข้อทดสอบตก — ข้อความเซิร์ฟเวอร์ (บอสสั่ง 12 พ.ย. 69) ─────────────────────────────────────────────
//   1) attachServerLog: stdout + stderr ของโปรเซสลงไฟล์ทีละบรรทัดพร้อมเวลา
//   2) serverLinesBetween: ตัดเฉพาะช่วงเวลาที่ขอ · หลายไฟล์ (hq + dealer) เรียงตามเวลา
//   3) รอบตรวจ (test-prodbuild) ไม่ทิ้งข้อความเซิร์ฟเวอร์แล้ว + ใส่ตัวรายงานหลักฐานทุกทางที่รัน playwright
//   ตกบนโค้ดเดิม: next start ใช้ stdio "ignore" · ไม่มี serverLog.mjs / failure-evidence.ts
//   การพิสูจน์ตอนตกจริง (ข้อที่ตก → ได้ trace + ภาพ + server-log.txt) ทำในโฟลเดอร์แยก ดูรายงานงาน
// รัน: node tests/tools/failure-evidence.test.mjs
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n   ${String(เพิ่ม).slice(0, 800)}`}`); };
const จบ = () => { console.log(ตก ? `\n✗ ตก ${ตก} ข้อ` : "\nALL PASS"); process.exit(ตก ? 1 : 0); };

const ไฟล์lib = path.resolve("scripts/lib/serverLog.mjs");
ผล(existsSync(ไฟล์lib), "มี scripts/lib/serverLog.mjs");
ผล(existsSync("tests/reporters/failure-evidence.ts"), "มีตัวรายงาน tests/reporters/failure-evidence.ts");
if (!existsSync(ไฟล์lib)) จบ();
const { attachServerLog, serverLinesBetween, serverLogDir } = await import(pathToFileURL(ไฟล์lib).href);

const ที่ = mkdtempSync(path.join(tmpdir(), "server-log-"));
try {
  // 1) โปรเซสจริงพิมพ์ทั้ง stdout/stderr (บรรทัดสุดท้ายไม่มีขึ้นบรรทัดใหม่)
  const เริ่ม = Date.now();
  const p = spawn(process.execPath, ["-e", 'process.stdout.write("พร้อม\\n"); process.stderr.write("Error: ผิดพลาดทดสอบ\\nบรรทัดสอง\\n"); process.stdout.write("ท้ายไม่มีขึ้นบรรทัด")'], { stdio: ["ignore", "pipe", "pipe"] });
  attachServerLog(p, path.join(ที่, "hq.log"), "hq");
  await new Promise(r => p.on("close", r));
  const เนื้อ = readFileSync(path.join(ที่, "hq.log"), "utf8");
  ผล(/^\d{13} hq out พร้อม$/m.test(เนื้อ), "stdout ลงไฟล์พร้อมเวลา + ชื่อ + ช่อง", เนื้อ);
  ผล(/^\d{13} hq err Error: ผิดพลาดทดสอบ$/m.test(เนื้อ) && /^\d{13} hq err บรรทัดสอง$/m.test(เนื้อ), "stderr ลงไฟล์ทีละบรรทัด", เนื้อ);
  ผล(/^\d{13} hq out ท้ายไม่มีขึ้นบรรทัด$/m.test(เนื้อ), "บรรทัดสุดท้ายที่ไม่มีขึ้นบรรทัดใหม่ไม่หาย", เนื้อ);

  // 2) ตัดช่วงเวลา · หลายไฟล์เรียงตามเวลา
  writeFileSync(path.join(ที่, "dealer.log"), `${เริ่ม - 60_000} dealer err เก่าเกินช่วง\n${เริ่ม + 1} dealer err ในช่วงของดีลเลอร์\n${เริ่ม + 600_000} dealer out หลังช่วง\n`);
  const ช่วง = serverLinesBetween(ที่, เริ่ม - 1_000, Date.now() + 1_000);
  ผล(ช่วง.some(l => l.includes("dealer err ในช่วงของดีลเลอร์")) && ช่วง.some(l => l.includes("hq err Error: ผิดพลาดทดสอบ")), "ได้บรรทัดในช่วงจากทุกไฟล์", ช่วง.join("\n"));
  ผล(!ช่วง.some(l => /เก่าเกินช่วง|หลังช่วง/.test(l)), "ไม่เอาบรรทัดนอกช่วง", ช่วง.join("\n"));
  ผล(/^\d\d:\d\d:\d\d\.\d{3} /.test(ช่วง[0] ?? ""), "แต่ละบรรทัดขึ้นต้นด้วยเวลาไทยอ่านได้", ช่วง[0]);
  ผล(serverLinesBetween(path.join(ที่, "ไม่มี"), 0, Date.now()).length === 0, "ไม่มีโฟลเดอร์ = ได้รายการว่าง (ไม่พัง)");
  ผล(!serverLogDir("รอบ-1").includes(path.join("playwright-results", "รอบ-1") + path.sep), "โฟลเดอร์บันทึกอยู่ข้างโฟลเดอร์ผลของ playwright ไม่อยู่ข้างใน (playwright ล้างโฟลเดอร์ผลตอนเริ่ม)", serverLogDir("รอบ-1"));
} finally { rmSync(ที่, { recursive: true, force: true }); }

// 3) ต่อเข้ารอบตรวจแล้วจริง
const รอบ = readFileSync("scripts/test-prodbuild.mjs", "utf8");
ผล(!/spawn\("npx", \["next", "start"[^\n]*stdio: "ignore"/.test(รอบ), "next start ของรอบตรวจไม่ทิ้งข้อความ (stdio ignore) แล้ว");
ผล(/attachServerLog\(/.test(รอบ) && /PMS_SERVER_LOG_DIR/.test(รอบ), "รอบตรวจต่อข้อความเซิร์ฟเวอร์ลงไฟล์ + ส่งที่อยู่ให้ตัวรายงาน");
const ทางรายงาน = [...รอบ.matchAll(/"--reporter=[^"]*"/g)].map(m => m[0]);
ผล(ทางรายงาน.length >= 2 && ทางรายงาน.every(r => r.includes("failure-evidence.ts")), "ทุกทางที่รอบตรวจสั่ง --reporter มีตัวรายงานหลักฐาน", ทางรายงาน.join("\n"));
ผล(/failure-evidence\.ts/.test(readFileSync("playwright.config.ts", "utf8")), "ค่าตั้งต้นของ playwright (รันส่วนตัวเจาะไฟล์) มีตัวรายงานหลักฐาน");
// 12 พ.ย. 69 (บอสสั่ง): 137fc379 ผ่านชุดตรวจก่อน commit ทั้งที่ตัวรายงาน (TS) import serverLog.mjs ที่ไม่มีไฟล์ประกาศชนิด
//   → ชุดตรวจก่อน commit (npm run checks) ต้องตรวจชนิดข้อมูลของไฟล์ทดสอบด้วย
ผล(existsSync("scripts/lib/serverLog.d.mts"), "มีไฟล์ประกาศชนิด scripts/lib/serverLog.d.mts");
ผล(/typecheck:tests|tsc -p tests\/tsconfig\.json/.test(JSON.parse(readFileSync("package.json", "utf8")).scripts.checks ?? ""), "ชุดตรวจก่อน commit (npm run checks) ตรวจชนิดข้อมูลของไฟล์ทดสอบ");
const คอนฟิก = readFileSync("playwright.config.ts", "utf8");
ผล(/trace:\s*"retain-on-failure"/.test(คอนฟิก) && /screenshot:\s*"only-on-failure"/.test(คอนฟิก), "ข้อที่ตกเก็บ trace + ภาพหน้าจอ (ค่าตั้งต้น)");
จบ();
