"use client";
// ─── เจาะลึก 3 หน้า HQ (ลูกค้าเป้าหมาย · ใบเสนอราคา · ลูกค้า) — โครงเดียวกับภาพรวมยอดขาย (บอสสั่ง 2 พ.ย. 69) ──────────────
//   ตัวเดียวใช้ทั้ง 3 หน้า (ห้ามเขียนแยก) · แต่ละหน้าส่ง "ตั้งค่า" (การ์ด + คอลัมน์) มาเท่านั้น — แบบหน้า DCFG
//   แถบระดับ ทั้งเครือ › ภูมิภาค › จังหวัด › ดีลเลอร์ (แถบระดับ · ชื่อมิติ ตัวเดียวกับ /hq/pipeline Drill.tsx)
//   การ์ด → แผงขวา "ที่มา" รายดีลเลอร์ (ระดับดีลเลอร์ = รายเดือน) · แท็บ ดีลเลอร์/ภูมิภาค/จังหวัด/รายเดือน (กราฟแท่ง + ตาราง) กดแถว = เจาะลง
//   แท็บรายเดือนกดแถว = แผงรายดีลเลอร์ของเดือนนั้น · ทุกตัวเลข = ผลรวมของแถวรายดีลเลอร์ชุดเดียว (hq_drill · ใบ 0271) → แถวรวม = การ์ด
import { useEffect, useMemo, useState } from "react";
import { X, ArrowDown, ArrowUp, Users, PhoneCall, Inbox, AlarmClock, Send, Hourglass, CheckCircle2, Percent, UserPlus, Store, type LucideIcon } from "lucide-react";
import { KpiRow, KpiCard } from "@pms/shared/components/ui/KpiCard";
import { ClickableRow } from "@pms/shared/components/ui/ClickableRow";
import { ชื่อภาค, ภาคมาตรฐาน, ป้ายทุกภูมิภาค } from "@pms/shared/lib/provinces";
import { metrics } from "@pms/shared/lib/data";
import { logRepoRead } from "@pms/shared/lib/repoLog";
import { useAuthReady } from "@pms/shared/lib/useAuthReady";
import { รวมคีย์, เดือนในช่วง, type หน้าเจาะลึก, type ข้อมูลเจาะลึก, type แถวเจาะลึก, type เดือนเจาะลึก } from "@pms/shared/lib/hqDrill";
import { ค่าแถว, ค่าเดือน, มีรายเดือน, type ตัวเลขเจาะลึก, type ตั้งค่าเจาะลึก, type ไอคอนการ์ด } from "@pms/shared/lib/hqDrillConfig";
import { แถบระดับ, ชื่อมิติ, รอข้อมูลรายเดือน, type มิติ } from "../pipeline/Drill";

const PRIMARY = "#003366";
const MUTED = "var(--muted-foreground)";

// ตั้งค่าของแต่ละหน้า (การ์ด + คอลัมน์) อยู่ที่ @pms/shared/lib/hqDrillConfig — แหล่งเดียวกับข้อทดสอบ
const รูปไอคอน: Record<ไอคอนการ์ด, LucideIcon> = { users: Users, phone: PhoneCall, inbox: Inbox, alarm: AlarmClock, send: Send, hourglass: Hourglass,
  check: CheckCircle2, percent: Percent, userPlus: UserPlus, store: Store };
const แสดง = (c: ตัวเลขเจาะลึก, v: number | null) => (v == null || Number.isNaN(v) ? "—" : c.f ? c.f(v) : v.toLocaleString());

// ── ขอบเขต (ระดับที่เลือก) ──────────────────────────────────────────────────────────────────────────────────
export type ขอบเขต = { ภาค: string | null; จังหวัด: string | null; ดีลเลอร์: string | null; มิติ: มิติ };
export const ขอบเขตทั้งเครือ: ขอบเขต = { ภาค: null, จังหวัด: null, ดีลเลอร์: null, มิติ: "dealer" };
export const ในขอบเขต = (rows: แถวเจาะลึก[], s: ขอบเขต) => rows.filter(r =>
  (!s.ภาค || ภาคมาตรฐาน(r.region) === s.ภาค) && (!s.จังหวัด || r.province === s.จังหวัด) && (!s.ดีลเลอร์ || r.code === s.ดีลเลอร์));
