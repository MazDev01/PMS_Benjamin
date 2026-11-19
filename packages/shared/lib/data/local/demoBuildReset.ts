// ── เว็บ demo (โหมดข้อมูลตัวอย่าง · ไม่มีฐาน): ล้างข้อมูลเก่าในเบราว์เซอร์เมื่อรุ่นเว็บเปลี่ยน (19 พ.ย. 69) ─────────────────
//   เหตุ: โหมดตัวอย่างเก็บข้อมูลไว้ใน localStorage ของเบราว์เซอร์ · ขึ้น demo รุ่นใหม่แล้วข้อมูลรุ่นเก่ายังค้าง
//         รูปข้อมูลเก่าไม่ตรงโค้ดใหม่ → หน้าล้ม "เกิดข้อผิดพลาดในหน้านี้" (บอสเจอที่ pms-demo-dealer /dashboard · เบราว์เซอร์ใหม่เปิดได้)
//   ทำ: รุ่น build (PMS_BUILD_ID ฝังตอน build · next.config) ไม่ตรงกับที่จดไว้ → ล้าง localStorage + sessionStorage ของเว็บนี้ แล้วจดรุ่นใหม่
//   เฉพาะโหมด local (ไม่มีฐาน) เท่านั้น — โหมด api/supabase ข้อมูลอยู่ที่ฐาน ไม่แตะเบราว์เซอร์
//   ผลข้างเคียงที่ตั้งใจ: ขึ้นรุ่นใหม่ = ข้อมูลที่ผู้ชม demo ทำไว้หาย + ต้องเข้าระบบใหม่ (demo ไม่มีข้อมูลจริง)
import { DATA_SOURCE } from "../config";

export const คีย์รุ่นเดโม = "pms_demo_build";

type ที่เก็บ = Pick<Storage, "getItem" | "setItem" | "clear">;

/** คืน true = ล้างแล้ว (รุ่นเปลี่ยน) · รุ่นว่าง (ไม่ได้ฝังตอน build) = ไม่ทำอะไร */
export function ล้างเมื่อรุ่นเปลี่ยน(local: ที่เก็บ, session: ที่เก็บ | null, รุ่น: string | undefined): boolean {
  if (!รุ่น) return false;
  const เดิม = local.getItem(คีย์รุ่นเดโม);
  if (เดิม === รุ่น) return false;
  local.clear();
  session?.clear();
  local.setItem(คีย์รุ่นเดโม, รุ่น);
  return true;
}

// ทำทันทีตอนโหลดโมดูล (ก่อนหน้าใดอ่านข้อมูล) — data/index.ts import ไฟล์นี้เป็นบรรทัดแรก
if (typeof window !== "undefined" && DATA_SOURCE === "local") {
  try { ล้างเมื่อรุ่นเปลี่ยน(window.localStorage, window.sessionStorage, process.env.PMS_BUILD_ID); }
  catch { /* เบราว์เซอร์ปิดที่เก็บ — ไม่มีอะไรค้างให้ล้าง */ }
}
