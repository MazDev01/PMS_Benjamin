import { test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { RYG, ADMIN, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { db, DEALER_ORIGIN, HQ_ORIGIN, loginUI } from "./funcHelpers";
import { settle, กดตกลงในกล่องยืนยัน } from "./helpers";
import { adminClient } from "./testDealers";
import { รันSQLในฐาน } from "./localDb";
import { สร้างดีลเลอร์รหัสยาว, ล้างดีลเลอร์รหัสยาว, รหัสยาว } from "./longCodeDealer";
import { เตรียมใบHQ, ทำใบลูกค้าจากใบHQ, ล้างใบHQทดสอบ, type ใบHQพร้อมใช้ } from "./hqQuoteFixture";

// ── ถ่ายรูปหน้าจอ "ก่อน/หลัง" ของหน้าที่แก้ในรอบ 2 (บอสสั่ง 19 ต.ค. 69) — ไม่ใช่ข้อทดสอบ ─────────────────────
//   รันเองเท่านั้น: PMS_SHOTS=ก่อน|หลัง PMS_SHOTS_DIR=<โฟลเดอร์> npm run test:prodbuild -- tests/scenario/zz-shots.spec.ts
//   ทุกหน้าถ่าย 2 ขนาด: จอกว้าง 1440×900 + มือถือ 390×844 · ชื่อไฟล์ = <ช่วง>-<ก่อน|หลัง>-<หน้า>-<จอ>.png
test.skip(() => !process.env.PMS_SHOTS, "ถ่ายรูปก่อน/หลังของรอบ 2 — รันเองเมื่อสั่ง PMS_SHOTS=ก่อน|หลัง (ไม่ใช่ข้อทดสอบ)");
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.describe.configure({ mode: "serial" });
test.setTimeout(300_000);

const ช่วง = process.env.PMS_SHOTS_PHASE ?? "ก";
const รอบ = process.env.PMS_SHOTS ?? "ก่อน";
const โฟลเดอร์ = process.env.PMS_SHOTS_DIR ?? "C:/.claude/pms-shots/round2";
const จอ = [{ ชื่อ: "จอกว้าง", w: 1440, h: 900 }, { ชื่อ: "มือถือ", w: 390, h: 844 }];
const แท็ก = `${Date.now() % 100000}`;
const บริษัท = `ZZTEST-ภาพก่อนหลัง-${แท็ก}`;
let ใบ: ใบHQพร้อมใช้;

async function ถ่าย(page: Page, ชื่อ: string, เตรียม: () => Promise<void>) {
  mkdirSync(โฟลเดอร์, { recursive: true });
  for (const j of จอ) {
    await page.setViewportSize({ width: j.w, height: j.h });
    await เตรียม();
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(โฟลเดอร์, `${ช่วง}-${รอบ}-${ชื่อ}-${j.ชื่อ}.png`), fullPage: true });
  }
}

test.beforeAll(async () => {
  if (ช่วง !== "ก") return;
  // งานที่ลูกค้าตอบรับแล้ว ผ่านใบ HQ (ใบเก่าในข้อมูลตั้งต้นไม่มีใบ HQ จึงไม่มีปุ่มลบ/แก้อยู่แล้ว)
  ใบ = await เตรียมใบHQ(RYG, { dealerCode: "RYG", company: บริษัท, province: "ระยอง", lines: [{ name: "โครงเหล็กชุดทดสอบ", qty: 1, unit: "ชุด", unitCost: 100000 }] });
  const q = await ทำใบลูกค้าจากใบHQ(RYG, ใบ, { customer: บริษัท, markupPercent: 20 });
  const sb = await db(RYG);
  const r = await sb.from("quotations").update({ status: "sent_to_client" }).eq("dealer_code", "RYG").eq("id", q.id);
  if (r.error) throw new Error(`ส่งใบไม่สำเร็จ: ${r.error.message}`);
});
test.afterAll(async () => {
  if (!ใบ) return;
  const admin = adminClient();
  const { data: cs } = await admin.from("customers").select("id").eq("dealer_code", "RYG").eq("company", บริษัท);
  ล้างใบHQทดสอบ("RYG", [ใบ.leadNum]);
  for (const c of cs ?? []) await admin.from("customers").delete().eq("dealer_code", "RYG").eq("id", c.id);
});

