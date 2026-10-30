// ── รอบตรวจเต็มตกเพราะข้อทดสอบ → แก้แค่ไฟล์ทดสอบที่ตก → รันซ้ำเฉพาะไฟล์นั้น + ตัวตรวจ แล้วนับรวมกับผลเดิม (บอสสั่ง 29 ต.ค. 69 · คิวข้อ 5) ──
//
// เดิม: แก้ข้อทดสอบที่ตกบรรทัดเดียว = รันรอบตรวจเต็มใหม่ทั้งรอบ (~35 นาที · 29 ต.ค. 69 เสียรอบแบบนี้หลายรอบ)
// ตอนนี้:
//   1) รอบตรวจเต็มตก และ "ทุกเหตุที่ตก" เป็นข้อทดสอบ (รันซ้ำในรอบแล้วยังตก · ไม่นิ่งครบเกณฑ์โดยไม่มีต้นเหตุ)
//      → จดผลรอบนี้ไว้ (commit ที่ตรวจ · ไฟล์ที่ตก · รายงานทุกช่วง) ที่ test-results/gate-resume/<sha>.json
//      ตกเพราะอย่างอื่น (ตัวตรวจขั้นแรก · build · เซิร์ฟเวอร์ · ช่วงล้มทั้งช่วง · prod-live · มีไฟล์ค้างตอนเริ่ม) = ไม่จด → รันเต็มเหมือนเดิม
//   2) รอบถัดไป (npm run test:prodbuild ไม่ระบุไฟล์) ใช้ผลที่จดได้เมื่อ:
//      · commit ที่จดเป็นบรรพบุรุษของ HEAD และไม่มีไฟล์ค้าง
//      · ไฟล์ที่เปลี่ยนตั้งแต่ commit ที่จด (ไม่นับไฟล์บันทึกของรอบตรวจ เช่น tests/flaky-log.txt) อยู่ในชุดไฟล์ที่ตกทั้งหมด
//      แตะไฟล์อื่น (โค้ดแอป · ใบปรับฐาน · ไฟล์ทดสอบอื่น · ตัวช่วยทดสอบ · ค่าตั้ง) = ใช้ไม่ได้ → รันเต็ม
//   3) โหมดรันต่อ: typecheck + ตัวตรวจกับดัก → build → รันเฉพาะไฟล์ที่ตก (ช่วงเดิมของแต่ละไฟล์)
//      → ตัวตรวจท้ายรอบอ่าน "รายงานเดิมทุกช่วง + รายงานรันต่อ" (รันต่อทับผลข้อเดียวกัน) · ตัวนับไม่นิ่งเหมือนเดิม
//      ผ่าน = บันทึกผลผ่านของ HEAD (ลายนิ้วมือโค้ดของ HEAD) — รอบเดิมได้ตรวจทุกไฟล์อื่นบนโค้ดเดียวกันแล้ว
// ผลที่จดผูกกับรอบเดียว: รอบรันต่อผ่าน/รอบเต็มรอบใหม่เริ่ม = ลบที่จดของ commit นั้น (ห้ามเอาผลรอบเก่ากว่ามาปน)
// ข้อทดสอบ: tests/tools/gate-resume.test.mjs
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ไฟล์ของรอบตรวจ } from "./commitGate.mjs";
import { ข้อในรายงาน } from "./gateRerun.mjs";

export const โฟลเดอร์จด = (cwd = process.cwd()) => path.join(cwd, process.env.PMS_GATE_RESUME_DIR ?? "test-results/gate-resume");
const git = (args, cwd) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

/** ไฟล์ข้อทดสอบจากตัวระบุข้อ ("x.spec.ts › ชื่อ") — หาในรายงานที่มีเส้นทางเต็ม */
const ไฟล์จากตัวระบุ = (key, ข้อทั้งหมด) => ข้อทั้งหมด.find(x => x.key === key);

/**
 * จดผลรอบที่ตกเพราะข้อทดสอบล้วน · คืนเหตุผลถ้าไม่จด ("" = จดแล้ว)
 * @param {{ sha: string, ค้าง: string[], ขั้นอื่นตก: string[], รายงาน: string[], ตกจริง: {ไฟล์?: string, โปรเจกต์?: string, ข้อ: string}[],
 *           ไม่นิ่งค้าง: string[], cwd?: string }} o
 */
