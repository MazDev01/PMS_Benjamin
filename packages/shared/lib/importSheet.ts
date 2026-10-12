/** อ่านไฟล์ตารางที่ดีลเลอร์ส่งออกมาจากระบบเก่า แล้วคืนเป็นตาราง 2 มิติ (แถว × ช่อง)
 *
 *  รองรับ: .csv · .txt (คั่นด้วย , ; หรือ Tab) · .tsv · .xlsx (Excel ของจริง)
 *          · .xls / .htm(l) ที่แท้จริงเป็นตาราง HTML — Excel รุ่นเก่าและระบบเก่าหลายเจ้าส่งออกแบบนี้
 *          (ตัวส่งออกของระบบเราเองก็เป็นแบบนี้ ดูที่ ExportMenu.exportExcel)
 *
 *  ⚠️ ตั้งใจไม่พึ่งไลบรารีอ่าน Excel จากภายนอก:
 *     - แพ็กเกจ xlsx บน npm ค้างอยู่ที่รุ่นที่มีช่องโหว่ (รุ่นใหม่ไม่ได้อยู่บน npm แล้ว)
 *     - exceljs ต้องใช้ของฝั่ง Node (stream/buffer) ซึ่งพังบ่อยเวลาเอาไปรันในเบราว์เซอร์ของ Next
 *     ตัวคลายไฟล์ zip ใช้ DecompressionStream ที่มีมากับเบราว์เซอร์อยู่แล้ว
 */

export type ตารางที่อ่านได้ = string[][];

/* ── CSV / TSV ─────────────────────────────────────────────────────────
   อ่านแบบเข้าใจเครื่องหมายคำพูด — ระบบเก่ามักส่งออกชื่อบริษัท/ที่อยู่ที่มีตัวคั่นอยู่ข้างใน
   ถ้าตัดด้วยตัวคั่นดื้อ ๆ ชื่อจะขาดกลางและข้อมูลเลื่อนคอลัมน์ทั้งแถวโดยไม่มีคำเตือน */
export function แยกตารางจากข้อความ(text: string, ตัวคั่น?: string): ตารางที่อ่านได้ {
  const เนื้อ = text.replace(/^﻿/, "");
  const คั่น = ตัวคั่น ?? เดาตัวคั่น(เนื้อ);
  const แถว: string[][] = [];
  let ช่อง = ""; let บรรทัด: string[] = []; let ในคำพูด = false;
  for (let i = 0; i < เนื้อ.length; i++) {
    const c = เนื้อ[i];
    if (ในคำพูด) {
      if (c === '"') { if (เนื้อ[i + 1] === '"') { ช่อง += '"'; i++; } else ในคำพูด = false; }
      else ช่อง += c;
    } else if (c === '"') ในคำพูด = true;
    else if (c === คั่น) { บรรทัด.push(ช่อง); ช่อง = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && เนื้อ[i + 1] === "\n") i++;
      บรรทัด.push(ช่อง); ช่อง = ""; แถว.push(บรรทัด); บรรทัด = [];
    } else ช่อง += c;
  }
  บรรทัด.push(ช่อง); แถว.push(บรรทัด);
  return เก็บกวาด(แถว);
}

/** เดาตัวคั่นจากบรรทัดแรก — ไทยบางเครื่องตั้ง Excel ให้ใช้ ; แทน , และบางระบบส่งออกเป็น Tab */
function เดาตัวคั่น(text: string): string {
  const บรรทัดแรก = text.split(/\r?\n/).find(l => l.trim()) ?? "";
  const นับ = (ch: string) => (บรรทัดแรก.match(new RegExp(`\\${ch}`, "g")) ?? []).length;
  const ผู้ชนะ = [[",", นับ(",")], [";", นับ(";")], ["\t", นับ("\t")]] as [string, number][];
  ผู้ชนะ.sort((a, b) => b[1] - a[1]);
  return ผู้ชนะ[0][1] > 0 ? ผู้ชนะ[0][0] : ",";
}

