// ── ข้อความบนหน้าเว็บต้องเป็นภาษาไทย — คำอังกฤษที่คนทั่วไปอ่านไม่เข้าใจ = ตก (บอสสั่ง 28 ต.ค. 69 · "margin เฉลี่ย") ──
//
// อ่านโครงไฟล์ด้วยตัวแยกโค้ดของ TypeScript (ไม่ใช่เดาจากบรรทัด) แล้วดูเฉพาะข้อความที่ขึ้นจอ:
//   1) ข้อความระหว่างแท็ก JSX (<span>ข้อความ</span>)
//   2) ค่าคุณสมบัติที่เป็นข้อความบนจอ (label · title · placeholder · aria-label · alt · caption · unit · sub · empty · desc ฯลฯ)
//   3) สตริงที่มีภาษาไทยปนอยู่ (ข้อความแจ้ง/ป้ายที่ประกอบในโค้ด · หน้าพิมพ์) — ส่วน ${…} ไม่นับ
// คำที่ใช้กันทั่วไปและชื่อเฉพาะ: scripts/english-ui-allow.json ที่เดียว (บอสสั่งให้รายการยกเว้นอยู่ไฟล์เดียว)
// ไม่นับ: คอมเมนต์ · ชื่อตัวแปร/คลาส/คีย์ · ข้อความลงบันทึกของนักพัฒนา (console.* / logRepoRead) · คำค้นหาของช่องค้นหาหน้า (keywords · ไม่ขึ้นจอ)
//         ที่อยู่เว็บ/อีเมล/ชื่อไฟล์ · แท็ก/สไตล์/สคริปต์ของหน้าพิมพ์ · รูปแบบตัวอย่างเลข (08X-XXX-XXXX)
//         ชื่อรหัส/ค่าตั้งระบบที่มีขีดล่าง (lead_status_one_path · SUPABASE_SERVICE_ROLE_KEY) · ตัวเลือกหาชิ้นบนหน้า (querySelector/closest)
// ไฟล์ที่ตรวจ: .tsx ทุกไฟล์ + .ts ใน apps/packages ยกเว้น
//   ข้อมูลตัวอย่าง (lib/mock.ts · lib/data/**) — เป็นข้อมูล (ชื่อลูกค้า/บริษัทจากไฟล์จริง) ไม่ใช่คำบนหน้าจอ
//   ฝั่งเซิร์ฟเวอร์ (server/** · app/api/**) — ข้อความตอบเมื่อเรียกผิดทาง/ตั้งค่าเซิร์ฟเวอร์ไม่ครบ (ถึงผู้ดูแลระบบ ไม่ใช่หน้าจอปกติ)
// PMS_EN_CHECK_ROOT = โฟลเดอร์จำลอง (ข้อทดสอบของตัวตรวจ tests/tools/english-ui.test.mjs)
import { readFileSync, globSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(join(process.cwd(), "package.json"));   // typescript ของโปรเจกต์
const ts = require("typescript");

const ราก = process.env.PMS_EN_CHECK_ROOT ?? process.cwd();
const ที่ตัวตรวจ = dirname(fileURLToPath(import.meta.url));
const ยกเว้น = JSON.parse(readFileSync(join(ที่ตัวตรวจ, "english-ui-allow.json"), "utf8"));
const คำยกเว้น = new Set(ยกเว้น.คำ.map(w => w.toLowerCase()));
const วลียกเว้น = ยกเว้น.วลี.map(w => w.toLowerCase());

// คุณสมบัติ JSX ที่เป็นข้อความบนจอ
const ช่องข้อความ = new Set(["label", "title", "placeholder", "aria-label", "alt", "caption", "unit", "sub", "empty", "desc",
  "actionLabel", "หัวข้อ", "รายละเอียด", "ข้อความ", "ปุ่มตกลง", "ปุ่มยกเลิก", "ปุ่มกำลังทำ", "ป้ายช่อง", "กำลังทำ", "hint", "note", "subtitle", "footerNote"]);
const ไทย = /[฀-๿]/;
// คีย์ของอ็อบเจ็กต์ที่ไม่ขึ้นจอ (คำค้นหาของช่องค้นหาหน้า — ตั้งใจใส่อังกฤษให้พิมพ์ค้นได้)
const คีย์ไม่ขึ้นจอ = new Set(["keywords"]);

function คำอังกฤษ(ข้อความ) {
  // หน้าพิมพ์ประกอบ HTML ในสตริง — ตัดแท็ก · สไตล์ · สคริปต์ · รหัสอักขระพิเศษ ก่อนดูคำ (เหลือแต่ข้อความที่ขึ้นกระดาษ)
  let s = ` ${ข้อความ} `.replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]*>/g, " ").replace(/&[a-z]+;|&#\d+;/gi, " ")
    .replace(/\{[^{}]*\}/g, " ").toLowerCase();
  s = s.replace(/\b[x\d]+(?:-[x\d]+)+\b/g, " ");   // รูปแบบตัวอย่างเลข (08X-XXX-XXXX · 0-1055-XXXXX-XX-X)
  s = s.replace(/[a-z0-9]*_[a-z0-9_]*/g, " ");   // ชื่อรหัส/ค่าตั้งระบบ (มีขีดล่าง)
  for (const ว of วลียกเว้น) s = s.split(ว).join(" ");
  s = s.replace(/https?:\/\/\S+|[\w.+-]+@[^\s]+|(?:www\.)?[\w-]+\.(?:com|co\.th|net|org)\b|[^\s]*\.(?:pdf|xlsx|csv|png|jpe?g|docx?|dwg)\b/g, " ");
  return (s.match(/[a-z][a-z'’-]*[a-z]|[a-z]/g) ?? []).filter(w => w.length >= 2 && !คำยกเว้น.has(w) && !คำยกเว้น.has(w.replace(/s$/, "")));
}

function อยู่ในบันทึกนักพัฒนา(n) {
  for (let p = n.parent; p; p = p.parent) {
    if (ts.isCallExpression(p)) {
      const e = p.expression.getText();
      if (/^console\.\w+$|^logRepoRead$|\.(querySelector|querySelectorAll|closest|matches)$/.test(e)) return true;
    }
    if (ts.isBlock(p) || ts.isSourceFile(p)) return false;
  }
  return false;
}

// สตริงอังกฤษล้วนที่ขึ้นจอตรง ๆ — {"ข้อความ"} ในแท็ก หรือในช่องข้อความ · ผ่านเงื่อนไข (ก ? "x" : "y" · ก && "x") ได้
function ขึ้นจอตรง(n) {
  let p = n.parent;
  while (p && (ts.isConditionalExpression(p) || ts.isParenthesizedExpression(p)
    || (ts.isBinaryExpression(p) && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(p.operatorToken.kind)))) {
    if (ts.isConditionalExpression(p) && p.condition === n) return false;
    n = p; p = p.parent;
  }
  if (!p || !ts.isJsxExpression(p)) return false;
  const แท็ก = p.parent;
  return (ts.isJsxElement(แท็ก) && !/^(style|script)$/.test(แท็ก.openingElement.tagName.getText())) || ts.isJsxFragment(แท็ก) || (ts.isJsxAttribute(แท็ก) && ช่องข้อความ.has(แท็ก.name.getText()));
}

const ไม่ตรวจ = f => f.endsWith(".d.ts") || (f.endsWith(".ts") && /\/lib\/mock\.ts$|\/lib\/data\/|\/server\/|\/app\/api\//.test(f));
const files = globSync("{apps,packages}/**/*.{ts,tsx}", { cwd: ราก, exclude: p => p.includes("node_modules") || p.includes(".next") })
  .map(f => f.replace(/\\/g, "/")).filter(f => !ไม่ตรวจ(f));
const พบ = [];
for (const f of files) {
  const src = readFileSync(join(ราก, f), "utf8");
  const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true, f.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const บรรทัด = n => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const ตรวจ = (n, ข้อความ, ที่มา) => {
    const ws = คำอังกฤษ(ข้อความ);
    if (ws.length) พบ.push({ ที่: `${f}:${บรรทัด(n)}`, คำ: [...new Set(ws)], ข้อความ: ข้อความ.trim().replace(/\s+/g, " ").slice(0, 90), ที่มา });
  };
  const ข้อความของ = n => ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) ? n.text
    : ts.isTemplateExpression(n) ? [n.head.text, ...n.templateSpans.map(s => s.literal.text)].join(" ") : null;
  const เยี่ยม = n => {
    if (ts.isJsxText(n)) { if (n.text.trim()) ตรวจ(n, n.text, "ข้อความในแท็ก"); }
    else if (ts.isJsxAttribute(n)) {
      const ชื่อ = n.name.getText(sf);
      const v = n.initializer;
      if (ช่องข้อความ.has(ชื่อ) && v) {
        const ค่า = ts.isStringLiteral(v) ? v.text : ts.isJsxExpression(v) && v.expression ? ข้อความของ(v.expression) : null;
        if (ค่า != null) { ตรวจ(n, ค่า, ชื่อ); return; }
      }
    } else if (ts.isPropertyAssignment(n) && คีย์ไม่ขึ้นจอ.has(n.name.getText(sf))) {
      return;
    } else {
      const t = ข้อความของ(n);
      if (t != null) {
        // สตริงที่มีไทยปน = ข้อความบนจอ · ข้ามคีย์ของอ็อบเจ็กต์ · คำสั่ง import · ข้อความลงบันทึกของนักพัฒนา
        const แม่ = n.parent;
        const เป็นคีย์ = แม่ && ts.isPropertyAssignment(แม่) && แม่.name === n;
        if (ไทย.test(t) && !เป็นคีย์ && !(แม่ && ts.isImportDeclaration(แม่)) && !อยู่ในบันทึกนักพัฒนา(n)) ตรวจ(n, t, "สตริงที่มีภาษาไทย");
        else if (ขึ้นจอตรง(n)) ตรวจ(n, t, "สตริงในแท็ก");
        return;
      }
    }
    ts.forEachChild(n, เยี่ยม);
  };
  เยี่ยม(sf);
}
for (const x of พบ) console.log(`  ${x.ที่} — ${x.คำ.join(", ")} · "${x.ข้อความ}"`);
console.log(`ข้อความบนหน้าเว็บที่มีคำอังกฤษ (ไม่อยู่ในรายการยกเว้น scripts/english-ui-allow.json): ${พบ.length}`);
if (พบ.length > 0) process.exit(1);
