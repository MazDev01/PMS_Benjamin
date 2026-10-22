// ─── ลูกค้าเป้าหมายของสาขาที่ยังไม่มีผู้รับผิดชอบ (คำนวณล้วน) ──────────────────────────────────
// เดิมไฟล์นี้คือ "กฎแจ้งเตือน HQ" ของกระดิ่ง (ลูกค้าเป้าหมาย HQ ถึงกำหนด/ไม่ได้ติดต่อ · ใบค่าแฟรนไชส์รอคำตอบ/หมดอายุ)
// 21 ต.ค. 69 (รอบ 4) บอสสั่งให้แจ้งเตือนมาจากตารางกลางที่ฐานที่เดียว (ใบ 0231) — กฎชุดนั้นออกจากกระดิ่งแล้ว ห้ามเติมกลับ
// เหลือเฉพาะตัวกรองที่หน้า /hq/leads ใช้
import { type LeadRules, type LeadRow } from "@pms/shared/lib/mock";
import { APP_NOW } from "@pms/shared/lib/appTime";
import { leadCreatedDate, isLeadOpen } from "@pms/shared/lib/leadMetrics";

/** ลูกค้าเป้าหมายของสาขาที่ยังไม่มีผู้รับผิดชอบ นานเกินเกณฑ์ของ "สาขาเจ้าของลูกค้าเป้าหมาย" — นับจากวันที่สร้าง
 *  ไม่ได้ขึ้นกระดิ่ง HQ แล้ว — ยังใช้เป็นตัวกรองในหน้า /hq/leads */
export function unassignedLeads(leads: LeadRow[], rulesOf: (dealerCode: string | undefined) => LeadRules): LeadRow[] {
  return leads.filter(l => {
    if (l.assigned?.trim()) return false;
    if (!isLeadOpen(l)) return false; // ปิดแล้วไม่ต้องหาคนรับผิดชอบ
    const hours = rulesOf(l.dealerCode).unassignedAlertHours;
    return (APP_NOW.getTime() - leadCreatedDate(l).getTime()) / 3_600_000 > hours;
  });
}
