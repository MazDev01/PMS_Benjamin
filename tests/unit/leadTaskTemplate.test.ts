import { describe, it, expect } from "vitest";
import {
  normalizeLeadTaskTemplate, buildLeadTasks, applyTaskTemplate, findAppointmentTask, completeTask,
  LEAD_TASK_TEMPLATE, SYSTEM_LEAD_TASKS, เป็นรายการระบบ,
  type LeadTaskDef,
} from "../../packages/shared/lib/mock";
import { วันที่แสดงไทย } from "../../packages/shared/lib/thaiDate";
import { applyLeadIntent } from "../../packages/shared/lib/leadIntent";
import type { LeadRow } from "../../packages/shared/lib/mock";

// ── รายการเตือนรายขั้นที่ HQ ตั้งเองได้ (13 ส.ค. 69 · FLOW ใหม่ 5 ขั้น 27 ต.ค. 69 · ใบ 0250) ─────────────────────────────
// ค่าที่ HQ ตั้งต้องผ่านการตรวจก่อนใช้เสมอ — ของเพี้ยนจาก DB/หน้าจอห้ามทำให้ระบบขายพัง
const ระบบครบ = SYSTEM_LEAD_TASKS.map(t => t.key);
describe("ตรวจ/ซ่อมชุดรายการก่อนใช้", () => {
  it("ข้อมูลว่าง/ไม่ใช่รายการ → ใช้ชุดเริ่มต้นในโค้ด", () => {
    expect(normalizeLeadTaskTemplate(null)).toEqual(LEAD_TASK_TEMPLATE);
    expect(normalizeLeadTaskTemplate([])).toEqual(LEAD_TASK_TEMPLATE);
    expect(normalizeLeadTaskTemplate("ไม่ใช่รายการ")).toEqual(LEAD_TASK_TEMPLATE);
  });

  it("ทิ้งรายการที่ไม่มีชื่อ / ขั้นไม่ถูกต้อง / คีย์ซ้ำ", () => {
    const out = normalizeLeadTaskTemplate([
      { key: "a", label: "ติดต่อ", step: 1 },
      { key: "b", label: "   ", step: 1 },        // ไม่มีชื่อ
      { key: "c", label: "งาน", step: 9 },         // ขั้นไม่ถูกต้อง
      { key: "a", label: "ซ้ำ", step: 2 },         // คีย์ซ้ำ — เก็บตัวแรก
    ]);
    expect(out.filter(t => !เป็นรายการระบบ(t.key)).map(t => t.key)).toEqual(["a"]);
    expect(out[0].label).toBe("ติดต่อ");
  });

  it("รายการของระบบหายไป → เติมกลับให้ครบเสมอ (ชื่อ/ขั้นตามที่กำหนด · ติ๊กโดยระบบ)", () => {
    const out = normalizeLeadTaskTemplate([{ key: "x", label: "งานเดียว", step: 1 }]);
    for (const k of ระบบครบ) expect(out.some(t => t.key === k && t.auto), `ต้องมี ${k}`).toBe(true);
  });

  it("รายการของระบบถูกแก้ชื่อ/ย้ายขั้นมา → ซ่อมกลับเป็นค่าที่กำหนด", () => {
    const out = normalizeLeadTaskTemplate([{ key: "requestQuote", label: "แก้ชื่อเอง", step: 5 }]);
    expect(out.find(t => t.key === "requestQuote")).toEqual({ key: "requestQuote", label: "ส่งคำขอราคา", step: 2, auto: true });
  });

  it("เรียงตามขั้น 1→5 เสมอ แม้ HQ บันทึกมาสลับ (คงลำดับเดิมภายในขั้นเดียวกัน)", () => {
    const out = normalizeLeadTaskTemplate([
      { key: "z", label: "ติดตาม", step: 5 },
      { key: "w", label: "ติดต่อ", step: 1 },
      { key: "w2", label: "ติดต่อ 2", step: 1 },
    ]);
    const ขั้น = out.map(t => t.step);
    expect([...ขั้น].sort((a, b) => a - b)).toEqual(ขั้น);
    expect(out.filter(t => t.step === 1 && !t.auto).map(t => t.key)).toEqual(["w", "w2"]);
  });

  it("แม่แบบรุ่นเก่า (ผูกสถานะลีด stage ไม่มีขั้น) ใช้ไม่ได้แล้ว — ไม่แปลง ทิ้งทั้งหมด ได้ชุดตั้งต้น 5 ขั้น (ใบ 0257 ย้ายข้อมูลแล้ว ฐานไม่รับ)", () => {
    const out = normalizeLeadTaskTemplate([
      { key: "contact", label: "ติดต่อแล้ว", stage: "WAITING" },
      { key: "followup", label: "ติดตามผล", stage: "FOLLOWUP" },
      { key: "negotiate", label: "เจรจาต่อรอง", stage: "NEGO" },
      { key: "task_quoted_1", label: "งานที่ HQ เพิ่มเอง", stage: "QUOTED" },
    ]);
    expect(out).toEqual(LEAD_TASK_TEMPLATE);
    for (const k of ["followup", "negotiate", "task_quoted_1"]) expect(out.some(t => t.key === k), `ไม่มี ${k}`).toBe(false);
  });
});

