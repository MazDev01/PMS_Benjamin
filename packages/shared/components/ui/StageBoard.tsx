"use client";
// ── บอร์ดลากได้ตัวกลาง (บอสสั่ง 5 พ.ย. 69) — ใช้ร่วม: ผู้สนใจเป็นดีลเลอร์ (/hq/prospects) + ลูกค้าเป้าหมาย (/leads ดีลเลอร์) ──────
//   บอร์ดไม่ย้ายการ์ดเอง: ลาก/เลือก "ย้ายไปขั้น…" = เรียก onMove → หน้าเปิดฟอร์มของขั้นนั้น
//     บันทึกสำเร็จ = ข้อมูลเปลี่ยน การ์ดย้ายตามข้อมูล · ยกเลิก = ข้อมูลไม่เปลี่ยน การ์ดเด้งกลับที่เดิมเอง
//   ทางที่ย้ายได้มาจาก ทางย้าย(การ์ด) ของแต่ละหน้า (ตัวกติกากลางของหน้านั้น) — ไม่อยู่ในรายการ = ย้ายไม่ได้ + บอกเหตุผล
//   ทางเลือกแทนการลาก: ปุ่ม "ย้ายไปขั้น…" บนการ์ด (ใช้คีย์บอร์ด/จอสัมผัสได้)
//   คอลัมน์ ยุบได้ = ยุบไว้ตั้งแต่แรก ปุ่ม "เปิดดู (n)" / "ยุบ" · ยุบอยู่ก็ยังวางการ์ดลงได้
//   ลากแล้วเลื่อนตาม (บอสสั่ง 6 พ.ย. 69): ลากใกล้ขอบซ้าย/ขวาของบอร์ด = บอร์ดเลื่อนแนวนอน · ใกล้ขอบบน/ล่างของจอ = หน้าเลื่อนแนวตั้ง
//     ยิ่งใกล้ขอบยิ่งเร็ว · ปล่อย/ยกเลิก/ออกนอกหน้าต่าง (ไม่มีเหตุการณ์ลากเกิน 250 มิลลิวินาที) = หยุด · ใช้เหตุการณ์ลากของเบราว์เซอร์
//     ตัวเดียวกันทั้งเมาส์และนิ้ว (เบราว์เซอร์มือถือที่ลากการ์ดได้ส่งเหตุการณ์ลากชุดเดียวกัน) · ข้อทดสอบ board-autoscroll.spec.ts
import React, { useEffect, useRef, useState } from "react";
import { ArrowRightLeft } from "lucide-react";
import { แจ้งพลาด } from "@pms/shared/components/ui/ConfirmToast";

/** ชนิดข้อมูลของการลากการ์ดบอร์ด (ไม่ใช่ข้อความทั่วไป — ลากข้อความ/ไฟล์อื่นมาวางไม่ถือเป็นการย้ายการ์ด) */
const ชนิดลาก = "application/x-pms-stage-card";

export type คอลัมน์บอร์ด<K extends string> = {
  key: K;
  label: string;
  สี: { bg: string; text: string };
  /** คอลัมน์แคบ (กลุ่มปิดแล้ว) */
  แคบ?: boolean;
  /** เส้นคั่นก่อนคอลัมน์นี้ */
  คั่นก่อน?: boolean;
  /** บรรทัดเล็กใต้หัวคอลัมน์ (เช่น มูลค่ารวม) */
  ย่อย?: string;
  /** ยุบไว้ตั้งแต่แรก กดเปิดดูได้ (การ์ดซ่อน · ยังวางการ์ดลงได้) — เช่น ปิดแล้วของบอร์ดผู้สนใจ */
  ยุบได้?: boolean;
};
/** ทางที่การ์ดย้ายไปได้ — ไม่ได้เพราะ = แสดงในเมนูแต่กดไม่ได้ + ลากมาวางแล้วบอกเหตุผลนี้ */
export type ทางย้าย<K extends string> = { ไป: K; ป้าย: string; ไม่ได้เพราะ?: string | null };

