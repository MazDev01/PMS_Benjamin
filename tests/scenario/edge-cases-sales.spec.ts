import { test, expect } from "@playwright/test";
import { กดตกลงในกล่องยืนยัน, ดักข้อความแจ้งเตือน, settle } from "./helpers";
import { RYG, skipReason } from "./supabaseEnv";
import {
  DEALER_ORIGIN, loginUI, db, waitRow, cleanup, specNS, nsTag, markQuotationSent, เปิดฟอร์มทำใบจากใบHQ } from "./funcHelpers";
import { validateUpload } from "@pms/shared/lib/uploadLimits";

// ── Edge Case / การใช้งานผิดวิธี: ใบเสนอราคา · ปิดการขาย · เน็ตหลุด ──────────────
//
// ชุด edge-cases เดิมครอบคลุมแค่ "ลูกค้าเป้าหมาย" กับ "หน้าจัดการดีลเลอร์" — ส่วนที่เป็นหัวใจของธุรกิจ
// (ออกใบเสนอราคา → ปิดการขาย → ยอดลูกค้า) ยังไม่เคยถูกทดสอบแบบใช้ผิดวิธีเลย
// ทั้งที่เป็นจุดที่ผิดแล้ว "เสียเงินจริง": ยอดขายบวกซ้ำ ลูกค้าซ้ำ หรือบันทึกไม่ลงแบบเงียบ ๆ
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(240_000);

const NS = specNS("EDGESALE");
const tg = nsTag(NS);

test.beforeAll(async () => { await cleanup(await db(RYG), "RYG", NS); });
test.afterAll(async () => { await cleanup(await db(RYG), "RYG", NS); });

/** สร้างลูกค้าเป้าหมายแล้วเปิดแผงรายละเอียดค้างไว้ */
async function newLeadOpened(page: import("@playwright/test").Page, company: string) {
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);   // รอหน้าพร้อมรับการกดก่อน (ไม่นิ่ง: กดก่อนหน้าพร้อม การกดหาย ฟอร์มไม่เปิด)
  // รอหน้าพร้อมรับการกดก่อน (ไม่ใช่รอเป็นเวลา) — กดตอนหน้ายังไม่พร้อม การกดหาย ฟอร์มไม่เปิด (ไม่นิ่ง 19 ต.ค. 69)
  await settle(page);
  await page.getByRole("button", { name: "เพิ่มลูกค้าเป้าหมาย" }).first().click();
  await page.getByPlaceholder("เช่น บริษัท ตัวอย่าง จำกัด").fill(company);
  await page.getByPlaceholder("ชื่อผู้ติดต่อ").fill("คุณทดสอบ");
  // โทรศัพท์/จังหวัด = ช่องบังคับ (บอสสั่ง 17 ส.ค. 69) — ไม่กรอกจะบันทึกไม่ผ่าน
  await page.getByPlaceholder("0XX-XXX-XXXX").fill("081-000-0000");
  await page.getByRole("dialog").getByLabel("จังหวัด").first().selectOption({ index: 1 });
  await page.getByPlaceholder("เช่น 1200", { exact: true }).fill("500");
  await page.getByRole("button", { name: "บันทึก" }).click();

  const sb = await db(RYG);
  await waitRow(sb, "leads", { company }, 40_000);

  await page.getByRole("button", { name: "ตาราง" }).click();
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(company); // ตารางแบ่งหน้า
  const row = page.locator("tbody tr").filter({ hasText: company }).first();
  await expect(row, "ลูกค้าเป้าหมายที่เพิ่งสร้างต้องโผล่ในตาราง").toBeVisible({ timeout: 30_000 });
  return { sb, row };
}

