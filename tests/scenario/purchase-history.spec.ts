import { test, expect, type Page } from "@playwright/test";
import { ADMIN, RYG, skipReason } from "./supabaseEnv";
import { HQ_ORIGIN, DEALER_ORIGIN, db, loginUI, watchErrors, assertNoErrors } from "./funcHelpers";
import { settle, แถวตามชื่อ, ตั้งต้น } from "./helpers";

// ── แผงลูกค้า: ประวัติการซื้อ (บอสสั่ง 18 พ.ย. 69 · ทับแท็บ "อาคารที่ซื้อ") ─────────────────────────────────────────────────
//   HQ: แท็บ "อาคารที่ซื้อ" เปลี่ยนเป็น "ประวัติการซื้อ" ตำแหน่งเดิม รวมกับแท็บประวัติการซื้อเดิม → แท็บ ข้อมูลลูกค้า · บันทึก · ประวัติการซื้อ · ประวัติ
//   ดีลเลอร์: แท็บ ข้อมูลลูกค้า · ประวัติการซื้อ · เพิ่มงานขายใหม่ (เดิมไม่มีแท็บประวัติการซื้อ)
//   รายการ = ใบที่ลูกค้าตอบรับ · ยอดรวม = ผลรวมใบที่ตอบรับ (ตรวจกับฐาน) · กดรายการ = รายละเอียดงาน + รายการที่ซื้อ + รูปแปลน/ไฟล์ของงาน
//   ไฟล์ของงาน = ไฟล์ที่แนบที่ลูกค้าเป้าหมายของงาน (ข้อนี้แนบไฟล์ทดสอบให้ลีดของใบตั้งต้นแล้วลบหลังจบ)
//   ตกบนโค้ดเดิม: HQ มีแท็บ "อาคารที่ซื้อ" · ดีลเลอร์ไม่มีแท็บประวัติการซื้อ
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(180_000);
test.describe.configure({ mode: "serial" });

const แท็ก = `ZZTEST-แปลนงาน-${Date.now() % 1_000_000}`;
let ไฟล์ทดสอบ = "";
let ใบตอบรับ: { id: string; total_value: number; deal_id: number | null; line_items: unknown[] | null }[] = [];

// ไฟล์ทดสอบของงาน: ใบผูกลีด = แนบที่ลีดของงาน · ใบไม่ผูกลีด (ใบตั้งต้น) = แนบที่ลูกค้า ชื่อไฟล์มีเลขใบ (กติกาเดียวกับตัวกลาง JobAttachments)
test.beforeAll(async () => {
  const sb = await db(ADMIN);
  const { data: ลูกค้า } = await sb.from("customers").select("id").eq("dealer_code", "RYG").eq("company", ตั้งต้น.ลูกค้าRYG).single();
  const cid = (ลูกค้า as { id: number }).id;
  const { data } = await sb.from("quotations").select("id, total_value, deal_id, line_items").eq("dealer_code", "RYG").eq("customer_id", cid).eq("status", "won");
  ใบตอบรับ = (data ?? []) as typeof ใบตอบรับ;
  expect(ใบตอบรับ.length, "ลูกค้าตั้งต้นมีใบที่ตอบรับ").toBeGreaterThan(0);
  const ใบ = ใบตอบรับ.find(q => q.deal_id != null) ?? ใบตอบรับ[0];
  ไฟล์ทดสอบ = `${แท็ก}-${ใบ.id}.png`;
  const { error } = await (await db(RYG)).from("files").insert({ name: ไฟล์ทดสอบ, size: "1 KB", ext: "png", category: "แบบแปลน", project: "ZZTEST",
    uploaded_by: "ZZTEST", uploaded_at: "2026-11-18", dealer_code: "RYG",
    ...(ใบ.deal_id != null ? { source: "lead", record_id: ใบ.deal_id } : { source: "customer", record_id: cid, customer_id: cid }) });
  expect(error, "แนบไฟล์ทดสอบให้งาน").toBeNull();
});
test.afterAll(async () => { await (await db(RYG)).from("files").delete().like("name", `${แท็ก}%`); });

const ยอดรวม = () => Math.round(ใบตอบรับ.reduce((s, q) => s + Number(q.total_value), 0) * 100) / 100;

