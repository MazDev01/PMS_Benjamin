import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { ADMIN, SUPABASE_URL, SUPABASE_ANON, skipReason } from "./supabaseEnv";
import { ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY } from "./adminEnv";

// ── ด่านป้องกันที่ "ชั้นฐานข้อมูล" — ต้องกันได้ทุกช่องทาง ────────────────────────
//
// ด่านที่อยู่บนหน้าจออย่างเดียวกันได้แค่คนที่กดผ่านหน้าจอ · ใครยิงคำสั่งตรงเข้าฐานข้อมูล
// (เครื่องมือผู้ดูแล · สคริปต์ · โค้ดฝั่งเซิร์ฟเวอร์ที่ข้ามการตรวจสิทธิ์ปกติได้) จะทะลุไปหมด
// สองเรื่องนี้ผิดแล้วกู้ยาก จึงต้องมีด่านที่ฐานข้อมูล (ผลตรวจสอบระบบรอบ 2 · Part 8)
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

const svc = createClient(ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const GHOST = "ZZGH";

test.afterAll(async () => { await svc.from("dealers").delete().eq("code", GHOST); });

test("บันทึกแก้ไขดีลเลอร์ ต้องสร้างสาขาใหม่ไม่ได้ (กันสาขาผีที่ไม่มีบัญชีเข้าระบบ)", async () => {
  // การสร้างสาขาที่ถูกต้องต้องผ่านหน้าจัดการดีลเลอร์ ซึ่งสร้าง "บัญชีเข้าระบบ" คู่กันเสมอ
  // ถ้าเส้นทาง "บันทึกการแก้ไข" สร้างแถวสาขาได้ด้วย จะได้สาขาที่ไม่มีใครเข้าได้
  const hq = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false } });
  const { error: loginErr } = await hq.auth.signInWithPassword(ADMIN);
  expect(loginErr?.message ?? "", "ล็อกอินผู้ดูแลต้องผ่าน").toBe("");

  await svc.from("dealers").delete().eq("code", GHOST);
  const { data: touched, error } = await hq.rpc("save_dealers", {
    p_rows: [{ code: GHOST, name: "ZZTEST-สาขาผี", province: "ทดสอบ", region: "กลาง", status: "active", revenue_target: "1000" }],
  });
  expect(error, "เรียกคำสั่งต้องไม่ error").toBeNull();
  expect(Number(touched), "รหัสสาขาที่ไม่มีอยู่จริง ต้องแก้ได้ 0 แถว (ไม่ใช่สร้างใหม่)").toBe(0);

  const { data: rows } = await svc.from("dealers").select("code").eq("code", GHOST);
  expect(rows ?? [], "ต้องไม่มีสาขาใหม่ถูกสร้างขึ้น").toEqual([]);
});

test("บันทึกแก้ไขดีลเลอร์ที่มีอยู่จริง ยังทำได้ตามปกติ (กฎต้องไม่เข้มจนใช้งานไม่ได้)", async () => {
  const hq = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false } });
  await hq.auth.signInWithPassword(ADMIN);

  const { data: before } = await svc.from("dealers").select("code, name, province, region, status, revenue_target").eq("code", "RYG");
  const d = before?.[0];
  expect(d, "ต้องมีสาขา RYG ให้ทดสอบ").toBeTruthy();

  const { data: touched, error } = await hq.rpc("save_dealers", {
    p_rows: [{ code: "RYG", name: d!.name, province: d!.province, region: d!.region, status: d!.status, revenue_target: String(d!.revenue_target) }],
  });
  expect(error, "แก้สาขาที่มีอยู่จริงต้องไม่ error").toBeNull();
  expect(Number(touched), "ต้องแก้ได้ 1 แถว").toBe(1);
});

test("เป้ายอดขายติดลบ ต้องถูกกันที่ชั้นฐานข้อมูลด้วย ไม่ใช่แค่ที่หน้าจอ", async () => {
  const hq = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false } });
  await hq.auth.signInWithPassword(ADMIN);

  const { data: before } = await svc.from("dealers").select("name, province, region, status, revenue_target").eq("code", "RYG");
  const d = before![0];
  await hq.rpc("save_dealers", {
    p_rows: [{ code: "RYG", name: d.name, province: d.province, region: d.region, status: d.status, revenue_target: "-9000000" }],
  });
  const { data: after } = await svc.from("dealers").select("revenue_target").eq("code", "RYG");
  expect(Number(after?.[0]?.revenue_target), "ยิงค่าติดลบเข้ามาตรง ๆ ต้องไม่ถูกเก็บ").toBeGreaterThanOrEqual(0);

  // คืนค่าเดิมให้ระบบ ไม่ทิ้งผลข้างเคียงไว้
  await svc.from("dealers").update({ revenue_target: d.revenue_target }).eq("code", "RYG");
});

