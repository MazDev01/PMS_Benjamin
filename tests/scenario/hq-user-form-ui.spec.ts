import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY } from "./adminEnv";
import { SUPABASE_URL, SUPABASE_ANON, ADMIN } from "./supabaseEnv";
import { HQ_ORIGIN, loginUI } from "./funcHelpers";
import { open, SESSION_KEY } from "./helpers";
import { ป้ายพร้อมดาว } from "./requiredMark";

// ฟอร์ม "เพิ่มผู้ใช้งาน HQ" — ปัญหาที่บอสแจ้ง 3 ก.ย. 69 (พร้อมภาพหน้าจอ):
//   บนโน้ตบุ๊กจอเตี้ย กล่องสูงกว่าจอ หัวกล่องโดนตัดข้างบน ปุ่มบันทึกโดนตัดข้างล่าง กดไม่ได้
//   และเลื่อนก็ไม่ได้ เพราะกล่องไม่มีส่วนที่เลื่อนได้
// พร้อมกันนั้นสั่งแก้ลำดับช่องและสิทธิ์แต่งตั้งบทบาท
// HQ บทบาทเดียว "สำนักงานใหญ่" (บอสสั่ง 5 พ.ย. 69 · ใบ 0282 · ทับข้อ "แผนกตามบทบาท" และ "บทบาทอื่นแต่งตั้งบทบาทไม่ได้"):
//   ไม่มีช่องเลือกบทบาท (แสดง "สำนักงานใหญ่") · แผนก = เลือกจาก 3 ค่า ไม่บังคับ (บอสตอบ 9 พ.ย. 69) · ไม่มีตัวกรอง/คอลัมน์/ตารางสิทธิ์ตามบทบาท
//   บัญชีสำนักงานใหญ่คนสุดท้ายที่ใช้งาน = ปิด/ลบไม่ได้ (ปุ่มปิดพร้อมเหตุผล) · ตกบนโค้ดเดิม: มีช่องเลือกบทบาท · แผนกตามบทบาท · ปิดคนสุดท้ายได้จากเมนู
test.describe("[ui·hq] ฟอร์มเพิ่มผู้ใช้งานสำนักงานใหญ่", () => {
  async function เปิดฟอร์ม(page: Page) {
    await open(page, "hq", "/hq/settings");
    await page.getByRole("button", { name: /^ผู้ใช้งาน/ }).click();
    await page.getByRole("button", { name: /เพิ่มผู้ใช้งาน HQ/ }).click();
    await expect(page.getByRole("dialog", { name: "ฟอร์มผู้ใช้ HQ" })).toBeVisible({ timeout: 15_000 });
  }

  for (const [ชื่อจอ, w, h] of [["จอเตี้ย", 1280, 640], ["โน้ตบุ๊ก", 1512, 760]] as const) {
    test(`${ชื่อจอ} ${w}x${h} — กล่องต้องอยู่ในจอ และปุ่มบันทึกต้องกดได้`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await เปิดฟอร์ม(page);

      const กล่อง = page.getByRole("dialog", { name: "ฟอร์มผู้ใช้ HQ" });
      const b = (await กล่อง.boundingBox())!;
      expect(b.y, "หัวกล่องต้องไม่ถูกตัดข้างบน").toBeGreaterThanOrEqual(0);
      expect(b.y + b.height, "ท้ายกล่องต้องไม่ล้นข้างล่าง").toBeLessThanOrEqual(h);

      // ปุ่มบันทึกต้องเห็นและกดได้จริง (ไม่ใช่แค่มีอยู่ใน DOM)
      const บันทึก = กล่อง.getByRole("button", { name: /บันทึก/ });
      await expect(บันทึก).toBeInViewport();
      // หัวข้อกล่องก็ต้องเห็น
      await expect(กล่อง.getByText(/เพิ่มผู้ใช้งาน HQ/)).toBeInViewport();
      // เนื้อหาที่ยาวเกินต้องเลื่อนได้ในกล่อง ไม่ใช่หายไปเฉย ๆ
      const เลื่อนได้ = await กล่อง.locator(".modal-fit-body").evaluate(el => el.scrollHeight > el.clientHeight ? el.scrollHeight - el.clientHeight : 0);
      if (เลื่อนได้ > 0) {
        await กล่อง.locator(".modal-fit-body").evaluate(el => { el.scrollTop = el.scrollHeight; });
        const ถึงล่างสุด = await กล่อง.locator(".modal-fit-body").evaluate(el => el.scrollTop > 0);
        expect(ถึงล่างสุด, "เนื้อหาที่ล้นต้องเลื่อนดูได้").toBe(true);
      }
    });
  }

  test("ลำดับช่อง — รหัสผ่านชั่วคราวอยู่ใต้อีเมล · บทบาท (แสดงอย่างเดียว) มาก่อนแผนก · กากบาทปิดอยู่กึ่งกลางปุ่ม", async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 900 });
    await เปิดฟอร์ม(page);
    const กล่อง = page.getByRole("dialog", { name: "ฟอร์มผู้ใช้ HQ" });

    // * แดงมาจากตัวกลาง <FieldLabel required> (4 พ.ย. 69 · วาดด้วย CSS ไม่อยู่ในข้อความ) — ป้ายพร้อมดาว ต่อ " *" ให้ช่องที่มี [data-required]
    const ป้าย = (await ป้ายพร้อมดาว(กล่อง.locator(".form-label"))).map(t => t.trim().replace(/ ·.*?(?= \*$|$)/s, "").toLowerCase());
    await expect(กล่อง.locator(".form-label [data-required]"), "* แดงจากตัวกลาง 2 ช่อง (ชื่อ · อีเมล · บทบาทเดียวไม่ต้องเลือก)").toHaveCount(2);
    expect(ป้าย).toEqual([
      "ชื่อ *", "นามสกุล", "อีเมล (ใช้เข้าระบบ) *", "รหัสผ่านชั่วคราว", "เบอร์โทร",
      "บทบาท", "แผนก", "สถานะ",
    ].map(t => t.toLowerCase()));

    const ปุ่มปิด = กล่อง.getByRole("button", { name: "ปิด" });
    const จัดกลาง = await ปุ่มปิด.evaluate(el => {
      const s = getComputedStyle(el);
      return s.display === "flex" && s.alignItems === "center" && s.justifyContent === "center";
    });
    expect(จัดกลาง, "ไอคอนกากบาทต้องอยู่กึ่งกลางปุ่ม").toBe(true);
  });

  test("บทบาทเดียว: ไม่มีช่องเลือกบทบาท (แสดง สำนักงานใหญ่) · แผนกเลือกจาก 3 ค่า ไม่บังคับ", async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 900 });
    await เปิดฟอร์ม(page);
    const กล่อง = page.getByRole("dialog", { name: "ฟอร์มผู้ใช้ HQ" });
    // เดิม: ช่องเลือกบทบาท 3 ตัว + แผนกตามบทบาท (แสดงอย่างเดียว)
    await expect(กล่อง.locator("select#us-role"), "ไม่มีช่องเลือกบทบาท").toHaveCount(0);
    await expect(กล่อง.locator('[aria-label="บทบาท"]'), "บทบาทแสดงอย่างเดียว").toHaveText("สำนักงานใหญ่");
    const แผนก = กล่อง.getByLabel("แผนก");
    expect(await แผนก.evaluate(el => el.tagName), "แผนก = ช่องเลือก").toBe("SELECT");
    await expect(แผนก.locator("option"), "ยังไม่ระบุ + 3 แผนกเดิม").toHaveText(["— ยังไม่ระบุ —", "บริหาร", "ฝ่ายขาย", "ไอทีและระบบ"]);
    await expect(แผนก, "ไม่บังคับ: เริ่มที่ยังไม่ระบุ").toHaveValue("");
    await expect(กล่อง.locator('label[for="us-dept"] [data-required]'), "แผนกไม่มี * แดง").toHaveCount(0);
    // ไม่เลือกแผนก + กรอกชื่อ/อีเมล = บันทึกได้ (ไม่มีข้อความผิดที่ช่องแผนก) — ไม่กดบันทึกจริง (ไม่สร้างบัญชี)
    await แผนก.selectOption("ฝ่ายขาย");
    await expect(แผนก).toHaveValue("ฝ่ายขาย");
  });

  test("หน้าผู้ใช้: ไม่มีตัวกรอง/คอลัมน์บทบาท · ไม่มีตารางสิทธิ์ตามบทบาท · แผนกยังกรองได้", async ({ page }) => {
    await open(page, "hq", "/hq/settings");
    await page.getByRole("button", { name: /^ผู้ใช้งาน/ }).click();
    await expect(page.getByText("ผู้ใช้ทั้งหมด").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByLabel("กรองตามบทบาท"), "ไม่มีตัวกรองบทบาท").toHaveCount(0);
    await expect(page.getByLabel("กรองตามแผนก"), "ตัวกรองแผนกคงไว้").toBeVisible();
    await expect(page.locator("thead th").filter({ hasText: /^บทบาท$/ }), "ไม่มีคอลัมน์บทบาท").toHaveCount(0);
    await expect(page.getByText("ตารางสิทธิ์ตามบทบาท"), "ไม่มีตารางสิทธิ์ตามบทบาท").toHaveCount(0);
  });

  test("บัญชีสำนักงานใหญ่คนสุดท้ายที่ใช้งาน: ปิดใช้งาน/ลบ กดไม่ได้พร้อมเหตุผล (เมนู + ฟอร์ม)", async ({ page }) => {
    // รายชื่อจากเซิร์ฟเวอร์จำกัดให้เหลือบัญชีสำนักงานใหญ่ที่ใช้งานคนเดียว (ข้ออื่นที่รันพร้อมกันเพิ่มผู้ใช้ HQ ได้ · ฐานกันซ้ำ: db-guards / hq_single_role.sql)
    await page.route(/\/api\/v1\/users(\?|$)/, async route => {
      if (route.request().method() !== "GET") return route.continue();
      const r = await route.fetch(); const rows = (await r.json()) as { id: string; dealerCode?: string; status: string; email: string }[];
      const hq = rows.filter(u => !u.dealerCode);
      const คนเดียว = hq.find(u => u.email === ADMIN.email) ?? hq.find(u => u.status === "active");
      const ใหม่ = rows.filter(u => u.dealerCode || u.id === คนเดียว?.id);
      await route.fulfill({ response: r, json: ใหม่ });
    });
    await open(page, "hq", "/hq/settings");
    await page.getByRole("button", { name: /^ผู้ใช้งาน/ }).click();
    const แถว = page.locator("tbody tr.clickable").filter({ hasText: ADMIN.email }).first();
    await expect(แถว).toBeVisible({ timeout: 20_000 });
    await แถว.getByRole("button", { name: "จัดการ" }).click();
    for (const ชื่อ of ["ปิดใช้งาน", "ลบผู้ใช้"]) {
      const ปุ่ม = page.getByRole("button", { name: ชื่อ, exact: true });
      await expect(ปุ่ม, `${ชื่อ}: กดไม่ได้`).toBeDisabled();
      await expect(ปุ่ม, `${ชื่อ}: บอกเหตุผล`).toHaveAttribute("data-disabled-reason", /คนสุดท้าย/);
    }
    await page.getByRole("button", { name: "แก้ไข", exact: true }).click();
    const กล่อง = page.getByRole("dialog", { name: "ฟอร์มผู้ใช้ HQ" });
    await expect(กล่อง.getByLabel("สถานะ"), "ฟอร์ม: เปลี่ยนสถานะคนสุดท้ายไม่ได้").toBeDisabled();
    await expect(กล่อง.locator("[data-last-hq-reason]")).toContainText("คนสุดท้าย");
  });
});

