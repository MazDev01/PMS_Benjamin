"use client";

import { useState, useEffect, type Dispatch, type SetStateAction } from "react";

// state ที่ persist ลง localStorage จริง (SSR-safe) — โหลดค่าที่บันทึกไว้ตอน mount, บันทึกทุกครั้งที่เปลี่ยน
// ใช้แทน useState สำหรับข้อมูลที่ต้อง "ไม่หายเมื่อ refresh" (เช่น จัดการสาขา/ผู้ใช้/สินค้า HQ)
//
// hydrated เป็น state ไม่ใช่ ref — จงใจ:
//   ถ้าใช้ ref, พอ effect โหลดค่าตั้ง hydrated.current = true เสร็จ effect เขียนที่รันต่อใน commit เดียวกัน
//   จะเห็น state เป็น "ค่าเริ่มต้น" (closure เก่า) แล้วเขียนทับค่าที่เพิ่งโหลดมาทันที
//   พอ React รัน effect ซ้ำ (dev/StrictMode) รอบสองจะอ่านค่าที่ถูกทับไปแล้ว → ค่าที่ผู้ใช้บันทึกไว้หายถาวร
//   (เจอจริงตอนทดสอบ: ตั้งกฎ 1000 วัน → เปิดหน้าตั้งค่าใหม่ → เด้งกลับเป็น 7)
//   ใช้ state แทน: commit แรก hydrated = false จึงยังไม่เขียน · เขียนรอบแรกเกิดหลังค่าที่โหลดถูก commit แล้ว
const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

// เติมฟิลด์ที่ "ค่าที่บันทึกไว้" ไม่มี ด้วยค่าเริ่มต้น — จำเป็น เพราะ blob ใน localStorage ของผู้ใช้
// ถูกบันทึกไว้ตั้งแต่ก่อนโค้ดจะเพิ่มฟิลด์ใหม่ ถ้าเอามาใช้ทั้งก้อนดิบ ๆ ฟิลด์ใหม่จะเป็น undefined
// → <input value={undefined}> กลายเป็น uncontrolled (React เตือน + ช่องนั้นแก้ไม่ติด) และเลขที่หายไปทำให้คำนวณเพี้ยน
// (เจอจริง: เพิ่ม leadIdleDays/lostRateMinClosed ใน HQNotifRules แต่คีย์ hq_notif_rules_v2 เดิมยังอยู่ในเครื่องผู้ใช้)
// recursive เฉพาะ object ธรรมดา · array ทับทั้งก้อน (เช่น รายชื่อดีลเลอร์ — ลบแถวแล้วต้องลบจริง ไม่ใช่โผล่กลับมา)
export function withDefaults<T>(initial: T, stored: unknown): T {
  if (!isPlainObject(initial) || !isPlainObject(stored)) return (stored === undefined ? initial : stored) as T;
  const out: Record<string, unknown> = { ...initial };
  for (const k of Object.keys(stored)) {
    out[k] = k in initial ? withDefaults((initial as Record<string, unknown>)[k], stored[k]) : stored[k];
  }
  return out as T;
}

export function usePersistentState<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState<T>(initial);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try { const s = localStorage.getItem(key); if (s) setState(withDefaults(initial, JSON.parse(s))); } catch {}
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!hydrated) return; // อย่าเพิ่งเขียนทับด้วยค่า default ก่อนโหลดเสร็จ
    try { localStorage.setItem(key, JSON.stringify(state)); } catch {}
  }, [key, state, hydrated]);

  return [state, setState];
}
