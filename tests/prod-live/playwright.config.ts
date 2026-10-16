import { defineConfig, devices } from "@playwright/test";

// ── ทดสอบ flow ขายบนเว็บจริง (เขียนข้อมูล) — รันผ่าน tests/prod-live/run.mjs เท่านั้น ──
export default defineConfig({
  testDir: ".",
  outputDir: "../../node_modules/.cache/playwright-live",
  fullyParallel: false,
  workers: 1,
  retries: 0,           // เขียนข้อมูลจริง — ห้ามรันซ้ำเอง
  timeout: 240_000,
  expect: { timeout: 20_000 },
  use: {
    ...devices["Desktop Chrome"],
    headless: true,
    viewport: { width: 1280, height: 900 },
    navigationTimeout: 45_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