async function ตรวจรายการและหน้าต่าง(page: Page, แผง: ReturnType<Page["locator"]>, ชื่อ: string, หน้าต่าง: string) {
  const รายการ = แผง.locator("[data-purchase-history]");
  await expect(รายการ, `${ชื่อ}: มีประวัติการซื้อ`).toBeVisible({ timeout: 30_000 });
  await expect(รายการ.locator("[data-purchase-row]"), `${ชื่อ}: รายการ = ใบที่ตอบรับ`).toHaveCount(ใบตอบรับ.length);
  expect(Number(await รายการ.locator("[data-purchase-total]").getAttribute("data-purchase-total")), `${ชื่อ}: ยอดรวม = ผลรวมใบที่ตอบรับ`).toBeCloseTo(ยอดรวม(), 2);
  const ใบ = ใบตอบรับ.find(q => q.deal_id != null) ?? ใบตอบรับ[0];
  await รายการ.locator(`[data-purchase-row="${ใบ.id}"]`).click();
  const ต่าง = page.locator(หน้าต่าง);
  await expect(ต่าง, `${ชื่อ}: กดรายการ = หน้าต่างรายละเอียดงาน`).toBeVisible({ timeout: 20_000 });
  await expect(ต่าง, `${ชื่อ}: เลขใบในหน้าต่าง`).toContainText(ใบ.id);
  await expect(ต่าง.getByText("รูปแปลน / ไฟล์แนบของงาน", { exact: true }), `${ชื่อ}: มีส่วนรูปแปลน/ไฟล์ของงาน`).toBeVisible();
  await expect(ต่าง.locator(`[data-purchase-file="${ไฟล์ทดสอบ}"]`), `${ชื่อ}: ไฟล์ของงานขึ้นในหน้าต่าง`).toBeVisible({ timeout: 20_000 });
  return ต่าง;
}

test("[ui·hq] แผงลูกค้า HQ: แท็บ ข้อมูลลูกค้า · บันทึก · ประวัติการซื้อ · ประวัติ (ไม่มีอาคารที่ซื้อ) · กดรายการเห็นรายละเอียดงาน + รายการที่ซื้อ + ไฟล์", async ({ page }) => {
  const errs = watchErrors(page);
  await loginUI(page, HQ_ORIGIN, "/hq/customers", ADMIN);
  await settle(page);
  await (await แถวตามชื่อ(page, `เปิดรายละเอียดลูกค้า ${ตั้งต้น.ลูกค้าRYG}`, ตั้งต้น.ลูกค้าRYG, /ค้นหาชื่อลูกค้า/)).click();
  const แผง = page.locator("[data-row-panel]").last();
  await expect(แผง).toBeVisible({ timeout: 20_000 });
  const แท็บ = (await แผง.locator("[data-panel-tab]").allInnerTexts()).map(t => t.replace(/\s*\(?\d+\)?$/, "").trim());
  expect(แท็บ, "ลำดับแท็บ HQ (อาคารที่ซื้อ → ประวัติการซื้อ ตำแหน่งเดิม · แท็บเดียว)").toEqual(["ข้อมูลลูกค้า", "บันทึก", "ประวัติการซื้อ", "ประวัติ"]);
  await แผง.locator("[data-panel-tab='purchases']").click();
  const ต่าง = await ตรวจรายการและหน้าต่าง(page, แผง, "HQ", "[role=dialog][aria-label^='รายละเอียดงาน ']");
  const ใบ = ใบตอบรับ.find(q => q.deal_id != null) ?? ใบตอบรับ[0];
  await expect(ต่าง.locator("[data-purchase-items] tbody tr"), "HQ: รายการที่ซื้อ = รายการในใบ").toHaveCount((ใบ.line_items ?? []).length);
  assertNoErrors(errs, "ประวัติการซื้อ HQ");
});

test("[ui·ดีลเลอร์] แผงลูกค้าดีลเลอร์: แท็บ ข้อมูลลูกค้า · ประวัติการซื้อ · เพิ่มงานขายใหม่ · กดรายการเห็นหน้าต่างงาน + ไฟล์ของงาน", async ({ page }) => {
  const errs = watchErrors(page);
  await loginUI(page, DEALER_ORIGIN, "/customers", RYG);
  await settle(page);
  await (await แถวตามชื่อ(page, `เปิดรายละเอียดลูกค้า ${ตั้งต้น.ลูกค้าRYG}`, ตั้งต้น.ลูกค้าRYG, /ค้นหาลูกค้า,/)).getByRole("button", { name: "ดูรายละเอียด", exact: true }).click();
  const แผง = page.locator("[data-row-panel]").last();
  await expect(แผง).toBeVisible({ timeout: 20_000 });
  await expect(แผง.getByRole("button", { name: `ประวัติการซื้อ (${ใบตอบรับ.length})`, exact: true }), "ดีลเลอร์มีแท็บประวัติการซื้อ").toBeVisible();
  // ลำดับแท็บ = ตำแหน่งซ้าย→ขวาของปุ่มแท็บ (ชื่อตรงตัว)
  const ตำแหน่ง: number[] = [];
  for (const ชื่อ of ["ข้อมูลลูกค้า", `ประวัติการซื้อ (${ใบตอบรับ.length})`, "เพิ่มงานขายใหม่"]) ตำแหน่ง.push((await แผง.getByRole("button", { name: ชื่อ, exact: true }).boundingBox())!.x);
  expect(ตำแหน่ง, "ลำดับแท็บดีลเลอร์: ข้อมูลลูกค้า · ประวัติการซื้อ · เพิ่มงานขายใหม่").toEqual([...ตำแหน่ง].sort((a, b) => a - b));
  await แผง.getByRole("button", { name: `ประวัติการซื้อ (${ใบตอบรับ.length})`, exact: true }).click();
  await ตรวจรายการและหน้าต่าง(page, แผง, "ดีลเลอร์", "[data-doc-window='customer-job']");
  assertNoErrors(errs, "ประวัติการซื้อ ดีลเลอร์");
});
