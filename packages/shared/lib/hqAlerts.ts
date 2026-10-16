// ─── การแจ้งเตือนของสำนักงานใหญ่ (คำนวณล้วน) ──────────────────────────────────
// แหล่งเดียวของ "กฎแจ้งเตือน" ที่ตั้งไว้ที่ /hq/settings → การแจ้งเตือน
// ขอบเขต = งานของสำนักงานใหญ่เองเท่านั้น (บอสสั่ง 14 ก.ย. 69) — ลูกค้าเป้าหมาย (HQ) · ใบค่าแฟรนไชส์ · แคตตาล็อกแม่แบบ
//   งานขายของดีลเลอร์ (ลูกค้าเป้าหมาย/ใบเสนอราคาของสาขา) ไม่ขึ้นที่นี่อีกแล้ว — ห้ามเติมกลับ
// ทุกข้อคำนวณจากข้อมูลจริงเท่านั้น — ไม่มีตัวเลขสังเคราะห์
// ผลลัพธ์เป็นข้อมูลล้วน (ไม่มี JSX) → Topbar เอาไปใส่ไอคอนแล้วขึ้นกระดิ่ง
import {
  เกณฑ์วันแจ้งเตือน, fmtISOToThai,
  type HQAlertKey, type HQNotifRules, type LeadRules, type LeadRow,
} from "@pms/shared/lib/mock";
import type { DealerProspect, DealerPackageProposal } from "@pms/shared/lib/data/types";
import { APP_NOW } from "@pms/shared/lib/appTime";
import { leadCreatedDate, isLeadOpen } from "@pms/shared/lib/leadMetrics";
import { ถึงกำหนดติดตาม, ยังติดตามอยู่ } from "@pms/shared/lib/dealerProspects";
import { วันที่ไม่ได้ติดต่อ, ไม่ได้ติดต่อเกิน, วันไทยของเวลา } from "@pms/shared/lib/prospectJourney";
import { หมดอายุแล้ว, packageLabel } from "@pms/shared/lib/dealerProposals";

/** subject = ชื่อสิ่งที่ต้องจัดการ (ลูกค้าเป้าหมาย/แม่แบบ) · detail = เกิดอะไรขึ้น สั้น ๆ บรรทัดเดียว
 *  กระดิ่งแสดงทีละรายการ: เรื่อง → ใคร → เกิดอะไร (บอสสั่ง 22 ก.ย. 69 "แจ้งเตือนทีละอันแบบเข้าใจง่าย")
 *  body = ข้อความเต็มบรรทัดเดียว (เดิม) ยังเก็บไว้ให้ที่อื่น/ชุดทดสอบใช้ */
export type HQAlert = { key: HQAlertKey; title: string; body: string; href: string; subject?: string; detail?: string };


/** ลูกค้าเป้าหมายของสาขาที่ยังไม่มีผู้รับผิดชอบ นานเกินเกณฑ์ของ "สาขาเจ้าของลูกค้าเป้าหมาย" — นับจากวันที่สร้าง
 *  ไม่ได้ขึ้นกระดิ่ง HQ แล้ว — ยังใช้เป็นตัวกรองในหน้า /hq/leads */
export function unassignedLeads(leads: LeadRow[], rulesOf: (dealerCode: string | undefined) => LeadRules): LeadRow[] {
  return leads.filter(l => {
    if (l.assigned?.trim()) return false;
    if (!isLeadOpen(l)) return false; // ปิดแล้วไม่ต้องหาคนรับผิดชอบ
    const hours = rulesOf(l.dealerCode).unassignedAlertHours;
    return (APP_NOW.getTime() - leadCreatedDate(l).getTime()) / 3_600_000 > hours;
  });
}

/** ห่างกันกี่วัน (วันที่ YYYY-MM-DD) */
const ห่างกี่วัน = (จาก: string, ถึง: string) =>
  Math.round((Date.parse(`${ถึง}T00:00:00Z`) - Date.parse(`${จาก}T00:00:00Z`)) / 86_400_000);

/** ใบที่ส่งแล้วรอคำตอบมากี่วัน — นับจากวันที่เสนอในใบ · ไม่ได้กรอกวันที่เสนอ นับจากแก้ล่าสุด
 *  (ส่งแล้วเนื้อหาถูกล็อก · 0172 — แก้ล่าสุดจึงเป็นตอนกดส่ง) · ไม่มีวันให้นับ = null ไม่เดา */
export function ใบรอคำตอบมากี่วัน(p: Pick<DealerPackageProposal, "status" | "proposedDate" | "updatedAt">, วันนี้ISO: string): number | null {
  if (p.status !== "sent") return null;
  const ฐาน = p.proposedDate || (p.updatedAt ? วันไทยของเวลา(p.updatedAt) : null);
  if (!ฐาน) return null;
  const วัน = ห่างกี่วัน(ฐาน, วันนี้ISO);
  return Number.isNaN(วัน) ? null : Math.max(0, วัน);
}

/** รวมการแจ้งเตือนทุกข้อตามกฎที่เปิดไว้ (เฉพาะข้อที่ inapp = ขึ้นกระดิ่ง)
 *  prospects/proposals = undefined → ยังโหลดไม่เสร็จ ข้ามเรื่องนั้นไปก่อน (ไม่ใช่ "ไม่มีข้อมูล") */
