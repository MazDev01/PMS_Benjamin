import { test, expect, type Page, type Locator } from "@playwright/test";
import { ADMIN, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { db, HQ_ORIGIN, loginUI } from "./funcHelpers";
import { adminClient } from "./testDealers";
import { settle, กดตกลงในกล่องยืนยัน } from "./helpers";
import { สร้างดีลเลอร์รหัสยาว, ล้างดีลเลอร์รหัสยาว, รหัสยาว } from "./longCodeDealer";

// ── รอบ 2 ช่วง ข: หน้าดีลเลอร์ของ HQ (บอสตัดสิน 19 ต.ค. 69) ───────────────────────────────────────────────────────
//   1) แถว HQ ซ่อนจากรายชื่อดีลเลอร์ และไม่นับในตัวเลขดีลเลอร์ (ทะเบียน · แดชบอร์ด · ภาพรวมยอดขาย) · ฐานกันลบ/ปิด (ใบ 0222)
//   2) แถวทะเบียนเหลือ "เข้าระบบแทน" ปุ่มเดียว · กดแถว/การ์ด = หน้ารายละเอียด · แก้ไข/ปิดใช้งานอยู่หน้ารายละเอียด
//      ไม่มีลบดีลเลอร์ทั้งระบบ (เส้นทางลบ/ย้ายข้อมูลตอบ 410)
//   3) รหัสดีลเลอร์ไม่โดนตัด 4 หน้า: ทะเบียน · ลูกค้าทั้งเครือ · ภาพรวมยอดขาย · ใบเสนอราคาทั้งเครือ (รหัสยาว 5 ตัว ZZWWW)
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.describe.configure({ mode: process.env.PMS_GATE_ALL === "1" ? "default" : "serial" });   // PMS_GATE_ALL=1 = รันทุกข้อแม้ข้อก่อนตก
test.setTimeout(180_000);

const admin = adminClient();
test.beforeAll(async () => { await สร้างดีลเลอร์รหัสยาว(); });
test.afterAll(async () => { await ล้างดีลเลอร์รหัสยาว(); });

/** ตัวอักษรในช่องอยู่ในกรอบช่องครบ (ไม่ถูกตัด/ไม่ล้นทับช่องข้าง) */
async function อยู่ในช่องครบ(cell: Locator): Promise<boolean> {
  return cell.evaluate((el) => {
    const r = document.createRange(); r.selectNodeContents(el);
    const t = r.getBoundingClientRect(), c = el.getBoundingClientRect();
    return t.width > 0 && t.left >= c.left - 0.5 && t.right <= c.right + 0.5;
  });
}
async function ค้น(page: Page, path: string, คำ: string) {
  await page.goto(`${HQ_ORIGIN}${path}`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByPlaceholder(/ค้นหา/).first().fill(คำ);
}

test("[ข·1] แถว HQ ไม่อยู่ในรายชื่อและตัวเลขดีลเลอร์ (ทะเบียน · แดชบอร์ด · ภาพรวมยอดขาย)", async ({ page }) => {
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await page.goto(`${HQ_ORIGIN}/hq/dealers?view=table`, { waitUntil: "domcontentloaded" });
  await settle(page);
  const การ์ดทั้งหมด = page.locator(".kpi-card, [class*='kpi']").filter({ hasText: "ดีลเลอร์ทั้งหมด" }).first();
  // นับจากฐาน ณ จังหวะเดียวกับที่อ่านการ์ด (22 ต.ค. 69 · เดิมนับก่อนเปิดหน้า แล้วข้อทดสอบอื่นที่รันพร้อมกันสร้างสาขาทดสอบชั่วคราว
  //   ระหว่างนั้น → ฐาน 9 แต่หน้าเห็น 10) · ไม่ตรง = โหลดหน้าใหม่แล้วเทียบอีกรอบ · เทียบเลขตรงตัว ไม่ใช่แค่ "มีเลขนี้อยู่ในข้อความ"
  await expect.poll(async () => {
    const เลข = (await การ์ดทั้งหมด.innerText()).replace(/\s+/g, " ").match(/ดีลเลอร์ทั้งหมด\s*([\d,]+)/)?.[1]?.replace(/,/g, "");
    const { count } = await admin.from("dealers").select("code", { count: "exact", head: true }).neq("code", "HQ");
    if (เลข === String(count)) return "ตรง";
    await page.reload({ waitUntil: "domcontentloaded" });
    await settle(page);
    return `การ์ด ${เลข ?? "ไม่มีเลข"} · ฐาน ${count}`;
  }, { message: "การ์ดดีลเลอร์ทั้งหมด = นับจากฐานไม่รวม HQ", timeout: 20_000 }).toBe("ตรง");
  await page.getByPlaceholder(/ค้นหา/).first().fill("สำนักงานใหญ่");
  await expect(page.locator("td[data-col='code']").filter({ hasText: /^HQ$/ }), "ทะเบียนไม่มีแถว HQ").toHaveCount(0);
  await expect(page.getByText("ไม่พบข้อมูล")).toBeVisible({ timeout: 10_000 });

  await page.goto(`${HQ_ORIGIN}/hq/dashboard`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: /ทุกดีลเลอร์ \(ทั้งเครือ\)/ }).first().click({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: /^RYG – / }), "แดชบอร์ด: รายการดีลเลอร์โหลดแล้ว").toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: /^HQ – / }), "แดชบอร์ด: ตัวเลือกดีลเลอร์ไม่มี HQ").toHaveCount(0);
  await page.keyboard.press("Escape");

  await ค้น(page, "/hq/pipeline", "HQ");
  await expect(page.locator("td[data-col='code']").filter({ hasText: /^HQ$/ }), "ภาพรวมยอดขาย: ไม่มีแถว HQ").toHaveCount(0);

  // ฐานกันแถว HQ เอง (ใบ 0222) — HQ ยิงคำสั่งบันทึกดีลเลอร์ตรง ๆ ก็ปิดใช้งานแถว HQ ไม่ได้
  const hq = await db(ADMIN);
  const { data: แถวHQ } = await admin.from("dealers").select("code,name,province,region,revenue_target,package,target_manual").eq("code", "HQ").single();
  const r = await hq.rpc("save_dealers", { p_rows: [{ ...แถวHQ, status: "inactive" }] });
  await admin.from("dealers").update({ status: "active" }).eq("code", "HQ");   // ถ้าฐานไม่กัน (ทดสอบกลับด้าน) คืนค่าให้ข้ออื่น
  expect(r.error?.message ?? "", "ปิดใช้งานแถว HQ ต้องถูกปฏิเสธ").toContain("hq_row_protected");
});

