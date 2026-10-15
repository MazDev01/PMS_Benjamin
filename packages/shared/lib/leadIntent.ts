// ── เจตนาบันทึกลูกค้าเป้าหมาย: ส่งเฉพาะส่วนต่าง ไม่ส่งทั้งแถว (บอสสั่ง 15 ต.ค. 69 · ก่อนขึ้นระบบจริง ข้อ 14) ─────────────
//
// ทางเขียน leads ของแอปมีทางเดียว: SalesContext.บันทึกลีด(id, เจตนา) → repo.leads.apply → ฐาน lead_apply (ใบ 0211)
//   ช่องที่ฐานเป็นเจ้าของ (ขั้น · งาน · ไทม์ไลน์ · เหตุผลปิดไม่สำเร็จ) ส่งเป็น "เจตนา" เท่านั้น — ไม่ส่งค่าทั้งชุด
//   ฐานรวมกับค่าล่าสุดของตัวเอง → หน้าที่เปิดค้างไว้ถือสำเนาเก่า ก็ไม่ทับงานที่ฐาน/แท็บอื่นเพิ่งติ๊ก
// applyLeadIntent = สำเนาตรรกะเดียวกับ lead_apply สำหรับโหมดตัวอย่าง (ไม่มีฐาน) และแสดงผลทันทีบนจอ
//   ⚠️ แก้ตรรกะที่นี่ต้องแก้ supabase/migrations/0211_lead_apply.sql ด้วย (และกลับกัน) — tests/unit/leadIntent.test.ts
import { stageFromTasks, buildLeadTasks, leadStatusLabel, CLOSE_TASK_KEY,
  type LeadRow, type LeadStatus, type LeadTask, type LeadTaskDef, type LeadActivity } from "./mock";

/** ช่องที่ผู้ใช้แก้ได้ผ่าน fields — ตรงกับรายการใน lead_apply */
export const LEAD_EDITABLE_FIELDS = ["name", "company", "contact", "phone", "email", "province", "product", "category", "value", "area",
  "assigned", "source", "note", "report", "project", "address", "logo", "customerId"] as const;
export type LeadEditableField = (typeof LEAD_EDITABLE_FIELDS)[number];
export type LeadFields = Partial<Pick<LeadRow, LeadEditableField>>;

export type LeadTaskChange = { key: string; done: boolean; label?: string; doneAt?: string; doneBy?: string };
export type LeadIntent = {
  fields?: LeadFields;
  tasks?: LeadTaskChange[];
  /** "any" = ขั้นตามงานล่าสุด (ขึ้น/ลง) · "up" = เลื่อนขึ้นเท่านั้น — ฐานคิดจากงานในฐาน */
  deriveStage?: "any" | "up";
  /** ขั้นที่ผู้ใช้ตั้งใจเปลี่ยนเอง (ลากการ์ด · ปิดการขาย · เปิดใหม่) */
  stage?: { status: LeadStatus; lostReason?: string };
  activities?: { text: string; type: string }[];
  /** false = ไม่จดไทม์ไลน์อัตโนมัติ */
  log?: boolean;
  // กันส่งลูกค้าเป้าหมายทั้งก้อนมาแทนเจตนา: LeadRow มี tasks ชนิดเข้ากันได้ TypeScript จึงยอมให้ส่งทั้งแถวเงียบ ๆ
  //   ประกาศช่องของแถวเป็น never → ส่งทั้งแถวมา = คอมไพล์ไม่ผ่าน
  id?: never; numId?: never; status?: never; company?: never;
};

const RANK: Record<LeadStatus, number> = { WAITING: 0, BULLET: 1, HQ_PRICING: 1, QUOTED: 2, FOLLOWUP: 3, NEGO: 4, PAID: 5, CANCELLED: 2 };

/** ส่วนต่างของช่องที่แก้ได้: after เทียบกับค่าที่หน้าจอเปิดแก้ (before) — ช่องที่ไม่เปลี่ยนไม่ส่ง */
export function diffLeadFields(before: Partial<LeadRow>, after: Partial<LeadRow>): LeadFields {
  const out: Record<string, unknown> = {};
  for (const k of LEAD_EDITABLE_FIELDS) {
    if (!(k in after)) continue;
    const a = after[k], b = before[k];
    const ว่าง = (v: unknown) => v === undefined || v === null || v === "";
    if (ว่าง(a) && ว่าง(b)) continue;
    if (a !== b) out[k] = a ?? "";
  }
  return out as LeadFields;
}

/** ส่วนต่างของงาน: งานที่สถานะ "ทำแล้ว" เปลี่ยนจาก before → after (งานที่ไม่เปลี่ยนไม่ส่ง) */
export function diffLeadTasks(before: LeadTask[] | undefined, after: LeadTask[] | undefined): LeadTaskChange[] {
  const เดิม = new Map((before ?? []).map(t => [t.key, !!t.done]));
  return (after ?? []).filter(t => (เดิม.get(t.key) ?? false) !== !!t.done)
    .map(t => ({ key: t.key, done: !!t.done, label: t.label, ...(t.done ? { doneAt: t.doneAt, doneBy: t.doneBy } : {}) }));
}