test("[edge] กดปุ่ม 'สร้างใบเสนอราคา' รัว ๆ → ต้องได้ใบเดียว ไม่ใช่หลายใบ", async ({ page }) => {
  // ออกใบซ้ำ = เลขที่ใบเดินเปล่า + ยอดในระบบเกินจริง + ลูกค้าได้เอกสารซ้ำ
  const company = tg("ใบรัว");
  const { sb, row } = await newLeadOpened(page, company);

  await row.getByRole("button", { name: "ดูรายละเอียด" }).first().click();
  await page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click();
  await เปิดฟอร์มทำใบจากใบHQ(page, "RYG", company);   // ด่าน 3: ใบใหม่ทำจากใบ HQ (ทางสร้างใบแบบเดิมปิดแล้ว)
  await expect(page.getByText("สร้างใบเสนอราคาใหม่")).toBeVisible({ timeout: 30_000 });

  const submit = page.getByRole("button", { name: "สร้างใบเสนอราคา" }).last();
  await Promise.all([0, 1, 2, 3].map(() => submit.click({ force: true, timeout: 5_000 }).catch(() => {})));

  const first = await waitRow<{ id: string }>(sb, "quotations", { customer: company }, 60_000);
  await page.waitForTimeout(5_000); // เผื่อใบที่ 2 ตามมาทีหลัง — ต้องรอถึงจะฟันธงว่าไม่ซ้ำ

  const { data, error } = await sb.from("quotations").select("id").eq("dealer_code", "RYG").eq("customer", company);
  // เคยตกด้วยข้อความ "ได้ []" ทั้งที่บรรทัดบนเพิ่งหาใบเจอ — คือ "เจอแล้วหายไปใน 5 วินาที" ซึ่งอธิบายไม่ได้
  // ตามด้วยเลขที่ใบตรง ๆ เพื่อแยกให้ออกว่าเป็น "ถูกลบทิ้ง" หรือ "ยังอยู่แต่ข้อมูลถูกแก้จนหาไม่เจอ"
  // (ตัวอย่างที่ต่างกันคนละเรื่อง: มีคนลบ vs แอปเขียนทับชื่อลูกค้า vs สิทธิ์อ่านหลุดจนคืนศูนย์แถวเงียบ ๆ)
  if ((data?.length ?? 0) === 0) {
    const byId = await sb.from("quotations").select("id,customer,dealer_code,status").eq("id", first.id);
    const anyRow = await sb.from("quotations").select("id").limit(1);
    throw new Error(
      `ใบที่เพิ่งเจอ (${first.id}) หายไปภายใน 5 วินาที · ` +
      `ค้นด้วยเลขที่ตรง ๆ ได้: ${JSON.stringify(byId.data)} (error: ${JSON.stringify(byId.error)}) · ` +
      `อ่านใบใดก็ได้ในสาขา: ${anyRow.data?.length ?? 0} แถว (error: ${JSON.stringify(anyRow.error)}) · ` +
      `error ของคำสั่งหลัก: ${JSON.stringify(error)}`,
    );
  }
  expect(data?.length, `กดรัว 4 ครั้งต้องได้ใบเดียว — ได้ ${JSON.stringify(data?.map(d => d.id))}`).toBe(1);
});

