import { test, expect } from "@playwright/test";
import { open, openAs, CNX } from "./helpers";
import { createClient } from "@supabase/supabase-js";
import { ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY } from "./adminEnv";
import { REAL_BACKEND } from "./supabaseEnv";
import { รันSQLในฐาน } from "./localDb";
import { สร้างสาขาของข้อ } from "./ownDealer";

// ── ขอบเขตข้อมูลข้ามสาขา (regression) — บั๊กประเภท "กระดิ่ง/หน้า HQ รั่วข้ามสาขา" ──
// เดิมเทียบกับ mock.ts (ข้อมูลจำลอง local mode) — ใช้ไม่ได้แล้วเพราะแอปรันโหมด supabase จริง
// (DB จริงว่างเปล่าก่อน seed — ดู global-setup.ts) เปลี่ยนมาเทียบกับข้อมูลตั้งต้น ZZTEST-BASE ที่ seed ไว้แทน
// เคยหลุดมาแล้ว 2 จุด: Topbar (กระดิ่ง+ค้นหา) และ useNetworkDealerDetail (หน้าเจาะสาขา)
test.skip(!REAL_BACKEND, "ต้องใช้ backend จริง (RLS) เพื่อตรวจการกันข้ามสาขา");

const admin = createClient(ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY);

/** ชื่อบริษัทของ "สาขาอื่น" (dealerCode != excludeDealer) จาก DB จริง — ถ้าโผล่ในกระดิ่ง/ค้นหา/หน้าเจาะสาขา = รั่ว */
async function otherBranchCompanies(excludeDealer: string): Promise<string[]> {
  const { data } = await admin.from("leads").select("company,dealer_code").neq("dealer_code", excludeDealer);
  return [...new Set((data ?? []).map(r => r.company as string).filter(Boolean))];
}

async function openBell(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "การแจ้งเตือน" }).click();
  await page.waitForTimeout(500);
}

test("กระดิ่งดีลเลอร์ (CNX) ไม่โผล่ลูกค้าเป้าหมายสาขาอื่น", async ({ page }) => {
  const otherBranch = await otherBranchCompanies("CNX");
  await openAs(page, CNX, "dealer", "/dashboard");
  await page.waitForTimeout(1500);
  await openBell(page);

  const panelText = await page.evaluate(() => {
    // แผงกระดิ่ง = div ลอยที่มีหัวข้อ "การแจ้งเตือน"
    const heads = [...document.querySelectorAll("span")].filter(s => s.textContent?.trim() === "การแจ้งเตือน");
    const panel = heads[0]?.closest("div[style*='position']")?.parentElement ?? document.body;
    return (panel as HTMLElement).innerText;
  });

  const leaked = otherBranch.filter(name => panelText.includes(name));
  console.log(`บริษัทสาขาอื่นทั้งหมด ${otherBranch.length} ราย · โผล่ในกระดิ่ง: ${leaked.length}`);
  if (leaked.length) console.log("  รั่ว:", JSON.stringify(leaked.slice(0, 6)));
  expect(leaked, "กระดิ่งดีลเลอร์ต้องไม่มีบริษัทของสาขาอื่น").toEqual([]);
});

