import { describe, it, expect } from "vitest";
import { dsnใช้ได้ } from "@pms/shared/lib/observability";

// DSN เพี้ยน = Sentry ปิดตัวเองเงียบ ๆ ระบบพังแล้วไม่มีใครได้รับแจ้ง
// (เจอตอนซ้อมแจ้งเตือน 3 ก.ย. 69) — ตัวตรวจนี้ทำให้รู้ดีลเลอร์ที่จะเงียบ
describe("ที่อยู่ปลายทางแจ้งเตือน (Sentry DSN)", () => {
  it("รูปแบบถูกต้อง = ใช้ได้", () => {
    expect(dsnใช้ได้("https://abc123@o4511891572588544.ingest.de.sentry.io/4511891607715920")).toBe(true);
    expect(dsnใช้ได้("http://key1234@127.0.0.1:9999/1")).toBe(true);
  });
  it("รูปแบบเพี้ยน = จับได้", () => {
    for (const เพี้ยน of [
      undefined, "", "ไม่ใช่ที่อยู่",
      "https://ทดสอบ@127.0.0.1:9999/1",          // กุญแจเป็นภาษาไทย
      "https://o123.ingest.sentry.io/456",        // ไม่มีกุญแจ
      "https://abc@o123.ingest.sentry.io",        // ไม่มีหมายเลขโครงการ
      "https://abc@o123.ingest.sentry.io/abc",    // หมายเลขโครงการไม่ใช่ตัวเลข
      "ftp://abc@host/1",                         // โปรโตคอลผิด
    ]) expect(dsnใช้ได้(เพี้ยน)).toBe(false);
  });
});