test("ช่วง ก · หน้าตั้งรหัสผ่านใหม่ (ดีลเลอร์ + HQ) ไม่ได้เข้าระบบ", async ({ page }) => {
  test.skip(ช่วง !== "ก", "ไม่ใช่ช่วง ก");
  await ถ่าย(page, "ดีลเลอร์-reset-password", async () => { await page.goto(`${DEALER_ORIGIN}/reset-password`); await page.waitForTimeout(5500); });
  await ถ่าย(page, "HQ-reset-password", async () => { await page.goto(`${HQ_ORIGIN}/reset-password`); await page.waitForTimeout(5500); });
});

test("ช่วง ก · ดีลเลอร์: แผงลีดที่ปิดการขายแล้ว (งาน + ใบเสนอราคา) · ใบเสนอราคา · ลูกค้า", async ({ page }) => {
  test.skip(ช่วง !== "ก", "ไม่ใช่ช่วง ก");
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  // ปิดการขายผ่านหน้าจอจริง (แผงลีด › งาน › ได้งาน) — ปุ่ม "เปิดใหม่" เห็นได้ในแผงเดิมหลังปิดเท่านั้น
  //   (ลีดที่ปิดแล้ว เปิดจากลิงก์จะถูกพาไปหน้าลูกค้า)
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: "ตาราง" }).click().catch(() => {});
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(บริษัท);
  await page.locator("tbody tr").filter({ hasText: บริษัท }).first().locator("td").first().click();
  await page.getByRole("button", { name: "งาน", exact: true }).first().click();
  await page.getByRole("button", { name: /ได้งาน/ }).first().click();
  await กดตกลงในกล่องยืนยัน(page).catch(() => "");
  await settle(page);
  const ไม่ต้องทำ = async () => { await settle(page); };
  await ถ่าย(page, "ดีลเลอร์-แผงลีดปิดแล้ว-งาน", ไม่ต้องทำ);
  await page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click();
  await ถ่าย(page, "ดีลเลอร์-แผงลีดปิดแล้ว-ใบเสนอราคา", ไม่ต้องทำ);
  await ถ่าย(page, "ดีลเลอร์-ใบเสนอราคา-รายการ", async () => {
    await page.goto(`${DEALER_ORIGIN}/quotations`, { waitUntil: "domcontentloaded" }); await settle(page);
    await page.getByPlaceholder(/ค้นหา/).first().fill(บริษัท).catch(() => {}); await settle(page);
  });
  const { data: q } = await (await db(RYG)).from("quotations").select("id").eq("dealer_code", "RYG").eq("deal_id", ใบ.leadNum).limit(1).single();
  await ถ่าย(page, "ดีลเลอร์-ใบเสนอราคา-ใบที่ตอบรับแล้ว", async () => {
    await page.goto(`${DEALER_ORIGIN}/quotations?open=${encodeURIComponent(String(q?.id ?? ""))}`, { waitUntil: "domcontentloaded" }); await settle(page);
  });
  await ถ่าย(page, "ดีลเลอร์-ลูกค้า-รายการ", async () => { await page.goto(`${DEALER_ORIGIN}/customers`, { waitUntil: "domcontentloaded" }); await settle(page); });
  await ถ่าย(page, "ดีลเลอร์-ลูกค้าเป้าหมาย-รายการ", async () => { await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" }); await settle(page); });
});

test("ช่วง ก · HQ: ใบเสนอราคาทั้งเครือ (ใบที่ตอบรับแล้ว)", async ({ page }) => {
  test.skip(ช่วง !== "ก", "ไม่ใช่ช่วง ก");
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await ถ่าย(page, "HQ-ใบเสนอราคาทั้งเครือ", async () => { await page.goto(`${HQ_ORIGIN}/hq/quotations`, { waitUntil: "domcontentloaded" }); await settle(page); });
});

