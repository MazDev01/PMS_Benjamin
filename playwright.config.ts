import { defineConfig, devices } from "@playwright/test";

// /scenario harness — ทดสอบเบราว์เซอร์จริง หลาย persona พร้อมกัน (user / UX / UI)
// โมโนเรโป: `npm run dev` (turbo) สตาร์ท dealer(:3001) + hq(:3002) · baseURL ตั้งเป็น HQ (:3002)
// เพราะเทสต์ส่วนใหญ่ยิง route /hq/* · เทสต์ dealer-only ให้ใช้ URL เต็ม http://localhost:3001/...
// reuseExistingServer=true → ถ้ามี dev server รันอยู่แล้วใช้ตัวนั้น ไม่สตาร์ทซ้ำ (กัน .next เขียนทับกัน)
// ── ตัวแปรที่สั่งให้ชุด price-switch "ตกโดยตั้งใจ" ห้ามตั้งในระบบรันอัตโนมัติ (CI) ─────────────
// PMS_FORCE_FAIL_PRICE_SWITCH=1 มีไว้ให้คนพิสูจน์ด้วยมือว่า "ชุดตกกลางทางแล้วสวิตช์ซ่อนราคายังถูกปิดคืน"
// หลุดเข้า CI = ชุดทดสอบแดงทุกรอบโดยไม่มีใครรู้ว่าตั้งใจ และข้อที่เหลือในไฟล์นั้นไม่ได้รันเลย → หยุดตั้งแต่โหลดค่าตั้งต้น
if (process.env.CI && process.env.PMS_FORCE_FAIL_PRICE_SWITCH) {
  throw new Error(
    "ห้ามตั้ง PMS_FORCE_FAIL_PRICE_SWITCH ในระบบรันอัตโนมัติ (CI) — ตัวแปรนี้ทำให้ชุด price-switch ตกโดยตั้งใจ " +
    "ใช้เฉพาะตอนพิสูจน์ด้วยมือบนเครื่องพัฒนา (ดู docs/GO-LIVE-CHECKLIST.md ข้อ 5.1) · เอาตัวแปรนี้ออกแล้วรันใหม่",
  );
}

// ── หลักฐานของข้อที่ตก แยกโฟลเดอร์ตามรอบ (บอสสั่ง 15 ต.ค. 69) ─────────────────────────────────────────────
//   เดิมทุกรอบเขียนทับโฟลเดอร์เดียวกัน — hq-quote-flow:120 ตกครั้งแรกในรอบปิดด่าน 3 แล้วหลักฐานถูกรอบหลังลบทิ้ง
//   ตอนนี้: ข้อที่ตกเก็บ trace (มีคำขอเครือข่าย + คำตอบ + ภาพทุกขั้น) และภาพหน้าจอ ไว้ที่โฟลเดอร์ของรอบ (วันเวลา)
//   รหัสรอบตั้งครั้งเดียวใน process หลัก แล้ว worker ได้ค่าเดียวกันผ่าน env · ตัวรันเป็นช่วงตั้งค่าเดียวให้ทุกช่วง
//   ดู trace: npx playwright show-trace <โฟลเดอร์ของข้อ>/trace.zip
process.env.PMS_RUN_ID ??= new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 19).replace(/[:T]/g, "-");

