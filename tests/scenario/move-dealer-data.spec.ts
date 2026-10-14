import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { ADMIN, skipReason } from "./supabaseEnv";
import { ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY } from "./adminEnv";
import { HQ_ORIGIN, db, ลูกค้าเป้าหมายรองรับสาขา } from "./funcHelpers";
import { วางใบเดิมที่ฐาน } from "./legacyQuotes";

// ── ย้ายข้อมูลงานขายจากสาขาหนึ่งไปอีกสาขา แล้วลบสาขาเดิมได้ ────────────────────────
//
// ทำไมต้องมีเทสต์นี้: สาขาที่ยังมีข้อมูลลบไม่ได้ (ถูกแล้ว) ทางออกเดียวคือย้ายให้สาขาที่รับช่วงต่อ
// ถ้าการย้ายพัง = ผู้ดูแลติดค้างสาขาที่เลิกทำแล้วไว้ในระบบตลอดไป (ไม่มีทางออกอื่นนอกจากลบข้อมูลจริงทิ้ง)
//
// เคยพังมาแล้วจริง (14 ส.ค. 69): ย้ายทีละตารางตามลำดับ leads → customers ทำให้ลูกค้าเป้าหมายที่ย้ายไปแล้ว
//   ชี้ไปหาลูกค้าที่ยังอยู่สาขาเดิม → ผิดกฎความสัมพันธ์ ธุรกรรมย้อนกลับทั้งหมด กดกี่ทีก็ไม่ผ่าน
//   (แก้ที่ 0139 — ย้าย "แม่ก่อนลูก": customers → leads → quotations → appointments)
// เทสต์นี้จึงต้องมีข้อมูลที่ผูกกันจริงทั้งสามชั้น ไม่ใช่แค่แถวลอย ๆ
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(240_000);

const FROM = "ZTA";      // สาขาต้นทาง (จะถูกลบทิ้งท้ายเทสต์)
const TO   = "ZTB";      // สาขาปลายทางที่รับช่วงต่อ
const admin = createClient(ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function adminToken() {
  return (await (await db(ADMIN)).auth.getSession()).data.session?.access_token ?? "";
}
async function purge() {
  for (const code of [FROM, TO]) {
    await admin.from("quotations").delete().eq("dealer_code", code);
    await admin.from("appointments").delete().eq("dealer_code", code);
    await admin.from("leads").delete().eq("dealer_code", code);
    await admin.from("customers").delete().eq("dealer_code", code);
    const { data: profs } = await admin.from("profiles").select("id").eq("dealer_code", code);
    for (const p of profs ?? []) await admin.auth.admin.deleteUser(String(p.id)).catch(() => {});
    await admin.from("dealers").delete().eq("code", code);
  }
}

test.beforeAll(purge);
test.afterAll(purge);

test("[admin] ย้ายข้อมูลไปสาขาที่รับช่วงต่อ แล้วลบสาขาเดิมได้", async ({ request }) => {
  const token = await adminToken();

  // 1) สร้างสองสาขา
  for (const [code, name] of [[FROM, "ZZTMP สาขาต้นทาง"], [TO, "ZZTMP สาขาปลายทาง"]] as const) {
    const res = await request.post(`${HQ_ORIGIN}/api/admin/dealers`, {
      headers: { authorization: `Bearer ${token}` },
      data: { code, name, province: "ระยอง", region: "ตะวันออก", revenueTarget: 1_000_000, prospectId: await ลูกค้าเป้าหมายรองรับสาขา(code) },
    });
    expect(res.status(), `สร้างสาขา ${code} ต้องผ่าน (ได้ ${res.status()} · ${await res.text()})`).toBe(200);
  }

  // 2) ใส่ข้อมูลที่ "ผูกกันจริง" ให้สาขาต้นทาง — ลูกค้า → ลูกค้าเป้าหมายของลูกค้ารายนั้น → ใบเสนอราคาของลูกค้าเป้าหมายนั้น
  const custId = 1, leadNum = 1;
  await admin.from("customers").insert({
    id: custId, dealer_code: FROM, name: "ZZTMP ลูกค้าย้ายสาขา", company: "ZZTMP ลูกค้าย้ายสาขา",
    province: "ระยอง", status: "active", total_value: 500000, join_date: "2026-01-01",
  });
  await admin.from("leads").insert({
    id: `#L-${leadNum}`, num_id: leadNum, dealer_code: FROM, customer_id: custId,
    company: "ZZTMP ลูกค้าย้ายสาขา", name: "ZZTMP ลูกค้าย้ายสาขา", contact: "ผู้ทดสอบ",
    province: "ระยอง", product: "โกดังสำเร็จรูป", status: "PAID", value: "฿500,000", assigned: "ผู้ทดสอบ",
  });
  // ใบเดิม (ไม่มีใบ HQ) สร้างผ่านแอปไม่ได้แล้ว (ด่าน 3) — ข้อนี้วัดการย้ายสาขา จึงวางที่ฐานตรง ๆ
  วางใบเดิมที่ฐาน([{ id: "Q-ZTA-0001", dealer_code: FROM, customer_id: custId, deal_id: leadNum,
    customer: "ZZTMP ลูกค้าย้ายสาขา", project: "งานทดสอบย้ายสาขา", building_type: "โกดังสำเร็จรูป",
    total_value: 500000, status: "won", date: "2026-08-01", items: 1, area: "100" }]);

  // 3) ลบสาขาต้นทางตอนที่ยังมีข้อมูล — ต้องถูกปฏิเสธ (นี่คือเหตุผลที่ต้องมีฟีเจอร์ย้าย)
  const blocked = await request.delete(`${HQ_ORIGIN}/api/admin/dealers?code=${FROM}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  expect(blocked.status(), "สาขาที่ยังมีข้อมูลต้องลบไม่ได้").toBe(409);

  // 4) ย้ายข้อมูลไปสาขาปลายทาง
  const moved = await request.post(`${HQ_ORIGIN}/api/admin/dealers/move`, {
    headers: { authorization: `Bearer ${token}` },
    data: { from: FROM, to: TO },
  });
  expect(moved.status(), `ย้ายข้อมูลต้องผ่าน (ได้ ${moved.status()} · ${await moved.text()})`).toBe(200);

  // 5) ข้อมูลต้องไปอยู่ที่ปลายทางครบ และไม่เหลือค้างที่ต้นทาง
  for (const table of ["customers", "leads", "quotations"] as const) {
    const { data: left } = await admin.from(table).select("dealer_code").eq("dealer_code", FROM);
    const { data: arrived } = await admin.from(table).select("dealer_code").eq("dealer_code", TO);
    expect(left ?? [], `${table}: ต้องไม่เหลือค้างที่สาขาต้นทาง`).toEqual([]);
    expect((arrived ?? []).length, `${table}: ต้องไปอยู่ที่สาขาปลายทาง`).toBeGreaterThan(0);
  }

  // 6) ตอนนี้สาขาต้นทางว่างแล้ว → ลบได้
  const del = await request.delete(`${HQ_ORIGIN}/api/admin/dealers?code=${FROM}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  expect(del.status(), `ย้ายข้อมูลออกหมดแล้วต้องลบสาขาได้ (ได้ ${del.status()} · ${await del.text()})`).toBe(200);
  const { data: gone } = await admin.from("dealers").select("code").eq("code", FROM);
  expect(gone ?? [], "สาขาต้นทางต้องหายจากทะเบียนจริง").toEqual([]);
});
