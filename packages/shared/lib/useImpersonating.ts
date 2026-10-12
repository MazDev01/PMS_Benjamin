"use client";

// ─── "กำลังเข้าระบบแทนดีลเลอร์โดยสำนักงานใหญ่" — สถานะร่วมของทั้งแอปดีลเลอร์ ────────
//
// สำนักงานใหญ่กดปุ่ม "เข้าระบบ" ที่หน้า /hq/dealers แล้วเปิดแท็บใหม่มาที่แอปดีลเลอร์
// (ดู /api/admin/dealers/impersonate → หน้า /impersonate ของแอปดีลเลอร์)
// แท็บนั้นต้องมี "ทางกลับ" ที่ชัดเจน ไม่ใช่ปล่อยให้ผู้ดูแลงงว่าจะออกยังไง
//
// ⚠️ เก็บที่ sessionStorage ของแท็บนั้นเท่านั้น (ไม่ใช่ localStorage) โดยตั้งใจ:
//    ใบผ่านเข้าระบบอยู่ที่ localStorage ซึ่งใช้ร่วมกันทุกแท็บ แต่ "กำลังสวมสิทธิ์อยู่"
//    เป็นเรื่องของหน้าต่างที่เปิดมาเท่านั้น ไม่ควรลามไปแท็บอื่นของเครื่องเดียวกัน
//
// แยกออกมาเป็นไฟล์กลาง (20 ส.ค. 69) เพราะตอนนี้มีสองที่ที่ต้องรู้สถานะนี้:
//   แถบเตือนด้านบน (AppShell) และแถบเมนูข้าง (Sidebar — เปลี่ยนปุ่มออกจากระบบเป็น "กลับสู่ HQ")
import { useEffect, useState } from "react";

export const IMPERSONATING_KEY = "pms_impersonating";

/** แท็บนี้เปิดมาจากการที่สำนักงานใหญ่กด "เข้าระบบแทนดีลเลอร์" หรือเปล่า
 *
 *  ตัวบอกมาทาง ?impersonated=1 ครั้งเดียวตอนเข้ามา — จำไว้ใน sessionStorage ต่อ
 *  แล้วลบพารามิเตอร์ทิ้งจากแถบที่อยู่ เพื่อให้สถานะอยู่ต่อแม้เปลี่ยนหน้าไปมา
 *  และผู้ใช้ไม่เห็น URL รกโดยไม่จำเป็น */
export function useImpersonating(): boolean {
  const [active, setActive] = useState(false);
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get("impersonated") === "1") {
        sessionStorage.setItem(IMPERSONATING_KEY, "1");
        url.searchParams.delete("impersonated");
        window.history.replaceState({}, "", url.pathname + url.search + url.hash);
      }
      setActive(sessionStorage.getItem(IMPERSONATING_KEY) === "1");
    } catch { /* sessionStorage ไม่พร้อม (โหมดส่วนตัว/ปิด storage) — ถือว่าไม่ได้สวมสิทธิ์ */ }
  }, []);
  return active;
}

/** เลิกสวมสิทธิ์ — ออกจากบัญชีดีลเลอร์ในแท็บนี้ แล้วปิดแท็บกลับไปที่ HQ
 *
 *  ต้องออกจากระบบด้วยเสมอ ไม่ใช่แค่ปิดแท็บ: ใบผ่านของดีลเลอร์อยู่ที่ localStorage
 *  ถ้าไม่ล้าง ใครเปิดแอปดีลเลอร์บนเครื่องนี้ต่อจะกลายเป็น "ล็อกอินเป็นดีลเลอร์รายนั้น" ค้างไว้
 *
 *  แท็บนี้ถูกเปิดด้วย window.open() จาก HQ เสมอ จึงปิดตัวเองได้
 *  เบราว์เซอร์บางตัวไม่ยอมให้ปิด → ไปหน้าเข้าสู่ระบบแทน จะได้ไม่ค้างอยู่หน้าที่ไม่มีสิทธิ์แล้ว */
export function clearImpersonation(logout: () => void): void {
  try { sessionStorage.removeItem(IMPERSONATING_KEY); } catch { /* ปิด storage ไว้ — ข้ามได้ */ }
  logout();
  window.close();
  setTimeout(() => { if (!window.closed) window.location.href = "/login"; }, 300);
}
