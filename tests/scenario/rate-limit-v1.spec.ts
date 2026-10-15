import { test, expect } from "@playwright/test";
import { RYG, CNX, skipReason } from "./supabaseEnv";
import { getSession } from "./helpers";
import { createClient } from "@supabase/supabase-js";
import { ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY } from "./adminEnv";
import { เตรียมใบHQ, ล้างใบHQทดสอบ } from "./hqQuoteFixture";

// ── ด่านจำกัดจำนวนคำขอบนเส้นทางงานขาย (ผลตรวจระบบ 19 ส.ค. 69) ──────────────────
// เดิมด่านนี้มีเฉพาะ /api/admin/* งานขายทั้งหมดยิงได้ไม่จำกัด
// บัญชีที่ถูกขโมยจึงดูดข้อมูลทั้งสาขาออกไปได้เร็วมากโดยไม่มีอะไรหน่วง
//
// ที่ล็อกไว้: เกินโควตาต้องได้ 429 · โควตาอ่านกับเขียนแยกถัง · โควตาของแต่ละคนแยกกัน
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(180_000);

const DEALER = "http://localhost:3001";
const admin = createClient(ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY);
const WRITE_QUOTA = 300;   // ต้องตรงกับ LIMIT_WRITE ใน packages/shared/server/v1/_ctx.ts (ขยับ 27 ส.ค. 69)

async function ยิง(token: string, method: "GET" | "POST") {
  try {
    const r = await fetch(`${DEALER}/api/v1/leads?dealerCode=RYG`, {
      method,
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: method === "GET" ? undefined : JSON.stringify({ company: "" }),
    });
    return r.status;
  } catch (e) {
    // ต่อไม่ได้ (fetch failed) — พิมพ์รหัสจริงของทุกที่อยู่ที่ลอง (AggregateError) ไว้เป็นหลักฐานว่าฝั่งไหนพัง
    const c = (e as { cause?: { code?: string; errors?: { code?: string; address?: string }[] } }).cause;
    const รหัส = c?.errors?.map(x => `${x.address ?? "?"}:${x.code ?? "?"}`).join(", ") ?? c?.code ?? "ไม่ทราบ";
    throw new Error(`ต่อเซิร์ฟเวอร์ไม่ได้ (${method}) — ${รหัส}`);
  }
}

test("[security] ยิงคำขอเขียนเกินโควตา → ถูกปฏิเสธ 429 และงานอ่านยังทำได้", async () => {
  const s = await getSession(RYG);
  await admin.from("rate_limits").delete().like("key", `v1:%${s.user.id}`);

  // ยิงเป็นชุดละ 30 ให้จบก่อนหน้าต่างเวลารีเซ็ต (ยิงทีละครั้งจะช้าเกิน 60 วิ แล้วตัวนับเริ่มใหม่)
  //
  // ⚠️ ห้ามยิง 360 ครั้งพร้อมกันรวดเดียว (แบบเดิม) — เซิร์ฟเวอร์โหมดพัฒนารับไม่ไหว
  //    ตัวนับโควตาที่ฐานข้อมูลตอบไม่ทันบางคำขอ แล้วด่าน "ปล่อยผ่าน" ตามที่ออกแบบไว้
  //    (ตั้งใจให้ฐานสะดุดแล้วผู้ใช้จริงยังทำงานได้) ผลคือยิงครบ 360 แต่ตัวนับขึ้นแค่ 241 → ไม่มี 429 เลย
  //    วัดจริง 2 ก.ย. 69: ยิงรวดเดียว = 300×403 + 60×503 ไม่มี 429 · ยิงชุดละ 30 = 300 ผ่าน แล้ว 429 ทันที
  //    (403 = คำขอถูกนับแล้วแต่ข้อมูลไม่ผ่านกฎ ซึ่งเป็นสิ่งที่ต้องการ — ที่วัดคือ "ถูกนับ/ถูกปฏิเสธ")
  const ผล: number[] = [];
  for (let i = 0; i < WRITE_QUOTA + 60 && !ผล.includes(429); i += 30) {
    ผล.push(...await Promise.all(Array.from({ length: 30 }, () => ยิง(s.access_token, "POST"))));
  }
  const ถูกปฏิเสธ = ผล.filter(x => x === 429).length;
  expect(ถูกปฏิเสธ, "ยิงเกินโควตาแล้วต้องมีคำขอที่ถูกปฏิเสธ").toBeGreaterThan(0);
  expect(ผล.filter(x => x !== 429 && x !== 0).length, "จำนวนที่ผ่านต้องไม่เกินโควตา").toBeLessThanOrEqual(WRITE_QUOTA);

  // ถังอ่านต้องไม่ถูกกระทบ — คนทำงานยังเปิดหน้าดูข้อมูลได้แม้ฝั่งเขียนโดนจำกัด
  expect(await ยิง(s.access_token, "GET"), "อ่านข้อมูลต้องยังทำได้").toBe(200);

  await admin.from("rate_limits").delete().like("key", `v1:%${s.user.id}`);
});

