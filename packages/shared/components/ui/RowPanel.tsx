"use client";

// ── แผงเลื่อนขวาที่เปิดจากแถวตาราง — ตัวกลางเดียวทุกหน้า HQ + ดีลเลอร์ (คนรวมงานสั่ง + บอสตอบขอบเขต 10 พ.ย. 69 · แบบเดียวกับแผงดีลเลอร์ /hq/dealers) ──
//   กว้างเท่ากันทุกแผง (ความกว้างแผงแถว) · ชิดขวาห่างขอบ 12 · จอแคบกว่า 1024 = เต็มจอ (.row-panel ใน globals.css)
//   หัวน้ำเงิน: ชื่อ + ป้าย + ข้อความรอง + ปุ่มหลัก · แท็บใต้หัว · เนื้อเลื่อนได้
//   ชิ้นในเนื้อ: แผงสรุป (กริด 3 ช่อง) · ส่วน (การ์ดมีหัวข้อ) · แถวข้อมูล (หัวข้อซ้าย ค่าขวาชิดกัน ไม่กวาดข้ามจอ)
//   ไม่ใช้กับ: หน้าต่างเจาะลึกจากการ์ด (DrillWindow) · หน้าต่างใบเสนอราคา / ใบค่าแฟรนไชส์ / ใบ HQ (หน้าต่างกลางจอตามที่บอสสั่ง)
//   ข้อทดสอบ: tests/scenario/row-panel-width.spec.ts (ทุกแผงกว้างเท่าแผงดีลเลอร์ที่ 1366/1920 · จอ < 1024 เต็มจอ)
import { useEffect, useRef, type ReactNode, type HTMLAttributes } from "react";
import { X } from "lucide-react";

const PRIMARY = "#003366";
const MUTED = "#6b7280";
/** ความกว้างแผงจากแถว (px) — ค่าเดียวทั้งระบบ (บอสตอบ 10 พ.ย. 69: 820 ทุกแผง รวมแผงดีลเลอร์ HQ) */
export const ความกว้างแผงแถว = 820;

export type แท็บแผงแถว = { key: string; label: ReactNode; count?: number | null };
type ข้อมูลแอตทริบิวต์ = Record<`data-${string}`, string | number | undefined>;

