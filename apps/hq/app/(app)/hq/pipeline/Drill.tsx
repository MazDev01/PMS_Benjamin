"use client";
// ─── ภาพรวมยอดขาย · เจาะลึก (บอสสั่ง 30 ต.ค. 69 · FLOW แถว /hq/pipeline + H12) ─────────────────────────────────────────
//   แถบระดับ ทั้งเครือ › ภูมิภาค › จังหวัด › ดีลเลอร์ · แผงขวา "ที่มาของการ์ด" (รายดีลเลอร์ · แถวรวม = การ์ด)
//   ตารางตามภูมิภาค/จังหวัด (กดแถว = เจาะลงระดับถัดไป) · กล่อง เส้นทางการขาย / งานค้างตามขั้นตอน / เหตุผลปิดไม่สำเร็จ / ลีดตามแหล่งที่มา
//   ทุกตัวเลขมาจากฐาน: แถวรายดีลเลอร์ hq_pipeline_dealers (ใบ 0264) · ผลรวมกลุ่มใช้ รวมผลงาน() ตัวเดียวกับแถวรวมท้ายตาราง (= การ์ด)
//   ลีดตามขั้น/เหตุผล/แหล่งที่มา = lead_summary ชุดสาขาเดียวกับตาราง
//   "รายเดือน" (แท็บ · ที่มารายเดือนตอนเลือกดีลเลอร์) = hq_pipeline_months (ใบ 0268) · ฐานยังไม่ถึงใบนั้น = "รอข้อมูล" — ห้ามคิดเองจากรายการดิบในหน้าเว็บ
import { useRouter } from "next/navigation";
import { useชื่อดีลเลอร์ } from "@pms/shared/lib/dealerDisplay";
import { X, ChevronRight } from "lucide-react";
import { ClickableRow } from "@pms/shared/components/ui/ClickableRow";
import { รวมผลงาน, type ผลงานดีลเลอร์, type ผลงานรายเดือน } from "@pms/shared/lib/hqPipeline";
import { ชื่อภาค, ภาคมาตรฐาน } from "@pms/shared/lib/provinces";
import { ชื่อขั้น, สีกราฟขั้น, เลขขั้นของลีด, type เลขขั้น } from "@pms/shared/lib/leadStage";
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
  const หัว = [ชื่อมิติ[มิติ], "ลีด", "ใบที่ส่ง", "ปิดได้", "ปิดไม่ได้", "ยังไม่รู้ผล", "อัตราปิด", "ยอดขาย", "เป้าตามช่วง", "% เป้า", "ส่วนต่างกำไร", ""];
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
  const หัว = ["เดือน", "ลีด", "ใบที่ส่ง", "ปิดได้", "ปิดไม่ได้", "ยังไม่รู้ผล", "อัตราปิด", "ยอดขาย", "เป้ารายเดือน", "% เป้า", "ส่วนต่างกำไร", ""];
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
    <>
      <div onClick={ปิด} style={{ position: "fixed", inset: 0, background: "rgba(8,16,32,.32)", zIndex: 240 }} />
      <aside role="dialog" aria-modal="true" aria-label={`รายดีลเลอร์ ${เดือน.label}`} data-month-drawer={เดือน.key}
        style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "min(600px, 100%)", background: "#f7f9fc", zIndex: 241, display: "flex", flexDirection: "column", boxShadow: "-10px 0 30px rgba(8,16,32,.18)" }}>
        <header style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "16px 18px", display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}><div style={{ fontSize: "1rem", fontWeight: 800 }}>{เดือน.label}</div><div style={{ fontSize: "0.74rem", color: MUTED, marginTop: 4 }}>แยกรายดีลเลอร์ · ยอดขายตามวันลูกค้าตอบรับ · กดแถว = เจาะดูดีลเลอร์</div></div>
          <button type="button" onClick={ปิด} aria-label="ปิดแผง" style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid #dbe3ec", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><X size={15} /></button>
        </header>
        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          <div className="card" style={{ marginBottom: 0 }}><div className="table-wrap dense">
            <table aria-label={`รายดีลเลอร์ ${เดือน.label}`}>
              <thead><tr><th>ดีลเลอร์</th><th className="num">ลีด</th><th className="num">ใบที่ส่ง</th><th className="num">ปิดได้</th><th className="num">ปิดไม่ได้</th><th className="num">ยอดขาย</th></tr></thead>
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
          </div></div>
        </div>
      </aside>
    </>
  );
}

