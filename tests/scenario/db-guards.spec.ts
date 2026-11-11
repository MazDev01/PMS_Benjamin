import { test, expect } from "@playwright/test";
import { สร้างสาขาของข้อ } from "./ownDealer";
import { createClient } from "@supabase/supabase-js";
import { ADMIN, SUPABASE_URL, SUPABASE_ANON, skipReason } from "./supabaseEnv";
import { ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY } from "./adminEnv";
import { รันSQLในฐาน } from "./localDb";

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

  // สาขาของข้อนี้เอง — เดิมยิงใส่เป้าของ RYG แล้วคืนค่าทีหลัง ชนข้อ "ยังไม่ตั้งเป้า" (flow-c) ที่แก้เป้า RYG พร้อมกัน (29 ต.ค. 69)
  const สาขา = await สร้างสาขาของข้อ({ เป้า: 1_000_000 });
  try {
    const { data: before } = await svc.from("dealers").select("name, province, region, status, revenue_target").eq("code", สาขา.รหัส);
    const d = before![0];
    await hq.rpc("save_dealers", {
      p_rows: [{ code: สาขา.รหัส, name: d.name, province: d.province, region: d.region, status: d.status, revenue_target: "-9000000" }],
    });
    const { data: after } = await svc.from("dealers").select("revenue_target").eq("code", สาขา.รหัส);
    expect(Number(after?.[0]?.revenue_target), "ยิงค่าติดลบเข้ามาตรง ๆ ต้องไม่ถูกเก็บ").toBeGreaterThanOrEqual(0);
  } finally {
    await สาขา.ลบ();
  }
});

test("ห้ามปิด/ลบ/ลดสิทธิ์บัญชีสำนักงานใหญ่คนสุดท้ายที่ใช้งาน (HQ บทบาทเดียว · ใบ 0282)", async () => {
  // ถ้าบัญชีนี้หาย จะไม่เหลือใครจัดการระบบได้เลย และกู้จากหน้าจอไม่ได้
  // ทำในทรานแซกชันที่ย้อนกลับที่ฐานทดสอบ: ปิดบัญชีสำนักงานใหญ่อื่นทั้งหมดก่อน (ข้ออื่นที่รันพร้อมกันเพิ่มผู้ใช้ HQ ได้ · ใบ 0282 ทุกคนเป็นบทบาทเดียว)
  //   แล้วลองปิด/ลดสิทธิ์/ลบคนสุดท้าย — ทุกทางต้องถูกปฏิเสธด้วย last_hq_account · ไม่แตะบัญชีจริงของข้ออื่น (rollback)
  //   เดิม: นับคนแล้วยิงด้วยกุญแจตรง ๆ — มีอีกคนเพิ่มเข้ามาระหว่างนับ = ปิดบัญชีผู้ดูแลจริงได้ (เสี่ยงพังทั้งชุดทดสอบ)
  const ออก = รันSQLในฐาน(`
select set_config('request.jwt.claims', '{"user_role":"SUPER_ADMIN"}', true);
create temp table คนสุดท้าย as select id from public.profiles where role = 'SUPER_ADMIN' and status = 'active' order by created_at limit 1;
update public.profiles set status = 'inactive' where role = 'SUPER_ADMIN' and status = 'active' and id <> (select id from คนสุดท้าย);
do $$
declare ผล text := '';
begin
  begin update public.profiles set status = 'inactive' where id = (select id from คนสุดท้าย); ผล := ผล || 'ปิด=ผ่าน;';
  exception when others then ผล := ผล || 'ปิด=' || sqlerrm || ';'; end;
  begin update public.profiles set role = 'DEALER_ADMIN', dealer_code = 'RYG' where id = (select id from คนสุดท้าย); ผล := ผล || 'ลด=ผ่าน;';
  exception when others then ผล := ผล || 'ลด=' || sqlerrm || ';'; end;
  begin delete from public.profiles where id = (select id from คนสุดท้าย); ผล := ผล || 'ลบ=ผ่าน;';
  exception when others then ผล := ผล || 'ลบ=' || sqlerrm || ';'; end;
  raise notice 'ผลกันคนสุดท้าย:%', ผล;
  perform set_config('pms.last_hq_result', ผล, true);
end $$;
select 'ผล|' || current_setting('pms.last_hq_result', true);
rollback;
begin;`);
  test.skip(ออก === null, "ไม่พบฐานทดสอบในเครื่อง (ข้อนี้รันในทรานแซกชันที่ฐานทดสอบ)");   // ข้ามตั้งใจ: สภาพแวดล้อม — เครื่องนี้ไม่มีฐานทดสอบ docker
  const ผล = /^ผล\|(.*)$/m.exec(ออก ?? "")?.[1] ?? "";
  for (const ทาง of ["ปิด", "ลด", "ลบ"]) {
    expect(new RegExp(`${ทาง}=[^;]*last_hq_account`).test(ผล), `${ทาง}บัญชีสำนักงานใหญ่คนสุดท้ายต้องถูกปฏิเสธด้วย last_hq_account (${ผล})`).toBe(true);
  }
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