export function intentIsEmpty(i: LeadIntent): boolean {
  return !Object.keys(i.fields ?? {}).length && !(i.tasks ?? []).length && !i.stage && !i.deriveStage && !(i.activities ?? []).length;
}

/** แบบเดียวกับ lead_apply — โยน Error ข้อความเดียวกับฐานเมื่อผิดกฎ */
export function applyLeadIntent(lead: LeadRow, intent: LeadIntent, ctx: {
  tpl: LeadTaskDef[]; now: string; hasSentQuote?: () => boolean;
}): LeadRow {
  const f = (intent.fields ?? {}) as Record<string, unknown>;
  const ผิดช่อง = Object.keys(f).find(k => !(LEAD_EDITABLE_FIELDS as readonly string[]).includes(k));
  if (ผิดช่อง) throw new Error(`lead_field_not_allowed: ช่อง "${ผิดช่อง}" แก้ทางนี้ไม่ได้ (ขั้น/งาน/ไทม์ไลน์ ฐานเป็นเจ้าของ)`);
  const จด = intent.log !== false;
  const logs: Omit<LeadActivity, "id">[] = [];

  let tasks: LeadTask[] = lead.tasks && lead.tasks.length ? lead.tasks : buildLeadTasks(ctx.tpl);
  let งานเปลี่ยน = false;
  for (const c of intent.tasks ?? []) {
    if (!c.key) continue;
    if (!tasks.some(t => t.key === c.key)) tasks = [...tasks, { key: c.key, label: c.label ?? c.key, done: false }];
    const เดิม = tasks.find(t => t.key === c.key)!;
    if (c.done && !เดิม.done) {
      tasks = tasks.map(t => t.key !== c.key ? t : { ...t, done: true, doneAt: c.doneAt || ctx.now,
        doneBy: (c.doneBy ?? "").trim() || (lead.assigned ?? "").trim() || "อัปเดตอัตโนมัติ" });
      งานเปลี่ยน = true;
      if (จด) logs.push({ date: ctx.now, icon: "task", type: "task", text: `ทำงาน: ${เดิม.label}` });
    } else if (!c.done && เดิม.done) {
      tasks = tasks.map(t => t.key !== c.key ? t : { key: t.key, label: t.label, done: false });
      งานเปลี่ยน = true;
    }
  }

  let status = lead.status;
  let lostReason = lead.lostReason;
  if (intent.stage) {
    status = intent.stage.status;
    if (status === "CANCELLED" && (intent.stage.lostReason ?? "").trim()) lostReason = intent.stage.lostReason!.trim();
  } else if (intent.deriveStage && !["HQ_PRICING", "PAID", "CANCELLED"].includes(lead.status)) {
    const ตามงาน = stageFromTasks(tasks, ctx.tpl.filter(d => d.key !== CLOSE_TASK_KEY));
    status = intent.deriveStage === "up" && RANK[ตามงาน] <= RANK[lead.status] ? lead.status : ตามงาน;
  }
  if (status !== lead.status) {
    if (status === "PAID" && ctx.hasSentQuote && !ctx.hasSentQuote())
      throw new Error("lead_close_needs_sent_quote: ปิดการขายสำเร็จไม่ได้ — ต้องมีใบเสนอราคาที่ส่งให้ลูกค้าแล้วอย่างน้อยหนึ่งใบ");
    if (status === "CANCELLED" && !(lostReason ?? "").trim())
      throw new Error("lead_lost_needs_reason: ปิดการขายไม่สำเร็จต้องระบุเหตุผลเสมอ");
    if (จด) logs.push({ date: ctx.now, icon: "task", type: "task", text: `เปลี่ยนขั้นเป็น "${leadStatusLabel[status]}"` });
  }
  const ผู้รับผิดชอบ = typeof f.assigned === "string" ? f.assigned.trim() : "";
  if (จด && ผู้รับผิดชอบ && f.assigned !== lead.assigned)
    logs.push({ date: ctx.now, icon: "note", type: "note", text: `เปลี่ยนผู้รับผิดชอบเป็น ${f.assigned}` });
  for (const a of intent.activities ?? []) {
    if (!a.text?.trim()) continue;
    logs.push({ date: ctx.now, icon: a.type || "task", type: a.type || "task", text: a.text });
  }

  const next: LeadRow = { ...lead, ...(f as Partial<LeadRow>), status, lostReason };
  if (งานเปลี่ยน) next.tasks = tasks;
  // ไทม์ไลน์ไม่อยู่ในมือ (รายการไม่ดึงมา) = ไม่เดา — รอค่าจริงจากฐาน
  if (logs.length && lead.activities) {
    let n = lead.activities.reduce((m, a) => Math.max(m, Number(a.id) || 0), 0);
    next.activities = [...lead.activities, ...logs.map(a => ({ ...a, id: ++n }))];
  }
  return next;
}

/** รูปที่ส่งเข้าฐาน (lead_apply): ชื่อช่องแบบฐาน · area เป็นข้อความ · customerId 0 = ไม่มีลูกค้า */
export function leadIntentToWire(i: LeadIntent): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(i.fields ?? {})) {
    if (k === "customerId") fields.customer_id = v ? Number(v) : "";
    else if (k === "area") fields.area = v == null || v === "" ? "" : String(v);
    else fields[k] = v ?? "";
  }
  return { ...i, fields };
}
