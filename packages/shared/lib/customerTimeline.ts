// ── เส้นเวลาของลูกค้า (แท็บ "ประวัติ" ในหน้าต่างลูกค้า HQ + ดีลเลอร์ · บอสสั่ง 19 พ.ย. 69) ─────────────────────────────────
//   รวมเหตุการณ์ที่ระบบบันทึกจริงของทุกงาน (ลูกค้าเป้าหมาย) ของลูกค้ารายนี้ เรียงใหม่สุดก่อน:
//     เป็นลูกค้าเป้าหมาย (วันสร้างลีด) · ขอราคา (วันส่งคำขอ) · ไทม์ไลน์ลีด (HQ ส่งใบ · ออก/ส่งใบ · ตอบรับ/ปฏิเสธ/ย้อน · บันทึกการติดต่อ)
//     · นัดหมาย (วัน/เวลานัด + สถานะ) · บันทึกของลูกค้า · เป็นลูกค้า (วันสร้างลูกค้า)
//   ห้ามเหตุการณ์ที่ระบบคิดเอง (เช่น วันปิด + 90 วัน) · ไม่มีวันที่ = ไม่แสดง
//   นัดหมายในไทม์ไลน์ลีด (ชนิด meeting) ไม่เอา — ใช้แถวนัดหมายจริงแทน (ไม่ซ้ำ)
//   งานของลูกค้า = ลีดที่ผูกลูกค้ารายนี้ + ลีดของใบเสนอราคาที่ผูกลูกค้ารายนี้ (สาขาเดียวกันเสมอ · เลขซ้ำข้ามสาขาได้)
//   อ่านด้วยสิทธิ์ของผู้เรียก (ดีลเลอร์เห็นเฉพาะสาขาตัวเอง · HQ ทั้งเครือ) · ข้อทดสอบ tests/unit/customerTimeline.test.ts · customer-timeline.spec
import type { SupabaseClient } from "@supabase/supabase-js";
import { ป้ายของ, รายการตั้งต้นของ, จากแถว, type ตัวเลือกกลาง } from "./optionLists";

export type ชนิดเหตุการณ์ = "lead" | "request" | "activity" | "appointment" | "note" | "customer";
export type เหตุการณ์ลูกค้า = {
  /** เวลา ISO (มีเขตเวลา) */
  at: string;
  ชนิด: ชนิดเหตุการณ์;
  ข้อความ: string;
  /** งานที่เหตุการณ์นี้อยู่ (ชื่องาน/บริษัทของลีด) — ไม่มี = เหตุการณ์ของลูกค้าเอง */
  งาน?: string;
};

type แถว = Record<string, unknown>;
export type ข้อมูลเส้นเวลา = {
  ลูกค้า: แถว | null; ลีด: แถว[]; คำขอ: แถว[]; นัด: แถว[]; บันทึก: แถว[];
  /** ประเภทนัดหมายจากรายการกลาง (ใบ 0296) — ไม่ส่ง = ค่าตั้งต้น */
  ประเภทนัด?: ตัวเลือกกลาง[];
};

