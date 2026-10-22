import { defineConfig, devices } from "@playwright/test";

// ── ทดลองใช้เว็บแทนบอส (บอสสั่ง 21 ต.ค. 69) — ไม่ใช่ข้อทดสอบประจำ · รันผ่าน tests/prod-live/run.mjs ... trial เท่านั้น ──
//   ไฟล์ชื่อ trial.ts (ไม่ใช่ .spec.ts) ชุด prod-live ปกติจึงไม่หยิบไปรัน
export default defineConfig({
  testDir: ".",
  testMatch: /trial\.ts$/,
  outputDir: "../../../node_modules/.cache/playwright-trial",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 1_800_000,
  expect: { timeout: 15_000 },
  use: {
    ...devices["Desktop Chrome"],
    headless: true,
    viewport: { width: 1440, height: 900 },
    navigationTimeout: 45_000,
    actionTimeout: 15_000,
    trace: "off",
    screenshot: "off",
  },
});
