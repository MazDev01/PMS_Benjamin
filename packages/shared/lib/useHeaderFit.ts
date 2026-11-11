"use client";
// ── หัวตารางบรรทัดเดียว ไม่ตัดคำ (บอสสั่ง 10 พ.ย. 69 · ต่อจากล็อกความกว้างคอลัมน์) ─────────────────────────────────────
//   หัวตาราง white-space: nowrap ทุกตาราง (globals.css) · ความกว้างคอลัมน์ล็อกไว้ (% ของตาราง) ไม่เปลี่ยน
//   หัวช่องไหนยาวเกินช่อง → ลดขนาดตัวอักษรหัวตาราง "ทั้งแถว" ทีละขั้น (ตัวคูณ --th-scale บน <table>) จนทุกช่องพอดี · ต่ำสุด 0.8
//   ห้ามย่อชื่อ/เปลี่ยนคำ (คลังคำ docs/glossary.md) — ปรับแค่ขนาดตัวอักษร
//   ตัวกลางเดียว (เรียกที่ AppShell): ดูทุก .table-wrap table ใหม่เมื่อหน้าเปลี่ยน/ขนาดจอเปลี่ยน · ข้อทดสอบ tests/scenario/table-header-one-line.spec.ts
import { useEffect } from "react";

export const ขั้นลดหัว = [1, 0.95, 0.9, 0.85, 0.8] as const;

/** หัวช่องไหนล้นช่องไหม (บรรทัดเดียว) */
const หัวล้น = (t: HTMLTableElement) => [...t.querySelectorAll<HTMLElement>("thead th")]
  .some(th => th.offsetParent !== null && (th.textContent ?? "").trim() !== "" && th.scrollWidth > th.clientWidth + 1);

/** ปรับขนาดตัวอักษรหัวตารางทั้งแถวให้ทุกช่องพอดี — คืนตัวคูณที่ใช้ */
export function ปรับหัวตาราง(t: HTMLTableElement): number {
  for (const ขั้น of ขั้นลดหัว) {
    t.style.setProperty("--th-scale", String(ขั้น));
    if (!หัวล้น(t)) { t.dataset.thScale = String(ขั้น); return ขั้น; }
  }
  t.dataset.thScale = String(ขั้นลดหัว[ขั้นลดหัว.length - 1]);
  return ขั้นลดหัว[ขั้นลดหัว.length - 1];
}

export function useHeaderFit() {
  useEffect(() => {
    let รอ = 0;
    const จำ = new WeakMap<HTMLTableElement, string>();
    const ทำ = () => {
      รอ = 0;
      for (const t of document.querySelectorAll<HTMLTableElement>(".table-wrap table")) {
        if (!t.offsetParent) continue;
        // ปรับใหม่เมื่อความกว้างตารางหรือข้อความหัวเปลี่ยน (ไม่ไล่วัดซ้ำทุกการเปลี่ยนในหน้า)
        const คีย์ = `${Math.round(t.getBoundingClientRect().width)}|${[...t.querySelectorAll("thead th")].map(th => th.textContent).join("\u0001")}`;
        if (จำ.get(t) === คีย์) continue;
        ปรับหัวตาราง(t);
        จำ.set(t, คีย์);
      }
    };
    const นัด = () => { if (!รอ) รอ = requestAnimationFrame(ทำ); };
    const ผู้เฝ้า = new MutationObserver(นัด);
    ผู้เฝ้า.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.addEventListener("resize", นัด);
    void document.fonts?.ready.then(() => { for (const t of document.querySelectorAll<HTMLTableElement>(".table-wrap table")) จำ.delete(t); นัด(); });
    นัด();
    return () => { ผู้เฝ้า.disconnect(); window.removeEventListener("resize", นัด); if (รอ) cancelAnimationFrame(รอ); };
  }, []);
}
