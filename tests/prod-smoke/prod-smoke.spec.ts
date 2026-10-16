import { test, expect, type Page } from "@playwright/test";
import { HQ_URL, DEALER_URL, HQ_ACCOUNT, DEALER_ACCOUNT, skipReason } from "./prodEnv";

// ── ตรวจ "เว็บใช้งานจริง" ทันทีหลังอัปโค้ดขึ้น ─────────────────────────────────
//
// ทำไมต้องมี: จุดเช็กสุขภาพ (/api/health) ตอบ 200 ได้ทั้งที่หน้าจอขึ้นแดงทั้งหน้า
//   26 ส.ค. 69 แดชบอร์ด HQ พังเมื่อเลือกช่วง "วันนี้" — เว็บ "ไหว" ทุกตัวชี้วัด
//   แต่ผู้ใช้เปิดแล้วเห็น "เกิดข้อผิดพลาดในหน้านี้" · รู้เพราะผู้ใช้ทักมาเอง
//
// ชุดนี้จึงเปิดหน้าจริงด้วยเบราว์เซอร์จริงบนเว็บจริง แล้วดูสิ่งที่ผู้ใช้เห็น:
//   • ไม่มีจอ "เกิดข้อผิดพลาดในหน้านี้"
//   • ไม่ถูกเด้งกลับหน้าเข้าสู่ระบบ
//   • หน้ามีเนื้อหาจริง ไม่ใช่จอเปล่า
//   • ไม่มี error ที่คอนโซลเบราว์เซอร์
// และไล่ทุกช่วงเวลาบนหน้าที่มีตัวกรอง — เพราะบั๊กจริงซ่อนอยู่ในช่วงเวลาเดียว
//
// ⚠️ อ่านอย่างเดียว ห้ามสร้าง/แก้/ลบข้อมูลใด ๆ บนเว็บจริงเด็ดขาด
const ข้อความจอพัง = "เกิดข้อผิดพลาดในหน้านี้";
const ช่วงเวลา = ["today", "last7", "thisMonth", "thisYear"] as const;

test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

async function ล็อกอิน(page: Page, origin: string, who: { email: string; password: string }) {
  const r = await page.context().request.post(`${origin}/api/v1/auth?op=login`, { data: who });
  expect(r.ok(), `เข้าสู่ระบบเว็บจริงต้องผ่าน (ได้ ${r.status()} ${await r.text().catch(() => "")})`).toBe(true);
}

/** ตั้งช่วงเวลาให้หน้านั้นก่อนเปิด — ตัวกรองเก็บค่าไว้ที่ sessionStorage คีย์ bpms_filters:<path> */
async function ตั้งช่วงเวลา(page: Page, pathname: string, preset: string) {
  await page.addInitScript(({ k, p }) => {
    try { sessionStorage.setItem(k, JSON.stringify({ preset: p })); } catch { /* ignore */ }
  }, { k: `bpms_filters:${pathname}`, p: preset });
}

async function ตรวจหน้า(page: Page, url: string, ชื่อ: string) {
  const errors: string[] = [];
  const onConsole = (m: { type(): string; text(): string }) => { if (m.type() === "error") errors.push(m.text()); };
  const onPageError = (e: Error) => errors.push(`uncaught: ${e.message}`);
  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  try {
    const res = await page.goto(url, { waitUntil: "domcontentloaded" });
    expect(res?.status() ?? 0, `${ชื่อ} ต้องตอบ 200`).toBeLessThan(400);
    await page.waitForTimeout(4000);   // ให้หน้าโหลดข้อมูลและวาดกราฟจนเสร็จ

    const body = await page.evaluate(() => document.body.innerText);
    expect(body, `${ชื่อ} ขึ้นจอผิดพลาดให้ผู้ใช้เห็น`).not.toContain(ข้อความจอพัง);
    expect(new URL(page.url()).pathname, `${ชื่อ} ถูกเด้งกลับหน้าเข้าสู่ระบบ`).not.toContain("login");
    expect(body.trim().length, `${ชื่อ} เป็นจอเปล่า`).toBeGreaterThan(120);

    // error ที่มาจากส่วนเสริมภายนอก (Sentry/analytics) ไม่ใช่ความผิดของระบบเรา
    const ของเรา = errors.filter(e => !/sentry|analytics|favicon|Failed to load resource: the server responded with a status of 40[34]/i.test(e));
    expect(ของเรา, `${ชื่อ} มี error ที่คอนโซล`).toEqual([]);
  } finally {
    page.off("console", onConsole);
    page.off("pageerror", onPageError);
  }
}

test.describe("เว็บใช้งานจริง — สำนักงานใหญ่", () => {
  test.skip(() => skipReason("hq") !== "", skipReason("hq") || "พร้อมรัน");

  const หน้า = ["/hq/dashboard", "/hq/pipeline", "/hq/dealers", "/hq/leads",
                "/hq/quotations", "/hq/customers", "/hq/audit", "/hq/settings"];

  for (const p of หน้า) {
    test(`[prod-hq] ${p} เปิดได้ทุกช่วงเวลา`, async ({ page }) => {
      await ล็อกอิน(page, HQ_URL, HQ_ACCOUNT);
      for (const preset of ช่วงเวลา) {
        await ตั้งช่วงเวลา(page, p, preset);
        await ตรวจหน้า(page, HQ_URL + p, `${p} (ช่วง ${preset})`);
      }
    });
  }
});

test.describe("เว็บใช้งานจริง — ดีลเลอร์", () => {
  test.skip(() => skipReason("dealer") !== "", skipReason("dealer") || "พร้อมรัน");

  const หน้า = ["/dashboard", "/leads", "/quotations", "/customers",
                "/calendar", "/files", "/settings"];

  for (const p of หน้า) {
    test(`[prod-dealer] ${p} เปิดได้ทุกช่วงเวลา`, async ({ page }) => {
      await ล็อกอิน(page, DEALER_URL, DEALER_ACCOUNT);
      for (const preset of ช่วงเวลา) {
        await ตั้งช่วงเวลา(page, p, preset);
        await ตรวจหน้า(page, DEALER_URL + p, `${p} (ช่วง ${preset})`);
      }
    });
  }
});

test("[prod] จุดเช็กสุขภาพของทั้งสองเว็บต้องปกติ", async ({ request }) => {
  for (const [ชื่อ, origin] of [["สำนักงานใหญ่", HQ_URL], ["ดีลเลอร์", DEALER_URL]] as const) {
    const r = await request.get(`${origin}/api/health`);
    expect(r.status(), `${ชื่อ} จุดเช็กสุขภาพต้องตอบ 200`).toBe(200);
  }
});
