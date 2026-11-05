// ── เส้นทางการทำงานของผู้สนใจเป็นดีลเลอร์ ─────────────────────────────────────────────
//   บอสสั่ง 14 ก.ย. 69: "ทำให้ ผู้สนใจ ออกแบบการทำออกมาใช้งานให้เสร็จ"
//
// แนวเดียวกับลูกค้าเป้าหมายของดีลเลอร์ (สเปกหลัก): ความคืบหน้าคิดจาก "งาน" ไม่ใช่เลือกสถานะเอง
//   ติ๊กงานตามลำดับ → ขั้นเลื่อนเอง · งานที่ต้องมีของจริง (บันทึกการติดต่อ / ใบเสนอที่ส่งแล้ว) ติ๊กเองไม่ได้
//
// ⚠️ กติกาเลื่อนขั้นชุดนี้ต้องตรงกับตัวดักของฐานข้อมูล (migration 0174 · dealer_prospects_stage_guard)
//    ฐานข้อมูลคือด่านจริง · ไฟล์นี้ใช้บอกผู้ใช้ล่วงหน้า และให้โหมดเดโมทำงานเหมือนของจริง
import type { DealerProposalStatus, DealerProspect, DealerProspectStatus, ProspectActivity, ProspectContactInput } from "./data/types";
import { ยังติดตามอยู่, prospectStatusLabel } from "./dealerProspects";
import { proposalStatusLabel } from "./dealerProposals";

/** ขั้นระหว่างติดตาม เรียงตามลำดับ (ไม่รวม เป็นดีลเลอร์แล้ว / ไม่สำเร็จ) */
export const ขั้นติดตาม: readonly DealerProspectStatus[] = ["new", "contacted", "profile_sent", "meeting", "considering"];
export const ลำดับขั้น = (s: DealerProspectStatus): number => ขั้นติดตาม.indexOf(s);

export type งานตามขั้น = {
  key: "contact" | "profile" | "meeting" | "proposal";
  label: string;
  /** ติ๊กงานนี้แล้วขั้นเลื่อนไปที่ */
  ไปขั้น: DealerProspectStatus;
  /** ต้องมีของจริงก่อน — ติ๊กเองไม่ได้ ระบบพาไปทำของจริงแทน */
  หลักฐาน?: "contact" | "proposal";
  คำอธิบาย: string;
};

/** งานมาตรฐาน 4 งาน + ปิดท้าย (ตั้งเป็นดีลเลอร์ / ไม่สำเร็จ) — ขั้นตั้งตามที่ทีมเขียนไว้ในไฟล์ติดตามจริง */
export const งานมาตรฐาน: readonly งานตามขั้น[] = [
  { key: "contact",  label: "ติดต่อครั้งแรก",          ไปขั้น: "contacted",    หลักฐาน: "contact",  คำอธิบาย: "บันทึกการติดต่อครั้งแรก แล้วระบบติ๊กให้เอง" },
  { key: "profile",  label: "ส่งข้อมูลบริษัท",         ไปขั้น: "profile_sent",                     คำอธิบาย: "ส่งข้อมูลบริษัทให้ผู้สนใจศึกษา" },
  { key: "meeting",  label: "นัดคุยรายละเอียด",        ไปขั้น: "meeting",                          คำอธิบาย: "คุยเงื่อนไขการเป็นดีลเลอร์กับผู้สนใจ" },
  { key: "proposal", label: "ส่งใบค่าแฟรนไชส์",  ไปขั้น: "considering",  หลักฐาน: "proposal", คำอธิบาย: "ออกใบแล้วเปลี่ยนเป็น “ส่งแล้ว” ระบบติ๊กให้เอง" },
];

/** งานลำดับที่ i ทำแล้วหรือยัง — ขั้น = ขั้นปัจจุบัน (รายที่ไม่สำเร็จ ให้ส่งขั้นก่อนปิดมา) */
export function งานเสร็จแล้ว(ขั้น: DealerProspectStatus, i: number): boolean {
  if (ขั้น === "won") return true;
  return ลำดับขั้น(ขั้น) >= i + 1;
}

/** ความคืบหน้า % — 4 งาน + ปิดท้าย = 5 ช่วง ช่วงละ 20% · จบแล้ว (ทั้งสำเร็จ/ไม่สำเร็จ) = 100 */
export function ความคืบหน้า(status: DealerProspectStatus): number {
  if (!ยังติดตามอยู่(status)) return 100;
  return Math.max(0, ลำดับขั้น(status)) * 20;
}

