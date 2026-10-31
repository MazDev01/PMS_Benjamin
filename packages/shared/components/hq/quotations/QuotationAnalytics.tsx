"use client";

// ─── ส่วนกราฟใบเสนอราคาทั้งเครือ (บอสสั่ง 30 ต.ค. 69 · FLOW แถว /hq/quotations) ─────────────────────────
//   เหลือ 2 ใบวางคู่ (กว้าง 2 : 1): กราฟรายเดือน "ใบที่ส่ง" เทียบ "ตอบรับ" · อายุใบที่รอลูกค้าตอบ
//   เอาออก: "อัตราลูกค้าเป้าหมายที่ออกใบ แยกตามดีลเลอร์" (ผลงานดีลเลอร์อยู่ภาพรวมยอดขายที่เดียว)
//          "เทียบรายภูมิภาค" (ซ้ำแดชบอร์ด · เดิมนับร่าง/ถูกแทนที่ปน) · "เหตุผลที่เสียโอกาส" (เป็นของลีด อยู่หน้าลูกค้าเป้าหมาย)
//   กราฟรายเดือน = "รอข้อมูล": ตัวนับรายเดือนที่ฐาน (byMonth) นับใบร่าง/ถูกแทนที่ปน และนับตามวันที่ของใบ
//     ต้องให้ฐานนับ "ใบที่ส่ง (ตามวันที่ส่ง)" กับ "ตอบรับ (ตามวันตอบรับ)" ให้ก่อน — ห้ามคิดเองในหน้าเว็บ (รอบรวมงานฐาน)
import { QuotationAgingChart } from "./QuotationAgingChart";
import type { AgingBucket } from "@pms/shared/lib/hqQuotations";
import { GroupedBarChart } from "@pms/shared/components/ui/Charts";

/** รายเดือน = ใบที่ส่ง/ตอบรับในช่วงที่เลือก (ฐานคิด byMonthSent · ใบ 0268) · null = ฐานยังไม่ถึงใบนั้น → รอข้อมูล
 *  ผลรวมทุกเดือน = การ์ด "ส่งลูกค้าในช่วงนี้" / จำนวนใบในการ์ด "ตอบรับ" (ช่วง · สาขา · คำค้นชุดเดียวกัน) */
export function QuotationAnalytics({ aging, รายเดือน }: { aging: { key: AgingBucket; count: number; value: number }[];
  รายเดือน: { months: string[]; sent: number[]; won: number[] } | null }) {
  return (
    <div className="hq-quote-charts">
      <div className="card" data-chart="quote-monthly" data-waiting={รายเดือน ? undefined : "1"}
        data-sum-sent={รายเดือน ? รายเดือน.sent.reduce((a, b) => a + b, 0) : undefined} data-sum-won={รายเดือน ? รายเดือน.won.reduce((a, b) => a + b, 0) : undefined} style={{ marginBottom: 0 }}>
        <div className="card-header"><div className="card-title">ใบเสนอราคารายเดือน: ใบที่ส่ง เทียบ ตอบรับ</div></div>
        {รายเดือน ? (
          <div className="card-body" style={{ paddingTop: 6 }}>
            {/* แกนตั้งเลขกลม (จำนวนใบ) · ใบที่ส่งตามวันที่ส่ง · ตอบรับตามวันลูกค้าตอบรับ */}
            <GroupedBarChart months={รายเดือน.months} vw={760} height={260} fmt={v => `${Math.round(v)}`}
              series={[{ name: "ใบที่ส่ง", color: "#003366", data: รายเดือน.sent }, { name: "ตอบรับ", color: "#059669", data: รายเดือน.won }]} />
          </div>
        ) : (
          <div className="card-body" style={{ minHeight: 220, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", color: "var(--muted-foreground)", fontSize: "0.8rem", lineHeight: 1.7 }}>
            <div><strong style={{ color: "#374151" }}>รอข้อมูล</strong><br />ฐานข้อมูลยังไม่นับใบที่ส่งรายเดือนแยกจากใบร่าง/ถูกแทนที่</div>
          </div>
        )}
      </div>
      <div data-chart="aging" data-sum={aging.reduce((s, a) => s + a.count, 0)}>
        <QuotationAgingChart aging={aging} />
      </div>
    </div>
  );
}
