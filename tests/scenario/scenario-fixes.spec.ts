// ─── ล็อกบั๊ก 5 ข้อที่เจอจาก /scenario (17 ก.ค. 69) ไม่ให้ย้อนกลับ ───────────────
// 1. HQ ไม่ยุบเป็นคอลัมน์เดียวที่ ≤768px — .app.app-hq (0,2,0) ชนะ .app (0,1,0) ใน media query
//    (media query ไม่เพิ่ม specificity) → เนื้อหาถูกบีบเหลือ 244px อีก 524px ว่างเปล่า
// 2. /leads การ์ด "เกิน N วัน" ฮาร์ดโค้ด 7 ทั้งป้ายและตัวกรอง ทั้งที่ตัวเลขนับตามกฎของสาขา
// 3. HQ นับ "ต้องติดตาม" จากรายการสถานะ แต่ป้ายเขียน ">7 วัน" (ไม่ได้นับวันเลย)
// 4. รหัสผ่านดีลเลอร์โชว์เต็มทันทีที่เปิดแถว
// 5. คำว่า "อัตราปิด/ปิดได้ %" ถูกใช้กับหลายสูตร จนอ่านเหมือนตัวเลขขัดกัน
import { test, expect } from "@playwright/test";
import { open } from "./helpers";
import { adminClient } from "./testDealers";
import { REAL_BACKEND } from "./supabaseEnv";
import { รันSQLในฐาน } from "./localDb";
import { สร้างสาขาของข้อ } from "./ownDealer";

