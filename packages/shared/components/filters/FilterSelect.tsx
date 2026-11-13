"use client";

// ── ช่องเลือกในแถบตัวกรอง — ตัวกลางทำเอง ตัวเดียวทุกที่ (บอสสั่ง 11 พ.ย. 69 · แทน <select> ของเบราว์เซอร์) ──────────
//   เหตุ: <select> ของเบราว์เซอร์กางขึ้นบนเองเมื่อช่องอยู่ล่างจอ · รายการยาวล้นจอ · หน้าตาแต่ละเครื่องไม่เหมือนกัน
//   กติกา: กางลงใต้ช่องเสมอ · สูงไม่เกินที่ว่างใต้ช่อง (ยาวกว่าเลื่อนในรายการ) · ช่องค้นหาบนสุดเมื่อเกิน 8 ตัวเลือก
//     · ลูกศรขึ้นลง / Enter / Esc · คลิกข้างนอกปิด · แตะได้บนมือถือ เป้ากดสูง ≥ 32px
//     · ค่าเข้า-ออกเหมือน <select> เดิม (value · onChange(ค่า)) — พฤติกรรมกรอง/ค่าในที่อยู่หน้าเว็บไม่เปลี่ยน
//   ตัวคำนวณล้วน: lib/filterSelect.ts · ข้อทดสอบ: tests/unit/filterSelect.test.ts · tests/scenario/filter-select.spec.ts
//   ข้อทดสอบหน้าจอเลือกค่า: helpers.ts เลือกตัวกรอง(page, ชื่อช่อง, ข้อความ) (แทน selectOption)
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Search, Check } from "lucide-react";
import { กรองตัวเลือก, ขยับไฮไลต์, ต้องมีช่องค้น, ต้องเลื่อนก่อนกาง, ตำแหน่งรายการ, type ตัวเลือก } from "@pms/shared/lib/filterSelect";

const MUTED = "#6B7280";
const BORDER = "#E5E7EB";
const STEEL = "#374151";
const NAVY = "#003366";

export type FilterOption = ตัวเลือก;

