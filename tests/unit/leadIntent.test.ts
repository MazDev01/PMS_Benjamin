import { describe, it, expect } from "vitest";
import { applyLeadIntent, diffLeadFields, diffLeadTasks, intentIsEmpty, leadIntentToWire } from "../../packages/shared/lib/leadIntent";
import { LEAD_TASK_TEMPLATE, type LeadRow } from "../../packages/shared/lib/mock";

// ตัวกลางบันทึกลูกค้าเป้าหมาย (ก่อนขึ้นระบบจริง ข้อ 14 · 15 ต.ค. 69) — ตรรกะเดียวกับฐาน lead_apply (supabase/tests/lead_apply.sql)
const tpl = LEAD_TASK_TEMPLATE;
const now = "15 ต.ค. 2569 · 10:00";
const ลีด = (p: Partial<LeadRow> = {}): LeadRow => ({ id: "#L-1", numId: 1, name: "n", company: "c", contact: "เดิม", phone: "081", province: "ระยอง",
  product: "p", category: "", status: "WAITING", value: "", assigned: "พนักงาน", tasks: [], activities: [], ...p });

describe("applyLeadIntent", () => {
  it("แก้ช่องเดียว — ช่องอื่น/งาน/ไทม์ไลน์คงเดิม", () => {
    const r = applyLeadIntent(ลีด(), { fields: { contact: "ใหม่" } }, { tpl, now });
    expect(r.contact).toBe("ใหม่"); expect(r.phone).toBe("081"); expect(r.tasks).toEqual([]); expect(r.activities).toEqual([]);
  });
  it("ช่องที่ฐานเป็นเจ้าของส่งทาง fields ไม่ได้", () => {
    expect(() => applyLeadIntent(ลีด(), { fields: { status: "PAID" } as never }, { tpl, now })).toThrow(/lead_field_not_allowed/);
    expect(() => applyLeadIntent(ลีด(), { fields: { tasks: [] } as never }, { tpl, now })).toThrow(/lead_field_not_allowed/);
  });
  it("ติ๊กงานทีละงาน · งานมาจากแม่แบบ · ไทม์ไลน์ 'ทำงาน:' · ขั้นตามงาน", () => {
    let r = applyLeadIntent(ลีด(), { tasks: [{ key: "contact", done: true, doneBy: "คนติ๊ก" }], deriveStage: "any" }, { tpl, now });
    expect(r.tasks).toHaveLength(tpl.length);
    expect(r.tasks!.find(t => t.key === "contact")).toMatchObject({ done: true, doneBy: "คนติ๊ก", doneAt: now });
    expect(r.activities![0].text).toBe("ทำงาน: ติดต่อแล้ว");
    r = applyLeadIntent(r, { tasks: [{ key: "collect", done: true }, { key: "requirement", done: true }], deriveStage: "any" }, { tpl, now });
    expect(r.status).toBe("BULLET");
    expect(r.activities!.some(a => a.text === 'เปลี่ยนขั้นเป็น "รวบรวมความต้องการ"')).toBe(true);
  });
  it("หัวใจ: งานที่ไม่อยู่ในเจตนา (ฐาน/แท็บอื่นติ๊กไว้) ไม่ถูกแตะ", () => {
    const tasks = tpl.map(d => ({ key: d.key, label: d.label, done: d.key === "makeQuote" }));
    const r = applyLeadIntent(ลีด({ tasks }), { fields: { phone: "099" } }, { tpl, now });
    expect(r.tasks!.find(t => t.key === "makeQuote")!.done).toBe(true);
    const r2 = applyLeadIntent(ลีด({ tasks }), { tasks: [{ key: "contact", done: true }], deriveStage: "up" }, { tpl, now });
    expect(r2.tasks!.find(t => t.key === "makeQuote")!.done).toBe(true);
    expect(r2.status).toBe("QUOTED");
  });
  it("รอราคา HQ / ปิดแล้ว: ไม่คิดขั้นจากงาน · โหมด up ไม่ลดขั้น", () => {
    const r = applyLeadIntent(ลีด({ status: "HQ_PRICING" }), { tasks: [{ key: "contact", done: true }], deriveStage: "any" }, { tpl, now });
    expect(r.status).toBe("HQ_PRICING");
    expect(applyLeadIntent(ลีด({ status: "NEGO" }), { deriveStage: "up" }, { tpl, now }).status).toBe("NEGO");
  });
  it("กฎปิดการขาย: ปิดไม่สำเร็จต้องมีเหตุผล · ปิดสำเร็จต้องมีใบที่ส่งแล้ว", () => {
    expect(() => applyLeadIntent(ลีด(), { stage: { status: "CANCELLED" } }, { tpl, now })).toThrow(/lead_lost_needs_reason/);
    expect(() => applyLeadIntent(ลีด(), { stage: { status: "PAID" } }, { tpl, now, hasSentQuote: () => false })).toThrow(/lead_close_needs_sent_quote/);
    const r = applyLeadIntent(ลีด(), { stage: { status: "CANCELLED", lostReason: "งบไม่พอ" }, log: false }, { tpl, now });
    expect(r).toMatchObject({ status: "CANCELLED", lostReason: "งบไม่พอ" }); expect(r.activities).toEqual([]);
  });
  it("ไทม์ไลน์ไม่อยู่ในมือ (รายการไม่ดึงมา) = ไม่เดา", () => {
    const r = applyLeadIntent(ลีด({ activities: undefined }), { activities: [{ text: "x", type: "doc" }] }, { tpl, now });
    expect(r.activities).toBeUndefined();
  });
});

describe("ส่วนต่าง", () => {
  it("diffLeadFields: ส่งเฉพาะช่องที่ต่าง · ว่าง/undefined ถือว่าเท่ากัน", () => {
    expect(diffLeadFields({ contact: "a", phone: "1", address: undefined }, { contact: "a", phone: "2", address: "", note: "" })).toEqual({ phone: "2" });
  });
  it("diffLeadTasks: ส่งเฉพาะงานที่สถานะเปลี่ยน", () => {
    const ก่อน = [{ key: "a", label: "A", done: true }, { key: "b", label: "B", done: false }];
    expect(diffLeadTasks(ก่อน, [{ key: "a", label: "A", done: true }, { key: "b", label: "B", done: true, doneBy: "x" }]))
      .toEqual([{ key: "b", done: true, label: "B", doneAt: undefined, doneBy: "x" }]);
  });
  it("intentIsEmpty · leadIntentToWire แปลงชื่อช่องแบบฐาน", () => {
    expect(intentIsEmpty({ fields: {} })).toBe(true);
    expect(leadIntentToWire({ fields: { customerId: 5, area: 120 } }).fields).toEqual({ customer_id: 5, area: "120" });
  });
});