/* ── ตาราง HTML (.xls รุ่นเก่า / .html) ────────────────────────────── */
export function แยกตารางจากHtml(html: string): ตารางที่อ่านได้ {
  if (typeof DOMParser === "undefined") return [];
  const doc = new DOMParser().parseFromString(html, "text/html");
  const table = doc.querySelector("table");
  if (!table) return [];
  const แถว = Array.from(table.querySelectorAll("tr")).map(tr =>
    Array.from(tr.querySelectorAll("th,td")).map(td => (td.textContent ?? "").replace(/\s+/g, " ").trim()));
  return เก็บกวาด(แถว);
}

/* ── .xlsx ของจริง ────────────────────────────────────────────────────
   xlsx = ไฟล์ zip ที่ข้างในเป็น XML · เอาเฉพาะสองไฟล์ที่ต้องใช้:
   - xl/sharedStrings.xml = คลังข้อความ (Excel เก็บข้อความไว้ที่เดียวแล้วอ้างเป็นเลขลำดับ)
   - แผ่นแรก = ค่าของแต่ละช่อง (อ้างตำแหน่งเป็น A1/B2 — ต้องกางกลับเป็นคอลัมน์เอง ไม่งั้นช่องว่างจะหาย) */
export async function แยกตารางจากXlsx(buf: ArrayBuffer): Promise<ตารางที่อ่านได้> {
  const ไฟล์ = await คลายZip(buf);
  const หาไฟล์ = (ชื่อ: string) => ไฟล์.get(ชื่อ);
  const คลัง = แกะคลังข้อความ(หาไฟล์("xl/sharedStrings.xml") ?? "");
  const ชื่อแผ่น = [...ไฟล์.keys()].filter(k => /^xl\/worksheets\/sheet\d+\.xml$/.test(k))
    .sort((a, b) => เลขแผ่น(a) - เลขแผ่น(b))[0];
  if (!ชื่อแผ่น) return [];
  return เก็บกวาด(แกะแผ่นงาน(ไฟล์.get(ชื่อแผ่น) ?? "", คลัง));
}
const เลขแผ่น = (s: string) => Number(s.match(/sheet(\d+)\.xml$/)?.[1] ?? 0);

/** อ่าน "ทุกแผ่นงาน" พร้อมชื่อแผ่นที่คนตั้งไว้ — ใช้กับไฟล์สำรองการตั้งค่าที่มีหลายแผ่นในเล่มเดียว
 *  ชื่อแผ่นอยู่ใน xl/workbook.xml ส่วนไฟล์จริงของแต่ละแผ่นต้องตามผ่าน rels
 *  (ลำดับ sheet1.xml, sheet2.xml ไม่ได้เรียงตามแท็บเสมอไป — Excel สลับได้เวลาผู้ใช้ลากแท็บ) */
