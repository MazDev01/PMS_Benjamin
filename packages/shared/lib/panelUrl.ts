"use client";
// ── แผง/หน้าต่างอยู่ในที่อยู่หน้าเว็บ (บอสสั่ง 11 พ.ย. 69 · งานลิงก์) ──────────────────────────────────────────────
//   ทุกหน้าที่เปิดแผง/หน้าต่างของแถว เก็บเรื่องที่เปิดไว้ใน ?open=… (ไม่ล้างออกแล้ว — เดิม replaceState ล้างทิ้ง)
//   · เปิดแผงจากแถว/ปิดแผง = แทนที่อยู่เดิม (ไม่เพิ่มประวัติ) · กดลิงก์ไปเรื่องอื่น = เพิ่มประวัติ 1 ชั้น
//   · ปุ่มย้อนกลับของเบราว์เซอร์ = ถอยทีละชั้น ได้แผงก่อนหน้าคืน (หน้าเดียวกัน: popstate · คนละหน้า: หน้าเดิมอ่าน ?open ตอนเปิด)
//   · บนจอมีแผงเดียว (ลิงก์ = ไปหน้าของเรื่องนั้นแล้วเปิดแผง/หน้าต่าง ไม่ซ้อนสองแผง)
// ตัวลิงก์กลาง: components/ui/RecordLink.tsx · ข้อทดสอบ: tests/scenario/record-links.spec.ts
import { useEffect, useRef } from "react";

const ชื่อเหตุการณ์ = "bpms:open-record";

/** แก้ ?open (และ ?tab) ของที่อยู่ปัจจุบัน — ค่าว่าง = เอาออก · "push" = เพิ่มประวัติ (ย้อนกลับได้) · "replace" = แทนที่ */
export function ตั้งแผงในURL(ค่า: string | null, แบบ: "push" | "replace" = "replace", แท็บ?: string | null) {
  if (typeof window === "undefined") return;
  const u = new URL(window.location.href);
  const เดิม = u.searchParams.get("open");
  if (ค่า == null || ค่า === "") u.searchParams.delete("open"); else u.searchParams.set("open", ค่า);
  if (แท็บ !== undefined) { if (แท็บ) u.searchParams.set("tab", แท็บ); else u.searchParams.delete("tab"); }
  else if (เดิม !== (ค่า || null)) u.searchParams.delete("tab");
  const ใหม่ = u.pathname + u.search + u.hash;
  if (ใหม่ === window.location.pathname + window.location.search + window.location.hash) return;
  if (แบบ === "push") window.history.pushState(window.history.state, "", ใหม่);
  else window.history.replaceState(window.history.state, "", ใหม่);
}

/** ไปที่อยู่ของเรื่อง (ลิงก์กลาง) — หน้าเดียวกัน = เพิ่มประวัติแล้วแจ้งหน้าให้เปิด · คนละหน้า = ให้ผู้เรียกใช้ router.push */
export function ไปเรื่องในหน้าเดียวกัน(href: string): boolean {
  if (typeof window === "undefined") return false;
  const ปลาย = new URL(href, window.location.href);
  if (ปลาย.pathname !== window.location.pathname) return false;
  window.history.pushState(window.history.state, "", ปลาย.pathname + ปลาย.search);
  window.dispatchEvent(new CustomEvent(ชื่อเหตุการณ์, { detail: ปลาย.pathname + ปลาย.search }));
  return true;
}

/** ที่อยู่ตามแผงที่เปิดอยู่ — หน้าที่เปิด/ปิดแผงหลายที่ (กดแถว · ปุ่มปิด · Esc) ส่งรหัสของแผงที่เปิด (null = ไม่มีแผง)
 *  ครั้งแรกไม่แตะที่อยู่ (ยังไม่ได้อ่าน ?open ตอนเปิดหน้า) · เปลี่ยนภายหลัง = แทนที่ ?open */
export function useแผงในURL(ค่า: string | null) {
  const ครั้งแรก = useRef(true);
  useEffect(() => {
    if (ครั้งแรก.current) { ครั้งแรก.current = false; return; }
    ตั้งแผงในURL(ค่า);
  }, [ค่า]);
}

/** หน้าเปิดแผงตาม ?open — เรียกตอนเปิดหน้า · ย้อนกลับ/ไปหน้า (popstate) · ลิงก์กลาง/ค้นหาบนแถบบนในหน้าเดียวกัน (bpms:open-record)
 *  เปิด(ค่า, พารามิเตอร์) — ค่า null = ที่อยู่ไม่มี ?open แล้ว (ย้อนกลับมาชั้นที่ไม่มีแผง) → ผู้เรียกปิดแผง */
export function useเปิดตามURL(path: string, เปิด: (ค่า: string | null, พารามิเตอร์: URLSearchParams) => void, พร้อม = true) {
  const ตัวเปิด = useRef(เปิด);
  ตัวเปิด.current = เปิด;
  // ข้อมูลของหน้ายังไม่มา (เช่น รายการลูกค้าเป้าหมายจากบริบท) = รอ แล้วค่อยเปิดตามที่อยู่ — กัน "ไม่พบ" เท็จตอนรีเฟรชหน้าที่มี ?open
  useEffect(() => {
    if (!พร้อม) return;
    const p = new URLSearchParams(window.location.search);
    if (p.get("open")) ตัวเปิด.current(p.get("open"), p);
  }, [พร้อม]);
  useEffect(() => {
    const จากที่อยู่ = (search: string) => { const p = new URLSearchParams(search); ตัวเปิด.current(p.get("open"), p); };
    const onPop = () => { if (window.location.pathname === path) จากที่อยู่(window.location.search); };
    const onOpen = (e: Event) => {
      const href = String((e as CustomEvent).detail ?? "");
      const i = href.indexOf("?");
      if ((i < 0 ? href : href.slice(0, i)) === path && i >= 0) จากที่อยู่(href.slice(i));
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener(ชื่อเหตุการณ์, onOpen);
    return () => { window.removeEventListener("popstate", onPop); window.removeEventListener(ชื่อเหตุการณ์, onOpen); };
  }, [path]);
}
