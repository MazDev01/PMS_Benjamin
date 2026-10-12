import { test, expect, type Page } from "@playwright/test";
import { RYG, skipReason } from "./supabaseEnv";
import { DEALER_ORIGIN, loginUI } from "./funcHelpers";
import { open } from "./helpers";

// ── การอ่านข้อมูลที่ล้มเหลว ต้องไม่เงียบ (regression จากผลตรวจสอบระบบ 5 ส.ค. 69) ──
//
// บั๊กคลาสนี้เคยแก้ไปรอบหนึ่งแล้ว (30 ก.ค. 69 · severity Critical) แต่ตกหล่นอีกหลายจุด:
// hook ที่ .catch(() => {}) จะกลืน error ทิ้ง แล้วหน้าจอโชว์ค่าตั้งต้น/รายการว่าง เหมือนข้อมูลว่างจริง
// ผู้ใช้แยกไม่ออกว่า "ยังไม่มีข้อมูล" กับ "โหลดไม่สำเร็จ" — อันตรายที่สุดคือนโยบาย VAT ที่ใช้คิดเงิน
//
// ⚠️ ทำไมต้องเช็ค "ป้ายชื่อจุดที่พลาด" ไม่ใช่แค่ "มีแถบเตือนโผล่":
//    หน้าหนึ่งมี hook หลายตัวอ่านตารางเดียวกัน — พอบล็อกตารางนั้น hook ตัวอื่นที่รายงานถูกอยู่แล้ว
//    ก็ทำให้แถบเตือนขึ้นได้ เทสต์จะ "ผ่าน" ทั้งที่จุดที่ตั้งใจวัดยังกลืน error เงียบอยู่
//    (เจอจริงตอนเขียนเทสต์นี้: เช็คแค่แถบเตือน → ผ่านทั้งที่ย้อนโค้ดกลับเป็นเวอร์ชันมีบั๊กแล้ว)
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(120_000);

const BANNER = /โหลดข้อมูลบางส่วนไม่สำเร็จ/;

/** ดักป้ายชื่อ (tag) ของทุกจุดที่รายงานว่าอ่านข้อมูลไม่สำเร็จ — ต้องติดตั้งก่อนเปิดหน้า */
async function collectReadErrorTags(page: Page): Promise<() => Promise<string[]>> {
  await page.addInitScript(() => {
    (window as unknown as { __readErrTags: string[] }).__readErrTags = [];
    window.addEventListener("pms:repo-read-error", e => {
      (window as unknown as { __readErrTags: string[] }).__readErrTags.push(String((e as CustomEvent).detail));
    });
  });
  return async () => page.evaluate(() => (window as unknown as { __readErrTags: string[] }).__readErrTags ?? []);
}

/** ที่มาของข้อมูลชุดหนึ่ง — โหมด supabase ยิงเข้า /rest/v1/<ตาราง> ตรง ๆ
 *  โหมด api ยิงเข้า /api/v1/<เส้นทาง> ของ backend เราเอง (ระยะ 1 ของแผนแยก backend)
 *  ต้องดักทั้งสองแบบ ไม่งั้นพอสลับโหมดแล้วความล้มเหลวที่จำลองไว้ไม่เกิดขึ้นเลย
 *  → เทสต์ล้มแบบดูเหมือนบั๊กของระบบ ทั้งที่เป็นเพราะเทสต์ดักผิดที่ */
const source = (table: string, apiPath: string) =>
  new RegExp(`/rest/v1/${table}|/api/v1/${apiPath}`, "i");

/** ทำให้คำขอที่ URL ตรงกับ pattern ล้มเหลวแบบ "เซิร์ฟเวอร์ตอบ error" (ไม่ใช่ถูกยกเลิก)
 *  ต้องเป็น error จริง — repoLog ตั้งใจข้ามกรณีคำขอถูกยกเลิกตอนเปลี่ยนหน้า (ไม่ใช่ความผิดพลาด) */
