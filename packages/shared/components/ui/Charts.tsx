"use client";

import { useState, useEffect, useRef, type ReactNode } from "react";
import { NAVY, SILVER, STEEL } from "@pms/shared/lib/theme";

// ชุดสีไล่สำหรับกราฟที่หนึ่งแถว = หนึ่งหมวด (navy หลัก + สีเสริม ไม่ฉูดฉาด)
// ชุดเดียวกับที่การ์ด "ยอดขายตามประเภทอาคาร" ของแดชบอร์ด HQ ใช้อยู่
const RAMP = ["#003366", "#0891b2", "#059669", "#d97706", "#7c3aed", "#dc2626"];

// เพดานแกน Y แบบ "nice number" — ปรับตามขนาดข้อมูลจริง เพื่อให้เส้นเต็มกราฟทั้งค่าน้อย (รายวัน) และค่ามาก (รายเดือน)
// ── ป้ายแกน Y ต้องไม่ซ้ำค่ากันเอง (แก้ 10 ส.ค. 69) ────────────────────────────────
//
// บั๊กจริง (เอเจนต์สวมบทผู้บริหารเจอเอง เจอพร้อมกัน 3 หน้า):
//   กราฟที่นับ "จำนวนใบ/ราย" ตอนข้อมูลยังน้อย แกน Y อ่านได้ว่า 3 · 2 · 1 · 1 · 0
//   เพราะแบ่ง 5 ขีดเท่า ๆ กันเสมอ (0, 0.5, 1, 1.5, 2) แล้วป้ายปัดเป็นจำนวนเต็มทับกัน
//   ผู้อ่านเห็นเลขซ้ำ 2 คู่ แล้วอ่านสเกลของกราฟไม่ออก
//
// แก้: เพดานต่ำ ๆ ให้ใช้ขั้นเป็นจำนวนเต็ม (นับของนับไม่ได้ครึ่งใบอยู่แล้ว)
/** ขีดบนแกนตั้ง — ห้ามมีขีดที่เกิน "เพดาน" เด็ดขาด
 *
 *  บั๊กจริง (บอสแจ้ง 19 ส.ค. 69 "เลขทับซ้อนกัน"): เดิมปัดเพดานเป็นจำนวนเต็มก่อนสร้างขีด
 *  เพดาน 1.5 (กรณีกราฟที่ค่าสูงสุดเป็น 1) จึงได้ขีด [0,1,2] — ขีด "2" เกินเพดาน
 *  ตำแหน่งการวาดจึงติดลบ (อยู่เหนือกรอบกราฟ 34 หน่วย) แล้ว svg ตั้ง overflow:visible มันจึงไปโผล่ทับหัวข้อการ์ด
 *  วัดจริงจากหน้าเว็บ: ล้นเหนือกรอบ svg 40.1px */
function axisTicks(ceiling: number): number[] {
  if (ceiling <= 4) {
    const top = Math.max(1, Math.floor(ceiling));
    return Array.from({ length: top + 1 }, (_, i) => i);
  }
  if (ceiling <= 8) return [0, 2, 4, 6, 8].filter(v => v <= ceiling);
  return Array.from({ length: 5 }, (_, i) => (ceiling / 4) * i);
}

function niceCeil(v: number): number {
  if (!isFinite(v) || v <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const step = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find(s => n <= s) ?? 10;
  return step * pow;
}

// เส้นโค้งแบบ monotone (Fritsch–Carlson) — โค้งเนียนแต่ "ห้ามแกว่งเกินจุดข้อมูล"
// ต่างจาก Catmull-Rom ที่ overshoot ได้: ยอดพุ่งแล้วดิ่ง เส้นจะจุ่มต่ำกว่าจุดจริง
// เช่น ยอดขาย ฿11.8M เดือนหนึ่งแล้ว ฿0 เดือนถัดไป Catmull-Rom จะลากเส้นลงต่ำกว่าศูนย์ = ติดลบ
// ซึ่งเป็นไปไม่ได้ในข้อมูลจริง · monotone รับประกันว่าเส้นอยู่ระหว่างค่าสองจุดเสมอ
function monotonePath(pts: Array<{ x: number; y: number }>): string {
  const n = pts.length;
  if (n < 2) return "";
  const dx: number[] = [], dy: number[] = [], m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1].x - pts[i].x);
    dy.push(pts[i + 1].y - pts[i].y);
    m.push(dx[i] === 0 ? 0 : dy[i] / dx[i]);
  }
  // ความชันที่แต่ละจุด — จุดกลับทิศให้ชันเป็น 0 (เป็นยอด/ก้น) แล้วจำกัดไม่ให้เกิน 3 เท่าของชันข้างเคียง
  const t: number[] = [m[0]];
  for (let i = 1; i < n - 1; i++) {
    if (m[i - 1] * m[i] <= 0) { t.push(0); continue; }
    const avg = (m[i - 1] + m[i]) / 2;
    const lim = 3 * Math.min(Math.abs(m[i - 1]), Math.abs(m[i]));
    t.push(Math.sign(avg) * Math.min(Math.abs(avg), lim));
  }
  t.push(m[n - 2]);
  let d = `M${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C${(pts[i].x + h).toFixed(2)},${(pts[i].y + t[i] * h).toFixed(2)}` +
         ` ${(pts[i + 1].x - h).toFixed(2)},${(pts[i + 1].y - t[i + 1] * h).toFixed(2)}` +
         ` ${pts[i + 1].x.toFixed(2)},${pts[i + 1].y.toFixed(2)}`;
  }
  return d;
}

/** แสดงป้ายแกนนอนทุกกี่ช่อง — กันตัวหนังสือชนกันจนอ่านไม่ออก (บอสแจ้ง 19 ส.ค. 69)
 *
 *  กราฟทุกใบเคยวาดป้ายทุกจุดเสมอ พอช่วง 12 เดือนหรือการ์ดแคบ ชื่อเดือนก็ซ้อนทับกันเป็นพรืด
 *  คืนเป็น "ทุกกี่อันแสดง 1 อัน" โดยนับถอยหลังจากตัวสุดท้าย — เดือนล่าสุดต้องมีเสมอ (คนอ่านกราฟจากขวามาซ้าย)
 *  slot = ที่ว่างต่อหนึ่งป้าย (px ในพิกัด viewBox) · กว้างของข้อความประมาณจากจำนวนอักษรที่ยาวสุด */
// ── ความกว้างกล่องข้อความในกราฟ — ต้องคำนวณจากข้อความจริง ──────────────────────
// ⚠️ เคยตรึงความกว้างไว้ตายตัว พอขยายฟอนต์ให้อ่านง่ายขึ้น ข้อความไทยยาว ๆ ก็ทะลุกรอบทันที
//    (บอสทัก 25 ส.ค. 69 · เจอ 2 รอบ) 0.62 = ความกว้างเฉลี่ยต่อตัวอักษรไทยที่ฟอนต์นี้
//    เผื่อไว้มากกว่าอังกฤษ เพราะสระบน-ล่างทำให้ตัวกว้างกว่าที่คิด
function กว้างพอสำหรับ(บรรทัด: string[], fontSize: number, ขั้นต่ำ = 104, ช่องไฟ = 36): number {
  // ⚠️ 0.75 ไม่ใช่ค่าที่คำนวณจากฟอนต์ แต่เป็นค่าที่ "เผื่อไว้เกินพอ" ตั้งใจ (บอสทัก 3 รอบว่ายังล้น)
  //    ตัวไทยมีสระบน-ล่างและวรรณยุกต์ ความกว้างจริงต่อตัวแกว่งกว่าอังกฤษมาก
  //    กล่องกว้างเกินไปนิดหน่อยไม่มีใครสังเกต แต่ตัวหนังสือโดนตัดคือของเสียทันที
  const ยาวสุด = Math.max(0, ...บรรทัด.map(t => t.length));
  return Math.max(ขั้นต่ำ, Math.ceil(ยาวสุด * fontSize * 0.75) + ช่องไฟ);
}

function labelStep(slot: number, fontSize: number, labels: string[]): number {
  const longest = labels.reduce((m, l) => Math.max(m, String(l).length), 1);
  const need = fontSize * 0.55 * longest + 8;   // ความกว้างข้อความ + ช่องไฟขั้นต่ำ
  return Math.max(1, Math.ceil(need / Math.max(slot, 1)));
}
/** ป้ายนี้ควรแสดงไหม — นับจากตัวสุดท้าย เพื่อให้ช่วงล่าสุดอยู่บนแกนเสมอ */
function showLabel(i: number, total: number, step: number): boolean {
  return step <= 1 || (total - 1 - i) % step === 0;
}

