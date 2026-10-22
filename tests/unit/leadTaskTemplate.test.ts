import { describe, it, expect } from "vitest";
import {
  normalizeLeadTaskTemplate, buildLeadTasks, applyTaskTemplate, findAppointmentTask, completeTask,
  LEAD_TASK_TEMPLATE, CLOSE_TASK_KEY,
  type LeadTaskDef,
} from "../../packages/shared/lib/mock";

// ── งานมาตรฐานรายขั้นที่ HQ ตั้งเองได้ (13 ส.ค. 69) ───────────────────────────────
//
// ชุดงานนี้ไม่ใช่ข้อความประดับ: มันคือตัวขับสถานะของลูกค้าเป้าหมายทุกใบ (เช็กงาน → เลื่อนขั้นเอง)
// ค่าที่ HQ ตั้งจึงต้องผ่านการตรวจก่อนใช้เสมอ — ของเพี้ยนจาก DB/หน้าจอห้ามทำให้ระบบขายพัง
describe("ตรวจ/ซ่อมชุดงานมาตรฐานก่อนใช้", () => {
  it("ข้อมูลว่าง/ไม่ใช่รายการ → ใช้ชุดเริ่มต้นในโค้ด", () => {
    expect(normalizeLeadTaskTemplate(null)).toEqual(LEAD_TASK_TEMPLATE);
    expect(normalizeLeadTaskTemplate([])).toEqual(LEAD_TASK_TEMPLATE);
    expect(normalizeLeadTaskTemplate("ไม่ใช่รายการ")).toEqual(LEAD_TASK_TEMPLATE);
  });

  it("ทิ้งงานที่ไม่มีชื่อ / ขั้นไม่ถูกต้อง / คีย์ซ้ำ", () => {
    const out = normalizeLeadTaskTemplate([
      { key: "a", label: "ติดต่อ", stage: "WAITING" },
      { key: "b", label: "   ", stage: "WAITING" },      // ไม่มีชื่อ
      { key: "c", label: "งาน", stage: "ไม่มีขั้นนี้" },   // ขั้นไม่ถูกต้อง
      { key: "a", label: "ซ้ำ", stage: "BULLET" },        // คีย์ซ้ำ — เก็บตัวแรก
    ]);
    expect(out.map(t => t.key)).toEqual(["a", CLOSE_TASK_KEY]);
    expect(out[0].label).toBe("ติดต่อ");
  });

  it("งาน “ปิดการขาย” หายไป → เติมกลับให้เสมอ (ไม่งั้นปิดดีลไม่ได้ทั้งระบบ)", () => {
    const out = normalizeLeadTaskTemplate([{ key: "x", label: "งานเดียว", stage: "WAITING" }]);
    expect(out.some(t => t.key === CLOSE_TASK_KEY)).toBe(true);
    expect(out[out.length - 1].key).toBe(CLOSE_TASK_KEY); // อยู่ท้ายสุดเสมอ (ขั้น PAID)
  });

  it("เรียงตามลำดับขั้นเสมอ แม้ HQ บันทึกมาสลับ", () => {
    const out = normalizeLeadTaskTemplate([
      { key: "n", label: "เจรจา", stage: "NEGO" },
      { key: "w", label: "ติดต่อ", stage: "WAITING" },
      { key: "q", label: "ออกใบ", stage: "QUOTED" },
    ]);
    expect(out.map(t => t.stage)).toEqual(["WAITING", "QUOTED", "NEGO", "PAID"]);
  });
});

describe("ลูกค้าเป้าหมายใช้ชุดงานที่ HQ ตั้ง ไม่ใช่ชุดเริ่มต้นในโค้ด", () => {
  const tpl: LeadTaskDef[] = [
    { key: "w1", label: "โทรหาลูกค้า", stage: "WAITING" },
    { key: "b1", label: "ถามความต้องการ", stage: "BULLET" },
    { key: CLOSE_TASK_KEY, label: "ปิดการขาย", stage: "PAID" },
  ];

  it("สร้าง checklist จากชุดที่ส่งมา", () => {
    expect(buildLeadTasks(tpl).map(t => t.label)).toEqual(["โทรหาลูกค้า", "ถามความต้องการ", "ปิดการขาย"]);
  });

  it("ไม่ส่งชุดมา → ยังใช้ชุดเริ่มต้นเหมือนเดิม (ของเก่าไม่พัง)", () => {
    expect(buildLeadTasks().length).toBe(LEAD_TASK_TEMPLATE.length);
  });
});

