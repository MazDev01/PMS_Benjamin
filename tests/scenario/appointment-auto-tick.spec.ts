import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY } from "./adminEnv";
import { open } from "./helpers";

/** กดแท็บในลิ้นชัก แล้วรอให้เนื้อหาแท็บนั้นโผล่จริง
 *  ลิ้นชักเรนเดอร์ใหม่ทุกครั้งที่ข้อมูลเปลี่ยน ปุ่มเดิมจึงหลุดจากหน้าได้ระหว่างกด
 *  (เจอตอนรันชุดทดสอบ 3 ก.ย. 69 — คลิกแรกตกหาย ต้องลองซ้ำ) */
async function กดแท็บ(page: Page, ชื่อ: string, สิ่งที่ต้องเห็น: RegExp) {
  await expect(async () => {
    await page.getByRole("button", { name: ชื่อ, exact: true }).first().click({ timeout: 5_000 });
    await expect(page.getByText(สิ่งที่ต้องเห็น).first()).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 40_000 });
}


// บันทึกนัดหมายจริงแล้ว งาน "นัดหมาย" ต้องถูกติ๊กให้เองทันที (บอสสั่ง 3 ก.ย. 69)
// คู่กับ appointment-task-gate.spec.ts ที่กันไม่ให้ติ๊กเองตอนยังไม่มีนัด — สองใบนี้ต้องอยู่ด้วยกัน
test("[func·dealer] บันทึกนัดหมาย → ระบบติ๊กงาน 'นัดหมาย' ให้เอง", async ({ page }) => {
  test.setTimeout(150_000);
  const admin = createClient(ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const ID = 991_500_778, NUM = 800_778;
  await admin.from("appointments").delete().eq("lead_id", NUM);
  await admin.from("leads").delete().eq("id", ID);
  const { error: insErr } = await admin.from("leads").insert({
    id: ID, num_id: NUM, dealer_code: "RYG", name: "ZZTEST-APPT2 ติ๊กงานนัดหมาย",
    company: "ZZTEST-APPT2 ติ๊กงานนัดหมาย", contact: "คุณทดสอบ", phone: "081-000-0778",
    email: "appt2@example.co.th", province: "ระยอง", product: "โรงงาน", category: "โรงงาน",
    status: "BULLET", value: "1000000", area: "300", assigned: "ทดสอบระบบ", source: "โทรเข้า",
  });
  expect(insErr, `สร้างลูกค้าเป้าหมายสำหรับทดสอบไม่สำเร็จ: ${insErr?.message}`).toBeNull();

  try {
    await open(page, "dealer", "/leads");
    await page.getByPlaceholder(/ค้นหา/).first().fill("ZZTEST-APPT2");
    await page.waitForTimeout(900);
    await page.getByRole("button", { name: "ดูรายละเอียด" }).first().click();

    // รอบ 4: รายการเตือน (งาน) + นัดหมาย อยู่ในแท็บ "ประวัติ" แท็บเดียว — งานนัดหมายเป็นช่องที่ระบบติ๊กให้
    const งานนัด = page.locator('[role="checkbox"][data-auto-task]').filter({ hasText: "นัดหมาย" }).first();
    // ก่อนลงนัด: งานนัดหมายต้องยังไม่ถูกติ๊ก
    await กดแท็บ(page, "ภาพรวม", /งานในแต่ละขั้น/);   // งานในแต่ละขั้น + นัดหมาย อยู่แท็บภาพรวม (28 ต.ค. 69)
    for (let i = 0, พับ = page.locator("[data-lead-tasks] button[aria-expanded='false']"); i < 5 && await พับ.count(); i++) await พับ.first().click();   // กางทุกขั้น (ขั้นอื่นพับไว้ · 28 ต.ค. 69)

    await expect(งานนัด).toBeVisible({ timeout: 20_000 });
    await expect(งานนัด, "ยังไม่มีนัด ห้ามติ๊กมาก่อน").toHaveAttribute("aria-checked", "false");

    // ลงนัดจริงจากกล่องนัดหมายในแท็บประวัติ
    await page.getByRole("button", { name: /เพิ่มนัดหมาย|\+ ลงนัด|ลงนัด/ }).first().click().catch(() => {});
    await expect(page.getByLabel("ประเภทนัดหมาย")).toBeVisible({ timeout: 15_000 });
    // ต้องเลือกประเภทก่อน — ช่องเริ่มที่ "ยังไม่ระบุ" ตามกติกาของทั้งระบบ
    await page.getByLabel("ประเภทนัดหมาย").selectOption({ label: "นัดพบลูกค้า" });
    await page.getByRole("button", { name: /บันทึกนัดหมาย/ }).click();

    // ช่องในรายการงานต้องขึ้นเป็นติ๊กแล้ว (หลักฐานบนหน้าจอที่อยู่ถาวร
    //  — แถบข้อความแจ้งเตือนหายเองใน ~2 วินาที จึงไม่เอามาเป็นตัวชี้ขาด)
    await expect(งานนัด, "งานนัดหมายต้องขึ้นเป็นติ๊กแล้วบนหน้าจอ").toHaveAttribute("aria-checked", "true", { timeout: 20_000 });

    // และงานในรายการต้องขึ้นเป็นเสร็จจริง (อ่านจากฐานข้อมูล ไม่ใช่แค่หน้าจอ)
    await expect.poll(async () => {
      const { data } = await admin.from("leads").select("tasks").eq("id", ID).single();
      const tasks = (data?.tasks ?? []) as { key: string; label: string; done: boolean }[];
      return tasks.some(t => (t.key === "appointment" || t.label.includes("นัด")) && t.done);
    }, { timeout: 20_000, message: "งานนัดหมายต้องถูกติ๊กในฐานข้อมูล" }).toBe(true);
  } finally {
    await admin.from("appointments").delete().eq("lead_id", NUM);
    await admin.from("leads").delete().eq("id", ID);
  }
});
