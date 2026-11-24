// ── "อื่น ๆ (ระบุ)" ต้องเห็นตรงกันทั้งสองฝั่ง (บอสสั่ง 21 ส.ค. 69) ─────────────────
//
// ฝั่งดีลเลอร์มีปุ่ม "อื่น ๆ" ให้พิมพ์เหตุผลเองอยู่แล้ว แต่หน้าตั้งค่าของสำนักงานใหญ่ไม่โชว์
// ผู้ดูแลจึงนึกว่าดีลเลอร์เลือกได้แค่รายการที่ตั้งไว้ — สองฝั่งเข้าใจไม่ตรงกัน
//
// 24 พ.ย. 69 (บอสตัดสิน 23 พ.ย. 69 ข้อ 14 · ใบ 0301): เหตุผลปิดไม่สำเร็จย้ายไปรายการกลาง lead_lost_reason (ตั้งค่า › รายการกลาง)
//   แท็บขั้นการขายมาตรฐานไม่มีช่องแก้รายการเหตุผลแล้ว (เหลือบรรทัดบอกทาง) · "อื่น ๆ (ระบุ)" = ตัวเลือกระบุเอง เก็บ "other:ข้อความ"
// ⚠️ "อื่น ๆ" ต้องไม่ถูกเก็บลอย ๆ — ไม่งั้นเหตุผลที่บันทึกจะกลายเป็นคำว่า "อื่น ๆ" ทุกใบ รายงานจะวิเคราะห์ไม่ได้
import { test, expect } from "@playwright/test";
import { ADMIN, skipReason } from "./supabaseEnv";
import { settle, เลือกตัวกรอง } from "./helpers";
import { db, loginUI, DEALER_ORIGIN, HQ_ORIGIN } from "./funcHelpers";
import { สร้างสาขาของข้อ } from "./ownDealer";
import { รันSQLในฐาน } from "./localDb";

test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(180_000);

test("[ui·hq] หน้าตั้งค่า › รายการกลาง มีเหตุผลปิดการขายไม่สำเร็จ + 'อื่น ๆ (ระบุ)' · แท็บขั้นการขายไม่มีช่องแก้ซ้ำ", async ({ page }) => {
  await loginUI(page, HQ_ORIGIN, "/hq/settings", ADMIN);
  await page.locator(".tab-bar").getByRole("button", { name: "ขั้นการขายมาตรฐาน", exact: true }).click({ timeout: 25_000 });
  await expect(page.locator("[data-lost-reasons-moved]"), "แท็บขั้นการขาย = บรรทัดบอกทางไปรายการกลาง").toContainText("รายการกลาง", { timeout: 20_000 });
  await expect(page.getByPlaceholder("เพิ่มเหตุผล…", { exact: true }), "ไม่มีช่องแก้รายการเหตุผลชุดเดิม").toHaveCount(0);
  await page.locator(".tab-bar").getByRole("button", { name: "รายการกลาง", exact: true }).click();
  const รายการ = page.locator('[data-option-list="lead_lost_reason"]');
  await expect(รายการ, "มีรายการเหตุผลปิดการขายไม่สำเร็จ").toHaveCount(1, { timeout: 20_000 });
  await expect(รายการ.getByRole("textbox", { name: "ชื่อตัวเลือก “อื่น ๆ (ระบุ)”", exact: true }), "อื่น ๆ (ระบุ) อยู่ในรายการเหมือนตัวอื่น").toHaveValue("อื่น ๆ (ระบุ)");
});