/** ไปที่ดีลเลอร์ (เช่น ?dealer= จากหน้าอื่น) — ภาค/จังหวัดตามดีลเลอร์นั้น */
export function ขอบเขตของดีลเลอร์(rows: แถวเจาะลึก[], code: string): ขอบเขต {
  const d = rows.find(r => r.code === code);
  return { ภาค: d ? ภาคมาตรฐาน(d.region) ?? null : null, จังหวัด: d?.province || null, ดีลเลอร์: code, มิติ: "dealer" };
}

// ── ข้อมูลจากฐาน ─────────────────────────────────────────────────────────────────────────────────────────────
/** null = กำลังโหลด · ผิดพลาด = แถวว่าง (หน้าแสดง "—"/ว่าง ไม่เดาเลข) */
export function useเจาะลึก(หน้า: หน้าเจาะลึก, start: string, end: string, today: string): ข้อมูลเจาะลึก | null {
  const พร้อม = useAuthReady();
  const [d, setD] = useState<ข้อมูลเจาะลึก | null>(null);
  useEffect(() => {
    if (!พร้อม) return;
    let alive = true;
    setD(null);
    metrics.hqDrill(หน้า, start, end, today)
      .then(x => { if (alive) setD(x); })
      .catch(e => { logRepoRead(`metrics.hqDrill(${หน้า})`, e); if (alive) setD({ dealers: [], months: [] }); });
    return () => { alive = false; };
  }, [พร้อม, หน้า, start, end, today]);
  return d;
}

// ── กลุ่มของแท็บ ─────────────────────────────────────────────────────────────────────────────────────────────
type กลุ่ม = { key: string; label: string; sub: string; code?: string; rows: แถวเจาะลึก[]; เดือน?: { y: number; m: number; idx: number } };
function จัดกลุ่มแท็บ(rows: แถวเจาะลึก[], dim: มิติ, start: string, end: string): กลุ่ม[] {
  if (dim === "dealer") return rows.map(r => ({ key: `dealer:${r.code}`, label: r.name, code: r.code, sub: r.province || "ไม่ระบุจังหวัด", rows: [r] }));
  if (dim === "month") return เดือนในช่วง(start, end).map((m, idx) => ({ key: `month:${m.key}`, label: m.label, sub: "", rows, เดือน: { y: m.y, m: m.m, idx } }));
  const m = new Map<string, แถวเจาะลึก[]>();
  rows.forEach(r => { const k = dim === "region" ? (ภาคมาตรฐาน(r.region) ?? "") : (r.province || ""); m.set(k, [...(m.get(k) ?? []), r]); });
  return [...m.entries()].map(([k, g]) => ({
    key: `${dim}:${k}`, label: dim === "region" ? (k ? ชื่อภาค(k) : "ไม่ระบุภูมิภาค") : (k || "ไม่ระบุจังหวัด"),
    sub: dim === "region" ? `${g.length} ดีลเลอร์` : `${ชื่อภาค(g[0].region)} · ${g.length} ดีลเลอร์`, rows: g,
  }));
}
const เดือนของกลุ่ม = (ms: เดือนเจาะลึก[], codes: Set<string>, y: number, m: number) => ms.filter(x => x.y === y && x.m === m && codes.has(x.code));