// ── ช่วง ก2: ได้ราคา HQ · แผงลีดไม่มีของซ้ำ · กระดิ่งราคาหมดอายุ ──
test.describe("ช่วง ก2", () => {
  const ได้ราคา = `ZZTEST-ภาพก2-ได้ราคา-${แท็ก}`, หมด = `ZZTEST-ภาพก2-หมดอายุ-${แท็ก}`;
  let ก: ใบHQพร้อมใช้, ข: ใบHQพร้อมใช้;
  test.beforeAll(async () => {
    if (ช่วง !== "ก2") return;
    ก = await เตรียมใบHQ(RYG, { dealerCode: "RYG", company: ได้ราคา, province: "ระยอง", lines: [{ name: "โครงเหล็กชุดทดสอบ", qty: 1, unit: "ชุด", unitCost: 50000 }] });
    ข = await เตรียมใบHQ(RYG, { dealerCode: "RYG", company: หมด, province: "ระยอง", lines: [{ name: "หลังคาชุดทดสอบ", qty: 1, unit: "ชุด", unitCost: 50000 }] });
    รันSQLในฐาน(`alter table public.hq_quotes disable trigger hq_quotes_lock_sent;
      update public.hq_quotes set valid_until = (now() at time zone 'Asia/Bangkok')::date - 1 where id = ${ข.hqQuoteId};
      alter table public.hq_quotes enable trigger hq_quotes_lock_sent;
      select public.expire_hq_linked_quotations();`);
  });
  test.afterAll(async () => { if (ก) ล้างใบHQทดสอบ("RYG", [ก.leadNum, ข.leadNum]); });

  test("ช่วง ก2 · ลีด · แผง · แดชบอร์ด · กระดิ่ง", async ({ page }) => {
    test.skip(ช่วง !== "ก2", "ไม่ใช่ช่วง ก2");
    await loginUI(page, DEALER_ORIGIN, "/login", RYG);
    const ไปหน้าลีด = async () => {
      await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" }); await settle(page);
      await page.getByRole("button", { name: "ตาราง" }).click().catch(() => {});
      await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill("ZZTEST-ภาพก2");
    };
    await ถ่าย(page, "ดีลเลอร์-ลีด-ป้ายได้ราคาHQ", ไปหน้าลีด);
    await ไปหน้าลีด();
    await page.locator("tbody tr").filter({ hasText: ได้ราคา }).first().locator("td").first().click();
    const ไม่ต้องทำ = async () => { await settle(page); };
    await ถ่าย(page, "ดีลเลอร์-แผงลีด-ภาพรวม", ไม่ต้องทำ);
    await page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click();
    await ถ่าย(page, "ดีลเลอร์-แผงลีด-ใบเสนอราคา", ไม่ต้องทำ);
    await page.getByRole("button", { name: "งาน", exact: true }).first().click();
    await ถ่าย(page, "ดีลเลอร์-แผงลีด-งาน", ไม่ต้องทำ);
    await ถ่าย(page, "ดีลเลอร์-แดชบอร์ด", async () => { await page.goto(`${DEALER_ORIGIN}/dashboard`, { waitUntil: "domcontentloaded" }); await settle(page); });
    await ถ่าย(page, "ดีลเลอร์-กระดิ่งราคาหมดอายุ", async () => {
      await page.goto(`${DEALER_ORIGIN}/dashboard`, { waitUntil: "domcontentloaded" }); await settle(page);
      await page.getByRole("button", { name: "การแจ้งเตือน" }).click();
    });
  });
});

