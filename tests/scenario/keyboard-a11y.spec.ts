import { test, expect, type Page } from "@playwright/test";
import { RYG, skipReason } from "./supabaseEnv";
import { DEALER_ORIGIN, loginUI } from "./funcHelpers";
import { open } from "./helpers";

// ── แถวตารางที่คลิกได้ ต้องใช้คีย์บอร์ดได้ด้วย (ตรวจสอบระบบ 5 ส.ค. 69) ──
//
// เดิมทุกหน้าลิสต์เขียน <tr onClick> ตรง ๆ — เมาส์ใช้ได้ แต่โฟกัสไม่เคยลงบนแถวเลย
// ผู้ใช้คีย์บอร์ด/โปรแกรมอ่านหน้าจอเปิดรายละเอียดจากตารางไม่ได้ทั้งระบบ (12 จุด)
// แก้ด้วยคอมโพเนนต์กลาง ClickableRow — เทสต์นี้กันไม่ให้หลุดกลับไปเป็นแบบเดิม
//
// วิธีตรวจ: หา "แถวที่ดูแล้วกดได้" จากหน้าจริง (มี cursor:pointer หรือคลาส clickable)
// แล้วบังคับว่าทุกแถวแบบนั้นต้องโฟกัสได้ + มีคำอธิบาย — แม่นกว่าเจาะจงตารางใดตารางหนึ่ง
// เพราะบางหน้ามีหลายตาราง และตารางที่ไม่ได้กดได้ก็ไม่ควรถูกบังคับ
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(150_000);

type RowInfo = { tabindex: string | null; label: string | null; text: string };

/** เก็บข้อมูลของทุกแถวที่ "หน้าตาเหมือนกดได้" ในหน้านั้น */
async function clickableRows(page: Page): Promise<RowInfo[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll("tbody tr")]
      .filter(tr => {
        const el = tr as HTMLElement;
        if (el.classList.contains("clickable")) return true;
        return getComputedStyle(el).cursor === "pointer";
      })
      .map(tr => ({
        tabindex: tr.getAttribute("tabindex"),
        label: tr.getAttribute("aria-label"),
        text: (tr as HTMLElement).innerText.slice(0, 40).replace(/\s+/g, " "),
      })),
  );
}

async function assertRowsAccessible(page: Page, where: string) {
  const rows = await clickableRows(page);
  test.skip(rows.length === 0, `${where}: ยังไม่มีแถวที่กดได้ในหน้านี้ (ไม่มีข้อมูล)`);

  const noFocus = rows.filter(r => r.tabindex !== "0");
  expect(noFocus.map(r => r.text),
    `${where}: มีแถวที่กดได้แต่โฟกัสด้วยคีย์บอร์ดไม่ได้ ${noFocus.length}/${rows.length} แถว`,
  ).toEqual([]);

  const noLabel = rows.filter(r => !r.label || !/เปิด/.test(r.label));
  expect(noLabel.map(r => r.text),
    `${where}: มีแถวที่กดได้แต่ไม่มีคำอธิบายให้โปรแกรมอ่านหน้าจอ ${noLabel.length}/${rows.length} แถว`,
  ).toEqual([]);
}

const HQ_PAGES = [
  { path: "/hq/customers", name: "ฐานข้อมูลลูกค้า" },
  { path: "/hq/quotations", name: "ใบเสนอราคาทั้งเครือ" },
  { path: "/hq/leads", name: "ลูกค้าเป้าหมายทั้งเครือ" },
  { path: "/hq/dealers?view=table", name: "ดีลเลอร์" },   // ตรวจแถวตาราง — หน้าเริ่มเป็นการ์ด
  { path: "/hq/pipeline", name: "ภาพรวมยอดขาย" },
];

for (const p of HQ_PAGES) {
  test(`[HQ] ${p.name}: ทุกแถวที่กดได้ ต้องโฟกัสด้วยคีย์บอร์ดได้ + มีคำอธิบาย`, async ({ page }) => {
    await open(page, "hq", p.path);
    await page.locator("tbody tr").first().waitFor({ state: "visible", timeout: 30_000 }).catch(() => {});
    await assertRowsAccessible(page, p.name);
  });
}

