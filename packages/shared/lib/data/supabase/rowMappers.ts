// ── ตัวแปลงแถว DB ↔ type ของแอป — "บริสุทธิ์" ล้วน ไม่แตะ network/session ──────────
//
// แยกออกมาจาก SupabaseAdapter (ระยะ 1 ของแผนแยก backend) เพราะฝั่งเซิร์ฟเวอร์ต้องใช้ตัวเดียวกันเป๊ะ
// SupabaseAdapter เป็น "use client" ทั้งไฟล์ ดึงไปใช้ที่ route handler ไม่ได้
// ⚠️ ห้ามคัดลอกไปไว้อีกที่ — สองชุดที่ต้องตรงกันตลอดไป สุดท้ายจะไม่ตรงกัน
import { toCamel, toSnake } from "./mappers";
import type { LeadRow, QuotationMock, CustomerRow, AppointmentMock, DealerRow } from "../types";

type Row = Record<string, unknown>;

// คอลัมน์ text ของ leads/quotations/appointments ส่วนใหญ่ "nullable" ที่ DB (0001_schema.sql)
// แต่ type ของแอป (LeadRow/QuotationMock/AppointmentMock) บังคับ string เสมอ (ไม่ optional)
// แถวเก่า/import ไม่ครบที่มี NULL จริง ๆ จะได้ null ทะลุมาถึงแอป ทั้งที่ TS เชื่อว่าเป็น string
// → พังเงียบตอนเรียก .trim()/.toUpperCase()/render ที่ไหนก็ได้ (ไม่ error ชัดตรงจุดที่อ่านมา)
// str() กันไว้ตรงจุดอ่านครั้งเดียว ไม่ต้อง guard ซ้ำทั่วแอป
export const str = (v: unknown): string => v == null ? "" : String(v);

// customers/dealers เช่นกัน — คอลัมน์ text nullable ที่ DB แต่ type บังคับ string (เหตุผลเดียวกับ str() ข้างบน)
export function normalizeCustomer(c: CustomerRow): CustomerRow {
  return { ...c, name: str(c.name), company: str(c.company), email: str(c.email), phone: str(c.phone),
    province: str(c.province), category: str(c.category), joinDate: str(c.joinDate),
    owner: str(c.owner), initials: str(c.initials), color: str(c.color) };
}
export function normalizeDealer(d: DealerRow): DealerRow {
  return { ...d, province: str(d.province), region: str(d.region) };
}

// ── leads: LeadRow ↔ DB (มี field เฉพาะที่ต้องแปลงพิเศษ) ──
//   • createdAt (สตริงวันที่ไทย) → คอลัมน์ created_label · ห้ามชน created_at (timestamptz เวลาจริงของ DB)
//   • area: แอปเป็น number · DB เป็น text → แปลงไป-กลับ
export function leadToRow(l: LeadRow): Row {
  const r = toSnake(l as unknown as Row);
  if ("created_at" in r) { r.created_label = r.created_at; delete r.created_at; }
  if (r.area != null) r.area = String(r.area);
  return r;
}
// แก้แถวลีดทั้งแถว (leadToUpdateRow) ถูกเอาออก 15 ต.ค. 69 — แก้ลูกค้าเป้าหมายด้วยส่วนต่างผ่าน lead_apply เท่านั้น (lib/leadIntent.ts · ใบ 0211)
export function rowToLead(row: Row): LeadRow {
  const l = toCamel<Record<string, unknown>>(row);
  if (typeof l.createdLabel === "string") l.createdAt = l.createdLabel; // แสดงผลด้วยสตริงไทยจากแอป
  delete l.createdLabel;
  if (typeof l.area === "string" && l.area !== "") l.area = Number(l.area);
  else if (l.area === "" || l.area === null) delete l.area;
  l.name = str(l.name); l.company = str(l.company); l.contact = str(l.contact);
  l.province = str(l.province); l.product = str(l.product); l.category = str(l.category);
  l.value = str(l.value); l.assigned = str(l.assigned);
  return l as unknown as LeadRow;
}

// ── quotations: QuotationMock ↔ DB — area number↔text (คอลัมน์ area เป็น text) ──
export function quoteToRow(q: QuotationMock): Row {
  const r = toSnake(q as unknown as Row);
  delete r.product_line; // คอลัมน์ generated (0041) — เขียนไม่ได้ · เผลอส่งไป Postgres จะปฏิเสธทั้งคำสั่ง
  // ประวัติการต่อรองราคา (0148) ฐานข้อมูลดูแลเอง — ส่งสำเนาจากหน้าจอกลับไปจะทับของจริง
  // (หน้าจอที่เปิดค้างไว้นาน ๆ ถือประวัติเวอร์ชันเก่า พอกดบันทึกก็ลบรอบที่คนอื่นเพิ่งบันทึกทิ้ง)
  delete r.price_history;
  // savedAt เป็นค่าที่อ่านมาจาก created_at ของฐานข้อมูล — ไม่มีคอลัมน์นี้จริง ส่งไปจะถูกปฏิเสธทั้งคำสั่ง
  delete r.saved_at;
  if (r.area != null) r.area = String(r.area);
  // customer_id: แอปใช้ 0 = "ยังไม่มีลูกค้า" (ออกใบให้ลูกค้าเป้าหมาย) → เก็บเป็น NULL ที่ DB (M6)
  // เพื่อให้ใส่ FK (dealer_code, customer_id) → customers ได้ · 0 ไม่ใช่ id ลูกค้าจริง (เริ่มที่ 1)
  if (!r.customer_id) r.customer_id = null;
  return r;
}
export function rowToQuote(row: Row): QuotationMock {
  const q = toCamel<Record<string, unknown>>(row);
  if (typeof q.area === "string" && q.area !== "") q.area = Number(q.area);
  else if (q.area === "" || q.area === null) q.area = 0;
  // NULL จาก DB → 0 ที่แอปคาดหวัง (ตรรกะฝั่งแอปยังใช้ 0 เหมือนเดิม ไม่ต้องแก้ทั้งแอป)
  if (q.customerId == null) q.customerId = 0;
  q.customer = str(q.customer); q.project = str(q.project); q.total = str(q.total);
  q.province = str(q.province); q.buildingType = str(q.buildingType); q.date = str(q.date);
  // เวลาที่ฐานข้อมูลบันทึกแถวนี้ — ใช้ทำกราฟรายชั่วโมง (คนละความหมายกับ date = วันปิดการขาย)
  if (row.created_at) q.savedAt = String(row.created_at);
  return q as unknown as QuotationMock;
}

// ── appointments: AppointmentMock ↔ DB — area number↔text (คอลัมน์ area เป็น text) ──
export function apptToRow(a: AppointmentMock): Row {
  const r = toSnake(a as unknown as Row);
  if (r.area != null) r.area = String(r.area);
  return r;
}
export function rowToAppt(row: Row): AppointmentMock {
  const a = toCamel<Record<string, unknown>>(row);
  if (typeof a.area === "string" && a.area !== "") a.area = Number(a.area);
  else if (a.area === "" || a.area === null) a.area = 0;
  a.company = str(a.company); a.contact = str(a.contact); a.project = str(a.project);
  a.buildingType = str(a.buildingType); a.province = str(a.province);
  a.date = str(a.date); a.time = str(a.time); a.assigned = str(a.assigned); a.note = str(a.note);
  return a as unknown as AppointmentMock;
}
