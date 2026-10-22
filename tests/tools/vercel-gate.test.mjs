// ── ข้อทดสอบ: ด่าน Vercel ชั้นที่สอง — monorepo ไม่ build commit ที่ไม่ผ่านรอบตรวจเต็ม (บอสสั่ง 22 ต.ค. 69) ──────────────
// repo จำลองในโฟลเดอร์ชั่วคราว · เรียก scripts/vercel-should-build.mjs แบบที่ Vercel เรียก (env VERCEL_GIT_COMMIT_REF)
//   ⚠️ ความหมายรหัสจบงานกลับด้าน: exit 0 = ไม่ build · exit 1 = build
// จำลองการตัดไฟล์ตาม .vercelignore ก่อนรัน (เซิร์ฟเวอร์ไม่มีไฟล์ที่ถูกกัน) — ด่านต้องยังทำงาน ไม่ขาดไฟล์
// mutation proof: PMS_VERCEL_MUTATE=gate|ignore → ข้อทดสอบต้องตก
// รัน: node tests/tools/vercel-gate.test.mjs
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync, execFileSync } from "node:child_process";
import { ลายนิ้วมือโค้ด } from "../../scripts/lib/commitGate.mjs";

const ราก = process.cwd();
const ที่ = mkdtempSync(join(tmpdir(), "vercel-gate-"));
const repo = join(ที่, "repo");
const git = (...a) => execFileSync("git", ["-c", "core.autocrlf=false", "-c", "user.name=ทดสอบ", "-c", "user.email=t@example.test", ...a],
  { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const เขียน = (f, s) => { mkdirSync(dirname(join(repo, f)), { recursive: true }); writeFileSync(join(repo, f), s); };
const คัด = f => { mkdirSync(dirname(join(repo, f)), { recursive: true }); copyFileSync(join(ราก, f), join(repo, f)); };
const แก้ = (f, a, b) => { const p = join(repo, f), s = readFileSync(p, "utf8").replace(/\r\n/g, "\n"); if (!s.includes(a)) throw new Error(`ไม่พบ ${a}`); writeFileSync(p, s.replace(a, b)); };

/** รันด่านแบบ Vercel: คัดลอกเฉพาะไฟล์ที่ไม่ถูก .vercelignore กัน ไปโฟลเดอร์ใหม่ (พร้อม .git) แล้วรันจาก apps/hq */
function รันด่าน(branch) {
  const ส่งขึ้น = join(ที่, `upload-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  execFileSync("git", ["clone", "-q", repo, ส่งขึ้น]);
  const ถูกกัน = execFileSync("git", ["-c", "core.quotepath=false", "ls-files", "--ignored", "--cached", "--exclude-from=.vercelignore"], { cwd: ส่งขึ้น, encoding: "utf8" })
    .split("\n").filter(Boolean);
  for (const f of ถูกกัน) rmSync(join(ส่งขึ้น, f), { force: true });
  mkdirSync(join(ส่งขึ้น, "apps/hq"), { recursive: true });
  const r = spawnSync(process.execPath, ["../../scripts/vercel-should-build.mjs"], { cwd: join(ส่งขึ้น, "apps/hq"), encoding: "utf8",
    env: { ...process.env, VERCEL_GIT_COMMIT_REF: branch, VERCEL_GIT_COMMIT_MESSAGE: "งานทดสอบ" } });
  rmSync(ส่งขึ้น, { recursive: true, force: true });
  return { build: r.status === 1, ข้าม: r.status === 0, ข้อความ: (r.stdout ?? "") + (r.stderr ?? ""), ถูกกัน };
}

let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n${เพิ่ม}`}`); };

try {
  mkdirSync(repo);
  execFileSync("git", ["init", "-q", "-b", "monorepo"], { cwd: repo });
  for (const f of [".vercelignore", "scripts/vercel-should-build.mjs", "scripts/lib/commitGate.mjs", "scripts/lib/session.mjs"]) คัด(f);
  เขียน("scripts/check-อื่น.mjs", "// สคริปต์ดูแลระบบ — ต้องถูกกัน\n");
  เขียน("apps/hq/page.ts", "export const a = 1;\n");
  const พัง = process.env.PMS_VERCEL_MUTATE;
  if (พัง === "gate") แก้("scripts/vercel-should-build.mjs", "if (!ผล.ผ่าน) ข้าม(ผล.เหตุ);", "");
  if (พัง === "ignore") แก้(".vercelignore", "!scripts/lib/commitGate.mjs", "");
  git("add", "-A"); git("commit", "-qm", "งานเริ่มต้น");

  // 0) ไฟล์ที่ด่านต้องใช้ไม่ถูก .vercelignore กัน · สคริปต์อื่นยังถูกกัน
  let r = รันด่าน("monorepo");
  ผล(!r.ถูกกัน.includes("scripts/lib/commitGate.mjs") && !r.ถูกกัน.includes("scripts/vercel-should-build.mjs") && r.ถูกกัน.includes("scripts/check-อื่น.mjs"),
    ".vercelignore: เก็บ commitGate.mjs + ด่านไว้ · กันสคริปต์อื่น", r.ถูกกัน.join(", "));

  // 1) monorepo ไม่มีผลรอบตรวจ → ไม่ build บอกเหตุผล
  ผล(r.ข้าม && /ยังไม่มีผลรอบตรวจเต็มผ่าน/.test(r.ข้อความ), "monorepo · ยังไม่ผ่านรอบตรวจ → ไม่ build (บอกเหตุผลภาษาไทย)", r.ข้อความ);

  // 2) มีบรรทัดลายนิ้วมือใน commit → build
  mkdirSync(join(repo, "supabase"), { recursive: true });
  appendFileSync(join(repo, "supabase/gate-passed-code.txt"), `${ลายนิ้วมือโค้ด("HEAD", repo)} ทดสอบ ${git("rev-parse", "--short=12", "HEAD")} จำลอง\n`);
  git("add", "-A"); git("commit", "-qm", "บันทึกผลรอบตรวจ");
  r = รันด่าน("monorepo");
  ผล(r.build && /ผ่านรอบตรวจเต็มแล้ว/.test(r.ข้อความ), "monorepo · ผ่านรอบตรวจ (หลังตัดไฟล์ตาม .vercelignore) → build", r.ข้อความ);

  // 3) แก้โค้ดหลังผ่าน → ลายนิ้วมือเปลี่ยน → ไม่ build
  เขียน("apps/hq/page.ts", "export const a = 2;\n"); git("add", "-A"); git("commit", "-qm", "แก้หลังผ่าน");
  r = รันด่าน("monorepo");
  ผล(r.ข้าม && /ยังไม่มีผลรอบตรวจเต็มผ่าน/.test(r.ข้อความ), "แก้โค้ดหลังผ่านรอบตรวจ → ไม่ build", r.ข้อความ);

  // 4) branch อื่น → ไม่ build (ด่านเดิม) ไม่ว่าผ่านหรือไม่
  r = รันด่าน("wip/integration");
  ผล(r.ข้าม && /ไม่ใช่ monorepo/.test(r.ข้อความ), "wip/integration → ไม่ build (ด่านเดิมยังทำงาน)", r.ข้อความ);
} finally {
  rmSync(ที่, { recursive: true, force: true });
}
console.log(ตก ? `FAIL ${ตก}` : "ALL PASS");
process.exit(ตก ? 1 : 0);
