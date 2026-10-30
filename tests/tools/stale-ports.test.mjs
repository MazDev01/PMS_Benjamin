// ── ข้อทดสอบ: ตอนเริ่มรอบตรวจเต็ม ปิดโปรเซสค้างบนพอร์ตของเซสชันตัวเอง (บอสสั่ง 29 ต.ค. 69 · คิวข้อ 1 · scripts/lib/stalePorts.mjs) ──
//   ก. เว็บค้างบนพอร์ตของเซสชัน (โปรเซสลูกสองชั้น แบบ cmd → node) + เว็บของ "เซสชันอื่น" อีกพอร์ต
//      → ปิดเฉพาะพอร์ตของเซสชัน ทั้งต้นโปรเซส · พอร์ตกลับมาว่าง · เว็บของเซสชันอื่นยังตอบอยู่
//   ข. พอร์ตว่างอยู่แล้ว → ไม่ปิดอะไร
//   ค. ตัวรันรอบตรวจ (scripts/test-prodbuild.mjs) เรียกตัวปิดก่อนตัวเช็กพอร์ตว่าง ด้วยพอร์ตทดสอบของเซสชันเท่านั้น
//      (โค้ดเดิม: เจอพอร์ตไม่ว่าง = หยุดทั้งรอบ "มีเซิร์ฟเวอร์ค้าง — ปิดก่อนแล้วรันใหม่")
// รัน: node tests/tools/stale-ports.test.mjs
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ราก = process.cwd();
let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n   ${String(เพิ่ม).slice(-1200)}`}`); };
const ที่lib = path.join(ราก, "scripts/lib/stalePorts.mjs");
if (!existsSync(ที่lib)) { ผล(false, "มีตัวปิดโปรเซสค้างบนพอร์ต (scripts/lib/stalePorts.mjs)", "ไม่มีไฟล์"); console.log(`\n${ตก} FAIL`); process.exit(1); }
const { ปิดของค้างบนพอร์ต, ผู้ฟังพอร์ต } = await import(pathToFileURL(ที่lib).href);

const พอร์ตว่าง = () => new Promise(ok => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => ok(p)); }); });
const ว่างไหม = (port) => new Promise(ok => { const s = net.createServer().once("error", () => ok(false)).once("listening", () => s.close(() => ok(true))); s.listen(port); });
const ตอบไหม = (port) => fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(2000) }).then(() => true, () => false);
const รอ = (ms) => new Promise(r => setTimeout(r, ms));
// เว็บจำลอง: shell → node ฟังพอร์ต (แบบ npx next start ที่ spawn ด้วย shell: true)
const เปิดเว็บ = (port) => spawn(`"${process.execPath}" -e "require('http').createServer((q,s)=>s.end('ok')).listen(${port})"`, { shell: true, stdio: "ignore" });

const ของเรา = await พอร์ตว่าง(), ของคนอื่น = await พอร์ตว่าง();
const ค้าง = เปิดเว็บ(ของเรา), อื่น = เปิดเว็บ(ของคนอื่น);
try {
  for (let i = 0; i < 50 && !(await ตอบไหม(ของเรา) && await ตอบไหม(ของคนอื่น)); i++) await รอ(200);
  ผล(await ตอบไหม(ของเรา) && await ตอบไหม(ของคนอื่น) && ผู้ฟังพอร์ต(ของเรา).length > 0, "(ตัวคุม) เว็บค้างบนพอร์ตของเซสชัน + เว็บของเซสชันอื่น ขึ้นแล้ว");
  const ปิด = ปิดของค้างบนพอร์ต([ของเรา], { log: () => {} });
  for (let i = 0; i < 25 && !(await ว่างไหม(ของเรา)); i++) await รอ(200);
  ผล(ปิด.length >= 1 && ปิด.every(x => x.port === ของเรา) && await ว่างไหม(ของเรา), "ก. ปิดโปรเซสค้างบนพอร์ตของเซสชัน → พอร์ตว่างพร้อมสตาร์ทใหม่", JSON.stringify(ปิด));
  ผล(await ตอบไหม(ของคนอื่น), "ก. เว็บบนพอร์ตของเซสชันอื่นยังตอบอยู่ (ไม่แตะ)");
  ผล(ปิดของค้างบนพอร์ต([ของเรา], { log: () => {} }).length === 0, "ข. พอร์ตว่างอยู่แล้ว → ไม่ปิดอะไร");
} finally {
  for (const p of [ค้าง, อื่น]) { try { if (process.platform === "win32") (await import("node:child_process")).spawnSync("taskkill", ["/pid", String(p.pid), "/T", "/F"], { stdio: "ignore" }); else p.kill(); } catch { /* */ } }
}

const ตัวรัน = readFileSync(path.join(ราก, "scripts/test-prodbuild.mjs"), "utf8");
const ปิดที่ = ตัวรัน.indexOf("ปิดของค้างบนพอร์ต(ไม่ว่าง)"), เช็กที่ = ตัวรัน.indexOf("ถูกใช้อยู่ (มีเซิร์ฟเวอร์ค้าง)");
ผล(ปิดที่ > 0 && ปิดที่ < เช็กที่ && /for \(const a of แอป\) if \(!await พอร์ตว่าง\(a\.port\)\) ไม่ว่าง\.push\(a\.port\)/.test(ตัวรัน)
  && /\{ ชื่อ: "hq", cwd: "apps\/hq", port: พอร์ตทดสอบ\.hq \}/.test(ตัวรัน),
  "ค. ตัวรันรอบตรวจปิดของค้างก่อนเช็กพอร์ต · เฉพาะพอร์ตทดสอบของเซสชัน (พอร์ต(\"test\"))");

console.log(ตก ? `\n${ตก} FAIL` : "\nALL PASS");
process.exit(ตก ? 1 : 0);
