// จับคู่ "ลูกค้าเดิม" กับชื่อบริษัทที่พิมพ์เข้ามา (M3)
import { DEFAULT_DEALER_CODE } from "@pms/shared/lib/mock";
//
// ที่มาของปัญหา: ลูกค้าเกิดได้ทางเดียวคือลูกค้าเป้าหมายที่ปิดการขายได้ (convertLeadToCustomer)
// แต่ถ้าดีลเลอร์เปิดลูกค้าเป้าหมายใหม่ให้บริษัทที่เป็นลูกค้าอยู่แล้ว (แทนที่จะกด "สร้างดีลใหม่" จากหน้าลูกค้า)
// พอปิดการขายก็จะได้ลูกค้าซ้ำอีกแถว → ประวัติการซื้อของบริษัทเดียวแตกเป็นสองราย
//
// เส้นแบ่งที่ตั้งใจ:
//   ตรงเป๊ะ (หลังตัดช่องว่าง/ตัวพิมพ์) = บริษัทเดียวกันแน่นอน → ผูกให้เลย ไม่สร้างแถวใหม่
//   คล้ายกัน (ต่างแค่คำนำหน้านิติบุคคล เช่น "บจ. ไทยสตีล" กับ "บริษัท ไทยสตีล จำกัด")
//     = น่าจะใช่ แต่ไม่ฟันธงแทนคน → คืนรายชื่อให้หน้าจอเตือน ให้ผู้ใช้ตัดสินใจเอง
// ไม่รวมอัตโนมัติจากเบอร์/อีเมล — คนละบริษัทใช้เบอร์กลางร่วมกันได้ (เช่น สำนักงานบัญชีเดียวกัน)

/** คีย์ "ตรงเป๊ะ" — ต่างแค่ช่องว่าง/ตัวพิมพ์ ถือว่าชื่อเดียวกัน */
export function exactKey(company: string): string {
  return company.trim().replace(/\s+/g, " ").toLowerCase();
}

// คำนำหน้า/ต่อท้ายที่บอกรูปแบบนิติบุคคล ไม่ใช่ชื่อบริษัท
const LEGAL_TOKENS = [
  "บริษัทจำกัด", "บริษัท", "บมจ.", "บมจ", "บจก.", "บจก", "บจ.", "บจ",
  "ห้างหุ้นส่วนจำกัด", "ห้างหุ้นส่วนสามัญ", "หจก.", "หจก",
  "จำกัด", "มหาชน",
  "company limited", "co., ltd.", "co.,ltd.", "co ltd",
  "company", "limited", "ltd.", "ltd", "co.", "inc.", "inc", "plc",
];

/** คีย์ "คล้ายกัน" — ตัดคำนำหน้านิติบุคคล/วงเล็บ/เครื่องหมายวรรคตอนออก เหลือแต่ชื่อจริง */
export function looseKey(company: string): string {
  let s = exactKey(company).replace(/[()]/g, " ");
  for (const t of LEGAL_TOKENS) s = s.split(t).join(" ");
  return s.replace(/[.,\-–—·]/g, " ").replace(/\s+/g, " ").trim();
}

// id รับได้ทั้ง number (ลูกค้า) และ string (ลูกค้าเป้าหมาย) — ใช้แค่เทียบว่าเป็นแถวเดียวกันไหมตอนตัดตัวที่ตรงเป๊ะ
// ออกจากรายการ "ชื่อใกล้เคียง" ไม่ได้เอาไปคำนวณอะไร · ฟอร์มลูกค้าเป้าหมายใช้ฟังก์ชันนี้กับทั้งสองชุด
type CustomerLike = { id: number | string; company: string; dealerCode?: string };

/**
 * หาลูกค้าที่เข้าคู่กับชื่อบริษัทนี้ ภายในสาขาเดียวกันเท่านั้น (คนละสาขา = คนละสมุดลูกค้า)
 * - exact: ผูกได้เลยโดยไม่ต้องถาม
 * - similar: ต้องให้คนยืนยัน (ไม่รวมตัวที่ตรงเป๊ะซ้ำเข้าไปอีก)
 */
export function matchCustomers<T extends CustomerLike>(
  all: T[], company: string, dealerCode: string,
): { exact: T | null; similar: T[] } {
  const ek = exactKey(company);
  if (!ek) return { exact: null, similar: [] };
  const mine = all.filter(c => (c.dealerCode ?? DEFAULT_DEALER_CODE) === dealerCode);
  const exact = mine.find(c => exactKey(c.company) === ek) ?? null;
  const lk = looseKey(company);
  const similar = lk
    ? mine.filter(c => c.id !== exact?.id && looseKey(c.company) === lk)
    : [];
  return { exact, similar };
}
