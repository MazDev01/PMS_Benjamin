// ── ดึง "ข้อความที่ผู้ใช้เห็นได้" จากไฟล์ .ts/.tsx — สตริง · เทมเพลต · ข้อความใน JSX (ไม่รวมคอมเมนต์ · ชื่อตัวแปร · คีย์ของวัตถุ) ─────────
//   ใช้ตัวแยกไวยากรณ์ของ TypeScript (ไม่ใช้ regex · ชื่อตัวแปรภาษาไทยในโค้ดจึงไม่ถูกนับเป็นข้อความบนจอ)
//   ข้าม: import/export from · คีย์ในวัตถุ ({ "คีย์": … }) · อาร์กิวเมนต์ของ logRepoRead/console.* · ค่า data-*/className/key/id
//   ใช้โดย scripts/check-ui-terms.mjs (คลังคำ docs/glossary.md)
import ts from "typescript";

const ข้ามคุณสมบัติJsx = /^(className|key|id|data-[\w-]+|href|src|style|htmlFor|name|type|role|testId|kpi)$/;
const ข้ามฟังก์ชัน = /^(logRepoRead|console\.\w+|require|import|t\.skip|test\.skip)$/;

/** @returns {{ text: string; line: number }[]} */
export function ข้อความบนจอ(โค้ด, ชื่อไฟล์ = "x.tsx") {
  const sf = ts.createSourceFile(ชื่อไฟล์, โค้ด, ts.ScriptTarget.Latest, true, ชื่อไฟล์.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const ผล = [];
  const เก็บ = (node, text) => { if (/[฀-๿]/.test(text)) ผล.push({ text, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1 }); };
  const ชื่อฟังก์ชัน = (call) => call.expression.getText(sf);
  const ข้าม = (node) => {
    const p = node.parent;
    if (!p) return false;
    if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isExternalModuleReference(p)) return true;
    if ((ts.isPropertyAssignment(p) || ts.isPropertySignature?.(p)) && p.name === node) return true;   // คีย์ของวัตถุ
    if (ts.isElementAccessExpression(p) && p.argumentExpression === node) return true;
    if (ts.isLiteralTypeNode(p)) return true;   // ชนิดข้อมูล "ก" | "ข"
    if (ts.isJsxAttribute(p) && ข้ามคุณสมบัติJsx.test(p.name.getText(sf))) return true;
    if (ts.isJsxExpression(p) && p.parent && ts.isJsxAttribute(p.parent) && ข้ามคุณสมบัติJsx.test(p.parent.name.getText(sf))) return true;
    if (ts.isCallExpression(p) && ข้ามฟังก์ชัน.test(ชื่อฟังก์ชัน(p))) return true;
    return false;
  };
  const เดิน = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) { if (!ข้าม(node)) เก็บ(node, node.text); }
    else if (ts.isTemplateExpression(node)) {
      if (!ข้าม(node)) { เก็บ(node.head, node.head.text); for (const s of node.templateSpans) เก็บ(s.literal, s.literal.text); }
    } else if (ts.isJsxText(node)) { const t = node.getText(sf).replace(/\s+/g, " ").trim(); if (t) เก็บ(node, t); }
    ts.forEachChild(node, เดิน);
  };
  เดิน(sf);
  return ผล;
}
