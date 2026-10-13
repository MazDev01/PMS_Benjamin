// ── ตัวเลขบนการ์ดต้องตรงกับชื่อการ์ด และแท่งคู่ต้องเป็นหน่วยเดียวกัน (ตรวจพบ 24 ส.ค. 69) ──
//
// 1) การ์ดบนแดชบอร์ดสำนักงานใหญ่เดินตามตัวกรองช่วงเวลา = นับ "ลูกค้าใหม่ในช่วงนั้น"
//    แต่ป้ายเดิมเขียนว่า "ลูกค้าทั้งเครือ / จำนวนลูกค้าทั้งหมดในเครือ" → ขึ้น 11 ขณะที่หน้าลูกค้าขึ้น 51
// 2) แดชบอร์ดดีลเลอร์เทียบ "ราย" กับ "ใบ" ในกราฟเดียวกัน แท่งหลังจึงยาวเกินแท่งหน้าได้
import { test, expect } from "@playwright/test";
import { ADMIN, RYG, skipReason } from "./supabaseEnv";
import { openAs, settle } from "./helpers";
import { createClient } from "@supabase/supabase-js";
import { ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY } from "./adminEnv";
const db = createClient(ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY);
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(240_000);
const dir = "C:/Users/boomb/AppData/Local/Temp/claude/c---claude-Benjamin-HQ-main/bd7e01dd-bc43-471f-943d-554aa158563a/scratchpad/";

test("การ์ดลูกค้าบนแดชบอร์ด ต้องบอกว่าเป็นลูกค้าใหม่ในช่วงที่เลือก", async ({ page }) => {
  await openAs(page, ADMIN, "hq", "/hq/dashboard");
  await settle(page); await page.waitForTimeout(2000);
  const t = await page.locator("body").innerText();
  console.log("ป้ายการ์ด:", t.includes("ลูกค้าใหม่ทั้งเครือ") ? "ลูกค้าใหม่ทั้งเครือ ✓" : "ยังเป็นของเดิม");
  expect(t).toContain("ลูกค้าใหม่ทั้งเครือ");
  // ค่าที่ขึ้นต้องเท่ากับจำนวนลูกค้าที่ join ในปีนี้จริง
  // ⚠️ อย่าฝังเลขปีไว้ — ค่าตั้งต้นของตัวกรองคือ "ปีนี้" ซึ่งเลื่อนไปเองทุกปี
  // ช่วง "ปีนี้" ของตัวกรอง = 1 ม.ค. ถึง "วันนี้" (FilterContext: start = 1 ม.ค. · end = now)
  //   ไม่ใช่ทั้งปีปฏิทิน — ลูกค้าที่ลงวันที่เป็นลูกค้าไว้ล่วงหน้า (เดือนหน้า) จึงยังไม่ถูกนับ ถูกต้องแล้ว
  //   เดิมเทสต์นับ "ทุกแถวที่ขึ้นต้นด้วยปีนี้" เลยมากกว่าการ์ดตอนฐานมีวันที่ล่วงหน้าค้างอยู่
  const วันนี้ = new Date();
  const ต้นปี = `${วันนี้.getFullYear()}-01-01`;
  const ถึงวันนี้ = `${วันนี้.getFullYear()}-${String(วันนี้.getMonth() + 1).padStart(2, "0")}-${String(วันนี้.getDate()).padStart(2, "0")}`;
  const { data: c } = await db.from("customers").select("join_date");
  const ปีนี้ = (c ?? []).filter(x => {
    const d = String(x.join_date ?? "").slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= ต้นปี && d <= ถึงวันนี้;
  }).length;
  const การ์ด = page.locator("[class*=kpi]").filter({ hasText: "ลูกค้าใหม่ทั้งเครือ" }).first();
  const เลข = (await การ์ด.innerText()).match(/(\d+)\s*\n?\s*ราย/)?.[1];
  console.log(`ค่าบนการ์ด ${เลข} · ลูกค้าที่เริ่มปีนี้จริง ${ปีนี้}`);
  expect(Number(เลข)).toBe(ปีนี้);
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
