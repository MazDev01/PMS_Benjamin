"use client";

// ── กล่องยืนยันของระบบ — ใช้ sonner แทนกล่องของเบราว์เซอร์ (บอสสั่ง 28 ส.ค. 69) ──────
//
// ทำไมต้องเปลี่ยน: confirm() ของเบราว์เซอร์หน้าตาเป็นของ Chrome/Windows ไม่ใช่ของระบบเรา
//   ขึ้นหัวว่า "localhost:3001 บอกว่า" · ใช้ฟอนต์คนละตัว · สีคนละชุด · จัดวางแก้ไม่ได้เลย
//   และมันหยุดทั้งหน้าจอไว้ (blocking) ซึ่งต่างจากส่วนอื่นของระบบทั้งหมด
//
// ⚠️ กติกาที่ห้ามหลุด: ตัวนี้แทน "คำถามที่ต้องได้คำตอบ" ไม่ใช่ข้อความแจ้งเตือนทั่วไป
//   • ห้ามหายเอง — duration: Infinity เสมอ · งานที่ย้อนกลับไม่ได้ต้องรอคนตอบ ไม่ใช่หายไปเงียบ ๆ
//   • ปัดทิ้ง / กด Esc = "ยกเลิก" เสมอ (ตอบ false) ไม่ใช่ค้างรอตลอดกาล
//   • ทีละใบเท่านั้น — ถามซ้อนกันแล้วผู้ใช้ตอบผิดใบได้ · ใบใหม่มาปิดใบเก่าแล้วตอบว่ายกเลิก
//
// การใช้งาน (ต้อง await เสมอ — ต่างจาก confirm() เดิมที่คืนค่าทันที):
//   if (!(await ยืนยัน({ หัวข้อ: "ลบรายการนี้?", รายละเอียด: "ย้อนกลับไม่ได้", อันตราย: true }))) return;
//
// ── งานที่ต้องรอฐาน: ส่ง ทำ ให้กล่องทำเอง (บอสสั่ง 28 ต.ค. 69 · กด "ยกเลิกคำขอ" แล้วดูเหมือนไม่เกิดอะไร) ─────────
//   กล่องเปิดค้างจนฐานตอบ · ปุ่มเปลี่ยนเป็น "กำลัง…" กดซ้ำไม่ได้ · ฐานตอบผิดพลาด = ข้อความในกล่อง ไม่ปิดเอง
//   ⚠️ ใน ทำ ห้ามเรียก แจ้งพลาด() — โยน error ออกมา (ที่วางกล่องแสดงทีละใบ ข้อความแจ้งใบใหม่จะบังกล่องที่ค้าง)
//   ถามเหตุผล() บังคับ ทำ เสมอ = กล่องเหตุผลตัวเดียวทั้งระบบ (ตัวตรวจ check-reason-dialogs ห้ามเขียนช่องเหตุผลเอง)
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Toaster, toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { friendlyError } from "@pms/shared/lib/friendlyError";
import { OTHER_LOST_REASON, OTHER_REASON_OPTION } from "@pms/shared/lib/mock";

export type ตัวเลือกยืนยัน = {
  หัวข้อ: string;
  /** บรรทัดอธิบายผลของการกดตกลง — เขียนให้ผู้ใช้ตัดสินใจได้โดยไม่ต้องเดา */
  รายละเอียด?: string;
  /** ข้อความบนปุ่มตกลง — ตั้งให้เป็น "คำกริยาของงานนั้น" อ่านแล้วรู้ว่ากดแล้วเกิดอะไร */
  ปุ่มตกลง?: string;
  ปุ่มยกเลิก?: string;
  /** งานที่ย้อนกลับไม่ได้ (ลบ/ปิดการขาย/คืนค่าเริ่มต้น) — ปุ่มตกลงเป็นสีเตือน + มีไอคอน */
  อันตราย?: boolean;
  /** งานที่ต้องรอฐาน — กล่องทำเองแล้วค่อยปิด (ดูหัวไฟล์) · โยน error = แสดงในกล่อง */
  ทำ?: () => Promise<unknown>;
  /** ข้อความบนปุ่มตกลงระหว่างรอฐาน เช่น "กำลังส่ง…" */
  ปุ่มกำลังทำ?: string;
};

