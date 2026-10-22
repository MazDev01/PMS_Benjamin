import { test, expect, type APIRequestContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { RYG, CNX, ADMIN, skipReason, appEnv } from "./supabaseEnv";
import { ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY } from "./adminEnv";
import { DEALER_ORIGIN, HQ_ORIGIN, loginUI } from "./funcHelpers";
import { settle } from "./helpers";

// ── ชุดตรวจรับ "HQ + ดีลเลอร์" ครบวงจร (สั่งตรวจ 27 ส.ค. 69) ────────────────────
//
// ตรวจตั้งแต่ดีลเลอร์สร้างลูกค้าเป้าหมาย → ออกใบ → แก้ใบ → ปิดการขาย → รายได้ →
//   HQ มองเห็น → แดชบอร์ด/ตัวชี้วัด → กันข้ามสาขา → เหตุผลที่แพ้ → ลีดเงียบเกิน 7 วัน →
//   ตัวกรองช่วงวันที่ → รีเฟรชแล้วข้อมูลยังอยู่ → ผู้ใช้พร้อมกัน 20 คน → ยิงซ้ำใบเดียวกัน →
//   การแข่งกันเขียน → ทรานแซกชันย้อนกลับ
//
// ทำผ่าน API จริงเป็นหลัก (เร็ว แน่นอน ตรวจได้ลึกถึงฐานข้อมูล) และผ่านหน้าจอจริงในข้อที่ต้องเห็นด้วยตา
// ⚠️ ชุดนี้ต้องรันโหมด api เท่านั้น — โหมดอื่นข้ามตัวเอง (เส้นทาง cookie/backend มีเฉพาะโหมดนี้)
const API_MODE = appEnv("NEXT_PUBLIC_DATA_SOURCE") === "api";
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.skip(() => !API_MODE, "ชุดนี้ตรวจเส้นทาง backend + cookie ซึ่งมีเฉพาะโหมด api");
test.describe.configure({ mode: "serial" });
// คำขอ API ตรง ๆ ไม่ผ่านหน้าจอ — เซิร์ฟเวอร์โหมดพัฒนาคอมไพล์เส้นทางครั้งแรกช้ากว่า 8 วินาทีได้
// (ไม่ใช่ระบบช้า — เป็นการคอมไพล์ครั้งเดียวตอนเปิดเส้นทางนั้นครั้งแรก)
test.use({ actionTimeout: 60_000 });
test.setTimeout(240_000);

const db = createClient(ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const NS = "ZZE2E";
const บริษัท = (s: string) => `${NS}-${s}`;
const ยอดดีล = 1_250_000;

async function ล้างข้อมูลชุดนี้() {
  // ด่าน 3: ใบ won ลบด้วยกุญแจไม่ได้ (0203) และคำขอราคา/ใบ HQ ที่ส่งแล้วลบไม่ได้ — ล้างที่ฐานทดสอบในเครื่องตรง ๆ
  const { ลบใบทดสอบที่ฐาน, ล้างใบHQทดสอบ } = await import("./legacyQuotes");
  const { data: ลีด } = await db.from("leads").select("num_id").eq("dealer_code", "RYG").like("company", `${NS}%`);
  try { ล้างใบHQทดสอบ("RYG", (ลีด ?? []).map(l => Number(l.num_id))); ลบใบทดสอบที่ฐาน(`customer like '${NS}%'`); } catch { /* ไม่มี docker */ }
  await db.from("quotations").delete().like("customer", `${NS}%`);
  await db.from("customers").delete().like("company", `${NS}%`);
  await db.from("leads").delete().like("company", `${NS}%`);
}

/** เข้าสู่ระบบผ่าน backend จริง แล้วคืนช่องทางยิง API ที่ถือ cookie ของบัญชีนั้น */
async function เข้าระบบ(request: APIRequestContext, origin: string, who: { email: string; password: string }) {
  const r = await request.post(`${origin}/api/v1/auth?op=login`, { data: who });
  expect(r.ok(), `เข้าสู่ระบบ ${who.email} ต้องผ่าน (ได้ ${r.status()})`).toBe(true);
}

/** ด่าน 3: ใบลูกค้าต้องทำจากใบ HQ — ดีลเลอร์ขอราคา → HQ ทำ BOQ + ส่งใบ → คืนเลขใบ HQ (ทุกขั้นผ่าน /api/v1 จริง)
 *  request = ช่องทางที่เข้าระบบเป็นดีลเลอร์ไว้แล้ว · HQ ใช้ช่องทางแยกของตัวเอง */
async function ใบHQผ่านAPI(request: APIRequestContext, playwright: { request: { newContext: () => Promise<APIRequestContext> } },
  leadNum: number, ต้นทุน: number): Promise<number> {
  const ขอ = await request.post(`${DEALER_ORIGIN}/api/v1/quote-requests`, { data: { op: "submit", leadNumId: leadNum, product: "โกดังสำเร็จรูป", province: "ระยอง" } });
  expect(ขอ.status(), `ดีลเลอร์ขอราคาต้องผ่าน (${await ขอ.text()})`).toBe(200);
  const คำขอ = await ขอ.json() as { id: number };
  const hq = await playwright.request.newContext();
  try {
    await เข้าระบบ(hq, HQ_ORIGIN, ADMIN);
    const บันทึก = await hq.post(`${HQ_ORIGIN}/api/v1/quote-requests`, { data: { op: "save-hq", id: คำขอ.id,
      lines: [{ name: "งานตามสัญญา", qty: 1, unit: "งาน", unitCost: ต้นทุน }],
      validUntil: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10), note: "" } });
    expect(บันทึก.status(), `HQ ทำ BOQ ต้องผ่าน (${await บันทึก.text()})`).toBe(200);
    const ส่ง = await hq.post(`${HQ_ORIGIN}/api/v1/quote-requests`, { data: { op: "send-hq", id: คำขอ.id } });
    expect(ส่ง.status(), `HQ ส่งใบต้องผ่าน (${await ส่ง.text()})`).toBe(200);
  } finally { await hq.dispose(); }
  const { data: ใบHQ } = await db.from("hq_quotes").select("id").eq("request_id", คำขอ.id).single();
  return Number(ใบHQ?.id);
}

test.beforeAll(ล้างข้อมูลชุดนี้);
test.afterAll(ล้างข้อมูลชุดนี้);

// ── 1) HQ จัดการข้อมูลหลัก: ตั้งเป้าทั้งเครือ แล้วอ่านกลับมาได้ ────────────────
test("[1] HQ ตั้งค่าข้อมูลหลักได้ และค่าถูกบันทึกจริง", async ({ request }) => {
  await เข้าระบบ(request, HQ_ORIGIN, ADMIN);
  const เดิม = await (await request.get(`${HQ_ORIGIN}/api/v1/settings?k=targets`)).json();
  const ค่าใหม่ = { ...เดิม, winRateTarget: 44 };
  const w = await request.put(`${HQ_ORIGIN}/api/v1/settings?k=targets`, { data: ค่าใหม่ });
  expect(w.status(), "HQ ต้องบันทึกเป้าหมายได้").toBe(200);
  const กลับมา = await (await request.get(`${HQ_ORIGIN}/api/v1/settings?k=targets`)).json();
  expect(กลับมา.winRateTarget, "ค่าที่อ่านกลับต้องเป็นค่าที่เพิ่งบันทึก").toBe(44);
  await request.put(`${HQ_ORIGIN}/api/v1/settings?k=targets`, { data: เดิม });   // คืนค่าเดิม
});

// ── 2) ดีลเลอร์สร้างลูกค้าเป้าหมาย → ลงฐานข้อมูลจริง ───────────────────────────
test("[2] ดีลเลอร์สร้างลูกค้าเป้าหมาย แล้วข้อมูลลงฐานข้อมูลของสาขาตัวเอง", async ({ request }) => {
  await เข้าระบบ(request, DEALER_ORIGIN, RYG);
  const numId = await (await request.post(`${DEALER_ORIGIN}/api/v1/leads?op=next`, { data: { dealerCode: "RYG" } })).json();
  expect(Number(numId), "เลขลูกค้าเป้าหมายต้องมาจากตัวนับของฐานข้อมูล").toBeGreaterThan(0);
  const r = await request.post(`${DEALER_ORIGIN}/api/v1/leads`, { data: {
    id: `#L-${numId}`, dealerCode: "RYG", numId, name: บริษัท("ดีลหลัก"), company: บริษัท("ดีลหลัก"),
    contact: "คุณทดสอบ", phone: "081-000-0001", province: "ระยอง", product: "โรงงาน",
    status: "WAITING", value: String(ยอดดีล), area: "300", assigned: "ทดสอบระบบ", source: "โทรเข้า",
  } });
  expect(r.status(), "สร้างลูกค้าเป้าหมายต้องผ่าน").toBe(200);
  const { data } = await db.from("leads").select("dealer_code,status").eq("company", บริษัท("ดีลหลัก")).single();
  expect(data?.dealer_code, "ต้องเป็นของสาขาที่สร้าง").toBe("RYG");
  expect(data?.status, "ลูกค้าเป้าหมายใหม่ต้องเริ่มที่ขั้นแรก").toBe("WAITING");
});

// ── 3) ดีลเลอร์ออกใบเสนอราคา ───────────────────────────────────────────────────
// ด่าน 3: ใบลูกค้าต้องทำจากใบ HQ — ดีลเลอร์ขอราคา → HQ ทำ BOQ + ส่งใบ → ดีลเลอร์ทำใบจากใบ HQ (ทุกขั้นผ่าน /api/v1 จริง)
test("[3] ดีลเลอร์ออกใบเสนอราคาจากใบ HQ เลขที่ใบมาจากฐานข้อมูล และยอดตรงกับรายการ", async ({ request, playwright }) => {
  await เข้าระบบ(request, DEALER_ORIGIN, RYG);
  const { data: lead } = await db.from("leads").select("num_id").eq("company", บริษัท("ดีลหลัก")).single();
  const ใบHQid = await ใบHQผ่านAPI(request, playwright, Number(lead?.num_id), ยอดดีล);
  const r = await request.post(`${DEALER_ORIGIN}/api/v1/quotations?op=numbered`, { data: {
    dealer: "RYG", prefix: "Q-", row: {
      customer: บริษัท("ดีลหลัก"), project: บริษัท("ดีลหลัก"), date: "2026-08-20", province: "ระยอง",
      buildingType: "โกดังสำเร็จรูป", area: 300, dealId: lead?.num_id, total: String(ยอดดีล), totalValue: ยอดดีล,
      materialCost: ยอดดีล, items: 1, status: "draft", hqQuoteId: ใบHQid, markupPercent: null,
      lineItems: [{ name: "งานตามสัญญา", qty: 1, unit: "งาน", unitPrice: ยอดดีล, markupPct: 0 }],
    } } });
  expect(r.status(), "ออกใบเสนอราคาต้องผ่าน").toBe(200);
  const ใบ = await r.json();
  expect(ใบ.id, "เลขที่ใบต้องเป็นรูปแบบของระบบ").toMatch(/^Q-RYG-\d{4}-\d{4}$/);
  expect(ใบ.totalValue, "ยอดต้องตรงกับที่ส่งไป").toBe(ยอดดีล);
});

// ── 4) แก้ใบเสนอราคา ─────────────────────────────────────────────────────────
test("[4] ดีลเลอร์แก้ใบเสนอราคา ยอดใหม่ต้องลงฐานข้อมูล และประวัติราคาถูกบันทึก", async ({ request }) => {
  await เข้าระบบ(request, DEALER_ORIGIN, RYG);
  const { data: q } = await db.from("quotations").select("*").eq("customer", บริษัท("ดีลหลัก")).single();
  const ยอดใหม่ = 1_400_000;
  const r = await request.put(`${DEALER_ORIGIN}/api/v1/quotations`, { data: {
    id: q!.id, dealerCode: "RYG", customer: บริษัท("ดีลหลัก"), project: บริษัท("ดีลหลัก"),
    date: q!.date, province: "ระยอง", buildingType: "โกดังสำเร็จรูป", area: 300, dealId: q!.deal_id,
    total: String(ยอดใหม่), totalValue: ยอดใหม่, materialCost: ยอดดีล, items: 1, status: "draft", hqQuoteId: q!.hq_quote_id,
    // ใบจากใบ HQ แก้ราคาด้วย % — 1,250,000 × 1.12 = 1,400,000 (ฐานคิดจาก % ราคาที่ส่งมาไม่มีผล)
    lineItems: [{ name: "งานตามสัญญา", qty: 1, unit: "งาน", unitPrice: ยอดใหม่, markupPct: 12 }],
  } });
  expect(r.status(), "แก้ใบเสนอราคาต้องผ่าน").toBe(200);
  const { data: หลังแก้ } = await db.from("quotations").select("total_value,price_history").eq("id", q!.id).single();
  expect(Number(หลังแก้?.total_value), "ยอดใหม่ต้องลงฐานข้อมูล").toBe(ยอดใหม่);
  const ประวัติ = (หลังแก้?.price_history ?? []) as { from?: number; to?: number }[];
  expect(ประวัติ.length, "การเปลี่ยนราคาต้องถูกบันทึกเป็นประวัติ").toBeGreaterThan(0);
  expect(Number(ประวัติ[ประวัติ.length - 1].to), "ประวัติต้องบันทึกยอดใหม่").toBe(ยอดใหม่);
});

// ── 5-6) ปิดการขายเป็น Won → รายได้ถูกคำนวณ ─────────────────────────────────
test("[5-6] ปิดการขายสำเร็จ → ลูกค้าถูกสร้าง ยอดสะสมเท่ากับใบที่ชนะ", async ({ request }) => {
  await เข้าระบบ(request, DEALER_ORIGIN, RYG);
  const { data: q } = await db.from("quotations").select("id,total_value").eq("customer", บริษัท("ดีลหลัก")).single();
  await db.from("quotations").update({ status: "sent_to_client" }).eq("id", q!.id);

  const r = await request.post(`${DEALER_ORIGIN}/api/v1/customers?op=close-won`, { data: {
    dealer: "RYG", knownCustomerId: null, leadCompany: บริษัท("ดีลหลัก"), targetQuoteId: q!.id, cascadeWon: true,
    payload: { name: บริษัท("ดีลหลัก"), company: บริษัท("ดีลหลัก"), province: "ระยอง", phone: "081-000-0001",
      joinDate: "2026-08-27", status: "active", totalValue: 0 },
  } });
  expect(r.status(), "ปิดการขายต้องผ่าน").toBe(200);

  const { data: cust } = await db.from("customers").select("id,total_value").eq("company", บริษัท("ดีลหลัก")).single();
  expect(cust, "ต้องมีลูกค้าเกิดขึ้นจริงในฐานข้อมูล").toBeTruthy();
  expect(Number(cust!.total_value), "รายได้สะสมของลูกค้าต้องเท่ากับยอดใบที่ชนะ").toBe(Number(q!.total_value));
  const { data: qq } = await db.from("quotations").select("status,customer_id").eq("id", q!.id).single();
  expect(qq?.status, "ใบต้องกลายเป็นปิดการขายได้").toBe("won");
  expect(qq?.customer_id, "ใบต้องถูกผูกกับลูกค้าที่เพิ่งเกิด").toBe(cust!.id);
});

// ── 7-8) HQ เห็นข้อมูล + ตัวชี้วัดขยับ ───────────────────────────────────────
test("[7-8] HQ เห็นดีลของสาขา และตัวชี้วัดรวมนับดีลนี้ด้วย", async ({ request }) => {
  await เข้าระบบ(request, HQ_ORIGIN, ADMIN);
  const ทั้งเครือ = await (await request.get(`${HQ_ORIGIN}/api/v1/quotations?hq=1`)).json();
  const แถว = (ทั้งเครือ.rows ?? ทั้งเครือ) as { customer: string; dealerCode: string }[];
  const ของเรา = แถว.find(x => x.customer === บริษัท("ดีลหลัก"));
  expect(ของเรา, "HQ ต้องเห็นใบเสนอราคาของสาขา RYG").toBeTruthy();
  expect(ของเรา!.dealerCode, "ต้องระบุว่าเป็นของสาขาไหน").toBe("RYG");

  const สรุป = await (await request.post(`${HQ_ORIGIN}/api/v1/metrics?k=dashboardQuoteSummary`,
    { data: { start: "2026-01-01", end: "2026-12-31", dealer: null } })).json();
  const ยอดชนะรวม = (สรุป.byStatus ?? []).filter((x: { status: string }) => x.status === "won")
    .reduce((s: number, x: { value: number }) => s + Number(x.value), 0);
  expect(ยอดชนะรวม, "ยอดปิดการขายรวมของทั้งเครือต้องมากกว่าหรือเท่ากับดีลนี้").toBeGreaterThanOrEqual(1_400_000);

  const ลูกค้า = await (await request.post(`${HQ_ORIGIN}/api/v1/metrics?k=networkCustomerSummary`,
    { data: { dealerCode: null, dateStart: "2026-01-01", dateEnd: "2026-12-31" } })).json();
  expect(Number(ลูกค้า.total), "จำนวนลูกค้าใหม่ทั้งเครือต้องนับรายนี้ด้วย").toBeGreaterThan(0);
});

// ── 9) ดีลเลอร์ A ต้องไม่เห็นข้อมูลของดีลเลอร์ B ────────────────────────────────
test("[9] ดีลเลอร์สาขาอื่นต้องมองไม่เห็นดีลนี้เลย ทั้งอ่านและเขียน", async ({ request }) => {
  await เข้าระบบ(request, DEALER_ORIGIN, CNX);
  for (const res of ["leads", "quotations", "customers"]) {
    for (const q of [`?dealer=RYG`, `?hq=1`, ``]) {
      const j = await (await request.get(`${DEALER_ORIGIN}/api/v1/${res}${q}`)).json();
      const rows = (j.rows ?? j) as { company?: string; customer?: string; dealerCode?: string }[];
      const หลุด = rows.filter(x => (x.company ?? x.customer ?? "").startsWith(NS));
      expect(หลุด, `สาขา CNX เห็น ${res}${q} ของสาขา RYG หลุดออกมา`).toEqual([]);
      expect(rows.filter(x => x.dealerCode && x.dealerCode !== "CNX"),
        `${res}${q} มีข้อมูลสาขาอื่นปนออกมา`).toEqual([]);
    }
  }
  const { data: lead } = await db.from("leads").select("id").eq("company", บริษัท("ดีลหลัก")).maybeSingle();
  if (lead) {
    const del = await request.delete(`${DEALER_ORIGIN}/api/v1/leads?id=${encodeURIComponent(lead.id)}`);
    expect(del.status(), "สาขาอื่นสั่งลบต้องไม่สำเร็จ และต้องไม่ตอบว่าสำเร็จ").toBe(404);
    const { data: ยังอยู่ } = await db.from("leads").select("id").eq("company", บริษัท("ดีลหลัก")).maybeSingle();
    expect(ยังอยู่, "ข้อมูลต้องยังอยู่ครบ").toBeTruthy();
  }
});

// ── 10) HQ เห็นได้ทุกสาขา ────────────────────────────────────────────────────
test("[10] HQ เห็นข้อมูลได้มากกว่าหนึ่งสาขา", async ({ request }) => {
  await เข้าระบบ(request, HQ_ORIGIN, ADMIN);
  const j = await (await request.get(`${HQ_ORIGIN}/api/v1/leads?hq=1`)).json();
  const rows = (j.rows ?? j) as { dealerCode: string }[];
  const สาขา = [...new Set(rows.map(r => r.dealerCode))];
  expect(สาขา.length, "HQ ต้องเห็นหลายสาขา ไม่ใช่สาขาเดียว").toBeGreaterThan(1);
});

// ── 11) ปิดการขายไม่สำเร็จ ต้องมีเหตุผลเสมอ ─────────────────────────────────
test("[11] ปิดการขายไม่สำเร็จ: ไม่ใส่เหตุผลต้องถูกปฏิเสธ · ใส่แล้วต้องบันทึกจริง", async ({ request }) => {
  await เข้าระบบ(request, DEALER_ORIGIN, RYG);
  const numId = await (await request.post(`${DEALER_ORIGIN}/api/v1/leads?op=next`, { data: { dealerCode: "RYG" } })).json();
  const id = `#L-${numId}`;
  // ใบ 0232: ดีลเลอร์สร้างลีดได้เฉพาะขั้น รอติดต่อ/ติดต่อแล้ว (เดิมสร้างที่ "เจรจาต่อรอง" ตรง ๆ — ฐานไม่ยอมแล้ว)
  //   กฎที่ข้อนี้วัด (ปิดไม่สำเร็จต้องมีเหตุผล) ใช้ได้กับลีดทุกขั้นที่ยังเปิดอยู่
  const สร้าง = await request.post(`${DEALER_ORIGIN}/api/v1/leads`, { data: {
    id, dealerCode: "RYG", numId, name: บริษัท("ดีลแพ้"), company: บริษัท("ดีลแพ้"), contact: "x",
    phone: "081-000-0002", province: "ระยอง", status: "WAITING", value: "500000", area: "100", assigned: "ทดสอบระบบ" } });
  expect(สร้าง.ok(), `สร้างลีดตั้งต้นต้องสำเร็จ: ${await สร้าง.text()}`).toBe(true);

  // ทางแก้ลูกค้าเป้าหมายทางเดียว: op=apply (ส่วนต่าง · ใบ 0211) — กฎปิดการขายบังคับในฐาน (เดิมตรวจที่เซิร์ฟเวอร์แอป ตอบ 422)
  const ไม่มีเหตุผล = await request.post(`${DEALER_ORIGIN}/api/v1/leads?op=apply`, { data: { id, intent: { stage: { status: "CANCELLED" } } } });
  expect(ไม่มีเหตุผล.status(), "ปิดไม่สำเร็จโดยไม่ใส่เหตุผล ต้องถูกปฏิเสธ").toBe(400);
  expect(await ไม่มีเหตุผล.text(), "ต้องบอกเหตุผล").toContain("ต้องระบุเหตุผล");
  const { data: ยังไม่เปลี่ยน } = await db.from("leads").select("status").eq("id", id).single();
  expect(ยังไม่เปลี่ยน?.status, "สถานะต้องไม่ถูกเปลี่ยนเมื่อถูกปฏิเสธ").toBe("WAITING");

  const มีเหตุผล = await request.post(`${DEALER_ORIGIN}/api/v1/leads?op=apply`, { data: {
    id, intent: { stage: { status: "CANCELLED", lostReason: "ราคาสูงกว่าคู่แข่ง" } } } });
  expect(มีเหตุผล.status(), "ใส่เหตุผลแล้วต้องบันทึกได้").toBe(200);
  const { data: แพ้แล้ว } = await db.from("leads").select("status,lost_reason").eq("id", id).single();
  expect(แพ้แล้ว?.status).toBe("CANCELLED");
  expect(แพ้แล้ว?.lost_reason, "เหตุผลต้องถูกบันทึกจริง").toBe("ราคาสูงกว่าคู่แข่ง");
});

// ── 12) ลูกค้าเป้าหมายที่เงียบเกิน 7 วัน ────────────────────────────────────
test("[12] ลีดที่ไม่มีการติดต่อเกิน 7 วัน ต้องถูกจับได้ด้วยเกณฑ์วันจริง", async ({ request }) => {
  await เข้าระบบ(request, HQ_ORIGIN, ADMIN);
  const numId = await (await request.post(`${DEALER_ORIGIN}/api/v1/leads?op=next`, { data: { dealerCode: "RYG" } })).json();
  const id = `#L-${numId}`;
  await db.from("leads").insert({ id, dealer_code: "RYG", num_id: numId, name: บริษัท("ลีดเงียบ"),
    company: บริษัท("ลีดเงียบ"), contact: "x", province: "ระยอง", status: "WAITING",
    value: "300000", area: "100", assigned: "ทดสอบระบบ", last_contact_at: "2026-08-01" });   // เงียบ 26 วัน

  const สรุป = await (await request.post(`${HQ_ORIGIN}/api/v1/metrics?k=leadSummary`, { data: {
    dateStart: "2026-01-01", dateEnd: "2026-12-31", asOf: "2026-08-27", defaultDays: 7 } })).json();
  expect(สรุป, "ตัวสรุปลูกค้าเป้าหมายต้องตอบกลับมาได้").toBeTruthy();

  const rollup = await (await request.post(`${HQ_ORIGIN}/api/v1/metrics?k=dealerRollup`, { data: {
    year: 2026, asOf: "2026-08-27", defaultDays: 7, perDealer: null } })).json();
  const ryg = (rollup as [string, { staleLeads?: number; openLeads?: number }][]).find(([code]) => code === "RYG");
  expect(ryg, "ต้องมีสรุปของสาขา RYG").toBeTruthy();
  console.log(`[12] สาขา RYG: ลีดที่ยังเปิด ${ryg![1].openLeads} · เงียบเกินเกณฑ์ ${ryg![1].staleLeads}`);
  expect(Number(ryg![1].staleLeads ?? 0), "ต้องนับลีดที่เงียบเกินเกณฑ์อย่างน้อย 1 ราย").toBeGreaterThan(0);
});

// ── 13) ตัวกรองช่วงวันที่ต้องมีผลจริง ───────────────────────────────────────
test("[13] ตัวกรองช่วงวันที่: เลือกช่วงที่ไม่มีข้อมูล ต้องได้ศูนย์ ไม่ใช่ยอดทั้งหมด", async ({ request }) => {
  await เข้าระบบ(request, HQ_ORIGIN, ADMIN);
  const ทั้งปี = await (await request.post(`${HQ_ORIGIN}/api/v1/metrics?k=networkCustomerSummary`,
    { data: { dealerCode: null, dateStart: "2026-01-01", dateEnd: "2026-12-31" } })).json();
  const ช่วงว่าง = await (await request.post(`${HQ_ORIGIN}/api/v1/metrics?k=networkCustomerSummary`,
    { data: { dealerCode: null, dateStart: "2000-01-01", dateEnd: "2000-01-31" } })).json();
  expect(Number(ทั้งปี.total), "ทั้งปีต้องมีลูกค้า").toBeGreaterThan(0);
  expect(Number(ช่วงว่าง.total), "ช่วงที่ไม่มีข้อมูลต้องได้ 0 — ถ้าเท่ากับทั้งปีแปลว่าตัวกรองไม่ทำงาน").toBe(0);

  const สาขาเดียว = await (await request.post(`${HQ_ORIGIN}/api/v1/metrics?k=networkCustomerSummary`,
    { data: { dealerCode: "RYG", dateStart: "2026-01-01", dateEnd: "2026-12-31" } })).json();
  expect(Number(สาขาเดียว.total), "กรองสาขาเดียวต้องไม่มากกว่าทั้งเครือ").toBeLessThanOrEqual(Number(ทั้งปี.total));
});

// ── 14) รีเฟรชแล้วข้อมูลยังอยู่ (หน้าจอจริง) ────────────────────────────────
test("[14] เปิดหน้าลูกค้าบนเบราว์เซอร์จริง เห็นดีลที่ปิดไป และรีเฟรชแล้วยังอยู่", async ({ page }) => {
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/customers`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByPlaceholder("ค้นหาลูกค้า, เบอร์โทร, อีเมล...").fill(บริษัท("ดีลหลัก"));
  await expect.poll(() => page.evaluate(() => document.body.innerText),
    { timeout: 20_000, message: "ลูกค้าที่เกิดจากการปิดการขายต้องขึ้นบนหน้าจอ" }).toContain(บริษัท("ดีลหลัก"));

  await page.reload({ waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByPlaceholder("ค้นหาลูกค้า, เบอร์โทร, อีเมล...").fill(บริษัท("ดีลหลัก"));
  await expect.poll(() => page.evaluate(() => document.body.innerText),
    { timeout: 20_000, message: "รีเฟรชแล้วข้อมูลต้องยังอยู่ (ไม่ใช่ค้างอยู่แค่ในหน้าจอ)" }).toContain(บริษัท("ดีลหลัก"));
});

// ── 15) ผู้ใช้พร้อมกัน 20 คน ────────────────────────────────────────────────
test("[15] ผู้ใช้ 20 คนพร้อมกัน: ทุกคนต้องได้คำตอบถูกต้อง ไม่มีใครเจอ error", async ({ playwright }) => {
  const ช่อง = await Promise.all(Array.from({ length: 20 }, () => playwright.request.newContext()));
  try {
    const ล็อกอิน = await Promise.all(ช่อง.map(c =>
      c.post(`${DEALER_ORIGIN}/api/v1/auth?op=login`, { data: RYG }).then(r => r.status())));
    expect(ล็อกอิน.filter(s => s !== 200), "ทุกคนต้องเข้าสู่ระบบได้").toEqual([]);

    const เริ่ม = Date.now();
    const ผล = await Promise.all(ช่อง.map(async c => {
      const [l, q, cu] = await Promise.all([
        c.get(`${DEALER_ORIGIN}/api/v1/leads?dealer=RYG`),
        c.get(`${DEALER_ORIGIN}/api/v1/quotations?dealer=RYG`),
        c.get(`${DEALER_ORIGIN}/api/v1/customers?dealer=RYG`),
      ]);
      return [l.status(), q.status(), cu.status()];
    }));
    const เวลา = Date.now() - เริ่ม;
    const ไม่ผ่าน = ผล.flat().filter(s => s !== 200);
    console.log(`[15] 20 คน × 3 คำขอ = 60 คำขอ ใน ${เวลา}ms · ไม่ผ่าน ${ไม่ผ่าน.length}`);
    expect(ไม่ผ่าน, `มีคำขอที่ไม่สำเร็จ: ${JSON.stringify(ไม่ผ่าน)}`).toEqual([]);
    expect(เวลา, "60 คำขอพร้อมกันต้องเสร็จภายใน 30 วินาที").toBeLessThan(30_000);
  } finally {
    await Promise.all(ช่อง.map(c => c.dispose()));
  }
});

// ── 16-17) ยิงซ้ำใบเดียวกันพร้อมกัน + การแข่งกันเขียน ───────────────────────
test("[16-17] ปิดการขายใบเดียวกันพร้อมกัน 10 สาย → ต้องได้ลูกค้ารายเดียว ยอดไม่บวกซ้ำ", async ({ request, playwright }) => {
  await เข้าระบบ(request, DEALER_ORIGIN, RYG);
  const COMPANY = บริษัท("ปิดพร้อมกัน");
  const numId = await (await request.post(`${DEALER_ORIGIN}/api/v1/leads?op=next`, { data: { dealerCode: "RYG" } })).json();
  await request.post(`${DEALER_ORIGIN}/api/v1/leads`, { data: {
    id: `#L-${numId}`, dealerCode: "RYG", numId, name: COMPANY, company: COMPANY, contact: "x",
    phone: "081-000-0003", province: "ระยอง", status: "BULLET", value: "800000", area: "200", assigned: "ทดสอบระบบ" } });
  // ด่าน 3: ใบทำจากใบ HQ (ต้นทุน 800,000 บวก 0%)
  const ใบHQid = await ใบHQผ่านAPI(request, playwright, Number(numId), 800_000);
  const ใบ = await (await request.post(`${DEALER_ORIGIN}/api/v1/quotations?op=numbered`, { data: {
    dealer: "RYG", prefix: "Q-", row: { customer: COMPANY, project: COMPANY, date: "2026-08-20", province: "ระยอง",
      buildingType: "โกดังสำเร็จรูป", area: 200, dealId: numId, total: "800000", totalValue: 800_000,
      materialCost: 800_000, items: 1, status: "draft", hqQuoteId: ใบHQid, markupPercent: null,
      lineItems: [{ name: "งานตามสัญญา", qty: 1, unit: "งาน", unitPrice: 800_000, markupPct: 0 }] } } })).json();
  await db.from("quotations").update({ status: "sent_to_client" }).eq("id", ใบ.id);

  const payload = { dealer: "RYG", knownCustomerId: null, leadCompany: COMPANY, targetQuoteId: ใบ.id, cascadeWon: true,
    payload: { name: COMPANY, company: COMPANY, province: "ระยอง", phone: "081-000-0003",
      joinDate: "2026-08-27", status: "active", totalValue: 0 } };
  const ผล = await Promise.all(Array.from({ length: 10 }, () =>
    request.post(`${DEALER_ORIGIN}/api/v1/customers?op=close-won`, { data: payload }).then(r => r.status())));
  console.log(`[16-17] ปิดพร้อมกัน 10 สาย → สถานะ ${JSON.stringify([...new Set(ผล)])}`);

  const { data: ลูกค้า } = await db.from("customers").select("id,total_value").eq("company", COMPANY);
  expect(ลูกค้า?.length, "ต้องได้ลูกค้ารายเดียว ไม่ใช่ซ้ำหลายราย").toBe(1);
  expect(Number(ลูกค้า![0].total_value), "ยอดต้องเท่ากับใบเดียว ไม่บวกซ้ำ 10 เท่า").toBe(800_000);

  // แก้ลีดตัวเดียวกันพร้อมกัน 10 สาย ค่าต่างกัน — ต้องได้ค่าใดค่าหนึ่ง ไม่ใช่ค่าผสม และต้องไม่มีแถวซ้ำ
  const ค่าที่ยิง = Array.from({ length: 10 }, (_, i) => String(100_000 * (i + 1)));
  await Promise.all(ค่าที่ยิง.map(v => request.post(`${DEALER_ORIGIN}/api/v1/leads?op=apply`, { data: {
    id: `#L-${numId}`, intent: { fields: { value: v } } } })));
  const { data: ลีด } = await db.from("leads").select("value").eq("company", COMPANY);
  expect(ลีด?.length, "ต้องเหลือลูกค้าเป้าหมายแถวเดียว").toBe(1);
  expect(ค่าที่ยิง, "ค่าที่บันทึกต้องเป็นหนึ่งในค่าที่ยิงไป ไม่ใช่ค่าผสม").toContain(ลีด![0].value);
});

