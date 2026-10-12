import { test, expect } from "@playwright/test";
import { ถ้ามีกล่องยืนยันให้กดตกลง } from "./helpers";
import { open } from "./helpers";
import { EXISTING_CUSTOMER_NAME } from "./global-setup";
import { db } from "./funcHelpers";
import { RYG } from "./supabaseEnv";

// ลูกค้าซ้ำ (M3) — ลูกค้าเกิดได้ทางเดียวคือลูกค้าเป้าหมายที่ปิดการขายได้
// ถ้าดีลเลอร์เปิดลูกค้าเป้าหมายใหม่ให้บริษัทที่เป็นลูกค้าอยู่แล้ว พอปิดการขายต้องไม่แตกเป็นลูกค้าคนที่สอง
// ลูกค้าตั้งต้นมาจาก global-setup.ts (seed ผูก dealer RYG ไว้แล้ว — ดู EXISTING_CUSTOMER_NAME)

const EXISTING = EXISTING_CUSTOMER_NAME;

async function openAddLeadForm(page: import("@playwright/test").Page) {
  await open(page, "dealer", "/leads");
  await page.getByRole("button", { name: "เพิ่มลูกค้าเป้าหมาย" }).first().click();
  // บรรทัดคำอธิบายใต้หัวข้อถูกเอาออกแล้ว (28 ส.ค. 69) — ยึดกล่องแทน ชี้ชัดกว่าข้อความในกล่องอยู่แล้ว
  await expect(page.getByRole("dialog", { name: "เพิ่มลูกค้าเป้าหมาย" })).toBeVisible();
}

test("[dealer] ชื่อบริษัทตรงกับลูกค้าเดิม → ฟอร์มเตือนว่าจะผูกเข้ากับรายเดิม", async ({ page }) => {
  await openAddLeadForm(page);
  await page.getByPlaceholder("เช่น บริษัท ตัวอย่าง จำกัด").fill(EXISTING);
  await expect(page.getByText("เป็นลูกค้าอยู่แล้ว")).toBeVisible();
});

test("[dealer] ชื่อต่างแค่คำนำหน้านิติบุคคล → เตือนว่าใกล้เคียง ไม่ฟันธงแทนผู้ใช้", async ({ page }) => {
  await openAddLeadForm(page);
  await page.getByPlaceholder("เช่น บริษัท ตัวอย่าง จำกัด").fill("บริษัท ไทยสตีล จำกัด");
  await expect(page.getByText("ชื่อใกล้เคียงกับลูกค้าเดิม")).toBeVisible();
});

test("[dealer] ชื่อบริษัทใหม่จริง ๆ → ไม่มีคำเตือน", async ({ page }) => {
  await openAddLeadForm(page);
  await page.getByPlaceholder("เช่น บริษัท ตัวอย่าง จำกัด").fill("บจ. ยังไม่เคยมีในระบบ 9999");
  await expect(page.getByText("เป็นลูกค้าอยู่แล้ว")).toHaveCount(0);
  await expect(page.getByText("ชื่อใกล้เคียงกับลูกค้าเดิม")).toHaveCount(0);
});

