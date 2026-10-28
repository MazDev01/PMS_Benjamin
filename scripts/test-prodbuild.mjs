// รันชุดทดสอบเต็มบน "โค้ดแบบที่ขึ้นเว็บจริง" (next build + next start) ไม่ใช่โหมดพัฒนา
//
// ขั้นตอน: build ทั้งสองแอป -> สตาร์ททั้งสองแอปแบบ production -> รอจนพร้อม
//          -> รันชุดทดสอบ -> ปิดเซิร์ฟเวอร์ให้เรียบร้อยเสมอ (แม้เทสต์ล้ม)
//
// ใช้: npm run test:prodbuild
//      npm run test:prodbuild -- tests/scenario/ui.spec.ts     (เจาะไฟล์เดียว)
//      SKIP_BUILD=1 npm run test:prodbuild                      (ใช้ของที่ build ไว้แล้ว)
//      node scripts/test-prodbuild.mjs --build-only             (build อย่างเดียว ไม่ถือล็อกฐาน — ข้อทดสอบ dev-build-separate ใช้)
// ผล build อยู่โฟลเดอร์ของรอบตรวจเอง (.next-test · PMS_TEST_DIST_DIR เปลี่ยนได้) ไม่ใช่ .next ที่ npm run dev ใช้
//   เดิม build ทับ .next ขณะเปิด dev ค้างในโฟลเดอร์เดียวกัน → dev พัง/build ตก "Cannot find module for page" (บอสสั่งแยก 28 ต.ค. 69)
//   next.config ของทั้งสองแอปอ่าน PMS_DIST_DIR · turbo.json ประกาศ PMS_DIST_DIR ให้งาน build (โหมด strict กรองทิ้งถ้าไม่ประกาศ)
//   ข้อทดสอบ: tests/tools/dev-build-separate.test.mjs
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { บันทึกเมื่อผ่าน, ไฟล์บันทึก } from "./lib/migrationGate.mjs";
import { สภาพตอนเริ่ม, บันทึกcommitที่ผ่าน } from "./lib/commitGate.mjs";
import { ขอล็อกฐานทดสอบ } from "./lib/testDbLock.mjs";
import { พอร์ต, ต้นทาง, ชื่อเซสชัน } from "./lib/session.mjs";
import { ตรวจไม่นิ่งท้ายรอบ } from "./lib/flakyLog.mjs";
import { อาร์กิวเมนต์psql, คอนเทนเนอร์ as คอนเทนเนอร์ฐานทดสอบ } from "./lib/testDbGuard.mjs";

const โฟลเดอร์build = process.env.PMS_TEST_DIST_DIR || ".next-test";
if (process.argv.includes("--build-only")) {
  const { PMS_TESTDB_LOCK_HELD: _ไม่ใช้, ...เดิม } = process.env;
  const b = spawnSync("npm", ["run", "build"], { env: { ...เดิม, PMS_DIST_DIR: โฟลเดอร์build }, stdio: "inherit", shell: true });
  process.exit(b.status ?? 1);
}

// commit ที่กำลังตรวจ + ไฟล์ค้างตอนเริ่ม — ผลผ่านผูกกับ commit นี้ (ตัวกัน push ขึ้น monorepo · 22 ต.ค. 69)
const ตอนเริ่ม = สภาพตอนเริ่ม();

