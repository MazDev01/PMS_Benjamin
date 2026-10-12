import { test, expect } from "@playwright/test";
import { RYG, ADMIN, skipReason } from "./supabaseEnv";
import { DEALER_ORIGIN, HQ_ORIGIN, loginUI, db, waitRow, cleanup, specNS, nsTag } from "./funcHelpers";
import { settle } from "./helpers";

// ── สิ่งที่หน้าจอโชว์ ต้องเท่ากับสิ่งที่บันทึกลงระบบจริง ─────────────────────────────
//
// บั๊กจริงที่เทสต์นี้เกิดมาเพื่อกัน (เอเจนต์สวมบทเซลส์เจอเอง 10 ส.ค. 69):
//   ฟอร์มลูกค้าเป้าหมายแสดงว่าเลือก "โกดังสำเร็จรูป" ไว้แล้ว แต่ค่าจริงในระบบเป็นว่าง
//   เซลส์บันทึก → ออกใบเสนอราคาไม่ได้เลย เพราะตารางรายการต้องใช้แม่แบบ
//   ย้อนกลับมาดูก็ยังเห็นแม่แบบเลือกอยู่ ไม่มีทางเดาถูกว่าอะไรผิด = ทางตันของงานขาย
//
// ต้นเหตุ 2 ชั้น:
//   1) ค่าตั้งต้นของฟอร์มอ่านจากแคตตาล็อกที่ยังโหลดไม่เสร็จ (useState อ่านครั้งเดียว) → ค้างเป็นว่าง
//   2) ช่องเลือกไม่มีตัวเลือกว่างให้ตรง → เบราว์เซอร์เอาตัวเลือกแรกมาโชว์แทนตามมาตรฐาน HTML
//
// ⚠️ ทำไมต้องเป็นเทสต์ ไม่ใช่ตัวตรวจอ่านโค้ด:
//   ลองเขียนตัวตรวจแบบอ่านโค้ดแล้ว (10 ส.ค. 69) แยก "ช่องกรองที่ค่าว่างเกิดไม่ได้"
//   ออกจาก "ช่องกรอกที่ค่าว่างเกิดได้" ไม่ไหว เหลือสัญญาณเตือนหลอก 16 จุด
//   ซึ่งจะทำให้คนเลิกอ่านตัวตรวจไปเลย · และที่ชั้น DOM ก็มองไม่เห็นความต่างนี้ด้วย
//   เพราะเบราว์เซอร์ตั้งค่า selectedIndex เป็น 0 ให้เอง ค่าที่อ่านได้เลยดูเหมือนถูก
//   → ต้องบันทึกจริงแล้วเทียบกับฐานข้อมูลเท่านั้นถึงจะเห็น
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(180_000);
test.describe.configure({ mode: "serial" });

const NS = specNS("SHOWSAVE");
const tg = nsTag(NS);
const COMPANY = tg("โชว์ตรงกับที่บันทึก");

test.beforeAll(async () => { await cleanup(await db(RYG), "RYG", NS); });
test.afterAll(async () => { await cleanup(await db(RYG), "RYG", NS); });