async function breakRequests(page: Page, pattern: RegExp) {
  await page.route(url => pattern.test(url.toString()), route =>
    route.fulfill({ status: 500, contentType: "application/json", body: '{"message":"จำลองความล้มเหลวเพื่อทดสอบ"}' }),
  );
}

test("นโยบาย HQ (VAT/อายุใบเสนอราคา) โหลดไม่สำเร็จ → ต้องรายงาน ไม่ใช่เงียบแล้วใช้ค่าตั้งต้น", async ({ page }) => {
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  const tags = await collectReadErrorTags(page);
  await breakRequests(page, source("hq_policy", "settings"));   // แหล่งของ VAT + อายุใบเสนอราคา
  await page.goto(`${DEALER_ORIGIN}/quotations`, { waitUntil: "domcontentloaded" });

  await expect(page.getByText(BANNER).first(), "ต้องมีแถบเตือนให้ผู้ใช้เห็น").toBeVisible({ timeout: 20_000 });
  // ต้องมาจาก useHQValue (settings.getPolicy / getQuoteValidityDays) จริง ๆ ไม่ใช่ hook อื่นที่บังเอิญพังด้วย
  const seen = await tags();
  expect(seen.join(" | "), `จุดที่รายงาน: ${seen.join(", ") || "(ไม่มี)"}`).toMatch(/settings\.(getPolicy|getQuoteValidityDays)/);
});

test("ทะเบียนผู้รับผิดชอบโหลดไม่สำเร็จ → ต้องรายงาน ไม่ใช่ดูเหมือนทะเบียนว่าง", async ({ page }) => {
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  const tags = await collectReadErrorTags(page);
  await breakRequests(page, source("responsible_persons", "persons"));
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });

  await expect(page.getByText(BANNER).first(), "ต้องมีแถบเตือนให้ผู้ใช้เห็น").toBeVisible({ timeout: 20_000 });
  const seen = await tags();
  expect(seen.join(" | "), `จุดที่รายงาน: ${seen.join(", ") || "(ไม่มี)"}`).toMatch(/persons\.list/);
});

test("รายการไฟล์ของ HQ โหลดไม่สำเร็จ → ต้องรายงาน", async ({ page }) => {
  const tags = await collectReadErrorTags(page);
  await breakRequests(page, source("files", "files"));
  await open(page, "hq", "/hq/leads");

  await expect(page.getByText(BANNER).first(), "ต้องมีแถบเตือนให้ผู้ใช้เห็น").toBeVisible({ timeout: 20_000 });
  const seen = await tags();
  expect(seen.join(" | "), `จุดที่รายงาน: ${seen.join(", ") || "(ไม่มี)"}`).toMatch(/files\.list/);
});

test("รายการไฟล์ฝั่งดีลเลอร์โหลดไม่สำเร็จ → ต้องรายงาน", async ({ page }) => {
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  const tags = await collectReadErrorTags(page);
  await breakRequests(page, source("files", "files"));
  await page.goto(`${DEALER_ORIGIN}/files`, { waitUntil: "domcontentloaded" });

  await expect(page.getByText(BANNER).first(), "ต้องมีแถบเตือนให้ผู้ใช้เห็น").toBeVisible({ timeout: 20_000 });
  const seen = await tags();
  expect(seen.join(" | "), `จุดที่รายงาน: ${seen.join(", ") || "(ไม่มี)"}`).toMatch(/files\.list/);
});

test("โหลดสำเร็จตามปกติ ต้องไม่มีแถบเตือน (กันเตือนพร่ำเพรื่อ)", async ({ page }) => {
  const tags = await collectReadErrorTags(page);
  await open(page, "hq", "/hq/settings");
  await page.waitForTimeout(4_000);
  const seen = await tags();
  expect(seen, `ใช้งานปกติต้องไม่มีจุดไหนรายงานความล้มเหลว (ได้: ${seen.join(", ")})`).toEqual([]);
  await expect(page.getByText(BANNER),
    "ใช้งานปกติต้องไม่มีแถบเตือน ไม่งั้นผู้ใช้จะชินแล้วเลิกสนใจตอนมีปัญหาจริง",
  ).toHaveCount(0);
});
