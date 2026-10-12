"use client";

// ─── #1 อัตราลูกค้าเป้าหมายที่ออกใบเสนอราคา แยกตามดีลเลอร์ ───────────────────
// วัดว่าแต่ละสาขาเปลี่ยน "ลูกค้าเป้าหมาย" เป็น "ใบเสนอราคา" ได้ดีแค่ไหน
// ลูกค้าเป้าหมาย = รายการจริงในระบบที่ผูก dealerCode · ใบเสนอราคา = ใบของสาขานั้นในตัวกรองปัจจุบัน
//
// ⚠️ อัตรา = ลูกค้าเป้าหมายที่ถึงขั้นเสนอราคาแล้ว (quoted) ÷ ลูกค้าเป้าหมายทั้งหมด — "ราย ÷ ราย" เท่านั้น
//    ห้ามหารด้วยจำนวนใบ: ของเดิมใช้ จำนวนใบ ÷ ราย แล้วโชว์ 150% (บริษัทเดียวออกได้หลายใบ · ใบของลูกค้าเก่า
//    ก็ถูกนับทั้งที่เจ้าตัวไม่อยู่ในตัวส่วนแล้ว) → อ่านเหมือนอัตราปิดการขายเกิน 100% ซึ่งเป็นไปไม่ได้
//    สูตรนี้ตรงกับ /hq/leads (conv) และ /hq/pipeline ("อัตราแปลงเป็นใบเสนอราคา") แล้ว — แก้ที่เดียวให้ตรงกันทั้งระบบ
//
// ⚠️ คำที่ผู้ใช้เห็นต้องเป็น "ลูกค้าเป้าหมาย" เสมอ ห้ามใช้คำว่า ลีด (บอสสั่ง 14 ส.ค. 69 — ดู thai-ui-glossary)
import { TopNRows } from "@pms/shared/components/hq/TopNRows";
import { type DealerAgg } from "@pms/shared/lib/hqQuotations";

const QUOTE_COLOR = "#003366";
const LEAD_COLOR = "#94a3b8";