test("[func] ฟอร์มลูกค้าเป้าหมาย: แม่แบบที่หน้าจอโชว์ ต้องเป็นค่าที่ลงฐานข้อมูลจริง", async ({ page }) => {
  const sb = await db(RYG);

  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });

  // ⚠️ จงใจกดเปิดฟอร์ม "ทันที" ไม่รอให้แคตตาล็อกโหลดเสร็จ — นี่คือจังหวะที่บั๊กเกิด
  //   ถ้ารอจนทุกอย่างนิ่งก่อน จะไม่มีวันเจอ (และนี่คือเหตุผลที่มันรอดมาถึงตอนนี้)
  await page.getByRole("button", { name: "เพิ่มลูกค้าเป้าหมาย" }).first().click();
  // บรรทัดคำอธิบายใต้หัวข้อถูกเอาออกแล้ว (28 ส.ค. 69) — ยึดกล่องแทน ชี้ชัดกว่าข้อความในกล่องอยู่แล้ว
  await expect(page.getByRole("dialog", { name: "เพิ่มลูกค้าเป้าหมาย" })).toBeVisible();

  await page.getByPlaceholder("เช่น บริษัท ตัวอย่าง จำกัด").fill(COMPANY);
  await page.getByPlaceholder("ชื่อผู้ติดต่อ").fill("คุณทดสอบ");
  // โทรศัพท์/จังหวัด = ช่องบังคับ (บอสสั่ง 17 ส.ค. 69) — ไม่กรอกจะบันทึกไม่ผ่าน
  await page.getByPlaceholder("0XX-XXX-XXXX").fill("081-000-0000");
  await page.getByRole("dialog").getByLabel("จังหวัด").first().selectOption({ index: 1 });
  // โทรศัพท์/จังหวัด เป็นช่องบังคับแล้ว (บอสสั่ง 17 ส.ค. 69) — ไม่กรอกจะบันทึกไม่ผ่าน
  await page.getByPlaceholder("0XX-XXX-XXXX").fill("081-234-5678");
  await page.getByRole("dialog").getByLabel("จังหวัด").first().selectOption({ index: 1 });

  // ⚠️ ต้องอ่าน "สิ่งที่ผู้ใช้เห็น" ณ วินาทีที่กดบันทึก ไม่ใช่ก่อนหน้านั้น
  //   แคตตาล็อกมาถึงทีหลังแล้วเติมค่าตั้งต้นให้ ซึ่งถูกต้องตามที่ออกแบบไว้
  //   ถ้าอ่านเร็วเกินไปจะได้ค่าคนละจังหวะกับตอนบันทึก แล้วเทสต์ตกทั้งที่ระบบทำถูก
  await expect(page.getByLabel("แม่แบบ").first()).toBeVisible();
  await page.waitForTimeout(1500);   // เผื่อให้แคตตาล็อกมาถึงและเติมค่าตั้งต้นเสร็จ
  // ⚠️ ต้องเทียบ "ค่าที่เบราว์เซอร์ถือว่าถูกเลือกอยู่" (value) ไม่ใช่ข้อความที่เห็น (text)
  //   ป้ายบางตัวมีคำต่อท้ายเพื่อความเข้าใจ เช่น "โกดังสำเร็จรูป · ทั่วไป" ซึ่งค่าจริงคือ "โกดังสำเร็จรูป"
  //   และที่สำคัญ: value นี่แหละคือตัวที่จับกับดักได้ — เมื่อค่าจริงในโปรแกรมเป็นว่างแต่ไม่มีตัวเลือกว่าง
  //   เบราว์เซอร์จะเลื่อนไปเลือกตัวแรกให้เอง แล้ว value ก็จะไม่ตรงกับที่บันทึกลงระบบทันที
  const sel = page.getByLabel("แม่แบบ").first();
  const shown = await sel.evaluate(el => (el as HTMLSelectElement).value);
  const shownText = await sel.evaluate(el => { const s = el as HTMLSelectElement; return s.options[s.selectedIndex]?.text ?? ""; });

  await page.getByRole("button", { name: "บันทึก" }).click();

  const row = await waitRow<{ company: string; product: string | null }>(sb, "leads", { company: COMPANY });
  const saved = row.product ?? "";

  // ถ้าจอโชว์ชื่อแม่แบบจริง ค่าที่บันทึกต้องเป็นชื่อนั้น
  // ถ้าจอโชว์ "ยังไม่ระบุ" ค่าที่บันทึกต้องว่าง — อย่างใดอย่างหนึ่ง ห้ามขัดกัน
  expect(saved, `จอโชว์ "${shownText}" แต่บันทึกเป็น "${saved || "(ว่าง)"}" — ผู้ใช้จะออกใบเสนอราคาไม่ได้โดยไม่รู้สาเหตุ`).toBe(shown);
});

test("[func] ฟอร์มลูกค้าเป้าหมาย: มูลค่าที่กรอกแล้วอ่านไม่ออก ต้องฟ้อง ไม่ใช่บันทึกเป็น 0 เงียบ ๆ", async ({ page }) => {
  const sb = await db(RYG);
  const C2 = tg("มูลค่ามั่ว");

  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "เพิ่มลูกค้าเป้าหมาย" }).first().click();
  // บรรทัดคำอธิบายใต้หัวข้อถูกเอาออกแล้ว (28 ส.ค. 69) — ยึดกล่องแทน ชี้ชัดกว่าข้อความในกล่องอยู่แล้ว
  await expect(page.getByRole("dialog", { name: "เพิ่มลูกค้าเป้าหมาย" })).toBeVisible();

  await page.getByPlaceholder("เช่น บริษัท ตัวอย่าง จำกัด").fill(C2);
  await page.getByPlaceholder("ชื่อผู้ติดต่อ").fill("คุณทดสอบ");
  // โทรศัพท์/จังหวัด = ช่องบังคับ (บอสสั่ง 17 ส.ค. 69) — ไม่กรอกจะบันทึกไม่ผ่าน
  await page.getByPlaceholder("0XX-XXX-XXXX").fill("081-000-0000");
  await page.getByRole("dialog").getByLabel("จังหวัด").first().selectOption({ index: 1 });
  await page.getByPlaceholder("เช่น 1200000 หรือ ฿1.2M").first().fill("abcxyz");
  await page.getByRole("button", { name: "บันทึก" }).click();

  // ต้องเห็นข้อความบอกเหตุผล และต้องไม่มีลูกค้าเป้าหมายลงฐานข้อมูล
  await expect(page.getByText(/มูลค่าอ่านไม่ออก/)).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(1500);
  const { data } = await sb.from("leads").select("id").eq("dealer_code", "RYG").eq("company", C2);
  expect(data?.length ?? 0, "กรอกมูลค่าผิดแล้วต้องไม่บันทึกลงฐานข้อมูล").toBe(0);
});

