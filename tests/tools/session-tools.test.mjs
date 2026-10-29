// ── ข้อทดสอบ: เครื่องมือทำงานหลายเซสชันพร้อมกัน (บอสสั่ง 22 ต.ค. 69) ───────────────────────────────────────────────────
// ทุกข้อรันใน repo จำลองในโฟลเดอร์ชั่วคราว (คัดลอกสคริปต์จริงไป) — ไม่แตะ repo จริง · ฐานทดสอบ · พอร์ต
//   ล็อกฐานทดสอบ: สองงานขอพร้อมกัน → ตัวที่สองหยุด (บอกว่าใครถือ) หรือรอคิวแล้วได้ · ล็อกค้างของโปรเซสที่ตาย → เก็บกวาด
//   migration:new: สองเซสชันจองพร้อมกัน → คนละเลข · นับเลขจาก branch อื่น/ไฟล์ยังไม่ commit ในโฟลเดอร์อื่น/ที่จองไว้
//   session:new: ช่องพอร์ตไม่ซ้ำ · ไฟล์ค่าตั้งเปลี่ยนพอร์ต · session:close: ถอดทางลัดก่อนลบ ไฟล์นอกโฟลเดอร์ไม่หาย · ยังไม่ merge = ไม่ปิด
//   git hook: เซสชันลูก commit/push เข้า wip/monorepo → ถูกปฏิเสธ · branch ตัวเอง → ได้ · โฟลเดอร์หลัก → ไม่ถูกจำกัด
//   session:merge: commit ล่าสุดไม่มีผลรอบตรวจ → ไม่ merge · มี → merge · merge แล้วเลขใบขาดช่วง → ไม่ merge (บอกว่าใครจอง)
//     หลัง merge (บอสสั่ง 27 ต.ค. 69): ลายนิ้วมือตรงกับที่เซสชันตรวจผ่าน → ใช้ผลเดิม (commit ผ่านรอบตรวจโดยไม่รันซ้ำ)
//     ไม่ตรง → บอกให้รันรอบตรวจรวม + บอกงานที่ตรวจผ่านแล้วรอรวม · ห้ามข้าม (commit ไม่มีผลผ่าน)
//     รายการใบผ่านรอบตรวจชนกัน → ได้ฉบับของเซสชัน ไม่หายใบ (บอสสั่ง 29 ต.ค. 69)
//   ตัวตรวจ: พอร์ตที่เขียนเอง → ตก · เลขใบซ้ำ/ข้าม → ตก (0051 ยกเว้น · เซสชันลูกข้ามเลขที่คนอื่นจองได้)
// mutation proof: PMS_SESSION_MUTATE=<แบบ> ทำสคริปต์ในสำเนาให้พังทีละแบบ → ข้อทดสอบต้องตก (ดูรายการ "พัง" ข้างล่าง)
// รัน: node tests/tools/session-tools.test.mjs
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync, existsSync, symlinkSync, appendFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const ราก = process.cwd();
const ที่ = mkdtempSync(join(tmpdir(), "session-tools-"));
const repo = join(ที่, "repo"), wt = join(ที่, "wt"), ภายนอก = join(ที่, "ภายนอก");
const env = { ...process.env, PMS_WT_ROOT: wt, PMS_SESSIONS_LOCK: join(ที่, "sessions.lock"), PMS_MIGRATION_LOCK: join(ที่, "migration.lock"),
  PMS_TESTDB_LOCK: join(ที่, "testdb.lock"), PMS_TESTDB_LOCK_HELD: "", PMS_TESTDB_LOCK_WAIT: "", PMS_MIGRATION_RESERVATIONS: "" };
delete env.PMS_MIGRATION_RESERVATIONS;
const gitIn = (cwd, ...a) => execFileSync("git", ["-c", "core.autocrlf=false", "-c", "user.name=ทดสอบ", "-c", "user.email=t@example.test", ...a],
  { cwd, encoding: "utf8", env, stdio: ["ignore", "pipe", "pipe"] }).trim();
const git = (...a) => gitIn(repo, ...a);
const รัน = (cwd, สคริปต์, args = [], เพิ่ม = {}) => {
  const r = spawnSync(process.execPath, [join(cwd, สคริปต์), ...args], { cwd, encoding: "utf8", env: { ...env, ...เพิ่ม } });
  return { ได้: r.status === 0, รหัส: r.status, ข้อความ: (r.stdout ?? "") + (r.stderr ?? "") };
};
const เขียน = (root, f, s) => { mkdirSync(dirname(join(root, f)), { recursive: true }); writeFileSync(join(root, f), s); };
const แก้ = (f, a, b) => { const p = join(repo, f), s = readFileSync(p, "utf8").replace(/\r\n/g, "\n"); if (!s.includes(a)) throw new Error(`ไม่พบใน ${f}: ${a}`); writeFileSync(p, s.replace(a, b)); };

