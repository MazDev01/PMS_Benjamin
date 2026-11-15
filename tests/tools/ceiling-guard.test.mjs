// ── ข้อทดสอบ: ตัวกันเพิ่มเพดานของตัวตรวจ (scripts/lib/ceilingGuard.mjs · บอสสั่ง 13 พ.ย. 69) ─────────────────────────
//   repo จำลองในโฟลเดอร์ชั่วคราว (สาขา monorepo = ฐาน) · ไม่แตะ repo จริง
//   (1) เพิ่มเพดานไม่มีรับทราบ = ตก  (2) รับทราบตรงค่า = ผ่าน  (3) รับทราบคนละค่า = ตก  (4) ลดเพดาน = ผ่าน
//   (5) รายการใหม่ที่เดิมไม่มี (จาก 0) = นับเป็นเพิ่ม  (6) เพิ่มใน commit ก่อนหน้าของสาขา = ยังจับได้ (เทียบ merge-base)
//   (7) ceiling:ack ถูกกันเมื่อมีตัวแปรของ AI · (8) ไม่ใช่หน้าต่างคำสั่งจริง = ถูกกัน · (9) อยู่ในชุด checks
//   ตกบนโค้ดเดิม: ไม่มีตัวกัน — แก้ไฟล์เพดานขึ้นแล้ว commit ได้เลย
// รัน: node tests/tools/ceiling-guard.test.mjs
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, appendFileSync, rmSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync, execFileSync } from "node:child_process";

