// ── ข้อทดสอบ: git pre-push กัน push ขึ้น monorepo ก่อนพร้อม (บอสสั่ง 22 ต.ค. 69) ───────────────────────────────────
// สร้าง repo จำลอง + remote ปลอม (bare repo ในโฟลเดอร์ชั่วคราว) — ไม่ push ขึ้น GitHub จริงเด็ดขาด
// คัดลอกตัวกัน (.githooks/pre-push · scripts/git-hooks/pre-push.mjs · scripts/lib/commitGate.mjs · session.mjs) ไปไว้ใน repo จำลอง
//   ผลรอบตรวจ = บรรทัดลายนิ้วมือใน supabase/gate-passed-code.txt ที่ commit ไว้ (แบบเดียวกับของจริง)
//   ใบบนฐานจริงปลอมด้วยไฟล์ (PMS_PROD_VERSIONS_FILE — ใช้ได้เฉพาะ remote ที่ไม่ใช่ GitHub)
// mutation proof: PMS_PREPUSH_MUTATE=reject|gate|prod|github ทำตัวกันในสำเนาให้พังทีละแบบ → ข้อทดสอบต้องตก
// รัน: node tests/tools/pre-push-guard.test.mjs
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync, execFileSync } from "node:child_process";
import { ลายนิ้วมือโค้ด } from "../../scripts/lib/commitGate.mjs";

const ราก = process.cwd();
const ที่ = mkdtempSync(join(tmpdir(), "prepush-guard-"));
const repo = join(ที่, "repo"), remote = join(ที่, "remote.git");
const ใบฐานจริง = join(ที่, "prod-versions.json");
const env = { ...process.env, PMS_PROD_VERSIONS_FILE: ใบฐานจริง };
const git = (...a) => execFileSync("git", ["-c", "core.autocrlf=false", "-c", "user.name=ทดสอบ", "-c", "user.email=t@example.test", ...a],
  { cwd: repo, encoding: "utf8", env, stdio: ["ignore", "pipe", "pipe"] }).trim();
const เขียน = (f, s) => { mkdirSync(dirname(join(repo, f)), { recursive: true }); writeFileSync(join(repo, f), s); };
const คัด = f => { mkdirSync(dirname(join(repo, f)), { recursive: true }); copyFileSync(join(ราก, f), join(repo, f)); };
/** จำลองรอบตรวจเต็มผ่านที่ HEAD: ต่อท้ายลายนิ้วมือ แล้ว commit ไฟล์บันทึก (ลายนิ้วมือไม่เปลี่ยนเพราะไม่นับไฟล์บันทึก) */
const ผ่านรอบตรวจ = () => {
  appendFileSync(join(repo, "supabase/gate-passed-code.txt"), `${ลายนิ้วมือโค้ด("HEAD", repo)} ทดสอบ ${git("rev-parse", "--short=12", "HEAD")} จำลอง\n`);
  git("add", "supabase/gate-passed-code.txt"); git("commit", "-qm", "บันทึกผลรอบตรวจ");
  return git("rev-parse", "HEAD");
};
const ตั้งใบฐานจริง = (v) => writeFileSync(ใบฐานจริง, JSON.stringify(v));
const push = (...a) => { const r = spawnSync("git", ["push", "origin", ...a], { cwd: repo, encoding: "utf8", env });
  return { ได้: r.status === 0, ข้อความ: r.stdout + r.stderr }; };
const บนremote = (ref) => { try { return execFileSync("git", ["rev-parse", ref], { cwd: remote, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return ""; } };

let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n${เพิ่ม}`}`); };