// ── คำขอ "อ่าน" ที่ส่งแบบ POST ต้องนับถังอ่าน ไม่กินโควตาบันทึก (ก่อนขึ้นระบบจริง · 15 ต.ค. 69) ─────────────────────
//   หน้าจอโหลดข้อมูลด้วย POST หลายทาง (เปิดแผงลูกค้าเป้าหมาย op=get · ตารางแบ่งหน้า op=page · ตัวเลขสรุป metrics)
//   เดิมนับเป็น "เขียน" (300/นาที/บัญชี) — เปิดหน้าดูรัว ๆ แล้วกดสร้างใบไม่ได้ (429) · พบจาก quote-versions-timeline:48
test("[security] อ่านแบบ POST เกินโควตาเขียน → ยังสร้างใบเสนอราคาได้", async () => {
  const s = await getSession(RYG);
  const ใบHQ = await เตรียมใบHQ(RYG, { dealerCode: "RYG", company: `ZZTEST-โควตาอ่าน-${Date.now() % 100000}`, province: "ระยอง",
    lines: [{ name: "โครงเหล็กชุดทดสอบ", qty: 1, unit: "ชุด", unitCost: 10 }] });
  const หัว = { Authorization: `Bearer ${s.access_token}`, "content-type": "application/json" };
  try {
    await admin.from("rate_limits").delete().like("key", `v1:%${s.user.id}`);
    // อ่านแบบ POST เกินโควตาเขียน (ชุดละ 30 ให้จบในหน้าต่างเวลาเดียว — เหตุผลเดียวกับข้อข้างบน)
    const อ่าน: number[] = [];
    for (let i = 0; i < WRITE_QUOTA + 30; i += 30) {
      อ่าน.push(...await Promise.all(Array.from({ length: 30 }, () =>
        fetch(`${DEALER}/api/v1/leads?op=get`, { method: "POST", headers: หัว, body: JSON.stringify({ id: `#L-${ใบHQ.leadNum}` }) }).then(r => r.status))));
    }
    expect(อ่าน.filter(x => x === 429).length, "อ่านแบบ POST ต้องไม่ถูกจำกัดด้วยโควตาเขียน").toBe(0);

    const r = await fetch(`${DEALER}/api/v1/quotations?op=numbered`, { method: "POST", headers: หัว, body: JSON.stringify({
      dealer: "RYG", prefix: "Q-", row: { customer: `ZZTEST-โควตาอ่าน`, project: "ZZTEST-โควตาอ่าน", date: "2026-10-15", province: "ระยอง",
        buildingType: "โกดังสำเร็จรูป", area: 1, dealId: ใบHQ.leadNum, total: "10", totalValue: 10, materialCost: 10, items: 1, status: "draft",
        hqQuoteId: ใบHQ.hqQuoteId, lineItems: [{ name: "โครงเหล็กชุดทดสอบ", qty: 1, unit: "ชุด", unitPrice: 10, markupPct: 0 }] } }) });
    expect(r.status, `สร้างใบต้องยังทำได้หลังอ่านรัว ๆ — ได้ ${r.status} ${(await r.text()).slice(0, 120)}`).toBe(200);
  } finally {
    await admin.from("rate_limits").delete().like("key", `v1:%${s.user.id}`);
    ล้างใบHQทดสอบ("RYG", [ใบHQ.leadNum]);
  }
});

test("[security] โควตาของแต่ละบัญชีแยกกัน — คนหนึ่งยิงเต็มไม่ทำให้อีกคนใช้งานไม่ได้", async () => {
  const a = await getSession(RYG), b = await getSession(CNX);
  await admin.from("rate_limits").delete().like("key", "v1:%");

  // ยิงทีละชุด 30 (แบบข้อด้านบน) — ไม่ยิง 330 ครั้งพร้อมกันรวดเดียว
  //   ไม่นิ่งซ้ำทุกรอบปิดด่าน (ด่าน 1–5): ครั้งแรก "fetch failed" ภายใน 0.3 วิ ต่อไม่ได้ทั้ง IPv4/IPv6 (AggregateError)
  //   ตรงจังหวะยิงชุดใหญ่ · จำลองซ้ำไม่ได้แม้ยิงพร้อมกัน 990 คำขอ แต่ตัวรัน (Node บน Windows) พ่น "Assertion failed"
  //   ของชั้นการเชื่อมต่อออกมาระหว่างจำลอง — ต้นเหตุที่น่าจะใช่ ยังไม่พิสูจน์ · ถ้าตกอีก ข้อความบอกรหัสจริงแล้ว
  for (let i = 0; i < WRITE_QUOTA + 30; i += 30) await Promise.all(Array.from({ length: 30 }, () => ยิง(a.access_token, "POST")));
  // อีกบัญชีต้องยังยิงได้ตามปกติ (ต้องไม่ใช่ 429)
  expect(await ยิง(b.access_token, "GET"), "บัญชีอื่นต้องไม่โดนหางเลข").not.toBe(429);

  await admin.from("rate_limits").delete().like("key", "v1:%");
});
