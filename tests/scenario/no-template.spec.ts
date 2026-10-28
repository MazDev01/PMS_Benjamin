import { test, expect, request as pwRequest } from "@playwright/test";
import { RYG, ADMIN, skipReason } from "./supabaseEnv";
import { DEALER_ORIGIN, HQ_ORIGIN, loginUI, db, ไปแผงลีดจากแถวใบ } from "./funcHelpers";
import { settle, กดตกลงในกล่องยืนยัน, เปิดใบHQในกล่องงาน } from "./helpers";
import { adminClient } from "./testDealers";
import { ล้างใบHQทดสอบ, วางใบเดิมที่ฐาน, ลบใบทดสอบที่ฐาน } from "./legacyQuotes";

// ── เอาแม่แบบออกทั้งระบบ (บอสสั่ง 16 ต.ค. 69) ─────────────────────────────────────────────────────────
//   ฐานเก็บตาราง/ข้อมูลแม่แบบไว้ (ไม่ drop) แต่ไม่มีหน้า/API/ช่องใดของแอปใช้อีก
//   ดีลเลอร์บอกงานที่ขอราคาด้วยข้อความเอง · HQ ทำ BOQ ด้วยรายการที่พิมพ์เอง · % บวกตั้งต้นย้ายไปหน้าตั้งค่า
//   ใบเก่าที่เคยใช้แม่แบบยังเปิดดูได้ครบ · ตัวตรวจโค้ด: scripts/check-no-catalog.mjs
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

const admin = adminClient();
const แท็ก = Date.now() % 1_000_000;
const บริษัท = `ZZTEST-ไม่มีแม่แบบ-${แท็ก}`;
const เลขลีด = 976_000_000 + แท็ก;
let pricingเดิม: unknown = null;
let มีแถวเดิม = false;
// ⚠️ ห้ามใช้ update เขียนแถวตั้งค่าของ RYG — supabase-rls ลบแถวนี้ทิ้งตอนจบ (รอบเต็ม 19 ต.ค. 69)
//   update ใส่แถวที่ไม่มี = ไม่เกิดอะไรและไม่แจ้งผิด → หน้าตั้งค่าเห็น 0 แทน 15 · ใช้ upsert + ตรวจว่าเขียนได้จริง
const ตั้งราคาRYG = async (pricing: unknown) => {
  const { data, error } = await admin.from("dealer_settings").upsert({ dealer_code: "RYG", pricing }, { onConflict: "dealer_code" }).select("dealer_code");
  expect(error, "ตั้งค่า % บวกของ RYG ต้องสำเร็จ").toBeNull();
  expect(data ?? [], "ต้องเขียนลงแถวตั้งค่าของ RYG จริง 1 แถว").toHaveLength(1);
};

test.beforeAll(async () => {
  const { data } = await admin.from("dealer_settings").select("pricing").eq("dealer_code", "RYG").maybeSingle();
  มีแถวเดิม = !!data;
  pricingเดิม = data?.pricing ?? {};
});
test.afterAll(async () => {
  if (มีแถวเดิม) await admin.from("dealer_settings").update({ pricing: pricingเดิม ?? {} }).eq("dealer_code", "RYG");
  else await admin.from("dealer_settings").delete().eq("dealer_code", "RYG");
  ล้างใบHQทดสอบ("RYG", [เลขลีด]);
  await admin.from("leads").delete().eq("dealer_code", "RYG").eq("num_id", เลขลีด);
});

