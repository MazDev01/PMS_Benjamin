import { defineConfig, devices } from "@playwright/test";

// ── ถ่ายรูปก่อน/หลังกับเซิร์ฟเวอร์ที่รันอยู่แล้ว (dealer :3001 · hq :3002) — ไม่ใช่ชุดทดสอบ ไม่สตาร์ทเซิร์ฟเวอร์เอง ──
//   ใช้: PMS_SHOTS=ก่อน npx playwright test -c tests/scenario/shots.config.ts
export default defineConfig({
  testDir: ".",
  testMatch: /zz-shots-(r4|dash)\.spec\.ts$/,
  outputDir: "../../node_modules/.cache/playwright-shots",
  workers: 1,
  retries: 0,
  timeout: 900_000,
  expect: { timeout: 15_000 },
  use: { ...devices["Desktop Chrome"], headless: true, navigationTimeout: 45_000, actionTimeout: 15_000, trace: "off", screenshot: "off" },
});