test("[ข·2] แถวทะเบียนมีแค่ \"เข้าระบบ\" · กดแถวเปิดหน้ารายละเอียด · การ์ดก็เช่นกัน · ไม่มีปุ่มลบ", async ({ page }) => {
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await ค้น(page, "/hq/dealers?view=table", รหัสยาว);
  const แถว = page.locator("tbody tr").filter({ hasText: รหัสยาว }).first();
  await expect(แถว).toBeVisible({ timeout: 20_000 });
  await expect(แถว.getByRole("button"), "แถวมีปุ่มเดียว").toHaveCount(1);
  await expect(แถว.getByRole("button", { name: /เข้าระบบ/ })).toBeVisible();
  await expect(page.getByTitle("ลบ", { exact: true }), "ไม่มีปุ่มลบดีลเลอร์").toHaveCount(0);
  await แถว.locator("td").nth(2).click();
  await expect(page, "กดแถว = หน้ารายละเอียด").toHaveURL(new RegExp(`/hq/dealers/${รหัสยาว}$`), { timeout: 15_000 });

  await page.goto(`${HQ_ORIGIN}/hq/dealers`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: /แสดงแบบการ์ด/ }).click().catch(() => {});
  await page.getByPlaceholder(/ค้นหา/).first().fill(รหัสยาว);
  const การ์ด = page.locator(".dealer-card").filter({ hasText: รหัสยาว }).first();
  await expect(การ์ด).toBeVisible({ timeout: 15_000 });
  await expect(การ์ด.getByRole("button", { name: /เข้าระบบ/ }), "การ์ดมีปุ่มเข้าระบบ").toHaveCount(1);
  await expect(การ์ด.locator("button"), "การ์ดมีปุ่มเดียว").toHaveCount(1);
  await การ์ด.click({ position: { x: 20, y: 60 } });
  await expect(page).toHaveURL(new RegExp(`/hq/dealers/${รหัสยาว}$`), { timeout: 15_000 });
});

