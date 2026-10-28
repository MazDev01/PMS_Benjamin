// ── ตัวตรวจ: คำของ flow เก่าบนหน้าเว็บ (บอสสั่ง 28 ต.ค. 69 · ตรวจทั้งระบบเทียบ FLOW รอบ 5) ─────────────────────────────
//
// เหตุ: บอสเจอคำของ flow เก่า (ติดตามผล · เจรจาต่อรอง · ประเมินราคา · แม่แบบอาคาร · เลขลำดับนำหน้าชื่อขั้น) ทีละจุดบนหน้าเว็บ
// รายการคำอยู่ไฟล์เดียว scripts/old-flow-words.json ("คำ" = ข้อความที่ห้ามมี · "แบบ" = regex ทั้งข้อความ · "ยกเว้น" = ไฟล์+คำ+เหตุผล)
// ตรวจเฉพาะ "ข้อความที่ขึ้นจอได้": ข้อความใน JSX · สตริง · เทมเพลต ของไฟล์หน้าเว็บ (apps/** · packages/shared/components · lib)
//   คอมเมนต์ไม่นับ (อ่านด้วยตัวแยกโค้ด TypeScript) · ไฟล์ข้อมูล/ตรรกะที่ไม่ขึ้นจอ (ตารางสถานะภายใน · เซิร์ฟเวอร์) ไม่ตรวจ
// หมวด "สถานะ" (28 ต.ค. 69 · ล้าง flow เก่า ใบ 0257): รหัสสถานะลีดเก่าห้ามมีในโค้ด/ข้อมูลตั้งต้น/ข้อมูลตัวอย่าง/หน้าเว็บ
//   ตรวจทั้งไฟล์ (รวมคอมเมนต์ · SQL · JSON) ตามรายการ "ที่ตรวจ" ใน scripts/old-flow-words.json · จับเป็นคำทั้งคำ (ตัวพิมพ์ใหญ่ตามรหัส)
// ข้อทดสอบ: tests/tools/flow-guards.test.mjs (PMS_OLD_WORDS_ROOT = โฟลเดอร์จำลอง)
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { ไฟล์ที่gitเก็บ } from "./lib/gitFiles.mjs";

const ROOT = process.env.PMS_OLD_WORDS_ROOT || process.cwd();
const ตั้งค่า = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts/old-flow-words.json"), "utf8"));
const แบบ = (ตั้งค่า.แบบ ?? []).map(x => ({ ...x, re: new RegExp(x.แบบ) }));
// ไม่ขึ้นจอ: ตารางสถานะภายใน (ห้ามแสดงอยู่แล้ว · check-lead-stage-map) · ตัวบันทึกลีด · เซิร์ฟเวอร์/ชั้นข้อมูล
const ไม่ใช่หน้าจอ = (rel) => rel === "packages/shared/lib/mock.ts" || rel === "packages/shared/lib/leadIntent.ts"
  || rel.startsWith("packages/shared/server/") || rel.startsWith("packages/shared/lib/data/") || /(^|\/)app\/api\//.test(rel);

const ไฟล์ = (process.env.PMS_OLD_WORDS_ROOT
  ? fs.readdirSync(ROOT, { recursive: true }).map(String).map(p => p.replaceAll("\\", "/")).filter(p => /^(apps|packages)\//.test(p) && /\.(ts|tsx)$/.test(p)).map(p => path.join(ROOT, p))
  : ไฟล์ที่gitเก็บ(["apps", "packages"], { ext: /\.(ts|tsx)$/, absolute: true }))
  .filter(p => !p.endsWith(".d.ts"));

const เจอ = [];
for (const f of ไฟล์) {
  const rel = path.relative(ROOT, f).replaceAll("\\", "/");
  if (ไม่ใช่หน้าจอ(rel)) continue;
  const text = fs.readFileSync(f, "utf8");
  const sf = ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true, f.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const ตรวจข้อความ = (node, s) => {
    const ข้อความ = String(s).replace(/\s+/g, " ").trim();
    if (!ข้อความ) return;
    const บรรทัด = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    for (const k of ตั้งค่า.คำ ?? []) if (ข้อความ.includes(k.คำ)) เจอ.push({ rel, บรรทัด, คำ: k.คำ, เหตุ: k.เหตุ, ข้อความ });
    for (const k of แบบ) if (k.re.test(ข้อความ)) เจอ.push({ rel, บรรทัด, คำ: k.แบบ, เหตุ: k.เหตุ, ข้อความ });
  };
  (function เดิน(n) {
    if (ts.isJsxText(n)) ตรวจข้อความ(n, n.text);
    else if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
      // คีย์ import / ชื่อโมดูล ไม่ใช่ข้อความบนจอ
      if (!(n.parent && (ts.isImportDeclaration(n.parent) || ts.isExportDeclaration(n.parent)))) ตรวจข้อความ(n, n.text);
    } else if (ts.isTemplateExpression(n)) {
      ตรวจข้อความ(n, [n.head.text, ...n.templateSpans.map(s => s.literal.text)].join(" "));
    }
    ts.forEachChild(n, เดิน);
  })(sf);
}