/** ข้อความผิดพลาดในกล่อง — อยู่เหนือปุ่ม อ่านได้ทันที ไม่หายเอง */
function ข้อผิดพลาดในกล่อง({ ข้อความ }: { ข้อความ: string }) {
  return ข้อความ ? (
    <div role="alert" data-dialog-error
      style={{ marginTop: 10, fontSize: "0.76rem", fontWeight: 600, color: "#b91c1c", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "7px 10px", lineHeight: 1.5 }}>
      {ข้อความ}
    </div>
  ) : null;
}

/** ปุ่มตกลงของกล่อง — ระหว่างรอฐานขึ้น "กำลัง…" และกดไม่ได้ (aria-busy) */
function ปุ่มตกลงของกล่อง({ o, กำลังทำ, ปิดไว้, อธิบาย, onClick, autoFocus }: {
  o: Pick<ตัวเลือกยืนยัน, "อันตราย" | "ปุ่มตกลง" | "ปุ่มกำลังทำ">; กำลังทำ: boolean; ปิดไว้?: boolean; อธิบาย?: string; onClick: () => void; autoFocus?: boolean;
}) {
  return (
    <button type="button" autoFocus={autoFocus} data-dialog-confirm disabled={กำลังทำ || ปิดไว้} aria-busy={กำลังทำ || undefined}
      aria-describedby={อธิบาย}
      className={`btn btn-sm ${o.อันตราย ? "pms-confirm-danger" : "btn-primary"}`}
      style={กำลังทำ || ปิดไว้ ? { opacity: 0.55, cursor: "not-allowed" } : undefined}
      onClick={onClick}>
      {กำลังทำ ? (o.ปุ่มกำลังทำ ?? "กำลังบันทึก…") : (o.ปุ่มตกลง ?? "ตกลง")}
    </button>
  );
}

/** กล่องยืนยันที่ทำงานรอฐานเอง (มี ทำ) */
function กล่องยืนยันรอฐาน({ o, ตอบ, กำลังทำRef }: { o: ตัวเลือกยืนยัน; ตอบ: (ผล: boolean) => void; กำลังทำRef: { current: boolean } }) {
  const [กำลังทำ, setกำลังทำ] = useState(false);
  const [ผิด, setผิด] = useState("");
  async function กด() {
    if (กำลังทำRef.current) return;          // กดรัว = ครั้งแรกครั้งเดียว (state ยังไม่ทันเปลี่ยน)
    กำลังทำRef.current = true; setกำลังทำ(true); setผิด("");
    try { await o.ทำ!(); ตอบ(true); }
    catch (e) { setผิด(friendlyError(e)); }
    finally { กำลังทำRef.current = false; setกำลังทำ(false); }
  }
  return (
    <div className="pms-confirm" role="alertdialog" aria-modal="false" aria-label={o.หัวข้อ} aria-busy={กำลังทำ || undefined}>
      <div className="pms-confirm-head">
        {o.อันตราย && <AlertTriangle size={16} className="pms-confirm-icon" aria-hidden />}
        <div className="pms-confirm-title">{o.หัวข้อ}</div>
      </div>
      {o.รายละเอียด && <div className="pms-confirm-detail">{o.รายละเอียด}</div>}
      <ข้อผิดพลาดในกล่อง ข้อความ={ผิด} />
      <div className="pms-confirm-actions">
        <button type="button" data-dialog-cancel className="btn btn-secondary btn-sm" disabled={กำลังทำ} onClick={() => ตอบ(false)}>{o.ปุ่มยกเลิก ?? "ยกเลิก"}</button>
        <ปุ่มตกลงของกล่อง o={o} กำลังทำ={กำลังทำ} autoFocus onClick={() => void กด()} />
      </div>
    </div>
  );
}

