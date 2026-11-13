// ── ข้อทดสอบ: check-untracked-code — ไฟล์โค้ดในแอป/แพ็กเกจที่ git ยังไม่เก็บ = ตก (บอสสั่ง 12 พ.ย. 69) ───────────────────────────
//   ที่เก็บ git จำลองในโฟลเดอร์ชั่วคราว — ไม่แตะที่เก็บจริง
//   ตกบนโค้ดเดิม: ไม่มีตัวตรวจ · ชุด checks ไม่ครอบ
// รัน: node tests/tools/untracked-code.test.mjs
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n   ${String(เพิ่ม).slice(0, 800)}`}`); };
const ตัวตรวจ = resolve("scripts/check-untracked-code.mjs");
if (!existsSync(ตัวตรวจ)) { ผล(false, "มีตัวตรวจ scripts/check-untracked-code.mjs"); console.log("\n✗ ตก 1 ข้อ"); process.exit(1); }

const ที่ = mkdtempSync(join(tmpdir(), "untracked-"));
const git = (...a) => spawnSync("git", ["-C", ที่, ...a], { encoding: "utf8" });
const ตรวจ = () => { const r = spawnSync(process.execPath, [ตัวตรวจ, ที่], { encoding: "utf8" }); return { ผ่าน: r.status === 0, ข้อความ: (r.stdout ?? "") + (r.stderr ?? "") }; };
try {
  git("init", "-q"); git("config", "user.email", "t@example.test"); git("config", "user.name", "t");
  mkdirSync(join(ที่, "packages/shared/lib"), { recursive: true }); mkdirSync(join(ที่, "apps/hq/.next"), { recursive: true });
  writeFileSync(join(ที่, ".gitignore"), ".next/\n");
  writeFileSync(join(ที่, "packages/shared/lib/a.ts"), "export const a = 1;\n");
  git("add", "-A"); git("commit", "-q", "-m", "เริ่ม");
  let r = ตรวจ();
  ผล(r.ผ่าน, "ทุกไฟล์ถูกเก็บ → ผ่าน", r.ข้อความ);
  writeFileSync(join(ที่, "packages/shared/lib/systemActor.ts"), "export const x = \"อัปเดตอัตโนมัติ\";\n");
  r = ตรวจ();
  ผล(!r.ผ่าน && /systemActor\.ts/.test(r.ข้อความ), "ไฟล์โค้ดใหม่ใน packages ยังไม่ git add (แบบ 91c1083c) → ตก", r.ข้อความ);
  git("add", "packages/shared/lib/systemActor.ts");
  ผล(ตรวจ().ผ่าน, "git add แล้ว (ยังไม่ commit) → ผ่าน");
  writeFileSync(join(ที่, "apps/hq/.next/build.js"), "x");
  ผล(ตรวจ().ผ่าน, "ไฟล์ที่ .gitignore กันไว้ (.next) ไม่นับ → ผ่าน");
  writeFileSync(join(ที่, "apps/hq/page.tsx"), "x");
  ผล(!ตรวจ().ผ่าน, "ไฟล์ใหม่ใน apps → ตก");
} finally { rmSync(ที่, { recursive: true, force: true }); }

const ชุด = JSON.parse(readFileSync("package.json", "utf8")).scripts.checks ?? "";
ผล(ชุด.includes("check-untracked-code.mjs"), "ชุดตรวจก่อน commit (npm run checks) ครอบ check-untracked-code", ชุด.slice(0, 200));
console.log(ตก ? `\n✗ ตก ${ตก} ข้อ` : "\nALL PASS");
process.exit(ตก ? 1 : 0);
