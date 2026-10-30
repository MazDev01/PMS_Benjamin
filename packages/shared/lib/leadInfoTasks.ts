// ── "เก็บข้อมูลลูกค้า" / "สรุปความต้องการ" ระบบติ๊กเองเมื่อข้อมูลหมวดนั้นครบ (บอสสั่ง 30 ต.ค. 69 · ใบ 0263) ──────────────────
// ของจริงคิดที่ฐาน (ตัวดัก leads_tasks_info_auto · _lead_customer_info_complete / _lead_job_info_complete)
// ไฟล์นี้ = สูตรเดียวกันสำหรับโหมดในเครื่อง (applyLeadIntent · leadIntent.ts) — แก้ที่หนึ่งต้องแก้อีกที่ (ข้อทดสอบ tests/unit/leadInfoTasks.test.ts)
import type { LeadRow, LeadTask } from "./mock";

type ข้อมูล = Pick<LeadRow, "company" | "contact" | "phone" | "province" | "project" | "note"> & { area?: number | string | null };   // ฐานเก็บพื้นที่เป็นข้อความ · หน้าเว็บเป็นตัวเลข
const มี = (v: unknown) => String(v ?? "").trim() !== "";

/** หมวดข้อมูลลูกค้าครบ: ชื่อบริษัท · ผู้ติดต่อ · โทรศัพท์ */
export const ข้อมูลลูกค้าครบ = (l: Partial<ข้อมูล>) => มี(l.company) && มี(l.contact) && มี(l.phone);
/** หมวดข้อมูลงานครบ: จังหวัดหน้างาน · งานที่ต้องการ · พื้นที่ (ตัวเลข > 0) · สเปก */
export const ข้อมูลงานครบ = (l: Partial<ข้อมูล>) => {
  const พื้นที่ = String(l.area ?? "").trim();
  return มี(l.province) && มี(l.project) && มี(l.note) && /^[0-9]+(\.[0-9]+)?$/.test(พื้นที่) && Number(พื้นที่) > 0;
};

/** รายการงานหลังคิดติ๊ก 2 รายการ — ลีดปิดแล้วไม่แตะ · ยังไม่มีรายการและไม่ครบสักหมวด = คงเดิม */
export function ติ๊กข้อมูลอัตโนมัติ(tasks: LeadTask[] | undefined, lead: Partial<ข้อมูล> & { status?: string; assigned?: string },
                                   แม่แบบ: () => LeadTask[], now: string): LeadTask[] | undefined {
  if (lead.status === "PAID" || lead.status === "CANCELLED") return tasks;
  const ลูกค้า = ข้อมูลลูกค้าครบ(lead), งาน = ข้อมูลงานครบ(lead);
  let t = tasks ?? [];
  if (!t.length) { if (!ลูกค้า && !งาน) return tasks; t = แม่แบบ(); }
  const ผู้ทำ = (lead.assigned ?? "").trim() || "อัปเดตอัตโนมัติ";
  const ตั้ง = (key: string, label: string, ครบ: boolean) => {
    if (!t.some(x => x.key === key)) t = [...t, { key, label, done: false }];
    t = t.map(x => x.key !== key ? x
      : ครบ ? (x.done ? x : { ...x, done: true, doneAt: now, doneBy: ผู้ทำ })
      : { key: x.key, label: x.label, done: false });
  };
  ตั้ง("collect", "เก็บข้อมูลลูกค้า", ลูกค้า);
  ตั้ง("requirement", "สรุปความต้องการ", งาน);
  return t;
}
