// ── ค่าตั้ง "หาดีลเลอร์" ของสำนักงานใหญ่ (บอสสั่ง 14 ก.ย. 69 · หน้าตั้งค่า › หาดีลเลอร์) ─────────────
//
// เดิมรายการพวกนี้เขียนตายตัวในโค้ด — ทีมเริ่มใช้ช่องทางใหม่ต้องรอโปรแกรมเมอร์แก้
//   • ช่องทางที่เข้ามา / ช่องทางในบันทึกการติดต่อ  → ค่าเริ่มต้น = รายการเดิมที่ใช้อยู่
//   • ประเภทธุรกิจ / เหตุผลที่ไม่สำเร็จ            → ค่าเริ่มต้น = ว่าง = ช่องยังพิมพ์เองเหมือนเดิม (ห้ามกุรายการให้)
//   • ชื่องานตามขั้น                                → แก้ได้แค่ "ชื่อ" · เพิ่ม/ลบงานไม่ได้
//     เพราะงาน 4 งานผูกกับขั้นที่ฐานข้อมูลบังคับ (0174: เลื่อนทีละขั้น · รอตัดสินใจต้องมีใบที่ส่งแล้ว)
//   • ค่าตั้งต้นของใบค่าแฟรนไชส์ (ข้อ 2)            → ว่างทั้งหมด = ฟอร์มไม่เติมอะไรให้ (ห้ามเดาตัวเลข)
//
// ไฟล์นี้เป็นตรรกะล้วน (ไม่พึ่ง mock.ts) — ตัวเชื่อมข้อมูลทั้งสามแบบ หน้าจอ และเทสต์ใช้ชุดเดียวกัน
import type { DealerPackage } from "./data/types";
import { REGIONS, type Region } from "./provinces";

export type คีย์งานหาดีลเลอร์ = "contact" | "profile" | "meeting" | "proposal";
export type ค่าตั้งแพ็กเกจ = {
  amount: number | null; contractMonths: number | null;
  /** เป้ายอดซื้อต่อปี "ค่ากลาง" — ใช้กับภาคที่ไม่ได้ตั้งแยก / ทุกภาค */
  annualTarget: number | null;
  /** เป้าต่อปีแยกตามภาค (บอสสั่ง 15 ก.ย. 69) — ไม่มีคีย์ = ใช้ค่ากลาง */
  targetsByRegion: Partial<Record<Region, number>>;
};

export type HQRecruitSettings = {
  /** ช่องทางที่ผู้สนใจเข้ามา (ฟอร์มลูกค้าเป้าหมาย HQ) */
  channels: string[];
  /** ช่องทางในบันทึกการติดต่อ */
  contactChannels: string[];
  /** ประเภทธุรกิจ — ว่าง = พิมพ์เอง */
  businessTypes: string[];
  /** เหตุผลที่ไม่สำเร็จ — ว่าง = พิมพ์เอง */
  lostReasons: string[];
  /** ชื่องานที่ตั้งเอง — ไม่มีคีย์ = ชื่อเดิม */
  taskLabels: Partial<Record<คีย์งานหาดีลเลอร์, string>>;
  proposal: {
    /** อายุใบ (วัน) — null = ไม่เติมวันมีผลให้ */
    validityDays: number | null;
    /** เงื่อนไขมาตรฐาน — เติมให้ตอนออกใบใหม่ */
    terms: string;
    /** ผู้ลงนามช่อง "ผู้เสนอ" ท้ายเอกสาร — ว่าง = ใช้ชื่อบริษัท */
    signerName: string;
    signerTitle: string;
    packages: Record<DealerPackage, ค่าตั้งแพ็กเกจ>;
  };
};

export const ช่องทางที่เข้ามาเริ่มต้น = ["Facebook", "LINE OA", "LINE ส่วนตัว", "โทรเข้ามาเอง", "แนะนำต่อ"];
export const ช่องทางติดต่อเริ่มต้น = ["โทรศัพท์", "LINE", "Facebook", "พบตัว", "อีเมล", "อื่น ๆ"];

