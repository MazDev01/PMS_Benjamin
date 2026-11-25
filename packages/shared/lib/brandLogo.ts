// ── โลโก้ของระบบที่ HQ เปลี่ยนได้ (บอสสั่ง 24 พ.ย. 69 · ใบ 0304) ─────────────────────────────────────
//   รับเฉพาะ PNG / JPEG / WebP ≤ 1 MB — ดูไบต์หัวไฟล์จริง ไม่เชื่อนามสกุล/ชนิดที่เบราว์เซอร์บอก (SVG ฝังสคริปต์ได้ = ไม่รับ)
//   ตรวจ 3 ชั้น: หน้าเว็บ (เตือนทันที) · เส้นทาง /api/v1/brand-logo · ฐาน (brand_logo_set) — ชั้นฐานคือตัวตัดสิน
//   ไม่เก็บ/ไม่แสดงชื่อไฟล์ที่ผู้ใช้อัป
export const โลโก้ใหญ่สุด = 1_048_576;
export const โลโก้เดิม = "/benjamin-logo-white.png";
export const ป้ายชนิดโลโก้ = "PNG JPG หรือ WebP";

export type ชนิดโลโก้ = "image/png" | "image/jpeg" | "image/webp";

/** ไบต์หัวไฟล์ → ชนิด · null = ไม่รับ (SVG · ข้อความ · ไฟล์อื่นที่ตั้งนามสกุลรูป) — ตรงกับ _brand_logo_mime ในฐาน */
export function ชนิดจากไบต์(b: Uint8Array): ชนิดโลโก้ | null {
  const ตรง = (at: number, sig: number[]) => b.length >= at + sig.length && sig.every((v, i) => b[at + i] === v);
  if (ตรง(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (ตรง(0, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (ตรง(0, [0x52, 0x49, 0x46, 0x46]) && ตรง(8, [0x57, 0x45, 0x42, 0x50])) return "image/webp";
  return null;
}

/** ตรวจไฟล์โลโก้ · คืนข้อความเตือน หรือ "" = ผ่าน */
export function ตรวจไฟล์โลโก้(b: Uint8Array): string {
  if (!b.length || !ชนิดจากไบต์(b)) return `ไฟล์โลโก้ต้องเป็น ${ป้ายชนิดโลโก้}`;
  if (b.length > โลโก้ใหญ่สุด) return "ไฟล์โลโก้ใหญ่เกิน 1 MB";
  return "";
}

/** ที่อยู่รูปโลโก้ในเมนู · sha ว่าง = โลโก้ Benjamin เดิม */
export const ที่อยู่โลโก้ = (sha: string | null | undefined) =>
  sha ? `/api/v1/brand-logo?v=${encodeURIComponent(sha)}` : โลโก้เดิม;

/** ชื่อเหตุการณ์ในหน้าต่าง: HQ เปลี่ยน/ล้างโลโก้แล้ว → เมนูโหลด sha ใหม่ทันที (แท็บเดียวกัน) */
export const เหตุการณ์โลโก้เปลี่ยน = "pms:brand-logo-changed";
