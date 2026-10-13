import { test, expect } from "@playwright/test";
import { ADMIN, appEnv, skipReason } from "./supabaseEnv";
import { openAs } from "./helpers";

// ── กด "เข้าระบบแทนดีลเลอร์" แล้วต้องเข้าไปถึงแดชบอร์ดของสาขาจริง ─────────────────
//
// ⚠️ บั๊กจริงบนเว็บใช้งานจริง (พบ 26 ส.ค. 69): กดแล้วเด้งไปหน้าเข้าสู่ระบบของดีลเลอร์ทุกครั้ง
//    ต้นเหตุ: หน้า /impersonate ตรวจใบผ่านแล้วสั่งไปแดชบอร์ดเลย ซึ่งพอในโหมด supabase
//    (ตัวเก็บ session อยู่ในเบราว์เซอร์) แต่เว็บจริงรันโหมด api ที่ session อยู่ใน cookie
//    ของเซิร์ฟเวอร์เท่านั้น → ไม่มีใครตั้ง cookie ให้ แล้วตัวกันหน้าก็เตะออกไปหน้าเข้าสู่ระบบ
//
// ⚠️ เทสต์เดิม (impersonate.spec.ts) ตรวจแค่ "เซิร์ฟเวอร์ออกลิงก์ถูกไหม" ไม่เคยขับเบราว์เซอร์
//    ผ่านหน้าแลกใบผ่านจริง จึงไม่มีทางจับบั๊กนี้ได้ — ใบนี้เติมส่วนที่ขาด
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(180_000);

test("[func] HQ กด 'เข้าระบบแทนดีลเลอร์' → เข้าถึงแดชบอร์ดของสาขาได้จริง", async ({ context, page }) => {
  await openAs(page, ADMIN, "hq", "/hq/dealers?view=table");   // หน้าเริ่มเป็นการ์ด — เทสต์นี้ใช้แถวตาราง
  await expect(page.locator("tbody tr").first()).toBeVisible({ timeout: 30_000 });

  // ⚠️ ต้องกดที่แถวของสาขาที่ "มีบัญชีเข้าระบบ" (RYG) — ห้ามกดแถวแรกเฉย ๆ (พบ 12 ต.ค. 69)
  //    ฐานทดสอบมีบัญชีแค่ RYG/CNX อีก 6 สาขาไม่มี · ตารางเรียงเพิ่มล่าสุดบนสุด แถวแรกจึงเป็นสาขาที่ไม่มีบัญชี
  //    → เซิร์ฟเวอร์ตอบ 404 "ไม่พบบัญชีเข้าระบบ" หน้าจอแจ้งและปิดแท็บ (ถูกต้องแล้ว) แต่ข้อนี้ตกเพราะรอแท็บที่ไม่มีวันเปิด
  const ปุ่ม = page.locator("tbody tr").filter({ hasText: "RYG" }).getByRole("button", { name: /เข้าระบบ/ }).first();
  await expect(ปุ่ม, "ต้องมีปุ่มเข้าระบบแทนให้ผู้ดูแลกด").toBeVisible();
  const [แท็บ] = await Promise.all([
    context.waitForEvent("page", { timeout: 60_000 }),
    ปุ่ม.click(),
  ]);

  // ต้องไปจบที่แดชบอร์ดของดีลเลอร์ ไม่ใช่หน้าเข้าสู่ระบบ
  await แท็บ.waitForURL(/\/dashboard/, { timeout: 60_000 }).catch(() => {});
  const ปลายทาง = new URL(แท็บ.url()).pathname;
  const ข้อความ = (await แท็บ.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 200);
  expect(ปลายทาง, `ต้องเข้าถึงแดชบอร์ดของสาขา (ได้ ${ปลายทาง} · จอ: ${ข้อความ}) · โหมด=${appEnv("NEXT_PUBLIC_DATA_SOURCE")}`)
    .toContain("/dashboard");

  // ⚠️ แค่ "ถึงหน้าแดชบอร์ด" ยังไม่พอที่จะพิสูจน์ว่าเข้าระบบแทนสำเร็จ (พบ 26 ส.ค. 69)
  //    ตอนทดสอบในเครื่อง สองแอปอยู่บน localhost คนละพอร์ต ซึ่งเบราว์เซอร์ถือว่าเป็นโฮสต์เดียวกัน
  //    แอปดีลเลอร์จึงมองเห็น cookie ของผู้ดูแลสำนักงานใหญ่ แล้ว "ดูเหมือนเข้าได้" ทั้งที่ยังไม่ได้แลกใบผ่านเลย
  //    บนเว็บใช้งานจริงคนละโดเมนกัน จึงไม่มีการยืมกันแบบนี้ = เด้งไปหน้าเข้าสู่ระบบ
  //    ต้องถามให้ชัดว่า "ตอนนี้เป็นใคร" — ต้องเป็นสาขา ไม่ใช่ผู้ดูแลสำนักงานใหญ่
  if (appEnv("NEXT_PUBLIC_DATA_SOURCE") === "api") {
    const ตัวตน = await แท็บ.evaluate(async () => {
      const r = await fetch("/api/v1/auth", { credentials: "same-origin", cache: "no-store" });
      return r.ok ? await r.json().catch(() => null) : { สถานะ: r.status };
    });
    const เห็นเป็นใคร = JSON.stringify(ตัวตน);
    expect(String((ตัวตน as any)?.dealerCode ?? ""),
      `หลังเข้าระบบแทน แอปดีลเลอร์ต้องเห็นเราเป็น "สาขา" ไม่ใช่ผู้ดูแลสำนักงานใหญ่ (ได้ ${เห็นเป็นใคร})`).not.toBe("");
    expect(String((ตัวตน as any)?.role ?? ""),
      `บทบาทต้องไม่ใช่ผู้ดูแลสำนักงานใหญ่ (ได้ ${เห็นเป็นใคร})`).not.toBe("SUPER_ADMIN");
  }
});
