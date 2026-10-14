// ── ตัวชี้วัดของลูกค้าเป้าหมาย (pure functions) — แหล่งเดียว ใช้ร่วมกันทั้งหน้าลูกค้าเป้าหมายและแดชบอร์ด ──
// ไม่มี state / ไม่มี UI — คำนวณล้วน · "วันนี้" ยึด APP_NOW (supabase=จริง / local=ตรึง 30 มิ.ย. 2569)
import { buildLeadTasks, taskProgress, type LeadRow } from "@pms/shared/lib/mock";
import { APP_NOW } from "@pms/shared/lib/appTime";

// ความสดของลูกค้าเป้าหมาย / ช่วงเดือนกราฟ / YTD — เดินตาม "วันนี้ของระบบ" แหล่งเดียว (เลิกตรึงในโหมด supabase)
export const MOCK_TODAY = APP_NOW;

// ── มูลค่า ──
export function parseValue(v: string): number {
  const n = parseFloat(String(v).replace(/[฿,\s]/g, ""));
  if (!isFinite(n)) return 0;
  if (/T/i.test(v)) return n * 1e12;
  if (/B/i.test(v)) return n * 1e9;
  if (/M/i.test(v)) return n * 1e6;
  if (/K/i.test(v)) return n * 1e3;
  return n;
}

// ── วันที่ไทย ("22 มิ.ย. 2569") → Date (พ.ศ. − 543) ──
const TH_MONTH: Record<string, number> = {
  "ม.ค.": 0, "ก.พ.": 1, "มี.ค.": 2, "เม.ย.": 3, "พ.ค.": 4, "มิ.ย.": 5,
  "ก.ค.": 6, "ส.ค.": 7, "ก.ย.": 8, "ต.ค.": 9, "พ.ย.": 10, "ธ.ค.": 11,
};
export function parseThaiDate(s?: string): Date | null {
  if (!s) return null;
  const m = /^(\d{1,2})\s+(\S+)\s+(\d{4})/.exec(s.trim());
  if (!m || !(m[2] in TH_MONTH)) return null;
  const y = +m[3] > 2500 ? +m[3] - 543 : +m[3];
  return new Date(y, TH_MONTH[m[2]], +m[1]);
}

// วันที่สร้างลูกค้าเป้าหมาย — ลูกค้าเป้าหมาย seed ส่วนใหญ่ไม่มี createdAt → ใช้วันที่คงที่ (deterministic) จาก numId
// กระจายภายใน ~150 วันล่าสุด เพื่อให้กราฟ/ไทม์ไลน์มีข้อมูลจริง ไม่แบนที่ 0
export function leadCreatedDate(l: LeadRow): Date {
  const d = parseThaiDate(l.createdAt);
  if (d) return d;
  const x = new Date(MOCK_TODAY);
  x.setDate(x.getDate() - ((l.numId * 17) % 150));
  return x;
}

/** วันที่ลูกค้าเป้าหมายเข้ามา (created_label/created_date ที่ฐานข้อมูล) — ไม่มีวัน = null
 *  ⚠️ ห้ามใช้ leadCreatedDate() แทน: มันสังเคราะห์วันจาก numId เมื่อไม่มีวันจริง */
export function leadEntryDate(l: LeadRow): Date | null {
  return parseThaiDate(l.createdAt);
}

/** ลูกค้าเป้าหมายอยู่ในช่วงเวลาที่เลือกไหม — นับตาม "วันที่ลูกค้าเข้ามา" (บอสเลือก 15 ก.ย. 69)
 *  เกณฑ์เดียวกับ RPC lead_summary / leads_page ของสำนักงานใหญ่: ไม่มีวันเข้ามา = นับรวม
 *  เดิมฝั่งสาขานับตามวันติดต่อล่าสุด → เว็บจริงขึ้น 187 (สาขา) vs 155 (HQ) ในช่วงเดียวกัน */
