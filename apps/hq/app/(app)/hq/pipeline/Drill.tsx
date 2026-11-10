"use client";
// ─── ภาพรวมยอดขาย · เจาะลึก (บอสสั่ง 30 ต.ค. 69 · FLOW แถว /hq/pipeline + H12) ─────────────────────────────────────────
//   แถบระดับ ทั้งเครือ › ภูมิภาค › จังหวัด › ดีลเลอร์ · หน้าต่างกลางจอ "ที่มาของการ์ด" (รายดีลเลอร์ · ไม่มีแถวรวม · ตัวเลข = การ์ด · บอสสั่ง 9 พ.ย. 69)
//   ตารางตามภูมิภาค/จังหวัด (กดแถว = เจาะลงระดับถัดไป) · กล่อง เส้นทางการขาย / งานค้างตามขั้นตอน / เหตุผลปิดไม่สำเร็จ / ลีดตามแหล่งที่มา
//   ทุกตัวเลขมาจากฐาน: แถวรายดีลเลอร์ hq_pipeline_dealers (ใบ 0264) · ผลรวมกลุ่มใช้ รวมผลงาน() ตัวเดียวกับแถวรวมท้ายตาราง (= การ์ด)
//   ลีดตามขั้น/เหตุผล/แหล่งที่มา = lead_summary ชุดสาขาเดียวกับตาราง
//   "รายเดือน" (แท็บ · ที่มารายเดือนตอนเลือกดีลเลอร์) = hq_pipeline_months (ใบ 0268) · ฐานยังไม่ถึงใบนั้น = "รอข้อมูล" — ห้ามคิดเองจากรายการดิบในหน้าเว็บ
import { useRouter } from "next/navigation";
import { useชื่อดีลเลอร์ } from "@pms/shared/lib/dealerDisplay";
import { ChevronRight, CalendarDays, Users, CheckCircle2, Clock } from "lucide-react";
import { หน้าต่างเจาะ, ส่วนเจาะ } from "../_drill/DrillWindow";
import { ClickableRow } from "@pms/shared/components/ui/ClickableRow";
import { รวมผลงาน, type ผลงานดีลเลอร์, type ผลงานรายเดือน } from "@pms/shared/lib/hqPipeline";
import { ชื่อภาค, ภาคมาตรฐาน } from "@pms/shared/lib/provinces";
import { ชื่อขั้น, สีกราฟขั้น, เลขขั้นของลีด, เลขขั้นเปิด, type เลขขั้น } from "@pms/shared/lib/leadStage";
import { useQuotationsPage, useLeadsPage } from "@pms/shared/lib/useNetworkData";
import { ชื่อสถานะใบHQ } from "@pms/shared/components/hq/quotations/QuotationFilterBar";
import { fmtISOToThai } from "@pms/shared/lib/mock";
import { fmtBaht } from "@pms/shared/lib/format";
import type { LeadSummary } from "@pms/shared/lib/data/ports";

const PRIMARY = "#003366";
const MUTED = "var(--muted-foreground)";
// ชื่อมิติ/ชนิดมิติ ย้ายไปไฟล์กลางของหัวข้อกราฟ/ตาราง (ใบหัวข้อ 3 พ.ย. 69) — ส่งต่อชื่อเดิมให้ผู้เรียกเดิม
import { ชื่อมิติ, คำอธิบายหัวข้อ, type มิติ } from "@pms/shared/lib/drillTitles";
import { BoxTitle } from "@pms/shared/components/ui/BoxTitle";
import { useกว้างคอลัมน์ชื่อ } from "@pms/shared/lib/useNameColWidth";
export { ชื่อมิติ, type มิติ };
export type รวม = ReturnType<typeof รวมผลงาน>;
/** ยังไม่รู้ผล = ลีดที่เข้ามาในช่วงที่ยังไม่ปิด (ลีด − ปิดได้ − ปิดไม่ได้) */
export const ยังไม่รู้ผล = (x: { leads: number; won: number; lost: number }) => Math.max(0, x.leads - x.won - x.lost);
const เปอร์เซ็นต์ = (v: number | null) => (v == null ? "—" : `${v}%`);

// ── แถบระดับ ────────────────────────────────────────────────────────────────────────────────────────────────
export function แถบระดับ({ ภาค, จังหวัด, ดีลเลอร์, ชื่อดีลเลอร์, ไป }: {
  ภาค: string | null; จังหวัด: string | null; ดีลเลอร์: string | null; ชื่อดีลเลอร์?: string;
  ไป: (ระดับ: "all" | "region" | "prov") => void;
}) {
  const ชิ้น: { k: "all" | "region" | "prov" | "dealer"; l: string }[] = [{ k: "all", l: "ทั้งเครือ" }];
  if (ภาค) ชิ้น.push({ k: "region", l: ชื่อภาค(ภาค) });
  if (จังหวัด) ชิ้น.push({ k: "prov", l: จังหวัด });
  if (ดีลเลอร์) ชิ้น.push({ k: "dealer", l: ชื่อดีลเลอร์ || ดีลเลอร์ });   // ชื่อแสดง ไม่มีรหัส (บอสสั่ง 6 พ.ย. 69)
  return (
    <nav aria-label="ระดับที่ดูอยู่" data-crumbs style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, margin: "0 0 14px" }}>
      {ชิ้น.map((c, i) => {
        const สุดท้าย = i === ชิ้น.length - 1;
        return (
          <span key={c.k} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            {i > 0 && <ChevronRight size={13} color="#9ca3af" />}
            <button type="button" data-crumb={c.k} aria-current={สุดท้าย ? "page" : undefined} disabled={สุดท้าย}
              onClick={() => c.k !== "dealer" && ไป(c.k)}
              style={{ border: `1px solid ${สุดท้าย ? PRIMARY : "#dbe3ec"}`, background: สุดท้าย ? PRIMARY : "#fff", color: สุดท้าย ? "#fff" : PRIMARY,
                borderRadius: 999, padding: "4px 12px", fontSize: "0.78rem", fontWeight: 700, cursor: สุดท้าย ? "default" : "pointer" }}>{c.l}</button>
          </span>
        );
      })}
    </nav>
  );
}

