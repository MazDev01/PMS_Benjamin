// ── ตัวตรวจ: ห้ามเขียนเลขพอร์ต/ที่อยู่เว็บในเครื่องไว้ในโค้ดหรือชุดทดสอบ (บอสสั่ง 22 ต.ค. 69) ───────────────────────────────
//   หลายเซสชันทำงานพร้อมกัน แต่ละโฟลเดอร์มีพอร์ตของตัวเอง — โค้ดที่เขียน localhost:3001 ไว้ จะไปคุยกับเว็บของเซสชันอื่น
//   (ข้อทดสอบผ่าน/ตกจากเว็บคนละตัวกับที่ตั้งใจวัด) · พอร์ตมีที่เดียว: scripts/lib/ports.json + .pms-session.json
//   ใช้แทน: สคริปต์ → scripts/lib/session.mjs (ต้นทาง/พอร์ต) · ชุดทดสอบ → tests/scenario/sessionPorts.ts (ที่อยู่เว็บ)
//   แอป → env (NEXT_PUBLIC_DEALER_APP_URL ฯลฯ) · package.json ของแอป → scripts/next-port.mjs
// ไม่นับคำอธิบาย (// … · /* … */ · # …) · อ่านเฉพาะไฟล์ที่ git เก็บ (scripts/lib/gitFiles.mjs)
// ไม่ตรวจ (ค่าตั้งที่ไม่ใช่โค้ด): .github/ (CI รันพอร์ตเดียว) · supabase/config.toml (ฐานทดสอบในเครื่อง) · .env.example (เอกสาร)
// ข้อทดสอบ: tests/tools/check-hardcoded-ports.test.mjs
import { readFileSync } from "node:fs";
import { ไฟล์ที่gitเก็บ } from "./lib/gitFiles.mjs";

const ราก = ["apps", "packages", "scripts", "tests", "playwright.config.ts", "playwright.existing.config.ts", "playwright.prodbuild.config.ts", "vitest.config.ts", "package.json"];
const ยกเว้น = new Set(["scripts/lib/ports.json", "scripts/check-hardcoded-ports.mjs"]);
// ช่วงพอร์ตเว็บของโปรเจกต์ (โฟลเดอร์หลัก ถึงเซสชันลูกช่องสุดท้าย) — พอร์ตนอกช่วงไม่นับ เช่น ฐานทดสอบ :55322
//   (ใช้ร่วมทุกเซสชัน ตายตัวได้) · ค่าตัวอย่างในข้อทดสอบหน่วย (:2525 · :9999)
const ค่า = JSON.parse(readFileSync("scripts/lib/ports.json", "utf8"));
const ต่ำสุด = Math.min(ค่า.dev.dealer, ค่า.dev.hq, ค่า.test.dealer, ค่า.test.hq);
const สูงสุด = ค่า.เซสชันลูก.ฐาน + ค่า.เซสชันลูก.ช่วงต่อเซสชัน * (ค่า.เซสชันลูก.สูงสุด + 1);
const พอร์ตเว็บ = (n) => Number(n) >= ต่ำสุด && Number(n) <= สูงสุด;
const พอร์ตหลัก = new RegExp(`\\b(${[...new Set([ค่า.dev.dealer, ค่า.dev.hq, ค่า.test.dealer, ค่า.test.hq])].join("|")})\\b`);
const แบบ = [
  [(s) => [...s.matchAll(/\b(?:localhost|127\.0\.0\.1):(\d{2,5})\b/g)].some(m => พอร์ตเว็บ(m[1])), "ที่อยู่เว็บในเครื่องพร้อมพอร์ต"],
  [(s) => /\bnext\s+(dev|start)\b[^"'`\n]*\s-p\s*\d+/.test(s), "สั่ง next พร้อมเลขพอร์ต"],
  [(s) => พอร์ตหลัก.test(s), "เลขพอร์ตของโฟลเดอร์หลัก"],
];

const เจอ = [];
for (const f of ไฟล์ที่gitเก็บ(ราก, { ext: /\.(ts|tsx|mjs|cjs|js|json|sh)$/ })) {
  const ทาง = f.replaceAll("\\", "/");
  if (ยกเว้น.has(ทาง)) continue;
  let ในคำอธิบาย = false;
  readFileSync(f, "utf8").split(/\r?\n/).forEach((บรรทัด, i) => {
    let ตัด = บรรทัด;
    if (ในคำอธิบาย) { const จบ = ตัด.indexOf("*/"); if (จบ < 0) return; ตัด = ตัด.slice(จบ + 2); ในคำอธิบาย = false; }
    ตัด = ตัด.replace(/\/\*.*?\*\//g, "");
    const เริ่ม = ตัด.indexOf("/*"); if (เริ่ม >= 0) { ตัด = ตัด.slice(0, เริ่ม); ในคำอธิบาย = true; }
    ตัด = ตัด.replace(/(^|[^:"'`])\/\/.*$/, "$1");   // คำอธิบายท้ายบรรทัด (ไม่ตัด http://)
    if (ทาง.endsWith(".sh") && /^\s*#/.test(ตัด)) return;
    for (const [เจอไหม, เหตุ] of แบบ) if (เจอไหม(ตัด)) { เจอ.push(`${ทาง}:${i + 1}  ${เหตุ}\n      ${บรรทัด.trim().slice(0, 120)}`); break; }
  });
}
if (เจอ.length) {
  console.error(`✗ check-hardcoded-ports: เขียนพอร์ต/ที่อยู่เว็บในเครื่องไว้เอง ${เจอ.length} จุด — ใช้ scripts/lib/session.mjs หรือ tests/scenario/sessionPorts.ts แทน`);
  for (const x of เจอ) console.error(`  ${x}`);
  process.exit(1);
}
console.log("✓ check-hardcoded-ports: ไม่มีเลขพอร์ต/ที่อยู่เว็บในเครื่องเขียนไว้เองในโค้ดและชุดทดสอบ");
