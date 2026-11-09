"use client";
// ─── เจาะลึก 3 หน้า HQ (ลูกค้าเป้าหมาย · ใบเสนอราคา · ลูกค้า) — โครงเดียวกับภาพรวมยอดขาย (บอสสั่ง 2 พ.ย. 69) ──────────────
//   ตัวเดียวใช้ทั้ง 3 หน้า (ห้ามเขียนแยก) · แต่ละหน้าส่ง "ตั้งค่า" (การ์ด + คอลัมน์) มาเท่านั้น — แบบหน้า DCFG
//   แถบระดับ ทั้งเครือ › ภูมิภาค › จังหวัด › ดีลเลอร์ (แถบระดับ · ชื่อมิติ ตัวเดียวกับ /hq/pipeline Drill.tsx)
//   การ์ด → แผงขวา "ที่มา" รายดีลเลอร์ (ระดับดีลเลอร์ = รายเดือน) · แท็บ ดีลเลอร์/ภูมิภาค/จังหวัด/รายเดือน (กราฟแท่ง + ตาราง) กดแถว = เจาะลง
//   แท็บรายเดือนกดแถว = แผงรายดีลเลอร์ของเดือนนั้น · ทุกตัวเลข = ผลรวมของแถวรายดีลเลอร์ชุดเดียว (hq_drill · ใบ 0271) → การ์ด = ผลรวมแถว
//   ไม่มีแถวรวมทุกตาราง/แผง (บอสสั่ง 6 พ.ย. 69 · ตัวเลขรวมดูที่การ์ด) · ตารางพอดีจอ 1366/1920 (.table-wrap.fit · ซ่อนคอลัมน์ที่ทั้งตารางเป็น "—")
//   ไม่มีรหัสหน้าชื่อ (ตาราง + กราฟแท่ง) · ภูมิภาค · จังหวัด เป็นบรรทัดเล็กใต้ชื่อดีลเลอร์
import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Users, CalendarDays, PhoneCall, Inbox, AlarmClock, Send, Hourglass, CheckCircle2, Percent, UserPlus, Store, type LucideIcon } from "lucide-react";
import { KpiRow, KpiCard } from "@pms/shared/components/ui/KpiCard";
import { ClickableRow } from "@pms/shared/components/ui/ClickableRow";
import { ชื่อภาค, ภาคมาตรฐาน, ป้ายทุกภูมิภาค } from "@pms/shared/lib/provinces";
import { ซ่อนคอลัมน์ว่าง } from "@pms/shared/lib/tableFit";
import { สร้างชื่อแสดง } from "@pms/shared/lib/dealerDisplayName";
import { metrics } from "@pms/shared/lib/data";
import { logRepoRead } from "@pms/shared/lib/repoLog";
import { useAuthReady } from "@pms/shared/lib/useAuthReady";
import { รวมคีย์, เดือนในช่วง, type หน้าเจาะลึก, type ข้อมูลเจาะลึก, type แถวเจาะลึก, type เดือนเจาะลึก } from "@pms/shared/lib/hqDrill";
import { ค่าแถว, ค่าเดือน, มีรายเดือน, type ตัวเลขเจาะลึก, type ตั้งค่าเจาะลึก, type ไอคอนการ์ด } from "@pms/shared/lib/hqDrillConfig";
import { แถบระดับ, ชื่อมิติ, รอข้อมูลรายเดือน, type มิติ } from "../pipeline/Drill";
import { ชื่อหัวข้อ, คำอธิบายหัวข้อ, คำแนะนำกดแถว, ป้ายระดับ } from "@pms/shared/lib/drillTitles";
import { BoxTitle } from "@pms/shared/components/ui/BoxTitle";
import { fmtISOToThai } from "@pms/shared/lib/mock";
import { หน้าต่างเจาะ, ส่วนเจาะ } from "./DrillWindow";
import { useประวัติระดับ } from "@pms/shared/lib/useDrillHistory";
import { useกว้างคอลัมน์ชื่อ } from "@pms/shared/lib/useNameColWidth";
import { บรรทัดใต้ชื่อดีลเลอร์, type ระดับเจาะ } from "@pms/shared/lib/drillColumns";