// leadsByDealer = ลูกค้าเป้าหมายต่อรหัสสาขา { leads = ทั้งหมด · quoted = ถึงขั้นเสนอราคาแล้ว }
//   (supabase: lead_summary.byDealer · local: นับจาก leadRows ด้วย QUOTED_UP)
export function LeadsVsQuotationsChart({ dealerAgg, leadsByDealer }: { dealerAgg: DealerAgg[]; leadsByDealer: Record<string, { leads: number; quoted: number }> }) {
  const quoteByDealer = new Map(dealerAgg.map(d => [d.code, d]));
  const leadByDealer = new Map(Object.entries(leadsByDealer));

  // แสดงทุกสาขาที่มีลูกค้าเป้าหมายหรือมีใบเสนอราคาอย่างน้อยหนึ่งอย่าง
  const codes = [...new Set([...quoteByDealer.keys(), ...leadByDealer.keys()])];
  const bars = codes.map(code => ({
    code,
    name: quoteByDealer.get(code)?.name ?? code,
    leads: leadByDealer.get(code)?.leads ?? 0,
    quoted: leadByDealer.get(code)?.quoted ?? 0,
    quotes: quoteByDealer.get(code)?.count ?? 0,
  })).sort((a, b) => b.leads - a.leads || b.quoted - a.quoted);

  const max = Math.max(...bars.map(b => b.leads), 1);

  // ⚠️ ทั้งสองชุดต้องเป็นหน่วยเดียวกัน = "ราย" (บอสแจ้ง 21 ส.ค. 69: "มันไม่เท่ากัน")
  //   เดิมชุดที่สองวัดด้วย "จำนวนใบ" แต่ % คิดจาก "จำนวนราย" — ความยาวแท่งกับ % จึงไม่ตรงกัน
  //   (ตัวอย่างจริง: 14 ราย · 9 ใบ · 57% — 9/14 = 64% ไม่ใช่ 57% เพราะ 57% มาจาก 8 รายที่ออกใบแล้ว)

  return (
    <div className="card chart-l" style={{ marginBottom: 0 }}>
      <div className="card-header">
        <div>
          {/* ชื่อการ์ดบอกสิ่งที่วัดตรง ๆ แล้ว (บอสสั่ง 21 ส.ค. 69) จึงไม่ต้องมีคำอธิบายสูตรใต้หัวข้ออีก */}
          <div className="card-title">อัตราลูกค้าเป้าหมายที่ออกใบเสนอราคา แยกตามดีลเลอร์</div>
          {/* ⚠️ การ์ดนี้นับ "ทุกราย" รวมรายที่ปิดการขายได้แล้ว ส่วนการ์ดชื่อคล้ายกันที่หน้าภาพรวมยอดขาย
              ตัดรายที่เป็นลูกค้าแล้วออก (บอสสั่ง 21 ส.ค. 69) → เลขสองหน้าต่างกันโดยชอบธรรม
              ต้องเขียนบอก ไม่งั้นอ่านเหมือนระบบให้เลขขัดกัน (ผลตรวจภายนอก HQ-10 · 24 ส.ค. 69) */}
        </div>
        <span style={{ display: "flex", gap: 10, fontSize: "0.62rem", color: "var(--muted-foreground)", flexShrink: 0 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: LEAD_COLOR }} />ลูกค้าเป้าหมาย
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: QUOTE_COLOR }} />ออกใบเสนอราคาแล้ว
          </span>
        </span>
      </div>
      <div className="card-body" style={{ paddingTop: 6, display: "flex", flexDirection: "column" }}>
        {!bars.length ? (
          <div style={{ fontSize: "0.74rem", color: "var(--muted-foreground)" }}>—</div>
        ) : (
        <TopNRows topN={4} unit="ราย" gap={14}>
          {bars.map(b => (
          <div key={b.code}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: "0.74rem", marginBottom: 4 }}>
              <span style={{ color: "#374151", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                <span style={{ fontFamily: "monospace", fontWeight: 700, color: QUOTE_COLOR, marginRight: 6 }}>{b.code}</span>
                {b.name}
              </span>
              <span
                title={b.leads ? `ออกใบเสนอราคาแล้ว ${b.quoted} จากลูกค้าเป้าหมาย ${b.leads} ราย (รวม ${b.quotes} ใบ)` : "ยังไม่มีลูกค้าเป้าหมายในช่วงที่เลือก"}
                style={{ flexShrink: 0, fontVariantNumeric: "tabular-nums", fontWeight: 700, color: "var(--muted-foreground)" }}
              >
                {/* ไม่มีลูกค้าเป้าหมาย = หารไม่ได้ → ขึ้น "—" ห้ามโชว์ 0% ให้เข้าใจผิด */}
                {b.leads ? `${Math.round((b.quoted / b.leads) * 100)}%` : "—"}
              </span>
            </div>
            {/* แถบลูกค้าเป้าหมายทั้งหมด */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
              <div style={{ flex: 1, height: 6, background: "var(--muted)", borderRadius: 999, overflow: "hidden" }}>
                <div className="bar-grow" style={{ height: "100%", width: `${Math.round(b.leads / max * 100)}%`, background: LEAD_COLOR, borderRadius: 999 }} />
              </div>
              <span style={{ fontSize: "0.62rem", color: "var(--muted-foreground)", fontWeight: 700, minWidth: 46, textAlign: "right" }}>{b.leads} ราย</span>
            </div>
            {/* แถบ "ออกใบเสนอราคาแล้ว" — นับเป็นราย หน่วยเดียวกับแถบบน จึงยาวตรงกับ % เสมอ */}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }} title={`ออกใบเสนอราคาแล้ว ${b.quoted} ราย · รวม ${b.quotes} ใบ`}>
              <div style={{ flex: 1, height: 6, background: "var(--muted)", borderRadius: 999, overflow: "hidden" }}>
                <div className="bar-grow" style={{ height: "100%", width: `${Math.round(b.quoted / max * 100)}%`, background: QUOTE_COLOR, borderRadius: 999 }} />
              </div>
              <span style={{ fontSize: "0.62rem", color: "var(--muted-foreground)", fontWeight: 700, minWidth: 46, textAlign: "right" }}>{b.quoted} ราย</span>
            </div>
          </div>
          ))}
        </TopNRows>
        )}
      </div>
    </div>
  );
}