test("[ui·dealer] ฟอร์มลูกค้าเป้าหมายไม่มีช่องแม่แบบ — ทั้งตอนเพิ่มและแผงแก้ไข", async ({ page }) => {
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: "เพิ่มลูกค้าเป้าหมาย" }).first().click();
  const ฟอร์ม = page.getByRole("dialog");
  await expect(ฟอร์ม.getByPlaceholder("เช่น บริษัท ตัวอย่าง จำกัด")).toBeVisible({ timeout: 15_000 });
  await expect(ฟอร์ม.getByLabel("แม่แบบ", { exact: true }), "ฟอร์มเพิ่มต้องไม่มีช่องแม่แบบ").toHaveCount(0);
  await expect(ฟอร์ม.getByText("แม่แบบ", { exact: true }), "ฟอร์มเพิ่มต้องไม่มีป้ายแม่แบบ").toHaveCount(0);
  await page.keyboard.press("Escape");

  // แผงแก้ไขของลูกค้าเป้าหมายเดิม
  await page.getByRole("button", { name: "ตาราง" }).click().catch(() => {});
  await page.locator("tbody tr").first().getByRole("button", { name: "ดูรายละเอียด" }).first().click();
  await page.getByRole("button", { name: "ภาพรวม", exact: true }).first().click().catch(() => {});
  await settle(page);
  await expect(page.getByLabel("แม่แบบ", { exact: true }), "แผงแก้ไขต้องไม่มีช่องแม่แบบ").toHaveCount(0);
});

test("[ui] ดีลเลอร์และ HQ ไม่มีเมนูแม่แบบ · เข้า URL ตรงไม่พบหน้า · API แม่แบบตอบ 410", async ({ page }) => {
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await expect(page.getByRole("link", { name: "แม่แบบ", exact: true }), "เมนูดีลเลอร์ต้องไม่มีแม่แบบ").toHaveCount(0);
  const ด = await page.goto(`${DEALER_ORIGIN}/products`, { waitUntil: "domcontentloaded" });
  expect(ด?.status(), "/products ของดีลเลอร์ต้องไม่พบหน้า").toBe(404);

  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  // ตรวจในเมนูหลัก (26 ต.ค. 69): แม่แบบวัสดุ (ใบ 0244) ทำให้บันทึกการใช้งาน "บันทึกแม่แบบวัสดุ" ขึ้นเป็นลิงก์ในรายการความเคลื่อนไหวได้ — ไม่ใช่เมนู
  //   แม่แบบวัสดุอยู่ในแท็บของหน้าตั้งค่า ไม่ใช่เมนู → เมนูหลักยังต้องไม่มีคำว่าแม่แบบเลย (ทั้งแม่แบบอาคารเดิมและแม่แบบวัสดุ)
  const เมนูHQ = page.getByRole("navigation", { name: "เมนูหลัก" });
  await expect(เมนูHQ.getByRole("link").first(), "เมนูหลักของ HQ แสดงอยู่ (ไม่ใช่นับในที่ว่าง)").toBeVisible();
  await expect(เมนูHQ.getByRole("link", { name: /แม่แบบ/ }), "เมนู HQ ต้องไม่มีแม่แบบ").toHaveCount(0);
  const ห = await page.goto(`${HQ_ORIGIN}/hq/master`, { waitUntil: "domcontentloaded" });
  expect(ห?.status(), "/hq/master ต้องไม่พบหน้า").toBe(404);

  const api = await pwRequest.newContext();
  for (const [origin, who] of [[DEALER_ORIGIN, RYG], [HQ_ORIGIN, ADMIN]] as const) {
    const token = (await (await db(who)).auth.getSession()).data.session?.access_token ?? "";
    for (const method of ["get", "put", "delete"] as const) {
      const r = await api[method](`${origin}/api/v1/catalog`, { headers: { authorization: `Bearer ${token}` }, data: method === "put" ? [] : undefined });
      expect(r.status(), `${method.toUpperCase()} ${origin}/api/v1/catalog ต้องตอบ 410`).toBe(410);
    }
  }
  await api.dispose();
});