test("[edge] กด 'ปิดการขายสำเร็จ' รัว ๆ → ลูกค้าต้องมีรายเดียว ยอดต้องไม่บวกซ้ำ", async ({ page }) => {
  // จุดที่ผิดแล้วเสียเงินจริง: ลูกค้าซ้ำ = ฐานลูกค้าเพี้ยน · ยอดบวกซ้ำ = ยอดขายทั้งเครือเกินจริง
  const company = tg("ปิดรัว");
  const { sb, row } = await newLeadOpened(page, company);

  // ต้องมีใบเสนอราคาก่อน ยอดลูกค้าถึงจะมีที่มา
  await row.getByRole("button", { name: "ดูรายละเอียด" }).first().click();
  await page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click();
  await เปิดฟอร์มทำใบจากใบHQ(page, "RYG", company);   // ด่าน 3: ใบใหม่ทำจากใบ HQ (ทางสร้างใบแบบเดิมปิดแล้ว)
  await expect(page.getByText("สร้างใบเสนอราคาใหม่")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "สร้างใบเสนอราคา" }).last().click();
  await waitRow(sb, "quotations", { customer: company }, 60_000);
  // กฎ 19 ส.ค. 69: ต้องมีใบที่ "ส่งแล้ว" ถึงจะปิดการขายได้ — เทสต์นี้ตรวจเรื่องกดรัว ไม่ใช่เรื่องด่าน
  await markQuotationSent(sb, "RYG", company);

  const { data: ใบส่ง } = await sb.from("quotations").select("id").eq("dealer_code", "RYG").eq("customer", company).eq("status", "sent_to_client").limit(1);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "ตาราง" }).click();
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(company);
  const row2 = page.locator("tbody tr").filter({ hasText: company }).first();
  await expect(row2).toBeVisible({ timeout: 30_000 });
  // รอบ 4: ปิดการขายสำเร็จทางเดียว = "ลูกค้าตอบรับ" ที่ใบในแผงลีด (เมนู ▾ เปลี่ยนสถานะเอาออกแล้ว) — กดรัวที่ปุ่มนั้นแทน
  await row2.getByTitle("ดูรายละเอียด").first().click();
  await page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click();

  // ปิดการขายมีกล่องยืนยันทุกครั้ง — กดรัว 3 ที แล้วตอบ "ตกลง" ที่ใบที่ค้างอยู่
  //   กล่องยืนยันของระบบเปิดได้ทีละใบ (ใบใหม่มาปิดใบเก่าแล้วถือว่ายกเลิก) — เจตนาของเทสต์
  //   ยังเหมือนเดิม: กดรัวแล้วต้องได้ลูกค้ารายเดียว ยอดไม่บวกซ้ำ
  const winBtn = page.locator(`[data-quote-item="${ใบส่ง?.[0]?.id}"] [data-customer-result]`).getByRole("button", { name: /ลูกค้าตอบรับ/ });
  await expect(winBtn).toBeVisible({ timeout: 20_000 });
  await Promise.all([0, 1, 2].map(() => winBtn.click({ force: true, timeout: 5_000 }).catch(() => {})));
  // กล่องยืนยันอาจซ้อนขึ้นมาได้หลายใบจากการกดรัว — กรณีแย่สุดคือผู้ใช้กด "ตกลง" ครบทุกใบ (หนักกว่าตอบใบเดียว)
  const กล่อง = page.locator(".pms-confirm[role='alertdialog']");
  await expect(กล่อง.first(), "ต้องมีกล่องยืนยันขึ้นมาก่อน").toBeVisible({ timeout: 15_000 });
  for (let i = 0; i < 5 && (await กล่อง.count()) > 0; i++) {
    await กล่อง.last().locator(".pms-confirm-actions button").last().click();
    await page.waitForTimeout(300);
  }
  await expect(กล่อง).toHaveCount(0, { timeout: 10_000 });

  const cust = await waitRow<{ id: number }>(sb, "customers", { company }, 60_000);
  await page.waitForTimeout(6_000); // เผื่อรายการซ้ำ/ยอดบวกซ้ำตามมาทีหลัง

  const { data: dup } = await sb.from("customers").select("id, total_value")
    .eq("dealer_code", "RYG").eq("company", company);
  expect(dup?.length, `ปิดการขายรัว 3 ครั้งต้องได้ลูกค้ารายเดียว — ได้ ${dup?.length}`).toBe(1);

  // ยอดลูกค้าต้องเท่ากับผลรวมใบที่ปิดได้จริง ไม่ใช่คูณจำนวนครั้งที่กด
  // total = ข้อความไว้โชว์ ("฿2.55M") · total_value = ตัวเลขจริงที่ใช้คำนวณ — ต้องใช้ตัวหลัง
  const { data: quotes } = await sb.from("quotations").select("total_value, status")
    .eq("dealer_code", "RYG").eq("customer_id", cust.id);
  const wonSum = (quotes ?? []).filter(q => q.status === "won").reduce((s, q) => s + Number(q.total_value ?? 0), 0);
  expect(Number(dup?.[0]?.total_value ?? -1),
    `ยอดลูกค้าต้องเท่ากับผลรวมใบที่ปิดสำเร็จ (${wonSum}) ไม่ใช่บวกซ้ำตามจำนวนครั้งที่กด`,
  ).toBe(wonSum);
});

