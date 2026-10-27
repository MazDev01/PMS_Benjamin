// ── ตัวตรวจ: ทุกแถวการ์ด KPI ต้องเป็นแถวกลาง (KpiRow) และมี 4 ใบพอดี (บอสสั่ง 22 ต.ค. 69 · ใบ 0246) ──────────────────
//
// ทำไม: เดิมแต่ละหน้าเขียนแถวการ์ดเอง (.dash-kpis · .kpi-bar · .stat-grid · .hq-kpi4 · .kpi-row) — จำนวนการ์ด 1–4 ใบไม่เท่ากัน
//   ตัวเลขคิดในเบราว์เซอร์คนละสูตร · บอสสั่ง: ทุกแถว 4 ใบพอดี คอมโพเนนต์เดียว ตัวเลขจากฐาน (kpi_cards)
// ตก เมื่อเจอในโค้ดแอป (apps/ · packages/ · ไม่นับคำอธิบาย · ยกเว้น components/ui/KpiCard.tsx ตัวกลาง):
//   1) ชื่อคลาสแถวการ์ดแบบเดิมในข้อความ/className: dash-kpis · kpi-bar · stat-grid · hq-kpi4 · kpi-row · hqx-kpis
//   2) <KpiRow> ที่นับการ์ดได้ไม่ใช่ 4: ลูก <KpiCard> ตรง ๆ ต้อง 4 ตัว · {รายการ.map(...)} ต้องเป็นอาร์เรย์ที่ประกาศในไฟล์เดียวกัน 4 ช่อง
//      นับไม่ได้ (รายการมาจากที่อื่น/มีเงื่อนไข) = ตก — ให้เขียนเป็นอาร์เรย์คงที่ 4 ช่อง
//   ข้อทดสอบบนหน้าจริง (ทุกหน้า · ทุกแถว [data-kpi-row] มี [data-kpi] 4 ใบ): tests/scenario/kpi-cards.spec.ts
// ใช้: node scripts/check-kpi-rows.mjs   (อยู่ใน npm run checks)
import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { ไฟล์ที่gitเก็บ } from "./lib/gitFiles.mjs";

const ตัวกลาง = "packages/shared/components/ui/KpiCard.tsx";
const คลาสเดิม = /(^|[\s"'`.])(dash-kpis|kpi-bar|stat-grid|hq-kpi4|kpi-row|hqx-kpis)(?=$|[\s"'`])/;
const เจอ = [];

function ชื่อแท็ก(n) {
  const t = ts.isJsxElement(n) ? n.openingElement.tagName : ts.isJsxSelfClosingElement(n) ? n.tagName : null;
  return t && ts.isIdentifier(t) ? t.text : null;
}

for (const rel of ไฟล์ที่gitเก็บ(["apps", "packages"], { ext: /\.(ts|tsx)$/ })) {
  const p = rel.split(path.sep).join("/");
  if (p === ตัวกลาง || p.endsWith(".d.ts")) continue;
  const src = readFileSync(rel, "utf8");
  if (!/dash-kpis|kpi-bar|stat-grid|hq-kpi4|kpi-row|hqx-kpis|KpiRow/.test(src)) continue;
  const sf = ts.createSourceFile(p, src, ts.ScriptTarget.Latest, true, p.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const บรรทัด = n => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const อาร์เรย์ = new Map();   // ชื่อตัวแปร → จำนวนช่อง (อาร์เรย์คงที่ในไฟล์)
  const เก็บ = n => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && ts.isArrayLiteralExpression(n.initializer)
        && !n.initializer.elements.some(e => ts.isSpreadElement(e))) อาร์เรย์.set(n.name.text, n.initializer.elements.length);
    ts.forEachChild(n, เก็บ);
  };
  เก็บ(sf);
  const เดิน = n => {
    if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isJsxText(n)) && คลาสเดิม.test(n.text)) {
      เจอ.push(`${p}:${บรรทัด(n)}  แถวการ์ดแบบเดิม (${n.text.match(คลาสเดิม)[2]}) — ใช้ <KpiRow> + <KpiCard> (components/ui/KpiCard.tsx)`);
    }
    if (ts.isJsxElement(n) && ชื่อแท็ก(n) === "KpiRow") {
      let นับ = 0, นับไม่ได้ = "";
      for (const c of n.children) {
        if (ts.isJsxText(c) && !c.text.trim()) continue;
        if ((ts.isJsxElement(c) || ts.isJsxSelfClosingElement(c)) && ชื่อแท็ก(c) === "KpiCard") { นับ++; continue; }
        if (ts.isJsxExpression(c) && c.expression && ts.isCallExpression(c.expression) && ts.isPropertyAccessExpression(c.expression.expression)
            && c.expression.expression.name.text === "map" && ts.isIdentifier(c.expression.expression.expression)
            && อาร์เรย์.has(c.expression.expression.expression.text)) { นับ += อาร์เรย์.get(c.expression.expression.expression.text); continue; }
        if (ts.isJsxExpression(c) && !c.expression) continue;   // {/* คำอธิบาย */}
        นับไม่ได้ = c.getText(sf).slice(0, 60);
      }
      if (นับไม่ได้) เจอ.push(`${p}:${บรรทัด(n)}  <KpiRow> นับการ์ดไม่ได้ (${นับไม่ได้}) — ใส่ <KpiCard> ตรง ๆ หรือ .map จากอาร์เรย์คงที่ 4 ช่องในไฟล์นี้`);
      else if (นับ !== 4) เจอ.push(`${p}:${บรรทัด(n)}  <KpiRow> มีการ์ด ${นับ} ใบ — ต้อง 4 ใบพอดี`);
    }
    ts.forEachChild(n, เดิน);
  };
  เดิน(sf);
}

if (เจอ.length) {
  console.error(`❌ check-kpi-rows: แถวการ์ด KPI ไม่เป็นไปตามกติกา ${เจอ.length} จุด (ทุกแถว = <KpiRow> 4 ใบพอดี · บอสสั่ง 22 ต.ค. 69)`);
  for (const x of เจอ) console.error(`  ${x}`);
  process.exit(1);
}
console.log("check-kpi-rows: ผ่าน — ทุกแถวการ์ด KPI เป็นแถวกลาง 4 ใบพอดี");