// ── หมวดสถานะ: รหัสสถานะลีดเก่าในโค้ด · ข้อมูลตั้งต้น · ข้อมูลตัวอย่าง ──
const หมวดสถานะ = ตั้งค่า.สถานะ ?? { รหัส: [], ที่ตรวจ: [] };
const รหัสเก่า = (หมวดสถานะ.รหัส ?? []).map(x => ({ ...x, re: new RegExp(`\\b${x.รหัส}\\b`) }));
const ไม่ตรวจสถานะ = new Set(หมวดสถานะ.ไม่ตรวจ ?? []);
const ในขอบเขต = rel => (หมวดสถานะ.ที่ตรวจ ?? []).some(r => rel === r || rel.startsWith(r.replace(/\/$/, "") + "/"));
const นามสกุลสถานะ = /\.(ts|tsx|mjs|js|cjs|sql|json)$/;
const ไฟล์สถานะ = (process.env.PMS_OLD_WORDS_ROOT
  ? fs.readdirSync(ROOT, { recursive: true }).map(String).map(p => p.replaceAll("\\", "/"))
  : ไฟล์ที่gitเก็บ(หมวดสถานะ.ที่ตรวจ ?? [], { ext: นามสกุลสถานะ }).map(p => p.replaceAll("\\", "/")))
  .filter(rel => ในขอบเขต(rel) && นามสกุลสถานะ.test(rel) && !ไม่ตรวจสถานะ.has(rel));
const เจอสถานะ = [];
for (const rel of ไฟล์สถานะ) {
  const บรรทัด = fs.readFileSync(path.join(ROOT, rel), "utf8").split(/\r?\n/);
  บรรทัด.forEach((l, i) => {
    for (const k of รหัสเก่า) if (k.re.test(l)) เจอสถานะ.push({ rel, บรรทัด: i + 1, รหัส: k.รหัส, เหตุ: k.เหตุ, ข้อความ: l.trim() });
  });
}

const ยกเว้น = ตั้งค่า.ยกเว้น ?? [];
const ไม่มีเหตุ = ยกเว้น.filter(x => !String(x.เหตุ ?? "").trim());
const เหลือ = เจอ.filter(x => !ยกเว้น.some(y => y.ไฟล์ === x.rel && y.คำ === x.คำ && String(y.เหตุ ?? "").trim()));
if (ไม่มีเหตุ.length) {
  console.log(`❌ รายการยกเว้นไม่มีเหตุผล ${ไม่มีเหตุ.length} รายการ (scripts/old-flow-words.json) — ยกเว้นต้องบอกว่าทำไมคำนี้ไม่ใช่ของ flow เก่า`);
  process.exit(1);
}
console.log(`คำของ flow เก่าบนหน้าเว็บ: ${เหลือ.length} จุด (ตรวจ ${ไฟล์.length} ไฟล์ · คำ ${(ตั้งค่า.คำ ?? []).length} · แบบ ${แบบ.length} · ยกเว้น ${ยกเว้น.length})`);
console.log(`สถานะลีดเก่าในโค้ด/ข้อมูลตั้งต้น/ข้อมูลตัวอย่าง: ${เจอสถานะ.length} จุด (ตรวจ ${ไฟล์สถานะ.length} ไฟล์ · รหัส ${รหัสเก่า.map(x => x.รหัส).join(" ")})`);
if (!เหลือ.length && !เจอสถานะ.length) process.exit(0);
for (const x of เหลือ) console.log(`  ✗ ${x.rel}:${x.บรรทัด} "${x.ข้อความ.slice(0, 80)}" — มี "${x.คำ}" · ${x.เหตุ}`);
for (const x of เจอสถานะ) console.log(`  ✗ ${x.rel}:${x.บรรทัด} "${x.ข้อความ.slice(0, 80)}" — สถานะ ${x.รหัส} · ${x.เหตุ}`);
if (เหลือ.length) console.log("แก้ข้อความให้ตรง docs/FLOW.html · ถ้าเป็นคำที่ถูกต้องตาม FLOW จริง ให้เพิ่มใน \"ยกเว้น\" ของ scripts/old-flow-words.json พร้อมเหตุผล");
if (เจอสถานะ.length) console.log("ใช้สถานะตาม FLOW ตาราง \"สถานะ ↔ ขั้น\" (ขั้น 5 = QUOTED) · ฐานไม่รับสถานะเก่าแล้ว (ใบ 0257)");
process.exit(1);
