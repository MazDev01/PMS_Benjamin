// ── ข้อทดสอบ: ข้อไม่นิ่งต้องขึ้นชื่อ + รอบตรวจเต็มที่มีข้อไม่นิ่ง = รอบอสรับทราบ (บอสสั่ง 11 พ.ย. 69 · scripts/lib/flakyAck.mjs) ──────────
//   1) ตัวรายงาน tests/reporters/flaky-names.ts: ข้อที่ตกครั้งแรกแล้วผ่านตอนรันซ้ำ → ขึ้นชื่อข้อท้ายผล (ไม่ใช่แค่ "1 flaky")
//      จำลองด้วย playwright จริง: ข้อทดสอบปลอมตกเมื่อ retry = 0 ผ่านเมื่อ retry = 1
//   2) รอบตรวจเต็มผ่านแต่มีข้อไม่นิ่ง → ผลผูก commit (gate-passed-code) ไม่นับผ่าน + บอกชื่อข้อ · db:push (gate-passed-migrations) ไม่ลง
//      → บอสรับทราบ (gate-flaky-ack.txt) แล้วนับผ่าน · รอบไม่มีข้อไม่นิ่ง = ผ่านทันทีเหมือนเดิม
//   3) round:ack: AI รันไม่ได้ (เจอตัวแปร CLAUDECODE/AI_AGENT) · ไม่ใช่หน้าต่างคำสั่งจริง (ไม่มี TTY) ก็ไม่ได้
//   ตกบนโค้ดเดิม: ไม่มี flakyAck.mjs / ตัวรายงาน / round-ack.mjs · บรรทัด gate-passed-code ใดก็นับผ่าน
// รัน: node tests/tools/flaky-ack.test.mjs (ไม่แตะฐาน · git ในโฟลเดอร์ชั่วคราว)
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import { envตัวลูกแยกจากรอบ } from "../../scripts/lib/childEnv.mjs";

const ราก = process.cwd();
let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n   ${String(เพิ่ม).slice(-1200)}`}`); };
const นำเข้า = async (p) => { try { return await import(pathToFileURL(join(ราก, p)).href); } catch (e) { ผล(false, `โหลด ${p} ได้`, e.message); return null; } };

// ── 1) ตัวรายงานชื่อข้อไม่นิ่ง (playwright จริง) ──
{
  const ตัวรายงาน = join(ราก, "tests/reporters/flaky-names.ts");
  ผล(existsSync(ตัวรายงาน), "มีตัวรายงานชื่อข้อไม่นิ่ง tests/reporters/flaky-names.ts");
  // โฟลเดอร์ในโปรเจกต์ (ให้หา @playwright/test เจอ) — ลบทิ้งตอนจบ
  const ที่ = join(ราก, "node_modules/.cache", `flaky-ack-${process.pid}`);
  mkdirSync(ที่, { recursive: true });
  try {
    writeFileSync(join(ที่, "pw.config.mjs"), `export default { testDir: ".", testMatch: /ปลอม\\.spec\\.mjs$/, retries: 1, workers: 1, outputDir: ${JSON.stringify(join(ที่, "out"))}, reporter: [["line"], [${JSON.stringify(ตัวรายงาน)}]] };\n`);
    writeFileSync(join(ที่, "ปลอม.spec.mjs"), `import { test, expect } from "@playwright/test";
test("[ปลอม] ตกครั้งแรก ผ่านตอนรันซ้ำ", async ({}, info) => { expect(info.retry, "ตกครั้งแรก").toBe(1); });
test("[ปลอม] ผ่านตั้งแต่ครั้งแรก", async () => { expect(1).toBe(1); });
`);
    // playwright ซ้อนต้องไม่แตะของรอบตรวจเต็ม (รอบ deploy22 ครั้งที่ 4 ล้ม 16 พ.ย. 69): เดิม cwd = ราก + env ของรอบทั้งชุด
    //   → ล้าง test-results ของรอบ (gate-logs หาย) · เขียนทับรายงาน JSON ของรอบ · ได้ token/รหัสฐานทดสอบ — ตอนนี้ cwd + outputDir อยู่ในโฟลเดอร์ชั่วคราว · env ตัดของรอบ
    const r = spawnSync("npx", ["playwright", "test", "-c", join(ที่, "pw.config.mjs")], { cwd: ที่, encoding: "utf8", shell: true, env: envตัวลูกแยกจากรอบ(process.env, { PMS_GLOBAL_SETUP_SKIP: "1" }) });
    const ออก = `${r.stdout}\n${r.stderr}`;
    ผล(/1 flaky/.test(ออก), "playwright นับข้อปลอมเป็น flaky (จำลองถูก)", ออก);
    ผล(/ข้อทดสอบไม่นิ่ง 1 ข้อ/.test(ออก) && ออก.includes("ปลอม.spec.mjs") && ออก.includes("[ปลอม] ตกครั้งแรก ผ่านตอนรันซ้ำ"),
      "ท้ายผลขึ้นชื่อข้อไม่นิ่ง (ไฟล์ + ชื่อข้อ) ไม่ใช่แค่ตัวเลข", ออก);
    ผล(!ออก.includes("[ปลอม] ผ่านตั้งแต่ครั้งแรก") || !/\d+\. .*ผ่านตั้งแต่ครั้งแรก/.test(ออก), "ข้อที่ผ่านครั้งแรกไม่อยู่ในรายชื่อไม่นิ่ง", ออก);
  } finally { rmSync(ที่, { recursive: true, force: true }); }
}

