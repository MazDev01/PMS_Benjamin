"use client";

// ── ไอคอน ⓘ ข้างข้อความ: คำอธิบายเพิ่ม (สูตร/รายละเอียดรอง) — ตัวกลางตัวเดียวทั้งระบบ (บอสตัดสิน 16 พ.ย. 69 · ประโยคยาว 21 ที่) ─────
//   ชี้เมาส์ = ขึ้น · มือถือ (ไม่มีชี้เมาส์) กดแล้วขึ้น · เปิดอยู่แล้วกดอีกครั้ง/กดที่อื่น = ปิด (นิ้วแตะไม่นับเป็นชี้ — ใช้ pointerType) · คีย์บอร์ด: Tab ถึงปุ่มแล้วขึ้น · Enter/Space สลับ · Esc ปิด
//   ข้อความอยู่ใน DOM ตลอด (ซ่อนด้วย hidden) และผูก aria-describedby — โปรแกรมอ่านจอได้ยินแม้ยังไม่เปิด
//   ห้ามใช้ซ่อนข้อความที่ผู้ใช้ต้องเห็นทันที (เช่น "ลืมรหัสผ่าน ติดต่อสำนักงานใหญ่" · บอสตัดสิน 16 พ.ย. 69)
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Info } from "lucide-react";

export function InfoTip({ children, label = "คำอธิบายเพิ่มเติม", size = 13 }: {
  /** ข้อความที่ขึ้นเมื่อชี้/กด */
  children: ReactNode;
  /** ชื่อปุ่มสำหรับโปรแกรมอ่านจอ/ข้อทดสอบ */
  label?: string;
  size?: number;
}) {
  const [ชี้, setชี้] = useState(false);
  const [กดค้าง, setกดค้าง] = useState(false);
  const กรอบ = useRef<HTMLSpanElement>(null);
  const id = useId();
  const เปิด = ชี้ || กดค้าง;

  useEffect(() => {
    if (!กดค้าง) return;
    const นอก = (e: PointerEvent) => { if (!กรอบ.current?.contains(e.target as Node)) setกดค้าง(false); };
    document.addEventListener("pointerdown", นอก);
    return () => document.removeEventListener("pointerdown", นอก);
  }, [กดค้าง]);

  return (
    <span ref={กรอบ} data-info-tip style={{ position: "relative", display: "inline-flex", verticalAlign: "middle", marginLeft: 4 }}
      onPointerEnter={e => { if (e.pointerType === "mouse") setชี้(true); }} onPointerLeave={e => { if (e.pointerType === "mouse") setชี้(false); }}>
      <button type="button" aria-label={label} aria-expanded={เปิด} aria-describedby={id}
        onClick={() => { if (เปิด) { setชี้(false); setกดค้าง(false); } else setกดค้าง(true); }}
        onFocus={e => { if (e.currentTarget.matches(":focus-visible")) setชี้(true); }} onBlur={() => { setชี้(false); setกดค้าง(false); }}
        onKeyDown={e => { if (e.key === "Escape") { setชี้(false); setกดค้าง(false); } }}
        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 2, margin: -2, border: 0, background: "transparent",
          color: "var(--muted-foreground,#6b7280)", cursor: "pointer", borderRadius: 999, lineHeight: 0 }}>
        <Info size={size} aria-hidden="true" />
      </button>
      <span id={id} role="tooltip" hidden={!เปิด} data-info-tip-text
        style={{ position: "absolute", top: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)", zIndex: 50,
          width: "max-content", maxWidth: "min(280px, 80vw)", padding: "7px 10px", borderRadius: 8,
          background: "#1f2937", color: "#fff", fontSize: "0.72rem", fontWeight: 500, lineHeight: 1.5, whiteSpace: "normal",
          boxShadow: "0 6px 18px rgba(0,0,0,.18)", textAlign: "left" }}>
        {children}
      </span>
    </span>
  );
}
