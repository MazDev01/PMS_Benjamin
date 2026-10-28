"use client";

// ── ปุ่มที่ต้องรอฐาน (บอสสั่ง 28 ต.ค. 69 · กดแล้วดูเหมือนไม่เกิดอะไร) ───────────────────────────────────────────
//   กดแล้วปุ่มขึ้น "กำลัง…" และกดซ้ำไม่ได้จนงานจบ — แบบเดียวกับปุ่มยืนยันในกล่องเหตุผล (ConfirmToast)
//   กันกดรัวด้วย ref (state ยังไม่ทันเปลี่ยนตอนคลิกครั้งที่สองในเฟรมเดียวกัน)
//   งานโยน error = ปุ่มกลับมากดได้ · ผู้เรียกจัดการข้อความผิดพลาดเอง (ไม่กลืนเงียบ: ไม่จับ = แจ้งด้วยข้อความกลาง)
import { useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { friendlyError } from "@pms/shared/lib/friendlyError";
import { แจ้งพลาด } from "@pms/shared/components/ui/ConfirmToast";

export function ปุ่มรอฐาน({ ทำ, กำลังทำ: ข้อความกำลังทำ = "กำลังบันทึก…", children, disabled, style, ...rest }:
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "children"> & {
    /** งานที่ต้องรอฐาน */
    ทำ: () => Promise<unknown> | unknown;
    /** ข้อความบนปุ่มระหว่างรอ เช่น "กำลังส่ง…" */
    กำลังทำ?: string;
    children: ReactNode;
  }) {
  const [รอ, setรอ] = useState(false);
  const กดอยู่ = useRef(false);
  async function กด() {
    if (กดอยู่.current) return;
    กดอยู่.current = true; setรอ(true);
    try { await ทำ(); }
    catch (e) { แจ้งพลาด(friendlyError(e)); }
    finally { กดอยู่.current = false; setรอ(false); }
  }
  return (
    <button type="button" {...rest} data-busy-button disabled={disabled || รอ} aria-busy={รอ || undefined}
      style={รอ ? { ...style, opacity: 0.6, cursor: "progress" } : style}
      onClick={() => void กด()}>
      {รอ ? ข้อความกำลังทำ : children}
    </button>
  );
}
