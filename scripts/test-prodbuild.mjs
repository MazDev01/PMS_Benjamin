// รันชุดทดสอบเต็มบน "โค้ดแบบที่ขึ้นเว็บจริง" (next build + next start) ไม่ใช่โหมดพัฒนา
//
// ขั้นตอน: build ทั้งสองแอป -> สตาร์ททั้งสองแอปแบบ production -> รอจนพร้อม
//          -> รันชุดทดสอบ -> ปิดเซิร์ฟเวอร์ให้เรียบร้อยเสมอ (แม้เทสต์ล้ม)
//
// ใช้: npm run test:prodbuild
//      npm run test:prodbuild -- tests/scenario/ui.spec.ts     (เจาะไฟล์เดียว)
//      SKIP_BUILD=1 npm run test:prodbuild                      (ใช้ของที่ build ไว้แล้ว)
import { spawn, spawnSync } from "node:child_process";
import net from "node:net";

const MODE = process.env.NEXT_PUBLIC_DATA_SOURCE ?? "api";   // ค่าตั้งต้น = โหมดเดียวกับเว็บจริง
// รหัสรอบเดียวให้ทุกช่วง — หลักฐานข้อที่ตกของรอบนี้อยู่โฟลเดอร์เดียวกัน (playwright.config.ts)
const PMS_RUN_ID = process.env.PMS_RUN_ID ?? new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 19).replace(/[:T]/g, "-");
// PMS_LOCAL_HTTP_TEST: เซิร์ฟเวอร์ในเครื่องรันบน http — ให้คุกกี้ใบผ่านไม่ติด Secure (WebKit ทิ้งคุกกี้ Secure บน http · ดู _cookie.ts)
const env = { ...process.env, NEXT_PUBLIC_DATA_SOURCE: MODE, PMS_RUN_ID, PMS_LOCAL_HTTP_TEST: "1" };
const แอป = [
  { ชื่อ: "hq", cwd: "apps/hq", port: 3002 },
  { ชื่อ: "dealer", cwd: "apps/dealer", port: 3001 },
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
  for (const [ชื่อ, สคริปต์] of [["typecheck", "typecheck"], ["ตัวตรวจกับดัก (pnpm checks)", "checks"]]) {
    console.log(`▶ ขั้นแรก: ${ชื่อ}`);
    const r = spawnSync("npm", ["run", "-s", สคริปต์], { env: process.env, stdio: "inherit", shell: true });
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
//          → price-switch (เปิดสวิตช์ค่ากลาง ต้องเดี่ยวหลังสุด)
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
const ช่วง = ["chromium", "hq-settings", "safari", "stress", "price-switch"];
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
ปิดทั้งหมด();
console.log(`▶ หลักฐานข้อที่ตก (trace + ภาพหน้าจอ): node_modules/.cache/playwright-results/${PMS_RUN_ID}`);
console.log("▶ ตัวตรวจรอบปิดด่าน: ทุกข้อต้องได้รันจริง");
const ตรวจ = spawnSync("node", ["scripts/check-e2e-ran.mjs", ...รายงาน], { stdio: "inherit", shell: true });
process.exit(ตก || ตรวจ.status || 0);
