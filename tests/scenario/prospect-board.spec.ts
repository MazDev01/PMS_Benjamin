import { test, expect, type Page, type Locator } from "@playwright/test";
import { ADMIN, skipReason } from "./supabaseEnv";
import { HQ_ORIGIN, db, loginUI, watchErrors, assertNoErrors } from "./funcHelpers";
import { settle, กดตกลงในกล่องยืนยัน } from "./helpers";
import { ช่องผู้สนใจครบ } from "./requiredFixtures";
import { ลากการ์ด } from "./boardDrag";

// ── บอร์ดผู้สนใจเป็นดีลเลอร์ลากได้ (บอสสั่ง 5 พ.ย. 69 · ตัวกลาง StageBoard · ใบ 0278) ─────────────────────────────────────────────
//   ลากทีละ 1 ขั้นไปข้างหน้า = เปิดฟอร์มของขั้นนั้น · การ์ดย้ายเมื่อบันทึกสำเร็จ · ยกเลิกฟอร์ม = การ์ดอยู่ที่เดิม
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

test("[ui·hq] บอร์ดผู้สนใจ: ลากทีละขั้น = ฟอร์มของขั้น · ยกเลิกเด้งกลับ · ห้ามข้าม/ถอย · ไม่สำเร็จต้องมีเหตุผล", async ({ page }) => {
  const errs = watchErrors(page);
  await page.setViewportSize({ width: 1600, height: 950 });
  await loginUI(page, HQ_ORIGIN, "/hq/prospects", ADMIN);
  await settle(page);
  await page.getByLabel("ค้นหาผู้สนใจ").fill(แท็ก);
  await page.locator('button[title="บอร์ด"]').click();
  await expect(page.getByRole("region", { name: "บอร์ดผู้สนใจเป็นดีลเลอร์" })).toBeVisible();
  await expect(page.locator("[data-board-column]"), "คอลัมน์ตาม FLOW").toHaveCount(8);
  await อยู่ที่(page, "new", "เริ่มที่รอติดต่อ");

  // ข้ามขั้น = ไม่ได้ + บอกเหตุผล · การ์ดอยู่ที่เดิม
  await ลาก(page, "profile_sent");
  await expect(page.getByText(/เลื่อนได้ทีละขั้นไปข้างหน้าเท่านั้น/).first(), "ข้ามขั้น = บอกเหตุผล").toBeVisible();
  await อยู่ที่(page, "new", "ข้ามขั้นไม่ได้ การ์ดอยู่ที่เดิม");

  // ติดต่อแล้ว = ฟอร์มบันทึกการติดต่อ · ยกเลิก = อยู่ที่เดิม · บันทึก = ย้าย
  await ลาก(page, "contacted");
  await expect(แผง(page).locator("#pc-channel"), "ลากไปติดต่อแล้ว = เปิดฟอร์มบันทึกการติดต่อ").toBeVisible();
  await แผง(page).getByRole("button", { name: "ยกเลิก", exact: true }).click();
  await ปิดแผง(page);
  await อยู่ที่(page, "new", "ยกเลิกฟอร์ม = การ์ดอยู่ที่เดิม");
  await ลาก(page, "contacted");
  await แผง(page).locator("#pc-channel").selectOption({ index: 1 });
  await แผง(page).locator("#pc-body").fill("ZZTEST โทรคุยครั้งแรก");
  await แผง(page).getByRole("button", { name: "บันทึกการติดต่อ", exact: true }).click();
  await expect.poll(ขั้นในฐาน, { timeout: 20_000 }).toBe("contacted");
  await ปิดแผง(page);
  await อยู่ที่(page, "contacted", "บันทึกการติดต่อแล้ว การ์ดย้ายไปติดต่อแล้ว");

  // ส่งข้อมูลบริษัทแล้ว = ยืนยันการส่ง · ยกเลิก = อยู่ที่เดิม
  await ลาก(page, "profile_sent");
  const กล่อง = page.getByRole("alertdialog");
  await expect(กล่อง, "ลากไปส่งข้อมูลบริษัทแล้ว = กล่องยืนยันการส่ง").toContainText("ส่งข้อมูลบริษัท");
  await กล่อง.locator("[data-dialog-cancel]").click();   // ยกเลิก
  await อยู่ที่(page, "contacted", "ยกเลิกยืนยัน = อยู่ที่เดิม");
  await ลาก(page, "profile_sent");
  await กดตกลงในกล่องยืนยัน(page);
  await อยู่ที่(page, "profile_sent", "ยืนยันแล้ว การ์ดย้ายไปส่งข้อมูลบริษัทแล้ว");

  // ถอยขั้น = ไม่ได้ (ลากกลับ) · ปุ่ม "ย้ายไปขั้น…" ไม่มีขั้นก่อนหน้า
  await ลาก(page, "contacted");
  await expect(page.getByText(/เลื่อนได้ทีละขั้นไปข้างหน้าเท่านั้น/).first(), "ถอยขั้น = บอกเหตุผล").toBeVisible();
  await อยู่ที่(page, "profile_sent", "ถอยไม่ได้ การ์ดอยู่ที่เดิม");
  await การ์ด(page).locator("[data-move-menu]").click();
  await expect(การ์ด(page).locator("[data-move-to]"), "ปุ่มย้ายไปขั้น… = ขั้นถัดไป + ไม่สำเร็จ").toHaveCount(2);
  await expect(การ์ด(page).locator('[data-move-to="contacted"]')).toHaveCount(0);

  // นัดคุยแล้ว ผ่านปุ่ม "ย้ายไปขั้น…" = ฟอร์มนัดคุย (วันที่/เวลา/สถานที่ บังคับ) → บันทึกการติดต่อ + ขั้นเลื่อน
  await การ์ด(page).locator('[data-move-to="meeting"]').click();
  await expect(แผง(page).locator("#pc-meet-date"), "ไปนัดคุยแล้ว = ฟอร์มนัดคุย").toBeVisible();
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
  await ปิดแผง(page);
  await อยู่ที่(page, "meeting", "บันทึกนัดคุยแล้ว การ์ดย้ายไปนัดคุยแล้ว");

  // พร้อมตั้งเป็นดีลเลอร์ ลากเข้าไม่ได้ · ส่งใบค่าแฟรนไชส์ = ฟอร์มออกใบ (ยกเลิก = อยู่ที่เดิม)
  await ลาก(page, "ready");
  await expect(page.getByText(/เลื่อนได้ทีละขั้นไปข้างหน้าเท่านั้น/).first()).toBeVisible();
  await ลาก(page, "proposal");
  await expect(แผง(page).getByRole("region", { name: "ใบค่าแฟรนไชส์" }), "ลากไปส่งใบ = ฟอร์มออกใบ").toBeVisible({ timeout: 20_000 });
  await แผง(page).getByRole("region", { name: "ใบค่าแฟรนไชส์" }).getByRole("button", { name: "ยกเลิก", exact: true }).click();
  await ปิดแผง(page);
  await อยู่ที่(page, "meeting", "ยังไม่ส่งใบ = อยู่ที่เดิม");

  // ไม่สำเร็จ = เหตุผลบังคับ · ยกเลิก = อยู่ที่เดิม · ใส่เหตุผล = ย้าย
  await ลาก(page, "lost");
  await expect(page.getByRole("alertdialog"), "ลากไปไม่สำเร็จ = กล่องเหตุผล").toContainText("ไม่สำเร็จ");
  await page.getByRole("alertdialog").locator("[data-dialog-cancel]").click();
  await อยู่ที่(page, "meeting", "ยกเลิกเหตุผล = อยู่ที่เดิม");
  expect(await ขั้นในฐาน()).toBe("meeting");
  assertNoErrors(errs, "บอร์ดผู้สนใจ");
});
