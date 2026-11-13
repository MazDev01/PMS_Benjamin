// ── ตัวตรวจ lint (บอสสั่ง 12 พ.ย. 69 · รายการรอรอบฉบับแก้ rmwczxarnenj) ─────────────────────────────────
//   ข้อผิดพลาด lint (HQ · ดีลเลอร์ · shared) ต้อง = 0 — มีแม้ข้อเดียว = checks ตก (commit ไม่ได้ · รอบตรวจเต็มตก)
//   คำเตือนห้ามเกินเพดาน scripts/lint-ceiling.json (ห้ามเพิ่ม ลดได้ — ลดแล้วให้ลดเพดานตามในงานเดียวกัน)
//   ใช้กฎมาตรฐานเดิมทั้งหมด (บอสตัดสิน 12 พ.ย. 69: ห้ามแก้/เขียนกฎเอง ห้ามปิดกฎ) — ฟ้องผิดจากชื่อไทย = เปลี่ยนชื่อฟังก์ชัน
//     rules-of-hooks รู้จัก hook = /^use[A-Z0-9]/ · คอมโพเนนต์ = /^[A-Z]/ เท่านั้น (ไม่มีตัวเลือก) → ฟังก์ชันที่เรียก hook ต้องตั้งชื่ออังกฤษ
//   ข้อทดสอบ: tests/tools/lint-gate.test.mjs
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ไฟล์เพดาน = "scripts/lint-ceiling.json";
export const ส่วน = [
  { ชื่อ: "HQ", cwd: "apps/hq", สั่ง: (out) => ["next", "lint", "--format", "json", "--output-file", out] },
  { ชื่อ: "ดีลเลอร์", cwd: "apps/dealer", สั่ง: (out) => ["next", "lint", "--format", "json", "--output-file", out] },
  { ชื่อ: "shared", cwd: "packages/shared", สั่ง: (out) => ["eslint", ".", "--format", "json", "--output-file", out] },
];

/** ตัดสินจากผลนับ → { ผ่าน, ข้อความ[] } (ฟังก์ชันล้วน · ข้อทดสอบเรียกตรง) */
export function ตัดสิน({ ผล, เพดาน }) {
  const ผิด = ผล.reduce((a, x) => a + x.ผิด, 0), เตือน = ผล.reduce((a, x) => a + x.เตือน, 0);
  const ข้อความ = [`lint: ข้อผิดพลาด ${ผิด} · คำเตือน ${เตือน} (เพดาน ${เพดาน}) — ${ผล.map(x => `${x.ชื่อ} ${x.ผิด}/${x.เตือน}`).join(" · ")}`];
  let ผ่าน = true;
  if (ผิด > 0) { ผ่าน = false; ข้อความ.push(`⛔ มีข้อผิดพลาด lint ${ผิด} ข้อ — ต้องเป็น 0 (ห้ามปิดกฎ · ชื่อไทยที่ถูกฟ้อง rules-of-hooks = เปลี่ยนชื่อเป็นอังกฤษ)`); }
  if (เตือน > เพดาน) { ผ่าน = false; ข้อความ.push(`⛔ คำเตือน lint ${เตือน} เกินเพดาน ${เพดาน} (${ไฟล์เพดาน}) — ห้ามเพิ่มคำเตือน แก้คำเตือนที่เพิ่มมา`); }
  else if (เตือน < เพดาน) ข้อความ.push(`ℹ คำเตือนลดลงเหลือ ${เตือน} — ลดเพดานใน ${ไฟล์เพดาน} เป็น ${เตือน} ในงานเดียวกันได้`);
  return { ผ่าน, ผิด, เตือน, ข้อความ };
}

/** นับจากรายงาน JSON ของ eslint */
export const นับรายงาน = (j) => ({ ผิด: j.reduce((a, f) => a + (f.errorCount ?? 0), 0), เตือน: j.reduce((a, f) => a + (f.warningCount ?? 0), 0),
  ตัวอย่าง: j.flatMap(f => f.messages.filter(m => m.severity === 2).map(m => `${f.filePath}:${m.line}:${m.column} ${m.ruleId}`)).slice(0, 10) });

function รัน(ราก) {
  const ที่ = mkdtempSync(path.join(tmpdir(), "pms-lint-"));
  try {
    return ส่วน.map(x => {
      const out = path.join(ที่, `${x.cwd.replaceAll("/", "_")}.json`);
      const r = spawnSync(process.platform === "win32" ? "npx.cmd" : "npx", x.สั่ง(out), { cwd: path.join(ราก, x.cwd), encoding: "utf8", shell: process.platform === "win32" });
      let j; try { j = JSON.parse(readFileSync(out, "utf8")); } catch { throw new Error(`lint ${x.ชื่อ} ไม่ได้ผล (exit ${r.status})\n${(r.stdout ?? "") + (r.stderr ?? "")}`.slice(0, 2000)); }
      return { ชื่อ: x.ชื่อ, ...นับรายงาน(j) };
    });
  } finally { rmSync(ที่, { recursive: true, force: true }); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const ราก = process.cwd();
  const เพดาน = JSON.parse(readFileSync(path.join(ราก, ไฟล์เพดาน), "utf8")).คำเตือนสูงสุด;
  const ผล = รัน(ราก);
  const ต = ตัดสิน({ ผล, เพดาน });
  for (const l of ต.ข้อความ) (ต.ผ่าน ? console.log : console.error)(l);
  if (ต.ผิด) for (const x of ผล) for (const e of x.ตัวอย่าง) console.error(`   ${e}`);
  if (ต.ผ่าน) console.log("✓ check-lint: ไม่มีข้อผิดพลาด lint · คำเตือนไม่เกินเพดาน");
  process.exit(ต.ผ่าน ? 0 : 1);
}