test("[edge] แนบไฟล์ที่ลูกค้าเป้าหมาย: ไฟล์ใหญ่เกิน/ชนิดที่ไม่รับ ต้องถูกปฏิเสธพร้อมบอกเหตุผล", async ({ page }) => {
  // ช่องแนบไฟล์ในแผงลูกค้าเป้าหมายเคยไม่ตรวจอะไรเลย ทั้งที่เขียนลง "คลังไฟล์รวม" ก้อนเดียวกับหน้าไฟล์
  // และแผงลูกค้าซึ่งตรวจอยู่แล้ว → ไฟล์ 100 MB หรือ .exe เข้าระบบได้ทางนี้ทางเดียว
  const company = tg("แนบไฟล์");
  const { sb, row } = await newLeadOpened(page, company);

  // ข้อความเตือนเป็นของระบบ (sonner) แล้ว ไม่ใช่กล่องเบราว์เซอร์ (บอสสั่ง 2 ก.ย. 69)
  const แจ้งเตือน = ดักข้อความแจ้งเตือน(page);

  await row.getByRole("button", { name: "ดูรายละเอียด" }).first().click();
  const fileInput = page.locator('input[type="file"]:not([accept*="image"])').first();
  await fileInput.waitFor({ state: "attached", timeout: 30_000 });

  // 1) ไฟล์ชนิดที่ไม่รับ
  await fileInput.setInputFiles({
    name: tg("โปรแกรม") + ".exe", mimeType: "application/x-msdownload", buffer: Buffer.from("MZ\x90\x00"),
  });
  // รอแบบ poll — ห้ามรอเป็นเวลาตายตัว ตอนเครื่องรับงานหนักกล่องข้อความขึ้นช้ากว่านั้นได้
  await expect.poll(() => แจ้งเตือน().join(" | "),
    { timeout: 20_000, message: "ไฟล์ .exe ต้องถูกปฏิเสธพร้อมบอกว่ารับชนิดไหนบ้าง" }).toMatch(/ไม่รองรับ/);

  // 2) เพดานขนาดไฟล์ — ตรวจที่ตัวกฎโดยตรง ไม่ยิงไฟล์ 26 MB ผ่านเบราว์เซอร์
  //    การส่งไฟล์ 26 MB เข้าช่องเลือกไฟล์กินเวลาหลายสิบวินาทีตอนเครื่องรับงานหนัก ทำให้เทสต์แกว่ง
  //    ทั้งที่กฎขนาดเป็นตรรกะล้วน ๆ ผลเท่ากันแต่นิ่งกว่ามาก
  //    ส่วน "กฎถูกต่อสายเข้าหน้าจอจริงหรือไม่" ข้อ .exe ด้านบนพิสูจน์ให้แล้ว
  //    เพดาน = 50 MB (บอสเลือก 16 ก.ย. 69 "25 MB มันเล็กไปไหม" · commit 229fb15 · ใบ 0181) — เดิมข้อนี้ยังตรวจ 25 MB
  //    ตรวจสองฝั่งของเส้น: เกิน 50 ต้องถูกปฏิเสธและบอกเพดานใหม่ · 26 MB (เคยถูกปฏิเสธ) ต้องผ่านแล้ว
  expect(validateUpload({ name: "แบบใหญ่.pdf", size: 51 * 1024 * 1024 }) ?? "",
    "ไฟล์เกิน 50 MB ต้องถูกปฏิเสธพร้อมบอกขนาดที่รับได้").toMatch(/ใหญ่เกินไป.*ไม่เกิน 50 MB/);
  expect(validateUpload({ name: "ชุดแบบแปลน.pdf", size: 26 * 1024 * 1024 }),
    "ไฟล์ 26 MB ต้องผ่าน — เพดานขยับเป็น 50 MB แล้ว").toBeNull();
  expect(validateUpload({ name: "พอดีเพดาน.pdf", size: 50 * 1024 * 1024 }),
    "ไฟล์ 50 MB พอดีต้องผ่าน").toBeNull();
  expect(validateUpload({ name: "แบบปกติ.pdf", size: 2 * 1024 * 1024 }),
    "ไฟล์ PDF ขนาดปกติต้องผ่าน — กฎต้องไม่เข้มจนใช้งานจริงไม่ได้").toBeNull();

  // ไฟล์ที่ถูกปฏิเสธต้องไม่หลุดลงระบบ
  //   ดูเฉพาะนามสกุลที่ไม่รับ ไม่ใช่ "ต้องไม่มีไฟล์ของสเปกนี้เลย" — เพราะสองเทสต์ก่อนหน้าออกใบเสนอราคา
  //   ซึ่งระบบแนบไฟล์ PDF ของใบให้อัตโนมัติ (ของถูกต้อง) เคยเขียนกว้างไปแล้วจับผิดตัว
  //   ตั้งชื่อไฟล์ใต้ป้ายของสเปกเสมอ ถ้าหลุดเข้าระบบจะถูกเก็บกวาดทิ้งอัตโนมัติ
  const { data } = await sb.from("files").select("id, name")
    .eq("dealer_code", "RYG").like("name", `%${NS}%`);
  const banned = (data ?? []).filter(f => /\.(exe|txt|bat|sh)$/i.test(String(f.name)));
  expect(banned, `ไฟล์ชนิดที่ไม่รับต้องไม่ลงระบบ — พบ ${JSON.stringify(banned)}`).toEqual([]);
});