export type ผลติ๊กงาน = { ขั้นใหม่: DealerProspectStatus } | { ต้องทำก่อน: "contact" | "proposal" } | { ผิด: string };

/** ติ๊กงานลำดับที่ i — ได้ขั้นใหม่ / ต้องไปทำของจริงก่อน / ทำไม่ได้พร้อมเหตุผล */
export function ติ๊กงาน(
  status: DealerProspectStatus, i: number,
  หลักฐาน: { มีบันทึกการติดต่อ: boolean; มีใบส่งแล้ว: boolean },
): ผลติ๊กงาน {
  const งาน = งานมาตรฐาน[i];
  if (!งาน) return { ผิด: "ไม่พบงานนี้" };
  if (!ยังติดตามอยู่(status)) return { ผิด: "รายนี้ปิดแล้ว — เปิดติดตามใหม่ก่อน" };
  const ตอนนี้ = ลำดับขั้น(status);
  if (ตอนนี้ > i) return { ผิด: "งานนี้ทำแล้ว" };
  if (ตอนนี้ < i) return { ผิด: "ทำงานก่อนหน้าให้ครบก่อน จึงจะติ๊กงานนี้ได้ (ห้ามข้ามขั้น)" };
  if (งาน.หลักฐาน === "contact" && !หลักฐาน.มีบันทึกการติดต่อ) return { ต้องทำก่อน: "contact" };
  if (งาน.หลักฐาน === "proposal" && !หลักฐาน.มีใบส่งแล้ว) return { ต้องทำก่อน: "proposal" };
  return { ขั้นใหม่: งาน.ไปขั้น };
}

/** ข้อความเมื่อคนจะย้อนขั้น — ชุดเดียวกับตัวกันขั้นของฐาน (ใบปรับฐานงานบอร์ด) */
export const ข้อความย้อนขั้นไม่ได้ = "ย้อนขั้นไม่ได้ — เลื่อนได้ทีละขั้นไปข้างหน้าเท่านั้น (ระบบถอยให้เองเมื่อใบค่าแฟรนไชส์ถูกปฏิเสธ/หมดอายุ)";
/** ยกเลิกงานที่ติ๊กแล้ว = ย้อนขั้น → ไม่ได้ (บอสสั่ง 5 พ.ย. 69 · ห้ามคนข้าม/ถอยขั้น · เดิมยกเลิกงานล่าสุดได้ = ถอยทีละขั้น) */
export function ยกเลิกงาน(status: DealerProspectStatus, _i: number): { ขั้นใหม่: DealerProspectStatus } | { ผิด: string } {
  if (!ยังติดตามอยู่(status)) return { ผิด: "รายนี้ปิดแล้ว — เปิดติดตามใหม่ก่อน" };
  return { ผิด: ข้อความย้อนขั้นไม่ได้ };
}

/** กติกาเปลี่ยนขั้นชุดเดียวกับฐานข้อมูล (0174) — คืนข้อความ หรือ null ถ้าเปลี่ยนได้ */
export function ตรวจเปลี่ยนขั้น(
  จาก: DealerProspectStatus, ไป: DealerProspectStatus,
  ctx: { มีใบส่งแล้ว: boolean; dealerCode?: string | null },
): string | null {
  if (จาก === ไป) return null;
  if (จาก === "won") return "รายนี้เป็นดีลเลอร์แล้ว เปลี่ยนขั้นไม่ได้";
  if (ไป === "won") return ctx.dealerCode ? null : "สถานะ “เป็นดีลเลอร์แล้ว” ต้องผูกกับดีลเลอร์";
  if (ไป === "lost") return null;
  if (จาก !== "lost" && ลำดับขั้น(ไป) < ลำดับขั้น(จาก)) return ข้อความย้อนขั้นไม่ได้;   // คนถอยขั้นไม่ได้ (บอสสั่ง 5 พ.ย. 69)
  if (จาก !== "lost" && Math.abs(ลำดับขั้น(ไป) - ลำดับขั้น(จาก)) !== 1) {
    return `เลื่อนขั้นได้ทีละขั้น ห้ามข้ามขั้น (${prospectStatusLabel[จาก]} → ${prospectStatusLabel[ไป]})`;
  }
  if (ไป === "considering" && !ctx.มีใบส่งแล้ว) return `ต้องส่งใบค่าแฟรนไชส์ก่อน ถึงจะเป็น “${prospectStatusLabel.considering}”`;
  return null;
}