/** ใบที่ค้างอยู่ตอนนี้ — ถามใบใหม่ต้องปิดใบเก่าและตอบว่า "ยกเลิก" ให้ผู้เรียกเดิมก่อนเสมอ
 *  (ไม่งั้นผู้เรียกเดิมจะรอ Promise ที่ไม่มีวันตอบ — งานค้างแบบไม่มีใครเห็น)
 *  กำลังทำ = ฐานยังไม่ตอบ → Esc ไม่ปิด (ผู้ใช้ต้องเห็นผลของสิ่งที่กดไปแล้ว) */
let ใบที่ค้าง: { id: string | number; ยกเลิก: () => void; กำลังทำ: { current: boolean } } | null = null;

/** ใบที่ถูกยกเลิกก่อนขึ้นจอ ต้องปิดตัวเองตอนขึ้นจอ (ไม่นิ่ง → บั๊กจริง 26 ต.ค. 69)
 *  sonner ส่งคำสั่งปิดผ่าน requestAnimationFrame 2 ชั้น แต่เพิ่มใบผ่าน setTimeout — เครื่องทำงานหนัก (timer ช้ากว่าเฟรม)
 *  คำสั่งปิดถึงก่อนใบถูกเพิ่ม = หาใบไม่เจอ คำสั่งหาย → ใบเก่าค้างจอตลอด (duration Infinity) ซ้อนกับใบใหม่
 *  และปุ่มตกลงของใบเก่าไม่ทำอะไรเลย (ตอบไปแล้วว่ายกเลิก) · ข้อทดสอบ: tests/scenario/confirm-toast-race.spec.ts */
function ปิดเองถ้ายกเลิกแล้ว({ t, ตอบแล้ว, children }: { t: string | number; ตอบแล้ว: () => boolean; children: ReactNode }) {
  useEffect(() => { if (ตอบแล้ว()) toast.dismiss(t); }, [t, ตอบแล้ว]);
  return <>{children}</>;
}

/** ถามผู้ใช้แบบ "ต้องได้คำตอบ" — true = ตกลง · false = ยกเลิก/ปัดทิ้ง */
export function ยืนยัน(o: ตัวเลือกยืนยัน): Promise<boolean> {
  if (ใบที่ค้าง) { const เก่า = ใบที่ค้าง; ใบที่ค้าง = null; เก่า.ยกเลิก(); toast.dismiss(เก่า.id); }

  return new Promise<boolean>((resolve) => {
    let ตอบแล้ว = false;
    const กำลังทำ = { current: false };
    const ตอบ = (ผล: boolean) => {
      if (ตอบแล้ว) return;      // กดรัว/กดแล้วปัดทิ้ง = คำตอบแรกเท่านั้นที่นับ
      ตอบแล้ว = true;
      if (ใบที่ค้าง?.id === id) ใบที่ค้าง = null;
      resolve(ผล);
    };

    const id = toast.custom((t) => o.ทำ ? (
      <ปิดเองถ้ายกเลิกแล้ว t={t} ตอบแล้ว={() => ตอบแล้ว}>
        <กล่องยืนยันรอฐาน o={o} กำลังทำRef={กำลังทำ} ตอบ={ผล => { ตอบ(ผล); toast.dismiss(t); }} />
      </ปิดเองถ้ายกเลิกแล้ว>
    ) : (
      <ปิดเองถ้ายกเลิกแล้ว t={t} ตอบแล้ว={() => ตอบแล้ว}>
      <div className="pms-confirm" role="alertdialog" aria-modal="false" aria-label={o.หัวข้อ}>
        <div className="pms-confirm-head">
          {o.อันตราย && <AlertTriangle size={16} className="pms-confirm-icon" aria-hidden />}
          <div className="pms-confirm-title">{o.หัวข้อ}</div>
        </div>
        {o.รายละเอียด && <div className="pms-confirm-detail">{o.รายละเอียด}</div>}
        <div className="pms-confirm-actions">
          <button type="button" className="btn btn-secondary btn-sm"
            onClick={() => { ตอบ(false); toast.dismiss(t); }}>
            {o.ปุ่มยกเลิก ?? "ยกเลิก"}
          </button>
          {/* โฟกัสอยู่ที่ปุ่มตกลง แต่ "ตกลง" ไม่ใช่ค่าตั้งต้นของการกด Esc — Esc = ยกเลิกเสมอ */}
          <button type="button" autoFocus
            className={`btn btn-sm ${o.อันตราย ? "pms-confirm-danger" : "btn-primary"}`}
            onClick={() => { ตอบ(true); toast.dismiss(t); }}>
            {o.ปุ่มตกลง ?? "ตกลง"}
          </button>
        </div>
      </div>
      </ปิดเองถ้ายกเลิกแล้ว>
    ), {
      duration: Infinity,        // คำถามต้องรอคำตอบ ห้ามหายเอง
      dismissible: !o.ทำ,        // งานรอฐาน: ปัดทิ้งไม่ได้ — ปิดด้วยปุ่มยกเลิก (ก่อนกด) หรือฐานตอบสำเร็จเท่านั้น
      onDismiss: () => ตอบ(false),
      onAutoClose: () => ตอบ(false),   // ไม่ควรเกิด (Infinity) แต่ถ้าเกิดต้องไม่ค้าง
      className: "pms-confirm-toast",
    });

    ใบที่ค้าง = { id, ยกเลิก: () => ตอบ(false), กำลังทำ };
  });
}