// ── สิทธิ์แต่งตั้งบทบาท — เฉพาะผู้ดูแลระบบเท่านั้น ──────────────────────────────
// ฐานข้อมูลปฏิเสธอยู่แล้ว (0026/0064) แต่หน้าจอต้องไม่หลอกให้กรอกจนจบแล้วค่อยเจอ error
test.describe("[role·hq] บทบาทเดียว: ผู้ใช้สำนักงานใหญ่ที่เพิ่มใหม่จัดการผู้ใช้ได้ (เดิม: ผู้บริหารแต่งตั้งบทบาทไม่ได้)", () => {
  test.describe.configure({ mode: "serial" });
  const svc = createClient(ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const NS = "ZZUIROLE";
  let บัญชี: { email: string; password: string } | null = null;

  async function ล้าง() {
    const { data } = await svc.from("profiles").select("id").like("name", `${NS}%`);
    for (const p of data ?? []) {
      await svc.auth.admin.deleteUser(String(p.id)).catch(() => {});
      await svc.from("profiles").delete().eq("id", p.id);
    }
  }

  test.beforeAll(async () => {
    await ล้าง();
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false } });
    await sb.auth.signInWithPassword(ADMIN);
    const tok = (await sb.auth.getSession()).data.session?.access_token ?? "";
    const email = `${NS.toLowerCase()}-mgr@example.com`;
    const password = "ZZ-ui-role-9931";
    const r = await fetch(`${HQ_ORIGIN}/api/admin/users`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${tok}` },
      body: JSON.stringify({ name: `${NS} ผู้ใช้ใหม่`, email, password, department: "บริหาร" }),   // ไม่ส่งบทบาท (ใบ 0282)
    });
    if (r.ok) บัญชี = { email, password };
  });

  test.afterAll(ล้าง);

  test("ผู้ใช้สำนักงานใหญ่ใหม่ — เห็นปุ่มเพิ่มผู้ใช้ (บทบาทเดียว ทำได้ทุกอย่าง)", async ({ page }) => {
    test.skip(!บัญชี, "สร้างบัญชีทดสอบไม่ได้ (ต้องมีฐานข้อมูลจริง)");
    // ล็อกอินจริงผ่านหน้าเข้าระบบ (โหมด api เก็บใบผ่านใน cookie · เดิมยัด localStorage ซึ่งไม่มีผลแล้ว)
    await loginUI(page, HQ_ORIGIN, "/hq/settings", บัญชี!);
    await expect(page, "ไม่ถูกเด้งออกจากหน้าตั้งค่า (เดิมผู้บริหารถูก AdminGate เด้ง)").toHaveURL(/\/hq\/settings/, { timeout: 20_000 });
    await page.getByRole("button", { name: /^ผู้ใช้งาน/ }).click();
    await expect(page.getByRole("button", { name: /เพิ่มผู้ใช้งาน HQ/ }), "เห็นปุ่มเพิ่มผู้ใช้ (เดิม: ไม่เห็น)").toHaveCount(1, { timeout: 20_000 });
  });
});
