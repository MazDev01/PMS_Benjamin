// ── พิมพ์ใบค่าแฟรนไชส์ (A4) — หน้าตาชุดเดียวกับใบเสนอราคาของดีลเลอร์ (quotationPrint.ts) ──
//
// ต่างจากใบเสนอราคาตรงผู้ออก: ใบนี้เป็นเอกสารของสำนักงานใหญ่ → หัวกระดาษใช้ข้อมูลบริษัทจาก ตั้งค่า › บริษัท
//   (ใบเสนอราคาของดีลเลอร์ออกในนามบริษัทดีลเลอร์ — คนละเอกสารกัน กติกาเรื่องชื่อบนหัวกระดาษจึงไม่เหมือนกัน)
//
// ⚠️ ทุกค่าที่มาจากผู้ใช้ต้องผ่าน esc() — หน้าพิมพ์ประกอบ HTML แล้วเขียนลงหน้าต่างใหม่ตรง ๆ
//    ชื่อลูกค้าเป้าหมาย/เงื่อนไขที่มี <script> จะรันจริงถ้าลืม (มีเทสต์ล็อกไว้)
import type { DealerPackageProposal, DealerProspect, HQCompany } from "./data/types";
import { packageLabel, มูลค่าอ่านง่าย, ระยะสัญญาอ่านง่าย } from "./dealerProposals";
import { fmtISOToThai } from "./mock";

function esc(s: unknown) {
  return String(s ?? "").replace(/[&<>"]/g, c => (({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" } as Record<string, string>)[c]));
}

export type ผู้รับข้อเสนอ = Pick<DealerProspect, "name" | "phone" | "email" | "province" | "social">;

/** ผู้ลงนามช่อง "ผู้เสนอ" (หน้าตั้งค่า › หาดีลเลอร์) — ชื่อว่าง = ใช้ชื่อบริษัท */
export type ผู้ลงนามข้อเสนอ = { name?: string; title?: string };

