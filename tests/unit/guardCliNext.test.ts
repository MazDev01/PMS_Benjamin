// ── hook ตัวกัน H1 ฉบับถัดไป (guard-cli.next.mjs · บอสสั่ง 16 พ.ย. 69 เพิ่ม: stash + เปลี่ยนทางข้อความ): ป้อน JSON ของ hook → กัน/ผ่าน
//   ทุกข้อของฉบับเดิมยังผ่าน (คัดลอกจาก guardCli.test.ts · ข้อ "git stash" เปลี่ยนเป็นกันตามคำสั่งใหม่) + ข้อใหม่ท้ายไฟล์
//   GUARD_CLI=เดิม = ชี้ฉบับที่ติดตั้งอยู่ (พิสูจน์ว่าฉบับเดิมตกข้อใหม่) ─────────────────────────────────
//   ตัวสคริปต์จริงรันผ่าน stdin (ออก 2 = กัน) ด้วย 1 ข้อ · ที่เหลือเรียกฟังก์ชันตรง
//   รหัสฐานจริงต่อเป็นชิ้น (ไฟล์นี้เองต้องไม่ถูกตัวกันอื่นจับ)
import { describe, it, expect } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os, { tmpdir } from "node:os";
import path from "node:path";
const ไฟล์สคริปต์ = `scripts/claude-hooks/guard-cli${process.env.GUARD_CLI === "เดิม" ? "" : ".next"}.mjs`;
const { ตรวจhook, ตรวจคำสั่ง } = await import(`../../${ไฟล์สคริปต์}`);

const ฐานจริง = "yhhhcrv" + "hkforwsagojho";
const เชลล์ = (command: string, tool = "Bash") => ตรวจhook({ tool_name: tool, tool_input: { command } }) as string;
const กัน = (c: string, tool = "Bash") => expect(เชลล์(c, tool), `ต้องกัน: ${c}`).not.toBe("");
const ผ่าน = (c: string, tool = "Bash") => expect(เชลล์(c, tool), `ต้องผ่าน: ${c}`).toBe("");

describe("supabase CLI แบบจัดการโปรเจกต์/บัญชี = กัน · ทุกรูปแบบการเรียก", () => {
  it("คำสั่งต้องห้าม", () => {
    for (const c of [
      "npx supabase projects list", "supabase link --project-ref abcdefghijklmnopqrst", "npx supabase db push", "npx supabase db push --dry-run",
      "supabase branches list", "supabase secrets list", "supabase functions deploy send-email", "supabase orgs list", "supabase login",
      "npx supabase db query --linked \"select 1\"", "npx supabase migration list", "npx supabase db dump -f x.sql", "supabase inspect db bloat --linked",
      "npx supabase db reset --linked", "supabase status --project-ref abcdefghijklmnopqrst",
    ]) กัน(c);
  });
  it("รูปแบบการเรียก: pnpm dlx · pnpm exec · bunx · supabase.exe · พาธเต็ม · ตัวพิมพ์ใหญ่ · PowerShell &", () => {
    for (const c of ["pnpm dlx supabase projects list", "pnpm exec supabase link", "bunx supabase projects list", "supabase.exe projects list",
      "C:\\tools\\supabase.exe projects list", "./node_modules/.bin/supabase link", "NPX SUPABASE PROJECTS LIST", "Npx Supabase Db Push",
      "& \"C:\\Program Files\\supabase\\supabase.exe\" projects list"]) กัน(c);
    กัน("& 'C:\\x\\supabase.exe' projects list", "PowerShell");
  });
  it("ต่อด้วย ; && || | ขึ้นบรรทัด · ซ้อนใน bash -c", () => {
    for (const c of ["cd x && npx supabase projects list", "echo ok; supabase link", "false || npx supabase db push", "echo y | npx supabase db push",
      "npm run build\nnpx supabase projects list", "bash -c \"npx supabase projects list\"", "cmd /c npx supabase link"]) กัน(c);
  });
  it("คำสั่งในเครื่องกับ Docker/ฐานทดสอบ ยังรันได้", () => {
    for (const c of ["npx supabase start", "npx supabase stop --no-backup", "npx supabase status -o env --workdir C:/.claude/pms-dbcheck",
      "npx supabase db reset --workdir C:/.claude/pms-dbcheck", "supabase migration new add_x", "npx supabase gen types typescript --local",
      "supabase --version", "npx supabase db diff --local", "node scripts/reset-test-db.mjs --workdir C:/.claude/pms-dbcheck",
      "npm run dev", "docker exec -i supabase_db_pms-dbcheck psql -U postgres", "npm run test:unit", "git status"]) ผ่าน(c);
    ผ่าน("npx supabase status -o env", "PowerShell");
  });
});