describe("ลูกค้าเป้าหมายใช้ชุดที่ HQ ตั้ง ไม่ใช่ชุดเริ่มต้นในโค้ด", () => {
  const tpl: LeadTaskDef[] = [
    { key: "w1", label: "โทรหาลูกค้า", step: 1 },
    { key: "b1", label: "ถามความต้องการ", step: 1 },
    { key: "requestQuote", label: "ส่งคำขอราคา", step: 2, auto: true },
  ];
  it("สร้าง checklist จากชุดที่ส่งมา", () => {
    expect(buildLeadTasks(tpl).map(t => t.label)).toEqual(["โทรหาลูกค้า", "ถามความต้องการ", "ส่งคำขอราคา"]);
  });
  it("ไม่ส่งชุดมา → ยังใช้ชุดเริ่มต้นเหมือนเดิม (ของเก่าไม่พัง)", () => {
    expect(buildLeadTasks().length).toBe(LEAD_TASK_TEMPLATE.length);
  });
});

// ── รายการตั้งต้นที่บอสสั่ง (27 ต.ค. 69 · FLOW D7) — ล็อกทั้งชื่อ ลำดับ ขั้น และรายการที่ระบบติ๊ก ──────────────────────
describe("รายการตั้งต้นตาม FLOW ใหม่ 5 ขั้น", () => {
  it("ชื่อ/ขั้น/ระบบติ๊ก ตรงเป๊ะ 9 รายการ", () => {
    expect(LEAD_TASK_TEMPLATE.map(t => [t.label, t.step, !!t.auto])).toEqual([
      ["ติดต่อแล้ว", 1, false], ["เก็บข้อมูลลูกค้า", 1, false], ["สรุปความต้องการ", 1, false], ["นัดหมาย", 1, true],
      ["ส่งคำขอราคา", 2, true], ["ได้ใบ HQ", 3, true], ["จัดทำใบเสนอราคา", 4, true],
      ["ส่งใบเสนอราคา", 5, true], ["ติดตามลูกค้า", 5, false],
    ]);
  });
  it("ไม่มี 'ติดตามผล' 'เจรจาต่อรอง' 'ปิดการขาย' แบบเดิม (FLOW เลิกใช้ 21 ต.ค. 69)", () => {
    const ชื่อ = buildLeadTasks().map(t => t.label);
    for (const เก่า of ["ติดตามผล", "เจรจาต่อรอง", "ปิดการขาย / ไม่สำเร็จ"]) expect(ชื่อ).not.toContain(เก่า);
  });
  it("ผ่าน normalize แล้วลำดับไม่สลับ", () => {
    expect(normalizeLeadTaskTemplate(LEAD_TASK_TEMPLATE)).toEqual(LEAD_TASK_TEMPLATE);
  });
  it("ทุกขั้น 1–5 มีรายการอย่างน้อย 1 รายการ", () => {
    for (const n of [1, 2, 3, 4, 5]) expect(LEAD_TASK_TEMPLATE.some(t => t.step === n), `ขั้น ${n}`).toBe(true);
  });
});

