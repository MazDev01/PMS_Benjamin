import { describe, it, expect } from "vitest";
import { ชนิดจากไบต์, ตรวจไฟล์โลโก้, ที่อยู่โลโก้, โลโก้ใหญ่สุด, โลโก้เดิม } from "@pms/shared/lib/brandLogo";

// ── โลโก้ของระบบ (บอสสั่ง 24 พ.ย. 69 · ใบ 0304): ตรวจชนิดจากไบต์จริง ไม่ดูนามสกุล ──
//   ชุดเดียวกับ _brand_logo_mime ในฐาน · ตกบนโค้ดเดิม: ไม่มีไฟล์ lib/brandLogo
const ไบต์ = (...h: number[]) => new Uint8Array(h);
const PNG = ไบต์(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13);
const JPG = ไบต์(0xff, 0xd8, 0xff, 0xe0, 0, 16);
const WEBP = ไบต์(0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x45, 0x42, 0x50);
const ข้อความ = (s: string) => new TextEncoder().encode(s);

describe("ตรวจไฟล์โลโก้", () => {
  it("PNG / JPEG / WebP รู้จักจากไบต์หัวไฟล์", () => {
    expect(ชนิดจากไบต์(PNG)).toBe("image/png");
    expect(ชนิดจากไบต์(JPG)).toBe("image/jpeg");
    expect(ชนิดจากไบต์(WEBP)).toBe("image/webp");
    expect(ตรวจไฟล์โลโก้(PNG)).toBe("");
  });
  it("SVG · ข้อความที่ตั้งชื่อ .png · ไฟล์ว่าง · RIFF ที่ไม่ใช่ WebP = ไม่รับ", () => {
    expect(ชนิดจากไบต์(ข้อความ('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))).toBeNull();
    expect(ชนิดจากไบต์(ข้อความ("ไม่ใช่รูป แค่ตั้งชื่อ logo.png"))).toBeNull();
    expect(ชนิดจากไบต์(ไบต์())).toBeNull();
    expect(ชนิดจากไบต์(ไบต์(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45))).toBeNull();   // RIFF....WAVE
    expect(ชนิดจากไบต์(ไบต์(0x89, 0x50, 0x4e, 0x47))).toBeNull();   // หัว PNG ไม่ครบ
    expect(ตรวจไฟล์โลโก้(ข้อความ("<svg/>"))).toBe("ไฟล์โลโก้ต้องเป็น PNG JPG หรือ WebP");
  });
  it("ขนาด: พอดี 1 MB ผ่าน · เกิน 1 ไบต์ไม่รับ", () => {
    const พอดี = new Uint8Array(โลโก้ใหญ่สุด); พอดี.set(PNG);
    const เกิน = new Uint8Array(โลโก้ใหญ่สุด + 1); เกิน.set(PNG);
    expect(ตรวจไฟล์โลโก้(พอดี)).toBe("");
    expect(ตรวจไฟล์โลโก้(เกิน)).toBe("ไฟล์โลโก้ใหญ่เกิน 1 MB");
  });
  it("ที่อยู่รูป: ไม่ตั้ง = โลโก้ Benjamin เดิม · ตั้งแล้ว = เส้นทางที่ต้องล็อกอิน พร้อม sha", () => {
    expect(ที่อยู่โลโก้(null)).toBe(โลโก้เดิม);
    expect(ที่อยู่โลโก้("ab12")).toBe("/api/v1/brand-logo?v=ab12");
  });
});
