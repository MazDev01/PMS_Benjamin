import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { open } from "./helpers";
import { ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY } from "./adminEnv";

/** กดแท็บในลิ้นชัก แล้วรอให้เนื้อหาแท็บนั้นโผล่จริง
 *  ลิ้นชักเรนเดอร์ใหม่ทุกครั้งที่ข้อมูลเปลี่ยน ปุ่มเดิมจึงหลุดจากหน้าได้ระหว่างกด
 *  (เจอตอนรันชุดทดสอบ 3 ก.ย. 69 — คลิกแรกตกหาย ต้องลองซ้ำ) */
async function กดแท็บ(page: Page, ชื่อ: string, สิ่งที่ต้องเห็น: RegExp) {
  await expect(async () => {
    await page.getByRole("button", { name: ชื่อ, exact: true }).first().click({ timeout: 5_000 });
    await expect(page.getByText(สิ่งที่ต้องเห็น).first()).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 40_000 });
}


// ─── งาน "นัดหมาย" ในรายการสิ่งที่ต้องทำ ────────────────────────────────────────
// ติ๊กเองไม่ได้ถ้ายังไม่มีนัดจริง — ต้องพาไปลงนัดก่อน แล้วระบบค่อยติ๊กให้เอง
// (บอสทัก 25 ส.ค. 69: กดติ๊กแล้วไม่มีอะไรเกิดขึ้น เพราะฟอร์มไปเปิดในแท็บที่ยังไม่ได้เปิดดู)

