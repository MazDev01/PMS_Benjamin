"use client";

import type { CSSProperties, ReactNode } from "react";
import { useModalA11y } from "@pms/shared/lib/useModalA11y";

// ── กล่องเนื้อหาของโมดัล (ตัวที่อยู่บนฉากหลัง) ────────────────────────────────────
//
// ทำไมต้องเป็นคอมโพเนนต์ ไม่ใช่แค่ hook:
//   โมดัลส่วนใหญ่ในหน้าเพจถูกเขียนไว้ "ในคอมโพเนนต์เดียวกับทั้งหน้า" แล้วซ่อน/แสดงด้วยเงื่อนไข
//   ถ้าเรียก hook ที่ระดับหน้า มันจะทำงานตั้งแต่หน้าโหลด (ตอนนั้นยังไม่มีโมดัล) แล้วไม่ทำงานอีกเลย
//   ห่อด้วยคอมโพเนนต์นี้แทน — ตัวมันเกิด/ตายพร้อมโมดัลจริง ตัวช่วยจึงทำงานถูกจังหวะ
//
// แทนที่ของเดิมได้ตรง ๆ:  <div onClick={e => e.stopPropagation()} style={S}> … </div>
//                    →  <ModalCard onClose={...} label="…" style={S}> … </ModalCard>
// โครง DOM และสไตล์เหมือนเดิมทุกอย่าง เปลี่ยนแค่พฤติกรรมคีย์บอร์ด:
//   Esc ปิดได้ · Tab วนอยู่ในกล่อง · ปิดแล้วโฟกัสกลับไปที่ปุ่มที่กดเปิด
export function ModalCard({ onClose, label, style, className, children }: {
  onClose: () => void;
  /** ชื่อที่โปรแกรมอ่านหน้าจอจะอ่าน เช่น "ฟอร์มเพิ่มดีลเลอร์" */
  label: string;
  style?: CSSProperties;
  className?: string;
  children: ReactNode;
}) {
  const ref = useModalA11y<HTMLDivElement>(onClose);
  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className={className}
      onClick={e => e.stopPropagation()}
      style={style}
    >
      {children}
    </div>
  );
}
