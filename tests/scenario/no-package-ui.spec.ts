import { test, expect, type Page } from "@playwright/test";
import { ADMIN, RYG, skipReason } from "./supabaseEnv";
import { HQ_ORIGIN, DEALER_ORIGIN, loginUI, watchErrors, assertNoErrors } from "./funcHelpers";
import { settle } from "./helpers";
import { สร้างสาขาของข้อ } from "./ownDealer";
import { รันSQLในฐาน } from "./localDb";
import { buildDealerProposalHTML } from "../../packages/shared/lib/dealerProposalPrint";
import type { DealerPackageProposal, HQCompany } from "../../packages/shared/lib/data/types";

// ── เอาระบบแพ็กเกจออกทั้งหมด (บอสสั่ง 30 ต.ค. 69 · รอบ 1 · ใบ 0267) — กันกลับมา ─────────────────────────────────────
//   หน้า HQ และดีลเลอร์ไม่มีคำว่า แพ็กเกจ / Standard / Premium / Exclusive (รวมหน้าพิมพ์ใบค่าแฟรนไชส์)
//   ออกใบค่าแฟรนไชส์ได้โดยไม่เลือกแพ็กเกจ: hq-proposals · hq-prospects · hq-recruit-settings · franchise-recruit-flow · supabase/tests/package_optional.sql
//   ตกบนโค้ดก่อนรอบนี้: /hq/dealers มีคอลัมน์แพ็กเกจ · /hq/proposals มีตัวกรอง "ทุกแพ็กเกจ" · หน้าพิมพ์มี "แพ็กเกจที่เสนอ"
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(120_000);

const คำต้องห้าม = /แพ็กเกจ|Standard|Premium|Exclusive/;

async function ไม่มีคำแพ็กเกจ(page: Page, ที่: string) {
  await expect(page.locator("h1, h2, [data-kpi-row], table").first(), `${ที่}: หน้าเปิดได้`).toBeVisible({ timeout: 25_000 });
  await settle(page);
  const ข้อความ = await page.locator("body").innerText();
  const เจอ = ข้อความ.match(new RegExp(`.{0,30}(${คำต้องห้าม.source}).{0,30}`, "g")) ?? [];
  expect(เจอ, `${ที่}: ไม่มีคำว่าแพ็กเกจ/Standard/Premium/Exclusive`).toEqual([]);
}

test("[ui·hq] หน้า HQ ไม่มีแพ็กเกจ: ดีลเลอร์ (ตาราง/การ์ด/แผง) · ใบค่าแฟรนไชส์ · ผู้สนใจ · ตั้งค่า › หาดีลเลอร์", async ({ page }) => {
  const errs = watchErrors(page);
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  // สาขาของข้อ (ช่องแพ็กเกจในฐานลบแล้ว · ใบ 0269) → หน้าจอต้องไม่มีคำว่าแพ็กเกจ
  const ก = await สร้างสาขาของข้อ({ ชื่อ: "ZZTEST ดีลเลอร์ข้อมูลเดิม" });
  try {
    for (const ที่ of [`/hq/dealers?view=table`, `/hq/dealers?view=card`, `/hq/dealers/${ก.รหัส}`, "/hq/proposals", "/hq/prospects"]) {
      await page.goto(`${HQ_ORIGIN}${ที่}`, { waitUntil: "domcontentloaded" });
      if (ที่.startsWith("/hq/dealers/")) await expect(page.locator(`[data-dealer-panel="${ก.รหัส}"]`), "แผงดีลเลอร์เปิด").toBeVisible({ timeout: 25_000 });
      if (ที่.startsWith("/hq/dealers?")) { await page.getByPlaceholder(/ค้นหาดีลเลอร์/).fill(ก.รหัส); await expect(page.getByText(ก.รหัส).first()).toBeVisible({ timeout: 20_000 }); }
      await ไม่มีคำแพ็กเกจ(page, ที่);
    }
  } finally { await ก.ลบ(); }
  await page.goto(`${HQ_ORIGIN}/hq/settings`, { waitUntil: "domcontentloaded" });
  await page.locator(".tab-bar").getByRole("button", { name: "หาดีลเลอร์" }).click({ timeout: 25_000 });
  await expect(page.locator("#rc-terms")).toBeVisible({ timeout: 25_000 });
  await ไม่มีคำแพ็กเกจ(page, "/hq/settings › หาดีลเลอร์");
  assertNoErrors(errs, "หน้า HQ ไม่มีแพ็กเกจ");
});

test("[ui·dealer] หน้าดีลเลอร์ไม่มีแพ็กเกจ", async ({ page }) => {
  const errs = watchErrors(page);
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  for (const ที่ of ["/dashboard", "/leads", "/quotations", "/customers", "/settings"]) {
    await page.goto(`${DEALER_ORIGIN}${ที่}`, { waitUntil: "domcontentloaded" });
    await ไม่มีคำแพ็กเกจ(page, ที่);
  }
  assertNoErrors(errs, "หน้าดีลเลอร์ไม่มีแพ็กเกจ");
});

test("[ui·hq] หน้าพิมพ์ใบค่าแฟรนไชส์ไม่มีแพ็กเกจ (ใบเก่าที่มีค่าแพ็กเกจในฐานก็ไม่แสดง)", () => {
  const ใบ = { id: 1, prospectId: 1, proposalNo: "FP-ZZ-0001", province: "ระยอง", region: "ตะวันออก",
    amount: 150000, contractMonths: 12, annualTarget: 2_000_000, terms: "", proposedDate: "2026-10-30", validUntil: null, status: "sent" } as unknown as DealerPackageProposal;
  const html = buildDealerProposalHTML(ใบ, { name: "ZZTEST ผู้สนใจ", phone: "", email: "", province: "ระยอง", social: "" }, { name: "ZZTEST HQ" } as unknown as HQCompany);
  expect(html.replace(/<[^>]+>/g, " ").match(คำต้องห้าม), "หน้าพิมพ์ไม่มีคำว่าแพ็กเกจ/Exclusive").toBeNull();
  expect(html, "ยังมีค่าแรกเข้า (HQ กรอกยอดเอง)").toContain("150,000");
});
