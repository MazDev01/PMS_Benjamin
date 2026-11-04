"use client";

// ── ป้ายช่อง + การตรวจช่องบังคับ: ตัวกลางตัวเดียวของทุกฟอร์ม (บอสสั่ง 4 พ.ย. 69 · ตรรกะ lib/requiredFields.ts) ─────────────────
//   <FieldLabel required> = ชื่อช่อง + * สีแดง (data-required) · <FieldError> = ข้อความใต้ช่อง (สีแดง)
//   useช่องบังคับ(): กดบันทึก → ตรวจ → ขาด = กรอบแดง (data-invalid · aria-invalid) + ข้อความใต้ช่อง + เลื่อน/โฟกัสช่องแรกที่ขาด
//   ช่องที่ผูก: ใส่ {...ผูก("คีย์")} ที่ input/select/textarea (ref + aria-invalid + data-field) · แก้ช่องแล้วข้อความของช่องนั้นหายเอง
import { useCallback, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ตรวจช่องบังคับ, สรุปช่องที่ขาด, type ช่องบังคับ, type ผลตรวจช่อง } from "@pms/shared/lib/requiredFields";

export const สีบังคับ = "#dc2626";
export const กรอบผิด: CSSProperties = { borderColor: สีบังคับ, boxShadow: `0 0 0 1px ${สีบังคับ}` };

export function FieldLabel({ children, required, htmlFor, className = "form-label", style }: {
  children: ReactNode; required?: boolean; htmlFor?: string; className?: string; style?: CSSProperties;
}) {
  return (
    <label className={className} htmlFor={htmlFor} style={style}>
      {children}
      {required && <span data-required aria-hidden="true" style={{ color: สีบังคับ, fontWeight: 800, marginLeft: 3 }}>*</span>}
    </label>
  );
}

/** * แดงอย่างเดียว — หัวคอลัมน์ของตารางที่กรอกในช่อง (ไม่มีป้ายต่อช่อง) · หน้าตาเดียวกับ <FieldLabel required> */
export const ดาวบังคับ = () => <span data-required aria-hidden="true" style={{ color: สีบังคับ, fontWeight: 800, marginLeft: 3 }}>*</span>;

export function FieldError({ children, id }: { children?: ReactNode; id?: string }) {
  if (!children) return null;
  return <div role="alert" id={id} data-field-error style={{ marginTop: 4, fontSize: "0.72rem", fontWeight: 600, color: สีบังคับ }}>{children}</div>;
}

type องค์ประกอบช่อง = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLElement;
export function useช่องบังคับ() {
  const [ผิด, setผิด] = useState<ผลตรวจช่อง>({});
  const ref = useRef(new Map<string, องค์ประกอบช่อง | null>());
  /** ตรวจทั้งชุด — ผ่าน = true · ขาด = แสดงกรอบแดง/ข้อความ + เลื่อนไปช่องแรกที่ขาด คืน false */
  const ตรวจ = useCallback((ช่อง: ช่องบังคับ[]): boolean => {
    const ผล = ตรวจช่องบังคับ(ช่อง);
    setผิด(ผล);
    const แรก = ช่อง.find(c => ผล[c.key]);
    if (แรก) {
      const el = ref.current.get(แรก.key);
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
      (el as HTMLElement | null)?.focus?.({ preventScroll: true });
      return false;
    }
    return true;
  }, []);
  /** ตั้งข้อความผิดของช่องเอง (ตัวตรวจอื่น เช่น "ไม่ก่อนวันที่เสนอ" · ฐานตอบกลับ) */
  const ตั้งผิด = useCallback((key: string, ข้อความ: string | null) => setผิด(p => {
    const n = { ...p }; if (ข้อความ) n[key] = ข้อความ; else delete n[key]; return n;
  }), []);
  /** ผูกกับช่อง: ref สำหรับเลื่อนไป + กรอบแดงเมื่อผิด · แก้ค่าแล้วล้างข้อความของช่องนั้น (เรียก ล้าง(key) ใน onChange) */
  const ผูก = useCallback((key: string) => ({
    ref: (el: องค์ประกอบช่อง | null) => { ref.current.set(key, el); },
    "data-field": key,
    "aria-invalid": ผิด[key] ? true : undefined,
    "data-invalid": ผิด[key] ? "1" : undefined,
    style: ผิด[key] ? กรอบผิด : undefined,
  }), [ผิด]);
  const ล้าง = useCallback((key: string) => setผิด(p => (p[key] ? (({ [key]: _ทิ้ง, ...rest }) => rest)(p) : p)), []);
  /** ล้างข้อความผิดทุกช่อง (เปิดฟอร์มใหม่/สลับรายการ) */
  const ล้างทั้งหมด = useCallback(() => setผิด({}), []);
  return { ผิด, ตรวจ, ตั้งผิด, ผูก, ล้าง, ล้างทั้งหมด, สรุป: (ช่อง: ช่องบังคับ[]) => สรุปช่องที่ขาด(ช่อง, ผิด) };
}