// ── ลำดับงานมาตรฐานที่บอสสั่งเอง (17 ส.ค. 69) ───────────────────────────────────
// ล็อกไว้ทั้งชื่อและลำดับ — เคยมีคนเข้าใจว่า "ส่งแม่แบบให้ลูกค้า" ควรอยู่ก่อนออกใบ
// แต่บอสยืนยันว่าให้อยู่หลัง "ส่งใบเสนอราคา" · ถ้าตั้ง stage ผิดเป็น BULLET
// normalize จะเรียงตามขั้นแล้วเด้งกลับไปอยู่ก่อนออกใบเอง = ผิดคำสั่งโดยไม่มีใครรู้
describe("ลำดับงานมาตรฐานตามที่บอสสั่ง", () => {
  it("ชื่อและลำดับต้องตรงเป๊ะ 9 งาน (ตัด 'ส่งแม่แบบให้ลูกค้า' — เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69)", () => {
    expect(buildLeadTasks().map(t => t.label)).toEqual([
      "ติดต่อแล้ว",
      "เก็บข้อมูลลูกค้า",
      "นัดหมาย",
      "สรุปความต้องการ",
      "จัดทำใบเสนอราคา",
      "ส่งใบเสนอราคา",
      "ติดตามผล",
      "เจรจาต่อรอง",
      "ปิดการขาย / ไม่สำเร็จ",
    ]);
  });

  it("ผ่าน normalize แล้วลำดับต้องไม่สลับ (เรียงตามขั้นแต่คงลำดับในขั้นเดียวกัน)", () => {
    expect(normalizeLeadTaskTemplate(LEAD_TASK_TEMPLATE).map(t => t.key)).toEqual([
      "contact", "collect", "appointment", "requirement", "makeQuote", "sendQuote", "followup", "negotiate", "close",
    ]);
  });

  it("ชุดงานที่ HQ บันทึกไว้ในฐานซึ่งยังมีงาน 'ส่งแม่แบบให้ลูกค้า' (key catalog) — ไม่แสดงอีก", () => {
    const out = normalizeLeadTaskTemplate([
      { key: "sendQuote", label: "ส่งใบเสนอราคา", stage: "QUOTED" },
      { key: "catalog", label: "ส่งแม่แบบให้ลูกค้า", stage: "QUOTED" },
    ]);
    expect(out.map(t => t.key)).toEqual(["sendQuote", CLOSE_TASK_KEY]);
  });

  it("ไม่มีงานชื่อ 'รวบรวมความต้องการ' (บอสสั่งตัด 17 ส.ค. — งานขั้นนี้ใช้ชื่อ 'สรุปความต้องการ' แทน)", () => {
    expect(buildLeadTasks().some(t => t.label === "รวบรวมความต้องการ")).toBe(false);
  });

  // ขั้นที่ไม่มีงานเลย = ลูกค้าเป้าหมายจะข้ามขั้นนั้นไปเลย คอลัมน์บนกระดานก็จะว่างตลอดกาล
  // (บอสสั่ง 19 ส.ค. 69 "แบ่งงานให้เหมาะสมกับเส้นทางการขาย")
  it("ทุกขั้นที่ยังขายอยู่ต้องมีงานอย่างน้อย 1 งาน", () => {
    const ขั้นที่มีงาน = new Set(LEAD_TASK_TEMPLATE.map(t => t.stage));
    for (const s of ["WAITING", "BULLET", "QUOTED", "FOLLOWUP", "NEGO"] as const) {
      expect(ขั้นที่มีงาน.has(s), `ขั้น ${s} ไม่มีงานเลย — ลูกค้าเป้าหมายจะข้ามขั้นนี้ไป`).toBe(true);
    }
  });
});


