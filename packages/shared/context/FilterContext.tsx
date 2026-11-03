"use client";

import {
  createContext, useContext, useState, useMemo, useCallback, useEffect,
  type ReactNode,
} from "react";

/* ────────────────────────────────────────────────────────────────────────────
 * Global Filter / Time Range — ส่วนกลางที่ Dashboard / Reports / Analytics ใช้ร่วมกัน
 * เบาและดูแลง่าย: ใช้วันที่ ISO (YYYY-MM-DD) เท่านั้น ไม่มี parser ที่ซับซ้อน
 * เปลี่ยน filter แล้ว KPI / chart / table อัปเดตทันทีโดยไม่รีโหลดหน้า
 * ────────────────────────────────────────────────────────────────────────── */

// "วันนี้ของระบบ" — นิยามไว้ที่ lib/appTime.ts (แหล่งเดียว) · re-export ไว้ให้ผู้เรียกเดิมใช้ได้เหมือนเดิม
import { APP_NOW, APP_NOW_ISO } from "@pms/shared/lib/appTime";
import { TIME_PRESETS, ย้อนเดือน, type TimePreset } from "@pms/shared/lib/timePresets";
export { APP_NOW, APP_NOW_ISO };

const THAI_MONTH_ABBR = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

// ── อ่านวันที่: ISO (YYYY-MM-DD) เท่านั้น ──
const _TH_MO = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
export function parseDate(s?: string | null): Date | null {
  if (!s) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3]);
  // ไทย พ.ศ. เช่น "1 มิ.ย. 2569" → CE (ปี − 543)
  const th = /^(\d{1,2})\s+(\S+)\s+(\d{4})/.exec(s.trim());
  if (th) { const mi = _TH_MO.indexOf(th[2]); if (mi >= 0) return new Date(+th[3] - 543, mi, +th[1]); }
  return null;
}

// ── แสดงผลวันที่เป็นไทย (เพื่อโชว์ใน UI เท่านั้น ไม่เกี่ยวกับการกรอง) ──
function fmtTH(d: Date): string {
  return `${d.getDate()} ${THAI_MONTH_ABBR[d.getMonth()]} ${d.getFullYear() + 543}`;
}

// ── Time range presets ── (ตัวเลือก + สูตรย้อนเดือน อยู่ lib/timePresets.ts · 3 พ.ย. 69)
export { TIME_PRESETS, ย้อนเดือน, type TimePreset };

const PRESET_LABEL: Record<TimePreset, string> = Object.fromEntries(
  TIME_PRESETS.map(p => [p.key, p.label]),
) as Record<TimePreset, string>;