/** เรียงประวัติ ใหม่ก่อน (เวลาเท่ากัน = รหัสมากก่อน) */
export const ประวัติใหม่ก่อน = (a: ProspectActivity, b: ProspectActivity) =>
  String(b.createdAt).localeCompare(String(a.createdAt)) || b.id - a.id;

/** เปิดติดตามใหม่จาก "ไม่สำเร็จ" → กลับไปขั้นก่อนปิด (อ่านจากประวัติ)
 *  ไม่รู้ขั้นเดิม = รอติดต่อ · ขั้นเดิมคือรอตัดสินใจแต่ไม่มีใบที่ส่งแล้ว = นัดคุยแล้ว (กติกาของขั้นนั้น) */
export function ขั้นก่อนไม่สำเร็จ(ประวัติ: ProspectActivity[], มีใบส่งแล้ว: boolean): DealerProspectStatus {
  const ล่าสุด = [...ประวัติ].sort(ประวัติใหม่ก่อน).find(a => a.kind === "status" && a.toStatus === "lost");
  const เดิม = ล่าสุด?.fromStatus;
  const ขั้น: DealerProspectStatus = เดิม && ลำดับขั้น(เดิม) >= 0 ? เดิม : "new";
  return ขั้น === "considering" && !มีใบส่งแล้ว ? "meeting" : ขั้น;
}

// ── ข้อความในประวัติ — ชุดเดียวกับตัวดักของฐานข้อมูล (โหมดเดโมใช้) ──
export const ข้อความเพิ่มราย = (s: DealerProspectStatus) =>
  // ข้อความนี้ต้องตรงกับที่ตัวดักฐานข้อมูลเขียนลงประวัติ (ใบ 0174) — คงคำเดิม แม้ชื่อเมนูเปลี่ยนเป็น "ผู้สนใจเป็นดีลเลอร์" (รอบ 4)
  "เพิ่มลูกค้าเป้าหมาย" + (s !== "new" ? ` · ขั้น ${prospectStatusLabel[s]}` : "");

export function ข้อความเปลี่ยนขั้น(
  จาก: DealerProspectStatus, ไป: DealerProspectStatus,
  p: Pick<DealerProspect, "dealerCode" | "lostReason">,
): string {
  if (ไป === "won") return `เป็นดีลเลอร์แล้ว · รหัส ${p.dealerCode || "—"}`;
  if (ไป === "lost") return "ปิดว่าไม่สำเร็จ" + (p.lostReason?.trim() ? ` · เหตุผล: ${p.lostReason.trim()}` : "");
  if (จาก === "lost") return `เปิดติดตามใหม่ · ${prospectStatusLabel[ไป]}`;
  return `${prospectStatusLabel[จาก]} → ${prospectStatusLabel[ไป]}`;
}

export const ข้อความใบเสนอ = (เลขที่: string, สถานะ: DealerProposalStatus, ออกใหม่: boolean) =>
  `${ออกใหม่ ? "ออกใบค่าแฟรนไชส์" : "ใบค่าแฟรนไชส์"} ${เลขที่} · ${proposalStatusLabel[สถานะ]}`;

/** ใบถูกปฏิเสธและไม่มีใบที่ส่งแล้ว/ตอบรับเหลือ → ถอยจากรอตัดสินใจกลับนัดคุยแล้ว (ข้อความเดียวกับตัวดัก 0177) */
export const ข้อความถอยเพราะใบถูกปฏิเสธ = (เลขที่: string) =>
  `ใบค่าแฟรนไชส์ ${เลขที่} ถูกปฏิเสธ → กลับไปนัดคุยแล้ว`;

// ── ไม่ได้ติดต่อกี่วัน (สเปก: ตัวกรองไม่ได้ติดต่อ 7 / 14 / 30 วัน) ──
const ห่างจากUTC = 7 * 60 * 60 * 1000;