// ── งานของลูกค้าเป้าหมายต้องเดินตามแม่แบบล่าสุดที่ HQ ตั้ง ────────────────────────
// บอสแจ้ง (19 ส.ค. 69): "แก้ใน hq แล้ว ดีลเลอร์ยังไม่เปลี่ยน"
// เดิมหน้าจออ่าน lead.tasks ที่ฝังอยู่กับลูกค้าเป้าหมายตรง ๆ รายที่มีอยู่ก่อนจึงค้างชุดเก่าตลอดไป
describe("ปรับงานของลูกค้าเป้าหมายตามแม่แบบล่าสุด", () => {
  const tpl: LeadTaskDef[] = [
    { key: "contact", label: "ติดต่อแล้ว", stage: "WAITING" },
    { key: "req", label: "สรุปความต้องการ", stage: "BULLET" },
    { key: "close", label: "ปิดการขาย / ไม่สำเร็จ", stage: "PAID" },
  ];

  it("งานใหม่ที่ HQ เพิ่มต้องโผล่ที่ดีลเลอร์ (ยังไม่ติ๊ก)", () => {
    const out = applyTaskTemplate([{ key: "contact", label: "ติดต่อแล้ว", done: true }], tpl);
    expect(out.map(t => t.key)).toEqual(["contact", "req", "close"]);
    expect(out.find(t => t.key === "req")?.done).toBe(false);
  });

  it("งานที่ติ๊กไว้แล้วต้องคงติ๊ก + ผู้ทำ/เวลาเดิม", () => {
    const เดิม = { key: "contact", label: "ติดต่อครั้งแรก", done: true, doneAt: "1 ส.ค. 2569 · 10:00", doneBy: "สมชาย" };
    const out = applyTaskTemplate([เดิม], tpl);
    expect(out[0]).toMatchObject({ done: true, doneAt: เดิม.doneAt, doneBy: "สมชาย" });
  });

  it("HQ เปลี่ยนชื่องาน → ดีลเลอร์เห็นชื่อใหม่ทันที", () => {
    const out = applyTaskTemplate([{ key: "contact", label: "ติดต่อครั้งแรก", done: true }], tpl);
    expect(out[0].label).toBe("ติดต่อแล้ว");
  });

  it("งานที่ HQ ลบทิ้งต้องหลุดจากรายการ", () => {
    const out = applyTaskTemplate([
      { key: "contact", label: "ติดต่อแล้ว", done: true },
      { key: "เก่า", label: "งานที่ถูกยกเลิก", done: true },
    ], tpl);
    expect(out.some(t => t.key === "เก่า")).toBe(false);
  });

  it("ลูกค้าเป้าหมายที่ปิดแล้วห้ามแตะ — ประวัติต้องคงเดิม", () => {
    const เก่า = [{ key: "อะไรก็ตาม", label: "งานเก่า", done: true }];
    expect(applyTaskTemplate(เก่า, tpl, "PAID")).toEqual(เก่า);
    expect(applyTaskTemplate(เก่า, tpl, "CANCELLED")).toEqual(เก่า);
  });

  it("ยังไม่มี checklist เลย → สร้างจากแม่แบบทั้งชุด", () => {
    expect(applyTaskTemplate(undefined, tpl).map(t => t.key)).toEqual(["contact", "req", "close"]);
  });
});

// ── บันทึกนัดหมายจริง → งาน "นัดหมาย" ต้องถูกติ๊กให้เอง (บอสสั่ง 19 ส.ค. 69) ────────
// กติกาเดียวกับงานใบเสนอราคา: งานที่มี "ของจริง" รองรับ ระบบติ๊กเอง ไม่ให้เซลส์มานั่งติ๊กซ้ำ
describe("หางานนัดหมายจากชุดที่ HQ ตั้ง", () => {
  it("เจอจากรหัสมาตรฐาน", () => {
    expect(findAppointmentTask(LEAD_TASK_TEMPLATE)?.label).toBe("นัดหมาย");
  });

  it("HQ ลบแล้วสร้างใหม่ (รหัสเปลี่ยน) ก็ยังต้องเจอจากชื่อ", () => {
    const tpl: LeadTaskDef[] = [
      { key: "contact", label: "ติดต่อแล้ว", stage: "WAITING" },
      { key: "task_bullet_1", label: "นัดหมาย", stage: "BULLET" },
      { key: "close", label: "ปิดการขาย / ไม่สำเร็จ", stage: "PAID" },
    ];
    expect(findAppointmentTask(tpl)?.key).toBe("task_bullet_1");
  });

  it("ไม่มีงานนัดหมายเลย → คืน undefined (ห้ามเดาไปติ๊กงานอื่น)", () => {
    const tpl: LeadTaskDef[] = [
      { key: "contact", label: "ติดต่อแล้ว", stage: "WAITING" },
      { key: "close", label: "ปิดการขาย / ไม่สำเร็จ", stage: "PAID" },
    ];
    expect(findAppointmentTask(tpl)).toBeUndefined();
  });

  it("ติ๊กงานแล้วต้องแตะเฉพาะงานนั้น และคงเวลาเดิมของงานที่ติ๊กไว้แล้ว", () => {
    const tasks = [
      { key: "contact", label: "ติดต่อแล้ว", done: true, doneAt: "1 ส.ค. 2569 · 09:00", doneBy: "สมชาย" },
      { key: "appointment", label: "นัดหมาย", done: false },
      { key: "followup", label: "ติดตามผล", done: false },
    ];
    const out = completeTask(tasks, "appointment", "วิภา", "19 ส.ค. 2569 · 10:00");
    expect(out[0]).toEqual(tasks[0]);                                   // ของเดิมไม่ถูกแตะ
    expect(out[1]).toMatchObject({ done: true, doneBy: "วิภา", doneAt: "19 ส.ค. 2569 · 10:00" });
    expect(out[2].done).toBe(false);                                    // งานถัดไปไม่ถูกติ๊กข้ามขั้น
  });

  it("ติ๊กงานที่เสร็จอยู่แล้วซ้ำ ต้องไม่ทับเวลา/ผู้ทำเดิม", () => {
    const tasks = [{ key: "appointment", label: "นัดหมาย", done: true, doneAt: "1 ส.ค. 2569 · 09:00", doneBy: "สมชาย" }];
    expect(completeTask(tasks, "appointment", "วิภา", "19 ส.ค. 2569 · 10:00")).toEqual(tasks);
  });
});
