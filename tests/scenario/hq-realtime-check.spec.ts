import { test, expect } from "@playwright/test";
import { RYG, ADMIN, skipReason } from "./supabaseEnv";
import { DEALER_ORIGIN, HQ_ORIGIN, loginUI, db, cleanup, specNS, nsTag } from "./funcHelpers";
import { settle } from "./helpers";

// ── ยืนยันว่า HQ Dashboard อัปเดต "โดยไม่ต้องรีเฟรชเอง" จริงไหม (ไม่ใช่แค่ถูกต้องตอน navigate ใหม่) ──
// เปิด HQ dashboard ค้างไว้ 1 แท็บ แล้วให้ดีลเลอร์สร้างลูกค้าใหม่ผ่านอีกช่องทาง (ตรงผ่าน DB จำลอง
// การเขียนจริงจากฝั่งดีลเลอร์) แล้วจับเวลาว่าตัวเลขบนแท็บ HQ ที่เปิดค้างไว้เปลี่ยนเองภายในกี่วินาที
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(120_000);

const NS = specNS("HQRT");
const tg = nsTag(NS);

test.beforeAll(async () => { await cleanup(await db(RYG), "RYG", NS); });
test.afterAll(async () => { await cleanup(await db(RYG), "RYG", NS); });

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

  // การ์ด "ลีดใหม่ทั้งเครือ" (แดชบอร์ดแบบเดิม + ตัวคำนวณที่ฐาน hq_dashboard · 21 ต.ค. 69) — ค่าเต็มอยู่ที่ data-value
  //   เดิมวัดการ์ดลูกค้าทั้งเครือ ซึ่งเอาออกแล้ว (นับลูกค้าที่เกิดหลังปิดการขาย ได้ 0 ทั้งที่กราฟมีลีดหลายสิบ)
  const kpiLocator = page.locator("[data-kpi='leads'] [data-value]");
  await expect(kpiLocator).not.toHaveAttribute("data-value", "", { timeout: 30_000 });
  const before = ((await kpiLocator.getAttribute("data-value")) ?? "");
  console.log(`[realtime] ตัวเลขก่อนดีลเลอร์เพิ่มลูกค้า: "${before.replace(/\n/g, " | ")}"`);

  // ให้ RYG เพิ่มลูกค้าใหม่จริงผ่านช่องทางที่แอปใช้จริง (RPC atomic เดียวกับที่ฟอร์มเรียก) —
  // ไม่ผ่าน UI ของดีลเลอร์ กันตัวแปรเรื่องความเร็ว UI ปน กับสิ่งที่ทดสอบจริง (ความเร็ว realtime ฝั่ง HQ)
  //
  // เพิ่มทีละ 3 ราย ไม่ใช่ 1: การ์ดนี้นับ "ลูกค้าทั้งเครือ" = ยอดรวมทั้งระบบ ซึ่งสเปกอื่นที่รันขนานกัน
  // ก็ลบลูกค้าทดสอบของตัวเองอยู่เหมือนกัน · ถ้าเราเพิ่ม 1 แล้วบังเอิญมีคนลบ 1 พร้อมกัน ตัวเลขจะเท่าเดิม
  // → เทสต์สรุปว่า "realtime ไม่ทำงาน" ทั้งที่ทำงานปกติ (เจอจริงตอนรันชุดเต็ม 6 ส.ค. 69)
  // เพิ่มลีด 3 ราย (ไม่ใช่ 1) — ข้อทดสอบอื่นที่รันขนานกันลบลีดของตัวเองอยู่ ยอดรวมทั้งเครืออาจวนกลับมาเท่าเดิมพอดี
  const sb = await db(RYG);
  for (let n = 1; n <= 3; n++) {
    const เลข = 979_300_000 + (Date.now() % 90_000) * 10 + n;
    const { error } = await sb.from("leads").insert({
      id: `#L-${เลข}`, num_id: เลข, dealer_code: "RYG", company: tg(`ลีดเรียลไทม์-${n}`), name: `คุณเรียลไทม์ ${n}`,
      phone: `000000${String(n).padStart(4, "0")}`, province: "ระยอง", status: "WAITING",
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
    if (now !== before) { changedAfterMs = Date.now() - insertedAt; break; }
    await page.waitForTimeout(500);
  }

  if (changedAfterMs !== null) {
    console.log(`[realtime] ✅ ตัวเลขบน HQ dashboard เปลี่ยนเอง (ไม่รีเฟรช) ภายใน ${changedAfterMs}ms`);
    expect(changedAfterMs, "HQ dashboard ควรอัปเดตเองโดยไม่ต้องรีเฟรช").not.toBeNull();
    return;
  }

  // ── ตัวเลขไม่ขยับ: ต้องแยกให้ออกว่า "หน้าจอค้าง" หรือ "ตัวเลขบังเอิญกลับมาเท่าเดิม" ──
  // การ์ดนี้นับลีดใหม่ทั้งเครือ = ยอดรวมทั้งระบบ · ตอนรันชุดเต็ม สเปกอื่นทั้งเพิ่มและลบลูกค้าทดสอบพร้อมกัน
  // ยอดรวมจึงกลับมาเท่าค่าเดิมได้จริง ๆ ทั้งที่หน้าจออัปเดตปกติ — ถ้าไม่แยก จะสรุปผิดว่า realtime พัง
  const hqSb = await db(ADMIN);
  const ปีนี้ = `${new Date().getFullYear()}-01-01`, วันนี้ = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
  const { count: dbNow } = await hqSb.from("leads").select("id", { count: "exact", head: true })
    .neq("dealer_code", "HQ").gte("created_date", ปีนี้).lte("created_date", วันนี้);
  const uiNow = ((await kpiLocator.getAttribute("data-value")) ?? "");
  const uiNum = Number(uiNow);
  console.log(`[realtime] ตัวเลขไม่ขยับใน 45 วินาที · บนจอ=${uiNum} · ในฐานข้อมูลจริง=${dbNow} · การเชื่อมต่อ=[${wsLog.join(",") || "ไม่มีการเชื่อมต่อเลย"}] · คำตอบตอนสมัคร=[${joinReplies.join(",") || "ไม่มี"}] · สัญญาณข้อมูลใหม่ที่ได้รับ=${changeFrames} · ข้อความการ์ด="${uiNow.replace(/\n/g, " | ")}"`);

  // จอตรงกับฐานข้อมูล = หน้าจอไม่ได้ค้าง แค่ยอดรวมวนกลับมาเท่าเดิมพอดีจากสเปกอื่นที่ลบข้อมูลพร้อมกัน
  expect(uiNum,
    `หน้าจอ HQ ไม่ตรงกับฐานข้อมูลและไม่ขยับเองเลยใน 45 วินาที (บนจอ=${uiNum} จริง=${dbNow}) — realtime ฝั่ง HQ ไม่ทำงาน`,
  ).toBe(dbNow);
});
