import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
// @ts-expect-error — ไฟล์ .mjs ของเครื่องมือ (ไม่มีชนิดข้อมูล)
import { ป้ายล็อกรอบทดสอบ } from "../../scripts/lib/gateLockLabel.mjs";

// ── ป้ายล็อกฐานทดสอบของ test:prodbuild บอกตามจริง (คนรวมงานขอ 9 พ.ย. 69) ──
//   เดิม "รอบตรวจเต็ม (…)" ทุกครั้งแม้รันระบุไฟล์ → เซสชันอื่นเข้าใจผิดว่ามีคนรันรอบเต็มเอง · ตกบนโค้ดเดิม (ข้อสุดท้าย)
const sha = "4e89fa9abcdef";
describe("ป้ายล็อกรอบทดสอบ", () => {
  it("ไม่ระบุไฟล์ = รอบตรวจเต็ม", () => {
    expect(ป้ายล็อกรอบทดสอบ({ args: [], onlyLive: false, sha })).toBe("รอบตรวจเต็ม (4e89fa9)");
  });
  it("มีแค่ --reporter = ยังเป็นรอบตรวจเต็ม (ตรงกติกาเดียวกับตัวกันรอบเต็มของบอส)", () => {
    expect(ป้ายล็อกรอบทดสอบ({ args: ["--reporter=line"], onlyLive: false, sha })).toBe("รอบตรวจเต็ม (4e89fa9)");
  });
  it("ระบุไฟล์ = ทดสอบบางไฟล์ (n ไฟล์) · ไม่มีคำว่ารอบตรวจเต็ม", () => {
    const ป้าย = ป้ายล็อกรอบทดสอบ({ args: ["tests/scenario/a.spec.ts", "tests/scenario/b.spec.ts", "--reporter=line"], onlyLive: false, sha });
    expect(ป้าย).toBe("ทดสอบบางไฟล์ (2 ไฟล์ · 4e89fa9)");
    expect(ป้าย).not.toContain("รอบตรวจเต็ม");
  });
  it("PMS_GATE_ONLY_LIVE = เจาะช่วง prod-live", () => {
    expect(ป้ายล็อกรอบทดสอบ({ args: [], onlyLive: true, sha })).toBe("เจาะช่วง prod-live (4e89fa9)");
  });
  it("test-prodbuild.mjs ใช้ตัวกลางนี้ตั้งป้ายล็อก (ไม่เขียน \"รอบตรวจเต็ม\" ตายตัว)", () => {
    const s = readFileSync("scripts/test-prodbuild.mjs", "utf8");
    expect(s).toMatch(/ขอล็อกฐานทดสอบ\(ป้ายล็อกรอบทดสอบ\(\{ args: process\.argv\.slice\(2\), onlyLive: เจาะช่วงprodLive/);
    expect(s).not.toMatch(/ขอล็อกฐานทดสอบ\(`รอบตรวจเต็ม/);
  });
});
