import { test, expect } from "@playwright/test";
import { ADMIN, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { HQ_ORIGIN, db, loginUI } from "./funcHelpers";
import { adminClient } from "./testDealers";
import { settle } from "./helpers";
import { สร้างสาขาของข้อ, type สาขาของข้อ } from "./ownDealer";
import { เตรียมใบHQ, ทำใบลูกค้าจากใบHQ, ล้างใบHQทดสอบ } from "./hqQuoteFixture";

// ── /hq/quotations คอลัมน์ "จังหวัด" (จังหวัดหน้างาน) ต้องไม่เป็น "—" เมื่อใบมีจังหวัด (แก้ด่วน 11 พ.ย. 69 · บอสสั่ง "ตารางอ่านผิด แก้ด่วน") ─────
//   เดิม: ตารางหาจังหวัดจากรายการลีดในเครื่อง แต่ HQ โหมดฐานจริงไม่โหลดลีดทั้งเครือ (SalesContext gateHQ) → "—" ทุกใบ ทั้งที่ใบมีจังหวัดครบ
//   ตอนนี้: ใช้จังหวัดที่ใบเก็บในฐาน (quotations.province · มากับแถวใบ) — lib/hqQuotations.ts จังหวัดหน้างาน
//   1) ใบของสาขาของข้อ (ทำจากใบ HQ แบบหน้าจอดีลเลอร์ · จังหวัดจากลีด = ตราด) → แถวขึ้น "ตราด"
//   2) ทุกแถวในหน้าแรกของตาราง: ใบที่ฐานมีจังหวัด → ขึ้นจังหวัดนั้น ไม่ใช่ "—"
//   ตกบนโค้ดเดิม: ทั้ง 2 ข้อขึ้น "—"
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.setTimeout(180_000);

const admin = adminClient();
let ส: สาขาของข้อ;
let เลขใบ = "", เลขลีด = 0;
const บริษัท = () => `ZZTEST จังหวัดหน้างาน ${ส.รหัส}`;

test.beforeAll(async () => {
  ส = await สร้างสาขาของข้อ({ จังหวัด: "ตราด", ภาค: "ตะวันออก", ชื่อ: "ZZTEST สาขาจังหวัดหน้างาน (ลบทิ้ง)" });
  // ข้อมูลบริษัทผู้ออกใบครบ (ส่งใบให้ลูกค้าต้องครบ · ใบ 0247) — แบบเดียวกับ lead-stage-four.spec.ts
  const sd = await db(ส.บัญชี);
  expect((await sd.from("dealer_settings").upsert({ dealer_code: ส.รหัส, issuer: { company: "ZZTEST บริษัทจังหวัดหน้างาน", address: "1 ถนนทดสอบ ตราด",
    phone: "000-000-0504", taxId: "0-0000-00000-00-0", email: "", website: "" } }, { onConflict: "dealer_code" })).error, "ผู้ออกใบ").toBeNull();
  const ใบHQ = await เตรียมใบHQ(ส.บัญชี, { dealerCode: ส.รหัส, company: บริษัท(), province: "ตราด", lines: [{ name: "งานตามสัญญา", qty: 1, unit: "งาน", unitCost: 500_000 }] });
  เลขลีด = ใบHQ.leadNum;
  // หน้าจอดีลเลอร์ส่งจังหวัดของลีดไปกับใบ (LeadQuotationsPanel · ฟอร์มทำใบ) — ทำแบบเดียวกัน
  const ใบ = await ทำใบลูกค้าจากใบHQ(ส.บัญชี, ใบHQ, { customer: บริษัท(), status: "sent_to_client", extra: { province: "ตราด" } });
  เลขใบ = ใบ.id;
});
test.afterAll(async () => { if (ส) { ล้างใบHQทดสอบ(ส.รหัส, [เลขลีด]); await ส.ลบ(); } });

test("[HQ] ใบทั้งเครือ: คอลัมน์จังหวัด = จังหวัดที่ใบเก็บในฐาน ไม่ใช่ \"—\" ทุกใบ", async ({ page }) => {
  const { data: ในฐาน } = await admin.from("quotations").select("province").eq("dealer_code", ส.รหัส).eq("id", เลขใบ).single();
  expect((ในฐาน as { province: string | null })?.province, "ฐานเก็บจังหวัดในใบ").toBe("ตราด");

  await loginUI(page, HQ_ORIGIN, "/hq/quotations", ADMIN);
  await settle(page);
  // 2) ทุกแถวหน้าแรก (ก่อนค้น): ใบที่ฐานมีจังหวัด → ขึ้นจังหวัดนั้น
  const แถว = page.locator("tbody tr").filter({ has: page.locator("[data-quote-no]") });
  await expect(แถว.first(), "มีใบในตาราง").toBeVisible({ timeout: 30_000 });
  const บนจอ = await แถว.evaluateAll(trs => trs.map(tr => ({
    เลข: tr.querySelector("[data-quote-no]")?.textContent?.trim() ?? "",
    จังหวัด: tr.querySelector("[data-col='site-province']")?.textContent?.trim() ?? "(ไม่มีคอลัมน์)",
  })));
  const { data: ของฐาน } = await admin.from("quotations").select("id, province").in("id", บนจอ.map(x => x.เลข));
  const จังหวัดฐาน = new Map<string, string>();
  for (const r of (ของฐาน ?? []) as { id: string; province: string | null }[]) if ((r.province ?? "").trim()) จังหวัดฐาน.set(r.id, r.province!.trim());
  const มีจังหวัด = บนจอ.filter(x => จังหวัดฐาน.has(x.เลข));
  expect(มีจังหวัด.length, "หน้าแรกมีใบที่ฐานเก็บจังหวัด (ข้อมูลตั้งต้น/ใบของข้อ)").toBeGreaterThan(0);
  const ผิด = มีจังหวัด.filter(x => x.จังหวัด !== จังหวัดฐาน.get(x.เลข));
  expect(ผิด, `ทุกแถวที่ใบมีจังหวัด ต้องขึ้นจังหวัดของใบ (ผิด ${ผิด.length}/${มีจังหวัด.length})`).toEqual([]);

  // 1) ใบของข้อ (ค้นด้วยเลขที่) → "ตราด"
  await page.getByPlaceholder("ค้นหาเลขที่ / ลูกค้า / ดีลเลอร์ / รหัสดีลเลอร์...").fill(เลขใบ);
  const ของข้อ = page.locator("tbody tr").filter({ has: page.locator(`[data-quote-no]`, { hasText: เลขใบ }) });
  await expect(ของข้อ, "เจอใบของข้อ").toHaveCount(1, { timeout: 30_000 });
  await expect(ของข้อ.locator("[data-col='site-province']"), "ใบที่ทำผ่านหน้าดีลเลอร์ → จังหวัดหน้างานขึ้น").toHaveText("ตราด");
});
