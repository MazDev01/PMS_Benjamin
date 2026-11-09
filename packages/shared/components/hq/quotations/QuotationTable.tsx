"use client";

// ─── ตารางใบเสนอราคาทั้งเครือ ─────────────────────────────────────────────────
// อ่านอย่างเดียว — มีปุ่ม "ดู" เท่านั้น ไม่มีสร้าง/แก้ไข/ลบ/อนุมัติ (HQ เป็นเจ้าของข้อมูล แต่ไม่ออกใบเอง)
// คอลัมน์เกี่ยวกับการเปิดอ่าน ถูกลบทั้งหมดพร้อมสถานะ "เปิดอ่านแล้ว"
import { BoxTitle } from "@pms/shared/components/ui/BoxTitle";
import { ช่อง } from "@pms/shared/lib/fieldLabels";
import { Eye } from "lucide-react";
import { ตรึงคอลัมน์ปุ่ม } from "@pms/shared/components/ui/stickyActionCol";
import { quotationStatusColor } from "@pms/shared/lib/mock";
import { ชื่อสถานะใบHQ } from "./QuotationFilterBar";
import { fmtBaht } from "@pms/shared/lib/format";
import type { QuoteRow } from "@pms/shared/lib/hqQuotations";
import { ClickableRow } from "@pms/shared/components/ui/ClickableRow";
import { TablePagination, ROWS_PER_PAGE } from "@pms/shared/components/ui/TablePagination";
import { คีย์ใบ, type ส่วนต่างใบ } from "@pms/shared/lib/hqQuoteMargins";
import { useชื่อดีลเลอร์ } from "@pms/shared/lib/dealerDisplay";
import { ซ่อนตามระดับ, type ระดับเจาะ } from "@pms/shared/lib/drillColumns";

const PRIMARY = "#003366";
const MUTED = "#6b7280";

/** ส่วนต่างรายใบ 4 คอลัมน์ (บอสสั่ง 2 พ.ย. 69 · ใบ 0272) — ไม่ได้ทำจากใบ HQ = "—" · ยังโหลด = "…" */
export const คอลัมน์ส่วนต่าง = [
  { k: "hq-cost", l: "ราคาจาก HQ", n: (m: ส่วนต่างใบ) => m.hqCost, v: (m: ส่วนต่างใบ) => fmtBaht(m.hqCost) },
  { k: "sale", l: "ราคาขายลูกค้า", n: (m: ส่วนต่างใบ) => m.sale, v: (m: ส่วนต่างใบ) => fmtBaht(m.sale) },
  { k: "margin-baht", l: "ส่วนต่าง ฿", n: (m: ส่วนต่างใบ) => m.baht, v: (m: ส่วนต่างใบ) => fmtBaht(m.baht) },
  { k: "margin-pct", l: "ส่วนต่าง %", n: (m: ส่วนต่างใบ) => m.pct, v: (m: ส่วนต่างใบ) => (m.pct == null ? "—" : `${m.pct.toFixed(1)}%`) },
] as const;

