"use client";

// ── ย้อนการตอบรับ (บอสตัดสิน 18 พ.ย. 69 · ใบ 0288 · เดิมเฉพาะสำนักงานใหญ่): ดีลเลอร์เจ้าของใบ ภายใน 7 วันหลังตอบรับ · ต้องมีเหตุผล ──
//   อยู่ที่หน้าต่างงานของลูกค้า (หน้าลูกค้า › ประวัติการซื้อ › กดรายการ) — ใบที่ตอบรับแล้ว = งานของลูกค้า
//     (แผงลีดเปิดลีดที่ปิดการขายสำเร็จไม่ได้ ส่งต่อไปหน้าลูกค้า · แผงดูใบดูอย่างเดียว) · HQ ไม่มีปุ่มนี้ (ดูอย่างเดียว)
//   ฐานตรวจซ้ำทุกข้อ (สาขา · 7 วันจากวันตอบรับที่ฐานเก็บ · เหตุผล) · ลีดกลับขั้นก่อนปิด · ไทม์ไลน์ · บันทึกการใช้งาน · แจ้ง HQ
//   ข้อทดสอบ: customer-quote-flow.spec [D8r] · flow-a-safety [ก·4] · reason-buttons (กล่องเหตุผลกลาง)
import { ถามเหตุผล, แจ้งสำเร็จ } from "@pms/shared/components/ui/ConfirmToast";
import { useSales } from "@pms/shared/context/SalesContext";
import { quoteRequests as quoteRequestsRepo } from "@pms/shared/lib/data";
import { dealerCodeOf } from "@pms/shared/lib/dealerCode";
import type { QuotationMock } from "@pms/shared/lib/mock";

const เจ็ดวัน = 7 * 24 * 3_600_000;
/** ใบนี้ย้อนการตอบรับได้ไหม (ตอบรับแล้ว · มีวันตอบรับ · ไม่เกิน 7 วัน) — ฐานตรวจซ้ำ */
export const ย้อนการตอบรับได้ = (q: QuotationMock, ตอนนี้ = Date.now()) =>
  q.status === "won" && !!q.wonAt && ตอนนี้ - Date.parse(q.wonAt) <= เจ็ดวัน;

export function RevertWonButton({ q, onDone }: { q: QuotationMock; onDone?: (to: "sent_to_client" | "lost") => void }) {
  const { refreshSales } = useSales();
  if (!ย้อนการตอบรับได้(q)) return null;
  async function ย้อน(to: "sent_to_client" | "lost") {
    const ป้าย = to === "lost" ? "ลูกค้าปฏิเสธ" : "ส่งให้ลูกค้าแล้ว";
    if (!(await ถามเหตุผล({
      หัวข้อ: `ย้อนการตอบรับใบ ${q.id} เป็น “${ป้าย}” ?`,
      รายละเอียด: "ยอดขายของใบนี้จะไม่นับแล้ว · ลูกค้าเป้าหมายกลับไปขั้นก่อนปิดการขาย · บันทึกในประวัติพร้อมเหตุผล และแจ้งสำนักงานใหญ่",
      ป้ายช่อง: "เหตุผลที่ย้อน", ปุ่มตกลง: "ย้อนการตอบรับ", ปุ่มกำลังทำ: "กำลังย้อนการตอบรับ…", อันตราย: true,
      ทำ: async reason => { await quoteRequestsRepo.revertWon(dealerCodeOf(q), q.id, reason, to); await refreshSales(); },
    }))) return;
    แจ้งสำเร็จ(`ย้อนการตอบรับใบ ${q.id} เป็น “${ป้าย}” แล้ว — แจ้งสำนักงานใหญ่แล้ว`);
    onDone?.(to);
  }
  return (
    <div data-revert-won={q.id} style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <span style={{ fontSize: "0.68rem", color: "#9A3412" }}>ลูกค้าเปลี่ยนใจ? ย้อนได้ภายใน 7 วันหลังตอบรับ</span>
      <button type="button" onClick={() => void ย้อน("sent_to_client")} className="btn btn-secondary btn-sm" style={{ height: 28, padding: "0 11px" }}>ย้อนเป็นส่งให้ลูกค้าแล้ว</button>
      <button type="button" onClick={() => void ย้อน("lost")} className="btn btn-sm" style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", height: 28, padding: "0 11px" }}>ย้อนเป็นลูกค้าปฏิเสธ</button>
    </div>
  );
}
