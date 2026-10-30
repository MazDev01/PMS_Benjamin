// ── ข้อทดสอบ: รอบตรวจเต็มตกเพราะข้อทดสอบ → แก้แค่ไฟล์ที่ตก → รันต่อเฉพาะไฟล์นั้น (บอสสั่ง 29 ต.ค. 69 · คิวข้อ 5 · scripts/lib/gateResume.mjs) ──
// repo จำลอง (git จริง) + รายงาน playwright จำลอง:
//   ก. ตกเพราะข้อทดสอบ 1 ไฟล์ → จด · แก้แค่ไฟล์นั้น + tests/flaky-log.txt แล้ว commit → รันต่อได้ (ชุดไฟล์ที่ตก + ช่วงเดิม)
//   ข. แก้ไฟล์ที่ตก + แตะโค้ดแอป 1 บรรทัด → รันต่อไม่ได้ (รันเต็ม) พร้อมบอกไฟล์
//   ค. แตะไฟล์ทดสอบอื่นที่ไม่ได้ตก → รันเต็ม
//   ง. มีไฟล์ค้างไม่ commit → รันเต็ม
//   จ. ตกที่ช่วง prod-live ด้วย → ไม่จด · ช่วงล้มทั้งช่วง (ไม่มีไฟล์) → ไม่จด · ตอนเริ่มรอบมีไฟล์ค้าง → ไม่จด
//   ฉ. ไม่นิ่งครบเกณฑ์ (ไม่มีต้นเหตุ) → จดไฟล์ของข้อนั้นจากรายงาน
//   ช. ผลที่จดเป็นของ commit ที่ไม่ใช่บรรพบุรุษของ HEAD (สายอื่น) → ใช้ไม่ได้
//   ซ. ลบที่จด (รอบรันต่อผ่าน/รอบเต็มใหม่) → ใช้ไม่ได้ · ผลผูกกับรอบเดียว
//   ฌ. ตัวรันรอบตรวจ (scripts/test-prodbuild.mjs) ต่อสายครบ: ตรวจรันต่อได้ก่อนขั้นแรก · จดรอบที่ตกท้ายรอบ · ลบที่จดเมื่อรอบเต็มเริ่ม
// รัน: node tests/tools/gate-resume.test.mjs   (โค้ดเดิมไม่มี scripts/lib/gateResume.mjs → ตก)
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ราก = process.cwd();
let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n   ${String(เพิ่ม).slice(-1500)}`}`); };

const ที่lib = path.join(ราก, "scripts/lib/gateResume.mjs");
if (!existsSync(ที่lib)) { ผล(false, "มีตัวรันต่อจากรอบที่ตก (scripts/lib/gateResume.mjs)", "ไม่มีไฟล์"); console.log(`\n${ตก} FAIL`); process.exit(1); }
const { จดรอบที่ตก, ตรวจรันต่อได้, ลบที่จด } = await import(pathToFileURL(ที่lib).href);

