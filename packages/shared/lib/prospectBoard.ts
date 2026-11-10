// ── บอร์ดผู้สนใจเป็นดีลเลอร์ (/hq/prospects · บอสสั่ง 5 พ.ย. 69 · ยุบเหลือ 5 คอลัมน์ รอบ 2 วันเดียวกัน) — คอลัมน์ + ทางที่ลากได้ + ฟอร์มที่ขาด ──
//   5 คอลัมน์: ติดต่อ (รอติดต่อ + ติดต่อแล้ว) · คุยรายละเอียด (ส่งข้อมูลบริษัทแล้ว + นัดคุยแล้ว)
//     · ส่งใบค่าแฟรนไชส์ (รอผู้สนใจตอบรับ + รอชำระ) · พร้อมตั้งเป็นดีลเลอร์ · ปิดแล้ว (เป็นดีลเลอร์ + ไม่สำเร็จ · ยุบไว้ กดเปิดดูได้)
//   ขั้นย่อย = ป้ายบนการ์ด · สถานะในฐานไม่เปลี่ยน (ฐานยังกันทีละ 1 ขั้น ใบ 0278 — ฟอร์มเปิดทีละขั้นตามลำดับ)
//   ลากเข้าคอลัมน์ = เปิดฟอร์มของขั้นที่ยังขาดทีละฟอร์มตามลำดับ (ขั้นที่ขาด) ทำครบถึงย้าย · ยกเลิกกลางทาง = ขั้นที่บันทึกแล้วคงไว้ การ์ดอยู่ตามสถานะจริง
//     คุยรายละเอียด = บันทึกการติดต่อ (ถ้ายังรอติดต่อ) → ยืนยันส่งข้อมูลบริษัท (บอสเลือก 5 พ.ย. 69)
//     ส่งใบ = บันทึกนัดคุย (ถ้ายังไม่นัด) → ออกใบ
//   ห้ามข้ามคอลัมน์ ห้ามถอย · พร้อมตั้งเป็นดีลเลอร์ = ลากเข้าไม่ได้ (ระบบย้ายเมื่อตอบรับ + ชำระครบ · บอกว่าขาดอะไร)
//   ปิดแล้ว = ให้เลือก: เป็นดีลเลอร์ (เฉพาะการ์ดที่พร้อม) / ไม่สำเร็จ (เหตุผลบังคับ · ได้จากทุกคอลัมน์ก่อนปิด) · การ์ดที่ปิดแล้วลากออกไม่ได้
import type { DealerProspect, DealerProspectStatus } from "./data/types";
import { prospectStatusColor, ยังติดตามอยู่ } from "./dealerProspects";
import { ชื่อขั้นย่อย, เหตุยังตั้งดีลเลอร์ไม่ได้, type ขั้นย่อยใบ } from "./prospectJourney";

export type คอลัมน์ผู้สนใจ = "contact" | "discuss" | "proposal" | "ready" | "closed";
/** ฟอร์มของแต่ละขั้น — close = ให้เลือกเป็นดีลเลอร์ / ไม่สำเร็จ */
export type ฟอร์มขั้นผู้สนใจ = "contact" | "profile" | "meeting" | "proposal" | "close";

export const คอลัมน์บอร์ดผู้สนใจ: readonly { key: คอลัมน์ผู้สนใจ; label: string; สี: { bg: string; text: string }; แคบ?: boolean; คั่นก่อน?: boolean; ยุบได้?: boolean }[] = [
  { key: "contact", label: "ติดต่อ", สี: prospectStatusColor.contacted },
  { key: "discuss", label: "คุยรายละเอียด", สี: prospectStatusColor.meeting },
  { key: "proposal", label: "ส่งใบค่าแฟรนไชส์", สี: prospectStatusColor.considering },
  { key: "ready", label: ชื่อขั้นย่อย.พร้อม, สี: { bg: "#dcfce7", text: "#047857" } },
  { key: "closed", label: "ปิดแล้ว", สี: { bg: "#f1f5f9", text: "#475569" }, แคบ: true, คั่นก่อน: true, ยุบได้: true },
];

/** การ์ดอยู่คอลัมน์ไหน (จากสถานะจริงในฐาน) — ส่งใบแล้ว (considering) แยกตามสถานะย่อย: พร้อม = คอลัมน์พร้อม · อื่น ๆ = คอลัมน์ส่งใบ */
export function คอลัมน์ของผู้สนใจ(p: Pick<DealerProspect, "status">, ย่อย?: ขั้นย่อยใบ | null): คอลัมน์ผู้สนใจ {
  switch (p.status) {
    case "new": case "contacted": return "contact";
    case "profile_sent": case "meeting": return "discuss";
    case "considering": return ย่อย?.key === "พร้อม" ? "ready" : "proposal";
    default: return "closed";
  }
}

