// ── ช่องประเมินราคาของลูกค้าเป้าหมาย (กรอกเอง · การคิดให้อัตโนมัติลบไปพร้อม Flow เก่า 16 ต.ค. 69) ────
//
// ที่มา: บอสถามว่า "ทำไมมูลค่าถึงไม่มี แล้วเอามูลค่ามาจากไหน" — เดิมมาจากช่องที่เซลส์
// กรอกเองล้วน ๆ ไม่กรอกก็ว่าง ตอนนี้ระบบคิดให้เป็นค่าตั้งต้น แต่พิมพ์ทับได้เสมอ
//
// และช่องนี้ต้องอยู่ "ที่เดียวกัน" ทั้งฟอร์มเพิ่มและแผงแก้ไข
// (บอสแจ้ง: "ข้อมูลที่กรอกและที่แก้ไม่ตรงกัน ข้อมูลกรอกมีประเมินราคา แต่ที่แก้ไม่มี")
import { test, expect } from "@playwright/test";
import { RYG, skipReason } from "./supabaseEnv";
import { DEALER_ORIGIN, loginUI } from "./funcHelpers";

test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(240_000);

// ข้อ "กรอกพื้นที่ + เลือกแม่แบบ → ประเมินราคาขึ้นให้เอง" ลบแล้ว 16 ต.ค. 69 — การคิดจาก พื้นที่ × ราคาแม่แบบ เป็นของ Flow เก่า
//   (บอสสั่งลบ Flow เก่า · ดีลเลอร์ไม่เห็นราคาแม่แบบแล้ว) ช่องประเมินราคาเหลือให้กรอกเอง

test("[ui] ช่องประเมินราคาต้องมีทั้งตอนเพิ่มและตอนแก้ไข อยู่กลุ่มเดียวกัน", async ({ page }) => {
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });

  const row = page.locator("tbody tr").first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.getByRole("button", { name: "ดูรายละเอียด" }).first().click();

  const ช่องแก้ = page.getByLabel("ประเมินราคา").first();
  await expect(ช่องแก้, "แผงแก้ไขต้องมีช่องประเมินราคาเหมือนฟอร์มเพิ่ม").toBeVisible({ timeout: 20_000 });

  // ต้องอยู่ในกลุ่ม "รายละเอียดงาน" คู่กับพื้นที่ — ที่เดียวกับฟอร์มเพิ่ม
  const อยู่ใต้ = await ช่องแก้.evaluate(el => {
    const box = el.getBoundingClientRect();
    const หัวข้อ = Array.from(document.querySelectorAll("div")).find(d => d.textContent?.trim() === "รายละเอียดงาน");
    const พื้นที่ = document.querySelector('input[type="number"]');
    return { หลังหัวข้อ: !!หัวข้อ && หัวข้อ.getBoundingClientRect().top < box.top,
             ใกล้พื้นที่: !!พื้นที่ && Math.abs(พื้นที่.getBoundingClientRect().top - box.top) < 200 };
  });
  expect(อยู่ใต้.หลังหัวข้อ, 'ช่องประเมินราคาต้องอยู่ใต้หัวข้อ "รายละเอียดงาน"').toBe(true);
  expect(อยู่ใต้.ใกล้พื้นที่, "ต้องอยู่ใกล้ช่องพื้นที่ (กลุ่มเดียวกัน)").toBe(true);
});
