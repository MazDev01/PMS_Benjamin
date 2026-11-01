import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// ── prod-live หาดีลเลอร์ใหม่ครบเส้น (บอสสั่ง 1 พ.ย. 69) ─────────────────────────────────────────────────────────────
//   ผู้สนใจทดสอบ → ออกใบค่าแฟรนไชส์ → ส่ง → ตอบรับ → บันทึกชำระครบ → ตั้งเป็นดีลเลอร์ → เข้าระบบดีลเลอร์ใหม่ได้จริง
//   กดผ่านหน้าจอทุกขั้น · อ่านฐานด้วยกุญแจฝั่งเซิร์ฟเวอร์เพื่อตรวจผลเท่านั้น
//   ชื่อ/รหัสที่ใช้ตายตัว — cleanup.sql ลบตามนี้เท่านั้น (ข้อทดสอบ tests/tools/franchise-cleanup.test.mjs):
//     ผู้สนใจขึ้นต้น ZZTEST-ผู้สนใจเว็บจริง- · สาขา ZZTN · บัญชี zztn@dealer.benjaminpebsteel.com
//   ขึ้นต้น ZZT เพราะตัวดักบันทึกการใช้งาน (ใบ 0241) ยอมให้ลบเฉพาะแถวที่ขึ้นต้น ZZT
const E = (k: string) => { const v = process.env[k]; if (!v) throw new Error(`ขาด ${k}`); return v; };
const HQ = E("LIVE_HQ_URL"), DEALER = E("LIVE_DEALER_URL");
const ผู้ดูแล = { email: E("LIVE_HQ_EMAIL"), password: E("LIVE_PASSWORD") };
const svc = createClient(E("LIVE_SUPABASE_URL"), E("LIVE_SERVICE_KEY"), { auth: { persistSession: false } });
test.setTimeout(240_000);

const รหัส = "ZZTN", จังหวัด = "ตราด", ค่าแรกเข้า = 100_000, เป้า = 5_000_000;
const ชื่อ = `ZZTEST-ผู้สนใจเว็บจริง-${Number(E("LIVE_LEAD_NUM")) % 100000}`;

async function เข้าระบบ(page: Page, origin: string, path: string, who: { email: string; password: string }) {
  await page.goto(`${origin}${path}`, { waitUntil: "domcontentloaded" });
  const email = page.locator("#login-email"), pass = page.getByLabel(/รหัสผ่าน/i).first();
  for (let รอบ = 1; รอบ <= 3; รอบ++) {
    for (let i = 0; i < 6; i++) {
      await email.fill(who.email); await pass.fill(who.password);
      await page.waitForTimeout(300);
      if (await email.inputValue() === who.email && await pass.inputValue() === who.password) break;
    }
    await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).first().click();
    if (await page.waitForFunction(() => !location.pathname.includes("/login"), null, { timeout: 30_000 }).then(() => true).catch(() => false)) return;
  }
  throw new Error(`เข้าระบบไม่ผ่าน (${origin}${path})`);
}
const กดตกลง = (page: Page) => page.getByRole("alertdialog").getByRole("button").last().click();
const สถานะผู้สนใจ = async () => (await svc.from("dealer_prospects").select("status").eq("name", ชื่อ).maybeSingle()).data?.status;