const repo = mkdtempSync(path.join(tmpdir(), "pms-gate-resume-"));
const g = (...a) => execFileSync("git", a, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const เขียน = (f, t) => { mkdirSync(path.dirname(path.join(repo, f)), { recursive: true }); writeFileSync(path.join(repo, f), t); };
const commit = (m) => { g("add", "-A"); g("-c", "user.email=t@example.test", "-c", "user.name=t", "commit", "-q", "-m", m); return g("rev-parse", "HEAD"); };
const รายงาน = (ชื่อ, ข้อ) => {
  const f = path.join(repo, "test-results", ชื่อ);
  mkdirSync(path.dirname(f), { recursive: true });
  writeFileSync(f, JSON.stringify({ config: { rootDir: repo }, errors: [], suites: ข้อ.map(([ไฟล์, ชื่อข้อ, โปรเจกต์, สถานะ]) => ({ file: ไฟล์,
    specs: [{ title: ชื่อข้อ, file: ไฟล์, tests: [{ projectName: โปรเจกต์, status: สถานะ, annotations: [] }] }] })) }));
  return f;
};

try {
  g("init", "-q");
  เขียน("apps/hq/page.tsx", "export const a = 1;\n");
  เขียน("tests/scenario/a.spec.ts", "// a\n"); เขียน("tests/scenario/b.spec.ts", "// b\n"); เขียน("tests/scenario/c.spec.ts", "// c\n");
  เขียน("tests/flaky-log.txt", "");
  เขียน(".gitignore", "test-results/\n");
  const ตรวจ = commit("เริ่ม");
  const รายงานchromium = รายงาน("gate-report.chromium.json", [["tests/scenario/a.spec.ts", "ข้อ a", "chromium", "unexpected"], ["tests/scenario/b.spec.ts", "ข้อ b", "chromium", "expected"]]);
  const รายงานserial = รายงาน("gate-report.hq-settings.json", [["tests/scenario/c.spec.ts", "ข้อ c", "hq-settings", "expected"]]);
  const ตกจริง = [{ ข้อ: "a.spec.ts › ข้อ a", ไฟล์: "tests/scenario/a.spec.ts", โปรเจกต์: "chromium" }];

  // จ. ไม่จด
  ผล(จดรอบที่ตก({ sha: ตรวจ, ค้าง: [], ขั้นอื่นตก: ["ช่วง prod-live"], รายงาน: [รายงานchromium, รายงานserial], ตกจริง, ไม่นิ่งค้าง: [], cwd: repo }) !== ""
    && !ตรวจรันต่อได้(repo).ได้, "จ. ตกที่ช่วง prod-live ด้วย → ไม่จด (รันเต็ม)");
  ผล(จดรอบที่ตก({ sha: ตรวจ, ค้าง: [], ขั้นอื่นตก: [], รายงาน: [รายงานchromium], ตกจริง: [{ ข้อ: "ช่วง chromium: ตกโดยไม่มีข้อให้รันซ้ำ" }], ไม่นิ่งค้าง: [], cwd: repo }) !== ""
    && !ตรวจรันต่อได้(repo).ได้, "จ. ช่วงล้มทั้งช่วง (ไม่มีไฟล์ของข้อ) → ไม่จด");
  ผล(จดรอบที่ตก({ sha: ตรวจ, ค้าง: [" M apps/hq/page.tsx"], ขั้นอื่นตก: [], รายงาน: [รายงานchromium], ตกจริง, ไม่นิ่งค้าง: [], cwd: repo }) !== ""
    && !ตรวจรันต่อได้(repo).ได้, "จ. ตอนเริ่มรอบมีไฟล์ค้าง → ไม่จด");

  // ก. จด → แก้แค่ไฟล์ที่ตก + บันทึกไม่นิ่ง → รันต่อได้
  const เหตุจด = จดรอบที่ตก({ sha: ตรวจ, ค้าง: [], ขั้นอื่นตก: [], รายงาน: [รายงานchromium, รายงานserial], ตกจริง, ไม่นิ่งค้าง: [], cwd: repo });
  ผล(เหตุจด === "", "ก. ตกเพราะข้อทดสอบล้วน → จดผลรอบ", เหตุจด);
  เขียน("tests/scenario/a.spec.ts", "// a แก้แล้ว\n"); เขียน("tests/flaky-log.txt", "ต้นเหตุ | 2026-10-30 | a.spec.ts › ข้อ a | แก้แล้ว\n");
  const แก้ = commit("แก้ข้อ a");
  let r = ตรวจรันต่อได้(repo);
  ผล(r.ได้ && r.จด.sha === ตรวจ && JSON.stringify(r.จด.ไฟล์ตก) === JSON.stringify([{ ไฟล์: "tests/scenario/a.spec.ts", โปรเจกต์: "chromium" }])
    && r.จด.รายงาน.length === 2 && r.จด.รายงาน.every(existsSync),
    "ก. แก้แค่ไฟล์ที่ตก (+ บันทึกไม่นิ่ง) → รันต่อได้ · รันเฉพาะ a.spec.ts ช่วง chromium · ใช้รายงานเดิมทุกช่วง", JSON.stringify(r));
  // รายงานเดิมเป็นสำเนา — รอบใหม่เขียนทับไฟล์รายงานเดิมใน test-results ก็ไม่กระทบ
  writeFileSync(รายงานchromium, "{}");
  ผล(JSON.parse(readFileSync(r.จด.รายงาน[0], "utf8")).suites?.length === 2, "ก. รายงานของรอบที่ตกถูกเก็บสำเนาไว้ (ไม่ถูกรอบใหม่เขียนทับ)");

  // ง. ไฟล์ค้าง
  เขียน("tests/scenario/a.spec.ts", "// a แก้อีก\n");
  ผล(!ตรวจรันต่อได้(repo).ได้ && /ยังไม่ commit/.test(ตรวจรันต่อได้(repo).เหตุ), "ง. มีไฟล์ค้างไม่ commit → รันเต็ม");
  g("checkout", "--", "tests/scenario/a.spec.ts");

  // ข. แตะโค้ดแอป
  เขียน("apps/hq/page.tsx", "export const a = 2;\n");
  commit("แตะโค้ดแอป");
  r = ตรวจรันต่อได้(repo);
  ผล(!r.ได้ && r.เหตุ.includes("apps/hq/page.tsx"), "ข. แตะโค้ดแอป 1 บรรทัด → รันเต็ม (บอกไฟล์ที่แตะ)", JSON.stringify(r));
  g("reset", "-q", "--hard", แก้);

  // ค. แตะไฟล์ทดสอบอื่น
  เขียน("tests/scenario/b.spec.ts", "// b แก้\n");
  commit("แตะ b");
  r = ตรวจรันต่อได้(repo);
  ผล(!r.ได้ && r.เหตุ.includes("tests/scenario/b.spec.ts"), "ค. แตะไฟล์ทดสอบที่ไม่ได้ตก → รันเต็ม", JSON.stringify(r));
  g("reset", "-q", "--hard", แก้);

  // ช. ผลที่จดของสายอื่น
  g("checkout", "-q", "-b", "สายอื่น", ตรวจ + "~0");
  g("reset", "-q", "--hard", ตรวจ);
  เขียน("apps/hq/other.tsx", "x\n"); const สายอื่น = commit("สายอื่น");
  g("checkout", "-q", "-");
  ลบที่จด(repo);
  จดรอบที่ตก({ sha: สายอื่น, ค้าง: [], ขั้นอื่นตก: [], รายงาน: [รายงานserial], ตกจริง: [{ ข้อ: "c", ไฟล์: "tests/scenario/c.spec.ts", โปรเจกต์: "hq-settings" }], ไม่นิ่งค้าง: [], cwd: repo });
  r = ตรวจรันต่อได้(repo);
  ผล(!r.ได้ && /ไม่ใช่ของ commit ก่อนหน้า HEAD/.test(r.เหตุ), "ช. ผลที่จดเป็นของ commit สายอื่น (ไม่ใช่บรรพบุรุษ) → ใช้ไม่ได้", JSON.stringify(r));

  // ฉ. ไม่นิ่งครบเกณฑ์ → จดไฟล์ของข้อจากรายงาน
  ลบที่จด(repo);
  const รายงานไม่นิ่ง = รายงาน("gate-report.chromium.json", [["tests/scenario/a.spec.ts", "ข้อ a", "chromium", "expected"], ["tests/scenario/b.spec.ts", "ข้อ b", "chromium", "flaky"]]);
  const เหตุไม่นิ่ง = จดรอบที่ตก({ sha: แก้, ค้าง: [], ขั้นอื่นตก: [], รายงาน: [รายงานไม่นิ่ง], ตกจริง: [], ไม่นิ่งค้าง: ["b.spec.ts › ข้อ b"], cwd: repo });
  เขียน("tests/scenario/b.spec.ts", "// b หาต้นเหตุแล้ว\n"); commit("ต้นเหตุ b");
  r = ตรวจรันต่อได้(repo);
  ผล(เหตุไม่นิ่ง === "" && r.ได้ && r.จด.ไฟล์ตก[0]?.ไฟล์ === "tests/scenario/b.spec.ts" && r.จด.ไฟล์ตก[0]?.โปรเจกต์ === "chromium",
    "ฉ. ไม่นิ่งครบเกณฑ์ไม่มีต้นเหตุ → จดไฟล์ของข้อนั้น · แก้ไฟล์นั้น = รันต่อได้", เหตุไม่นิ่ง + " " + JSON.stringify(r));

  // ซ. ลบที่จด
  ลบที่จด(repo);
  ผล(!ตรวจรันต่อได้(repo).ได้, "ซ. ลบที่จดแล้ว (รอบรันต่อผ่าน/รอบเต็มใหม่) → ใช้ผลเดิมไม่ได้อีก");
} finally {
  rmSync(repo, { recursive: true, force: true });
}

// ฌ. ต่อสายในตัวรันรอบตรวจ
const ตัวรัน = readFileSync(path.join(ราก, "scripts/test-prodbuild.mjs"), "utf8");
const ตำแหน่ง = (s) => ตัวรัน.indexOf(s);
ผล(ตำแหน่ง("ตรวจรันต่อได้()") > 0 && ตำแหน่ง("ตรวจรันต่อได้()") < ตำแหน่ง("const ขั้นแรก =")
  && /PMS_GATE_FULL/.test(ตัวรัน) && ตำแหน่ง("ลบที่จด();") > 0 && ตำแหน่ง("ลบที่จด();") < ตำแหน่ง("const ขั้นแรก =")
  && ตำแหน่ง("จดรอบที่ตก({") > ตำแหน่ง("ตรวจไม่นิ่งท้ายรอบ(รายงาน,")
  && /check-e2e-ran\.mjs", \.\.\.รายงานรวม/.test(ตัวรัน) && /\.\.\.รันต่อ\.จด\.รายงาน/.test(ตัวรัน),
  "ฌ. ตัวรันรอบตรวจ: ตรวจรันต่อก่อนขั้นแรก · รอบเต็มลบที่จด · จดท้ายรอบ · ตัวตรวจท้ายรอบใช้รายงานเดิม+รันต่อ");

console.log(ตก ? `\n${ตก} FAIL` : "\nALL PASS");
process.exit(ตก ? 1 : 0);
