// ─── ที่เก็บ Audit Log ฝั่ง localStorage (โหมด local เท่านั้น) ─────────────────────
//
// ทำไมต้องแยกไฟล์ออกจาก useAudit.ts:
//   LocalAdapter (ชั้นข้อมูล) ต้องใช้ loadAudit — แต่ useAudit.ts ยังมี React hook
//   ที่ import ชั้นข้อมูลกลับเข้าไปด้วย (auditRepo) จึงเกิดวงจร import จริงตอนรัน:
//     data/index.ts → LocalAdapter.ts → useAudit.ts → data/index.ts
//   (พบจากผลตรวจสอบระบบ 5 ส.ค. 69 · madge ยืนยัน 2 วงจร)
//   วงจรแบบนี้ทำให้ค่าที่ import เป็น undefined ตอนโมดูลถูกโหลดในลำดับที่ไม่คาดคิด
//
//   ไฟล์นี้เก็บเฉพาะ "การอ่าน/เขียน localStorage" ล้วน ๆ ไม่ import ชั้นข้อมูลเลย
//   → LocalAdapter ใช้ไฟล์นี้ได้โดยไม่สร้างวงจร · useAudit.ts เหลือแต่ hook ที่คุยกับ repository
import type { AuditEntry } from "@pms/shared/lib/data/types";

// v2: SEED เดิม (v1) มีรายการของฟีเจอร์ที่ถูกลบแล้ว ("ตั้งเพดานส่วนลด") + คำเก่า ("ระงับดีลเลอร์")
// loadAudit อ่าน localStorage ก่อน SEED → เบราว์เซอร์เก่าจะเห็นของค้างตลอดแม้ SEED ในโค้ดสะอาดแล้ว
// ขึ้นเวอร์ชันคีย์ + ลบคีย์เก่าทิ้ง เพื่อบังคับ re-seed จาก SEED ปัจจุบัน (กติกา version-key ของทั้งระบบ)
const KEY = "hq_audit_log_v2";
const KEY_OLD = ["hq_audit_log_v1"];

/** event ที่ยิงเมื่อบันทึกเปลี่ยน — หน้า/กระดิ่งฟังตัวนี้เพื่ออัปเดตทันที */
export const AUDIT_EVENT = "bpms-audit-updated";

// ไม่มีชุดตั้งต้น (SEED) แล้ว — เดิมมีรายการบันทึกตรวจสอบสมมติ 4 รายการ (ชื่อคน/เหตุการณ์/วันที่)
// ที่แสดงเหมือนของจริง = ขัดกติกา "ห้ามกุข้อมูล" (M3) · ยังไม่มี action จริง = โชว์สถานะว่าง
export function loadAudit(): AuditEntry[] {
  if (typeof window === "undefined") return [];
  try { KEY_OLD.forEach(k => localStorage.removeItem(k)); } catch {} // ล้าง seed เก่าที่มีของฟีเจอร์ที่ลบแล้ว
  try { const s = localStorage.getItem(KEY); if (s) return JSON.parse(s) as AuditEntry[]; } catch {}
  return [];
}

// ไม่มีฟังก์ชันเขียนแล้ว (ใบ 0240 · บอสสั่ง 22 ต.ค. 69) — บันทึกการใช้งานเกิดจากฐานข้อมูลเท่านั้น
//   โหมดตัวอย่างไม่มีฐาน จึงอ่านได้อย่างเดียว (กติกาเดียวกับแจ้งเตือน: ไม่ประกอบเองในหน้าเว็บ)
