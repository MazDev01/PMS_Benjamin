// ── สถานะบัญชีของดีลเลอร์ "ครั้งเดียวต่อการเปิดหน้า" ─────────────────────────────────────────────────
//
// ด่านตั้งรหัสครั้งแรก (FirstPasswordGate) และแถบเตือนอีเมลติดต่อ (ContactEmailBanner) ต้องการคำตอบเดียวกัน
//   เดิมต่างคนต่างขอ = ทุกหน้าของดีลเลอร์ยิงข้ามไปแอปสำนักงานใหญ่สองครั้ง · ช่วงเครื่องหนัก หน้าค้างซ่อนเนื้อหานานขึ้น
//   (ชุดเต็มรอบปิดด่าน 1 · 14 ต.ค. 69) — ใช้คำขอที่กำลังวิ่งอยู่ร่วมกัน · หมดอายุ 5 วินาที หรือสั่งล้างหลังสถานะเปลี่ยน
import { account } from "@pms/shared/lib/data";
import type { AccountState } from "@pms/shared/lib/data/ports";

const ค้าง = new Map<string, { at: number; p: Promise<AccountState> }>();
export function accountStateOnce(dealerCode: string): Promise<AccountState> {
  const มี = ค้าง.get(dealerCode);
  if (มี && Date.now() - มี.at < 5_000) return มี.p;
  const p = account.state(dealerCode);
  ค้าง.set(dealerCode, { at: Date.now(), p });
  p.catch(() => ค้าง.delete(dealerCode));
  return p;
}
/** สถานะบัญชีเปลี่ยน (ยืนยันอีเมล · ตั้งรหัส) — ครั้งถัดไปต้องถามใหม่ */
export function ล้างสถานะบัญชี(dealerCode?: string) { if (dealerCode) ค้าง.delete(dealerCode); else ค้าง.clear(); }
