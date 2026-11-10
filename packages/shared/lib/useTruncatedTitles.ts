"use client";
// ── ชี้ที่ข้อความในตารางที่ถูกตัดด้วย … แล้วเห็นข้อความเต็ม (บอสสั่ง 10 พ.ย. 69 · ล็อกความกว้างคอลัมน์ทุกตาราง) ─────────────
//   ตัวกลางเดียวทุกตาราง (เรียกที่ AppShell): ชี้เมาส์ในช่องของ .table-wrap → ไล่จากตัวที่ชี้ขึ้นไปถึงช่อง (td/th)
//   ตัวแรกที่ข้อความล้น (scrollWidth > clientWidth) และยังไม่มี title → ใส่ title = ข้อความเต็ม (ช่องที่ตั้ง title เองอยู่แล้วไม่แตะ)
//   ข้อทดสอบ: tests/scenario/table-columns-locked.spec.ts
import { useEffect } from "react";

export function ข้อความเต็มของตัวที่ล้น(เริ่ม: Element | null): HTMLElement | null {
  let el = เริ่ม as HTMLElement | null;
  while (el && el instanceof HTMLElement) {
    if (el.scrollWidth > el.clientWidth + 1) return el;
    if (el.matches("td, th") || el.matches(".table-wrap")) break;
    el = el.parentElement;
  }
  return null;
}

export function useTruncatedTitles() {
  useEffect(() => {
    function onOver(e: MouseEvent) {
      const t = e.target as Element | null;
      if (!t || !(t instanceof Element) || !t.closest(".table-wrap td, .table-wrap th")) return;
      const el = ข้อความเต็มของตัวที่ล้น(t);
      if (!el || el.hasAttribute("title")) return;
      const ข้อความ = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
      if (ข้อความ) el.setAttribute("title", ข้อความ);
    }
    document.addEventListener("mouseover", onOver);
    return () => document.removeEventListener("mouseover", onOver);
  }, []);
}
