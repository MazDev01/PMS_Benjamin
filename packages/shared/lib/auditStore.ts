// ─── ที่เก็บ Audit Log ฝั่ง localStorage (โหมด local เท่านั้น) ─────────────────────
//
// ทำไมต้องแยกไฟล์ออกจาก useAudit.ts:
//   LocalAdapter (ชั้นข้อมูล) ต้องใช้ loadAudit/appendAudit — แต่ useAudit.ts ยังมี React hook
//   ที่ import ชั้นข้อมูลกลับเข้าไปด้วย (auditRepo) จึงเกิดวงจร import จริงตอนรัน:
//     data/index.ts → LocalAdapter.ts → useAudit.ts → data/index.ts
//   (พบจากผลตรวจสอบระบบ 5 ส.ค. 69 · madge ยืนยัน 2 วงจร)
//   วงจรแบบนี้ทำให้ค่าที่ import เป็น undefined ตอนโมดูลถูกโหลดในลำดับที่ไม่คาดคิด
//
//   ไฟล์นี้เก็บเฉพาะ "การอ่าน/เขียน localStorage" ล้วน ๆ ไม่ import ชั้นข้อมูลเลย
//   → LocalAdapter ใช้ไฟล์นี้ได้โดยไม่สร้างวงจร · useAudit.ts เหลือแต่ hook ที่คุยกับ repository
import { APP_NOW } from "@pms/shared/context/FilterContext";
import type { AuditEntry } from "@pms/shared/lib/data/types";
import { ชั่วโมงนาทีไทย } from "./thaiDate";

// v2: SEED เดิม (v1) มีรายการของฟีเจอร์ที่ถูกลบแล้ว ("ตั้งเพดานส่วนลด") + คำเก่า ("ระงับดีลเลอร์")
// loadAudit อ่าน localStorage ก่อน SEED → เบราว์เซอร์เก่าจะเห็นของค้างตลอดแม้ SEED ในโค้ดสะอาดแล้ว
// ขึ้นเวอร์ชันคีย์ + ลบคีย์เก่าทิ้ง เพื่อบังคับ re-seed จาก SEED ปัจจุบัน (กติกา version-key ของทั้งระบบ)
const KEY = "hq_audit_log_v2";
const KEY_OLD = ["hq_audit_log_v1"];
const MAX = 300;
const TH_MO = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

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

// ประทับ "วันนี้" ของระบบ (APP_NOW = 30 มิ.ย. 2569) ไม่ใช่นาฬิกาเครื่อง — กติกาเดียวกับทั้งระบบ
// เดิมใช้ new Date() → รายการที่เพิ่งบันทึกได้วันจริง (เช่น 17 ก.ค.) ซึ่งอยู่นอกช่วงตัวกรองเวลาของ /hq/audit
// (ช่วงกว้างสุดจบที่ 30 มิ.ย. 2569) → HQ ทำอะไรไปก็ไม่เห็นในบันทึกของตัวเอง
// เวลา (ชม.:นาที) ยังใช้นาฬิกาจริงได้ — ใช้เรียงลำดับเหตุการณ์ในวันเดียวกัน ไม่มีผลกับตัวกรองวันที่
function stampNow(): string {
  return `${APP_NOW.getDate()} ${TH_MO[APP_NOW.getMonth()]} ${APP_NOW.getFullYear() + 543} · ${ชั่วโมงนาทีไทย()}`;
}

export function appendAudit(e: { user: string; role: string; action: string; target: string }) {
  if (typeof window === "undefined") return;
  const list = loadAudit();
  const id = (list.reduce((m, x) => Math.max(m, x.id), 0)) + 1;
  const next = [{ id, at: stampNow(), ...e }, ...list].slice(0, MAX);
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
  try { window.dispatchEvent(new Event(AUDIT_EVENT)); } catch {}
}