// ── สำนักงานใหญ่: ตั้งราคากลางด้วยค่าที่ใช้ไม่ได้ ต้องฟ้อง ห้ามปิดกล่องเงียบ ──────────
//
// บั๊กจริง (เอเจนต์สวมบทผู้ดูแล HQ เจอเอง 10 ส.ค. 69):
//   กรอกราคาเป็น 0 หรือติดลบ แล้วกดบันทึก → กล่องปิดลงเหมือนบันทึกสำเร็จ
//   แต่ราคาไม่เปลี่ยนเลย ไม่มีข้อความ ไม่มีบันทึกการใช้งาน ไม่มีข้อผิดพลาด
//   ผู้ดูแลเชื่อว่าปรับราคากลางทั้งเครือแล้ว แต่ดีลเลอร์ทุกสาขายังเห็นราคาเดิม
//
// ⚠️ 28 ส.ค. 69 ปุ่ม "ปรับราคา" ถูกยุบรวมเข้ากับ "แก้ไข" (บอสสั่ง — สองปุ่มทับกัน)
//    ด่านนี้ต้องยังอยู่ที่เดิมของมัน แค่ย้ายมาอยู่ในกล่องแก้ไขแทน
//
// เทสต์นี้ทดสอบเฉพาะ "ทางที่ต้องถูกปฏิเสธ" จึงไม่แตะราคาจริงของแคตตาล็อกเลย
test("[func·hq] ตั้งราคากลางเป็น 0 ต้องขึ้นเหตุผล และกล่องต้องไม่ปิด", async ({ page }) => {
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await page.goto(`${HQ_ORIGIN}/hq/master`, { waitUntil: "domcontentloaded" });

  // รอให้แคตตาล็อกขึ้นก่อน — ปุ่มแก้ไขอยู่ในการ์ดของแต่ละแม่แบบ ยังไม่มีการ์ดก็ยังไม่มีปุ่ม
  // ⚠️ ต้องใส่ exact — การ์ดทั้งใบก็เป็นปุ่ม ถ้าไม่ระบุให้ตรงเป๊ะจะไปกดโดนการ์ดแทนปุ่มจริง
  const editBtn = page.getByRole("button", { name: "แก้ไข", exact: true }).first();
  await expect(editBtn).toBeVisible({ timeout: 20_000 });
  await editBtn.click();

  // ช่องกรอกราคาโผล่ = กล่องเปิดแล้วจริง (ใช้ตัวนี้แทนการจับข้อความหัวกล่อง ซึ่งเปลี่ยนตามชื่อแม่แบบ)
  const priceInput = page.getByLabel("ราคากลาง (บาท)");
  await expect(priceInput).toBeVisible({ timeout: 15_000 });
  await priceInput.fill("0");
  await page.getByRole("button", { name: "บันทึก", exact: true }).last().click();

  await expect(page.getByText("ราคากลางต้องมากกว่า 0 บาท")).toBeVisible({ timeout: 10_000 });
  await expect(priceInput, "กล่องต้องยังเปิดอยู่ ไม่ใช่ปิดไปเหมือนสำเร็จ").toBeVisible();
});

test("[func] ดาว * ต้องกันการบันทึกจริง — โทรศัพท์/จังหวัดว่าง ต้องบันทึกไม่ผ่าน", async ({ page }) => {
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: /เพิ่มลูกค้าเป้าหมาย/ }).first().click();
  await page.waitForTimeout(1200);
  const dlg = page.getByRole("dialog");
  await dlg.getByPlaceholder("เช่น บริษัท ตัวอย่าง จำกัด").fill("ZZREQ ทดสอบดาว");
  await dlg.getByPlaceholder("ชื่อผู้ติดต่อ").fill("ผู้ทดสอบ");
  await dlg.getByRole("button", { name: "บันทึก" }).click();
  await page.waitForTimeout(800);
  // ดาวหลอก = ป้ายกำกับบอกว่าบังคับ แต่ระบบไม่ตรวจจริง — เทสต์นี้กันไว้
  const err = await dlg.locator("text=/กรอกให้ครบก่อนบันทึก/").innerText().catch(() => "");
  expect(err).toContain("โทรศัพท์");
  expect(err).toContain("จังหวัด");
  await expect(dlg, "ต้องยังไม่ปิดฟอร์ม (ยังไม่บันทึก)").toBeVisible();
});
