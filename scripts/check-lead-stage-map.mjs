// ── ตัวตรวจ: การแปลงสถานะลีดเป็นขั้นการขาย ต้องมาจากตัวแปลงกลางตัวเดียว (รอบ 4 · บอสสั่ง 21 ต.ค. 69) ─────────────
//
// ตัวกลาง = packages/shared/lib/leadStage.ts (ขั้นของลีด · สภาพแถบขั้น · ชื่อขั้นการขาย)
// เจอ = ตก:
//   1) ออบเจ็กต์ที่มีคีย์สถานะลีด ≥ 3 ตัว แล้วค่าเป็นตัวเลขทั้งหมด หรือเป็นคำอังกฤษตัวเล็กทั้งหมด
//      (ตารางลำดับขั้น / % ความคืบหน้า / กลุ่ม contacted-quoted-won-lost) — ป้ายไทย สี และตารางสถานะกลาง (ค่าเป็นออบเจ็กต์) ไม่นับ
//   2) switch ที่มี case สถานะลีด ≥ 3 ตัว
//   3) ข้อความชื่อขั้น (ขอราคา HQ · ได้ใบ HQ · ทำใบให้ลูกค้า · รอลูกค้าตอบ) ≥ 2 ชื่อในคำสั่งเดียว — รายชื่อขั้นที่เขียนเอง
// ยกเว้นเฉพาะไฟล์ตัวกลาง · ใบปรับฐาน (SQL) ไม่ตรวจ (ใบเก่าแก้ไม่ได้)
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = process.cwd();
const ตัวกลาง = new Set(["packages/shared/lib/leadStage.ts"]);
const สถานะ = new Set(["WAITING", "BULLET", "HQ_PRICING", "HQ_QUOTED", "QUOTED", "FOLLOWUP", "NEGO", "PAID", "CANCELLED"]);
const ชื่อขั้น = ["ขอราคา HQ", "ได้ใบ HQ", "ทำใบให้ลูกค้า", "รอลูกค้าตอบ"];

const ไฟล์ = [];
const เดิน = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (["node_modules", ".next", ".turbo", "dist"].includes(e.name)) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) เดิน(p);
    else if (/\.(ts|tsx)$/.test(e.name) && !e.name.endsWith(".d.ts")) ไฟล์.push(p);
  }
};
เดิน(path.join(ROOT, "apps"));
เดิน(path.join(ROOT, "packages"));

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