test("หน้า HQ เจาะสาขา CNX ไม่โผล่ลูกค้าเป้าหมายของสาขาอื่น", async ({ page }) => {
  const otherBranch = await otherBranchCompanies("CNX");
  await open(page, "hq", "/hq/dealers/CNX");
  await page.waitForTimeout(1500);
  // แท็บ "ลูกค้าเป้าหมาย" — ตารางลูกค้าเป้าหมายของสาขานี้
  await page.getByRole("button", { name: /ลูกค้าเป้าหมาย/ }).first().click().catch(() => {});
  await page.waitForTimeout(500);
  const bodyText = await page.evaluate(() => document.body.innerText);
  const leaked = otherBranch.filter(name => bodyText.includes(name));
  console.log(`หน้าเจาะ CNX → โผล่บริษัทสาขาอื่น: ${leaked.length}`, JSON.stringify(leaked.slice(0, 6)));
  expect(leaked, "หน้าเจาะสาขา CNX ต้องมีเฉพาะลูกค้าเป้าหมายของ CNX").toEqual([]);

  // จำนวนแถว = ลูกค้าเป้าหมายของสาขานั้นเท่านั้น (ไม่ใช่ทั้งเครือ) — นับจากสาขาของข้อที่รู้ค่า 3 ราย
  //   เดิมนับลีด CNX ที่ฐานแล้วเทียบแถวบนจอ — ข้ออื่นที่รันพร้อมกันเพิ่ม/ลบลีด CNX ระหว่างนั้น = ตัวเลขขยับ (บอสสั่ง 29 ต.ค. 69 · คิวข้อ 3)
  //   3 ราย < หน้าละ 10 แถว → แถวบนจอต้องเท่ากับ 3 พอดี
  const สาขา = await สร้างสาขาของข้อ({ จังหวัด: "ตราด" });
  const ป้าย = `ZZTEST-เจาะสาขา-${Date.now() % 100000}`;
  const เลข = 960_000_000 + (Date.now() % 100_000) * 10;
  try {
    const ใส่ = รันSQLในฐาน(`set local session_replication_role = replica;
      insert into public.leads (id, num_id, dealer_code, company, name, phone, province, status, created_date) values
      ${[0, 1, 2].map(i => `('#L-${เลข + i}', ${เลข + i}, '${สาขา.รหัส}', '${ป้าย}-${i + 1}', 'ZZTEST', '000-000-000${i}', 'ตราด', 'BULLET', current_date)`).join(",\n      ")};
      set local session_replication_role = origin;`);
    if (ใส่ === null) throw new Error("ไม่พบฐานทดสอบในเครื่อง (docker) — วางลีดของสาขาของข้อไม่ได้");
    const ของข้อ = await admin.from("leads").select("company").eq("dealer_code", สาขา.รหัส).like("company", `${ป้าย}%`);
    expect((ของข้อ.data ?? []).length, "ตั้งต้น: สาขาของข้อมีลีด 3 ราย").toBe(3);
    const อื่น = await otherBranchCompanies(สาขา.รหัส);
    await open(page, "hq", `/hq/dealers/${สาขา.รหัส}`);
    await page.getByRole("button", { name: /ลูกค้าเป้าหมาย/ }).first().click().catch(() => {});
    const แถว = page.locator("table tbody tr");
    await expect(แถว.filter({ hasText: ป้าย }), "ลีดของสาขานี้ครบ 3 ราย").toHaveCount(3, { timeout: 20_000 });
    await expect(แถว, "จำนวนแถว = ลีดของสาขานี้เท่านั้น").toHaveCount(3);
    const ข้อความ = await page.evaluate(() => document.body.innerText);
    expect(อื่น.filter(name => ข้อความ.includes(name)), "หน้าเจาะสาขาของข้อต้องไม่มีลีดของสาขาอื่น").toEqual([]);
  } finally {
    รันSQLในฐาน(`set local session_replication_role = replica;
      delete from public.leads where dealer_code = '${สาขา.รหัส}';
      set local session_replication_role = origin;`);
    await สาขา.ลบ();
  }
});

test("ค้นหาบน Topbar (CNX) ไม่โผล่ลูกค้า/ใบเสนอราคาสาขาอื่น", async ({ page }) => {
  const otherBranch = await otherBranchCompanies("CNX");
  // "อาร์วายจี" เป็นคำเฉพาะที่อยู่แค่ในชื่อบริษัทที่ seed ให้ RYG เท่านั้น (ดู global-setup.ts) — ใช้เป็นคำค้นที่วัดได้จริง
  // (ต่างจากค้นด้วยชื่อจังหวัด "ระยอง" ซึ่งไม่ได้อยู่ในชื่อบริษัทเลย → เดิมเทียบกับ mock.ts ที่ตั้งชื่อบริษัทมีจังหวัดปนอยู่)
  const PROBE = "อาร์วายจี";
  await openAs(page, CNX, "dealer", "/dashboard");
  await page.waitForTimeout(1500);
  // เปิดช่องค้นหา แล้วพิมพ์ token ที่มีเฉพาะในสาขาอื่น
  await page.getByRole("button", { name: "ค้นหา" }).click();
  await page.waitForTimeout(300);
  await page.getByRole("textbox").first().fill(PROBE);
  await page.waitForTimeout(500);
  const resultText = await page.evaluate(() => document.body.innerText);
  const leaked = otherBranch.filter(name => name.includes(PROBE) && resultText.includes(name));
  console.log(`ค้นหา "${PROBE}" → โผล่บริษัทสาขาอื่น: ${leaked.length}`, JSON.stringify(leaked.slice(0, 4)));
  expect(leaked, "ค้นหาของดีลเลอร์ต้องไม่เจอบริษัทสาขาอื่น").toEqual([]);
});
