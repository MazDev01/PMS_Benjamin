// ── รายการวัสดุ (บอสสั่ง 26 ต.ค. 69 · ใบ 0244) — วัสดุ/ส่วนประกอบ + ราคาต่อหน่วย (ราคาส่งดีลเลอร์ ก่อน VAT) ─────────────
//
// ⚠️ หน้าจอเอาออกทั้งระบบแล้ว (บอสสั่ง 20 พ.ย. 69 · ซ่อนหน้าจอ ห้าม drop) — ไฟล์นี้เหลือแค่ชนิดข้อมูลที่ตัวต่อข้อมูลยังใช้
//   ราคาประเมินคิดที่ฐานตอนส่งคำขอ (_estimate_snapshot) — หน้าเว็บคิดให้ดูก่อนส่งด้วยสูตรเดียวกัน (ประเมินรวม)
//   ไม่ใช่แม่แบบอาคารแบบเดิม (เอาออก 16 ต.ค. 69) — ตารางแม่แบบเดิมคงไว้ในฐาน ไม่ถูกอ่าน
export type MaterialTemplate = {
  id: number;
  category: string;
  name: string;
  unit: string;
  /** ราคาส่งดีลเลอร์ต่อหน่วย (ก่อน VAT) */
  unitPrice: number;
  active: boolean;
  /** ฐานประทับเองเมื่อราคาเปลี่ยน */
  priceUpdatedAt: string;
};

/** ชุดนำเข้ารายการวัสดุ (ใบ 0279) — blocked = เหตุที่ยกเลิกทั้งชุดไม่ได้ (null = ยกเลิกได้) */
export type ชุดนำเข้าวัสดุ = { id: number; fileName: string; inserted: number; updated: number; createdBy: string; createdAt: string; cancelledAt: string | null; blocked: string | null };
export type ผลนำเข้าวัสดุ = { batch: number; inserted: number; updated: number };

/** แถวที่ส่งไปบันทึก — ไม่มี id = เพิ่มใหม่ */
export type MaterialTemplateDraft = Omit<MaterialTemplate, "id" | "priceUpdatedAt"> & { id?: number };

/** สำเนารายการประเมินที่คำขอเก็บไว้ ณ ตอนส่ง (HQ เปลี่ยนราคาทีหลัง สำเนานี้ไม่เปลี่ยน) */
/** รายการในคำขอ (estimate_items) — แบบเดิมจากรายการวัสดุ (มีรหัส/หมวด/ราคา) · แบบใหม่ดีลเลอร์พิมพ์เอง { name, qty, unit } ไม่มีราคา (20 พ.ย. 69) */
export type EstimateItem = { templateId?: number; category?: string; name: string; unit: string; qty: number; unitPrice?: number };

/** ความแม่นของราคาประเมิน — n = 0 → ค่าเฉลี่ย null (แสดง "—") */
/** byTemplate = % คลาดเฉลี่ยรายวัสดุ (ใบ 0268): ค่าเฉลี่ย % ราคาประเมินคลาดจากใบ HQ ของคำขอที่เลือกวัสดุนั้น · ไม่มี = ฐานยังไม่ถึงใบนั้น */
export type EstimateAccuracy = { n: number; avgAbsPct: number | null; avgPct: number | null; byTemplate?: { id: number; n: number; avgPct: number | null }[] };

// ฟังก์ชันของหน้าจอรายการวัสดุ (ยอดประเมิน · แม่แบบ→แถว HQ · ค้น/หมวด/% คลาด) ลบแล้ว 25 พ.ย. 69 — หน้าจอเอาออกตั้งแต่ 20 พ.ย. 69
//   (บอสสั่ง "เคลียไฟขยะและทดสอบที่ไม่ใช่แล้ว") · คงชนิดข้อมูลไว้ — ตัวต่อข้อมูล/เส้นทาง material-templates ยังใช้ (ตารางคงไว้ ห้าม drop)
