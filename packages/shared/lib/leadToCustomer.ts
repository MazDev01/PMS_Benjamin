// ── ลูกค้าเป้าหมาย → ลูกค้า: ข้อมูลที่ต้องไหลตามไปด้วย ──────────────────────────
//
// บอสแจ้ง (19 ส.ค. 69): "ลูกค้าเป้าหมายจะกลายเป็นลูกค้า ตอนกลายเป็นลูกค้าต้องดึงข้อมูล
//   มาจากลูกค้าเป้าหมาย ตอนกรอกข้อมูลต้องกรอกให้ครบ"
// แยกออกมาจาก SalesContext เป็นฟังก์ชันบริสุทธิ์ เพราะเดิมฝังอยู่ใน useCallback
// ทดสอบไม่ได้เลย — ฟิลด์ที่ลืมส่งต่อจึงหลุดไปได้เงียบ ๆ (ที่อยู่หายมาแล้วจริง)
import type { LeadRow, CustomerRow } from "./mock";
import { มูลค่าลีด } from "@pms/shared/lib/mock";   // มูลค่าลีด = ยอดใบเสนอราคาล่าสุด (ใบ 0223)

// สีประจำตัวลูกค้า (วนตามเลขที่ลูกค้าเป้าหมาย) — ใช้ทำวงกลมอักษรย่อบนหน้าจอ
export const CUSTOMER_PALETTE = ["#003366","#059669","#f59e0b","#dc2626","#002244","#8fa3b8","#2D2D2D","#C0C0C0"];

/** อักษรย่อ 2 ตัวสำหรับวงกลมประจำลูกค้า — ตัดคำนำหน้าองค์กรออกก่อน (บจ./หจก. ไม่ได้บอกอะไร) */
export function deriveInitials(name: string): string {
  return name.replace(/บจ\.|หจก\./g, "").trim().slice(0, 2) || "—";
}

/** ข้อมูลลูกค้าที่สร้างจากลูกค้าเป้าหมาย — ใช้ตอนปิดการขายสำเร็จ/ผูกลูกค้าให้ใบเสนอราคา
 *
 *  ⚠️ ทุกฟิลด์ที่ "ลูกค้าเป้าหมายกรอกได้" ต้องไหลมาที่นี่ให้ครบ — เซลส์กรอกครั้งเดียวตอนเปิดลูกค้าเป้าหมาย
 *     แล้วต้องไม่ต้องมากรอกซ้ำอีกตอนเป็นลูกค้า (ดู leadToCustomer.test.ts ที่ล็อกไว้ทีละช่อง)
 *  ใช้เฉพาะตอนต้อง "สร้างลูกค้าใหม่จริง" เท่านั้น — ถ้าเจอลูกค้าเดิม (id/ชื่อตรง) DB จะไม่แตะข้อมูลเดิมเลย
 */
export function customerPayloadFromLead(lead: LeadRow, opts: { joinDate: string; defaultDealerCode: string }): CustomerRow {
  return {
    id: 0, // ไม่ใช้ค่านี้ — DB เป็นคนออก id จริงให้ (หรือคืนลูกค้าเดิมถ้าชื่อตรงเป๊ะ)
    name: lead.contact || lead.company,
    company: lead.company,
    email: lead.email ?? "",
    phone: lead.phone ?? "",
    address: lead.address,          // ที่อยู่ที่กรอกไว้ตอนเป็นลูกค้าเป้าหมาย (ไม่มี = undefined ห้ามใส่ค่าว่าง)
    province: lead.province,
    category: "", // ไม่สืบแม่แบบของลูกค้าเป้าหมายมาเป็นหมวดลูกค้า — เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69
    status: "active",
    projects: 0,
    joinDate: opts.joinDate,        // วันสมัคร = วันนี้ของระบบ (supabase=จริง / local=ตรึง)
    owner: lead.assigned,
    initials: deriveInitials(lead.company || lead.name),
    color: CUSTOMER_PALETTE[(lead.numId ?? 0) % CUSTOMER_PALETTE.length],
    totalValue: มูลค่าลีด(lead) ?? 0,   // ยอดใบเสนอราคาล่าสุด (ใบ 0223) — ไม่ใช้ช่องประเมินราคาที่เลิกใช้แล้ว
    logo: lead.logo,                // รูป/โลโก้ที่อัปโหลดไว้ตอนเป็นลูกค้าเป้าหมาย
    dealerCode: lead.dealerCode ?? opts.defaultDealerCode, // ลูกค้าเป็นของสาขาเดียวกับลูกค้าเป้าหมาย (multi-tenant)
  };
}
