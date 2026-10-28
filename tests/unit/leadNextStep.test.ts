import { describe, it, expect } from "vitest";
import { ขั้นต่อไป, type NextStepInput } from "../../packages/shared/lib/leadNextStep";
import { LEAD_STATUS_ORDER, type LeadStatus } from "../../packages/shared/lib/mock";

// ── ปุ่ม "ขั้นต่อไป" ในแผงลูกค้าเป้าหมาย ต้องตรงกับสถานะจริง (บอสสั่ง 16 ต.ค. 69 · หน้า 3 ของ UI ตาม flow) ─────
//   ตัดสินจาก: ขั้นของลีด · คำขอราคาล่าสุด · ใบ HQ ของคำขอนั้น · ใบลูกค้าล่าสุดของดีลนี้
//   ห้ามเสนอปุ่มที่ทำไม่ได้จริง (เช่น ขอราคาตอนลีดไม่อยู่ขั้นที่ฐานยอมให้ขอ)
const วันนี้ = "2026-10-16";
const ใส่ = (x: Partial<NextStepInput> & { leadStatus: LeadStatus }): NextStepInput => ({ request: null, hqQuote: null, quote: null, today: วันนี้, ...x });

describe("ขั้นต่อไปของลูกค้าเป้าหมาย", () => {
  it("ใบร่างแบบเดิม (ไม่มีใบ HQ) ดูได้อย่างเดียว → ไม่มีปุ่มส่งให้ลูกค้า · ใบร่างจากใบ HQ ยังส่งได้ (บอสอนุมัติ 22 ต.ค. 69)", () => {
    const เดิม = ขั้นต่อไป(ใส่({ leadStatus: "QUOTED", quote: { status: "draft", เดิม: true } }));
    expect(เดิม.key).not.toBe("send_quote");
    expect(เดิม.action?.kind).not.toBe("send_quote");
    const เดิมลีดต้น = ขั้นต่อไป(ใส่({ leadStatus: "BULLET", quote: { status: "draft", เดิม: true } }));
    expect(เดิมลีดต้น).toMatchObject({ key: "request", action: { kind: "request_quote" } });
    const ใหม่ = ขั้นต่อไป(ใส่({ leadStatus: "HQ_QUOTED", request: { status: "quoted", dueAt: "" }, quote: { status: "draft", เดิม: false } }));
    expect(ใหม่).toMatchObject({ key: "send_quote", action: { kind: "send_quote", label: "ส่งให้ลูกค้า" } });
  });
  it("ติดต่อแล้ว / รวบรวมความต้องการ · ยังไม่มีคำขอ → ขอราคาจาก HQ ", () => {
    for (const s of ["WAITING", "BULLET"] as const) {
      const r = ขั้นต่อไป(ใส่({ leadStatus: s }));
      expect(r).toMatchObject({ key: "request", action: { kind: "request_quote", label: "ขอราคาจาก HQ" } });
    }
  });
  it("คำขอใหม่ / HQ กำลังตีราคา → รอราคา HQ ไม่มีปุ่ม ", () => {
    for (const st of ["new", "pricing"] as const) {
      const r = ขั้นต่อไป(ใส่({ leadStatus: "HQ_PRICING", request: { status: st, dueAt: "2026-10-30T00:00:00Z" } }));
      expect(r).toMatchObject({ key: "waiting_hq", action: null });
    }
  });
  it("HQ ส่งใบแล้ว ราคายังไม่หมดอายุ · ยังไม่มีใบลูกค้า → ทำใบให้ลูกค้า ", () => {
    const r = ขั้นต่อไป(ใส่({ leadStatus: "HQ_PRICING", request: { status: "quoted", dueAt: "" }, hqQuote: { status: "sent", validUntil: "2026-10-20" } }));
    expect(r).toMatchObject({ key: "make_quote", action: { kind: "make_quote", label: "ทำใบให้ลูกค้า" } });
  });
  it("ราคา HQ ใช้ได้ถึงวันนี้ = ยังไม่หมดอายุ (ฐานใช้ valid_until < วันนี้)", () => {
    const r = ขั้นต่อไป(ใส่({ leadStatus: "HQ_PRICING", request: { status: "quoted", dueAt: "" }, hqQuote: { status: "sent", validUntil: วันนี้ } }));
    expect(r.key).toBe("make_quote");
  });
  it("HQ ส่งใบแล้วแต่ราคาหมดอายุ → ขอราคาใหม่ ", () => {
    const r = ขั้นต่อไป(ใส่({ leadStatus: "HQ_PRICING", request: { status: "quoted", dueAt: "" }, hqQuote: { status: "sent", validUntil: "2026-10-15" } }));
    expect(r).toMatchObject({ key: "requote", action: { kind: "reprice", label: "ขอราคาใหม่" } });
  });
  it("ใบลูกค้ายังเป็นร่าง → ส่งให้ลูกค้า ", () => {
    const r = ขั้นต่อไป(ใส่({ leadStatus: "HQ_PRICING", request: { status: "quoted", dueAt: "" }, hqQuote: { status: "sent", validUntil: "2026-10-20" }, quote: { status: "draft" } }));
    expect(r).toMatchObject({ key: "send_quote", action: { kind: "send_quote", label: "ส่งให้ลูกค้า" } });
  });
  it("ส่งใบให้ลูกค้าแล้ว (เสนอราคา) → บันทึกผลจากลูกค้า ", () => {
    for (const s of ["QUOTED"] as const) {
      const r = ขั้นต่อไป(ใส่({ leadStatus: s, request: { status: "quoted", dueAt: "" }, quote: { status: "sent_to_client" } }));
      expect(r).toMatchObject({ key: "await_customer", action: { kind: "customer_result", label: "บันทึกผลจากลูกค้า" } });
    }
  });
  it("ขอราคาใหม่ระหว่างที่ใบเดิมส่งลูกค้าไปแล้ว → รอราคา HQ มาก่อน", () => {
    const r = ขั้นต่อไป(ใส่({ leadStatus: "HQ_PRICING", request: { status: "pricing", dueAt: "2026-10-30T00:00:00Z" }, quote: { status: "sent_to_client" } }));
    expect(r.key).toBe("waiting_hq");
  });
  it("ใบลูกค้าถูกปฏิเสธ/หมดอายุ แต่ลีดยังเปิด และราคา HQ ยังใช้ได้ → ทำใบให้ลูกค้าใหม่", () => {
    for (const q of ["lost", "expired"] as const) {
      const r = ขั้นต่อไป(ใส่({ leadStatus: "QUOTED", request: { status: "quoted", dueAt: "" }, hqQuote: { status: "sent", validUntil: "2026-10-20" }, quote: { status: q } }));
      expect(r.key).toBe("make_quote");
    }
  });
  it("ปิดการขายสำเร็จ → ไม่มีปุ่ม ", () => {
    expect(ขั้นต่อไป(ใส่({ leadStatus: "PAID" }))).toMatchObject({ key: "won", action: null });
    // ใบลูกค้าตอบรับแล้วก็ถือว่าสำเร็จ แม้ขั้นของลีดยังตามไม่ทัน
    expect(ขั้นต่อไป(ใส่({ leadStatus: "QUOTED", quote: { status: "won" } })).key).toBe("won");
  });
  it("ปิดการขายไม่สำเร็จ → ไม่มีปุ่ม", () => {
    expect(ขั้นต่อไป(ใส่({ leadStatus: "CANCELLED", request: { status: "pricing", dueAt: "" } }))).toMatchObject({ key: "lost", action: null });
  });
  it("ลีดอยู่ขั้นเสนอราคา แต่ไม่มีคำขอเปิดและไม่มีใบที่ใช้ได้ → ไม่เสนอปุ่มขอราคา (ฐานไม่ยอมให้ขอจากขั้นนี้)", () => {
    for (const s of ["QUOTED"] as const) {
      const r = ขั้นต่อไป(ใส่({ leadStatus: s }));
      expect(r).toMatchObject({ key: "stuck", action: null });
    }
  });
  it("คำขอที่ปิดไปแล้ว (ยกเลิก/แทนที่/ไม่สำเร็จ) ไม่นับเป็นคำขอเปิด", () => {
    for (const st of ["cancelled", "superseded", "lost"] as const) {
      expect(ขั้นต่อไป(ใส่({ leadStatus: "BULLET", request: { status: st, dueAt: "" } })).key).toBe("request");
    }
  });
  it("ครบทุกขั้นของลีด — ทุกค่าตัดสินได้ ไม่มีค่าไหนหลุด", () => {
    for (const s of LEAD_STATUS_ORDER) {
      const r = ขั้นต่อไป(ใส่({ leadStatus: s }));
      expect(r.title.length).toBeGreaterThan(0);
    }
  });
  // ── รอบ 4: ปุ่ม "ปิดไม่สำเร็จ" อยู่ในกล่องนี้ที่เดียว · มีใบส่งลูกค้าอยู่ = ไม่มีปุ่ม (ใช้ "ลูกค้าปฏิเสธ" ที่ใบ · ข้อตัดสินบอส 2) ──
  it("ขั้น 1–4 มีปุ่มปิดไม่สำเร็จ", () => {
    expect(ขั้นต่อไป(ใส่({ leadStatus: "BULLET" })).ปิดไม่สำเร็จได้).toBe(true);
    expect(ขั้นต่อไป(ใส่({ leadStatus: "HQ_PRICING", request: { status: "new", dueAt: "" } })).ปิดไม่สำเร็จได้).toBe(true);
    expect(ขั้นต่อไป(ใส่({ leadStatus: "HQ_QUOTED", request: { status: "quoted", dueAt: "" }, hqQuote: { status: "sent", validUntil: "2026-10-20" } })).ปิดไม่สำเร็จได้).toBe(true);
    expect(ขั้นต่อไป(ใส่({ leadStatus: "HQ_QUOTED", request: { status: "quoted", dueAt: "" }, quote: { status: "draft" } })).ปิดไม่สำเร็จได้).toBe(true);
  });
  it("มีใบที่ส่งให้ลูกค้าอยู่ → ไม่มีปุ่มปิดไม่สำเร็จ (รวมตอนใบล่าสุดเป็นฉบับใหม่ที่ยังร่าง)", () => {
    expect(ขั้นต่อไป(ใส่({ leadStatus: "QUOTED", request: { status: "quoted", dueAt: "" }, quote: { status: "sent_to_client" } })).ปิดไม่สำเร็จได้).toBe(false);
    expect(ขั้นต่อไป(ใส่({ leadStatus: "QUOTED", request: { status: "quoted", dueAt: "" }, quote: { status: "draft" }, มีใบส่งให้ลูกค้า: true })).ปิดไม่สำเร็จได้).toBe(false);
  });
  it("ปิดแล้ว (สำเร็จ/ไม่สำเร็จ) ไม่มีปุ่มปิดไม่สำเร็จ", () => {
    expect(ขั้นต่อไป(ใส่({ leadStatus: "PAID" })).ปิดไม่สำเร็จได้).toBe(false);
    expect(ขั้นต่อไป(ใส่({ leadStatus: "CANCELLED" })).ปิดไม่สำเร็จได้).toBe(false);
  });
});