test("[ui·dealer] หน้าใบเสนอราคาไม่มีตัวกรอง/คอลัมน์ประเภทอาคาร (แม่แบบ) · แดชบอร์ดไม่โชว์แม่แบบที่ลูกค้าเป้าหมายเคยสนใจ", async ({ page }) => {
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/quotations`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await expect(page.locator("tbody tr").first()).toBeVisible({ timeout: 25_000 });
  await expect(page.locator("select").filter({ hasText: "ทุกประเภทอาคาร" }), "ต้องไม่มีตัวกรองประเภทอาคาร").toHaveCount(0);
  await expect(page.getByRole("columnheader", { name: "ประเภท", exact: true }), "ตารางต้องไม่มีคอลัมน์ประเภท").toHaveCount(0);

  // แดชบอร์ด: การ์ด "ต้องติดตามด่วน" เคยโชว์ "สนใจ: <แม่แบบ>" จากข้อมูลเก่าของลูกค้าเป้าหมาย
  await page.goto(`${DEALER_ORIGIN}/dashboard`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await expect(page.getByText(/ต้องติดตามด่วน/).first()).toBeVisible({ timeout: 25_000 });
  await expect(page.getByText(/^สนใจ:/), "แดชบอร์ดต้องไม่โชว์แม่แบบที่เคยสนใจ").toHaveCount(0);
});

test("[func·dealer] ลูกค้าเป้าหมายที่มีแม่แบบเก่า → ข้อความแจ้งเตือนและนัดหมายใหม่ต้องไม่มีชื่อแม่แบบ", async ({ page }) => {
  // ข้อมูลเก่าในฐาน (เก็บไว้ ไม่แสดง): ลูกค้าเป้าหมายสถานะ "ติดตาม" ที่เคยเลือกแม่แบบไว้
  const เลข = เลขลีด + 1, ชื่อ = `${บริษัท}-นัด`, แม่แบบเก่า = "ZZ-แม่แบบเก่า-แจ้งเตือน";
  // ใบ 0232: ดีลเลอร์เพิ่มลีดได้เฉพาะขั้นรอติดต่อ/ลูกค้าเป้าหมาย — ข้อมูลเก่าขั้น "ติดตาม" วางที่ฐานด้วยบัญชีผู้ดูแล (ตัวช่วยทดสอบ)
  const l = await admin.from("leads").insert({ id: `#L-${เลข}`, num_id: เลข, dealer_code: "RYG", company: ชื่อ, name: ชื่อ,
    contact: "ผู้ทดสอบ", phone: "000-000-0002", province: "ระยอง", status: "FOLLOWUP", product: แม่แบบเก่า });
  expect(l.error).toBeNull();
  try {
    await loginUI(page, DEALER_ORIGIN, "/login", RYG);
    await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
    await settle(page);

    // 1) กระดิ่งแจ้งเตือน — รอบ 4 (ใบ 0231): สถานะ "ติดตาม" เฉย ๆ ไม่ใช่เรื่องในตารางกลาง (ติดตาม = นัดหมายถึงกำหนดวันนี้)
    //    กระดิ่งจึงไม่มีเรื่องของลูกค้าเป้าหมายนี้เลย และไม่มีชื่อแม่แบบเก่าแน่นอน
    await page.getByRole("button", { name: "การแจ้งเตือน" }).click();
    const ดูทั้งหมด = page.locator("[data-notif-more]")   /* ปุ่มของแผงกระดิ่ง — แดชบอร์ดมีปุ่ม "ดูทั้งหมด" ของการ์ดด้วย */;
    if (await ดูทั้งหมด.count()) await ดูทั้งหมด.first().click();
    await expect(page.locator("span").filter({ hasText: /^การแจ้งเตือน$/ }).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("[data-notif-kind]").filter({ hasText: ชื่อ }), "สถานะติดตามอย่างเดียวไม่สร้างแจ้งเตือน").toHaveCount(0);
    await expect(page.getByText(แม่แบบเก่า, { exact: false }), "ข้อความแจ้งเตือนต้องไม่มีชื่อแม่แบบเก่า").toHaveCount(0);
    await page.keyboard.press("Escape");

    // 2) นัดหมายใหม่จากแผงลูกค้าเป้าหมาย — ต้องไม่คัดลอกแม่แบบเก่าไปเก็บ
    await page.getByRole("button", { name: "ตาราง" }).click().catch(() => {});
    await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(ชื่อ);
    const row = page.locator("tbody tr").filter({ hasText: ชื่อ }).first();
    await expect(row).toBeVisible({ timeout: 25_000 });
    await row.getByRole("button", { name: "ดูรายละเอียด" }).first().click();
    // รอบ 4: นัดหมายอยู่ที่แท็บประวัติ → "เพิ่มนัดหมาย" เปิดฟอร์มนัดหมายใหม่
    await page.getByRole("button", { name: "ประวัติ", exact: true }).first().click();
    await page.getByRole("button", { name: "เพิ่มนัดหมาย" }).first().click();
    await expect(page.getByRole("button", { name: "บันทึกนัดหมาย" })).toBeVisible({ timeout: 15_000 });
    await page.getByLabel("ประเภทนัดหมาย").selectOption({ index: 1 });
    await page.getByRole("button", { name: "บันทึกนัดหมาย" }).click();
    const นัด = async () => (await admin.from("appointments").select("id, building_type").eq("dealer_code", "RYG").eq("lead_id", เลข)).data ?? [];
    await expect.poll(async () => (await นัด()).length, { timeout: 20_000, message: "นัดหมายต้องลงฐาน" }).toBe(1);
    expect((await นัด())[0].building_type ?? "", "นัดหมายใหม่ต้องไม่มีชื่อแม่แบบเก่า").toBe("");
    await expect(page.getByText(แม่แบบเก่า, { exact: false }), "หน้าจอต้องไม่แสดงชื่อแม่แบบเก่า").toHaveCount(0);
  } finally {
    await admin.from("appointments").delete().eq("dealer_code", "RYG").eq("lead_id", เลข);
    await admin.from("leads").delete().eq("dealer_code", "RYG").eq("num_id", เลข);
  }
});

