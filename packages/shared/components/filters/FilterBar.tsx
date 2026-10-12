"use client";

import { useEffect, useState, useRef } from "react";
import { CalendarDays, ChevronDown, Check, X } from "lucide-react";
import { useRole } from "@pms/shared/context/RoleContext";
import { useDealerOptions, useProductOptions, useProvinceOptions, usePersonOptions } from "@pms/shared/lib/useFilterOptions";
import {
  useFilters, TIME_PRESETS, type TimePreset, type FilterDim,
  ALL, APP_NOW, APP_NOW_ISO,
} from "@pms/shared/context/FilterContext";

// ค่าเริ่มต้นช่องช่วงวันที่กำหนดเอง = ต้นเดือน..วันนี้ ของระบบ (APP_NOW · supabase=จริง / local=ตรึง)
const MONTH_START_ISO = `${APP_NOW.getFullYear()}-${String(APP_NOW.getMonth() + 1).padStart(2, "0")}-01`;

type Opt = { value: string; label: string };

// ลำดับ preset ในเมนู — "กำหนดช่วงเอง" อยู่ท้ายเมนูแยกต่างหาก (ไม่อยู่ในลิสต์นี้)
const PRESET_ORDER: TimePreset[] = ["all", "today", "last7", "thisMonth", "thisYear"];

function useClickOutside(cb: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) cb();
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [cb]);
  return ref;
}

/* ── ปุ่ม trigger (ชิปบรรทัดเดียว ใช้สไตล์ปุ่มของระบบ) ── */
function Trigger({ icon, label, active, open, onClick }: {
  icon?: React.ReactNode; label: string; active?: boolean; open: boolean; onClick: () => void;
}) {
  return (
    <button
      className="btn btn-sm"
      onClick={onClick}
      style={{
        gap: 6, fontWeight: 700,
        // ตัวคุมหลักทั้งหน้า → โทนกรม CI ให้เด่นกว่าตัวคุมย่อยรายการ์ด (StatCard)
        color: "var(--primary)",
        border: `1px solid ${active || open ? "var(--primary)" : "#cdd8e6"}`,
        background: active || open ? "var(--accent)" : "#fff",
      }}
      onMouseEnter={e => { if (!(active || open)) { const t = e.currentTarget as HTMLElement; t.style.background = "#eef3f8"; t.style.borderColor = "#b9cbe2"; } }}
      onMouseLeave={e => { if (!(active || open)) { const t = e.currentTarget as HTMLElement; t.style.background = "#fff"; t.style.borderColor = "#cdd8e6"; } }}
    >
      {icon}
      <span style={{ fontWeight: 700, whiteSpace: "nowrap", minWidth: 72, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }}>
        {label}
      </span>
      <ChevronDown size={13} style={{ opacity: 0.55, transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
    </button>
  );
}

/* ── เมนู dropdown (ใช้ .card ของระบบ) ── */
function Menu({ children, width = 220 }: { children: React.ReactNode; width?: number }) {
  return (
    <div className="card" style={{
      position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 60,
      minWidth: width, boxShadow: "var(--shadow-lg)", overflow: "hidden",
    }}>
      {children}
    </div>
  );
}

function MenuItem({ selected, label, onClick }: { selected: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 9, width: "100%", padding: "8px 13px",
        background: selected ? "var(--accent)" : "transparent", border: "none",
        cursor: "pointer", textAlign: "left", fontFamily: "inherit",
        fontSize: "0.8rem", fontWeight: selected ? 700 : 400,
        color: selected ? "var(--primary)" : "var(--color-sub)",
      }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = "#f8f9fb"; }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = "transparent"; }}
    >
      <Check size={13} style={{ color: selected ? "var(--primary)" : "transparent", flexShrink: 0 }} />
      <span style={{ flex: 1 }}>{label}</span>
    </button>
  );
}

