// ─── ล็อกบั๊ก 5 ข้อที่เจอจาก /scenario (17 ก.ค. 69) ไม่ให้ย้อนกลับ ───────────────
// 1. HQ ไม่ยุบเป็นคอลัมน์เดียวที่ ≤768px — .app.app-hq (0,2,0) ชนะ .app (0,1,0) ใน media query
//    (media query ไม่เพิ่ม specificity) → เนื้อหาถูกบีบเหลือ 244px อีก 524px ว่างเปล่า
// 2. /leads การ์ด "เกิน N วัน" ฮาร์ดโค้ด 7 ทั้งป้ายและตัวกรอง ทั้งที่ตัวเลขนับตามกฎของสาขา
// 3. HQ นับ "ต้องติดตาม" จากรายการสถานะ แต่ป้ายเขียน ">7 วัน" (ไม่ได้นับวันเลย)
// 4. รหัสผ่านดีลเลอร์โชว์เต็มทันทีที่เปิดแถว
// 5. คำว่า "อัตราปิด/ปิดได้ %" ถูกใช้กับหลายสูตร จนอ่านเหมือนตัวเลขขัดกัน
import { test, expect } from "@playwright/test";
import { open, ย้อนเดือนISO } from "./helpers";
import { adminClient } from "./testDealers";
import { REAL_BACKEND } from "./supabaseEnv";
import { รันSQLในฐาน } from "./localDb";
import { สร้างสาขาของข้อ } from "./ownDealer";
import { DEALER_ORIGIN, loginUI } from "./funcHelpers";

// [2]/[3] เดิมใส่เกณฑ์ใน localStorage แล้วข้ามเมื่อต่อฐาน = ข้ามทุกรอบตรวจ ไม่เคยตรวจจริง (12 พ.ย. 69 บอสสั่งเขียนใหม่)
//   → สาขาของข้อ + เกณฑ์ที่ฐาน (dealer_lead_rules) แล้วตรวจบนจอ · ไม่มีทางข้าม

// ข้อ 1 — HQ ต้องยุบเป็นคอลัมน์เดียวที่ ≤768px
test.describe("768px", () => {
  test.use({ viewport: { width: 768, height: 900 } });
  for (const p of ["/hq/dashboard", "/hq/leads", "/hq/quotations", "/hq/pipeline", "/hq/customers", "/hq/dealers", "/hq/settings", "/hq/audit"]) {
    test(`[1] ${p} เต็มจอ`, async ({ page }) => {
      await open(page, "hq", p);
      await page.waitForTimeout(700);
      const r = await page.evaluate(() => {
        const main = document.querySelector(".main") as HTMLElement;
        return { grid: getComputedStyle(document.querySelector(".app")!).gridTemplateColumns, over: main.scrollWidth - main.clientWidth };
      });
      expect(r.grid, "ต้องเป็นคอลัมน์เดียว").toBe("768px");
      expect(r.over, "ต้องไม่ล้นแนวนอน").toBeLessThanOrEqual(3);
    });
  }
});

