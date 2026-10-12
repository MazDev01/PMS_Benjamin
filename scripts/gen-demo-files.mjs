// สร้าง "ไฟล์ตัวอย่างจริง" ที่วางไว้ในเว็บ (apps/dealer/public/demo-files) — รันครั้งเดียว/เมื่อต้องแก้เนื้อหา
//
//   node scripts/gen-demo-files.mjs
//
// ที่มา (บอสสั่ง 28 ส.ค. 69): ไฟล์ชุดตัวอย่างในระบบมีแต่ชื่อ/ขนาด/วันที่ ไม่มีตัวไฟล์จริง
//   กดเปิดอ่านหรือดาวน์โหลดจึงไม่ได้อะไรเลย · แทนที่จะปั้นเนื้อหาปลอมให้ดูเหมือนเอกสารลูกค้าจริง
//   เราวาง "เอกสารตัวอย่างของระบบสาธิต" ไว้ในเว็บ 1 ชุด แล้วให้ไฟล์ที่ไม่มีไบต์จริงชี้มาที่ชุดนี้ตามนามสกุล
//   ทุกแผ่นมีข้อความกำกับชัดเจนว่าเป็นเอกสารตัวอย่าง ไม่ใช่เอกสารของลูกค้ารายใด
//
// ทำไมต้องสร้างด้วยสคริปต์: ไฟล์ pdf/xlsx/docx เป็นไบต์ที่พิมพ์มือไม่ได้ · เก็บสคริปต์ไว้เพื่อให้
//   แก้ข้อความแล้วสร้างใหม่ได้ และเพื่อให้รู้ว่าไฟล์ในโฟลเดอร์นั้นมาจากไหน (ไม่ใช่ไฟล์โผล่มาลอย ๆ)

import sharp from "sharp";
import { writeFileSync, mkdirSync } from "node:fs";
import { deflateRawSync } from "node:zlib";
import path from "node:path";

const OUT = path.join(process.cwd(), "apps/dealer/public/demo-files");
mkdirSync(OUT, { recursive: true });

const หัวเรื่อง = "เอกสารตัวอย่างของระบบสาธิต";
const บรรทัด = [
  "ไฟล์นี้เป็นเอกสารตัวอย่างที่ระบบเตรียมไว้ให้ทดลองเปิดอ่านและดาวน์โหลด",
  "ไม่ใช่เอกสารจริงของลูกค้ารายใด และไม่มีข้อมูลจริงอยู่ในไฟล์นี้",
  "",
  "เมื่อผู้ใช้อัปโหลดไฟล์ของตัวเองเข้าระบบ ระบบจะเก็บไฟล์จริงของผู้ใช้ไว้",
  "และปุ่มเปิดอ่าน/ดาวน์โหลดจะได้ไฟล์ของผู้ใช้ ไม่ใช่เอกสารตัวอย่างแผ่นนี้",
  "",
  "Benjamin PEB Steel — ระบบบริหารงานขายและดีลเลอร์",
];

const FONT = "Leelawadee UI, Tahoma, Segoe UI, sans-serif";
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** หน้ากระดาษ A4 ที่ 150dpi (1240×1754) เป็นภาพ — ใช้ทั้งทำ PDF และไฟล์รูปตัวอย่าง */
function หน้ากระดาษSVG(w = 1240, h = 1754) {
  const เนื้อ = บรรทัด
    .map((t, i) => (t ? `<text x="110" y="${430 + i * 62}" font-family="${FONT}" font-size="34" fill="#2D2D2D">${esc(t)}</text>` : ""))
    .join("");
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect width="${w}" height="${h}" fill="#ffffff"/>
    <rect x="0" y="0" width="${w}" height="150" fill="#003366"/>
    <text x="110" y="95" font-family="${FONT}" font-size="46" font-weight="bold" fill="#ffffff">BENJAMIN — ${esc(หัวเรื่อง)}</text>
    <text x="110" y="290" font-family="${FONT}" font-size="56" font-weight="bold" fill="#003366">${esc(หัวเรื่อง)}</text>
    <rect x="110" y="330" width="180" height="7" fill="#003366"/>
    ${เนื้อ}
    <rect x="110" y="${h - 190}" width="${w - 220}" height="90" fill="#f0f4fa"/>
    <text x="140" y="${h - 135}" font-family="${FONT}" font-size="28" fill="#003366">ตัวอย่างเท่านั้น — ไม่ใช่เอกสารของลูกค้าจริง</text>
  </svg>`);
}

/** PDF หนึ่งหน้าที่ฝังภาพ JPEG ของหน้ากระดาษไว้เต็มหน้า (A4 = 595×842 pt) */
function สร้างPDF(jpeg, w, h) {
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>",
    null, // 4 = ภาพ (stream)
    null, // 5 = คำสั่งวาด (stream)
  ];
  const วาด = Buffer.from("q\n595 0 0 842 0 0 cm\n/Im0 Do\nQ\n", "latin1");
  const chunks = [];
  const offsets = [];
  let pos = 0;
  const push = (buf) => { chunks.push(buf); pos += buf.length; };
  push(Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n", "latin1"));
  for (let i = 1; i <= 5; i++) {
    offsets[i] = pos;
    if (i === 4) {
      push(Buffer.from(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`, "latin1"));
      push(jpeg);
      push(Buffer.from("\nendstream\nendobj\n", "latin1"));
    } else if (i === 5) {
      push(Buffer.from(`5 0 obj\n<< /Length ${วาด.length} >>\nstream\n`, "latin1"));
      push(วาด);
      push(Buffer.from("\nendstream\nendobj\n", "latin1"));
    } else {
      push(Buffer.from(`${i} 0 obj\n${objs[i - 1]}\nendobj\n`, "latin1"));
    }
  }
  const xref = pos;
  let table = "xref\n0 6\n0000000000 65535 f \n";
  for (let i = 1; i <= 5; i++) table += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  push(Buffer.from(`${table}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`, "latin1"));
  return Buffer.concat(chunks);
}