export function buildDealerProposalHTML(p: DealerPackageProposal, prospect: ผู้รับข้อเสนอ, hq: HQCompany, ผู้ลงนาม?: ผู้ลงนามข้อเสนอ): string {
  const พื้นที่ = p.region === "ทุกภาค"
    ? "ทั่วประเทศ (ทุกภาค)"
    : [p.province, p.region ? `ภาค${p.region}` : ""].filter(Boolean).join(" · ") || "—";
  const termLines = String(p.terms ?? "").split(/\r?\n/).map(t => t.trim()).filter(Boolean);
  // หัวกระดาษยึดข้อมูลบริษัทที่ ตั้งค่า › บริษัท ทุกช่อง (บอสสั่ง 14 ก.ย. 69) — ช่องที่ยังไม่กรอกไม่ขึ้น ห้ามเติมค่าให้เอง
  const hqMeta = [
    hq.address,
    [hq.phone ? `โทร. ${hq.phone}` : "", hq.email ? `อีเมล ${hq.email}` : "", hq.website].filter(Boolean).join(" · "),
    hq.taxId ? `เลขประจำตัวผู้เสียภาษี ${hq.taxId}` : "",
  ].filter(Boolean).join("\n");
  const ร่าง = p.status === "draft";

  return `<!DOCTYPE html><html lang="th"><head><meta charset="utf-8"/>
<title>ใบค่าแฟรนไชส์ ${esc(p.proposalNo)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Sarabun','Tahoma',sans-serif;color:#2D2D2D;font-size:13px;line-height:1.5;background:#f3f4f6}
.sheet{width:210mm;min-height:297mm;margin:12px auto;padding:16mm 14mm;background:#fff;box-shadow:0 4px 24px rgba(0,0,0,.12)}
.draft{background:#fff8e6;border:1px solid #fde68a;color:#92400e;font-weight:700;font-size:12px;padding:6px 10px;border-radius:6px;margin-bottom:10px;text-align:center}
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
.party .lbl{font-size:10px;letter-spacing:1px;color:#888;font-weight:700;margin-bottom:5px}
.party .co{font-size:14px;font-weight:800;color:#003366}
.party .row{font-size:11px;color:#555;margin-top:2px}
table.items{width:100%;border-collapse:collapse;margin-top:18px}
table.items th{background:#003366;color:#fff;font-size:11px;font-weight:700;padding:9px 10px;text-align:left}
table.items td{padding:10px;border-bottom:1px solid #eee;font-size:12px;vertical-align:top}
table.items td.r,table.items th.r{text-align:right}
.terms{margin-top:22px;font-size:11px;color:#555}
.terms .h{font-weight:700;color:#003366;margin-bottom:4px}
.signs{display:flex;gap:40px;margin-top:46px}
.sign{flex:1;text-align:center}
.sign .line{border-top:1px dotted #999;margin-top:44px;padding-top:6px;font-size:11px;color:#555;line-height:1.5}
.bar{margin-top:6px;font-size:10px;color:#9ca3af;text-align:center}
@media print{@page{size:A4;margin:0}body{background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}.sheet{margin:0;box-shadow:none}}
</style></head><body>
<div class="sheet">
  ${ร่าง ? `<div class="draft">ร่าง — ยังไม่ใช่ข้อเสนอที่ส่งจริง</div>` : ""}
  <div class="top">
    <div>
      <div class="issuer-name">${esc(hq.name)}</div>
      <div class="issuer-meta">${esc(hqMeta)}</div>
    </div>
    <div class="doc-title">
      <h1>ใบค่าแฟรนไชส์</h1>
      <div class="sub">DEALER PACKAGE PROPOSAL</div>
      <div class="doc-meta">เลขที่ <b>${esc(p.proposalNo || "—")}</b><br/>วันที่ ${esc(p.proposedDate ? fmtISOToThai(p.proposedDate) : "—")}${p.validUntil ? `<br/>ข้อเสนอมีผลถึง ${esc(fmtISOToThai(p.validUntil))}` : ""}</div>
    </div>
  </div>
  <div class="parties">
    <div class="party">
      <div class="lbl">เสนอแก่</div>
      <div class="co">${esc(prospect.name)}</div>
      ${prospect.phone ? `<div class="row">โทร. ${esc(prospect.phone)}</div>` : ""}
      ${prospect.email ? `<div class="row">อีเมล ${esc(prospect.email)}</div>` : ""}
      ${prospect.province ? `<div class="row">จังหวัด: ${esc(prospect.province)}</div>` : ""}
    </div>
    <div class="party">
      <div class="lbl">แพ็กเกจที่เสนอ</div>
      <div class="co">${esc(packageLabel[p.package] ?? p.package)}</div>
      <div class="row">พื้นที่ที่ได้สิทธิ์: ${esc(พื้นที่)}</div>
    </div>
  </div>
  <table class="items">
    <thead><tr><th>รายการ</th><th class="r" style="width:220px">รายละเอียด</th></tr></thead>
    <tbody>
      <tr><td><b>แพ็กเกจดีลเลอร์ ${esc(packageLabel[p.package] ?? p.package)}</b><br/><span style="color:#888;font-size:11px">พื้นที่: ${esc(พื้นที่)}</span></td><td class="r">${esc(packageLabel[p.package] ?? p.package)}</td></tr>
      <tr><td>ค่าแรกเข้า (จ่ายครั้งเดียว)</td><td class="r">${esc(มูลค่าอ่านง่าย(p.amount))}</td></tr>
      <tr><td>ระยะสัญญา</td><td class="r">${esc(ระยะสัญญาอ่านง่าย(p.contractMonths))}</td></tr>
      <tr><td>เป้ายอดซื้อต่อปี</td><td class="r">${esc(มูลค่าอ่านง่าย(p.annualTarget))}</td></tr>
    </tbody>
  </table>
  ${termLines.length ? `<div class="terms"><div class="h">เงื่อนไข</div>${termLines.map(t => `• ${esc(t)}`).join("<br/>")}</div>` : ""}
  <div class="signs">
    <div class="sign"><div class="line">ผู้เสนอ<br/>( ${esc(ผู้ลงนาม?.name?.trim() || hq.name || "สำนักงานใหญ่")} )${ผู้ลงนาม?.name?.trim() && ผู้ลงนาม.title?.trim() ? `<br/>${esc(ผู้ลงนาม.title.trim())}` : ""}${ผู้ลงนาม?.name?.trim() && hq.name ? `<br/>${esc(hq.name)}` : ""}</div></div>
    <div class="sign"><div class="line">ผู้ตอบรับข้อเสนอ<br/>( ${esc(prospect.name)} )</div></div>
  </div>
  <div class="bar">เอกสารนี้เป็นข้อเสนอเงื่อนไขการเป็นดีลเลอร์ ไม่ใช่ใบแจ้งหนี้หรือใบเสร็จรับเงิน</div>
</div>
<script>window.onload=function(){setTimeout(function(){window.print();},350);}</script>
</body></html>`;
}

/** เขียนใบลงหน้าต่างที่เปิดไว้แล้ว
 *  ⚠️ ผู้เรียกต้องเปิดหน้าต่าง "ทันทีตอนกดปุ่ม" ก่อนไปโหลดข้อมูลบริษัท —
 *     เปิดหลัง await เบราว์เซอร์จะมองว่าไม่ได้เกิดจากการกดของผู้ใช้ แล้วบล็อกเป็นป๊อปอัป */
export function เขียนใบเสนอลงหน้าต่าง(w: Window, p: DealerPackageProposal, prospect: ผู้รับข้อเสนอ, hq: HQCompany, ผู้ลงนาม?: ผู้ลงนามข้อเสนอ) {
  w.document.write(buildDealerProposalHTML(p, prospect, hq, ผู้ลงนาม));
  w.document.close();
}
