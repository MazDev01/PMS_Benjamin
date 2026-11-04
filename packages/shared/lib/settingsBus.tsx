"use client";

// ── Shared settings save-bus ──────────────────────────────────────────────────
// ใช้ร่วมกันระหว่างหน้าตั้งค่า (HQ/Dealer) กับหน้าที่ถูก "ฝัง" เป็นแท็บ (เช่น HQCompanyPage)
// แต่ละแท็บ/หน้า report {dirty,save,reset} → ปุ่มบันทึก/รีเซ็ตกลางบนหัวทำงานกับแท็บที่ active
// (แยกไฟล์เพื่อกัน circular import ระหว่าง settings ↔ หน้าที่ถูกฝัง)
import { createContext, useContext, useEffect } from "react";

// save คืน false = ไม่ได้บันทึก (ช่องบังคับขาด · แท็บแสดงกรอบแดง/ข้อความใต้ช่องเอง) — ปุ่มกลางต้องไม่ขึ้น "บันทึกแล้ว" (4 พ.ย. 69)
export type SectionApi = { dirty: boolean; save: () => void | boolean | Promise<void>; reset: () => void };

export const SettingsBusCtx = createContext<{ report: (a: SectionApi | null) => void; toast: (m: string) => void }>({
  report: () => {},
  toast: () => {},
});

// หน้า/แท็บที่มีฟอร์มเรียกอันนี้เพื่อรายงานสถานะให้ปุ่มกลาง (cleanup = report null เมื่อ unmount)
export function useReportSection(api: SectionApi) {
  const { report } = useContext(SettingsBusCtx);
  useEffect(() => { report(api); return () => report(null); }, [api, report]);
}

export function useSettingsToast() { return useContext(SettingsBusCtx).toast; }