/** ฟอร์มถัดไปที่ยังขาด เพื่อให้การ์ดไปถึงคอลัมน์ ไป (null = ถึงแล้ว / ไปทางนี้ไม่ได้) — เรียกซ้ำหลังบันทึกแต่ละขั้น จนได้ null */
export function ขั้นที่ขาด(status: DealerProspectStatus, ไป: คอลัมน์ผู้สนใจ): ฟอร์มขั้นผู้สนใจ | null {
  if (ไป === "discuss") return status === "new" ? "contact" : status === "contacted" ? "profile" : null;
  if (ไป === "proposal") return status === "profile_sent" ? "meeting" : status === "meeting" ? "proposal" : null;
  return null;
}

const ชื่อฟอร์ม: Record<ฟอร์มขั้นผู้สนใจ, string> = {
  contact: "บันทึกการติดต่อ", profile: "ยืนยันส่งข้อมูลบริษัท", meeting: "บันทึกนัดคุย", proposal: "ออกใบ", close: "เลือกผล",
};
const สถานะหลังฟอร์ม: Partial<Record<DealerProspectStatus, DealerProspectStatus>> = { new: "contacted", contacted: "profile_sent", profile_sent: "meeting", meeting: "considering" };
/** ลำดับฟอร์มทั้งหมดที่ต้องทำจากสถานะนี้ไปคอลัมน์ ไป (ป้ายบนเมนู "ย้ายไปขั้น…") */
export function ลำดับฟอร์ม(status: DealerProspectStatus, ไป: คอลัมน์ผู้สนใจ): ฟอร์มขั้นผู้สนใจ[] {
  const ผล: ฟอร์มขั้นผู้สนใจ[] = [];
  for (let s: DealerProspectStatus | undefined = status; s; s = สถานะหลังฟอร์ม[s]) {
    const f = ขั้นที่ขาด(s, ไป);
    if (!f) break;
    ผล.push(f);
  }
  return ผล;
}

export type ทางย้ายผู้สนใจ = { ไป: คอลัมน์ผู้สนใจ; ป้าย: string; ฟอร์ม: ฟอร์มขั้นผู้สนใจ | null; ไม่ได้เพราะ?: string | null };
/** ทางที่การ์ดย้ายได้ (ตัวเดียวกันทั้งการลาก + ปุ่ม "ย้ายไปขั้น…") — คอลัมน์ถัดไป 1 คอลัมน์ + ปิดแล้ว */
export function ทางย้ายผู้สนใจ(p: Pick<DealerProspect, "status">, ย่อย: ขั้นย่อยใบ | null | undefined, ย่อยโหลดแล้ว: boolean): ทางย้ายผู้สนใจ[] {
  if (!ยังติดตามอยู่(p.status)) return [];
  const อยู่ = คอลัมน์ของผู้สนใจ(p, ย่อย);
  const ผล: ทางย้ายผู้สนใจ[] = [];
  const ไป: คอลัมน์ผู้สนใจ | null = อยู่ === "contact" ? "discuss" : อยู่ === "discuss" ? "proposal" : null;
  if (ไป) {
    const ฟอร์ม = ลำดับฟอร์ม(p.status, ไป);
    const ชื่อ = คอลัมน์บอร์ดผู้สนใจ.find(c => c.key === ไป)!.label;
    ผล.push({ ไป, ป้าย: `${ชื่อ} — ${ฟอร์ม.map(f => ชื่อฟอร์ม[f]).join(" → ")}`, ฟอร์ม: ฟอร์ม[0] ?? null });
  }
  if (อยู่ === "proposal") {
    const เหตุ = ย่อยโหลดแล้ว ? เหตุยังตั้งดีลเลอร์ไม่ได้(p.status, ย่อย) : "กำลังตรวจใบค่าแฟรนไชส์…";
    ผล.push({ ไป: "ready", ป้าย: ชื่อขั้นย่อย.พร้อม, ฟอร์ม: null,
      ไม่ได้เพราะ: `ย้ายเองไม่ได้ — ระบบย้ายให้เมื่อผู้สนใจตอบรับและชำระค่าแรกเข้าครบ · ตอนนี้: ${เหตุ}` });
  }
  ผล.push({ ไป: "closed", ป้าย: อยู่ === "ready" ? "ปิดแล้ว — เป็นดีลเลอร์ / ไม่สำเร็จ" : "ปิดแล้ว — ไม่สำเร็จ (ระบุเหตุผล)", ฟอร์ม: "close" });
  return ผล;
}

/** ตอนวางในคอลัมน์ปิดแล้ว: เป็นดีลเลอร์ได้เฉพาะการ์ดที่พร้อม (โหลดสถานะย่อยยังไม่เสร็จ = รอผล ไม่เดา) · ไม่สำเร็จได้ทุกการ์ดที่ยังติดตาม */
export function เหตุเป็นดีลเลอร์ไม่ได้(p: Pick<DealerProspect, "status">, ย่อย: ขั้นย่อยใบ | null | undefined, ย่อยโหลดแล้ว: boolean): string | null {
  if (!ย่อยโหลดแล้ว) return "กำลังตรวจใบค่าแฟรนไชส์…";
  return เหตุยังตั้งดีลเลอร์ไม่ได้(p.status, p.status === "considering" ? ย่อย : null);
}
