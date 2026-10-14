import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY } from "./adminEnv";
import { REAL_BACKEND, RYG } from "./supabaseEnv";
import { เตรียมใบHQ, ทำใบลูกค้าจากใบHQ, ล้างใบHQทดสอบ, type ใบHQพร้อมใช้ } from "./hqQuoteFixture";

// ── ยอดสะสมของลูกค้า ต้องตรงกับใบที่ปิดการขายได้ "เสมอ" แม้ไม่มีใครสั่งให้คำนวณ ─────────
//
// เดิมยอดนี้ถูกต้องได้ก็ต่อเมื่อแอปเรียกคำสั่งคำนวณให้ถูกที่ถูกเวลา — เส้นทางไหนลืมเรียก
// หรือเรียกไม่สำเร็จ (เน็ตหลุดกลางทาง) ยอดจะเพี้ยนค้างไว้โดยไม่มีใครรู้
// เคยเจอจริงจากชุดตรวจรับ: ลูกค้าที่มียอดสะสมหลายล้าน แต่ไม่มีใบเสนอราคาสักใบ
//
// 0114 ย้ายการรับประกันลงไปที่ชั้นฐานข้อมูล — เทสต์นี้เขียนข้อมูลตรงเข้าฐานข้อมูล
// (ไม่ผ่านแอปเลย) แล้วดูว่ายอดขยับเองถูกต้องไหม
//
// ด่าน 3 (0201/0202): ใบใหม่ต้องทำจากใบ HQ และใบเดิมที่ปิดแล้วถูกล็อก — ข้อทดสอบนี้จึงใช้ใบที่ทำจากใบ HQ จริง
//   (ต้นทุน = ยอดที่ต้องการ · บวก 0%) ด้วยคำสั่งของฐานในนามดีลเลอร์ · ย้อน won/ลบใบ ทำกับใบแบบนี้ได้ตามกติกา Flow
test.skip(!REAL_BACKEND, "ต้องใช้ฐานข้อมูลจริง");
test.describe.configure({ mode: "serial" });

