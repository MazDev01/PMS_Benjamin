import { test, expect } from "@playwright/test";
import { ADMIN, skipReason } from "./supabaseEnv";
import { HQ_ORIGIN, loginUI, watchErrors, assertNoErrors, db, waitRow, specNS } from "./funcHelpers";
import { กดตกลงในกล่องยืนยัน } from "./helpers";

// ── หน้ารวม "ใบค่าแฟรนไชส์" ของสำนักงานใหญ่ ──
//   บอสสั่ง 14 ก.ย. 69: "ทำหน้า ใบค่าแฟรนไชส์ ด้วย" · "ให้มีการแสดงในหน้าเดียวแบบดีลเลอร์"
//                      "ใบค่าแฟรนไชส์มันไม่จบแบบหน้าเดียว ให้แบบใช้งานง่าย"
//
// สิ่งที่ต้องพิสูจน์ (ทุกอย่างจบในหน้าเดียว แบบหน้าใบเสนอราคาของดีลเลอร์):
//   1) เห็นใบในตาราง · ค้นหา/กรอง · ปุ่มดูเปิดแผงรายละเอียด · เปลี่ยนสถานะในแผงได้ · ลิงก์ไปลูกค้าเป้าหมาย
//   2) ออกใบใหม่: เลือกลูกค้าเป้าหมายในฟอร์มเดียว → ได้ใบร่าง → แผงเปิดให้ → กดส่งแล้ว (ขั้นลูกค้าเป้าหมายเลื่อนเอง)
//   3) ปุ่มในแถว: แก้ไข/ลบใบร่างได้ · ใบที่ส่งแล้วปุ่มแก้/ลบกดไม่ได้
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(180_000);
test.describe.configure({ mode: "serial" });

const NS = specNS("PROPOSALPAGE");

async function cleanup() {
  // ลบลูกค้าเป้าหมาย → ใบและประวัติของรายนั้นลบตามให้เอง (on delete cascade)
  const { error } = await (await db(ADMIN)).from("dealer_prospects").delete().like("name", `${NS}%`);
  if (error) console.warn("[hq-proposals] ล้างข้อมูลทดสอบไม่สำเร็จ", error.message);
}
test.beforeAll(cleanup);
test.afterAll(cleanup);

