"use client";

// ─── การ์ด KPI ใบเสนอราคาทั้งเครือ 4 ใบ (บอสสั่ง 22 ต.ค. 69 · ใบ 0246) — ตัวเลขคิดที่ฐาน (kpi_cards hq.quotations) ───────
//   ส่งลูกค้าในช่วงนี้ · รอลูกค้าตอบ (ณ ตอนนี้) · ตอบรับ (มูลค่า · ตามวันลูกค้าตอบรับ) · อัตราตอบรับใบเสนอราคา (ตอบรับ ÷ ใบที่ส่งในช่วง)
//   ช่วงเวลา + ดีลเลอร์ + ภาค/จังหวัด/ค้นหา คุมการ์ด (บอสตัดสิน 27 ต.ค. 69 เดินตามตัวกรอง) · ไม่นับแถว HQ · ใบถูกแทนที่ไม่นับ
//   กดการ์ด = ตารางกรองสถานะที่ตรงเรื่อง (กดซ้ำ = ล้าง)
import { Send, Hourglass, CheckCircle2, Percent } from "lucide-react";
import type { QuotationStatus } from "@pms/shared/lib/mock";
import { KpiRow, KpiCard } from "@pms/shared/components/ui/KpiCard";
import { useKpiCards } from "@pms/shared/lib/useKpiCards";
import { ค่า, นับ, บาทเต็ม, type KpiFilters } from "@pms/shared/lib/kpiCards";

export function QuotationKPICards({ ช่วง, dealer, today, ตัวกรอง = null, รุ่น, status, onStatus }: {
  ช่วง: { start: string; end: string };
  dealer: string | null;
  today: string;
  /** ตัวกรองอื่นของหน้า (สาขาที่ผ่านภาค/จังหวัด · คำค้น) */
  ตัวกรอง?: KpiFilters | null;
  รุ่น?: unknown;
  status: QuotationStatus | "all";
  onStatus: (s: QuotationStatus | "all") => void;
}) {
  const kpi = useKpiCards("hq.quotations", { ...ช่วง, dealer, today, filters: ตัวกรอง, รุ่น });
  const กด = (s: QuotationStatus | "all") => onStatus(status === s ? "all" : s);
  const ป้ายกด = (s: QuotationStatus | "all") => (status === s && s !== "all" ? "กดอีกครั้งเพื่อล้างตัวกรอง" : "ดูรายการ");
  return (
    <KpiRow label="สรุปใบเสนอราคาทั้งเครือ" range={ช่วง}>
      <KpiCard kpi="sent" label="ส่งลูกค้าในช่วงนี้" value={นับ(ค่า(kpi, "sent"))} rawValue={ค่า(kpi, "sent")} unit="ใบ · ไม่นับร่าง/ถูกแทนที่"
        icon={Send} onClick={() => onStatus("all")} />
      <KpiCard kpi="awaiting" label="รอลูกค้าตอบ" value={นับ(ค่า(kpi, "awaiting"))} rawValue={ค่า(kpi, "awaiting")} unit="ใบ · ส่งแล้ว ยังไม่ตอบ (ณ ตอนนี้)"
        icon={Hourglass} color="#EA580C" bg="#FEF0E6" actionLabel={ป้ายกด("sent_to_client")} onClick={() => กด("sent_to_client")} />
      <KpiCard kpi="won" label="ตอบรับ (มูลค่า)" value={บาทเต็ม(ค่า(kpi, "won.value"))} rawValue={ค่า(kpi, "won.value")}
        unit={`${นับ(ค่า(kpi, "won.count")) ?? "—"} ใบ · ตามวันลูกค้าตอบรับ ก่อน VAT`} icon={CheckCircle2} color="#059669" bg="#E6F6EF"
        actionLabel={ป้ายกด("won")} onClick={() => กด("won")} />
      {/* ⚠️ ชื่อการ์ดบอกตัวหารให้ชัด — หารด้วยใบที่ส่งในช่วง (รวมที่ยังไม่ตอบ) ต่างจาก "อัตราปิดการขาย" ที่นับจากลีด */}
      <KpiCard kpi="acceptRate" label="อัตราตอบรับใบเสนอราคา" value={ค่า(kpi, "acceptRate") == null ? null : `${Number(ค่า(kpi, "acceptRate")).toFixed(1)}%`}
        rawValue={ค่า(kpi, "acceptRate")} unit="ตอบรับ ÷ ใบที่ส่งในช่วงนี้" empty={kpi ? "ยังไม่มีใบที่ส่งในช่วงนี้" : "กำลังโหลด…"}
        icon={Percent} color="#7C3AED" bg="#F1EBFD" onClick={() => onStatus("all")} />
    </KpiRow>
  );
}