export function FilterSelect({
  value, onChange, caption, options, all = "ALL", minWidth = 112, maxWidth, label, style, captionN,
}: {
  value: string;
  onChange: (v: string) => void;
  /** ข้อความของตัวเลือก "ทั้งหมด" (ค่า all) เช่น "ทุกสถานะ" */
  caption: string;
  options: FilterOption[];
  all?: string;
  /** ชื่อช่องสำหรับโปรแกรมอ่านหน้าจอ/ข้อทดสอบ — ไม่ใส่ = ใช้ caption */
  label?: string;
  minWidth?: number;
  /** จำกัดความกว้างเมื่อค่าที่เลือกเป็นข้อความยาว — ข้อความยาวตัดด้วย … */
  maxWidth?: number;
  style?: React.CSSProperties;
  /** จำนวนของตัวเลือก "ทั้งหมด" (ถ้ามี) */
  captionN?: number;
}) {
  const รายการทั้งหมด = useMemo<ตัวเลือก[]>(() => [{ v: all, l: caption, n: captionN }, ...options], [all, caption, options, captionN]);
  const [เปิด, setเปิด] = useState(false);
  const [คำค้น, setคำค้น] = useState("");
  const [ไฮไลต์, setไฮไลต์] = useState(-1);
  const [ตำแหน่ง, setตำแหน่ง] = useState<ReturnType<typeof ตำแหน่งรายการ> | null>(null);
  const ปุ่ม = useRef<HTMLButtonElement>(null);
  const แผง = useRef<HTMLDivElement>(null);
  const กรอบรายการ = useRef<HTMLDivElement>(null);
  const ช่องค้น = useRef<HTMLInputElement>(null);
  const id = useId();
  const มีช่องค้น = ต้องมีช่องค้น(รายการทั้งหมด.length);
  const ที่เห็น = useMemo(() => กรองตัวเลือก(รายการทั้งหมด, คำค้น, all), [รายการทั้งหมด, คำค้น, all]);
  const ที่เลือก = รายการทั้งหมด.find(o => o.v === value) ?? รายการทั้งหมด[0];

  const วางตำแหน่ง = () => {
    const r = ปุ่ม.current?.getBoundingClientRect();
    if (r) setตำแหน่ง(ตำแหน่งรายการ({ left: r.left, bottom: r.bottom, width: r.width }, { w: window.innerWidth, h: window.innerHeight }));
  };
  const เปิดรายการ = () => {
    // ช่องติดขอบล่างของจอ = เลื่อนช่องขึ้นกลางจอก่อน แล้วค่อยกางลงใต้ช่อง (ไม่พลิกขึ้นบน · lib/filterSelect.ts ต้องเลื่อนก่อนกาง)
    const r = ปุ่ม.current?.getBoundingClientRect();
    if (r && ต้องเลื่อนก่อนกาง(r.bottom, window.innerHeight, รายการทั้งหมด.length, มีช่องค้น)) ปุ่ม.current?.scrollIntoView({ block: "center" });
    วางตำแหน่ง();
    setคำค้น("");
    setไฮไลต์(Math.max(0, รายการทั้งหมด.findIndex(o => o.v === value)));
    setเปิด(true);
  };
  const ปิด = (คืนโฟกัส = true) => { setเปิด(false); if (คืนโฟกัส) ปุ่ม.current?.focus(); };
  const เลือก = (o: ตัวเลือก) => { ปิด(); if (o.v !== value) onChange(o.v); };

  useLayoutEffect(() => { if (เปิด) วางตำแหน่ง(); }, [เปิด]);
  useEffect(() => {
    if (!เปิด) return;
    if (มีช่องค้น) ช่องค้น.current?.focus(); else แผง.current?.focus();
    // คลิก/แตะข้างนอก = ปิด · หน้าเลื่อน/ย่อขยาย = วางตำแหน่งใหม่ (ยังอยู่ใต้ช่อง)
    const นอก = (e: Event) => {
      const t = e.target as Node;
      if (!แผง.current?.contains(t) && !ปุ่ม.current?.contains(t)) ปิด(false);
    };
    const ขยับ = (e: Event) => { if (!แผง.current?.contains(e.target as Node)) วางตำแหน่ง(); };
    document.addEventListener("pointerdown", นอก, true);
    window.addEventListener("scroll", ขยับ, true);
    window.addEventListener("resize", วางตำแหน่ง);
    return () => {
      document.removeEventListener("pointerdown", นอก, true);
      window.removeEventListener("scroll", ขยับ, true);
      window.removeEventListener("resize", วางตำแหน่ง);
    };
  }, [เปิด]);   // eslint-disable-line react-hooks/exhaustive-deps
  // ตัวที่ไฮไลต์อยู่ในสายตาเสมอ — เลื่อนเฉพาะในกรอบรายการ (13 พ.ย. 69 · เดิม scrollIntoView เลื่อนทั้งหน้าได้ด้วย:
  //   ชี้เมาส์ → ไฮไลต์เปลี่ยน → หน้าเลื่อน → รายการย้ายตามปุ่ม → เมาส์อยู่ตัวอื่น → วนไม่จบ · ข้อทดสอบคลิกตัวเลือกไม่ได้เพราะไม่นิ่ง)
  useEffect(() => {
    const กรอบ = กรอบรายการ.current;
    if (!เปิด || ไฮไลต์ < 0 || !กรอบ) return;
    const ตัว = กรอบ.querySelector<HTMLElement>(`[data-index="${ไฮไลต์}"]`);
    if (!ตัว) return;
    const บน = ตัว.offsetTop, ล่าง = บน + ตัว.offsetHeight;
    if (บน < กรอบ.scrollTop) กรอบ.scrollTop = บน;
    else if (ล่าง > กรอบ.scrollTop + กรอบ.clientHeight) กรอบ.scrollTop = ล่าง - กรอบ.clientHeight;
  }, [ไฮไลต์, เปิด]);

  const กดปุ่มในรายการ = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); ปิด(); return; }
    if (e.key === "Tab") { ปิด(false); return; }
    if (e.key === "Enter") { e.preventDefault(); const o = ที่เห็น[ไฮไลต์]; if (o) เลือก(o); return; }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) { e.preventDefault(); setไฮไลต์(i => ขยับไฮไลต์(i, e.key, ที่เห็น.length)); }
  };

  return (
    <>
      <button
        ref={ปุ่ม}
        type="button"
        role="combobox"
        aria-label={label ?? caption}
        aria-haspopup="listbox"
        aria-expanded={เปิด}
        aria-controls={เปิด ? `${id}-list` : undefined}
        data-filter-select
        data-filter-value={value}   // ไม่ใช้ data-value (ชื่อนั้นคือตัวเลขบนการ์ด · ตัวตรวจ check-shared-baseline-asserts อ่านเป็นตัวเลขบนจอ)
        title={ที่เลือก.l}
        onClick={() => (เปิด ? ปิด() : เปิดรายการ())}
        onKeyDown={e => { if (!เปิด && ["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) { e.preventDefault(); เปิดรายการ(); } }}
        className="form-input"
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "space-between", gap: 6, width: "auto", minWidth, maxWidth,
          minHeight: 33, padding: "6px 8px", fontSize: "0.72rem", fontWeight: 600, cursor: "pointer", textAlign: "left",
          color: value === all ? MUTED : STEEL, background: "#fff", ...style,
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{ที่เลือก.l}</span>
        <ChevronDown size={13} style={{ flexShrink: 0, transform: เปิด ? "rotate(180deg)" : undefined, transition: "transform .12s" }} />
      </button>
      {/* จำนวนต่อตัวเลือก (เดิมอยู่บน <option data-count> ที่อยู่ในหน้าตลอด) — รายการกางเฉพาะตอนเปิด จึงเก็บสำเนาซ่อนไว้ให้อ่านได้ทุกเวลา */}
      {รายการทั้งหมด.some(o => o.n != null) && (
        <span hidden data-filter-counts={label ?? caption}>
          {รายการทั้งหมด.map(o => <span key={o.v} data-option-value={o.v} data-count={o.n ?? ""}>{o.l}</span>)}
        </span>
      )}
      {เปิด && ตำแหน่ง && typeof document !== "undefined" && createPortal(
        <div
          ref={แผง}
          tabIndex={-1}
          data-filter-select-list
          onKeyDown={กดปุ่มในรายการ}
          style={{
            position: "fixed", top: ตำแหน่ง.top, left: ตำแหน่ง.left, minWidth: ตำแหน่ง.minWidth, maxWidth: Math.max(ตำแหน่ง.minWidth, 360),
            maxHeight: ตำแหน่ง.maxHeight, display: "flex", flexDirection: "column", zIndex: 1000, background: "#fff",
            border: `1px solid ${BORDER}`, borderRadius: 10, boxShadow: "0 10px 30px rgba(15,23,42,.14)", outline: "none", overflow: "hidden",
          }}
        >
          {มีช่องค้น && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
              <Search size={13} color={MUTED} />
              <input
                ref={ช่องค้น}
                value={คำค้น}
                onChange={e => { setคำค้น(e.target.value); setไฮไลต์(0); }}
                aria-label={`ค้นหาใน${label ?? caption}`}
                placeholder="พิมพ์เพื่อค้นหา…"
                style={{ border: "none", outline: "none", fontSize: "0.76rem", flex: 1, minWidth: 0, fontFamily: "inherit", minHeight: 24 }}
              />
            </div>
          )}
          <div ref={กรอบรายการ} id={`${id}-list`} role="listbox" aria-label={label ?? caption} style={{ overflowY: "auto", padding: 4, position: "relative" }}>
            {ที่เห็น.length === 0 && <div style={{ padding: "10px 12px", fontSize: "0.74rem", color: MUTED }}>ไม่พบตัวเลือกที่ค้น</div>}
            {ที่เห็น.map((o, i) => {
              const เลือกอยู่ = o.v === value;
              return (
                <div
                  key={o.v}
                  role="option"
                  aria-selected={เลือกอยู่}
                  data-index={i}
                  data-option-value={o.v}
                  data-count={o.n ?? undefined}
                  onPointerEnter={() => setไฮไลต์(i)}
                  onClick={() => เลือก(o)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8, minHeight: 32, padding: "6px 10px", borderRadius: 7, cursor: "pointer",
                    fontSize: "0.76rem", fontWeight: เลือกอยู่ ? 700 : 500, color: เลือกอยู่ ? NAVY : STEEL,
                    background: i === ไฮไลต์ ? "#eef3f9" : "transparent", whiteSpace: "nowrap",
                  }}
                >
                  <span style={{ width: 14, flexShrink: 0, display: "inline-flex" }}>{เลือกอยู่ && <Check size={13} />}</span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{o.l}</span>
                </div>
              );
            })}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
