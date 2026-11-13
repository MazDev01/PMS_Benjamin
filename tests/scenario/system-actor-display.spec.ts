import { test, expect } from "@playwright/test";
import { skipReason } from "./supabaseEnv";
import { DEALER_ORIGIN, loginUI } from "./funcHelpers";
import { settle, แถวตามชื่อ } from "./helpers";
import { สร้างสาขาของข้อ, type สาขาของข้อ } from "./ownDealer";
import { รันSQLในฐาน } from "./localDb";
import { adminClient } from "./testDealers";

// ── ผู้ทำงานที่ระบบติ๊กให้: แถวเก่า "อัปเดตอัตโนมัติ" แสดง "ระบบทำให้" (บอสเลือก 12 พ.ย. 69 · ผ่านคนรวมงาน) ───────────────────
//   กติกา: แถวเก่าในฐานคงคำเดิม (ห้ามแก้) · หน้าจอแปลงตอนแสดงด้วยตัวกลางเดียว (packages/shared/lib/systemActor.ts)
//   ตกบนโค้ดเดิม: หน้าจอแสดง "อัปเดตอัตโนมัติ" ตามที่เก็บ
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(120_000);

let ส: สาขาของข้อ;
const เลข = 1_920_000_000 + Math.floor(Math.random() * 400_000) * 10;
const บริษัท = () => `ZZTEST ผู้ทำโดยระบบ ${ส.รหัส}`;
test.beforeAll(async () => {
  ส = await สร้างสาขาของข้อ({ จังหวัด: "ตราด" });
  // แถวเก่า: งาน "เก็บข้อมูลลูกค้า" ที่ระบบติ๊กให้ด้วยชื่อเดิม — วางที่ฐานปิดตัวดัก (ตัวดักคำนวณงานใหม่ทับ)
  expect(รันSQLในฐาน(`set local session_replication_role = replica;
    insert into public.leads (id, num_id, dealer_code, company, name, contact, phone, province, status, tasks)
    values ('#L-${เลข}', ${เลข}, '${ส.รหัส}', '${บริษัท()}', '${บริษัท()}', 'ผู้ทดสอบ', '000-000-0286', 'ตราด', 'WAITING',
      '[{"key":"collect","label":"เก็บข้อมูลลูกค้า","done":true,"doneAt":"1 พ.ย. 2569","doneBy":"อัปเดตอัตโนมัติ"}]'::jsonb);
    set local session_replication_role = origin;`), "แถวเก่าของข้อ").not.toBeNull();
});
test.afterAll(async () => { if (ส) { await adminClient().from("leads").delete().eq("num_id", เลข); await ส.ลบ(); } });

test("[ui·dealer] งานที่ระบบติ๊กให้ (แถวเก่า 'อัปเดตอัตโนมัติ') แสดง 'ระบบทำให้' · แถวในฐานคงคำเดิม", async ({ page }) => {
  await loginUI(page, DEALER_ORIGIN, "/login", ส.บัญชี);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" }); await settle(page);
  await page.getByRole("button", { name: "ตาราง", exact: true }).click();
  await (await แถวตามชื่อ(page, `เปิดรายละเอียดลูกค้าเป้าหมาย ${บริษัท()}`, บริษัท(), /ค้นหาบริษัท ผู้ติดต่อ/)).getByRole("button", { name: "ดูรายละเอียด" }).click();
  const งาน = page.locator("[data-lead-tasks]").first();
  await expect(งาน, "รายการงานในแผงลูกค้าเป้าหมาย").toBeVisible({ timeout: 20_000 });
  for (let i = 0, พับ = งาน.locator("button[aria-expanded='false']"); i < 5 && await พับ.count(); i++) await พับ.first().click();   // กางทุกขั้น
  await expect(งาน.getByText(/ระบบทำให้/).first(), "แสดงผู้ทำ = ระบบทำให้").toBeVisible();
  await expect(page.getByText("อัปเดตอัตโนมัติ"), "ไม่มีคำเดิมบนจอ").toHaveCount(0);
  const แถว = await adminClient().from("leads").select("tasks").eq("num_id", เลข).single();
  expect(JSON.stringify(แถว.data?.tasks), "แถวในฐานยังเป็นคำเดิม (ห้ามแก้แถวเก่า)").toContain("อัปเดตอัตโนมัติ");
});