const แพ็กเกจว่าง = (): ค่าตั้งแพ็กเกจ => ({ amount: null, contractMonths: null, annualTarget: null, targetsByRegion: {} });

export const DEFAULT_RECRUIT_SETTINGS: HQRecruitSettings = {
  channels: [...ช่องทางที่เข้ามาเริ่มต้น],
  contactChannels: [...ช่องทางติดต่อเริ่มต้น],
  businessTypes: [],
  lostReasons: [],
  taskLabels: {},
  proposal: { validityDays: null, terms: "", signerName: "", signerTitle: "", packages: { standard: แพ็กเกจว่าง(), exclusive: แพ็กเกจว่าง() } },
};

export const ความยาวรายการสูงสุด = 50;    // ตัวอักษรต่อรายการ (ช่องทางในบันทึกการติดต่อตรวจ ≤ 50 อยู่แล้ว)
export const จำนวนรายการสูงสุด = 30;
const คีย์งาน: คีย์งานหาดีลเลอร์[] = ["contact", "profile", "meeting", "proposal"];

/** รายการข้อความ: ตัดช่องว่าง · ทิ้งค่าว่าง/ซ้ำ · ยาวเกินตัด · เกินจำนวนตัด */
export function จัดรายการ(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    if (typeof x !== "string") continue;
    const t = x.trim().slice(0, ความยาวรายการสูงสุด);
    if (t && !out.includes(t)) out.push(t);
    if (out.length >= จำนวนรายการสูงสุด) break;
  }
  return out;
}

/** ตัวเลขที่ไม่บังคับ: ไม่ใช่ตัวเลข/ติดลบ = null */
function เลขหรือว่าง(v: unknown, สูงสุด?: number, เต็มเท่านั้น = false): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v.replace(/[,฿\s]/g, "")) : NaN;
  if (!Number.isFinite(n) || n < 0) return null;
  if (เต็มเท่านั้น && !Number.isInteger(n)) return null;
  if (สูงสุด != null && n > สูงสุด) return null;
  return n;
}
const ข้อความ = (v: unknown, ยาว: number) => (typeof v === "string" ? v.trim().slice(0, ยาว) : "");

function จัดแพ็กเกจ(v: unknown): ค่าตั้งแพ็กเกจ {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const เดือน = เลขหรือว่าง(o.contractMonths, 120, true);
  // เก็บเฉพาะภาคที่รู้จักและเป็นตัวเลขใช้ได้ — ว่าง/เพี้ยน = ไม่มีคีย์ (ใช้ค่ากลาง)
  const ภาคดิบ = (o.targetsByRegion && typeof o.targetsByRegion === "object" ? o.targetsByRegion : {}) as Record<string, unknown>;
  const targetsByRegion: Partial<Record<Region, number>> = {};
  for (const r of REGIONS) {
    const n = เลขหรือว่าง(ภาคดิบ[r]);
    if (n != null) targetsByRegion[r] = n;
  }
  return {
    amount: เลขหรือว่าง(o.amount),
    contractMonths: เดือน != null && เดือน >= 1 ? เดือน : null,
    annualTarget: เลขหรือว่าง(o.annualTarget),
    targetsByRegion,
  };
}

/** รับค่าดิบจากที่เก็บ (อาจเก่า/ขาด/เพี้ยน) → ค่าที่ใช้ได้เสมอ
 *  ช่องทางทั้งสองรายการ: ว่าง = ใช้ค่าเริ่มต้น (ไม่ปล่อยให้ดรอปดาวน์ไม่มีตัวเลือก — บันทึกการติดต่อบังคับเลือกช่องทาง) */
