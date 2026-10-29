// ── ตัวเลขบนการ์ดต้องตรงกับชื่อการ์ด และแท่งคู่ต้องเป็นหน่วยเดียวกัน (ตรวจพบ 24 ส.ค. 69) ──
//
// 1) การ์ดบนแดชบอร์ดสำนักงานใหญ่เดินตามตัวกรองช่วงเวลา — ชื่อการ์ดต้องบอกตรงกับที่นับ (ปัจจุบัน: ลีดใหม่ทั้งเครือ)
// 2) แดชบอร์ดดีลเลอร์เทียบ "ราย" กับ "ใบ" ในกราฟเดียวกัน แท่งหลังจึงยาวเกินแท่งหน้าได้
import { test, expect } from "@playwright/test";
import { ADMIN, RYG, skipReason } from "./supabaseEnv";
import { openAs, settle } from "./helpers";
import { createClient } from "@supabase/supabase-js";
import { ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY } from "./adminEnv";
import { สร้างสาขาของข้อ } from "./ownDealer";
const db = createClient(ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY);
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(240_000);
const dir = "C:/Users/boomb/AppData/Local/Temp/claude/c---claude-Benjamin-HQ-main/bd7e01dd-bc43-471f-943d-554aa158563a/scratchpad/";

// 21 ต.ค. 69 (บอสสั่ง): การ์ด "ลูกค้าใหม่ทั้งเครือ" ได้ 0 ทั้งที่กราฟมีลีดหลายสิบ — เพราะนับ "ลูกค้า" (เกิดหลังปิดการขายเท่านั้น)
//   เปลี่ยนเป็น "ลีดใหม่ทั้งเครือ" = ลีดที่เข้ามาในช่วงที่เลือก (created_date · ไม่นับแถว HQ) — ตัวเลขคิดที่ฐาน hq_dashboard
test("การ์ดลีดใหม่บนแดชบอร์ด HQ ต้องเท่ากับลีดที่เข้ามาในช่วงที่เลือก", async ({ page }) => {
  await openAs(page, ADMIN, "hq", "/hq/dashboard");
  await settle(page);
  const การ์ด = page.locator("[data-kpi='leads']");
  await expect(การ์ด).toContainText("ลีดใหม่ทั้งเครือ", { timeout: 30_000 });
  await expect(page.locator("[data-kpi]").filter({ hasText: "ลูกค้าใหม่ทั้งเครือ" }), "การ์ดลูกค้าใหม่เอาออกแล้ว").toHaveCount(0);
  // ⚠️ อย่าฝังเลขปีไว้ — ค่าตั้งต้นของตัวกรองคือ "ปีนี้" = 1 ม.ค. ถึงวันนี้
  const วันนี้ = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
  const ต้นปี = `${วันนี้.slice(0, 4)}-01-01`;
  const นับ = async () => (await db.from("leads").select("id", { count: "exact", head: true })
    .neq("dealer_code", "HQ").gte("created_date", ต้นปี).lte("created_date", วันนี้)).count ?? -1;
  // ข้อทดสอบอื่นเพิ่ม/ลบลีดพร้อมกัน — อ่านจอกับตารางซ้ำจนตรงกัน
  await expect.poll(async () => {
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(การ์ด.locator("[data-value]")).not.toHaveAttribute("data-value", "", { timeout: 30_000 });
    return Number(await การ์ด.locator("[data-value]").getAttribute("data-value")) === await นับ();
  }, { timeout: 90_000, intervals: [1000, 3000, 5000], message: "ลีดใหม่บนการ์ด = นับจากตาราง" }).toBe(true);

  // ตรงเป๊ะกับข้อมูลที่รู้ค่า (คิวข้อ 3 · 29 ต.ค. 69): สาขาของข้อมีลีดปีนี้ 2 + ปีก่อน 1 → เลือกดีลเลอร์นั้น การ์ด = 2 · ชื่อการ์ดบอกสาขา
  //   ยอดทั้งเครือข้างบนขยับตามข้ออื่นได้ (จึงอ่านซ้ำจนตรงตาราง) — ส่วนนี้ไม่มีข้อไหนเขียนสาขานี้
  const สาขา = await สร้างสาขาของข้อ({ จังหวัด: "ยะลา", ภาค: "ใต้" });
  try {
    const ฐานเลข = 978_200_000 + (Date.now() % 9_000) * 10;
    const ลีด = (n: number, เมื่อ: string) => ({ id: `#L-${ฐานเลข + n}`, num_id: ฐานเลข + n, dealer_code: สาขา.รหัส,
      company: `ZZTEST-ลีดการ์ด-${สาขา.รหัส}-${n}`, name: "ZZTEST", phone: `000000${String(n).padStart(4, "0")}`, province: "ยะลา", status: "WAITING", created_at: เมื่อ });
    const ปีก่อน = `${Number(วันนี้.slice(0, 4)) - 1}-06-15T03:00:00Z`;
    const { error } = await db.from("leads").insert([ลีด(1, new Date().toISOString()), ลีด(2, new Date().toISOString()), ลีด(3, ปีก่อน)]);
    if (error) throw new Error(`วางลีดของข้อไม่สำเร็จ: ${error.message}`);
    expect((await db.from("leads").select("id", { count: "exact", head: true }).eq("dealer_code", สาขา.รหัส)
      .gte("created_date", ต้นปี).lte("created_date", วันนี้)).count, "ตั้งต้น: ลีดปีนี้ของสาขา = 2 (ฐานคิดวันเข้ามาจากเวลาที่บันทึก)").toBe(2);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /ทุกดีลเลอร์ \(ทั้งเครือ\)/ }).first().click();
    await page.getByRole("button", { name: new RegExp(`^${สาขา.รหัส} – `) }).click();
    await expect(การ์ด, "ชื่อการ์ดบอกว่านับลีดของสาขาที่เลือก").toContainText(`ลีดใหม่ของ ${สาขา.รหัส}`, { timeout: 30_000 });
    await expect(การ์ด.locator("[data-value]"), "ลีดใหม่ของสาขา = 2 (ไม่นับลีดปีก่อน)").toHaveAttribute("data-value", "2", { timeout: 30_000 });
  } finally { await สาขา.ลบ(); }
});

