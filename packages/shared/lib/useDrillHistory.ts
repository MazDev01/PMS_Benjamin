"use client";
// ── ระดับเจาะลึกในประวัติเบราว์เซอร์ (บอสสั่ง 5 พ.ย. 69) — ปุ่มย้อนกลับของเบราว์เซอร์ถอยทีละ 1 ระดับ ─────────────────────────
//   ใช้ร่วมทุกหน้าที่มีแถบระดับ ทั้งเครือ › ภาค › จังหวัด › ดีลเลอร์: ภาพรวมยอดขาย (/hq/pipeline) · หัวเจาะลึก 3 หน้า (DrillEngine)
//   เปลี่ยนระดับ (กดชิป · เจาะแถว · เลือกตัวกรองระดับ) = เพิ่มรายการประวัติ 1 รายการ (URL เดิม · เก็บระดับใน history.state)
//   เปลี่ยนแท็บมิติในระดับเดียวกัน = ไม่เพิ่มประวัติ (ไม่ใช่การเปลี่ยนระดับ)
//   ย้อนกลับ = คืนระดับของรายการก่อนหน้า · รายการแรกของหน้า (ไม่มีระดับในประวัติ) = ระดับตั้งต้นของหน้า
//   Next 15 รองรับ window.history.pushState ตรง (คัดลอกสถานะภายในของ Next ให้เอง) — ไม่ต้องผ่าน router
import { useEffect, useRef } from "react";

export type ระดับเจาะ = { ภาค: string | null; จังหวัด: string | null; ดีลเลอร์: string | null };
const คีย์ประวัติ = "pmsDrill";
const ลายเซ็น = (r: ระดับเจาะ) => JSON.stringify([r.ภาค ?? null, r.จังหวัด ?? null, r.ดีลเลอร์ ?? null]);

/** ผูกระดับที่ดูอยู่กับประวัติเบราว์เซอร์ · ไป = ตั้งระดับตามประวัติ (หน้าเลือกมิติ/แท็บตั้งต้นของระดับนั้นเอง) */
export function useประวัติระดับ(ระดับ: ระดับเจาะ, ไป: (r: ระดับเจาะ) => void) {
  const ล่าสุด = useRef<string | null>(null);
  const ตั้งต้น = useRef<ระดับเจาะ | null>(null);
  const ไปRef = useRef(ไป);
  ไปRef.current = ไป;
  const ลาย = ลายเซ็น(ระดับ);
  useEffect(() => {
    if (ล่าสุด.current === null) {   // ครั้งแรก: จดระดับตั้งต้นของหน้า ไม่เพิ่มประวัติ
      ล่าสุด.current = ลาย; ตั้งต้น.current = { ...ระดับ };
      return;
    }
    if (ลาย === ล่าสุด.current) return;   // ระดับเดิม (ย้อนกลับมาเอง หรือเปลี่ยนแค่แท็บ)
    ล่าสุด.current = ลาย;
    window.history.pushState({ ...(window.history.state ?? {}), [คีย์ประวัติ]: { ...ระดับ } }, "");
  }, [ลาย]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const ย้อน = (e: PopStateEvent) => {
      const r: ระดับเจาะ | undefined = e.state?.[คีย์ประวัติ] ?? ตั้งต้น.current ?? undefined;
      if (!r) return;
      ล่าสุด.current = ลายเซ็น(r);   // ตั้งก่อน → effect ข้างบนไม่เพิ่มประวัติซ้ำ
      ไปRef.current(r);
    };
    window.addEventListener("popstate", ย้อน);
    return () => window.removeEventListener("popstate", ย้อน);
  }, []);
}
