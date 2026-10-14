import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY } from "./adminEnv";
import { SUPABASE_URL, SUPABASE_ANON, REAL_BACKEND, ADMIN } from "./supabaseEnv";
import { วางใบเดิมที่ฐาน } from "./legacyQuotes";

// ── regression: id ลูกค้า/ลูกค้าเป้าหมาย นับแยกต่อสาขา — ห้าม join/group ข้ามตารางด้วย id เปล่า ──
//
// customers.id เป็นเลขนับ "ต่อสาขา" (composite PK dealer_code+id) — ลูกค้ารายแรกของทุกสาขาได้ id=1
// เหมือนกันหมดโดยตั้งใจ (ดู 0012_per_dealer_ids.sql) ทุก query ที่ join/group ด้วย customer_id จึงต้อง
// ผูก dealer_code คู่เสมอ ไม่งั้นข้อมูลของลูกค้าคนละสาขาที่ id ตรงกันจะถูกรวม/สลับกัน
//
// เคยหลุดมาแล้ว 3 จุด:
//   1. reconcile_customer_won_total  → แก้ที่ 0101 (พบจากทดสอบโหลด 10 สาขา 3 ส.ค. 69)
//   2. hq_customers_page             → แก้ที่ 0104 (พบจากตรวจสอบระบบ 5 ส.ค. 69)
//   3. quotation_salesperson         → แก้ที่ 0104 (พบจากตรวจสอบระบบ 5 ส.ค. 69)
// เทสต์นี้กันข้อ 2-3 ไม่ให้ย้อนกลับ (ข้อ 1 มี multi-dealer-stress.spec.ts คุมอยู่แล้ว)
test.skip(!REAL_BACKEND, "ต้องใช้ backend จริง (RPC + RLS) เพื่อตรวจการปนข้ามสาขา");
// serial: ทั้งไฟล์ใช้ข้อมูลชุดเดียวกันที่สร้างใน beforeAll (ลูกค้า id ตายตัวเพื่อให้ "ชนกัน" ตามที่ต้องการทดสอบ)
// ถ้าปล่อยขนาน Playwright จะกระจายเทสต์ไปคนละ worker แล้ว beforeAll รันซ้ำ → ชน customers_pkey กันเอง
test.describe.configure({ mode: "serial" });