test.describe("อื่น ๆ", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  // ข้อ 2–3 (12 พ.ย. 69 · บอสเลือกทาง ก): การ์ด "เกิน N วัน" / "ต้องติดตามด่วน" เอาออกตามคำสั่งการ์ด KPI 4 ใบ (22 ต.ค. 69)
  //   → ตรวจที่ที่เกณฑ์ของดีลเลอร์แสดงอยู่ตอนนี้: ช่องกรอง "ค้างติดต่อ >N วัน" (ดีลเลอร์) · ป้าย "ต้องติดตาม" ในแถว (HQ)
  //   เกณฑ์ตั้งที่ฐาน (dealer_lead_rules) ของสาขาของข้อ · ลูกค้าเป้าหมายวางที่ฐานปิดตัวดัก (ตัวดักตั้งวันติดต่อ = วันนี้เสมอ)
  const วันก่อน = (n: number) => new Date(Date.now() + 7 * 3_600_000 - n * 86_400_000).toISOString().slice(0, 10);
  const วางลีด = (รหัส: string, เลข: number, ชื่อ: string, เงียบ: number) => expect(รันSQLในฐาน(`set local session_replication_role = replica;
    insert into public.leads (id, num_id, dealer_code, company, name, phone, province, source, status, assigned, created_date, last_contact_at)
    values ('#L-${เลข}', ${เลข}, '${รหัส}', '${ชื่อ}', 'ZZTEST ผู้ติดต่อ', '000-000-0${String(เลข % 1000).padStart(3, "0")}', 'ตราด', 'Facebook', 'WAITING', 'ผู้ทดสอบ', '${วันก่อน(เงียบ)}', '${วันก่อน(เงียบ)}');
    set local session_replication_role = origin;`), `วางลูกค้าเป้าหมาย ${ชื่อ}`).not.toBeNull();
  const ตั้งเกณฑ์ = async (รหัส: string, วัน: number) =>
    expect((await adminClient().from("dealer_lead_rules").upsert({ dealer_code: รหัส, follow_up_alert_days: วัน, unassigned_alert_hours: 48 })).error, `ตั้งเกณฑ์ ${วัน} วันที่ฐาน`).toBeNull();
  const ล้าง = async (รหัส: string) => { await adminClient().from("leads").delete().eq("dealer_code", รหัส); await adminClient().from("dealer_lead_rules").delete().eq("dealer_code", รหัส); };

  // ข้อ 2 — ช่องกรองฝั่งดีลเลอร์ใช้เกณฑ์ของสาขา
  test("[2] /leads ช่องกรอง 'ค้างติดต่อ >N วัน' ตามเกณฑ์ที่สาขาตั้งในฐาน", async ({ page }) => {
    const ส = await สร้างสาขาของข้อ({ จังหวัด: "ตราด" });
    const ฐาน = 1_900_000_000 + Math.floor(Math.random() * 400_000) * 10;
    const เงียบ5 = `ZZTEST เงียบ 5 วัน ${ส.รหัส}`, เงียบ2 = `ZZTEST เงียบ 2 วัน ${ส.รหัส}`;
    try {
      await ตั้งเกณฑ์(ส.รหัส, 3);   // เกณฑ์ 3 วัน: เงียบ 5 วัน = ค้าง · เงียบ 2 วัน = ไม่ค้าง (เกณฑ์ตั้งต้น 7 วัน = ไม่มีใครค้าง → ไม่มีช่องกรอง)
      วางลีด(ส.รหัส, ฐาน, เงียบ5, 5); วางลีด(ส.รหัส, ฐาน + 1, เงียบ2, 2);
      await loginUI(page, DEALER_ORIGIN, "/login", ส.บัญชี);
      await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: "ตาราง", exact: true }).click();
      const ช่อง = page.getByLabel("ค้างติดต่อทุกช่วง");
      await expect(ช่อง, "มีรายการค้างตามเกณฑ์ 3 วัน → ช่องกรองขึ้น").toBeVisible({ timeout: 25_000 });
      expect(await ช่อง.locator("option").allInnerTexts(), "ตัวเลือกมีเกณฑ์ของสาขา (>3 วัน) นำหน้าช่วงมาตรฐาน").toEqual(["ค้างติดต่อทุกช่วง", "ค้างติดต่อ >3 วัน", "ค้างติดต่อ >7 วัน", "ค้างติดต่อ >14 วัน", "ค้างติดต่อ >30 วัน"]);
      await ช่อง.selectOption("3");
      await expect(page.getByRole("row", { name: `เปิดรายละเอียดลูกค้าเป้าหมาย ${เงียบ5}`, exact: true }), "เงียบ 5 วัน > 3 = อยู่ในรายการค้าง").toBeVisible();
      await expect(page.getByRole("row", { name: `เปิดรายละเอียดลูกค้าเป้าหมาย ${เงียบ2}`, exact: true }), "เงียบ 2 วัน ≤ 3 = ไม่อยู่").toHaveCount(0);
    } finally { await ล้าง(ส.รหัส); await ส.ลบ(); }
  });

  // ข้อ 3 — HQ: ป้าย "ต้องติดตาม" ในแต่ละแถวใช้เกณฑ์ของดีลเลอร์เจ้าของแถว (2 ดีลเลอร์เกณฑ์ต่างกัน)
  test("[3] HQ ป้าย 'ต้องติดตาม' ในแถว ตามเกณฑ์ของดีลเลอร์เจ้าของแถว", async ({ page }) => {
    const ก = await สร้างสาขาของข้อ({ จังหวัด: "ตราด" }), ข = await สร้างสาขาของข้อ({ จังหวัด: "ตราด" });
    const ฐาน = 1_910_000_000 + Math.floor(Math.random() * 400_000) * 10;
    const แถวก = `ZZTEST ติดตามตามเกณฑ์ ${ก.รหัส}`, แถวข = `ZZTEST ติดตามตามเกณฑ์ ${ข.รหัส}`;
    try {
      // ทั้งสองแถวเงียบ 5 วันเท่ากัน · ก เกณฑ์ 3 วัน = ต้องติดตาม · ข เกณฑ์ 10 วัน = ยังไม่ต้อง (เกณฑ์ตั้งต้น 7 ก็ไม่ต้อง)
      await ตั้งเกณฑ์(ก.รหัส, 3); await ตั้งเกณฑ์(ข.รหัส, 10);
      วางลีด(ก.รหัส, ฐาน, แถวก, 5); วางลีด(ข.รหัส, ฐาน + 1, แถวข, 5);
      await open(page, "hq", "/hq/leads");
      await page.locator(".content").getByPlaceholder(/ค้นหาบริษัท/).first().fill("ZZTEST ติดตามตามเกณฑ์");
      const รก = page.getByRole("row", { name: `เปิดรายละเอียดลูกค้าเป้าหมาย ${แถวก}`, exact: true });
      const รข = page.getByRole("row", { name: `เปิดรายละเอียดลูกค้าเป้าหมาย ${แถวข}`, exact: true });
      await expect(รก).toBeVisible({ timeout: 25_000 }); await expect(รข).toBeVisible();
      await expect(รก.getByText("ต้องติดตาม", { exact: true }), "ดีลเลอร์ ก (เกณฑ์ 3 วัน): เงียบ 5 วัน = ต้องติดตาม").toBeVisible();
      await expect(รข.getByText("ต้องติดตาม", { exact: true }), "ดีลเลอร์ ข (เกณฑ์ 10 วัน): เงียบ 5 วัน = ยังไม่ต้อง").toHaveCount(0);
      await expect(page.getByText("ยังไม่ติดตาม (>7 วัน)")).toHaveCount(0);
      await expect(page.getByRole("columnheader", { name: "เตือน 7 วัน" })).toHaveCount(0);
    } finally { await ล้าง(ก.รหัส); await ล้าง(ข.รหัส); await ก.ลบ(); await ข.ลบ(); }
  });

  // ข้อ 4 — รหัสผ่านต้องถูกปิดบัง
  test("[4] รหัสผ่านดีลเลอร์ถูกปิดบัง", async ({ page }) => {
    await open(page, "hq", "/hq/dealers?view=table");   // หน้าเริ่มเป็นการ์ด — เทสต์นี้ใช้แถวตาราง
    // แถวดีลเลอร์ RYG (12 พ.ย. 69 · บอสสั่ง) — เดิมแถวแรก (สาขาชั่วคราวของข้ออื่นถูกลบระหว่างเปิดแผงได้)
    await page.getByPlaceholder(/ค้นหาดีลเลอร์/).fill("RYG");
    await page.locator("table tbody tr[aria-label^='เปิดแผงดีลเลอร์']").filter({ hasText: "RYG" }).filter({ hasNotText: "ZZTEST" }).click();
    // ต้องขึ้นจุดไข่ปลา + ปุ่มให้กดดู — ไม่ใช่โชว์รหัสมาเลย
    // (เดิมช่องนี้เป็นช่องปิดบังธรรมดาที่ค่าเป็น "—" เสมอ · ตอนนี้ดึงรหัสจริงตอนกดดูได้แล้ว
    //  จึงต้องยืนยันว่ายัง "ไม่ดึงมาก่อนกด" ตามที่ออกแบบไว้)
    // 30 ต.ค. 69: กดแถว = แผงด้านขวา · ปุ่มท้ายแถวทุกแถวมี "ข้อมูลเข้าระบบ · ดูรหัสผ่าน" → หาเฉพาะในแผง
    await expect(page.locator("[data-dealer-panel]").getByRole("button", { name: /ดูรหัสผ่าน/ }).first()).toBeVisible({ timeout: 20_000 });
    const panel = await page.locator(".erp").innerText();
    expect(panel.includes("••••••••••••"), "ต้องปิดบังรหัสไว้ก่อน").toBe(true);
    expect(/PEB-[A-Za-z0-9]{6,}/.test(panel), "ต้องไม่เห็นรหัสจริงก่อนกดปุ่มดู").toBe(false);
  });

  // ข้อ 5 — คำที่เคยชนกัน ต้องแยกออกจากกัน
  test("[5] ป้ายอัตราต่าง ๆ แยกกันชัด", async ({ page }) => {
    // สาขาของข้อ 2 สาขา (คิวรอบหน้าข้อ 3 · 29 ต.ค. 69) — เดิมเทียบทุกแถวกับลีดทั้งเครือ (ข้อมูลตั้งต้นร่วม)
    //   ข้ออื่นที่รันพร้อมกันปิดลีดของสาขาเดียวกันระหว่างอ่านจอกับนับฐาน → ไม่นิ่ง 4 ครั้ง แม้นับคร่อมก่อน/หลังแล้ว
    //   ก: ลีดปีนี้ ปิดสำเร็จ 3 · ปิดไม่สำเร็จ 1 · เปิดอยู่ 1 → 75% · ข: ลีดเปิดอยู่อย่างเดียว → "—" (ไม่มีลีดที่ปิด)
    //   ตารางนี้แสดงเฉพาะสาขาที่มีใบ → ทั้งสองสาขามีใบ (ก: ตอบรับ 1 · ไม่ตอบรับ 1 · รอตอบ 1 · ข: รอตอบ 1)
    //   วางที่ฐานตรง (ปิดตัวดัก) · ข้อนี้วัดป้ายและสูตร ไม่ใช่ทางปิดการขาย
    const ก = await สร้างสาขาของข้อ({ จังหวัด: "ยะลา", ภาค: "ใต้" }), ข = await สร้างสาขาของข้อ({ จังหวัด: "ยะลา", ภาค: "ใต้" });
    try {
      const วันนี้ = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
      const ต้นปี = ย้อนเดือนISO(วันนี้, 12);   // ค่าตั้งต้น "1 ปี" (3 พ.ย. 69)
      const ฐานเลข = 1_500_000_000 + Math.floor(Math.random() * 500_000) * 100;   // เลขแถวของรอบนี้ (ไม่ชนช่วงเลขตายตัวของไฟล์อื่น)
      const ลีด: [string, string][] = [[ก.รหัส, "PAID"], [ก.รหัส, "PAID"], [ก.รหัส, "PAID"], [ก.รหัส, "CANCELLED"], [ก.รหัส, "WAITING"], [ข.รหัส, "WAITING"]];
      const ผล = รันSQLในฐาน(`set local session_replication_role = replica;
        insert into public.leads (id, num_id, dealer_code, company, name, phone, province, status, created_date) values
          ${ลีด.map(([c, st], i) => `('#L-${ฐานเลข + i}', ${ฐานเลข + i}, '${c}', 'ZZTEST-อัตรา-${c}-${i}', 'ZZTEST', '000-000-${String(i).padStart(4, "0")}', 'ยะลา', '${st}', '${วันนี้}')`).join(",\n          ")};
        insert into public.customers (id, dealer_code, name, company, province, join_date) values
          (${ฐานเลข + 20}, '${ก.รหัส}', 'ZZTEST-อัตรา-${ก.รหัส}-ลูกค้า', 'ZZTEST-อัตรา-${ก.รหัส}-ลูกค้า', 'ยะลา', '${วันนี้}');
        insert into public.quotations (id, dealer_code, customer, project, status, total_value, date, customer_id, won_at) values
          ('${ก.รหัส}-Q1', '${ก.รหัส}', 'ZZTEST-อัตรา-${ก.รหัส}-ลูกค้า', 'ZZTEST', 'won', 40000, '${วันนี้}', ${ฐานเลข + 20}, now()),
          ('${ก.รหัส}-Q2', '${ก.รหัส}', 'ZZTEST-อัตรา-${ก.รหัส}-ลูกค้า', 'ZZTEST', 'lost', 30000, '${วันนี้}', ${ฐานเลข + 20}, null),
          ('${ก.รหัส}-Q3', '${ก.รหัส}', 'ZZTEST-อัตรา-${ก.รหัส}-ลูกค้า', 'ZZTEST', 'sent_to_client', 20000, '${วันนี้}', ${ฐานเลข + 20}, null),
          ('${ข.รหัส}-Q1', '${ข.รหัส}', 'ZZTEST-อัตรา-${ข.รหัส}-ลูกค้า', 'ZZTEST', 'sent_to_client', 10000, '${วันนี้}', null, null);
        insert into public.quotation_won_at (dealer_code, quote_id, won_at) values ('${ก.รหัส}', '${ก.รหัส}-Q1', now());
        set local session_replication_role = origin;`);
      expect(ผล, "ต้องมีฐานทดสอบในเครื่อง (docker) — วางลีด/ใบของสาขาไม่ได้").not.toBeNull();
      // สูตรกลางจากลีดในฐาน (ลีดที่เข้ามาในช่วงค่าตั้งต้น "ปีนี้") — ฐานต้องได้ค่าที่วางไว้ก่อน แล้วจอต้องตรงกับฐาน
      const อัตราของ = async (code: string) => {
        const { data, error } = await adminClient().from("leads").select("status").eq("dealer_code", code)
          .or(`created_date.is.null,and(created_date.gte.${ต้นปี},created_date.lte.${วันนี้})`);
        expect(error, `อ่านลีดจากฐานไม่ได้: ${error?.message}`).toBeNull();
        const ได้ = (data ?? []).filter(l => l.status === "PAID").length, เสีย = (data ?? []).filter(l => l.status === "CANCELLED").length;
        return ได้ + เสีย === 0 ? "—" : `${Math.round(ได้ / (ได้ + เสีย) * 100)}%`;
      };
      expect([await อัตราของ(ก.รหัส), await อัตราของ(ข.รหัส)], "ฐาน: สูตรกลางของลีดที่วางไว้").toEqual(["75%", "—"]);

      await open(page, "hq", "/hq/pipeline");
      // 30 ต.ค. 69 (บอสสั่งยุบหน้าให้ตรง FLOW H12): ตาราง "ตัวเลขการปิดการขาย รายดีลเลอร์" รวมเข้า "ตารางผลงานดีลเลอร์" ตารางเดียว
      //   คอลัมน์ตามคำสั่งบอส: ลีด · ใบเสนอราคา · ปิดได้ · ปิดไม่ได้ · อัตราปิด — ปิดได้/ปิดไม่ได้ = จำนวน "ลีด" ที่ปิด (บอสยกตัวอย่าง
      //   RYG ปิดได้ 23 ปิดไม่ได้ 6 → 79%) เพื่อให้อัตราปิดคิดจากเลขสองช่องข้าง ๆ ได้ตรง · จำนวนใบอยู่คอลัมน์ "ใบเสนอราคา" แยกกัน
      //   ก: ลีด 5 (ปิดได้ 3 · ปิดไม่ได้ 1) · ใบที่ส่ง 3 (ตอบรับ/ไม่ตอบรับ/รอตอบ) → 75% · ข: ลีด 1 · ใบ 1 · ไม่มีลีดที่ปิด → "—"
      const tbl = page.locator('table[aria-label="ตารางผลงานดีลเลอร์"]');
      await expect(tbl).toBeVisible({ timeout: 30_000 });
      await expect(page.locator(".card").filter({ hasText: "ตัวเลขการปิดการขาย รายดีลเลอร์" }), "ไม่มีตารางการปิดการขายแยกแล้ว").toHaveCount(0);
      await expect(page.locator(".erp")).not.toContainText("ชุดเดียวกับกราฟด้านบน");
      // คำอธิบายสูตรใต้ตารางถูกเอาออก (บอสสั่ง 22 ก.ย. 69 · commit 4e269ac "เอาคำอธิบายใต้ตารางผลงานออก")
      await expect(page.locator(".erp")).not.toContainText("อัตราปิดการขาย = ปิดสำเร็จ ÷");
      const หัว = (await tbl.locator("thead th").allInnerTexts()).map(t => t.trim());
      for (const ชื่อ of ["ลูกค้าเป้าหมาย", "ใบที่ส่ง", "ปิดสำเร็จ", "ปิดไม่สำเร็จ", "อัตราปิดการขาย"])   // "ใบเสนอราคา" → "ใบที่ส่ง" (บอสสั่ง 30 ต.ค. 69)
        expect(หัว.filter(h => h === ชื่อ), `ต้องมีคอลัมน์ "${ชื่อ}" แยกกันหนึ่งคอลัมน์ (ได้: ${หัว.join(" · ")})`).toHaveLength(1);
      // เลือกดีลเลอร์ทีละสาขาของข้อ → ตารางเหลือแถวของสาขานั้นแถวเดียว
      for (const [สาขา, อัตรา, ลีด, ใบ, ได้, ไม่ได้] of [[ก, "75%", "5", "3", "3", "1"], [ข, "—", "1", "1", "0", "0"]] as const) {
        await page.getByLabel("ทุกดีลเลอร์", { exact: true }).first().selectOption(สาขา.รหัส);
        const แถว = tbl.locator("tbody tr").filter({ has: page.locator("td[data-perf-row]") });
        await expect(แถว, `เลือก ${สาขา.รหัส}: ตารางเหลือแถวเดียว`).toHaveCount(1, { timeout: 20_000 });
        // ระดับดีลเลอร์ไม่มีคอลัมน์ดีลเลอร์ (บอสสั่ง 9 พ.ย. 69 · คอลัมน์แรก = ผลงานในช่วง) — ตรวจว่าแถวเป็นของสาขาที่เลือกจากรหัสของแถว
        await expect(แถว.first().locator("td[data-perf-row]"), "แถวเป็นของสาขาที่เลือก").toHaveAttribute("data-perf-row", สาขา.รหัส, { timeout: 20_000 });
        const ค่า = async (k: string) => (await แถว.first().locator(`td[data-cell='${k}']`).innerText()).trim();
        expect(อัตรา, `ฐาน ${สาขา.รหัส}: อัตราปิด = สูตรกลางจากลีด`).toBe(await อัตราของ(สาขา.รหัส));
        // ตรวจกลับด้าน (บอสสั่ง 10 พ.ย. 69 · ล็อกความกว้างคอลัมน์ เลิกกติกา 6 พ.ย. ซ่อนคอลัมน์ว่าง): ทั้งตาราง "—" = คอลัมน์ยังอยู่ แสดง "—"
        if (อัตรา === "—") expect(await ค่า("rate"), `แถว ${สาขา.รหัส}: อัตราปิด "—" ทั้งตาราง = คอลัมน์ยังอยู่ แสดง —`).toBe("—");
        else expect(await ค่า("rate"), `แถว ${สาขา.รหัส}: อัตราปิด = ค่าที่วางไว้`).toBe(อัตรา);
        expect([await ค่า("leads"), await ค่า("quotes")], `แถว ${สาขา.รหัส}: ลีด / ใบเสนอราคา (ใบที่ส่ง) แยกช่องกัน`).toEqual([ลีด, ใบ]);
        expect([await ค่า("won"), await ค่า("lost")], `แถว ${สาขา.รหัส}: ปิดได้/ปิดไม่ได้ = จำนวนลีดที่ปิด (ไม่ใช่ใบ)`).toEqual([ได้, ไม่ได้]);
      }
    } finally {
      รันSQLในฐาน(`delete from public.quotation_won_at where dealer_code in ('${ก.รหัส}', '${ข.รหัส}');`);
      await ก.ลบ(); await ข.ลบ();
    }
  });
});
