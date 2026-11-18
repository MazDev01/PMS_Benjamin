// ─── ลูกค้าเป้าหมายของสาขาที่ยังไม่มีผู้รับผิดชอบ (คำนวณล้วน) ──────────────────────────────────
// เดิมไฟล์นี้คือ "กฎแจ้งเตือน HQ" ของกระดิ่ง (ลูกค้าเป้าหมาย HQ ถึงกำหนด/ไม่ได้ติดต่อ · ใบค่าแฟรนไชส์รอคำตอบ/หมดอายุ)
// 21 ต.ค. 69 (รอบ 4) บอสสั่งให้แจ้งเตือนมาจากตารางกลางที่ฐานที่เดียว (ใบ 0231) — กฎชุดนั้นออกจากกระดิ่งแล้ว ห้ามเติมกลับ
// เหลือเฉพาะตัวกรองที่หน้า /hq/leads ใช้
import { type LeadRules, type LeadRow } from "@pms/shared/lib/mock";
import { APP_NOW } from "@pms/shared/lib/appTime";
import { leadEntryDate, isLeadOpen } from "@pms/shared/lib/leadMetrics";

/** ลูกค้าเป้าหมายของสาขาที่ยังไม่มีผู้รับผิดชอบ นานเกินเกณฑ์ของ "สาขาเจ้าของลูกค้าเป้าหมาย" — นับจากวันที่สร้าง
 *  ไม่ได้ขึ้นกระดิ่ง HQ แล้ว — ยังใช้เป็นตัวกรองในหน้า /hq/leads */
/** แถวจากฐาน (leads_page) — กติกาเดียวกับการ์ดที่ฐานคิด (unassigned_leads) ตัวต่อตัว: ยังเปิดอยู่ · ไม่มีผู้รับผิดชอบ ·
 *  วันเข้า created_date (YYYY-MM-DD จากฐาน · ไม่มี = ไม่นับ) · (วันนี้ − วันเข้า) × 24 > เกณฑ์ชั่วโมงของสาขาเจ้าของ
 *  ใช้กับรายชื่อที่เปิดจากการ์ด "ยังไม่มีผู้รับผิดชอบ" (บอสสั่ง 18 พ.ย. 69) — จำนวนแถวต้องเท่าตัวเลขบนการ์ด */
export function ไม่มีผู้รับผิดชอบเกินเกณฑ์ตามฐาน(l: LeadRow & { createdDate?: string | null }, ชั่วโมง: (dealerCode: string | undefined) => number, วันนี้ISO: string): boolean {
  if (l.assigned?.trim() || !isLeadOpen(l)) return false;
  const วัน = /^\d{4}-\d{2}-\d{2}/.exec(String(l.createdDate ?? ""))?.[0];
  if (!วัน) return false;
  const ห่าง = (Date.parse(`${วันนี้ISO.slice(0, 10)}T00:00:00Z`) - Date.parse(`${วัน}T00:00:00Z`)) / 86_400_000;
  return ห่าง * 24 > ชั่วโมง(l.dealerCode);
}

export function unassignedLeads(leads: LeadRow[], rulesOf: (dealerCode: string | undefined) => LeadRules): LeadRow[] {
  return leads.filter(l => {
    if (l.assigned?.trim()) return false;
    if (!isLeadOpen(l)) return false; // ปิดแล้วไม่ต้องหาคนรับผิดชอบ
    const hours = rulesOf(l.dealerCode).unassignedAlertHours;
    // ไม่มีวันเข้าจริง = ไม่รู้อายุ → ไม่นับว่าเกินเกณฑ์ (13 พ.ย. 69 · เดิมใช้วันสังเคราะห์จาก numId = กุข้อมูล)
    const d = leadEntryDate(l);
    if (!d) return false;
    return (APP_NOW.getTime() - d.getTime()) / 3_600_000 > hours;
  });
}