export function leadEnteredInRange(l: LeadRow, start: Date, end: Date): boolean {
  const d = leadEntryDate(l);
  if (!d) return true;
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const s = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
  const e = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();
  return day >= s && day <= e;
}

// วันที่ติดต่อล่าสุดของลูกค้าเป้าหมาย (จากกิจกรรม · ไม่มีกิจกรรม → ใช้วันที่สร้าง)
/** วันติดต่อล่าสุดของลูกค้าเป้าหมาย
 *  อ่านจาก lastContactAt ก่อน — ฐานข้อมูลคำนวณไว้ให้แล้วทุกครั้งที่บันทึก (trigger 0046)
 *  ทำให้ตารางไม่ต้องขนไทม์ไลน์ทั้งก้อนมาคำนวณเอง (ลดขนาดข้อมูลที่ส่งลงมาก)
 *  ถ้าไม่มี (โหมดข้อมูลในเครื่อง/ข้อมูลเก่า) ค่อยคิดจากไทม์ไลน์เหมือนเดิม */
export function leadLatestDate(l: LeadRow): Date | null {
  if (l.lastContactAt) {
    const d = new Date(l.lastContactAt + (l.lastContactAt.length === 10 ? "T00:00:00" : ""));
    if (!isNaN(d.getTime())) return d;
  }
  const dates = (l.activities ?? []).map(a => parseThaiDate(a.date)).filter(Boolean) as Date[];
  if (!dates.length) return null;
  return new Date(Math.max(...dates.map(d => d.getTime())));
}
const THAI_MO = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
/** ข้อความ "ติดต่อล่าสุด" สำหรับแสดงบนตาราง (วันที่ไทย) */
export function lastContactLabel(l: LeadRow): string {
  const d = leadLatestDate(l);
  if (d) return `${d.getDate()} ${THAI_MO[d.getMonth()]} ${d.getFullYear() + 543}`;
  return l.createdAt ?? "—";
}

// ── ลูกค้าเป้าหมายที่ต้องรีบติดตาม (ขาดการติดต่อเกิน N วัน) — กฎธุรกิจเดียวที่มี (ไม่มี SLA) ──
export function daysSinceContact(l: LeadRow): number | null {
  const d = leadLatestDate(l) ?? parseThaiDate(l.createdAt);
  if (!d) return null;
  return Math.floor((MOCK_TODAY.getTime() - d.getTime()) / 86400000);
}
export function isLeadOpen(l: LeadRow): boolean { return l.status !== "PAID" && l.status !== "CANCELLED"; }
export function needsFollowUp(l: LeadRow, threshold = 7): boolean {
  if (!isLeadOpen(l)) return false; // ปิดแล้วไม่ต้องตาม
  // รอราคา HQ = ลูกบอลอยู่ที่สำนักงานใหญ่ ไม่เตือนดีลเลอร์ว่านิ่ง (FLOW.html ขั้น 4–6 · ฐานข้อมูลนับแบบเดียวกัน ใบ 0198)
  if (l.status === "HQ_PRICING") return false;
  const days = daysSinceContact(l);
  return days !== null && days > threshold;
}

// ฟีเจอร์ "ความสำคัญ" ถูกลบทั้งหมด (บอสสั่ง 18 ส.ค. 69)
// เดิมระบบคิดเองจากมูลค่าแล้วติดป้ายให้ — ตั้งเอง/ปิดไม่ได้ จึงเอาออกทั้งชุด ไม่ทิ้งโค้ดตายไว้

// ── ความคืบหน้า (%) — จากงานมาตรฐาน 7 ข้อเท่านั้น (ห้ามลาก slider) ──
export function leadProgress(l: LeadRow): number {
  if (l.status === "PAID") return 100;
  if (l.status === "CANCELLED") return 0;
  return taskProgress(l.tasks?.length ? l.tasks : buildLeadTasks());
}