export async function แยกสมุดงานจากXlsx(buf: ArrayBuffer): Promise<Map<string, ตารางที่อ่านได้>> {
  const ไฟล์ = await คลายZip(buf);
  const คลัง = แกะคลังข้อความ(ไฟล์.get("xl/sharedStrings.xml") ?? "");
  const rels = new Map<string, string>();
  for (const m of (ไฟล์.get("xl/_rels/workbook.xml.rels") ?? "").matchAll(/<Relationship\b[^>]*>/g)) {
    const id = m[0].match(/Id="([^"]+)"/)?.[1];
    const target = m[0].match(/Target="([^"]+)"/)?.[1];
    if (id && target) rels.set(id, `xl/${target.replace(/^\.?\//, "")}`);
  }
  const ผล = new Map<string, ตารางที่อ่านได้>();
  const รายชื่อ = [...(ไฟล์.get("xl/workbook.xml") ?? "").matchAll(/<sheet\b[^>]*>/g)];
  รายชื่อ.forEach((m, i) => {
    const ชื่อ = ถอดรหัสXml(m[0].match(/name="([^"]*)"/)?.[1] ?? `แผ่น${i + 1}`);
    const rid = m[0].match(/r:id="([^"]+)"/)?.[1];
    const พาธ = (rid && rels.get(rid)) || `xl/worksheets/sheet${i + 1}.xml`;
    const xml = ไฟล์.get(พาธ);
    if (xml != null) ผล.set(ชื่อ, เก็บกวาด(แกะแผ่นงาน(xml, คลัง)));
  });
  // ไฟล์จากบางโปรแกรมไม่มี workbook.xml ให้อ่าน — ถอยไปไล่ตามชื่อไฟล์แผ่นงานแทน
  if (!ผล.size) {
    [...ไฟล์.keys()].filter(k => /^xl\/worksheets\/sheet\d+\.xml$/.test(k))
      .sort((a, b) => เลขแผ่น(a) - เลขแผ่น(b))
      .forEach((k, i) => ผล.set(`แผ่น${i + 1}`, เก็บกวาด(แกะแผ่นงาน(ไฟล์.get(k) ?? "", คลัง))));
  }
  return ผล;
}

function แกะคลังข้อความ(xml: string): string[] {
  // แต่ละ <si> คือข้อความหนึ่งชิ้น ข้างในอาจซอยเป็นหลาย <t> (เวลาในช่องมีหลายรูปแบบตัวอักษร) — ต้องต่อกันให้ครบ
  return (xml.match(/<si>[\s\S]*?<\/si>/g) ?? []).map(si =>
    (si.match(/<t[^>]*>([\s\S]*?)<\/t>/g) ?? [])
      .map(t => ถอดรหัสXml(t.replace(/<[^>]+>/g, ""))).join(""));
}

function แกะแผ่นงาน(xml: string, คลัง: string[]): string[][] {
  const แถว: string[][] = [];
  for (const r of xml.match(/<row[^>]*>[\s\S]*?<\/row>/g) ?? []) {
    const ช่องทั้งแถว: string[] = [];
    for (const c of r.match(/<c[^>]*\/>|<c[^>]*>[\s\S]*?<\/c>/g) ?? []) {
      const ตำแหน่ง = c.match(/r="([A-Z]+)\d+"/)?.[1];
      const ดัชนี = ตำแหน่ง ? เลขคอลัมน์(ตำแหน่ง) : ช่องทั้งแถว.length;
      while (ช่องทั้งแถว.length < ดัชนี) ช่องทั้งแถว.push("");   // ช่องที่ Excel ข้ามไป = ช่องว่าง ต้องเติมไว้ ไม่งั้นคอลัมน์เลื่อน
      ช่องทั้งแถว[ดัชนี] = อ่านค่าช่อง(c, คลัง);
    }
    แถว.push(ช่องทั้งแถว);
  }
  return แถว;
}

function อ่านค่าช่อง(c: string, คลัง: string[]): string {
  const ชนิด = c.match(/\st="([^"]+)"/)?.[1];
  if (ชนิด === "inlineStr") {
    return (c.match(/<t[^>]*>([\s\S]*?)<\/t>/g) ?? []).map(t => ถอดรหัสXml(t.replace(/<[^>]+>/g, ""))).join("");
  }
  const v = c.match(/<v[^>]*>([\s\S]*?)<\/v>/)?.[1];
  if (v == null) return "";
  if (ชนิด === "s") return คลัง[Number(v)] ?? "";      // อ้างคลังข้อความ
  if (ชนิด === "str" || ชนิด === "e") return ถอดรหัสXml(v);
  return ถอดรหัสXml(v);                                 // ตัวเลข/วันที่ — คืนเป็นข้อความตามที่เก็บไว้
}

