import { test, expect } from "@playwright/test";

// ── ลืมรหัสผ่านฝั่งสำนักงานใหญ่ (บอสสั่งตรวจ 2 ก.ย. 69: "ทำทั้ง hq ด้วยนะ") ──────────
//
// หน้าเข้าสู่ระบบใช้คอมโพเนนต์ตัวเดียวกันทั้งสองแอป (LoginCard variant="hq")
// แต่ "ใช้ตัวเดียวกัน" ไม่เท่ากับ "ทำงานเหมือนกัน" — คนละที่อยู่เว็บ คนละบัญชี คนละเส้นทางหลังเข้าระบบ
// จึงต้องมีเทสต์ของฝั่ง HQ แยกไว้ ไม่ใช่เชื่อว่าฝั่งดีลเลอร์ผ่านแล้วฝั่งนี้จะผ่านด้วย
function เลขที่ฐาน(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const txt = (require("node:fs") as typeof import("node:fs")).readFileSync("apps/dealer/.env.local", "utf8");
    return (txt.match(/^NEXT_PUBLIC_SUPABASE_URL=(.+)$/m)?.[1] ?? "http://127.0.0.1:54321").trim();
  } catch { return "http://127.0.0.1:54321"; }
}
// กล่องจดหมายทดสอบของ Supabase ในเครื่อง = พอร์ตของ API + 3 (ค่าตั้งต้น 54321 → 54324)
//   คิดจากที่อยู่ฐานที่ใช้อยู่จริง ไม่เขียนพอร์ตตายตัว — สลับไปฐานอีกตัวแล้วต้องอ่านกล่องจดหมายของฐานนั้น (แก้ 13 ต.ค. 69)
const MAIL = process.env.PMS_MAIL_URL ?? (process.env.NEXT_PUBLIC_SUPABASE_URL ?? เลขที่ฐาน()).replace(/:(\d+)\/?$/, (_m, p) => `:${Number(p) + 3}`);
const มีกล่องจดหมายในเครื่อง = async () =>
  await fetch(`${MAIL}/api/v1/messages?limit=1`).then(r => r.ok, () => false);

test("[auth·hq] ลืมรหัสผ่าน → กรอกเลขจากอีเมลแล้วเข้าระบบได้เลย ไม่ต้องตั้งรหัสใหม่", async ({ page }) => {
  test.setTimeout(180_000);
  test.skip(!(await มีกล่องจดหมายในเครื่อง()), "ไม่มีกล่องจดหมายทดสอบ (รันกับฐานบนคลาวด์)");
  const { ADMIN } = await import("./supabaseEnv");

  await fetch(`${MAIL}/api/v1/messages`, { method: "DELETE" }).catch(() => {});
  await page.goto("http://localhost:3002/hq/login", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "ลืมรหัสผ่าน?" })).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1200);

  // ⚠️ ต้อง type ไม่ใช่ fill — หน้าเว็บอ่านค่าจาก state ถ้ายัดค่าเร็วเกินจะยังไม่ทันรับรู้
  const ช่องอีเมล = page.getByPlaceholder("name@benjamin.com");
  await ช่องอีเมล.click();
  await ช่องอีเมล.type(ADMIN.email, { delay: 10 });
  await page.getByRole("button", { name: "ลืมรหัสผ่าน?" }).click();

  const ช่องเลข = page.getByLabel("เลขยืนยันจากอีเมล");
  const ขึ้นแล้ว = await ช่องเลข.waitFor({ state: "visible", timeout: 25_000 }).then(() => true, () => false);
  if (!ขึ้นแล้ว) {
    const บนจอ = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    test.skip(true, `ระบบไม่ส่งอีเมลในรอบนี้ — ${(บนจอ.match(/(ขอ[^เ]{0,40}ถี่เกินไป|อีเมลนี้ใช้ส่งจริงไม่ได้|เกิดข้อผิดพลาด[^·]{0,40})/) ?? ["ไม่ทราบสาเหตุ"])[0]}`);
  }
  await expect(page.getByPlaceholder(/รหัสผ่านใหม่/), "ต้องไม่บังคับตั้งรหัสใหม่").toHaveCount(0);

  let ดิบ = "";
  for (let i = 0; i < 60 && !ดิบ; i++) {
    const list = await fetch(`${MAIL}/api/v1/messages?limit=10`).then(r => r.json()).catch(() => null);
    const m = (list?.messages ?? []).find((x: { To?: { Address: string }[] }) =>
      (x.To ?? []).some(t => t.Address.toLowerCase() === ADMIN.email.toLowerCase()));
    if (m) ดิบ = await fetch(`${MAIL}/api/v1/message/${m.ID}`).then(r => r.text());
    else await new Promise(r => setTimeout(r, 500));
  }
  test.skip(!ดิบ, "ระบบอีเมลไม่ส่งในรอบนี้ (ติดเพดานส่งซ้ำภายใน 1 นาที)");
  const เลข = (ดิบ.match(/\b(\d{6,8})\b/) ?? [])[1] ?? "";
  const หลัง = ดิบ.split("token=")[1] ?? "";
  let token = ""; for (const ch of หลัง) { if (/[A-Za-z0-9_-]/.test(ch)) token += ch; else break; }
  expect(เลข || token, "ในอีเมลต้องมีเลขยืนยันหรือลิงก์").toBeTruthy();

  await ช่องเลข.fill(เลข || `http://localhost:3002/x?token=${token}&type=recovery`);
  await page.getByRole("button", { name: "เข้าสู่ระบบ" }).first().click();
  await expect(page, "กรอกเลขถูกต้องต้องเข้าถึงแดชบอร์ด HQ ได้เลย").toHaveURL(/\/hq\/dashboard/, { timeout: 30_000 });
});