// ── ตัวเขียนไฟล์ zip แบบย่อ (ใช้ทำ xlsx/docx ซึ่งเป็น zip ของไฟล์ XML) ──────────────
const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
  return (buf) => { let c = -1; for (const b of buf) c = t[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
})();

function zip(entries) {
  const local = [], central = [];
  let offset = 0;
  for (const [name, text] of entries) {
    const nameBuf = Buffer.from(name, "utf8");
    const data = Buffer.from(text, "utf8");
    const comp = deflateRawSync(data);
    const crc = CRC(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x800, 6);
    lh.writeUInt16LE(8, 8); lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    local.push(lh, nameBuf, comp);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x800, 8); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28); ch.writeUInt32LE(offset, 42);
    central.push(ch, nameBuf);
    offset += lh.length + nameBuf.length + comp.length;
  }
  const cd = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, cd, eocd]);
}

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

function docx() {
  const ย่อหน้า = (t, big = false) =>
    `<w:p><w:pPr>${big ? '<w:spacing w:after="240"/>' : ""}</w:pPr><w:r><w:rPr>${big ? '<w:b/><w:sz w:val="36"/>' : '<w:sz w:val="24"/>'}</w:rPr><w:t xml:space="preserve">${esc(t)}</w:t></w:r></w:p>`;
  return zip([
    ["[Content_Types].xml", `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`],
    ["_rels/.rels", `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`],
    ["word/document.xml", `${XML}<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${ย่อหน้า(หัวเรื่อง, true)}${บรรทัด.filter(Boolean).map(t => ย่อหน้า(t)).join("")}</w:body></w:document>`],
  ]);
}

function xlsx() {
  const แถว = [หัวเรื่อง, ...บรรทัด.filter(Boolean)]
    .map((t, i) => `<row r="${i + 1}"><c r="A${i + 1}" t="inlineStr"><is><t xml:space="preserve">${esc(t)}</t></is></c></row>`)
    .join("");
  return zip([
    ["[Content_Types].xml", `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`],
    ["_rels/.rels", `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml", `${XML}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="ตัวอย่าง" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ["xl/_rels/workbook.xml.rels", `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`],
    ["xl/worksheets/sheet1.xml", `${XML}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${แถว}</sheetData></worksheet>`],
  ]);
}

const W = 1240, H = 1754;
const หน้า = หน้ากระดาษSVG(W, H);
const jpeg = await sharp(หน้า).flatten({ background: "#ffffff" }).jpeg({ quality: 82 }).toBuffer();

writeFileSync(path.join(OUT, "sample-document.pdf"), สร้างPDF(jpeg, W, H));
writeFileSync(path.join(OUT, "sample-document.docx"), docx());
writeFileSync(path.join(OUT, "sample-sheet.xlsx"), xlsx());
await sharp(หน้ากระดาษSVG(1600, 1200)).jpeg({ quality: 84 }).toFile(path.join(OUT, "sample-photo.jpg"));
await sharp(หน้ากระดาษSVG(1600, 1200)).png().toFile(path.join(OUT, "sample-photo.png"));

console.log("สร้างไฟล์ตัวอย่างเสร็จแล้วที่", OUT);