test("แดชบอร์ดดีลเลอร์: แท่งคู่ต้องเป็นหน่วยราย และแท่งหลังไม่เกินแท่งหน้า", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 1100 });
  await openAs(page, RYG, "dealer", "/dashboard");
  await settle(page); await page.waitForTimeout(2500);
  const card = page.locator(".card").filter({ hasText: "ลูกค้าเป้าหมาย เทียบ" }).first();
  const หัวข้อ = (await card.innerText()).split("\n")[0];
  console.log("หัวข้อการ์ด:", หัวข้อ);
  expect(หัวข้อ).toContain("ที่ออกใบเสนอราคาแล้ว");
  // ค่าจากกราฟ: แท่งหน้า (ลูกค้าเป้าหมายใหม่) ต้อง >= แท่งหลังทุกเดือน
  const คู่ = await card.locator("svg rect[height]").count();
  const สูง = await card.evaluate(el => {
    // ⚠️ ห้ามตัดแท่งที่สูง 0 ทิ้ง (พบ 12 ต.ค. 69): เดือนที่ยังไม่มีใบเสนอราคา แท่งหลังสูง 0
    //    ตัดทิ้งแล้วจับคู่ตามลำดับ = แท่งหลังของเดือนถัดไปเลื่อนมาเทียบกับแท่งหน้าของเดือนนี้ → ตกทั้งที่กราฟถูก
    const rects = [...el.querySelectorAll("svg rect")].filter(r => r.getAttribute("fill") && !/transparent/.test(r.getAttribute("fill")!));
    return rects.map(r => ({ x: Math.round(Number(r.getAttribute("x"))), h: Number(r.getAttribute("height")), f: r.getAttribute("fill") }));
  });
  const น้ำเงิน = สูง.filter(r => r.f === "#2563EB").sort((a, b) => a.x - b.x);
  const เหลือง = สูง.filter(r => r.f !== "#2563EB").sort((a, b) => a.x - b.x);
  console.log(`จำนวนแท่ง: ลูกค้าเป้าหมาย ${น้ำเงิน.length} · ออกใบแล้ว ${เหลือง.length} (rect ทั้งหมด ${คู่})`);
  expect(เหลือง.length, "ทุกเดือนต้องมีแท่งครบคู่ (แท่งหน้า + แท่งหลัง)").toBe(น้ำเงิน.length);
  for (let i = 0; i < Math.min(น้ำเงิน.length, เหลือง.length); i++) {
    expect(เหลือง[i].h, `เดือนที่ ${i + 1}: แท่งหลังต้องไม่สูงกว่าแท่งหน้า`).toBeLessThanOrEqual(น้ำเงิน[i].h + 0.5);
  }
  await card.screenshot({ path: dir + "dealer-leadquote.png" });
});
