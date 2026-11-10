import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
// @ts-expect-error — ไฟล์ .mjs ของเครื่องมือ (ไม่มีชนิดข้อมูล)
import { warningจากการลงใบ, warningที่ตก, ยกเว้นSetLocal } from "../../scripts/lib/migrationWarnings.mjs";

// ── WARNING ตอนลงใบปรับฐาน = ล้างฐานทดสอบไม่ผ่าน (รอบตรวจตก) · คนรวมงานแจ้ง 10 พ.ย. 69 ─────────────────────────────
//   db push ฐานจริงใบ 0284 ขึ้น WARNING SET LOCAL · supabase db reset ของรอบตรวจขึ้นเหมือนกัน แต่ reset-test-db เดิมทิ้งผล
//   ตกบนโค้ดเดิม: ไม่มี scripts/lib/migrationWarnings.mjs · reset-test-db ไม่อ่าน WARNING
//   (พิสูจน์กับฐานจริงในเครื่อง 10 พ.ย. 69: ใบทดลอง 0999 ที่มี set local ระดับบนสุด → reset-test-db ตก บอกชื่อใบ 2 จุด)
const ผลจริง = [
  "Applying migration 0249_x.sql...",
  "NOTICE (42P07): relation already exists, skipping",
  "Applying migration 0250_lead_tasks_five_steps.sql...",
  "WARNING (25P01): SET LOCAL can only be used in transaction blocks",
  "WARNING (25P01): SET LOCAL can only be used in transaction blocks",
  "Applying migration 0999_zz_new.sql...",
  "WARNING (25P01): SET LOCAL can only be used in transaction blocks",
  "Applying migration 1000_zz_other.sql...",
  "WARNING (01000): ข้อมูลบางแถวแปลงไม่ได้",
  "Finished supabase db reset on branch main.",
].join("\r\n");

describe("warningจากการลงใบ / warningที่ตก", () => {
  it("ผูก WARNING กับใบที่กำลังลง · อ่านรหัส", () => {
    expect(warningจากการลงใบ(ผลจริง)).toEqual([
      { ใบ: "0250_lead_tasks_five_steps.sql", รหัส: "25P01", ข้อความ: "SET LOCAL can only be used in transaction blocks" },
      { ใบ: "0250_lead_tasks_five_steps.sql", รหัส: "25P01", ข้อความ: "SET LOCAL can only be used in transaction blocks" },
      { ใบ: "0999_zz_new.sql", รหัส: "25P01", ข้อความ: "SET LOCAL can only be used in transaction blocks" },
      { ใบ: "1000_zz_other.sql", รหัส: "01000", ข้อความ: "ข้อมูลบางแถวแปลงไม่ได้" },
    ]);
  });
  it("ใบเก่าที่ยกเว้น (SET LOCAL 25P01 เท่านั้น) ไม่ตก · ใบใหม่ / WARNING อื่น ตก", () => {
    expect(warningที่ตก(ผลจริง).map((w: { ใบ: string }) => w.ใบ)).toEqual(["0999_zz_new.sql", "1000_zz_other.sql"]);
  });
  it("ใบที่ยกเว้นแต่ WARNING เรื่องอื่น = ตก (ยกเว้นเฉพาะเรื่อง SET LOCAL)", () => {
    const ผล = "Applying migration 0284_lead_stage_four.sql...\nWARNING (01000): อย่างอื่น";
    expect(warningที่ตก(ผล)).toHaveLength(1);
  });
  it("ไม่มี WARNING = ไม่ตก", () => {
    expect(warningที่ตก("Applying migration 0001_a.sql...\nNOTICE: ok\nFinished")).toEqual([]);
  });
  it("รายการยกเว้น = ใบที่มีอยู่จริงทุกใบ และเป็นใบที่ลงฐานจริงแล้ว (ไม่เกิน 0285)", () => {
    for (const f of Object.keys(ยกเว้นSetLocal)) {
      expect(readFileSync(`supabase/migrations/${f}`, "utf8").length, f).toBeGreaterThan(0);
      expect(Number(f.slice(0, 4)), `${f}: ใบใหม่ไม่มีทางยกเว้น`).toBeLessThanOrEqual(285);
    }
  });
  it("reset-test-db ใช้ตัวอ่านนี้ (อ่าน stdout + stderr ของ db reset)", () => {
    const ซอร์ส = readFileSync("scripts/reset-test-db.mjs", "utf8");
    expect(ซอร์ส).toContain("warningที่ตก(ข้อความล้าง)");
    expect(ซอร์ส).toMatch(/ผลล้าง\.stdout[\s\S]*ผลล้าง\.stderr/);
  });
});
