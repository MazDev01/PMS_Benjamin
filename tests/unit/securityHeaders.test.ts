import { describe, it, expect } from "vitest";
// ไฟล์กฎเป็น .mjs (ต้องเป็น .mjs เพราะ next.config.ts ต้อง import ได้ตอน build) จึงไม่มีชนิดข้อมูลกำกับ
// ประกาศชนิดที่ต้องการตรงนี้เอง — ได้ทั้งความปลอดภัยของ TypeScript และไม่ต้องแตะไฟล์ต้นทาง
// @ts-expect-error — โมดูล .mjs ไม่มีไฟล์ประกาศชนิด (ตั้งใจ)
import * as headers from "../../packages/shared/lib/securityHeaders.mjs";
const cspWithNonce = headers.cspWithNonce as (nonce: string) => string;
const SECURITY_HEADERS = headers.SECURITY_HEADERS as { key: string; value: string }[];

// ── กฎความปลอดภัยของหน้าเว็บ — ตรวจ "ตัวข้อความของกฎ" ตรง ๆ ────────────────────────
//
// ทำไมต้องมีชั้นนี้: ชุดทดสอบเบราว์เซอร์รันบนโหมดพัฒนา ซึ่งใช้กฎคนละชุดกับตอนรันจริง
//   (โหมดพัฒนาต้องผ่อนให้ React Refresh ทำงาน) → กฎของ "ตอนรันจริง" จึงไม่มีอะไรตรวจเลย
//   ถ้าวันหนึ่งมีคนเผลอใส่ unsafe-inline กลับเข้าไปเพื่อแก้ปัญหาเฉพาะหน้า จะไม่มีใครรู้
//   จนกว่าจะโดนเจาะจริง — ตรวจที่ตัวข้อความกฎเลยจึงเป็นชั้นที่ถูกที่สุดและเชื่อได้ที่สุด
describe("กฎความปลอดภัยของหน้าเว็บ", () => {
  const csp = cspWithNonce("TESTNONCE");

  it("ส่วนสคริปต์ต้องไม่มี unsafe-inline (ไม่งั้นกัน XSS ไม่ได้จริง)", () => {
    const scriptSrc = csp.split(";").find((d: string) => d.trim().startsWith("script-src")) ?? "";
    expect(scriptSrc).not.toContain("unsafe-inline");
    expect(scriptSrc).not.toContain("unsafe-eval");
  });

  it("ต้องมีรหัสยืนยันของคำขอนั้นอยู่ในกฎ", () => {
    expect(csp).toContain("'nonce-TESTNONCE'");
    expect(csp).toContain("'strict-dynamic'");
  });

  it("ต้องจำกัดปลายทางที่ส่งข้อมูลออกได้ — ห้ามเปิดกว้าง", () => {
    const connect = csp.split(";").find((d: string) => d.trim().startsWith("connect-src")) ?? "";
    expect(connect).toContain("'self'");
    expect(connect).toContain("supabase.co");
    expect(connect).not.toMatch(/\s\*(\s|$)/);   // ห้ามมี * เดี่ยว ๆ ที่เปิดให้ทุกปลายทาง
  });

  it("ต้องห้ามเว็บอื่นฝังหน้าเราใน iframe และห้ามเปลี่ยนปลายทางฟอร์ม", () => {
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("base-uri 'self'");
  });

  // ฟอนต์ของเอกสารที่พิมพ์ (Sarabun) อยู่ในเว็บเราเอง (บอสสั่ง 12 พ.ย. 69 · ทำ 26 พ.ย. 69 · lib/printFont.ts)
  //   → font-src 'self' พอ · ปิดทาง Google ทั้งสองชุดกฎ (ตอนรันจริง nonce + ชุดหัวข้อทั่วไป) ไม่ให้เบราว์เซอร์ส่งคำขอไป Google
  it("ฟอนต์ของเอกสารที่พิมพ์มาจากเว็บเราเอง ('self') และไม่เปิดทาง Google", () => {
    const fontSrc = csp.split(";").find((d: string) => d.trim().startsWith("font-src")) ?? "";
    expect(fontSrc).toContain("'self'");
    const ทั่วไป = SECURITY_HEADERS.find(h => h.key === "Content-Security-Policy")?.value ?? "";
    for (const กฎ of [csp, ทั่วไป]) {
      expect(กฎ).not.toContain("fonts.gstatic.com");
      expect(กฎ).not.toContain("fonts.googleapis.com");
    }
  });

  it("หัวข้อความปลอดภัยพื้นฐานต้องครบทุกตัว", () => {
    const keys = SECURITY_HEADERS.map(h => h.key);
    for (const k of ["X-Frame-Options", "X-Content-Type-Options", "Referrer-Policy", "Permissions-Policy"]) {
      expect(keys, `ขาดหัวข้อ ${k}`).toContain(k);
    }
  });
});
