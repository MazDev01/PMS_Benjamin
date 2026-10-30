// "เก็บข้อมูลลูกค้า" / "สรุปความต้องการ" ระบบติ๊กเองเมื่อข้อมูลหมวดนั้นครบ (บอสสั่ง 30 ต.ค. 69 · ใบ 0263)
//   สูตรเดียวกับฐาน (_lead_customer_info_complete · _lead_job_info_complete) — ข้อทดสอบฝั่งฐาน supabase/tests/lead_tasks_info_auto.sql
import { describe, it, expect } from "vitest";
import { ข้อมูลลูกค้าครบ, ข้อมูลงานครบ, ติ๊กข้อมูลอัตโนมัติ } from "../../packages/shared/lib/leadInfoTasks";
import { applyLeadIntent } from "../../packages/shared/lib/leadIntent";
import { LEAD_TASK_TEMPLATE, buildLeadTasks, type LeadRow } from "../../packages/shared/lib/mock";

const now = "30 ต.ค. 2569";
const ลีด = (o: Partial<LeadRow> = {}): LeadRow => ({ id: "#L-1", numId: 1, company: "บ.ทดสอบ", name: "บ.ทดสอบ", contact: "", phone: "",
  province: "", status: "WAITING", tasks: [], activities: [], ...o } as unknown as LeadRow);
const ติ๊ก = (l: LeadRow, k: string) => !!l.tasks?.find(t => t.key === k)?.done;

describe("เกณฑ์ครบ", () => {
  it("ข้อมูลลูกค้า = ชื่อบริษัท · ผู้ติดต่อ · โทรศัพท์ (อีเมล/ที่อยู่ไม่บังคับ)", () => {
    expect(ข้อมูลลูกค้าครบ({ company: "บ", contact: "ค", phone: "0" })).toBe(true);
    expect(ข้อมูลลูกค้าครบ({ company: "บ", contact: " ", phone: "0" })).toBe(false);
  });
  it("ข้อมูลงาน = จังหวัด · งาน · พื้นที่ > 0 · สเปก", () => {
    const ครบ = { province: "ระยอง", project: "โกดัง", area: "1200", note: "สเปก" };
    expect(ข้อมูลงานครบ(ครบ)).toBe(true);
    for (const [k, v] of [["province", ""], ["project", ""], ["note", ""], ["area", "0"], ["area", ""], ["area", "abc"]] as const)
      expect(ข้อมูลงานครบ({ ...ครบ, [k]: v }), `${k}=${v}`).toBe(false);
  });
});

describe("ติ๊กเอง / เอาติ๊กออกเอง", () => {
  const tpl = LEAD_TASK_TEMPLATE;
  it("แม่แบบไม่มี ติดต่อแล้ว · สองรายการเป็นของระบบ", () => {
    expect(tpl.some(t => t.key === "contact")).toBe(false);
    expect(tpl.filter(t => ["collect", "requirement"].includes(t.key)).every(t => t.auto)).toBe(true);
  });
  it("กรอกข้อมูลลูกค้าครบ → ติ๊ก เก็บข้อมูลลูกค้า · ข้อมูลงานยังไม่ครบ → สรุปความต้องการยังไม่ติ๊ก", () => {
    const r = applyLeadIntent(ลีด(), { fields: { contact: "คุณเอ", phone: "081" } }, { tpl, now });
    expect(ติ๊ก(r, "collect")).toBe(true);
    expect(r.tasks!.find(t => t.key === "collect")).toMatchObject({ doneAt: now, doneBy: "อัปเดตอัตโนมัติ" });
    expect(ติ๊ก(r, "requirement")).toBe(false);
  });
  it("กรอกข้อมูลงานครบทีหลัง → ติ๊ก สรุปความต้องการ · ลบสเปกออก → ติ๊กหาย", () => {
    let r = applyLeadIntent(ลีด({ contact: "คุณเอ", phone: "081" }), { fields: { province: "ระยอง", project: "โกดัง", area: 50, note: "สเปก" } }, { tpl, now });
    expect(ติ๊ก(r, "requirement")).toBe(true);
    r = applyLeadIntent(r, { fields: { note: "" } }, { tpl, now });
    expect(ติ๊ก(r, "requirement")).toBe(false);
    expect(r.tasks!.find(t => t.key === "requirement")).not.toHaveProperty("doneAt");
  });
  it("ดีลเลอร์ติ๊กเองไม่ได้ (รายการของระบบ)", () => {
    expect(() => applyLeadIntent(ลีด(), { tasks: [{ key: "collect", done: true }] }, { tpl, now })).toThrow(/system_task_locked/);
    expect(() => applyLeadIntent(ลีด(), { tasks: [{ key: "requirement", done: true }] }, { tpl, now })).toThrow(/system_task_locked/);
  });
  it("ลีดปิดแล้วไม่แตะ · ยังไม่มีรายการและไม่ครบ = คงว่าง", () => {
    expect(ติ๊กข้อมูลอัตโนมัติ([], { status: "PAID", company: "บ", contact: "ค", phone: "0" }, () => buildLeadTasks(tpl), now)).toEqual([]);
    expect(ติ๊กข้อมูลอัตโนมัติ([], { status: "WAITING", company: "บ" }, () => buildLeadTasks(tpl), now)).toEqual([]);
  });
});
