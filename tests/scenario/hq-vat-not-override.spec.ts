import { test, expect } from "@playwright/test";
import { ADMIN, RYG, skipReason } from "./supabaseEnv";
import { DEALER_ORIGIN, loginUI, watchErrors, assertNoErrors, db } from "./funcHelpers";

// ── HQ แก้ VAT ของเครือ แล้วต้องไม่ทับค่าที่สาขาตั้งเอง (ย้ายจาก func-hq.spec.ts · 29 ต.ค. 69 · คิวข้อ 3) ─────────────
//   ข้อนี้แก้ hq_policy.vat (แถวเดียวทั้งระบบ) ชั่วคราว — รันในช่วง hq-settings (ทีละไฟล์ · playwright.config.ts)
//   เดิมอยู่ในช่วง chromium: ข้ออื่นที่ออกใบพร้อมกันเห็น VAT ของเครือเป็น 10 ระหว่างนั้น
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(240_000);

test("[func·hq→dealer] สำนักงานใหญ่แก้ VAT แล้วต้องไม่ทับค่าที่สาขาตั้งเอง", async ({ page }) => {
  const errs = watchErrors(page);
  const sb = await db(ADMIN);
  const { data: before } = await sb.from("hq_policy").select("vat").eq("id", 1).maybeSingle();
  const origVat = (before?.vat as number) ?? 7;
  const newVat = origVat === 7 ? 10 : 7;

  // ค่าที่สาขา RYG ตั้งไว้เอง — คือค่าที่ต้องเห็นบนหน้าจอดีลเลอร์เสมอ
  const dealerSb = await db(RYG);
  const { data: ds } = await dealerSb.from("dealer_settings").select("document").eq("dealer_code", "RYG").maybeSingle();
  const vatของสาขา = (ds?.document as { vatPercent?: number } | null)?.vatPercent ?? 7;

  try {
    const up = await sb.from("hq_policy").update({ vat: newVat }).eq("id", 1).select();
    expect(up.error, `HQ แก้ VAT ไม่ได้: ${JSON.stringify(up.error)}`).toBeNull();

    await loginUI(page, DEALER_ORIGIN, "/login", RYG);
    await page.goto(`${DEALER_ORIGIN}/settings`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "ตั้งค่าใบเสนอราคา" }).first().click();

    // ค่าอยู่ในช่องกรอก ไม่ใช่ข้อความในหน้า — ต้องอ่านจากช่องโดยตรง
    const ช่องVat = page.getByLabel("ภาษีมูลค่าเพิ่ม %");
    await expect(ช่องVat, "หน้าตั้งค่าของดีลเลอร์ต้องโหลดเสร็จ").toBeVisible({ timeout: 20_000 });
    await expect(ช่องVat, "ต้องเห็น VAT ของสาขาตัวเอง ไม่ใช่ค่าที่สำนักงานใหญ่เพิ่งเปลี่ยน")
      .toHaveValue(String(vatของสาขา), { timeout: 20_000 });

    assertNoErrors(errs, "VAT ของสาขาไม่ถูกสำนักงานใหญ่ทับ");
  } finally {
    await sb.from("hq_policy").update({ vat: origVat }).eq("id", 1);
  }
});