// ── จัดกลุ่มแถวรายดีลเลอร์เป็นภูมิภาค/จังหวัด (ผลรวมด้วย รวมผลงาน ตัวเดียวกับแถวรวม = การ์ด) ──
export type แถวกลุ่ม = { key: string; label: string; sub: string; รวม: รวม; codes: string[] };
export function จัดกลุ่ม(rows: ผลงานดีลเลอร์[], มิติ: "region" | "prov"): แถวกลุ่ม[] {
  const m = new Map<string, ผลงานดีลเลอร์[]>();
  rows.forEach(r => { const k = มิติ === "region" ? (ภาคมาตรฐาน(r.region) ?? "") : (r.province || ""); m.set(k, [...(m.get(k) ?? []), r]); });
  return [...m.entries()].map(([k, g]) => ({
    key: k, label: มิติ === "region" ? (k ? ชื่อภาค(k) : "ไม่ระบุภูมิภาค") : (k || "ไม่ระบุจังหวัด"),
    sub: มิติ === "region" ? `${g.length} ดีลเลอร์` : `${ชื่อภาค(g[0].region)} · ${g.length} ดีลเลอร์`,
    รวม: รวมผลงาน(g), codes: g.map(r => r.code),
  })).sort((a, b) => b.รวม.sales - a.รวม.sales || a.label.localeCompare(b.label, "th"));
}