export function QuotationTable({ rows, onView, pagination, margins, หัวข้อ, ระดับ = {} }: {
  /** ระดับเจาะลึกที่ดูอยู่ — คอลัมน์ที่ระดับบอกอยู่แล้วซ่อน (บอสสั่ง 9 พ.ย. 69 · ตัวกลาง drillColumns) */
  ระดับ?: ระดับเจาะ;
  rows: QuoteRow[];
  onView: (q: QuoteRow) => void;
  /** ส่วนต่างรายใบของแถวในหน้านี้ (คีย์ = สาขา|เลขที่) · undefined = ยังโหลด */
  margins?: Map<string, ส่วนต่างใบ>;
  // M9 Phase 2: มี = แบ่งหน้าที่ DB (supabase) → แสดงตัวควบคุมหน้า · ไม่มี = แสดงทั้งชุด (local)
  pagination?: { page: number; pageCount: number; total: number; onPage: (p: number) => void };
  /** หัวข้อ 2 บรรทัดบนตาราง (บอสสั่ง 3 พ.ย. 69) */
  หัวข้อ?: { ชื่อ: string; คำอธิบาย: string };
}) {
  const ชื่อของ = useชื่อดีลเลอร์();   // ชื่อแสดง ไม่มีรหัส · ชื่อซ้ำ = "ชื่อ (รหัส)" (บอสสั่ง 6 พ.ย. 69)
  // ระดับดีลเลอร์ = ไม่มีคอลัมน์ดีลเลอร์ · ทุกแถวจังหวัดหน้างานเดียวกับระดับ = ไม่มีคอลัมน์จังหวัด (บอสสั่ง 9 พ.ย. 69)
  const ซ่อน = ซ่อนตามระดับ(ระดับ, rows, { จังหวัด: q => q.siteProvince });
  const จำนวนคอล = 12 - (ซ่อน.จังหวัด ? 1 : 0);   // ดีลเลอร์เป็นบรรทัดเล็กใต้ลูกค้า (ไม่ใช่คอลัมน์แยก)
  return (
    <div className="card" style={{ marginBottom: 0 }}>
      {หัวข้อ && <BoxTitle ชื่อ={หัวข้อ.ชื่อ} คำอธิบาย={หัวข้อ.คำอธิบาย} />}
      {/* พอดีจอ 1366 ไม่มีแถบเลื่อนแนวนอน (บอสสั่ง 9 พ.ย. 69 · .table-wrap.fit · หัวคอลัมน์ขึ้นบรรทัดได้ · ตัวเงินแบบย่อ ฿1.2M) */}
      <div className="table-wrap fit" style={{ borderTop: "none" }}>
        <table aria-label="รายการใบเสนอราคา" data-hidden-cols={[ซ่อน.ดีลเลอร์ && "dealer", ซ่อน.จังหวัด && "province"].filter(Boolean).join(",")}>
          {/* ความกว้างคุมที่ colgroup เท่านั้น (ตาราง table-layout:fixed — ใส่ที่ th ไม่มีผล)
              minWidth ทุกช่องวัดจากเบราว์เซอร์จริง (td padding ข้างละ 16px) ด้วยกฎ 2 ข้อ:
                1) หัวคอลัมน์ห้ามโดนตัดทุกขนาดจอ → minWidth ต้อง ≥ ความกว้างหัว
                2) เลขที่/จังหวัด/มูลค่า/สถานะ/วันที่/ปุ่ม = ตัดไม่ได้ → minWidth ≥ ความกว้างข้อมูล
                   ดีลเลอร์/ลูกค้า/ประเภทอาคาร = ชื่อยาวตัด … ได้ตามปกติ
              รวม minWidth = 1144px → พอดีตั้งแต่จอ 1440 ขึ้นไป
              จอแคบกว่านั้น (1280/1366) เลื่อนแนวนอนใน .table-wrap — 11 คอลัมน์ยังไงก็ไม่พอ
              เพิ่ม/ลบคอลัมน์เมื่อไร ต้องมาวัดใหม่และแก้ colgroup ด้วยเสมอ */}
          {/* 30 ต.ค. 69 บอสสั่ง: เลขที่ · ดีลเลอร์ (รหัส+ชื่อช่องเดียว) · ลูกค้า · จังหวัดหน้างาน · มูลค่า (ก่อน VAT) · สถานะ · วันที่ส่ง · ใช้ได้ถึง · ดู
              เลขที่/มูลค่า/สถานะ/วันที่ ห้ามตัด · ดีลเลอร์/ลูกค้า ยาวเกิน = ตัด … + แสดงเต็มเมื่อชี้ (title) */}
          {/* พอดีกรอบ 1042px ที่จอ 1366 (บอสสั่ง 9 พ.ย. 69): สัดส่วนรวม 96% + ปุ่มดู 44px · ดีลเลอร์เป็นบรรทัดเล็กใต้ลูกค้า (เดิมคอลัมน์แยก 200px → ตารางกว้าง 1,678px)
              คอลัมน์จังหวัดที่ซ่อน (ทุกแถวเท่ากับระดับ) ยกที่ให้ลูกค้า */}
          <colgroup>
            <col style={{ width: "14%" }} />{/* เลขที่ — ฉบับใหม่ต้องเห็น "-V2" เต็ม */}
            <col style={{ width: `${15 + (ซ่อน.จังหวัด ? 8 : 0)}%` }} />{/* ลูกค้า / ดีลเลอร์ (บรรทัดเล็ก · ระดับดีลเลอร์ไม่มีบรรทัดนี้) */}
            {!ซ่อน.จังหวัด && <col style={{ width: "8%" }} />}{/* จังหวัดหน้างาน */}
            <col style={{ width: "7%" }} />{/* มูลค่า (ก่อน VAT) */}
            {/* ส่วนต่างรายใบ 4 คอลัมน์ (บอสสั่ง 2 พ.ย. 69) — ตัวเงินแบบย่อ ฿1.2M · หัวขึ้นบรรทัดได้ */}
            <col style={{ width: "6%" }} /><col style={{ width: "6%" }} /><col style={{ width: "6%" }} /><col style={{ width: "6%" }} />
            <col style={{ width: "9.5%" }} />{/* สถานะ — "ส่งให้ลูกค้าแล้ว" ต้องเห็นเต็ม */}
            <col style={{ width: "9.25%" }} />{/* วันที่ส่ง "28 ต.ค. 2569" ไม่ตัด */}
            <col style={{ width: "9.25%" }} />{/* ใช้ได้ถึง */}
            <col style={{ width: 44 }} />{/* ปุ่มดู */}
          </colgroup>
          <thead>
            <tr>
              <th>เลขที่</th>
              <th>{ซ่อน.ดีลเลอร์ ? "ลูกค้า" : "ลูกค้า / ดีลเลอร์"}</th>
              {!ซ่อน.จังหวัด && <th>{ช่อง.จังหวัด}</th>}
              <th className="num">มูลค่า (ก่อน VAT)</th>
              {คอลัมน์ส่วนต่าง.map(c => <th key={c.k} className="num" data-col-head={c.k}>{c.l}</th>)}
              <th>สถานะ</th>
              <th>วันที่ส่ง</th>
              <th>ใช้ได้ถึง</th>
              {/* คอลัมน์ปุ่มตรึงไว้ขวาสุด — ตารางกว้างเกินจอ 1280 (26 ส.ค. 69) */}
              <th style={ตรึงคอลัมน์ปุ่ม(true)}>ดู</th>
            </tr>
          </thead>
          <tbody>
            {!rows.length ? (
              <tr><td colSpan={จำนวนคอล} style={{ textAlign: "center", padding: "32px 14px", color: MUTED }}>ไม่พบข้อมูลที่ค้นหา</td></tr>
            ) : rows.map(q => {
              const sc = quotationStatusColor[q.status];
              // คีย์ต้องพ่วงรหัสสาขา — เลขที่ใบไม่ซ้ำ "เฉพาะภายในสาขา" (คีย์จริง = สาขา + เลขที่)
              // ตารางนี้รวมใบของทุกสาขา เลขเดียวกันจากคนละสาขาจึงชนกันได้ (กับดักเดียวกับหน้าลูกค้าเป้าหมาย 7 ส.ค. 69)
              return (
                <ClickableRow key={`${q.dealerCode ?? ""}-${q.id}`} onActivate={() => onView(q)} label={`เปิดรายละเอียดใบเสนอราคา ${q.quoteNo}`}>
                  <td data-quote-no style={{ color: PRIMARY, fontWeight: 700, whiteSpace: "nowrap" }}>{q.quoteNo}</td>
                  <td title={ซ่อน.ดีลเลอร์ ? q.customer : `${q.customer} · ${ชื่อของ(q.dealerCode, q.dealerName)}`} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <div data-col="customer" style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis" }}>{q.customer}</div>
                    {!ซ่อน.ดีลเลอร์ && <div data-col="dealer" data-row-sub style={{ color: MUTED, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis" }}>{ชื่อของ(q.dealerCode, q.dealerName)}</div>}
                  </td>
                  {!ซ่อน.จังหวัด && <td data-col="site-province" style={{ color: MUTED }}>{q.siteProvince || "—"}</td>}
                  <td className="num" style={{ color: PRIMARY, fontWeight: 800, whiteSpace: "nowrap" }}>{fmtBaht(q.valueNum)}</td>
                  {คอลัมน์ส่วนต่าง.map(c => {
                    const m = margins?.get(คีย์ใบ(q.dealerCode, q.quoteNo));
                    return <td key={c.k} className="num" data-col={c.k} data-value={m ? (c.n(m) ?? "") : ""} style={{ whiteSpace: "nowrap", color: m ? "#1F2937" : MUTED }}>{!margins ? "…" : m ? c.v(m) : "—"}</td>;
                  })}
                  <td>
                    <span className="badge" data-quote-status style={{ background: sc.bg, color: sc.text, whiteSpace: "nowrap" }}>{ชื่อสถานะใบHQ[q.status]}</span>
                  </td>
                  {/* คอลัมน์ "เปิดอ่าน" ถูกลบพร้อมสถานะเปิดอ่านแล้ว */}
                  {/* วันที่ส่ง = วันที่ของใบ (ตั้งใหม่ทุกครั้งที่กดส่ง) · ใบร่างยังไม่ได้ส่ง = "—" */}
                  <td data-col="sent-date" style={{ color: MUTED, fontSize: "0.78rem", whiteSpace: "nowrap" }}>{q.status === "draft" ? "—" : q.createdAt}</td>
                  <td style={{ color: MUTED, fontSize: "0.78rem", whiteSpace: "nowrap" }}>{q.validUntil ?? "—"}</td>
                  <td style={ตรึงคอลัมน์ปุ่ม()}>
                    {/* ปุ่มไอคอนล้วน — ข้อความ "ดู" ซ้ำกับที่ไอคอนสื่ออยู่แล้ว · title/aria-label คงไว้ให้ screen reader */}
                    <button
                      onClick={e => { e.stopPropagation(); onView(q); }}
                      className="btn btn-secondary btn-sm"
                      title="ดูรายละเอียด"
                      aria-label="ดูรายละเอียด"
                      style={{ width: 28, height: 28, padding: 0, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center" }}
                    >
                      <Eye size={13} />
                    </button>
                  </td>
                </ClickableRow>
              );
            })}
          </tbody>
        </table>
      </div>
      {/* แถบเปลี่ยนหน้าแสดงตลอด แม้มีหน้าเดียว (มาตรฐานทุกตาราง HQ) */}
      <TablePagination
        page={pagination ? pagination.page : 0}
        total={pagination ? pagination.total : rows.length}
        onPage={pagination ? pagination.onPage : () => {}}
        size={ROWS_PER_PAGE}
        unit="ใบ"
      />
    </div>
  );
}
