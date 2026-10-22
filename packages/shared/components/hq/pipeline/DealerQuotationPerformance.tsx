"use client";

// ─── วิเคราะห์ประสิทธิภาพการปิดการขายของดีลเลอร์ (Quotation Performance by Dealer) ───
// คำถามที่กราฟนี้ตอบ: ดีลเลอร์รายไหน "ออกใบเสนอราคาเยอะ แต่ปิดการขายได้น้อย"
// แท่งคู่รายดีลเลอร์ · เรียงจากออกใบมาก→น้อย · ใต้กราฟมีตารางสรุปตัวเลขเดียวกัน
// HQ ดูอย่างเดียว — ไม่มีปุ่มเพิ่ม/แก้/ลบ
//
// ⚠️ กฎสำคัญ: "ปิดไม่ได้" = ใบที่ลูกค้าปฏิเสธจริง (status = lost) เท่านั้น
//    ห้ามคิดว่า ปิดไม่ได้ = ใบทั้งหมด − ปิดได้ เพราะจะเหมาใบที่ "ยังรอลูกค้าตอบ / หมดอายุ / ร่าง"
//    เป็นความล้มเหลวของดีลเลอร์ (ข้อมูลจริงทั้งเครือ: ปฏิเสธจริงแค่ 4 ใบ แต่ยังรอตอบ 14 ใบ)
//    (เดิมมีใบแฝด DealerClosingChart ที่ /hq/quotations ถามคำถามเดียวกัน — ยุบมาเหลือใบนี้ใบเดียว)
// อัตราปิดการขาย (รอบ 4 · บอสตัดสิน 21 ต.ค. 69) = สูตรกลาง lib/winRate.ts นับจากลีด (ปิดสำเร็จ ÷ สำเร็จ+ไม่สำเร็จ) — ไม่ใช่จากใบ
//    คอลัมน์ ปิดได้/ปิดไม่ได้/ยังไม่รู้ผล ยังเป็นจำนวน "ใบ" ตามเดิม · เดิมคอลัมน์ "อัตราปิด" คิดจากใบ = คนละสูตรกับหน้าอื่น
//    นิยามเดียวกับคอลัมน์ "อัตราปิด" ในตารางผลงาน และ KPI ของหน้านี้ (ห้ามใช้คนละสูตรในหน้าเดียวกัน)
//
// สเปกจากบอส: ไม่มี gradient · ไม่มี 3D · พื้นหลังขาว
// ⚠️ ข้อ "ไม่มี animation" ถูกยกเลิกแล้ว (บอสสั่ง 20 ส.ค. 69: "หน้ากราฟอื่นทุกอันใส่แอนิเมชั่นไปด้วย")
//    ใส่เฉพาะ "แท่งโตขึ้นจากเส้นฐานตอนเปิดหน้า" แบบเดียวกับกราฟแท่งอื่นในระบบ
//    ไม่ใส่ gradient/3D เพิ่ม — ข้อห้ามที่เหลือยังอยู่ตามเดิม
import { useEffect, useState } from "react";
import { TablePagination, pageSlice, pageCountOf } from "@pms/shared/components/ui/TablePagination";

const NAVY = "#003366";   // ใบเสนอราคาที่ออก
const GREEN = "#059669";  // ปิดการขายได้
const MUTED = "var(--muted-foreground)";

export type DealerQuotePerf = {
  code: string; name: string;
  quotes: number;   // ใบเสนอราคาที่ออกทั้งหมด
  won: number;      // ลูกค้าตอบรับ
  lost: number;     // ลูกค้าปฏิเสธจริง
  pending: number;  // ยังไม่รู้ผล = ร่าง + ส่งแล้วรอตอบ + หมดอายุ  (quotes − won − lost)
  conv: number | null; // อัตราปิดการขายของดีลเลอร์ (สูตรกลาง · จากลีด) · null = ยังไม่มีลีดที่ปิด (ไม่ใช่ 0%)
};

const pctText = (c: number | null) => c === null ? "—" : `${c}%`;