export function จดรอบที่ตก({ sha, ค้าง, ขั้นอื่นตก, รายงาน, ตกจริง, ไม่นิ่งค้าง, cwd = process.cwd() }) {
  if (ค้าง.length) return "ตอนเริ่มรอบมีไฟล์ที่ยังไม่ commit — ไม่จด";
  if (ขั้นอื่นตก.length) return `ตกที่ ${ขั้นอื่นตก.join(" · ")} (ไม่ใช่ข้อทดสอบ) — ไม่จด`;
  const ข้อทั้งหมด = รายงาน.flatMap(r => ข้อในรายงาน(r, cwd)?.ข้อ ?? []);
  const ไฟล์ตก = new Map();   // ไฟล์ → โปรเจกต์
  for (const x of ตกจริง) {
    if (!x.ไฟล์ || !x.โปรเจกต์) return `${x.ข้อ} — ไม่ใช่ข้อทดสอบรายไฟล์ ไม่จด`;
    ไฟล์ตก.set(x.ไฟล์, x.โปรเจกต์);
  }
  for (const key of ไม่นิ่งค้าง) {
    const x = ไฟล์จากตัวระบุ(key, ข้อทั้งหมด);
    if (!x) return `${key} — หาไฟล์ในรายงานไม่เจอ ไม่จด`;
    ไฟล์ตก.set(x.ไฟล์, x.โปรเจกต์);
  }
  if (!ไฟล์ตก.size) return "ไม่มีข้อทดสอบที่ตก — ไม่จด";
  const ที่ = path.join(โฟลเดอร์จด(cwd), sha);
  rmSync(ที่, { recursive: true, force: true });
  mkdirSync(ที่, { recursive: true });
  const สำเนา = รายงาน.filter(r => existsSync(r)).map((r, i) => { const ปลายทาง = path.join(ที่, `${i}-${path.basename(r)}`); copyFileSync(r, ปลายทาง); return ปลายทาง; });
  writeFileSync(path.join(ที่, "รอบที่ตก.json"), JSON.stringify({ sha, ไฟล์ตก: [...ไฟล์ตก].map(([ไฟล์, โปรเจกต์]) => ({ ไฟล์, โปรเจกต์ })), รายงาน: สำเนา,
    เมื่อ: new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 19).replace("T", " ") }, null, 1) + "\n");
  return "";
}

/** หาผลที่จดที่ใช้กับ HEAD ได้ · คืน { ได้: true, จด } หรือ { ได้: false, เหตุ } */
export function ตรวจรันต่อได้(cwd = process.cwd()) {
  const ราก = โฟลเดอร์จด(cwd);
  if (!existsSync(ราก)) return { ได้: false, เหตุ: "ไม่มีผลรอบที่ตกที่จดไว้" };
  if (git(["status", "--porcelain"], cwd)) return { ได้: false, เหตุ: "มีไฟล์ที่ยังไม่ commit" };
  const head = git(["rev-parse", "HEAD"], cwd);
  const จดทั้งหมด = readdirSync(ราก).map(d => path.join(ราก, d, "รอบที่ตก.json")).filter(existsSync)
    .map(f => JSON.parse(readFileSync(f, "utf8")))
    .filter(j => { try { execFileSync("git", ["merge-base", "--is-ancestor", j.sha, head], { cwd, stdio: "ignore" }); return true; } catch { return false; } });
  if (!จดทั้งหมด.length) return { ได้: false, เหตุ: "ผลที่จดไว้ไม่ใช่ของ commit ก่อนหน้า HEAD" };
  // ใกล้ HEAD ที่สุด (ระยะ commit น้อยสุด) = รอบล่าสุดของสายนี้
  const ระยะ = (sha) => Number(git(["rev-list", "--count", `${sha}..${head}`], cwd));
  const จด = จดทั้งหมด.sort((a, b) => ระยะ(a.sha) - ระยะ(b.sha))[0];
  if (จด.รายงาน.some(r => !existsSync(r))) return { ได้: false, เหตุ: "รายงานของรอบที่จดหาย" };
  const เปลี่ยน = git(["diff", "--name-only", จด.sha, head], cwd).split("\n").filter(Boolean).filter(f => !ไฟล์ของรอบตรวจ.includes(f));
  const ไฟล์ตก = new Set(จด.ไฟล์ตก.map(x => x.ไฟล์));
  const นอก = เปลี่ยน.filter(f => !ไฟล์ตก.has(f));
  if (นอก.length) return { ได้: false, เหตุ: `แตะไฟล์ที่ไม่ใช่ไฟล์ทดสอบที่ตก ${นอก.length} ไฟล์ (${นอก.slice(0, 5).join(" · ")}${นอก.length > 5 ? " …" : ""}) — รันเต็ม` };
  return { ได้: true, จด, เปลี่ยน };
}

/** ข้อในไฟล์ที่รันต่อ ซึ่งมีในรายงานเดิมแต่หายจากรายงานใหม่ (ลบข้อทิ้ง = ลดข้อทดสอบ · ไม่นับว่าผ่าน) · เทียบด้วยไฟล์ › ชื่อข้อ › โปรเจกต์ (ไม่ใช้บรรทัด) */
export function ข้อที่หาย(รายงานเดิม, รายงานใหม่, ไฟล์, cwd = process.cwd()) {
  const ชุด = new Set(ไฟล์.map(f => path.basename(f)));
  const ของ = (rs) => rs.flatMap(r => ข้อในรายงาน(r, cwd)?.ข้อ ?? []).filter(x => ชุด.has(path.basename(x.ไฟล์))).map(x => `${x.key} [${x.โปรเจกต์}]`);
  const ใหม่ = new Set(ของ(รายงานใหม่));
  return [...new Set(ของ(รายงานเดิม))].filter(k => !ใหม่.has(k));
}

/** รอบรันต่อผ่าน / รอบเต็มรอบใหม่เริ่ม → ลบที่จด (ผลผูกกับรอบเดียว) */
export function ลบที่จด(cwd = process.cwd()) { rmSync(โฟลเดอร์จด(cwd), { recursive: true, force: true }); }