test("[edge] เน็ตหลุดตอนกดบันทึกลูกค้าเป้าหมาย → ต้องเตือนให้เห็น ห้ามเงียบเหมือนบันทึกสำเร็จ", async ({ page }) => {
  // อาการที่อันตรายที่สุดคือ "ดูเหมือนสำเร็จ" — เซลส์ปิดหน้าไปแล้วข้อมูลไม่เคยลงระบบ
  // ของจริงเกิดได้ตลอด: เน็ตมือถือหลุด · wifi สลับ · เซิร์ฟเวอร์ตอบช้าเกินจนหลุด
  const company = tg("เน็ตหลุด");
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);   // รอหน้าพร้อมรับการกดก่อน (เหตุผลเดียวกับ newLeadOpened)

  // ตัดเฉพาะ "คำสั่งบันทึกลูกค้าเป้าหมาย" — ส่วนอื่นของหน้ายังทำงานปกติ (จำลองเน็ตสะดุดช่วงสั้น ๆ)
  // ⚠️ ต้องดักทั้งสองโหมด — supabase ยิงเข้า /rest/v1/leads ตรง ๆ · api ยิงเข้า /api/v1/leads
  //    ดักทางเดียวแล้วสลับโหมด = คำสั่งไม่เคยถูกตัด เทสต์ล้มเหมือนระบบมีบั๊ก ทั้งที่เทสต์ดักผิดที่
  // ⚠️ ต้องดักทั้งสองโหมด — supabase ยิงเข้า /rest/v1/leads ตรง ๆ · api ยิงเข้า /api/v1/leads
  //    และต้องตัด "เฉพาะคำสั่งสร้าง" เท่านั้น — โหมด api ขอเลขที่ถัดไปด้วย POST /api/v1/leads?op=next
  //    ถ้าดักเหมารวม จะไปตัดขั้นขอเลขแทน = คนละจังหวะกับที่ตั้งใจวัด
  await page.route(/\/rest\/v1\/leads(\?|$)|\/api\/v1\/leads$/, async (route) => {
    if (route.request().method() === "POST") return route.abort("connectionfailed");
    return route.continue();
  });

  await page.getByRole("button", { name: "เพิ่มลูกค้าเป้าหมาย" }).first().click();
  await page.getByPlaceholder("เช่น บริษัท ตัวอย่าง จำกัด").fill(company);
  await page.getByPlaceholder("ชื่อผู้ติดต่อ").fill("คุณเน็ตหลุด");
  // โทรศัพท์/จังหวัด = ช่องบังคับ (บอสสั่ง 17 ส.ค. 69) — ไม่กรอกจะบันทึกไม่ผ่าน
  await page.getByPlaceholder("0XX-XXX-XXXX").fill("081-000-0000");
  await page.getByRole("dialog").getByLabel("จังหวัด").first().selectOption({ index: 1 });
  await page.getByRole("button", { name: "บันทึก" }).click();

  // ต้องมีข้อความบอกผู้ใช้ว่าบันทึกไม่สำเร็จ — ไม่ใช่ปิดฟอร์มแล้วจบเหมือนปกติ
  await expect(page.getByText(/บันทึกไม่สำเร็จ/).first(),
    "เน็ตหลุดตอนบันทึก ต้องขึ้นข้อความเตือนให้ผู้ใช้เห็น ห้ามเงียบ",
  ).toBeVisible({ timeout: 30_000 });

  // และต้องไม่มีลูกค้าเป้าหมายค้างอยู่บนจอให้เข้าใจผิดว่าบันทึกแล้ว
  const sb = await db(RYG);
  const { data } = await sb.from("leads").select("id").eq("company", company);
  expect(data?.length ?? 0, "ลูกค้าเป้าหมายต้องไม่ถูกบันทึกจริง (คำสั่งถูกตัดไปแล้ว)").toBe(0);
});

