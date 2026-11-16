// ── คำขอถูกตัดกลางทาง: ข้อความบนจอเป็นไทย ("โหลดข้อมูลไม่เสร็จ") แต่ตัวแยกยังรู้ว่าเป็นการถูกตัด ไม่ใช่ข้อผิดพลาด (ตรวจคำขั้น 4 กลุ่ม ข) ──
//   กับดักเดิม (3 ก.ย. 69): เปลี่ยนข้อความแล้วตัวแยกไม่รู้จัก → คำขอที่ถูกยกเลิกตามปกติกลายเป็น error ดังทั้งจอ
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { isAbortedRequest } from "@pms/shared/lib/repoLog";

describe("isAbortedRequest รู้จักข้อความใหม่", () => {
  it("โหลดข้อมูลไม่เสร็จ = ถูกตัดกลางทาง · ข้อความทั่วไปไม่ใช่", () => {
    expect(isAbortedRequest(new Error("โหลดข้อมูลไม่เสร็จ — ลองใหม่อีกครั้ง"))).toBe(true);
    expect(isAbortedRequest(new Error("ไม่มีสิทธิ์ทำรายการนี้"))).toBe(false);
  });
  it("HttpAdapter ใช้ข้อความเดียวกับที่ตัวแยกรู้จัก และไม่มีคำ aborted บนจอแล้ว", () => {
    const s = readFileSync("packages/shared/lib/data/http/HttpAdapter.ts", "utf8");
    expect(s).toContain(`new DbError("โหลดข้อมูลไม่เสร็จ — ลองใหม่อีกครั้ง")`);
    expect(s).not.toContain("(aborted)");
  });
});
