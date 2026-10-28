import { test, expect, type Page } from "@playwright/test";
import { RYG, ADMIN, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { DEALER_ORIGIN, HQ_ORIGIN, db, loginUI, watchErrors, assertNoErrors } from "./funcHelpers";
import { settle, กดตกลงในกล่องยืนยัน, เปิดใบHQในกล่องงาน } from "./helpers";
import { adminClient } from "./testDealers";
import { ใบHQให้ลูกค้าเป้าหมายเดิม, ทำใบลูกค้าจากใบHQ, ล้างใบHQทดสอบ, เลขลูกค้าเป้าหมายทดสอบ } from "./hqQuoteFixture";
import { ช่อง, กลุ่มช่อง } from "../../packages/shared/lib/fieldLabels";

// ── ชุดช่องมาตรฐาน: ข้อมูลลูกค้า + ข้อมูลงานกรอกครั้งเดียว แล้วไหลต่อทุกขั้นตาม FLOW (บอสสั่ง 26 ต.ค. 69) ─────────────────
//   ข้อที่ต้องตกบนโค้ดก่อนแก้: ฟอร์มลีดใช้ชื่อช่องชุดเดียว + ไม่มีอัปโหลดโลโก้ · งานใหม่ของลูกค้าเดิมแสดงข้อมูลลูกค้าจากระเบียน (ไม่ถามซ้ำ)
//   · หัวใบ HQ แสดงข้อมูลลูกค้าชุดเดียวกับลีด (ใบ 0242)
//   ข้อ D8 (ลูกค้าที่สร้างได้ข้อมูลจากลีดครบ) — โค้ดเดิมส่งต่อครบอยู่แล้ว ข้อนี้เป็นตัวกันไม่ให้หลุดภายหลัง
//   ฟอร์มขอราคากรอกจากลีด: quote-request-prefill.spec.ts · ตัวตรวจชื่อช่อง: scripts/check-field-labels.mjs
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.describe.configure({ mode: process.env.PMS_GATE_ALL === "1" ? "default" : "serial" });   // PMS_GATE_ALL=1 = รันทุกข้อแม้ข้อก่อนตก
test.setTimeout(180_000);

const admin = adminClient();
const แท็ก = Date.now() % 100_000;
const เลข = { ลีด: เลขลูกค้าเป้าหมายทดสอบ(), ตอบรับ: เลขลูกค้าเป้าหมายทดสอบ(), ซ้ำ: เลขลูกค้าเป้าหมายทดสอบ() };
const ชื่อ = (k: keyof typeof เลข) => `ZZTEST-ชุดช่อง-${k}-${แท็ก}`;
const ลูกค้าเดิม = `ZZTEST-ชุดช่อง-ลูกค้าเดิม-${แท็ก}`;
const ข้อมูลลูกค้า = { contact: "คุณทดสอบ ชุดช่อง", email: `zz-fs-${แท็ก}@example.test`, address: `${แท็ก} ถ.ทดสอบ อ.เมือง` };
const เบอร์ = (k: keyof typeof เลข) => `08${String(เลข[k]).slice(-8)}`;

async function สร้างลีด(k: keyof typeof เลข) {
  const r = await (await db(RYG)).from("leads").insert({ id: `#L-${เลข[k]}`, num_id: เลข[k], dealer_code: "RYG", company: ชื่อ(k), name: ชื่อ(k),
    ...ข้อมูลลูกค้า, phone: เบอร์(k), province: "ระยอง", status: "BULLET", project: "โกดังเก็บสินค้า 20x40 ม.", area: 800, note: "หลังคาเมทัลชีท" });
  expect(r.error, `สร้างลีด ${k}`).toBeNull();
}
async function เปิดลีด(page: Page, k: keyof typeof เลข) {
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: "ตาราง" }).click().catch(() => {});
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(ชื่อ(k));
  const row = page.locator("tbody tr").filter({ hasText: ชื่อ(k) }).first();
  await expect(row).toBeVisible({ timeout: 25_000 });
  await row.getByRole("button", { name: "ดูรายละเอียด" }).first().click();
}

test.beforeAll(async () => {
  const c = await (await db(RYG)).rpc("upsert_customer_for_company", { p_dealer: "RYG", p_payload: { company: ลูกค้าเดิม, name: "คุณลูกค้าเดิม",
    phone: "000-000-0077", email: `zz-fs-old-${แท็ก}@example.test`, address: "1 ถ.ลูกค้าเดิม", province: "ระยอง", status: "active" } });
  expect(c.error).toBeNull();
});
test.afterAll(async () => {
  ล้างใบHQทดสอบ("RYG", Object.values(เลข));
  await admin.from("leads").delete().eq("dealer_code", "RYG").eq("company", ลูกค้าเดิม);
  await admin.from("customers").delete().eq("dealer_code", "RYG").in("company", [ลูกค้าเดิม, ชื่อ("ตอบรับ")]);
});

