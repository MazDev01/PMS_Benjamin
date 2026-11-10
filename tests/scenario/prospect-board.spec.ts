import { test, expect, type Page, type Locator } from "@playwright/test";
import { ADMIN, skipReason } from "./supabaseEnv";
import { HQ_ORIGIN, db, loginUI, watchErrors, assertNoErrors } from "./funcHelpers";
import { settle, กดตกลงในกล่องยืนยัน } from "./helpers";
import { ช่องผู้สนใจครบ } from "./requiredFixtures";
import { ลากการ์ด } from "./boardDrag";

// ── บอร์ดผู้สนใจเป็นดีลเลอร์ลากได้ (บอสสั่ง 5 พ.ย. 69 · ตัวกลาง StageBoard · ใบ 0278) ─────────────────────────────────────────────
//   5 คอลัมน์ (บอสสั่ง 5 พ.ย. 69 รอบ 2): ลากทีละ 1 คอลัมน์ไปข้างหน้า = ฟอร์มของขั้นที่ขาดตามลำดับ · ทำครบถึงย้าย · ยกเลิกกลางทาง = ขั้นที่บันทึกแล้วคงไว้
//   ตกบนโค้ดรอบก่อน: บอร์ด 8 คอลัมน์ ลากทีละขั้น ไม่ต่อฟอร์ม · ไม่มีคอลัมน์ปิดแล้ว/ตัวเลือกผล
//   ติดต่อแล้ว = บันทึกการติดต่อ · ส่งข้อมูลบริษัทแล้ว = ยืนยันการส่ง (P1) · นัดคุยแล้ว = ฟอร์มนัดคุย วันที่/เวลา/สถานที่ (P2)
//   ส่งใบค่าแฟรนไชส์ = ฟอร์มออกใบ · พร้อมตั้งเป็นดีลเลอร์ = ลากเข้าไม่ได้ · ไม่สำเร็จ = เหตุผลบังคับ · ข้าม/ถอย = ไม่ได้ (บอกเหตุผล)
//   ปุ่ม "ย้ายไปขั้น…" บนการ์ด = ทางเดียวกับการลาก
//   ตกบนโค้ดก่อนแก้: ไม่มีมุมมองบอร์ดในหน้าผู้สนใจ
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(240_000);
const แท็ก = `ZZTEST-บอร์ดผู้สนใจ-${Date.now() % 1_000_000}`;
let pid = 0;
test.beforeAll(async () => {
  const { data, error } = await (await db(ADMIN)).from("dealer_prospects").insert({ ...ช่องผู้สนใจครบ(), name: แท็ก, province: "ตราด" }).select("id").single();
  expect(error).toBeNull();
  pid = (data as { id: number }).id;
});
test.afterAll(async () => { await (await db(ADMIN)).from("dealer_prospects").delete().eq("name", แท็ก); });

const การ์ด = (page: Page) => page.locator(`[data-board-card="${pid}"]`);
const คอลัมน์ = (page: Page, k: string) => page.locator(`[data-board-column="${k}"]`);
const อยู่ที่ = (page: Page, k: string, ข้อความ: string) => expect(คอลัมน์(page, k).locator(`[data-board-card="${pid}"]`), ข้อความ).toHaveCount(1, { timeout: 20_000 });
const ขั้นในฐาน = async () => ((await (await db(ADMIN)).from("dealer_prospects").select("status").eq("id", pid).single()).data as { status: string }).status;
async function ลาก(page: Page, ไป: string) { await ลากการ์ด(page, การ์ด(page), คอลัมน์(page, ไป)); }
const แผง = (page: Page): Locator => page.getByRole("dialog", { name: "ข้อมูลผู้สนใจ" });
async function ปิดแผง(page: Page) { await page.keyboard.press("Escape"); await expect(แผง(page)).toHaveCount(0); }