try {
  execFileSync("git", ["init", "-q", "--bare", remote]);
  mkdirSync(repo);
  execFileSync("git", ["init", "-q", "-b", "monorepo"], { cwd: repo });
  for (const f of [".githooks/pre-push", "scripts/git-hooks/pre-push.mjs", "scripts/lib/commitGate.mjs", "scripts/lib/session.mjs", "scripts/lib/ports.json"]) คัด(f);
  // ── mutation proof: ทำตัวกันในสำเนาให้พังทีละแบบ ──
  //   แปลงขึ้นบรรทัดเป็น \n ก่อน — โฟลเดอร์ที่ git แปลงเป็น CRLF จะหาข้อความไม่เจอ (ข้อทดสอบพังเองแทนที่จะพิสูจน์)
  const แก้สำเนา = (f, a, b) => { const p = join(repo, f), s = readFileSync(p, "utf8").replace(/\r\n/g, "\n"); if (!s.includes(a)) throw new Error(`ไม่พบ ${a}`); writeFileSync(p, s.replace(a, b)); };
  const พัง = process.env.PMS_PREPUSH_MUTATE;
  if (พัง === "reject") แก้สำเนา("scripts/git-hooks/pre-push.mjs", "  process.exit(1);\n};", "  process.exit(0);\n};");
  if (พัง === "gate") แก้สำเนา("scripts/git-hooks/pre-push.mjs", "if (!ผล.ผ่าน) ปฏิเสธ([ผล.เหตุ]);", "");
  if (พัง === "prod") แก้สำเนา("scripts/git-hooks/pre-push.mjs", "if (ยังไม่ลง.length) ปฏิเสธ", "if (false) ปฏิเสธ");
  if (พัง === "github") แก้สำเนา("scripts/git-hooks/pre-push.mjs", "if (!ของจริง && process.env.PMS_PROD_VERSIONS_FILE)", "if (process.env.PMS_PROD_VERSIONS_FILE)");
  เขียน("supabase/migrations/0001_a.sql", "select 1;\n");
  เขียน("supabase/migrations/0002_b.sql", "select 2;\n");
  git("add", "-A"); git("commit", "-qm", "ใบ 0001-0002");
  git("config", "core.hooksPath", ".githooks");
  git("remote", "add", "origin", remote);

  // 1) ไม่มีผลรอบตรวจ → ปฏิเสธ
  ตั้งใบฐานจริง(["0001", "0002"]);
  let r = push("monorepo");
  ผล(!r.ได้ && /ยังไม่มีผลรอบตรวจเต็มผ่าน/.test(r.ข้อความ) && !บนremote("monorepo"), "ไม่มีผลรอบตรวจเต็ม → push monorepo ถูกปฏิเสธ (บอกเหตุผลภาษาไทย)", r.ข้อความ);

  // 2) มีผลรอบตรวจ แต่ใบ 0002 ยังไม่ลงฐานจริง → ปฏิเสธ
  const B = ผ่านรอบตรวจ(); ตั้งใบฐานจริง(["0001"]);
  r = push("monorepo");
  ผล(!r.ได้ && /ยังไม่ลงฐานจริง 1 ใบ: 0002/.test(r.ข้อความ) && !บนremote("monorepo"), "ผ่านรอบตรวจแล้วแต่ใบ 0002 ยังไม่ลงฐานจริง → ถูกปฏิเสธ", r.ข้อความ);

  // 3) ผลผ่าน (บรรทัดลายนิ้วมือใน commit) + ใบลงครบ → ผ่าน
  ตั้งใบฐานจริง(["0001", "0002"]);
  r = push("monorepo");
  ผล(r.ได้ && บนremote("monorepo") === B, "ผ่านรอบตรวจ + ใบลงฐานจริงครบ → push ได้", r.ข้อความ);

  // 4) commit เปล่า "deploy:" ต่อจากที่ผ่าน → ลายนิ้วมือเดิม → ผ่าน
  git("commit", "-q", "--allow-empty", "-m", "deploy: ขึ้นเว็บ");
  const C = git("rev-parse", "HEAD");
  r = push("monorepo");
  ผล(r.ได้ && บนremote("monorepo") === C, "commit เปล่าสำหรับขึ้นเว็บ ต่อจาก commit ที่ผ่าน → push ได้", r.ข้อความ);

  // 5) commit ใหม่ที่แก้ไฟล์อื่น (ยังไม่ผ่านรอบตรวจ) → ปฏิเสธ
  เขียน("apps/x.ts", "export const x = 1;\n"); git("add", "-A"); git("commit", "-qm", "งานใหม่");
  r = push("monorepo");
  ผล(!r.ได้ && บนremote("monorepo") === C, "commit ใหม่ที่ยังไม่ผ่านรอบตรวจ → ถูกปฏิเสธ (monorepo ปลายทางไม่ขยับ)", r.ข้อความ);

  // 6) ใบใหม่ในโค้ดที่ผ่านรอบตรวจแล้ว แต่ยังไม่ลงฐานจริง → ปฏิเสธ
  เขียน("supabase/migrations/0003_c.sql", "select 3;\n"); git("add", "-A"); git("commit", "-qm", "ใบ 0003");
  ผ่านรอบตรวจ();
  r = push("monorepo");
  ผล(!r.ได้ && /0003/.test(r.ข้อความ), "ใบ 0003 ผ่านรอบตรวจแล้วแต่ยังไม่ลงฐานจริง → ถูกปฏิเสธ", r.ข้อความ);

  // 7) push ไป wip/* → ได้ตามปกติ แม้ยังไม่ผ่านอะไร
  เขียน("apps/y.ts", "export const y = 1;\n"); git("add", "-A"); git("commit", "-qm", "งานยังไม่ตรวจ");
  r = push("HEAD:refs/heads/wip/integration");
  ผล(r.ได้ && บนremote("wip/integration") === git("rev-parse", "HEAD"), "push ไป wip/integration → ได้ตามปกติ", r.ข้อความ);

  // 8) ลบ monorepo บนปลายทาง → ปฏิเสธ
  r = push("--delete", "monorepo");
  ผล(!r.ได้ && บนremote("monorepo") === C, "ลบ monorepo บนปลายทาง → ถูกปฏิเสธ", r.ข้อความ);

  // 9) remote เป็น GitHub → ไม่ใช้ค่าปลอมของข้อทดสอบ (ต้องถามฐานจริง · ถามไม่ได้ = ปฏิเสธ) — เรียกตัวกันตรง ไม่ push จริง
  ตั้งใบฐานจริง(["0001", "0002"]);
  const h = spawnSync(process.execPath, ["scripts/git-hooks/pre-push.mjs", "origin", "https://github.com/MazDev01/PMS_Benjamin.git"],
    { cwd: repo, encoding: "utf8", env: { ...env, PMS_PROD_OPS_DIR: join(ที่, "ไม่มีโฟลเดอร์นี้") },
      input: `refs/heads/monorepo ${B} refs/heads/monorepo ${"0".repeat(40)}\n` });
  ผล(h.status !== 0 && /ตรวจใบปรับฐานบนฐานจริงไม่ได้/.test(h.stderr), "remote GitHub: ไม่เชื่อค่าปลอมของข้อทดสอบ ต้องถามฐานจริง (ถามไม่ได้ = ปฏิเสธ)", h.stdout + h.stderr);
} finally {
  rmSync(ที่, { recursive: true, force: true });
}
console.log(ตก ? `FAIL ${ตก}` : "ALL PASS");
process.exit(ตก ? 1 : 0);
