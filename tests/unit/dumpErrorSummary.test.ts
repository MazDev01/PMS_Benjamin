// ── ขั้นดึงไฟล์สำรองล้ม: ข้อความ "ไม่ผ่าน" ต้องพาเหตุจากคำสั่งมาด้วย (scripts/lib/backupArgs.mjs ย่อข้อผิดพลาดdump · 17 พ.ย. 69) ──
//   เหตุจริง: รอบ deploy23 db-push-prod-guard ตก 9 ข้อย่อย "ดึงไฟล์สำรอง … คำสั่งจบด้วยรหัส 1" แล้วผ่านตอนรันซ้ำ
//   เหตุอยู่ใน .dump.log ของโฟลเดอร์ชั่วคราวที่ข้อทดสอบลบทิ้ง → หาต้นเหตุไม่ได้ · ตอนนี้แนบบรรทัดบอกเหตุไว้ในข้อความ (ไปอยู่ในบันทึกรอบ)
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
// @ts-expect-error — ไฟล์ .mjs ของเครื่องมือ (ไม่มีชนิดข้อมูล)
import { ย่อข้อผิดพลาดdump } from "../../scripts/lib/backupArgs.mjs";

describe("ย่อข้อผิดพลาดdump", () => {
  it("เอาบรรทัดที่บอกความผิดพลาด ทิ้งคำเตือน Node", () => {
    const ผล = ย่อข้อผิดพลาดdump([
      "Dumping schemas from local database...",
      "(node:14316) [DEP0190] DeprecationWarning: Passing args to a child process with shell option true",
      "(Use `node --trace-deprecation ...` to show where the warning was created)",
      "pg_dump: error: query failed: ERROR:  cache lookup failed for function 123456",
      "error running container: exit 1",
    ].join("\n"));
    expect(ผล).toBe("pg_dump: error: query failed: ERROR:  cache lookup failed for function 123456 | error running container: exit 1");
  });
  it("ซ่อนรหัสผ่านใน URL ฐาน", () => {
    const ผล = ย่อข้อผิดพลาดdump("failed to connect to postgresql://pms_writer:ลับมาก123@127.0.0.1:55322/postgres");
    expect(ผล).toContain("pms_writer:***@127.0.0.1");
    expect(ผล).not.toContain("ลับมาก123");
  });
  it("ไม่มีคำบอกผิดพลาด = บรรทัดท้าย 3 บรรทัด · ยาวเกิน 400 ตัด · ว่าง = ว่าง", () => {
    expect(ย่อข้อผิดพลาดdump("ก\nข\nค\nง")).toBe("ข | ค | ง");
    expect(ย่อข้อผิดพลาดdump(`error ${"x".repeat(600)}`).length).toBe(401);
    expect(ย่อข้อผิดพลาดdump("")).toBe("");
    expect(ย่อข้อผิดพลาดdump(undefined)).toBe("");
  });
  it("เครื่องมือสำรองแนบข้อความจากคำสั่งในข้อความไม่ผ่านของขั้นดึงไฟล์สำรอง", () => {
    const s = readFileSync("scripts/prod-backup-verify.mjs", "utf8");
    expect(s).toMatch(/ข้อความจากคำสั่ง: \$\{ย่อข้อผิดพลาดdump\(ข้อความ\)\}/);
  });
});
