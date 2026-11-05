// ── บอร์ดผู้สนใจเป็นดีลเลอร์ (/hq/prospects · บอสสั่ง 5 พ.ย. 69) — คอลัมน์ + ทางที่ลากได้ + ฟอร์มของแต่ละขั้น ─────────────
//   คอลัมน์ตาม FLOW: รอติดต่อ · ติดต่อแล้ว · ส่งข้อมูลบริษัทแล้ว · นัดคุยแล้ว · ส่งใบค่าแฟรนไชส์ (รอตอบรับ/รอชำระ) · พร้อมตั้งเป็นดีลเลอร์ · เป็นดีลเลอร์ · ไม่สำเร็จ
//   ลากได้ทีละ 1 ขั้นไปข้างหน้า ห้ามข้าม ห้ามถอย (ฐานกันซ้ำ ใบ 0277) · ไม่สำเร็จ = จากทุกขั้นก่อนเป็นดีลเลอร์ (เหตุผลบังคับ)
//   "พร้อมตั้งเป็นดีลเลอร์" ลากเข้าไม่ได้ — ระบบย้ายให้เมื่อตอบรับ + ชำระครบ (ลากแล้วบอกว่ายังขาดอะไร)
//   เป็นดีลเลอร์ = ฟอร์มตั้งเป็นดีลเลอร์ เฉพาะการ์ดที่พร้อม · การ์ดที่จบแล้ว (เป็นดีลเลอร์/ไม่สำเร็จ) ลากออกไม่ได้ (เปิดติดตามใหม่ที่แผง)
import type { DealerProspect, DealerProspectStatus } from "./data/types";
import { prospectStatusColor, prospectStatusLabel, ยังติดตามอยู่ } from "./dealerProspects";
import { ชื่อขั้นย่อย, เหตุยังตั้งดีลเลอร์ไม่ได้, type ขั้นย่อยใบ } from "./prospectJourney";

export type คอลัมน์ผู้สนใจ = "new" | "contacted" | "profile_sent" | "meeting" | "proposal" | "ready" | "won" | "lost";
/** ฟอร์มที่เปิดเมื่อย้ายไปคอลัมน์นั้น */
export type ฟอร์มขั้นผู้สนใจ = "contact" | "profile" | "meeting" | "proposal" | "convert" | "lost";

export const คอลัมน์บอร์ดผู้สนใจ: readonly { key: คอลัมน์ผู้สนใจ; label: string; สี: { bg: string; text: string }; แคบ?: boolean; คั่นก่อน?: boolean }[] = [
  { key: "new", label: prospectStatusLabel.new, สี: prospectStatusColor.new },
  { key: "contacted", label: prospectStatusLabel.contacted, สี: prospectStatusColor.contacted },
  { key: "profile_sent", label: prospectStatusLabel.profile_sent, สี: prospectStatusColor.profile_sent },
  { key: "meeting", label: prospectStatusLabel.meeting, สี: prospectStatusColor.meeting },
  { key: "proposal", label: "ส่งใบค่าแฟรนไชส์", สี: prospectStatusColor.considering },
  { key: "ready", label: ชื่อขั้นย่อย.พร้อม, สี: { bg: "#dcfce7", text: "#047857" } },
  { key: "won", label: prospectStatusLabel.won, สี: prospectStatusColor.won, แคบ: true, คั่นก่อน: true },
  { key: "lost", label: prospectStatusLabel.lost, สี: prospectStatusColor.lost, แคบ: true },
];

/** การ์ดอยู่คอลัมน์ไหน — ส่งใบแล้ว (considering) แยกตามสถานะย่อย: พร้อม = คอลัมน์พร้อม · รอตอบรับ/รอชำระ = คอลัมน์ส่งใบ */
export function คอลัมน์ของผู้สนใจ(p: Pick<DealerProspect, "status">, ย่อย?: ขั้นย่อยใบ | null): คอลัมน์ผู้สนใจ {
  if (p.status === "considering") return ย่อย?.key === "พร้อม" ? "ready" : "proposal";
  return p.status;
}

const ถัดไป: Partial<Record<DealerProspectStatus, { ไป: คอลัมน์ผู้สนใจ; ป้าย: string; ฟอร์ม: ฟอร์มขั้นผู้สนใจ }>> = {
  new: { ไป: "contacted", ป้าย: "ติดต่อแล้ว — บันทึกการติดต่อ", ฟอร์ม: "contact" },
  contacted: { ไป: "profile_sent", ป้าย: "ส่งข้อมูลบริษัทแล้ว — ยืนยันการส่ง", ฟอร์ม: "profile" },
  profile_sent: { ไป: "meeting", ป้าย: "นัดคุยแล้ว — บันทึกนัดคุย", ฟอร์ม: "meeting" },
  meeting: { ไป: "proposal", ป้าย: "ส่งใบค่าแฟรนไชส์ — ออกใบ", ฟอร์ม: "proposal" },
};

export type ทางย้ายผู้สนใจ = { ไป: คอลัมน์ผู้สนใจ; ป้าย: string; ฟอร์ม: ฟอร์มขั้นผู้สนใจ | null; ไม่ได้เพราะ?: string | null };
/** ทางที่การ์ดย้ายได้ (ตัวเดียวกันทั้งการลาก + ปุ่ม "ย้ายไปขั้น…") · โหลดสถานะย่อยยังไม่เสร็จ = ปุ่มตั้งเป็นดีลเลอร์รอผล (ไม่เดา) */
export function ทางย้ายผู้สนใจ(p: Pick<DealerProspect, "status">, ย่อย: ขั้นย่อยใบ | null | undefined, ย่อยโหลดแล้ว: boolean): ทางย้ายผู้สนใจ[] {
  if (!ยังติดตามอยู่(p.status)) return [];
  const ผล: ทางย้ายผู้สนใจ[] = [];
  const ต่อ = ถัดไป[p.status];
  if (ต่อ) ผล.push({ ...ต่อ });
  if (p.status === "considering") {
    const เหตุ = ย่อยโหลดแล้ว ? เหตุยังตั้งดีลเลอร์ไม่ได้(p.status, ย่อย) : "กำลังตรวจใบค่าแฟรนไชส์…";
    if (ย่อย?.key !== "พร้อม") {
      ผล.push({ ไป: "ready", ป้าย: ชื่อขั้นย่อย.พร้อม, ฟอร์ม: null,
        ไม่ได้เพราะ: `ย้ายเองไม่ได้ — ระบบย้ายให้เมื่อผู้สนใจตอบรับและชำระค่าแรกเข้าครบ · ตอนนี้: ${เหตุ}` });
    }
    ผล.push({ ไป: "won", ป้าย: "เป็นดีลเลอร์ — ตั้งเป็นดีลเลอร์", ฟอร์ม: "convert", ไม่ได้เพราะ: เหตุ ? `ตั้งเป็นดีลเลอร์ยังไม่ได้ — ${เหตุ}` : null });
  }
  ผล.push({ ไป: "lost", ป้าย: "ไม่สำเร็จ — ระบุเหตุผล", ฟอร์ม: "lost" });
  return ผล;
}
