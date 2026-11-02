"use client";

// ── กรอบโฟกัสเฉพาะตอนใช้คีย์บอร์ด (บอสสั่ง 2 พ.ย. 69 รอบบ่าย: "ตอนคลิกไม่แสดง แต่ตอนกด Tab ให้แสดง") ──
//
// ทำไมใช้ :focus-visible อย่างเดียวไม่พอ: เบราว์เซอร์ถือว่า "คลิกช่องกรอกข้อความ" เป็นโฟกัสที่ควรเห็นกรอบ
//   (ช่องค้นหา/ช่องกรอกเข้า :focus-visible ทั้งตอนคลิกและตอน Tab) → คลิกช่องค้นหาแล้วกรอบยังขึ้น ขัดคำสั่ง
// ตัวนี้จดว่าผู้ใช้กำลังใช้อะไรอยู่: กด Tab = ใส่คลาส kbd-nav ที่ <html> · กดเมาส์/แตะจอ = เอาคลาสออก
//   globals.css วาดกรอบเฉพาะใต้ html.kbd-nav (ดู "กรอบโฟกัสตอนใช้คีย์บอร์ด")
// วางที่ layout รากของทั้งสองแอป (ไม่ใช้สคริปต์ฝังในหน้า — กันชนนโยบายความปลอดภัยของหน้า)

import { useEffect } from "react";

export const คลาสคีย์บอร์ด = "kbd-nav";

export function KeyboardFocusMode() {
  useEffect(() => {
    const root = document.documentElement;
    const กดปุ่ม = (e: KeyboardEvent) => { if (e.key === "Tab") root.classList.add(คลาสคีย์บอร์ด); };
    const กดเมาส์ = () => root.classList.remove(คลาสคีย์บอร์ด);
    window.addEventListener("keydown", กดปุ่ม, true);
    window.addEventListener("pointerdown", กดเมาส์, true);
    return () => {
      window.removeEventListener("keydown", กดปุ่ม, true);
      window.removeEventListener("pointerdown", กดเมาส์, true);
    };
  }, []);
  return null;
}
