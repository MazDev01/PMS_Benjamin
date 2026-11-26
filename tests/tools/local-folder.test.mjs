// ── ข้อทดสอบ: โฟลเดอร์ในเครื่องรวมที่ .local/ (บอสเลือก 24 พ.ย. 69 "ย้ายเข้า Benjamin-HQ-main" · งาน 26 พ.ย. 69) ─────────────
//   1) ตัวกลางที่อยู่ scripts/lib/localPaths.mjs: worktree ใน .local/wt ได้ราก .local ของโฟลเดอร์หลัก (ไม่ซ้อน) · ก่อนย้ายใช้ที่เดิม · ย้ายแล้วใช้ที่ใหม่
//   2) โค้ดไม่เขียน C:/.claude/pms-* ตรง ๆ อีก (นอกคอมเมนต์ · ยกเว้นข้อทดสอบตัวกันคำสั่งที่ใช้เป็นตัวอย่างคำสั่ง)
//   3) git ไม่เก็บ .local (.gitignore) · Vercel ไม่อัป (.vercelignore) · next ไม่ติดไปกับผล build
//   4) pre-commit ปฏิเสธไฟล์ใต้ .local แม้ git add -f · pre-push ปฏิเสธ commit ที่มี/เคยมีไฟล์ใต้ .local (ทุก branch)
//   5) ตัวตรวจกุญแจฐานจริงตรวจใน .local (เจอกุญแจในโฟลเดอร์เซสชัน = ตก) แต่ไม่เปิดโฟลเดอร์ชื่อ prod-secrets · prod-backups
//      (26 พ.ย. 69 ของจริงอยู่นอก repo · ชื่อนี้ใต้ repo = ตกที่ tests/tools/private-outside-repo.test.mjs)
//      และ .local ที่ git ไม่ได้กัน = ตก
//   6) เครื่องมือไม่กวาดเข้า .local: vitest · playwright · tsc ของชุดทดสอบ · ตัวนับ ratchet (วางไฟล์ปลอมใน .local แล้วต้องไม่ถูกหยิบ)
//   7) ตัวย้าย scripts/move-local.mjs: ค่าเริ่ม = ดูอย่างเดียว (ไม่แตะอะไร) · --ย้าย ย้าย worktree ด้วย git worktree move + ทางลัดคืน
//      + ทะเบียนเซสชันชี้ที่ใหม่ + ตัวส่งต่อทะเบียนบทบาท · ไม่ยอมย้ายเมื่อเซสชันมีงานค้าง (โฟลเดอร์จำลองทั้งหมด)
//      · pms-prod-backups / pms-prod-secrets ไม่ย้ายเข้า .local (26 พ.ย. 69 · อยู่นอก repo)
//   ตกบนโค้ดเดิม: ไม่มี localPaths/localGuard/move-local · .gitignore ไม่มี /.local/ · commit/push ไฟล์ใน .local ผ่าน
// รัน: node tests/tools/local-folder.test.mjs   (ไม่ใช้เว็บ/ฐานทดสอบ · โฟลเดอร์จำลองในโฟลเดอร์ชั่วคราว)
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { envตัวลูกแยกจากรอบ } from "../../scripts/lib/childEnv.mjs";

// ตัวลูกทุกตัว (vitest · playwright --list · tsc · ตัวย้าย · ตัวตรวจ) ใช้ env ที่ตัดของรอบตรวจเต็มออก (ไม่ได้ token/รายงาน/พอร์ตของรอบ)
const envลูก = envตัวลูกแยกจากรอบ();

const ราก = process.cwd();
let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n   ${String(เพิ่ม).slice(0, 1200)}`}`); };
const ทับ = (p) => String(p).replace(/\\/g, "/");
const เท่า = (a, b) => ทับ(path.resolve(a)).toLowerCase() === ทับ(path.resolve(b)).toLowerCase();
const git = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const ชั่วคราว = mkdtempSync(path.join(tmpdir(), "local-folder-"));
const เขียน = (p, s) => { mkdirSync(path.dirname(p), { recursive: true }); writeFileSync(p, s); };
const นำเข้า = async (rel) => { try { return await import(pathToFileURL(path.join(ราก, rel)).href); } catch (e) { ผล(false, `โหลด ${rel} ได้`, e.message); return null; } };
const ล้างenv = () => { delete process.env.PMS_LOCAL_ROOT; delete process.env.PMS_LEGACY_ROOT; };
const ตั้งenv = {};
for (const k of ["PMS_LOCAL_ROOT", "PMS_LEGACY_ROOT"]) ตั้งenv[k] = process.env[k];