const db = createClient(ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const TAG = "ZZTEST-TOTAL";
const CID = 990301;
const DEALER = "RYG";

async function totalOf(): Promise<number> {
  const { data } = await db.from("customers").select("total_value").eq("dealer_code", DEALER).eq("id", CID);
  return Number(data?.[0]?.total_value ?? -1);
}
const ใบของข้อทดสอบ: ใบHQพร้อมใช้[] = [];
const ใบเลข = new Map<string, string>();   // ชื่อในข้อทดสอบ → เลขใบที่ฐานออกให้
async function ใบจากHQ(ชื่อ: string, ยอด: number, status: "draft" | "won") {
  const h = await เตรียมใบHQ(RYG, { dealerCode: DEALER, company: `${TAG}-${ชื่อ}-${Date.now() % 100000}`, province: "ระยอง",
    lines: [{ name: "งานทดสอบยอดลูกค้า", qty: 1, unit: "งาน", unitCost: ยอด }] });
  ใบของข้อทดสอบ.push(h);
  const q = await ทำใบลูกค้าจากใบHQ(RYG, h, { customer: `${TAG}-ลูกค้า`, markupPercent: 0, status,
    extra: { customer_id: CID, date: "2026-05-01" } });
  ใบเลข.set(ชื่อ, q.id);
  return q;
}
async function cleanup() {
  ล้างใบHQทดสอบ(DEALER, ใบของข้อทดสอบ.map(h => h.leadNum));
  ใบของข้อทดสอบ.length = 0;
  await db.from("customers").delete().eq("dealer_code", DEALER).eq("id", CID);
}

test.beforeAll(async () => {
  await cleanup();
  const { error } = await db.from("customers").insert({
    id: CID, dealer_code: DEALER, company: `${TAG}-ลูกค้า`, name: `${TAG}-ลูกค้า`,
    province: "ระยอง", status: "active", total_value: 0,
  });
  if (error) throw new Error(`เตรียมลูกค้าไม่สำเร็จ: ${error.message}`);
});
test.afterAll(async () => { await cleanup(); });

test("เพิ่มใบที่ปิดการขายได้ → ยอดลูกค้าขยับเองทันที", async () => {
  await ใบจากHQ("Q1", 500_000, "won");
  expect(await totalOf(), "ยอดลูกค้าต้องเท่ากับใบที่ปิดได้ โดยไม่ต้องมีใครสั่งคำนวณ").toBe(500_000);
});

test("เพิ่มใบที่ยังไม่ปิด → ยอดต้องไม่ขยับ", async () => {
  await ใบจากHQ("Q2", 999_999, "draft");
  expect(await totalOf(), "ใบร่างต้องไม่ถูกนับเป็นยอดขาย").toBe(500_000);
});

test("เลื่อนใบร่างเป็นปิดการขายได้ → ยอดเพิ่มตาม", async () => {
  await db.from("quotations").update({ status: "won" }).eq("id", ใบเลข.get("Q2")!).eq("dealer_code", DEALER);
  expect(await totalOf(), "ยอดต้องรวมใบที่เพิ่งปิดด้วย").toBe(1_499_999);
});

test("ย้อนใบกลับเป็นไม่สำเร็จ → ยอดลดลงตาม ไม่ค้างเกินจริง", async () => {
  await db.from("quotations").update({ status: "lost" }).eq("id", ใบเลข.get("Q2")!).eq("dealer_code", DEALER);
  expect(await totalOf(), "ยอดต้องลดกลับ").toBe(500_000);
});

// ด่าน 3 (ใบ 0203 · ข้อตัดสินของบอส): ใบที่ปิดการขายได้ (won) ลบไม่ได้ — ยอดขายที่ปิดแล้วต้องไม่หายเงียบ ๆ
//   เอาออกจริงต้องย้อนเป็น "ไม่สำเร็จ" ก่อน (ยอดลดตาม) แล้วใบที่ไม่สำเร็จจึงลบได้
test("ลบใบที่ปิดการขายได้ → ถูกปฏิเสธ ยอดไม่หาย · ย้อนเป็นไม่สำเร็จก่อน ยอดลดแล้วจึงลบได้", async () => {
  const ลบ = await db.from("quotations").delete().eq("id", ใบเลข.get("Q1")!).eq("dealer_code", DEALER);
  expect(ลบ.error?.message ?? "", "ใบ won ต้องลบไม่ได้").toContain("quote_won_locked");
  expect(await totalOf(), "ลบไม่สำเร็จ ยอดต้องคงเดิม").toBe(500_000);
  await db.from("quotations").update({ status: "lost" }).eq("id", ใบเลข.get("Q1")!).eq("dealer_code", DEALER);
  expect(await totalOf(), "ย้อนเป็นไม่สำเร็จแล้วยอดต้องกลับเป็น 0").toBe(0);
  const ลบหลังย้อน = await db.from("quotations").delete().eq("id", ใบเลข.get("Q1")!).eq("dealer_code", DEALER);
  expect(ลบหลังย้อน.error?.message ?? "", "ใบที่ไม่สำเร็จลบได้").toBe("");
});

test("ปิดการขายหลายใบพร้อมกัน → ยอดต้องครบทุกใบ ไม่หายไปใบใดใบหนึ่ง", async () => {
  // จุดที่พังจริง: สองคำสั่งรวมยอดจาก "ภาพ ณ เวลาของตัวเอง" คนเขียนทีหลังทับด้วยยอดที่ยังไม่เห็นอีกใบ
  //   เตรียมใบ HQ 5 ใบก่อน แล้วยิงสร้างใบที่ปิดการขายได้ "พร้อมกัน" 5 ใบ
  const ใบHQ: ใบHQพร้อมใช้[] = [];
  for (const n of [1, 2, 3, 4, 5]) {
    const h = await เตรียมใบHQ(RYG, { dealerCode: DEALER, company: `${TAG}-P${n}-${Date.now() % 100000}`, province: "ระยอง",
      lines: [{ name: "งานทดสอบยอดลูกค้า", qty: 1, unit: "งาน", unitCost: n * 100_000 }] });
    ใบของข้อทดสอบ.push(h); ใบHQ.push(h);
  }
  await Promise.all(ใบHQ.map(h => ทำใบลูกค้าจากใบHQ(RYG, h, { customer: `${TAG}-ลูกค้า`, markupPercent: 0, status: "won",
    extra: { customer_id: CID, date: "2026-05-10" } })));
  // 100k+200k+300k+400k+500k = 1,500,000
  await expect.poll(totalOf, { timeout: 20_000, message: "ยอดต้องรวมครบทั้ง 5 ใบ" }).toBe(1_500_000);
});
