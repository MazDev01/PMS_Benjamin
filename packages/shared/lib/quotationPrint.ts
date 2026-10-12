// ── ใบเสนอราคา: เทมเพลตพิมพ์ + การตั้งค่าเอกสาร (แหล่งเดียว) ──────────────────
// ใช้ร่วมกันทั้งหน้า /quotations และใบเสนอราคา inline ในหน้า Lead (LeadQuotationsPanel)
// เพื่อให้เอกสารที่พิมพ์ออกมา "เหมือนกัน 100%" ทุกจุด — VAT / ตราประทับ / ลายเซ็น / หัวกระดาษ
import { DEFAULT_ISSUER, ISSUER_KEY, loadHQPolicy, fmtISOToThai, type IssuerProfile, type QuotationMock } from "./mock";

// การตั้งค่าเอกสาร (จาก Settings → ตั้งค่าใบเสนอราคา) — คนละคีย์กับโปรไฟล์บริษัท
// termsAndConditions / validityDays มาจากหน้าตั้งค่าดีลเลอร์ (คีย์ dealer_document_settings เดียวกัน)
// เดิมไม่ได้ประกาศไว้ → เอกสารพิมพ์เงื่อนไขที่เขียนตายในโค้ด ดีลเลอร์แก้ที่หน้าตั้งค่าไปก็ไม่มีผล
import { คิดภาษีใบเสนอราคา } from "./quoteTax";

export type DocProfile = { stamp: string; signature: string; vatPercent: number; quotePrefix: string; runningNumber: number; termsAndConditions?: string; validityDays?: number };
// quotePrefix เป็นแค่ป้ายนำหน้า — รหัสสาขา+ปี+เลขรันต่อท้ายเสมอที่ฝั่งสร้างใบ (ดู DEFAULT_QUOTE_NUMBERING)
export const DEFAULT_DOC: DocProfile = { stamp: "", signature: "", vatPercent: 7, quotePrefix: "Q-", runningNumber: 1001, termsAndConditions: "", validityDays: 30 };
export const DOC_KEY = "dealer_document_settings";

export type PrintCustomer = { company?: string; name?: string; phone?: string; province?: string; email?: string };

// อ่านโปรไฟล์ผู้ออก (บริษัทดีลเลอร์) จาก localStorage — fallback = DEFAULT_ISSUER
export function loadIssuer(): IssuerProfile {
  if (typeof window === "undefined") return { ...DEFAULT_ISSUER };
  try { const s = localStorage.getItem(ISSUER_KEY); if (s) return { ...DEFAULT_ISSUER, ...JSON.parse(s) }; } catch {}
  return { ...DEFAULT_ISSUER };
}

// อ่านการตั้งค่าเอกสาร (ตรา/ลายเซ็น/prefix/เลขรัน) — fallback = DEFAULT_DOC
// VAT บังคับมาจากนโยบาย HQ เสมอ (HQ คุมอัตราภาษีทั้งเครือ · ดีลเลอร์แก้ไม่ได้)
// vatPercent: ส่งมาจากหน้าจอ (useHQPolicy) — เป็นค่าจริงที่ HQ ตั้งไว้
// ถ้าไม่ส่งมา จะ fallback อ่าน localStorage ซึ่งถูกเฉพาะโหมด local เท่านั้น
// (โหมด supabase นโยบายอยู่ใน DB → ต้องส่งค่ามาเสมอ ไม่งั้นได้ค่า default = คิด VAT ผิด)
export function loadDoc(vatPercent?: number): DocProfile {
  if (typeof window === "undefined") return { ...DEFAULT_DOC };
  let doc = { ...DEFAULT_DOC };
  try { const s = localStorage.getItem(DOC_KEY); if (s) doc = { ...DEFAULT_DOC, ...JSON.parse(s) }; } catch {}
  if (typeof vatPercent === "number" && vatPercent >= 0) doc.vatPercent = vatPercent;
  else try { const vat = loadHQPolicy().vat; if (typeof vat === "number" && vat >= 0) doc.vatPercent = vat; } catch {}
  return doc;
}