test("[func·dealer] % บวกตั้งต้นอยู่ที่หน้าตั้งค่า · ค่าเดิมของสาขา (ตั้งรายแม่แบบไว้) ยังอยู่หลังย้าย", async ({ page }) => {
  // ค่าเดิมแบบที่หน้าแม่แบบเคยบันทึก ("ใช้กับทุกแม่แบบ" = ค่าเดียวกันทุกแม่แบบ · ไม่มี defaultPct)
  await ตั้งราคาRYG({ byTemplate: { "tpl-1": 15, "tpl-2": 15 } });
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/settings`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "ตั้งค่าใบเสนอราคา" }).click();
  const ช่อง = page.getByLabel("% บวกตั้งต้น");
  await expect(ช่อง, "ค่าเดิม 15% ต้องย้ายมาแสดงที่หน้าตั้งค่า").toHaveValue("15", { timeout: 20_000 });

  await ช่อง.fill("20");
  await page.getByRole("button", { name: "บันทึก", exact: true }).first().click();
  await expect.poll(async () => {
    const { data } = await admin.from("dealer_settings").select("pricing").eq("dealer_code", "RYG").maybeSingle();
    return (data?.pricing as { defaultPct?: number } | null)?.defaultPct;
  }, { timeout: 20_000, message: "บันทึกลงฐานเป็น defaultPct" }).toBe(20);
});

test("[func] ครบวงจรไม่มีแม่แบบ: ดีลเลอร์พิมพ์งานที่ขอราคา → HQ ทำ BOQ ด้วยรายการที่พิมพ์เอง → ส่งใบ → ดีลเลอร์ทำใบลูกค้า (% จากหน้าตั้งค่า) → won → สั่งผลิต", async ({ browser }) => {
  const sb = await db(RYG);
  const l = await sb.from("leads").insert({ id: `#L-${เลขลีด}`, num_id: เลขลีด, dealer_code: "RYG", company: บริษัท, name: บริษัท,
    contact: "ผู้ทดสอบ", phone: "000-000-0001", province: "ระยอง", status: "BULLET", product: "ZZ-แม่แบบเก่า" });
  expect(l.error).toBeNull();
  const ลีด = async () => (await admin.from("leads").select("status").eq("dealer_code", "RYG").eq("num_id", เลขลีด).single()).data?.status;
  const คำขอ = async () => (await admin.from("quote_requests").select("id, status, product").eq("dealer_code", "RYG").eq("lead_num_id", เลขลีด).order("id", { ascending: false }).limit(1).maybeSingle()).data;

  const ctxD = await browser.newContext(), ctxH = await browser.newContext();
  const d = await ctxD.newPage(), h = await ctxH.newPage();
  const เปิดแผงใบ = async () => {
    await d.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
    await settle(d);
    await d.getByRole("button", { name: "ตาราง" }).click().catch(() => {});
    await d.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(บริษัท);
    const row = d.locator("tbody tr").filter({ hasText: บริษัท }).first();
    await expect(row).toBeVisible({ timeout: 25_000 });
    await row.locator("td").first().click();
    await d.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click();
  };

  // 1) ดีลเลอร์ขอราคา — พิมพ์ชื่องานเอง (ไม่มีตัวเลือกแม่แบบ)
  await loginUI(d, DEALER_ORIGIN, "/login", RYG);
  await เปิดแผงใบ();
  // รอบ 4: ปุ่มขอราคาอยู่ที่กล่องขั้นต่อไปในแผงลีดที่เดียว → เปิดฟอร์มขอราคา
  await d.getByRole("status", { name: "ขั้นต่อไป" }).getByRole("button", { name: /ขอราคาจาก HQ/ }).click({ timeout: 20_000 });
  const แผง = d.locator("[data-panel='quote-request']");
  await expect(แผง.getByLabel("แม่แบบ", { exact: true }), "คำขอราคาต้องไม่มีตัวเลือกแม่แบบ").toHaveCount(0);
  await แผง.getByLabel("งานที่ขอราคา").fill("โกดังเก็บสินค้า 20x40 ม.");
  await แผง.getByLabel("สเปก / รายละเอียด").fill("สูง 8 ม. · ประตูม้วน 2 บาน");
  await แผง.getByRole("button", { name: "ส่งคำขอ" }).click();
  await expect.poll(ลีด, { timeout: 20_000 }).toBe("HQ_PRICING");
  expect((await คำขอ())?.product, "ชื่องานที่พิมพ์ต้องลงฐาน").toBe("โกดังเก็บสินค้า 20x40 ม.");

  // 2) HQ ทำ BOQ ด้วยรายการที่พิมพ์เอง แล้วส่ง
  const rid = Number((await คำขอ())!.id);
  await loginUI(h, HQ_ORIGIN, "/hq/login", ADMIN);
  await h.goto(`${HQ_ORIGIN}/hq/quote-requests`, { waitUntil: "domcontentloaded" });
  await settle(h);
  const { ใบ: กล่อง } = await เปิดใบHQในกล่องงาน(h, บริษัท);
  await expect(กล่อง.getByLabel("เพิ่มรายการจากแม่แบบ"), "BOQ ของ HQ ต้องไม่มีตัวเลือกแม่แบบ").toHaveCount(0);
  if (await กล่อง.getByLabel("ชื่อรายการ 1").count() === 0) await กล่อง.getByRole("button", { name: "เพิ่มรายการอื่น" }).click();
  await กล่อง.getByLabel("ชื่อรายการ 1").fill("โครงสร้างเหล็กพร้อมติดตั้ง");
  await กล่อง.getByLabel("จำนวน 1").fill("800");
  await กล่อง.getByLabel("หน่วย 1", { exact: true }).fill("ตร.ม.");
  await กล่อง.getByLabel("ต้นทุนต่อหน่วย 1").fill("1000");
  await กล่อง.getByRole("button", { name: "ส่งใบ HQ ให้ดีลเลอร์" }).click();
  await กดตกลงในกล่องยืนยัน(h);
  await expect.poll(async () => (await admin.from("hq_quotes").select("status").eq("request_id", rid).maybeSingle()).data?.status, { timeout: 20_000 }).toBe("sent");

  // 3) ดีลเลอร์ทำใบลูกค้า — % ตั้งต้น = ค่าจากหน้าตั้งค่า (20)
  await ตั้งราคาRYG({ defaultPct: 20 });
  await เปิดแผงใบ();
  await d.getByRole("button", { name: /ทำใบให้ลูกค้า/ }).click({ timeout: 25_000 });
  const ตาราง = d.locator("[data-editor='hq-markup']");
  await expect(ตาราง.getByLabel("% ที่บวก 1"), "% ตั้งต้นต้องมาจากหน้าตั้งค่า").toHaveValue("20", { timeout: 20_000 });
  await d.getByRole("button", { name: "สร้างใบเสนอราคา" }).last().click();
  const ใบ = async () => (await admin.from("quotations").select("id, status, total_value, building_type, project").eq("dealer_code", "RYG").eq("deal_id", เลขลีด).maybeSingle()).data;
  await expect.poll(async () => Number((await ใบ())?.total_value ?? 0), { timeout: 25_000, message: "ราคาขาย = 800 × 1,000 × 1.2" }).toBe(960_000);
  expect((await ใบ())?.building_type ?? "", "ใบใหม่ต้องไม่หยิบแม่แบบเก่าของลูกค้าเป้าหมายมาใส่").toBe("");
  expect((await ใบ())?.project ?? "", "ชื่อโครงการต้องไม่ประกอบจากแม่แบบเก่า").not.toContain("ZZ-แม่แบบเก่า");
  await settle(d);

  // 4) ส่งให้ลูกค้า → ลูกค้าตอบรับ → ใบ HQ = สั่งผลิต
  //    รอบ 4: หน้าใบเสนอราคาเป็นรายการอย่างเดียว — ใบต้องโผล่ในรายการ · กดแถว → แผงลีด
  //    ส่ง = กล่องขั้นต่อไป · ลูกค้าตอบรับ = ปุ่มที่ใบในแท็บใบเสนอราคา
  const เลขใบ = (await ใบ())!.id;
  await d.goto(`${DEALER_ORIGIN}/quotations`, { waitUntil: "domcontentloaded" });
  await settle(d);
  await d.getByPlaceholder(/ค้นหา/).first().fill(เลขใบ);
  const qrow = d.locator("tbody tr").filter({ hasText: บริษัท }).first();
  await expect(qrow).toBeVisible({ timeout: 25_000 });
  await ไปแผงลีดจากแถวใบ(qrow);  // 28 ต.ค. 69: กดแถว = แผงดูใบในหน้าเดิม → ปุ่ม "ไปแผงลีด"
  await d.waitForURL(/\/leads/, { timeout: 25_000 });
  await d.getByRole("status", { name: "ขั้นต่อไป" }).getByRole("button", { name: /ส่งให้ลูกค้า/ }).click({ timeout: 25_000 });
  await กดตกลงในกล่องยืนยัน(d);
  await expect.poll(async () => (await ใบ())?.status, { timeout: 25_000 }).toBe("sent_to_client");
  await d.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click();
  await d.locator(`[data-quote-item="${เลขใบ}"] [data-customer-result]`).getByRole("button", { name: /ลูกค้าตอบรับ/ }).click({ timeout: 25_000 });
  await กดตกลงในกล่องยืนยัน(d);
  await expect.poll(ลีด, { timeout: 25_000, message: "won → PAID" }).toBe("PAID");
  expect((await admin.from("hq_quotes").select("status").eq("request_id", rid).single()).data?.status, "ใบ HQ = สั่งผลิต").toBe("ordered");
  await ctxD.close(); await ctxH.close();
});