const MODE = process.env.NEXT_PUBLIC_DATA_SOURCE ?? "api";   // ค่าตั้งต้น = โหมดเดียวกับเว็บจริง
// รหัสรอบเดียวให้ทุกช่วง — หลักฐานข้อที่ตกของรอบนี้อยู่โฟลเดอร์เดียวกัน (playwright.config.ts)
const PMS_RUN_ID = process.env.PMS_RUN_ID ?? new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 19).replace(/[:T]/g, "-");
// ── ถือล็อกฐานทดสอบตลอดรอบ (scripts/lib/testDbLock.mjs · 22 ต.ค. 69) — เซสชันอื่นใช้ฐานอยู่ = รอคิว (บอกว่าใคร) ─────────
//   ทุกขั้นย่อย (playwright · prod-live ในเครื่อง · สคริปต์ล้าง) ได้รหัสล็อกทาง env จึงไม่ล็อกซ้ำ/ไม่รอตัวเอง
const ล็อกฐาน = ขอล็อกฐานทดสอบ(`รอบตรวจเต็ม (${ตอนเริ่ม.sha.slice(0, 7)})`, { รอนาที: Number(process.env.PMS_TESTDB_LOCK_WAIT || 180) });
// พอร์ตทดสอบของโฟลเดอร์นี้ (โฟลเดอร์หลัก = ค่าใน scripts/lib/ports.json · เซสชันลูก = .pms-session.json)
const พอร์ตทดสอบ = พอร์ต("test"), ที่อยู่ = ต้นทาง("test");
// PMS_LOCAL_HTTP_TEST: เซิร์ฟเวอร์ในเครื่องรันบน http — ให้คุกกี้ใบผ่านไม่ติด Secure (WebKit ทิ้งคุกกี้ Secure บน http · ดู _cookie.ts)
const env = { ...process.env, PMS_DIST_DIR: โฟลเดอร์build, NEXT_PUBLIC_DATA_SOURCE: MODE, PMS_RUN_ID, PMS_LOCAL_HTTP_TEST: "1",
  PMS_TESTDB_LOCK_HELD: ล็อกฐาน.token, PMS_DEALER_ORIGIN: ที่อยู่.dealer, PMS_HQ_ORIGIN: ที่อยู่.hq,
  // ที่อยู่แอปที่ฝังตอน build (ลิงก์ข้ามแอป · CORS) = พอร์ตทดสอบของโฟลเดอร์นี้ — ค่าใน env ชนะ .env.local (เซสชันลูกมีพอร์ต dev ในไฟล์นั้น)
  NEXT_PUBLIC_DEALER_APP_URL: ที่อยู่.dealer, DEALER_APP_ORIGIN: ที่อยู่.dealer, NEXT_PUBLIC_HQ_ORIGIN: ที่อยู่.hq };
const แอป = [
  { ชื่อ: "hq", cwd: "apps/hq", port: พอร์ตทดสอบ.hq },
  { ชื่อ: "dealer", cwd: "apps/dealer", port: พอร์ตทดสอบ.dealer },
];

const รอจนพร้อม = async (port, วินาที = 120) => {
  const หมดเวลา = Date.now() + วินาที * 1000;
  while (Date.now() < หมดเวลา) {
    try {
      const r = await fetch(`http://localhost:${port}/api/health`, { signal: AbortSignal.timeout(4000) });
      if (r.ok) return true;
    } catch { /* ยังไม่ขึ้น */ }
    await new Promise(r => setTimeout(r, 1500));
  }
  return false;
};

// ── ปิดเซิร์ฟเวอร์ให้หมดทั้งต้น (15 ต.ค. 69) ─────────────────────────────────────────────────────────────
//   spawn(..., { shell: true }) บน Windows = cmd → npx → node next start · p.kill() ปิดแค่ cmd ตัวบนสุด
//   next start ข้างในค้างถือพอร์ตต่อ → รอบถัดไปสตาร์ทไม่ขึ้น (พอร์ตไม่ว่าง) แต่ตัวเช็กความพร้อมเจอเซิร์ฟเวอร์เก่าตอบแทน
//   ข้อทดสอบทั้งรอบคุยกับ build เก่าที่ไฟล์บนดิสก์ถูกแทนไปแล้ว (หน้าเปล่า · ไฟล์ JS ตอบ 400) — รอบปิดด่านพังทั้งรอบ
const เซิร์ฟเวอร์ = [];
const ปิดทั้งหมด = () => {
  for (const p of เซิร์ฟเวอร์) {
    try {
      if (process.platform === "win32" && p.pid) spawnSync("taskkill", ["/pid", String(p.pid), "/T", "/F"], { stdio: "ignore" });
      else p.kill();
    } catch { /* ปิดไปแล้ว */ }
  }
};
// พอร์ตต้องว่างก่อนสตาร์ท — ไม่ว่าง = มีเซิร์ฟเวอร์ค้าง (ของรอบก่อน/ของคนอื่น) · ห้ามรันต่อเพราะจะทดสอบผิดตัว
const พอร์ตว่าง = port => new Promise(ok => {
  const s = net.createServer().once("error", () => ok(false)).once("listening", () => s.close(() => ok(true)));
  s.listen(port);
});
process.on("exit", ปิดทั้งหมด);
process.on("SIGINT", () => { ปิดทั้งหมด(); process.exit(130); });

