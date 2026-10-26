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
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Toaster, toast } from "sonner";
import { AlertTriangle } from "lucide-react";

export type ตัวเลือกยืนยัน = {
  หัวข้อ: string;
  /** บรรทัดอธิบายผลของการกดตกลง — เขียนให้ผู้ใช้ตัดสินใจได้โดยไม่ต้องเดา */
  รายละเอียด?: string;
  /** ข้อความบนปุ่มตกลง — ตั้งให้เป็น "คำกริยาของงานนั้น" อ่านแล้วรู้ว่ากดแล้วเกิดอะไร */
  ปุ่มตกลง?: string;
  ปุ่มยกเลิก?: string;
  /** งานที่ย้อนกลับไม่ได้ (ลบ/ปิดการขาย/คืนค่าเริ่มต้น) — ปุ่มตกลงเป็นสีเตือน + มีไอคอน */
  อันตราย?: boolean;
};

/** ใบที่ค้างอยู่ตอนนี้ — ถามใบใหม่ต้องปิดใบเก่าและตอบว่า "ยกเลิก" ให้ผู้เรียกเดิมก่อนเสมอ
 *  (ไม่งั้นผู้เรียกเดิมจะรอ Promise ที่ไม่มีวันตอบ — งานค้างแบบไม่มีใครเห็น) */
let ใบที่ค้าง: { id: string | number; ยกเลิก: () => void } | null = null;

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
    const ตอบ = (ผล: boolean) => {
      if (ตอบแล้ว) return;      // กดรัว/กดแล้วปัดทิ้ง = คำตอบแรกเท่านั้นที่นับ
      ตอบแล้ว = true;
      if (ใบที่ค้าง?.id === id) ใบที่ค้าง = null;
      resolve(ผล);
    };

    const id = toast.custom((t) => (
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
      onDismiss: () => ตอบ(false),
      onAutoClose: () => ตอบ(false),   // ไม่ควรเกิด (Infinity) แต่ถ้าเกิดต้องไม่ค้าง
      className: "pms-confirm-toast",
    });

    ใบที่ค้าง = { id, ยกเลิก: () => ตอบ(false) };
  });
}

// ── ถามเหตุผล: กล่องยืนยันที่ต้องกรอกเหตุผลก่อนกดตกลง (ด่าน 4 · ปฏิเสธใบค่าแฟรนไชส์ต้องมีเหตุผล) ───────────
//   กติกาเดียวกับ ยืนยัน(): ทีละใบ · ปัดทิ้ง/Esc = ยกเลิก (คืน null) · ไม่หายเอง
//   เหตุผลว่าง/มีแต่ช่องว่าง = กดตกลงไม่ได้ (ฐานข้อมูลก็ปฏิเสธซ้ำอีกชั้น)
function กล่องเหตุผล({ o, ตอบ }: { o: ตัวเลือกยืนยัน & { ป้ายช่อง: string }; ตอบ: (ผล: string | null) => void }) {
  const [ค่า, setค่า] = useState("");
  const ว่าง = ค่า.trim() === "";
  return (
    <div className="pms-confirm" role="alertdialog" aria-modal="false" aria-label={o.หัวข้อ}>
      <div className="pms-confirm-head">
        {o.อันตราย && <AlertTriangle size={16} className="pms-confirm-icon" aria-hidden />}
        <div className="pms-confirm-title">{o.หัวข้อ}</div>
      </div>
      {o.รายละเอียด && <div className="pms-confirm-detail">{o.รายละเอียด}</div>}
      <textarea aria-label={o.ป้ายช่อง} placeholder={o.ป้ายช่อง} value={ค่า} autoFocus rows={2}
        onChange={e => setค่า(e.target.value)}
        style={{ width: "100%", marginTop: 8, padding: "6px 8px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: "0.82rem", fontFamily: "inherit", resize: "vertical" }} />
      <div className="pms-confirm-actions">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => ตอบ(null)}>{o.ปุ่มยกเลิก ?? "ยกเลิก"}</button>
        <button type="button" disabled={ว่าง}
          className={`btn btn-sm ${o.อันตราย ? "pms-confirm-danger" : "btn-primary"}`}
          onClick={() => ตอบ(ค่า.trim())}>
          {o.ปุ่มตกลง ?? "ตกลง"}
        </button>
      </div>
    </div>
  );
}
/** ถามเหตุผลแบบ "ต้องได้คำตอบ" — คืนเหตุผล (ตัดช่องว่างหัวท้ายแล้ว) · ยกเลิก/ปัดทิ้ง = null */
export function ถามเหตุผล(o: ตัวเลือกยืนยัน & { ป้ายช่อง: string }): Promise<string | null> {
  if (ใบที่ค้าง) { const เก่า = ใบที่ค้าง; ใบที่ค้าง = null; เก่า.ยกเลิก(); toast.dismiss(เก่า.id); }
  return new Promise<string | null>((resolve) => {
    let ตอบแล้ว = false;
    const ตอบ = (ผล: string | null) => {
      if (ตอบแล้ว) return;
      ตอบแล้ว = true;
      if (ใบที่ค้าง?.id === id) ใบที่ค้าง = null;
      resolve(ผล);
    };
    const id = toast.custom((t) => (
      <ปิดเองถ้ายกเลิกแล้ว t={t} ตอบแล้ว={() => ตอบแล้ว}>
        <กล่องเหตุผล o={o} ตอบ={ผล => { ตอบ(ผล); toast.dismiss(t); }} />
      </ปิดเองถ้ายกเลิกแล้ว>
    ), {
      duration: Infinity,
      onDismiss: () => ตอบ(null),
      onAutoClose: () => ตอบ(null),
      className: "pms-confirm-toast",
    });
    ใบที่ค้าง = { id, ยกเลิก: () => ตอบ(null) };
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
  if (!ใบที่ค้าง) return;
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