test("[ดีลเลอร์] ทุกแถวที่กดได้ ต้องโฟกัสด้วยคีย์บอร์ดได้ + มีคำอธิบาย", async ({ page }) => {
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  let checked = 0;
  for (const path of ["/leads", "/customers", "/quotations", "/files"]) {
    await page.goto(`${DEALER_ORIGIN}${path}`, { waitUntil: "domcontentloaded" });
    await page.locator("tbody tr").first().waitFor({ state: "visible", timeout: 20_000 }).catch(() => {});
    const rows = await clickableRows(page);
    if (!rows.length) continue; // หน้านั้นยังไม่มีข้อมูล
    checked++;
    expect(rows.filter(r => r.tabindex !== "0").map(r => r.text),
      `${path}: มีแถวที่กดได้แต่โฟกัสไม่ได้`).toEqual([]);
    expect(rows.filter(r => !r.label || !/เปิด/.test(r.label)).map(r => r.text),
      `${path}: มีแถวที่กดได้แต่ไม่มีคำอธิบาย`).toEqual([]);
  }
  expect(checked, "ต้องมีอย่างน้อย 1 หน้าที่มีข้อมูลให้ตรวจจริง").toBeGreaterThan(0);
});

/** แถวข้อมูลที่กดได้แถวแรก — ใช้กับเทสต์ที่ต้องกดจริง */
function firstClickableRow(page: Page) {
  return page.locator("tbody tr.clickable, tbody tr[tabindex='0']").first();
}

test("[HQ] กด Enter บนแถวที่โฟกัสอยู่ ต้องเปิดรายละเอียดได้เหมือนคลิก", async ({ page }) => {
  await open(page, "hq", "/hq/customers");
  const row = firstClickableRow(page);
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.focus();
  await page.keyboard.press("Enter");

  await expect(page.getByRole("button", { name: /ปิด/ }).first(),
    "กด Enter บนแถวต้องเปิดรายละเอียด — ไม่งั้นคีย์บอร์ดยังใช้ตารางไม่ได้จริง",
  ).toBeVisible({ timeout: 15_000 });
});

test("[HQ] กด Space บนแถว ต้องเปิดรายละเอียด และหน้าต้องไม่เลื่อนลง", async ({ page }) => {
  await open(page, "hq", "/hq/customers");
  const row = firstClickableRow(page);
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.focus();
  const beforeY = await page.evaluate(() => window.scrollY);
  await page.keyboard.press(" ");
  const afterY = await page.evaluate(() => window.scrollY);

  expect(afterY, "Space ต้องไม่ทำให้หน้าเลื่อน (ต้อง preventDefault)").toBe(beforeY);
  await expect(page.getByRole("button", { name: /ปิด/ }).first(),
    "กด Space บนแถวต้องเปิดรายละเอียด",
  ).toBeVisible({ timeout: 15_000 });
});

test("[HQ] กด Enter ตอนโฟกัสอยู่ที่ปุ่มในแถว ต้องไม่เปิดซ้อนสองชั้น", async ({ page }) => {
  await open(page, "hq", "/hq/customers");
  const row = firstClickableRow(page);
  await expect(row).toBeVisible({ timeout: 30_000 });

  // โฟกัสไปที่ปุ่มในแถว แล้วกด Enter — ปุ่มต้องทำงานของมัน แถวต้องไม่ยิงซ้ำ
  const btn = row.getByRole("button").first();
  await btn.focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1_500);

  // นับ "แผง" ตรง ๆ ไม่ใช่นับปุ่มที่ชื่อมีคำว่า "ปิด"
  //   SidePanel หนึ่งแผงมีปุ่มปิดสองปุ่มโดยตั้งใจอยู่แล้ว (กากบาทมุมบน + ปุ่ม "ปิด" แถบล่าง)
  //   ตัวนับเดิมจึงได้ 2 ทุกครั้งที่เปิดแผงตามปกติ = ล้มโดยที่ระบบไม่ได้ผิดอะไร (แก้ 7 ก.ย. 69)
  const dialogs = await page.getByRole("dialog").count();
  expect(dialogs, "ต้องเปิดรายละเอียดชั้นเดียว ไม่ซ้อนกัน").toBeLessThanOrEqual(1);
});