export function RowPanel({
  label, title, titleAttrs, badges, subtitle, actions, tabs, tab, onTab, onClose, children, footer, asideAttrs, backdropAttrs, bodyAttrs, zIndex = 240, closeLabel = "ปิดแผง",
}: {
  /** ชื่อที่โปรแกรมอ่านหน้าจออ่าน (aria-label ของแผง) */
  label: string;
  title: ReactNode;
  /** แอตทริบิวต์ของชื่อ (เช่น data-panel-name) */
  titleAttrs?: ข้อมูลแอตทริบิวต์;
  /** ป้ายบรรทัดใต้ชื่อ (รหัส · สถานะ · …) */
  badges?: ReactNode;
  /** ข้อความรอง (จังหวัด · ดีลเลอร์ · …) */
  subtitle?: ReactNode;
  /** ปุ่มหลักใต้ชื่อ */
  actions?: ReactNode;
  tabs?: แท็บแผงแถว[];
  tab?: string;
  onTab?: (k: string) => void;
  onClose: () => void;
  children: ReactNode;
  /** แถบล่างตรึง (ถ้ามี) */
  footer?: ReactNode;
  asideAttrs?: ข้อมูลแอตทริบิวต์ & HTMLAttributes<HTMLElement>;
  backdropAttrs?: ข้อมูลแอตทริบิวต์;
  bodyAttrs?: ข้อมูลแอตทริบิวต์ & HTMLAttributes<HTMLDivElement>;
  zIndex?: number;
  closeLabel?: string;
}) {
  return (
    <RowPanelShell label={label} onClose={onClose} asideAttrs={asideAttrs} backdropAttrs={backdropAttrs} zIndex={zIndex}>
        <header style={{ background: "linear-gradient(135deg,#003366 0%,#00284F 60%,#001B36 100%)", padding: "16px 18px 14px", color: "#fff", flexShrink: 0 }}>
          <div data-panel-head style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div data-row-panel-title {...titleAttrs} style={{ fontSize: "1rem", fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                title={typeof title === "string" ? title : undefined}>{title}</div>
              {(badges || subtitle) && (
                <div data-row-panel-sub style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 6, fontSize: "0.72rem" }}>
                  {badges}
                  {subtitle != null && subtitle !== "" && <span style={{ color: "rgba(255,255,255,.8)", minWidth: 0, overflowWrap: "anywhere" }}>{subtitle}</span>}
                </div>
              )}
            </div>
            <button type="button" onClick={onClose} title={closeLabel} aria-label={closeLabel}
              style={{ background: "rgba(255,255,255,.12)", border: "none", color: "#fff", width: 30, height: 30, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
              <X size={16} />
            </button>
          </div>
          {actions && <div data-row-panel-actions style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>{actions}</div>}
        </header>

        {tabs && tabs.length > 1 && (
          <div className="tab-bar" role="tablist" aria-label="หัวข้อ" style={{ padding: "0 14px", background: "#fff", flexShrink: 0, overflowX: "auto" }}>
            {tabs.map(t => {
              const on = (tab ?? tabs[0].key) === t.key;
              return (
                <button key={t.key} type="button" role="tab" aria-selected={on} aria-pressed={on} data-active={on ? "1" : ""} data-panel-tab={t.key}
                  onClick={() => onTab?.(t.key)} className={`tab-item ${on ? "active" : ""}`}
                  style={{ display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}>
                  {t.label}
                  {t.count != null && <span style={{ fontSize: "0.65rem", fontWeight: 700, background: on ? "#dce5f0" : "#e5e7eb", color: on ? PRIMARY : MUTED, borderRadius: 99, padding: "1px 6px" }}>{t.count}</span>}
                </button>
              );
            })}
          </div>
        )}

        <div data-panel-body {...bodyAttrs} style={{ flex: 1, overflowY: "auto", padding: 14, ...(bodyAttrs?.style ?? {}) }}>{children}</div>
        {footer && <div data-row-panel-footer style={{ borderTop: "1px solid #E7EDF4", background: "#fff", padding: "10px 14px", flexShrink: 0 }}>{footer}</div>}
    </RowPanelShell>
  );
}

/** กรอบแผงจากแถว (ฉากหลัง + แผงชิดขวา กว้าง 820 · จอ < 1024 เต็มจอ · คีย์บอร์ด) — ทุกแผงจากแถวต้องอยู่ในกรอบนี้
 *  แผงที่มีหัว/แท็บของตัวเองซับซ้อน (แผงลูกค้าเป้าหมาย/ลูกค้าดีลเลอร์ · ผู้สนใจ HQ) ใช้กรอบนี้ตรง ๆ · แผงทั่วไปใช้ RowPanel (หัว+แท็บสำเร็จรูป) */
export function RowPanelShell({ label, onClose, onEscape, children, asideAttrs, backdropAttrs, zIndex = 240, backdropClassName }: {
  label: string; onClose: () => void; children: ReactNode;
  /** Esc (ไม่ส่ง = ปิดแผง) — แผงที่มีกล่องซ้อนในตัวเองปิดกล่องก่อน */
  onEscape?: () => void;
  asideAttrs?: ข้อมูลแอตทริบิวต์ & HTMLAttributes<HTMLElement>; backdropAttrs?: ข้อมูลแอตทริบิวต์; zIndex?: number; backdropClassName?: string;
}) {
  const ref = useแผงบนสุด(onEscape ?? onClose);
  return (
    <>
      <div onClick={onClose} data-row-panel-backdrop className={backdropClassName} {...backdropAttrs}
        style={{ position: "fixed", inset: 0, background: "rgba(45,45,45,.45)", zIndex }} />
      <aside ref={ref} role="dialog" aria-modal="true" aria-label={label} data-row-panel {...asideAttrs} className={`side-drawer row-panel ${asideAttrs?.className ?? ""}`}
        onClick={e => e.stopPropagation()}
        style={{ zIndex: zIndex + 1, ...(asideAttrs?.style ?? {}) }}>
        {children}
      </aside>
    </>
  );
}

/** คีย์บอร์ดของแผง: เปิดแล้วโฟกัสเข้าแผง · Esc ปิด · Tab วนในแผง · ปิดแล้วโฟกัสกลับที่เดิม
 *  ทำเฉพาะเมื่อแผงนี้อยู่บนสุด — แผงดีลเลอร์เปิดแผงใบ/ลูกค้าซ้อน: Esc/Tab เป็นของแผงบน (แผงล่างไม่แย่งโฟกัส ไม่ปิดตาม) */
function useแผงบนสุด(onClose: () => void) {
  const ref = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const previous = document.activeElement as HTMLElement | null;
    const ได้โฟกัส = () => Array.from(node.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )).filter(el => el.offsetParent !== null || el === document.activeElement);
    // มีหน้าต่าง/แผงอื่นเปิดทับ (อยู่หลังในเอกสาร) = แผงนี้ไม่ใช่บนสุด
    const บนสุด = () => !Array.from(document.querySelectorAll('[role="dialog"][aria-modal="true"]'))
      .some(d => d !== node && !node.contains(d) && (node.compareDocumentPosition(d) & Node.DOCUMENT_POSITION_FOLLOWING));
    if (!node.contains(document.activeElement)) { node.setAttribute("tabindex", "-1"); node.focus({ preventScroll: true }); }
    function onKeyDown(e: KeyboardEvent) {
      if (!node || !บนสุด()) return;
      if (e.key === "Escape") { e.stopPropagation(); closeRef.current(); return; }
      if (e.key !== "Tab") return;
      const items = ได้โฟกัส();
      if (!items.length) { e.preventDefault(); return; }
      const แรก = items[0], ท้าย = items[items.length - 1], อยู่ = document.activeElement as HTMLElement | null;
      if (!e.shiftKey && อยู่ === ท้าย) { e.preventDefault(); แรก.focus(); }
      else if (e.shiftKey && (อยู่ === แรก || อยู่ === node)) { e.preventDefault(); ท้าย.focus(); }
      else if (อยู่ && !node.contains(อยู่)) { e.preventDefault(); แรก.focus(); }
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      if (previous && document.contains(previous)) previous.focus({ preventScroll: true });
    };
  }, []);
  return ref;
}