// ── ตารางตามภูมิภาค/จังหวัด — กดแถว = เจาะลง ──────────────────────────────────────────────────────────────────
export function ตารางกลุ่ม({ มิติ, แถว, รวมทั้งหมด, เจาะ }: { มิติ: "region" | "prov"; แถว: แถวกลุ่ม[]; รวมทั้งหมด: รวม; เจาะ: (key: string) => void }) {
  const ชื่อคอล = useกว้างคอลัมน์ชื่อ(แถว.map(g => g.label), { ขั้นต่ำ: 110 }, แถว.map(g => ("sub" in g ? String((g as { sub?: string }).sub ?? "") : "")));   // ≤ 25% · ตัวเลขเกลี่ยเท่ากัน (บอสสั่ง 6 พ.ย. 69 รอบ 2)
  const หัว = [ชื่อมิติ[มิติ], "ลูกค้าเป้าหมาย", "ใบที่ส่ง", "ปิดสำเร็จ", "ปิดไม่สำเร็จ", "ยังไม่รู้ผล", "อัตราปิดการขาย", "ยอดขาย", "เป้าตามช่วง", "% เป้า", "ส่วนต่างกำไร", ""];
  const ช่อง = (x: รวม) => [
    <td key="l" className="num">{x.leads.toLocaleString()}</td>, <td key="q" className="num">{x.quotes.toLocaleString()}</td>,
    <td key="w" className="num">{x.won.toLocaleString()}</td>, <td key="o" className="num">{x.lost.toLocaleString()}</td>,
    <td key="p" className="num">{ยังไม่รู้ผล(x).toLocaleString()}</td>, <td key="r" className="num" style={{ fontWeight: 700 }}>{เปอร์เซ็นต์(x.rate)}</td>,
    <td key="s" className="num" data-value={x.sales} style={{ fontWeight: 800 }}>{fmtBaht(x.sales)}</td>, <td key="t" className="num">{x.target == null ? "—" : fmtBaht(x.target)}</td>,
    <td key="c" className="num">{เปอร์เซ็นต์(x.pct)}</td>, <td key="m" className="num" data-value={x.marginPct ?? ""}>{x.marginPct == null ? "—" : `${x.marginPct.toFixed(1)}%`}</td>,
  ];
  return (
    <div className="table-wrap dense fit">
      <table ref={ชื่อคอล.ref} aria-label={`ตารางผลงานตาม${ชื่อมิติ[มิติ]}`} data-total={JSON.stringify({ sales: รวมทั้งหมด.sales, won: รวมทั้งหมด.won, lost: รวมทั้งหมด.lost })} style={{ minWidth: 960 }}>
        <colgroup><col data-col-key="__name" style={{ width: ชื่อคอล.กว้าง }} />{หัว.slice(1, -1).map((h, i) => <col key={i} data-col-key={h} />)}<col style={{ width: 80 }} /></colgroup>
        <thead><tr>{หัว.map((h, i) => <th key={i} className={i > 0 && i < หัว.length - 1 ? "num" : undefined}>{h}</th>)}</tr></thead>
        <tbody>
          {!แถว.length && <tr><td colSpan={หัว.length} className="empty-row">ไม่พบข้อมูลในช่วงที่เลือก</td></tr>}
          {แถว.map(g => (
            <ClickableRow key={g.key} className="clickable" onActivate={() => เจาะ(g.key)} label={`เปิดผลงานของ ${g.label} (เจาะลงระดับถัดไป)`}>
              <td data-group-row={g.key} title={g.label}><strong style={{ color: "#1F2937" }}>{g.label}</strong><div style={{ fontSize: "0.68rem", color: MUTED }}>{g.sub}</div></td>
              {ช่อง(g.รวม)}
              <td style={{ color: PRIMARY, fontWeight: 700, fontSize: "0.74rem", whiteSpace: "nowrap" }}>เจาะลึก ›</td>
            </ClickableRow>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── กรอบรอข้อมูล (รายเดือน) ─────────────────────────────────────────────────────────────────────────────────
export function รอข้อมูลรายเดือน({ ข้อความ }: { ข้อความ: string }) {
  return (
    <div data-waiting="monthly" style={{ padding: "36px 16px", textAlign: "center", color: MUTED, fontSize: "0.8rem", lineHeight: 1.7 }}>
      <strong style={{ color: "#374151" }}>รอข้อมูล</strong><br />{ข้อความ}
    </div>
  );
}

// ── รายเดือน (ใบ 0268) ─────────────────────────────────────────────────────────────────────────────────────
const ชื่อเดือน = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
export type แถวเดือน = { key: string; label: string; y: number; m: number; รวม: รวม };
/** เดือนในช่วง (ทุกเดือน แม้ไม่มีข้อมูล) · ผลรวมด้วย รวมผลงาน() · เป้าเดือน = ผลรวมเป้าทั้งปี ÷ 12 ของสาขาที่ตั้งเป้า */
export function จัดรายเดือน(rows: ผลงานรายเดือน[], codes: Set<string>, start: string, end: string, เป้าทั้งปี: Map<string, number | null>): แถวเดือน[] {
  const out: แถวเดือน[] = [];
  const s = new Date(`${start}T00:00:00`), e = new Date(`${end}T00:00:00`);
  const เป้า = [...codes].map(c => เป้าทั้งปี.get(c) ?? null).filter((v): v is number => v != null);
  for (let d = new Date(s.getFullYear(), s.getMonth(), 1); d <= e; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    const y = d.getFullYear(), m = d.getMonth();
    const ของเดือน = rows.filter(r => r.y === y && r.m === m && codes.has(r.code));
    const ร = รวมผลงาน(ของเดือน.map(r => ({ ...r, name: "", region: "", province: "", status: "", latest: null, rate: null, target: null, pct: null,
      marginPct: null, ytd: 0, onTarget: false })));
    const target = เป้า.length ? Math.round(เป้า.reduce((a, b) => a + b, 0) / 12) : null;
    out.push({ key: `${y}-${m}`, label: `${ชื่อเดือน[m]} ${y + 543}`, y, m, รวม: { ...ร, target, pct: target ? Math.round(100 * ร.sales / target) : null, onTarget: 0 } });
  }
  return out;
}
export function ตารางรายเดือน({ แถว, รวมทั้งหมด, เลือกเดือน }: { แถว: แถวเดือน[]; รวมทั้งหมด: รวม; เลือกเดือน?: (m: แถวเดือน) => void }) {
  const ชื่อคอล = useกว้างคอลัมน์ชื่อ(แถว.map(g => g.label), { ขั้นต่ำ: 110 }, แถว.map(g => ("sub" in g ? String((g as { sub?: string }).sub ?? "") : "")));   // ≤ 25% · ตัวเลขเกลี่ยเท่ากัน (บอสสั่ง 6 พ.ย. 69 รอบ 2)
  const หัว = ["เดือน", "ลูกค้าเป้าหมาย", "ใบที่ส่ง", "ปิดสำเร็จ", "ปิดไม่สำเร็จ", "ยังไม่รู้ผล", "อัตราปิดการขาย", "ยอดขาย", "เป้ารายเดือน", "% เป้า", "ส่วนต่างกำไร", ""];
  const ช่อง = (x: รวม, รวมแถว = false) => [
    <td key="l" className="num">{x.leads.toLocaleString()}</td>, <td key="q" className="num">{x.quotes.toLocaleString()}</td>,
    <td key="w" className="num">{x.won.toLocaleString()}</td>, <td key="o" className="num">{x.lost.toLocaleString()}</td>,
    <td key="p" className="num">{ยังไม่รู้ผล(x).toLocaleString()}</td>, <td key="r" className="num" style={{ fontWeight: 700 }}>{เปอร์เซ็นต์(x.rate)}</td>,
    <td key="s" className="num" data-value={x.sales} style={{ fontWeight: 800 }}>{fmtBaht(x.sales)}</td>,
    <td key="t" className="num" title={รวมแถว ? "เป้าตามช่วง (เป้าทั้งปี × วัน ÷ 365)" : undefined}>{x.target == null ? "—" : fmtBaht(x.target)}</td>,
    <td key="c" className="num">{เปอร์เซ็นต์(x.pct)}</td>, <td key="m" className="num">{x.marginPct == null ? "—" : `${x.marginPct.toFixed(1)}%`}</td>,
  ];
  return (
    <div className="table-wrap dense fit">
      <table ref={ชื่อคอล.ref} aria-label="ตารางผลงานรายเดือน" data-total={JSON.stringify({ sales: รวมทั้งหมด.sales, won: รวมทั้งหมด.won, lost: รวมทั้งหมด.lost })} style={{ minWidth: 960 }}>
        <colgroup><col data-col-key="__name" style={{ width: ชื่อคอล.กว้าง }} />{หัว.slice(1, -1).map((h, i) => <col key={i} data-col-key={h} />)}<col style={{ width: 104 }} /></colgroup>
        <thead><tr>{หัว.map((h, i) => <th key={i} className={i > 0 && i < หัว.length - 1 ? "num" : undefined}>{h}</th>)}</tr></thead>
        <tbody>
          {แถว.map(g => เลือกเดือน ? (
            <ClickableRow key={g.key} className="clickable" onActivate={() => เลือกเดือน(g)} label={`เปิดรายดีลเลอร์ของ ${g.label}`}>
              <td data-month-row={g.key}><strong>{g.label}</strong></td>{ช่อง(g.รวม)}
              <td style={{ color: PRIMARY, fontWeight: 700, fontSize: "0.74rem", whiteSpace: "nowrap" }}>ดูรายดีลเลอร์ ›</td>
            </ClickableRow>
          ) : <tr key={g.key}><td data-month-row={g.key}><strong>{g.label}</strong></td>{ช่อง(g.รวม)}<td /></tr>)}
        </tbody>
      </table>
      <div style={{ padding: "8px 14px", fontSize: "0.7rem", color: MUTED }}>เป้ารายเดือน = เป้าทั้งปี ÷ 12 · ตัวเลขรวมดูที่การ์ดด้านบน (เป้าตามช่วง = เป้าทั้งปี × วัน ÷ 365 จึงต่างจากผลรวมรายเดือนเล็กน้อย)</div>
    </div>
  );
}
/** แผงรายดีลเลอร์ของเดือนที่กด (แท็บรายเดือน) — แถวรวม = แถวของเดือนนั้น */
export function แผงเดือน({ เดือน, rows, codes, ชื่อ, ปิด, เจาะ }: { เดือน: แถวเดือน; rows: ผลงานรายเดือน[]; codes: Set<string>; ชื่อ: Map<string, string>; ปิด: () => void; เจาะ: (code: string) => void }) {
  const ชื่อของ = useชื่อดีลเลอร์();   // ไม่มีรหัสบนจอ (บอสสั่ง 6 พ.ย. 69)
  const ของเดือน = rows.filter(r => r.y === เดือน.y && r.m === เดือน.m && codes.has(r.code)).sort((a, b) => b.sales - a.sales || a.code.localeCompare(b.code));
  return (
    <หน้าต่างเจาะ ชื่อ={เดือน.label} ป้ายเข้าถึง={`รายดีลเลอร์ ${เดือน.label}`} data-month-drawer={เดือน.key} ปิด={ปิด}
      คำอธิบาย="แยกรายดีลเลอร์ · ยอดขายตามวันลูกค้าตอบรับ · กดแถว = เจาะดูดีลเลอร์"
      ป้าย={[{ คีย์: "dealers", ข้อความ: `${ของเดือน.length.toLocaleString()} ดีลเลอร์` }]}>
      <ส่วนเจาะ ไอคอน={Users} ชื่อ="ผลงานรายดีลเลอร์">
        <table aria-label={`รายดีลเลอร์ ${เดือน.label}`}>
          <colgroup><col style={{ width: "40%" }} /><col /><col /><col /><col /><col style={{ width: "18%" }} /></colgroup>
          <thead><tr><th>ดีลเลอร์</th><th className="num">ลูกค้าเป้าหมาย</th><th className="num">ใบที่ส่ง</th><th className="num">ปิดสำเร็จ</th><th className="num">ปิดไม่สำเร็จ</th><th className="num">ยอดขาย</th></tr></thead>
          <tbody>
            {!ของเดือน.length && <tr><td colSpan={6} className="empty-row">ไม่มีผลงานในเดือนนี้</td></tr>}
            {ของเดือน.map(r => (
              <ClickableRow key={r.code} className="clickable" onActivate={() => { ปิด(); เจาะ(r.code); }} label={`เปิดผลงานของ ${ชื่อของ(r.code, ชื่อ.get(r.code))} (เจาะลงระดับดีลเลอร์)`}>
                <td data-drawer-row={r.code} title={ชื่อของ(r.code, ชื่อ.get(r.code))} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ชื่อของ(r.code, ชื่อ.get(r.code))}</td>
                <td className="num">{r.leads}</td><td className="num">{r.quotes}</td><td className="num">{r.won}</td><td className="num">{r.lost}</td><td className="num">{fmtBaht(r.sales)}</td>
              </ClickableRow>
            ))}
          </tbody>
        </table>
      </ส่วนเจาะ>
    </หน้าต่างเจาะ>
  );
}

// ── หน้าต่างกลางจอ: ที่มาของการ์ด (บอสสั่ง 9 พ.ย. 69 · เดิมแผงชิดขวา) ──────────────────────────────────────────────
//   ไม่มีแถวรวม (ตัวเลขรวมอยู่บนการ์ด) · ทุกแถวดีลเลอร์กด = เจาะลงดีลเลอร์นั้น · ระดับดีลเลอร์ = ที่มารายเดือน (ยกเว้นการ์ดถึงเป้า)
//   การ์ดถึงเป้า (ใบ 0283): ช่วงเดียวกับการ์ด · ถึงเป้า = ยอดในช่วง ≥ เป้าตามช่วง (เป้าทั้งปี × วัน ÷ 365) · 2 กลุ่ม ถึงเป้า / ยังไม่ถึง เรียง % มากไปน้อย
//     จำนวนกลุ่มถึงเป้า = ตัวเลขบนการ์ด (onTarget ของแถวมาจากฐานตัวเดียวกับการ์ด)
export type การ์ดที่มา = "sales" | "winRate" | "margin" | "onTarget";
const หัวการ์ด: Record<การ์ดที่มา, string> = { sales: "ยอดขาย (เทียบเป้า)", winRate: "อัตราปิดการขาย", margin: "ส่วนต่างกำไรเฉลี่ย", onTarget: "ดีลเลอร์ที่ถึงเป้า" };
const สูตรการ์ด: Record<การ์ดที่มา, string> = {
  sales: "ยอดขายตามวันลูกค้าตอบรับ · เป้าตามช่วง = เป้าทั้งปี × วัน ÷ 365",
  winRate: "อัตราปิดการขาย = ปิดสำเร็จ ÷ (ปิดสำเร็จ + ปิดไม่สำเร็จ) ของลูกค้าเป้าหมายที่เข้ามาในช่วง",
  margin: "ส่วนต่างกำไร % ของราคาขาย · ใบที่ตอบรับในช่วงและผูกใบ HQ",
  onTarget: "ถึงเป้า = ยอดขายในช่วง ≥ เป้าตามช่วง (เป้าทั้งปี × วัน ÷ 365)",
};
const จำนวนวัน = (start: string, end: string) => Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1;
export function แผงที่มา({ การ์ด, แถว, ดีลเลอร์, ปิด, เดือน, ช่วง, เจาะ }: {
  การ์ด: การ์ดที่มา; แถว: ผลงานดีลเลอร์[]; ดีลเลอร์: string | null; ปิด: () => void;
  /** ระดับดีลเลอร์: ที่มารายเดือน (ใบ 0268) · null = ฐานยังไม่ถึงใบนั้น → รอข้อมูล */
  เดือน: แถวเดือน[] | null;
  ช่วง: { start: string; end: string };
  /** กดแถวดีลเลอร์ = เจาะลงดีลเลอร์นั้น */
  เจาะ: (code: string) => void;
}) {
  const ชื่อของ = useชื่อดีลเลอร์();   // ไม่มีรหัสบนจอ (บอสสั่ง 6 พ.ย. 69)
  const เรียง = [...แถว].sort((a, b) => b.sales - a.sales || a.code.localeCompare(b.code));
  const คอลัมน์: Record<Exclude<การ์ดที่มา, "onTarget">, { หัว: string[]; ค่า: (r: ผลงานดีลเลอร์) => (string | number)[] }> = {
    sales: { หัว: ["ยอดขาย", "เป้าตามช่วง", "% เป้า"], ค่า: r => [fmtBaht(r.sales), r.target == null ? "—" : fmtBaht(r.target), เปอร์เซ็นต์(r.pct)] },
    winRate: { หัว: ["ปิดสำเร็จ", "ปิดไม่สำเร็จ", "อัตราปิดการขาย"], ค่า: r => [r.won, r.lost, เปอร์เซ็นต์(r.rate)] },
    margin: { หัว: ["ใบที่ผูกใบ HQ", "ส่วนต่างกำไร"], ค่า: r => [r.marginQuotes, r.marginPct == null ? "—" : `${r.marginPct.toFixed(1)}%`] },
  };
  const ช่วงอ่าน = `${fmtISOToThai(ช่วง.start)} – ${fmtISOToThai(ช่วง.end)} (${จำนวนวัน(ช่วง.start, ช่วง.end).toLocaleString()} วัน)`;
  const แถวดีลเลอร์ = (r: ผลงานดีลเลอร์, เซลล์: React.ReactNode) => (
    <ClickableRow key={r.code} className="clickable" onActivate={() => { ปิด(); เจาะ(r.code); }} label={`เปิดผลงานของ ${ชื่อของ(r.code, r.name)} (เจาะลงระดับดีลเลอร์)`}>
      <td data-drawer-row={r.code} title={ชื่อของ(r.code, r.name)} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600 }}>{ชื่อของ(r.code, r.name)}</td>
      {เซลล์}
    </ClickableRow>
  );

  // ── การ์ดถึงเป้า: 2 กลุ่ม ──
  if (การ์ด === "onTarget") {
    const มีเป้า = แถว.filter(r => r.target != null);
    const ตามเปอร์เซ็นต์ = (a: ผลงานดีลเลอร์, b: ผลงานดีลเลอร์) => (b.pct ?? -1) - (a.pct ?? -1) || b.sales - a.sales || a.code.localeCompare(b.code);
    const ถึง = มีเป้า.filter(r => r.onTarget).sort(ตามเปอร์เซ็นต์);
    const ยัง = มีเป้า.filter(r => !r.onTarget).sort(ตามเปอร์เซ็นต์);
    const ไม่ตั้งเป้า = แถว.length - มีเป้า.length;
    const ตาราง = (กลุ่ม: ผลงานดีลเลอร์[], คีย์: string, ว่าง: string) => (
      <table aria-label={`ดีลเลอร์${คีย์ === "reached" ? "ที่ถึงเป้า" : "ที่ยังไม่ถึงเป้า"}`} data-target-group={คีย์}>
        <colgroup><col style={{ width: "30%" }} /><col style={{ width: "17%" }} /><col style={{ width: "17%" }} /><col style={{ width: "20%" }} /><col style={{ width: "16%" }} /></colgroup>
        <thead><tr><th>ดีลเลอร์</th><th className="num">ยอดขายในช่วง</th><th className="num">เป้าตามช่วง</th><th>% เป้า</th><th className="num">ขาดอีกเท่าไร</th></tr></thead>
        <tbody>
          {!กลุ่ม.length && <tr><td colSpan={5} className="empty-row">{ว่าง}</td></tr>}
          {กลุ่ม.map(r => แถวดีลเลอร์(r, <>
            <td className="num" data-cell="sales" data-value={r.sales}>{fmtBaht(r.sales)}</td>
            <td className="num" data-cell="target" data-value={r.target ?? ""}>{fmtBaht(r.target ?? 0)}</td>
            <td data-cell="pct" data-value={r.pct ?? ""}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ flex: 1, height: 7, borderRadius: 999, background: "#e5e9f0", overflow: "hidden" }}>
                  <div className="bar-grow" style={{ width: `${Math.min(100, Math.max(0, r.pct ?? 0))}%`, height: "100%", borderRadius: 999, background: r.onTarget ? "#059669" : "#d97706" }} />
                </div>
                <span style={{ fontWeight: 800, fontVariantNumeric: "tabular-nums", minWidth: 38, textAlign: "right" }}>{เปอร์เซ็นต์(r.pct)}</span>
              </div>
            </td>
            <td className="num" data-cell="gap" data-value={Math.max(0, (r.target ?? 0) - r.sales)} style={{ color: r.onTarget ? MUTED : "#b45309", fontWeight: 700 }}>
              {r.onTarget ? "—" : fmtBaht(Math.max(0, (r.target ?? 0) - r.sales))}</td>
          </>))}
        </tbody>
      </table>
    );
    return (
      <หน้าต่างเจาะ ชื่อ={หัวการ์ด.onTarget} data-card-drawer="onTarget" ปิด={ปิด} กว้าง={880}
        คำอธิบาย={<>{ช่วงอ่าน}<br />{สูตรการ์ด.onTarget}</>}
        ป้าย={[{ คีย์: "reached", ข้อความ: `ถึงเป้า ${ถึง.length.toLocaleString()} จาก ${มีเป้า.length.toLocaleString()} ราย` },
               ...(ไม่ตั้งเป้า > 0 ? [{ คีย์: "no-target", ข้อความ: `ยังไม่ตั้งเป้า ${ไม่ตั้งเป้า.toLocaleString()} ราย (ไม่นับ)` }] : [])]}>
        <ส่วนเจาะ ไอคอน={CheckCircle2} ชื่อ={`ถึงเป้า (${ถึง.length.toLocaleString()})`} data-group="reached" data-count={String(ถึง.length)}>
          {ตาราง(ถึง, "reached", "ยังไม่มีดีลเลอร์ที่ถึงเป้าในช่วงนี้")}
        </ส่วนเจาะ>
        <ส่วนเจาะ ไอคอน={Clock} ชื่อ={`ยังไม่ถึง (${ยัง.length.toLocaleString()})`} data-group="pending" data-count={String(ยัง.length)}>
          {ตาราง(ยัง, "pending", "ทุกดีลเลอร์ที่ตั้งเป้าถึงเป้าแล้ว")}
        </ส่วนเจาะ>
      </หน้าต่างเจาะ>
    );
  }

  const c = คอลัมน์[การ์ด];
  return (
    <หน้าต่างเจาะ ชื่อ={หัวการ์ด[การ์ด]} data-card-drawer={การ์ด} ปิด={ปิด}
      คำอธิบาย={<>{ช่วงอ่าน}<br />{สูตรการ์ด[การ์ด]}</>}
      ป้าย={[{ คีย์: "scope", ข้อความ: ดีลเลอร์ ? `ที่มารายเดือน · ${ชื่อของ(ดีลเลอร์)}` : `แยกรายดีลเลอร์ ${แถว.length.toLocaleString()} ราย · รวม = ตัวเลขบนการ์ด` }]}>
      {ดีลเลอร์ && !เดือน ? <div className="card" style={{ marginBottom: 0 }}><รอข้อมูลรายเดือน ข้อความ="ยังไม่มีข้อมูลผลงานรายเดือนของดีลเลอร์" /></div>
      : ดีลเลอร์ && เดือน ? (
        <ส่วนเจาะ ไอคอน={CalendarDays} ชื่อ="ที่มารายเดือน">
          <table aria-label={`ที่มา ${หัวการ์ด[การ์ด]} รายเดือน`}>
            <thead><tr><th>เดือน</th>{c.หัว.map(h => <th key={h} className="num">{h}</th>)}</tr></thead>
            <tbody>
              {เดือน.map(g => {
                const x = g.รวม;
                const ค่า: Record<Exclude<การ์ดที่มา, "onTarget">, (string | number)[]> = {
                  sales: [fmtBaht(x.sales), x.target == null ? "—" : fmtBaht(x.target), เปอร์เซ็นต์(x.pct)], winRate: [x.won, x.lost, เปอร์เซ็นต์(x.rate)],
                  margin: [x.marginQuotes, x.marginPct == null ? "—" : `${x.marginPct.toFixed(1)}%`] };
                return <tr key={g.key} data-drawer-row={g.key}><td>{g.label}</td>{ค่า[การ์ด].map((v, i) => <td key={i} className="num">{typeof v === "number" ? v.toLocaleString() : v}</td>)}</tr>;
              })}
            </tbody>
          </table>
        </ส่วนเจาะ>
      ) : (
        <ส่วนเจาะ ไอคอน={Users} ชื่อ="แยกรายดีลเลอร์">
          <table aria-label={`ที่มา ${หัวการ์ด[การ์ด]} รายดีลเลอร์`}>
            <colgroup><col style={{ width: "44%" }} />{c.หัว.map(h => <col key={h} />)}</colgroup>
            <thead><tr><th>ดีลเลอร์</th>{c.หัว.map(h => <th key={h} className="num">{h}</th>)}</tr></thead>
            <tbody>
              {!เรียง.length && <tr><td colSpan={c.หัว.length + 1} className="empty-row">ไม่พบดีลเลอร์ในช่วงที่เลือก</td></tr>}
              {เรียง.map(r => แถวดีลเลอร์(r, c.ค่า(r).map((v, i) => <td key={i} className="num">{typeof v === "number" ? v.toLocaleString() : v}</td>)))}
            </tbody>
          </table>
        </ส่วนเจาะ>
      )}
    </หน้าต่างเจาะ>
  );
}