export function buildHQAlerts(input: {
  rules: HQNotifRules;
  prospects?: DealerProspect[];
  proposals?: DealerPackageProposal[];
  วันนี้ISO: string;
}): HQAlert[] {
  const { rules, prospects, proposals, วันนี้ISO } = input;
  const on = (k: HQAlertKey) => rules.alerts[k]?.on && rules.alerts[k]?.inapp;
  const out: HQAlert[] = [];
  const เปิดราย = (id: number) => `/hq/prospects?open=${id}`;
  const ชื่อราย = new Map((prospects ?? []).map(p => [p.id, p.name]));

  if (prospects && on("prospectFollowUpDue")) {
    // เลยนัดนานสุดขึ้นก่อน
    for (const p of prospects.filter(x => ถึงกำหนดติดตาม(x, วันนี้ISO)).sort((a, b) => (a.followUp ?? "").localeCompare(b.followUp ?? ""))) {
      const เลย = ห่างกี่วัน(p.followUp!, วันนี้ISO);
      out.push({
        key: "prospectFollowUpDue",
        title: "ถึงกำหนดติดตามลูกค้าเป้าหมาย (HQ)",
        body: `${p.name} · นัดติดตาม ${fmtISOToThai(p.followUp!)}${เลย > 0 ? ` (เลยมา ${เลย} วัน)` : " (วันนี้)"} · ผู้ดูแล ${p.assigned || "—"}`,
        href: เปิดราย(p.id),
        subject: p.name,
        detail: `${เลย > 0 ? `เลยนัดมา ${เลย} วัน` : "นัดไว้วันนี้"} (นัด ${fmtISOToThai(p.followUp!)})${p.assigned ? ` · ผู้ดูแล ${p.assigned}` : ""}`,
      });
    }
  }
  if (prospects && on("prospectIdle")) {
    const วัน = เกณฑ์วันแจ้งเตือน(rules, "prospectIdle");
    const rows = prospects
      .filter(p => ไม่ได้ติดต่อเกิน(p, วัน, วันนี้ISO))
      .map(p => ({ p, เงียบ: วันที่ไม่ได้ติดต่อ(p, วันนี้ISO) ?? 0 }))
      .sort((a, b) => b.เงียบ - a.เงียบ);
    for (const { p, เงียบ } of rows) out.push({
      key: "prospectIdle",
      title: "ลูกค้าเป้าหมาย (HQ) ไม่ได้ติดต่อนาน",
      body: `${p.name} · ${p.lastContactAt ? `ไม่ได้ติดต่อ ${เงียบ} วัน` : `ยังไม่เคยบันทึกการติดต่อ (เพิ่มมา ${เงียบ} วัน)`} · ผู้ดูแล ${p.assigned || "—"}`,
      href: เปิดราย(p.id),
      subject: p.name,
      detail: `${p.lastContactAt ? `ไม่ได้ติดต่อมา ${เงียบ} วัน` : `ยังไม่เคยบันทึกการติดต่อ · เพิ่มมา ${เงียบ} วัน`}${p.assigned ? ` · ผู้ดูแล ${p.assigned}` : ""}`,
    });
  }
  if (proposals) {
    // ลูกค้าเป้าหมายที่จบแล้ว (เป็นดีลเลอร์/ไม่สำเร็จ) ไม่ต้องตามใบของรายนั้นอีก
    const จบแล้ว = new Set((prospects ?? []).filter(p => !ยังติดตามอยู่(p.status)).map(p => p.id));
    const ใบค้าง = proposals.filter(q => q.status === "sent" && !จบแล้ว.has(q.prospectId));
    const เลขใบ = (q: DealerPackageProposal) => `${q.proposalNo || "ใบค่าแฟรนไชส์"} · ${ชื่อราย.get(q.prospectId) ?? "—"} · ${packageLabel[q.package] ?? q.package}`;
    if (on("proposalExpired")) {
      for (const q of ใบค้าง.filter(x => หมดอายุแล้ว(x, วันนี้ISO)).sort((a, b) => (a.validUntil ?? "").localeCompare(b.validUntil ?? ""))) out.push({
        key: "proposalExpired",
        title: "ใบค่าแฟรนไชส์เลยวันมีผล",
        body: `${เลขใบ(q)} · มีผลถึง ${fmtISOToThai(q.validUntil!)} ยังไม่มีคำตอบ`,
        href: เปิดราย(q.prospectId),
        subject: ชื่อราย.get(q.prospectId) ?? "—",
        detail: `${q.proposalNo || "ใบค่าแฟรนไชส์"} (${packageLabel[q.package] ?? q.package}) หมดอายุ ${fmtISOToThai(q.validUntil!)} ยังไม่ตอบ`,
      });
    }
    if (on("proposalAwaiting")) {
      const วัน = เกณฑ์วันแจ้งเตือน(rules, "proposalAwaiting");
      // ใบที่เลยวันมีผลแล้วอยู่เรื่องด้านบน — ไม่นับซ้ำสองกลุ่ม
      const rows = ใบค้าง
        .filter(q => !หมดอายุแล้ว(q, วันนี้ISO))
        .map(q => ({ q, รอ: ใบรอคำตอบมากี่วัน(q, วันนี้ISO) }))
        .filter((x): x is { q: DealerPackageProposal; รอ: number } => x.รอ != null && x.รอ >= วัน)
        .sort((a, b) => b.รอ - a.รอ);
      for (const { q, รอ } of rows) out.push({
        key: "proposalAwaiting",
        title: "ใบค่าแฟรนไชส์รอคำตอบ",
        body: `${เลขใบ(q)} · ส่งแล้ว ${รอ} วัน ยังไม่ตอบรับหรือปฏิเสธ`,
        href: เปิดราย(q.prospectId),
        subject: ชื่อราย.get(q.prospectId) ?? "—",
        detail: `${q.proposalNo || "ใบค่าแฟรนไชส์"} (${packageLabel[q.package] ?? q.package}) ส่งไป ${รอ} วัน ยังไม่ตอบ`,
      });
    }
  }
  return out;
}