describe("รหัสฐานจริง · โทเคนบัญชี · prod:query / db:push:prod = กัน", () => {
  it("รหัสฐานจริงที่ไหนก็กัน", () => {
    กัน(`curl https://${ฐานจริง}.supabase.co/rest/v1/`);
    กัน(`echo ${ฐานจริง.toUpperCase()}`);
    กัน(`psql postgresql://postgres.${ฐานจริง}:x@aws-0.pooler.supabase.com:6543/postgres`, "PowerShell");
  });
  it("โทเคนบัญชี / Management API", () => {
    กัน("SUPABASE_ACCESS_TOKEN=abc npx supabase start");
    กัน("curl -H \"Authorization: Bearer sbp_0123456789abcdef\" https://api.supabase.com/v1/projects");
  });
  it("prod:query · db:push:prod ทุกทางเรียก", () => {
    for (const c of ["npm run prod:query -- \"select 1\"", "pnpm run prod:query", "pnpm prod:query", "npm run db:push:prod -- --yes-prod",
      "node scripts/prod-query.mjs \"select 1\"", "node .\\scripts\\db-push-prod.mjs", "cd x && npm run prod:query"]) กัน(c);
  });
});

describe("กันแก้/ลบตัวกันเอง (บอสตัดสิน 16 พ.ย. 69)", () => {
  it("เครื่องมือแก้ไฟล์: Edit/Write/MultiEdit ที่ settings.json · settings.local.json · guard-cli.mjs = กัน · ไฟล์อื่นผ่าน", () => {
    for (const [tool, p] of [["Edit", "C:\\.claude\\Benjamin-HQ-main\\.claude\\settings.json"], ["Write", "C:/.claude/pms-wt/ef/.claude/settings.json"],
      ["MultiEdit", "/c/.claude/x/.claude/settings.local.json"], ["Edit", "C:\\.claude\\pms-wt\\ef\\scripts\\claude-hooks\\guard-cli.mjs"], ["Write", "C:/x/.CLAUDE/Settings.json"]])
      expect(ตรวจhook({ tool_name: tool, tool_input: { file_path: p } }), `${tool} ${p}`).not.toBe("");
    expect(ตรวจhook({ tool_name: "Edit", tool_input: { file_path: "C:/x/apps/hq/settings.json" } })).toBe("");
    expect(ตรวจhook({ tool_name: "Write", tool_input: { file_path: "C:/x/packages/shared/lib/leadStage.ts" } })).toBe("");
  });
  it("เชลล์: เขียน/ลบ/ย้าย/ถอย = กัน · อ่าน/บันทึกลง git = ผ่าน", () => {
    for (const c of ["rm .claude/settings.json", "echo {} > .claude/settings.json", "cat x >> .claude\\settings.json", "sed -i 's/a/b/' .claude/settings.json",
      "mv scripts/claude-hooks/guard-cli.mjs /tmp/x", "git checkout -- .claude/settings.json", "git restore scripts/claude-hooks/guard-cli.mjs",
      "node -e \"require('fs').writeFileSync('.claude/settings.json','{}')\"", "cp x .claude/settings.local.json"]) กัน(c);
    for (const c of ["Remove-Item .claude\\settings.json", "Set-Content -Path .claude\\settings.json -Value '{}'", "Move-Item scripts\\claude-hooks\\guard-cli.mjs x"]) กัน(c, "PowerShell");
    for (const c of ["cat .claude/settings.json", "git diff .claude/settings.json", "git add .claude/settings.json scripts/claude-hooks/guard-cli.mjs",
      "git log -1 -- .claude/settings.json", "grep -n hooks .claude/settings.json"]) ผ่าน(c);
    ผ่าน("Get-Content .claude\\settings.json", "PowerShell");
  });
  it("เครื่องมืออื่น (Read · Grep) ไม่เกี่ยว", () => {
    expect(ตรวจhook({ tool_name: "Read", tool_input: { file_path: "C:/x/.claude/settings.json" } })).toBe("");
  });
});

