// ── "อื่นๆ (ระบุเอง)" ต้องเห็นตรงกันทั้งสองฝั่ง (บอสสั่ง 21 ส.ค. 69) ─────────────────
//
// ฝั่งดีลเลอร์มีปุ่ม "อื่นๆ" ให้พิมพ์เหตุผลเองอยู่แล้ว แต่หน้าตั้งค่าของสำนักงานใหญ่ไม่โชว์
// ผู้ดูแลจึงนึกว่าดีลเลอร์เลือกได้แค่รายการที่ตั้งไว้ — สองฝั่งเข้าใจไม่ตรงกัน
//
// ⚠️ "อื่นๆ" ต้องลบไม่ได้ และต้องไม่ถูกเก็บเป็นตัวเลือกจริงในรายการ
//    ไม่งั้นเหตุผลที่บันทึกจะกลายเป็นคำว่า "อื่นๆ" ลอย ๆ ทุกใบ รายงานจะวิเคราะห์ไม่ได้
import { test, expect } from "@playwright/test";
import { ADMIN, skipReason } from "./supabaseEnv";
import { openAs, settle } from "./helpers";
import { db, loginUI, DEALER_ORIGIN } from "./funcHelpers";
import { สร้างสาขาของข้อ } from "./ownDealer";

test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(180_000);

test("[ui·hq] หน้าตั้งค่ามี 'อื่นๆ (ระบุเอง)' อยู่ในรายการเหตุผลจริง", async ({ page }) => {
  await openAs(page, ADMIN, "hq", "/hq/settings");
  await settle(page);
  await page.getByRole("button", { name: "ขั้นการขายมาตรฐาน" }).first().click();
  await page.waitForTimeout(800);

  const การ์ด = page.locator(".card", { hasText: "เหตุผลปิดการขายไม่สำเร็จ" }).first();
  await expect(การ์ด).toBeVisible({ timeout: 30_000 });
  await expect(การ์ด.getByText("อื่นๆ (ระบุเอง)").first(),
    "ต้องมีตัวเลือกนี้ในรายการเหมือนเหตุผลอื่น").toBeVisible();
});

test("[func] ตัวเลือก 'อื่นๆ (ระบุเอง)' = กดแล้วพิมพ์เอง · ไม่เก็บคำว่าอื่นๆ ลงฐานข้อมูล", async ({ page }) => {
  const sb = await db(ADMIN);
  const { data } = await sb.from("hq_sales_journey").select("lost").eq("id", 1).maybeSingle();
  const รายการ = (data?.lost as string[] | null) ?? [];
  expect(รายการ, "รายการในฐานข้อมูลต้องมีตัวเลือกนี้").toContain("อื่นๆ (ระบุเอง)");

  // ลูกค้าเป้าหมายที่ยังเปิดอยู่ของสาขาของข้อ (บอสสั่ง 12 พ.ย. 69) — เดิมไล่ 5 แถวแรกของ RYG หาแถวที่กดปิดไม่สำเร็จได้
  //   แถวแรกของ RYG เป็นของข้ออื่นที่รันพร้อมกันได้ (ขั้นอื่น/ถูกลบระหว่างเปิด) → ตก "ขาดข้อมูล"
  const ส = await สร้างสาขาของข้อ();
  try {
    const เลข = 1_970_000_000 + Math.floor(Math.random() * 400_000) * 10, ชื่อ = `ZZTEST เหตุผลอื่นๆ ${ส.รหัส}`;
    expect((await (await db(ส.บัญชี)).from("leads").insert({ id: `#L-${เลข}`, num_id: เลข, dealer_code: ส.รหัส, company: ชื่อ, name: ชื่อ,
      contact: "ผู้ทดสอบ", phone: "000-000-0310", province: "ตราด", status: "BULLET" })).error, "ลูกค้าเป้าหมายของข้อ").toBeNull();
    await loginUI(page, DEALER_ORIGIN, "/login", ส.บัญชี);
    await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" }); await settle(page);
    await page.getByRole("row", { name: `เปิดรายละเอียดลูกค้าเป้าหมาย ${ชื่อ}`, exact: true }).locator("td").first().click();
    // รอบ 4: ปิดไม่สำเร็จอยู่ที่กล่อง "ขั้นต่อไป" ที่เดียว (แท็บงาน/ปุ่มไม่ได้งานเอาออก)
    const ปุ่ม = page.getByRole("status", { name: "ขั้นต่อไป" }).getByRole("button", { name: /ปิดไม่สำเร็จ/ }).first();
    await expect(ปุ่ม, "ลูกค้าเป้าหมายที่ยังเปิดอยู่กดปิดไม่สำเร็จได้").toBeEnabled({ timeout: 20_000 });
    await ปุ่ม.click();

  // ต้องมีปุ่มเดียว ไม่ใช่สองปุ่มซ้ำกัน (ตัวในรายการ + ตัวที่ระบบเติมให้)
  const ปุ่มอื่นๆ = page.getByRole("button", { name: "อื่นๆ (ระบุเอง)" });
  await expect(ปุ่มอื่นๆ, "ต้องมีปุ่มเดียว ไม่ซ้ำ").toHaveCount(1);

  // กดแล้วต้องเปิดช่องพิมพ์ ไม่ใช่เลือกคำว่า "อื่นๆ" ไปบันทึกตรง ๆ
  await ปุ่มอื่นๆ.click();
  await expect(page.getByPlaceholder("พิมพ์เหตุผล…"), "กดแล้วต้องให้พิมพ์เหตุผลเอง").toBeVisible({ timeout: 10_000 });

  // ยังไม่พิมพ์ = ปุ่มยืนยันต้องกดไม่ได้ (กัน "อื่นๆ" ลอย ๆ หลุดลงฐานข้อมูล)
  await expect(page.getByRole("button", { name: "ยืนยันปิดการขาย" }),
    "ยังไม่พิมพ์เหตุผล ต้องกดยืนยันไม่ได้").toBeDisabled();
  } finally { await ส.ลบ(); }
});