// ── ใบเสนอราคา: ตัวเลขที่กรอกผิด/จงใจกรอกมั่ว ต้องไม่ทำให้ยอดเพี้ยน ────────────────
// ยอดในใบเสนอราคาคือตัวเลขที่ไหลต่อไปเป็น "ยอดขายของสาขา" และ "ยอดสะสมของลูกค้า"
// ผิดตรงนี้ = ตัวเลขที่ผู้บริหารใช้ตัดสินใจผิดตามทั้งสาย
// ด่าน 3: ใบใหม่ทำจากใบ HQ — จำนวน/ต้นทุนล็อกจากใบ HQ ดีลเลอร์กรอกได้ช่องเดียวคือ % ที่บวก
//   เจตนาเดิมของกลุ่มนี้ (กรอกติดลบ / พิมพ์เลขเกิน / ภาษีปัดเศษ / ยอดศูนย์) วัดบนช่อง % แทนช่องจำนวน/ราคา
async function openQuoteForm(page: import("@playwright/test").Page, company: string, lines?: { name: string; qty: number; unit: string; unitCost: number }[]) {
  await newLeadOpened(page, company);
  await เปิดฟอร์มทำใบจากใบHQ(page, "RYG", company, lines);
  const ตาราง = page.locator("[data-editor='hq-markup']");
  return { ตาราง, pct: ตาราง.getByLabel("% ที่บวก 1"), ราคา: ตาราง.getByTestId("hq-line-price-0") };
}

test("[edge] กรอก % ติดลบในใบเสนอราคา → ต้องไม่ติดลบ และยอดต้องไม่ติดลบ (ขายต่ำกว่าทุนไม่ได้)", async ({ page }) => {
  const company = tg("ติดลบ");
  const { ตาราง, pct, ราคา } = await openQuoteForm(page, company, [{ name: "งานทดสอบติดลบ", qty: 2, unit: "ชุด", unitCost: 1000 }]);
  await expect(ตาราง.locator('input[aria-label^="จำนวน"]'), "จำนวนมาจากใบ HQ แก้ไม่ได้").toHaveCount(0);

  // fill() พิมพ์ค่าลงช่องตรง ๆ ข้าม min=0 ของเบราว์เซอร์ได้ — จำลองคนที่ตั้งใจเลี่ยง
  await pct.fill("-50");
  await pct.blur();
  await page.waitForTimeout(500);
  expect(Number(await pct.inputValue() || 0), "% ติดลบต้องถูกปรับเป็น 0").toBeGreaterThanOrEqual(0);
  expect(Number((await ราคา.innerText()).replace(/,/g, "")), "ราคาขายต้องไม่ต่ำกว่าต้นทุน").toBeGreaterThanOrEqual(1000);

  const panel = await page.locator("body").innerText();
  expect(/-\s*฿|฿\s*-/.test(panel), "ต้องไม่มียอดติดลบโผล่บนหน้าจอเลย").toBe(false);
});

test("[edge] พิมพ์ % มหาศาล → ราคาต่อหน่วยต้องถูกจำกัดที่เพดาน ไม่บวมเป็นยอดพันล้าน", async ({ page }) => {
  // เคสจริง: พิมพ์ 0 เกินโดยไม่ตั้งใจ แล้วใบหลุดออกไปหาลูกค้าด้วยยอดผิดมหาศาล
  const company = tg("เลขบวม");
  const { pct, ราคา } = await openQuoteForm(page, company, [{ name: "งานทดสอบเลขบวม", qty: 1, unit: "ชุด", unitCost: 1000 }]);
  await pct.fill("999999999");
  await pct.blur();
  await page.waitForTimeout(500);
  expect(Number((await ราคา.innerText()).replace(/,/g, "")), "ราคาต่อหน่วยต้องไม่เกินเพดาน 100 ล้าน").toBeLessThanOrEqual(100_000_000);
});