try {
  // ── 1) ตัวกลางที่อยู่ ──
  const lp = await นำเข้า("scripts/lib/localPaths.mjs");
  const หลัก = path.join(ชั่วคราว, "main");
  mkdirSync(หลัก);
  git(หลัก, "init", "-q", "-b", "monorepo");
  git(หลัก, "config", "user.email", "zz@example.test"); git(หลัก, "config", "user.name", "zz");
  เขียน(path.join(หลัก, "a.txt"), "a\n");
  git(หลัก, "add", "."); git(หลัก, "commit", "-q", "--no-verify", "-m", "a");
  const ในwt = path.join(หลัก, ".local", "wt", "s1");
  git(หลัก, "worktree", "add", "-q", "-b", "session/s1", ในwt);
  if (lp) {
    ล้างenv();
    ผล(เท่า(lp.โฟลเดอร์หลัก(ในwt), หลัก), "worktree ใน .local/wt ได้โฟลเดอร์หลักเดียวกัน", lp.โฟลเดอร์หลัก(ในwt));
    ผล(เท่า(lp.รากLocal(ในwt), path.join(หลัก, ".local")), "ราก .local ของ worktree = <หลัก>/.local (ไม่ซ้อน .local ในเซสชัน)", lp.รากLocal(ในwt));
    ผล(เท่า(lp.รากLocal(หลัก), path.join(หลัก, ".local")), "ราก .local ของโฟลเดอร์หลัก = <หลัก>/.local");
    process.env.PMS_LOCAL_ROOT = path.join(ชั่วคราว, "ทับ");
    ผล(เท่า(lp.รากLocal(หลัก), path.join(ชั่วคราว, "ทับ")), "PMS_LOCAL_ROOT ทับรากได้");
    delete process.env.PMS_LOCAL_ROOT;
    const เดิม = path.join(ชั่วคราว, "legacy");
    process.env.PMS_LEGACY_ROOT = เดิม;
    ผล(เท่า(lp.ที่ใน("dbcheck", { cwd: หลัก }), path.join(หลัก, ".local/dbcheck")), "ไม่มีทั้งที่เดิมและที่ใหม่ = ที่ใหม่");
    mkdirSync(path.join(เดิม, "pms-dbcheck"), { recursive: true });
    ผล(เท่า(lp.ที่ใน("dbcheck", { cwd: หลัก }), path.join(เดิม, "pms-dbcheck")), "ยังไม่ย้าย (มีแต่ที่เดิม) = ที่เดิม — เครื่องมือใช้ได้ระหว่างรอย้าย");
    mkdirSync(path.join(หลัก, ".local/dbcheck"), { recursive: true });
    ผล(เท่า(lp.ที่ใน("dbcheck", { cwd: หลัก }), path.join(หลัก, ".local/dbcheck")), "ย้ายแล้ว (มีที่ใหม่) = ที่ใหม่เสมอ");
    process.env.PMS_LEGACY_ROOT = "-";
    ผล(เท่า(lp.ที่ใน("wt", { cwd: หลัก }), path.join(หลัก, ".local/wt")), "PMS_LEGACY_ROOT=- ไม่ดูที่เดิม");
    let โยน = ""; try { lp.ที่ใน("ไม่มีชื่อนี้"); } catch (e) { โยน = e.message; }
    ผล(/ไม่รู้จักชื่อ/.test(โยน), "ชื่อที่ไม่อยู่ในตารางย้าย = หยุด (ไม่เดาที่อยู่)");
    ผล(lp.ห้ามเปิด.includes("prod-backups") && lp.ห้ามเปิด.includes("prod-secrets"), "prod-backups · prod-secrets อยู่ในรายชื่อห้ามเปิด");
    ผล(!("prod-backups" in lp.ตารางย้าย) && !("prod-secrets" in lp.ตารางย้าย), "prod-backups · prod-secrets ไม่อยู่ในตารางย้าย .local (อยู่นอก repo · 26 พ.ย. 69)");
    for (const [k, v] of Object.entries(ตั้งenv)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }

  // ── 2) โค้ดไม่เขียนที่อยู่เดิมตรง ๆ ──
  // private-outside-repo.test.mjs: ตรวจว่าค่าตั้งต้นรากส่วนตัว = C:/.claude/pms-private (ต้องเขียนค่าที่คาดตรง ๆ · 26 พ.ย. 69)
const ยกเว้นไฟล์ = new Set(["tests/unit/guardCli.test.ts", "tests/unit/guardCliNext.test.ts", "tests/tools/proof-folder.test.mjs", "tests/tools/local-folder.test.mjs", "tests/tools/private-outside-repo.test.mjs"]);
  const โค้ด = git(ราก, "ls-files", "--", "scripts", "tests", "apps", "packages").split(/\r?\n/).filter(f => /\.(mjs|cjs|js|ts|tsx)$/.test(f) && !ยกเว้นไฟล์.has(f) && existsSync(path.join(ราก, f)));
  const เจอ = [];
  for (const f of โค้ด) {
    readFileSync(path.join(ราก, f), "utf8").split(/\r?\n/).forEach((l, i) => {
      const ไม่รวมคอมเมนต์ = l.replace(/^\s*\/\/.*$/, "").replace(/\s\/\/\s.*$/, "");
      if (f === "scripts/lib/localPaths.mjs" && /"C:\/\.claude\/pms-private"/.test(ไม่รวมคอมเมนต์)) return;   // ค่าตั้งต้นรากส่วนตัว (นอก repo) ที่เดียว
      if (/C:[\\/]+\.claude[\\/]+pms-/i.test(ไม่รวมคอมเมนต์)) เจอ.push(`${f}:${i + 1}`);
    });
  }
  ผล(เจอ.length === 0, `โค้ดไม่เขียนที่อยู่ C:/.claude/pms-* ตรง ๆ (ตรวจ ${โค้ด.length} ไฟล์ · ใช้ scripts/lib/localPaths.mjs)`, เจอ.slice(0, 15).join("\n   "));
  // spec ของ Playwright ห้ามดึง localPaths.mjs ตรง ๆ — รอบตรวจเต็ม deploy36 (26 พ.ย. 69) โหลดไม่ได้ทั้งไฟล์ · ใช้ tests/scenario/localPaths.ts
  //   (ฉบับเดียวกัน · tests/unit/localPathsSpec.test.ts เทียบผลสองฉบับ)
  const specดึงmjs = โค้ด.filter(f => /^tests\/(scenario|prod-live)\/.*\.ts$/.test(f) && /from\s+["'][^"']*scripts\/lib\/localPaths\.mjs["']/.test(readFileSync(path.join(ราก, f), "utf8")));
  ผล(specดึงmjs.length === 0, "spec ของ Playwright ไม่ดึง scripts/lib/localPaths.mjs (ใช้ tests/scenario/localPaths.ts)", specดึงmjs.join("\n   "));
  ผล(existsSync(path.join(ราก, "tests/scenario/localPaths.ts")), "มีตัวกลางที่อยู่ฉบับ spec tests/scenario/localPaths.ts");

  // ── 3) git/Vercel/next ไม่เก็บ .local ──
  const ig = spawnSync("git", ["check-ignore", "-q", ".local/zz-ตรวจ/ไฟล์.txt"], { cwd: ราก });
  ผล(ig.status === 0, "git ไม่เก็บไฟล์ใต้ .local (.gitignore /.local/)");
  ผล(/^\.local\/\s*$/m.test(readFileSync(path.join(ราก, ".vercelignore"), "utf8")), "Vercel ไม่อัป .local (.vercelignore)");
  for (const แอป of ["hq", "dealer"]) {
    const s = readFileSync(path.join(ราก, `apps/${แอป}/next.config.ts`), "utf8");
    ผล(/outputFileTracingExcludes:\s*\{\s*"\*":\s*\[[^\]]*"\.\.\/\.\.\/\.local\/\*\*"/.test(s), `แอป ${แอป}: ผล build ไม่ติดไฟล์จาก .local (outputFileTracingExcludes)`);
  }

  // ── 4) ตัวกัน commit / push ──
  const จำลอง = path.join(ชั่วคราว, "hook-repo"), ปลาย = path.join(ชั่วคราว, "remote.git");
  mkdirSync(จำลอง);
  git(ชั่วคราว, "init", "-q", "--bare", ปลาย);
  git(จำลอง, "init", "-q", "-b", "monorepo");
  git(จำลอง, "config", "user.email", "zz@example.test"); git(จำลอง, "config", "user.name", "zz");
  for (const f of [".githooks/pre-commit", ".githooks/pre-push", "scripts/git-hooks/pre-commit.mjs", "scripts/git-hooks/pre-push.mjs", "scripts/check-no-real-phones.mjs",
    "scripts/lib/session.mjs", "scripts/lib/sessions.mjs", "scripts/lib/commitGate.mjs", "scripts/lib/flakyAck.mjs", "scripts/lib/fastGate.mjs", "scripts/lib/flakyLog.mjs",
    "scripts/lib/prodLock.mjs", "scripts/lib/fileLock.mjs", "scripts/lib/readOnlySql.mjs", "scripts/lib/supabaseCli.mjs", "scripts/lib/gitFiles.mjs", "scripts/lib/ports.json",
    "scripts/lib/localPaths.mjs", "scripts/lib/localGuard.mjs"]) {
    if (!existsSync(path.join(ราก, f))) continue;
    mkdirSync(path.dirname(path.join(จำลอง, f)), { recursive: true });
    copyFileSync(path.join(ราก, f), path.join(จำลอง, f));
  }
  writeFileSync(path.join(จำลอง, ".gitignore"), "node_modules/\n");   // repo จำลองไม่มี /.local/ ใน .gitignore = กรณีที่ .gitignore ถูกแก้/หาย
  git(จำลอง, "config", "core.hooksPath", ".githooks");
  git(จำลอง, "remote", "add", "origin", ปลาย);
  git(จำลอง, "add", "."); git(จำลอง, "commit", "-q", "--no-verify", "-m", "ตั้งต้น");
  const commit = (...a) => spawnSync("git", ["commit", "-q", ...a], { cwd: จำลอง, encoding: "utf8", env: envลูก });
  const push = (...a) => spawnSync("git", ["push", "-q", "origin", ...a], { cwd: จำลอง, encoding: "utf8", env: envลูก });
  เขียน(path.join(จำลอง, "ok.txt"), "ok\n"); git(จำลอง, "add", "ok.txt");
  let r = commit("-m", "ไฟล์ปกติ");
  ผล(r.status === 0, "commit ไฟล์ปกติผ่าน (ตัวกันไม่ขวางงานปกติ)", r.stderr);
  เขียน(path.join(จำลอง, ".local/prod-secrets/zz.env"), "ZZ=ปลอม\n");
  git(จำลอง, "add", "-f", ".local/prod-secrets/zz.env");
  r = commit("-m", "หลุด");
  ผล(r.status !== 0 && /\.local/.test(r.stderr), "pre-commit: git add -f ไฟล์ใต้ .local แล้ว commit = ปฏิเสธ", `${r.status}\n${r.stderr}`);
  ผล(!git(จำลอง, "ls-tree", "-r", "--name-only", "HEAD").split(/\r?\n/).some(f => f.startsWith(".local/")), "ไม่มี commit ที่มีไฟล์ .local เกิดขึ้น");
  git(จำลอง, "rm", "-q", "--cached", ".local/prod-secrets/zz.env");
  r = push("monorepo:refs/heads/wip/ปกติ");
  ผล(r.status === 0, "push branch ที่ไม่มีไฟล์ .local ผ่าน", r.stderr);
  // ข้ามตัวกัน commit (จำลองคนใช้ --no-verify) → ตัวกัน push ต้องจับได้ ทั้งไฟล์ที่ยังอยู่ และไฟล์ที่เพิ่มแล้วลบในประวัติ
  git(จำลอง, "add", "-f", ".local/prod-secrets/zz.env"); git(จำลอง, "commit", "-q", "--no-verify", "-m", "หลุด (ข้ามตัวกัน)");
  r = push("monorepo:refs/heads/wip/หลุด");
  ผล(r.status !== 0 && /\.local/.test(r.stderr), "pre-push: commit ที่มีไฟล์ใต้ .local = ปฏิเสธ (branch ใดก็ได้)", `${r.status}\n${r.stderr}`);
  git(จำลอง, "rm", "-q", "--cached", ".local/prod-secrets/zz.env"); git(จำลอง, "commit", "-q", "--no-verify", "-m", "ลบออกแล้ว");
  r = push("monorepo:refs/heads/wip/หลุด");
  ผล(r.status !== 0 && /\.local/.test(r.stderr), "pre-push: เพิ่มแล้วลบในประวัติ = ยังปฏิเสธ (ประวัติขึ้น GitHub ด้วย)", `${r.status}\n${r.stderr}`);
  r = push("monorepo");
  ผล(r.status !== 0 && /\.local/.test(r.stderr), "pre-push: push ขึ้น monorepo ที่มีไฟล์ .local ในประวัติ = ปฏิเสธ", `${r.status}\n${r.stderr}`);
  ผล(!spawnSync("git", ["rev-parse", "--verify", "-q", "refs/heads/wip/หลุด"], { cwd: ปลาย }).stdout?.toString().trim(), "ปลายทางไม่ได้รับ branch ที่มีไฟล์ .local");

  // ── 5) ตัวตรวจกุญแจฐานจริง ──
  const โฟลเดอร์ตรวจ = path.join(ชั่วคราว, "secrets-check");
  mkdirSync(โฟลเดอร์ตรวจ);
  git(โฟลเดอร์ตรวจ, "init", "-q");
  writeFileSync(path.join(โฟลเดอร์ตรวจ, ".gitignore"), "/.local/\n");
  const ส่วน = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const กุญแจปลอม = [ส่วน({ alg: "HS256", typ: "JWT" }), ส่วน({ role: "service_role", iss: "zz-ทดสอบ-ไม่ใช่ฐานจริง" }), "z".repeat(24)].join(".");   // สร้างตอนรัน ไม่มีในไฟล์นี้
  for (let i = 0; i < 3; i++) เขียน(path.join(โฟลเดอร์ตรวจ, `.local/prod-secrets/k${i}.env`), `SUPABASE_SERVICE_ROLE_KEY=${กุญแจปลอม}\n`);
  เขียน(path.join(โฟลเดอร์ตรวจ, ".local/prod-backups/ชุด/db.sql"), `-- ${กุญแจปลอม}\n`);
  เขียน(path.join(โฟลเดอร์ตรวจ, ".local/dev/note.txt"), "ไม่มีกุญแจ\n");
  const ตรวจกุญแจ = () => spawnSync(process.execPath, [path.join(ราก, "scripts/check-prod-secrets-in-repo.mjs")], { cwd: โฟลเดอร์ตรวจ, encoding: "utf8", env: envลูก });
  r = ตรวจกุญแจ();
  const จำนวนตรวจ = (s) => Number(/ตรวจ (\d+) ไฟล์/.exec(s)?.[1] ?? -1);
  ผล(r.status === 0, "ตัวตรวจกุญแจไม่ตกเพราะไฟล์ใน .local/prod-secrets · .local/prod-backups (ไม่เปิด · ชื่อโฟลเดอร์ใต้ repo ตกที่ check-private-outside-repo)", r.stdout + r.stderr);
  ผล(จำนวนตรวจ(r.stdout) === 2, `ไม่เปิดไฟล์ใน prod-secrets/prod-backups (ตรวจแค่ .gitignore + .local/dev/note.txt = 2 ไฟล์ · ได้ ${จำนวนตรวจ(r.stdout)})`, r.stdout);
  เขียน(path.join(โฟลเดอร์ตรวจ, ".local/wt/s1/apps/hq/.env.local"), `SUPABASE_SERVICE_ROLE_KEY=${กุญแจปลอม}\n`);
  r = ตรวจกุญแจ();
  ผล(r.status !== 0 && /\.local\/wt\/s1\/apps\/hq\/\.env\.local/.test(r.stdout), "กุญแจในโฟลเดอร์เซสชันใต้ .local = ตก (ตรวจใน .local ด้วย)", r.stdout);
  rmSync(path.join(โฟลเดอร์ตรวจ, ".local/wt"), { recursive: true, force: true });
  writeFileSync(path.join(โฟลเดอร์ตรวจ, ".gitignore"), "node_modules/\n");
  r = ตรวจกุญแจ();
  ผล(r.status !== 0 && /git ไม่ได้กัน/.test(r.stdout), "มี .local แต่ .gitignore ไม่กัน = ตก", r.stdout);

  // ── 6) เครื่องมือไม่กวาดเข้า .local (วางไฟล์ปลอมใน .local ของโฟลเดอร์นี้ · ลบทิ้งตอนจบ) ──
  const ปลอม = path.join(ราก, ".local", `zz-local-folder-test-${process.pid}`);
  try {
    เขียน(path.join(ปลอม, "tests/unit/zz-ปลอม.test.ts"), 'import { it, expect } from "vitest";\nit("zz-ปลอม-ห้ามรัน", () => expect(1).toBe(2));\n');
    เขียน(path.join(ปลอม, "tests/scenario/zz-ปลอม.spec.ts"), 'import { test } from "@playwright/test";\ntest("zz-ปลอม-ห้ามรัน", async ({ page }) => { await page.waitForTimeout(1); });\n');
    เขียน(path.join(ปลอม, "tests/zz-ปลอม-ชนิด.ts"), "const x: number = \"ไม่ใช่ตัวเลข\";\nexport default x;\n");
    const npx = process.platform === "win32" ? "npx.cmd" : "npx";
    const vl = spawnSync(npx, ["vitest", "list", "--filesOnly"], { cwd: ราก, encoding: "utf8", env: envลูก, shell: process.platform === "win32", timeout: 180_000 });
    ผล(vl.status === 0 && /tests[\\/]unit/.test(vl.stdout) && !/zz-ปลอม/.test(vl.stdout + vl.stderr), "vitest ไม่หยิบข้อทดสอบใน .local", `${vl.status}\n${(vl.stdout + vl.stderr).slice(-600)}`);
    const pl = spawnSync(npx, ["playwright", "test", "--list"], { cwd: ราก, encoding: "utf8", env: envลูก, shell: process.platform === "win32", timeout: 300_000 });
    ผล(pl.status === 0 && /Total: \d+ tests?/.test(pl.stdout) && !/zz-ปลอม/.test(pl.stdout + pl.stderr), "playwright ไม่หยิบข้อทดสอบใน .local", `${pl.status}\n${(pl.stdout + pl.stderr).slice(-600)}`);
    const tc = spawnSync(npx, ["tsc", "-p", "tests/tsconfig.json", "--listFilesOnly"], { cwd: ราก, encoding: "utf8", env: envลูก, shell: process.platform === "win32", timeout: 300_000, maxBuffer: 64 << 20 });
    ผล(/tests[\\/]/.test(tc.stdout) && !/zz-ปลอม/.test(tc.stdout), "tsc ของชุดทดสอบไม่ตรวจไฟล์ใน .local", (tc.stdout + tc.stderr).slice(-600));
    const rt = spawnSync(process.execPath, ["scripts/check-test-ratchet.mjs"], { cwd: ราก, encoding: "utf8", env: envลูก });
    ผล(rt.status === 0 && !/zz-ปลอม/.test(rt.stdout + rt.stderr), "ตัวนับ ratchet ไม่นับไฟล์ใน .local", rt.stdout + rt.stderr);
    ผล(!git(ราก, "status", "--porcelain", "--untracked-files=all").split(/\r?\n/).some(l => l.includes(".local")), "git status ไม่เห็นไฟล์ใน .local");
  } finally { rmSync(ปลอม, { recursive: true, force: true }); }

  // ── 7) ตัวย้าย (โฟลเดอร์จำลอง) ──
  const ml = path.join(ราก, "scripts/move-local.mjs");
  const จ = path.join(ชั่วคราว, "mv"), จหลัก = path.join(จ, "Benjamin-HQ-main"), จเดิม = path.join(จ, "legacy");
  mkdirSync(จหลัก, { recursive: true });
  git(จหลัก, "init", "-q", "-b", "monorepo");
  git(จหลัก, "config", "user.email", "zz@example.test"); git(จหลัก, "config", "user.name", "zz");
  เขียน(path.join(จหลัก, "a.txt"), "a\n"); git(จหลัก, "add", "."); git(จหลัก, "commit", "-q", "--no-verify", "-m", "a");
  const จwt = path.join(จเดิม, "pms-wt");
  mkdirSync(จwt, { recursive: true });
  git(จหลัก, "worktree", "add", "-q", "-b", "session/s1", path.join(จwt, "s1"));
  git(จหลัก, "worktree", "add", "-q", "--detach", path.join(จเดิม, "pms-dbcheck"));
  // ทางลัดในเซสชัน (แบบ pnpm: ชี้เข้าในโฟลเดอร์ตัวเอง) — ย้ายแล้วต้องชี้ที่ใหม่
  เขียน(path.join(จwt, "s1", "packages/shared/x.ts"), "export {};\n");
  mkdirSync(path.join(จwt, "s1", "node_modules/@pms"), { recursive: true });
  symlinkSync(path.join(จwt, "s1", "packages/shared"), path.join(จwt, "s1", "node_modules/@pms/shared"), "junction");
  เขียน(path.join(จwt, "deploy-gate.log"), "บันทึก\n");
  for (let i = 0; i < 4; i++) เขียน(path.join(จเดิม, `pms-prod-secrets/s${i}.env`), `ZZ=${i}\n`);
  เขียน(path.join(จเดิม, "pms-prod-backups/ชุด1/db.sql"), "-- ปลอม\n");
  เขียน(path.join(จเดิม, "pms-session-registry/registry.mjs"), 'console.log("ทะเบียนจำลอง " + process.argv.slice(2).join(" "));\n');
  เขียน(path.join(จเดิม, "pms-migration-reservations.md"), "# จอง\n");
  const ทะเบียนเซสชัน = path.join(จหลัก, ".git", "pms-sessions.json");
  writeFileSync(ทะเบียนเซสชัน, JSON.stringify({ s1: { ช่อง: 1, โฟลเดอร์: ทับ(path.join(จwt, "s1")), branch: "session/s1" } }));
  writeFileSync(path.join(จwt, "s1", ".pms-session.json"), JSON.stringify({ ชื่อ: "s1", โฟลเดอร์: ทับ(path.join(จwt, "s1")) }));
  // .pms-session.json อยู่ในเซสชัน = ไฟล์ที่ git ไม่รู้จัก → กันด้วย exclude ของ repo (ของจริงอยู่ใน .gitignore)
  เขียน(path.join(จหลัก, ".git", "info", "exclude"), ".pms-session.json\nnode_modules/\npackages/\n");
  const envย้าย = { ...envลูก, PMS_LEGACY_ROOT: จเดิม, PMS_LOCAL_ROOT: "", PMS_ROUND_DIR: path.join(จ, "round"),
    PMS_TESTDB_LOCK: path.join(จ, "testdb.lock"), PMS_PROD_LOCK: path.join(จ, "prod.lock") };
  delete envย้าย.PMS_LOCAL_ROOT;
  const รันตัวย้าย = (...a) => spawnSync(process.execPath, [ml, ...a], { cwd: จหลัก, encoding: "utf8", env: envย้าย, timeout: 120_000 });
  // งานค้างในเซสชัน = ไม่ยอมย้าย
  เขียน(path.join(จwt, "s1", "ค้าง.txt"), "ยังไม่ commit\n");
  r = รันตัวย้าย("--ย้าย");
  ผล(r.status !== 0 && /มีงานค้าง/.test(r.stdout) && existsSync(path.join(จwt, "s1")), "เซสชันมีงานค้าง = ไม่ยอมย้าย (ไม่แตะอะไร)", r.stdout + r.stderr);
  rmSync(path.join(จwt, "s1", "ค้าง.txt"));
  // ดูอย่างเดียว = ไม่แตะอะไร
  r = รันตัวย้าย();
  ผล(r.status === 0 && /ดูอย่างเดียว/.test(r.stdout) && existsSync(จwt) && !existsSync(path.join(จหลัก, ".local/wt")), "ค่าเริ่ม = ดูอย่างเดียว: พิมพ์แผน ไม่ย้าย", r.stdout + r.stderr);
  ผล(!/prod-secrets|prod-backups/.test(r.stdout), "แผนไม่มี prod-secrets · prod-backups (ไม่ย้ายเข้า .local · อยู่นอก repo)", r.stdout);
  // ย้ายจริง
  r = รันตัวย้าย("--ย้าย");
  ผล(r.status === 0, "--ย้าย สำเร็จ · จำนวนไฟล์/ขนาด/ทางลัดก่อนหลังเท่ากันทุกโฟลเดอร์", r.stdout + r.stderr);
  const ใหม่ = (n) => path.join(จหลัก, ".local", n);
  ผล(existsSync(path.join(ใหม่("wt"), "s1/a.txt")) && !existsSync(จwt), "โฟลเดอร์เซสชันย้ายไป .local/wt");
  ผล(existsSync(path.join(ใหม่("wt"), "deploy-gate.log")), "ไฟล์อื่นใน pms-wt (บันทึกรอบ) ย้ายตาม");
  const wtl = git(จหลัก, "worktree", "list", "--porcelain");
  ผล(wtl.includes(ทับ(path.join(ใหม่("wt"), "s1"))) && wtl.includes(ทับ(ใหม่("dbcheck"))) && !wtl.includes("legacy"), "git รู้จัก worktree ที่ใหม่ (git worktree move · ไม่ rename ตรง)", wtl);
  ผล(git(path.join(ใหม่("wt"), "s1"), "status", "--porcelain") === "", "เซสชันที่ย้ายแล้ว git status สะอาด");
  const ลิงก์ = path.join(ใหม่("wt"), "s1", "node_modules/@pms/shared");
  ผล(existsSync(ลิงก์) && lstatSync(ลิงก์).isSymbolicLink() && เท่า(readlinkSync(ลิงก์), path.join(ใหม่("wt"), "s1", "packages/shared")), "ทางลัดสร้างคืนชี้ที่ใหม่", existsSync(ลิงก์) ? readlinkSync(ลิงก์) : "ไม่มีทางลัด");
  ผล(!existsSync(ใหม่("prod-secrets")) && !existsSync(ใหม่("prod-backups")) && existsSync(path.join(จเดิม, "pms-prod-secrets/s3.env")) && existsSync(path.join(จเดิม, "pms-prod-backups/ชุด1/db.sql")),
    "ตัวย้ายไม่แตะ pms-prod-secrets · pms-prod-backups (ไม่ย้ายเข้า .local)");
  ผล(existsSync(ใหม่("migration-reservations.md")), "ไฟล์จองเลขใบย้ายตาม");
  const ทบ = JSON.parse(readFileSync(ทะเบียนเซสชัน, "utf8"));
  ผล(เท่า(ทบ.s1.โฟลเดอร์, path.join(ใหม่("wt"), "s1")), "ทะเบียนเซสชันชี้ที่ใหม่", ทบ.s1.โฟลเดอร์);
  ผล(เท่า(JSON.parse(readFileSync(path.join(ใหม่("wt"), "s1/.pms-session.json"), "utf8")).โฟลเดอร์, path.join(ใหม่("wt"), "s1")), ".pms-session.json ชี้ที่ใหม่");
  const ส่งต่อ = spawnSync(process.execPath, [path.join(จเดิม, "pms-session-registry/registry.mjs"), "หา", "ef"], { encoding: "utf8" });
  ผล(/ทะเบียนจำลอง หา ef/.test(ส่งต่อ.stdout), "ตัวส่งต่อที่ที่เดิมเรียกทะเบียนบทบาทตัวใหม่ได้ (settings ของบอสยังใช้ได้)", ส่งต่อ.stdout + ส่งต่อ.stderr);
  ผล(/บอสแก้ hook ใน settings 2 บรรทัด/.test(r.stdout), "ตัวย้ายพิมพ์บรรทัดใหม่ให้บอสแก้ settings เอง");
  r = รันตัวย้าย();
  ผล(r.status === 0 && /ย้ายแล้ว/.test(r.stdout), "รันซ้ำหลังย้าย = บอกว่าย้ายแล้ว ไม่ทำซ้ำ", r.stdout + r.stderr);
} catch (e) {
  ผล(false, "ข้อทดสอบรันจนจบ", e.stack ?? e);
} finally {
  try { for (const w of git(path.join(ชั่วคราว, "main"), "worktree", "list", "--porcelain").split(/\r?\n/).filter(l => l.startsWith("worktree ")).slice(1)) git(path.join(ชั่วคราว, "main"), "worktree", "remove", "--force", w.slice(9)); } catch { /* ไม่มี */ }
  rmSync(ชั่วคราว, { recursive: true, force: true, maxRetries: 3 });
}

console.log(ตก ? `\n✗ ตก ${ตก} ข้อ` : "\nALL PASS");
process.exit(ตก ? 1 : 0);