// ── ถามเหตุผล: กล่องเหตุผลตัวเดียวทั้งระบบ (บอสสั่ง 28 ต.ค. 69) ─────────────────────────────────────────────
//   ใช้กับทุกจุดที่ต้องใส่เหตุผล: ยกเลิกคำขอ · ขอแก้ราคา · ลูกค้าปฏิเสธ · ย้อนการตอบรับ · ปิดไม่สำเร็จ
//     · ผู้สนใจไม่สำเร็จ · ปฏิเสธใบค่าแฟรนไชส์ · ยกเลิกการชำระ — ห้ามเขียนช่องเหตุผลเองในหน้า (check-reason-dialogs)
//   เหตุผลว่าง = ปุ่มยืนยันกดไม่ได้ + บอกที่ช่องเหตุผลเลย · กดแล้ว "กำลัง…" กดซ้ำไม่ได้จนฐานตอบ
//   ฐานตอบผิดพลาด = ข้อความในกล่อง กล่องไม่ปิด (แก้แล้วกดใหม่ได้) · สำเร็จ = กล่องปิด คืน true
//   ตัวเลือก = รายการเหตุผลที่ HQ ตั้ง (มี "อื่นๆ (ระบุเอง)" ให้พิมพ์ · ค่าโหมดพิมพ์ห้ามหลุดลงฐาน) · ไม่ส่ง = พิมพ์เอง
export type ตัวเลือกถามเหตุผล = Omit<ตัวเลือกยืนยัน, "ทำ"> & {
  /** ชื่อช่องเหตุผล เช่น "เหตุผลที่ยกเลิก" (โปรแกรมอ่านหน้าจออ่านชื่อนี้) */
  ป้ายช่อง: string;
  ตัวเลือก?: readonly string[];
  /** ช่องข้อความเพิ่ม (ไม่บังคับ) เช่น สเปกตอนขอแก้ราคา */
  ช่องเพิ่ม?: { ป้าย: string; ค่าตั้งต้น?: string };
  /** งานที่ต้องรอฐาน — รับเหตุผล (ตัดช่องว่างแล้ว) + ช่องเพิ่ม · โยน error = แสดงในกล่อง */
  ทำ: (เหตุผล: string, เพิ่ม: string) => Promise<unknown>;
};