/* ── Time Range ── */
function TimeRangePicker() {
  const { timeRange, customStart, customEnd, setPreset, setCustomRange } = useFilters();
  const [open, setOpen] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [cs, setCs] = useState(customStart);
  const [ce, setCe] = useState(customEnd);
  const ref = useClickOutside(() => { setOpen(false); setShowCustom(false); });

  // ⚠️ ช่องวันที่เป็น state ของตัวเอง ถ้าไม่ผูกกับค่าที่ใช้อยู่จริงจะเพี้ยนสองทาง:
  //    เปิดมาเห็นช่องว่างทั้งที่กำลังกรองด้วยช่วงที่กำหนดเองอยู่ · กด "ล้างตัวกรอง" แล้ววันเก่ายังค้างในช่อง
  useEffect(() => { setCs(customStart); setCe(customEnd); }, [customStart, customEnd]);

  function applyCustom() {
    if (cs && ce) { setCustomRange(cs, ce); setOpen(false); setShowCustom(false); }
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <Trigger
        icon={<CalendarDays size={14} style={{ color: "var(--primary)", flexShrink: 0 }} />}
        label={timeRange.subtitle || timeRange.label} active open={open}
        onClick={() => setOpen(o => !o)}
      />
      {open && (
        <Menu width={272}>
          {/* preset — รายการเดียว + เช็กมาร์ก (สไตล์เดียวกับแดชบอร์ดดีลเลอร์) */}
          <div style={{ padding: "6px 0" }}>
            {PRESET_ORDER.map(k => {
              const opt = TIME_PRESETS.find(p => p.key === k)!;
              const sel = timeRange.preset === k;
              return (
                <button key={k} onClick={() => { setPreset(k); setOpen(false); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 9, width: "100%", padding: "8px 13px",
                    background: sel ? "var(--accent)" : "transparent", border: "none", cursor: "pointer",
                    textAlign: "left", fontFamily: "inherit", fontSize: "0.8rem", fontWeight: sel ? 700 : 400,
                    color: sel ? "var(--primary)" : "var(--foreground)",
                  }}
                  onMouseEnter={e => { if (!sel) e.currentTarget.style.background = "#f8f9fb"; }}
                  onMouseLeave={e => { if (!sel) e.currentTarget.style.background = "transparent"; }}
                >
                  <Check size={13} style={{ color: sel ? "var(--primary)" : "transparent", flexShrink: 0 }} />
                  <span style={{ flex: 1 }}>{opt.label}</span>
                </button>
              );
            })}
          </div>

          {/* กำหนดเอง — ซ่อนช่องไว้ เปิดเมื่อกด */}
          <div style={{ borderTop: "1px solid var(--border)", padding: "6px 10px 10px" }}>
            <button onClick={() => setShowCustom(s => !s)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%",
                background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit",
                padding: "6px 3px", fontSize: "0.72rem", fontWeight: 600,
                color: timeRange.preset === "custom" ? "var(--primary)" : "var(--foreground)",
              }}>
              <span>กำหนดช่วงเอง</span>
              <ChevronDown size={13} style={{ opacity: 0.55, transform: showCustom ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
            </button>
            {showCustom && (
              <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 5 }}>
                <input type="date" className="form-input" aria-label="วันเริ่มต้นของช่วงที่กำหนดเอง" value={cs} onChange={e => setCs(e.target.value)} />
                <input type="date" className="form-input" aria-label="วันสิ้นสุดของช่วงที่กำหนดเอง" value={ce} onChange={e => setCe(e.target.value)} />
                <button className="btn btn-primary btn-sm" onClick={applyCustom} disabled={!cs || !ce}
                  style={{ justifyContent: "center", ...(!cs || !ce ? { opacity: 0.5, cursor: "not-allowed" } : {}) }}>
                  ใช้ช่วงเวลานี้
                </button>
              </div>
            )}
          </div>
        </Menu>
      )}
    </div>
  );
}

/* ── Dropdown filter ทั่วไป (dealer / province / product / status) ── */
export function SelectFilter({ caption, value, options, onChange }: {
  caption: string; value: string; options: Opt[]; onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));
  const active = value !== ALL;
  const label = active ? (options.find(o => o.value === value)?.label ?? value) : caption;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <Trigger label={label} active={active} open={open} onClick={() => setOpen(o => !o)} />
      {open && (
        <Menu>
          <div style={{ maxHeight: 300, overflowY: "auto", padding: "4px 0" }}>
            <MenuItem selected={value === ALL} label={`${caption}ทั้งหมด`} onClick={() => { onChange(ALL); setOpen(false); }} />
            {options.map(o => (
              <MenuItem key={o.value} selected={value === o.value} label={o.label}
                onClick={() => { onChange(o.value); setOpen(false); }} />
            ))}
          </div>
        </Menu>
      )}
    </div>
  );
}

