import { test, expect } from "@playwright/test";
import { กดตกลงในกล่องยืนยัน, settle } from "./helpers";
import { RYG, skipReason } from "./supabaseEnv";
import { DEALER_ORIGIN, loginUI, db, waitRow, cleanup, specNS, nsTag, เปิดฟอร์มทำใบจากใบHQ } from "./funcHelpers";

// ── กดตอบรับแล้วตัดการเชื่อมต่อทันที → ไทม์ไลน์และงานต้องครบ (บอสสั่ง 27 ต.ค. 69 · ใบ 0248) ─────────────────────
//   เดิม: ฐานเปลี่ยนใบเป็น won แล้ว หน้าเว็บค่อยส่งคำสั่งตามหลัง (ติ๊กงาน · บรรทัด "ลูกค้าตอบรับ") → ปิดหน้า/เน็ตหลุดตอนนั้น = หาย
//   ข้อนี้: ตั้งแต่กดตอบรับ ตัดทุกคำสั่งเขียนลีดจากหน้าเว็บ (เหมือนคำสั่งตามหลังไม่ถึงฐาน) และตัดเน็ตทันทีที่ใบเป็น won
//   → ไทม์ไลน์ "ลูกค้าตอบรับ" ของใบนี้ + งานจัดทำ/ส่งใบ ต้องอยู่ในฐานครบ (ฐานทำเองในคำสั่งเดียวกัน)
//   บนโค้ดก่อนใบ 0248 ตก (บรรทัดลูกค้าตอบรับไม่มี) · ข้อทดสอบฐานคู่กัน: supabase/tests/quote_events_timeline_in_db.sql
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(180_000);

const NS = specNS("CWOFF");
const tg = nsTag(NS);
test.beforeAll(async () => { await cleanup(await db(RYG), "RYG", NS); });
test.afterAll(async () => { await cleanup(await db(RYG), "RYG", NS); });

test("[func·dealer] กดลูกค้าตอบรับแล้วเน็ตหลุดทันที → ไทม์ไลน์ลูกค้าตอบรับ + งานจัดทำ/ส่งใบ อยู่ในฐานครบ", async ({ page, context }) => {
  const sb = await db(RYG);
  const COMPANY = tg("ตอบรับแล้วเน็ตหลุด");

  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: "เพิ่มลูกค้าเป้าหมาย" }).first().click();
  await page.getByPlaceholder("เช่น บริษัท ตัวอย่าง จำกัด").fill(COMPANY);
  await page.getByPlaceholder("ชื่อผู้ติดต่อ").fill("คุณเน็ตหลุด");
  await page.getByPlaceholder("0XX-XXX-XXXX").fill("081-000-0000");
  await page.getByRole("dialog").getByLabel("จังหวัด").first().selectOption({ index: 1 });
  await page.getByPlaceholder("เช่น 1200", { exact: true }).fill("500");
  await page.getByRole("button", { name: "บันทึก" }).click();
  const ลีด = await waitRow<{ id: string; num_id: number }>(sb, "leads", { company: COMPANY });

  await page.getByRole("button", { name: "ตาราง" }).click();
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(COMPANY);
  const row = page.locator("tbody tr").filter({ hasText: COMPANY }).first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.getByRole("button", { name: "ดูรายละเอียด" }).first().click();
  await page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click();
  await เปิดฟอร์มทำใบจากใบHQ(page, "RYG", COMPANY);
  await expect(page.getByText("สร้างใบเสนอราคาใหม่")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "สร้างใบเสนอราคา" }).last().click();
  const q = await waitRow<{ id: string }>(sb, "quotations", { customer: COMPANY });
  await page.getByRole("status", { name: "ขั้นต่อไป" }).getByRole("button", { name: /ส่งให้ลูกค้า/ }).click({ timeout: 25_000 });
  await กดตกลงในกล่องยืนยัน(page);
  await expect.poll(async () => (await sb.from("quotations").select("status").eq("id", q.id)).data?.[0]?.status,
    { timeout: 25_000 }).toBe("sent_to_client");

  // ── ตั้งแต่ตรงนี้: คำสั่งเขียนลีดจากหน้าเว็บไม่ถึงฐาน (เส้นทาง api ของเว็บจริง + ต่อฐานตรง) ──
  let ตัดไป = 0;
  await page.route(/(\/api\/v1\/leads\?op=apply|\/rest\/v1\/rpc\/lead_apply)/, r => { ตัดไป++; return r.abort("internetdisconnected"); });
  await page.locator(`[data-quote-item="${q.id}"] [data-customer-result]`).getByRole("button", { name: /ลูกค้าตอบรับ/ }).click({ timeout: 25_000 });
  await กดตกลงในกล่องยืนยัน(page);
  await expect.poll(async () => (await sb.from("quotations").select("status").eq("id", q.id)).data?.[0]?.status,
    { timeout: 25_000, message: "ใบต้องเป็น won" }).toBe("won");
  await context.setOffline(true);   // เน็ตหลุดทันทีที่ใบเป็น won

  const { data } = await sb.from("leads").select("activities, tasks").eq("id", ลีด.id).single();
  const ไทม์ไลน์ = JSON.stringify(data?.activities ?? []);
  console.log(`[close-won-offline] คำสั่งเขียนลีดจากหน้าเว็บที่ถูกตัด ${ตัดไป} คำสั่ง`);
  expect(ไทม์ไลน์, "ไทม์ไลน์ต้องมีบรรทัดลูกค้าตอบรับของใบนี้ (ฐานจดในคำสั่งตอบรับ)").toContain(`ใบเสนอราคา ${q.id} (V1) — ลูกค้าตอบรับ`);
  expect(ไทม์ไลน์, "ไทม์ไลน์ต้องมีบรรทัดส่งใบของใบนี้").toContain(`ส่งใบเสนอราคา ${q.id} (V1) ให้ลูกค้า`);
  const งาน = (data?.tasks ?? []) as { key: string; done?: boolean }[];
  for (const key of ["makeQuote", "sendQuote"]) {
    expect(งาน.find(t => t.key === key)?.done, `งาน ${key} ต้องติ๊กแล้ว`).toBe(true);
  }
  await context.setOffline(false);
});
