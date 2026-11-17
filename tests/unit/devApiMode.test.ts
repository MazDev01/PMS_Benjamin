// ── เว็บ dev/localhost และเว็บที่ใช้ทดสอบในโฟลเดอร์งาน = โหมด api เหมือนเว็บจริง (บอสตัดสิน 16 พ.ย. 69) ──
//   เดิมอ่านโหมดจาก .env.local (supabase) แต่รอบตรวจเต็ม (test-prodbuild) รัน api → ข้อที่ใช้ cookie/เส้นทาง /api/v1 ตกในโฟลเดอร์แต่ผ่านในรอบตรวจ
//   ตรวจจุดตั้งค่าทั้ง 4: ตัวรันข้อทดสอบ · npm run dev (ตัวเฝ้า localhost เรียกตัวนี้) · session:new · .env.example
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const อ่าน = (f: string) => readFileSync(f, "utf8");

describe("โหมดข้อมูลตั้งต้นของเว็บในเครื่อง = api", () => {
  it("ตัวรันข้อทดสอบตั้ง api ก่อนเปิดเซิร์ฟเวอร์ (สั่งโหมดอื่นผ่าน env ได้)", () => {
    expect(อ่าน("playwright.config.ts")).toContain(`process.env.NEXT_PUBLIC_DATA_SOURCE ||= "api";`);
  });
  it("npm run dev (scripts/dev-db.mjs) ส่ง api ให้เว็บ ชนะ .env.local", () => {
    expect(อ่าน("scripts/dev-db.mjs")).toContain(`NEXT_PUBLIC_DATA_SOURCE: process.env.NEXT_PUBLIC_DATA_SOURCE || "api"`);
  });
  it("session:new เขียน .env ของเซสชันใหม่เป็น api", () => {
    expect(อ่าน("scripts/session-new.mjs")).toContain(`.replace(/^NEXT_PUBLIC_DATA_SOURCE=.*$/m, "NEXT_PUBLIC_DATA_SOURCE=api")`);
  });
  it(".env.example ตั้งต้นเป็น api", () => {
    expect(อ่าน(".env.example")).toMatch(/^NEXT_PUBLIC_DATA_SOURCE=api\s*$/m);
  });
  it("รอบตรวจเต็มยังเป็น api (ไม่ถอย)", () => {
    expect(อ่าน("scripts/test-prodbuild.mjs")).toContain(`process.env.NEXT_PUBLIC_DATA_SOURCE ?? "api"`);
  });
});