// ── งานของลูกค้าเป้าหมายต้องเดินตามแม่แบบล่าสุดที่ HQ ตั้ง (บอสแจ้ง 19 ส.ค. 69) ───────────────────────────────────────
describe("ปรับงานของลูกค้าเป้าหมายตามแม่แบบล่าสุด", () => {
  const tpl: LeadTaskDef[] = [
    { key: "contact", label: "ติดต่อแล้ว", step: 1 },
    { key: "req", label: "สรุปความต้องการ", step: 1 },
    { key: "requestQuote", label: "ส่งคำขอราคา", step: 2, auto: true },
  ];
  it("งานใหม่ที่ HQ เพิ่มต้องโผล่ที่ดีลเลอร์ (ยังไม่ติ๊ก)", () => {
    const out = applyTaskTemplate([{ key: "contact", label: "ติดต่อแล้ว", done: true }], tpl);
    expect(out.map(t => t.key)).toEqual(["contact", "req", "requestQuote"]);
    expect(out.find(t => t.key === "req")?.done).toBe(false);
  });
  it("งานที่ติ๊กไว้แล้วต้องคงติ๊ก + ผู้ทำ/เวลาเดิม", () => {
    const เดิม = { key: "contact", label: "ติดต่อครั้งแรก", done: true, doneAt: "1 ส.ค. 2569 · 10:00", doneBy: "สมชาย" };
    expect(applyTaskTemplate([เดิม], tpl)[0]).toMatchObject({ done: true, doneAt: เดิม.doneAt, doneBy: "สมชาย" });
  });
  it("HQ เปลี่ยนชื่องาน → ดีลเลอร์เห็นชื่อใหม่ทันที", () => {
    expect(applyTaskTemplate([{ key: "contact", label: "ติดต่อครั้งแรก", done: true }], tpl)[0].label).toBe("ติดต่อแล้ว");
  });
  it("งานที่ HQ ลบทิ้งต้องหลุดจากรายการ", () => {
    const out = applyTaskTemplate([{ key: "contact", label: "ติดต่อแล้ว", done: true }, { key: "เก่า", label: "งานที่ถูกยกเลิก", done: true }], tpl);
    expect(out.some(t => t.key === "เก่า")).toBe(false);
  });
  it("ลูกค้าเป้าหมายที่ปิดแล้วห้ามแตะ — ประวัติต้องคงเดิม", () => {
    const เก่า = [{ key: "อะไรก็ตาม", label: "งานเก่า", done: true }];
    expect(applyTaskTemplate(เก่า, tpl, "PAID")).toEqual(เก่า);
    expect(applyTaskTemplate(เก่า, tpl, "CANCELLED")).toEqual(เก่า);
  });
  it("ยังไม่มี checklist เลย → สร้างจากแม่แบบทั้งชุด", () => {
    expect(applyTaskTemplate(undefined, tpl).map(t => t.key)).toEqual(["contact", "req", "requestQuote"]);
  });
});