// ── แผงขวา: ที่มาของการ์ด ───────────────────────────────────────────────────────────────────────────────────
export type การ์ดที่มา = "sales" | "winRate" | "margin" | "onTarget";
const หัวการ์ด: Record<การ์ดที่มา, string> = { sales: "ยอดขาย (เทียบเป้า)", winRate: "อัตราปิดการขาย", margin: "ส่วนต่างกำไรเฉลี่ย", onTarget: "ดีลเลอร์ที่ถึงเป้า" };
export function แผงที่มา({ การ์ด, แถว, รวมทั้งหมด, ดีลเลอร์, ปิด, ถึงเป้าเท่านั้น, สลับถึงเป้า, เดือน }: {
  การ์ด: การ์ดที่มา; แถว: ผลงานดีลเลอร์[]; รวมทั้งหมด: รวม; ดีลเลอร์: string | null; ปิด: () => void;
  ถึงเป้าเท่านั้น: boolean; สลับถึงเป้า: () => void;
  /** ระดับดีลเลอร์: ที่มารายเดือน (ใบ 0268) · null = ฐานยังไม่ถึงใบนั้น → รอข้อมูล */
  เดือน: แถวเดือน[] | null;
}) {
  const ชื่อของ = useชื่อดีลเลอร์();   // ไม่มีรหัสบนจอ (บอสสั่ง 6 พ.ย. 69)
  const เรียง = [...แถว].sort((a, b) => b.sales - a.sales || a.code.localeCompare(b.code));
  const คอลัมน์: Record<การ์ดที่มา, { หัว: string[]; ค่า: (r: ผลงานดีลเลอร์) => (string | number)[]; รวม: (string | number)[] }> = {
    sales: { หัว: ["ยอดขาย", "เป้าตามช่วง", "% เป้า"], ค่า: r => [fmtBaht(r.sales), r.target == null ? "—" : fmtBaht(r.target), เปอร์เซ็นต์(r.pct)],
      รวม: [fmtBaht(รวมทั้งหมด.sales), รวมทั้งหมด.target == null ? "—" : fmtBaht(รวมทั้งหมด.target), เปอร์เซ็นต์(รวมทั้งหมด.pct)] },
    winRate: { หัว: ["ปิดได้", "ปิดไม่ได้", "อัตราปิด"], ค่า: r => [r.won, r.lost, เปอร์เซ็นต์(r.rate)], รวม: [รวมทั้งหมด.won, รวมทั้งหมด.lost, เปอร์เซ็นต์(รวมทั้งหมด.rate)] },
    margin: { หัว: ["ใบที่ผูกใบ HQ", "ส่วนต่างกำไร"], ค่า: r => [r.marginQuotes, r.marginPct == null ? "—" : `${r.marginPct.toFixed(1)}%`],
      รวม: [รวมทั้งหมด.marginQuotes, รวมทั้งหมด.marginPct == null ? "—" : `${รวมทั้งหมด.marginPct.toFixed(1)}%`] },
    onTarget: { หัว: ["ยอดตั้งแต่ต้นปี", "เป้าทั้งปี", "ถึงเป้า"], ค่า: r => [fmtBaht(r.ytd), r.annualTarget == null ? "—" : fmtBaht(r.annualTarget), r.onTarget ? "ถึงแล้ว" : "ยังไม่ถึง"],
      รวม: ["", "", `${รวมทั้งหมด.onTarget} ราย`] },
  };
  const c = คอลัมน์[การ์ด];
  return (
    <>
      <div onClick={ปิด} style={{ position: "fixed", inset: 0, background: "rgba(8,16,32,.32)", zIndex: 240 }} />
      <aside role="dialog" aria-modal="true" aria-label={`ที่มา ${หัวการ์ด[การ์ด]}`} data-card-drawer={การ์ด}
        style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "min(560px, 100%)", background: "#f7f9fc", zIndex: 241, display: "flex", flexDirection: "column", boxShadow: "-10px 0 30px rgba(8,16,32,.18)" }}>
        <header style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "16px 18px", display: "flex", alignItems: "flex-start", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "1rem", fontWeight: 800, color: "#1F2937" }}>{หัวการ์ด[การ์ด]}</div>
            <div style={{ fontSize: "0.74rem", color: MUTED, marginTop: 4 }}>{ดีลเลอร์ ? `ที่มารายเดือน · ${ชื่อของ(ดีลเลอร์)}` : "ที่มาแยกรายดีลเลอร์ · ผลรวม = ตัวเลขบนการ์ด"}</div>
          </div>
          <button type="button" onClick={ปิด} aria-label="ปิดแผง" title="ปิดแผง"
            style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid #dbe3ec", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><X size={15} /></button>
        </header>
        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          {การ์ด === "onTarget" && (
            <button type="button" className="btn btn-secondary btn-sm" data-act="only-on-target" onClick={สลับถึงเป้า} style={{ marginBottom: 12 }}>
              {ถึงเป้าเท่านั้น ? "แสดงทุกดีลเลอร์ในตาราง" : "แสดงเฉพาะดีลเลอร์ที่ถึงเป้าในตาราง"}
            </button>
          )}
          {ดีลเลอร์ && !เดือน ? <div className="card" style={{ marginBottom: 0 }}><รอข้อมูลรายเดือน ข้อความ="ฐานข้อมูลยังไม่มีผลงานรายเดือนของดีลเลอร์ (รอบรวมงานฐาน)" /></div>
          : ดีลเลอร์ && เดือน ? (
            <div className="card" style={{ marginBottom: 0 }}>
              <div className="table-wrap dense">
                <table aria-label={`ที่มา ${หัวการ์ด[การ์ด]} รายเดือน`}>
                  <thead><tr><th>เดือน</th>{c.หัว.map(h => <th key={h} className="num">{h}</th>)}</tr></thead>
                  <tbody>
                    {เดือน.map(g => {
                      const x = g.รวม;
                      const ค่า: Record<การ์ดที่มา, (string | number)[]> = {
                        sales: [fmtBaht(x.sales), x.target == null ? "—" : fmtBaht(x.target), เปอร์เซ็นต์(x.pct)], winRate: [x.won, x.lost, เปอร์เซ็นต์(x.rate)],
                        margin: [x.marginQuotes, x.marginPct == null ? "—" : `${x.marginPct.toFixed(1)}%`], onTarget: [fmtBaht(x.sales), "", ""] };
                      return <tr key={g.key} data-drawer-row={g.key}><td>{g.label}</td>{ค่า[การ์ด].map((v, i) => <td key={i} className="num">{typeof v === "number" ? v.toLocaleString() : v}</td>)}</tr>;
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="card" style={{ marginBottom: 0 }}>
              <div className="table-wrap dense">
                <table aria-label={`ที่มา ${หัวการ์ด[การ์ด]} รายดีลเลอร์`}>
                  <colgroup><col style={{ width: "44%" }} />{c.หัว.map(h => <col key={h} />)}</colgroup>
                  <thead><tr><th>ดีลเลอร์</th>{c.หัว.map(h => <th key={h} className="num">{h}</th>)}</tr></thead>
                  <tbody>
                    {!เรียง.length && <tr><td colSpan={c.หัว.length + 1} className="empty-row">ไม่พบดีลเลอร์ในช่วงที่เลือก</td></tr>}
                    {เรียง.map(r => (
                      <tr key={r.code} data-drawer-row={r.code}>
                        <td title={ชื่อของ(r.code, r.name)} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ชื่อของ(r.code, r.name)}</td>
                        {c.ค่า(r).map((v, i) => <td key={i} className="num">{typeof v === "number" ? v.toLocaleString() : v}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
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
  const ขั้น = ([1, 2, 3, 4, 5] as เลขขั้น[]).map(n => ({ label: ชื่อขั้น(n), value: ขั้นตอนนี้?.byStage.find(s => s.stage === n)?.count ?? 0, color: สีกราฟขั้น[n] }));
  const เหตุผล = (ในช่วง?.byLostReason ?? []).filter(r => r.count > 0).sort((a, b) => b.count - a.count).map((r, i) => ({ label: r.reason || "ไม่ระบุเหตุผล", value: r.count, color: สีชุด[i % สีชุด.length] }));
  const แหล่ง = (ในช่วง?.bySource ?? []).filter(r => r.count > 0).sort((a, b) => b.count - a.count).map((r, i) => ({ label: r.source || "ไม่ระบุ", value: r.count, color: สีชุด[i % สีชุด.length] }));
  const เส้นทาง = [
    { label: "ลีดใหม่", value: รวมทั้งหมด.leads, color: "#003366" },
    { label: "ใบที่ส่ง", value: รวมทั้งหมด.quotes, color: "#0891b2" },
    { label: "ปิดสำเร็จ", value: รวมทั้งหมด.won, color: "#059669" },
    { label: "ปิดไม่สำเร็จ", value: รวมทั้งหมด.lost, color: "#dc2626" },
    { label: "ยังไม่รู้ผล", value: ยังไม่รู้ผล(รวมทั้งหมด), color: "#94a3b8" },
  ];
  return (
    <>
      <div className="hq-dealer-charts">
        <การ์ดกล่อง title={`กราฟเส้นทางการขาย · ${ระดับ}`} คำอธิบาย={คำอธิบายหัวข้อ(ช่วง, "ลีดที่เข้ามาในช่วง → ใบที่ส่ง → ผลปิดการขาย", "ตัวเลขเดียวกับแถวรวมของตาราง")} testid="pipeline-funnel"><แถบนับ rows={เส้นทาง} empty="ยังไม่มีลีดในช่วงที่เลือก" /></การ์ดกล่อง>
        <การ์ดกล่อง title={`กราฟงานค้างตามขั้นตอน · ${ระดับ}`} คำอธิบาย={คำอธิบายหัวข้อ(null, "ลีดที่ยังเปิดอยู่ แยกตามขั้นที่อยู่ตอนนี้")} testid="pipeline-stages">{ขั้นตอนนี้ ? <แถบนับ rows={ขั้น} empty="ไม่มีลีดที่เปิดอยู่" /> : <div style={{ fontSize: "0.76rem", color: MUTED }}>กำลังโหลด…</div>}</การ์ดกล่อง>
      </div>
      <div className="hq-dealer-charts">
        <การ์ดกล่อง title={`กราฟเหตุผลที่ปิดไม่สำเร็จ · ${ระดับ}`} คำอธิบาย={คำอธิบายหัวข้อ(ช่วง, "ลีดที่ปิดไม่สำเร็จ แยกตามเหตุผลที่บันทึก")} testid="pipeline-lost">{ในช่วง ? <แถบนับ rows={เหตุผล} empty="ไม่มีลีดที่ปิดไม่สำเร็จในช่วงนี้" /> : <div style={{ fontSize: "0.76rem", color: MUTED }}>กำลังโหลด…</div>}</การ์ดกล่อง>
        <การ์ดกล่อง title={`กราฟลีดตามแหล่งที่มา · ${ระดับ}`} คำอธิบาย={คำอธิบายหัวข้อ(ช่วง, "ลีดที่เข้ามาในช่วง แยกตามแหล่งที่มา")} testid="pipeline-sources">{ในช่วง ? <แถบนับ rows={แหล่ง} empty="ยังไม่มีลีดในช่วงที่เลือก" /> : <div style={{ fontSize: "0.76rem", color: MUTED }}>กำลังโหลด…</div>}</การ์ดกล่อง>
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
        <การ์ดกล่อง title={`ตารางลีดล่าสุดของ ${ชื่อของ(code)}`} คำอธิบาย={คำอธิบายหัวข้อ(null, "5 รายล่าสุด", "ใหม่สุดก่อน")} testid="dealer-latest-leads">
          {ตาราง(["บริษัท", "ขั้นตอน", "วันที่เข้ามา"], ลีด?.map(l => [l.company, l.stage, l.date]) ?? null, "ยังไม่มีลีด")}
          <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 10 }} onClick={() => router.push(`/hq/leads?dealer=${code}`)}>ดูทั้งหมด ›</button>
        </การ์ดกล่อง>
      </div>
      <div style={{ marginBottom: 24 }}>
        <button type="button" className="btn btn-primary btn-sm" data-act="open-dealer-panel" onClick={() => router.push(`/hq/dealers/${code}`)}>เปิดแผงดูแลดีลเลอร์ {ชื่อของ(code)}</button>
      </div>
    </>
  );
}