// ── ช่วง ข: หน้าดีลเลอร์ของ HQ · แถว HQ · ปุ่มในแถว · รหัสโดนตัด (4 หน้า) ──
test.describe("ช่วง ข", () => {
  test.beforeAll(async () => { if (ช่วง === "ข") await สร้างดีลเลอร์รหัสยาว(); });
  test.afterAll(async () => { if (ช่วง === "ข") await ล้างดีลเลอร์รหัสยาว(); });

  test("ช่วง ข · หน้าของ HQ", async ({ page }) => {
    test.skip(ช่วง !== "ข", "ไม่ใช่ช่วง ข");
    await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
    const ไป = (path: string, ค้น?: string) => async () => {
      await page.goto(`${HQ_ORIGIN}${path}`, { waitUntil: "domcontentloaded" }); await settle(page);
      if (ค้น) { await page.getByPlaceholder(/ค้นหา/).first().fill(ค้น).catch(() => {}); await settle(page); }
    };
    await ถ่าย(page, "HQ-ทะเบียนดีลเลอร์-ตาราง", ไป("/hq/dealers?view=table"));
    await ถ่าย(page, "HQ-ทะเบียนดีลเลอร์-ค้นรหัสยาว", ไป("/hq/dealers?view=table", รหัสยาว));
    await ถ่าย(page, "HQ-ทะเบียนดีลเลอร์-การ์ด", async () => { await ไป("/hq/dealers")(); await page.getByRole("button", { name: /แสดงแบบการ์ด/ }).click().catch(() => {}); });
    await ถ่าย(page, "HQ-รายละเอียดดีลเลอร์", ไป(`/hq/dealers/${รหัสยาว}`));
    await ถ่าย(page, "HQ-แดชบอร์ด", ไป("/hq/dashboard"));
    await ถ่าย(page, "HQ-ภาพรวมยอดขาย", ไป("/hq/pipeline", รหัสยาว));
    await ถ่าย(page, "HQ-ลูกค้าทั้งเครือ", ไป("/hq/customers", "ZZTEST-ลูกค้ารหัสยาว"));
    await ถ่าย(page, "HQ-ใบเสนอราคาทั้งเครือ", ไป("/hq/quotations", "ZZTEST-ลูกค้ารหัสยาว"));
    await ถ่าย(page, "HQ-ตั้งค่าเป้าหมาย", async () => { await ไป("/hq/settings")(); await page.getByRole("tab", { name: /เป้าหมายยอดขาย/ }).click().catch(() => page.getByRole("button", { name: /เป้าหมายยอดขาย/ }).click().catch(() => {})); await settle(page); });
  });
});
test.describe("ช่วง ค", () => {
  // ลีดที่มีใบ (ยอดใบล่าสุด 2,200,000) + ลีดที่ไม่มีใบแต่มีประเมินราคาเดิมค้าง + ดีลเลอร์ที่ยังไม่ตั้งเป้า (ZZWWW)
  const มีใบ = `ZZTEST-ภาพค-มีใบ-${แท็ก}`, ไม่มีใบ = `ZZTEST-ภาพค-ไม่มีใบ-${แท็ก}`;
  let ใบค: ใบHQพร้อมใช้ | undefined; let เลขไม่มีใบ = 0;
  test.beforeAll(async () => {
    if (ช่วง !== "ค") return;
    ใบค = await เตรียมใบHQ(RYG, { dealerCode: "RYG", company: มีใบ, province: "ระยอง", lines: [{ name: "โครงเหล็กชุดทดสอบ", qty: 1, unit: "ชุด", unitCost: 2_000_000 }] });
    await ทำใบลูกค้าจากใบHQ(RYG, ใบค, { customer: มีใบ, markupPercent: 10 });
    เลขไม่มีใบ = 970_000_000 + (Date.now() % 9_000_000);
    const r = await adminClient().from("leads").insert({ id: `#L-${เลขไม่มีใบ}`, num_id: เลขไม่มีใบ, dealer_code: "RYG", company: ไม่มีใบ, name: ไม่มีใบ,
      contact: "ผู้ทดสอบ", phone: `08${String(เลขไม่มีใบ).slice(-8)}`, province: "ระยอง", status: "WAITING", value: "฿9,999,999" });
    if (r.error) throw new Error(r.error.message);
    await สร้างดีลเลอร์รหัสยาว();
  });
  test.afterAll(async () => {
    if (ช่วง !== "ค") return;
    ล้างใบHQทดสอบ("RYG", [ใบค?.leadNum ?? 0, เลขไม่มีใบ]);
    await ล้างดีลเลอร์รหัสยาว();
  });

  test("ช่วง ค · ดีลเลอร์", async ({ page }) => {
    test.skip(ช่วง !== "ค", "ไม่ใช่ช่วง ค");
    await loginUI(page, DEALER_ORIGIN, "/login", RYG);
    await page.evaluate(() => localStorage.setItem("pms_notif_since_RYG", new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10)));
    const ลีด = (ค้น: string) => async () => {
      await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" }); await settle(page);
      await page.getByRole("button", { name: "ตาราง" }).click().catch(() => {});
      await page.getByPlaceholder(/ค้นหาบริษัท/).first().fill(ค้น); await settle(page);
    };
    await ถ่าย(page, "ดีลเลอร์-ลีด-ตาราง", ลีด("ZZTEST-ภาพค"));
    await ถ่าย(page, "ดีลเลอร์-ลีด-แผงมีใบ", async () => { await ลีด("")(); await page.getByPlaceholder("ค้นหาบริษัท").first().fill(มีใบ); await page.locator("tbody tr").filter({ hasText: มีใบ }).first().locator("td").nth(1).click(); await settle(page); });
    await ถ่าย(page, "ดีลเลอร์-ลีด-ฟอร์มเพิ่ม", async () => { await ลีด("")(); await page.getByRole("button", { name: /เพิ่มลูกค้าเป้าหมาย/ }).first().click(); await settle(page); });
    await ถ่าย(page, "ดีลเลอร์-แดชบอร์ด", async () => { await page.goto(`${DEALER_ORIGIN}/dashboard`, { waitUntil: "domcontentloaded" }); await settle(page); });
    await ถ่าย(page, "ดีลเลอร์-กระดิ่ง", async () => {
      await page.goto(`${DEALER_ORIGIN}/dashboard`, { waitUntil: "domcontentloaded" }); await settle(page);
      await page.getByRole("button", { name: "การแจ้งเตือน" }).first().click(); await settle(page);
    });
  });

  test("ช่วง ค · HQ", async ({ page }) => {
    test.skip(ช่วง !== "ค", "ไม่ใช่ช่วง ค");
    await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
    const ไป = (path: string, ค้น?: string) => async () => {
      await page.goto(`${HQ_ORIGIN}${path}`, { waitUntil: "domcontentloaded" }); await settle(page);
      if (ค้น) { await page.getByPlaceholder(/ค้นหา/).first().fill(ค้น).catch(() => {}); await settle(page); }
    };
    await ถ่าย(page, "HQ-ลีดทั้งเครือ", ไป("/hq/leads", "ZZTEST-ภาพค"));
    await ถ่าย(page, "HQ-ลีดทั้งเครือ-แผง", async () => { await ไป("/hq/leads")(); await page.getByPlaceholder("ค้นหา").first().fill(มีใบ); await page.locator("tbody tr").filter({ hasText: มีใบ }).first().locator("td").nth(2).click(); await settle(page); });
    await ถ่าย(page, "HQ-กระดิ่ง", async () => { await ไป("/hq/dashboard")(); await page.getByRole("button", { name: "การแจ้งเตือน" }).first().click(); await settle(page); });
    await ถ่าย(page, "HQ-รายละเอียดดีลเลอร์-ไม่มีเป้า", ไป(`/hq/dealers/${รหัสยาว}`));
    await ถ่าย(page, "HQ-ทะเบียนดีลเลอร์-ไม่มีเป้า", ไป("/hq/dealers?view=table", รหัสยาว));
    await ถ่าย(page, "HQ-ภาพรวมยอดขาย-ไม่มีเป้า", ไป("/hq/pipeline", รหัสยาว));
    await ถ่าย(page, "HQ-ใบเสนอราคา-ไม่มีใบที่ส่ง", ไป("/hq/quotations", `ZZไม่มีจริง-${แท็ก}`));
  });
});
test.describe("ช่วง ง", () => {
  const ลีดใบง = `ZZTEST-ภาพง-ใบ-${แท็ก}`;
  let ใบง: ใบHQพร้อมใช้ | undefined; let เลขใบง = "";
  test.beforeAll(async () => {
    if (ช่วง !== "ง") return;
    ใบง = await เตรียมใบHQ(RYG, { dealerCode: "RYG", company: ลีดใบง, province: "ระยอง", lines: [{ name: "โครงเหล็กชุดทดสอบ", qty: 1, unit: "ชุด", unitCost: 100_000 }] });
    เลขใบง = (await ทำใบลูกค้าจากใบHQ(RYG, ใบง, { customer: ลีดใบง, markupPercent: 10 })).id;
  });
  test.afterAll(async () => { if (ช่วง === "ง" && ใบง) ล้างใบHQทดสอบ("RYG", [ใบง.leadNum]); });

  test("ช่วง ง · ดีลเลอร์", async ({ page }) => {
    test.skip(ช่วง !== "ง", "ไม่ใช่ช่วง ง");
    await loginUI(page, DEALER_ORIGIN, "/login", RYG);
    const ไป = (path: string) => async () => { await page.goto(`${DEALER_ORIGIN}${path}`, { waitUntil: "domcontentloaded" }); await settle(page); };
    await ถ่าย(page, "ดีลเลอร์-แดชบอร์ด", ไป("/dashboard"));
    await ถ่าย(page, "ดีลเลอร์-ลีด", ไป("/leads"));
    await ถ่าย(page, "ดีลเลอร์-แก้ใบเสนอราคา", async () => {
      await ไป("/quotations")(); await page.getByPlaceholder("ค้นหา").first().fill(เลขใบง); await settle(page);
      await page.locator("tbody tr").filter({ hasText: เลขใบง }).first().getByTitle("แก้ไข").click(); await settle(page);
    });
    await ถ่าย(page, "ดีลเลอร์-แผงใบเสนอราคา", async () => {
      await ไป("/quotations")(); await page.getByPlaceholder("ค้นหา").first().fill(เลขใบง); await settle(page);
      await page.locator("tbody tr").filter({ hasText: เลขใบง }).first().locator("td").nth(1).click(); await settle(page);
    });
    await ถ่าย(page, "ดีลเลอร์-แผงลูกค้า", async () => { await ไป("/customers")(); await page.getByRole("row", { name: /^เปิดรายละเอียดลูกค้า/ }).first().click().catch(() => {}); await settle(page); });
    await ถ่าย(page, "ดีลเลอร์-ปฏิทิน", ไป("/calendar"));
    await ถ่าย(page, "ดีลเลอร์-ตั้งค่า", ไป("/settings"));
    await ถ่าย(page, "ดีลเลอร์-บัญชีเข้าระบบ", ไป("/settings/account"));
  });

  test("ช่วง ง · HQ", async ({ page }) => {
    test.skip(ช่วง !== "ง", "ไม่ใช่ช่วง ง");
    await ถ่าย(page, "HQ-หน้าเข้าระบบ", async () => { await page.goto(`${HQ_ORIGIN}/hq/login`, { waitUntil: "domcontentloaded" }); await page.waitForTimeout(1500); });
    await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
    const ไป = (path: string) => async () => { await page.goto(`${HQ_ORIGIN}${path}`, { waitUntil: "domcontentloaded" }); await settle(page); };
    await ถ่าย(page, "HQ-โปรไฟล์", ไป("/profile"));
    await ถ่าย(page, "HQ-บันทึกการใช้งาน", ไป("/hq/audit"));
    await ถ่าย(page, "HQ-ผู้ใช้และสิทธิ์", ไป("/hq/users"));
    await ถ่าย(page, "HQ-ตั้งค่า-หาดีลเลอร์", async () => { await ไป("/hq/settings")(); await page.getByRole("button", { name: /หาดีลเลอร์/ }).first().click().catch(() => {}); await settle(page); });
  });
});