const ช่องในกล่อง: React.CSSProperties = { width: "100%", marginTop: 6, padding: "7px 9px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: "0.82rem", fontFamily: "inherit", resize: "vertical", boxSizing: "border-box", background: "#fff" };

function กล่องเหตุผล({ o, ตอบ, กำลังทำRef }: { o: ตัวเลือกถามเหตุผล; ตอบ: (สำเร็จ: boolean) => void; กำลังทำRef: { current: boolean } }) {
  const รายการ = o.ตัวเลือก ?? [];
  const ใช้รายการ = รายการ.length > 0;
  const [เลือก, setเลือก] = useState("");
  const [พิมพ์, setพิมพ์] = useState("");
  const [เพิ่ม, setเพิ่ม] = useState(o.ช่องเพิ่ม?.ค่าตั้งต้น ?? "");
  const [กำลังทำ, setกำลังทำ] = useState(false);
  const [ผิด, setผิด] = useState("");
  const พิมพ์เอง = !ใช้รายการ || เลือก === OTHER_LOST_REASON;
  const เหตุผล = (พิมพ์เอง ? พิมพ์ : เลือก).trim();
  const ว่าง = เหตุผล === "";
  const idคำบอก = useRef(`reason-hint-${Math.random().toString(36).slice(2, 8)}`).current;

  async function กด() {
    if (ว่าง || กำลังทำRef.current) return;   // กดรัว = ครั้งแรกครั้งเดียว (state ยังไม่ทันเปลี่ยน)
    กำลังทำRef.current = true; setกำลังทำ(true); setผิด("");
    try { await o.ทำ(เหตุผล, เพิ่ม.trim()); ตอบ(true); }
    catch (e) { setผิด(friendlyError(e)); }
    finally { กำลังทำRef.current = false; setกำลังทำ(false); }
  }
  const ปุ่มเลือก = (r: string, on: boolean, fn: () => void, เส้นประ = false) => (
    <button key={r} type="button" onClick={fn} disabled={กำลังทำ} aria-pressed={on}
      style={{ padding: "7px 9px", borderRadius: 8, cursor: กำลังทำ ? "not-allowed" : "pointer", fontSize: "0.76rem", fontFamily: "inherit", textAlign: "left",
        border: `1px ${เส้นประ ? "dashed" : "solid"} ${on ? "#dc2626" : เส้นประ ? "#9ca3af" : "#e5e7eb"}`, background: on ? "#fee2e2" : เส้นประ ? "#fafafa" : "#fff",
        color: on ? "#dc2626" : เส้นประ ? "#6b7280" : "#2D2D2D", fontWeight: on || เส้นประ ? 700 : 400 }}>{r}</button>
  );

  return (
    <div className="pms-confirm" role="alertdialog" aria-modal="false" aria-label={o.หัวข้อ} aria-busy={กำลังทำ || undefined} data-reason-dialog>
      <div className="pms-confirm-head">
        {o.อันตราย && <AlertTriangle size={16} className="pms-confirm-icon" aria-hidden />}
        <div className="pms-confirm-title">{o.หัวข้อ}</div>
      </div>
      {o.รายละเอียด && <div className="pms-confirm-detail">{o.รายละเอียด}</div>}
      {ใช้รายการ && !พิมพ์เอง && (
        <div data-lost-picker style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 6, marginTop: 10 }}>
          {รายการ.map(r => ปุ่มเลือก(r, เลือก === r, () => setเลือก(r === OTHER_REASON_OPTION ? OTHER_LOST_REASON : r)))}
          {!รายการ.includes(OTHER_REASON_OPTION) && ปุ่มเลือก(OTHER_REASON_OPTION, false, () => setเลือก(OTHER_LOST_REASON), true)}
        </div>
      )}
      {พิมพ์เอง && (
        <textarea aria-label={o.ป้ายช่อง} placeholder="พิมพ์เหตุผล…" value={พิมพ์} autoFocus rows={2} disabled={กำลังทำ}
          aria-invalid={ว่าง || undefined} aria-describedby={ว่าง ? idคำบอก : undefined}
          onChange={e => setพิมพ์(e.target.value)} style={{ ...ช่องในกล่อง, marginTop: 10 }} />
      )}
      {ใช้รายการ && พิมพ์เอง && (
        <button type="button" disabled={กำลังทำ} onClick={() => { setเลือก(""); setพิมพ์(""); }}
          style={{ background: "none", border: "none", cursor: "pointer", color: "#003366", fontSize: "0.72rem", fontWeight: 700, padding: "6px 0 0" }}>← กลับไปเลือกจากรายการ</button>
      )}
      {/* เหตุผลว่าง = บอกที่ช่องเลยว่าทำไมปุ่มยืนยันกดไม่ได้ (เดิมกดได้แล้วขึ้นตัวแดงเล็กใต้ปุ่ม) */}
      {ว่าง && (
        <div id={idคำบอก} data-reason-hint style={{ marginTop: 5, fontSize: "0.72rem", fontWeight: 600, color: "#b45309" }}>
          {ใช้รายการ && !พิมพ์เอง ? "เลือกเหตุผลก่อน" : "พิมพ์เหตุผลก่อน"} — ปุ่ม “{o.ปุ่มตกลง ?? "ตกลง"}” จึงจะกดได้
        </div>
      )}
      {o.ช่องเพิ่ม && (
        <label style={{ display: "block", marginTop: 10, fontSize: "0.74rem", fontWeight: 700, color: "#4b5563" }}>
          {o.ช่องเพิ่ม.ป้าย}
          <textarea aria-label={o.ช่องเพิ่ม.ป้าย} value={เพิ่ม} rows={2} disabled={กำลังทำ} onChange={e => setเพิ่ม(e.target.value)} style={ช่องในกล่อง} />
        </label>
      )}
      <ข้อผิดพลาดในกล่อง ข้อความ={ผิด} />
      <div className="pms-confirm-actions">
        <button type="button" data-dialog-cancel className="btn btn-secondary btn-sm" disabled={กำลังทำ} onClick={() => ตอบ(false)}>{o.ปุ่มยกเลิก ?? "ยกเลิก"}</button>
        <ปุ่มตกลงของกล่อง o={o} กำลังทำ={กำลังทำ} ปิดไว้={ว่าง} อธิบาย={ว่าง ? idคำบอก : undefined} onClick={() => void กด()} />
      </div>
    </div>
  );
}
/** ถามเหตุผลแล้วทำงานรอฐานในกล่อง — true = ทำสำเร็จ (กล่องปิดแล้ว) · false = ผู้ใช้ยกเลิก */
export function ถามเหตุผล(o: ตัวเลือกถามเหตุผล): Promise<boolean> {
  if (ใบที่ค้าง) { const เก่า = ใบที่ค้าง; ใบที่ค้าง = null; เก่า.ยกเลิก(); toast.dismiss(เก่า.id); }
  return new Promise<boolean>((resolve) => {
    let ตอบแล้ว = false;
    const กำลังทำ = { current: false };
    const ตอบ = (ผล: boolean) => {
      if (ตอบแล้ว) return;
      ตอบแล้ว = true;
      if (ใบที่ค้าง?.id === id) ใบที่ค้าง = null;
      resolve(ผล);
    };
    const id = toast.custom((t) => (
      <ปิดเองถ้ายกเลิกแล้ว t={t} ตอบแล้ว={() => ตอบแล้ว}>
        <กล่องเหตุผล o={o} กำลังทำRef={กำลังทำ} ตอบ={ผล => { ตอบ(ผล); toast.dismiss(t); }} />
      </ปิดเองถ้ายกเลิกแล้ว>
    ), {
      duration: Infinity,
      dismissible: false,        // ปัดทิ้งไม่ได้ — ปิดด้วยปุ่มยกเลิก (ก่อนกด) หรือฐานตอบสำเร็จเท่านั้น
      onDismiss: () => ตอบ(false),
      onAutoClose: () => ตอบ(false),
      className: "pms-confirm-toast",
    });
    ใบที่ค้าง = { id, ยกเลิก: () => ตอบ(false), กำลังทำ };
  });
}

