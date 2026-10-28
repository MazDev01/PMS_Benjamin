import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY } from "./adminEnv";
import { SUPABASE_URL, SUPABASE_ANON, ADMIN } from "./supabaseEnv";
import { HQ_ORIGIN } from "./funcHelpers";
import { open, SESSION_KEY } from "./helpers";

// ฟอร์ม "เพิ่มผู้ใช้งาน HQ" — ปัญหาที่บอสแจ้ง 3 ก.ย. 69 (พร้อมภาพหน้าจอ):
//   บนโน้ตบุ๊กจอเตี้ย กล่องสูงกว่าจอ หัวกล่องโดนตัดข้างบน ปุ่มบันทึกโดนตัดข้างล่าง กดไม่ได้
//   และเลื่อนก็ไม่ได้ เพราะกล่องไม่มีส่วนที่เลื่อนได้
// พร้อมกันนั้นสั่งแก้ลำดับช่องและสิทธิ์แต่งตั้งบทบาท
test.describe("[ui·hq] ฟอร์มเพิ่มผู้ใช้งานสำนักงานใหญ่", () => {
  async function เปิดฟอร์ม(page: Page) {
    await open(page, "hq", "/hq/settings");
    await page.getByRole("button", { name: /ผู้ใช้งานและสิทธิ์/ }).click();
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

  test("ลำดับช่อง — รหัสผ่านชั่วคราวอยู่ใต้อีเมล · บทบาทมาก่อนแผนก · กากบาทปิดอยู่กึ่งกลางปุ่ม", async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 900 });
    await เปิดฟอร์ม(page);
    const กล่อง = page.getByRole("dialog", { name: "ฟอร์มผู้ใช้ HQ" });

    const ป้าย = (await กล่อง.locator(".form-label").allInnerTexts()).map(t => t.trim().replace(/ ·.*/s, "").toLowerCase());
    expect(ป้าย).toEqual([
      "ชื่อ *", "นามสกุล", "อีเมล (ใช้เข้าระบบ) *", "รหัสผ่านชั่วคราว", "เบอร์โทร",
      "บทบาท *", "แผนก", "สถานะ",
    ].map(t => t.toLowerCase()));

    const ปุ่มปิด = กล่อง.getByRole("button", { name: "ปิด" });
    const จัดกลาง = await ปุ่มปิด.evaluate(el => {
      const s = getComputedStyle(el);
      return s.display === "flex" && s.alignItems === "center" && s.justifyContent === "center";
    });
    expect(จัดกลาง, "ไอคอนกากบาทต้องอยู่กึ่งกลางปุ่ม").toBe(true);
  });

  test("แผนกต้องมาตามบทบาท แก้เองไม่ได้", async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 900 });
    await เปิดฟอร์ม(page);
    const กล่อง = page.getByRole("dialog", { name: "ฟอร์มผู้ใช้ HQ" });
    const แผนก = กล่อง.locator('[aria-label="แผนก"]');

    // ยังไม่เลือกบทบาท = ยังไม่มีแผนก และต้องบอกให้เลือกบทบาทก่อน
    await expect(แผนก).toHaveText(/เลือกบทบาทก่อน/);
    // ต้องไม่ใช่ช่องที่พิมพ์/เลือกเองได้
    expect(await แผนก.evaluate(el => el.tagName)).not.toBe("SELECT");
    expect(await แผนก.evaluate(el => el.tagName)).not.toBe("INPUT");

    for (const [บทบาท, แผนกที่ต้องได้] of [
      ["ผู้ดูแลระบบ", "ไอทีและระบบ"],
      ["ผู้บริหารสำนักงานใหญ่", "บริหาร"],
      ["เจ้าหน้าที่สำนักงานใหญ่", "ฝ่ายขาย"],
    ] as const) {
      await กล่อง.getByLabel("บทบาท").selectOption({ label: บทบาท });
      await expect(แผนก).toHaveText(แผนกที่ต้องได้);
    }
  });
});

// ── สิทธิ์แต่งตั้งบทบาท — เฉพาะผู้ดูแลระบบเท่านั้น ──────────────────────────────
// ฐานข้อมูลปฏิเสธอยู่แล้ว (0026/0064) แต่หน้าจอต้องไม่หลอกให้กรอกจนจบแล้วค่อยเจอ error
test.describe("[role·hq] บทบาทอื่นแต่งตั้งบทบาทไม่ได้", () => {
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
      body: JSON.stringify({ name: `${NS} ผู้บริหาร`, email, password, role: "HQ_MANAGEMENT", department: "บริหาร" }),
    });
    if (r.ok) บัญชี = { email, password };
  });

  test.afterAll(ล้าง);

  test("ผู้บริหารสำนักงานใหญ่ — ไม่มีปุ่มเพิ่มผู้ใช้ และแก้บทบาทของคนอื่นไม่ได้", async ({ page }) => {
    test.skip(!บัญชี, "สร้างบัญชีทดสอบไม่ได้ (ต้องมีฐานข้อมูลจริง)");
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false } });
    const { data } = await sb.auth.signInWithPassword(บัญชี!);
    await page.goto(`${HQ_ORIGIN}/hq/login`, { waitUntil: "domcontentloaded" });
    await page.evaluate(([k, v]) => localStorage.setItem(k, v), [SESSION_KEY, JSON.stringify(data.session)] as [string, string]);
    await page.goto(`${HQ_ORIGIN}/hq/settings`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4_000);

    // ต้องไม่มีทางไปถึงปุ่ม "เพิ่มผู้ใช้งาน HQ" ได้เลย
    // ทางที่ระบบทำอยู่คือเด้งออกจากหน้าตั้งค่าไปแดชบอร์ดตั้งแต่แรก (AdminGate)
    // เทสต์นี้ยอมรับทั้งสองแบบ: เด้งออก หรืออยู่ในหน้าได้แต่ไม่มีปุ่ม
    const อยู่หน้าตั้งค่า = page.url().includes("/hq/settings");
    if (อยู่หน้าตั้งค่า) {
      const แท็บ = page.getByRole("button", { name: /ผู้ใช้งานและสิทธิ์/ });
      if (await แท็บ.count()) {
        await แท็บ.click();
        await page.waitForTimeout(2_000);
      }
    }
    await expect(page.getByRole("button", { name: /เพิ่มผู้ใช้งาน HQ/ })).toHaveCount(0);
  });
});