// ── 2) ผลรอบตรวจ: รอรับทราบ → รับทราบแล้ว ──
const ack = await นำเข้า("scripts/lib/flakyAck.mjs");
const cg = await นำเข้า("scripts/lib/commitGate.mjs");
const mg = await นำเข้า("scripts/lib/migrationGate.mjs");
if (ack && cg && mg) {
  const repo = mkdtempSync(join(tmpdir(), "flaky-ack-repo-"));
  const g = (...a) => execFileSync("git", a, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  try {
    g("init", "-q"); g("config", "user.email", "t@example.test"); g("config", "user.name", "ทดสอบ");
    mkdirSync(join(repo, "supabase/migrations"), { recursive: true });
    writeFileSync(join(repo, "supabase/migrations/0001_a.sql"), "select 1;\n");
    writeFileSync(join(repo, "app.txt"), "โค้ด\n");
    g("add", "-A"); g("commit", "-qm", "งาน");
    const sha = g("rev-parse", "HEAD");
    const ข้อ = ["x.spec.ts › [x] ข้อไม่นิ่ง"];
    // รอบผ่านแต่มีข้อไม่นิ่ง
    ผล(cg.บันทึกcommitที่ผ่าน({ sha, ค้าง: [], ป้าย: "รอบ-ทดสอบ1", รอรับทราบ: true, cwd: repo }) === "", "บันทึกผลแบบรอรับทราบได้");
    ack.จดรอรับทราบ({ ป้าย: "รอบ-ทดสอบ1", sha, ข้อ, cwd: repo });
    const rec = join(repo, "supabase/gate-passed-migrations.json");
    mg.บันทึกเมื่อผ่าน({ ตก: 0, ตัวตรวจ: 0, dir: join(repo, "supabase/migrations"), record: rec, ป้าย: "รอบ-ทดสอบ1", รอรับทราบ: ข้อ });
    g("add", "-A"); g("commit", "-qm", "ผลรอบตรวจ");
    let r = cg.ตรวจcommitผ่าน("HEAD", repo);
    ผล(r.ผ่าน === false && /รอบอสรับทราบ/.test(r.เหตุ ?? "") && (r.เหตุ ?? "").includes(ข้อ[0]),
      "มีข้อไม่นิ่ง → ผลผูก commit ไม่นับผ่าน (merge/push/Vercel ปฏิเสธ) + บอกชื่อข้อ", JSON.stringify(r));
    let m = mg.ตรวจใบก่อนลง(join(repo, "supabase/migrations"), rec, join(repo, ack.ไฟล์รับทราบ));
    ผล(m.ผ่าน === false && m.ไม่ผ่าน[0]?.เหตุ === "รอรับทราบ" && mg.ข้อความไม่ผ่าน(m.ไม่ผ่าน).join("\n").includes("round:ack"),
      "มีข้อไม่นิ่ง → db:push:prod ไม่ลงใบ (บอกให้บอสรับทราบ)", JSON.stringify(m));
    // บอสรับทราบ
    ack.จดรับทราบ({ ป้าย: "รอบ-ทดสอบ1", ผู้รับทราบ: "บอสทดสอบ", cwd: repo });
    g("add", "-A"); g("commit", "-qm", "บอสรับทราบ");
    r = cg.ตรวจcommitผ่าน("HEAD", repo);
    ผล(r.ผ่าน === true, "บอสรับทราบแล้ว → ผลผูก commit นับผ่าน (ไฟล์รับทราบไม่เปลี่ยนลายนิ้วมือโค้ด)", JSON.stringify(r));
    m = mg.ตรวจใบก่อนลง(join(repo, "supabase/migrations"), rec, join(repo, ack.ไฟล์รับทราบ));
    ผล(m.ผ่าน === true, "บอสรับทราบแล้ว → db:push:prod ลงได้", JSON.stringify(m));
    const บรรทัดรับ = ack.แยกบรรทัด(execFileSync("git", ["show", `HEAD:${ack.ไฟล์รับทราบ}`], { cwd: repo, encoding: "utf8" })).find(b => b.ชนิด === "รับทราบ");
    ผล(!!บรรทัดรับ?.เวลา && บรรทัดรับ.ข้อ.includes(ข้อ[0]), "บันทึกรับทราบมีเวลา + ชื่อข้อที่รับทราบ", JSON.stringify(บรรทัดรับ));
    // รอบไม่มีข้อไม่นิ่ง = ผ่านทันทีเหมือนเดิม
    writeFileSync(join(repo, "app.txt"), "โค้ด 2\n"); g("add", "-A"); g("commit", "-qm", "งาน 2");
    cg.บันทึกcommitที่ผ่าน({ sha: g("rev-parse", "HEAD"), ค้าง: [], ป้าย: "รอบ-ทดสอบ2", cwd: repo });
    g("add", "-A"); g("commit", "-qm", "ผลรอบ 2");
    ผล(cg.ตรวจcommitผ่าน("HEAD", repo).ผ่าน === true, "รอบไม่มีข้อไม่นิ่ง → นับผ่านทันที (เหมือนเดิม)");
  } finally { rmSync(repo, { recursive: true, force: true }); }
}

// ── 3) round:ack กัน AI / ไม่ใช่หน้าต่างคำสั่งจริง ──
{
  const สคริปต์ = join(ราก, "scripts/round-ack.mjs");
  ผล(existsSync(สคริปต์), "มีคำสั่ง round:ack (scripts/round-ack.mjs)");
  const repo = mkdtempSync(join(tmpdir(), "flaky-ack-cli-"));
  try {
    mkdirSync(join(repo, "supabase"), { recursive: true });
    writeFileSync(join(repo, "supabase/gate-flaky-ack.txt"), "รอรับทราบ | รอบ-ทดสอบ3 | 2569-11-11 10:00:00 | abc123 | x.spec.ts › [x] ข้อไม่นิ่ง\n");
    const เรียก = (env) => spawnSync(process.execPath, [สคริปต์, "--รอบ", "รอบ-ทดสอบ3"], { cwd: repo, encoding: "utf8", env, input: "รอบ-ทดสอบ3\n" });
    const ไม่มีAI = Object.fromEntries(Object.entries(process.env).filter(([k]) => !["CLAUDECODE", "AI_AGENT", "CLAUDE_CODE_ENTRYPOINT"].includes(k)));
    let r = เรียก({ ...ไม่มีAI, CLAUDECODE: "1" });
    ผล(r.status !== 0 && /AI/.test(`${r.stdout}${r.stderr}`), "AI รัน round:ack → ปฏิเสธ", `${r.status} ${r.stdout}${r.stderr}`);
    r = เรียก({ ...ไม่มีAI, AI_AGENT: "x" });
    ผล(r.status !== 0 && /AI/.test(`${r.stdout}${r.stderr}`), "ตัวแปร AI_AGENT → ปฏิเสธ", `${r.status} ${r.stdout}${r.stderr}`);
    r = เรียก(ไม่มีAI);
    ผล(r.status !== 0 && /หน้าต่างคำสั่ง/.test(`${r.stdout}${r.stderr}`), "ส่งคำตอบผ่านท่อ (ไม่มี TTY) → ปฏิเสธ", `${r.status} ${r.stdout}${r.stderr}`);
    ผล(!/^รับทราบ \|/m.test(String(execFileSync(process.execPath, ["-e", `process.stdout.write(require("fs").readFileSync(${JSON.stringify(join(repo, "supabase/gate-flaky-ack.txt"))},"utf8"))`]))),
      "ถูกปฏิเสธแล้วไม่มีบรรทัดรับทราบ");
  } finally { rmSync(repo, { recursive: true, force: true }); }
}

// ── 4) ข้อไม่นิ่งของขั้นก่อนรอบเต็มต้องนับด้วย (deploy20 11 พ.ย. 69: 2 ข้อไม่นิ่งในขั้นก่อนรอบไม่อยู่ในรายการรอรับทราบ) ──
//   ตกบนโค้ดเดิม: ไม่มี ตัวเลือกก่อนรอบ · ข้อไม่นิ่งของรอบไม่อ่านรายงานก่อนรอบ · test-prodbuild ขั้นก่อนรอบไม่มีรายงาน JSON
{
  const pre = await นำเข้า("scripts/lib/gatePrecheck.mjs");
  const ack = await นำเข้า("scripts/lib/flakyAck.mjs");
  const ตัวเลือก = pre?.ตัวเลือกก่อนรอบ;
  ผล(typeof ตัวเลือก === "function", "gatePrecheck มีตัวเลือกก่อนรอบ (รายงาน JSON ของขั้นก่อนรอบเต็ม)");
  if (typeof ตัวเลือก === "function" && ack) {
    const หลัก = "test-results/gate-report.json";
    const ทุกช่วง = (pre.ช่วงก่อนรอบเต็ม ?? []).map(p => ตัวเลือก(p, หลัก));
    const ชื่อรายงาน = ทุกช่วง.map(x => x.รายงาน);
    const รายงานรอบหลัก = ["chromium", "hq-settings", "safari", "stress", "tools"].map(p => `test-results/gate-report.${p}.json`);
    ผล(ทุกช่วง.length > 0 && ทุกช่วง.every(x => /(^|,)json(,|$)/.test(x.reporter.replace("--reporter=", "")) && x.env.PLAYWRIGHT_JSON_OUTPUT_NAME === x.รายงาน)
      && new Set(ชื่อรายงาน).size === ชื่อรายงาน.length && !ชื่อรายงาน.some(n => รายงานรอบหลัก.includes(n) || n === หลัก),
      "ทุกช่วงของขั้นก่อนรอบมีรายงาน JSON ของตัวเอง (ไม่ซ้ำกัน · ไม่ทับรายงานรอบหลัก)", JSON.stringify(ทุกช่วง, null, 1));
    ผล(ตัวเลือก("tools", หลัก).env.PMS_GLOBAL_SETUP_SKIP === "1" && !ตัวเลือก("chromium", หลัก).env.PMS_GLOBAL_SETUP_SKIP,
      "ช่วง tools ของขั้นก่อนรอบยังข้ามข้อมูลตั้งต้น (เหมือนเดิม)");
    const ที่ = mkdtempSync(join(tmpdir(), "flaky-precheck-"));
    try {
      const รายงานจำลอง = (ไฟล์, ข้อ, สถานะ) => {
        const f = join(ที่, ไฟล์);
        writeFileSync(f, JSON.stringify({ suites: [{ specs: [{ file: "ปลอม.spec.ts", title: ข้อ, tests: [{ status: สถานะ }] }] }] }));
        return f;
      };
      const รอบหลัก = รายงานจำลอง("main.json", "ข้อในรอบหลัก", "expected");
      const ก่อนรอบ = รายงานจำลอง("pre.json", "ข้อไม่นิ่งขั้นก่อนรอบ", "flaky");
      const ได้ = ack.ข้อไม่นิ่งของรอบ([รอบหลัก], [], [ก่อนรอบ]);
      ผล(ได้.length === 1 && ได้[0].includes("ข้อไม่นิ่งขั้นก่อนรอบ"), "ข้อไม่นิ่งในขั้นก่อนรอบเต็ม → อยู่ในข้อไม่นิ่งของรอบ (รอบอสรับทราบ)", JSON.stringify(ได้));
    } finally { rmSync(ที่, { recursive: true, force: true }); }
    // ตัวรันรอบตรวจเต็มส่งรายงานก่อนรอบเข้าทั้งรายการรอรับทราบและตัวนับไม่นิ่ง
    const ตัวรัน = String(execFileSync(process.execPath, ["-e", `process.stdout.write(require("fs").readFileSync("scripts/test-prodbuild.mjs","utf8"))`], { cwd: ราก }));
    ผล(/ตัวเลือกก่อนรอบ\(/.test(ตัวรัน) && /ข้อไม่นิ่งของรอบ\(รายงาน, ตัดสิน\.ไม่นิ่ง, รายงานก่อนรอบ\)/.test(ตัวรัน)
      && /ตรวจไม่นิ่งท้ายรอบ\(\[\.\.\.รายงาน, \.\.\.รายงานก่อนรอบ\]/.test(ตัวรัน) && !/PLAYWRIGHT_JSON_OUTPUT_NAME: ""/.test(ตัวรัน),
      "test-prodbuild: ขั้นก่อนรอบใช้ตัวเลือกก่อนรอบ + ส่งรายงานก่อนรอบเข้ารายการรอรับทราบและตัวนับไม่นิ่ง");
  }
}

console.log(ตก ? `\n✗ ตก ${ตก} ข้อ` : "\nALL PASS");
process.exit(ตก ? 1 : 0);