/** วันที่ตามเวลาไทยของเวลาที่เก็บ (YYYY-MM-DD) — เซิร์ฟเวอร์อยู่ UTC ใช้วันที่ดิบจะคลาดไป 1 วันช่วงเช้า */
export function วันไทยของเวลา(iso: string): string | null {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : new Date(t + ห่างจากUTC).toISOString().slice(0, 10);
}

/** ไม่ได้ติดต่อมากี่วัน — นับจากติดต่อล่าสุด · ยังไม่เคยบันทึกการติดต่อ นับจากวันที่เพิ่มรายชื่อ · ไม่มีข้อมูล = null */
export function วันที่ไม่ได้ติดต่อ(p: Pick<DealerProspect, "lastContactAt" | "createdAt">, วันนี้ISO: string): number | null {
  const ฐาน = p.lastContactAt || p.createdAt;
  const วัน = ฐาน ? วันไทยของเวลา(ฐาน) : null;
  if (!วัน) return null;
  const ต่าง = Math.round((Date.parse(`${วันนี้ISO}T00:00:00Z`) - Date.parse(`${วัน}T00:00:00Z`)) / 86_400_000);
  return Number.isNaN(ต่าง) ? null : Math.max(0, ต่าง);
}

export const เกณฑ์ไม่ได้ติดต่อ = [7, 14, 30] as const;

/** ยังติดตามอยู่ และไม่ได้ติดต่อตั้งแต่ n วันขึ้นไป */
export function ไม่ได้ติดต่อเกิน(p: Pick<DealerProspect, "status" | "lastContactAt" | "createdAt">, วัน: number, วันนี้ISO: string): boolean {
  return ยังติดตามอยู่(p.status) && (วันที่ไม่ได้ติดต่อ(p, วันนี้ISO) ?? -1) >= วัน;
}

/** ข้อความ "ติดต่อล่าสุด" ในตาราง */
export function ติดต่อล่าสุดอ่านง่าย(p: Pick<DealerProspect, "lastContactAt" | "createdAt">, วันนี้ISO: string): string {
  if (!p.lastContactAt) return "ยังไม่เคยติดต่อ";
  const วัน = วันที่ไม่ได้ติดต่อ(p, วันนี้ISO);
  return วัน == null ? "—" : วัน === 0 ? "วันนี้" : `${วัน} วันก่อน`;
}

// ── บันทึกการติดต่อ ──
export const ช่องทางติดต่อ = ["โทรศัพท์", "LINE", "Facebook", "พบตัว", "อีเมล", "อื่น ๆ"] as const;

export const มีบันทึกการติดต่อ = (ประวัติ: Pick<ProspectActivity, "kind">[]) => ประวัติ.some(a => a.kind === "contact");

/** จัดข้อมูลก่อนบันทึก — เซิร์ฟเวอร์เรียกซ้ำเสมอ */
export function เตรียมบันทึกการติดต่อ(x: Partial<ProspectContactInput>): ProspectContactInput {
  return {
    prospectId: Number(x.prospectId),
    channel: String(x.channel ?? "").trim(),
    body: String(x.body ?? "").trim(),
    nextFollowUp: /^\d{4}-\d{2}-\d{2}$/.test(String(x.nextFollowUp ?? "")) ? String(x.nextFollowUp) : null,
  };
}

/** ตรวจบันทึกการติดต่อ — วันนี้ISO ส่งมาเมื่อต้องการกันนัดติดตามย้อนหลัง (หน้าจอ) */
export function ตรวจบันทึกการติดต่อ(x: ProspectContactInput, วันนี้ISO?: string): string | null {
  if (!Number.isInteger(x.prospectId) || x.prospectId <= 0) return "ไม่ได้ระบุผู้สนใจ";
  if (!x.channel) return "ต้องเลือกช่องทางที่ติดต่อ";
  if (x.channel.length > 50) return "ช่องทางยาวเกินไป";
  if (!x.body) return "ต้องบันทึกว่าคุยอะไรไป";
  if (x.body.length > 2000) return "บันทึกยาวเกิน 2,000 ตัวอักษร";
  if (วันนี้ISO && x.nextFollowUp && x.nextFollowUp < วันนี้ISO) return "วันนัดติดตามต้องไม่ย้อนหลัง";
  return null;
}

