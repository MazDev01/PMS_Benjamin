// ── ข้อทดสอบ: ตัวตรวจ check-tool-tests-in-gate (บอสสั่ง 29 ต.ค. 69) ─────────────────────────────────────────────────────
// โฟลเดอร์จำลอง: ชุดที่มีตัวห่อ → ผ่าน · มีชุดไม่มีตัวห่อ → ตก ชี้ชื่อไฟล์ · ตัวห่อเขียนชื่อไม่เต็ม (แค่ "${ไฟล์}") → ตก
//   + ของจริงในโฟลเดอร์นี้ต้องผ่าน (ทุกชุดอยู่ในรอบตรวจ)
// รัน: node tests/tools/tool-tests-in-gate.test.mjs
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const ตัวตรวจ = join(process.cwd(), "scripts/check-tool-tests-in-gate.mjs");
const ที่ = mkdtempSync(join(tmpdir(), "tool-gate-"));
const รัน = (root) => { const r = spawnSync(process.execPath, [ตัวตรวจ], { encoding: "utf8", env: { ...process.env, ...(root ? { PMS_TOOL_GATE_ROOT: root } : {}) } });
  return { ได้: r.status === 0, ข้อความ: (r.stdout ?? "") + (r.stderr ?? "") }; };
let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n${เพิ่ม}`}`); };

try {
  mkdirSync(join(ที่, "tests/tools"), { recursive: true }); mkdirSync(join(ที่, "tests/scenario"), { recursive: true });
  writeFileSync(join(ที่, "tests/tools/a.test.mjs"), "console.log('ALL PASS');\n");
  writeFileSync(join(ที่, "tests/scenario/a-tool.spec.ts"), 'spawnSync(process.execPath, ["tests/tools/a.test.mjs"]);\n');
  let r = รัน(ที่);
  ผล(r.ได้, "ทุกชุดมีตัวห่อ → ผ่าน", r.ข้อความ);
  writeFileSync(join(ที่, "tests/tools/b.test.mjs"), "console.log('ALL PASS');\n");
  r = รัน(ที่);
  ผล(!r.ได้ && /tests\/tools\/b\.test\.mjs/.test(r.ข้อความ) && !/tests\/tools\/a\.test\.mjs/.test(r.ข้อความ), "ชุด b ไม่มีตัวห่อ → ตก ชี้ไฟล์ b ไม่ชี้ a", r.ข้อความ);
  writeFileSync(join(ที่, "tests/scenario/b-tool.spec.ts"), 'const ไฟล์ = "b.test.mjs"; spawnSync(process.execPath, [`tests/tools/${ไฟล์}`]);\n');
  r = รัน(ที่);
  ผล(!r.ได้ && /b\.test\.mjs/.test(r.ข้อความ), "ตัวห่อเขียนชื่อไม่เต็ม (ประกอบจากตัวแปร) → ตก (ต้องเห็นชื่อไฟล์เต็มในข้อทดสอบ)", r.ข้อความ);
  r = รัน("");
  ผล(r.ได้, "ของจริงในโฟลเดอร์นี้: ข้อทดสอบเครื่องมือทุกชุดอยู่ในรอบตรวจเต็ม", r.ข้อความ);
} finally {
  rmSync(ที่, { recursive: true, force: true });
}
console.log(ตก ? `FAIL ${ตก}` : "ALL PASS");
process.exit(ตก ? 1 : 0);
