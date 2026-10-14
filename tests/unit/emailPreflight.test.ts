import { describe, it, expect } from "vitest";
import { ตรวจค่าSMTP, ตรวจผู้รับของHQ } from "../../scripts/lib/emailReadinessCheck.mjs";

// ── preflight: อีเมลแจ้งเตือนต้องพร้อมก่อนขึ้นระบบ (ด่าน 1) ──────────────────────────────────────
// ไม่พร้อม = คำขอใหม่ / เกิน 14 วัน / ยกเลิก / ขอแก้ราคา ค้างอยู่ในกล่องขาออกเงียบ ๆ ไม่มีใครรู้

describe("ตรวจค่าSMTP", () => {
  it("ไม่ได้ตั้งเลย → ตก", () => {
    expect(ตรวจค่าSMTP({}).ok).toBe(false);
  });
  it("ขาดผู้ส่งหรือกุญแจงานตั้งเวลา → ตก และบอกว่าขาดอะไร", () => {
    const r = ตรวจค่าSMTP({ SMTP_HOST: "smtp.example.test" });
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("SMTP_FROM");
    expect(r.detail).toContain("CRON_SECRET");
  });
  it("ยังชี้กล่องจดหมายทดสอบในเครื่อง → ตก (ไม่มีอีเมลออกไปถึงใครจริง)", () => {
    const r = ตรวจค่าSMTP({ SMTP_HOST: "127.0.0.1", SMTP_FROM: "pms@example.test", CRON_SECRET: "x" });
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("ในเครื่อง");
  });
  it("ตั้งครบและชี้เซิร์ฟเวอร์จริง → ผ่าน", () => {
    expect(ตรวจค่าSMTP({ SMTP_HOST: "smtp.benjaminpebsteel.com", SMTP_FROM: "pms@benjaminpebsteel.com", CRON_SECRET: "x" }).ok).toBe(true);
  });
});

describe("ตรวจผู้รับของHQ", () => {
  it("รายชื่อว่าง → ตก", () => {
    expect(ตรวจผู้รับของHQ({ recipients: [] }).ok).toBe(false);
  });
  it("ฐานยังไม่มีช่องผู้รับ (ยังไม่ขึ้นใบ 0193) → ตก", () => {
    const r = ตรวจผู้รับของHQ({ recipients: null });
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("0193");
  });
  it("มีผู้รับอย่างน้อย 1 ราย → ผ่าน และบอกจำนวน", () => {
    const r = ตรวจผู้รับของHQ({ recipients: ["a@example.test", "b@example.test"] });
    expect(r.ok).toBe(true);
    expect(r.detail).toContain("2");
  });
});