/** ปุ่มบนหัวแผง (ปุ่มหลัก = พื้นเต็ม) */
export function ปุ่มหัวแผง({ label, title, icon, onClick, primary = false, disabled = false, attrs }: {
  label: ReactNode; title?: string; icon?: ReactNode; onClick: () => void; primary?: boolean; disabled?: boolean; attrs?: ข้อมูลแอตทริบิวต์;
}) {
  return (
    <button type="button" className={`btn btn-sm ${primary ? "btn-primary" : "btn-secondary"}`} title={title} disabled={disabled} onClick={onClick} {...attrs}
      style={{ display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}>{icon}{label}</button>
  );
}

/** ป้ายบนหัวแผง (พื้นจางบนสีน้ำเงิน หรือสีตามสถานะ) */
export function ป้ายหัวแผง({ children, bg = "rgba(255,255,255,.16)", color = "#fff", mono = false, attrs }: {
  children: ReactNode; bg?: string; color?: string; mono?: boolean; attrs?: ข้อมูลแอตทริบิวต์;
}) {
  return <span className="badge" {...attrs} style={{ background: bg, color, fontFamily: mono ? "monospace" : undefined }}>{children}</span>;
}

export type ช่องสรุปแผง = { k: string; label: string; value: ReactNode; icon?: ReactNode; onClick?: () => void; small?: boolean; title?: string };
/** แผงสรุป — กริด 3 ช่อง (จอแคบ 2 ช่อง) · ช่องที่กดได้ = ไปรายการของเรื่องนั้น */
export function สรุปแผง({ items, attrs }: { items: ช่องสรุปแผง[]; attrs?: ข้อมูลแอตทริบิวต์ }) {
  return (
    <div data-panel-stats className="row-panel-stats" {...attrs}>
      {items.map(t => {
        const เนื้อ = (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: MUTED, fontSize: "0.68rem", fontWeight: 700 }}>{t.icon}{t.label}</div>
            <div data-value style={{ marginTop: 4, fontSize: t.small ? "0.78rem" : "1.15rem", fontWeight: 800, color: "#1F2937", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
              title={t.title ?? (typeof t.value === "string" ? t.value : undefined)}>{t.value}</div>
          </>
        );
        const กรอบ: React.CSSProperties = { textAlign: "left", padding: "10px 12px", border: "1px solid #e5e7eb", background: "#fff", marginBottom: 0, minWidth: 0 };
        return t.onClick
          ? <button key={t.k} type="button" data-stat={t.k} onClick={t.onClick} title={`${t.label} — กดเพื่อดูรายการ`} className="card clickable" style={{ ...กรอบ, cursor: "pointer", fontFamily: "inherit" }}>{เนื้อ}</button>
          : <div key={t.k} data-stat={t.k} className="card" style={กรอบ}>{เนื้อ}</div>;
      })}
    </div>
  );
}

/** ส่วนในแผง — การ์ดมีหัวข้อ (ไอคอน + ชื่อ) แบบเดียวกันทุกส่วน */
export function ส่วนแผง({ title, icon, children, testid, right }: { title: ReactNode; icon?: ReactNode; children: ReactNode; testid?: string; right?: ReactNode }) {
  return (
    <section className="card" data-panel-section={testid} style={{ marginBottom: 12 }}>
      <div className="card-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>{icon && <span style={{ color: PRIMARY, display: "flex" }}>{icon}</span>}<div className="card-title">{title}</div></div>
        {right}
      </div>
      <div className="card-body" style={{ paddingTop: 0 }}>{children}</div>
    </section>
  );
}

/** แถวข้อมูล — หัวข้อซ้าย (128px) ค่าขวาชิดกัน · ไม่กวาดข้ามความกว้างแผง */
export function แถวข้อมูล({ label, value, attrs }: { label: ReactNode; value: ReactNode; attrs?: ข้อมูลแอตทริบิวต์ }) {
  return (
    <div data-info-row {...attrs} style={{ display: "grid", gridTemplateColumns: "128px minmax(0,1fr)", gap: 10, padding: "6px 0", borderTop: "1px solid #f1f5f9", fontSize: "0.8rem" }}>
      <span style={{ color: MUTED }}>{label}</span><span style={{ color: "#1F2937", fontWeight: 600, overflowWrap: "anywhere" }}>{value}</span>
    </div>
  );
}