const PRIMARY = "#003366";
const MUTED = "var(--muted-foreground)";

// ตั้งค่าของแต่ละหน้า (การ์ด + คอลัมน์) อยู่ที่ @pms/shared/lib/hqDrillConfig — แหล่งเดียวกับข้อทดสอบ
const รูปไอคอน: Record<ไอคอนการ์ด, LucideIcon> = { users: Users, phone: PhoneCall, inbox: Inbox, alarm: AlarmClock, send: Send, hourglass: Hourglass,
  check: CheckCircle2, percent: Percent, userPlus: UserPlus, store: Store };
// ช่องการ์ดคงที่ — ตั้งค่าแต่ละหน้ามีการ์ด 4 ใบ (ลูกค้า 3 ใบ) · ตัวตรวจนับจากอาร์เรย์นี้
const สี่ช่อง = [0, 1, 2, 3];
const สามช่อง = [0, 1, 2];
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

/** ป้ายระดับที่เลือกเป็นคำ (หัวข้อกราฟ/ตาราง) — "ทั้งเครือ" · "ภาคเหนือ" · "จังหวัด…" · "ดีลเลอร์ ชื่อ" (ไม่มีรหัส · ชื่อซ้ำ = "ชื่อ (รหัส)") */
export const ป้ายระดับของขอบ = (s: ขอบเขต, rows: แถวเจาะลึก[]) =>
  ป้ายระดับ({ ภาค: s.ภาค, จังหวัด: s.จังหวัด, ดีลเลอร์: s.ดีลเลอร์, ชื่อดีลเลอร์: s.ดีลเลอร์ ? สร้างชื่อแสดง(rows)(s.ดีลเลอร์) : undefined });

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
function จัดกลุ่มแท็บ(rows: แถวเจาะลึก[], dim: มิติ, start: string, end: string, ชื่อแสดง: (code: string, name: string) => string = (_c, n) => n, ระดับ: ระดับเจาะ = {}): กลุ่ม[] {
  // บรรทัดใต้ชื่อ: ตัดภูมิภาค/จังหวัดที่ระดับบอกอยู่แล้ว (บอสสั่ง 9 พ.ย. 69 · ตัวกลาง drillColumns)
  if (dim === "dealer") return rows.map(r => ({ key: `dealer:${r.code}`, label: ชื่อแสดง(r.code, r.name), code: r.code, sub: บรรทัดใต้ชื่อดีลเลอร์(r, ระดับ), rows: [r] }));
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
  // ชื่อแสดงของดีลเลอร์ (ตัวกลาง · ไม่มีรหัส · ชื่อซ้ำ = "ชื่อ (รหัส)" · บอสสั่ง 6 พ.ย. 69)
  const ชื่อแสดง = useMemo(() => สร้างชื่อแสดง(ทั้งหมด), [ทั้งหมด]);
  const ชื่อดีลเลอร์ = ขอบ.ดีลเลอร์ ? ชื่อแสดง(ขอบ.ดีลเลอร์) : undefined;

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
  // ปุ่มย้อนกลับของเบราว์เซอร์ = ถอยทีละ 1 ระดับ (บอสสั่ง 5 พ.ย. 69 · ตัวกลาง useประวัติระดับ) — แท็บตั้งต้นของระดับ: ภาค = จังหวัด · อื่น = ดีลเลอร์
  useประวัติระดับ({ ภาค: ขอบ.ภาค, จังหวัด: ขอบ.จังหวัด, ดีลเลอร์: ขอบ.ดีลเลอร์ }, r => {
    setเรียง(null); setแผงการ์ด(null);
    ตั้งขอบ({ ...r, มิติ: r.ภาค && !r.จังหวัด && !r.ดีลเลอร์ ? "prov" : "dealer" });
  });

  // แท็บ: ระดับดีลเลอร์ = รายเดือนอย่างเดียว · เลือกภาคแล้วไม่มีแท็บภูมิภาค · เลือกจังหวัดแล้วไม่มีแท็บจังหวัด
  const dim: มิติ = ขอบ.ดีลเลอร์ ? "month" : ขอบ.มิติ;
  const แท็บ: มิติ[] = ขอบ.ดีลเลอร์ ? [] : (["dealer", "region", "prov", "month"] as มิติ[]).filter(d => !(d === "region" && (ขอบ.ภาค || ขอบ.จังหวัด)) && !(d === "prov" && ขอบ.จังหวัด));
  const คอลัมน์ = ตั้งค่า.คอลัมน์.filter(c => (!c.dims || c.dims.includes(dim)) && (dim !== "month" || มีรายเดือน(c)));
  const ค่าของกลุ่ม = (c: ตัวเลขเจาะลึก, g: กลุ่ม) => g.เดือน
    ? ค่าเดือน(c, เดือนของกลุ่ม(เดือนทั้งหมด, codes, g.เดือน.y, g.เดือน.m))
    : ค่าแถว(c, g.rows, ทั้งหมด);
  const กลุ่ม = useMemo(() => {
    const gs = จัดกลุ่มแท็บ(rows, dim, ช่วง.start, ช่วง.end, ชื่อแสดง, { ภาค: ขอบ.ภาค, จังหวัด: ขอบ.จังหวัด, ดีลเลอร์: ขอบ.ดีลเลอร์ });
    const คีย์ = เรียง?.k ?? (dim === "month" ? "__idx" : ตั้งค่า.แท่ง), ลง = เรียง ? เรียง.ลง : dim !== "month";
    const c = ตั้งค่า.คอลัมน์.find(x => x.k === คีย์);
    const ค่า = (g: กลุ่ม): number | string => คีย์ === "__idx" ? g.เดือน?.idx ?? 0 : คีย์ === "__name" ? g.label : c ? (ค่าของกลุ่ม(c, g) ?? -1) : 0;
    return [...gs].sort((a, b) => {
      const x = ค่า(a), y = ค่า(b);
      const r = typeof x === "string" ? x.localeCompare(String(y), "th") : x - Number(y);
      return (ลง ? -r : r) || a.label.localeCompare(b.label, "th");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, dim, ช่วง.start, ช่วง.end, เรียง, เดือนทั้งหมด, ตั้งค่า, ชื่อแสดง, ขอบ.ภาค, ขอบ.จังหวัด, ขอบ.ดีลเลอร์]);
  // คอลัมน์ที่ทั้งตารางเป็น "—" ซ่อนเอง (บอสสั่ง 6 พ.ย. 69) — ยังโหลด/ไม่มีแถว = แสดงครบ (ไม่เดาว่าว่าง)
  const คอลัมน์แสดง = ซ่อนคอลัมน์ว่าง(คอลัมน์, กลุ่ม, (c, g) => ค่าของกลุ่ม(c, g));
  // คอลัมน์ชื่อกว้างพอดีชื่อยาวสุด ≤ 25% · คอลัมน์ตัวเลขเกลี่ยเท่ากัน (บอสสั่ง 6 พ.ย. 69 รอบ 2)
  const ชื่อคอล = useกว้างคอลัมน์ชื่อ(กลุ่ม.map(g => g.label), { ขั้นต่ำ: 120 }, กลุ่ม.map(g => g.sub ?? ""));
  const คอลัมน์แท่ง = ตั้งค่า.คอลัมน์.find(c => c.k === ตั้งค่า.แท่ง)!;
  const ค่าแท่ง = (g: กลุ่ม) => ค่าของกลุ่ม(คอลัมน์แท่ง, g) ?? 0;
  const สูงสุด = Math.max(1, ...กลุ่ม.map(ค่าแท่ง));
  const หัวคอลัมน์แรก = dim === "month" ? "เดือน" : ชื่อมิติ[dim];
  // หัวข้อกราฟ/ตาราง (บอสสั่ง 3 พ.ย. 69): เป็นอะไร · แยกตามอะไร · ระดับไหน + ช่วง · อ่าน/กดอย่างไร — เปลี่ยนตามแท็บและระดับ
  const ระดับ = { ภาค: ขอบ.ภาค, จังหวัด: ขอบ.จังหวัด, ดีลเลอร์: ขอบ.ดีลเลอร์, ชื่อดีลเลอร์ };
  const กดแถว = คำแนะนำกดแถว(dim, ระดับ);

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

  const การ์ดที่ = (i: number) => {
    const c = ตั้งค่า.การ์ด[i];
    const v = โหลด ? null : ค่าแถว(c, rows, ทั้งหมด);
    return <KpiCard key={c.k} kpi={c.kpi} label={c.l} value={โหลด ? null : แสดง(c, v)} rawValue={v} unit={โหลด ? undefined : c.sub(rows)}
      empty="กำลังโหลด…" danger={c.danger && (v ?? 0) > 0} icon={รูปไอคอน[c.icon]} color={c.color} bg={c.bg}
      actionLabel="เจาะดูที่มา" onClick={() => setแผงการ์ด(c.k)} />;
  };

  return (
    <>
      <แถบระดับ ภาค={ขอบ.ภาค} จังหวัด={ขอบ.จังหวัด} ดีลเลอร์={ขอบ.ดีลเลอร์} ชื่อดีลเลอร์={ชื่อดีลเลอร์} ไป={ไประดับ} />

      {/* แถวการ์ด 4 ใบพอดี (กติกา 22 ต.ค. 69 · check-kpi-rows) — หน้าลูกค้าทั้งเครือ 3 ใบ (ข้อยกเว้น "สามใบ" · บอสสั่ง 30 ต.ค. 69) */}
      {ตั้งค่า.การ์ด.length === 3
        ? <KpiRow label={ชื่อแถวการ์ด} range={ช่วง} สามใบ>{สามช่อง.map(i => การ์ดที่(i))}</KpiRow>
        : <KpiRow label={ชื่อแถวการ์ด} range={ช่วง}>{สี่ช่อง.map(i => การ์ดที่(i))}</KpiRow>}

      <div className="card hq-sticky-filter" data-drill-scope>
        <div className="card-body" style={{ display: "flex", gap: 8, flexWrap: "nowrap", alignItems: "center", paddingTop: 12, paddingBottom: 12, overflowX: "auto" }}>
          {เลือก("ภูมิภาค", ขอบ.ภาค, ตัวเลือกภาค.map(r => ({ v: r, l: ชื่อภาค(r) })), v => { setเรียง(null); ตั้งขอบ({ ภาค: v, จังหวัด: null, ดีลเลอร์: null, มิติ: v ? "prov" : "dealer" }); }, ป้ายทุกภูมิภาค)}
          {เลือก("จังหวัด", ขอบ.จังหวัด, ตัวเลือกจังหวัด.map(p => ({ v: p, l: p })), v => { setเรียง(null); if (v) เจาะ(`prov:${v}`); else ไประดับ(ขอบ.ภาค ? "region" : "all"); }, "ทุกจังหวัด")}
          {เลือก("ดีลเลอร์", ขอบ.ดีลเลอร์, ตัวเลือกดีลเลอร์.map(r => ({ v: r.code, l: ชื่อแสดง(r.code, r.name) })), v => { setเรียง(null); if (v) เจาะ(`dealer:${v}`); else ไประดับ(ขอบ.จังหวัด ? "prov" : ขอบ.ภาค ? "region" : "all"); }, "ทุกดีลเลอร์")}
          {(ขอบ.ภาค || ขอบ.จังหวัด || ขอบ.ดีลเลอร์) && <button type="button" className="btn btn-secondary btn-sm" style={{ flexShrink: 0 }} onClick={() => ไประดับ("all")}>กลับไปทั้งเครือ</button>}
        </div>
      </div>

      {/* ── แท่ง ── */}
      <div className="card" data-drill-chart={dim} style={{ marginBottom: 0 }}>
        <BoxTitle ชื่อ={`กราฟ${ชื่อหัวข้อ(ตั้งค่า.ป้ายแท่ง, dim, ระดับ)}`} คำอธิบาย={คำอธิบายหัวข้อ(ช่วง, `แท่ง = ${ตั้งค่า.ป้ายแท่ง}`, กดแถว)}>
          {แท็บ.length > 1 && (
            <div role="tablist" aria-label="ดูแยกตาม" style={{ display: "inline-flex", border: "1px solid #dbe3ec", borderRadius: 10, overflow: "hidden" }}>
              {แท็บ.map(m => (
                <button key={m} type="button" role="tab" aria-selected={dim === m} data-dim={m} onClick={() => { setเรียง(null); ตั้งขอบ({ ...ขอบ, มิติ: m }); }}
                  style={{ border: "none", padding: "5px 12px", fontSize: "0.76rem", fontWeight: 700, cursor: "pointer",
                    background: dim === m ? PRIMARY : "#fff", color: dim === m ? "#fff" : MUTED }}>{ชื่อมิติ[m]}</button>
              ))}
            </div>
          )}
        </BoxTitle>
        <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 420, overflowY: "auto" }}>
          {โหลด ? <div style={{ fontSize: "0.8rem", color: "#9ca3af" }}>กำลังโหลด…</div>
            : dim === "month" && !มีรายเดือน(คอลัมน์แท่ง) ? <รอข้อมูลรายเดือน ข้อความ="ตัวเลขนี้ไม่มีรายเดือน" />
            : !กลุ่ม.length ? <div style={{ fontSize: "0.8rem", color: MUTED }}>ไม่พบข้อมูลในระดับนี้</div>
            : กลุ่ม.map(g => {
              const v = ค่าแท่ง(g);
              return (
                <button key={g.key} type="button" data-bar-row={g.key} data-value={v} onClick={() => g.เดือน ? (ขอบ.ดีลเลอร์ ? undefined : setแผงเดือน(g)) : เจาะ(g.key)}
                  style={{ all: "unset", cursor: g.เดือน && ขอบ.ดีลเลอร์ ? "default" : "pointer", minHeight: 30, display: "grid", gridTemplateColumns: "minmax(120px, 220px) 1fr 110px", gap: 10, alignItems: "center" }}>
                  <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "#1F2937", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={g.label}>
                    {g.label}
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

      {/* ── ตาราง (ไม่มีแถวรวม · ตัวเลขรวมดูที่การ์ด · บอสสั่ง 6 พ.ย. 69) ── */}
      <div className="card" data-drill-table={dim} style={{ marginBottom: 0, marginTop: 16 }}>
        <BoxTitle ชื่อ={`ตาราง${ชื่อหัวข้อ(ตั้งค่า.ป้ายแถว, dim, ระดับ)}`} คำอธิบาย={คำอธิบายหัวข้อ(ช่วง, null, กดแถว, "กดหัวคอลัมน์เพื่อเรียง")} />
        {/* พอดีจอ (บอสสั่ง 6 พ.ย. 69): คอลัมน์ชื่อพอดีชื่อยาวสุด ≤ 25% · ตัวเลขเกลี่ยเท่ากัน · จอแคบกว่าความกว้างขั้นต่ำ = เลื่อนในกรอบ */}
        <div className="table-wrap dense fit">
          <table ref={ชื่อคอล.ref} aria-label={`ตาราง${ตั้งค่า.ป้ายแถว}แยกตาม${หัวคอลัมน์แรก}`} style={{ minWidth: 170 + คอลัมน์แสดง.length * 72 + 96 }}>
            <colgroup><col data-col-key="__name" style={{ width: ชื่อคอล.กว้าง }} />{คอลัมน์แสดง.map(c => <col key={c.k} data-col-key={c.k} />)}<col style={{ width: 96 }} /></colgroup>
            <thead>
              <tr>
                {[{ k: dim === "month" ? "__idx" : "__name", l: หัวคอลัมน์แรก, num: false }, ...คอลัมน์แสดง.map(c => ({ k: c.k, l: c.l, num: true }))].map(h => (
                  <th key={h.k} className={h.num ? "num" : undefined} style={{ paddingTop: 10 }} aria-sort={เรียง?.k === h.k ? (เรียง.ลง ? "descending" : "ascending") : "none"}>
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
              {โหลด && <tr><td colSpan={คอลัมน์แสดง.length + 2} className="empty-row">กำลังโหลด…</td></tr>}
              {!โหลด && !กลุ่ม.length && <tr><td colSpan={คอลัมน์แสดง.length + 2} className="empty-row">ไม่พบข้อมูลในระดับนี้</td></tr>}
              {!โหลด && กลุ่ม.map(g => {
                const เซลล์ = คอลัมน์แสดง.map(c => { const v = ค่าของกลุ่ม(c, g); return <td key={c.k} className="num" data-cell={c.k} data-value={v ?? ""}>{แสดง(c, v)}</td>; });
                const ป้าย = <td data-group-row={g.key} title={g.label} style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                  <strong style={{ color: "#1F2937", fontWeight: g.code ? 600 : 800 }}>{g.label}</strong>
                  {g.sub && <div data-row-sub style={{ fontSize: "0.66rem", color: MUTED, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.sub}</div>}
                </td>;
                if (g.เดือน && ขอบ.ดีลเลอร์) return <tr key={g.key}>{ป้าย}{เซลล์}<td /></tr>;
                return (
                  <ClickableRow key={g.key} className="clickable" onActivate={() => g.เดือน ? setแผงเดือน(g) : เจาะ(g.key)}
                    label={g.เดือน ? `เปิดรายดีลเลอร์ของ ${g.label}` : `เปิดตัวเลขของ ${g.label} (เจาะลงระดับถัดไป)`}>
                    {ป้าย}{เซลล์}
                    <td style={{ color: PRIMARY, fontWeight: 700, whiteSpace: "nowrap" }}>{g.เดือน ? "ดูรายดีลเลอร์ ›" : "เจาะลึก ›"}</td>
                  </ClickableRow>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ padding: "8px 14px", fontSize: "0.7rem", color: MUTED }}>
          {กลุ่ม.length.toLocaleString()} แถว · ตัวเลขรวมดูที่การ์ดด้านบน{dim === "month" ? " · ตัวเลข \"ตอนนี้\" ไม่มีรายเดือน ดูที่การ์ด" : ""}
        </div>
      </div>

      {แผงการ์ด && (() => {
        const c = ตั้งค่า.การ์ด.find(x => x.k === แผงการ์ด)!;
        const รายเดือน = !!ขอบ.ดีลเลอร์ && มีรายเดือน(c);
        const แถวแผง = รายเดือน
          ? เดือนในช่วง(ช่วง.start, ช่วง.end).map(m => ({ key: m.key, label: m.label, v: ค่าเดือน(c, เดือนของกลุ่ม(เดือนทั้งหมด, codes, m.y, m.m)) }))
          : [...rows].map(r => ({ key: r.code, label: ชื่อแสดง(r.code, r.name), v: ค่าแถว(c, [r], ทั้งหมด) })).sort((a, b) => (b.v ?? -1) - (a.v ?? -1) || a.key.localeCompare(b.key));
        return (
          <แผงขวา ชื่อ={c.l} ปิด={() => setแผงการ์ด(null)} testid={`card:${c.k}`} กว้าง={640}
            คำอธิบาย={`${fmtISOToThai(ช่วง.start)} – ${fmtISOToThai(ช่วง.end)}`}
            ป้าย={[{ คีย์: "scope", ข้อความ: รายเดือน ? `ที่มารายเดือน · ${ชื่อแสดง(ขอบ.ดีลเลอร์)}` : `แยกรายดีลเลอร์ ${แถวแผง.length.toLocaleString()} ราย · รวม = ตัวเลขบนการ์ด` }]}
            หัวส่วน={รายเดือน ? "ที่มารายเดือน" : "แยกรายดีลเลอร์"} ไอคอน={รายเดือน ? CalendarDays : Users}>
            <table aria-label={`ที่มา ${c.l}`}>
              <colgroup><col style={{ width: "62%" }} /><col /></colgroup>
              <thead><tr><th>{รายเดือน ? "เดือน" : "ดีลเลอร์"}</th><th className="num">{c.l}</th></tr></thead>
              <tbody>
                {!แถวแผง.length && <tr><td colSpan={2} className="empty-row">ไม่พบดีลเลอร์ในระดับนี้</td></tr>}
                {/* แถวดีลเลอร์กด = เจาะลงดีลเลอร์นั้น (บอสสั่ง 9 พ.ย. 69) · แถวเดือนไม่มีระดับถัดไป */}
                {แถวแผง.map(r => รายเดือน
                  ? <tr key={r.key} data-drawer-row={r.key}><td title={r.label} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</td><td className="num" data-value={r.v ?? ""}>{แสดง(c, r.v)}</td></tr>
                  : <ClickableRow key={r.key} className="clickable" onActivate={() => { setแผงการ์ด(null); เจาะ(`dealer:${r.key}`); }} label={`เปิดตัวเลขของ ${r.label} (เจาะลงระดับดีลเลอร์)`}>
                      <td data-drawer-row={r.key} title={r.label} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600 }}>{r.label}</td><td className="num" data-value={r.v ?? ""}>{แสดง(c, r.v)}</td>
                    </ClickableRow>)}
              </tbody>
            </table>
          </แผงขวา>
        );
      })()}

      {แผงเดือน?.เดือน && (() => {
        const ค = ตั้งค่า.คอลัมน์.filter(มีรายเดือน);
        const { y, m } = แผงเดือน.เดือน;
        const ของเดือน = เดือนของกลุ่ม(เดือนทั้งหมด, codes, y, m);
        return (
          <แผงขวา ชื่อ={แผงเดือน.label} คำอธิบาย="แยกรายดีลเลอร์ · กดแถว = เจาะดูดีลเลอร์" ปิด={() => setแผงเดือน(null)} testid={`month:${แผงเดือน.key}`} กว้าง={760}
            หัวส่วน="ผลงานรายดีลเลอร์" ไอคอน={Users} ป้าย={[{ คีย์: "dealers", ข้อความ: `${rows.length.toLocaleString()} ดีลเลอร์` }]}>
            <table aria-label={`รายดีลเลอร์ ${แผงเดือน.label}`}>
              <thead><tr><th>ดีลเลอร์</th>{ค.map(c => <th key={c.k} className="num">{c.l}</th>)}</tr></thead>
              <tbody>
                {rows.map(r => (
                  <ClickableRow key={r.code} className="clickable" onActivate={() => { setแผงเดือน(null); เจาะ(`dealer:${r.code}`); }} label={`เปิดตัวเลขของ ${ชื่อแสดง(r.code, r.name)} (เจาะลงระดับดีลเลอร์)`}>
                    <td data-drawer-row={r.code} title={ชื่อแสดง(r.code, r.name)} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {ชื่อแสดง(r.code, r.name)}</td>
                    {ค.map(c => { const v = ค่าเดือน(c, ของเดือน.filter(x => x.code === r.code)); return <td key={c.k} className="num" data-cell={c.k} data-value={v ?? ""}>{แสดง(c, v)}</td>; })}
                  </ClickableRow>
                ))}
              </tbody>
            </table>
          </แผงขวา>
        );
      })()}
    </>
  );
}

/** หน้าต่างกลางจอของหน้าเจาะลึก 3 หน้า (บอสสั่ง 9 พ.ย. 69 · เดิมแผงชิดขวา) — ตัวกลาง DrillWindow · ไม่มีแถวรวม */
function แผงขวา({ ชื่อ, คำอธิบาย, ปิด, testid, กว้าง = 720, ป้าย, หัวส่วน, ไอคอน, children }: {
  ชื่อ: string; คำอธิบาย: React.ReactNode; ปิด: () => void; testid: string; กว้าง?: number;
  ป้าย?: { คีย์: string; ข้อความ: React.ReactNode }[]; หัวส่วน: string; ไอคอน: LucideIcon; children: React.ReactNode;
}) {
  return (
    <หน้าต่างเจาะ ชื่อ={ชื่อ} คำอธิบาย={คำอธิบาย} ปิด={ปิด} data-drill-drawer={testid} กว้าง={กว้าง} ป้าย={ป้าย}>
      <ส่วนเจาะ ไอคอน={ไอคอน} ชื่อ={หัวส่วน}>{children}</ส่วนเจาะ>
    </หน้าต่างเจาะ>
  );
}
