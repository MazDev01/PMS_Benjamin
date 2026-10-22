import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── คำขอฝั่งผู้ดูแล (adminApi.ts) ต่ออายุใบผ่านเมื่อได้ 401 แล้วยิงซ้ำ (ทดลองใช้เว็บจริงแทนบอส 21 ต.ค. 69) ──
//   เจอบนเว็บจริง: ใช้หน้า HQ จนใบผ่านหมดอายุ แล้วกด "เข้าระบบแทน" → POST /api/admin/dealers/impersonate ตอบ 401 ใช้งานไม่ได้
//   คำขอทั่วไป (apiFetch) ต่ออายุให้อยู่แล้ว · คำขอฝั่งผู้ดูแลยิง fetch ตรง ๆ จึงพัง
const caRefresh = vi.fn();
vi.mock("../../packages/shared/lib/cookieAuth", () => ({ caRefresh }));
vi.mock("../../packages/shared/lib/data/supabase/client", () => ({ getSupabase: () => ({}) }));

const ตอบ = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

async function โหลด() {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_DATA_SOURCE", "api");   // เว็บจริงใช้โหมด api (ใบผ่านอยู่ใน cookie)
  return await import("../../packages/shared/lib/adminApi");
}

beforeEach(() => { caRefresh.mockReset(); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("adminFetch", () => {
  it("401 → ต่ออายุใบผ่าน → ยิงซ้ำแล้วสำเร็จ", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(ตอบ(401)).mockResolvedValueOnce(ตอบ(200, { link: "https://ลิงก์" }));
    vi.stubGlobal("fetch", fetch);
    caRefresh.mockResolvedValue({ user: "ok" });
    const { impersonateDealer } = await โหลด();
    const r = await impersonateDealer("ZZU");
    expect(r).toEqual({ ok: true, link: "https://ลิงก์" });
    expect(caRefresh).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("ต่ออายุไม่สำเร็จ → ไม่ยิงซ้ำ · บอก error ตามจริง", async () => {
    const fetch = vi.fn().mockResolvedValue(ตอบ(401, { error: "ยังไม่ได้เข้าสู่ระบบ" }));
    vi.stubGlobal("fetch", fetch);
    caRefresh.mockResolvedValue(null);
    const { impersonateDealer } = await โหลด();
    const r = await impersonateDealer("ZZU");
    expect(r.ok).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("ตอบปกติ → ไม่ต่ออายุ", async () => {
    const fetch = vi.fn().mockResolvedValue(ตอบ(200, { link: "x" }));
    vi.stubGlobal("fetch", fetch);
    const { impersonateDealer } = await โหลด();
    await impersonateDealer("ZZU");
    expect(caRefresh).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
