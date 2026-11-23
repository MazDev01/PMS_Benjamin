// ── สถานะดึงผู้สนใจจาก Google Sheets อัตโนมัติ (ใบ 0295 · หน้าต่างนำเข้า) — ตรรกะล้วน ไม่แตะเครือข่าย ─────────────────────────
//   คนรวมงานสั่ง 23 พ.ย. 69: ตัวตั้งเวลาไม่ทำงาน (ค่าระบบไม่ครบ/ไม่เคยทำงาน/เว็บไม่ตอบ) ต้องเห็นบนจอ ไม่เงียบจนเข้าใจว่าทำงานอยู่
//   ป้ายผู้สนใจ "ข้อมูลไม่ครบ" / "เบอร์ซ้ำ" (บอสสั่ง 23 พ.ย. 69) — คำนวณจากข้อมูลจริง (ไม่เก็บช่องใหม่) ใช้ทั้งตารางและแผง
import { เบอร์เฟซบุ๊ก } from "./facebookLeadImport";

/** สถานะจากฐาน (hq_prospect_sheet_sync) */
export type สถานะดึงชีต = {
  url: string; enabled: boolean; updatedBy: string; updatedAt: string | null;
  lastRunAt: string | null; lastOk: boolean | null; lastResult: string; lastBatch: number | null;
  lastTickAt: string | null; lastTickNote: string; running: boolean;
  /** เวลาของฐานตอนอ่าน (เทียบอายุโดยไม่พึ่งนาฬิกาเครื่องผู้ใช้) */
  now: string;
};

const นาที = 60_000;
/** ตัวตั้งเวลาทำงานทุกชั่วโมง — เกินนี้ถือว่าไม่ทำงานแล้ว */
export const ตัวตั้งเวลาเงียบเกิน = 2 * 60 * นาที;

/** ข้อความเตือนเมื่อเปิดอัตโนมัติแต่ตัวตั้งเวลาไม่ทำงาน · ปิดอยู่/ทำงานปกติ = null */
export function เตือนตัวตั้งเวลา(s: สถานะดึงชีต): string | null {
  if (!s.enabled) return null;
  const ตอนนี้ = Date.parse(s.now);
  if (!s.lastTickAt) return "ดึงอัตโนมัติยังไม่เคยทำงาน — ตรวจการตั้งค่าระบบ (ตัวตั้งเวลาของฐานข้อมูล)";
  const ทำงานล่าสุด = Date.parse(s.lastTickAt);
  if (s.lastTickNote === "ตั้งค่าระบบไม่ครบ") return "ดึงอัตโนมัติไม่ทำงาน: ตั้งค่าระบบไม่ครบ (ที่อยู่/รหัสลับของงานตั้งเวลา) — แจ้งผู้ดูแลระบบ";
  if (ตอนนี้ - ทำงานล่าสุด > ตัวตั้งเวลาเงียบเกิน) return `ดึงอัตโนมัติหยุดทำงาน — ตัวตั้งเวลาทำงานครั้งล่าสุด ${วันเวลาไทย(s.lastTickAt)}`;
  // ตัวตั้งเวลาส่งคำขอแล้ว (เปิดอยู่) แต่เว็บไม่จดผลภายใน 15 นาที = เว็บไม่ตอบ/รหัสลับไม่ตรง
  const ดึงล่าสุด = s.lastRunAt ? Date.parse(s.lastRunAt) : 0;
  const ตั้งเมื่อ = s.updatedAt ? Date.parse(s.updatedAt) : 0;
  if (ทำงานล่าสุด > ตั้งเมื่อ && ดึงล่าสุด < ทำงานล่าสุด && ตอนนี้ - ทำงานล่าสุด > 15 * นาที) {
    return "ตัวตั้งเวลาเรียกเว็บแล้วแต่ไม่มีผลดึง — ตรวจรหัสลับของงานตั้งเวลา (CRON_SECRET) บนเว็บ";
  }
  return null;
}

const เดือน = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
/** "23 พ.ย. 2569 14:07" (เวลาไทย) */
export function วันเวลาไทย(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  const d = new Date(t + 7 * 3_600_000);
  const hh = String(d.getUTCHours()).padStart(2, "0"), mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCDate()} ${เดือน[d.getUTCMonth()]} ${d.getUTCFullYear() + 543} ${hh}:${mm}`;
}

// ── ป้ายผู้สนใจ ─────────────────────────────────────────────────────────────────────────────────────────
export const ชื่อไม่มี = "(ไม่มีชื่อ)";
type รายย่อ = { id: number; name?: string | null; phone?: string | null };
/** ข้อมูลไม่ครบ: ไม่มีชื่อ · ไม่มีเบอร์ · เบอร์ไม่ครบ — ไม่ครบ = รายการเหตุ · ครบ = [] */
export function ข้อมูลไม่ครบของราย(p: รายย่อ): string[] {
  const เหตุ: string[] = [];
  if (!p.name?.trim() || p.name.trim() === ชื่อไม่มี) เหตุ.push("ไม่มีชื่อ");
  const เบอร์ = เบอร์เฟซบุ๊ก(p.phone ?? "");
  if (!เบอร์.ตัวเลข) เหตุ.push("ไม่มีเบอร์");
  else if (!เบอร์.ครบ) เหตุ.push("เบอร์ไม่ครบ");
  return เหตุ;
}
/** เบอร์ซ้ำ: id → ชื่อรายอื่นที่เบอร์เดียวกัน (ตัวเลขล้วน) · ไม่ซ้ำ = ไม่มีใน Map */
export function แผนที่เบอร์ซ้ำ(ทั้งหมด: รายย่อ[]): Map<number, string[]> {
  const ตามเบอร์ = new Map<string, รายย่อ[]>();
  for (const p of ทั้งหมด) {
    const d = เบอร์เฟซบุ๊ก(p.phone ?? "").ตัวเลข;
    if (!d) continue;
    ตามเบอร์.set(d, [...(ตามเบอร์.get(d) ?? []), p]);
  }
  const ผล = new Map<number, string[]>();
  for (const กลุ่ม of ตามเบอร์.values()) {
    if (กลุ่ม.length < 2) continue;
    for (const p of กลุ่ม) ผล.set(p.id, กลุ่ม.filter(x => x.id !== p.id).map(x => x.name?.trim() || ชื่อไม่มี));
  }
  return ผล;
}
