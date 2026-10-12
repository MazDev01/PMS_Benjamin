"use client";

// ─── จำว่า "อ่านการแจ้งเตือนไหนไปแล้ว" ข้ามการรีเฟรชหน้า ────────────────────────────
//
// ปัญหาที่แก้ (ผู้ใช้แจ้ง 14 ส.ค. 69 · เกิดทั้งฝั่งสำนักงานใหญ่และฝั่งดีลเลอร์):
//   กด "อ่านทั้งหมด" ที่กระดิ่งแล้วจุดแดงหาย แต่พอรีเฟรชหน้า ทุกอย่างกลับมาเป็นยังไม่อ่านเหมือนเดิม
//   เพราะสถานะอ่านแล้วเก็บไว้ในหน่วยความจำของหน้าเว็บอย่างเดียว โหลดหน้าใหม่ก็หายไปพร้อมกัน
//
// ทำไมเก็บด้วย "กุญแจข้อความ" ไม่ใช่เลขลำดับ:
//   การแจ้งเตือนฝั่งดีลเลอร์ใช้เลขไล่ลำดับตอนสร้างรายการ (1, 2, 3, …) ซึ่งเลื่อนได้ทุกครั้งที่มีของใหม่เข้ามา
//   เก็บเลขไว้แล้วพรุ่งนี้เลขนั้นอาจไปตกที่การแจ้งเตือนคนละอัน = ทำเครื่องหมายอ่านผิดตัว
//   จึงเก็บเป็นกุญแจที่ผูกกับ "เนื้อหา" ของการแจ้งเตือนนั้นจริง ๆ (ดู notifKey ใน Topbar)
//
// ขอบเขต: จำต่อเบราว์เซอร์ที่ใช้ (ไม่ข้ามเครื่อง) — พอสำหรับปัญหาที่เจอ และไม่ต้องแตะฐานข้อมูล
//   แยกกุญแจตามบัญชีที่ล็อกอิน เพื่อไม่ให้สลับบัญชีแล้วเห็นสถานะของอีกคน
import { useCallback, useEffect, useState } from "react";

/** เก็บได้สูงสุดกี่รายการ — กันไม่ให้โตไม่จำกัดจนกินพื้นที่เบราว์เซอร์ (เก็บของใหม่ ทิ้งของเก่าสุด) */
const MAX_KEPT = 500;

const storageKey = (scope: string) => `pms_read_notifs_${scope || "guest"}`;

function โหลด(scope: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey(scope));
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter(x => typeof x === "string") : [];
  } catch { return []; }
}

function บันทึก(scope: string, keys: string[]) {
  try { localStorage.setItem(storageKey(scope), JSON.stringify(keys.slice(-MAX_KEPT))); } catch { /* เต็ม/ถูกปิด — ข้าม */ }
}

/**
 * @param scope ตัวแยกบัญชี เช่น "hq" หรือรหัสสาขา — สลับบัญชีแล้วต้องไม่ใช้สถานะร่วมกัน
 */
export function useReadNotifications(scope: string) {
  const [read, setRead] = useState<Set<string>>(new Set());

  // อ่านค่าที่เคยบันทึกไว้ตอนเปิดหน้า (และเมื่อสลับบัญชี)
  useEffect(() => { setRead(new Set(โหลด(scope))); }, [scope]);

  // อีกแท็บกดอ่านแล้ว แท็บนี้ต้องตามด้วย
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === storageKey(scope)) setRead(new Set(โหลด(scope)));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [scope]);

  const markRead = useCallback((keys: string[]) => {
    setRead(prev => {
      const next = new Set(prev);
      keys.forEach(k => next.add(k));
      บันทึก(scope, [...next]);
      return next;
    });
  }, [scope]);

  const isRead = useCallback((key: string) => read.has(key), [read]);

  return { isRead, markRead };
}
