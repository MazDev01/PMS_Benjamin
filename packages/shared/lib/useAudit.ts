"use client";

// ─── Audit Log ของ HQ — บันทึกจริงว่า "ใครทำอะไร เมื่อไร" ──────────────────────
// HQ มีผู้ใช้หลายคน → ทุก action สำคัญของ admin ถูกบันทึกไว้ (local: localStorage · supabase: DB)
// บันทึกผ่าน useAuditLogger() ในจุด mutation · ดูผ่านหน้า /hq/audit (useAuditEntries)
//
// ไฟล์นี้เหลือเฉพาะ React hook ที่คุยกับ repository — ส่วนอ่าน/เขียน localStorage ย้ายไป auditStore.ts
// เพราะ LocalAdapter (ชั้นข้อมูล) ต้องใช้ส่วนนั้น แล้วเกิดวงจร import ย้อนกลับมาที่ไฟล์นี้
// (ดูเหตุผลเต็มใน auditStore.ts · พบจากผลตรวจสอบระบบ 5 ส.ค. 69)
import { useCallback, useEffect, useState } from "react";
import { logRepoRead } from "./repoLog";
import { useRole } from "@pms/shared/context/RoleContext";
import { audit as auditRepo } from "@pms/shared/lib/data";
import { AUDIT_EVENT } from "@pms/shared/lib/auditStore";
import type { AuditEntry } from "@pms/shared/lib/data/types";

// re-export ให้โค้ดเดิมที่ import ชนิด/ฟังก์ชันจากไฟล์นี้ยังใช้ได้เหมือนเดิม
export type { AuditEntry } from "@pms/shared/lib/data/types";
export { loadAudit, appendAudit, AUDIT_EVENT } from "@pms/shared/lib/auditStore";

// เพดานอ่าน audit_log (M8) — ตารางนี้ append-only โตไม่จำกัด · หน้า /hq/audit แจ้งเมื่อชนเพดาน (ไม่ตัดเงียบ)
export const AUDIT_READ_CAP = 5000;

// hook สำหรับ "บันทึก" — ใช้ชื่อ/บทบาทของผู้ใช้ปัจจุบันจาก session อัตโนมัติ · เขียนผ่าน repository
// (local: appendAudit เดิม · supabase: insert DB) แล้วยิง event ให้หน้า/กระดิ่งอัปเดตทันที
export function useAuditLogger() {
  const { session, role } = useRole();
  return useCallback((action: string, target: string) => {
    auditRepo.append({ user: session.name, role, action, target })
      .then(() => { try { window.dispatchEvent(new Event(AUDIT_EVENT)); } catch {} })
      .catch((e) => console.error("[audit.append]", e));
  }, [session.name, role]);
}

// hook สำหรับ "ดู" — โหลดล่าสุดสูงสุด limit รายการผ่าน repository + ฟังอัปเดตแบบเรียลไทม์
// default = AUDIT_READ_CAP · กระดิ่ง/แดชบอร์ดที่ต้องการแค่ล่าสุดไม่กี่รายการก็ถูกจำกัดตามไปด้วย (M8)
//
// ── เรียกเฉพาะฝั่งสำนักงานใหญ่เท่านั้น ──────────────────────────────────────────
// บันทึกการใช้งานเป็นของสำนักงานใหญ่ล้วน ๆ ดีลเลอร์ไม่มีสิทธิ์เห็นสักแถว
// แต่แถบด้านบน (Topbar) ใช้ร่วมกันทั้งสองแอป และเรียก hook นี้โดยไม่เช็กบทบาท
// → แอปดีลเลอร์ยิงขอ 200 แถวทุกครั้งที่เปิดหน้า แล้วได้กลับมา 0 แถวเสมอ
//
// ไม่ใช่แค่เสียเปล่า แต่ "แพงมาก" เพราะฐานข้อมูลต้องไล่ดูทุกแถวเพื่อจะพบว่าไม่มีสิทธิ์เห็นเลย
//   วัดจริง 7 ส.ค. 69 (ตาราง 8,954 แถว): ดีลเลอร์ 2,196 ms ได้ 0 แถว · สำนักงานใหญ่ 264 ms ได้ 200 แถว
//   ดีลเลอร์ 10 รายเปิดพร้อมกัน → ฐานข้อมูลยกเลิกคำสั่งทิ้ง (statement timeout) ตอบ 500
//   ผู้ใช้เห็นหน้าจอแจ้งเตือนพังจริง และจะยิ่งแย่ลงเมื่อตารางโตขึ้น
//
// เป็นคู่แฝดของบั๊กที่แก้ไปแล้วเมื่อ 6 ส.ค. 69 — ตอนนั้นแก้ฝั่ง "เขียน" (ดีลเลอร์บันทึกไม่ได้แล้วขึ้น 403 รัว)
// แต่ฝั่ง "อ่าน" ตกหล่นไป · กันไว้ในตัว hook เลย ไม่ใช่ที่จุดเรียก จะได้ครอบทุกจุดทั้งตอนนี้และที่เพิ่มทีหลัง
export function useAuditEntries(limit: number = AUDIT_READ_CAP): AuditEntry[] {
  const { isHQ } = useRole();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  useEffect(() => {
    if (!isHQ) { setEntries([]); return; }
    const read = () => { auditRepo.list(limit).then(setEntries).catch((e) => logRepoRead("audit.list", e)); };
    read();
    window.addEventListener(AUDIT_EVENT, read);
    window.addEventListener("storage", read);
    return () => { window.removeEventListener(AUDIT_EVENT, read); window.removeEventListener("storage", read); };
  }, [limit, isHQ]);
  return entries;
}