test("ห้ามลบ/ลดสิทธิ์ผู้ดูแลสูงสุดคนสุดท้าย", async () => {
  // ถ้าบัญชีนี้หาย จะไม่เหลือใครจัดการระบบได้เลย และกู้จากหน้าจอไม่ได้
  // ทดสอบด้วย service_role โดยตั้งใจ — เป็นสิทธิ์สูงสุดที่ข้ามการตรวจปกติได้ทั้งหมด
  const { data: admins } = await svc.from("profiles").select("id").eq("role", "SUPER_ADMIN").eq("status", "active");
  test.skip((admins?.length ?? 0) !== 1, `ทดสอบนี้ใช้ได้เมื่อเหลือผู้ดูแลสูงสุดคนเดียว (ตอนนี้ ${admins?.length})`);
  const id = admins![0].id;

  const demote = await svc.from("profiles").update({ role: "HQ_STAFF" }).eq("id", id).select();
  expect(demote.error, "ลดบทบาทผู้ดูแลคนสุดท้ายต้องถูกปฏิเสธ").not.toBeNull();

  const disable = await svc.from("profiles").update({ status: "inactive" }).eq("id", id).select();
  expect(disable.error, "ปิดใช้งานผู้ดูแลคนสุดท้ายต้องถูกปฏิเสธ").not.toBeNull();

  const del = await svc.from("profiles").delete().eq("id", id).select();
  expect(del.error, "ลบผู้ดูแลคนสุดท้ายต้องถูกปฏิเสธ").not.toBeNull();

  // ต้องยังอยู่ครบเหมือนเดิม
  const { data: still } = await svc.from("profiles").select("id, role, status").eq("id", id);
  expect(still?.[0]?.role, "บทบาทต้องไม่ถูกเปลี่ยน").toBe("SUPER_ADMIN");
  expect(still?.[0]?.status, "สถานะต้องไม่ถูกเปลี่ยน").toBe("active");
});

test("สร้างใบเสนอราคาโดยไม่ส่งยอดมา → ต้องได้ 0 ไม่ใช่ค่าว่าง", async () => {
  // jsonb_populate_record เริ่มจากแถวที่ทุกคอลัมน์เป็น NULL — ค่าตั้งต้นของตารางถูกข้ามทั้งหมด
  // ใบที่ได้จะมียอดเป็นค่าว่างแทนศูนย์ แล้วการรวมยอดของลูกค้าจะข้ามใบนั้นไปเงียบ ๆ
  const { RYG } = await import("./supabaseEnv");
  const dealer = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false } });
  const { error: le } = await dealer.auth.signInWithPassword(RYG);
  expect(le?.message ?? "", "ล็อกอินดีลเลอร์ต้องผ่าน").toBe("");

  // ด่าน 3: ใบใหม่ต้องทำจากใบ HQ (0201) — ส่งแค่ใบ HQ + รายการขั้นต่ำ ไม่ส่งยอด/ต้นทุน/จำนวนรายการ
  const company = "ZZTEST-DEFAULTS-ใบไม่ส่งยอด";
  const { เตรียมใบHQ, ล้างใบHQทดสอบ } = await import("./hqQuoteFixture");
  const ใบ = await เตรียมใบHQ(RYG, { dealerCode: "RYG", company: `${company}-${Date.now() % 100000}`, province: "ระยอง",
    lines: [{ name: "ทดสอบ", qty: 1, unit: "งาน", unitCost: 1234 }] });
  const { data, error } = await dealer.rpc("create_quotation", {
    p_dealer: "RYG", p_prefix: "Q-",
    p_payload: { customer: company, date: "2026-05-01", hq_quote_id: ใบ.hqQuoteId, line_items: [{ name: "ทดสอบ", qty: 1 }] },
  });
  expect(error?.message ?? "", "สร้างใบต้องสำเร็จ").toBe("");

  const row = Array.isArray(data) ? data[0] : data;
  expect(row.total_value, "ยอดต้องไม่ใช่ค่าว่าง").not.toBeNull();
  expect(Number(row.total_value), "ไม่ส่ง % = บวก 0 → ยอดเท่าต้นทุนจากใบ HQ").toBe(1234);
  expect(row.material_cost, "ต้นทุนวัสดุต้องเป็น 0 ไม่ใช่ค่าว่าง").not.toBeNull();
  expect(row.items, "จำนวนรายการต้องเป็นตัวเลข ไม่ใช่ค่าว่าง").not.toBeNull();
  expect(row.status, "สถานะต้องเป็นร่าง").toBe("draft");

  ล้างใบHQทดสอบ("RYG", [ใบ.leadNum]);
});