test("[func·dealer] งานนัดหมายติ๊กเองไม่ได้ (ระบบติ๊กให้เมื่อบันทึกนัด) · ยังไม่มีนัด = ไม่ติ๊กทั้งจอและฐาน", async ({ page }) => {
  test.setTimeout(120_000);   // ต้องไล่เปิดลูกค้าเป้าหมายหลายรายกว่าจะเจอรายที่มีงานนัดหมายให้กด
  // ── เลือกลูกค้าเป้าหมายที่ "ยังไม่มีนัด" จากฐานข้อมูลตรง ๆ ────────────────────────
  //
  // เดิมไล่เปิดทีละรายจากหน้าจอ แล้วหวังว่าใน 5 รายแรกจะมีสักรายที่ยังไม่มีนัด
  //   ข้อมูลตั้งต้นเปลี่ยนเมื่อไหร่ก็ตกทันที (เจอจริง 1 ก.ย. 69 ตอนย้ายมารันฐานในเครื่อง:
  //   รายแรก ๆ เป็นดีลที่ปิดไปแล้ว ปุ่มงานถูกล็อก · อีกรายมีนัดอยู่แล้ว จึงไม่มีแถบเตือนให้ตรวจ)
  // ตอนนี้ถามฐานข้อมูลก่อนว่า "รายไหนยังไม่มีนัดและยังไม่ปิดการขาย" แล้วเปิดรายนั้นตรง ๆ
  // ── สร้างลูกค้าเป้าหมายของเทสต์เอง ────────────────────────────────────────────
  //
  // เดิมยืมข้อมูลตั้งต้นมาใช้ แล้วหวังว่าจะมีสักรายที่ "ยังไม่มีนัด + อยู่ขั้นที่มีงานนัดหมาย"
  //   ข้อมูลตั้งต้นเปลี่ยนเมื่อไหร่ก็ตกทันที (เจอจริง 1 ก.ย. 69 ตอนย้ายมารันฐานในเครื่อง:
  //   รายที่หยิบได้เป็นดีลที่ปิดไปแล้วบ้าง มีนัดอยู่แล้วบ้าง จนไม่เหลือรายที่วัดได้)
  // ตอนนี้เทสต์สร้างรายของตัวเองที่ขั้น "ทำใบเสนอราคา" (BULLET) ซึ่งเป็นขั้นที่มีงานนัดหมาย
  //   และไม่มีนัดแน่นอน → วัดสิ่งที่ตั้งใจวัดได้ทุกครั้ง
  const admin = createClient(ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const ID = 991_500_777, NUM = 800_777;
  await admin.from("appointments").delete().eq("lead_id", NUM);
  await admin.from("leads").delete().eq("id", ID);
  const { error: insErr } = await admin.from("leads").insert({
    id: ID, num_id: NUM, dealer_code: "RYG", name: "ZZTEST-APPT ทดสอบงานนัดหมาย",
    company: "ZZTEST-APPT ทดสอบงานนัดหมาย", contact: "คุณทดสอบ", phone: "081-000-0777",
    email: "appt@example.co.th", province: "ระยอง", product: "โรงงาน", category: "โรงงาน",
    status: "BULLET", value: "1000000", area: "300", assigned: "ทดสอบระบบ", source: "โทรเข้า",
  });
  expect(insErr, `สร้างลูกค้าเป้าหมายสำหรับทดสอบไม่สำเร็จ: ${insErr?.message ?? ""}`).toBeNull();

  try {
    // เปิดจากหน้าจอจริง (ค้นชื่อแล้วกดดูรายละเอียด) — ไม่ใช้ ?open= เพราะพารามิเตอร์นั้นทำงาน
    // ตั้งแต่ตอนโหลดหน้า ถ้ารายการยังโหลดไม่เสร็จจะหาไม่เจอแล้วขึ้น "ไม่พบลูกค้าเป้าหมายรายนี้"
    await open(page, "dealer", "/leads");
    await page.getByPlaceholder(/ค้นหา/).first().fill("ZZTEST-APPT");
    await page.waitForTimeout(800);
    await page.getByRole("button", { name: "ดูรายละเอียด" }).first().click();
    // รอบ 4 (บอสสั่ง 21 ต.ค. 69): รายการงานเป็นรายการเตือนในแท็บ "ประวัติ" · งานนัดหมาย = ช่องที่ระบบติ๊กให้เมื่อบันทึกนัดจริง
    //   กดติ๊กเองไม่ได้อีกต่อไป (ไม่ต้องพาไปฟอร์มแล้ว) — ช่องบอกวิธีไว้ในตัว · ตรวจว่ากดแล้วไม่ติ๊กทั้งบนจอและในฐาน
    await กดแท็บ(page, "ภาพรวม", /งานในแต่ละขั้น/);   // งานในแต่ละขั้น + นัดหมาย อยู่แท็บภาพรวม (28 ต.ค. 69)
    for (let i = 0, พับ = page.locator("[data-lead-tasks] button[aria-expanded='false']"); i < 5 && await พับ.count(); i++) await พับ.first().click();   // กางทุกขั้น (ขั้นอื่นพับไว้ · 28 ต.ค. 69)

    const งานนัด = page.locator('[role="checkbox"]').filter({ hasText: "นัดหมาย" }).first();
    await expect(งานนัด, "ขั้นนี้ต้องมีงานนัดหมายในรายการเตือน").toBeVisible({ timeout: 20_000 });
    await expect(งานนัด, "งานนัดหมายเป็นช่องที่ระบบติ๊กให้").toHaveAttribute("data-auto-task", "1");
    await expect(งานนัด, "ติ๊กเองไม่ได้").toBeDisabled();
    await expect(งานนัด, "บอกวิธีให้ติ๊ก: บันทึกนัดหมาย").toContainText("ระบบติ๊กให้เมื่อบันทึกนัดหมาย");
    await งานนัด.click({ force: true });
    await page.waitForTimeout(800);
    // ช่องงานนัดหมายต้องยังไม่ถูกติ๊ก — ติ๊กได้ต่อเมื่อมีนัดจริงเท่านั้น
    await expect(งานนัด, "ยังไม่มีนัดจริง ห้ามติ๊กงานให้").toHaveAttribute("aria-checked", "false");
    const { data } = await admin.from("leads").select("tasks").eq("id", ID).single();
    const งาน = (data?.tasks ?? []) as { key: string; label: string; done: boolean }[];
    expect(งาน.some(t => (t.key === "appointment" || t.label.includes("นัด")) && t.done), "ฐาน: งานนัดหมายยังไม่เสร็จ").toBe(false);
    // ลงนัดได้ที่กล่องนัดหมายในแท็บเดียวกัน (ทางเดียว)
    await expect(page.getByRole("button", { name: /เพิ่มนัดหมาย/ }), "ทางลงนัดอยู่ในแท็บประวัติ").toBeVisible();
  } finally {
    await admin.from("appointments").delete().eq("lead_id", NUM);
    await admin.from("leads").delete().eq("id", ID);
  }
});