test("[edge] VAT ต้องคำนวณจากยอดก่อน VAT ให้ตรง ไม่ปัดเศษเพี้ยน", async ({ page }) => {
  // ตั้งยอดให้มีเศษสตางค์แน่ ๆ (999 × 7% = 69.93) แล้วดูว่าระบบปัดและบวกถูกไหม — ต้นทุน 333 × 3 บวก 0%
  const company = tg("ภาษี");
  const { pct } = await openQuoteForm(page, company, [{ name: "งานทดสอบภาษี", qty: 3, unit: "ชุด", unitCost: 333 }]);
  await pct.fill("0");
  await page.waitForTimeout(800);

  const text = await page.locator("body").innerText();
  // คำบนจอเปลี่ยนตอนเพิ่มภาษีหัก ณ ที่จ่าย (28 ส.ค. 69): "VAT 7%" → "ภาษีมูลค่าเพิ่ม 7%"
  //   และ "ยอดรวมสุทธิ (รวม VAT)" → "รวมเป็นเงิน" (แล้วหัก ณ ที่จ่ายค่อยลบต่อเป็น "ยอดชำระสุทธิ")
  const vatPct = Number(text.match(/ภาษีมูลค่าเพิ่ม\s+(\d+(?:\.\d+)?)%/)?.[1] ?? "0");
  expect(vatPct, "ต้องอ่านอัตราภาษีมูลค่าเพิ่มที่ระบบใช้อยู่ได้").toBeGreaterThan(0);

  const net = 3 * 333;
  // ปัดเป็นสตางค์ทีละบรรทัดเหมือนสูตรจริง (quoteTax.ts) — 999 × 7% = 69.93 ไม่ใช่ 70
  const expectedVat = Math.round(net * vatPct) / 100;
  const expectedGrand = Math.round((net + expectedVat) * 100) / 100;

  // ยอดรวมเป็นเงินที่โชว์ต้องเท่ากับ ยอดก่อน VAT + VAT ที่ปัดสตางค์แล้ว
  const shown = text.match(/รวมเป็นเงิน\s*\+?\s*฿?([\d,]+(?:\.\d+)?)/)?.[1]?.replace(/,/g, "");
  expect(Number(shown ?? -1),
    `ยอดรวมเป็นเงินต้องเป็น ${expectedGrand} (ก่อน VAT ${net} + VAT ${vatPct}% = ${expectedVat})`,
  ).toBeCloseTo(expectedGrand, 2);
});

test("[edge] ใบเสนอราคายอด 0 บาท ต้องออกไม่ได้", async ({ page }) => {
  // ใบยอด 0 = เอกสารที่ส่งให้ลูกค้าไม่ได้จริง แต่ไหลไปนับใน "จำนวนใบเสนอราคา" ของสาขา
  // ด่าน 3: จำนวน/ต้นทุนมาจากใบ HQ (ฐานไม่ให้ HQ ส่งใบยอด 0 · quote_empty) และ % ติดลบไม่ได้ → ยอดศูนย์เกิดไม่ได้โดยโครงสร้าง
  //   ข้อนี้ยืนยันว่าดีลเลอร์ไม่มีช่องไหนทำให้ยอดเป็น 0 ได้: ไม่มีช่องจำนวน/ราคา และ % ต่ำสุด (0) ยอดยังเท่าต้นทุน
  const company = tg("ยอดศูนย์");
  const { ตาราง, pct, ราคา } = await openQuoteForm(page, company, [{ name: "งานทดสอบยอดศูนย์", qty: 1, unit: "ชุด", unitCost: 500 }]);
  await expect(ตาราง.locator('input[aria-label^="จำนวน"], input[aria-label="ราคาต่อหน่วย"]'), "ไม่มีช่องจำนวน/ราคาให้แก้").toHaveCount(0);
  await pct.fill("0");
  await page.waitForTimeout(500);
  expect(Number((await ราคา.innerText()).replace(/,/g, "")), "% ต่ำสุดแล้วยอดยังเท่าต้นทุน ไม่ใช่ 0").toBe(500);
});

