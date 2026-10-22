// ── ตัวตรวจ: โค้ดแอปห้ามอ่านช่อง "ประเมินราคา" ของลีด (LeadRow.value) (บอสตัดสิน 19–20 ต.ค. 69 · รอบ 2 ช่วง ค ข้อ 5) ──
//
// ช่องประเมินราคาที่ดีลเลอร์พิมพ์เองเอาออกจากหน้าเว็บทุกที่ · คอลัมน์ leads.value คงไว้ในฐาน ห้ามลบ
// มูลค่าลีดทุกที่ = ยอดก่อน VAT ของใบเสนอราคาล่าสุด (LeadRow.quoteValue · มูลค่าลีด() · ใบ 0223)
//   ตัวกันถาวร: เคยมีที่อ่าน l.value ไปโชว์/รวมยอดกว่า 15 จุด (ตาราง กระดาน การ์ด กระดิ่ง ช่องค้นหา ไฟล์ส่งออก)
// ใช้ตัววิเคราะห์ชนิดข้อมูลแบบเดียวกับ check-no-lead-template.mjs (ช่องชื่อ value มีอีกหลายความหมาย)
// ข้อยกเว้น: scripts/no-lead-estimate-allow.json — ระบุ "ไฟล์" + "ข้อความในบรรทัด" + "เหตุผล"
//   (เช่น คงค่าเดิมตอนบันทึก — ไม่แสดง ไม่นำไปคำนวณ) · ข้อยกเว้นที่ไม่เจอในโค้ดแล้ว = ตก
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { ไฟล์ที่gitเก็บ } from "./lib/gitFiles.mjs";

const ROOT = process.cwd();
const ห้าม = { LeadRow: ["value"] };
const ข้อยกเว้น = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts/no-lead-estimate-allow.json"), "utf8")).allow;

const ไฟล์ทั้งหมด = [];
// อ่านเฉพาะไฟล์ที่ git เก็บ (scripts/lib/gitFiles.mjs) — ไม่อ่านผล build ทุกชื่อโฟลเดอร์ (.next-r4 ฯลฯ · 22 ต.ค. 69)
ไฟล์ทั้งหมด.push(...ไฟล์ที่gitเก็บ(["apps", "packages"], { ext: /\.(ts|tsx)$/, absolute: true }).filter(p => !p.endsWith(".d.ts")));

const cfgPath = path.join(ROOT, "apps/dealer/tsconfig.json");
const cfg = ts.parseJsonConfigFileContent(ts.readConfigFile(cfgPath, ts.sys.readFile).config, ts.sys, path.dirname(cfgPath));
const program = ts.createProgram(ไฟล์ทั้งหมด, { ...cfg.options, noEmit: true });
const checker = program.getTypeChecker();

// ช่องนี้ประกาศไว้ในชนิดข้อมูลต้องห้ามหรือไม่ (ดูจากที่ประกาศของ symbol — ชนิดที่ขยายต่อ/ตัดบางช่องก็ยังจับได้)
const ประกาศใน = (sym) => {
  const s = sym && (sym.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(sym) : sym);
  for (const d of s?.declarations ?? []) {
    let n = d.parent;
    while (n && !ts.isTypeAliasDeclaration(n) && !ts.isInterfaceDeclaration(n)) n = n.parent;
    if (n && ห้าม[n.name.text]?.includes(s.name)) return n.name.text;
  }
  // ชนิดที่สังเคราะห์ (เช่น Pick/Omit/mapped) → ตาม symbol ต้นทาง
  const ต้นทาง = s?.links?.syntheticOrigin ?? s?.target;
  return ต้นทาง && ต้นทาง !== s ? ประกาศใน(ต้นทาง) : null;
};

const เจอ = [];
for (const sf of program.getSourceFiles()) {
  const rel = path.relative(ROOT, sf.fileName).replace(/\\/g, "/");
  if (!/^(apps|packages)\//.test(rel)) continue;
  const บรรทัด = sf.text.split(/\r?\n/);
  const บันทึก = (node, ชื่อชนิด, ช่อง) => {
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    เจอ.push({ ไฟล์: rel, บรรทัดที่: line + 1, ข้อความ: บรรทัด[line].trim(), ช่อง: `${ชื่อชนิด}.${ช่อง}` });
  };
  const เป็นการเขียน = (node) => {
    const p = node.parent;
    return p && ts.isBinaryExpression(p) && p.left === node && p.operatorToken.kind === ts.SyntaxKind.EqualsToken;
  };
  const ดู = (node) => {
    if (ts.isPropertyAccessExpression(node) && !เป็นการเขียน(node)) {
      const t = ประกาศใน(checker.getSymbolAtLocation(node.name));
      if (t) บันทึก(node, t, node.name.text);
    } else if (ts.isElementAccessExpression(node) && ts.isStringLiteral(node.argumentExpression) && !เป็นการเขียน(node)) {
      const t = ประกาศใน(checker.getSymbolAtLocation(node.argumentExpression));
      if (t) บันทึก(node, t, node.argumentExpression.text);
    } else if (ts.isBindingElement(node) && ts.isObjectBindingPattern(node.parent)) {
      const ชื่อ = (node.propertyName ?? node.name);
      if (ts.isIdentifier(ชื่อ)) {
        const ชนิด = checker.getTypeAtLocation(node.parent);
        const t = ประกาศใน(ชนิด.getProperty(ชื่อ.text));
        if (t) บันทึก(node, t, ชื่อ.text);
      }
    }
    ts.forEachChild(node, ดู);
  };
  ดู(sf);
}

const ใช้ข้อยกเว้น = new Set();
const ผิด = เจอ.filter(f => {
  const i = ข้อยกเว้น.findIndex(a => a.file === f.ไฟล์ && f.ข้อความ.includes(a.line));
  if (i >= 0) { ใช้ข้อยกเว้น.add(i); return false; }
  return true;
});
const ค้าง = ข้อยกเว้น.filter((_, i) => !ใช้ข้อยกเว้น.has(i));

if (ผิด.length || ค้าง.length) {
  if (ผิด.length) {
    console.error(`✗ โค้ดแอปอ่านช่องประเมินราคาของลีด (LeadRow.value) ${ผิด.length} จุด — มูลค่าลีดต้องใช้ มูลค่าลีด() (ยอดใบเสนอราคาล่าสุด):`);
    for (const f of ผิด) console.error(`  ${f.ไฟล์}:${f.บรรทัดที่}  [${f.ช่อง}]  ${f.ข้อความ.slice(0, 140)}`);
  }
  if (ค้าง.length) {
    console.error(`✗ ข้อยกเว้นใน scripts/no-lead-estimate-allow.json ที่ไม่เจอในโค้ดแล้ว ${ค้าง.length} รายการ — ลบออก:`);
    for (const a of ค้าง) console.error(`  ${a.file}  "${a.line}"`);
  }
  console.error("  ยกเว้นได้เฉพาะจุดที่ไม่แสดง/ไม่คำนวณ (เขียนเหตุผลใน scripts/no-lead-estimate-allow.json)");
  process.exit(1);
}
console.log(`✓ ไม่มีโค้ดแอปอ่านช่องประเมินราคาของลีดไปแสดง/คำนวณ (ข้อยกเว้น ${ข้อยกเว้น.length} จุด)`);