/** A→0, B→1, … Z→25, AA→26 */
export function เลขคอลัมน์(อักษร: string): number {
  let n = 0;
  for (const ch of อักษร) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function ถอดรหัสXml(s: string): string {
  return s.replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

/* ── คลาย zip ─────────────────────────────────────────────────────────
   อ่านจากสารบัญท้ายไฟล์ (central directory) ไม่ใช่ไล่หัวไฟล์ทีละก้อน
   เพราะหัวไฟล์ของบางโปรแกรมไม่ได้บอกขนาดไว้ (ตั้งธง bit 3 แล้วไปเขียนท้ายก้อนแทน) */
async function คลายZip(buf: ArrayBuffer): Promise<Map<string, string>> {
  const ข้อมูล = new Uint8Array(buf);
  const dv = new DataView(buf);
  const ท้าย = หาสารบัญ(dv, ข้อมูล.length);
  if (ท้าย < 0) throw new Error("ไฟล์ Excel เสียหาย หรือไม่ใช่ไฟล์ .xlsx");
  let ตำแหน่ง = dv.getUint32(ท้าย + 16, true);
  const จำนวน = dv.getUint16(ท้าย + 10, true);
  const ผล = new Map<string, string>();
  const ถอดข้อความ = new TextDecoder("utf-8");
  for (let i = 0; i < จำนวน; i++) {
    if (dv.getUint32(ตำแหน่ง, true) !== 0x02014b50) break;
    const วิธีบีบ = dv.getUint16(ตำแหน่ง + 10, true);
    const ขนาดบีบ = dv.getUint32(ตำแหน่ง + 20, true);
    const ยาวชื่อ = dv.getUint16(ตำแหน่ง + 28, true);
    const ยาวเสริม = dv.getUint16(ตำแหน่ง + 30, true);
    const ยาวหมายเหตุ = dv.getUint16(ตำแหน่ง + 32, true);
    const หัวไฟล์ = dv.getUint32(ตำแหน่ง + 42, true);
    const ชื่อ = ถอดข้อความ.decode(ข้อมูล.subarray(ตำแหน่ง + 46, ตำแหน่ง + 46 + ยาวชื่อ));
    // ที่ตัวไฟล์จริง ความยาวช่องเสริมอาจไม่เท่ากับในสารบัญ — ต้องอ่านจากหัวไฟล์นั้นเอง
    const ยาวชื่อจริง = dv.getUint16(หัวไฟล์ + 26, true);
    const ยาวเสริมจริง = dv.getUint16(หัวไฟล์ + 28, true);
    const เริ่ม = หัวไฟล์ + 30 + ยาวชื่อจริง + ยาวเสริมจริง;
    if (/^(xl\/(workbook\.xml|sharedStrings\.xml|worksheets\/sheet\d+\.xml)|xl\/_rels\/workbook\.xml\.rels)$/.test(ชื่อ)) {
      const ก้อน = ข้อมูล.subarray(เริ่ม, เริ่ม + ขนาดบีบ);
      ผล.set(ชื่อ, ถอดข้อความ.decode(วิธีบีบ === 0 ? ก้อน : await คลายDeflate(ก้อน)));
    }
    ตำแหน่ง += 46 + ยาวชื่อ + ยาวเสริม + ยาวหมายเหตุ;
  }
  return ผล;
}

function หาสารบัญ(dv: DataView, ขนาด: number): number {
  // ท้ายไฟล์มีหมายเหตุต่อท้ายได้สูงสุด 64KB — ไล่ถอยหลังหาป้าย EOCD
  for (let i = ขนาด - 22; i >= Math.max(0, ขนาด - 66_000); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) return i;
  }
  return -1;
}

async function คลายDeflate(ก้อน: Uint8Array): Promise<Uint8Array> {
  const DS = (globalThis as { DecompressionStream?: new (f: string) => TransformStream }).DecompressionStream;
  if (!DS) throw new Error("เบราว์เซอร์นี้อ่านไฟล์ .xlsx ไม่ได้ — กรุณาบันทึกเป็น .csv แล้วลองใหม่");
  const stream = new Blob([ก้อน as unknown as BlobPart]).stream().pipeThrough(new DS("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/* ── ทางเข้าหลัก ───────────────────────────────────────────────────── */

/** นามสกุลไฟล์ที่รับได้ — ใช้กับ input accept และข้อความบอกผู้ใช้ให้ตรงกัน */
export const นามสกุลที่รับได้ = [".csv", ".xlsx", ".xls", ".tsv", ".txt", ".html", ".htm"] as const;

/** อ่านไฟล์เป็น "สมุดงาน" (หลายแผ่น) — ไฟล์ที่ไม่ใช่ .xlsx จะได้แผ่นเดียวชื่อว่างเปล่า
 *  ใช้กับหน้าสำรอง/กู้คืนการตั้งค่า ที่ไฟล์เดียวมีหลายเรื่องอยู่คนละแท็บ */
export async function อ่านสมุดงานจากไฟล์(file: File): Promise<Map<string, ตารางที่อ่านได้>> {
  const ไบต์ = await file.arrayBuffer();
  const หัวไฟล์ = new Uint8Array(ไบต์.slice(0, 4));
  const เป็นZip = หัวไฟล์[0] === 0x50 && หัวไฟล์[1] === 0x4b && (หัวไฟล์[2] === 3 || หัวไฟล์[2] === 5 || หัวไฟล์[2] === 7);
  if (file.name.toLowerCase().endsWith(".xlsx") || เป็นZip) return แยกสมุดงานจากXlsx(ไบต์);
  return new Map([["", await อ่านตารางจากไฟล์(file)]]);
}

export async function อ่านตารางจากไฟล์(file: File): Promise<ตารางที่อ่านได้> {
  const ชื่อ = file.name.toLowerCase();
  const ไบต์ = await file.arrayBuffer();
  // ดูจาก "เนื้อไฟล์" ก่อนนามสกุล — ไฟล์ Excel ขึ้นต้นด้วย PK เสมอ (xlsx = ซอง zip)
  // เคยพลาดเพราะเชื่อนามสกุลอย่างเดียว: ไฟล์ที่ถูกบันทึกมาโดยไม่มีนามสกุล (หรือถูกเปลี่ยนชื่อ)
  // จะตกไปเส้นทางอ่านเป็นข้อความ แล้วได้ตารางว่างพร้อมข้อความ "ไม่พบข้อมูลในไฟล์"
  // ซึ่งชี้ไปผิดทางหมด (ผู้ใช้เข้าใจว่าไฟล์ตัวเองผิด ทั้งที่ระบบอ่านผิดวิธี)
  const หัวไฟล์ = new Uint8Array(ไบต์.slice(0, 4));
  const เป็นZip = หัวไฟล์[0] === 0x50 && หัวไฟล์[1] === 0x4b && (หัวไฟล์[2] === 3 || หัวไฟล์[2] === 5 || หัวไฟล์[2] === 7);
  if (ชื่อ.endsWith(".xlsx") || เป็นZip) return แยกตารางจากXlsx(ไบต์);
  const text = new TextDecoder("utf-8").decode(ไบต์).replace(/^﻿/, "");
  // .xls/.html ของหลายระบบ (รวมถึงตัวส่งออกของเราเอง) แท้จริงคือตาราง HTML — ดูจากเนื้อไฟล์ ไม่ใช่นามสกุล
  if (/^\s*(<!doctype html|<html|<table)/i.test(text)) {
    const จากHtml = แยกตารางจากHtml(text);
    if (จากHtml.length) return จากHtml;
  }
  if (ชื่อ.endsWith(".xls")) {
    // .xls รุ่นเก่าของจริง (BIFF) เป็นไฟล์ไบนารี อ่านตรง ๆ ไม่ได้ — บอกทางออกไปเลย ดีกว่าให้เห็นข้อมูลเพี้ยน
    if (/^\xD0\xCF\x11\xE0/.test(text)) throw new Error("ไฟล์ .xls รุ่นเก่าอ่านไม่ได้ — เปิดใน Excel แล้ว “บันทึกเป็น” .xlsx หรือ .csv แล้วลองใหม่");
  }
  return แยกตารางจากข้อความ(text);
}

/** ตัดช่องว่างหัวท้าย และทิ้งแถวที่ว่างทั้งแถว (Excel มักแถมแถวว่างท้ายไฟล์) */
function เก็บกวาด(แถว: string[][]): ตารางที่อ่านได้ {
  return แถว.map(r => r.map(v => (v ?? "").trim())).filter(r => r.some(v => v !== ""));
}

/** จับคู่คอลัมน์ตามชื่อหัวตาราง แทนการนับตำแหน่ง
 *  ระบบเก่าแต่ละเจ้าส่งออกลำดับคอลัมน์ไม่เหมือนกัน และบางเจ้าเป็นภาษาอังกฤษ
 *  ถ้าอ่านตามตำแหน่งอย่างเดียว ข้อมูลจะสลับช่องโดยไม่มีคำเตือน (เบอร์โทรไปอยู่ช่องอีเมล ฯลฯ)
 *  ไม่มีหัวตารางที่รู้จักเลย → ถอยไปอ่านตามลำดับคีย์ที่ส่งเข้ามา */
export function จับคู่ตามหัวตาราง<K extends string>(
  rows: ตารางที่อ่านได้, ชื่อคอลัมน์: Record<K, string[]>,
): Record<K, string>[] {
  if (!rows.length) return [];
  const คีย์ = Object.keys(ชื่อคอลัมน์) as K[];
  const หัว = rows[0].map(h => h.toLowerCase().trim());
  const มีหัว = คีย์.some(k => ชื่อคอลัมน์[k].some(n => หัว.includes(n.toLowerCase())));
  const ที่อยู่ = {} as Record<K, number>;
  คีย์.forEach((k, i) => {
    ที่อยู่[k] = มีหัว ? หัว.findIndex(h => ชื่อคอลัมน์[k].some(n => n.toLowerCase() === h)) : i;
  });
  return rows.slice(มีหัว ? 1 : 0).map(c => {
    const out = {} as Record<K, string>;
    for (const k of คีย์) { const i = ที่อยู่[k]; out[k] = i >= 0 ? (c[i] ?? "") : ""; }
    return out;
  });
}

/** วันที่จากไฟล์ระบบเก่า → รูปแบบเดียวที่ระบบใช้ (YYYY-MM-DD) · อ่านไม่ออก = คืนค่าว่าง ไม่เดาให้
 *  รองรับ 05/10/2025 · 5/10/2568 (พ.ศ.) · 2025-10-05
 *  ⚠️ ปี พ.ศ. ต้องลบ 543 — ไม่งั้นได้ลูกค้าที่ "เข้าร่วมปี 2568 (ค.ศ.)" คือในอีกห้าร้อยปีข้างหน้า
 *     ซึ่งหลุดทุกตัวกรองช่วงเวลาเงียบ ๆ โดยไม่มีข้อความผิดพลาดให้เห็น */
export function แปลงวันที่นำเข้า(v: string): string {
  const t = (v ?? "").trim();
  if (!t) return "";
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  const ทับ = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  let ปี = 0, เดือน = 0, วัน = 0;
  if (iso) { ปี = +iso[1]; เดือน = +iso[2]; วัน = +iso[3]; }
  else if (ทับ) { วัน = +ทับ[1]; เดือน = +ทับ[2]; ปี = +ทับ[3]; }
  else return "";
  if (ปี > 2400) ปี -= 543;
  if (เดือน < 1 || เดือน > 12 || วัน < 1 || วัน > 31) return "";
  return `${ปี}-${String(เดือน).padStart(2, "0")}-${String(วัน).padStart(2, "0")}`;
}
