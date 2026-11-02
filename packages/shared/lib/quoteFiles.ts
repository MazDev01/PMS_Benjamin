// ── ไฟล์แนบของคำขอราคา 2 ทาง ดีลเลอร์ ↔ HQ (บอสสั่ง 2 พ.ย. 69 · ใบ 0273) ─────────────────────────────────────
//
// กติกาเดียวกับฐาน (quote_file_reserve + ตัวดักของถัง quote-files) — หน้าเว็บตรวจก่อนเพื่อบอกเร็ว ฐาน/ถังตรวจจริงซ้ำ
//   ชนิด: PDF · JPG/PNG · XLSX/XLS/CSV · DWG/DXF · ≤ 20 MB/ไฟล์ · ≤ 10 ไฟล์ต่อฝั่งต่อคำขอ (ฝั่ง HQ = ต่อฉบับใบ HQ)
//   ดีลเลอร์แนบ/ลบได้จนกว่า HQ ส่งใบ · HQ แนบ/ลบได้ตอนใบ HQ เป็นร่าง · ส่งแล้วล็อก (ฐานกัน)

export type ฝั่งไฟล์ = "dealer" | "hq";

/** ไฟล์หนึ่งไฟล์ในรายการ (quote_files_list) — ขนาดจริงจากถัง */
export type QuoteFile = {
  id: number;
  requestId: number;
  requestNo: string;
  side: ฝั่งไฟล์;
  hqQuoteId: number | null;
  quoteNo: string | null;
  version: number | null;
  name: string;
  path: string;
  size: number;
  uploadedByName: string;
  createdAt: string;
  /** ผู้เรียกลบได้ไหม (ฝั่งของตัวเอง + ยังไม่ล็อก) — ฐานคิด */
  canDelete: boolean;
};

/** ป้ายจำนวนไฟล์ในรายการคำขอ */
export type จำนวนไฟล์คำขอ = { request: number; dealer: number; hq: number };

/** พื้นที่เก็บไฟล์ (หน้าตั้งค่า HQ) — quotaGb = null คือยังไม่ได้ตั้ง */
export type StorageUsage = { buckets: { bucket: string; files: number; bytes: number }[]; quotaGb: number | null };

export const นามสกุลที่รับ = ["pdf", "jpg", "jpeg", "png", "xlsx", "xls", "csv", "dwg", "dxf"] as const;
export const ไฟล์ใหญ่สุด = 20 * 1024 * 1024;
export const ไฟล์มากสุดต่อฝั่ง = 10;
/** ค่า accept ของช่องเลือกไฟล์ */
export const acceptไฟล์แนบ = นามสกุลที่รับ.map(e => "." + e).join(",");
export const ป้ายชนิดที่รับ = "PDF, JPG/PNG, Excel/CSV, DWG/DXF · ไม่เกิน 20 MB/ไฟล์ · ไม่เกิน 10 ไฟล์";

export const ป้ายฝั่ง: Record<ฝั่งไฟล์, string> = { dealer: "จากดีลเลอร์", hq: "จาก HQ" };

export function นามสกุล(name: string): string {
  const m = /\.([A-Za-z0-9]+)$/.exec(name.trim());
  return m ? m[1].toLowerCase() : "";
}

/** ตรวจก่อนอัปโหลด (ตรงกับฐาน) — คืนข้อความผิด หรือ "" = ผ่าน */
export function ตรวจไฟล์แนบ(file: { name: string; size: number }, มีอยู่แล้ว: number): string {
  const ext = นามสกุล(file.name);
  if (!(นามสกุลที่รับ as readonly string[]).includes(ext)) return `ไม่รองรับไฟล์ชนิด "${ext || "ไม่ทราบ"}" — รับเฉพาะ PDF, JPG/PNG, Excel/CSV, DWG/DXF`;
  if (!(file.size > 0)) return "ไฟล์ว่าง — เลือกไฟล์ใหม่";
  if (file.size > ไฟล์ใหญ่สุด) return `${file.name} ใหญ่เกิน 20 MB`;
  if (มีอยู่แล้ว >= ไฟล์มากสุดต่อฝั่ง) return "แนบได้ไม่เกิน 10 ไฟล์";
  return "";
}

export function ขนาดไฟล์(bytes: number): string {
  if (!(bytes >= 0)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}
