// ── ข้อทดสอบ: git pre-push กัน push ขึ้น monorepo ก่อนพร้อม (บอสสั่ง 22 ต.ค. 69) ───────────────────────────────────
// สร้าง repo จำลอง + remote ปลอม (bare repo ในโฟลเดอร์ชั่วคราว) — ไม่ push ขึ้น GitHub จริงเด็ดขาด
// คัดลอกตัวกัน (.githooks/pre-push · scripts/git-hooks/pre-push.mjs · scripts/lib/commitGate.mjs · session.mjs) ไปไว้ใน repo จำลอง
//   ผลรอบตรวจ = บรรทัดลายนิ้วมือใน supabase/gate-passed-code.txt ที่ commit ไว้ (แบบเดียวกับของจริง)
//   ใบบนฐานจริงปลอมด้วยไฟล์ (PMS_PROD_VERSIONS_FILE — ใช้ได้เฉพาะ remote ที่ไม่ใช่ GitHub)
// mutation proof: PMS_PREPUSH_MUTATE=reject|gate|prod|github ทำตัวกันในสำเนาให้พังทีละแบบ → ข้อทดสอบต้องตก
// รัน: node tests/tools/pre-push-guard.test.mjs
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync, appendFileSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawn, spawnSync, execFileSync } from "node:child_process";
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
  for (const f of [".githooks/pre-push", "scripts/git-hooks/pre-push.mjs", "scripts/lib/commitGate.mjs", "scripts/lib/session.mjs", "scripts/lib/ports.json",
                   "scripts/lib/prodLock.mjs", "scripts/lib/fileLock.mjs"]) { if (existsSync(join(ราก, f))) คัด(f); }
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

  // 10) ถามฐานจริงไม่ได้ → ข้อความบอกเหตุ + วิธีแก้เป็นขั้นตอน (บอสสั่ง 29 ต.ค. 69 · เดิมบอกแค่ "ต่อไม่ได้")
  const ไม่มีโฟลเดอร์ = join(ที่, "ไม่มีโฟลเดอร์นี้");
  ผล(/ยังไม่ได้ผูกฐานจริง/.test(h.stderr) && /วิธีแก้/.test(h.stderr) && h.stderr.includes(`cd ${ไม่มีโฟลเดอร์}`) && /npx supabase login/.test(h.stderr) && /npx supabase link --project-ref/.test(h.stderr),
    "ถามฐานจริงไม่ได้ (ไม่มีโฟลเดอร์/ไม่ได้ผูก) → บอกเหตุ + ขั้นตอน cd · ทดลองถาม · login · link", h.stderr);
  //     ผูกแล้วแต่ terminal ยังไม่ได้ล็อกอิน Supabase (npx ปลอมใน PATH ตอบแบบ CLI จริง)
  const ผูกแล้ว = join(ที่, "ops"), ถังnpx = join(ที่, "npx-ปลอม");
  mkdirSync(join(ผูกแล้ว, "supabase/.temp"), { recursive: true }); writeFileSync(join(ผูกแล้ว, "supabase/.temp/project-ref"), "ทดสอบ\n");
  mkdirSync(ถังnpx);
  writeFileSync(join(ถังnpx, "npx.cmd"), "@echo Access token not provided. Supply an access token by running supabase login 1>&2\r\n@exit /b 1\r\n");
  writeFileSync(join(ถังnpx, "npx"), "#!/bin/sh\necho 'Access token not provided. Supply an access token by running supabase login' >&2\nexit 1\n", { mode: 0o755 });
  const คีย์path = Object.keys(env).find(k => /^path$/i.test(k)) ?? "PATH";
  const h2 = spawnSync(process.execPath, ["scripts/git-hooks/pre-push.mjs", "origin", "https://github.com/MazDev01/PMS_Benjamin.git"],
    { cwd: repo, encoding: "utf8", env: { ...env, PMS_PROD_OPS_DIR: ผูกแล้ว, [คีย์path]: `${ถังnpx}${process.platform === "win32" ? ";" : ":"}${env[คีย์path]}` },
      input: `refs/heads/monorepo ${B} refs/heads/monorepo ${"0".repeat(40)}\n` });
  ผล(h2.status !== 0 && /ยังไม่ได้ล็อกอิน Supabase/.test(h2.stderr) && /npx supabase login/.test(h2.stderr),
    "ผูกแล้วแต่ยังไม่ได้ล็อกอิน Supabase → บอกเหตุตรงตัว + ขั้นตอน login", h2.stdout + h2.stderr);

  // 11) บอสกำลัง db:push / สำรอง+ซ้อมกู้ (ถือล็อกฐานจริง) → ตัวกันต้องรอจนงานนั้นจบก่อนถามฐานจริง ไม่ยิงแทรก (30 ต.ค. 69)
  //     npx ปลอมจดเวลาที่ถูกเรียก · โปรเซสถือล็อกจบเองหลัง 3 วิ → ถามฐานต้องเกิดหลังล็อกปล่อย
  const ล็อก = join(ที่, "prod.lock"), จด = join(ที่, "npx-called.txt"), ถังnpx2 = join(ที่, "npx-จดเวลา");
  mkdirSync(ถังnpx2);
  // จดว่าถูกเรียกด้วย echo ล้วน (เวลา = เวลาแก้ไฟล์) — ไม่ซ้อนเครื่องหมายคำพูดใน cmd
  writeFileSync(join(ถังnpx2, "npx.cmd"), `@echo called> "${จด}"
@echo {"rows":[{"version":"0001"},{"version":"0002"}]}
`);
  writeFileSync(join(ถังnpx2, "npx"), `#!/bin/sh
echo called > '${จด}'
echo '{"rows":[{"version":"0001"},{"version":"0002"}]}'
`, { mode: 0o755 });
  const ถือ = spawn(process.execPath, ["-e", "setTimeout(()=>{}, 3000)"], { stdio: "ignore" });
  writeFileSync(ล็อก, JSON.stringify({ token: "บอส-db-push", pid: ถือ.pid, งาน: "db:push:prod", เริ่ม: new Date().toISOString() }));
  const ถือจบ = new Promise(r => ถือ.on("exit", () => r(Date.now())));
  const h3 = await new Promise(r => { const p = spawn(process.execPath, ["scripts/git-hooks/pre-push.mjs", "origin", "https://github.com/MazDev01/PMS_Benjamin.git"],
    { cwd: repo, env: { ...env, PMS_PROD_LOCK: ล็อก, PMS_PROD_OPS_DIR: ผูกแล้ว, [คีย์path]: `${ถังnpx2}${process.platform === "win32" ? ";" : ":"}${env[คีย์path]}` } });
    let ออก = ""; p.stdout.on("data", d => ออก += d); p.stderr.on("data", d => ออก += d);
    p.stdin.end(`refs/heads/monorepo ${B} refs/heads/monorepo ${"0".repeat(40)}
`); p.on("exit", code => r({ code, ออก })); });
  const ปล่อยเมื่อ = await ถือจบ, ถามเมื่อ = existsSync(จด) ? statSync(จด).mtimeMs : 0;
  ผล(/⏳ รอ — งาน "db:push:prod"/.test(h3.ออก) && ถามเมื่อ > 0 && ถามเมื่อ >= ปล่อยเมื่อ,
    `บอสกำลัง db:push → git push รอจนงานนั้นจบแล้วค่อยถามฐานจริง (ถาม ${ถามเมื่อ ? ถามเมื่อ - ปล่อยเมื่อ : "ไม่ถาม"} ms หลังปล่อย)`, h3.ออก);} finally {
  rmSync(ที่, { recursive: true, force: true });
}
console.log(ตก ? `FAIL ${ตก}` : "ALL PASS");
process.exit(ตก ? 1 : 0);
