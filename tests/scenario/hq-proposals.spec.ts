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

// รอบ 4 (บอสสั่ง 21 ต.ค. 69 ข้อ 13): หน้าใบค่าแฟรนไชส์ = รายการ · ติดตามชำระ · พิมพ์
//   ออก/แก้/ลบ/ส่ง/ตอบรับใบ ทำที่แผงผู้สนใจที่เดียว (H3 · H4) — ข้อทดสอบตรวจทั้ง "หน้ารวมไม่มีปุ่มแล้ว" และ "ทำได้ที่แผงผู้สนใจ"
const แผงผู้สนใจ = async (page: import("@playwright/test").Page, prospectId: number) => {
  await page.goto(`${HQ_ORIGIN}/hq/prospects?open=${prospectId}`, { waitUntil: "domcontentloaded" });
  const แผง = page.getByRole("dialog", { name: "ข้อมูลผู้สนใจ" });
  await expect(แผง).toBeVisible({ timeout: 25_000 });
  await แผง.getByRole("tab", { name: /ใบค่าแฟรนไชส์/ }).click();
  return แผง;
};

test("[func·hq] หน้าใบค่าแฟรนไชส์: ตาราง · ค้นหา/กรอง · แผงรายละเอียด (ดูอย่างเดียว) · ตอบรับที่แผงผู้สนใจ · ลิงก์ไปผู้สนใจ", async ({ page }) => {
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
  // หน้ารวม: ไม่มีปุ่มแก้/ลบ/ส่ง/ออกใบแล้ว (ทำที่แผงผู้สนใจ) — ฐานก็ล็อกใบที่ส่งแล้ว
  for (const ปุ่ม of [`แก้ไขใบ ${เลขที่}`, `ลบใบ ${เลขที่}`, `ส่งใบ ${เลขที่}`])
    await expect(page.getByRole("button", { name: ปุ่ม }), `หน้ารวมไม่มีปุ่ม ${ปุ่ม}`).toHaveCount(0);
  await expect(page.getByRole("button", { name: "ออกใบค่าแฟรนไชส์" }), "หน้ารวมไม่มีปุ่มออกใบ").toHaveCount(0);

  await page.getByLabel("กรองตามสถานะใบ").selectOption("accepted");
  await expect(แถว, "กรอง “ตอบรับ” ต้องไม่เห็นใบที่ส่งแล้ว").toHaveCount(0);
  await page.getByLabel("กรองตามสถานะใบ").selectOption("all");
  await expect(แถว).toBeVisible();

  // ปุ่มดู → แผงรายละเอียดกลางจอ · ข้อมูลครบ · ไม่มีปุ่มเปลี่ยนสถานะ
  await page.getByRole("button", { name: `ดูใบ ${เลขที่}` }).click();
  const แผง = page.getByRole("dialog", { name: "รายละเอียดใบค่าแฟรนไชส์" });
  await expect(แผง.getByText(เลขที่)).toBeVisible();
  await expect(แผง).toContainText("24 เดือน (2 ปี)");
  await expect(แผง).toContainText("฿3,000,000");
  for (const ปุ่ม of ["ตอบรับ", "ปฏิเสธ", "ส่งแล้ว", "แก้ไข", "ลบใบร่าง"])
    await expect(แผง.getByRole("button", { name: ปุ่ม, exact: true }), `แผงรายละเอียดไม่มีปุ่ม ${ปุ่ม}`).toHaveCount(0);

  // ลิงก์ไปผู้สนใจ → แผงรายนั้นต้องเปิดเอง · ตอบรับใบที่แผงผู้สนใจ
  await แผง.getByRole("link", { name: "ผู้สนใจ" }).click();
  await expect(page).toHaveURL(/\/hq\/prospects/, { timeout: 25_000 });
  const รายละเอียด = page.getByRole("dialog", { name: "ข้อมูลผู้สนใจ" });
  await expect(รายละเอียด.locator("#pr-name"), "ต้องเปิดแผงของรายที่กดมา").toHaveValue(name, { timeout: 25_000 });
  await expect(page, "ล้างพารามิเตอร์แล้ว รีเฟรชไม่เปิดซ้ำ").not.toHaveURL(/open=/);
  await รายละเอียด.getByRole("tab", { name: /ใบค่าแฟรนไชส์/ }).click();
  await รายละเอียด.getByLabel(`สถานะใบ ${เลขที่}`).selectOption("accepted");
  await กดตกลงในกล่องยืนยัน(page);
  await waitRow(sb, "dealer_package_proposals", { id: ใบId, status: "accepted" });

  // กลับหน้ารวม: สถานะใหม่ขึ้นในตาราง (ข้อมูลชุดเดียว)
  await page.goto(`${HQ_ORIGIN}/hq/proposals`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("ค้นหาใบค่าแฟรนไชส์").fill(name);
  await expect(page.getByRole("row", { name: new RegExp(เลขที่) })).toContainText("ตอบรับ", { timeout: 15_000 });
  assertNoErrors(errs, "หน้าใบค่าแฟรนไชส์");
});

test("[func·hq] ออกใบในแผงผู้สนใจ → ใบร่าง → ส่งแล้ว → ขั้นผู้สนใจเลื่อนเอง · หน้ารวมเห็นใบ", async ({ page }) => {
  const errs = watchErrors(page);
  const sb = await db(ADMIN);
  const name = `${NS}-ออกใบจากหน้ารวม`;
  const { data: pr, error } = await sb.from("dealer_prospects").insert({ name, province: "ลำปาง", status: "meeting" }).select("id").single();
  expect(error).toBeNull();
  const prospectId = (pr as { id: number }).id;

  await loginUI(page, HQ_ORIGIN, "/hq/proposals", ADMIN);
  await expect(page.getByRole("button", { name: "ออกใบค่าแฟรนไชส์" }), "หน้ารวมไม่มีปุ่มออกใบ (ออกได้ที่แผงผู้สนใจที่เดียว)").toHaveCount(0);
  const แผง = await แผงผู้สนใจ(page, prospectId);
  await แผง.getByRole("button", { name: "ออกใบค่าแฟรนไชส์" }).click();
  const ฟอร์ม = แผง.getByRole("region", { name: "ใบค่าแฟรนไชส์" });
  await expect(ฟอร์ม, "กดปุ่มเดียวได้ฟอร์มในแผงเลย").toBeVisible();
  await expect(ฟอร์ม.locator("#pp-prospect"), "ผู้สนใจกำหนดจากแผงแล้ว ไม่มีช่องเลือกราย").toHaveCount(0);
  await ฟอร์ม.getByRole("button", { name: "บันทึกใบ" }).click();
  await expect(ฟอร์ม.getByText(/ต้องเลือกแพ็กเกจ/), "ไม่เลือกแพ็กเกจ = บันทึกไม่ได้").toBeVisible();
  await ฟอร์ม.locator("#pp-package").selectOption("standard");
  await expect(ฟอร์ม.locator("#pp-province"), "จังหวัดเติมจากผู้สนใจให้").toHaveValue("ลำปาง");
  await ฟอร์ม.locator("#pp-amount").fill("90000");
  await ฟอร์ม.getByRole("button", { name: "บันทึกใบ" }).click();

  const แถวใบ = await waitRow<{ id: number; proposal_no: string; status: string; amount: number }>(sb, "dealer_package_proposals", { prospect_id: prospectId });
  expect(แถวใบ.status).toBe("draft");
  expect(Number(แถวใบ.amount)).toBe(90_000);

  // ส่งแล้ว (ในแผงผู้สนใจ) → ขั้นผู้สนใจ "นัดคุยแล้ว" → "รอตัดสินใจ" ให้เอง (ตัวดัก 0174)
  await แผง.getByLabel(`สถานะใบ ${แถวใบ.proposal_no}`).selectOption("sent");
  await กดตกลงในกล่องยืนยัน(page);
  await waitRow(sb, "dealer_package_proposals", { id: แถวใบ.id, status: "sent" });
  await waitRow(sb, "dealer_prospects", { id: prospectId, status: "considering" });

  await page.goto(`${HQ_ORIGIN}/hq/proposals`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("ค้นหาใบค่าแฟรนไชส์").fill(name);
  const แถว = page.getByRole("row", { name: new RegExp(แถวใบ.proposal_no) });
  await expect(แถว).toContainText("ส่งแล้ว", { timeout: 15_000 });
  assertNoErrors(errs, "ออกใบค่าแฟรนไชส์จากแผงผู้สนใจ");
});

// ── เปลี่ยนสถานะแล้วกดไปหน้าอื่นทันที บันทึกการใช้งานต้องไม่หาย (พบ 22 ต.ค. 69 · รอบตรวจเต็มใบ 0239) ──
// อาการ: บันทึกการใช้งานยิงหลังฐานรับสถานะแล้ว ถ้าผู้ใช้เปลี่ยนหน้าก่อนคำขอนั้นตอบ เบราว์เซอร์ตัดทิ้ง (net::ERR_ABORTED)
//   → ใบเปลี่ยนสถานะจริง แต่ไม่มีบันทึกว่าใครเปลี่ยน · หน้าเว็บขึ้น "[audit.append] TypeError: Failed to fetch"
// ข้อนี้ไม่พึ่งจังหวะเวลา: กักคำขอบันทึกจากหน้าเว็บ (ถ้ามี) ไว้จนเปลี่ยนหน้าเสร็จ แล้วค่อยปล่อย — โค้ดเดิมตกทุกครั้ง (ได้ 0 แถว)
// ทางแก้ (ใบ 0240): ฐานลงบันทึกในคำสั่งเดียวกับการเปลี่ยนสถานะ → หน้าเว็บไม่ยิงคำขอบันทึกเลย (ข้อนี้ตรวจด้วย)
test("[func·hq] เปลี่ยนสถานะใบแล้วไปหน้าอื่นทันที → บันทึกการใช้งานยังลงฐาน", async ({ page }) => {
  const sb = await db(ADMIN);
  const name = `${NS}-เปลี่ยนหน้าทันที`;
  const { data: pr, error } = await sb.from("dealer_prospects").insert({ name, province: "ลำปาง", status: "meeting" }).select("id").single();
  expect(error).toBeNull();
  const prospectId = (pr as { id: number }).id;
  const ใบ = await sb.from("dealer_package_proposals").insert({ prospect_id: prospectId, package: "standard", amount: 90_000 }).select("id, proposal_no").single();
  expect(ใบ.error?.message ?? "").toBe("");
  const { id: ใบId, proposal_no: เลขที่ } = ใบ.data as { id: number; proposal_no: string };

  await loginUI(page, HQ_ORIGIN, "/hq/proposals", ADMIN);
  const แผง = await แผงผู้สนใจ(page, prospectId);

  let ปล่อย!: () => void;
  const เปลี่ยนหน้าเสร็จ = new Promise<void>(r => { ปล่อย = r; });
  let หน้าเว็บยิงบันทึก = 0;
  await page.route("**/api/v1/audit?*", async route => {
    if (route.request().method() !== "POST") return route.fallback();
    หน้าเว็บยิงบันทึก++;
    await เปลี่ยนหน้าเสร็จ;
    await route.continue().catch(() => { /* เบราว์เซอร์ตัดคำขอทิ้งไปแล้ว = บันทึกหาย (ข้อนี้จะตกที่ด้านล่าง) */ });
  });

  await แผง.getByLabel(`สถานะใบ ${เลขที่}`).selectOption("sent");
  await กดตกลงในกล่องยืนยัน(page);
  await waitRow(sb, "dealer_package_proposals", { id: ใบId, status: "sent" });
  await page.goto(`${HQ_ORIGIN}/hq/audit`, { waitUntil: "domcontentloaded" });
  ปล่อย();

  await expect.poll(async () => {
    const { data } = await sb.from("audit_log").select("id").eq("action", "เปลี่ยนสถานะใบค่าแฟรนไชส์").like("target", `${เลขที่} · ${name}%`);
    return (data ?? []).length;
  }, { message: "เปลี่ยนหน้าระหว่างบันทึก → บันทึกการใช้งานต้องยังลงฐาน (ไม่ถูกตัดทิ้ง)", timeout: 15_000 }).toBe(1);
  expect(หน้าเว็บยิงบันทึก, "หน้าเว็บไม่ยิงคำขอบันทึกเอง (ฐานลงในคำสั่งเดียวกับการเปลี่ยน)").toBe(0);
  await page.unroute("**/api/v1/audit?*");
});

// รอบ 4: แถวในหน้ารวมเหลือ ดู + พิมพ์ (2 ปุ่ม) — แก้ไข/ลบใบร่างทำที่แผงผู้สนใจ
test("[func·hq] แถวใบร่าง 2 ปุ่ม (ดู · พิมพ์) · แก้ไข/ลบใบร่างที่แผงผู้สนใจ", async ({ page }) => {
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
  await expect(ปุ่มในแถว, "แถวมี 2 ปุ่ม (ดู · พิมพ์)").toHaveCount(2);
  await expect(แถว.getByRole("button", { name: `ดูใบ ${เลขที่}` })).toBeVisible();
  await expect(แถว.getByRole("button", { name: `พิมพ์ใบ ${เลขที่}` })).toBeVisible();
  await expect(แถว.getByRole("button", { name: `ส่งใบ ${เลขที่}` }), "ไม่มีปุ่มส่งในแถว").toHaveCount(0);

  const แผง = await แผงผู้สนใจ(page, prospectId);
  await แผง.getByRole("button", { name: `แก้ไขใบ ${เลขที่}` }).click();
  const ฟอร์ม = แผง.getByRole("region", { name: "ใบค่าแฟรนไชส์" });
  await expect(ฟอร์ม.locator("#pp-amount"), "ฟอร์มแก้ต้องมีค่าเดิม").toHaveValue("100,000");
  await ฟอร์ม.locator("#pp-amount").fill("120000");
  await ฟอร์ม.getByRole("button", { name: "บันทึกใบ" }).click();
  await waitRow(sb, "dealer_package_proposals", { id: ใบId, amount: 120_000 });
  await แผง.getByRole("button", { name: `ลบใบ ${เลขที่}` }).click();
  await กดตกลงในกล่องยืนยัน(page);
  await expect.poll(async () => (await sb.from("dealer_package_proposals").select("id").eq("id", ใบId)).data?.length ?? -1,
    { timeout: 15_000 }).toBe(0);
  assertNoErrors(errs, "แก้ไข/ลบใบร่างที่แผงผู้สนใจ");
});