const admin = createClient(ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const TAG = "ZZTEST-XDEALER";
const CID = 990101;                       // เลขลูกค้าเดียวกัน ใช้ทั้งสองสาขา — หัวใจของบั๊ก
const A = { code: "CNX", type: "โกดังเก็บสินค้าทั่วไป", parent: "โกดังสำเร็จรูป", date: "2026-03-10", who: `${TAG}-ผู้ขาย-CNX`, leadId: 990101 };
const B = { code: "RYG", type: "โรงงานอาหาร",          parent: "โรงงาน",        date: "2026-05-20", who: `${TAG}-ผู้ขาย-RYG`, leadId: 990102 };

async function cleanup() {
  await admin.from("quotations").delete().like("id", `${TAG}%`);
  await admin.from("leads").delete().in("id", [A.leadId, B.leadId]);
  await admin.from("customers").delete().eq("id", CID);
}

test.beforeAll(async () => {
  await cleanup();
  for (const d of [A, B]) {
    const province = d.code === "CNX" ? "เชียงใหม่" : "ระยอง";
    // ลูกค้า id เดียวกันทั้งสองสาขา (ถูกต้องตามดีไซน์ — ไม่ใช่ข้อมูลผิด)
    const { error: ec } = await admin.from("customers").insert({
      id: CID, dealer_code: d.code, company: `${TAG}-${d.code}`, name: `${TAG}-${d.code}`,
      province, status: "active", total_value: 1_000_000,
    });
    if (ec) throw new Error(`เตรียมลูกค้า ${d.code} ไม่สำเร็จ: ${ec.message}`);

    // ใบปิดการขายของสาขาตัวเอง — ประเภทอาคารต่างกันชัดเจน จะได้รู้ทันทีถ้าปนกัน
    // ใบเดิม (ไม่มีใบ HQ) สร้างผ่านแอป/API ไม่ได้แล้ว (ด่าน 3) — ข้อนี้วัดการแยกสาขา จึงวางที่ฐานตรง ๆ
    วางใบเดิมที่ฐาน([{ id: `${TAG}-${d.code}-Q1`, dealer_code: d.code, customer_id: CID, status: "won",
      building_type: d.type, date: d.date, total_value: 1_000_000, customer: `${TAG}-${d.code}` }]);

    // ลูกค้าเป้าหมายผูกลูกค้ารายเดียวกัน — ใช้ทดสอบ quotation_salesperson (ผู้รับผิดชอบต่างคนกันคนละสาขา)
    // เช็ค error ทุกจุด: ถ้าเตรียมข้อมูลพลาดเงียบ ๆ เทสต์จะ "ผ่าน" แบบไม่ได้ทดสอบอะไรเลย
    const { error: el } = await admin.from("leads").insert({
      id: d.leadId, num_id: d.leadId, dealer_code: d.code, company: `${TAG}-${d.code}`,
      customer_id: CID, assigned: d.who, status: "WAITING", province,
    });
    if (el) throw new Error(`เตรียมลูกค้าเป้าหมาย ${d.code} ไม่สำเร็จ: ${el.message}`);
  }
});

test.afterAll(async () => { await cleanup(); });

/** client ที่ล็อกอินเป็น HQ จริง (RPC ทั้งสองตัวคุมสิทธิ์ด้วย is_hq()) */
async function hqClient() {
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await sb.auth.signInWithPassword(ADMIN);
  if (error) throw new Error(`ล็อกอิน HQ ไม่ผ่าน: ${error.message}`);
  return sb;
}

test("hq_customers_page: ลูกค้า id ชนกันข้ามสาขา ต้องไม่เอาข้อมูลของกันและกันมาปน", async () => {
  const sb = await hqClient();
  const { data: page, error } = await sb.rpc("hq_customers_page", { p_search: TAG, p_limit: 50, p_offset: 0 });
  expect(error, "เรียก hq_customers_page ต้องไม่ error").toBeNull();

  const rows = (page.rows ?? []) as Array<{
    id: number; dealer_code: string; building_types: string[]; templates: string[];
    delivered_at: string | null; last_purchase_at: string | null;
  }>;
  expect(rows.length, "ต้องได้ลูกค้า 2 ราย (คนละสาขา แต่ id เดียวกัน)").toBe(2);

  for (const r of rows) {
    const mine = r.dealer_code === A.code ? A : B;
    const other = r.dealer_code === A.code ? B : A;
    const shown = [...(r.building_types ?? []), ...(r.templates ?? [])];

    expect(shown, `${r.dealer_code} ต้องมีประเภทอาคารของตัวเอง`).toContain(mine.type);
    expect(shown, `${r.dealer_code} ต้องไม่มีประเภทอาคารของสาขา ${other.code} ปนมา`).not.toContain(other.type);
    expect(shown, `${r.dealer_code} ต้องไม่มีแม่แบบหลักของสาขา ${other.code} ปนมา`).not.toContain(other.parent);
    // ซื้อล่าสุด = วันที่ใบของสาขาตัวเองเท่านั้น (ถ้าปนกันจะได้วันที่ล่าสุดของทั้งสองใบ)
    expect(r.last_purchase_at, `${r.dealer_code} วันซื้อล่าสุดต้องเป็นของใบตัวเอง`).toBe(mine.date);
  }

  // แต่ละสาขามีใบปิดการขายใบเดียว → ไม่ควรถูกนับเป็น "ลูกค้าประจำ" (ซื้อซ้ำ)
  expect(page.kpi?.repeat, "ลูกค้าประจำต้องเป็น 0 — ถ้าเป็น 2 แปลว่านับใบของสองสาขารวมกัน").toBe(0);
});

test("quotation_salesperson: ผู้รับผิดชอบต้องมาจากลูกค้าเป้าหมายสาขาเดียวกันเท่านั้น", async () => {
  const sb = await hqClient();
  for (const d of [A, B]) {
    const other = d.code === A.code ? B : A;
    const { data: name, error } = await sb.rpc("quotation_salesperson", { p_quote_id: `${TAG}-${d.code}-Q1` });
    expect(error, `เรียก quotation_salesperson (${d.code}) ต้องไม่ error`).toBeNull();
    expect(name, `ใบของ ${d.code} ต้องได้ผู้รับผิดชอบของสาขาตัวเอง`).toBe(d.who);
    expect(name, `ใบของ ${d.code} ต้องไม่ได้ผู้รับผิดชอบของสาขา ${other.code}`).not.toBe(other.who);
  }
});

// ── เลขที่ "ใบเสนอราคา" ก็ซ้ำข้ามสาขาได้เหมือนกัน (composite PK dealer_code+id ตั้งแต่ 0022) ──
// เทสต์ด้านบนใช้เลขที่ใบต่างกันคนละสาขา จึงไม่เคยแตะกรณีที่เลขที่ "ตรงกันเป๊ะ" ซึ่งเป็นกรณีที่พังจริง
// (ผลตรวจสอบระบบรอบ 2: quotation_salesperson ค้นด้วย `where q.id = ?` เฉย ๆ → หยิบใบของสาขาไหนก็ได้)
const SAME_ID = `${TAG}-SAME-Q1`;

test.beforeAll(async () => {
  await admin.from("quotations").delete().eq("id", SAME_ID);
  for (const d of [A, B]) {
    // ผูกกับ "ลูกค้าเป้าหมาย" ผ่าน deal_id แทน customer_id โดยตั้งใจ — ถ้าผูกกับลูกค้ารายเดิม
    // ใบใบนี้จะไปนับเป็นใบที่สองของลูกค้า แล้วทำให้ KPI "ลูกค้าประจำ" ของเทสต์ด้านบนเปลี่ยน
    // (เทสต์จะตกเพราะข้อมูลที่เราเติมเอง ไม่ใช่เพราะบั๊ก — ต้องแยกให้ขาดจากกัน)
    วางใบเดิมที่ฐาน([{ id: SAME_ID, dealer_code: d.code, deal_id: d.leadId, status: "draft",
      building_type: d.type, date: d.date, total_value: 1_000_000, customer: `${TAG}-${d.code}` }]);
  }
});
test.afterAll(async () => { await admin.from("quotations").delete().eq("id", SAME_ID); });

test("quotation_salesperson: ใบเลขที่เดียวกันคนละสาขา ต้องได้ผู้รับผิดชอบของสาขาที่ระบุ", async () => {
  const sb = await hqClient();
  for (const d of [A, B]) {
    const other = d.code === A.code ? B : A;
    const { data: name, error } = await sb.rpc("quotation_salesperson", { p_quote_id: SAME_ID, p_dealer_code: d.code });
    expect(error, `เรียกพร้อมระบุสาขา ${d.code} ต้องไม่ error`).toBeNull();
    expect(name, `ระบุสาขา ${d.code} ต้องได้ผู้รับผิดชอบของสาขานั้น`).toBe(d.who);
    expect(name, `ต้องไม่ได้ผู้รับผิดชอบของสาขา ${other.code}`).not.toBe(other.who);
  }
});

test("quotation_salesperson: ไม่ระบุสาขาแล้วเลขที่ใบกำกวม ต้องไม่เดาชื่อใครเลย", async () => {
  // คืนชื่อผิดคนอันตรายกว่าไม่คืนชื่อ — HQ จะโทรหาพนักงานผิดสาขาโดยไม่รู้ตัว
  const sb = await hqClient();
  const { data: name, error } = await sb.rpc("quotation_salesperson", { p_quote_id: SAME_ID });
  expect(error, "ต้องไม่ error").toBeNull();
  expect(name, `เลขที่ใบซ้ำ 2 สาขาแต่ไม่ระบุสาขา ต้องคืนค่าว่าง ไม่ใช่เดาเอาสาขาใดสาขาหนึ่ง (ได้ ${name})`).toBeNull();
});

test("hq_alerts: รายการแจ้งเตือนลูกค้าเป้าหมายต้องพกรหัสสาขามาด้วย", async () => {
  // ไม่มีรหัสสาขา = HQ เห็นแค่ชื่อบริษัท ไม่รู้ว่าต้องตามกับสาขาไหน และลิงก์ในกระดิ่งก็กำกวม
  const sb = await hqClient();
  const { data, error } = await sb.rpc("hq_alerts", { p_as_of: "2026-06-30", p_unassigned_default_hours: 1, p_lead_idle_days: 1 });
  expect(error, "เรียก hq_alerts ต้องไม่ error").toBeNull();

  const groups = (data ?? {}) as { unassigned?: Array<Record<string, unknown>>; idle?: Array<Record<string, unknown>> };
  for (const key of ["unassigned", "idle"] as const) {
    const rows = groups[key] ?? [];
    if (!rows.length) continue; // ไม่มีข้อมูลเข้าเกณฑ์ตอนนี้ — ไม่ใช่ความล้มเหลว
    const missing = rows.filter(r => !("dealer_code" in r));
    expect(missing, `รายการ "${key}" ทุกแถวต้องมี dealer_code (ขาด ${missing.length} จาก ${rows.length})`).toEqual([]);
  }
});