describe("คำสั่ง git ที่เขียนทับไฟล์ตัวกัน (บอสสั่งเพิ่ม 16 พ.ย. 69) — repo จำลองจริง", () => {
  it("checkout เก่า -- ไฟล์ · restore · reset --hard · stash · checkout/switch ไป commit ที่ไฟล์ต่าง · ทั้งโฟลเดอร์ = กัน · ที่ไม่แตะไฟล์ตัวกัน = ผ่าน", () => {
    const repo = mkdtempSync(path.join(tmpdir(), "guard-cli-git-"));
    const g = (...a: string[]) => execFileSync("git", a, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    try {
      g("init", "-q"); g("config", "user.email", "t@example.test"); g("config", "user.name", "ทดสอบ");
      mkdirSync(path.join(repo, ".claude"), { recursive: true });
      writeFileSync(path.join(repo, ".claude/settings.json"), "{}\n"); writeFileSync(path.join(repo, "app.txt"), "1\n");
      g("add", "-A"); g("commit", "-qm", "ไม่มี hook"); const เก่า = g("rev-parse", "HEAD");
      writeFileSync(path.join(repo, ".claude/settings.json"), "{\"hooks\":{}}\n"); g("add", "-A"); g("commit", "-qm", "ติดตั้ง hook");
      writeFileSync(path.join(repo, "app.txt"), "2\n"); g("add", "-A"); g("commit", "-qm", "งานอื่น"); const งานอื่น = g("rev-parse", "HEAD");
      g("branch", "เหมือนกัน");
      const ใน = (c: string, cwd = repo) => ตรวจคำสั่ง(c, { cwd }) as string;
      for (const c of [`git checkout ${เก่า} -- .claude/settings.json`, "git restore --source HEAD~2 .claude/settings.json", `git reset --hard ${เก่า}`,
        `git checkout ${เก่า}`, `git switch --detach ${เก่า}`, `git switch -c จากเก่า ${เก่า}`, "git checkout -- .", "git restore .", "git checkout .", `git -C ${repo} reset --hard ${เก่า}`])
        expect(ใน(c), `ต้องกัน: ${c}`).not.toBe("");
      expect(ใน(`cd ${repo.replace(/\\/g, "/")} && git reset --hard ${เก่า}`, os.homedir()), "cd แล้ว reset --hard (ติดตามโฟลเดอร์)").not.toBe("");
      for (const c of ["git reset --hard", `git reset --hard ${งานอื่น}`, "git stash list", "git switch เหมือนกัน", "git status", "git log -3", `git reset --soft ${เก่า}`,
        "git switch -q -c work/ใหม่", "git checkout -b fix/ใหม่", `git switch -c ต่อจากงานอื่น ${งานอื่น}`])
        expect(ใน(c), `ต้องผ่าน: ${c}`).toBe("");
      writeFileSync(path.join(repo, ".claude/settings.json"), "{\"hooks\":{\"x\":1}}\n");
      expect(ใน("git stash"), "stash ตอนไฟล์ตัวกันถูกแก้ค้าง = กัน").not.toBe("");
      expect(ใน("git reset --hard"), "reset --hard ตอนไฟล์ตัวกันถูกแก้ค้าง = กัน").not.toBe("");
      expect(ใน("git stash push -- app.txt"), "stash เฉพาะไฟล์อื่น · ตรวจตามไฟล์ตัวกันที่ค้าง").not.toBe("");
    } finally { rmSync(repo, { recursive: true, force: true }); }
  });
  it("ถาม git ไม่ได้ = กันไว้ก่อน", () => {
    expect(ตรวจคำสั่ง("git reset --hard abc", { cwd: "C:/", ถามgit: () => ({ ok: false, out: "" }) })).toMatch(/กันไว้ก่อน/);
  });
});

describe("ตัวสคริปต์จริง (stdin → exit)", () => {
  it("คำสั่งต้องห้าม = exit 2 + ข้อความ · คำสั่งในเครื่อง = exit 0 · JSON เสีย = ปล่อยผ่าน", () => {
    const รัน = (input: string) => spawnSync(process.execPath, [ไฟล์สคริปต์], { input, encoding: "utf8" });
    const ห้าม = รัน(JSON.stringify({ tool_name: "Bash", tool_input: { command: "npx supabase projects list" } }));
    expect(ห้าม.status).toBe(2);
    expect(ห้าม.stderr).toMatch(/บล็อก/);
    expect(รัน(JSON.stringify({ tool_name: "Bash", tool_input: { command: "npx supabase start" } })).status).toBe(0);
    expect(รัน("ไม่ใช่ JSON").status).toBe(0);
  });
  it("ข้อความในคำสั่งที่แค่เอ่ยถึงคำว่า supabase ไม่ใช่การเรียก", () => {
    expect(ตรวจคำสั่ง("echo ใช้ supabase")).toBe("");
    expect(ตรวจคำสั่ง("npm i @supabase/supabase-js")).toBe("");
  });
});

describe("ฉบับถัดไป: git stash ใช้ได้เฉพาะ list/show (บอสสั่ง 16 พ.ย. 69 · stash ใช้ร่วมทั้ง repo · stash ของบอสห้ามแตะ)", () => {
  it("stash ทุกคำสั่งย่อยอื่น = กัน ไม่สนว่าแตะไฟล์ตัวกันไหม · ทุกรูปแบบการเรียก", () => {
    const ไม่ต้องถามgit = () => ({ ok: true, out: "" });   // git ตอบว่าไม่แตะไฟล์ตัวกันเลย — ก็ยังต้องกัน
    for (const c of ["git stash", "git stash push -m x", "git stash save x", "git stash pop", "git stash apply", "git stash apply stash@{0}",
      "git stash pop stash@{1}", "git stash drop", "git stash drop stash@{0}", "git stash clear", "git stash branch x stash@{0}",
      "git stash create", "git stash store abc", "git -C C:/.claude/pms-wt/ef stash pop", "cd C:/x && git stash pop", "echo a; git stash pop",
      "git status && git stash apply", "git stash pop 2>&1 | tail -3", "git stash -q pop", "GIT stash pop"])
      expect(ตรวจคำสั่ง(c, { cwd: "C:/x", ถามgit: ไม่ต้องถามgit }), `ต้องกัน: ${c}`).not.toBe("");
    for (const c of ["git stash pop", "git -C C:\\x stash drop", "git stash clear; git status"]) กัน(c, "PowerShell");
  });
  it("stash list/show = ผ่าน", () => {
    for (const c of ["git stash list", "git stash show", "git stash show -p stash@{0}", "git stash list --date=iso | head"])
      expect(ตรวจคำสั่ง(c, { cwd: "C:/x", ถามgit: () => ({ ok: true, out: "" }) }), `ต้องผ่าน: ${c}`).toBe("");
  });
});

describe("ฉบับถัดไป: การเปลี่ยนทางข้อความของเชลล์ไม่ใช่ชื่อ ref (เดิม merge --ff-only … 2>&1 = ตรวจไม่ได้ → กันผิด)", () => {
  it("merge --ff-only / switch -c / checkout -b / pull ที่ไม่แตะไฟล์ตัวกัน + 2>&1 · > ไฟล์ · 2>/dev/null = ผ่าน · ref ที่ถามคือ ref จริง", () => {
    const ถาม: string[][] = [];
    const ถามgit = (args: string[]) => { ถาม.push(args); return { ok: !args.some(a => /[<>&]/.test(a)), out: "apps/x.ts" }; };
    for (const c of ["git merge --ff-only origin/monorepo 2>&1 | tail -3", "git merge --ff-only 258cfd41 > out.txt", "git merge --ff-only 258cfd41 >out.txt",
      "git switch -c work/phone-guard 2>&1 | tail -1", "git checkout -b fix/x 2>/dev/null", "git merge monorepo 2> err.txt", "git pull --ff-only 2>&1"])
      expect(ตรวจคำสั่ง(c, { cwd: "C:/x", ถามgit }), `ต้องผ่าน: ${c}`).toBe("");
    expect(ถาม.flat().some(a => /[<>&]/.test(a) && !a.startsWith("HEAD...@")), "ไม่ส่งตัวเปลี่ยนทางไปถาม git").toBe(false);
    expect(ถาม.flat()).toContain("HEAD...origin/monorepo");
  });
  it("merge ที่แตะไฟล์ตัวกัน + 2>&1 ยังกัน", () => {
    const ถามgit = () => ({ ok: true, out: ".claude/settings.json\napps/x.ts" });
    expect(ตรวจคำสั่ง("git merge --ff-only origin/monorepo 2>&1", { cwd: "C:/x", ถามgit })).toMatch(/เขียนทับไฟล์ตัวกัน/);
  });
});
