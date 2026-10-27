"use client";

// ─── การ์ด KPI ลูกค้าทั้งเครือ 4 ใบ (บอสสั่ง 22 ต.ค. 69 · ใบ 0246) — ตัวเลขคิดที่ฐาน (kpi_cards hq.customers) ─────────────
//   ลูกค้าทั้งหมด · ลูกค้าใหม่เดือนนี้ (ตามวันที่เป็นลูกค้า) · ยอดขายเดือนนี้ (ตามวันลูกค้าตอบรับ) · ดีลเลอร์ที่มีลูกค้า X จาก Y · ไม่นับแถว HQ
//   หน้านี้ไม่มีตัวกรองช่วงเวลา (บอสสั่งห้ามใส่ — เป็นฐานข้อมูลหลังปิดการขาย) → "ในช่วงนี้" = เดือนนี้ เขียนบนการ์ด (บอสตัดสิน 27 ต.ค. 69)
//   ตารางหลักแบ่งหน้าที่ฐานและไม่มีตัวกรองวันที่เป็นลูกค้า → กดการ์ดใหม่/ยอดขาย = รายชื่อจากฐานใต้แถวการ์ด (กดชื่อ = เปิดแผงลูกค้า)
//   การ์ดเดิม "ยังซื้ออยู่ / ลูกค้าซื้อซ้ำ / มูลค่ารวม" ถูกแทนด้วยชุดนี้ (ตัวกรองช่วงที่ซื้อยังอยู่ในแถบตัวกรอง)
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Users, UserPlus, Coins, Store } from "lucide-react";
import { KpiRow, KpiCard } from "@pms/shared/components/ui/KpiCard";
import { useKpiCards } from "@pms/shared/lib/useKpiCards";
import { ค่า, นับ, บาทเต็ม, type KpiFilters } from "@pms/shared/lib/kpiCards";
import { fmtISOToThai } from "@pms/shared/lib/mock";

type แถวรายชื่อ = { id: number | null; company: string; dealerCode: string; joinDate?: string; value?: number };

export function CustomerKPICards({ ช่วง, today, ตัวกรอง = null, รุ่น, onOpen, onClear }: {
  ช่วง: { start: string; end: string };
  today: string;
  /** ตัวกรองของตาราง (สาขา/จังหวัด/คำค้น/ช่วงที่ซื้อ) — การ์ดเดินตามตัวกรอง (บอสตัดสิน 27 ต.ค. 69) */
  ตัวกรอง?: KpiFilters | null;
  รุ่น?: unknown;
  /** กดชื่อในรายการใต้การ์ด = เปิดแผงลูกค้า */
  onOpen: (id: number) => void;
  /** กดการ์ด "ลูกค้าทั้งหมด" = ล้างตัวกรองของตาราง */
  onClear: () => void;
}) {
  const router = useRouter();
  const kpi = useKpiCards("hq.customers", { ...ช่วง, today, filters: ตัวกรอง, รุ่น });
  const [รายการ, setรายการ] = useState<"new" | "sales" | null>(null);
  const แถว = (รายการ ? (kpi?.[รายการ === "new" ? "newList" : "salesList"] as แถวรายชื่อ[] | undefined) : undefined) ?? [];
  const สลับ = (k: "new" | "sales") => setรายการ(v => (v === k ? null : k));
  return (
    <>
      <KpiRow label="สรุปลูกค้าทั้งเครือ" range={ช่วง} style={{ marginBottom: รายการ ? 10 : undefined }}>
        <KpiCard kpi="total" label="ลูกค้าทั้งหมด" value={นับ(ค่า(kpi, "total"))} rawValue={ค่า(kpi, "total")} unit="ราย · ไม่นับสำนักงานใหญ่" icon={Users}
          onClick={() => { setรายการ(null); onClear(); }} />
        <KpiCard kpi="new" label="ลูกค้าใหม่เดือนนี้" value={นับ(ค่า(kpi, "new"))} rawValue={ค่า(kpi, "new")} unit="ราย · ตามวันที่เป็นลูกค้า" icon={UserPlus}
          color="#7C3AED" bg="#F3E8FF" actionLabel={รายการ === "new" ? "กดอีกครั้งเพื่อปิดรายการ" : "ดูรายการ"} onClick={() => สลับ("new")} />
        <KpiCard kpi="sales" label="ยอดขายเดือนนี้" value={บาทเต็ม(ค่า(kpi, "sales"))} rawValue={ค่า(kpi, "sales")} unit="ใบที่ตอบรับ · ตามวันลูกค้าตอบรับ ก่อน VAT"
          icon={Coins} color="#0891B2" bg="#E6F4F9" actionLabel={รายการ === "sales" ? "กดอีกครั้งเพื่อปิดรายการ" : "ดูรายการ"} onClick={() => สลับ("sales")} />
        <KpiCard kpi="dealers" label="ดีลเลอร์ที่มีลูกค้า" value={ค่า(kpi, "dealers.with") == null ? null : `${ค่า(kpi, "dealers.with")} จาก ${ค่า(kpi, "dealers.of")}`}
          rawValue={ค่า(kpi, "dealers.with")} unit="ราย · มีลูกค้าอย่างน้อย 1 ราย" icon={Store} color="#059669" bg="#E6F6EF" onClick={() => router.push("/hq/dealers")} />
      </KpiRow>
      {รายการ && (
        <div className="card" data-panel="kpi-customers" style={{ marginBottom: "1.25rem" }}>
          <div className="card-header"><div className="card-title">{รายการ === "new" ? "ลูกค้าใหม่เดือนนี้" : "ยอดขายเดือนนี้ (รายลูกค้า)"} · {แถว.length} ราย</div></div>
          <div className="card-body">
            <div className="table-wrap">
              <table aria-label={รายการ === "new" ? "ลูกค้าใหม่เดือนนี้" : "ยอดขายเดือนนี้"}>
                <colgroup><col style={{ width: "55%" }} /><col style={{ width: "20%" }} /><col style={{ width: "25%" }} /></colgroup>
                <thead><tr><th>ลูกค้า</th><th>ดีลเลอร์</th><th className={รายการ === "sales" ? "num" : undefined}>{รายการ === "new" ? "วันที่เป็นลูกค้า" : "ยอดขาย (ก่อน VAT)"}</th></tr></thead>
                <tbody>
                  {แถว.length === 0 && <tr><td colSpan={3} className="empty-row">ไม่มีในเดือนนี้</td></tr>}
                  {แถว.map((r, i) => (
                    <tr key={`${r.id ?? "x"}-${i}`} data-kpi-list-row className={r.id != null ? "clickable" : undefined} onClick={() => r.id != null && onOpen(r.id)}>
                      <td>{r.company || "—"}</td><td>{r.dealerCode}</td>
                      <td className={รายการ === "sales" ? "num" : undefined}>{รายการ === "new" ? (r.joinDate ? fmtISOToThai(r.joinDate) : "—") : บาทเต็ม(Number(r.value ?? 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