test("[ui·dealer] ฟอร์มเพิ่มลีด: 3 กลุ่ม ชื่อช่องชุดเดียว · จังหวัดหน้างานอยู่ข้อมูลงาน · ไม่มีอัปโหลดโลโก้ · ชื่อ+เบอร์ซ้ำบอกก่อนบันทึก", async ({ page }) => {
  const errs = watchErrors(page);
  await สร้างลีด("ซ้ำ");
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: "เพิ่มลูกค้าเป้าหมาย" }).first().click();
  const ฟอร์ม = page.getByRole("dialog", { name: "เพิ่มลูกค้าเป้าหมาย" });
  await expect(ฟอร์ม).toBeVisible({ timeout: 15_000 });
  const กลุ่ม = await ฟอร์ม.locator(".form-section").allInnerTexts();
  expect(กลุ่ม.map(s => s.trim()), "3 กลุ่มตามลำดับ").toEqual([กลุ่มช่อง.ลูกค้า, กลุ่มช่อง.งาน, กลุ่มช่อง.การดูแล]);
  for (const ป้าย of [`${ช่อง.บริษัท} *`, `${ช่อง.ผู้ติดต่อ} *`, `${ช่อง.โทรศัพท์} *`, ช่อง.อีเมล, ช่อง.ที่อยู่, `${ช่อง.จังหวัด} *`, ช่อง.งาน, ช่อง.พื้นที่, ช่อง.สเปก, ช่อง.ผู้รับผิดชอบ, ช่อง.ช่องทาง])
    await expect(ฟอร์ม.locator("label").filter({ hasText: new RegExp(`^${ป้าย.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}$`) }), `ช่อง "${ป้าย}"`).toHaveCount(1);
  await expect(ฟอร์ม.getByRole("button", { name: /อัปโหลดรูป|เปลี่ยนรูป/ }), "ไม่มีอัปโหลดโลโก้").toHaveCount(0);
  // ไม่มีช่องขั้นตอนในฟอร์ม (บอสสั่ง 28 ต.ค. 69 · FLOW D2) — ลีดใหม่อยู่ขั้นข้อมูลลูกค้าเสมอ ฐานตั้งเอง (ใบ 0256)
  await expect(ฟอร์ม.locator("label").filter({ hasText: /^ขั้นตอน$/ }), "ไม่มีช่องขั้นตอน (D2)").toHaveCount(0);
  await expect(ฟอร์ม.getByRole("combobox", { name: "ขั้นตอน" }), "ไม่มีช่องเลือกขั้นตอน (D2)").toHaveCount(0);
  // จังหวัดหน้างานอยู่หลังหัวกลุ่มข้อมูลงาน (ไม่ใช่ในข้อมูลลูกค้า)
  const ลำดับ = await ฟอร์ม.locator(".form-section, label").allInnerTexts();
  expect(ลำดับ.indexOf(`${ช่อง.จังหวัด} *`), "จังหวัดหน้างานอยู่กลุ่มข้อมูลงาน").toBeGreaterThan(ลำดับ.indexOf(กลุ่มช่อง.งาน));

  // กันชื่อ+เบอร์ซ้ำ (FLOW ขั้น 2): หน้าเว็บบอกก่อนกด · ฐานปฏิเสธ
  await ฟอร์ม.getByPlaceholder("เช่น บริษัท ตัวอย่าง จำกัด").fill(ชื่อ("ซ้ำ"));
  await ฟอร์ม.getByPlaceholder("0XX-XXX-XXXX").fill(เบอร์("ซ้ำ"));
  await expect(ฟอร์ม.getByText(/ชื่อและเบอร์ซ้ำ บันทึกไม่ได้/), "ชื่อ+เบอร์ซ้ำ = บอกก่อนบันทึก").toBeVisible({ timeout: 10_000 });
  const ซ้ำ = await (await db(RYG)).from("leads").insert({ id: `#L-${เลข.ซ้ำ + 1}`, num_id: เลข.ซ้ำ + 1, dealer_code: "RYG", company: ชื่อ("ซ้ำ"), name: ชื่อ("ซ้ำ"),
    contact: "x", phone: เบอร์("ซ้ำ"), province: "ระยอง", status: "WAITING" });
  expect(ซ้ำ.error?.message ?? "", "ฐานปฏิเสธชื่อ+เบอร์ซ้ำ (0186)").toMatch(/lead_duplicate/);
  assertNoErrors(errs, "ฟอร์มเพิ่มลีด");
});