// ── 18) ทรานแซกชัน: ล้มกลางทางต้องย้อนกลับทั้งก้อน ─────────────────────────
test("[18] ทรานแซกชันย้อนกลับ: ออกใบที่ยอดไม่ตรง BOQ ต้องไม่ทิ้งอะไรค้างไว้เลย", async ({ request }) => {
  await เข้าระบบ(request, DEALER_ORIGIN, RYG);
  const COMPANY = บริษัท("ย้อนกลับ");
  const { data: ก่อน } = await db.from("quote_counters").select("*").eq("dealer_code", "RYG").maybeSingle();

  const r = await request.post(`${DEALER_ORIGIN}/api/v1/quotations?op=numbered`, { data: {
    dealer: "RYG", prefix: "Q-", row: { customer: COMPANY, project: COMPANY, date: "2026-08-20", province: "ระยอง",
      buildingType: "โกดังสำเร็จรูป", area: 1, total: "9999999", totalValue: 9_999_999, materialCost: 500_000,
      items: 1, status: "draft", lineItems: [{ name: "งาน", qty: 1, unit: "งาน", unitPrice: 500_000 }] } } });
  expect(r.status(), "ยอดไม่ตรงรายการ ต้องถูกปฏิเสธ ไม่ใช่ 503 ระบบขัดข้อง").toBe(400);

  const { data: ใบที่ค้าง } = await db.from("quotations").select("id").eq("customer", COMPANY);
  expect(ใบที่ค้าง ?? [], "ล้มแล้วต้องไม่มีใบค้างในฐานข้อมูล").toEqual([]);
  const { data: หลัง } = await db.from("quote_counters").select("*").eq("dealer_code", "RYG").maybeSingle();
  expect(JSON.stringify(หลัง), "ตัวนับเลขที่ใบต้องไม่เดินเมื่อการออกใบล้มเหลว").toBe(JSON.stringify(ก่อน));
});