// ── ข้อความแจ้งเตือนของระบบ (แทน alert ของเบราว์เซอร์ · บอสสั่ง 2 ก.ย. 69) ──────────
//
// ต่างจาก ยืนยัน() ตรงที่ "ไม่ต้องได้คำตอบ" — แค่บอกผลแล้วหายไปเอง
// ใช้หน้าตาชุดเดียวกับกล่องยืนยัน จึงเป็นของระบบเราทั้งหมด ไม่ใช่กล่องของ Chrome/Windows
// (กล่องเบราว์เซอร์ขึ้นหัวว่า "benjamin-dealer.vercel.app บอกว่า" · โดเมนไหนก็ขึ้นชื่อโดเมนแบบนี้ ซึ่งอ่านเหมือนเว็บหลอกลวง)
const ขึ้นบรรทัดใหม่ = String.fromCharCode(10);
function แจ้ง(ข้อความ: string, o: { ผิดพลาด?: boolean; วินาที?: number } = {}) {
  const [หัว, ...ที่เหลือ] = ข้อความ.split(ขึ้นบรรทัดใหม่);
  toast.custom(() => (
    <div className="pms-confirm" role="status">
      <div className="pms-confirm-head">
        {o.ผิดพลาด && <AlertTriangle size={16} className="pms-confirm-icon" aria-hidden />}
        <div className="pms-confirm-title">{หัว}</div>
      </div>
      {ที่เหลือ.length > 0 && <div className="pms-confirm-detail">{ที่เหลือ.join(ขึ้นบรรทัดใหม่)}</div>}
    </div>
  ), { duration: (o.วินาที ?? (o.ผิดพลาด ? 7 : 4)) * 1000, className: "pms-confirm-toast" });
}

