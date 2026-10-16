"use client";

// ─── ตารางฐานข้อมูลลูกค้าทั้งเครือ ───────────────────────────────────────────────
// HQ ดูอย่างเดียว — มีแต่ปุ่ม "ดู" ไม่มี เพิ่ม/แก้ไข/ลบ
// ช่องที่ไม่มีข้อมูลจริง (ลูกค้าที่ยังไม่มีใบปิดการขาย) ขึ้น "—" ไม่เดาแทน
import { Eye } from "lucide-react";
import { ตรึงคอลัมน์ปุ่ม } from "@pms/shared/components/ui/stickyActionCol";
import { customerCode, fmtISOToThai } from "@pms/shared/lib/mock";
import { regionOf } from "@pms/shared/lib/customerDb";
import type { HQCustomerPageRow } from "@pms/shared/lib/data/ports";
import { ClickableRow } from "@pms/shared/components/ui/ClickableRow";
import { TablePagination, ROWS_PER_PAGE } from "@pms/shared/components/ui/TablePagination";

const PRIMARY = "#003366";
const DASH = <span style={{ color: "#9ca3af" }}>—</span>;

function fmtM(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString("th-TH");
}

export function CustomerTable({ rows, onView, pagination, loading }: {
  rows: HQCustomerPageRow[]; onView: (r: HQCustomerPageRow) => void;
  /** หน้าปัจจุบัน/จำนวนทั้งหมด — ไม่ส่งมา (local, ยังไม่กลับ) ก็ยังมีแถบ โดยนับจากแถวที่เห็นอยู่ */
  pagination?: { page: number; pageCount: number; total: number; onPage: (p: number) => void };
  /** true = RPC หน้าแรกยังไม่กลับ (supabase) — ต้องแยกจาก "กรองแล้วไม่เจอจริง ๆ" ไม่งั้นโชว์ "ไม่พบลูกค้า"
   *  ทั้งที่กำลังโหลดอยู่ (ผู้ใช้เข้าใจผิดว่าไม่มีข้อมูล + คลิกแถวก็ไม่มีอะไรเกิดขึ้นเพราะยังไม่มีแถวจริง) */
  loading?: boolean;
}) {
  return (
    <div className="table-wrap" style={{ borderTop: "none" }}>
      <table>
        {/* ความกว้างทุกคอลัมน์กำหนดที่นี่เท่านั้น (table-layout: fixed) — เพิ่ม/ลบคอลัมน์ต้องแก้ที่นี่ด้วย
            ถอดคอลัมน์ "ประเภทอาคาร" + "แม่แบบ" (เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69) → 19% ยกให้คอลัมน์ "ลูกค้า" */}
        <colgroup>
          <col style={{ width: "7%", minWidth: 92 }} />{/* รหัสลูกค้า */}
          <col style={{ width: "34%", minWidth: 200 }} />{/* ลูกค้า — ยาวเกินตัด + tooltip */}
          <col style={{ width: "5%", minWidth: 60 }} />{/* รหัสดีลเลอร์ */}
          <col style={{ width: "12%", minWidth: 130 }} />{/* ชื่อดีลเลอร์ */}
          <col style={{ width: "8%", minWidth: 84 }} />{/* จังหวัด */}
          <col style={{ width: "7%", minWidth: 76 }} />{/* ภาค */}
          <col style={{ width: "7%", minWidth: 96 }} />{/* ยอดซื้อรวม — หัวคอลัมน์ต้องอ่านครบ (th ไม่ตัดบรรทัด) */}
          <col style={{ width: "8%", minWidth: 92 }} />{/* ซื้อล่าสุด */}
          <col style={{ width: "4%", minWidth: 56 }} />{/* ปุ่มดู */}
        </colgroup>
        <thead>
          <tr>
            <th>รหัสลูกค้า</th>
            <th>ลูกค้า</th>
            <th style={{ paddingRight: 0 }}>รหัส</th>
            <th style={{ paddingLeft: 8 }}>ชื่อดีลเลอร์</th>
            <th>จังหวัด</th>
            <th>ภาค</th>
            <th className="num">ยอดซื้อรวม</th>
            <th>ซื้อล่าสุด</th>
            {/* คอลัมน์ปุ่มตรึงไว้ขวาสุด — ตารางกว้างเกินจอ 1280 ปุ่มเคยหลุดออกนอกกรอบ (26 ส.ค. 69) */}
            <th style={ตรึงคอลัมน์ปุ่ม(true)}></th>{/* ปุ่มดู — ไม่ต้องมีหัวคอลัมน์ */}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={9} style={{ textAlign: "center", padding: "40px 14px", color: "#6b7280" }}>
                {loading ? "กำลังโหลด…" : "ไม่พบลูกค้า"}
              </td>
            </tr>
          ) : (
            rows.map(c => (
              // c.id นับแยกต่อสาขา (ไม่ใช่เลขทั้งเครือ) — สาขาต่างกันมี id ชนกันได้ปกติ (เช่นทุกสาขามีลูกค้า id=1)
              // key ต้องกันชนด้วย dealerCode คู่กัน ไม่งั้น React เจอ key ซ้ำข้ามสาขา (duplicate key warning จริง)
              <ClickableRow key={`${c.dealerCode}-${c.id}`} onActivate={() => onView(c)} label={`เปิดรายละเอียดลูกค้า ${c.name}`}>
                <td style={{ whiteSpace: "nowrap", fontWeight: 700, color: PRIMARY, fontFamily: "monospace" }}>
                  {customerCode(c.dealerCode, c.id)}
                </td>
                <td style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={c.name}>{c.name}</td>
                <td style={{ whiteSpace: "nowrap", fontWeight: 700, color: PRIMARY, paddingRight: 0 }}>{c.dealerCode}</td>
                <td style={{ whiteSpace: "nowrap", paddingLeft: 8, overflow: "hidden", textOverflow: "ellipsis" }} title={c.dealerName}>{c.dealerName}</td>
                <td style={{ whiteSpace: "nowrap" }}>{c.province || DASH}</td>
                <td style={{ whiteSpace: "nowrap", color: "#6b7280" }}>{regionOf(c.province) ?? DASH}</td>
                <td className="num" style={{ whiteSpace: "nowrap", fontWeight: c.totalValue > 0 ? 700 : 400, color: c.totalValue > 0 ? PRIMARY : "#6b7280" }}>
                  {c.totalValue > 0 ? fmtM(c.totalValue) : DASH}
                </td>
                <td style={{ whiteSpace: "nowrap", color: "#6b7280" }}>{c.lastPurchaseAt ? fmtISOToThai(c.lastPurchaseAt) : DASH}</td>
                <td onClick={e => e.stopPropagation()} style={ตรึงคอลัมน์ปุ่ม()}>
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button title="ดูรายละเอียด" onClick={() => onView(c)}
                      style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid #dbe3ec", background: "#fff", color: PRIMARY, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Eye size={13} />
                    </button>
                  </div>
                </td>
              </ClickableRow>
            ))
          )}
        </tbody>
      </table>
      {/* แถบเปลี่ยนหน้าแสดงตลอด แม้มีหน้าเดียว (มาตรฐานทุกตาราง HQ) */}
      <TablePagination
        page={pagination ? pagination.page : 0}
        total={pagination ? pagination.total : rows.length}
        onPage={pagination ? pagination.onPage : () => {}}
        size={ROWS_PER_PAGE}
        unit="ราย"
      />
    </div>
  );
}
