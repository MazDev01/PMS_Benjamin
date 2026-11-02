"use client";

// ─── ตารางใบเสนอราคาทั้งเครือ ─────────────────────────────────────────────────
// อ่านอย่างเดียว — มีปุ่ม "ดู" เท่านั้น ไม่มีสร้าง/แก้ไข/ลบ/อนุมัติ (HQ เป็นเจ้าของข้อมูล แต่ไม่ออกใบเอง)
// คอลัมน์เกี่ยวกับการเปิดอ่าน ถูกลบทั้งหมดพร้อมสถานะ "เปิดอ่านแล้ว"
import { ช่อง } from "@pms/shared/lib/fieldLabels";
import { Eye } from "lucide-react";
import { ตรึงคอลัมน์ปุ่ม } from "@pms/shared/components/ui/stickyActionCol";
import { quotationStatusColor } from "@pms/shared/lib/mock";
import { ชื่อสถานะใบHQ } from "./QuotationFilterBar";
import { fmtBaht } from "@pms/shared/lib/format";
import type { QuoteRow } from "@pms/shared/lib/hqQuotations";
import { ClickableRow } from "@pms/shared/components/ui/ClickableRow";
import { TablePagination, ROWS_PER_PAGE } from "@pms/shared/components/ui/TablePagination";

const PRIMARY = "#003366";
const MUTED = "#6b7280";

export function QuotationTable({ rows, onView, pagination }: {
  rows: QuoteRow[];
  onView: (q: QuoteRow) => void;
  // M9 Phase 2: มี = แบ่งหน้าที่ DB (supabase) → แสดงตัวควบคุมหน้า · ไม่มี = แสดงทั้งชุด (local)
  pagination?: { page: number; pageCount: number; total: number; onPage: (p: number) => void };
}) {
  return (
    <div className="card" style={{ marginBottom: 0 }}>
      <div className="table-wrap" style={{ borderTop: "none" }}>
        <table aria-label="รายการใบเสนอราคา">
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
          <colgroup>
            <col style={{ width: 216 }} />{/* เลขที่ — ฉบับใหม่ต้องเห็น "-V2" เต็ม */}
            <col style={{ width: "20%", minWidth: 200 }} />{/* ดีลเลอร์ = รหัส + ชื่อ */}
            <col style={{ width: "20%", minWidth: 150 }} />{/* ลูกค้า */}
            <col style={{ width: "11%", minWidth: 128 }} />{/* จังหวัดหน้างาน — "พระนครศรีอยุธยา" */}
            <col style={{ width: "9%", minWidth: 120 }} />{/* มูลค่า (ก่อน VAT) */}
            <col style={{ width: 132 }} />{/* สถานะ — "ส่งให้ลูกค้าแล้ว" ต้องเห็นเต็ม */}
            <col style={{ width: "9%", minWidth: 116 }} />{/* วันที่ส่ง */}
            <col style={{ width: "9%", minWidth: 116 }} />{/* ใช้ได้ถึง */}
            <col style={{ width: 52 }} />{/* ปุ่มดู */}
          </colgroup>
          <thead>
            <tr>
              <th>เลขที่</th>
              <th>ดีลเลอร์</th>
              <th>ลูกค้า</th>
              <th>{ช่อง.จังหวัด}</th>
              <th className="num">มูลค่า (ก่อน VAT)</th>
              <th>สถานะ</th>
              <th>วันที่ส่ง</th>
              <th>ใช้ได้ถึง</th>
              {/* คอลัมน์ปุ่มตรึงไว้ขวาสุด — ตารางกว้างเกินจอ 1280 (26 ส.ค. 69) */}
              <th style={ตรึงคอลัมน์ปุ่ม(true)}>ดู</th>
            </tr>
          </thead>
          <tbody>
            {!rows.length ? (
              <tr><td colSpan={9} style={{ textAlign: "center", padding: "32px 14px", color: MUTED }}>ไม่พบข้อมูลที่ค้นหา</td></tr>
            ) : rows.map(q => {
              const sc = quotationStatusColor[q.status];
              // คีย์ต้องพ่วงรหัสสาขา — เลขที่ใบไม่ซ้ำ "เฉพาะภายในสาขา" (คีย์จริง = สาขา + เลขที่)
              // ตารางนี้รวมใบของทุกสาขา เลขเดียวกันจากคนละสาขาจึงชนกันได้ (กับดักเดียวกับหน้าลูกค้าเป้าหมาย 7 ส.ค. 69)
              return (
                <ClickableRow key={`${q.dealerCode ?? ""}-${q.id}`} onActivate={() => onView(q)} label={`เปิดรายละเอียดใบเสนอราคา ${q.quoteNo}`}>
                  <td data-quote-no style={{ color: PRIMARY, fontWeight: 700, whiteSpace: "nowrap" }}>{q.quoteNo}</td>
                  <td data-col="dealer" title={`${q.dealerCode} · ${q.dealerName}`} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <span data-col="code" className="badge" style={{ background: "#eef2f7", color: PRIMARY, fontFamily: "monospace", marginRight: 6 }}>{q.dealerCode}</span>{q.dealerName}
                  </td>
                  <td title={q.customer} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{q.customer}</td>
                  <td data-col="site-province" style={{ color: MUTED, whiteSpace: "nowrap" }}>{q.siteProvince || "—"}</td>
                  <td className="num" style={{ color: PRIMARY, fontWeight: 800, whiteSpace: "nowrap" }}>{fmtBaht(q.valueNum)}</td>
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
