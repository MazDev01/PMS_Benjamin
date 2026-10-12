"use client";

// ─── ตารางใบเสนอราคาทั้งเครือ ─────────────────────────────────────────────────
// อ่านอย่างเดียว — มีปุ่ม "ดู" เท่านั้น ไม่มีสร้าง/แก้ไข/ลบ/อนุมัติ (HQ เป็นเจ้าของข้อมูล แต่ไม่ออกใบเอง)
// คอลัมน์เกี่ยวกับการเปิดอ่าน ถูกลบทั้งหมดพร้อมสถานะ "เปิดอ่านแล้ว"
import { Eye } from "lucide-react";
import { ตรึงคอลัมน์ปุ่ม } from "@pms/shared/components/ui/stickyActionCol";
import { quotationStatusLabel, quotationStatusColor } from "@pms/shared/lib/mock";
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
        <table>
          {/* ความกว้างคุมที่ colgroup เท่านั้น (ตาราง table-layout:fixed — ใส่ที่ th ไม่มีผล)
              minWidth ทุกช่องวัดจากเบราว์เซอร์จริง (td padding ข้างละ 16px) ด้วยกฎ 2 ข้อ:
                1) หัวคอลัมน์ห้ามโดนตัดทุกขนาดจอ → minWidth ต้อง ≥ ความกว้างหัว
                2) เลขที่/จังหวัด/มูลค่า/สถานะ/วันที่/ปุ่ม = ตัดไม่ได้ → minWidth ≥ ความกว้างข้อมูล
                   ดีลเลอร์/ลูกค้า/ประเภทอาคาร = ชื่อยาวตัด … ได้ตามปกติ
              รวม minWidth = 1098px → พอดีตั้งแต่จอ 1440 ขึ้นไป
              จอแคบกว่านั้น (1280/1366) เลื่อนแนวนอนใน .table-wrap — 11 คอลัมน์ยังไงก็ไม่พอ
              เพิ่ม/ลบคอลัมน์เมื่อไร ต้องมาวัดใหม่และแก้ colgroup ด้วยเสมอ */}
          <colgroup>
            <col style={{ width: "10%", minWidth: 120 }} />{/* เลขที่ — "Q-2026-0089" ต้องการ 111px */}
            <col style={{ width: "6%", minWidth: 72 }} />{/* รหัส */}
            <col style={{ width: "9%", minWidth: 88 }} />{/* ดีลเลอร์ — ชื่อยาวตัด … ได้ */}
            <col style={{ width: "9%", minWidth: 88 }} />{/* ลูกค้า — ชื่อยาวตัด … ได้ */}
            <col style={{ width: "12%", minWidth: 128 }} />{/* จังหวัดดีลเลอร์ — "พระนครศรีอยุธยา" ต้องการ 125px */}
            <col style={{ width: "10%", minWidth: 104 }} />{/* ประเภทอาคาร — หัวกว้าง 100px · ชื่อยาวตัด … ได้ */}
            <col style={{ width: "7%", minWidth: 84 }} />{/* มูลค่า */}
            <col style={{ width: "8%", minWidth: 94 }} />{/* สถานะ */}
            <col style={{ width: "10%", minWidth: 116 }} />{/* วันที่สร้าง — "27 มิ.ย. 2569" ต้องการ 107px */}
            <col style={{ width: "10%", minWidth: 116 }} />{/* ใช้ได้ถึง */}
            <col style={{ width: "5%", minWidth: 52 }} />{/* ปุ่มดู — ไอคอนล้วน ไม่ต้องเผื่อที่ให้ข้อความ */}
          </colgroup>
          <thead>
            <tr>
              <th>เลขที่</th>
              <th>รหัส</th>
              <th>ดีลเลอร์</th>
              <th>ลูกค้า</th>
              {/* จังหวัดของดีลเลอร์ที่ออกใบ — ไม่ใช่จังหวัดลูกค้า (ใบเสนอราคาไม่เก็บจังหวัดของตัวเอง) */}
              <th>จังหวัดดีลเลอร์</th>
              <th>ประเภทอาคาร</th>
              <th className="num">มูลค่า</th>
              <th>สถานะ</th>
              <th>วันที่สร้าง</th>
              <th>ใช้ได้ถึง</th>
              {/* คอลัมน์ปุ่มตรึงไว้ขวาสุด — ตารางกว้างเกินจอ 1280 (26 ส.ค. 69) */}
              <th style={ตรึงคอลัมน์ปุ่ม(true)}>ดู</th>
            </tr>
          </thead>
          <tbody>
            {!rows.length ? (
              <tr><td colSpan={11} style={{ textAlign: "center", padding: "32px 14px", color: MUTED }}>ไม่พบข้อมูลที่ค้นหา</td></tr>
            ) : rows.map(q => {
              const sc = quotationStatusColor[q.status];
              // คีย์ต้องพ่วงรหัสสาขา — เลขที่ใบไม่ซ้ำ "เฉพาะภายในสาขา" (คีย์จริง = สาขา + เลขที่)
              // ตารางนี้รวมใบของทุกสาขา เลขเดียวกันจากคนละสาขาจึงชนกันได้ (กับดักเดียวกับหน้าลูกค้าเป้าหมาย 7 ส.ค. 69)
              return (
                <ClickableRow key={`${q.dealerCode ?? ""}-${q.id}`} onActivate={() => onView(q)} label={`เปิดรายละเอียดใบเสนอราคา ${q.quoteNo}`}>
                  <td style={{ color: PRIMARY, fontWeight: 700, whiteSpace: "nowrap" }}>{q.quoteNo}</td>
                  <td>
                    <span className="badge" style={{ background: "#eef2f7", color: PRIMARY, fontFamily: "monospace" }}>{q.dealerCode}</span>
                  </td>
                  {/* ชื่อยาวตัด … — ใส่ title ให้ hover อ่านเต็มได้ (ชื่อเต็มอยู่ในลิ้นชักด้วย) */}
                  <td title={q.dealerName} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{q.dealerName}</td>
                  <td title={q.customer} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{q.customer}</td>
                  <td title={`จังหวัดของดีลเลอร์ ${q.dealerName}`} style={{ color: MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{q.dealerProvince}</td>
                  <td title={q.productLine} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{q.productLine}</td>
                  <td className="num" style={{ color: PRIMARY, fontWeight: 800, whiteSpace: "nowrap" }}>{fmtBaht(q.valueNum)}</td>
                  <td>
                    <span className="badge" style={{ background: sc.bg, color: sc.text, whiteSpace: "nowrap" }}>{quotationStatusLabel[q.status]}</span>
                  </td>
                  {/* คอลัมน์ "เปิดอ่าน" ถูกลบพร้อมสถานะเปิดอ่านแล้ว */}
                  <td style={{ color: MUTED, fontSize: "0.78rem", whiteSpace: "nowrap" }}>{q.createdAt}</td>
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