export function DealerQuotationPerformance({ rows }: {
  rows: DealerQuotePerf[];
}) {
  const [hover, setHover] = useState<number | null>(null);
  // แท่งเริ่มที่ความสูง 0 แล้วโตขึ้นหลังเรนเดอร์แรก — หน่วงสั้น ๆ ให้เบราว์เซอร์ทันวาดสถานะเริ่มต้นก่อน
  const [โตแล้ว, setโตแล้ว] = useState(false);
  useEffect(() => { const t = setTimeout(() => setโตแล้ว(true), 60); return () => clearTimeout(t); }, []);
  const โต = { transition: "y 0.75s cubic-bezier(.4,0,.2,1), height 0.75s cubic-bezier(.4,0,.2,1)" } as React.CSSProperties;

  if (!rows.length) {
    return (
      <div className="card" style={{ marginBottom: "1.25rem" }}>
        <div className="card-header">
          <div className="card-title">วิเคราะห์ประสิทธิภาพการปิดการขายของดีลเลอร์</div>
        </div>
        <div className="card-body" style={{ fontSize: "0.74rem", color: MUTED }}>
          — ไม่มีดีลเลอร์ที่ออกใบเสนอราคาในช่วงที่เลือก
        </div>
      </div>
    );
  }

  // ── เรขาคณิตของกราฟ ──
  // W ต้องใกล้ความกว้างที่เรนเดอร์จริง (การ์ดเต็มแถว ≈ 1,130px) ไม่งั้น SVG ถูกสเกลทั้งใบ:
  // ตัวอักษร/แท่งใหญ่ผิดส่วน และการ์ดสูงตามอัตราส่วน (760 → สเกล 1.5 เท่า = การ์ดสูง 478px เกินเพดาน 420)
  // pT เผื่อที่ให้ป้ายหน่วย "ใบ" ยืนเหนือขีดบนสุดได้ — ขีดบนสุดวาดที่ y = pT พอดี
  // ถ้าเว้นน้อยกว่านี้ ป้ายหน่วยจะไปทับตัวเลขขีดบนสุด (เจอจริง 21 ส.ค. 69: “16” ทับ “ใบ”)
  const W = 1130, H = 262, pL = 40, pR = 14, pT = 24, pB = 42;
  const cW = W - pL - pR, cH = H - pT - pB, n = rows.length;
  const slot = cW / n;
  const bw = Math.min(20, slot / 3.2);
  // แกน Y เป็น "จำนวนใบ" → ขีดต้องเป็นจำนวนเต็มเสมอ (4 ช่วงเท่า ๆ กัน)
  const step = Math.max(1, Math.ceil(Math.max(...rows.map(r => r.quotes), 1) / 4));
  const top = step * 4;
  const yAt = (v: number) => pT + (1 - v / top) * cH;
  const baseY = pT + cH;

  return (
    <div className="card" style={{ marginBottom: "1.25rem" }}>
      <div className="card-header">
        <div>
          <div className="card-title">วิเคราะห์ประสิทธิภาพการปิดการขายของดีลเลอร์</div>
          {/* คำอธิบายกำกับใต้หัวข้อถูกเอาออกทั้งระบบ (บอสสั่ง 27 ส.ค. 69) */}
        </div>
        <span style={{ display: "flex", gap: 12, flexShrink: 0, fontSize: "0.62rem", color: MUTED }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <i style={{ width: 9, height: 9, borderRadius: 2, background: NAVY, display: "inline-block" }} /> ใบเสนอราคาที่ออก
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <i style={{ width: 9, height: 9, borderRadius: 2, background: GREEN, display: "inline-block" }} /> ปิดการขายได้
          </span>
        </span>
      </div>

      <div className="card-body" style={{ paddingTop: 4 }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ display: "block", width: "100%", height: "auto", overflow: "visible" }}
          role="img" aria-label="ใบเสนอราคาที่ออก เทียบ ปิดการขายได้ รายดีลเลอร์">
          {/* เส้นกริดแนวนอน + ป้ายแกน Y (จำนวนใบ) */}
          {Array.from({ length: 5 }, (_, i) => i * step).map((v, i) => (
            <g key={v}>
              <line x1={pL} y1={yAt(v)} x2={W - pR} y2={yAt(v)} stroke="#eef1f5" strokeWidth="1" strokeDasharray={i === 0 ? "0" : "3 3"} />
              <text x={pL - 7} y={yAt(v) + 3} textAnchor="end" fontSize="9.5" fill="#aab2bd">{v}</text>
            </g>
          ))}
          <text x={pL - 7} y={pT - 10} textAnchor="end" fontSize="8.5" fill="#aab2bd">ใบ</text>

          {rows.map((d, i) => {
            const cx = pL + slot * i + slot / 2;
            const isHover = hover === i;
            const dim = hover !== null && !isHover ? 0.45 : 1;
            return (
              <g key={d.code} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                {isHover && <rect x={cx - slot / 2 + 3} y={pT} width={slot - 6} height={cH} rx={6} fill="#f2f6fc" />}
                <rect x={cx - slot / 2} y={pT} width={slot} height={cH} fill="transparent" style={{ cursor: "crosshair" }} />
                {/* ใบเสนอราคาที่ออก (น้ำเงิน) — สีทึบ ไม่มี gradient ตามสเปก */}
                <rect x={cx - bw - 2} y={โตแล้ว ? yAt(d.quotes) : baseY} width={bw} height={โตแล้ว ? baseY - yAt(d.quotes) : 0}
                  fill={NAVY} opacity={dim} style={โต} />
                {/* ปิดการขายได้ (เขียว) */}
                <rect x={cx + 2} y={โตแล้ว ? yAt(d.won) : baseY} width={bw} height={โตแล้ว ? baseY - yAt(d.won) : 0}
                  fill={GREEN} opacity={d.won > 0 ? dim : 0} style={โต} />
                <text x={cx} y={H - 26} textAnchor="middle" fontSize="9.5" fontWeight={700} fill="#6b7280"
                  fontFamily="ui-monospace, monospace">{d.code}</text>
              </g>
            );
          })}
          <text x={W - pR} y={H - 8} textAnchor="end" fontSize="8.5" fill="#aab2bd">รหัสดีลเลอร์</text>

          {/* กล่องข้อความตอนชี้ — วาดท้ายสุดให้ทับแท่งอื่น */}
          {hover !== null && (() => {
            const d = rows[hover];
            const cx = pL + slot * hover + slot / 2;
            const bwx = 158, bhy = 112;
            const x = Math.min(Math.max(cx - bwx / 2, pL), W - pR - bwx);
            const line = (k: string, v: string, dy: number, color = "#fff", bold = false) => (
              <>
                <text x={x + 10} y={pT + dy} fontSize="9.5" fill="#c4cbd4">{k}</text>
                <text x={x + bwx - 10} y={pT + dy} textAnchor="end" fontSize="9.5" fill={color} fontWeight={bold ? 800 : 600}>{v}</text>
              </>
            );
            return (
              <g style={{ pointerEvents: "none" }}>
                <rect x={x} y={pT} width={bwx} height={bhy} rx={8} fill="#2D2D2D" />
                <text x={x + 10} y={pT + 16} fontSize="10" fill="#fff" fontWeight={800}>{d.code}</text>
                <text x={x + bwx - 10} y={pT + 16} textAnchor="end" fontSize="8.5" fill="#9ca3af">
                  {d.name.length > 14 ? `${d.name.slice(0, 13)}…` : d.name}
                </text>
                <line x1={x + 10} y1={pT + 24} x2={x + bwx - 10} y2={pT + 24} stroke="#4b5563" strokeWidth="1" />
                {line("ใบเสนอราคา", `${d.quotes}`, 40)}
                {line("ปิดได้", `${d.won}`, 55, "#34d399")}
                {line("ปิดไม่ได้", `${d.lost}`, 70, "#f87171")}
                {line("ยังไม่รู้ผล", `${d.pending}`, 85, "#9ca3af")}
                <line x1={x + 10} y1={pT + 93} x2={x + bwx - 10} y2={pT + 93} stroke="#4b5563" strokeWidth="1" />
                <text x={x + 10} y={pT + 107} fontSize="9.5" fill="#c4cbd4">อัตราปิดการขาย</text>
                <text x={x + bwx - 10} y={pT + 107} textAnchor="end" fontSize="10" fill="#fff" fontWeight={800}>
                  {pctText(d.conv)}
                </text>
              </g>
            );
          })()}
        </svg>
      </div>

    </div>
  );
}

