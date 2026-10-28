import { test, expect } from "@playwright/test";
import { ADMIN, RYG, skipReason } from "./supabaseEnv";
import { HQ_ORIGIN, loginUI, watchErrors, assertNoErrors, db, waitRow, specNS } from "./funcHelpers";
import { ช่องทางที่เข้ามาเริ่มต้น, บวกวัน } from "../../packages/shared/lib/recruitSettings";
import { settle } from "./helpers";

// ── ตั้งค่า › หาดีลเลอร์ (บอสสั่ง 14 ก.ย. 69 · ข้อ 1 + ข้อ 2) ─────────────────────────────
// สิ่งที่ต้องพิสูจน์:
//   1) ตั้งรายการ/ชื่องาน/ค่าตั้งต้นใบ แล้วบันทึกลงฐานข้อมูลจริง (hq_recruit_settings · 0176)
//   2) ฟอร์มผู้สนใจเป็นดีลเลอร์ ใช้รายการที่ตั้ง: ประเภทธุรกิจ/ช่องทางเป็นดรอปดาวน์ · ชื่องานเปลี่ยน · เหตุผลเลือกจากรายการ
//   3) ใบค่าแฟรนไชส์ใหม่เติมค่าตั้งต้น: เงื่อนไข · วันมีผล · ตัวเลขของแพ็กเกจ (เปลี่ยนแพ็กเกจแล้วตัวเลขเปลี่ยนตาม)
// ค่าตั้งเป็นแถวเดียวของทั้งระบบ — เก็บของเดิมไว้แล้วคืนให้ท้ายไฟล์เสมอ
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(240_000);
test.describe.configure({ mode: "serial" });

const NS = specNS("RECRUIT");
let ค่าตั้งเดิม: unknown = {};

async function cleanup() {
  const { error } = await (await db(ADMIN)).from("dealer_prospects").delete().like("name", `${NS}%`);
  if (error) console.warn("[hq-recruit-settings] ล้างข้อมูลทดสอบไม่สำเร็จ", error.message);
}
test.beforeAll(async () => {
  await cleanup();
  const sb = await db(ADMIN);
  const { data, error } = await sb.from("hq_recruit_settings").select("config").eq("id", 1).maybeSingle();
  expect(error, "ต้องอ่านค่าตั้งหาดีลเลอร์ได้ (migration 0176)").toBeNull();
  ค่าตั้งเดิม = (data as { config?: unknown } | null)?.config ?? {};
  // เริ่มจากค่าเริ่มต้นเสมอ — ค่าที่ค้างจากรอบก่อนจะทำให้ปุ่มเพิ่มฟ้อง "มีอยู่แล้ว"
  expect((await sb.from("hq_recruit_settings").upsert({ id: 1, config: {} })).error).toBeNull();
});
test.afterAll(async () => {
  await cleanup();
  await (await db(ADMIN)).from("hq_recruit_settings").upsert({ id: 1, config: ค่าตั้งเดิม });
});

test("[security] ดีลเลอร์อ่าน/แก้ค่าตั้งหาดีลเลอร์ของสำนักงานใหญ่ไม่ได้", async () => {
  const dealer = await db(RYG);
  const { data, error } = await dealer.from("hq_recruit_settings").select("config");
  expect(error).toBeNull();
  expect(data ?? [], "ดีลเลอร์ต้องไม่เห็นแถวค่าตั้งเลย").toHaveLength(0);
  const แก้ = await dealer.from("hq_recruit_settings").update({ config: { businessTypes: ["แอบแก้"] } }).eq("id", 1).select();
  expect(แก้.data ?? [], "ดีลเลอร์แก้ค่าตั้งไม่ได้").toHaveLength(0);
  const { data: หลังแก้ } = await (await db(ADMIN)).from("hq_recruit_settings").select("config").eq("id", 1).single();
  expect(JSON.stringify((หลังแก้ as { config: unknown }).config)).not.toContain("แอบแก้");
});