test("[ui·dealer] งานใหม่ของลูกค้าเดิม: ข้อมูลลูกค้าดึงจากระเบียน ไม่ถามซ้ำ · กรอกแค่ข้อมูลงาน · ลีดที่ได้มีข้อมูลลูกค้าครบ", async ({ page }) => {
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/customers`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByPlaceholder("ค้นหาลูกค้า, เบอร์โทร, อีเมล...").fill(ลูกค้าเดิม);
  await page.getByText(ลูกค้าเดิม).first().click({ timeout: 25_000 });
  await expect(page.getByRole("button", { name: /อัปโหลดรูป|เปลี่ยนรูป/ }), "ข้อมูลลูกค้าไม่มีอัปโหลดโลโก้").toHaveCount(0);
  await page.getByRole("button", { name: "เพิ่มงานขายใหม่" }).first().click();
  await page.getByRole("button", { name: "เพิ่มงานขายใหม่" }).last().click();
  const กล่อง = page.locator("[data-box='deal-customer']");
  await expect(กล่อง, "แสดงข้อมูลลูกค้าจากระเบียน").toBeVisible({ timeout: 15_000 });
  for (const [k, v] of [["contact", "คุณลูกค้าเดิม"], ["phone", "000-000-0077"], ["email", `zz-fs-old-${แท็ก}@example.test`], ["address", "1 ถ.ลูกค้าเดิม"]])
    await expect(กล่อง.locator(`[data-field='${k}']`)).toHaveText(v);
  await expect(page.getByPlaceholder("ชื่อผู้ติดต่อ"), "ไม่มีช่องให้กรอกผู้ติดต่อซ้ำ").toHaveCount(0);
  await expect(page.locator("#nd-province"), "จังหวัดหน้างานตั้งต้นจากระเบียนลูกค้า").toHaveValue("ระยอง");
  await page.locator("#nd-project").fill("โกดังเฟส 2");
  await page.locator("#nd-area").fill("600");
  await page.locator("#nd-spec").fill("สูง 10 ม.");
  await page.getByRole("button", { name: "เพิ่มงานขาย", exact: true }).click();
  await expect.poll(async () => (await admin.from("leads").select("contact, phone, email, address, province, project, area, note, customer_id")
    .eq("dealer_code", "RYG").eq("company", ลูกค้าเดิม).maybeSingle().then(r => r.data && { ...r.data, area: Number(r.data.area) })), { timeout: 25_000, message: "ลีดใหม่ได้ข้อมูลลูกค้าจากระเบียน + ข้อมูลงานที่กรอก" })
    .toMatchObject({ contact: "คุณลูกค้าเดิม", phone: "000-000-0077", email: `zz-fs-old-${แท็ก}@example.test`, address: "1 ถ.ลูกค้าเดิม",
      province: "ระยอง", project: "โกดังเฟส 2", area: 600, note: "สูง 10 ม." });
});

test("[flow·hq] หัวใบ HQ แสดงข้อมูลลูกค้า + ข้อมูลงานชุดเดียวกับลีด ในกล่องเดียว", async ({ page }) => {
  await สร้างลีด("ลีด");
  await (await db(RYG)).rpc("quote_request_submit", { p_lead_num_id: เลข.ลีด, p_product: "โกดังเก็บสินค้า 20x40 ม.", p_area: 800, p_spec: "หลังคาเมทัลชีท", p_province: "ระยอง" });
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await page.goto(`${HQ_ORIGIN}/hq/quote-requests`, { waitUntil: "domcontentloaded" });
  await settle(page);
  const { ใบ } = await เปิดใบHQในกล่องงาน(page, ชื่อ("ลีด"));
  const กล่อง = ใบ.locator("[data-box='request-info']");
  for (const [k, v] of [["company", ชื่อ("ลีด")], ["contact", ข้อมูลลูกค้า.contact], ["phone", เบอร์("ลีด")], ["email", ข้อมูลลูกค้า.email], ["address", ข้อมูลลูกค้า.address],
    ["province", "ระยอง"], ["job", "โกดังเก็บสินค้า 20x40 ม."], ["area", "800"]])
    await expect(กล่อง.locator(`[data-info='${k}']`), `หัวใบ: ${k}`).toContainText(v, { timeout: 15_000 });
  await expect(กล่อง.locator("[data-info='contact']")).toContainText(ช่อง.ผู้ติดต่อ);
  await expect(กล่อง.locator("[data-info='province']")).toContainText(ช่อง.จังหวัด);
});

test("[D8] [flow·dealer] D8 ลูกค้าตอบรับ: ลูกค้าที่สร้างได้ผู้ติดต่อ/โทร/อีเมล/ที่อยู่/จังหวัดตรงกับลีด", async ({ page }) => {
  await สร้างลีด("ตอบรับ");
  const ใบ = await ใบHQให้ลูกค้าเป้าหมายเดิม(RYG, "RYG", เลข.ตอบรับ);
  const q = await ทำใบลูกค้าจากใบHQ(RYG, ใบ, { customer: ชื่อ("ตอบรับ"), markupPercent: 10, status: "sent_to_client" });
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await เปิดลีด(page, "ตอบรับ");
  await page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click();
  await page.locator(`[data-quote-item="${q.id}"] [data-customer-result]`).getByRole("button", { name: /ลูกค้าตอบรับ/ }).click({ timeout: 25_000 });
  await กดตกลงในกล่องยืนยัน(page);
  await expect.poll(async () => (await admin.from("customers").select("name, phone, email, address, province")
    .eq("dealer_code", "RYG").eq("company", ชื่อ("ตอบรับ")).maybeSingle()).data, { timeout: 30_000, message: "ลูกค้าที่สร้างได้ข้อมูลจากลีดครบ" })
    .toEqual({ name: ข้อมูลลูกค้า.contact, phone: เบอร์("ตอบรับ"), email: ข้อมูลลูกค้า.email, address: ข้อมูลลูกค้า.address, province: "ระยอง" });
});
