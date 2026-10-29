import { test, expect } from "@playwright/test";
import { ADMIN, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { HQ_ORIGIN, loginUI, db } from "./funcHelpers";
import { settle } from "./helpers";
import { สร้างสาขาของข้อ, type สาขาของข้อ } from "./ownDealer";

// ── ยืนยันว่า HQ Dashboard อัปเดต "โดยไม่ต้องรีเฟรชเอง" จริงไหม (ไม่ใช่แค่ถูกต้องตอน navigate ใหม่) ──
// เปิด HQ dashboard ค้างไว้ 1 แท็บ แล้วให้ดีลเลอร์เพิ่มลีดผ่านอีกช่องทาง (ตรงผ่าน DB ด้วยบัญชีดีลเลอร์ จำลอง
// การเขียนจริงจากฝั่งดีลเลอร์) แล้วจับเวลาว่าตัวเลขบนแท็บ HQ ที่เปิดค้างไว้เปลี่ยนเองภายในกี่วินาที
// คิวข้อ 3 (29 ต.ค. 69): เดิมดูการ์ดลีดใหม่ทั้งเครือ + ให้ RYG เพิ่มลีด — ข้ออื่นเพิ่ม/ลบลีดพร้อมกัน ยอดรวมวนกลับมาเท่าเดิมได้
//   → ตอนนี้ใช้สาขาของข้อ (ไม่มีข้อไหนเขียน) เลือกดีลเลอร์นั้นบนแดชบอร์ด แล้วรอให้การ์ดเป็นค่าที่รู้แน่นอน 0 → 3
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.setTimeout(120_000);

let สาขา: สาขาของข้อ;
test.beforeAll(async () => { สาขา = await สร้างสาขาของข้อ({ จังหวัด: "ยะลา", ภาค: "ใต้" }); });
test.afterAll(async () => { await สาขา?.ลบ(); });

test("[realtime] HQ dashboard เปิดค้างไว้ → ตัวเลขลีดใหม่ทั้งเครือขยับเองโดยไม่ต้องรีเฟรช เมื่อดีลเลอร์เพิ่มลีดใหม่", async ({ page }) => {
  // บันทึกอายุการเชื่อมต่อ realtime ไว้ — ถ้าจอไม่อัปเดต ต้องรู้ว่า "ต่อไม่ติด/ถูกตัด" หรือ "ต่อติดแต่ไม่มีสัญญาณมา"
  const wsLog: string[] = [];
  const joinReplies: string[] = [];
  let changeFrames = 0;
  page.on("websocket", ws => {
    if (!/realtime/.test(ws.url())) return;
    wsLog.push("เปิด");
    ws.on("close", () => wsLog.push("ปิด"));
    ws.on("socketerror", (err) => wsLog.push(`ผิดพลาด:${String(err).slice(0, 60)}`));
    // ดูคำตอบตอน "ขอสมัครรับข้อมูล" ว่าเซิร์ฟเวอร์ตอบ ok หรือ error — สายเปิดอยู่ไม่ได้แปลว่าสมัครสำเร็จ
    ws.on("framereceived", (f) => {
      const s = typeof f.payload === "string" ? f.payload : "";
      if (!s) return;
      if (s.includes("phx_reply")) {
        const status = s.match(/"status":"(\w+)"/)?.[1];
        const reason = s.match(/"reason":"([^"]{0,80})"/)?.[1];
        if (status && joinReplies.length < 6) joinReplies.push(reason ? `${status}(${reason})` : status);
      }
      if (s.includes("postgres_changes") && s.includes("INSERT")) changeFrames += 1;
    });
  });

  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await page.goto(`${HQ_ORIGIN}/hq/dashboard`, { waitUntil: "domcontentloaded" });
  await settle(page);

  // การ์ด "ลีดใหม่" (ตัวคำนวณที่ฐาน hq_dashboard · 21 ต.ค. 69) — ค่าเต็มอยู่ที่ data-value
  //   เลือกสาขาของข้อ → การ์ดนับลีดของสาขานั้น (สาขาใหม่ = 0 แน่นอน)
  const การ์ด = page.locator("[data-kpi='leads']");
  const kpiLocator = การ์ด.locator("[data-value]");
  await expect(การ์ด, "การ์ดทั้งเครือก่อนเลือกดีลเลอร์").toContainText("ลีดใหม่ทั้งเครือ", { timeout: 30_000 });
  await page.getByRole("button", { name: /ทุกดีลเลอร์ \(ทั้งเครือ\)/ }).first().click();
  await page.getByRole("button", { name: new RegExp(`^${สาขา.รหัส} – `) }).click();
  await expect(การ์ด).toContainText(`ลีดใหม่ของ ${สาขา.รหัส}`, { timeout: 30_000 });
  await expect(kpiLocator, "สาขาของข้อยังไม่มีลีด").toHaveAttribute("data-value", "0", { timeout: 30_000 });
  const before = ((await kpiLocator.getAttribute("data-value")) ?? "");
  console.log(`[realtime] ตัวเลขก่อนดีลเลอร์เพิ่มลีด: "${before}"`);

  // ให้ดีลเลอร์ (บัญชีของสาขาของข้อ) เพิ่มลีดจริงผ่านฐาน — ไม่ผ่าน UI ของดีลเลอร์ กันตัวแปรเรื่องความเร็ว UI ปน
  //   กับสิ่งที่ทดสอบจริง (ความเร็ว realtime ฝั่ง HQ) · เพิ่ม 3 ราย แล้วรอให้การ์ดเป็น 3 พอดี (ไม่มีข้ออื่นเขียนสาขานี้)
  const sb = await db(สาขา.บัญชี);
  const ฐานเลข = 978_300_000 + (Date.now() % 9_000) * 10;
  for (let n = 1; n <= 3; n++) {
    const { error } = await sb.from("leads").insert({
      id: `#L-${ฐานเลข + n}`, num_id: ฐานเลข + n, dealer_code: สาขา.รหัส, company: `ZZTEST-ลีดเรียลไทม์-${สาขา.รหัส}-${n}`, name: `คุณเรียลไทม์ ${n}`,
      phone: `000000${String(n).padStart(4, "0")}`, province: "ยะลา", status: "WAITING",
    });
    if (error) throw new Error(`สร้างลีดทดสอบรายที่ ${n} ไม่สำเร็จ: ${error.message}`);
  }
  const insertedAt = Date.now();

  // จับเวลาว่าตัวเลขบน HQ dashboard ที่เปิดค้างไว้ (ไม่ได้กด reload/navigate เอง) เปลี่ยนเองภายในกี่วินาที
  // สิ่งที่รับประกันกับผู้ใช้คือ "ตัวเลขขยับเองโดยไม่ต้องรีเฟรช" ไม่ใช่ "ต้องเร็วกว่า N วินาที"
  //   ทางปกติ = สัญญาณ realtime (วัดได้จริงราว 0.5 วินาที)
  //   ทางสำรอง = ตาข่ายซิงก์ซ้ำทุก 30 วินาที ที่เพิ่มไว้ใน SalesContext กันกรณีสัญญาณไม่มา
  // จึงรอได้ถึง 45 วินาที เพื่อครอบคลุมทั้งสองทาง (ถ้าเลยนี้ = ค้างจริง ผู้ใช้ต้องรีเฟรชเอง)
  let changedAfterMs: number | null = null;
  for (let i = 0; i < 90; i++) {
    const now = ((await kpiLocator.getAttribute("data-value")) ?? "");
    if (now === "3") { changedAfterMs = Date.now() - insertedAt; break; }
    await page.waitForTimeout(500);
  }
  const uiNow = ((await kpiLocator.getAttribute("data-value")) ?? "");
  if (changedAfterMs !== null) console.log(`[realtime] ✅ ตัวเลขบน HQ dashboard เปลี่ยนเอง (ไม่รีเฟรช) เป็น 3 ภายใน ${changedAfterMs}ms`);
  else console.log(`[realtime] ตัวเลขไม่เป็น 3 ใน 45 วินาที · บนจอ=${uiNow} · การเชื่อมต่อ=[${wsLog.join(",") || "ไม่มีการเชื่อมต่อเลย"}] · คำตอบตอนสมัคร=[${joinReplies.join(",") || "ไม่มี"}] · สัญญาณข้อมูลใหม่ที่ได้รับ=${changeFrames}`);
  expect(uiNow, `หน้าจอ HQ ไม่ขยับเองเป็นลีด 3 รายของสาขาใน 45 วินาที (บนจอ=${uiNow}) — realtime ฝั่ง HQ ไม่ทำงาน`).toBe("3");
});