export type BarPoint = { label: string; actual: number; plan: number };

/** Grouped bar chart — actual (navy) vs plan (silver), exceeded month highlighted.
 *  ค่าเริ่มต้น = ยอดขายจริง/แผน (฿) · ส่งชื่อชุด+ตัวจัดรูปแบบเข้ามาได้ เพื่อใช้กับกราฟ "จำนวน" ด้วย */
export function PlanVsActualBars({
  data, unit = "M", height, aLabel = "จริง", bLabel = "แผน", fmt: fmtProp,
  aFill, bFill, highlightExceeded = true,
}: {
  data: BarPoint[]; unit?: string; height?: number;
  /** ชื่อชุดข้อมูลในกล่องข้อความตอนชี้ (actual / plan) */
  aLabel?: string; bLabel?: string;
  fmt?: (v: number) => string;
  /** สีทับแท่ง — ไม่ส่ง = ใช้ไล่เฉดมาตรฐาน (กรมท่า / เงิน) */
  aFill?: string; bFill?: string;
  /** เดือนที่ทำได้เกินแผนเป็นแท่งเขียวขอบทอง — ปิดได้เมื่อสองชุดไม่ใช่ "จริงเทียบแผน" */
  highlightExceeded?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [drawn, setDrawn] = useState(false);
  useEffect(() => { const t = setTimeout(() => setDrawn(true), 60); return () => clearTimeout(t); }, []);
  const max = Math.max(...data.flatMap(d => [d.actual, d.plan]), 1) * 1.15;
  // pT เผื่อที่ให้ตัวเลขขีดบนสุด — เดิมชิดขอบจนเด้งไปทับคำอธิบายเหนือกราฟ (ผู้ใช้แจ้ง 19 ส.ค. 69)
  const W = 700, H = height ?? 210, pL = 48, pR = 14, pT = 26, pB = 42;   // pL/pB เผื่อป้ายตัวใหญ่ขึ้น (25 ส.ค. 69)
  const cW = W - pL - pR, cH = H - pT - pB, n = data.length;
  const slot = cW / n;
  const bw = Math.min(20, slot / 3);
  const yAt = (v: number) => pT + (1 - v / max) * cH;
  const xStep = labelStep(slot, 9.5, data.map(d => d.label));
  const baseY = pT + cH;
  const fmt = fmtProp ?? ((v: number) => `฿${Math.round(v * 10) / 10}${unit}`);
  // ⚠️ กราฟที่นับ "จำนวนรายการ" ต้องใช้ขั้นเป็นจำนวนเต็ม (แก้ 10 ส.ค. 69)
  //   เดิมแบ่ง 4 ส่วนเท่า ๆ กันเสมอ ตอนข้อมูลน้อยจึงได้ป้าย 1.2 · 0.9 · 0.6 · 0.3 · 0
  //   "ลูกค้าเป้าหมาย 0.3 ราย" ไม่มีอยู่จริง — ผู้อ่านสับสนว่าหน่วยคืออะไร
  const ticks = axisTicks(max);
  // ขีดบนสุด — ป้ายต้องหลบมาอยู่ใต้เส้น ไม่งั้นจะโผล่พ้นขอบบนไปทับหัวข้อการ์ด
  const maxTick = ticks[ticks.length - 1];
  const grow = { transition: "y .7s cubic-bezier(.4,0,.2,1), height .7s cubic-bezier(.4,0,.2,1), opacity .15s" } as const;
  const hasExceeded = highlightExceeded && data.some(d => d.actual > d.plan);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ display: "block", width: "100%", height: "auto", overflow: "visible" }}
        role="img" aria-label={`${aLabel} เทียบ ${bLabel}`}>
      <defs>
        <linearGradient id="pva-navy" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2c62ad" /><stop offset="1" stopColor={NAVY} /></linearGradient>
        <linearGradient id="pva-green" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#34d399" /><stop offset="1" stopColor="#059669" /></linearGradient>
        <linearGradient id="pva-silver" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e6eaef" /><stop offset="1" stopColor={SILVER} /></linearGradient>
      </defs>
      {ticks.map((v, i) => (
        <g key={i}>
          <line x1={pL} y1={yAt(v)} x2={W - pR} y2={yAt(v)} stroke="#eef1f5" strokeWidth="1" strokeDasharray={i === 0 ? "0" : "3 3"} />
          <text x={pL - 6} y={yAt(v) + (v === maxTick ? 10 : 3)} textAnchor="end" fontSize="13" fill="#8a94a3">{Math.round(v * 10) / 10}</text>
        </g>
      ))}
      {data.map((d, i) => {
        const cx = pL + slot * i + slot / 2;
        const exceeded = highlightExceeded && d.actual > d.plan;
        const aH = d.actual > 0 ? baseY - yAt(d.actual) : 0;
        const pH = baseY - yAt(d.plan);
        const isHover = hover === i;
        return (
          <g key={d.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            {/* ไฮไลต์คอลัมน์ตอนชี้ */}
            {isHover && <rect x={cx - slot / 2 + 3} y={pT} width={slot - 6} height={cH} rx={6} fill="#f2f6fc" />}
            <rect x={cx - slot / 2} y={pT} width={slot} height={cH} fill="transparent" />
            {/* actual (navy · โตจากล่าง) */}
            <rect x={cx - bw - 2} y={drawn ? yAt(d.actual) : baseY} width={bw} height={drawn ? aH : 0} rx={4}
              fill={exceeded ? "url(#pva-green)" : (aFill ?? "url(#pva-navy)")} opacity={d.actual > 0 ? (hover === null || isHover ? 1 : 0.5) : 0}
              stroke={exceeded ? "#ECC94B" : "none"} strokeWidth={exceeded ? 1.5 : 0} style={grow} />
            {/* plan (silver) */}
            <rect x={cx + 2} y={drawn ? yAt(d.plan) : baseY} width={bw} height={drawn ? pH : 0} rx={4}
              fill={bFill ?? "url(#pva-silver)"} opacity={d.plan > 0 ? (hover === null || isHover ? 1 : 0.5) : 0} style={grow} />
            {showLabel(i, n, xStep) && <text x={cx} y={H - 12} textAnchor="middle" fontSize="13" fill="#8a94a3">{d.label}</text>}
            {isHover && (() => {
              // ⚠️ กล่องต้องกว้างตามข้อความจริง ไม่ใช่ตรึง 104 (บอสทัก 25 ส.ค. 69: ตัวหนังสือล้นกรอบ)
              //    พอขยายฟอนต์เป็น 13/12 ข้อความยาวอย่าง "ลูกค้าเป้าหมายใหม่ 6 ราย" ก็ทะลุกรอบทันที
              //    0.52 = ความกว้างเฉลี่ยต่อตัวอักษรไทยที่ฟอนต์นี้ (วัดจากของจริง) + ช่องไฟข้างละ 12
              const บรรทัด = [`${aLabel} ${fmt(d.actual)}`, `${bLabel} ${fmt(d.plan)}`];
              const tw = กว้างพอสำหรับ(บรรทัด, 13), th = 44;
              const bx = Math.min(Math.max(cx - tw / 2, pL), W - pR - tw);
              return (
                <g style={{ pointerEvents: "none" }}>
                  <rect x={bx} y={pT} width={tw} height={th} rx="8" fill="#2D2D2D" />
                  <text x={bx + tw / 2} y={pT + 18} textAnchor="middle" fontSize="13" fill="#fff" fontWeight="700">{บรรทัด[0]}</text>
                  <text x={bx + tw / 2} y={pT + 34} textAnchor="middle" fontSize="12" fill="#D5D9DE">{บรรทัด[1]}</text>
                </g>
              );
            })()}
          </g>
        );
      })}
      </svg>

      {/* คำอธิบายสี — ต้องมีเสมอ ไม่งั้นแท่งคู่ + แท่งเขียวอ่านไม่ออกว่าอันไหนคืออะไร
          "เกินเป้า" ขึ้นเฉพาะตอนมีเดือนที่เกินจริง — ไม่อธิบายสีที่ไม่ได้อยู่บนจอ */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", justifyContent: "flex-start",
        marginTop: 12, paddingTop: 12, borderTop: "1px solid #f0f4f8", fontSize: "0.72rem", color: "#6B7280" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: aFill ?? NAVY, flexShrink: 0 }} /> {aLabel}
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: bFill ?? SILVER, flexShrink: 0 }} /> {bLabel}
        </span>
        {hasExceeded && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: "#059669", border: "1.5px solid #ECC94B", boxSizing: "border-box", flexShrink: 0 }} />
            {aLabel}เกิน{bLabel}
          </span>
        )}
      </div>
    </div>
  );
}

