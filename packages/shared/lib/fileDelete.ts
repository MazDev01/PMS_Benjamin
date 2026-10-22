// ── ลบไฟล์ที่แนบกับลีด/ลูกค้า (รอบ 4 · บอสตัดสิน 21 ต.ค. 69 ข้อตัดสิน 4) ─────────────────────────────────────────────
//   ลบได้ที่แผงลีด/แผงลูกค้าเท่านั้น (หน้าไฟล์ดูอย่างเดียว) · เฉพาะไฟล์ของสาขาตัวเอง · ถามยืนยันก่อน
//   ไฟล์ของใบเสนอราคาที่ส่งให้ลูกค้าแล้ว ลบไม่ได้ — ฐานกันอีกชั้น (ใบ 0233 files_delete_guard) · HQ ลบไฟล์ดีลเลอร์ไม่ได้ (นโยบาย files_delete)
import { DEALER_FILES_EVENT, DEFAULT_DEALER_CODE, type DealerFile, type QuotationMock } from "./mock";
import { files as filesRepo, storage as fileStorage } from "./data";

/** ไฟล์นี้เป็นใบเสนอราคาที่ส่งถึงลูกค้าแล้ว (เกณฑ์เดียวกับฐาน: หมวดใบเสนอราคา · ชื่อมีเลขที่ใบ · ใบไม่ใช่ร่าง) */
const สาขาของ = (x: { dealerCode?: string }) => x.dealerCode ?? DEFAULT_DEALER_CODE;   // ไม่ระบุ = สาขา CNX (คลังเดิม)
export function ไฟล์ของใบที่ส่งแล้ว(f: Pick<DealerFile, "category" | "name" | "dealerCode">, quotations: QuotationMock[]): boolean {
  return f.category === "ใบเสนอราคา" && quotations.some(q =>
    สาขาของ(q) === สาขาของ(f) && q.status !== "draft" && f.name.includes(q.id));
}

export function ลบไฟล์ได้(f: DealerFile, quotations: QuotationMock[], สาขาที่ล็อกอิน: string): boolean {
  return สาขาของ(f) === สาขาที่ล็อกอิน && !ไฟล์ของใบที่ส่งแล้ว(f, quotations);
}

/** ลบไบต์ใน Storage ก่อน — ล้มเหลวต้องหยุด ไม่ลบแถวทิ้ง (H2 · เดิมอยู่หน้าไฟล์) แล้วแจ้งทุกหน้าที่แสดงไฟล์ให้โหลดใหม่ */
export async function ลบไฟล์(f: DealerFile): Promise<void> {
  if (f.storagePath) await fileStorage.remove(f.storagePath);
  await filesRepo.remove(f.id);
  if (typeof window !== "undefined") window.dispatchEvent(new Event(DEALER_FILES_EVENT));
}