test("[dealer] ปิดการขายลูกค้าเป้าหมายที่ชื่อตรงกับลูกค้าเดิม → ไม่เกิดลูกค้าซ้ำ", async ({ page }) => {
  // ⚙ นับจาก "ฐานข้อมูล" ไม่ใช่จากหน้าจอ (แก้ 2 ก.ย. 69)
  //    สิ่งที่เทสต์นี้วัดคือ "ปิดการขายแล้วต้องไม่เกิดลูกค้ารายที่สอง" ซึ่งเป็นเรื่องของข้อมูลล้วน ๆ
  //    การนับแถวบนจอขึ้นกับตัวกรองช่วงเวลา/การแบ่งหน้า และชุดอื่นที่รันขนานกันก็เพิ่ม/ลบลูกค้าคั่นกลางได้
  //    → เคยตกแบบ "คาด 2 ได้ 0" ทั้งที่ระบบทำถูก (เจอจริงตอนรันชุดเต็ม 2 ก.ย. 69)
  const sb = await db(RYG);
  const นับในฐาน = async () => (await sb.from("customers").select("id", { count: "exact", head: true })
    .eq("dealer_code", "RYG").eq("company", EXISTING)).count ?? 0;
  const before = await นับในฐาน();
  expect(before, "สมุดตั้งต้นต้องมีลูกค้ารายนี้อยู่แล้ว").toBeGreaterThan(0);

  // เปิดลูกค้าเป้าหมายใหม่ชื่อเดียวกัน
  await openAddLeadForm(page);
  await page.getByPlaceholder("เช่น บริษัท ตัวอย่าง จำกัด").fill(EXISTING);
  await page.getByPlaceholder("ชื่อผู้ติดต่อ").fill("ผู้ติดต่อทดสอบ");
  // โทรศัพท์/จังหวัด = ช่องบังคับ (บอสสั่ง 17 ส.ค. 69) — ไม่กรอกจะบันทึกไม่ผ่าน
  await page.getByPlaceholder("0XX-XXX-XXXX").fill("081-000-0000");
  await page.getByRole("dialog").getByLabel("จังหวัด").first().selectOption({ index: 1 });
  await page.getByRole("button", { name: "บันทึก" }).click();

  // เลื่อนสถานะลูกค้าเป้าหมายใหม่ → ปิดการขายสำเร็จ (ทริกเกอร์การสร้างลูกค้า)
  await page.getByRole("button", { name: "ตาราง" }).click();
  const row = page.locator("tbody tr").filter({ hasText: "ผู้ติดต่อทดสอบ" }).first();
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: /▾/ }).first().click();
  // ปิดการขาย = ย้อนกลับไม่ได้ → แอปขึ้น confirm() ก่อนเสมอ (เพิ่มหลังผลตรวจสอบ /scenario 31 ก.ค. 69)
  await page.getByRole("button", { name: "ปิดการขายสำเร็จ", exact: true }).first().click();
  // อาจไม่ถามก็ได้ — ถ้ายังไม่มีใบที่ส่งให้ลูกค้า ด่านจะกันไว้ตั้งแต่ก่อนถาม (เทียบเท่าตัวดักเดิม)
  await ถ้ามีกล่องยืนยันให้กดตกลง(page);

  // สมุดลูกค้าต้องยังมีรายนี้เท่าเดิม (ผูกเข้ากับรายเดิม ไม่สร้างใหม่)
  await expect.poll(นับในฐาน,
    { timeout: 30_000, message: "ปิดการขายแล้วต้องผูกเข้าลูกค้ารายเดิม ห้ามเกิดรายที่สอง" }).toBe(before);
  await open(page, "dealer", "/customers");
  // เช็คที่ตัวเก็บข้อมูลเป็นหลัก — จำนวนบนจอเชื่อทันทีไม่ได้ เฟรมแรกยังเป็นชุด seed ก่อนโหลดจาก store
  // (ยังไม่มีคีย์ = ไม่เคยมีการสร้างลูกค้าเลย = ผ่าน)
  const stored = await page.evaluate(() => {
    const raw = localStorage.getItem("sales_customers_v1");
    if (!raw) return 0;
    return (JSON.parse(raw) as { company: string }[]).filter(c => c.company === "บจ. ไทยสตีล").length;
  });
  expect(stored, "ต้องไม่มีลูกค้าชื่อซ้ำถูกบันทึกเพิ่ม").toBeLessThanOrEqual(1);
  // และบนหน้าจอต้องยังมองเห็นลูกค้ารายนี้อยู่ (ไม่นับจำนวนแถว — ตารางแบ่งหน้า/กรองช่วงเวลาได้)
  await page.getByPlaceholder("ค้นหาลูกค้า, เบอร์โทร, อีเมล...").fill(EXISTING);
  await expect(page.locator("tbody tr").filter({ hasText: EXISTING }).first(),
    "ลูกค้ารายเดิมต้องยังอยู่บนหน้าจอ").toBeVisible({ timeout: 20_000 });
});