test("[func·hq] ตั้งค่า › หาดีลเลอร์ → ฟอร์มผู้สนใจเป็นดีลเลอร์ ใช้รายการที่ตั้ง", async ({ page }) => {
  const errs = watchErrors(page);
  const sb = await db(ADMIN);

  await loginUI(page, HQ_ORIGIN, "/hq/settings", ADMIN);
  await page.locator(".tab-bar").getByRole("button", { name: "หาดีลเลอร์" }).click({ timeout: 25_000 });

  const เพิ่ม = async (ชื่อรายการ: string, ค่า: string) => {
    await page.getByRole("textbox", { name: `เพิ่ม${ชื่อรายการ}` }).fill(ค่า);
    await page.getByRole("button", { name: `เพิ่ม${ชื่อรายการ}` }).click();
    await expect(page.getByRole("button", { name: `ลบ ${ค่า}` })).toBeVisible();
  };
  await expect(page.getByText("ยังไม่ได้ตั้ง — ช่องประเภทธุรกิจในฟอร์มยังพิมพ์เองได้")).toBeVisible();
  await เพิ่ม("ช่องทางที่เข้ามา", "TikTok ทดสอบ");
  await เพิ่ม("ประเภทธุรกิจ", "ผู้รับเหมาทดสอบ");
  await เพิ่ม("เหตุผลที่ไม่สำเร็จ", "เงินทุนไม่พอ (ทดสอบ)");
  // ใส่ซ้ำต้องไม่ได้สองรายการ
  await page.getByRole("textbox", { name: "เพิ่มประเภทธุรกิจ" }).fill("ผู้รับเหมาทดสอบ");
  await page.getByRole("button", { name: "เพิ่มประเภทธุรกิจ" }).click();
  await expect(page.getByText("“ผู้รับเหมาทดสอบ” มีอยู่แล้ว")).toBeVisible();

  await page.getByLabel("ชื่องาน ส่งข้อมูลบริษัท").fill("ส่งโบรชัวร์ทดสอบ");
  await page.getByLabel("อายุใบค่าแฟรนไชส์ (วัน)").fill("30");
  await page.getByLabel("ชื่อผู้ลงนาม").fill("คุณทดสอบ ลงนาม");
  await page.locator("#rc-terms").fill("ข้อทดสอบหนึ่ง");
  await page.locator("#rc-standard-amount").fill("150000");
  await expect(page.locator("#rc-standard-amount"), "ช่องเงินต้องมีลูกน้ำ").toHaveValue("150,000");
  await page.locator("#rc-standard-months").fill("12");

  await page.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect.poll(async () => (await sb.from("hq_recruit_settings").select("config").eq("id", 1).single()).data?.config, { timeout: 20_000 })
    .toMatchObject({
      channels: [...ช่องทางที่เข้ามาเริ่มต้น, "TikTok ทดสอบ"],
      businessTypes: ["ผู้รับเหมาทดสอบ"],
      lostReasons: ["เงินทุนไม่พอ (ทดสอบ)"],
      taskLabels: { profile: "ส่งโบรชัวร์ทดสอบ" },
      proposal: {
        validityDays: 30, signerName: "คุณทดสอบ ลงนาม", terms: "ข้อทดสอบหนึ่ง",
        packages: { standard: { amount: 150000, contractMonths: 12, annualTarget: null } },
      },
    });

  // ── ฟอร์มผู้สนใจเป็นดีลเลอร์ ──
  // รอคำขอที่ยังค้างหลังกดบันทึก (บันทึกการใช้งาน) ส่งจบก่อนเปลี่ยนหน้า — ไม่งั้นการเปลี่ยนหน้าตัดคำขอกลางทาง
  // แล้วขึ้น "Failed to fetch" ในคอนโซล ทั้งที่ระบบไม่ได้พัง (เจอครั้งแรก 14 ก.ย. 69)
  await settle(page);   // ไม่ใช้ networkidle — โหมด api เปิดสายอัปเดตสดค้างไว้ ไม่มีวัน "เงียบ" (ดู helpers.settle)
  const name = `${NS}-ใช้รายการที่ตั้ง`;
  await page.goto(`${HQ_ORIGIN}/hq/prospects`);
  await page.getByRole("button", { name: "เพิ่มผู้สนใจ" }).first().click({ timeout: 25_000 });
  const ฟอร์ม = page.getByRole("dialog", { name: "ข้อมูลผู้สนใจ" });
  await expect(ฟอร์ม.locator("select#pr-type"), "ตั้งรายการแล้ว ประเภทธุรกิจต้องเป็นดรอปดาวน์").toBeVisible();
  await ฟอร์ม.locator("#pr-name").fill(name);
  await ฟอร์ม.locator("#pr-type").selectOption("ผู้รับเหมาทดสอบ");
  await ฟอร์ม.locator("#pr-channel").selectOption("TikTok ทดสอบ");
  await ฟอร์ม.getByRole("button", { name: "เพิ่มผู้สนใจ" }).click();
  await waitRow(sb, "dealer_prospects", { name, business_type: "ผู้รับเหมาทดสอบ", channel: "TikTok ทดสอบ" });

  // ── ชื่องาน + เหตุผลที่ไม่สำเร็จ ──
  await page.goto(`${HQ_ORIGIN}/hq/prospects`);
  await page.getByLabel("ค้นหาผู้สนใจ").fill(name);
  await page.getByRole("row", { name: new RegExp(name) }).click({ timeout: 25_000 });
  const แผง = page.getByRole("dialog", { name: "ข้อมูลผู้สนใจ" });
  await แผง.getByRole("tab", { name: "งาน/ความคืบหน้า" }).click();
  await expect(แผง.getByRole("checkbox", { name: "ส่งโบรชัวร์ทดสอบ" }), "ชื่องานต้องเป็นชื่อที่ตั้งไว้").toBeVisible({ timeout: 15_000 });
  await แผง.getByRole("button", { name: "ไม่สำเร็จ", exact: true }).click();
  // กล่องเหตุผลกลาง (28 ต.ค. 69) — รายการที่ตั้งไว้เป็นปุ่มให้เลือก (เดิม select#pj-lost-reason)
  const กล่อง = page.locator("[data-reason-dialog]");
  await expect(กล่อง.locator("[data-lost-picker]").getByRole("button", { name: "เงินทุนไม่พอ (ทดสอบ)" }), "ตั้งรายการเหตุผลแล้วต้องเลือกจากรายการ").toBeVisible();
  await expect(กล่อง.getByRole("button", { name: "ยืนยันไม่สำเร็จ" }), "ยังไม่เลือกเหตุผล = กดยืนยันไม่ได้").toBeDisabled();
  await กล่อง.locator("[data-lost-picker]").getByRole("button", { name: "เงินทุนไม่พอ (ทดสอบ)" }).click();
  await กล่อง.getByRole("button", { name: "ยืนยันไม่สำเร็จ" }).click();
  await waitRow(sb, "dealer_prospects", { name, status: "lost", lost_reason: "เงินทุนไม่พอ (ทดสอบ)" });
  assertNoErrors(errs, "ตั้งค่าหาดีลเลอร์ → ฟอร์มลูกค้าเป้าหมาย");
});