// ── ขั้นแรกของรอบปิดด่าน: typecheck + pnpm checks — แดง = หยุดทั้งรอบ (บอสสั่ง 15 ต.ค. 69) ───────────────────────
//   เดิมตัวตรวจกับดักแดงค้างมาตั้งแต่ด่าน 1–2 โดยไม่มีใครเห็น เพราะรอบปิดด่านไม่ได้รันมัน
//   ไม่มีตัวเลือกข้าม · เจาะไฟล์เดียว (ระบุอาร์กิวเมนต์เอง) ไม่ใช่รอบปิดด่าน จึงไม่บังคับ
if (!process.argv.slice(2).length) {
  // ข้อทดสอบหน่วย (vitest) อยู่ในขั้นแรกด้วย (21 ต.ค. 69) — เดิมไม่ได้รันในรอบปิดด่านเลย ข้อทดสอบของตัวกัน db:push จึงไม่ถูกตรวจก่อนขึ้นระบบ
  for (const [ชื่อ, สคริปต์] of [["typecheck", "typecheck"], ["ตัวตรวจกับดัก (pnpm checks)", "checks"], ["ข้อทดสอบหน่วย (vitest)", "test:unit"]]) {
    console.log(`▶ ขั้นแรก: ${ชื่อ}`);
    const r = spawnSync("npm", ["run", "-s", สคริปต์], { env: { ...process.env, PMS_TESTDB_LOCK_HELD: ล็อกฐาน.token }, stdio: "inherit", shell: true });
    if (r.status !== 0) { console.error(`❌ ${ชื่อ} ไม่ผ่าน — ไม่เริ่มรอบปิดด่าน`); process.exit(r.status ?? 1); }
  }
}

if (!process.env.SKIP_BUILD) {
  console.log(`▶ build ทั้งสองแอป (โหมด ${MODE}) — ใช้เวลาราว 1 นาที`);
  const b = spawnSync("npm", ["run", "build"], { env, stdio: "inherit", shell: true });
  if (b.status !== 0) { console.error("build ไม่ผ่าน — หยุด"); process.exit(b.status ?? 1); }
}

for (const a of แอป) {
  if (!await พอร์ตว่าง(a.port)) {
    console.error(`❌ พอร์ต ${a.port} ถูกใช้อยู่ (มีเซิร์ฟเวอร์ค้าง) — ปิดก่อนแล้วรันใหม่ · ไม่รันต่อเพราะข้อทดสอบจะคุยกับเซิร์ฟเวอร์ผิดตัว`);
    process.exit(1);
  }
}
for (const a of แอป) {
  console.log(`▶ สตาร์ท ${a.ชื่อ} แบบ production ที่พอร์ต ${a.port}`);
  เซิร์ฟเวอร์.push(spawn("npx", ["next", "start", "-p", String(a.port)], { cwd: a.cwd, env, stdio: "ignore", shell: true }));
}
for (const a of แอป) {
  if (!await รอจนพร้อม(a.port)) { console.error(`${a.ชื่อ} ไม่ขึ้นภายในเวลาที่รอ — หยุด`); ปิดทั้งหมด(); process.exit(1); }
}
console.log("▶ เซิร์ฟเวอร์พร้อม เริ่มรันชุดทดสอบบนโค้ดแบบที่ขึ้นเว็บจริง");