test("[func·hq] หน้าใบค่าแฟรนไชส์: ตาราง · ค้นหา/กรอง · แผงรายละเอียด · ตอบรับในแผง · ลิงก์ไปลูกค้าเป้าหมาย", async ({ page }) => {
  const errs = watchErrors(page);
  const sb = await db(ADMIN);
  const name = `${NS}-มีใบส่งแล้ว`;
  const { data: pr, error } = await sb.from("dealer_prospects").insert({ name, province: "ขอนแก่น", status: "considering" }).select("id").single();
  expect(error).toBeNull();
  const prospectId = (pr as { id: number }).id;
  const { data: ใบ, error: ใบErr } = await sb.from("dealer_package_proposals")
    .insert({ prospect_id: prospectId, package: "exclusive", status: "draft", proposed_date: "2026-09-14", amount: 250_000, contract_months: 24, annual_target: 3_000_000 })
    .select("id, proposal_no").single();
  expect(ใบErr).toBeNull();
  const { id: ใบId, proposal_no: เลขที่ } = ใบ as { id: number; proposal_no: string };
  expect((await sb.from("dealer_package_proposals").update({ status: "sent" }).eq("id", ใบId)).error).toBeNull();

  await loginUI(page, HQ_ORIGIN, "/hq/proposals", ADMIN);
  await expect(page.getByRole("link", { name: "ใบค่าแฟรนไชส์" }), "ต้องมีเมนูข้าง").toBeVisible({ timeout: 25_000 });

  // ค้นก่อนเสมอ — ตารางแบ่งหน้าละ 10 ใบ ข้อมูลของเทสต์อื่นอาจดันใบนี้ไปหน้าถัดไป
  await page.getByLabel("ค้นหาใบค่าแฟรนไชส์").fill(name);
  const แถว = page.getByRole("row", { name: new RegExp(เลขที่) });
  await expect(แถว).toBeVisible({ timeout: 25_000 });
  await expect(แถว).toContainText(name);
  await expect(แถว).toContainText("Exclusive");
  await expect(แถว).toContainText("250,000");
  await expect(แถว).toContainText("ส่งแล้ว");
  // ใบที่ส่งแล้ว: ปุ่มแก้/ลบในแถวต้องกดไม่ได้ (ฐานข้อมูลก็ล็อก)
  await expect(page.getByRole("button", { name: `แก้ไขใบ ${เลขที่}` })).toBeDisabled();
  await expect(page.getByRole("button", { name: `ลบใบ ${เลขที่}` })).toBeDisabled();

  await page.getByLabel("กรองตามสถานะใบ").selectOption("accepted");
  await expect(แถว, "กรอง “ตอบรับ” ต้องไม่เห็นใบที่ส่งแล้ว").toHaveCount(0);
  await page.getByLabel("กรองตามสถานะใบ").selectOption("all");
  await expect(แถว).toBeVisible();

  // ปุ่มดู → แผงรายละเอียดกลางจอ · ข้อมูลครบ · ตอบรับได้ในแผงเลย
  await page.getByRole("button", { name: `ดูใบ ${เลขที่}` }).click();
  const แผง = page.getByRole("dialog", { name: "รายละเอียดใบค่าแฟรนไชส์" });
  await expect(แผง.getByText(เลขที่)).toBeVisible();
  await expect(แผง).toContainText("24 เดือน (2 ปี)");
  await expect(แผง).toContainText("฿3,000,000");
  await แผง.getByRole("button", { name: "ตอบรับ" }).click();
  await กดตกลงในกล่องยืนยัน(page);
  await waitRow(sb, "dealer_package_proposals", { id: ใบId, status: "accepted" });
  await expect(แผง).toContainText("จบขั้นตอนของใบนี้", { timeout: 15_000 });

  // ลิงก์ไปลูกค้าเป้าหมาย → แผงรายนั้นต้องเปิดเอง
  await แผง.getByRole("link", { name: "ลูกค้าเป้าหมาย" }).click();
  await expect(page).toHaveURL(/\/hq\/prospects/, { timeout: 25_000 });
  const รายละเอียด = page.getByRole("dialog", { name: "ข้อมูลลูกค้าเป้าหมาย" });
  await expect(รายละเอียด.locator("#pr-name"), "ต้องเปิดแผงของรายที่กดมา").toHaveValue(name, { timeout: 25_000 });
  await expect(page, "ล้างพารามิเตอร์แล้ว รีเฟรชไม่เปิดซ้ำ").not.toHaveURL(/open=/);
  assertNoErrors(errs, "หน้าใบค่าแฟรนไชส์");
});

test("[func·hq] ออกใบในฟอร์มเดียว (เลือกลูกค้าเป้าหมายในฟอร์ม) → ใบร่าง → กดส่งแล้วในแผง → ขั้นลูกค้าเป้าหมายเลื่อนเอง", async ({ page }) => {
  const errs = watchErrors(page);
  const sb = await db(ADMIN);
  const name = `${NS}-ออกใบจากหน้ารวม`;
  const { data: pr, error } = await sb.from("dealer_prospects").insert({ name, province: "ลำปาง", status: "meeting" }).select("id").single();
  expect(error).toBeNull();
  const prospectId = (pr as { id: number }).id;

  await loginUI(page, HQ_ORIGIN, "/hq/proposals", ADMIN);
  await page.getByRole("button", { name: "ออกใบค่าแฟรนไชส์" }).first().click({ timeout: 25_000 });
  const ฟอร์ม = page.getByRole("dialog", { name: "ใบค่าแฟรนไชส์", exact: true });
  await expect(ฟอร์ม, "กดปุ่มเดียวได้ฟอร์มเลย ไม่มีกล่องเลือกรายก่อน").toBeVisible();
  await ฟอร์ม.locator("#pp-package").selectOption("standard");
  await ฟอร์ม.getByRole("button", { name: "บันทึกใบ" }).click();
  await expect(ฟอร์ม.getByText(/ต้องเลือกลูกค้าเป้าหมาย/), "ไม่เลือกราย = บันทึกไม่ได้").toBeVisible();
  await ฟอร์ม.locator("#pp-prospect").selectOption(String(prospectId));
  await expect(ฟอร์ม.locator("#pp-province"), "จังหวัดเติมจากลูกค้าเป้าหมายให้").toHaveValue("ลำปาง");
  await ฟอร์ม.locator("#pp-amount").fill("90000");
  await ฟอร์ม.getByRole("button", { name: "บันทึกใบ" }).click();

  const แถวใบ = await waitRow<{ id: number; proposal_no: string; status: string; amount: number }>(sb, "dealer_package_proposals", { prospect_id: prospectId });
  expect(แถวใบ.status).toBe("draft");
  expect(Number(แถวใบ.amount)).toBe(90_000);

  // บันทึกเสร็จ แผงของใบเปิดให้เลย → กดส่งแล้วต่อได้ทันที
  const แผง = page.getByRole("dialog", { name: "รายละเอียดใบค่าแฟรนไชส์" });
  await expect(แผง.getByText(แถวใบ.proposal_no)).toBeVisible({ timeout: 15_000 });
  await แผง.getByRole("button", { name: "ส่งแล้ว" }).click();
  await กดตกลงในกล่องยืนยัน(page);
  await waitRow(sb, "dealer_package_proposals", { id: แถวใบ.id, status: "sent" });
  // ส่งใบแล้ว ขั้นลูกค้าเป้าหมาย "นัดคุยแล้ว" → "รอตัดสินใจ" ให้เอง (ตัวดัก 0174)
  await waitRow(sb, "dealer_prospects", { id: prospectId, status: "considering" });
  await แผง.getByRole("button", { name: "ปิด" }).click();

  await page.getByLabel("ค้นหาใบค่าแฟรนไชส์").fill(name);
  const แถว = page.getByRole("row", { name: new RegExp(แถวใบ.proposal_no) });
  await expect(แถว).toContainText("ส่งแล้ว", { timeout: 15_000 });
  assertNoErrors(errs, "ออกใบค่าแฟรนไชส์จากหน้ารวม");
});