let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n   ${String(เพิ่ม).slice(0, 900)}`}`); };
const ราก = process.cwd();
const d = mkdtempSync(join(tmpdir(), "pms-ceiling-"));
const git = (...a) => execFileSync("git", a, { cwd: d, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
try {
  mkdirSync(join(d, "scripts/lib"), { recursive: true });
  for (const f of ["scripts/lib/ceilingGuard.mjs", "scripts/check-ceiling-raise.mjs", "scripts/ceiling-ack.mjs"]) copyFileSync(join(ราก, f), join(d, f));
  const เขียนเพดาน = (lint, ratchet) => {
    writeFileSync(join(d, "scripts/lint-ceiling.json"), JSON.stringify({ หมายเหตุ: "x", คำเตือนสูงสุด: lint }));
    writeFileSync(join(d, "scripts/test-ratchet.json"), JSON.stringify({ หมายเหตุ: "x", รอตายตัว: ratchet }));
  };
  git("init", "-q", "-b", "monorepo"); git("config", "user.email", "t@example.test"); git("config", "user.name", "t");
  เขียนเพดาน(137, { "a.spec.ts": 2 });
  git("add", "-A"); git("commit", "-qm", "ฐาน");
  git("checkout", "-qb", "session/x");
  const ตรวจ = () => { const r = spawnSync(process.execPath, ["scripts/check-ceiling-raise.mjs"], { cwd: d, encoding: "utf8" }); return { code: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") }; };
  const ack = (env, args) => spawnSync(process.execPath, ["scripts/ceiling-ack.mjs", ...args], { cwd: d, encoding: "utf8", env: { ...process.env, ...env }, input: "" });
  const จดตรง = (ไฟล์, คีย์, ค่า) => appendFileSync(join(d, "scripts/ceiling-ack.txt"), `รับทราบเพิ่มเพดาน | 2026-11-13 12:00:00 | บอส | ${ไฟล์} | ${คีย์} | ${ค่า}\n`);

  let r = ตรวจ();
  ผล(r.code === 0, "ไม่แก้เพดาน = ผ่าน", r.out);
  เขียนเพดาน(143, { "a.spec.ts": 2 });
  r = ตรวจ();
  ผล(r.code === 1 && /คำเตือนสูงสุด: 137 → 143/.test(r.out) && /ceiling:ack/.test(r.out), "(1) เพิ่มเพดาน lint ไม่มีรับทราบ = ตก (บอกค่าเดิม→ใหม่ + ทางรับทราบ)", r.out);
  จดตรง("scripts/lint-ceiling.json", "คำเตือนสูงสุด", 150);
  r = ตรวจ();
  ผล(r.code === 1, "(3) รับทราบคนละค่า (150 ≠ 143) = ตก", r.out);
  จดตรง("scripts/lint-ceiling.json", "คำเตือนสูงสุด", 143);
  r = ตรวจ();
  ผล(r.code === 0, "(2) รับทราบตรงค่า = ผ่าน", r.out);
  เขียนเพดาน(130, { "a.spec.ts": 1 });
  r = ตรวจ();
  ผล(r.code === 0, "(4) ลดเพดาน = ผ่าน (ไม่ต้องรับทราบ)", r.out);
  เขียนเพดาน(130, { "a.spec.ts": 1, "b.spec.ts": 1 });
  r = ตรวจ();
  ผล(r.code === 1 && /รอตายตัว\/b\.spec\.ts: 0 → 1/.test(r.out), "(5) รายการใหม่ที่เดิมไม่มี = เพิ่มจาก 0 → ตก", r.out);
  // (6) commit การเพิ่มไว้ในสาขาก่อน แล้วตรวจอีกครั้ง (โฟลเดอร์ตรงกับ HEAD แล้ว) — ยังต้องตก เพราะเทียบ merge-base กับ monorepo
  git("add", "-A"); git("commit", "-qm", "เพิ่มเพดานเงียบ ๆ");
  r = ตรวจ();
  ผล(r.code === 1 && /b\.spec\.ts/.test(r.out), "(6) เพิ่มเพดานใน commit ก่อนหน้าของสาขา = ยังจับได้ (เทียบ merge-base)", r.out);

  // ไฟล์เพดานที่ฐานยังไม่มี = ตั้งครั้งแรก ไม่นับเป็นเพิ่ม · แต่ลบในสาขาแล้วเพิ่มกลับสูงกว่าเดิม = ยังจับได้ (ฐานมีไฟล์)
  {
    const e = mkdtempSync(join(tmpdir(), "pms-ceiling2-"));
    const g2 = (...a) => execFileSync("git", a, { cwd: e, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    mkdirSync(join(e, "scripts/lib"), { recursive: true });
    for (const f of ["scripts/lib/ceilingGuard.mjs", "scripts/check-ceiling-raise.mjs"]) copyFileSync(join(ราก, f), join(e, f));
    writeFileSync(join(e, "scripts/test-ratchet.json"), JSON.stringify({ รอตายตัว: { "a.spec.ts": 2 } }));
    g2("init", "-q", "-b", "monorepo"); g2("config", "user.email", "t@example.test"); g2("config", "user.name", "t");
    g2("add", "-A"); g2("commit", "-qm", "ฐานไม่มีเพดาน lint"); g2("checkout", "-qb", "s");
    writeFileSync(join(e, "scripts/lint-ceiling.json"), JSON.stringify({ คำเตือนสูงสุด: 137 }));
    const r2 = spawnSync(process.execPath, ["scripts/check-ceiling-raise.mjs"], { cwd: e, encoding: "utf8" });
    ผล(r2.status === 0, "ไฟล์เพดานใหม่ที่ฐานยังไม่มี = ตั้งครั้งแรก ผ่าน", (r2.stdout ?? "") + (r2.stderr ?? ""));
    rmSync(join(e, "scripts/test-ratchet.json"));
    writeFileSync(join(e, "scripts/test-ratchet.json"), JSON.stringify({ รอตายตัว: { "a.spec.ts": 5 } }));
    const r3 = spawnSync(process.execPath, ["scripts/check-ceiling-raise.mjs"], { cwd: e, encoding: "utf8" });
    ผล(r3.status === 1 && /a\.spec\.ts: 2 → 5/.test(r3.stderr), "ลบไฟล์เพดานแล้วเขียนใหม่สูงกว่าเดิม = ยังจับได้", (r3.stdout ?? "") + (r3.stderr ?? ""));
    rmSync(e, { recursive: true, force: true });
  }

  // (7)(8) ceiling:ack: AI รันไม่ได้
  const ก่อน = readFileSync(join(d, "scripts/ceiling-ack.txt"), "utf8");
  let a = ack({ CLAUDECODE: "1" }, ["--ไฟล์", "scripts/test-ratchet.json", "--คีย์", "รอตายตัว/b.spec.ts", "--ค่า", "1"]);
  ผล(a.status === 1 && /บอสรันเองเท่านั้น/.test(a.stderr), "(7) ceiling:ack เจอตัวแปรของ AI = ถูกกัน", a.stdout + a.stderr);
  const ไม่มีAI = Object.fromEntries(["CLAUDECODE", "AI_AGENT", "CLAUDE_CODE_ENTRYPOINT"].map(k => [k, ""]));
  a = ack(ไม่มีAI, ["--ไฟล์", "scripts/test-ratchet.json", "--คีย์", "รอตายตัว/b.spec.ts", "--ค่า", "1"]);
  ผล(a.status === 1 && /หน้าต่างคำสั่ง/.test(a.stderr), "(8) ไม่ใช่หน้าต่างคำสั่งจริง (stdin ไม่ใช่ TTY) = ถูกกัน", a.stdout + a.stderr);
  ผล(readFileSync(join(d, "scripts/ceiling-ack.txt"), "utf8") === ก่อน, "ถูกกันแล้วไม่มีบรรทัดรับทราบเพิ่ม");
  a = ack({}, []);
  ผล(a.status === 0 && /b\.spec\.ts: 0 → 1/.test(a.stdout), "ceiling:ack ไม่ใส่อะไร = แสดงรายการรอรับทราบ (อ่านอย่างเดียว)", a.stdout + a.stderr);
} finally {
  rmSync(d, { recursive: true, force: true });
}
// (9) อยู่ในชุด checks · ไฟล์รับทราบ merge=union
const pkg = JSON.parse(readFileSync(join(ราก, "package.json"), "utf8"));
ผล(/node scripts\/check-ceiling-raise\.mjs/.test(pkg.scripts.checks) && pkg.scripts["ceiling:ack"] === "node scripts/ceiling-ack.mjs", "(9) check-ceiling-raise อยู่ในชุด checks · มีคำสั่ง ceiling:ack", pkg.scripts.checks);
ผล(/scripts\/ceiling-ack\.txt merge=union/.test(readFileSync(join(ราก, ".gitattributes"), "utf8")), "ไฟล์รับทราบรวมบรรทัดเมื่อ merge (merge=union)");
console.log(ตก ? `\n✗ ตก ${ตก} ข้อ` : "\nALL PASS");
process.exit(ตก ? 1 : 0);