describe("หางานนัดหมายจากชุดที่ HQ ตั้ง", () => {
  it("เจอจากรหัสมาตรฐาน", () => { expect(findAppointmentTask(LEAD_TASK_TEMPLATE)?.label).toBe("นัดหมาย"); });
  it("รหัสเปลี่ยน (ค่าค้างรุ่นเก่า) ก็ยังต้องเจอจากชื่อ", () => {
    expect(findAppointmentTask([{ key: "contact", label: "ติดต่อแล้ว", step: 1 }, { key: "task_bullet_1", label: "นัดหมาย", step: 1 }])?.key).toBe("task_bullet_1");
  });
  it("ไม่มีงานนัดหมายเลย → คืน undefined (ห้ามเดาไปติ๊กงานอื่น)", () => {
    expect(findAppointmentTask([{ key: "contact", label: "ติดต่อแล้ว", step: 1 }])).toBeUndefined();
  });
  it("ติ๊กงานแล้วต้องแตะเฉพาะงานนั้น และคงเวลาเดิมของงานที่ติ๊กไว้แล้ว", () => {
    const tasks = [
      { key: "contact", label: "ติดต่อแล้ว", done: true, doneAt: "1 ส.ค. 2569 · 09:00", doneBy: "สมชาย" },
      { key: "appointment", label: "นัดหมาย", done: false },
      { key: "followCustomer", label: "ติดตามลูกค้า", done: false },
    ];
    const out = completeTask(tasks, "appointment", "วิภา", "19 ส.ค. 2569 · 10:00");
    expect(out[0]).toEqual(tasks[0]);
    expect(out[1]).toMatchObject({ done: true, doneBy: "วิภา", doneAt: "19 ส.ค. 2569 · 10:00" });
    expect(out[2].done).toBe(false);
  });
  it("ติ๊กงานที่เสร็จอยู่แล้วซ้ำ ต้องไม่ทับเวลา/ผู้ทำเดิม", () => {
    const tasks = [{ key: "appointment", label: "นัดหมาย", done: true, doneAt: "1 ส.ค. 2569 · 09:00", doneBy: "สมชาย" }];
    expect(completeTask(tasks, "appointment", "วิภา", "19 ส.ค. 2569 · 10:00")).toEqual(tasks);
  });
});

// ── ดีลเลอร์ติ๊กรายการของระบบเองไม่ได้ (กติกาเดียวกับตัวดักฐาน leads_system_tasks_guard · ใบ 0250) ──────────────────────
describe("รายการของระบบ ติ๊กเองไม่ได้", () => {
  const ลีด = { id: "#L-1", numId: 1, status: "BULLET", tasks: [{ key: "collect", label: "เก็บข้อมูลลูกค้า", done: false },
    { key: "requestQuote", label: "ส่งคำขอราคา", done: false }], activities: [] } as unknown as LeadRow;
  const ctx = { tpl: LEAD_TASK_TEMPLATE, now: "27 ต.ค. 2569 · 10:00" };
  it("ผู้ใช้สั่งติ๊ก 'ส่งคำขอราคา' → ปฏิเสธ system_task_locked", () => {
    expect(() => applyLeadIntent(ลีด, { tasks: [{ key: "requestQuote", done: true }] }, ctx)).toThrow(/system_task_locked/);
  });
  it("รายการติ๊กเองยังติ๊กได้ และไม่เปลี่ยนขั้น", () => {
    const r = applyLeadIntent(ลีด, { tasks: [{ key: "collect", done: true }] }, ctx);
    expect(r.tasks?.find(t => t.key === "collect")?.done).toBe(true);
    expect(r.status).toBe("BULLET");
  });
  it("ระบบติ๊กตามเหตุการณ์ (โหมดในเครื่อง) ผ่าน", () => {
    const r = applyLeadIntent(ลีด, { tasks: [{ key: "requestQuote", done: true }], ระบบ: true }, ctx);
    expect(r.tasks?.find(t => t.key === "requestQuote")?.done).toBe(true);
  });
});

// ── วันที่ในรายการเป็น พ.ศ. เสมอ (ตัวจัดรูปวันที่กลาง) ─────────────────────────────────────────────────────────────
describe("วันที่แสดงไทย", () => {
  it("วันที่ ค.ศ. แบบ ISO (ข้อมูลเดิม) → พ.ศ.", () => { expect(วันที่แสดงไทย("2026-06-02")).toBe("2 มิ.ย. 2569"); });
  it("เวลาแบบ ISO → เวลาไทย", () => { expect(วันที่แสดงไทย("2026-06-02T03:05:00Z")).toBe("2 มิ.ย. 2569 · 10:05"); });
  it("รูปแบบไทยแต่ปี ค.ศ. → +543", () => { expect(วันที่แสดงไทย("2 มิ.ย. 2026 · 10:30")).toBe("2 มิ.ย. 2569 · 10:30"); });
  it("พ.ศ. อยู่แล้ว = คงเดิม · ว่าง = ''", () => {
    expect(วันที่แสดงไทย("27 ต.ค. 2569 · 10:00")).toBe("27 ต.ค. 2569 · 10:00");
    expect(วันที่แสดงไทย(undefined)).toBe("");
  });
});
