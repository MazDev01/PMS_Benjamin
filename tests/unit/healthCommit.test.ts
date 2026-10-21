import { describe, it, expect, afterEach } from "vitest";
import { healthHandler } from "../../packages/shared/lib/healthCheck";

// ── หน้าตรวจสุขภาพบอก commit ที่รันอยู่ (บอสสั่ง 21 ต.ค. 69 · ยืนยันเว็บจริงหลังขึ้นระบบโดยไม่ต้องล็อกอิน Vercel) ──
const เดิม = process.env.VERCEL_GIT_COMMIT_SHA;
afterEach(() => { if (เดิม === undefined) delete process.env.VERCEL_GIT_COMMIT_SHA; else process.env.VERCEL_GIT_COMMIT_SHA = เดิม; });

describe("healthHandler · commit", () => {
  it("บน Vercel: บอกเลข commit 7 ตัวแรก", async () => {
    process.env.VERCEL_GIT_COMMIT_SHA = "fcd0b964ead00e6f5ba33078decd658be6ac1b2d";
    const j = await (await healthHandler("hq", [])()).json();
    expect(j.commit).toBe("fcd0b96");
  });
  it("ในเครื่อง (ไม่มีค่าจาก Vercel): null", async () => {
    delete process.env.VERCEL_GIT_COMMIT_SHA;
    const j = await (await healthHandler("hq", [])()).json();
    expect(j.commit).toBeNull();
  });
});
