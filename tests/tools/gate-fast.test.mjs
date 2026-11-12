// ── ข้อทดสอบ: ทางผ่านแบบเร็ว (scripts/gate-fast.mjs · scripts/lib/fastGate.mjs · บอสสั่งโหมดเร็ว 12 พ.ย. 69) ───────────────
// repo จำลองในโฟลเดอร์ชั่วคราว — ไม่ใช้ฐานทดสอบ ไม่แตะรายการรอบ ไม่ push
//   ก) ตัดสิน: แตะไฟล์ทดสอบ = ได้ · แตะใบปรับฐาน/สิทธิ์/เงิน/เครื่องมือรอบ = ปฏิเสธ · แก้โค้ดไม่แตะไฟล์ทดสอบ = ปฏิเสธ (ระบุ --ไฟล์ เองได้)
//      แก้แต่เอกสาร = ได้ · ไฟล์ค้าง = ปฏิเสธ · ฐานไม่ผ่านรอบตรวจ / ไม่ใช่บรรพบุรุษ = ปฏิเสธ
//   ข) ตัวตรวจ (ตรวจcommitผ่าน · ใช้ที่ session-merge / pre-push / Vercel): บรรทัดเร็วนับเมื่อไฟล์เสี่ยงตรงฐาน · ปลอมบรรทัดเร็วให้ commit
//      ที่แตะใบปรับฐาน = ไม่นับ · บรรทัดรอบเต็มแบบเดิมยังนับ · clone ตื้น (แบบ Vercel ไม่มี commit ฐาน) ตรวจได้
// รัน: node tests/tools/gate-fast.test.mjs
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync, execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const ราก = process.cwd();
const ที่ = mkdtempSync(join(tmpdir(), "gate-fast-"));
const repo = join(ที่, "repo");
let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n${เพิ่ม}`}`); };
const git = (...a) => execFileSync("git", ["-c", "core.autocrlf=false", "-c", "user.name=ทดสอบ", "-c", "user.email=t@example.test", ...a],
  { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const เขียน = (f, s) => { mkdirSync(dirname(join(repo, f)), { recursive: true }); writeFileSync(join(repo, f), s); };
const คัด = f => { mkdirSync(dirname(join(repo, f)), { recursive: true }); copyFileSync(join(ราก, f), join(repo, f)); };
const commit = (ข้อความ) => { git("add", "-A"); git("commit", "-qm", ข้อความ); return git("rev-parse", "HEAD"); };
const ตัดสิน = (...a) => { const r = spawnSync("node", ["scripts/gate-fast.mjs", "--แค่ตัดสิน", ...a], { cwd: repo, encoding: "utf8" }); return { code: r.status, ข้อความ: r.stdout + r.stderr }; };

try {
  mkdirSync(repo);
  execFileSync("git", ["init", "-q", "-b", "monorepo"], { cwd: repo });
  for (const f of ["scripts/gate-fast.mjs", "scripts/gate-risky-paths.json", "scripts/lib/fastGate.mjs", "scripts/lib/commitGate.mjs", "scripts/lib/flakyAck.mjs", "scripts/lib/flakyLog.mjs"]) คัด(f);
  const fg = await import(pathToFileURL(join(repo, "scripts/lib/fastGate.mjs")).href);
  const cg = await import(pathToFileURL(join(repo, "scripts/lib/commitGate.mjs")).href);

  // ── แบบ glob ──
  const re = fg.แบบเป็นregex;
  ผล(re("apps/*/middleware.ts").test("apps/hq/middleware.ts") && !re("apps/*/middleware.ts").test("apps/hq/x/middleware.ts"), "glob: * = ชั้นเดียว");
  ผล(re("supabase/migrations/**").test("supabase/migrations/0287_x.sql") && re("apps/*/app/(auth)/**").test("apps/hq/app/(auth)/login/page.tsx"), "glob: ** = ทุกชั้น · วงเล็บในชื่อโฟลเดอร์");
  ผล(!re("packages/shared/lib/auth.ts").test("packages/shared/lib/authx.ts"), "glob: ชื่อไฟล์ตรงตัว ไม่ตรงคำขึ้นต้น");

  // ── ฐาน: ผ่านรอบเต็ม (บรรทัดแบบเดิม) ──
  เขียน("apps/hq/app/page.tsx", "export default 1;\n");
  เขียน("apps/hq/middleware.ts", "export const m = 1;\n");
  เขียน("supabase/migrations/0001_a.sql", "select 1;\n");
  เขียน("tests/scenario/a.spec.ts", "// a\n");
  เขียน("docs/FLOW.html", "<p>flow</p>\n");
  const ฐาน = commit("ฐาน");
  ผล(cg.บันทึกcommitที่ผ่าน({ sha: ฐาน, ค้าง: [], ป้าย: "รอบเต็มจำลอง", cwd: repo }) === "", "บันทึกรอบเต็มของฐาน");
  const ฐานบันทึก = commit("บันทึกผลรอบเต็ม");
  ผล(cg.ตรวจcommitผ่าน(ฐานบันทึก, repo).ผ่าน, "ฐานผ่านรอบตรวจ (บรรทัดแบบเดิม)");

  // ── ก) ตัดสิน ──
  เขียน("apps/hq/app/page.tsx", "export default 2;\n"); เขียน("tests/scenario/a.spec.ts", "// a2\n");
  const งานดี = commit("แก้หน้า + ข้อทดสอบ");
  let r = ตัดสิน("--ฐาน", ฐานบันทึก);
  ผล(r.code === 0 && /ใช้ทางเร็วได้/.test(r.ข้อความ) && /tests\/scenario\/a\.spec\.ts/.test(r.ข้อความ), "แก้หน้า + แตะไฟล์ทดสอบ = ใช้ทางเร็วได้ · รันไฟล์ทดสอบที่แตะ", r.ข้อความ);

  git("reset", "-q", "--hard", ฐานบันทึก);   // diff นับสะสมจากฐาน — เริ่มจากฐานตรง ๆ
  เขียน("apps/hq/app/page.tsx", "export default 3;\n");
  commit("แก้โค้ดไม่แตะข้อทดสอบ");
  r = ตัดสิน("--ฐาน", ฐานบันทึก);
  ผล(r.code === 1 && /ไม่แตะไฟล์ทดสอบหน้าจอ/.test(r.ข้อความ) && /--ไฟล์/.test(r.ข้อความ), "แก้โค้ดไม่แตะไฟล์ทดสอบ = ปฏิเสธ บอกให้ระบุ --ไฟล์", r.ข้อความ);
  r = ตัดสิน("--ฐาน", ฐานบันทึก, "--ไฟล์", "tests/scenario/a.spec.ts");
  ผล(r.code === 0, "ระบุ --ไฟล์ เอง = ใช้ทางเร็วได้", r.ข้อความ);
  r = ตัดสิน("--ฐาน", ฐานบันทึก, "--ไฟล์", "tests/scenario/ไม่มี.spec.ts");
  ผล(r.code === 1 && /ไม่มีใน commit/.test(r.ข้อความ), "ระบุไฟล์ทดสอบที่ไม่มีจริง = ปฏิเสธ", r.ข้อความ);

  git("reset", "-q", "--hard", งานดี);
  เขียน("supabase/migrations/0002_b.sql", "select 2;\n");
  const แตะใบ = commit("เพิ่มใบปรับฐาน");
  r = ตัดสิน("--ฐาน", ฐานบันทึก);
  ผล(r.code === 1 && /ไฟล์เสี่ยง/.test(r.ข้อความ) && /ฐาน/.test(r.ข้อความ) && /0002_b\.sql/.test(r.ข้อความ), "มีใบปรับฐาน = ปฏิเสธ ต้องรอบเต็ม (บอกไฟล์)", r.ข้อความ);

  git("reset", "-q", "--hard", งานดี);
  เขียน("apps/hq/middleware.ts", "export const m = 2;\n"); commit("แตะไฟล์สิทธิ์");
  r = ตัดสิน("--ฐาน", ฐานบันทึก);
  ผล(r.code === 1 && /สิทธิ์/.test(r.ข้อความ), "แตะไฟล์สิทธิ์ (middleware) = ปฏิเสธ", r.ข้อความ);

  git("reset", "-q", "--hard", งานดี);
  เขียน("packages/shared/lib/quoteTax.ts", "export const vat = 7;\n"); commit("แตะไฟล์เงิน");
  r = ตัดสิน("--ฐาน", ฐานบันทึก);
  ผล(r.code === 1 && /เงิน/.test(r.ข้อความ), "แตะไฟล์เงิน (quoteTax) = ปฏิเสธ", r.ข้อความ);

  git("reset", "-q", "--hard", งานดี);
  เขียน("scripts/gate-risky-paths.json", '{"ฐาน":[]}\n'); commit("แก้รายการเสี่ยง");
  r = ตัดสิน("--ฐาน", ฐานบันทึก);
  ผล(r.code === 1 && /เครื่องมือรอบ/.test(r.ข้อความ), "แก้รายการไฟล์เสี่ยงเอง = ปฏิเสธ (ต้องรอบเต็ม)", r.ข้อความ);

  git("reset", "-q", "--hard", ฐานบันทึก);
  เขียน("docs/FLOW.html", "<p>flow 2</p>\n"); commit("แก้เอกสาร");
  r = ตัดสิน("--ฐาน", ฐานบันทึก);
  ผล(r.code === 0 && /แก้แต่เอกสาร/.test(r.ข้อความ), "แก้แต่เอกสาร = ใช้ทางเร็วได้ (build อย่างเดียว)", r.ข้อความ);

  git("reset", "-q", "--hard", งานดี);
  เขียน("apps/hq/app/ค้าง.tsx", "x\n");
  r = ตัดสิน("--ฐาน", ฐานบันทึก);
  ผล(r.code === 1 && /ยังไม่ commit/.test(r.ข้อความ), "มีไฟล์ค้าง = ปฏิเสธ", r.ข้อความ);
  rmSync(join(repo, "apps/hq/app/ค้าง.tsx"));

  r = ตัดสิน("--ฐาน", ฐาน);
  ผล(r.code === 1 && /ฐานไม่มีผลรอบตรวจผ่าน/.test(r.ข้อความ), "ฐานที่ยังไม่ผ่านรอบตรวจ = ปฏิเสธ (กันเลือกฐานหลบ)", r.ข้อความ);
  r = ตัดสิน("--ฐาน", งานดี);
  ผล(r.code === 1, "ฐาน = commit ตัวเอง (ไม่มีอะไรเปลี่ยน/ไม่ผ่าน) = ปฏิเสธ", r.ข้อความ);

  // ── ข) ตัวตรวจ ──
  const รายการ = fg.อ่านรายการเสี่ยง(repo, งานดี);
  const ป้าย = fg.ป้ายเร็ว(fg.ลายนิ้วมือเสี่ยง(ฐานบันทึก, repo, รายการ));
  ผล(cg.บันทึกcommitที่ผ่าน({ sha: งานดี, ค้าง: [], ป้าย, cwd: repo }) === "", "บันทึกผลทางเร็วของงานดี");
  const งานดีบันทึก = commit("บันทึกผลทางเร็ว");
  let ต = cg.ตรวจcommitผ่าน(งานดีบันทึก, repo);
  ผล(ต.ผ่าน, "ผลทางเร็ว (ไฟล์เสี่ยงตรงฐาน) = ผ่าน · session-merge/pre-push/Vercel รับ", JSON.stringify(ต));

  // ปลอม: เติมบรรทัดเร็วด้วยป้ายของฐาน ให้ commit ที่เพิ่มใบปรับฐาน (ลายนิ้วมือโค้ดของ commit นั้นจริง)
  git("checkout", "-q", "--detach", แตะใบ);
  appendFileSync(join(repo, "supabase/gate-passed-code.txt"), `${cg.ลายนิ้วมือโค้ด("HEAD", repo)} 2026-11-13_00:00:00 ${แตะใบ.slice(0, 12)} ${ป้าย}\n`);
  const ปลอม = commit("บรรทัดเร็วปลอม");
  ต = cg.ตรวจcommitผ่าน(ปลอม, repo);
  ผล(!ต.ผ่าน && /ไฟล์เสี่ยง/.test(ต.เหตุ ?? ""), "บรรทัดเร็วปลอมให้ commit ที่มีใบปรับฐาน = ไม่นับ (บอกเหตุ)", JSON.stringify(ต));
  appendFileSync(join(repo, "supabase/gate-passed-code.txt"), `${cg.ลายนิ้วมือโค้ด("HEAD", repo)} 2026-11-13_00:00:01 ${แตะใบ.slice(0, 12)} รอบเต็มจำลอง\n`);
  const เต็ม = commit("บรรทัดรอบเต็ม");
  ผล(cg.ตรวจcommitผ่าน(เต็ม, repo).ผ่าน, "บรรทัดรอบเต็มแบบเดิมยังนับ (ทางเร็วไม่กระทบรอบเต็ม)");

  // clone ตื้นแบบ Vercel (มีแค่ commit ล่าสุด ไม่มีฐาน) — ตรวจผลทางเร็วได้
  const ตื้น = join(ที่, "ตื้น");
  execFileSync("git", ["clone", "-q", "--depth", "1", "--no-local", `file://${repo.replace(/\\/g, "/")}`, ตื้น, "--branch", "monorepo"]);
  ต = cg.ตรวจcommitผ่าน("HEAD", ตื้น);
  ผล(ต.ผ่าน, "clone ตื้น (ไม่มี commit ฐาน) ตรวจผลทางเร็วได้", JSON.stringify(ต));
} catch (e) {
  ผล(false, "ข้อทดสอบรันจบ", e.stack);
} finally {
  rmSync(ที่, { recursive: true, force: true });
}
console.log(ตก ? `ตก ${ตก}` : "ผ่านทั้งหมด");
process.exit(ตก ? 1 : 0);