/** วงแหวนความคืบหน้า (บนการ์ด KPI เป้าหมาย) — แหล่งเดียวของทั้งระบบ
 *
 *  กับดัก: ใส่ transition ไว้เฉย ๆ "ไม่มีวันทำงาน" เพราะค่าถูกตั้งตั้งแต่เรนเดอร์แรก
 *  CSS transition วิ่งเมื่อค่าเปลี่ยน "หลัง mount" เท่านั้น → ต้องเริ่มที่ 0 แล้วตั้งค่าจริงในเฟรมถัดไป
 *  เริ่มที่ 0 เท่ากันทั้งเซิร์ฟเวอร์และเบราว์เซอร์ → ไม่เกิด hydration mismatch
 *  (เคยเขียนซ้ำ 2 ที่ · ตัวแก้ถูกใส่ให้ฝั่งดีลเลอร์อย่างเดียว ฝั่ง HQ เลยนิ่งอยู่นาน — จึงรวมเหลือตัวเดียว)
 */
/** pct = null → ยังไม่มีข้อมูล (เช่นยังไม่ตั้งเป้า) ขึ้น "—" สีเทา ไม่ใช่ 0% (บอสตัดสิน 19 ต.ค. 69 ข้อ 8) */
export function ProgressRing({ pct, size = 50, color = NAVY }: { pct: number | null; size?: number; color?: string }) {
  const r = (size - 11) / 2, c = 2 * Math.PI * r;
  const [shown, setShown] = useState(0);
  useEffect(() => {
    // สองเฟรม: เฟรมแรกให้เบราว์เซอร์ commit ค่า 0 ลง DOM จริง เฟรมสองค่อยเปลี่ยน — transition ถึงจะจับความต่างได้
    let id2 = 0;
    const id1 = requestAnimationFrame(() => { id2 = requestAnimationFrame(() => setShown(pct ?? 0)); });
    return () => { cancelAnimationFrame(id1); cancelAnimationFrame(id2); };
  }, [pct]);
  // เส้นโค้งวาดได้สูงสุด 1 รอบ (เกิน 100% วาดเพิ่มไม่ได้) — แต่ "ตัวเลขเก็บค่าจริง" ไม่ถูกตัด
  const arc = Math.max(0, Math.min(100, shown));
  // ตัวเลขกลางวงต้องอยู่ในวง (บอสสั่ง 30 ต.ค. 69 · หน้าภาพรวมยอดขาย "วงกลม % ไม่ล้นกรอบ"):
  //   เดิมตัวอักษรขนาดตายตัว 24% ของวง — "1234%" กว้างเกินวงด้านใน · ตอนนี้ย่อตามจำนวนตัวอักษรให้กว้างไม่เกินเส้นผ่านวงด้านใน
  const ข้อความ = pct == null ? "—" : `${pct}%`;
  //   วงด้านใน = 2r − ความหนาเส้น 9 · เผื่อขอบข้างละ 3px ไม่ให้ตัวเลขชิดเส้นวง · ตัวอักษรหนาไทย/อารบิกกว้าง ≈ 0.68 เท่าของขนาด
  const ขนาดตัวอักษร = Math.min(size * 0.24, (2 * r - 9 - 6) / (ข้อความ.length * 0.68));
  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }} role="img" aria-label={pct == null ? "ยังไม่มีข้อมูล" : `${pct}%`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#EEF2F7" strokeWidth={9} />
      <circle className="ring-arc" cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={9} strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - arc / 100)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central" fontSize={ขนาดตัวอักษร} fontWeight={800} fill={pct == null ? "#94a3b8" : color}>{ข้อความ}</text>
    </svg>
  );
}

/** แท่งแนวนอนเทียบหมวดหมู่ (จัดอันดับ) — หนึ่งหมวด = หนึ่งแถว เรียงลงมา
 *
 *  รูปแบบเดียวกับการ์ด "ยอดขายตามประเภทอาคาร" ของแดชบอร์ด HQ — แหล่งเดียว ห้ามก๊อปมาร์กอัปไปวางซ้ำ
 *  แถวหนึ่ง = ไอคอน + ชื่อ + ค่า (บรรทัดบน) · แท่ง + หมายเหตุ (บรรทัดล่าง)
 *
 *  ทำไมแนวนอน: ชื่อคน/ชื่อแม่แบบภาษาไทยยาว — แท่งแนวตั้งมีที่วางป้ายแค่ ~1 ช่อง ต้องตัดคำทิ้ง
 *  แนวนอนให้ชื่อเต็มบรรทัดเดียว และเพิ่มรายการได้โดยการ์ดไม่บวม (ต่างจากแนวตั้งที่แท่งจะผอมลงเรื่อย ๆ)
 *
 *  สีไล่ตาม RAMP ทีละแถว = สีผูกกับ "อันดับ" ไม่ใช่ "ตัวตน" — พอยอดสลับอันดับ สีจะสลับตาม
 *  ยอมรับได้เพราะชื่ออยู่ติดแท่งเสมอ (ไม่ต้องใช้สีจำว่าแถวไหนคือใคร ต่างจากกราฟที่มี legend แยก)
 */
