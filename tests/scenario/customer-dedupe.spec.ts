import { test, expect } from "@playwright/test";
import { กดตกลงในกล่องยืนยัน, settle } from "./helpers";
import { open } from "./helpers";
import { EXISTING_CUSTOMER_NAME } from "./global-setup";
import { db, DEALER_ORIGIN } from "./funcHelpers";
import { ใบHQให้ลูกค้าเป้าหมายเดิม, ทำใบลูกค้าจากใบHQ, ล้างใบHQทดสอบ } from "./hqQuoteFixture";
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

  // ปิดการขายสำเร็จ (ทริกเกอร์การสร้าง/ผูกลูกค้า) — รอบ 4: ทางเดียว = "ลูกค้าตอบรับ" ที่ใบในแผงลีด (เมนู ▾ เปลี่ยนสถานะเอาออกแล้ว)
  //   เดินทางจริง: ขอราคา → HQ ส่งใบ HQ → ทำใบให้ลูกค้า (ส่งแล้ว) → กดลูกค้าตอบรับบนหน้าจอ
  await expect.poll(async () => (await sb.from("leads").select("num_id").eq("dealer_code", "RYG").eq("company", EXISTING)
    .eq("contact", "ผู้ติดต่อทดสอบ").order("num_id", { ascending: false }).limit(1)).data?.[0]?.num_id ?? 0,
    { timeout: 20_000, message: "ลีดใหม่ต้องลงฐาน" }).toBeGreaterThan(0);
  const เลขลีด = Number((await sb.from("leads").select("num_id").eq("dealer_code", "RYG").eq("company", EXISTING)
    .eq("contact", "ผู้ติดต่อทดสอบ").order("num_id", { ascending: false }).limit(1)).data![0].num_id);
  try {
    const ใบHQ = await ใบHQให้ลูกค้าเป้าหมายเดิม(RYG, "RYG", เลขลีด);
    const ใบ = await ทำใบลูกค้าจากใบHQ(RYG, ใบHQ, { customer: EXISTING, markupPercent: 10, status: "sent_to_client" });
    await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
    await settle(page);
    await page.getByRole("button", { name: "ตาราง" }).click().catch(() => {});
    await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(EXISTING);   // ตารางแบ่งหน้า — ค้นหาก่อนหาแถว
    // ตารางเรียงใหม่สุดก่อน — แถวแรกที่เป็นบริษัทนี้ + ผู้ติดต่อทดสอบ = ลีดที่เพิ่งเพิ่ม
    await page.locator("tbody tr").filter({ hasText: EXISTING }).filter({ hasText: "ผู้ติดต่อทดสอบ" }).first()
      .getByTitle("ดูรายละเอียด").click({ timeout: 20_000 });
    await page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click({ timeout: 20_000 });
    await page.locator(`[data-quote-item="${ใบ.id}"] [data-customer-result]`).getByRole("button", { name: /ลูกค้าตอบรับ/ }).click({ timeout: 20_000 });
    await กดตกลงในกล่องยืนยัน(page);
    await expect.poll(async () => (await sb.from("leads").select("status").eq("dealer_code", "RYG").eq("num_id", เลขลีด).single()).data?.status,
      { timeout: 30_000, message: "ลีดต้องปิดการขายสำเร็จจริง" }).toBe("PAID");

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
  } finally {
    ล้างใบHQทดสอบ("RYG", [เลขลีด]);
  }
});
