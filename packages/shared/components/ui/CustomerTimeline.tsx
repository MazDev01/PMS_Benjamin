"use client";

// ─── เส้นเวลาของลูกค้า — แท็บ "ประวัติ" ในหน้าต่างลูกค้า HQ + ดีลเลอร์ (ตัวกลางเดียว · บอสสั่ง 19 พ.ย. 69) ───────────
//   ทุกงานของลูกค้ารายนี้ ใหม่สุดก่อน: เป็นลูกค้าเป้าหมาย · ขอราคาจาก HQ · HQ ส่งใบ · ส่งใบให้ลูกค้า · นัดหมาย · บันทึก · ตอบรับ/ปฏิเสธ/ย้อน · เป็นลูกค้า
//   เฉพาะเหตุการณ์ที่ระบบบันทึกจริง (lib/customerTimeline · อ่านที่ฐานด้วยสิทธิ์ผู้เรียก — ดีลเลอร์เห็นเฉพาะสาขาตัวเอง)
//   ไม่มีวันที่ = ไม่แสดง · ไม่มีเหตุการณ์ที่ระบบคิดเอง (เดิม HQ แสดงแค่ "ปิดการขาย" จากใบที่ตอบรับ)
//   data-timeline-event = ชนิด (ข้อทดสอบนับเทียบฐาน · customer-timeline.spec)
import { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { customers as customersRepo } from "@pms/shared/lib/data";
import type { เหตุการณ์ลูกค้า, ชนิดเหตุการณ์ } from "@pms/shared/lib/customerTimeline";
import { PanelSection } from "@pms/shared/components/ui/DetailPanel";

const สี: Record<ชนิดเหตุการณ์, string> = {
  lead: "#7c3aed", request: "#0891B2", activity: "#003366", appointment: "#d97706", note: "#64748b", customer: "#059669",
};
const ป้ายชนิด: Record<ชนิดเหตุการณ์, string> = {
  lead: "ลูกค้าเป้าหมาย", request: "ขอราคา", activity: "งานขาย", appointment: "นัดหมาย", note: "บันทึก", customer: "ลูกค้า",
};
const เดือนย่อ = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
/** เวลาไทย "19 พ.ย. 2569 · 10:30" */
function เวลาไทย(iso: string): string {
  const d = new Date(Date.parse(iso) + 7 * 3600_000);
  const hh = String(d.getUTCHours()).padStart(2, "0"), mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCDate()} ${เดือนย่อ[d.getUTCMonth()]} ${d.getUTCFullYear() + 543} · ${hh}:${mm}`;
}

export function CustomerTimeline({ dealerCode, customerId }: { dealerCode: string; customerId: number }) {
  const [รายการ, setรายการ] = useState<เหตุการณ์ลูกค้า[] | null>(null);
  const [ผิด, setผิด] = useState<string | null>(null);
  useEffect(() => {
    let ยัง = true;
    setรายการ(null); setผิด(null);
    customersRepo.timeline(dealerCode, customerId)
      .then(r => { if (ยัง) setรายการ(r); })
      .catch(e => { if (ยัง) setผิด((e as Error).message || "โหลดประวัติไม่สำเร็จ"); });
    return () => { ยัง = false; };
  }, [dealerCode, customerId]);

  if (ผิด) return <div role="alert" style={{ fontSize: "0.74rem", color: "#b91c1c", padding: "8px 2px" }}>โหลดประวัติไม่สำเร็จ — {ผิด}</div>;
  if (รายการ === null) return <div data-timeline-loading style={{ fontSize: "0.74rem", color: "var(--muted-foreground)", padding: "8px 2px" }}>กำลังโหลด…</div>;
  if (!รายการ.length) return <div data-timeline-empty style={{ fontSize: "0.74rem", color: "var(--muted-foreground)", padding: "8px 2px" }}>ยังไม่มีเหตุการณ์ที่บันทึกไว้</div>;
  return (
    <PanelSection icon={Activity} title={`ประวัติ (${รายการ.length})`} style={{ marginTop: 0 }} bodyStyle={{ padding: "12px 14px" }}>
      <ol data-customer-timeline style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {รายการ.map((e, i) => (
          <li key={`${e.at}-${i}`} data-timeline-event={e.ชนิด} data-at={e.at} style={{ display: "flex", gap: 10 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
              <span style={{ width: 9, height: 9, borderRadius: 99, background: สี[e.ชนิด], marginTop: 5 }} />
              {i < รายการ.length - 1 && <span style={{ flex: 1, width: 2, background: "#e9edf2" }} />}
            </div>
            <div style={{ paddingBottom: i < รายการ.length - 1 ? 14 : 0, minWidth: 0 }}>
              <div style={{ fontSize: "0.74rem", fontWeight: 700, color: "#2D2D2D", overflowWrap: "anywhere" }}>{e.ข้อความ}</div>
              <div style={{ fontSize: "0.65rem", color: "#6b7280", marginTop: 1 }}>
                {เวลาไทย(e.at)} · {ป้ายชนิด[e.ชนิด]}{e.งาน ? ` · ${e.งาน}` : ""}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </PanelSection>
  );
}