/** บอกว่า "ทำไม่สำเร็จ / ทำไม่ได้" — ค้างนานกว่าปกติ เพราะผู้ใช้ต้องอ่านเหตุผล */
export function แจ้งพลาด(ข้อความ: string): void { แจ้ง(ข้อความ, { ผิดพลาด: true }); }
/** บอกว่า "ทำสำเร็จแล้ว" */
export function แจ้งสำเร็จ(ข้อความ: string): void { แจ้ง(ข้อความ); }

/** ปิดใบที่ค้างอยู่แล้วตอบว่า "ยกเลิก" — ใช้ตอนออกจากหน้า/เปลี่ยนบริบทกลางคัน */
export function ปิดคำถามที่ค้าง(): void {
  if (!ใบที่ค้าง || ใบที่ค้าง.กำลังทำ.current) return;   // ฐานยังไม่ตอบ = ไม่ปิด (Esc ระหว่างรอ)
  const เก่า = ใบที่ค้าง; ใบที่ค้าง = null;
  เก่า.ยกเลิก(); toast.dismiss(เก่า.id);
}

/** ที่วางกล่องยืนยัน — ครอบไว้ที่ layout ราก จึงใช้ได้ทุกหน้า รวมหน้าที่ยังไม่ล็อกอิน
 *
 *  ⚠️ ต้องอยู่ที่ layout ราก ไม่ใช่ใน (app) — หน้าเข้าสู่ระบบ/รีเซ็ตรหัสผ่านอยู่คนละกลุ่ม
 *     ถ้าวางผิดที่ กดยืนยันในหน้าพวกนั้นจะไม่มีอะไรขึ้นเลย และไม่มีอะไรฟ้อง */
export function ConfirmToaster() {
  // Esc = ยกเลิก (เหมือนกล่องของเบราว์เซอร์เดิม) — sonner ไม่ได้ผูก Esc ให้เอง
  const พร้อม = useRef(false);
  useEffect(() => {
    พร้อม.current = true;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") ปิดคำถามที่ค้าง(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <Toaster
      position="top-center"        // คำถามต้องอยู่ในสายตา ไม่ใช่มุมจอที่มองข้ามได้
      expand
      visibleToasts={1}            // ทีละใบ — ถามซ้อนกันแล้วตอบผิดใบ
      toastOptions={{ unstyled: true, classNames: { toast: "pms-confirm-toast" } }}
    />
  );
}