test("[func·dealer] ใบเก่าที่เคยใช้แม่แบบยังเปิดดูได้ครบ (รายการ · ยอด)", async ({ page }) => {
  const sb = await db(RYG);
  const { data } = await sb.from("quotations").select("id, building_type, total_value").eq("dealer_code", "RYG").is("hq_quote_id", null)
    .like("id", "ZZTEST-BASE-Q-%").neq("building_type", "").limit(1);
  const ใบ = data?.[0];
  expect(ใบ, "ข้อมูลตั้งต้นต้องมีใบเก่าที่ระบุแม่แบบ").toBeTruthy();
  // รอบ 4: หน้าใบเสนอราคาเป็นรายการอย่างเดียว — ดูใบได้ที่แผงลีดของใบนั้นที่เดียว
  //   ใบเก่าในข้อมูลตั้งต้นไม่ผูกลีด (ฐานจริง: ใบไม่ผูกดีล 0 ใบ · ตรวจ 22 ต.ค. 69) → วางใบเก่าแบบเดียวกัน (แม่แบบ + ยอดเดิม) ผูกลีดของข้อนี้
  const แท็ก = `${Date.now() % 100000}`;
  const บริษัทเก่า = `ZZTEST-ใบแม่แบบเก่า-${แท็ก}`, เลขใบ = `ZZTEST-LEGACY-TPL-${แท็ก}`;
  const เลขลีดเก่า = 979_800_000 + (Date.now() % 90_000);
  const ลีด = await admin.from("leads").insert({ id: `#L-${เลขลีดเก่า}`, num_id: เลขลีดเก่า, dealer_code: "RYG", company: บริษัทเก่า, name: บริษัทเก่า,
    phone: "000-000-0003", province: "ระยอง", status: "QUOTED" });
  expect(ลีด.error, `วางลีดไม่สำเร็จ: ${ลีด.error?.message}`).toBeNull();
  วางใบเดิมที่ฐาน([{ id: เลขใบ, dealer_code: "RYG", customer: บริษัทเก่า, deal_id: เลขลีดเก่า, status: "draft", building_type: ใบ!.building_type,
    total_value: ใบ!.total_value, line_items: [{ name: "งานเดิม", qty: 1, unit: "งาน", unitPrice: Number(ใบ!.total_value) }],
    date: new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10) }]);
  try {
    await loginUI(page, DEALER_ORIGIN, "/login", RYG);
    await page.goto(`${DEALER_ORIGIN}/quotations`, { waitUntil: "domcontentloaded" });
    await settle(page);
    await page.getByPlaceholder(/ค้นหา/).first().fill(เลขใบ);
    const แถว = page.locator("tbody tr").filter({ hasText: เลขใบ }).first();
    await expect(แถว).toBeVisible({ timeout: 25_000 });
    await ไปแผงลีดจากแถวใบ(แถว);  // 28 ต.ค. 69: กดแถว = แผงดูใบในหน้าเดิม → ปุ่ม "ไปแผงลีด"
    await page.waitForURL(/\/leads|\/customers/, { timeout: 25_000 });
    await page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click({ timeout: 25_000 });
    await page.locator(`[data-quote-item="${เลขใบ}"]`).getByTitle("ดู", { exact: true }).click({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: /พิมพ์ PDF/ })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("งานเดิม").first(), "รายการของใบเก่าต้องแสดง").toBeVisible();
    const ยอด = Number(ใบ!.total_value).toLocaleString("th-TH");
    await expect(page.getByText(new RegExp(ยอด.replace(/,/g, ",?"))).first(), "ยอดของใบเก่าต้องแสดง").toBeVisible();
  } finally {
    ลบใบทดสอบที่ฐาน(`id = '${เลขใบ}'`);
    await admin.from("leads").delete().eq("dealer_code", "RYG").eq("num_id", เลขลีดเก่า);
  }
});