// รอบ 3 ข้อ 2 (บอสสั่ง 20 ต.ค. 69): แถวใบร่างมีไม่เกิน 2 ปุ่ม (ส่ง · พิมพ์) — ดู/แก้ไข/ลบ ย้ายไปแผงรายละเอียด (กดแถว)
test("[func·hq] แถวใบร่าง 2 ปุ่ม (ส่ง · พิมพ์) · แก้ไข/ลบใบร่างจากแผงรายละเอียด", async ({ page }) => {
  const errs = watchErrors(page);
  const sb = await db(ADMIN);
  const name = `${NS}-แก้ลบในแถว`;
  const { data: pr } = await sb.from("dealer_prospects").insert({ name, status: "contacted" }).select("id").single();
  const prospectId = (pr as { id: number }).id;
  const { data: ใบ, error } = await sb.from("dealer_package_proposals")
    .insert({ prospect_id: prospectId, package: "standard", proposed_date: "2026-09-14", amount: 100_000 })
    .select("id, proposal_no").single();
  expect(error).toBeNull();
  const { id: ใบId, proposal_no: เลขที่ } = ใบ as { id: number; proposal_no: string };

  await loginUI(page, HQ_ORIGIN, "/hq/proposals", ADMIN);
  await page.getByLabel("ค้นหาใบค่าแฟรนไชส์").fill(name);
  const แถว = page.getByRole("row", { name: new RegExp(เลขที่) });
  await expect(แถว).toBeVisible({ timeout: 25_000 });
  const ปุ่มในแถว = แถว.locator("td").last().getByRole("button");
  await expect(ปุ่มในแถว, "แถวใบร่างมีไม่เกิน 2 ปุ่ม").toHaveCount(2);
  await expect(แถว.getByRole("button", { name: `ส่งใบ ${เลขที่}` })).toBeVisible();
  await expect(แถว.getByRole("button", { name: `พิมพ์ใบ ${เลขที่}` })).toBeVisible();

  const แผง = page.getByRole("dialog", { name: "รายละเอียดใบค่าแฟรนไชส์" });
  await แถว.locator("td").first().click();
  await แผง.getByRole("button", { name: "แก้ไข", exact: true }).click();
  const ฟอร์ม = page.getByRole("dialog", { name: "ใบค่าแฟรนไชส์", exact: true });
  await expect(ฟอร์ม.locator("#pp-amount"), "ฟอร์มแก้ต้องมีค่าเดิม").toHaveValue("100,000");
  await ฟอร์ม.locator("#pp-amount").fill("120000");
  await ฟอร์ม.getByRole("button", { name: "บันทึกใบ" }).click();
  await waitRow(sb, "dealer_package_proposals", { id: ใบId, amount: 120_000 });
  await แผง.getByRole("button", { name: "ลบใบร่าง" }).click();
  await กดตกลงในกล่องยืนยัน(page);
  await expect.poll(async () => (await sb.from("dealer_package_proposals").select("id").eq("id", ใบId)).data?.length ?? -1,
    { timeout: 15_000 }).toBe(0);
  assertNoErrors(errs, "ปุ่มแก้ไข/ลบในแถวใบค่าแฟรนไชส์");
});