export function StageBoard<T, K extends string>({
  columns, items, idOf, colOf, renderCard, onOpen, ทางย้าย: ทางของ, onMove, ซ่อนว่าง, ความสูง, ข้อความว่าง = "ไม่มีรายการ", ป้ายบอร์ด,
}: {
  columns: คอลัมน์บอร์ด<K>[];
  items: T[];
  idOf: (t: T) => string | number;
  colOf: (t: T) => K | null;
  renderCard: (t: T) => React.ReactNode;
  onOpen?: (t: T) => void;
  ทางย้าย: (t: T) => ทางย้าย<K>[];
  /** เปิดฟอร์มของขั้นปลายทาง — การ์ดไม่ย้ายจนข้อมูลเปลี่ยนจริง */
  onMove: (t: T, ไป: K) => void;
  ซ่อนว่าง?: boolean;
  ความสูง?: string | number;
  ข้อความว่าง?: string;
  ป้ายบอร์ด: string;
}) {
  const [ลากอยู่, setลากอยู่] = useState<string | number | null>(null);
  const [เหนือ, setเหนือ] = useState<K | null>(null);
  const [เมนู, setเมนู] = useState<string | number | null>(null);
  const [เปิดดู, setเปิดดู] = useState<ReadonlySet<K>>(() => new Set());
  const ชื่อคอลัมน์ = (k: K) => columns.find(c => c.key === k)?.label ?? k;
  const กล่อง = useRef<HTMLDivElement>(null);
  useเลื่อนตามตอนลาก(กล่อง, ลากอยู่ !== null);

  // วางการ์ด / เลือกจากเมนู → ตรวจทางก่อน (ทางเดียวกันทั้งสองแบบ)
  function ย้าย(t: T, ไป: K) {
    if (colOf(t) === ไป) return;
    const ทาง = ทางของ(t).find(x => x.ไป === ไป);
    if (!ทาง) { แจ้งพลาด(`ย้ายไป “${ชื่อคอลัมน์(ไป)}” ไม่ได้ — เลื่อนได้ทีละขั้นไปข้างหน้าเท่านั้น`); return; }
    if (ทาง.ไม่ได้เพราะ) { แจ้งพลาด(ทาง.ไม่ได้เพราะ); return; }
    onMove(t, ไป);
  }

  return (
    <div ref={กล่อง} role="region" aria-label={ป้ายบอร์ด} data-stage-board
      style={{ display: "flex", gap: 16, overflowX: "auto", paddingBottom: 10, alignItems: "stretch" }}>
      {columns.map(c => {
        const col = items.filter(t => colOf(t) === c.key);
        if (ซ่อนว่าง && col.length === 0) return null;
        const ยุบอยู่ = !!c.ยุบได้ && !เปิดดู.has(c.key);
        const w = ยุบอยู่ ? 188 : c.แคบ ? 264 : 300;
        return (
          <React.Fragment key={c.key}>
            {c.คั่นก่อน && <div style={{ width: 1, alignSelf: "stretch", background: "#e5e7eb", flexShrink: 0, margin: "2px 0" }} />}
            <div data-board-column={c.key} data-board-collapsed={ยุบอยู่ || undefined} aria-label={`คอลัมน์ ${c.label}`}
              // รับเฉพาะการ์ดของบอร์ด (ชนิดข้อมูลของบอร์ด) — ดูจากชนิดข้อมูลที่ลาก ไม่รอสถานะ React (dragover แรกมาก่อนหน้าจอวาดใหม่ = วางไม่ติด)
              onDragOver={e => { if (!e.dataTransfer.types.includes(ชนิดลาก)) return; e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (เหนือ !== c.key) setเหนือ(c.key); }}
              onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setเหนือ(v => (v === c.key ? null : v)); }}
              onDrop={e => {
                e.preventDefault(); setเหนือ(null);
                const id = e.dataTransfer.getData(ชนิดลาก);
                const t = items.find(x => String(idOf(x)) === id);
                setลากอยู่(null);
                if (t) ย้าย(t, c.key);
              }}
              style={{
                minWidth: w, width: w, flexShrink: 0, display: "flex", flexDirection: "column",
                minHeight: ความสูง ?? "max(360px, calc(100vh - 330px))", background: เหนือ === c.key ? "#eef4fb" : "#f6f7f9",
                borderRadius: 12, padding: 10, border: `1.5px ${เหนือ === c.key ? "dashed #003366" : "solid transparent"}`,
              }}>
              <div style={{ padding: "7px 6px 11px", borderTop: `3px solid ${c.สี.text}`, marginBottom: 2 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                    <span style={{ width: 9, height: 9, borderRadius: "50%", background: c.สี.text, flexShrink: 0 }} />
                    <span style={{ fontSize: "0.8rem", fontWeight: 800, color: "#2D2D2D", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.label}</span>
                  </span>
                  <span className="badge" data-board-count style={{ background: c.สี.bg, color: c.สี.text, flexShrink: 0 }}>{col.length}</span>
                </div>
                {c.ย่อย && <div style={{ fontSize: "0.65rem", color: "#9ca3af", fontWeight: 600, marginTop: 3, fontVariantNumeric: "tabular-nums" }}>{c.ย่อย}</div>}
                {c.ยุบได้ && (
                  <button type="button" data-board-toggle aria-expanded={!ยุบอยู่}
                    onClick={() => setเปิดดู(v => { const n = new Set(v); if (n.has(c.key)) n.delete(c.key); else n.add(c.key); return n; })}
                    style={{ marginTop: 8, height: 26, padding: "0 10px", borderRadius: 7, border: "1px solid #dbe3ec", background: "#fff", color: "#003366",
                      fontFamily: "inherit", fontSize: "0.68rem", fontWeight: 700, cursor: "pointer" }}>
                    {ยุบอยู่ ? `เปิดดู (${col.length})` : "ยุบ"}
                  </button>
                )}
              </div>
              {ยุบอยู่ ? (
                <div style={{ flex: 1, display: "flex", alignItems: "flex-end", justifyContent: "center", padding: "16px 6px", fontSize: "0.65rem", color: "#9ca3af", border: "1.5px dashed #e5e7eb", borderRadius: 10, textAlign: "center" }}>
                  ลากการ์ดมาวางเพื่อปิดการติดตาม
                </div>
              ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 44, flex: 1 }}>
                {col.map(t => {
                  const id = idOf(t);
                  const ทาง = ทางของ(t);
                  return (
                    <div key={id} data-board-card={id} draggable={ทาง.length > 0}
                      onDragStart={e => { e.dataTransfer.setData(ชนิดลาก, String(id)); e.dataTransfer.effectAllowed = "move"; setลากอยู่(id); }}
                      onDragEnd={() => { setลากอยู่(null); setเหนือ(null); }}
                      onClick={() => onOpen?.(t)} className="card"
                      style={{ position: "relative", padding: "12px 14px", cursor: ทาง.length ? "grab" : "pointer", userSelect: "none", borderRadius: 10,
                        boxShadow: "0 1px 4px rgba(0,0,0,.05)", opacity: ลากอยู่ === id ? 0.5 : 1 }}>
                      {renderCard(t)}
                      {ทาง.length > 0 && (
                        <ปุ่มย้าย ทาง={ทาง} เปิด={เมนู === id} ตั้งเปิด={v => setเมนู(v ? id : null)} เลือก={ไป => { setเมนู(null); ย้าย(t, ไป); }} />
                      )}
                    </div>
                  );
                })}
                {col.length === 0 && (
                  <div style={{ flex: 1, display: "flex", alignItems: "flex-end", justifyContent: "center", padding: "16px 6px", fontSize: "0.65rem", color: "#c7ccd3", border: "1.5px dashed #e5e7eb", borderRadius: 10 }}>{ข้อความว่าง}</div>
                )}
              </div>
              )}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

/** ตัวเลื่อนแนวตั้งของหน้า: กล่องบรรพบุรุษใหญ่ที่เลื่อนแนวตั้งได้ตัวแรก · ไม่มี = หน้าต่าง */
function ตัวเลื่อนแนวตั้ง(el: HTMLElement | null): HTMLElement | null {
  for (let p = el?.parentElement ?? null; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    // เฉพาะกล่องใหญ่ที่เลื่อนได้จริง (สูงเกินครึ่งจอ · เลื่อนได้มากกว่า 40px) — กล่องเล็กที่ล้นนิดเดียวไม่ใช่ตัวเลื่อนของหน้า
    if ((o === "auto" || o === "scroll") && p.scrollHeight > p.clientHeight + 40 && p.clientHeight > window.innerHeight * 0.5) return p;
  }
  return null;
}

/** ลากแล้วเลื่อนตาม (บอสสั่ง 6 พ.ย. 69) — ระหว่างลากการ์ด: ขอบซ้าย/ขวาของบอร์ด = เลื่อนบอร์ด · ขอบบน/ล่างของจอ = เลื่อนหน้า
 *  ความเร็วตามระยะห่างจากขอบ (ใกล้สุด = เร็วสุด) · เหตุการณ์ลากหยุดมา (ปล่อย/ยกเลิก/ออกนอกหน้าต่าง) = หยุดเลื่อน */
function useเลื่อนตามตอนลาก(กล่อง: React.RefObject<HTMLDivElement | null>, ลาก: boolean) {
  useEffect(() => {
    if (!ลาก) return;
    const ระยะขอบ = 64, เร็วสุด = 22, ค้างได้นาน = 250;
    let จุด: { x: number; y: number; t: number } | null = null;
    let รอบ: number | null = null;
    const สัดส่วน = (ห่าง: number) => Math.max(0, Math.min(1, 1 - ห่าง / ระยะขอบ));
    const ก้าว = () => {
      const el = กล่อง.current;
      if (!จุด || !el || performance.now() - จุด.t > ค้างได้นาน) { รอบ = null; return; }
      const r = el.getBoundingClientRect();
      // ขอบที่มองเห็นจริง (บอร์ดกว้างเลยจอได้ — ใช้ขอบจอแทน)
      const ซ้าย = Math.max(r.left, 0), ขวา = Math.min(r.right, window.innerWidth);
      const dx = จุด.x < ซ้าย + ระยะขอบ ? -เร็วสุด * สัดส่วน(จุด.x - ซ้าย) : จุด.x > ขวา - ระยะขอบ ? เร็วสุด * สัดส่วน(ขวา - จุด.x) : 0;
      const H = window.innerHeight;
      const dy = จุด.y < ระยะขอบ ? -เร็วสุด * สัดส่วน(จุด.y) : จุด.y > H - ระยะขอบ ? เร็วสุด * สัดส่วน(H - จุด.y) : 0;
      if (dx) el.scrollLeft += dx;
      if (dy) { const v = ตัวเลื่อนแนวตั้ง(el); if (v) v.scrollTop += dy; else window.scrollBy(0, dy); }
      รอบ = requestAnimationFrame(ก้าว);
    };
    const ขยับ = (e: DragEvent) => {
      if (!e.clientX && !e.clientY) return;   // บางเบราว์เซอร์ส่ง 0,0 ตอนออกนอกหน้าต่าง
      จุด = { x: e.clientX, y: e.clientY, t: performance.now() };
      if (รอบ === null) รอบ = requestAnimationFrame(ก้าว);
    };
    const หยุด = () => { จุด = null; if (รอบ !== null) cancelAnimationFrame(รอบ); รอบ = null; };
    document.addEventListener("dragover", ขยับ, true);
    document.addEventListener("drag", ขยับ, true);
    document.addEventListener("drop", หยุด, true);
    document.addEventListener("dragend", หยุด, true);
    window.addEventListener("blur", หยุด);
    return () => {
      หยุด();
      document.removeEventListener("dragover", ขยับ, true);
      document.removeEventListener("drag", ขยับ, true);
      document.removeEventListener("drop", หยุด, true);
      document.removeEventListener("dragend", หยุด, true);
      window.removeEventListener("blur", หยุด);
    };
  }, [ลาก, กล่อง]);
}

/** ปุ่ม "ย้ายไปขั้น…" บนการ์ด — ทางเดียวกับการลาก (ทางที่ไม่ได้ = กดไม่ได้ + เหตุผลบนปุ่ม) */
function ปุ่มย้าย<K extends string>({ ทาง, เปิด, ตั้งเปิด, เลือก }: { ทาง: ทางย้าย<K>[]; เปิด: boolean; ตั้งเปิด: (v: boolean) => void; เลือก: (k: K) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!เปิด) return;
    const ปิด = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) ตั้งเปิด(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") ตั้งเปิด(false); };
    document.addEventListener("mousedown", ปิด); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", ปิด); document.removeEventListener("keydown", esc); };
  }, [เปิด, ตั้งเปิด]);
  return (
    <div ref={ref} onClick={e => e.stopPropagation()} style={{ marginTop: 8, position: "relative" }}>
      <button type="button" data-move-menu aria-haspopup="menu" aria-expanded={เปิด} onClick={() => ตั้งเปิด(!เปิด)}
        style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 26, padding: "0 9px", borderRadius: 7, border: "1px solid #dbe3ec",
          background: "#fff", color: "#003366", fontFamily: "inherit", fontSize: "0.68rem", fontWeight: 700, cursor: "pointer" }}>
        <ArrowRightLeft size={11} /> ย้ายไปขั้น…
      </button>
      {เปิด && (
        <div role="menu" style={{ position: "absolute", left: 0, top: 30, zIndex: 30, minWidth: 210, background: "#fff", border: "1px solid #e5e7eb",
          borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,.12)", padding: 4 }}>
          {ทาง.map(x => (
            <button key={x.ไป} type="button" role="menuitem" data-move-to={x.ไป} disabled={!!x.ไม่ได้เพราะ} title={x.ไม่ได้เพราะ ?? undefined}
              onClick={() => เลือก(x.ไป)}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "7px 10px", border: "none", borderRadius: 7, background: "transparent",
                fontFamily: "inherit", fontSize: "0.74rem", fontWeight: 600, color: x.ไม่ได้เพราะ ? "#9ca3af" : "#2D2D2D", cursor: x.ไม่ได้เพราะ ? "not-allowed" : "pointer" }}>
              {x.ป้าย}
              {x.ไม่ได้เพราะ && <span style={{ display: "block", fontSize: "0.64rem", fontWeight: 500, color: "#b45309" }}>{x.ไม่ได้เพราะ}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