// ── สถานะย่อยหลังส่งใบค่าแฟรนไชส์ (บอสสั่ง 5 พ.ย. 69 · ขั้น considering ในฐาน) ─────────────────────────────────────────
//   เดินตามใบเอง ไม่มีใครกดเปลี่ยน: ส่งใบแล้ว = รอผู้สนใจตอบรับ · ตอบรับแต่ยังจ่ายไม่ครบ = รอชำระ (จ่ายแล้ว x / y บาท)
//   ตอบรับ + ชำระครบ = พร้อมตั้งเป็นดีลเลอร์ (ปุ่มตั้งเป็นดีลเลอร์กดได้) · ตั้งแล้ว = เป็นดีลเลอร์แล้ว (ขั้น won)
//   กติกาเดียวกับ dealer_conversion_ready ของฐาน: ใบตอบรับใบไหนชำระรวม >= ยอด = พร้อม · ยังไม่ครบ = บอกใบตอบรับล่าสุด (รหัสมากสุด)
//   ความพร้อมคิดจากใบอย่างเดียว (แบบฐาน) — รายที่ยังอยู่ขั้นก่อนหน้าแต่มีใบส่งแล้ว/ตอบรับ ก็ได้สถานะย่อย (ป้ายในตารางเปลี่ยนเฉพาะขั้น considering)
export type ขั้นย่อยใบ = { key: "รอตอบรับ" | "รอชำระ" | "พร้อม"; label: string; ชำระ?: number; ยอด?: number; เลขที่?: string | null };
export const ชื่อขั้นย่อย = { รอตอบรับ: "รอผู้สนใจตอบรับ", รอชำระ: "รอชำระ", พร้อม: "พร้อมตั้งเป็นดีลเลอร์" } as const;
const บาท = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 2 });
export function ขั้นย่อยหลังส่งใบ(
  status: DealerProspectStatus,
  ใบ: readonly { id: number; status: DealerProposalStatus; amount?: number | null; proposalNo?: string | null }[],
  ชำระรวม: ReadonlyMap<number, number>,
): ขั้นย่อยใบ | null {
  if (!ยังติดตามอยู่(status)) return null;
  if (status !== "considering" && !ใบ.some(p => p.status === "sent" || p.status === "accepted")) return null;
  const ตอบรับ = ใบ.filter(p => p.status === "accepted").sort((a, b) => b.id - a.id);
  if (ตอบรับ.some(p => (ชำระรวม.get(p.id) ?? 0) >= Number(p.amount ?? 0))) return { key: "พร้อม", label: ชื่อขั้นย่อย.พร้อม };
  const ล่าสุด = ตอบรับ[0];
  if (ล่าสุด) {
    const ชำระ = ชำระรวม.get(ล่าสุด.id) ?? 0, ยอด = Number(ล่าสุด.amount ?? 0);
    return { key: "รอชำระ", label: `${ชื่อขั้นย่อย.รอชำระ} (จ่ายแล้ว ${บาท(ชำระ)} / ${บาท(ยอด)} บาท)`, ชำระ, ยอด, เลขที่: ล่าสุด.proposalNo };
  }
  return { key: "รอตอบรับ", label: ชื่อขั้นย่อย.รอตอบรับ };
}

/** ปุ่ม "ตั้งเป็นดีลเลอร์" กดได้เมื่อพร้อมเท่านั้น (บอสสั่ง 5 พ.ย. 69) — null = พร้อม · ข้อความ = เหตุที่ยังกดไม่ได้ (ฐานตรวจซ้ำ dealer_conversion_ready) */
export function เหตุยังตั้งดีลเลอร์ไม่ได้(status: DealerProspectStatus, ย่อย: ขั้นย่อยใบ | null | undefined): string | null {
  if (status === "won") return "รายนี้เป็นดีลเลอร์แล้ว";
  if (ย่อย?.key === "พร้อม") return null;
  if (ย่อย?.key === "รอชำระ") return `ยังชำระไม่ครบ — จ่ายแล้ว ${บาท(ย่อย.ชำระ ?? 0)} / ${บาท(ย่อย.ยอด ?? 0)} บาท`;
  if (ย่อย?.key === "รอตอบรับ") return "รอผู้สนใจตอบรับใบค่าแฟรนไชส์ — ตอบรับแล้วชำระค่าแรกเข้าให้ครบก่อน";
  return "ต้องส่งใบค่าแฟรนไชส์ ให้ผู้สนใจตอบรับ และชำระค่าแรกเข้าครบก่อน";
}
