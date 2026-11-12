// ── ตัวตรวจก่อน commit: ไฟล์โค้ดในแอป/แพ็กเกจที่ git ยังไม่เก็บ = ตก (บอสสั่ง 12 พ.ย. 69) ─────────────────────────────────────
//   เหตุ: 91c1083c ผ่าน check-ui-terms ทั้งที่ lib/systemActor.ts มีคำห้าม — ตอนรัน npm run checks ไฟล์ยังไม่ถูก git add
//   (ตัวตรวจหลายตัวอ่านเฉพาะไฟล์ที่ git เก็บ) แล้ว git add -A ตามหลัง → ของที่ไม่ได้ตรวจเข้า commit
//   กติกา: ไฟล์ใหม่ต้อง git add ก่อนรันชุดตรวจ (git add <ไฟล์ใหม่> && npm run checks && npm run test:unit && git commit -- …)
//   ตรวจ: git ls-files --others --exclude-standard ใต้ apps/ · packages/ (ไม่นับไฟล์ที่ .gitignore กันไว้ เช่น .next node_modules)
//   นามสกุลโค้ด: ts tsx js jsx mjs cjs css sql json html md
// ใช้: node scripts/check-untracked-code.mjs [ราก git] (อยู่ใน npm run checks) · ข้อทดสอบ: tests/tools/untracked-code.test.mjs
import { spawnSync } from "node:child_process";

const ราก = process.argv[2] ?? ".";
const r = spawnSync("git", ["-C", ราก, "ls-files", "--others", "--exclude-standard", "-z", "--", "apps", "packages"], { encoding: "utf8" });
if (r.status !== 0) { console.error(`✗ check-untracked-code: อ่าน git ไม่ได้ — ${(r.stderr ?? "").trim()}`); process.exit(1); }
const ไม่เก็บ = r.stdout.split("\0").filter(Boolean).filter(f => /\.(ts|tsx|js|jsx|mjs|cjs|css|sql|json|html|md)$/i.test(f));
if (ไม่เก็บ.length) {
  console.error(`✗ check-untracked-code: ไฟล์โค้ดในแอป/แพ็กเกจที่ git ยังไม่เก็บ ${ไม่เก็บ.length} ไฟล์ — ตัวตรวจอื่นอ่านไม่ถึง (git add ก่อนรันชุดตรวจ)\n   ${ไม่เก็บ.join("\n   ")}`);
  process.exit(1);
}
console.log("✓ check-untracked-code: ไฟล์โค้ดในแอป/แพ็กเกจถูก git เก็บครบ");
