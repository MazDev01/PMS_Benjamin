// ── ข้อมูลบริษัทของดีลเลอร์ครบไหม — ก่อนส่ง/พิมพ์ใบเสนอราคาให้ลูกค้า (บอสสั่ง · ใบ 0247) ─────────────────────
// ครบ = ชื่อบริษัท · ที่อยู่ · เลขผู้เสียภาษี ไม่ว่าง (ช่องว่างล้วนนับว่าว่าง)
//   ⚠️ กติกาเดียวกับฐาน _issuer_complete / _issuer_missing (0247) — ฐานเป็นคนกันจริง ที่นี่ใช้ปิดปุ่ม + บอกเหตุผลล่วงหน้าเท่านั้น
//   แก้ช่องที่บังคับ ต้องแก้ทั้งสองที่ (ข้อทดสอบ supabase/tests/issuer_required.sql · tests/scenario/issuer-required.spec.ts)
import type { IssuerProfile } from "./mock";

/** หน้าที่กรอกข้อมูลบริษัท (เมนูตั้งค่า · ส่วน "ข้อมูลบริษัท (ออกในนามดีลเลอร์)") — ไม่ใช่หน้าบัญชี /settings/account (อีเมล/รหัสผ่าน) */
export const ลิงก์ข้อมูลบริษัท = "/settings";

/** ช่องที่ยังขาด (ชื่อไทย) — ว่าง = ครบ */
export function ข้อมูลบริษัทที่ขาด(i: Partial<IssuerProfile> | null | undefined): string[] {
  const ว่าง = (v: unknown) => String(v ?? "").trim() === "";
  return [
    ว่าง(i?.company) && "ชื่อบริษัท",
    ว่าง(i?.address) && "ที่อยู่",
    ว่าง(i?.taxId) && "เลขผู้เสียภาษี",
  ].filter(Boolean) as string[];
}

/** หัวกระดาษที่ฐานจะใช้พิมพ์ (quotation_print_data): ข้อมูลที่ตรึงไว้กับใบถ้าครบ ไม่งั้นข้อมูลปัจจุบันของสาขา */
export function ช่องที่ขาดตอนพิมพ์(ตรึงกับใบ: Partial<IssuerProfile> | null | undefined, ปัจจุบัน: Partial<IssuerProfile> | null | undefined): string[] {
  return ข้อมูลบริษัทที่ขาด(ตรึงกับใบ).length === 0 ? [] : ข้อมูลบริษัทที่ขาด(ปัจจุบัน);
}