test("[edge] ปิดการขายสำเร็จแล้ว — ยอดลูกค้าต้องเท่ากับใบที่ชนะเสมอ แม้พยายามย้อนสถานะ", async ({ page }) => {
  // กติกาธุรกิจ: ปิดการขายแล้วย้อนไม่ได้ (แอปถามยืนยันก่อนทุกครั้งว่า "ย้อนกลับไม่ได้")
  // สิ่งที่ต้องจริงเสมอไม่ว่าจะกดอะไรต่อ: ยอดสะสมของลูกค้า = ผลรวมใบที่สถานะ "ชนะ" เท่านั้น
  //   ถ้าวันไหนเปิดให้ย้อนสถานะได้ แล้วลืมปรับยอดลง เทสต์นี้จะจับได้ทันที
  const company = tg("ย้อนสถานะ");
  const { sb, row } = await newLeadOpened(page, company);

  await row.getByRole("button", { name: "ดูรายละเอียด" }).first().click();
  await page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click();
  await เปิดฟอร์มทำใบจากใบHQ(page, "RYG", company);   // ด่าน 3: ใบใหม่ทำจากใบ HQ (ทางสร้างใบแบบเดิมปิดแล้ว)
  await expect(page.getByText("สร้างใบเสนอราคาใหม่")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "สร้างใบเสนอราคา" }).last().click();
  const q = await waitRow<{ id: string }>(sb, "quotations", { customer: company }, 60_000);

  // ส่งใบ → ปิดการขายสำเร็จ — รอบ 4: ทั้งสองอย่างอยู่ในแผงลีด (ส่ง = กล่องขั้นต่อไป · ปิด = "ลูกค้าตอบรับ" ที่ใบ)
  //   หน้าใบเสนอราคาเหลือรายการอย่างเดียว ไม่มีปุ่มส่ง/ตอบรับแล้ว
  await page.getByRole("status", { name: "ขั้นต่อไป" }).getByRole("button", { name: /ส่งให้ลูกค้า/ }).click({ timeout: 30_000 });
  await กดตกลงในกล่องยืนยัน(page);
  await expect.poll(async () => (await sb.from("quotations").select("status").eq("id", q.id)).data?.[0]?.status,
    { timeout: 45_000, message: "ใบต้องเป็น 'ส่งแล้ว'" }).toBe("sent_to_client");

  await page.locator(`[data-quote-item="${q.id}"] [data-customer-result]`).getByRole("button", { name: /ลูกค้าตอบรับ/ }).click({ timeout: 30_000 });
  await กดตกลงในกล่องยืนยัน(page);
  await expect.poll(async () => (await sb.from("quotations").select("status").eq("id", q.id)).data?.[0]?.status,
    { timeout: 60_000, message: "ใบต้องเป็น 'ชนะ'" }).toBe("won");

  const cust = await waitRow<{ id: number }>(sb, "customers", { company }, 60_000);

  // ลองย้อนสถานะเท่าที่หน้าจอเปิดให้ทำ — ถ้าไม่มีปุ่มให้กด แปลว่าระบบล็อกไว้ตามกติกา (ถูกต้อง)
  const rejectBtn = page.getByRole("button", { name: "ลูกค้าปฏิเสธ", exact: true });
  const canRevert = await rejectBtn.count() > 0 && await rejectBtn.first().isEnabled().catch(() => false);
  if (canRevert) {
    await rejectBtn.first().click();
    const picker = page.getByText("เลือกเหตุผลที่ลูกค้าปฏิเสธใบเสนอราคานี้");
    if (await picker.isVisible().catch(() => false)) {
      await picker.locator("xpath=following-sibling::div[1]//button").first().click();
      await page.getByRole("button", { name: "ยืนยัน", exact: true }).click();
    }
    await page.waitForTimeout(6_000);
  }
  console.log(`[edge] หน้าจอเปิดให้ย้อนสถานะใบที่ชนะแล้วหรือไม่: ${canRevert ? "ได้" : "ไม่ได้ (ล็อกไว้)"}`);

  // ตรวจกติกาที่ต้องจริงเสมอ: ยอดลูกค้า = ผลรวมเฉพาะใบที่ชนะ
  await expect.poll(async () => {
    const { data: qs } = await sb.from("quotations").select("total_value, status")
      .eq("dealer_code", "RYG").eq("customer_id", cust.id);
    const wonSum = (qs ?? []).filter(x => x.status === "won").reduce((s, x) => s + Number(x.total_value ?? 0), 0);
    const { data: c } = await sb.from("customers").select("total_value")
      .eq("dealer_code", "RYG").eq("id", cust.id);
    return `${Number(c?.[0]?.total_value ?? -1)}|${wonSum}`;
  }, { timeout: 30_000, message: "ยอดสะสมของลูกค้าต้องเท่ากับผลรวมใบที่ชนะเสมอ" })
    .toMatch(/^(\d+)\|\1$/);
});