export default defineConfig({
  testDir: "./tests/scenario",
  // ข้อมูลตั้งต้น (ลีด/ใบเสนอราคา/ลูกค้า ติดแท็ก ZZTEST-BASE) สำหรับกลุ่มเทสต์ที่แค่ "เปิดหน้าไปดู"
  // ไม่ได้สร้างข้อมูลเอง (hq-quotations/redesign/ui/ux/user/scenario-fixes) — DB จริงว่างเปล่า
  // ก่อนหน้านี้กลุ่มนี้พึ่ง mock.ts (local mode) ซึ่งใช้ไม่ได้แล้วเพราะแอปรันโหมด supabase จริง
  globalSetup: "./tests/scenario/global-setup.ts",
  globalTeardown: "./tests/scenario/global-teardown.ts",
  // เก็บ artifact ไว้ใน node_modules/.cache — ที่เดิม (test-results/) อยู่ในโปรเจกต์
  // ทุกครั้งที่เทสต์เขียนไฟล์ dev server จะเห็นไฟล์เปลี่ยนแล้ว recompile ทั้งหน้า → เทสต์เจอ 404 กลางคัน
  //   ช่วงของตัวรันเป็นช่วง (chromium/safari/…) ได้โฟลเดอร์ย่อยของตัวเอง — Playwright ล้าง outputDir ทุกครั้งที่เริ่ม
  //   ใช้โฟลเดอร์เดียวกันทั้งรอบ = ช่วงหลังลบหลักฐานของช่วงก่อน (รอบปิดด่าน 4 · 15 ต.ค. 69 โฟลเดอร์ว่างทั้งที่มีข้อตก)
  outputDir: `node_modules/.cache/playwright-results/${process.env.PMS_RUN_ID}${process.env.PMS_RUN_STAGE ? `/${process.env.PMS_RUN_STAGE}` : ""}`,
  // ⛔ ห้ามเปิด fullyParallel — เคยเปิดไว้แล้วทำให้ผลเทสต์เชื่อไม่ได้ (พิสูจน์แล้ว 6 ส.ค. 69)
  //
  // fullyParallel=true แจกเทสต์ "ในไฟล์เดียวกัน" ไปคนละ worker ได้ แต่ Playwright รัน
  // beforeAll/afterAll ของไฟล์ "ครั้งหนึ่งต่อ worker" → worker ที่ทำส่วนของตัวเองจบก่อน
  // จะยิง afterAll (= cleanup ลบข้อมูลทดสอบของไฟล์นั้นทั้งช่อง) ทั้งที่เทสต์ตัวช้าของไฟล์เดียวกัน
  // ยังทำงานอยู่บน worker อื่น → ข้อมูลที่เทสต์นั้นเพิ่งสร้างหายกลางคัน แล้วล้มแบบดูเหมือนบั๊กจริง
  //
  // หลักฐาน: upload-and-duplicate (workers=3) beforeAll ยิง 3 ครั้งตอนเริ่มพร้อมกัน แต่ afterAll
  //   ยิงที่วินาที 13 / 17 / 19 ระหว่างที่เทสต์ "กดบันทึกรัว" (รอแถวได้ถึง 60s) ยังค้างอยู่
  //   → แถวหายทั้งที่ waitRow เพิ่งเจอ (นับได้ 0) หรือไม่โผล่มาเลย · รัน workers=1 ผ่านทุกครั้ง
  //
  // false = ไฟล์ยังรันขนานกันข้าม worker เหมือนเดิม (ความเร็วส่วนใหญ่ยังอยู่) แต่เทสต์ในไฟล์เดียวกัน
  // อยู่ worker เดียวเรียงกัน → beforeAll/afterAll อย่างละครั้งเดียวต่อไฟล์ ตามที่ cleanup ออกแบบไว้
  // (ไม่ใช้ describe.configure({mode:"serial"}) เพราะโหมดนั้นจะข้ามเทสต์ที่เหลือทันทีที่มีตัวล้ม
  //  = ซ่อนผลตรวจที่เหลือ ซึ่งตรงข้ามกับสิ่งที่ต้องการตอนตรวจรับระบบ)
  fullyParallel: false,
  workers: 3, // 3 ไฟล์ทำงานพร้อมกัน
  // รันซ้ำ 1 ครั้งเฉพาะเทสต์ที่ล้ม — ไม่ใช่การกลบบั๊ก:
  //   ชุด supabase รันหลาย spec ขนานกัน ถล่ม dev server ตัวเดียวที่คอมไพล์ route ครั้งแรกไปด้วย
  //   test แรกที่แตะ route เย็น ๆ ใต้ 3 browser พร้อมกันเลยช้าเกิน timeout เป็นครั้งคราว (latency ของสภาพทดสอบ)
  //   บั๊กจริงจะล้มทั้งครั้งแรกและครั้งรัน (retry ไม่ช่วย) · เฉพาะ latency ชั่วคราวเท่านั้นที่ผ่านตอน retry
  retries: 1,
  timeout: 30_000,
  // 8 วินาทีตึงเกินไปสำหรับสภาพทดสอบจริง (3 เบราว์เซอร์ + เซิร์ฟเวอร์โหมดพัฒนา + ฐานข้อมูลบนคลาวด์)
  //   เทสต์ที่ล้มสลับหน้ากันไปมาทุกรอบล้วนล้มด้วย "รอ 8 วินาทีแล้วยังไม่ขึ้น" ไม่ใช่ผลที่ผิด (26 ส.ค. 69)
  //   ขยับเป็น 12 วินาที — บั๊กจริงล้มทุกค่า timeout อยู่แล้ว ตัวเลขนี้จึงไม่กลบบั๊ก แค่ตัดเสียงรบกวน
  expect: { timeout: 12_000 },
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3002",
    headless: true,
    viewport: { width: 1280, height: 900 },
    trace: "retain-on-failure",          // เก็บเฉพาะครั้งที่ตก (รวมครั้งแรกของข้อที่ไม่นิ่ง) — ผ่านแล้วลบทิ้ง
    screenshot: "only-on-failure",
    actionTimeout: 8_000,
    navigationTimeout: 20_000,
  },
  // ── แยก "ชุดทดสอบโหลดหนัก" ออกไปรันทีหลัง ห้ามรันคาบเกี่ยวกับชุดอื่น ────────────────
  //
  // ปัญหา (ผลตรวจสอบระบบ 7 ส.ค. 69 · M-3): รันชุดเต็มแล้วตกไม่ซ้ำข้อกันทุกรอบ 0–11 ข้อ
  //   ไล่แก้ต้นเหตุไปแล้ว 5 อย่าง (ล็อกอินถี่เกิน · ตัวเก็บกวาดไล่ลบข้อมูลรอบรันซ้ำ ·
  //   ตารางแบ่งหน้าไม่ค้นหาก่อน 2 จุด · อ่านตัวเลขก่อนข้อมูลมาถึง) แต่ยังเหลือเรื่องเชิงโครงสร้าง
  //
  // ตัวการที่ใหญ่ที่สุดที่เหลือคือ multi-dealer-stress: สร้างตัวแทนจริง 10 ราย เปิดเบราว์เซอร์
  //   10 บริบทพร้อมกัน แล้วให้ทุกรายเขียนข้อมูลรัว ๆ — ถล่ม dev server ตัวเดียวที่ชุดอื่นใช้อยู่ด้วย
  //   ชุดอื่นที่กำลังรอข้อมูลหรือรอหน้าจอจึงช้าเกิน timeout เป็นครั้งคราว (จับได้จากบันทึกทุกรอบ:
  //   ข้อที่ตกมักอยู่ในช่วงเวลาเดียวกับที่ชุดนี้กำลังทำงาน)
  //
  // แยกเป็นคนละ project + ให้ขึ้นกับ project หลัก = Playwright รันชุดหลักให้จบก่อนแล้วค่อยรันชุดนี้
  //   ชุดโหลดหนักจึงได้เครื่องทั้งเครื่อง และชุดอื่นไม่ต้องแย่งทรัพยากรกับมัน
  //   (ไม่ได้ลดความเข้มของการทดสอบเลย — ยังรัน 10 ตัวแทนพร้อมกันเหมือนเดิมทุกประการ)
  // ── ทุกโปรเจกต์พึ่งแค่ "setup" (บอสสั่ง 14 ต.ค. 69 · ปิดด่าน 3) ─────────────────────────────────────────────
  //   เดิม safari/stress/price-switch พึ่งผลของ chromium → chromium ตกข้อเดียว 18 ข้อไม่ได้รันเลยโดยไม่มีใครเห็น
  //   ลำดับที่ต้องการ (price-switch เดี่ยวหลังสุด · stress ไม่แย่งเครื่อง) คุมที่ตัวรันเป็นช่วง scripts/test-prodbuild.mjs
  //   ⚠️ สั่ง `npx playwright test` ทุกโปรเจกต์พร้อมกันเอง = price-switch คาบเกี่ยวกับชุดอื่น → ใช้ตัวรันเป็นช่วงเสมอตอนปิดด่าน
  //   ตัวตรวจ scripts/check-e2e-ran.mjs ตกถ้ามีข้อที่ไม่ได้รัน/ถูกข้ามโดยไม่มีเหตุผลเขียนไว้ในโค้ด
  projects: [
    {
      name: "setup",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /setup-ready\.spec\.ts/,
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: /(multi-dealer-stress|catalog-price-switch|setup-ready|dealer-package-target|hq-recruit-settings|hq-prospects|franchise-recruit-flow)\.spec\.ts/,
      dependencies: ["setup"],
    },
    {
      // ── ไฟล์ที่แก้ค่าตั้งค่ากลางของ HQ ชุดเดียวกัน — รันทีละไฟล์ ─────────────────────────────────
      // dealer-package-target ตั้งเป้าของแพ็กเกจ standard ชั่วคราว (ค่ากลางทั้งระบบ · ตัวดัก 0178 เขียนทับเป้าสาขาในแพ็กเกจ)
      //   รันพร้อม hq-prospects ซึ่งสร้างสาขาแพ็กเกจ standard → เป้าสาขาได้ 3,000,000 แทน 12,000,000 ตามใบ (รอบปิดด่าน 3 จับได้)
      //   hq-recruit-settings ก็แก้ค่าตั้งต้นใบเสนอแพ็กเกจชุดเดียวกัน · แยกโปรเจกต์ workers: 1 = ไม่มีวันคาบเกี่ยวกัน
      name: "hq-settings",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /(dealer-package-target|hq-recruit-settings|hq-prospects|franchise-recruit-flow)\.spec\.ts/,
      workers: 1,
      dependencies: ["setup"],
    },
    {
      // ── Safari (WebKit) — สำหรับผู้ใช้ iPhone / iPad / Mac ──────────────────────
      // ไม่รันทั้งชุด (ช้าและซ้ำกับ Chrome) — เอาเฉพาะ "หน้าหลักเปิดได้ไหม" กับ "จอมือถือไม่ล้น"
      // ซึ่งเป็นจุดที่เอนจินต่างกันจริง (ฟอนต์ · flex/grid · position:sticky · วันที่)
      // สั่งเฉพาะชุดนี้: npx playwright test --project=safari
      name: "safari",
      use: { ...devices["Desktop Safari"] },
      // เอาเฉพาะชุดจอมือถือ — ชุด user/ui ล็อกอินถี่มาก พอรันต่อจาก chromium จะโดน Supabase
      // กันชั่วคราว ("Request rate limit reached") แล้วขึ้นแดงทั้งที่ระบบไม่ได้พัง (เจอจริง 25 ส.ค. 69)
      // อยากรันครบบน Safari ให้สั่งเองตอนต้องการ: npx playwright test --project=safari tests/scenario/ui.spec.ts
      testMatch: /mobile-viewport\.spec\.ts/,
      dependencies: ["setup"],
    },
    {
      // ── สวิตช์ซ่อนราคาแม่แบบ — ต้องรัน "เดี่ยว หลังทุกชุดจบ" ─────────────────────────────
      // ชุดนี้เปิดสวิตช์ hq_policy.hide_catalog_price ซึ่งเป็นค่ากลางทั้งระบบ
      // เปิดระหว่างที่ชุดอื่นรันอยู่ = ดีลเลอร์ในชุดนั้นอ่านราคาแม่แบบไม่ได้ ข้อทดสอบออกใบเสนอราคาตกหมด
      // จึงต้องรันเป็นช่วงสุดท้ายแบบเดี่ยว (ตัวรันเป็นช่วงคุมให้) และไฟล์เดียวรันทีละข้อ
      name: "price-switch",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /catalog-price-switch\.spec\.ts/,
      dependencies: ["setup"],
    },
    {
      name: "stress",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /multi-dealer-stress\.spec\.ts/,
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: "npm run dev",       // turbo dev — สตาร์ท dealer(:3001)+hq(:3002)
    url: "http://localhost:3002",  // รอ HQ app พร้อม
    // ⚠️ ห้ามเปิด reuseExistingServer — เคยทำให้ผลเทสต์หลอกมาแล้ว
    //
    // NEXT_PUBLIC_* ถูกฝังลงบันเดิลตอนสตาร์ตเซิร์ฟเวอร์ ไม่ได้อ่านใหม่ตอนรัน
    // ถ้าสลับ NEXT_PUBLIC_DATA_SOURCE ใน .env.local แล้วใช้เซิร์ฟเวอร์ตัวเดิมต่อ
    // เทสต์จะยิงใส่แอปที่ยังเป็นโหมดเก่า → "ผ่าน/ไม่ผ่าน" ไม่ตรงกับสิ่งที่ตั้งใจวัด
    // (เคยหลงสรุปว่าปฏิทินไม่แสดงนัด ทั้งที่กำลังวัดแอปโหมด local ซึ่งอ่านชุดตัวอย่าง)
    //
    // อีกกรณี: รันสองชุดพร้อมกัน ชุดที่จบก่อนจะปิดเซิร์ฟเวอร์ที่อีกชุดใช้อยู่
    // → ERR_CONNECTION_REFUSED กลางคัน
    reuseExistingServer: false,
    timeout: 180_000,            // คอมไพล์ครั้งแรกนานได้
    stdout: "ignore",
    stderr: "pipe",
  },
});