export function รวมค่าตั้งหาดีลเลอร์(raw: unknown): HQRecruitSettings {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const p = (o.proposal && typeof o.proposal === "object" ? o.proposal : {}) as Record<string, unknown>;
  const pk = (p.packages && typeof p.packages === "object" ? p.packages : {}) as Record<string, unknown>;
  const tl = (o.taskLabels && typeof o.taskLabels === "object" ? o.taskLabels : {}) as Record<string, unknown>;
  const taskLabels: HQRecruitSettings["taskLabels"] = {};
  for (const k of คีย์งาน) { const t = ข้อความ(tl[k], 60); if (t) taskLabels[k] = t; }
  const channels = จัดรายการ(o.channels);
  const contactChannels = จัดรายการ(o.contactChannels);
  const วัน = เลขหรือว่าง(p.validityDays, 365, true);
  return {
    channels: channels.length ? channels : [...ช่องทางที่เข้ามาเริ่มต้น],
    contactChannels: contactChannels.length ? contactChannels : [...ช่องทางติดต่อเริ่มต้น],
    businessTypes: จัดรายการ(o.businessTypes),
    lostReasons: จัดรายการ(o.lostReasons),
    taskLabels,
    proposal: {
      validityDays: วัน != null && วัน >= 1 ? วัน : null,
      terms: ข้อความ(p.terms, 4000),
      signerName: ข้อความ(p.signerName, 120),
      signerTitle: ข้อความ(p.signerTitle, 120),
      packages: { standard: จัดแพ็กเกจ(pk.standard), exclusive: จัดแพ็กเกจ(pk.exclusive) },
    },
  };
}

/** เป้ายอดขายรายปีตามแพ็กเกจของดีลเลอร์ (บอสสั่ง 15 ก.ย. 69)
 *  ลำดับ: เป้าของแพ็กเกจในภาคนั้น → เป้ากลางของแพ็กเกจ → null (ใช้เป้าที่กรอกเอง)
 *  กติกาเดียวกับตัวดักฐานข้อมูล 0178/0179 */
export function เป้าตามแพ็กเกจ(
  s: Pick<HQRecruitSettings, "proposal">, pkg?: DealerPackage | null, region?: string | null,
): number | null {
  if (pkg !== "standard" && pkg !== "exclusive") return null;
  const p = s.proposal.packages[pkg];
  if (!p) return null;
  const ตามภาค = region ? p.targetsByRegion?.[region as Region] : undefined;
  return ตามภาค ?? p.annualTarget ?? null;
}

/** ดีลเลอร์หนึ่งราย → เป้าตามแพ็กเกจและภาค (ถ้ามี) · ไม่เข้าเงื่อนไข = คืนตัวเดิม
 *  กำหนดเป้าเอง (targetManual) = ไม่แตะเป้า — กติกาเดียวกับตัวดักฐานข้อมูล 0180 */
export function ใช้เป้าตามแพ็กเกจ<T extends { package?: DealerPackage | null; region?: string | null; revenueTarget: number; targetManual?: boolean }>(
  d: T, s: Pick<HQRecruitSettings, "proposal">,
): T {
  if (d.targetManual) return d;
  const t = เป้าตามแพ็กเกจ(s, d.package, d.region);
  return t == null || t === d.revenueTarget ? d : { ...d, revenueTarget: t };
}

/** ชื่องานที่ใช้แสดง — ตั้งเองไว้ใช้ชื่อนั้น ไม่ได้ตั้งใช้ชื่อเดิม */
export const ชื่องานที่ใช้ = (s: Pick<HQRecruitSettings, "taskLabels">, key: คีย์งานหาดีลเลอร์, เดิม: string) =>
  s.taskLabels[key]?.trim() || เดิม;

/** ตัวเลือกที่ใช้ในดรอปดาวน์ + ค่าที่บันทึกไว้เดิมแต่ไม่อยู่ในรายการแล้ว (ต้องยังเห็น ไม่หายเงียบ) */
export function ตัวเลือกพร้อมค่าเดิม(รายการ: string[], ค่าเดิม?: string | null): { ตัวเลือก: string[]; ค่านอกรายการ: string | null } {
  const เดิม = (ค่าเดิม ?? "").trim();
  return { ตัวเลือก: รายการ, ค่านอกรายการ: เดิม && !รายการ.includes(เดิม) ? เดิม : null };
}

/** วันที่ + n วัน (YYYY-MM-DD) */
export function บวกวัน(วันISO: string, n: number): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(วันISO) || !Number.isFinite(n)) return null;
  const t = Date.parse(`${วันISO}T00:00:00Z`) + n * 86_400_000;
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}