// ── ปุ่มช่วงเวลาแบบ pill (สไตล์เดียวกับหัวกราฟ SalesTrendChart) — ผูกกับ FilterContext กลาง ──
const PILL_LABEL: Partial<Record<TimePreset, string>> = { all: "ทั้งหมด", today: "วันนี้", last7: "7 วัน" };
export function TimeRangePills({ style }: { style?: React.CSSProperties }) {
  const { timeRange, setPreset, setCustomRange } = useFilters();
  const [showCustom, setShowCustom] = useState(false);
  const [cs, setCs] = useState(MONTH_START_ISO);
  const [ce, setCe] = useState(APP_NOW_ISO);
  const inp: React.CSSProperties = { border: "1px solid var(--border, #e5e7eb)", borderRadius: 8, padding: "4px 8px", fontSize: "0.72rem", fontFamily: "inherit", color: "#2D2D2D" };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", ...style }}>
      {TIME_PRESETS.filter(p => p.key !== "custom").map(p => (
        <button key={p.key}
          className={timeRange.preset === p.key ? "btn btn-primary btn-sm" : "btn btn-ghost btn-sm"}
          onClick={() => { setShowCustom(false); setPreset(p.key); }}>
          {PILL_LABEL[p.key] ?? p.label}
        </button>
      ))}
      <button
        className={timeRange.preset === "custom" ? "btn btn-primary btn-sm" : "btn btn-ghost btn-sm"}
        onClick={() => setShowCustom(s => !s)}>
        กำหนดเอง
      </button>
      {showCustom && (
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input type="date" aria-label="วันเริ่มต้นของช่วงที่กำหนดเอง" value={cs} onChange={e => setCs(e.target.value)} style={inp} />
          <span style={{ color: "#9ca3af", fontSize: "0.72rem" }}>–</span>
          <input type="date" aria-label="วันสิ้นสุดของช่วงที่กำหนดเอง" value={ce} onChange={e => setCe(e.target.value)} style={inp} />
          <button className="btn btn-primary btn-sm" onClick={() => { setCustomRange(cs, ce); setShowCustom(false); }}>ใช้</button>
        </span>
      )}
    </div>
  );
}

export type FilterBarProps = {
  /** dimension ที่จะแสดง (นอกจาก time range) — ถ้าไม่ระบุจะ default ตาม role */
  dims?: FilterDim[];
  statusOptions?: Opt[];
  productOptions?: Opt[];
  provinceOptions?: Opt[];
  dealerOptions?: Opt[];
  personOptions?: Opt[];
  style?: React.CSSProperties;
  /** false = ไม่แสดง dropdown ช่วงเวลา (กรณีหน้านั้นใช้ TimeRangePills แทน) */
  time?: boolean;
};

export function FilterBar({
  dims, statusOptions, productOptions, provinceOptions, dealerOptions, personOptions, style, time = true,
}: FilterBarProps) {
  const { isHQ } = useRole();
  const {
    dealer, province, product, status, person,
    setDealer, setProvince, setProduct, setStatus, setPerson,
    activeCount, reset,
  } = useFilters();

  // ตัวเลือกจากข้อมูลจริง (repo) — ผู้เรียกยัง override ผ่าน prop ได้เหมือนเดิม
  const liveDealers = useDealerOptions();
  const liveProducts = useProductOptions();
  const liveProvinces = useProvinceOptions();
  const livePersons = usePersonOptions();

  const defaultDims: FilterDim[] = isHQ
    ? ["dealer", "province", "product", "status"]
    : ["product", "status"];
  const show = dims ?? defaultDims;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
      justifyContent: "flex-end", ...style,
    }}>
      {time && <TimeRangePicker />}

      {show.includes("dealer") && (
        <SelectFilter caption="ดีลเลอร์" value={dealer}
          options={dealerOptions ?? liveDealers} onChange={setDealer} />
      )}
      {show.includes("province") && (
        <SelectFilter caption="จังหวัด" value={province}
          options={provinceOptions ?? liveProvinces} onChange={setProvince} />
      )}
      {show.includes("product") && (
        <SelectFilter caption="แม่แบบ" value={product}
          options={productOptions ?? liveProducts} onChange={setProduct} />
      )}
      {show.includes("status") && statusOptions && statusOptions.length > 0 && (
        <SelectFilter caption="สถานะ" value={status}
          options={statusOptions} onChange={setStatus} />
      )}
      {show.includes("person") && (
        <SelectFilter caption="ผู้รับผิดชอบ" value={person}
          options={personOptions ?? livePersons} onChange={setPerson} />
      )}

      {activeCount > 0 && (
        <button className="btn btn-ghost btn-sm" onClick={reset} style={{ gap: 4 }}>
          <X size={13} /> ล้างตัวกรอง
        </button>
      )}
    </div>
  );
}