// เทสต์ [2]/[3] seed กฎผ่าน localStorage ใช้ได้กับ "โหมด local" เท่านั้น —
// โหมด supabase แอปอ่านกฎจาก DB (dealer_lead_rules) ไม่ใช่ localStorage → seed ไม่มีผล
// (แพตเทิร์นเดียวกับ dealer-lead-rules.spec.ts — DB-path ตรวจที่ migration 0058/0059 + supabase-rls แล้ว)
const SEED_LOCAL_ONLY = "seed ผ่าน localStorage — ใช้โหมด local เท่านั้น (โหมด DB อ่านจาก dealer_lead_rules)";

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

  // ข้อ 2 — การ์ด/ตัวกรองฝั่งดีลเลอร์ ต้องใช้เกณฑ์ของสาขา
  test("[2] /leads ป้ายกับตัวกรองตรงกับกฎที่ตั้ง", async ({ page }) => {
    test.skip(REAL_BACKEND, SEED_LOCAL_ONLY);
    await page.addInitScript(() => localStorage.setItem("dealer_lead_rules", JSON.stringify({ CNX: { followUpAlertDays: 3, unassignedAlertHours: 48 } })));
    await open(page, "dealer", "/leads");
    const card = page.locator(".card").filter({ hasText: /^เกิน \d+ วัน/ }).first();
    await expect(card).toContainText("เกิน 3 วัน");
    await expect(page.getByText("เกิน 7 วัน")).toHaveCount(0);
  });

  // ข้อ 3 — HQ ต้องนับตามเกณฑ์รายสาขา ไม่ใช่รายการสถานะ
  test("[3] HQ ต้องติดตามด่วน ขยับตามกฎสาขา", async ({ page }) => {
    test.skip(REAL_BACKEND, SEED_LOCAL_ONLY);
    await page.addInitScript(() => localStorage.setItem("dealer_lead_rules", JSON.stringify({ CNX: { followUpAlertDays: 1, unassignedAlertHours: 48 } })));
    await open(page, "hq", "/hq/leads");
    const card = page.locator("button.card").filter({ hasText: "ต้องติดตามด่วน" }).first();
    await expect(card).toContainText("แล้วแต่สาขา");           // หลายสาขา = สรุปเป็นช่วง
    await expect(page.getByText("ยังไม่ติดตาม (>7 วัน)")).toHaveCount(0);
    await expect(page.getByRole("columnheader", { name: "เตือน 7 วัน" })).toHaveCount(0);
  });

  // ข้อ 4 — รหัสผ่านต้องถูกปิดบัง
  test("[4] รหัสผ่านดีลเลอร์ถูกปิดบัง", async ({ page }) => {
    await open(page, "hq", "/hq/dealers?view=table");   // หน้าเริ่มเป็นการ์ด — เทสต์นี้ใช้แถวตาราง
    await page.locator("table tbody tr").first().click();
    // ต้องขึ้นจุดไข่ปลา + ปุ่มให้กดดู — ไม่ใช่โชว์รหัสมาเลย
    // (เดิมช่องนี้เป็นช่องปิดบังธรรมดาที่ค่าเป็น "—" เสมอ · ตอนนี้ดึงรหัสจริงตอนกดดูได้แล้ว
    //  จึงต้องยืนยันว่ายัง "ไม่ดึงมาก่อนกด" ตามที่ออกแบบไว้)
    await expect(page.getByRole("button", { name: /ดูรหัสผ่าน/ })).toBeVisible();
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
      const ต้นปี = `${วันนี้.slice(0, 4)}-01-01`;
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
      await expect(page.locator(".erp")).not.toContainText("อัตราปิด = ปิดได้ ÷");
      const หัว = (await tbl.locator("thead th").allInnerTexts()).map(t => t.trim());
      for (const ชื่อ of ["ลีด", "ใบเสนอราคา", "ปิดได้", "ปิดไม่ได้", "อัตราปิด"])
        expect(หัว.filter(h => h === ชื่อ), `ต้องมีคอลัมน์ "${ชื่อ}" แยกกันหนึ่งคอลัมน์ (ได้: ${หัว.join(" · ")})`).toHaveLength(1);
      // เลือกดีลเลอร์ทีละสาขาของข้อ → ตารางเหลือแถวของสาขานั้นแถวเดียว
      for (const [สาขา, อัตรา, ลีด, ใบ, ได้, ไม่ได้] of [[ก, "75%", "5", "3", "3", "1"], [ข, "—", "1", "1", "0", "0"]] as const) {
        await page.getByLabel("ทุกดีลเลอร์", { exact: true }).first().selectOption(สาขา.รหัส);
        const แถว = tbl.locator("tbody tr").filter({ has: page.locator("td[data-perf-row]") });
        await expect(แถว, `เลือก ${สาขา.รหัส}: ตารางเหลือแถวเดียว`).toHaveCount(1, { timeout: 20_000 });
        await expect(แถว.first().locator("td[data-perf-row]"), "แถวเป็นของสาขาที่เลือก").toHaveText(สาขา.รหัส, { timeout: 20_000 });
        const ค่า = async (k: string) => (await แถว.first().locator(`td[data-cell='${k}']`).innerText()).trim();
        expect(await ค่า("rate"), `แถว ${สาขา.รหัส}: อัตราปิด = สูตรกลางจากลีด`).toBe(await อัตราของ(สาขา.รหัส));
        expect(await ค่า("rate"), `แถว ${สาขา.รหัส}: อัตราปิด = ค่าที่วางไว้`).toBe(อัตรา);
        expect([await ค่า("leads"), await ค่า("quotes")], `แถว ${สาขา.รหัส}: ลีด / ใบเสนอราคา (ใบที่ส่ง) แยกช่องกัน`).toEqual([ลีด, ใบ]);
        expect([await ค่า("won"), await ค่า("lost")], `แถว ${สาขา.รหัส}: ปิดได้/ปิดไม่ได้ = จำนวนลีดที่ปิด (ไม่ใช่ใบ)`).toEqual([ได้, ไม่ได้]);
      }
    } finally {
      รันSQLในฐาน(`delete from public.quotation_won_at where dealer_code in ('${ก.รหัส}', '${ข.รหัส}');`);
      await ก.ลบ(); await ข.ลบ();
    }
  });
});
