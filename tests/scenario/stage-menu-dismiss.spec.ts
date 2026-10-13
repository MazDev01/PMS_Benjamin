import { test, expect } from "@playwright/test";
import { RYG, skipReason } from "./supabaseEnv";
import { settle } from "./helpers";
import { DEALER_ORIGIN, loginUI, db, cleanup, specNS, nsTag, งานตามเส้นทาง } from "./funcHelpers";

// ── เมนูเลือกขั้นในตารางลูกค้าเป้าหมาย: คลิกที่ว่างนอกตารางแล้วต้องปิด ──────────────
// ผู้ใช้แจ้ง (19 ส.ค. 69): "กดนอกตารางช้อยไม่หาย ต้องไปกดในตาราง"
// ต้นเหตุ: ฉากคลิกปิด (fixed inset:0) ถูกวางไว้ในเซลล์ตาราง → .table-wrap (overflow) ตัดจนเหลือ
//   แค่พื้นที่ตาราง คลิกนอกตารางจึงไม่โดนอะไร · แก้โดยย้ายฉากไปอยู่ใน portal เดียวกับตัวเมนู
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(180_000);

const NS = specNS("MENUDIS");
const tg = nsTag(NS);
const COMPANY = tg("เมนูขั้น");

test.beforeAll(async () => {
  const sb = await db(RYG);
  await cleanup(sb, "RYG", NS);
  const numId = 920000 + (Date.now() % 9000);
  await sb.from("leads").insert({ phone: "081-999-0101",
    id: `#L-${numId}`, num_id: numId, dealer_code: "RYG", company: COMPANY, name: COMPANY,
    contact: "ผู้ทดสอบ", province: "เชียงใหม่", product: "โกดังสำเร็จรูป", status: "WAITING",
    value: "฿600,000", assigned: "ผู้ทดสอบ",
    // ติ๊กงานของขั้นแรกไว้ ไม่งั้นกระดานจะกันการย้ายขั้น (ด่านใหม่ 21 ส.ค. 69) — คนละเรื่องกับที่เทสต์นี้ตรวจ
    tasks: await งานตามเส้นทาง(sb, "WAITING"),
  });
});
test.afterAll(async () => { await cleanup(await db(RYG), "RYG", NS); });

test("[ui·dealer] เปิดเมนูเลือกขั้นแล้วคลิกที่ว่างนอกตาราง → เมนูต้องปิด", async ({ page }) => {
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(COMPANY);
  const row = page.locator("tbody tr").filter({ hasText: COMPANY }).first();
  await expect(row).toBeVisible({ timeout: 20_000 });

  await row.getByRole("button", { name: /ติดต่อแล้ว/ }).first().click();
  const menu = page.locator('[data-menu="stage"]');
  await expect(menu, "กดป้ายขั้นแล้วเมนูต้องเปิด").toBeVisible({ timeout: 10_000 });

  // คลิกพื้นที่ว่างใต้ตาราง (นอกกล่องตาราง) — จุดที่ผู้ใช้กดแล้วเมนูเคยค้าง
  //   ⚠️ ต้องอยู่ในจอเสมอ — หน้าลูกค้าเป้าหมายมีของเหนือตารางเพิ่มขึ้นจนตารางลงมาต่ำ (บนสุดที่ ~472px)
  //   จุด "ใต้ตาราง 160px" เลยหลุดขอบล่างของจอ 720px → คลิกไม่โดนอะไรเลย เทสต์ตกทั้งที่เมนูทำงานถูก (ตรวจ 15 ก.ย. 69)
  const box = await page.locator("table").first().boundingBox();
  const จอสูง = page.viewportSize()?.height ?? 720;
  const ใต้ตาราง = (box?.y ?? 200) + (box?.height ?? 100) + 160;
  await page.mouse.click((box?.x ?? 200) + 40, Math.min(ใต้ตาราง, จอสูง - 12));
  await expect(menu, "คลิกที่ว่างนอกตารางแล้วเมนูต้องปิดเอง").toBeHidden({ timeout: 5_000 });
});

test("[ui·dealer] เลือกขั้นจากเมนูแล้วสถานะต้องเปลี่ยนจริงในฐานข้อมูล", async ({ page }) => {
  const sb = await db(RYG);
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(COMPANY);
  const row = page.locator("tbody tr").filter({ hasText: COMPANY }).first();
  await expect(row).toBeVisible({ timeout: 20_000 });

  await row.getByRole("button", { name: /ติดต่อแล้ว|รวบรวม/ }).first().click();
  await page.locator('[data-menu="stage"]').getByText("รวบรวมความต้องการ", { exact: true }).click();

  await expect.poll(async () => {
    const { data } = await sb.from("leads").select("status").eq("company", COMPANY).limit(1);
    return data?.[0]?.status;
  }, { timeout: 20_000, message: "เลือกขั้นจากเมนูแล้วต้องบันทึกลงฐานข้อมูลจริง" }).toBe("BULLET");
});
