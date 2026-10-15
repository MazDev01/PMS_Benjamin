// รันชุดทดสอบเต็มบน "โค้ดแบบที่ขึ้นเว็บจริง" (next build + next start) ไม่ใช่โหมดพัฒนา
//
// ขั้นตอน: build ทั้งสองแอป -> สตาร์ททั้งสองแอปแบบ production -> รอจนพร้อม
//          -> รันชุดทดสอบ -> ปิดเซิร์ฟเวอร์ให้เรียบร้อยเสมอ (แม้เทสต์ล้ม)
//
// ใช้: npm run test:prodbuild
//      npm run test:prodbuild -- tests/scenario/ui.spec.ts     (เจาะไฟล์เดียว)
//      SKIP_BUILD=1 npm run test:prodbuild                      (ใช้ของที่ build ไว้แล้ว)
import { spawn, spawnSync } from "node:child_process";

const MODE = process.env.NEXT_PUBLIC_DATA_SOURCE ?? "api";   // ค่าตั้งต้น = โหมดเดียวกับเว็บจริง
// รหัสรอบเดียวให้ทุกช่วง — หลักฐานข้อที่ตกของรอบนี้อยู่โฟลเดอร์เดียวกัน (playwright.config.ts)
const PMS_RUN_ID = process.env.PMS_RUN_ID ?? new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 19).replace(/[:T]/g, "-");
const env = { ...process.env, NEXT_PUBLIC_DATA_SOURCE: MODE, PMS_RUN_ID };
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

const เซิร์ฟเวอร์ = [];
const ปิดทั้งหมด = () => {
  for (const p of เซิร์ฟเวอร์) { try { p.kill(); } catch { /* ปิดไปแล้ว */ } }
};
process.on("exit", ปิดทั้งหมด);
process.on("SIGINT", () => { ปิดทั้งหมด(); process.exit(130); });

if (!process.env.SKIP_BUILD) {
  console.log(`▶ build ทั้งสองแอป (โหมด ${MODE}) — ใช้เวลาราว 1 นาที`);
  const b = spawnSync("npm", ["run", "build"], { env, stdio: "inherit", shell: true });
  if (b.status !== 0) { console.error("build ไม่ผ่าน — หยุด"); process.exit(b.status ?? 1); }
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