export type CategoryRow = { label: string; value: number; note?: string };
export function CategoryRows({
  data, fmt, icon, onSelect, ariaLabel,
}: {
  data: CategoryRow[];
  fmt: (v: number) => string;
  icon?: ReactNode;
  onSelect?: (i: number) => void;
  ariaLabel: string;
}) {
  const max = Math.max(...data.map(d => d.value), 1);
  // ⚠️ ไม่มีข้อมูล = ต้องบอกผู้ใช้ ห้ามปล่อยเป็นกล่องขาวเปล่า (แก้ 10 ส.ค. 69)
  //   เดิมคืนรายการว่าง การ์ดจึงเหลือแต่หัวข้อกับพื้นที่ว่างสูง 57px
  //   ผู้ใช้แยกไม่ออกระหว่าง "ยังไม่มีข้อมูล" กับ "การ์ดพัง/โหลดไม่ขึ้น"
  //   แก้ที่คอมโพเนนต์กลางจึงมีผลกับทุกการ์ดที่ใช้ตัวนี้พร้อมกัน
  if (data.length === 0) {
    return (
      <div role="img" aria-label={ariaLabel}
        style={{ padding: "18px 0", fontSize: "0.78rem", color: "var(--muted-foreground, #8a94a3)" }}>
        — ยังไม่มีข้อมูลในช่วงที่เลือก
      </div>
    );
  }
  return (
    <div role="img" aria-label={ariaLabel}
      style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* คีย์ต้องพ่วงลำดับด้วย — ชื่อหมวดซ้ำกันได้จริง (เช่น ประเภทอาคารที่ไม่ได้ระบุ กลายเป็นค่าว่างหลายแถว)
          ถ้าใช้ชื่อหมวดอย่างเดียว React จะแยกสองแถวนั้นไม่ออก แล้วอาจใช้แถวเดิมซ้ำตอนข้อมูลเปลี่ยน
          = ตัวเลขไปโผล่ผิดแถว · พบจริงจากคำเตือนของ React ตอนรันทดสอบ 7 ส.ค. 69 (แดชบอร์ด HQ)
          หมายเหตุ: ถ้าเจอชื่อหมวดซ้ำบ่อย ควรไปดูที่ต้นทางการรวมยอดด้วยว่าจัดกลุ่มถูกหรือยัง */}
      {data.map((d, i) => (
        <div key={`${d.label}-${i}`} onClick={() => onSelect?.(i)}
          style={{ cursor: onSelect ? "pointer" : "default" }}
          title={`${d.label}${d.note ? ` · ${d.note}` : ""} — ${fmt(d.value)}`}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
            {icon && (
              <span style={{ width: 22, height: 22, borderRadius: 6, flexShrink: 0, background: RAMP[i % RAMP.length] + "1a", color: RAMP[i % RAMP.length], display: "flex", alignItems: "center", justifyContent: "center" }}>
                {icon}
              </span>
            )}
            <span style={{ flex: 1, fontSize: "0.8rem", fontWeight: 600, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.label}</span>
            <span style={{ fontSize: "0.8rem", fontWeight: 800, color: NAVY, fontVariantNumeric: "tabular-nums" }}>{fmt(d.value)}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ flex: 1, height: 6, background: "var(--muted)", borderRadius: 999, overflow: "hidden" }}>
              {/* ยอด 0 = ไม่มีแท่ง (ไม่ใช่แท่งจิ๋ว) — ให้เห็นชัดว่ายังไม่มียอด */}
              <div className="bar-grow" style={{ height: "100%", width: `${Math.round(d.value / max * 100)}%`, background: RAMP[i % RAMP.length], borderRadius: 999 }} />
            </div>
            {d.note && <span style={{ fontSize: "0.62rem", color: "var(--muted-foreground)", fontWeight: 700, whiteSpace: "nowrap", flexShrink: 0 }}>{d.note}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

export type SalesLinePoint = { label: string; value: number };

/** ยอดขายรายเดือน — กราฟเส้น + พื้นไล่เฉด + เส้นประเป้าหมายรายเดือน
 *  จุดสีเขียว = เดือนที่ถึงเป้า · จุดกรมท่า = ไม่ถึงเป้า (คงความหมายเดิมของแท่งเขียว/น้ำเงิน)
 *  ขนาด viewBox เท่ากับ PlanVsActualBars (W=700) เพื่อให้การ์ดคู่กันมีขนาดตัวอักษรเท่ากัน
 */
export function SalesLineChart({
  data, target, fmt, height = 260, targetLabel = "เป้า/เดือน",
}: {
  data: SalesLinePoint[];
  target: number;
  fmt: (v: number) => string;
  height?: number;
  targetLabel?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [drawn, setDrawn] = useState(false);
  useEffect(() => { const t = setTimeout(() => setDrawn(true), 60); return () => clearTimeout(t); }, []);

  const n = data.length;
  const max = niceCeil(Math.max(...data.map(d => d.value), target, 1) * 1.12);
  const W = 700, H = height, pL = 58, pR = 62, pT = 16, pB = 40;   // pL/pB เผื่อป้ายตัวใหญ่ขึ้น (25 ส.ค. 69)
  const cW = W - pL - pR, cH = H - pT - pB;
  const cx = (i: number) => (n <= 1 ? pL + cW / 2 : pL + (i / (n - 1)) * cW);
  const cy = (v: number) => pT + (1 - v / max) * cH;
  const baseY = pT + cH;
  const pts = data.map((d, i) => ({ x: cx(i), y: cy(d.value), ...d }));
  // monotone ไม่ใช่ Catmull-Rom — เดือนที่ยอดพุ่งแล้วดิ่งกลับ 0 เส้นจะไม่จุ่มต่ำกว่าศูนย์ (ยอดขายติดลบไม่ได้)
  const line = monotonePath(pts);
  const area = pts.length ? `${line} L${pts[n - 1].x.toFixed(2)},${baseY} L${pts[0].x.toFixed(2)},${baseY} Z` : "";
  const tY = cy(target);
  // ⚠️ กราฟที่นับ "จำนวนรายการ" ต้องใช้ขั้นเป็นจำนวนเต็ม (แก้ 10 ส.ค. 69)
  //   เดิมแบ่ง 4 ส่วนเท่า ๆ กันเสมอ ตอนข้อมูลน้อยจึงได้ป้าย 1.2 · 0.9 · 0.6 · 0.3 · 0
  //   "ลูกค้าเป้าหมาย 0.3 ราย" ไม่มีอยู่จริง — ผู้อ่านสับสนว่าหน่วยคืออะไร
  const ticks = axisTicks(max);
  // ขีดบนสุด — ป้ายต้องหลบมาอยู่ใต้เส้น ไม่งั้นจะโผล่พ้นขอบบนไปทับหัวข้อการ์ด
  const maxTick = ticks[ticks.length - 1];
  const fadeIn = (d: number) => ({ transition: `opacity .5s ease ${d}s` });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ display: "block", width: "100%", height: "auto", overflow: "visible" }}
      role="img" aria-label="ยอดขายรายเดือน เทียบ เป้าหมายรายเดือน">
      <defs>
        <linearGradient id="sl-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%" stopColor={NAVY} stopOpacity="0.22" />
          <stop offset="95%" stopColor={NAVY} stopOpacity="0" />
        </linearGradient>
      </defs>

      {ticks.map((v, i) => (
        <g key={i}>
          <line x1={pL} y1={cy(v)} x2={W - pR} y2={cy(v)} stroke="#eef1f5" strokeWidth="1" strokeDasharray={i === 0 ? "0" : "3 3"} />
          <text x={pL - 6} y={cy(v) + (v === maxTick ? 10 : 3)} textAnchor="end" fontSize="13" fill="#8a94a3">{fmt(v)}</text>
        </g>
      ))}

      {/* พื้นใต้เส้น — จางเข้ามาหลังเส้นวาดเสร็จ */}
      {area && <path d={area} fill="url(#sl-area)" opacity={drawn ? 1 : 0} style={fadeIn(0.5)} />}

      {/* เส้นยอดขาย — วาดจากซ้ายไปขวา */}
      {line && (
        <path d={line} fill="none" stroke={NAVY} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"
          pathLength={1} strokeDasharray={1} strokeDashoffset={drawn ? 0 : 1}
          style={{ transition: "stroke-dashoffset 1.15s cubic-bezier(.4,0,.2,1)" }} />
      )}

      {/* เส้นประเป้าหมาย — วาดทับเส้น ให้เห็นว่าเดือนไหนอยู่เหนือเส้น */}
      <line x1={pL} y1={tY} x2={W - pR} y2={tY} stroke="#EA580C" strokeWidth="1.6" strokeDasharray="6 4"
        opacity={drawn ? 1 : 0} style={fadeIn(0.5)} />
      {/* ชื่อเส้นเป้ากับตัวเลขเป้า — ต้องห่างอย่างน้อยเท่าความสูงตัวอักษร
          เดิมห่าง 12 หน่วย กับตัวอักษร 9.5 → กล่องข้อความซ้อนทับกันเอง (วัดจริงจากหน้าเว็บ 19 ส.ค. 69) */}
      <text x={W - pR + 6} y={tY - 5} fontSize="12" fill="#EA580C" fontWeight="700" opacity={drawn ? 1 : 0} style={fadeIn(0.5)}>{targetLabel}</text>
      <text x={W - pR + 6} y={tY + 12} fontSize="12" fill="#EA580C" opacity={drawn ? 1 : 0} style={fadeIn(0.5)}>{fmt(target)}</text>

      {/* จุดรายเดือน — เขียว = ถึงเป้า · ขนาด >=8px ตามสเปกมาร์ก */}
      {pts.map((p, i) => {
        const hit = p.value >= target && p.value > 0;
        return (
          <circle key={p.label} cx={p.x} cy={p.y} r={hover === i ? 5.5 : 4}
            fill={hit ? "#059669" : NAVY} stroke="#fff" strokeWidth="2"
            opacity={drawn ? 1 : 0} style={fadeIn(0.9 + i * 0.02)} />
        );
      })}

      {pts.map((p, i) => showLabel(i, pts.length, labelStep(cW / Math.max(pts.length - 1, 1), 13, pts.map(q => q.label))) && <text key={`x${p.label}`} x={p.x} y={H - 10} textAnchor="middle" fontSize="13" fill="#8a94a3">{p.label}</text>)}

      {/* ชั้นรับเมาส์ + เส้นตั้ง + ป้ายค่า (เดือนที่ชี้เท่านั้น) */}
      {hover !== null && (() => {
        const p = pts[hover];
        // กว้างตามข้อความจริง เหตุผลเดียวกับกล่องของ PlanVsActualBars
        const pct = target > 0 ? Math.round((p.value / target) * 100) : 0;
        const บรรทัด = [fmt(p.value), `${pct}% ของเป้า`];
        const tw = กว้างพอสำหรับ(บรรทัด, 13), th = 44;
        const x = Math.min(Math.max(p.x - tw / 2, pL), W - pR - tw);
        const y = Math.max(p.y - th - 10, pT);
        return (
          <g style={{ pointerEvents: "none" }}>
            <line x1={p.x} y1={pT} x2={p.x} y2={baseY} stroke="#c4cbd4" strokeWidth="1" strokeDasharray="3 3" />
            <rect x={x} y={y} width={tw} height={th} rx="8" fill="#2D2D2D" />
            <text x={x + tw / 2} y={y + 18} textAnchor="middle" fontSize="13" fill="#fff" fontWeight="700">{บรรทัด[0]}</text>
            <text x={x + tw / 2} y={y + 34} textAnchor="middle" fontSize="12" fill={p.value >= target ? "#34d399" : "#D5D9DE"}>{บรรทัด[1]}</text>
          </g>
        );
      })()}
      {pts.map((p, i) => {
        const half = n > 1 ? cW / (n - 1) / 2 : cW / 2;
        return <rect key={`hit${p.label}`} x={p.x - half} y={pT} width={half * 2} height={cH} fill="transparent"
          style={{ cursor: "crosshair" }} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />;
      })}
    </svg>
  );
}

export type DonutSeg = { label: string; value: number; color: string };

/** Donut with centered total + arc segments — กวาด (sweep) จาก 0 → เต็มตอน mount
 *
 *  ชี้ที่สีไหน สีนั้นเด่นขึ้น (บอสสั่ง 20 ส.ค. 69):
 *    ก้อนที่ชี้หนาขึ้นและคงสีเต็ม · ก้อนที่เหลือจางลง · ตรงกลางเปลี่ยนเป็นชื่อ+ยอด+% ของก้อนนั้น
 *    ทำที่ตัวโดนัทเอง = โดนัททุกใบในระบบได้พฤติกรรมเดียวกันหมด ไม่ต้องไปไล่แก้ทีละหน้า
 *
 *  ใช้ได้ 2 แบบ:
 *    • ปล่อยให้จัดการเอง (ไม่ส่ง activeIndex) — ชี้ที่วงกลมแล้วทำงานเลย
 *    • ให้ข้างนอกคุม (ส่ง activeIndex + onActiveChange) — เอาไว้ให้ "ชี้ที่แถวคำอธิบาย" แล้วก้อนเด่นตามด้วย
 */
export function Donut({ segments, centerLabel, centerValue, size = 190, activeIndex, onActiveChange }: {
  segments: DonutSeg[]; centerLabel: string; centerValue: string; size?: number;
  /** ก้อนที่กำลังเน้น (ให้ข้างนอกคุม) · undefined = โดนัทจำเอง */
  activeIndex?: number | null;
  onActiveChange?: (i: number | null) => void;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = size / 2 - 16, c = 2 * Math.PI * r, sw = 20;
  // sweep: เริ่มทุก segment ยาว 0 แล้วขยายเข้าตำแหน่งจริงพร้อมกัน (transition dasharray/dashoffset)
  const [drawn, setDrawn] = useState(false);
  useEffect(() => { const t = setTimeout(() => setDrawn(true), 60); return () => clearTimeout(t); }, []);
  // เน้นก้อนไหนอยู่ — ถ้าข้างนอกส่ง activeIndex มา ให้ของข้างนอกเป็นใหญ่
  const [เน้นเอง, setเน้นเอง] = useState<number | null>(null);
  const เน้น = activeIndex !== undefined ? activeIndex : เน้นเอง;
  const ตั้งเน้น = (i: number | null) => { setเน้นเอง(i); onActiveChange?.(i); };
  // ⚠️ ไม่มีข้อมูล = ต้องบอกผู้ใช้ ห้ามปล่อยกล่องเปล่า/ขีดเดียว (แก้ 10 ส.ค. 69)
  //   ผลตรวจรอบสุดท้ายพบการ์ดแบบนี้ 7 ใบ ที่มีแค่ "—" ในกล่องขาวสูง 340-420px
  //   ต้องเช็ก "หลัง" เรียก hook ครบแล้วเท่านั้น — คืนค่าก่อน hook ผิดกฎของ React
  if (segments.length === 0 || segments.every(x => x.value <= 0)) {
    return (
      <div style={{ padding: "24px 0", textAlign: "center", fontSize: "0.78rem", color: "var(--muted-foreground, #8a94a3)" }}>
        — ยังไม่มีข้อมูลในช่วงที่เลือก
      </div>
    );
  }
  const ก้อนที่เน้น = เน้น != null ? segments[เน้น] : undefined;

  // ── วาดแต่ละก้อนเป็น "เส้นโค้งของตัวเอง" ไม่ใช่วงกลมเต็มวงซ้อนกัน ──────────────
  //
  // ของเดิมทุกก้อนเป็น <circle> เต็มวงแล้วใช้เส้นประโชว์เฉพาะช่วงของตัวเอง
  //   หน้าตาถูก แต่ "การรับเมาส์" ผิด: เบราว์เซอร์นับทั้งวงเป็นพื้นที่ของก้อนนั้น
  //   ก้อนที่วาดทีหลังจึงบังก้อนก่อนหน้าทั้งหมด → ชี้ตรงไหนก็ได้ก้อนสุดท้ายเสมอ
  //   (เจอจากชุดทดสอบ 20 ส.ค. 69 — ลอง pointer-events: stroke/painted แล้วไม่ช่วย
  //    เพราะ Chrome ไม่ได้เว้นช่วงที่เป็นช่องว่างของเส้นประออกจากการรับเมาส์)
  // แก้ที่รูปทรง: ก้อนไหนกินมุมเท่าไรก็วาดเส้นโค้งเท่านั้น → ชี้สีไหนได้ก้อนนั้นจริง
  const cx0 = size / 2, cy0 = size / 2;
  const จุด = (มุม: number) => [
    cx0 + r * Math.cos((มุม - 90) * Math.PI / 180),
    cy0 + r * Math.sin((มุม - 90) * Math.PI / 180),
  ] as const;
  let มุมสะสม = 0;
  return (
    <div className="donut-area" style={{ width: size, height: size }}
      onMouseLeave={() => ตั้งเน้น(null)}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        <circle cx={cx0} cy={cy0} r={r} fill="none" stroke="#eef1f5" strokeWidth={sw} />
        {segments.map((s, i) => {
          const สัดส่วน = s.value / total;
          const เริ่ม = มุมสะสม, จบ = มุมสะสม + สัดส่วน * 360;
          มุมสะสม = จบ;
          const นี่แหละ = เน้น === i;
          const จาง = เน้น != null && !นี่แหละ;
          const ร่วม = {
            fill: "none" as const, stroke: s.color,
            strokeWidth: นี่แหละ ? sw + 7 : sw,
            opacity: จาง ? 0.32 : 1,
            tabIndex: 0, role: "img",
            "aria-label": `${s.label} ${s.value} (${Math.round(สัดส่วน * 100)}%)`,
            onMouseEnter: () => ตั้งเน้น(i),
            onFocus: () => ตั้งเน้น(i),
            onBlur: () => ตั้งเน้น(null),
            style: {
              cursor: "pointer",
              // กวาดเข้า: ตอน mount ยังไม่วาด แล้วค่อยยืดเต็มความยาวของตัวเอง
              strokeDasharray: drawn ? "1 0" : "0 1",
              transition: "stroke-dasharray 0.9s cubic-bezier(0.4,0,0.2,1), stroke-width 0.18s ease, opacity 0.18s ease",
            } as React.CSSProperties,
          };
          // ก้อนเดียวกินทั้งวง — เส้นโค้งจะเริ่มและจบที่จุดเดียวกัน วาดไม่ออก ต้องใช้วงกลมแทน
          if (สัดส่วน >= 0.9999) {
            return <circle key={i} cx={cx0} cy={cy0} r={r} pathLength={1} {...ร่วม} />;
          }
          const [x1, y1] = จุด(เริ่ม), [x2, y2] = จุด(จบ);
          const โค้งใหญ่ = จบ - เริ่ม > 180 ? 1 : 0;
          return (
            <path key={i} pathLength={1} strokeLinecap="butt"
              d={`M${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${โค้งใหญ่},1 ${x2.toFixed(2)},${y2.toFixed(2)}`}
              {...ร่วม} />
          );
        })}
      </svg>
      {/* ตรงกลาง: ปกติ = ยอดรวม · ชี้ก้อนไหนอยู่ = ชื่อ/ยอด/% ของก้อนนั้น */}
      <div className="donut-center" style={{ pointerEvents: "none" }}>
        {ก้อนที่เน้น ? (
          <>
            <div className="dc-lbl" style={{ color: ก้อนที่เน้น.color, maxWidth: size - 62, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {ก้อนที่เน้น.label}
            </div>
            <div className="dc-val">{ก้อนที่เน้น.value}</div>
            <div className="dc-lbl">{Math.round(ก้อนที่เน้น.value / total * 100)}%</div>
          </>
        ) : (
          <>
            <div className="dc-lbl">{centerLabel}</div>
            <div className="dc-val">{centerValue}</div>
          </>
        )}
      </div>
    </div>
  );
}

/** Line – Trend (สไตล์ shadcn statistics) — เส้นตรงต่อจุด + เส้นประแนวตั้ง + จุดปลายแบบวงแหวน
 *  minimal · เหมาะกับการ์ดสถิติที่เน้นตัวเลข · data = {month,value} */
// viewBox กว้างเท่าที่การ์ดกว้างจริง (วัดด้วย ResizeObserver) — ไม่ตรึง 1180
// svg เป็น height:"auto" → ความสูงจริง = ความกว้างการ์ด × H/W · ตรึง W=1180 ไว้ = การ์ดยิ่งแคบกราฟยิ่งเตี้ย
// (การ์ด 528px เคยได้กราฟสูงแค่ 206px ทั้งที่ขอ height=460 แล้วเหลือที่ว่างท้ายการ์ด 209px)
// วัดแล้ว W = ความกว้างจริง → สเกล 1:1 · กราฟสูงเท่า height ที่ขอ · ตัวอักษรได้ขนาดจริงตามที่เขียนไว้
function useMeasuredWidth(fallback: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, width: w || fallback };
}

export function LineTrendChart({
  data, unit = "M", height = 300, color = NAVY,
}: {
  data: { month: string; value: number }[];
  unit?: string; height?: number; color?: string;
}) {
  const [drawn, setDrawn] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => { const t = setTimeout(() => setDrawn(true), 60); return () => clearTimeout(t); }, []);
  const { ref: wrapRef, width: vw } = useMeasuredWidth(1180);
  const narrow = vw < 800;

  const n = data.length;
  const vals = data.map(d => d.value);
  const max = Math.max(...vals, 0);
  const lo = 0, hi = niceCeil(max * 1.15) || 1;           // แกน Y เริ่มที่ 0 + เผื่อหัว (สไตล์ Chateau MRR) เส้นไม่ชิดขอบบน
  // ⚠️ ระยะขอบซ้ายต้องกว้างตาม "ป้ายแกนตั้งที่ยาวที่สุด" ไม่ใช่ค่าคงที่ (บอสแจ้ง 24 ส.ค. 69: ตัวเลขทะลุกรอบ)
  //   ป้ายวางชิดขวาที่ x = pL - 12 → ยิ่งข้อความยาว ยิ่งกินที่ไปทางซ้าย
  //   ยอดหลักร้อยล้าน ("฿112.5M") ยาวกว่าค่าคงที่เดิม 56 จึงล้นออกนอกการ์ดแล้วโดนตัดหัว
  //   คิดความกว้างโดยประมาณจากจำนวนตัวอักษร (ตัวเลข/สัญลักษณ์กว้างราว 0.58 เท่าของขนาดฟอนต์)
  const Y_FS = 13.5;
  const ป้ายยาวสุด = axisTicks(hi).reduce((m, v) => Math.max(m, `฿${Math.round(v * 10) / 10}${unit}`.length), 3);
  const W = vw, H = height,
    pL = Math.max(narrow ? 46 : 56, Math.ceil(ป้ายยาวสุด * Y_FS * 0.58) + 16),
    pR = narrow ? 16 : 40, pT = 26, pB = 40;
  const cW = W - pL - pR, cH = H - pT - pB;
  const cx = (i: number) => (n <= 1 ? pL + cW / 2 : pL + (i / (n - 1)) * cW);
  const cy = (v: number) => pT + (1 - (v - lo) / (hi - lo)) * cH;
  const bottomY = pT + cH;
  const pts = data.map((d, i) => ({ x: cx(i), y: cy(d.value), ...d }));
  // ── กลับมาเป็นเส้นโค้ง (บอสสั่ง 21 ส.ค. 69 — ทับคำสั่งเดิม 19 ส.ค. ที่ให้เป็นเส้นตรง) ──
  //   ใช้ monotone (Fritsch–Carlson) ไม่ใช่โค้งแบบเดิมที่เคยมีปัญหา:
  //   โค้งแบบเดิม (Catmull-Rom) แกว่งเกินจุดข้อมูลได้ — ยอดพุ่งแล้วดิ่งจะลากเส้นต่ำกว่าศูนย์
  //   ซึ่งอ่านแล้วเข้าใจว่ายอดติดลบ · monotone รับประกันว่าเส้นอยู่ระหว่างค่าสองจุดเสมอ
  //   (ตัวเดียวกับกราฟยอดขายฝั่งดีลเลอร์ที่ใช้อยู่แล้ว — ทั้งระบบจึงโค้งเหมือนกัน)
  const line = monotonePath(pts);
  const area = pts.length ? `${line} L${pts[n - 1].x.toFixed(2)},${bottomY} L${pts[0].x.toFixed(2)},${bottomY} Z` : "";
  const yTicks = axisTicks(hi);
  // ขีดบนสุด — ป้ายต้องหลบมาอยู่ใต้เส้น ไม่งั้นจะโผล่พ้นขอบบนไปทับหัวข้อการ์ด
  const maxTick = yTicks[yTicks.length - 1];
  const last = pts[n - 1];
  const hp = hover !== null ? pts[hover] : null;
  const gid = "line-clip-" + n;
  const grad = "line-grad-" + n;
  const fmt = (v: number) => `฿${Math.round(v * 10) / 10}${unit}`;

  return (
    <div ref={wrapRef} style={{ width: "100%" }}>
    <svg viewBox={`0 0 ${W} ${H}`} style={{ display: "block", width: "100%", height: "auto", overflow: "visible" }} role="img" aria-label="กราฟเส้นแสดงแนวโน้ม">
      <defs>
        <linearGradient id={grad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.20" />
          <stop offset="60%" stopColor={color} stopOpacity="0.06" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
        <filter id="line-tt-shadow" x="-20%" y="-20%" width="140%" height="160%">
          <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#0f2a52" floodOpacity="0.14" />
        </filter>
      </defs>
      {/* ── เส้นกริดแนวนอนแบบเส้นประ + ป้ายแกนตั้งด้านซ้าย (บอสสั่ง 21 ส.ค. 69 — ตามภาพตัวอย่าง) ──
          เดิมเป็นเส้นประ "แนวตั้ง" ทุกจุด ซึ่งช่วยอ่านค่าไม่ได้เลย (มันบอกแค่ตำแหน่งเดือนที่รู้อยู่แล้ว)
          เส้นประแนวนอนวางตรงระดับตัวเลขแกนตั้ง → กวาดสายตาจากเส้นไปอ่านค่าได้ทันที */}
      {yTicks.map((v, i) => (
        <g key={i}>
          <line x1={pL} y1={cy(v)} x2={W - pR} y2={cy(v)} stroke="#e6e9f0" strokeWidth={1} strokeDasharray="5,5" />
          <text x={pL - 12} y={cy(v) + (v === maxTick ? 13 : 4)} textAnchor="end" fontSize={Y_FS} fill="#b8bfca">{fmt(v)}</text>
        </g>
      ))}
      {data.map((d, i) => (
        showLabel(i, data.length, labelStep(cW / Math.max(data.length, 1), 15, data.map(x => x.month))) ? <text key={i} x={cx(i)} y={bottomY + 26} textAnchor="middle" fontSize="13.5" fill="#64748b">{d.month}</text> : null
      ))}
      {/* พื้นที่เติมสี + เส้น (เผยจากซ้าย) */}
      <clipPath id={gid}><rect x={pL - 6} y={0} width={drawn ? cW + 12 : 0} height={H} style={{ transition: "width 1s cubic-bezier(.4,0,.2,1)" }} /></clipPath>
      <g clipPath={`url(#${gid})`}>
        <path d={area} fill={`url(#${grad})`} />
        {/* เส้นเดี่ยวคมชัด ไม่มีเงาเรืองใต้เส้น — เงานั้นทำให้เส้นดูหนาฟุ้งและกลืนกับพื้นที่เติมสี */}
        <path d={line} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      </g>
      {/* hover — เส้นไกด์ประแนวตั้ง + จุดทึบ + การ์ดทูลทิปลอย (สไตล์ Chateau) */}
      {hp && (() => {
        // การ์ดค่าอ่านง่าย: เดือน (ตัวเล็กสีจาง) · ยอดตัวใหญ่ · เทียบกับเดือนก่อนหน้า
        // เส้นไกด์ลากจาก "จุดข้อมูลลงล่าง" เท่านั้น — ไม่ลากทะลุขึ้นบน จะได้ไม่ตัดผ่านการ์ดค่า
        //
        // ⚠️ เดือนก่อนหน้าเป็น 0 หรือไม่มีเดือนก่อนหน้า = คิดเป็นเปอร์เซ็นต์ไม่ได้ → ไม่ต้องขึ้นบรรทัดนั้นเลย
        //    (ห้ามโชว์ "+0%" หรือ "+∞%" ให้เข้าใจผิด — กติกาเดียวกับ growth บนหัวการ์ด)
        const prev = hover !== null && hover > 0 ? pts[hover - 1] : null;
        const diffPct = prev && prev.value ? ((hp.value - prev.value) / prev.value) * 100 : null;
        const บรรทัดในการ์ด = [hp.month, fmt(hp.value),
          diffPct !== null && prev ? `${diffPct >= 0 ? "+" : "−"}${Math.abs(Math.round(diffPct * 10) / 10)}% จาก ${prev.month}` : ""];
        // ตัวเลขบรรทัดกลางเป็นฟอนต์ 21 — คิดความกว้างจากตัวใหญ่สุดเสมอ
        const tw = Math.max(กว้างพอสำหรับ([fmt(hp.value)], 21, 190, 32), กว้างพอสำหรับ(บรรทัดในการ์ด, 12.5, 190, 32));
        const th = diffPct === null ? 62 : 84;
        const tx = Math.min(Math.max(hp.x - tw / 2, pL - 6), W - pR - tw);
        // วางเหนือจุดเป็นหลัก · ถ้าที่เหนือจุดไม่พอ ย้ายไปใต้จุด เพื่อไม่ให้การ์ดโดนขอบบนตัด
        const above = hp.y - th - 16 >= 2;
        const ty = above ? hp.y - th - 16 : Math.min(hp.y + 16, bottomY - th);
        return (
          <g style={{ pointerEvents: "none" }}>
            <line x1={hp.x} y1={hp.y} x2={hp.x} y2={bottomY} stroke={color} strokeWidth={1.2} strokeDasharray="4,5" opacity={0.55} />
            <circle cx={hp.x} cy={hp.y} r={11} fill={color} opacity={0.14} />
            <circle cx={hp.x} cy={hp.y} r={6.5} fill="#fff" stroke={color} strokeWidth={2.5} />
            <g transform={`translate(${tx},${ty})`} filter="url(#line-tt-shadow)">
              <rect x={0} y={0} width={tw} height={th} rx={13} fill="#fff" stroke="#eef1f5" strokeWidth={1} />
              <text x={16} y={24} fontSize="12.5" fill="#9ca3af">{hp.month}</text>
              <text x={16} y={48} fontSize="21" fontWeight="800" fill={color}>{fmt(hp.value)}</text>
              {diffPct !== null && prev && (
                <text x={16} y={70} fontSize="12.5" fontWeight="700" fill={diffPct >= 0 ? "#059669" : "#dc2626"}>
                  {diffPct >= 0 ? "+" : "−"}{Math.abs(Math.round(diffPct * 10) / 10)}% จาก {prev.month}
                </text>
              )}
            </g>
          </g>
        );
      })()}
      {/* จุดข้อมูลทุกเดือน — เล็กและจาง บอกว่า "ตรงไหนมีค่าจริง" โดยไม่ต้องเขียนตัวเลขกำกับทุกจุด (จะรก)
          จุดที่ชี้อยู่ไม่ต้องวาดซ้ำ เพราะมีวงแหวนใหญ่ทับอยู่แล้ว */}
      {drawn && pts.map((p, i) => (
        i === hover || (i === n - 1 && !hp) ? null
          : <circle key={i} cx={p.x} cy={p.y} r={3.2} fill="#fff" stroke={color} strokeWidth={1.6} opacity={0.85} />
      ))}
      {/* จุดปลายแบบวงแหวน (target dot) */}
      {last && !hp && drawn && (
        <g>
          <circle cx={last.x} cy={last.y} r={9} fill={color} opacity={0.18} />
          <circle cx={last.x} cy={last.y} r={5} fill="#fff" stroke={color} strokeWidth={3} />
          <circle cx={last.x} cy={last.y} r={2} fill={color} />
        </g>
      )}
      {/* hit areas */}
      {data.map((_, i) => (
        <rect key={i} x={i === 0 ? pL - 6 : (cx(i - 1) + cx(i)) / 2} y={pT}
          width={i === 0 ? (cx(0) + cx(1)) / 2 - (pL - 6) : (i === n - 1 ? W - pR - (cx(i - 1) + cx(i)) / 2 : (cx(i) + cx(i + 1)) / 2 - (cx(i - 1) + cx(i)) / 2)}
          height={cH} fill="transparent"
          onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(h => h === i ? null : h)} />
      ))}
    </svg>
    </div>
  );
}

/** Grouped Bar Chart — แต่ละเดือนมีแท่งวางเรียงข้างกัน แท่งละหนึ่งชุดข้อมูล
 *  ใช้เมื่อชุดข้อมูล "ไม่ควรบวกกัน" (เช่น ลูกค้าเป้าหมาย / ใบเสนอราคา / ปิดการขาย — เป็นขั้นของดีลเดียวกัน
 *  เอามาซ้อนแล้วยอดรวมจะไม่มีความหมาย) · ถ้าชุดข้อมูลบวกกันแล้วได้ยอดรวมจริง ให้ใช้ StackedBarChart
 *  series[i].data ต้องเรียงตรงกับ months · vw = ความกว้าง viewBox (ลดลงเมื่ออยู่ในการ์ดแคบ) */
export function GroupedBarChart({
  months, series, fmt = v => `${Math.round(v)}`, height = 340, vw = 1180,
}: {
  months: string[];
  series: { name: string; color: string; data: number[] }[];
  fmt?: (v: number) => string;
  height?: number;
  vw?: number;
}) {
  const [drawn, setDrawn] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => { const t = setTimeout(() => setDrawn(true), 60); return () => clearTimeout(t); }, []);

  const n = months.length;
  // เพดานแกนคิดจากค่าสูงสุดของแท่งเดี่ยว (ไม่ใช่ผลรวม) เพราะแท่งวางข้างกัน ไม่ได้ซ้อน
  const ceiling = niceCeil(Math.max(...series.flatMap(s => s.data), 1) * 1.08);
  const narrow = vw < 800;
  // pT ต้องเผื่อที่ให้ตัวเลขขีดบนสุดของแกนตั้ง — เดิม 22 ทำให้เลขชิดขอบบนของ svg
  // แล้วเด้งขึ้นไปชนบรรทัดคำอธิบายเหนือกราฟ (svg ตั้ง overflow:visible จึงล้นออกมาได้) — ผู้ใช้แจ้ง 19 ส.ค. 69
  const W = vw, H = height, pL = narrow ? 46 : 60, pR = narrow ? 14 : 24, pT = 34, pB = narrow ? 34 : 42;
  const cW = W - pL - pR, cH = H - pT - pB;
  const band = cW / n;
  const groupW = Math.min(band * 0.68, 24 * series.length);
  const bw = groupW / series.length;
  const yTicks = axisTicks(ceiling);
  // ขีดบนสุด — ป้ายต้องหลบมาอยู่ใต้เส้น ไม่งั้นจะโผล่พ้นขอบบนไปทับหัวข้อการ์ด
  const maxTick = yTicks[yTicks.length - 1];
  const bottomY = pT + cH;
  const fs = narrow ? 13 : 15;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ display: "block", width: "100%", height: "auto", overflow: "visible" }} role="img" aria-label="กราฟแท่งเปรียบเทียบรายกลุ่ม">
        {yTicks.map((v, i) => {
          const y = pT + (1 - v / ceiling) * cH;
          return (
            <g key={i}>
              <line x1={pL} y1={y} x2={W - pR} y2={y} stroke="#eef1f5" strokeWidth={1} />
              <text x={pL - 10} y={y + (v === maxTick ? fs - 1 : 4)} textAnchor="end" fontSize={fs} fill="#9ca3af">{fmt(v)}</text>
            </g>
          );
        })}
        {months.map((m, i) => {
          const gx = pL + band * i + band / 2 - groupW / 2;
          const isHover = hover === i;
          return (
            <g key={m} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              {/* hit area — ชี้ที่ไหนก็ได้ในเดือนนั้น แล้วโชว์ตัวเลขทุกแท่ง */}
              <rect x={pL + band * i} y={pT} width={band} height={cH} fill="transparent" />
              {series.map((ser, si) => {
                const val = ser.data[i] ?? 0;
                const h = (val / ceiling) * cH;
                const x = gx + bw * si;
                return (
                  <g key={ser.name}>
                    {/* แท่งค่า 0 ยังวาดเป็นขีดบาง ๆ ให้เห็นว่าเดือนนั้นมีชุดข้อมูลนี้แต่เป็นศูนย์ */}
                    <rect x={x + bw * 0.12} y={drawn ? bottomY - Math.max(h, val > 0 ? 2 : 1.5) : bottomY}
                      width={bw * 0.76} height={drawn ? Math.max(h, val > 0 ? 2 : 1.5) : 0}
                      rx={3} fill={ser.color} opacity={val > 0 ? (hover === null || isHover ? 1 : 0.45) : 0.22}
                      style={{ transition: "y .7s cubic-bezier(.4,0,.2,1), height .7s cubic-bezier(.4,0,.2,1), opacity .15s" }} />
                    {isHover && (
                      <text x={x + bw / 2} y={bottomY - h - 7} textAnchor="middle" fontSize={fs - 1} fontWeight="800" fill={ser.color}>{fmt(val)}</text>
                    )}
                  </g>
                );
              })}
              {showLabel(i, n, labelStep(band, fs, months)) && <text x={pL + band * i + band / 2} y={bottomY + (narrow ? 22 : 26)} textAnchor="middle" fontSize={fs} fill="#6b7280">{m}</text>}
            </g>
          );
        })}
      </svg>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", marginTop: 14, paddingTop: 12, borderTop: "1px solid #f0f4f8" }}>
        {series.map(ser => (
          <span key={ser.name} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.72rem", color: STEEL }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: ser.color, flexShrink: 0 }} />
            {ser.name}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Bar + Line Combo — แท่ง = ยอดรวมของเดือน · เส้น = ส่วนย่อยของยอดนั้น
 *
 *  ใช้เมื่อชุด "เส้น" เป็นสับเซตของชุด "แท่ง" (เช่น ใบที่สร้าง vs ใบที่ตอบรับ)
 *  เส้นจึงอยู่ใต้หัวแท่งเสมอ — ระยะห่างระหว่างเส้นกับหัวแท่งคือ "ส่วนที่ยังไม่ได้/ไม่สำเร็จ" อ่านออกทันที
 *  ถ้าสองชุดไม่ใช่สับเซตกัน (บวกกันไม่ได้ความหมาย) ให้ใช้ GroupedBarChart แทน — วางข้างกันไม่ทับกัน
 *
 *  แกน/ฟอนต์/ระยะขอบ = ชุดเดียวกับ GroupedBarChart เพื่อให้การ์ดในหน้าเดียวกันอ่านเทียบกันได้
 */
export function BarLineChart({
  months, bar, line, fmt = v => `${Math.round(v)}`, height = 340, vw = 1180,
}: {
  months: string[];
  bar: { name: string; color: string; data: number[] };
  line: { name: string; color: string; data: number[] };
  fmt?: (v: number) => string;
  height?: number;
  vw?: number;
}) {
  const [drawn, setDrawn] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => { const t = setTimeout(() => setDrawn(true), 60); return () => clearTimeout(t); }, []);

  const n = months.length;
  // เพดานคิดจากค่าสูงสุดของ "แท่ง" อย่างเดียวก็พอ — เส้นเป็นสับเซต จึงไม่มีวันสูงกว่าแท่ง
  const ceiling = niceCeil(Math.max(...bar.data, ...line.data, 1) * 1.08);
  const narrow = vw < 800;
  // pT ต้องเผื่อที่ให้ตัวเลขขีดบนสุดของแกนตั้ง — เดิม 22 ทำให้เลขชิดขอบบนของ svg
  // แล้วเด้งขึ้นไปชนบรรทัดคำอธิบายเหนือกราฟ (svg ตั้ง overflow:visible จึงล้นออกมาได้) — ผู้ใช้แจ้ง 19 ส.ค. 69
  const W = vw, H = height, pL = narrow ? 46 : 60, pR = narrow ? 14 : 24, pT = 34, pB = narrow ? 34 : 42;
  const cW = W - pL - pR, cH = H - pT - pB;
  const band = cW / n;
  const bw = Math.min(band * 0.5, 34);
  const yTicks = axisTicks(ceiling);
  // ขีดบนสุด — ป้ายต้องหลบมาอยู่ใต้เส้น ไม่งั้นจะโผล่พ้นขอบบนไปทับหัวข้อการ์ด
  const maxTick = yTicks[yTicks.length - 1];
  const bottomY = pT + cH;
  const fs = narrow ? 13 : 15;
  const cx = (i: number) => pL + band * i + band / 2;
  const yAt = (v: number) => pT + (1 - v / ceiling) * cH;
  const path = line.data.map((v, i) => `${i === 0 ? "M" : "L"} ${cx(i)} ${yAt(v)}`).join(" ");

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ display: "block", width: "100%", height: "auto", overflow: "visible" }}
        role="img" aria-label={`${bar.name} (แท่ง) และ ${line.name} (เส้น)`}>
        {yTicks.map((v, i) => {
          const y = pT + (1 - v / ceiling) * cH;
          return (
            <g key={i}>
              <line x1={pL} y1={y} x2={W - pR} y2={y} stroke="#eef1f5" strokeWidth={1} />
              <text x={pL - 10} y={y + (v === maxTick ? fs - 1 : 4)} textAnchor="end" fontSize={fs} fill="#9ca3af">{fmt(v)}</text>
            </g>
          );
        })}

        {/* แท่งก่อน แล้วค่อยวาดเส้นทับ — เส้นต้องอยู่บนสุดถึงจะอ่านออกตอนค่าใกล้กัน */}
        {months.map((m, i) => {
          const val = bar.data[i] ?? 0;
          const h = (val / ceiling) * cH;
          const isHover = hover === i;
          return (
            <g key={m} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={pL + band * i} y={pT} width={band} height={cH} fill="transparent" />
              {/* ค่า 0 = ขีดบาง ๆ ให้เห็นว่าเดือนนั้นมีข้อมูลแต่เป็นศูนย์ (ไม่ใช่ไม่มีข้อมูล) */}
              <rect x={cx(i) - bw / 2} y={drawn ? bottomY - Math.max(h, val > 0 ? 2 : 1.5) : bottomY}
                width={bw} height={drawn ? Math.max(h, val > 0 ? 2 : 1.5) : 0}
                rx={3} fill={bar.color} opacity={val > 0 ? (hover === null || isHover ? 1 : 0.45) : 0.22}
                style={{ transition: "y .7s cubic-bezier(.4,0,.2,1), height .7s cubic-bezier(.4,0,.2,1), opacity .15s" }} />
              {showLabel(i, n, labelStep(band, fs, months)) && <text x={cx(i)} y={bottomY + (narrow ? 22 : 26)} textAnchor="middle" fontSize={fs} fill="#6b7280">{m}</text>}
            </g>
          );
        })}

        <path d={path} fill="none" stroke={line.color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"
          opacity={drawn ? 1 : 0} style={{ transition: "opacity .5s ease .35s" }} />
        {line.data.map((v, i) => (
          <circle key={i} cx={cx(i)} cy={yAt(v)} r={hover === i ? 5 : 3.5}
            fill="#fff" stroke={line.color} strokeWidth={2}
            opacity={drawn ? 1 : 0} style={{ transition: "opacity .5s ease .45s, r .15s" }} />
        ))}

        {/* ตัวเลขโผล่ตอนชี้ — แท่งบอกค่าเหนือหัวแท่ง เส้นบอกค่าใต้จุด กันตัวเลขทับกันตอนค่าใกล้กัน */}
        {hover !== null && (
          <g style={{ pointerEvents: "none" }}>
            <text x={cx(hover)} y={bottomY - (bar.data[hover] ?? 0) / ceiling * cH - 8}
              textAnchor="middle" fontSize={fs - 1} fontWeight="800" fill={bar.color}>{fmt(bar.data[hover] ?? 0)}</text>
            <text x={cx(hover)} y={yAt(line.data[hover] ?? 0) + 16}
              textAnchor="middle" fontSize={fs - 1} fontWeight="800" fill={line.color}>{fmt(line.data[hover] ?? 0)}</text>
          </g>
        )}
      </svg>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", marginTop: 14, paddingTop: 12, borderTop: "1px solid #f0f4f8" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.72rem", color: STEEL }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: bar.color, flexShrink: 0 }} />
          {bar.name}
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.72rem", color: STEEL }}>
          <span style={{ width: 14, height: 3, borderRadius: 2, background: line.color, flexShrink: 0 }} />
          {line.name}
        </span>
      </div>
    </div>
  );
}