function esc(s: unknown) { return String(s ?? "").replace(/[&<>"]/g, c => (({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" } as Record<string, string>)[c])); }
function fmtDate(d: string) { if (!d || d === "—") return "—"; const [y, m, day] = d.split("-"); const mo = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."]; return `${parseInt(day)} ${mo[parseInt(m) - 1]} ${parseInt(y) + 543}`; }

// สร้าง HTML ใบเสนอราคา A4 (เต็มรูปแบบ — หัวกระดาษ/คู่สัญญา/ตาราง/สรุป VAT/เงื่อนไข/ลายเซ็น+ตรา)
export function buildQuotationHTML(q: QuotationMock, issuer: IssuerProfile, cust?: PrintCustomer, doc: DocProfile = DEFAULT_DOC) {
  // ── เงื่อนไข ────────────────────────────────────────────────────────────────
  // ยึดข้อมูลจริงเท่านั้น:
  //  · วันยืนยันราคา = "วันหมดอายุ" ของใบนั้น (ถ้าไม่มี = วันที่ออก + อายุใบจากตั้งค่า)
  //    เดิมเขียนตายว่า "30 วัน" → ดีลเลอร์ตั้งอายุใบเป็น 45 เอกสารก็ยังพิมพ์ 30 = เอกสารโกหก
  //  · บรรทัด VAT ตัดออก — ตารางสรุปด้านบนแยก "ก่อน VAT / ภาษี / รวมสุทธิ" ให้เห็นตัวเลขจริงแล้ว
  //  · ที่เหลือ = เงื่อนไขที่ดีลเลอร์พิมพ์เองในหน้าตั้งค่า (ไม่กรอก = ไม่ขึ้นอะไร ไม่ยัดข้อความให้)
  const validUntil = (() => {
    if (q.expiry) return q.expiry;
    if (!q.date) return "";
    const d = new Date(q.date);
    if (isNaN(d.getTime())) return "";
    d.setDate(d.getDate() + (doc.validityDays ?? 30));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  const termLines: string[] = [];
  if (validUntil) termLines.push(`ราคานี้ยืนยันถึงวันที่ ${fmtISOToThai(validUntil)}`);
  (doc.termsAndConditions ?? "").split(/\r?\n/).map(t => t.trim()).filter(Boolean).forEach(t => termLines.push(t));
  const termsHTML = termLines.length
    ? `<div class="terms"><div class="h">เงื่อนไข</div>${termLines.map(t => `• ${esc(t)}`).join("<br/>")}</div>`
    : "";
  const n = (v: number) => Number(v || 0).toLocaleString("th-TH");
  const subtotal = q.totalValue;
  // ── ยอดภาษีบนเอกสาร — ใช้ "สแนปช็อตที่ตรึงไว้กับใบ" เสมอ (บอสสั่ง 28 ส.ค. 69) ──
  //   ใบเก่าที่ยังไม่มีค่าเหล่านี้ ค่อยตกไปใช้อัตราที่ส่งมาจากหน้าจอ (พฤติกรรมเดิม)
  //   สูตรอยู่ที่ lib/quoteTax.ts ที่เดียว — ตัวเลขบนกระดาษจึงตรงกับที่เห็นในฟอร์มเป๊ะ
  const ภาษี = คิดภาษีใบเสนอราคา(subtotal, {
    vatPercent: typeof q.vatPercent === "number" ? q.vatPercent : (typeof doc.vatPercent === "number" ? doc.vatPercent : 7),
    whtPercent: q.whtRate,
  });
  const vatPct = ภาษี.vatRate;
  const vat = ภาษี.vatAmount;
  const grand = ภาษี.totalAmount;
  // ตารางรายการ — ใช้ lineItems จริงถ้ามี · ใบเก่าที่ไม่มี → แถวเดียว (ทั้งโปรเจกต์)
  const itemRows = (q.lineItems && q.lineItems.length)
    ? q.lineItems.map((it, i) => `<tr><td>${i + 1}</td><td><b>${esc(it.name)}</b></td><td class="r">${n(it.qty)} ${esc(it.unit)}</td><td class="r">${n(it.unitPrice)}</td><td class="r">${n(it.qty * it.unitPrice)}</td></tr>`).join("")
    : `<tr><td>1</td><td><b>${esc(q.project)}</b><br/><span style="color:#888;font-size:11px">${esc(q.buildingType)} · อาคารสำเร็จรูป</span></td><td class="r">${n(q.area)} ม²</td><td class="r">-</td><td class="r">${n(subtotal)}</td></tr>`;
  const issuerMeta = [issuer.address, issuer.phone ? ("โทร. " + issuer.phone) : "", issuer.taxId ? ("เลขผู้เสียภาษี " + issuer.taxId) : ""].filter(Boolean).join("\n");
  return `<!DOCTYPE html><html lang="th"><head><meta charset="utf-8"/>
<title>ใบเสนอราคา ${esc(q.id)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Sarabun','Tahoma',sans-serif;color:#2D2D2D;font-size:13px;line-height:1.5;background:#f3f4f6}
.sheet{width:210mm;min-height:297mm;margin:12px auto;padding:16mm 14mm;background:#fff;box-shadow:0 4px 24px rgba(0,0,0,.12)}
.top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #003366;padding-bottom:14px}
.issuer-name{font-size:20px;font-weight:800;color:#003366}
.issuer-meta{font-size:11px;color:#555;margin-top:4px;white-space:pre-line}
.doc-title{text-align:right}
.doc-title h1{font-size:22px;color:#003366;letter-spacing:1px}
.doc-title .sub{font-size:11px;color:#888;letter-spacing:2px}
.doc-meta{margin-top:8px;font-size:12px;line-height:1.7}
.doc-meta b{color:#003366}
.parties{display:flex;gap:16px;margin-top:18px}
.party{flex:1;border:1px solid #e5e7eb;border-radius:8px;padding:12px 14px}
.party .lbl{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#888;font-weight:700;margin-bottom:5px}
.party .co{font-size:14px;font-weight:800;color:#003366}
.party .row{font-size:11px;color:#555;margin-top:2px}
table.items{width:100%;border-collapse:collapse;margin-top:18px}
table.items th{background:#003366;color:#fff;font-size:11px;font-weight:700;padding:9px 10px;text-align:left}
table.items th.r,table.items td.r{text-align:right}
table.items td{padding:10px;border-bottom:1px solid #eee;font-size:12px;vertical-align:top}
.sum{margin-top:12px;margin-left:auto;width:290px}
.sum .line{display:flex;justify-content:space-between;padding:5px 2px;font-size:12px}
.sum .total{border-top:1px solid #c9d4e2;margin-top:3px;padding-top:5px;font-weight:700}
.sum .wht{color:#b45309}
.sum .grand{border-top:2px solid #003366;margin-top:4px;padding-top:8px;font-size:15px;font-weight:800;color:#003366}
.terms{margin-top:22px;font-size:11px;color:#555}
.terms .h{font-weight:700;color:#003366;margin-bottom:4px}
.signs{display:flex;gap:40px;margin-top:46px}
.sign{flex:1;text-align:center;position:relative}
.sign .line{border-top:1px dotted #999;margin-top:44px;padding-top:6px;font-size:11px;color:#555;line-height:1.5}
.sign .sig{display:block;max-height:48px;max-width:150px;object-fit:contain;margin:0 auto 2px}
.sign .stamp{position:absolute;right:8px;bottom:18px;max-height:72px;max-width:72px;object-fit:contain;opacity:.9}
.bar{margin-top:6px;font-size:10px;color:#9ca3af;text-align:center}
@media print{@page{size:A4;margin:0}body{background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}.sheet{margin:0;box-shadow:none}}
</style></head><body>
<div class="sheet">
  <div class="top">
    <div>
      ${/* Constitution V2 · Branding: ดีลเลอร์อัปโหลดโลโก้เองไม่ได้ → หัวเอกสารใช้ "ชื่อบริษัทดีลเลอร์" เป็นข้อความเท่านั้น (ไม่มีชื่อ/โลโก้ Benjamin) */""}
      <div class="issuer-name">${esc(issuer.company)}</div>
      <div class="issuer-meta">${esc(issuerMeta)}</div>
    </div>
    <div class="doc-title">
      <h1>ใบเสนอราคา</h1>
      <div class="sub">QUOTATION</div>
      ${/* ⚠️ เดิมบรรทัดนี้เขียนตายว่า "ยืนราคา 30 วัน" — ดีลเลอร์ตั้งอายุใบเป็น 45 วัน หัวกระดาษก็ยังพิมพ์ 30
             แล้วขัดกับบรรทัดเงื่อนไขด้านล่างที่คำนวณวันจริง = เอกสารเถียงกันเองต่อหน้าลูกค้า
             (เจอตอนเขียนเทสต์ชุดแรกของเอกสารพิมพ์ 24 ส.ค. 69) ตอนนี้ใช้วันจริงใบเดียวกับเงื่อนไข */""}
      <div class="doc-meta">เลขที่ <b>${esc(q.id)}</b><br/>วันที่ ${esc(fmtDate(q.date))}${validUntil ? `<br/>ยืนราคาถึง ${esc(fmtDate(validUntil))}` : ""}</div>
    </div>
  </div>
  <div class="parties">
    <div class="party">
      <div class="lbl">เสนอแก่ / ลูกค้า</div>
      <div class="co">${esc(cust?.company || q.customer)}</div>
      ${cust?.name ? `<div class="row">ผู้ติดต่อ: ${esc(cust.name)}</div>` : ""}
      ${cust?.phone ? `<div class="row">โทร. ${esc(cust.phone)}</div>` : ""}
      <div class="row">จังหวัด: ${esc(q.province || cust?.province || "-")}</div>
    </div>
    <div class="party">
      <div class="lbl">รายละเอียดงาน</div>
      <div class="co" style="font-size:13px">${esc(q.project)}</div>
      <div class="row">ประเภทอาคาร: ${esc(q.buildingType)}</div>
      <div class="row">พื้นที่: ${n(q.area)} ตร.ม.</div>
      <div class="row">จำนวนรายการ: ${esc(q.items)} รายการ</div>
    </div>
  </div>
  <table class="items">
    <thead><tr><th style="width:40px">ลำดับ</th><th>รายการ</th><th class="r" style="width:78px">จำนวน</th><th class="r" style="width:100px">ราคา/หน่วย</th><th class="r" style="width:128px">จำนวนเงิน (บาท)</th></tr></thead>
    <tbody>${itemRows}</tbody>
  </table>
  <div class="sum">
    <div class="line"><span>มูลค่างาน</span><span>${n(subtotal)}</span></div>
    <!-- แสดงบรรทัด VAT เสมอ แม้อัตราเป็น 0 — ผู้รับเอกสารต้องเห็นชัดว่า "ใบนี้ไม่คิด VAT"
         ไม่ใช่หายไปเฉย ๆ จนต้องเดา (มีเทสต์ล็อกไว้ตั้งแต่ตอนแก้บั๊ก VAT 0% ถูกคิดเป็น 7%) -->
    <div class="line"><span>ภาษีมูลค่าเพิ่ม ${vatPct}%</span><span>${n(vat)}</span></div>
    <div class="line total"><span>รวมเป็นเงิน</span><span>${n(grand)}</span></div>
    ${ภาษี.whtRate > 0 ? `<div class="line wht"><span>หัก ณ ที่จ่าย ${ภาษี.whtRate}%</span><span>-${n(ภาษี.whtAmount)}</span></div>` : ""}
    <div class="line grand"><span>ยอดชำระสุทธิ</span><span>฿${n(ภาษี.netPayable)}</span></div>
  </div>
  ${termsHTML}
  <div class="signs">
    <div class="sign">
      ${doc.signature ? `<img class="sig" src="${esc(doc.signature)}" alt="ลายเซ็น"/>` : ""}
      ${doc.stamp ? `<img class="stamp" src="${esc(doc.stamp)}" alt="ตราประทับ"/>` : ""}
      <div class="line">ผู้เสนอราคา<br/>( ${esc(issuer.company)} )</div>
    </div>
    <div class="sign"><div class="line">ผู้อนุมัติสั่งซื้อ<br/>( ${esc(cust?.company || q.customer)} )</div></div>
  </div>
  <div class="bar">เอกสารนี้ออกในนามบริษัทของผู้เสนอราคา</div>
</div>
<script>window.onload=function(){setTimeout(function(){window.print();},350);}</script>
</body></html>`;
}

// พิมพ์ใบเสนอราคา — โหลด issuer + doc จาก localStorage เอง แล้วเปิดหน้าต่างพิมพ์
// ใช้ตัวนี้เพื่อความสม่ำเสมอ (VAT/ตรา/ลายเซ็น มาจากการตั้งค่าจริงเสมอ)
// vatPercent: ส่ง VAT จาก useHQPolicy() มาด้วยเสมอ (ค่าจริงของ HQ) — ดู loadDoc
/** ตั้งค่าของสาขาที่ใช้ประกอบเอกสาร — ผู้เรียกต้องส่งมาจาก useDealerSettings()
 *  ไม่ส่งมา = ตกไปอ่าน localStorage ซึ่งถูกเฉพาะโหมด local (โหมดจริงค่าอยู่ใน DB) */
export type PrintSettings = { issuer?: IssuerProfile; doc?: DocProfile };

export function printQuotation(q: QuotationMock, cust?: PrintCustomer, vatPercent?: number, settings?: PrintSettings) {
  // ใช้สแนปช็อตผู้ออกที่ตรึงไว้กับใบ (ถ้ามี) — ใบเก่าคงชื่อเดิม; ไม่มีค่อย fallback โปรไฟล์ปัจจุบัน
  //
  // settings ต้องส่งมาจากหน้าจอเสมอในโหมดจริง — เดิมฟังก์ชันนี้อ่าน localStorage เอง
  // ทำให้ "ใบเดียวกัน" พิมพ์จากหน้าลูกค้า/แผงลูกค้าเป้าหมาย ได้หัวกระดาษคนละชุดกับพิมพ์จากหน้าใบเสนอราคา
  // (หน้าใบเสนอราคาส่งค่าจาก DB มาแล้ว · อีกสองที่ยังได้ค่าเริ่มต้นของโปรเจกต์)
  const issuer = q.issuer ?? settings?.issuer ?? loadIssuer();
  const doc = settings?.doc
    ? { ...settings.doc, vatPercent: typeof vatPercent === "number" && vatPercent >= 0 ? vatPercent : settings.doc.vatPercent }
    : loadDoc(vatPercent);
  const html = buildQuotationHTML(q, issuer, cust, doc);
  const w = window.open("", "_blank"); if (!w) return;
  w.document.write(html); w.document.close();
}