test("[ui·hq] บอร์ดผู้สนใจ 5 คอลัมน์: ลากเข้าคอลัมน์ = ฟอร์มที่ขาดตามลำดับ · ยกเลิกกลางทางคงขั้นที่บันทึก · ห้ามข้าม/ถอย · ปิดแล้วให้เลือกผล", async ({ page }) => {
  const errs = watchErrors(page);
  await page.setViewportSize({ width: 1600, height: 950 });
  await loginUI(page, HQ_ORIGIN, "/hq/prospects", ADMIN);
  await settle(page);
  await page.getByLabel("ค้นหาผู้สนใจ").fill(แท็ก);
  await page.locator('button[title="บอร์ด"]').click();
  await expect(page.getByRole("region", { name: "บอร์ดผู้สนใจเป็นดีลเลอร์" })).toBeVisible();
  await expect(page.locator("[data-board-column]"), "5 คอลัมน์").toHaveCount(5);
  await expect(page.locator("[data-board-column]").locator("> div:first-child span[style*='nowrap']"), "ชื่อคอลัมน์")
    .toHaveText(["ติดต่อ", "คุยรายละเอียด", "ส่งใบค่าแฟรนไชส์", "พร้อมตั้งเป็นดีลเลอร์", "ปิดแล้ว"]);
  await expect(คอลัมน์(page, "closed"), "ปิดแล้ว ยุบไว้ตั้งแต่แรก").toHaveAttribute("data-board-collapsed", "true");
  await คอลัมน์(page, "closed").locator("[data-board-toggle]").click();
  await expect(คอลัมน์(page, "closed"), "กดเปิดดูได้").not.toHaveAttribute("data-board-collapsed", "true");
  await คอลัมน์(page, "closed").locator("[data-board-toggle]").click();
  await อยู่ที่(page, "contact", "เริ่มที่คอลัมน์ติดต่อ");
  await expect(การ์ด(page).locator("[data-prospect-stage]"), "ขั้นย่อยเป็นป้ายบนการ์ด").toHaveText("รอติดต่อ");

  // ข้ามคอลัมน์ = ไม่ได้ + บอกเหตุผล · การ์ดอยู่ที่เดิม
  await ลาก(page, "proposal");
  await expect(page.getByText(/เลื่อนได้ทีละขั้นไปข้างหน้าเท่านั้น/).first(), "ข้ามคอลัมน์ = บอกเหตุผล").toBeVisible();
  await อยู่ที่(page, "contact", "ข้ามไม่ได้ การ์ดอยู่ที่เดิม");

  // คุยรายละเอียด (รอติดต่อ): ฟอร์มบันทึกการติดต่อก่อน · ยกเลิก = อยู่ที่เดิม ไม่มีอะไรเปลี่ยน
  await ลาก(page, "discuss");
  await expect(แผง(page).locator("#pc-channel"), "ขั้นแรกที่ขาด = ฟอร์มบันทึกการติดต่อ").toBeVisible();
  await แผง(page).getByRole("button", { name: "ยกเลิก", exact: true }).click();
  await ปิดแผง(page);
  await อยู่ที่(page, "contact", "ยกเลิกฟอร์มแรก = การ์ดอยู่ที่เดิม");
  expect(await ขั้นในฐาน()).toBe("new");

  // บันทึกการติดต่อ → ฟอร์มถัดไป (ยืนยันส่งข้อมูลบริษัท) ขึ้นเอง · ยกเลิกตรงนี้ = ขั้นที่บันทึกแล้วคงไว้ การ์ดอยู่คอลัมน์ตามสถานะจริง
  await ลาก(page, "discuss");
  await แผง(page).locator("#pc-channel").selectOption({ index: 1 });
  await แผง(page).locator("#pc-body").fill("ZZTEST โทรคุยครั้งแรก");
  await แผง(page).getByRole("button", { name: "บันทึกการติดต่อ", exact: true }).click();
  const กล่อง = page.getByRole("alertdialog");
  await expect(กล่อง, "บันทึกการติดต่อแล้ว ฟอร์มถัดไป = ยืนยันส่งข้อมูลบริษัท").toContainText("ส่งข้อมูลบริษัท", { timeout: 20_000 });
  expect(await ขั้นในฐาน(), "ขั้นแรกบันทึกแล้ว").toBe("contacted");
  await กล่อง.locator("[data-dialog-cancel]").click();
  await ปิดแผง(page);
  await อยู่ที่(page, "contact", "ยกเลิกกลางทาง = อยู่คอลัมน์ติดต่อ (ติดต่อแล้ว)");
  await expect(การ์ด(page).locator("[data-prospect-stage]")).toHaveText("ติดต่อแล้ว");

  // ลากอีกครั้ง (ติดต่อแล้ว) = เหลือแค่ยืนยันส่งข้อมูล → ย้ายเข้าคุยรายละเอียด
  await ลาก(page, "discuss");
  await expect(page.getByRole("alertdialog"), "ติดต่อแล้ว = ข้ามฟอร์มบันทึกการติดต่อ เหลือยืนยันส่งข้อมูล").toContainText("ส่งข้อมูลบริษัท");
  await expect(แผง(page)).toHaveCount(0);
  await กดตกลงในกล่องยืนยัน(page);
  await expect.poll(ขั้นในฐาน, { timeout: 20_000 }).toBe("profile_sent");
  await อยู่ที่(page, "discuss", "ทำครบ การ์ดย้ายไปคุยรายละเอียด");

  // ถอย = ไม่ได้ · ปุ่ม "ย้ายไปขั้น…" = คอลัมน์ถัดไป + ปิดแล้ว
  await ลาก(page, "contact");
  await expect(page.getByText(/เลื่อนได้ทีละขั้นไปข้างหน้าเท่านั้น/).first(), "ถอย = บอกเหตุผล").toBeVisible();
  await อยู่ที่(page, "discuss", "ถอยไม่ได้ การ์ดอยู่ที่เดิม");
  await การ์ด(page).locator("[data-move-menu]").click();
  await expect(การ์ด(page).locator("[data-move-to]"), "ย้ายไปขั้น… = ส่งใบ + ปิดแล้ว").toHaveText([/^ส่งใบค่าแฟรนไชส์ — บันทึกนัดคุย → ออกใบ/, /^ปิดแล้ว/]);
  await page.keyboard.press("Escape");

  // ส่งใบ (ส่งข้อมูลแล้ว): ฟอร์มนัดคุย (ช่องบังคับ) → บันทึก → ฟอร์มออกใบขึ้นเอง · ยกเลิกออกใบ = อยู่คุยรายละเอียด (นัดคุยแล้ว)
  await ลาก(page, "proposal");
  await expect(แผง(page).locator("#pc-meet-date"), "ขั้นแรกที่ขาด = ฟอร์มนัดคุย").toBeVisible();
  await แผง(page).locator("#pc-channel").selectOption({ index: 1 });
  await แผง(page).getByRole("button", { name: "บันทึกนัดคุย", exact: true }).click();
  await expect(แผง(page).getByText("ต้องระบุวันที่นัดคุย"), "ช่องบังคับ").toBeVisible();
  const พรุ่งนี้ = new Date(Date.now() + 31 * 3_600_000).toISOString().slice(0, 10);
  await แผง(page).locator("#pc-meet-date").fill(พรุ่งนี้);
  await แผง(page).locator("#pc-meet-time").fill("10:30");
  await แผง(page).locator("#pc-meet-place").fill("ZZTEST สำนักงานผู้สนใจ");
  await แผง(page).getByRole("button", { name: "บันทึกนัดคุย", exact: true }).click();
  await expect.poll(ขั้นในฐาน, { timeout: 20_000 }).toBe("meeting");
  const { data: บันทึก } = await (await db(ADMIN)).from("dealer_prospect_activities").select("body, next_follow_up").eq("prospect_id", pid).eq("kind", "contact").order("id", { ascending: false }).limit(1);
  expect((บันทึก ?? [])[0], "นัดคุย = บันทึกการติดต่อ + วันติดตาม = วันนัด").toMatchObject({ next_follow_up: พรุ่งนี้ });
  expect(String((บันทึก ?? [])[0]?.body)).toMatch(/^นัดคุย .* เวลา 10:30 น\. · สถานที่ ZZTEST สำนักงานผู้สนใจ$/);
  const ใบ = แผง(page).getByRole("region", { name: "ใบค่าแฟรนไชส์" });
  await expect(ใบ, "บันทึกนัดคุยแล้ว ฟอร์มถัดไป = ออกใบ").toBeVisible({ timeout: 20_000 });
  await ใบ.getByRole("button", { name: "ยกเลิก", exact: true }).click();
  await ปิดแผง(page);
  await อยู่ที่(page, "discuss", "ยังไม่ส่งใบ = อยู่คุยรายละเอียด");
  await expect(การ์ด(page).locator("[data-prospect-stage]")).toHaveText("นัดคุยแล้ว");

  // พร้อมตั้งเป็นดีลเลอร์ = ข้ามคอลัมน์ ลากไม่ได้
  await ลาก(page, "ready");
  await expect(page.getByText(/เลื่อนได้ทีละขั้นไปข้างหน้าเท่านั้น/).first()).toBeVisible();

  // ปิดแล้ว (ยุบอยู่ก็วางได้) = เลือกผล · เป็นดีลเลอร์ได้เฉพาะการ์ดที่พร้อม · ไม่สำเร็จ = เหตุผลบังคับ · ยกเลิก = อยู่ที่เดิม
  await ลาก(page, "closed");
  const เลือก = page.getByRole("dialog", { name: "ปิดการติดตาม" });
  await expect(เลือก.locator('[data-close-choice="won"]'), "ยังไม่พร้อม = เป็นดีลเลอร์กดไม่ได้").toBeDisabled();
  await expect(เลือก.locator("[data-close-won-reason]")).toContainText("ต้องส่งใบค่าแฟรนไชส์");
  await เลือก.locator('[data-close-choice="lost"]').click();
  await expect(page.getByRole("alertdialog"), "ไม่สำเร็จ = กล่องเหตุผล").toContainText("ไม่สำเร็จ");
  await page.getByRole("alertdialog").locator("[data-dialog-cancel]").click();
  await อยู่ที่(page, "discuss", "ยกเลิกเหตุผล = อยู่ที่เดิม");
  expect(await ขั้นในฐาน()).toBe("meeting");

  // ยกเลิกงานล่าสุดที่ติ๊กในแผง = ถอย 1 ขั้นได้ (บอสตอบ 5 พ.ย. 69) — ลากถอยบนบอร์ดยังไม่ได้ (ข้างบน)
  await การ์ด(page).click();
  await แผง(page).getByRole("tab", { name: "งาน/ความคืบหน้า" }).click();
  // บอสสั่ง 6 พ.ย. 69 (กลับด้าน): กดงานที่ติ๊กแล้ว = เปิดดูรายละเอียด ไม่ถอยขั้น · ถอย = ปุ่ม "ยกเลิกงานล่าสุด" แยก
  await แผง(page).getByRole("checkbox", { name: "นัดคุยรายละเอียด" }).click();
  await expect(แผง(page).getByRole("tab", { name: /บันทึกการติดต่อ/ }), "กดงานที่ติ๊กแล้ว = เปิดบันทึกการติดต่อ").toHaveAttribute("aria-selected", "true");
  await page.waitForTimeout(800);   // วัดว่าไม่ถอยขั้น (ไม่ใช่รอให้ผ่าน)
  expect(await ขั้นในฐาน(), "กดงานที่ติ๊กแล้วไม่ถอยขั้น").toBe("meeting");
  await แผง(page).getByRole("tab", { name: "งาน/ความคืบหน้า" }).click();
  await แผง(page).locator("[data-undo-last]").click();
  await expect.poll(ขั้นในฐาน, { timeout: 20_000, message: "ยกเลิกงานล่าสุด = นัดคุยแล้ว → ส่งข้อมูลบริษัทแล้ว" }).toBe("profile_sent");
  await expect(แผง(page).locator("[data-undo-last]"), "ปุ่มบอกงานล่าสุดถัดไป").toContainText("ส่งข้อมูลบริษัท");
  assertNoErrors(errs, "บอร์ดผู้สนใจ");
});