function startOfDay(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function addDays(d: Date, n: number) { const x = startOfDay(d); x.setDate(x.getDate() + n); return x; }

export type TimeRange = {
  preset: TimePreset;
  start: Date;       // inclusive
  end: Date;         // inclusive
  label: string;     // สั้น เช่น "30 วันล่าสุด"
  subtitle: string;  // อธิบาย เช่น "1 มิ.ย. 2026 – 30 มิ.ย. 2026"
};
// (เดิมมี factor สำหรับสเกล KPI ตัวเลข hardcode ตามช่วงเวลา — ไม่มีใครอ่านแล้ว KPI คำนวณสดจากข้อมูลจริง · ตัดออก L5)

function buildTimeRange(preset: TimePreset, customStart?: string, customEnd?: string): TimeRange {
  const now = startOfDay(APP_NOW);
  let start = now, end = now;

  switch (preset) {
    case "m1": start = ย้อนเดือน(now, 1); end = now; break;
    case "m3": start = ย้อนเดือน(now, 3); end = now; break;
    case "y1": start = ย้อนเดือน(now, 12); end = now; break;
    case "custom": {
      const cs = parseDate(customStart) ?? addDays(now, -29);
      const ce = parseDate(customEnd) ?? now;
      start = cs <= ce ? cs : ce;
      end = cs <= ce ? ce : cs;
      break;
    }
  }

  const sameDay = start.getTime() === end.getTime();
  const subtitle = sameDay ? fmtTH(start) : `${fmtTH(start)} – ${fmtTH(end)}`;

  return { preset, start, end, label: PRESET_LABEL[preset], subtitle };
}

// ── Option lists ──
// ย้ายไป lib/useFilterOptions.ts แล้ว — เดิมคำนวณจากชุด seed ตอน import โมดูล
// ทำให้โหมด supabase เห็นดีลเลอร์/จังหวัด/ผู้รับผิดชอบที่ไม่มีอยู่จริง (ห้ามกุข้อมูล)

// ── Filter state ──
// มิติ "แม่แบบ" ลบแล้ว (เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69)
export type FilterDim = "dealer" | "province" | "status" | "person";
export const ALL = "all";

type FilterState = {
  preset: TimePreset;
  customStart: string;
  customEnd: string;
  dealer: string;
  province: string;
  status: string;
  person: string;
};

const DEFAULTS: FilterState = {
  // เริ่มต้น "1 ปี" = ย้อนหลัง 12 เดือนถึงวันนี้ (บอสสั่ง 3 พ.ย. 69 · เดิม "ปีนี้")
  preset: "y1", customStart: "", customEnd: "",
  dealer: ALL, province: ALL, status: ALL, person: ALL,
};

const STORAGE_KEY = "bpms_global_filters";

// fields ของ record สำหรับเช็คผ่าน filter — ส่ง undefined = ข้าม dimension นั้น
export type RecordFields = {
  date?: string | null;       // ISO YYYY-MM-DD เท่านั้น
  dealer?: string | null;
  province?: string | null;
  status?: string | null;
  person?: string | null;
};

type Ctx = {
  timeRange: TimeRange;
  dealer: string;
  province: string;
  status: string;
  person: string;
  /** วันเริ่ม/วันสิ้นสุดของช่วงที่กำหนดเอง (ISO) — ให้ช่องกรอกวันที่สะท้อนค่าที่ใช้อยู่จริง */
  customStart: string;
  customEnd: string;
  setPreset: (p: TimePreset) => void;
  setCustomRange: (start: string, end: string) => void;
  setDealer: (v: string) => void;
  setProvince: (v: string) => void;
  setStatus: (v: string) => void;
  setPerson: (v: string) => void;
  setDim: (dim: FilterDim, v: string) => void;
  reset: () => void;
  activeCount: number;
  passes: (f: RecordFields) => boolean;
  inRange: (date?: string | null) => boolean;
};

const FilterContext = createContext<Ctx | null>(null);

// storageKey = แยกต่อหน้าได้ (ส่งมาจาก AppShell เป็น bpms_filters:<pathname>) → แต่ละหน้ากรองอิสระกัน
export function FilterProvider({ children, storageKey = STORAGE_KEY }: { children: ReactNode; storageKey?: string }) {
  const [state, setState] = useState<FilterState>(DEFAULTS);

  // คงค่า filter ของ "หน้านี้" ไว้ระหว่าง navigate / refresh (คีย์แยกต่อหน้า)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw);
        // ค่าที่บันทึกไว้อาจเป็น preset ที่ถูกลบไปแล้ว (เช่น "last30"/"quarter" ของเก่าที่ค้างใน sessionStorage)
        // → ตกกลับเป็นค่าเริ่มต้น ห้ามชี้ไปหา preset ที่ไม่มีอยู่จริง ไม่งั้นช่วงเวลาจะเพี้ยนเงียบ ๆ
        if (saved.preset && !TIME_PRESETS.some(t => t.key === saved.preset)) saved.preset = DEFAULTS.preset;
        setState(s => ({ ...s, ...saved }));
      }
    } catch { /* ignore */ }
  }, [storageKey]);
  useEffect(() => {
    try { sessionStorage.setItem(storageKey, JSON.stringify(state)); } catch { /* ignore */ }
  }, [state, storageKey]);

  const timeRange = useMemo(
    () => buildTimeRange(state.preset, state.customStart, state.customEnd),
    [state.preset, state.customStart, state.customEnd],
  );

  const setPreset = useCallback((p: TimePreset) => setState(s => ({ ...s, preset: p })), []);
  const setCustomRange = useCallback((start: string, end: string) =>
    setState(s => ({ ...s, preset: "custom", customStart: start, customEnd: end })), []);
  const setDealer = useCallback((v: string) => setState(s => ({ ...s, dealer: v })), []);
  const setProvince = useCallback((v: string) => setState(s => ({ ...s, province: v })), []);
  const setStatus = useCallback((v: string) => setState(s => ({ ...s, status: v })), []);
  const setPerson = useCallback((v: string) => setState(s => ({ ...s, person: v })), []);
  const setDim = useCallback((dim: FilterDim, v: string) => setState(s => ({ ...s, [dim]: v })), []);
  // ── "ล้างตัวกรอง" ต้องล้างช่วงเวลาด้วย (บอสแจ้ง 24 ส.ค. 69: "ทำไมมันยังไม่ล้าง") ──
  //
  // เดิมตั้งใจไม่แตะช่วงเวลา แต่ผู้ใช้มองว่าช่วงเวลาก็คือตัวกรองใบหนึ่ง (มันอยู่บนแถบเดียวกัน)
  // กดล้างแล้วช่วงที่กำหนดเองยังค้างอยู่ = ตัวเลขบนจอยังแคบตามช่วงเดิม ทั้งที่เห็นว่าล้างไปแล้ว
  // ตอนนี้กลับไปเป็นค่าตั้งต้นทั้งแถบ (ช่วงเวลา + ทุก dimension) ให้ตรงกับคำว่า "ล้าง"
  // ล้าง = ค่าตั้งต้นทั้งแถบ (ช่วง 1 ปี) — "ทุกช่วงเวลา" เอาออกแล้ว (บอสสั่ง 3 พ.ย. 69)
  const reset = useCallback(() => setState(() => ({ ...DEFAULTS })), []);

  const inRange = useCallback((date?: string | null) => {
    if (date === undefined || date === null || date === "") return true;
    const d = parseDate(date);
    if (!d) return true; // ไม่ใช่ ISO → ไม่ตัดออก
    return d.getTime() >= timeRange.start.getTime() && d.getTime() <= timeRange.end.getTime();
  }, [timeRange]);

  const passes = useCallback((f: RecordFields) => {
    if (f.date !== undefined && !inRange(f.date)) return false;
    if (state.dealer !== ALL && f.dealer != null && f.dealer !== state.dealer) return false;
    if (state.province !== ALL && f.province != null && f.province !== state.province) return false;
    if (state.status !== ALL && f.status != null && f.status !== state.status) return false;
    // ผู้รับผิดชอบเก็บได้หลายคน (คั่นด้วย ", ") → เทียบแบบ "มีคนนี้อยู่ในรายชื่อ"
    if (state.person !== ALL && f.person != null &&
        !f.person.split(",").map(s => s.trim()).includes(state.person)) return false;
    return true;
  }, [inRange, state.dealer, state.province, state.status, state.person]);

  // ⚠️ ช่วงเวลาที่ไม่ใช่ค่าตั้งต้น ต้องนับเป็นตัวกรองที่ "เปิดอยู่" ด้วย
  //    ไม่งั้นเลือกช่วงเองแล้วปุ่มล้างไม่โผล่ = ไม่มีทางกลับไปค่าตั้งต้นได้เลยนอกจากไล่กดเอง
  const activeCount =
    (state.preset !== DEFAULTS.preset ? 1 : 0) +
    (state.dealer !== ALL ? 1 : 0) + (state.province !== ALL ? 1 : 0) +
    (state.status !== ALL ? 1 : 0) +
    (state.person !== ALL ? 1 : 0);

  // ใช้แทบทุกหน้าเหมือนกับ SalesContext — ถ้าไม่ memo ทุก consumer เรนเดอร์ซ้ำทุกครั้งที่ provider
  // เรนเดอร์ใหม่ แม้ตัวกรองที่ตัวเองอ่านจะไม่เปลี่ยน (พบจากผลตรวจสอบระบบรอบ 2, 31 ก.ค. 69)
  const value: Ctx = useMemo(() => ({
    timeRange,
    customStart: state.customStart, customEnd: state.customEnd,
    dealer: state.dealer, province: state.province, status: state.status,
    person: state.person,
    setPreset, setCustomRange, setDealer, setProvince, setStatus, setPerson, setDim, reset,
    activeCount, passes, inRange,
  }), [
    timeRange, state.customStart, state.customEnd,
    state.dealer, state.province, state.status, state.person,
    setPreset, setCustomRange, setDealer, setProvince, setStatus, setPerson, setDim, reset,
    activeCount, passes, inRange,
  ]);

  return <FilterContext.Provider value={value}>{children}</FilterContext.Provider>;
}

export function useFilters() {
  const ctx = useContext(FilterContext);
  if (!ctx) throw new Error("useFilters must be used inside FilterProvider");
  return ctx;
}