test("[ข·2] หน้ารายละเอียด: แก้ไขข้อมูล + ปิด/เปิดใช้งาน · /hq/dealers/HQ ไม่ใช่ดีลเลอร์", async ({ page }) => {
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await page.goto(`${HQ_ORIGIN}/hq/dealers/${รหัสยาว}`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: "แก้ไขข้อมูลดีลเลอร์" }).click();
  const ชื่อใหม่ = "ZZTEST สาขารหัสยาว แก้ชื่อแล้ว (ลบทิ้ง)";
  await page.getByLabel("ชื่อดีลเลอร์").fill(ชื่อใหม่);
  await page.getByRole("button", { name: "บันทึกการแก้ไข" }).click();
  await expect.poll(async () => (await admin.from("dealers").select("name").eq("code", รหัสยาว).single()).data?.name,
    { timeout: 15_000, message: "แก้ชื่อแล้วลงฐาน" }).toBe(ชื่อใหม่);
  await page.getByRole("button", { name: /ปิดใช้งาน/ }).click();
  await กดตกลงในกล่องยืนยัน(page);
  await expect.poll(async () => (await admin.from("dealers").select("status").eq("code", รหัสยาว).single()).data?.status,
    { timeout: 15_000, message: "ปิดใช้งานแล้วลงฐาน" }).toBe("inactive");
  await page.getByRole("button", { name: /เปิดใช้งาน/ }).click();
  await กดตกลงในกล่องยืนยัน(page);
  await expect.poll(async () => (await admin.from("dealers").select("status").eq("code", รหัสยาว).single()).data?.status,
    { timeout: 15_000 }).toBe("active");

  await page.goto(`${HQ_ORIGIN}/hq/dealers/HQ`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText(/ไม่พบดีลเลอร์รหัส/), "แถว HQ ไม่ใช่ดีลเลอร์").toBeVisible({ timeout: 15_000 });
});

test("[ข·2] เส้นทางลบดีลเลอร์ / ย้ายข้อมูล ปิดแล้ว (410) · ดีลเลอร์ยังอยู่", async ({ request }) => {
  const tok = (await (await db(ADMIN)).auth.getSession()).data.session?.access_token ?? "";
  const ลบ = await request.delete(`${HQ_ORIGIN}/api/admin/dealers?code=${รหัสยาว}`, { headers: { authorization: `Bearer ${tok}` } });
  expect(ลบ.status(), await ลบ.text()).toBe(410);
  const ย้าย = await request.post(`${HQ_ORIGIN}/api/admin/dealers/move`, { headers: { authorization: `Bearer ${tok}` }, data: { from: รหัสยาว, to: "RYG" } });
  expect(ย้าย.status(), await ย้าย.text()).toBe(410);
  expect((await admin.from("dealers").select("code").eq("code", รหัสยาว)).data?.length, "ดีลเลอร์ยังอยู่").toBe(1);
});

test("[ข·3] รหัสดีลเลอร์ 5 ตัวไม่โดนตัด: ทะเบียน · ลูกค้าทั้งเครือ · ภาพรวมยอดขาย · ใบเสนอราคาทั้งเครือ", async ({ page }) => {
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  for (const [หน้า, path, คำ] of [
    ["ทะเบียนดีลเลอร์", "/hq/dealers?view=table", รหัสยาว],
    ["ลูกค้าทั้งเครือ", "/hq/customers", "ZZTEST-ลูกค้ารหัสยาว"],
    ["ภาพรวมยอดขาย", "/hq/pipeline", รหัสยาว],
    ["ใบเสนอราคาทั้งเครือ", "/hq/quotations", "ZZTEST-ลูกค้ารหัสยาว"],
  ] as const) {
    await ค้น(page, path, คำ);
    const ช่อง = page.locator("td[data-col='code']").filter({ hasText: รหัสยาว }).first();
    await expect(ช่อง, `${หน้า}: มีช่องรหัส ${รหัสยาว}`).toBeVisible({ timeout: 20_000 });
    await expect(ช่อง, `${หน้า}: ข้อความรหัสครบ`).toHaveText(รหัสยาว);
    expect(await อยู่ในช่องครบ(ช่อง), `${หน้า}: รหัสต้องอยู่ในช่องครบ ไม่โดนตัด/ไม่ล้น`).toBe(true);
  }
});