test("[func·hq] ใบค่าแฟรนไชส์ใหม่เติมค่าตั้งต้น: เงื่อนไข · วันมีผล · ตัวเลขตามแพ็กเกจ", async ({ page }) => {
  const errs = watchErrors(page);
  const sb = await db(ADMIN);
  const name = `${NS}-ออกใบค่าตั้งต้น`;
  const { data: pr, error } = await sb.from("dealer_prospects").insert({ name, province: "ลำปาง", status: "meeting" }).select("id").single();
  expect(error).toBeNull();
  const prospectId = (pr as { id: number }).id;

  // รอบ 4 (บอสสั่ง 21 ต.ค. 69 ข้อ 13): ออกใบค่าแฟรนไชส์ได้จากแผงผู้สนใจที่เดียว — หน้ารวมใบเป็นรายการ/ติดตามชำระ/พิมพ์
  await loginUI(page, HQ_ORIGIN, "/hq/proposals", ADMIN);
  await expect(page.getByRole("button", { name: "ออกใบค่าแฟรนไชส์" }), "หน้ารวมใบไม่มีปุ่มออกใบแล้ว").toHaveCount(0);
  await page.goto(`${HQ_ORIGIN}/hq/prospects?open=${prospectId}`, { waitUntil: "domcontentloaded" });
  const แผง = page.getByRole("dialog", { name: "ข้อมูลผู้สนใจ" });
  await แผง.getByRole("tab", { name: /ใบค่าแฟรนไชส์/ }).click({ timeout: 25_000 });
  await แผง.getByRole("button", { name: "ออกใบค่าแฟรนไชส์" }).click({ timeout: 25_000 });
  const ฟอร์ม = แผง.getByRole("region", { name: "ใบค่าแฟรนไชส์" });
  await expect(ฟอร์ม.locator("#pp-terms"), "เงื่อนไขมาตรฐานเติมให้").toHaveValue("ข้อทดสอบหนึ่ง", { timeout: 15_000 });
  const วันเสนอ = await ฟอร์ม.locator("#pp-date").inputValue();
  await expect(ฟอร์ม.locator("#pp-valid"), "วันมีผล = วันที่เสนอ + 30 วัน").toHaveValue(บวกวัน(วันเสนอ, 30)!);

  // ผู้สนใจถูกกำหนดจากแผงแล้ว (ไม่มีช่องเลือกผู้สนใจในฟอร์มของแผง)
  await ฟอร์ม.locator("#pp-package").selectOption("standard");
  await expect(ฟอร์ม.locator("#pp-amount")).toHaveValue("150,000");
  await expect(ฟอร์ม.locator("#pp-months")).toHaveValue("12");
  await expect(ฟอร์ม.locator("#pp-target"), "ไม่ได้ตั้ง = ว่าง ไม่เดาให้").toHaveValue("");
  // Exclusive ไม่ได้ตั้งตัวเลขไว้ → ช่องที่ระบบเติมให้ต้องว่างตาม
  await ฟอร์ม.locator("#pp-package").selectOption("exclusive");
  await expect(ฟอร์ม.locator("#pp-amount")).toHaveValue("");
  // ผู้ใช้พิมพ์เองแล้ว เปลี่ยนแพ็กเกจต้องไม่ทับ
  await ฟอร์ม.locator("#pp-amount").fill("99000");
  await ฟอร์ม.locator("#pp-package").selectOption("standard");
  await expect(ฟอร์ม.locator("#pp-amount"), "ค่าที่พิมพ์เองต้องไม่ถูกทับ").toHaveValue("99,000");
  await expect(ฟอร์ม.locator("#pp-months")).toHaveValue("12");
  await ฟอร์ม.getByRole("button", { name: "บันทึกใบ" }).click();

  const แถว = await waitRow<{ amount: number; contract_months: number; terms: string; valid_until: string; package: string }>(
    sb, "dealer_package_proposals", { prospect_id: prospectId });
  expect(แถว.package).toBe("standard");
  expect(Number(แถว.amount)).toBe(99_000);
  expect(แถว.contract_months).toBe(12);
  expect(แถว.terms).toBe("ข้อทดสอบหนึ่ง");
  expect(แถว.valid_until).toBe(บวกวัน(วันเสนอ, 30));
  assertNoErrors(errs, "ใบค่าแฟรนไชส์ใหม่เติมค่าตั้งต้น");
});
