// ── ตัวเลขที่เคยทำให้ตัดสินใจผิด (ผลตรวจภายนอกระยะ 2 · 24 ส.ค. 69) ──
//
// HQ-07 ยอดรวมบนหัวการ์ดคิดจากค่ารายเดือนที่ปัดแล้ว → เพี้ยนจากยอดจริง (฿81.8M vs ฿81.6M)
// HQ-02/DL-03 "อัตราปิดการขาย" ใช้ชื่อเดียวกันแต่คนละตัวหารในหลายหน้า → อ่านเหมือนระบบให้เลขขัดกัน
// DL-08 เปอร์เซ็นต์แต่ละขั้นปัดแยกกันแล้วรวมได้ 103%
import { test, expect } from "@playwright/test";
import { ADMIN, RYG, skipReason } from "./supabaseEnv";
import { openAs, settle } from "./helpers";
import { createClient } from "@supabase/supabase-js";
import { ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY } from "./adminEnv";
const db = createClient(ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY);
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(240_000);

test("ยอดรวมบนหัวการ์ดกราฟ ต้องตรงกับผลบวกจริง (ไม่ใช่ผลบวกของค่าที่ปัดแล้ว)", async ({ page }) => {
  const ผลบวก = async () => {
    const { data: q } = await db.from("quotations").select("total_value,date,status").eq("status", "won");
    // ⚠️ ต้องใช้ "ช่วงเดียวกับตัวกรองบนหน้าจอ" ซึ่งค่าตั้งต้นคือ "ปีนี้" (FilterContext · DEFAULTS.preset)
    //    เดิมบวกย้อนหลัง 6 เดือน — ตรงกันโดยบังเอิญตอนฐานทดสอบมีแต่ข้อมูลใหม่ ๆ เท่านั้น
    //    พอฐานมีใบที่ปิดการขายช่วงต้นปีด้วย หัวการ์ด (นับทั้งปี) ย่อมมากกว่าผลบวก 6 เดือน แล้วฟ้องผิด
    const ต้นปี = `${new Date().getFullYear()}-01-01`;
    const รวม = (q ?? []).filter(x => String(x.date).slice(0, 10) >= ต้นปี).reduce((s, x) => s + Number(x.total_value || 0), 0);
    return `฿${(รวม / 1e6).toFixed(1)}M`;
  };
  const ผลบวกก่อนเปิดหน้า = await ผลบวก();
  await openAs(page, ADMIN, "hq", "/hq/dashboard");
  await settle(page); await page.waitForTimeout(2500);
  const card = page.locator(".card").filter({ hasText: "ยอดขายรวมทั้งเครือ" }).first();
  const t = (await card.innerText()).split("\n").filter(Boolean);
  const หัวการ์ด = t.find(x => /^฿[\d.]+M$/.test(x.trim())) ?? "";
  // อ่านค่ารายเดือนจากป้ายบนกราฟไม่ได้ตรง ๆ → เทียบกับผลรวมจากฐานข้อมูลในช่วง 6 เดือนล่าสุดแทน
  // ⚠️ ตอนรันทั้งชุดพร้อมกัน ชุดอื่นสร้าง/ปิดใบเสนอราคาของตัวเองอยู่ตลอด ผลบวกในฐานข้อมูล
  //   จึงขยับได้ระหว่าง "หน้าจอวาดตัวเลข" กับ "เทสต์ไปบวกเลขมาเทียบ" (เจอจริง 26 ส.ค. 69:
  //   ฿182.3M vs ฿181.8M = ใบของอีกชุดหนึ่งที่เกิดขึ้นคั่นกลางพอดี)
  //   จึงบวกสองครั้ง คร่อมเวลาที่อ่านหน้าจอ แล้วยอมรับถ้าตรงกับครั้งใดครั้งหนึ่ง
  //   ถ้าไม่มีใครเขียนแทรก สองค่านี้เท่ากัน = เข้มงวดเท่าเดิมทุกประการ
  const ก่อน = ผลบวกก่อนเปิดหน้า;
  const หลัง = await ผลบวก();
  console.log("หัวการ์ด:", หัวการ์ด, "· ผลบวกจริง 6 เดือน ก่อน/หลัง:", ก่อน, "/", หลัง);
  expect([ก่อน, หลัง], `หัวการ์ด ${หัวการ์ด} ต้องตรงกับผลบวกจริง (ก่อน ${ก่อน} · หลัง ${หลัง})`).toContain(หัวการ์ด);
});

test("ชื่อการ์ดอัตราปิดการขายต้องบอกตัวหาร และไม่ซ้ำกันข้ามหน้า", async ({ page }) => {
  await openAs(page, ADMIN, "hq", "/hq/pipeline");
  await settle(page); await page.waitForTimeout(1500);
  const a = await page.locator("body").innerText();
  // รอบ 4 (บอสตัดสิน 21 ต.ค. 69): ชื่อเดียว "อัตราปิดการขาย" + คำอธิบายตัวหาร (นับจากลีด · lib/winRate.ts)
  expect(a).toContain("อัตราปิดการขาย");
  expect(a, "บอกตัวหาร").toContain("ลูกค้าเป้าหมายปิดสำเร็จ ÷ (ปิดสำเร็จ + ปิดไม่สำเร็จ)");
  expect(a, "ไม่มีชื่อเก่าที่คิดจากใบ").not.toContain("อัตราปิดการขาย (จากใบที่รู้ผลแล้ว)");
  await openAs(page, ADMIN, "hq", "/hq/quotations");
  await settle(page); await page.waitForTimeout(1500);
  const b = await page.locator("body").innerText();
  expect(b).toContain("อัตราตอบรับ (จากใบที่ส่งแล้ว)");
  expect(b, "หน้าใบเสนอราคาไม่ใช้ชื่อ \"อัตราปิดการขาย\" กับอัตราที่คิดจากใบ").not.toContain("อัตราปิดการขาย");
  console.log("ชื่อการ์ดสองหน้าแยกกันแล้ว ✓");
});

test("สัดส่วนขั้นตอนการขายบนแดชบอร์ดดีลเลอร์ ต้องรวมได้ 100%", async ({ page }) => {
  await openAs(page, RYG, "dealer", "/dashboard");
  await settle(page); await page.waitForTimeout(2500);
  const card = page.locator(".card").filter({ hasText: "ขั้นตอนการขาย" }).first();
  const pcts = [...(await card.innerText()).matchAll(/\((\d+)%\)/g)].map(m => Number(m[1]));
  console.log("เปอร์เซ็นต์แต่ละขั้น:", pcts.join(" + "), "=", pcts.reduce((s, v) => s + v, 0));
  expect(pcts.length).toBeGreaterThan(0);
  expect(pcts.reduce((s, v) => s + v, 0)).toBe(100);
});