test("[func] ตัวเลือก 'อื่น ๆ (ระบุ)' = กดแล้วพิมพ์เอง · ไม่เก็บคำว่าอื่น ๆ ลอย ๆ ลงฐานข้อมูล", async ({ page }) => {
  const sb = await db(ADMIN);
  const { data } = await sb.from("option_lists").select("code, free_text").eq("list", "lead_lost_reason").eq("code", "other").maybeSingle();
  expect(data, "รายการกลางในฐานต้องมีตัวเลือกระบุเอง").toEqual({ code: "other", free_text: true });

  // ลูกค้าเป้าหมายที่ยังเปิดอยู่ของสาขาของข้อ (บอสสั่ง 12 พ.ย. 69) — เดิมไล่ 5 แถวแรกของ RYG หาแถวที่กดปิดไม่สำเร็จได้
  //   แถวแรกของ RYG เป็นของข้ออื่นที่รันพร้อมกันได้ (ขั้นอื่น/ถูกลบระหว่างเปิด) → ตก "ขาดข้อมูล"
  const ส = await สร้างสาขาของข้อ();
  try {
    const เลข = 1_970_000_000 + Math.floor(Math.random() * 400_000) * 10, ชื่อ = `ZZTEST เหตุผลอื่นๆ ${ส.รหัส}`;
    expect((await (await db(ส.บัญชี)).from("leads").insert({ id: `#L-${เลข}`, num_id: เลข, dealer_code: ส.รหัส, company: ชื่อ, name: ชื่อ,
      contact: "ผู้ทดสอบ", phone: "000-000-0310", province: "ตราด", status: "BULLET" })).error, "ลูกค้าเป้าหมายของข้อ").toBeNull();
    await loginUI(page, DEALER_ORIGIN, "/login", ส.บัญชี);
    await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" }); await settle(page);
    await page.getByRole("row", { name: `เปิดรายละเอียดลูกค้าเป้าหมาย ${ชื่อ}`, exact: true }).locator("td").first().click();
    // รอบ 4: ปิดไม่สำเร็จอยู่ที่กล่อง "ขั้นต่อไป" ที่เดียว (แท็บงาน/ปุ่มไม่ได้งานเอาออก)
    const ปุ่ม = page.getByRole("status", { name: "ขั้นต่อไป" }).getByRole("button", { name: "ปิดไม่สำเร็จ", exact: true });
    await expect(ปุ่ม, "ลูกค้าเป้าหมายที่ยังเปิดอยู่กดปิดไม่สำเร็จได้").toBeEnabled({ timeout: 20_000 });
    await ปุ่ม.click();

    // ต้องมีปุ่มเดียว ไม่ใช่สองปุ่มซ้ำกัน (ตัวในรายการ + ตัวที่ระบบเติมให้)
    const ปุ่มอื่นๆ = page.locator("[data-lost-picker]").getByRole("button", { name: "อื่น ๆ (ระบุ)", exact: true });
    await expect(ปุ่มอื่นๆ, "ต้องมีปุ่มเดียว ไม่ซ้ำ").toHaveCount(1);
    await expect(page.getByRole("button", { name: "อื่นๆ (ระบุเอง)", exact: true }), "ไม่มีปุ่มชุดเดิมเติมซ้ำ").toHaveCount(0);

    // กดแล้วต้องเปิดช่องพิมพ์ ไม่ใช่เลือกคำว่า "อื่น ๆ" ไปบันทึกตรง ๆ
    await ปุ่มอื่นๆ.click();
    await expect(page.getByPlaceholder("พิมพ์เหตุผล…", { exact: true }), "กดแล้วต้องให้พิมพ์เหตุผลเอง").toBeVisible({ timeout: 10_000 });

    // ยังไม่พิมพ์ = ปุ่มยืนยันต้องกดไม่ได้ (กัน "อื่น ๆ" ลอย ๆ หลุดลงฐานข้อมูล)
    await expect(page.getByRole("button", { name: "ยืนยันปิดการขาย", exact: true }),
      "ยังไม่พิมพ์เหตุผล ต้องกดยืนยันไม่ได้").toBeDisabled();
  } finally { await ส.ลบ(); }
});

// ── HQ ตารางลูกค้าเป้าหมายทั้งเครือ: เหตุผลแสดงชื่อจากรายการกลาง (บอสตัดสิน 23 พ.ย. 69 ข้อ 14 · ใบ 0301) ──
//   ลีดของข้อ 2 ราย (ใส่ตรงที่ฐาน ปิดตัวดัก = แบบข้อมูลเก่าก่อนใบ 0301): รหัสในรายการ (budget) · ข้อความเดิมที่ไม่ตรงรายการ
//   ตกบนโค้ดเดิม (e2b941e1): ตารางขึ้นรหัส/ข้อความดิบ ("budget") แทนชื่อ
test("[ui·hq] ตารางลูกค้าเป้าหมายทั้งเครือ: เหตุผลปิดไม่สำเร็จ = ชื่อในรายการกลาง · ข้อความเดิม = อื่น ๆ: ข้อความ", async ({ page }) => {
  const ส = await สร้างสาขาของข้อ();
  try {
    const ฐาน = 1_970_500_000 + Math.floor(Math.random() * 400_000) * 10, ชื่อ = `ZZTEST เหตุผลกลาง ${ส.รหัส}`;
    const ผล = รันSQLในฐาน(`set local session_replication_role = replica;
      insert into public.leads (id, num_id, dealer_code, company, name, contact, phone, province, status, lost_reason, created_date) values
        ('#L-${ฐาน + 1}', ${ฐาน + 1}, '${ส.รหัส}', '${ชื่อ}-1', '${ชื่อ}-1', 'ผู้ทดสอบ', '000-000-0321', 'ตราด', 'CANCELLED', 'budget', current_date),
        ('#L-${ฐาน + 2}', ${ฐาน + 2}, '${ส.รหัส}', '${ชื่อ}-2', '${ชื่อ}-2', 'ผู้ทดสอบ', '000-000-0322', 'ตราด', 'CANCELLED', 'ลูกค้าเลื่อนโครงการ', current_date);
      set local session_replication_role = origin;`);
    if (ผล === null) throw new Error("ไม่พบฐานทดสอบในเครื่อง (docker) — วางข้อมูลของข้อไม่ได้");
    await loginUI(page, HQ_ORIGIN, "/hq/leads", ADMIN);
    await settle(page);
    // ตารางตั้งต้น = กำลังดำเนินการ (ขั้น 1–4) → เลือกขั้น "ปิดไม่สำเร็จ" (ค่า 7 · เข้ามาในช่วง 1 ปี)
    await เลือกตัวกรอง(page, "ขั้น", { ค่า: "7" });
    await page.getByLabel("ค้นหาลูกค้าเป้าหมาย", { exact: true }).fill(ชื่อ);
    const แถว = (i: number) => page.getByRole("row").filter({ hasText: `${ชื่อ}-${i}` });
    await expect(แถว(1), "รหัสในรายการ = ชื่อ").toContainText("งบประมาณไม่พร้อม", { timeout: 25_000 });
    await expect(แถว(1)).not.toContainText("budget");
    await expect(แถว(2), "ข้อความเดิม = อื่น ๆ: ข้อความ").toContainText("อื่น ๆ: ลูกค้าเลื่อนโครงการ");
  } finally { await ส.ลบ(); }
});