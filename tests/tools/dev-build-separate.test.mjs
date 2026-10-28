// ── ข้อทดสอบ: เปิด npm run dev ค้างไว้ แล้วรัน build ของรอบตรวจ → ต้องผ่านทั้งคู่ (บอสสั่ง 28 ต.ค. 69) ───────────────────────
// เจอจริง: เปิดเว็บ dev ในโฟลเดอร์เซสชันแล้วรันรอบตรวจ → build ลง .next ทับ dev → build ตก "Cannot find module for page" + dev พัง
// แก้: build ของรอบตรวจ/ชุดทดสอบลงโฟลเดอร์ของตัวเอง (.next-test) — scripts/test-prodbuild.mjs · next.config ทั้งสองแอป · turbo.json
// ขั้น: ① dev ทั้งสองแอปบน .next (ของโฟลเดอร์นี้เปิดอยู่แล้ว = ใช้ตัวนั้น · ไม่เปิด = เปิดเองด้วย next dev ตรง ไม่แตะฐาน dev)
//       ② node scripts/test-prodbuild.mjs --build-only (โฟลเดอร์ผล build ของข้อนี้ = .next-tooltest ไม่ชนรอบตรวจที่กำลังรัน)
//       ③ build ผ่าน · ผล build อยู่โฟลเดอร์ของตัวเอง · .next ของ dev ไม่ถูก build เขียน · dev ยังเปิดหน้าได้ (รวมหน้าที่คอมไพล์ใหม่หลัง build)
// รัน: node tests/tools/dev-build-separate.test.mjs   (PMS_PRODBUILD_SCRIPT = ชี้ตัวสคริปต์อื่น ใช้พิสูจน์ว่าโค้ดเดิมตก)
import { spawn, spawnSync } from "node:child_process";
import { existsSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { พอร์ต } from "../../scripts/lib/session.mjs";

const ราก = process.cwd();
const สคริปต์ = process.env.PMS_PRODBUILD_SCRIPT || path.join(ราก, "scripts/test-prodbuild.mjs");
const โฟลเดอร์ข้อนี้ = ".next-tooltest";
const พอร์ตdev = พอร์ต("dev");
const แอป = [
  { ชื่อ: "dealer", cwd: "apps/dealer", port: พอร์ตdev.dealer, หน้า: ["/login", "/leads", "/quotations"] },
  { ชื่อ: "hq", cwd: "apps/hq", port: พอร์ตdev.hq, หน้า: ["/hq/login", "/hq/dealers", "/hq/leads"] },
];
// env ของ dev = ไม่มีโฟลเดอร์ผล build ตั้งไว้ (= .next แบบ npm run dev) · ตัดของรอบตรวจที่ครอบข้อนี้อยู่ออก
const { PMS_DIST_DIR: _a, PMS_TEST_DIST_DIR: _b, PMS_TESTDB_LOCK_HELD: _c, ...envเดิม } = process.env;

let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n   ${String(เพิ่ม).slice(-1500)}`}`); };
const สถานะหน้า = async (port, p) => {
  try { return (await fetch(`http://localhost:${port}${p}`, { redirect: "manual", signal: AbortSignal.timeout(180_000) })).status; }
  catch (e) { return `เรียกไม่ได้ (${e.cause?.code ?? e.name})`; }
};
const ใช้ได้ = (s) => typeof s === "number" && s < 400;
const เวลาไฟล์ = (f) => (existsSync(f) ? statSync(f).mtimeMs : "ไม่มี");

const เปิดเอง = [];
try {
  // ① dev บน .next
  for (const a of แอป) {
    if (ใช้ได้(await สถานะหน้า(a.port, a.หน้า[0]))) { console.log(`· ${a.ชื่อ}: ใช้ dev ที่เปิดอยู่แล้ว (พอร์ต ${a.port})`); continue; }
    เปิดเอง.push(spawn("npx", ["next", "dev", "-p", String(a.port)], { cwd: path.join(ราก, a.cwd), env: envเดิม, stdio: "ignore", shell: true }));
  }
  for (const a of แอป) {
    let s;
    for (let i = 0; i < 90 && !ใช้ได้(s = await สถานะหน้า(a.port, a.หน้า[0])); i++) await new Promise(r => setTimeout(r, 2000));
    ผล(ใช้ได้(s), `เปิด dev ${a.ชื่อ} ค้างไว้ (${a.หน้า[0]} = ${s})`);
  }
  const ก่อน = แอป.map(a => เวลาไฟล์(path.join(ราก, a.cwd, ".next", "BUILD_ID")));

  // ② build ของรอบตรวจ ระหว่าง dev เปิดอยู่
  for (const a of แอป) rmSync(path.join(ราก, a.cwd, โฟลเดอร์ข้อนี้), { recursive: true, force: true });
  const b = spawnSync(process.execPath, [สคริปต์, "--build-only"], { cwd: ราก, encoding: "utf8", maxBuffer: 256 << 20,
    env: { ...envเดิม, PMS_TEST_DIST_DIR: โฟลเดอร์ข้อนี้ } });
  ผล(b.status === 0, "build ของรอบตรวจผ่าน ทั้งที่ dev เปิดค้างอยู่", (b.stdout ?? "") + (b.stderr ?? ""));

  // ③ ผล build อยู่โฟลเดอร์ของตัวเอง · .next ของ dev ไม่ถูก build เขียน · dev ยังใช้ได้
  for (const [i, a] of แอป.entries()) {
    ผล(existsSync(path.join(ราก, a.cwd, โฟลเดอร์ข้อนี้, "BUILD_ID")), `${a.ชื่อ}: ผล build อยู่โฟลเดอร์ของรอบตรวจ (${โฟลเดอร์ข้อนี้})`);
    const หลัง = เวลาไฟล์(path.join(ราก, a.cwd, ".next", "BUILD_ID"));
    ผล(หลัง === ก่อน[i], `${a.ชื่อ}: build ไม่เขียนทับ .next ของ dev`, `BUILD_ID ก่อน ${ก่อน[i]} · หลัง ${หลัง}`);
    const ทุกหน้า = [];
    for (const p of a.หน้า) ทุกหน้า.push([p, await สถานะหน้า(a.port, p)]);
    ผล(ทุกหน้า.every(([, s]) => ใช้ได้(s)), `${a.ชื่อ}: dev ยังเปิดหน้าได้หลัง build (รวมหน้าที่คอมไพล์ใหม่)`, ทุกหน้า.map(([p, s]) => `${p}=${s}`).join(" · "));
  }
} finally {
  for (const p of เปิดเอง) {
    if (process.platform === "win32" && p.pid) spawnSync("taskkill", ["/pid", String(p.pid), "/T", "/F"], { stdio: "ignore" });
    else p.kill();
  }
  for (const a of แอป) rmSync(path.join(ราก, a.cwd, โฟลเดอร์ข้อนี้), { recursive: true, force: true });
}
console.log(ตก ? `\n${ตก} FAIL` : "\nALL PASS");
process.exit(ตก ? 1 : 0);