test("[live·แฟรนไชส์] ผู้สนใจ → ใบค่าแฟรนไชส์ → ส่ง → ตอบรับ → ชำระครบ → ตั้งเป็นดีลเลอร์ → เข้าระบบดีลเลอร์ใหม่ได้", async ({ page, browser }) => {
  expect((await svc.from("dealers").select("code").eq("code", รหัส)).data ?? [], `สาขา ${รหัส} ต้องยังไม่มี — ไม่แตะของเดิม`).toEqual([]);

  // ── 1) ผู้สนใจ ──
  await เข้าระบบ(page, HQ, "/hq/prospects", ผู้ดูแล);
  await page.getByRole("button", { name: "เพิ่มผู้สนใจ" }).first().click();
  const แผง = page.getByRole("dialog", { name: "ข้อมูลผู้สนใจ" });
  await แผง.locator("#pr-name").fill(ชื่อ);
  await แผง.locator("#pr-phone").fill("000-000-0009");
  await แผง.locator("#pr-region").selectOption("ตะวันออก");
  await แผง.locator("#pr-province").selectOption(จังหวัด);
  await แผง.getByRole("button", { name: "เพิ่มผู้สนใจ" }).click();
  await expect.poll(สถานะผู้สนใจ, { message: "ผู้สนใจลงฐาน", timeout: 20_000 }).toBe("new");
  await expect(แผง.getByRole("tab", { name: "งาน/ความคืบหน้า" })).toHaveAttribute("aria-selected", "true", { timeout: 15_000 });

  // ── 2) ติดตาม → นัดคุย (ขั้นก่อนออกใบ) ──
  await แผง.getByRole("checkbox", { name: "ติดต่อครั้งแรก" }).click();
  await แผง.locator("#pc-channel").selectOption("โทรศัพท์");
  await แผง.locator("#pc-body").fill("ทดสอบบนเว็บจริง");
  await แผง.getByRole("button", { name: "บันทึกการติดต่อ" }).last().click();
  await expect.poll(สถานะผู้สนใจ, { timeout: 20_000 }).toBe("contacted");
  await แผง.getByRole("tab", { name: "งาน/ความคืบหน้า" }).click();
  await แผง.getByRole("checkbox", { name: "ส่งข้อมูลบริษัท" }).click();
  await expect.poll(สถานะผู้สนใจ, { timeout: 20_000 }).toBe("profile_sent");
  await แผง.getByRole("checkbox", { name: "นัดคุยรายละเอียด" }).click();
  await expect.poll(สถานะผู้สนใจ, { timeout: 20_000 }).toBe("meeting");

  // ── 3) ออกใบค่าแฟรนไชส์ → ส่ง ──
  await แผง.getByRole("tab", { name: /ใบค่าแฟรนไชส์/ }).click();
  await แผง.getByRole("button", { name: "ออกใบค่าแฟรนไชส์" }).click();
  const ฟอร์ม = แผง.getByRole("region", { name: "ใบค่าแฟรนไชส์" });
  await ฟอร์ม.locator("#pp-amount").fill(String(ค่าแรกเข้า));
  await ฟอร์ม.locator("#pp-months").fill("12");
  await ฟอร์ม.locator("#pp-target").fill(String(เป้า));
  await ฟอร์ม.getByRole("button", { name: "บันทึกใบ" }).click();   // จุดที่แตะช่องแพ็กเกจเดิม (ใบ 0269 ลบช่องแล้ว)
  const ผู้สนใจ = (await svc.from("dealer_prospects").select("id").eq("name", ชื่อ).single()).data!;
  const ใบ = async () => (await svc.from("dealer_package_proposals").select("id, proposal_no, status, amount").eq("prospect_id", ผู้สนใจ.id)).data ?? [];
  await expect.poll(async () => (await ใบ()).length, { message: "ใบลงฐาน", timeout: 20_000 }).toBe(1);
  const { id: เลขแถวใบ, proposal_no: เลขใบ, amount } = (await ใบ())[0];
  expect(Number(amount), "ยอดในใบตรงที่กรอก").toBe(ค่าแรกเข้า);
  await แผง.getByLabel(`สถานะใบ ${เลขใบ}`).selectOption("sent");
  await กดตกลง(page);
  await expect.poll(async () => (await ใบ())[0].status, { message: "ส่งใบ", timeout: 20_000 }).toBe("sent");
  await expect.poll(สถานะผู้สนใจ, { timeout: 20_000 }).toBe("considering");

  // ── 4) ตอบรับ ──
  await แผง.getByLabel(`สถานะใบ ${เลขใบ}`).selectOption("accepted");
  await กดตกลง(page);
  await expect.poll(async () => (await ใบ())[0].status, { message: "ตอบรับ", timeout: 20_000 }).toBe("accepted");

  // ── 5) บันทึกชำระครบ (หน้าใบค่าแฟรนไชส์ที่เดียว) ──
  await page.goto(`${HQ}/hq/proposals?q=${encodeURIComponent(เลขใบ)}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("row", { name: new RegExp(`เปิดใบค่าแฟรนไชส์ ${เลขใบ} `) }).first().click({ timeout: 25_000 });
  const ชำระ = page.getByRole("region", { name: `การชำระ ${เลขใบ}` });
  await ชำระ.getByLabel("ยอดชำระ").fill(String(ค่าแรกเข้า));
  await ชำระ.getByLabel("เลขอ้างอิง").fill("TR-ZZTEST-1");
  await ชำระ.getByRole("button", { name: "บันทึกการชำระ" }).click();
  await expect(ชำระ.getByTestId(`ยอดชำระ-${เลขใบ}`)).toContainText("ครบแล้ว", { timeout: 20_000 });

  // ── 6) ตั้งเป็นดีลเลอร์ ──
  await page.goto(`${HQ}/hq/prospects?open=${ผู้สนใจ.id}`, { waitUntil: "domcontentloaded" });
  await แผง.getByRole("tab", { name: /ใบค่าแฟรนไชส์/ }).click({ timeout: 25_000 });
  await แผง.getByRole("button", { name: "ตั้งเป็นดีลเลอร์" }).first().click();
  const ตั้ง = page.getByRole("dialog", { name: "ตั้งเป็นดีลเลอร์" });
  await expect(ตั้ง.locator("#cv-province"), "จังหวัดของผู้สนใจถูกเลือกไว้ให้").toHaveValue(จังหวัด, { timeout: 15_000 });
  await ตั้ง.locator("#cv-code").fill(รหัส);
  await ตั้ง.locator("#cv-name").fill(ชื่อ);   // ชื่อสาขาต้องขึ้นต้นด้วยป้ายทดสอบ — ด่านกันพลาดของ cleanup.sql ตรวจชื่อนี้
  await ตั้ง.getByRole("button", { name: "สร้างดีลเลอร์" }).click();
  const ผล = page.getByRole("dialog", { name: "บัญชีเข้าระบบของดีลเลอร์ใหม่" });
  await expect(ผล.getByText("สร้างดีลเลอร์สำเร็จ")).toBeVisible({ timeout: 30_000 });
  const ค่า = ผล.locator("code");
  const อีเมล = (await ค่า.nth(0).innerText()).trim(), รหัสผ่าน = (await ค่า.nth(1).innerText()).trim();
  expect(อีเมล.toLowerCase(), "อีเมลเข้าระบบตามรหัสสาขา").toBe("zztn@dealer.benjaminpebsteel.com");
  expect(รหัสผ่าน.length, "มีรหัสผ่านให้แจ้งดีลเลอร์").toBeGreaterThanOrEqual(8);

  // ผลในฐาน: สาขา · จังหวัด · บัญชี · ผู้สนใจ
  expect((await svc.from("dealers").select("name, status, revenue_target").eq("code", รหัส).single()).data, "สาขาใหม่: เป้าตามใบ")
    .toEqual({ name: ชื่อ, status: "active", revenue_target: เป้า });
  expect((await svc.from("dealer_territories").select("province").eq("dealer_code", รหัส)).data, "จังหวัดที่ดูแล 1 จังหวัด").toEqual([{ province: จังหวัด }]);
  expect((await svc.from("profiles").select("role, status").eq("dealer_code", รหัส)).data, "สร้างบัญชีดีลเลอร์").toEqual([{ role: "DEALER_ADMIN", status: "active" }]);
  await expect.poll(สถานะผู้สนใจ, { timeout: 20_000 }).toBe("won");
  // เส้นนี้ต้องไม่ส่งอีเมลออก (ผู้รับแจ้งเตือน HQ เป็นคนจริง)
  expect((await svc.from("email_outbox").select("id").eq("ref_table", "dealer_package_proposals").eq("ref_id", String(เลขแถวใบ))).data ?? [], "ไม่มีอีเมลออกจากใบนี้").toEqual([]);

  // ── 7) เข้าระบบดีลเลอร์ใหม่ด้วยบัญชีที่หน้าจอแจ้ง (เบราว์เซอร์แยก) ──
  const ใหม่ = await browser.newContext();
  const dp = await ใหม่.newPage();
  const พัง: string[] = [];
  dp.on("response", r => { if (r.status() >= 500) พัง.push(`${r.status()} ${new URL(r.url()).pathname}`); });
  await เข้าระบบ(dp, DEALER, "/login", { email: อีเมล, password: รหัสผ่าน });
  await expect(dp, "เข้าแล้วเข้าหน้าหลักทันที").toHaveURL(/\/dashboard/, { timeout: 30_000 });
  await dp.goto(`${DEALER}/leads`, { waitUntil: "domcontentloaded" });
  await expect(dp.getByRole("button", { name: "เพิ่มลูกค้าเป้าหมาย" }).first(), "ดีลเลอร์ใหม่เปิดหน้าลูกค้าเป้าหมายได้").toBeVisible({ timeout: 30_000 });
  expect(พัง, "ไม่มีคำขอล้มเหลวฝั่งเซิร์ฟเวอร์").toEqual([]);
  await ใหม่.close();
});