// ── หัวหน้าเจาะลึก: แถบระดับ · การ์ด · ตัวเลือกระดับ · แท็บ (แท่ง + ตาราง) · แผงขวา ─────────────────────────────────────────
export function หัวเจาะลึก({ ตั้งค่า, ข้อมูล, ขอบ, ตั้งขอบ, ช่วง, ชื่อแถวการ์ด }: {
  ตั้งค่า: ตั้งค่าเจาะลึก; ข้อมูล: ข้อมูลเจาะลึก | null; ขอบ: ขอบเขต; ตั้งขอบ: (s: ขอบเขต) => void;
  ช่วง: { start: string; end: string }; ชื่อแถวการ์ด: string;
}) {
  const ทั้งหมด = useMemo(() => ข้อมูล?.dealers ?? [], [ข้อมูล]);
  const rows = useMemo(() => ในขอบเขต(ทั้งหมด, ขอบ), [ทั้งหมด, ขอบ]);
  const codes = useMemo(() => new Set(rows.map(r => r.code)), [rows]);
  const เดือนทั้งหมด = useMemo(() => (ข้อมูล?.months ?? []).filter(m => codes.has(m.code)), [ข้อมูล, codes]);
  const [แผงการ์ด, setแผงการ์ด] = useState<string | null>(null);
  const [แผงเดือน, setแผงเดือน] = useState<กลุ่ม | null>(null);
  const [เรียง, setเรียง] = useState<{ k: string; ลง: boolean } | null>(null);
  const โหลด = ข้อมูล === null;
  const ชื่อดีลเลอร์ = ขอบ.ดีลเลอร์ ? ทั้งหมด.find(r => r.code === ขอบ.ดีลเลอร์)?.name : undefined;

  // เจาะลง: ภาค → แท็บจังหวัด · จังหวัด → แท็บดีลเลอร์ · ดีลเลอร์ → รายเดือน
  const เจาะ = (key: string) => {
    const i = key.indexOf(":"), t = key.slice(0, i), v = key.slice(i + 1);
    setเรียง(null); setแผงการ์ด(null);
    if (t === "region") ตั้งขอบ({ ภาค: v || null, จังหวัด: null, ดีลเลอร์: null, มิติ: "prov" });
    else if (t === "prov") { const d = ทั้งหมด.find(r => r.province === v); ตั้งขอบ({ ภาค: d ? ภาคมาตรฐาน(d.region) ?? null : ขอบ.ภาค, จังหวัด: v || null, ดีลเลอร์: null, มิติ: "dealer" }); }
    else if (t === "dealer") ตั้งขอบ(ขอบเขตของดีลเลอร์(ทั้งหมด, v));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const ไประดับ = (ระดับ: "all" | "region" | "prov") => {
    setเรียง(null);
    if (ระดับ === "all") ตั้งขอบ(ขอบเขตทั้งเครือ);
    else if (ระดับ === "region") ตั้งขอบ({ ภาค: ขอบ.ภาค, จังหวัด: null, ดีลเลอร์: null, มิติ: "prov" });
    else ตั้งขอบ({ ภาค: ขอบ.ภาค, จังหวัด: ขอบ.จังหวัด, ดีลเลอร์: null, มิติ: "dealer" });
  };

  // แท็บ: ระดับดีลเลอร์ = รายเดือนอย่างเดียว · เลือกภาคแล้วไม่มีแท็บภูมิภาค · เลือกจังหวัดแล้วไม่มีแท็บจังหวัด
  const dim: มิติ = ขอบ.ดีลเลอร์ ? "month" : ขอบ.มิติ;
  const แท็บ: มิติ[] = ขอบ.ดีลเลอร์ ? [] : (["dealer", "region", "prov", "month"] as มิติ[]).filter(d => !(d === "region" && (ขอบ.ภาค || ขอบ.จังหวัด)) && !(d === "prov" && ขอบ.จังหวัด));
  const คอลัมน์ = ตั้งค่า.คอลัมน์.filter(c => (!c.dims || c.dims.includes(dim)) && (dim !== "month" || มีรายเดือน(c)));
  const ค่าของกลุ่ม = (c: ตัวเลขเจาะลึก, g: กลุ่ม) => g.เดือน
    ? ค่าเดือน(c, เดือนของกลุ่ม(เดือนทั้งหมด, codes, g.เดือน.y, g.เดือน.m))
    : ค่าแถว(c, g.rows, ทั้งหมด);
  const กลุ่ม = useMemo(() => {
    const gs = จัดกลุ่มแท็บ(rows, dim, ช่วง.start, ช่วง.end);
    const คีย์ = เรียง?.k ?? (dim === "month" ? "__idx" : ตั้งค่า.แท่ง), ลง = เรียง ? เรียง.ลง : dim !== "month";
    const c = ตั้งค่า.คอลัมน์.find(x => x.k === คีย์);
    const ค่า = (g: กลุ่ม): number | string => คีย์ === "__idx" ? g.เดือน?.idx ?? 0 : คีย์ === "__name" ? g.label : c ? (ค่าของกลุ่ม(c, g) ?? -1) : 0;
    return [...gs].sort((a, b) => {
      const x = ค่า(a), y = ค่า(b);
      const r = typeof x === "string" ? x.localeCompare(String(y), "th") : x - Number(y);
      return (ลง ? -r : r) || a.label.localeCompare(b.label, "th");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, dim, ช่วง.start, ช่วง.end, เรียง, เดือนทั้งหมด, ตั้งค่า]);
  const คอลัมน์แท่ง = ตั้งค่า.คอลัมน์.find(c => c.k === ตั้งค่า.แท่ง)!;
  const ค่าแท่ง = (g: กลุ่ม) => ค่าของกลุ่ม(คอลัมน์แท่ง, g) ?? 0;
  const สูงสุด = Math.max(1, ...กลุ่ม.map(ค่าแท่ง));
  const หัวคอลัมน์แรก = dim === "month" ? "เดือน" : ชื่อมิติ[dim];

  const ตัวเลือกภาค = useMemo(() => [...new Set(ทั้งหมด.map(r => ภาคมาตรฐาน(r.region)).filter((x): x is NonNullable<typeof x> => !!x))].sort((a, b) => ชื่อภาค(a).localeCompare(ชื่อภาค(b), "th")), [ทั้งหมด]);
  const ตัวเลือกจังหวัด = useMemo(() => [...new Set(ทั้งหมด.filter(r => !ขอบ.ภาค || ภาคมาตรฐาน(r.region) === ขอบ.ภาค).map(r => r.province).filter(Boolean))].sort((a, b) => a.localeCompare(b, "th")), [ทั้งหมด, ขอบ.ภาค]);
  const ตัวเลือกดีลเลอร์ = useMemo(() => ทั้งหมด.filter(r => (!ขอบ.ภาค || ภาคมาตรฐาน(r.region) === ขอบ.ภาค) && (!ขอบ.จังหวัด || r.province === ขอบ.จังหวัด)), [ทั้งหมด, ขอบ.ภาค, ขอบ.จังหวัด]);
  const เลือก = (label: string, v: string | null, opts: { v: string; l: string }[], on: (v: string | null) => void, all: string) => (
    <select aria-label={label} title={label} value={v ?? ""} onChange={e => on(e.target.value || null)} className="form-select"
      style={{ flex: "1 1 0", minWidth: 140, maxWidth: 240, fontSize: "0.82rem" }}>
      <option value="">{all}</option>
      {opts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
    </select>
  );

  return (
    <>
      <แถบระดับ ภาค={ขอบ.ภาค} จังหวัด={ขอบ.จังหวัด} ดีลเลอร์={ขอบ.ดีลเลอร์} ชื่อดีลเลอร์={ชื่อดีลเลอร์} ไป={ไประดับ} />

      <KpiRow label={ชื่อแถวการ์ด} range={ช่วง} สามใบ={ตั้งค่า.การ์ด.length === 3}>
        {ตั้งค่า.การ์ด.map(c => {
          const v = โหลด ? null : ค่าแถว(c, rows, ทั้งหมด);
          return <KpiCard key={c.k} kpi={c.kpi} label={c.l} value={โหลด ? null : แสดง(c, v)} rawValue={v} unit={โหลด ? undefined : c.sub(rows)}
            empty="กำลังโหลด…" danger={c.danger && (v ?? 0) > 0} icon={รูปไอคอน[c.icon]} color={c.color} bg={c.bg}
            actionLabel="เจาะดูที่มา" onClick={() => setแผงการ์ด(c.k)} />;
        })}
      </KpiRow>

      <div className="card hq-sticky-filter" data-drill-scope>
        <div className="card-body" style={{ display: "flex", gap: 8, flexWrap: "nowrap", alignItems: "center", paddingTop: 12, paddingBottom: 12, overflowX: "auto" }}>
          {เลือก("ภูมิภาค", ขอบ.ภาค, ตัวเลือกภาค.map(r => ({ v: r, l: ชื่อภาค(r) })), v => { setเรียง(null); ตั้งขอบ({ ภาค: v, จังหวัด: null, ดีลเลอร์: null, มิติ: v ? "prov" : "dealer" }); }, ป้ายทุกภูมิภาค)}
          {เลือก("จังหวัด", ขอบ.จังหวัด, ตัวเลือกจังหวัด.map(p => ({ v: p, l: p })), v => { setเรียง(null); if (v) เจาะ(`prov:${v}`); else ไประดับ(ขอบ.ภาค ? "region" : "all"); }, "ทุกจังหวัด")}
          {เลือก("ดีลเลอร์", ขอบ.ดีลเลอร์, ตัวเลือกดีลเลอร์.map(r => ({ v: r.code, l: `${r.code} · ${r.name}` })), v => { setเรียง(null); if (v) เจาะ(`dealer:${v}`); else ไประดับ(ขอบ.จังหวัด ? "prov" : ขอบ.ภาค ? "region" : "all"); }, "ทุกดีลเลอร์")}
          {(ขอบ.ภาค || ขอบ.จังหวัด || ขอบ.ดีลเลอร์) && <button type="button" className="btn btn-secondary btn-sm" style={{ flexShrink: 0 }} onClick={() => ไประดับ("all")}>กลับไปทั้งเครือ</button>}
        </div>
      </div>

      {/* ── แท่ง ── */}
      <div className="card" data-drill-chart={dim} style={{ marginBottom: 0 }}>
        <div className="card-header" style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div className="card-title">{ขอบ.ดีลเลอร์ ? `รายเดือนของ ${ขอบ.ดีลเลอร์}` : `แยกตาม${ชื่อมิติ[dim]}`}</div>
            <div style={{ fontSize: "0.72rem", color: MUTED, marginTop: 2 }}>แท่ง = {ตั้งค่า.ป้ายแท่ง} · กดแถวเพื่อเจาะลึก · กดหัวคอลัมน์เพื่อเรียง</div>
          </div>
          {แท็บ.length > 1 && (
            <div role="tablist" aria-label="ดูแยกตาม" style={{ display: "inline-flex", border: "1px solid #dbe3ec", borderRadius: 10, overflow: "hidden" }}>
              {แท็บ.map(m => (
                <button key={m} type="button" role="tab" aria-selected={dim === m} data-dim={m} onClick={() => { setเรียง(null); ตั้งขอบ({ ...ขอบ, มิติ: m }); }}
                  style={{ border: "none", padding: "5px 12px", fontSize: "0.76rem", fontWeight: 700, cursor: "pointer",
                    background: dim === m ? PRIMARY : "#fff", color: dim === m ? "#fff" : MUTED }}>{ชื่อมิติ[m]}</button>
              ))}
            </div>
          )}
        </div>
        <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 420, overflowY: "auto" }}>
          {โหลด ? <div style={{ fontSize: "0.8rem", color: "#9ca3af" }}>กำลังโหลด…</div>
            : dim === "month" && !มีรายเดือน(คอลัมน์แท่ง) ? <รอข้อมูลรายเดือน ข้อความ="ตัวเลขนี้ไม่มีรายเดือน" />
            : !กลุ่ม.length ? <div style={{ fontSize: "0.8rem", color: MUTED }}>ไม่พบข้อมูลในระดับนี้</div>
            : กลุ่ม.map(g => {
              const v = ค่าแท่ง(g);
              return (
                <button key={g.key} type="button" data-bar-row={g.key} data-value={v} onClick={() => g.เดือน ? (ขอบ.ดีลเลอร์ ? undefined : setแผงเดือน(g)) : เจาะ(g.key)}
                  style={{ all: "unset", cursor: g.เดือน && ขอบ.ดีลเลอร์ ? "default" : "pointer", display: "grid", gridTemplateColumns: "minmax(120px, 220px) 1fr 110px", gap: 10, alignItems: "center" }}>
                  <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "#1F2937", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={g.label}>
                    {g.code && <strong style={{ color: PRIMARY, fontFamily: "monospace", marginRight: 6 }}>{g.code}</strong>}{g.label}
                  </span>
                  <span style={{ height: 10, borderRadius: 999, background: "var(--muted)", overflow: "hidden" }}>
                    <span className="bar-grow" style={{ display: "block", width: `${Math.round(v / สูงสุด * 100)}%`, height: "100%", borderRadius: 999, background: PRIMARY }} />
                  </span>
                  <span style={{ fontSize: "0.78rem", fontWeight: 800, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{แสดง(คอลัมน์แท่ง, v)}</span>
                </button>
              );
            })}
        </div>
      </div>

      {/* ── ตาราง · แถวรวม = การ์ด ── */}
      <div className="card" data-drill-table={dim} style={{ marginBottom: 0, marginTop: 16 }}>
        <div className="table-wrap dense">
          <table aria-label={`ตาราง${ตั้งค่า.ป้ายแถว}แยกตาม${หัวคอลัมน์แรก}`} style={{ minWidth: 240 + คอลัมน์.length * 120 }}>
            <colgroup><col style={{ width: 240 }} />{คอลัมน์.map(c => <col key={c.k} style={{ width: 120 }} />)}<col style={{ width: 110 }} /></colgroup>
            <thead>
              <tr>
                {[{ k: dim === "month" ? "__idx" : "__name", l: หัวคอลัมน์แรก, num: false }, ...คอลัมน์.map(c => ({ k: c.k, l: c.l, num: true }))].map(h => (
                  <th key={h.k} className={h.num ? "num" : undefined} aria-sort={เรียง?.k === h.k ? (เรียง.ลง ? "descending" : "ascending") : "none"}>
                    <button type="button" data-sort={h.k} onClick={() => setเรียง(s => ({ k: h.k, ลง: s?.k === h.k ? !s.ลง : h.num }))}
                      style={{ all: "unset", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 3 }}>
                      {h.l}{เรียง?.k === h.k ? (เรียง.ลง ? <ArrowDown size={11} /> : <ArrowUp size={11} />) : null}
                    </button>
                  </th>
                ))}
                <th aria-label="เจาะลึก" />
              </tr>
            </thead>
            <tbody>
              {โหลด && <tr><td colSpan={คอลัมน์.length + 2} className="empty-row">กำลังโหลด…</td></tr>}
              {!โหลด && !กลุ่ม.length && <tr><td colSpan={คอลัมน์.length + 2} className="empty-row">ไม่พบข้อมูลในระดับนี้</td></tr>}
              {!โหลด && กลุ่ม.map(g => {
                const เซลล์ = คอลัมน์.map(c => { const v = ค่าของกลุ่ม(c, g); return <td key={c.k} className="num" data-cell={c.k} data-value={v ?? ""}>{แสดง(c, v)}</td>; });
                const ป้าย = <td data-group-row={g.key} title={g.label}>
                  {g.code ? <><strong style={{ color: PRIMARY, fontFamily: "monospace", marginRight: 6 }}>{g.code}</strong>{g.label}</> : <strong style={{ color: "#1F2937" }}>{g.label}</strong>}
                  {g.sub && <div style={{ fontSize: "0.68rem", color: MUTED }}>{g.sub}</div>}
                </td>;
                if (g.เดือน && ขอบ.ดีลเลอร์) return <tr key={g.key}>{ป้าย}{เซลล์}<td /></tr>;
                return (
                  <ClickableRow key={g.key} className="clickable" onActivate={() => g.เดือน ? setแผงเดือน(g) : เจาะ(g.key)}
                    label={g.เดือน ? `เปิดรายดีลเลอร์ของ ${g.label}` : `เจาะดู ${g.label}`}>
                    {ป้าย}{เซลล์}
                    <td style={{ color: PRIMARY, fontWeight: 700, fontSize: "0.74rem", whiteSpace: "nowrap" }}>{g.เดือน ? "ดูรายดีลเลอร์ ›" : "เจาะลึก ›"}</td>
                  </ClickableRow>
                );
              })}
            </tbody>
            {!โหลด && (
              <tfoot>
                <tr data-group-total style={{ background: "#f7f9fc", fontWeight: 800 }}>
                  <td>รวม {กลุ่ม.length.toLocaleString()} {dim === "month" ? "เดือน" : ชื่อมิติ[dim]}</td>
                  {คอลัมน์.map(c => { const v = dim === "month" ? ค่าเดือน(c, เดือนทั้งหมด) : ค่าแถว(c, rows, ทั้งหมด); return <td key={c.k} className="num" data-sum={c.k} data-value={v ?? ""}>{แสดง(c, v)}</td>; })}
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <div style={{ padding: "8px 14px", fontSize: "0.7rem", color: MUTED }}>
          {กลุ่ม.length.toLocaleString()} แถว · แถวรวม = การ์ดด้านบน{dim === "month" ? " · ตัวเลข \"ตอนนี้\" ไม่มีรายเดือน ดูที่การ์ด" : ""}
        </div>
      </div>

      {แผงการ์ด && (() => {
        const c = ตั้งค่า.การ์ด.find(x => x.k === แผงการ์ด)!;
        const รายเดือน = !!ขอบ.ดีลเลอร์ && มีรายเดือน(c);
        const รวม = ค่าแถว(c, rows, ทั้งหมด);
        const แถวแผง = รายเดือน
          ? เดือนในช่วง(ช่วง.start, ช่วง.end).map(m => ({ key: m.key, label: m.label, v: ค่าเดือน(c, เดือนของกลุ่ม(เดือนทั้งหมด, codes, m.y, m.m)) }))
          : [...rows].map(r => ({ key: r.code, label: `${r.code} · ${r.name}`, v: ค่าแถว(c, [r], ทั้งหมด) })).sort((a, b) => (b.v ?? -1) - (a.v ?? -1) || a.key.localeCompare(b.key));
        return (
          <แผงขวา ชื่อ={c.l} คำอธิบาย={รายเดือน ? `ที่มารายเดือน · ${ขอบ.ดีลเลอร์}` : "ที่มาแยกรายดีลเลอร์ · แถวรวม = การ์ด"} ปิด={() => setแผงการ์ด(null)} testid={`card:${c.k}`}>
            <table aria-label={`ที่มา ${c.l}`}>
              <thead><tr><th>{รายเดือน ? "เดือน" : "ดีลเลอร์"}</th><th className="num">{c.l}</th></tr></thead>
              <tbody>
                {!แถวแผง.length && <tr><td colSpan={2} className="empty-row">ไม่พบดีลเลอร์ในระดับนี้</td></tr>}
                {แถวแผง.map(r => <tr key={r.key} data-drawer-row={r.key}><td title={r.label} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</td><td className="num" data-value={r.v ?? ""}>{แสดง(c, r.v)}</td></tr>)}
              </tbody>
              <tfoot><tr data-drawer-total style={{ background: "#eef2f7", fontWeight: 800 }}><td>รวม (= การ์ด)</td><td className="num" data-value={รวม ?? ""}>{แสดง(c, รวม)}</td></tr></tfoot>
            </table>
          </แผงขวา>
        );
      })()}

      {แผงเดือน?.เดือน && (() => {
        const ค = ตั้งค่า.คอลัมน์.filter(มีรายเดือน);
        const { y, m } = แผงเดือน.เดือน;
        const ของเดือน = เดือนของกลุ่ม(เดือนทั้งหมด, codes, y, m);
        return (
          <แผงขวา ชื่อ={แผงเดือน.label} คำอธิบาย="แยกรายดีลเลอร์ · กดแถว = เจาะดูดีลเลอร์" ปิด={() => setแผงเดือน(null)} testid={`month:${แผงเดือน.key}`} กว้าง={640}>
            <table aria-label={`รายดีลเลอร์ ${แผงเดือน.label}`}>
              <thead><tr><th>ดีลเลอร์</th>{ค.map(c => <th key={c.k} className="num">{c.l}</th>)}</tr></thead>
              <tbody>
                {rows.map(r => (
                  <ClickableRow key={r.code} className="clickable" onActivate={() => { setแผงเดือน(null); เจาะ(`dealer:${r.code}`); }} label={`เจาะดู ${r.code}`}>
                    <td data-drawer-row={r.code} title={`${r.code} · ${r.name}`} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      <strong style={{ color: PRIMARY, fontFamily: "monospace", marginRight: 6 }}>{r.code}</strong>{r.name}</td>
                    {ค.map(c => { const v = ค่าเดือน(c, ของเดือน.filter(x => x.code === r.code)); return <td key={c.k} className="num" data-cell={c.k} data-value={v ?? ""}>{แสดง(c, v)}</td>; })}
                  </ClickableRow>
                ))}
              </tbody>
              <tfoot><tr data-drawer-total style={{ background: "#eef2f7", fontWeight: 800 }}>
                <td>รวม (= แถว {แผงเดือน.label})</td>
                {ค.map(c => { const v = ค่าเดือน(c, ของเดือน); return <td key={c.k} className="num" data-sum={c.k} data-value={v ?? ""}>{แสดง(c, v)}</td>; })}
              </tr></tfoot>
            </table>
          </แผงขวา>
        );
      })()}
    </>
  );
}

function แผงขวา({ ชื่อ, คำอธิบาย, ปิด, testid, กว้าง = 560, children }: { ชื่อ: string; คำอธิบาย: string; ปิด: () => void; testid: string; กว้าง?: number; children: React.ReactNode }) {
  return (
    <>
      <div onClick={ปิด} style={{ position: "fixed", inset: 0, background: "rgba(8,16,32,.32)", zIndex: 240 }} />
      <aside role="dialog" aria-modal="true" aria-label={`ที่มา ${ชื่อ}`} data-drill-drawer={testid}
        style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: `min(${กว้าง}px, 100%)`, background: "#f7f9fc", zIndex: 241, display: "flex", flexDirection: "column", boxShadow: "-10px 0 30px rgba(8,16,32,.18)" }}>
        <header style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "16px 18px", display: "flex", alignItems: "flex-start", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "1rem", fontWeight: 800, color: "#1F2937" }}>{ชื่อ}</div>
            <div style={{ fontSize: "0.74rem", color: MUTED, marginTop: 4 }}>{คำอธิบาย}</div>
          </div>
          <button type="button" onClick={ปิด} aria-label="ปิดแผง" title="ปิดแผง"
            style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid #dbe3ec", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><X size={15} /></button>
        </header>
        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          <div className="card" style={{ marginBottom: 0 }}><div className="table-wrap dense">{children}</div></div>
        </div>
      </aside>
    </>
  );
}
