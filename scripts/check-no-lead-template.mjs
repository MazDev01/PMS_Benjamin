// ── ตัวตรวจ: โค้ดแอปห้ามอ่านช่องแม่แบบของลูกค้าเป้าหมาย และค่าที่ได้จากช่องนั้น (บอสสั่ง 16 ต.ค. 69) ──
//
// เอาแม่แบบออกทั้งระบบ: ข้อมูลเก่าในฐานเก็บไว้ "แต่ไม่แสดง" · เคยรั่วออกมาทางอ้อม 4 จุด
// (ใบใหม่หยิบไปใส่ประเภทอาคาร · แดชบอร์ด "สนใจ:" · ข้อความแจ้งเตือน · นัดหมายใหม่) จึงต้องมีตัวกันถาวร
//
// ใช้ตัววิเคราะห์ชนิดข้อมูลของ TypeScript (ไม่ใช่ค้นข้อความ) เพราะชื่อช่อง product ใช้หลายความหมาย
//   เช่น quote_requests.product = "งานที่ขอราคา" ที่ดีลเลอร์พิมพ์เอง → อ่านได้ปกติ
// ช่องที่ห้ามอ่าน (ตามชนิดข้อมูลที่ประกาศช่องนั้น):
//   LeadRow.product · LeadRow.category          — ช่องแม่แบบของลูกค้าเป้าหมาย
//   CustomerRow.category                         — ได้มาจาก lead.product ตอนปิดการขาย (leadToCustomer)
//   QuotationMock / AppointmentMock / BoqSource .buildingType — เคยคัดลอกมาจากแม่แบบของลูกค้าเป้าหมาย
// "อ่าน" = เข้าถึงค่า (x.product · x["product"] · const { product } = x) · การเขียน/ประกาศช่องไม่นับ
//
// ข้อยกเว้น: scripts/no-lead-template-allow.json — ระบุ "ไฟล์" + "ข้อความในบรรทัด" + "เหตุผล"
//   อนุญาตเฉพาะแผงรายละเอียดของใบเก่า (ดูได้ครบตามที่บอสสั่ง) · ข้อยกเว้นที่ไม่เจอในโค้ดแล้ว = ตก (กันรายการค้าง)
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = process.cwd();
const ห้าม = {
  LeadRow: ["product", "category"],
  CustomerRow: ["category"],
  QuotationMock: ["buildingType"],
  AppointmentMock: ["buildingType"],
  BoqSource: ["buildingType"],
};
const ข้อยกเว้น = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts/no-lead-template-allow.json"), "utf8")).allow;

const ไฟล์ทั้งหมด = [];
const เดิน = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (["node_modules", ".next", ".turbo", "dist"].includes(e.name)) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) เดิน(p);
    else if (/\.(ts|tsx)$/.test(e.name) && !e.name.endsWith(".d.ts")) ไฟล์ทั้งหมด.push(p);
  }
};
เดิน(path.join(ROOT, "apps"));
เดิน(path.join(ROOT, "packages"));

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
    console.error(`✗ โค้ดแอปอ่านช่องแม่แบบของลูกค้าเป้าหมาย (หรือค่าที่ได้จากช่องนั้น) ${ผิด.length} จุด — ข้อมูลเก่าเก็บไว้แต่ห้ามแสดง/ห้ามไหลต่อ:`);
    for (const f of ผิด) console.error(`  ${f.ไฟล์}:${f.บรรทัดที่}  [${f.ช่อง}]  ${f.ข้อความ.slice(0, 140)}`);
  }
  if (ค้าง.length) {
    console.error(`✗ ข้อยกเว้นใน scripts/no-lead-template-allow.json ที่ไม่เจอในโค้ดแล้ว ${ค้าง.length} รายการ — ลบออก:`);
    for (const a of ค้าง) console.error(`  ${a.file}  "${a.line}"`);
  }
  console.error("  แผงรายละเอียดของใบเก่าเท่านั้นที่ยกเว้นได้ (เขียนเหตุผลใน scripts/no-lead-template-allow.json)");
  process.exit(1);
}
console.log(`✓ ไม่มีโค้ดแอปอ่านช่องแม่แบบของลูกค้าเป้าหมาย (ข้อยกเว้นแผงใบเก่า ${ข้อยกเว้น.length} จุด)`);