const เดือน: Record<string, number> = { "ม.ค.": 1, "ก.พ.": 2, "มี.ค.": 3, "เม.ย.": 4, "พ.ค.": 5, "มิ.ย.": 6, "ก.ค.": 7, "ส.ค.": 8, "ก.ย.": 9, "ต.ค.": 10, "พ.ย.": 11, "ธ.ค.": 12 };
const สอง = (n: number) => String(n).padStart(2, "0");
/** "17 ต.ค. 2569 · 15:01" → ISO เวลาไทย · อ่านไม่ได้ = null */
export function เวลาจากป้ายไทย(s: unknown): string | null {
  // บางแถว (ข้อมูลตั้งต้น/นำเข้า) เก็บวันที่แบบ ISO "2026-04-25" — ไม่มีเวลา = เที่ยง
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s ?? "").trim());
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}T12:00:00+07:00`;
  const m = /^(\d{1,2})\s+(\S+)\s+(\d{4})(?:\s*·\s*(\d{1,2}):(\d{2}))?/.exec(String(s ?? "").trim());
  if (!m || !(m[2] in เดือน)) return null;
  return `${+m[3] - 543}-${สอง(เดือน[m[2]])}-${สอง(+m[1])}T${สอง(+(m[4] ?? 12))}:${m[5] ?? "00"}:00+07:00`;
}
const ISO = (v: unknown): string | null => {
  if (typeof v !== "string" || !v) return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
};
const สถานะนัด: Record<string, string> = { upcoming: "กำลังจะมาถึง", scheduled: "กำลังจะมาถึง", done: "เสร็จแล้ว", completed: "เสร็จแล้ว", cancelled: "ยกเลิก" };
// ชื่อประเภทนัด = รายการกลาง "appointment_type" (ใบ 0296) — ไม่ตรงรายการ = "‹ค่า› (ตามที่บันทึกไว้)" · ไม่มีประเภท = "นัดหมาย"

/** ประกอบเหตุการณ์จากแถวที่อ่านมา (ฟังก์ชันล้วน) — ใหม่สุดก่อน */
export function ประกอบเส้นเวลา(d: ข้อมูลเส้นเวลา): เหตุการณ์ลูกค้า[] {
  const ผล: เหตุการณ์ลูกค้า[] = [];
  const ประเภทนัด = d.ประเภทนัด ?? รายการตั้งต้นของ("appointment_type");
  const เพิ่ม = (at: string | null, ชนิด: ชนิดเหตุการณ์, ข้อความ: string, งาน?: string) => { if (at && ข้อความ.trim()) ผล.push({ at, ชนิด, ข้อความ: ข้อความ.trim(), ...(งาน ? { งาน } : {}) }); };
  const ชื่องาน = new Map<number, string>();
  for (const l of d.ลีด) {
    const งาน = String(l.project || l.company || "").trim() || undefined;
    ชื่องาน.set(Number(l.num_id), งาน ?? "");
    เพิ่ม(ISO(l.created_at), "lead", "เป็นลูกค้าเป้าหมาย", งาน);
    for (const a of (Array.isArray(l.activities) ? l.activities : []) as แถว[]) {
      if (a.type === "meeting") continue;   // นัดหมาย = แถวนัดจริงด้านล่าง
      เพิ่ม(ISO(a.at) ?? เวลาจากป้ายไทย(a.date), "activity", String(a.text ?? ""), งาน);
    }
  }
  for (const r of d.คำขอ) {
    const พื้นที่ = Number(r.area) > 0 ? ` · ${Number(r.area).toLocaleString("en-US")} ตร.ม.` : "";
    เพิ่ม(ISO(r.submitted_at), "request", `ขอราคาจาก HQ ${String(r.request_no ?? "")}${พื้นที่}`, ชื่องาน.get(Number(r.lead_num_id)) || undefined);
  }
  for (const a of d.นัด) {
    const วัน = /^\d{4}-\d{2}-\d{2}$/.test(String(a.date ?? "")) ? `${a.date}T${/^\d{1,2}:\d{2}$/.test(String(a.time ?? "")) ? สอง(+String(a.time).split(":")[0]) + ":" + String(a.time).split(":")[1] : "09:00"}:00+07:00` : null;
    const ส่วน = [ป้ายของ(ประเภทนัด, a.type == null ? null : String(a.type), "นัดหมาย"), สถานะนัด[String(a.status)] ?? "", String(a.note ?? "").trim()].filter(Boolean);
    เพิ่ม(วัน, "appointment", ส่วน.join(" · "), ชื่องาน.get(Number(a.lead_id)) || String(a.project ?? "").trim() || undefined);
  }
  for (const n of d.บันทึก) {
    เพิ่ม(ISO(n.created_at), "note", `บันทึก: ${String(n.title ?? "").trim()}${n.author ? ` (${String(n.author).trim()})` : ""}`);
  }
  if (d.ลูกค้า) เพิ่ม(ISO(d.ลูกค้า.created_at), "customer", "เป็นลูกค้า");
  return ผล.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

/** อ่านแถวที่เกี่ยวข้องของลูกค้า (สาขา + เลขลูกค้า) ด้วยสิทธิ์ของผู้เรียก แล้วประกอบเส้นเวลา */
export async function อ่านเส้นเวลาลูกค้า(sb: SupabaseClient, dealer: string, customerId: number): Promise<เหตุการณ์ลูกค้า[]> {
  const ตก = (e: { message: string } | null) => { if (e) throw new Error(e.message); };
  const [ลูกค้า, ใบ, บันทึก] = await Promise.all([
    sb.from("customers").select("created_at").eq("dealer_code", dealer).eq("id", customerId).maybeSingle(),
    sb.from("quotations").select("deal_id").eq("dealer_code", dealer).eq("customer_id", customerId).not("deal_id", "is", null),
    sb.from("customer_notes").select("title, author, created_at").eq("dealer_code", dealer).eq("customer_id", customerId),
  ]);
  ตก(ลูกค้า.error); ตก(ใบ.error); ตก(บันทึก.error);
  const เลขจากใบ = [...new Set((ใบ.data ?? []).map(q => Number((q as แถว).deal_id)))];
  const ลีด = await sb.from("leads").select("num_id, company, project, created_at, activities").eq("dealer_code", dealer)
    .or(`customer_id.eq.${customerId}${เลขจากใบ.length ? `,num_id.in.(${เลขจากใบ.join(",")})` : ""}`);
  ตก(ลีด.error);
  const เลข = (ลีด.data ?? []).map(l => Number((l as แถว).num_id));
  const [คำขอ, นัด] = เลข.length ? await Promise.all([
    sb.from("quote_requests").select("request_no, lead_num_id, area, submitted_at").eq("dealer_code", dealer).in("lead_num_id", เลข),
    sb.from("appointments").select("lead_id, project, date, time, type, status, note").eq("dealer_code", dealer).in("lead_id", เลข),
  ]) : [{ data: [], error: null }, { data: [], error: null }];
  ตก(คำขอ.error); ตก(นัด.error);
  const ประเภท = นัด.data?.length ? await sb.from("option_lists").select("*").eq("list", "appointment_type") : { data: null, error: null };
  ตก(ประเภท.error);
  return ประกอบเส้นเวลา({ ...(ประเภท.data ? { ประเภทนัด: (ประเภท.data as แถว[]).map(จากแถว) } : {}), ลูกค้า: (ลูกค้า.data as แถว | null) ?? null, ลีด: (ลีด.data ?? []) as แถว[],
    คำขอ: (คำขอ.data ?? []) as แถว[], นัด: (นัด.data ?? []) as แถว[], บันทึก: (บันทึก.data ?? []) as แถว[] });
}