// ── กล่องด้านล่าง ───────────────────────────────────────────────────────────────────────────────────────────
function การ์ดกล่อง({ title, คำอธิบาย, testid, children }: { title: string; คำอธิบาย: string; testid: string; children: React.ReactNode }) {
  return (
    <div className="card" data-testid={testid} style={{ marginBottom: 0 }}>
      <BoxTitle ชื่อ={title} คำอธิบาย={คำอธิบาย} />
      <div className="card-body" style={{ paddingTop: 8 }}>{children}</div>
    </div>
  );
}
function แถบนับ({ rows, empty }: { rows: { label: string; value: number; color: string }[]; empty: string }) {
  const max = Math.max(1, ...rows.map(r => r.value));
  if (!rows.some(r => r.value > 0)) return <div style={{ fontSize: "0.76rem", color: MUTED }}>{empty}</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {rows.map(r => (
        <div key={r.label} data-bar-row={r.label} data-value={r.value}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.74rem", fontWeight: 600, marginBottom: 4 }}>
            <span style={{ color: "#374151" }}>{r.label}</span><span style={{ fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{r.value.toLocaleString()}</span>
          </div>
          <div style={{ height: 8, borderRadius: 999, background: "var(--muted)", overflow: "hidden" }}>
            <div className="bar-grow" style={{ width: `${Math.round(r.value / max * 100)}%`, height: "100%", borderRadius: 999, background: r.color }} />
          </div>
        </div>
      ))}
    </div>
  );
}
const สีชุด = ["#003366", "#0891b2", "#059669", "#d97706", "#7c3aed", "#dc2626", "#64748b"];

/** ระดับ = ป้ายระดับที่เลือก · ช่วง = ช่วงเวลาที่เลือก (หัวข้อกราฟ · บอสสั่ง 3 พ.ย. 69) */
export function กล่องล่าง({ รวมทั้งหมด, ขั้นตอนนี้, ในช่วง, ระดับ, ช่วง }: { รวมทั้งหมด: รวม; ขั้นตอนนี้: LeadSummary | null; ในช่วง: LeadSummary | null;
  ระดับ: string; ช่วง: { start: string; end: string } }) {
  const ขั้น = เลขขั้นเปิด.map(n => ({ label: ชื่อขั้น(n), value: ขั้นตอนนี้?.byStage.find(s => s.stage === n)?.count ?? 0, color: สีกราฟขั้น[n] }));
  const เหตุผล = (ในช่วง?.byLostReason ?? []).filter(r => r.count > 0).sort((a, b) => b.count - a.count).map((r, i) => ({ label: r.reason || "ไม่ระบุเหตุผล", value: r.count, color: สีชุด[i % สีชุด.length] }));
  const แหล่ง = (ในช่วง?.bySource ?? []).filter(r => r.count > 0).sort((a, b) => b.count - a.count).map((r, i) => ({ label: r.source || "ไม่ระบุ", value: r.count, color: สีชุด[i % สีชุด.length] }));
  const เส้นทาง = [
    { label: "ลูกค้าเป้าหมายใหม่", value: รวมทั้งหมด.leads, color: "#003366" },
    { label: "ใบที่ส่ง", value: รวมทั้งหมด.quotes, color: "#0891b2" },
    { label: "ปิดสำเร็จ", value: รวมทั้งหมด.won, color: "#059669" },
    { label: "ปิดไม่สำเร็จ", value: รวมทั้งหมด.lost, color: "#dc2626" },
    { label: "ยังไม่รู้ผล", value: ยังไม่รู้ผล(รวมทั้งหมด), color: "#94a3b8" },
  ];
  return (
    <>
      <div className="hq-dealer-charts">
        <การ์ดกล่อง title={`กราฟเส้นทางการขาย · ${ระดับ}`} คำอธิบาย={คำอธิบายหัวข้อ(ช่วง, "ลูกค้าเป้าหมายที่เข้ามาในช่วง → ใบที่ส่ง → ผลปิดการขาย", "ตัวเลขเดียวกับแถวรวมของตาราง")} testid="pipeline-funnel"><แถบนับ rows={เส้นทาง} empty="ยังไม่มีลูกค้าเป้าหมายในช่วงที่เลือก" /></การ์ดกล่อง>
        <การ์ดกล่อง title={`กราฟงานค้างตามขั้นตอน · ${ระดับ}`} คำอธิบาย={คำอธิบายหัวข้อ(null, "ลูกค้าเป้าหมายที่ยังเปิดอยู่ แยกตามขั้นที่อยู่ตอนนี้")} testid="pipeline-stages">{ขั้นตอนนี้ ? <แถบนับ rows={ขั้น} empty="ไม่มีลูกค้าเป้าหมายที่เปิดอยู่" /> : <div style={{ fontSize: "0.76rem", color: MUTED }}>กำลังโหลด…</div>}</การ์ดกล่อง>
      </div>
      <div className="hq-dealer-charts">
        <การ์ดกล่อง title={`กราฟเหตุผลที่ปิดไม่สำเร็จ · ${ระดับ}`} คำอธิบาย={คำอธิบายหัวข้อ(ช่วง, "ลูกค้าเป้าหมายที่ปิดไม่สำเร็จ แยกตามเหตุผลที่บันทึก")} testid="pipeline-lost">{ในช่วง ? <แถบนับ rows={เหตุผล} empty="ไม่มีลูกค้าเป้าหมายที่ปิดไม่สำเร็จในช่วงนี้" /> : <div style={{ fontSize: "0.76rem", color: MUTED }}>กำลังโหลด…</div>}</การ์ดกล่อง>
        <การ์ดกล่อง title={`กราฟลูกค้าเป้าหมายตามแหล่งที่มา · ${ระดับ}`} คำอธิบาย={คำอธิบายหัวข้อ(ช่วง, "ลูกค้าเป้าหมายที่เข้ามาในช่วง แยกตามแหล่งที่มา")} testid="pipeline-sources">{ในช่วง ? <แถบนับ rows={แหล่ง} empty="ยังไม่มีลูกค้าเป้าหมายในช่วงที่เลือก" /> : <div style={{ fontSize: "0.76rem", color: MUTED }}>กำลังโหลด…</div>}</การ์ดกล่อง>
      </div>
    </>
  );
}

// ── ระดับดีลเลอร์: ใบ/ลีดล่าสุด + ปุ่มเปิดแผงดีลเลอร์ ──────────────────────────────────────────────────────────
//   ยิงคำขอเฉพาะตอนอยู่ระดับดีลเลอร์ (คอมโพเนนต์นี้แสดงเฉพาะระดับนั้น) — ไม่เพิ่มคำขอให้ระดับอื่น
export function ล่าสุดของดีลเลอร์({ code }: { code: string }) {
  const router = useRouter();
  const ชื่อของ = useชื่อดีลเลอร์();   // ไม่มีรหัสบนจอ (บอสสั่ง 6 พ.ย. 69)
  const ใบผล = useQuotationsPage({ limit: 5, offset: 0, sort: { col: "created_at", dir: "desc" }, sentOnly: true, dealerCodes: [code] });
  const ลีดผล = useLeadsPage({ limit: 5, offset: 0, dealerCodes: [code] });
  const ใบ = ใบผล ? ใบผล.rows.map(q => ({ id: q.id, customer: q.customer, status: ชื่อสถานะใบHQ[q.status], date: q.date ? fmtISOToThai(q.date) : "—" })) : null;
  // ขั้นของลีด: ฐานคิดให้แล้ว (leads_page · stageNo) · ไม่มี = คิดจากสถานะด้วยตัวกลาง leadStage.ts
  const ลีด = ลีดผล ? ลีดผล.rows.map(l => ({ id: l.id, company: l.company, stage: ชื่อขั้น((l.stageNo as เลขขั้น | undefined) ?? เลขขั้นของลีด(l.status, false)),
    date: l.createdAt ? l.createdAt : "—" })) : null;
  const ตาราง = (หัว: string[], แถว: string[][] | null, ว่าง: string) => (
    <div className="table-wrap dense">
      <table>
        <thead><tr>{หัว.map(h => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>
          {แถว === null && <tr><td colSpan={หัว.length} className="empty-row">กำลังโหลด…</td></tr>}
          {แถว?.length === 0 && <tr><td colSpan={หัว.length} className="empty-row">{ว่าง}</td></tr>}
          {แถว?.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j} title={v} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
  return (
    <>
      <div className="hq-dealer-charts">
        <การ์ดกล่อง title={`ตารางใบเสนอราคาล่าสุดของ ${ชื่อของ(code)}`} คำอธิบาย={คำอธิบายหัวข้อ(null, "5 ใบล่าสุดที่ส่งลูกค้าแล้ว", "ใหม่สุดก่อน")} testid="dealer-latest-quotes">
          {ตาราง(["เลขที่", "ลูกค้า", "สถานะ", "วันที่"], ใบ?.map(q => [q.id, q.customer, q.status, q.date]) ?? null, "ยังไม่มีใบที่ส่งลูกค้า")}
          <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 10 }} onClick={() => router.push(`/hq/quotations?dealer=${code}`)}>ดูทั้งหมด ›</button>
        </การ์ดกล่อง>
        <การ์ดกล่อง title={`ตารางลูกค้าเป้าหมายล่าสุดของ ${ชื่อของ(code)}`} คำอธิบาย={คำอธิบายหัวข้อ(null, "5 รายล่าสุด", "ใหม่สุดก่อน")} testid="dealer-latest-leads">
          {ตาราง(["บริษัท", "ขั้นตอน", "วันที่เข้ามา"], ลีด?.map(l => [l.company, l.stage, l.date]) ?? null, "ยังไม่มีลูกค้าเป้าหมาย")}
          <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 10 }} onClick={() => router.push(`/hq/leads?dealer=${code}`)}>ดูทั้งหมด ›</button>
        </การ์ดกล่อง>
      </div>
      <div style={{ marginBottom: 24 }}>
        <button type="button" className="btn btn-primary btn-sm" data-act="open-dealer-panel" onClick={() => router.push(`/hq/dealers/${code}`)}>เปิดแผงดูแลดีลเลอร์ {ชื่อของ(code)}</button>
      </div>
    </>
  );
}