// ── รอบปิดด่าน (ไม่ระบุไฟล์/โปรเจกต์) = รันเป็นช่วงต่อกัน แล้วตัวตรวจ check-e2e-ran เป็นขั้นบังคับท้ายรอบ ──────────
//   (บอสสั่ง 14 ต.ค. 69 · ปิดด่าน 3) เดิมสั่ง playwright ครั้งเดียวทุกโปรเจกต์ — safari/stress/price-switch พึ่งผลของ chromium
//   chromium ตกข้อเดียว 18 ข้อไม่ได้รันเลย ตอนนี้ทุกโปรเจกต์พึ่งแค่ setup และทุกช่วงรันเสมอไม่ว่าช่วงก่อนจะตก
//   ลำดับ: chromium → hq-settings (ไฟล์ที่แก้ค่ากลางของ HQ · ทีละไฟล์) → safari → stress (ไม่แย่งเครื่อง)
//   (ช่วง price-switch ถูกลบ 16 ต.ค. 69 — เอาแม่แบบออกทั้งระบบ ไม่มีสวิตช์ซ่อนราคาแม่แบบให้ทดสอบแล้ว)
//   ระบุไฟล์/ตัวเลือกเอง (เช่น เจาะไฟล์เดียว) = รันครั้งเดียวแบบเดิม ไม่มีตัวตรวจ
const อาร์กิวเมนต์ = process.argv.slice(2);
const รายงานหลัก = process.env.PLAYWRIGHT_JSON_OUTPUT_NAME ?? "test-results/gate-report.json";
const เป็นรอบเต็ม = !อาร์กิวเมนต์.some(a => !a.startsWith("--reporter"));
const รัน = (args, extraEnv = {}) => new Promise(resolve => {
  const p = spawn("npx", ["playwright", "test", "-c", "playwright.prodbuild.config.ts", ...args], { env: { ...env, ...extraEnv }, stdio: "inherit", shell: true });
  p.on("exit", code => resolve(code ?? 1));
});
if (!เป็นรอบเต็ม) {
  const code = await รัน(อาร์กิวเมนต์);
  ปิดทั้งหมด(); process.exit(code);
}
// ── ช่วงสุดท้าย: ชุด prod-live กับระบบในเครื่อง (บอสสั่ง 20 ต.ค. 69 · รอบ 3 ข้อแรก) ─────────────────────────────
//   เหตุ: ช่วง ก2 เปลี่ยนปุ่ม "ทำใบเสนอราคาจากใบ HQ" เป็น "ทำใบให้ลูกค้า" — ข้อทดสอบในเครื่องตามไปแล้ว แต่ชุด prod-live ไม่ได้ตาม
//         ไปตกบนเว็บจริงหลังขึ้นระบบ · ต่อจากนี้ prod-live ล้าหลังหน้าเว็บเมื่อไร รอบปิดด่านในเครื่องต้องตกก่อน
//   ใช้สาขา/บัญชีชั่วคราวชุดเดียวกับเว็บจริง (run.mjs --target local · สาขา ZZT) แล้วล้างด้วย cleanup.sql ตัวเดียวกันเสมอ
//   ข้อที่ต้องมีของระบบจริงเท่านั้น (Send Email Hook ฯลฯ) ข้ามในเครื่องพร้อมเหตุผลในตัวข้อ
const รันprodLive = async () => {
  console.log("▶ ช่วง prod-live (ชุดเดียวกับเว็บจริง · รันกับระบบในเครื่อง)");
  const สถานะ = path.join(os.tmpdir(), `pms-live-local-${PMS_RUN_ID}`);
  mkdirSync(สถานะ, { recursive: true });
  const ขั้น = (phase) => spawnSync("node", ["tests/prod-live/run.mjs", "--target", "local", phase],
    { stdio: "inherit", env: { ...env, LIVE_STATE_DIR: สถานะ } }).status ?? 1;
  let code = 0;
  try {
    code = ขั้น("setup");
    if (code === 0) code = ขั้น("test");
  } finally {
    ขั้น("files");
    const ล้าง = spawnSync("docker", [...อาร์กิวเมนต์psql(คอนเทนเนอร์ฐานทดสอบ), "-X", "-q", "-v", "ON_ERROR_STOP=1"],
      { input: readFileSync("tests/prod-live/cleanup.sql", "utf8").replaceAll("__ชุดสำรองก่อนลบ__", "ฐานทดสอบในเครื่อง (รอบตรวจเต็ม · ไม่มีชุดสำรอง)"), encoding: "utf8" });   // ใบ 0245
    if (ล้าง.status !== 0) { console.error(`✗ ล้างข้อมูล prod-live ในเครื่องไม่สำเร็จ: ${ล้าง.stderr}`); code = code || 1; }
    rmSync(สถานะ, { recursive: true, force: true });
  }
  if (code !== 0) console.error("✗ ช่วง prod-live ตก — ชุดทดสอบของเว็บจริงล้าหลังหน้าเว็บ หรือ flow บนเว็บพัง (แก้ก่อนขึ้นระบบจริง)");
  return code;
};
if (process.env.PMS_GATE_ONLY_LIVE === "1") {   // เจาะช่วง prod-live อย่างเดียว (ใช้ตอนแก้ชุด prod-live)
  const code = await รันprodLive();
  ปิดทั้งหมด(); process.exit(code);
}
const ช่วง = ["chromium", "hq-settings", "safari", "stress"];
const รีพอร์ตเตอร์ = อาร์กิวเมนต์.find(a => a.startsWith("--reporter")) ?? "--reporter=line,json";
const รายงาน = [];
let ตก = 0;
for (const โปรเจกต์ of ช่วง) {
  const ไฟล์รายงาน = รายงานหลัก.replace(/\.json$/, "") + `.${โปรเจกต์}.json`;
  รายงาน.push(ไฟล์รายงาน);
  console.log(`▶ ช่วง ${โปรเจกต์}`);
  const code = await รัน([`--project=${โปรเจกต์}`, รีพอร์ตเตอร์], { PLAYWRIGHT_JSON_OUTPUT_NAME: ไฟล์รายงาน, PMS_RUN_STAGE: โปรเจกต์ });
  if (code !== 0) ตก = code;
}
{ const code = await รันprodLive(); if (code !== 0) ตก = code; }
ปิดทั้งหมด();
console.log(`▶ หลักฐานข้อที่ตก (trace + ภาพหน้าจอ): node_modules/.cache/playwright-results/${PMS_RUN_ID}`);
console.log("▶ ตัวตรวจรอบปิดด่าน: ทุกข้อต้องได้รันจริง");
const ตรวจ = spawnSync("node", ["scripts/check-e2e-ran.mjs", ...รายงาน], { stdio: "inherit", shell: true });
// ── ตัวนับข้อไม่นิ่ง (บอสสั่ง 26 ต.ค. 69 · scripts/lib/flakyLog.mjs) ──────────────────────────────────────────────────
//   ทุกข้อที่ตกแล้วผ่านตอนรันซ้ำ → บรรทัด "ไม่นิ่ง" ใน tests/flaky-log.txt (commit พร้อมงาน · ไม่นับในลายนิ้วมือโค้ด)
//   ข้อไหนครบ 3 ครั้งโดยยังไม่มีบรรทัด "ต้นเหตุ" → รอบนี้ไม่ผ่าน (ไม่บันทึกผลผ่าน = ขึ้นเว็บไม่ได้)
if (ตรวจไม่นิ่งท้ายรอบ(รายงาน, { รอบ: `${ชื่อเซสชัน()}·${PMS_RUN_ID}` })) ตก = ตก || 1;
// ผ่านครบ (ตก 0 + ตัวตรวจท้ายรอบผ่าน) → บันทึกลายนิ้วมือใบปรับฐานทุกใบ · db:push:prod ลงได้เฉพาะใบที่ตรงกับบันทึกนี้
//   (บอสสั่ง 21 ต.ค. 69 · scripts/lib/migrationGate.mjs) · ต้อง commit ไฟล์บันทึกพร้อมงาน
if (บันทึกเมื่อผ่าน({ ตก, ตัวตรวจ: ตรวจ.status ?? 1, ป้าย: PMS_RUN_ID })) {
  console.log(`▶ บันทึกใบปรับฐานที่ผ่านรอบตรวจเต็มแล้ว → ${ไฟล์บันทึก()} (commit ไฟล์นี้พร้อมงาน)`);
  // ผลผ่านของ commit นี้ (scripts/lib/commitGate.mjs) — git pre-push ให้ขึ้น monorepo ได้เฉพาะ commit ที่มีผลนี้
  //   SKIP_BUILD = ทดสอบของที่ build ไว้ก่อน อาจไม่ใช่ commit นี้ → ไม่บันทึก
  const ไม่บันทึก = process.env.SKIP_BUILD ? "รอบนี้ข้าม build (SKIP_BUILD) — ของที่ทดสอบอาจไม่ใช่ commit นี้ จึงไม่บันทึกผลผูก commit"
    : บันทึกcommitที่ผ่าน({ ...ตอนเริ่ม, ป้าย: PMS_RUN_ID });
  console.log(ไม่บันทึก ? `⚠️ ${ไม่บันทึก}` : `▶ บันทึกลายนิ้วมือโค้ดของ commit ${ตอนเริ่ม.sha.slice(0, 7)} → supabase/gate-passed-code.txt — commit ไฟล์นี้พร้อม gate-passed-migrations.json (ส่งงาน/merge/ขึ้นเว็บได้เฉพาะ commit ที่มีบรรทัดนี้)`);
}
process.exit(ตก || ตรวจ.status || 0);
