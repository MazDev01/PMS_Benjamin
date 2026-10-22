import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";

// ── รันข้อทดสอบกับเซิร์ฟเวอร์ที่เปิดอยู่แล้ว (พอร์ตของโฟลเดอร์นี้ · tests/scenario/sessionPorts.ts) — ใช้ระหว่างพัฒนาเท่านั้น ──────────────────────
//   รอบตรวจเต็ม/ปิดด่านใช้ npm run test:prodbuild เสมอ (build + สตาร์ทเอง) · ที่นี่ไม่สตาร์ท/ไม่ปิดเซิร์ฟเวอร์ของใคร
//   ใช้: npx playwright test -c playwright.existing.config.ts tests/scenario/<ไฟล์>.spec.ts
export default defineConfig({
  ...base,
  webServer: undefined,
  // ไม่ใช้ข้อมูลตั้งต้นกลาง (globalSetup/Teardown ลบ ZZTEST-BASE) — อาจมีอีกเซสชันใช้ข้อมูลชุดนั้นอยู่พร้อมกัน
  //   แต่ยังเขียนฐานทดสอบ → ถือล็อกฐานทดสอบตลอดการรัน (tests/scenario/testDbLockSetup.ts · 22 ต.ค. 69)
  globalSetup: "./tests/scenario/testDbLockSetup.ts",
  globalTeardown: undefined,
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