// ── รอบ 3 ข้อ 1–2 (บอสสั่ง 20 ต.ค. 69): หน้าแก้ใบเสนอราคา (ใบร่าง/ใบส่งแล้ว) · แถวใบร่างใน /hq/proposals ──
test.describe("รอบ 3", () => {
  const ลีดร่าง = `ZZTEST-ภาพรอบ3-ร่าง-${แท็ก}`, ลีดส่ง = `ZZTEST-ภาพรอบ3-ส่ง-${แท็ก}`, ผู้สนใจ = `ZZTEST-ภาพรอบ3-ผู้สนใจ-${แท็ก}`;
  let ใบร่าง: ใบHQพร้อมใช้ | undefined, ใบส่ง: ใบHQพร้อมใช้ | undefined;
  let เลขร่าง = "", เลขส่ง = "", เลขใบค่าแฟรนไชส์ = "", ผู้สนใจId = 0;
  test.beforeAll(async () => {
    if (ช่วง !== "รอบ3") return;
    const บรรทัด = [{ name: "โครงเหล็กชุดทดสอบ", qty: 2, unit: "ชุด", unitCost: 100_000 }, { name: "หลังคาชุดทดสอบ", qty: 1, unit: "งาน", unitCost: 50_000 }];
    ใบร่าง = await เตรียมใบHQ(RYG, { dealerCode: "RYG", company: ลีดร่าง, province: "ระยอง", lines: บรรทัด });
    เลขร่าง = (await ทำใบลูกค้าจากใบHQ(RYG, ใบร่าง, { customer: ลีดร่าง, markupPercent: 10 })).id;
    ใบส่ง = await เตรียมใบHQ(RYG, { dealerCode: "RYG", company: ลีดส่ง, province: "ระยอง", lines: บรรทัด });
    เลขส่ง = (await ทำใบลูกค้าจากใบHQ(RYG, ใบส่ง, { customer: ลีดส่ง, markupPercent: 10 })).id;
    const sb = await db(RYG);
    const r = await sb.from("quotations").update({ status: "sent_to_client" }).eq("dealer_code", "RYG").eq("id", เลขส่ง);
    if (r.error) throw new Error(`ส่งใบไม่สำเร็จ: ${r.error.message}`);
    const hq = await db(ADMIN);
    const p = await hq.from("dealer_prospects").insert({ name: ผู้สนใจ, status: "contacted" }).select("id").single();
    if (p.error) throw new Error(p.error.message);
    ผู้สนใจId = (p.data as { id: number }).id;
    const ใบ = await hq.from("dealer_package_proposals").insert({ prospect_id: ผู้สนใจId, package: "standard", proposed_date: "2026-10-20", amount: 100_000 })
      .select("proposal_no").single();
    if (ใบ.error) throw new Error(ใบ.error.message);
    เลขใบค่าแฟรนไชส์ = (ใบ.data as { proposal_no: string }).proposal_no;
  });
  test.afterAll(async () => {
    if (ช่วง !== "รอบ3") return;
    ล้างใบHQทดสอบ("RYG", [ใบร่าง?.leadNum, ใบส่ง?.leadNum].filter((n): n is number => !!n));
    const admin = adminClient();
    if (ผู้สนใจId) {
      await admin.from("dealer_package_proposals").delete().eq("prospect_id", ผู้สนใจId);
      await admin.from("dealer_prospects").delete().eq("id", ผู้สนใจId);
    }
  });

  test("รอบ 3 · ดีลเลอร์: ใบร่าง (แก้ได้) · ใบส่งแล้ว (ล็อก)", async ({ page }) => {
    test.skip(ช่วง !== "รอบ3", "ไม่ใช่รอบ 3");
    await loginUI(page, DEALER_ORIGIN, "/login", RYG);
    const หาใบ = async (เลข: string) => {
      await page.goto(`${DEALER_ORIGIN}/quotations`, { waitUntil: "domcontentloaded" }); await settle(page);
      await page.getByPlaceholder("ค้นหา").first().fill(เลข); await settle(page);
      return page.locator("tbody tr").filter({ hasText: เลข }).first();
    };
    await ถ่าย(page, "ดีลเลอร์-แถวใบร่างและใบส่งแล้ว", async () => {
      await page.goto(`${DEALER_ORIGIN}/quotations`, { waitUntil: "domcontentloaded" }); await settle(page);
      await page.getByPlaceholder("ค้นหา").first().fill(`ZZTEST-ภาพรอบ3`); await settle(page);
    });
    await ถ่าย(page, "ดีลเลอร์-แก้ใบร่าง", async () => { await (await หาใบ(เลขร่าง)).getByTitle("แก้ไข").click(); await settle(page); });
    await ถ่าย(page, "ดีลเลอร์-แผงใบส่งแล้ว", async () => { await (await หาใบ(เลขส่ง)).locator("td").nth(1).click(); await settle(page); });
  });

  test("รอบ 3 · HQ: แถวใบร่างใบค่าแฟรนไชส์ · แผงรายละเอียด", async ({ page }) => {
    test.skip(ช่วง !== "รอบ3", "ไม่ใช่รอบ 3");
    await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
    const ค้น = async () => {
      await page.goto(`${HQ_ORIGIN}/hq/proposals`, { waitUntil: "domcontentloaded" }); await settle(page);
      await page.getByLabel("ค้นหาใบค่าแฟรนไชส์").fill(ผู้สนใจ); await settle(page);
    };
    await ถ่าย(page, "HQ-แถวใบร่างใบค่าแฟรนไชส์", ค้น);
    await ถ่าย(page, "HQ-แผงใบร่างใบค่าแฟรนไชส์", async () => {
      await ค้น(); await page.getByRole("row", { name: new RegExp(เลขใบค่าแฟรนไชส์) }).locator("td").first().click(); await settle(page);
    });
  });
});