// ── ตารางสรุป — ตัวเลขชุดเดียวกับกราฟ แต่แยกเป็นการ์ดของตัวเอง ──
// เดิมอยู่ใต้กราฟในการ์ดเดียวกัน (สูงรวม 1,010px = เกินเพดาน 420px อยู่ใบเดียวในหน้า)
// แยกออกมาแล้วจับคู่กับ "เป้าหมายทั้งปี" ในแถวเดียวกัน — ตัวเลขชุดเดิมครบ ไม่ได้ตัดอะไรออก
export function DealerQuotationTable({ rows, avgConv }: {
  rows: DealerQuotePerf[];
  avgConv: number | null;
}) {
  // hooks ต้องเรียกก่อน early-return เสมอ (กติกา React) — ตารางว่างค่อยคืน null ทีหลัง
  const [page, setPage] = useState(0);
  const cur = Math.min(page, pageCountOf(rows.length) - 1);
  const shown = pageSlice(rows, cur);
  if (!rows.length) return null;
  return (
    <div className="card" style={{ marginBottom: 0 }}>
      <div className="card-header">
        <div>
          <div className="card-title">ตัวเลขการปิดการขาย รายดีลเลอร์</div>
          {/* คำอธิบายกำกับใต้หัวข้อถูกเอาออกทั้งระบบ (บอสสั่ง 27 ส.ค. 69) */}
        </div>
      </div>
      <div className="table-wrap">
        <table className="table-compact">
          {/* ความกว้างคุมที่ colgroup เท่านั้น (table-layout:fixed — ใส่ที่ th ไม่มีผล)
              การ์ดนี้อยู่ในกริดครึ่งจอ (~550px) → minWidth รวมต้องไม่เกินนั้น
              เดิมรวม 608px ทำให้คอลัมน์สุดท้าย "อัตราปิด" ถูกดันออกนอกกรอบ ต้องเลื่อนแนวนอนถึงเห็น
              ซึ่งเป็นคอลัมน์ที่คำอธิบายการ์ดอ้างถึงโดยตรง (ดีลเลอร์ที่ต่ำกว่าเฉลี่ยขึ้นสีแดง) */}
          <colgroup>
            <col style={{ width: "10%" }} />{/* รหัส */}
            <col style={{ width: "26%" }} />{/* ดีลเลอร์ — ยาวเกินตัดด้วย … (มี title ให้ชี้ดูชื่อเต็ม) */}
            <col style={{ width: "15%" }} />{/* ใบเสนอราคา — หัวคอลัมน์ยาวสุด จึงกว้างกว่าเพื่อน */}
            <col style={{ width: "11%" }} />{/* ปิดได้ */}
            <col style={{ width: "12%" }} />{/* ปิดไม่ได้ */}
            <col style={{ width: "12%" }} />{/* ยังไม่รู้ผล */}
            <col style={{ width: "14%" }} />{/* อัตราปิดการขาย (สูตรกลาง) */}
          </colgroup>
          <thead>
            <tr>
              <th>รหัส</th>
              <th>ดีลเลอร์</th>
              <th style={{ textAlign: "right" }}>ใบเสนอราคา</th>
              <th style={{ textAlign: "right" }}>ปิดได้</th>
              <th style={{ textAlign: "right" }}>ปิดไม่ได้</th>
              <th style={{ textAlign: "right" }}>ยังไม่รู้ผล</th>
              <th style={{ textAlign: "right" }} title="ลูกค้าเป้าหมายปิดสำเร็จ ÷ (ปิดสำเร็จ + ปิดไม่สำเร็จ)">อัตราปิดการขาย</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(d => (
              <tr key={d.code}>
                <td style={{ fontFamily: "monospace", fontWeight: 700, color: NAVY }}>{d.code}</td>
                <td title={d.name} style={{ fontWeight: 600, color: "#1F2937", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</td>
                <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{d.quotes}</td>
                <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700, color: GREEN }}>{d.won}</td>
                <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{d.lost}</td>
                <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: MUTED }}>{d.pending}</td>
                {/* แดง = ปิดได้ต่ำกว่าค่าเฉลี่ยทั้งเครือ → คือรายที่ HQ ต้องเข้าไปดูสาเหตุ */}
                <td style={{
                  textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 800,
                  color: d.conv === null ? MUTED : (avgConv !== null && d.conv < avgConv ? "#dc2626" : "#1F2937"),
                }}>{pctText(d.conv)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <TablePagination page={cur} total={rows.length} onPage={setPage} unit="ดีลเลอร์" />
      {/* คำอธิบายสูตรใต้ตารางถูกเอาออก (บอสสั่ง 22 ก.ย. 69) — กติกาเดิมยังใช้อยู่:
          ปิดไม่ได้ = ลูกค้าปฏิเสธจริงเท่านั้น · อัตราปิด = ปิดได้ ÷ (ปิดได้ + ปิดไม่ได้) · ยังไม่มีใบรู้ผล = "—" */}
    </div>
  );
}
