import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { accessCookie, refreshCookie, clearCookie, ACCESS_COOKIE } from "../../packages/shared/server/v1/_cookie";

// คุกกี้ใบผ่าน: Secure ตามคำขอจริง (บอสสั่ง 15 ต.ค. 69 · ต่อจาก 9d5a827)
//   https / x-forwarded-proto: https (Vercel) → ต้องมี Secure · http://localhost → ไม่มี Secure (WebKit ทิ้งคุกกี้ Secure บน http)
const คำขอ = (url: string, headers: Record<string, string> = {}) => ({ url, headers: { get: (n: string) => headers[n.toLowerCase()] ?? null } });
const เดิม = { ...process.env };
beforeEach(() => { delete process.env.VERCEL_ENV; delete process.env.PMS_LOCAL_HTTP_TEST; delete process.env.NEXT_PUBLIC_SITE_URL; });
afterEach(() => { process.env = { ...เดิม }; });

describe("คุกกี้ใบผ่าน · Secure", () => {
  it("คำขอทาง https → Secure", () => {
    expect(accessCookie("t", 60, คำขอ("https://dealerpms.benjaminpebsteel.com/api/v1/auth?op=login")).secure).toBe(true);
  });
  it("x-forwarded-proto: https (แบบบน Vercel — แอปเห็น http ภายใน) → Secure", () => {
    const r = คำขอ("http://dealerpms.benjaminpebsteel.com/api/v1/auth", { "x-forwarded-proto": "https" });
    expect(accessCookie("t", 60, r).secure).toBe(true);
    expect(refreshCookie("r", r).secure).toBe(true);
    expect(clearCookie(ACCESS_COOKIE, r).secure).toBe(true);
  });
  it("http://localhost → ไม่มี Secure (แม้ NODE_ENV=production แบบรอบทดสอบ production build)", () => {
    const r = คำขอ("http://localhost/api/v1/auth?op=login");
    expect(accessCookie("t", 60, r).secure).toBe(false);
    expect(refreshCookie("r", r).secure).toBe(false);
    expect(clearCookie(ACCESS_COOKIE, r).secure).toBe(false);
  });
  it("x-forwarded-proto: http ชนะ URL (พร็อกซีบอกว่ามาทาง http) → ไม่มี Secure", () => {
    expect(accessCookie("t", 60, คำขอ("https://x.test/", { "x-forwarded-proto": "http" })).secure).toBe(false);
  });
  it("บน Vercel → Secure เสมอ แม้คำขอดูเป็น http และตั้ง PMS_LOCAL_HTTP_TEST ไว้ผิดที่", () => {
    process.env.VERCEL_ENV = "production"; process.env.PMS_LOCAL_HTTP_TEST = "1";
    expect(accessCookie("t", 60, คำขอ("http://localhost/")).secure).toBe(true);
  });
  it("ค่าอื่นของคุกกี้คงเดิม: httpOnly · sameSite lax · path /", () => {
    expect(accessCookie("t", 60, คำขอ("http://localhost/"))).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 });
  });
});
