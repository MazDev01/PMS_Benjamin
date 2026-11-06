"use client";

// ─── ตารางฐานข้อมูลลูกค้าทั้งเครือ ───────────────────────────────────────────────
// HQ ดูอย่างเดียว — มีแต่ปุ่ม "ดู" ไม่มี เพิ่ม/แก้ไข/ลบ
// ช่องที่ไม่มีข้อมูลจริง (ลูกค้าที่ยังไม่มีใบปิดการขาย) ขึ้น "—" ไม่เดาแทน
import { Eye } from "lucide-react";
import { ตรึงคอลัมน์ปุ่ม } from "@pms/shared/components/ui/stickyActionCol";
import { customerCode, fmtISOToThai } from "@pms/shared/lib/mock";
import { regionOf } from "@pms/shared/lib/customerDb";
import { ชื่อภาค } from "@pms/shared/lib/provinces";
import type { HQCustomerPageRow } from "@pms/shared/lib/data/ports";
import { ClickableRow } from "@pms/shared/components/ui/ClickableRow";
import { TablePagination, ROWS_PER_PAGE } from "@pms/shared/components/ui/TablePagination";
import { useชื่อดีลเลอร์ } from "@pms/shared/lib/dealerDisplay";

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
  const ชื่อของ = useชื่อดีลเลอร์();   // ชื่อแสดง ไม่มีรหัส · ชื่อซ้ำ = "ชื่อ (รหัส)" (บอสสั่ง 6 พ.ย. 69)
  return (
    <div className="table-wrap" style={{ borderTop: "none" }}>
      <table aria-label="รายชื่อลูกค้า">
        {/* ความกว้างทุกคอลัมน์กำหนดที่นี่เท่านั้น (table-layout: fixed) — เพิ่ม/ลบคอลัมน์ต้องแก้ที่นี่ด้วย
            ถอดคอลัมน์ "ประเภทอาคาร" + "แม่แบบ" (เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69) → 19% ยกให้คอลัมน์ "ลูกค้า" */}
        {/* 30 ต.ค. 69 บอสสั่ง: รหัสลูกค้า · ลูกค้า · ดีลเลอร์ (รหัส+ชื่อช่องเดียว) · จังหวัด · ภูมิภาค · ยอดซื้อรวม · ซื้อล่าสุด · ดู
            รหัสลูกค้า/จังหวัด/ภูมิภาค/ยอด/วันที่ = กว้างตายตัวพอดีข้อความ (ไม่ตัด) · ลูกค้า/ดีลเลอร์แบ่งที่เหลือ · ชื่อลูกค้า/ดีลเลอร์ยาวเกิน = ตัด + แสดงเต็มเมื่อชี้ */}
        <colgroup>
          <col style={{ width: 160 }} />{/* รหัสลูกค้า เช่น RYG-90039 · รหัสสาขา 5 ตัว + เลขยาว ต้องไม่ตัด (กว้างตายตัว) */}
          <col style={{ width: "50%" }} />{/* ลูกค้า */}
          <col style={{ width: "50%" }} />{/* ดีลเลอร์ = รหัส + ชื่อ */}
          <col style={{ width: 130 }} />{/* จังหวัด */}
          <col style={{ width: 190 }} />{/* ภูมิภาค — "ภาคตะวันออกเฉียงเหนือ" ห้ามตัด */}
          <col style={{ width: 120 }} />{/* ยอดซื้อรวม */}
          <col style={{ width: 120 }} />{/* ซื้อล่าสุด — วันที่ไม่ตัด */}
          <col style={{ width: 56 }} />{/* ปุ่มดู */}
        </colgroup>
        <thead>
          <tr>
            <th>รหัสลูกค้า</th>
            <th>ลูกค้า</th>
            <th>ดีลเลอร์</th>
            <th>จังหวัด</th>
            <th>ภูมิภาค</th>
            <th className="num">ยอดซื้อรวม</th>
            <th>ซื้อล่าสุด</th>
            {/* คอลัมน์ปุ่มตรึงไว้ขวาสุด — ตารางกว้างเกินจอ 1280 ปุ่มเคยหลุดออกนอกกรอบ (26 ส.ค. 69) */}
            <th style={ตรึงคอลัมน์ปุ่ม(true)}></th>{/* ปุ่มดู — ไม่ต้องมีหัวคอลัมน์ */}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={8} style={{ textAlign: "center", padding: "40px 14px", color: "#6b7280" }}>
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
                <td data-col="dealer" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={ชื่อของ(c.dealerCode, c.dealerName)}>
                  {ชื่อของ(c.dealerCode, c.dealerName)}
                </td>
                <td style={{ whiteSpace: "nowrap" }}>{c.province || DASH}</td>
                <td data-col="region" style={{ whiteSpace: "nowrap", color: "#6b7280" }}>{regionOf(c.province) ? ชื่อภาค(regionOf(c.province)) : DASH}</td>
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
