// ── ตัวตรวจ: การแปลงสถานะลีดเป็นขั้นการขาย ต้องมาจากตัวแปลงกลางตัวเดียว (รอบ 4 · บอสสั่ง 21 ต.ค. 69) ─────────────
//
// ตัวกลาง = packages/shared/lib/leadStage.ts (ขั้นของลีด · สภาพแถบขั้น · ชื่อขั้นการขาย)
// เจอ = ตก:
//   1) ออบเจ็กต์ที่มีคีย์สถานะลีด ≥ 3 ตัว แล้วค่าเป็นตัวเลขทั้งหมด หรือเป็นคำอังกฤษตัวเล็กทั้งหมด
//      (ตารางลำดับขั้น / % ความคืบหน้า / กลุ่ม contacted-quoted-won-lost) — ป้ายไทย สี และตารางสถานะกลาง (ค่าเป็นออบเจ็กต์) ไม่นับ
//   2) switch ที่มี case สถานะลีด ≥ 3 ตัว
//   3) ข้อความชื่อขั้น (ขอราคา HQ · ได้ใบ HQ · ทำใบให้ลูกค้า · รอลูกค้าตอบ) ≥ 2 ชื่อในคำสั่งเดียว — รายชื่อขั้นที่เขียนเอง
//   4) (บอสสั่ง 27 ต.ค. 69) หน้าจอแสดงชื่อ/สีสถานะภายใน (leadStatusLabel[…] · leadStatusColor[…]) แทนชื่อขั้น — ใช้ ชื่อขั้น() / สีขั้น()
//      ยกเว้น: บรรทัดตัวเลือกฟอร์มเพิ่มลีดตาม FLOW D2 (มี "WAITING","BULLET" ในบรรทัด) · ไฟล์ข้อมูล/ตรรกะที่ไม่ใช่หน้าจอ (ดู ไม่ใช่หน้าจอ)
// ยกเว้นเฉพาะไฟล์ตัวกลาง · ใบปรับฐาน (SQL) ไม่ตรวจ (ใบเก่าแก้ไม่ได้)
// ข้อทดสอบ: tests/tools/lead-stage-map.test.mjs (PMS_STAGE_CHECK_ROOT = โฟลเดอร์จำลอง)
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { ไฟล์ที่gitเก็บ } from "./lib/gitFiles.mjs";

const ROOT = process.env.PMS_STAGE_CHECK_ROOT || process.cwd();
const ตัวกลาง = new Set(["packages/shared/lib/leadStage.ts"]);
const สถานะ = new Set(["WAITING", "BULLET", "HQ_PRICING", "HQ_QUOTED", "QUOTED", "FOLLOWUP", "NEGO", "PAID", "CANCELLED"]);
const ชื่อขั้น = ["ขอราคา HQ", "ได้ใบ HQ", "ทำใบให้ลูกค้า", "รอลูกค้าตอบ"];

const ไฟล์ = [];
// อ่านเฉพาะไฟล์ที่ git เก็บ (scripts/lib/gitFiles.mjs) — ไม่อ่านผล build ทุกชื่อโฟลเดอร์ (.next-r4 ฯลฯ · 22 ต.ค. 69)
ไฟล์.push(...(process.env.PMS_STAGE_CHECK_ROOT
  ? (await import("node:fs")).readdirSync(ROOT, { recursive: true }).map(String).filter(p => /\.(ts|tsx)$/.test(p)).map(p => path.join(ROOT, p))
  : ไฟล์ที่gitเก็บ(["apps", "packages"], { ext: /\.(ts|tsx)$/, absolute: true })).filter(p => !p.endsWith(".d.ts")));
// ไม่ใช่หน้าจอ: ตารางกลาง · ตัวบันทึกลีด (ข้อความไทม์ไลน์ตรงกับฐาน) · เส้นทางเซิร์ฟเวอร์
const ไม่ใช่หน้าจอ = (rel) => rel === "packages/shared/lib/mock.ts" || rel === "packages/shared/lib/leadIntent.ts"
  || rel === "packages/shared/context/SalesContext.tsx" || rel.startsWith("packages/shared/server/") || rel.startsWith("packages/shared/lib/data/");

const ชื่อคีย์ = (n) => n && (ts.isIdentifier(n) || ts.isStringLiteral(n)) ? n.text : null;
const เจอ = [];
for (const f of ไฟล์) {
  const rel = path.relative(ROOT, f).replace(/\\/g, "/");
  if (ตัวกลาง.has(rel)) continue;
  const text = fs.readFileSync(f, "utf8");
  const sf = ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true, f.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const จด = (node, อะไร) => {
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    เจอ.push(`${rel}:${line + 1} — ${อะไร}: ${text.split(/\r?\n/)[line].trim().slice(0, 140)}`);
  };
  const ดู = (node) => {
    if (ts.isObjectLiteralExpression(node)) {
      const คู่ = node.properties.filter(ts.isPropertyAssignment).filter(p => สถานะ.has(ชื่อคีย์(p.name)));
      if (คู่.length >= 3) {
        const ตัวเลข = คู่.every(p => ts.isNumericLiteral(p.initializer) || (ts.isPrefixUnaryExpression(p.initializer) && ts.isNumericLiteral(p.initializer.operand)));
        const คำอังกฤษ = คู่.every(p => ts.isStringLiteral(p.initializer) && /^[a-z_]+$/.test(p.initializer.text));
        if (ตัวเลข || คำอังกฤษ) จด(node, "ตารางแปลงสถานะเป็นขั้น/ลำดับเขียนเอง");
      }
    }
    if (ts.isSwitchStatement(node)) {
      const n = node.caseBlock.clauses.filter(c => ts.isCaseClause(c) && ts.isStringLiteral(c.expression) && สถานะ.has(c.expression.text)).length;
      if (n >= 3) จด(node, "switch แปลงสถานะลีดเขียนเอง");
    }
    if (ts.isVariableStatement(node) || ts.isExpressionStatement(node) || ts.isReturnStatement(node)) {
      const s = node.getText(sf);
      const พบ = ชื่อขั้น.filter(c => s.includes(`"${c}"`));
      if (พบ.length >= 2) จด(node, `รายชื่อขั้นเขียนเอง (${พบ.join(" · ")})`);
    }
    if (ts.isElementAccessExpression(node) && ts.isIdentifier(node.expression)
        && (node.expression.text === "leadStatusLabel" || node.expression.text === "leadStatusColor") && !ไม่ใช่หน้าจอ(rel)) {
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      if (!/"WAITING"\s*,\s*"BULLET"/.test(text.split(/\r?\n/)[line])) จด(node, `หน้าจอแสดงชื่อ/สีสถานะภายใน (${node.expression.text}) แทนชื่อขั้น — ใช้ ชื่อขั้น()/สีขั้น() จาก leadStage.ts`);
    }
    ts.forEachChild(node, ดู);
  };
  ดู(sf);
}

if (เจอ.length) {
  console.error("✗ check-lead-stage-map: แปลงสถานะลีดเป็นขั้นนอกตัวกลาง (packages/shared/lib/leadStage.ts) — ใช้ ขั้นของลีด() / สภาพแถบขั้น() / ชื่อขั้นการขาย แทน");
  for (const x of เจอ) console.error("  " + x);
  process.exit(1);
}
console.log(`✓ check-lead-stage-map: การแปลงสถานะลีดเป็นขั้นมาจากตัวกลางตัวเดียว (ตรวจ ${ไฟล์.length} ไฟล์)`);