let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n${String(เพิ่ม).slice(0, 1500)}`}`); };

const ไฟล์ที่ใช้ = [
  ".githooks/pre-commit", ".githooks/pre-push", ".gitattributes",
  "scripts/session-new.mjs", "scripts/session-close.mjs", "scripts/session-merge.mjs", "scripts/migration-new.mjs",
  "scripts/check-migration-numbers.mjs", "scripts/check-hardcoded-ports.mjs",
  "scripts/git-hooks/pre-commit.mjs", "scripts/git-hooks/pre-push.mjs",
  "scripts/lib/fileLock.mjs", "scripts/lib/session.mjs", "scripts/lib/sessions.mjs", "scripts/lib/commitGate.mjs",
  "scripts/lib/gitFiles.mjs", "scripts/lib/testDbLock.mjs", "scripts/lib/testDbGuard.mjs", "scripts/lib/testDbFetchKey.mjs", "scripts/lib/testDbSchema.mjs", "scripts/lib/ports.json",
];

try {
  // ── repo จำลอง: สคริปต์จริง + ใบปรับฐาน 0001-0003 + ไฟล์ค่าตั้งชี้พอร์ตโฟลเดอร์หลัก ──
  mkdirSync(repo); mkdirSync(ภายนอก);
  writeFileSync(join(ภายนอก, "ไฟล์สำคัญ.txt"), "ห้ามหาย");
  execFileSync("git", ["init", "-q", "-b", "monorepo"], { cwd: repo });
  for (const f of ไฟล์ที่ใช้) { mkdirSync(dirname(join(repo, f)), { recursive: true }); copyFileSync(join(ราก, f), join(repo, f)); }
  for (const n of ["0001_a", "0002_b", "0003_c"]) เขียน(repo, `supabase/migrations/${n}.sql`, "select 1;\n");
  เขียน(repo, ".gitignore", ".pms-session.json\napps/*/.env.local\nnode_modules/\n.cache/\n");
  เขียน(repo, "apps/web.ts", "export const ok = 1;\n");

  // ── mutation proof ──
  const พัง = process.env.PMS_SESSION_MUTATE ?? "";
  if (พัง === "lock") แก้("scripts/lib/fileLock.mjs", 'const fd = openSync(path, "wx");', 'const fd = openSync(path, "w");');
  if (พัง === "stale") แก้("scripts/lib/fileLock.mjs", "if (cur && !ยังทำงานอยู่(cur.pid)) {", "if (false) {");
  if (พัง === "number") แก้("scripts/migration-new.mjs", "for (const j of จอง) ที่มา.push", "for (const j of []) ที่มา.push");
  if (พัง === "numlock") แก้("scripts/migration-new.mjs", "})(`จองเลขใบ ${ชื่อ}`, { รอ: 60_000 });", "}); const _x = { release() {} }; void (`จองเลขใบ ${ชื่อ}`);");
  if (พัง === "slot") แก้("scripts/lib/sessions.mjs", "if (!ใช้แล้ว.has(k)) return k;", "return k;");
  if (พัง === "junction") แก้("scripts/session-close.mjs", "const ถอดไม่ได้ = ถอดทางลัดทั้งหมด(โฟลเดอร์);", "const ถอดไม่ได้ = [];");
  if (พัง === "unmerged") แก้("scripts/session-close.mjs", 'try { git("merge-base", "--is-ancestor", s.branch, "HEAD"); }', "try { }");
  if (พัง === "commit") แก้("scripts/git-hooks/pre-commit.mjs", "if (branch !== ของตัวเอง) {", "if (false) {");
  if (พัง === "push") แก้("scripts/git-hooks/pre-push.mjs", "if (ผิดที่.length) {", "if (false) {");
  if (พัง === "merge") แก้("scripts/session-merge.mjs", "if (!ผล.ผ่าน) ตาย(", "if (false) ตาย(");
  if (พัง === "reuse") แก้("scripts/session-merge.mjs", 'if (ใช้ผลเดิมได้(ปลาย, "HEAD", cwd)) {', "if (true) {");
  if (พัง === "noreuse") แก้("scripts/session-merge.mjs", 'if (ใช้ผลเดิมได้(ปลาย, "HEAD", cwd)) {', "if (false) {");
  if (พัง === "mergelist") แก้("scripts/session-merge.mjs", ' || รายการใบ("HEAD") !== รายการใบ(ปลาย)) {', ") {");
  if (พัง === "mergegap")แก้("scripts/session-merge.mjs", "if (ตรวจเลข.status !== 0) {", "if (false) {");
  if (พัง === "ports") แก้("scripts/check-hardcoded-ports.mjs", "if (เจอ.length) {", "if (false) {");
  if (พัง === "dup") แก้("scripts/check-migration-numbers.mjs", "if (fs.length > 1) ผิด.push", "if (false) ผิด.push");
  if (พัง === "gap") แก้("scripts/check-migration-numbers.mjs", "if (!ตามเลข.has(n) && !ข้ามได้.has(n) && !จองโดยคนอื่น.has(n))", "if (false)");
  git("add", "-A"); git("commit", "-qm", "ฐาน");
  git("config", "core.hooksPath", ".githooks");
  git("branch", "wip/integration");
  เขียน(repo, "apps/dealer/.env.local", "NEXT_PUBLIC_DEALER_APP_URL=http://localhost:3001\nNEXT_PUBLIC_HQ_ORIGIN=http://localhost:3002\n");

  // ═══ 1) ล็อกฐานทดสอบ ═══
  {
    const ถือ = spawn(process.execPath, ["--input-type=module", "-e",
      `import { ขอล็อกฐานทดสอบ } from "${pathToFileURL(join(repo, "scripts/lib/testDbLock.mjs")).href}"; ขอล็อกฐานทดสอบ("รอบตรวจเต็ม (จำลอง)"); console.log("ได้"); setTimeout(() => process.exit(0), 6000);`],
      { cwd: repo, env, stdio: ["ignore", "pipe", "pipe"] });
    await new Promise(ok => { ถือ.stdout.once("data", ok); ถือ.once("exit", ok); });   // พังก่อนได้ล็อก = ไม่ค้างรอ (ข้อข้างล่างจะตกเอง)
    const ขอ = `import { ขอล็อกฐานทดสอบ } from "${pathToFileURL(join(repo, "scripts/lib/testDbLock.mjs")).href}"; ขอล็อกฐานทดสอบ("playwright"); console.log("ตัวที่สองได้ล็อก");`;
    const สอง = spawnSync(process.execPath, ["--input-type=module", "-e", ขอ], { cwd: repo, env, encoding: "utf8" });
    ผล(สอง.status === 3 && /มีงานอื่นใช้ฐานทดสอบอยู่: "รอบตรวจเต็ม \(จำลอง\)" ของเซสชัน หลัก/.test(สอง.stderr) && !/ตัวที่สองได้ล็อก/.test(สอง.stdout),
      "ล็อกฐานทดสอบ: ขอพร้อมกัน → ตัวที่สองหยุด (exit 3) บอกงาน + เซสชันที่ถือ + เวลา", สอง.stdout + สอง.stderr);
    const t0 = Date.now();
    const รอ = spawnSync(process.execPath, ["--input-type=module", "-e", ขอ], { cwd: repo, env: { ...env, PMS_TESTDB_LOCK_WAIT: "1" }, encoding: "utf8" });
    ผล(รอ.status === 0 && /ตัวที่สองได้ล็อก/.test(รอ.stdout) && /รอคิว/.test(รอ.stderr) && Date.now() - t0 > 1500,
      "ล็อกฐานทดสอบ: ขอแบบรอคิว → รอจนตัวแรกเสร็จ แล้วได้ล็อก", รอ.stdout + รอ.stderr);
    ถือ.kill();
    // ล็อกค้างของโปรเซสที่ตายแล้ว
    const ตาย = spawnSync(process.execPath, ["-e", "console.log(process.pid)"], { encoding: "utf8" });
    writeFileSync(env.PMS_TESTDB_LOCK, JSON.stringify({ token: "ค้าง", pid: Number(ตาย.stdout.trim()), งาน: "รอบตรวจเต็ม", เซสชัน: "ef", เริ่ม: new Date().toISOString() }));
    const เก็บ = spawnSync(process.execPath, ["--input-type=module", "-e", ขอ], { cwd: repo, env, encoding: "utf8" });
    ผล(เก็บ.status === 0 && /ล็อกค้าง/.test(เก็บ.stderr) && /ตัวที่สองได้ล็อก/.test(เก็บ.stdout), "ล็อกฐานทดสอบ: ล็อกค้างของโปรเซสที่ตาย → เก็บกวาดแล้วได้ล็อก", เก็บ.stdout + เก็บ.stderr);
  }

  // ═══ 2) session:new — ช่องพอร์ตไม่ซ้ำ · ค่าตั้งเปลี่ยนพอร์ต ═══
  const ก = รัน(repo, "scripts/session-new.mjs", ["ก", "--จาก", "monorepo", "--ไม่ติดตั้ง"]);
  const ข = รัน(repo, "scripts/session-new.mjs", ["ข", "--จาก", "monorepo", "--ไม่ติดตั้ง"]);
  ผล(!ก.ได้ && /ชื่อภาษาอังกฤษ/.test(ก.ข้อความ), "session:new: ชื่อผิดแบบ → ไม่สร้าง", ก.ข้อความ);
  const นี้ = [รัน(repo, "scripts/session-new.mjs", ["aa", "--จาก", "monorepo", "--ไม่ติดตั้ง"]), รัน(repo, "scripts/session-new.mjs", ["bb", "--จาก", "monorepo", "--ไม่ติดตั้ง"])];
  const A = join(wt, "aa"), B = join(wt, "bb");
  const sA = existsSync(join(A, ".pms-session.json")) ? JSON.parse(readFileSync(join(A, ".pms-session.json"), "utf8")) : {};
  const sB = existsSync(join(B, ".pms-session.json")) ? JSON.parse(readFileSync(join(B, ".pms-session.json"), "utf8")) : {};
  const พอร์ตทั้งหมด = [sA.dev?.dealer, sA.dev?.hq, sA.test?.dealer, sA.test?.hq, sB.dev?.dealer, sB.dev?.hq, sB.test?.dealer, sB.test?.hq, 3001, 3002];
  ผล(นี้.every(x => x.ได้) && sA.ช่อง && sB.ช่อง && new Set(พอร์ตทั้งหมด).size === พอร์ตทั้งหมด.length,
    "session:new: สองเซสชันได้ช่องพอร์ตคนละช่อง ไม่ซ้ำกันเองและไม่ซ้ำโฟลเดอร์หลัก", JSON.stringify({ sA, sB }) + นี้.map(x => x.ข้อความ).join("\n"));
  const envA = existsSync(join(A, "apps/dealer/.env.local")) ? readFileSync(join(A, "apps/dealer/.env.local"), "utf8") : "";
  ผล(envA.includes(`localhost:${sA.dev?.dealer}`) && envA.includes(`localhost:${sA.dev?.hq}`) && !envA.includes("localhost:3001"),
    "session:new: ไฟล์ค่าตั้งในโฟลเดอร์เซสชันเปลี่ยนพอร์ตเป็นของเซสชัน", envA);
  const ซ้ำ = รัน(repo, "scripts/session-new.mjs", ["aa", "--จาก", "monorepo", "--ไม่ติดตั้ง"]);
  ผล(!ซ้ำ.ได้ && /มีเซสชันชื่อ aa อยู่แล้ว/.test(ซ้ำ.ข้อความ), "session:new: ชื่อซ้ำ → ไม่สร้างทับ", ซ้ำ.ข้อความ);
  const จากลูก = รัน(A, "scripts/session-new.mjs", ["cc", "--จาก", "monorepo", "--ไม่ติดตั้ง"]);
  ผล(!จากลูก.ได้ && /จากโฟลเดอร์หลัก/.test(จากลูก.ข้อความ), "session:new: สั่งจากเซสชันลูก → ไม่ให้ (คนรวมงานเท่านั้น)", จากลูก.ข้อความ);

  // ═══ 3) git hook — เซสชันลูกเข้า wip/monorepo ไม่ได้ ═══
  const commitIn = (cwd, ไฟล์) => { เขียน(cwd, ไฟล์, `export const x = ${Date.now()};\n`); gitIn(cwd, "add", "-A");
    const r = spawnSync("git", ["-c", "user.name=ทดสอบ", "-c", "user.email=t@example.test", "commit", "-qm", "งาน"], { cwd, encoding: "utf8", env });
    return { ได้: r.status === 0, ข้อความ: r.stdout + r.stderr }; };
  let r = commitIn(A, "apps/aa1.ts");
  ผล(r.ได้, "hook: เซสชันลูก commit บน branch ตัวเอง (session/aa) → ได้", r.ข้อความ);
  gitIn(A, "switch", "-q", "-c", "wip/integration-ลูก", "--no-track");   // ลองเปลี่ยนไป branch อื่น
  gitIn(A, "switch", "-q", "--detach");
  r = commitIn(A, "apps/aa2.ts");
  ผล(!r.ได้ && /commit ได้เฉพาะ branch session\/aa/.test(r.ข้อความ), "hook: เซสชันลูก commit นอก branch ตัวเอง → ถูกปฏิเสธ", r.ข้อความ);
  gitIn(A, "reset", "-q", "--hard"); gitIn(A, "switch", "-q", "session/aa");
  const remote = join(ที่, "remote.git"); execFileSync("git", ["init", "-q", "--bare", remote]);
  git("remote", "add", "origin", remote);
  const pushIn = (cwd, ref) => { const x = spawnSync("git", ["push", "origin", ref], { cwd, encoding: "utf8", env }); return { ได้: x.status === 0, ข้อความ: x.stdout + x.stderr }; };
  r = pushIn(A, "HEAD:refs/heads/wip/integration");
  ผล(!r.ได้ && /push ได้เฉพาะ session\/aa/.test(r.ข้อความ), "hook: เซสชันลูก push เข้า wip/integration → ถูกปฏิเสธ", r.ข้อความ);
  r = pushIn(A, "HEAD:refs/heads/monorepo");
  ผล(!r.ได้ && /push ได้เฉพาะ session\/aa/.test(r.ข้อความ), "hook: เซสชันลูก push เข้า monorepo → ถูกปฏิเสธ", r.ข้อความ);
  r = pushIn(A, "HEAD:refs/heads/session/aa");
  ผล(r.ได้, "hook: เซสชันลูก push branch ตัวเอง → ได้", r.ข้อความ);
  git("switch", "-q", "wip/integration"); r = commitIn(repo, "apps/หลัก.ts"); git("switch", "-q", "monorepo"); git("merge", "-q", "wip/integration");
  ผล(r.ได้, "hook: โฟลเดอร์หลัก (คนรวมงาน) commit บน wip ได้ — ไม่ถูกจำกัด", r.ข้อความ);

  // ═══ 4) migration:new — จองพร้อมกันได้คนละเลข ═══
  // bb จองเลขแรกตามปกติ (0004) แล้ว "ลืมบันทึกการจอง" ชั่วคราว — พิสูจน์ว่านับใบที่ยังไม่ commit ในโฟลเดอร์อื่นด้วย ไม่ใช่แค่บันทึกการจอง
  const ศูนย์ = รัน(B, "scripts/migration-new.mjs", ["q_zero"]);
  ผล(ศูนย์.ได้ && /จองเลข 0004/.test(ศูนย์.ข้อความ) && existsSync(join(B, "supabase/migrations/0004_q_zero.sql")), "migration:new: จองเลขถัดไป (0004) + สร้างไฟล์ในโฟลเดอร์ตัวเอง", ศูนย์.ข้อความ);
  const ไฟล์จอง = join(repo, ".git/pms-migration-reservations.json"), สำรองจอง = readFileSync(ไฟล์จอง, "utf8");
  writeFileSync(ไฟล์จอง, "[]\n");
  const จองพร้อมกัน = await Promise.all(["one", "two"].map(ชื่อ => new Promise(ok => {
    const p = spawn(process.execPath, [join(A, "scripts/migration-new.mjs"), `q_${ชื่อ}`], { cwd: A, env });
    let o = ""; p.stdout.on("data", d => o += d); p.stderr.on("data", d => o += d); p.on("exit", () => ok(o));
  })));
  const เลข = จองพร้อมกัน.map(o => /จองเลข (\d{4})/.exec(o)?.[1]);
  ผล(เลข[0] && เลข[1] && เลข[0] !== เลข[1] && เลข.every(n => Number(n) >= 5),
    "migration:new: สองตัวจองพร้อมกัน → ได้คนละเลข และข้ามเลขที่มีในโฟลเดอร์อื่น (0004)", `${เลข} · ${จองพร้อมกัน.join(" | ")}`);
  const จองไว้ = JSON.parse(readFileSync(ไฟล์จอง, "utf8"));
  writeFileSync(ไฟล์จอง, JSON.stringify([...JSON.parse(สำรองจอง), ...จองไว้]));   // คืนบันทึกการจอง 0004 ของ bb
  // เซสชันอื่นจองต่อ: ลบไฟล์ใบของ aa ชั่วคราว → เหลือแค่บันทึกการจองที่กันเลขไว้
  const ไฟล์ของaa = readdirSync(join(A, "supabase/migrations")).filter(f => /^000[5-9]_/.test(f));
  for (const f of ไฟล์ของaa) rmSync(join(A, "supabase/migrations", f));
  const ต่อ = รัน(B, "scripts/migration-new.mjs", ["q_three"]);
  const เลข3 = /จองเลข (\d{4})/.exec(ต่อ.ข้อความ)?.[1];
  ผล(ต่อ.ได้ && Number(เลข3) === Math.max(...เลข.map(Number)) + 1 && จองไว้.length === 2,
    "migration:new: เซสชันอื่นจองต่อ → นับเลขที่จองไว้แล้วด้วย แม้ไฟล์ยังไม่มี (ได้เลขถัดไป ไม่ทับ)", ต่อ.ข้อความ);
  rmSync(join(B, `supabase/migrations/${เลข3}_q_three.sql`), { force: true });   // ข้อถัดไปใช้แค่ 0004 ของ bb
  writeFileSync(ไฟล์จอง, JSON.stringify(JSON.parse(readFileSync(ไฟล์จอง, "utf8")).filter(j => j.เลข !== เลข3)));

  // ═══ 5) ตัวตรวจเลขใบ ═══
  const ตรวจเลข = (cwd) => รัน(cwd, "scripts/check-migration-numbers.mjs");
  for (const n of เลข) เขียน(A, `supabase/migrations/${n}_${n === เลข[0] ? "q_one" : "q_two"}.sql`, "select 5;\n");   // aa มี 0005/0006 แต่ไม่มี 0004 (ของ bb)
  const ตรA = ตรวจเลข(A);
  ผล(ตรA.ได้, "ตัวตรวจเลขใบ: เซสชันลูกที่ข้ามเลข 0004 ซึ่งเซสชันอื่นจองไว้ → ผ่าน", ตรA.ข้อความ);
  const ตรวจหลัก = รัน(repo, "scripts/check-migration-numbers.mjs");
  ผล(ตรวจหลัก.ได้, "ตัวตรวจเลขใบ: โฟลเดอร์หลักที่เลขต่อกัน → ผ่าน", ตรวจหลัก.ข้อความ);
  เขียน(repo, "supabase/migrations/0003_ซ้ำ.sql".replace("ซ้ำ", "dup"), "select 3;\n");
  let ตร = รัน(repo, "scripts/check-migration-numbers.mjs");
  ผล(!ตร.ได้ && /เลข 0003 ซ้ำ 2 ใบ/.test(ตร.ข้อความ), "ตัวตรวจเลขใบ: เลขซ้ำ → ตก", ตร.ข้อความ);
  rmSync(join(repo, "supabase/migrations/0003_dup.sql"));
  เขียน(repo, "supabase/migrations/0009_gap.sql", "select 9;\n");
  ตร = รัน(repo, "scripts/check-migration-numbers.mjs");
  ผล(!ตร.ได้ && /ข้ามเลข 0004/.test(ตร.ข้อความ), "ตัวตรวจเลขใบ: โฟลเดอร์หลักข้ามเลข → ตก (แม้เลขนั้นมีคนจอง)", ตร.ข้อความ);
  rmSync(join(repo, "supabase/migrations/0009_gap.sql"));

  // ═══ 6) session:merge — ต้องมีผลรอบตรวจของ commit ล่าสุด · เลขใบต้องต่อกัน ═══
  gitIn(B, "add", "-A"); gitIn(B, "commit", "-qm", "ใบ 0004");
  let m = รัน(repo, "scripts/session-merge.mjs", ["bb"]);
  ผล(!m.ได้ && /ยังไม่มีผลรอบตรวจเต็มผ่าน/.test(m.ข้อความ) && !git("log", "--oneline", "-1").includes("merge"),
    "session:merge: commit ล่าสุดของเซสชันไม่มีผลรอบตรวจ → ไม่ merge", m.ข้อความ);
  const ผ่านใน = (cwd) => {
    const { ลายนิ้วมือโค้ด } = globalThis.__cg;
    appendFileSync(join(cwd, "supabase/gate-passed-code.txt"), `${ลายนิ้วมือโค้ด("HEAD", cwd)} ทดสอบ ${gitIn(cwd, "rev-parse", "--short=12", "HEAD")} จำลอง\n`);
    gitIn(cwd, "add", "supabase/gate-passed-code.txt"); gitIn(cwd, "commit", "-qm", "บันทึกผลรอบตรวจ");
  };
  globalThis.__cg = await import(pathToFileURL(join(repo, "scripts/lib/commitGate.mjs")).href);
  // A มีใบ 0005/0006 (ถ้าจองเลขต่อจาก 0004) แต่ยังไม่มี 0004 → merge ก่อน B = ขาดช่วง
  for (const n of เลข) เขียน(A, `supabase/migrations/${n}_${n === เลข[0] ? "q_one" : "q_two"}.sql`, "select 5;\n");
  for (const f of readdirSync(join(A, "supabase/migrations"))) if (!/^\d{4}_/.test(f)) rmSync(join(A, "supabase/migrations", f));
  gitIn(A, "add", "-A"); gitIn(A, "commit", "-qm", "ใบของ aa"); ผ่านใน(A);
  m = รัน(repo, "scripts/session-merge.mjs", ["aa"]);
  ผล(!m.ได้ && /ต้อง merge งานที่มีใบ 0004 \(จองโดย/.test(m.ข้อความ) && !existsSync(join(repo, ".git/MERGE_HEAD")),
    "session:merge: merge แล้วเลขใบขาดช่วง (0004 ของอีกเซสชันยังไม่เข้า) → ไม่ merge บอกเลขที่ขาด", m.ข้อความ);
  ผ่านใน(B);
  m = รัน(repo, "scripts/session-merge.mjs", ["bb"]);
  ผล(m.ได้ && git("log", "-1", "--format=%s").startsWith("merge: session/bb"), "session:merge: ผ่านรอบตรวจ + เลขต่อกัน → merge ได้", m.ข้อความ);
  // สาขาหลักมีงานที่ bb ไม่ได้ตรวจด้วย (apps/หลัก.ts) → ลายนิ้วมือไม่ตรง: ต้องรันรอบตรวจรวม · บอกงานที่รอรวม (aa ตรวจผ่านแล้ว) · ห้ามข้าม
  ผล(/ต้องรันรอบตรวจรวม ห้ามข้าม/.test(m.ข้อความ) && /รอรวม: session\/aa/.test(m.ข้อความ) && !globalThis.__cg.ตรวจcommitผ่าน("HEAD", repo).ผ่าน,
    "session:merge: ลายนิ้วมือหลังรวมไม่ตรง → บอกให้รันรอบตรวจรวม + งานที่รอรวม · commit ยังไม่มีผลผ่าน (ข้ามไม่ได้)", m.ข้อความ);
  // bb ดึงสาขาหลักไปรวมแล้วตรวจผ่านอีกรอบ → รวมแล้วโค้ดตรงกันทุกไฟล์ = ใช้ผลเดิม ไม่ต้องรันซ้ำ
  gitIn(B, "merge", "-q", "--no-edit", "monorepo"); เขียน(B, "apps/bb-รอบสอง.ts", "export const two = 2;\n");
  gitIn(B, "add", "-A"); gitIn(B, "commit", "-qm", "bb รอบสอง"); ผ่านใน(B);
  m = รัน(repo, "scripts/session-merge.mjs", ["bb"]);
  ผล(m.ได้ && /ใช้ผลเดิม ไม่ต้องรันรอบตรวจซ้ำ/.test(m.ข้อความ) && globalThis.__cg.ตรวจcommitผ่าน("HEAD", repo).ผ่าน,
    "session:merge: ลายนิ้วมือหลังรวมตรงกับที่เซสชันตรวจผ่าน → ใช้ผลเดิม · commit สาขาหลักผ่านรอบตรวจโดยไม่รันซ้ำ", m.ข้อความ);
  // รายการใบผ่านรอบตรวจ (บอสสั่ง 29 ต.ค. 69): สาขาหลักได้ฉบับเก่าจากงานอื่น · bb ได้ฉบับที่มีใบเพิ่ม → git ชนแล้วเลือกฝั่งรวมงาน
  //   บรรทัดผลไม่หาย (ลายนิ้วมือเดิม) → เครื่องมือเดิมไม่ซ่อม รายการถอย ใบหาย → db:push ไม่รับ (เกิดจริง: ใบ 0258)
  const ฉบับ = (ใบ) => JSON.stringify({ คำอธิบาย: "จำลอง", ใบ: Object.fromEntries(ใบ.map(f => [f, "x"])) }, null, 1) + "\n";
  เขียน(repo, "supabase/gate-passed-migrations.json", ฉบับ(["0001_a.sql", "0002_b.sql", "0003_c.sql"]));
  git("add", "supabase/gate-passed-migrations.json"); git("commit", "-qm", "บันทึกผลรอบตรวจของงานอื่น (ฉบับเก่า)");
  เขียน(B, "supabase/gate-passed-migrations.json", ฉบับ(["0001_a.sql", "0002_b.sql", "0003_c.sql", "0004_q_zero.sql"]));
  gitIn(B, "add", "supabase/gate-passed-migrations.json"); gitIn(B, "commit", "-qm", "บันทึกผลรอบตรวจ bb (มีใบ 0004)");
  m = รัน(repo, "scripts/session-merge.mjs", ["bb"]);
  const รายการหลัง = (() => { try { return Object.keys(JSON.parse(git("show", "HEAD:supabase/gate-passed-migrations.json")).ใบ); } catch { return []; } })();
  ผล(m.ได้ && รายการหลัง.includes("0004_q_zero.sql") && รายการหลัง.length === 4 && globalThis.__cg.ตรวจcommitผ่าน("HEAD", repo).ผ่าน,
    "session:merge: รายการใบผ่านรอบตรวจชนกัน (สาขาหลักเป็นฉบับเก่า) → ได้ฉบับของเซสชัน ไม่หายใบ", `${รายการหลัง} · ${m.ข้อความ}`);

  // ═══ 7) session:close — ยังไม่ merge = ไม่ปิด · ถอดทางลัดก่อนลบ ไฟล์นอกโฟลเดอร์ไม่หาย ═══
  let c = รัน(repo, "scripts/session-close.mjs", ["aa"]);
  ผล(!c.ได้ && /ยังไม่ได้ merge/.test(c.ข้อความ) && existsSync(A), "session:close: งานยังไม่ merge → ไม่ปิด ไม่ลบ", c.ข้อความ);
  symlinkSync(ภายนอก, join(B, "node_modules"), "junction");
  mkdirSync(join(B, ".cache/deep"), { recursive: true }); symlinkSync(ภายนอก, join(B, ".cache/deep/ลิงก์ซ้อน"), "junction");
  c = รัน(repo, "scripts/session-close.mjs", ["bb"]);
  ผล(c.ได้ && !existsSync(B) && existsSync(join(ภายนอก, "ไฟล์สำคัญ.txt")),
    "session:close: มีทางลัด (junction) ไปนอกโฟลเดอร์ → ถอดก่อนลบ · โฟลเดอร์เซสชันหาย · ไฟล์นอกโฟลเดอร์ยังอยู่", c.ข้อความ);
  const ทะเบียน = JSON.parse(readFileSync(join(repo, ".git/pms-sessions.json"), "utf8"));
  ผล(!ทะเบียน.bb && ทะเบียน.aa, "session:close: คืนช่องในทะเบียน (เหลือแค่เซสชันที่ยังเปิด)", JSON.stringify(ทะเบียน));
  c = รัน(repo, "scripts/session-close.mjs", ["aa", "--ทิ้งงาน"]);
  ผล(c.ได้ && !existsSync(A), "session:close --ทิ้งงาน: ปิดเซสชันที่ไม่ merge ได้เมื่อตั้งใจ", c.ข้อความ);

  // ═══ 8) ตัวตรวจพอร์ตที่เขียนเอง ═══
  เขียน(repo, "apps/ok.ts", "// เปิดที่ http://localhost:3001 (คำอธิบาย ไม่นับ)\nconst db = \"postgres://x@127.0.0.1:55322/p\";\nexport { db };\n");
  git("add", "-A");
  let p = รัน(repo, "scripts/check-hardcoded-ports.mjs");
  ผล(p.ได้, "ตัวตรวจพอร์ต: พอร์ตในคำอธิบาย · พอร์ตฐานข้อมูล → ผ่าน", p.ข้อความ);
  เขียน(repo, "tests/bad.spec.ts", 'await page.goto("http://localhost:3001/leads");\n'); git("add", "-A");
  p = รัน(repo, "scripts/check-hardcoded-ports.mjs");
  ผล(!p.ได้ && /tests\/bad\.spec\.ts:1/.test(p.ข้อความ), "ตัวตรวจพอร์ต: ข้อทดสอบเขียน localhost:3001 เอง → ตก ชี้ไฟล์", p.ข้อความ);
  เขียน(repo, "tests/bad.spec.ts", 'const p = { port: 3102 };\nawait page.goto(`http://localhost:3102/x`);\n'); git("add", "-A");
  p = รัน(repo, "scripts/check-hardcoded-ports.mjs");
  ผล(!p.ได้, "ตัวตรวจพอร์ต: เขียนพอร์ตของเซสชันลูกเอง → ตก", p.ข้อความ);
} finally {
  // ถอดทางลัดที่ข้อทดสอบสร้างก่อนลบโฟลเดอร์ชั่วคราว (ห้ามลบแบบเดินตามทางลัด)
  const { ถอดทางลัดทั้งหมด } = await import(pathToFileURL(join(ราก, "scripts/lib/sessions.mjs")).href);
  if (existsSync(wt)) ถอดทางลัดทั้งหมด(wt);
  rmSync(ที่, { recursive: true, force: true });
}
console.log(ตก ? `FAIL ${ตก}` : "ALL PASS");
process.exit(ตก ? 1 : 0);
