import { test, expect } from "@playwright/test";
import { ADMIN, RYG, CNX, skipReason } from "./supabaseEnv";
import { getSession } from "./helpers";
import { adminClient } from "./testDealers";
import { SERVICE_ROLE_READY } from "./adminEnv";

// ── โปรเจกต์ setup: ด่านเดียวที่โปรเจกต์อื่นพึ่ง (บอสสั่ง 14 ต.ค. 69 ตอนปิดด่าน 3) ─────────────────────────────
//
// เดิม safari / stress / price-switch พึ่งผลของ chromium — chromium ตกข้อเดียว 18 ข้อของสามโปรเจกต์นั้นไม่ได้รันเลย
//   และไม่มีอะไรบอก (รายงานปิดด่าน 1–2 นับรวมเป็น "ถูกข้าม")
// ตอนนี้ทุกโปรเจกต์พึ่งแค่ด่านนี้: ล็อกอินบัญชีทดสอบได้ และข้อมูลตั้งต้น (global-setup) ลงฐานครบ
//   ถ้าด่านนี้ตก = ระบบทดสอบยังไม่พร้อม ข้ามทั้งหมดก็ถูกแล้ว (ตัวตรวจ check-e2e-ran จะรายงานว่าไม่ได้รัน)
// ⚠️ ลำดับการรัน (price-switch ห้ามคาบเกี่ยวกับชุดอื่น · stress ห้ามแย่งเครื่อง) คุมด้วยตัวรันเป็นช่วง
//    scripts/test-prodbuild.mjs ไม่ใช่ด้วยการพึ่งผลของโปรเจกต์อื่น
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");

test("[setup] บัญชีทดสอบล็อกอินได้ครบ (HQ · RYG · CNX)", async () => {
  for (const who of [ADMIN, RYG, CNX]) {
    const s = await getSession(who);
    expect(s.access_token, `ล็อกอิน ${who.email} ต้องได้ใบผ่าน`).toBeTruthy();
  }
});

test("[setup] ข้อมูลตั้งต้นของชุดทดสอบลงฐานครบ", async () => {
  test.skip(!SERVICE_ROLE_READY, "เครื่องนี้ยังไม่ได้ตั้ง service_role");
  const admin = adminClient();
  const { count: ใบ } = await admin.from("quotations").select("id", { count: "exact", head: true }).like("id", "ZZTEST-BASE-Q-%");
  const { count: ลีด } = await admin.from("leads").select("id", { count: "exact", head: true }).like("company", "ZZTEST-BASE-%");
  expect(ใบ ?? 0, "ใบเสนอราคาตั้งต้นต้องมี").toBeGreaterThan(0);
  expect(ลีด ?? 0, "ลูกค้าเป้าหมายตั้งต้นต้องมี").toBeGreaterThan(0);
});

test("[setup] สวิตช์ซ่อนราคาแม่แบบต้องปิดอยู่ก่อนเริ่ม (ค้างเปิด = ตก ห้ามแก้ให้เงียบ ๆ)", async () => {
  // สวิตช์เป็นค่ากลางทั้งระบบ — ค้างเปิด (เช่น price-switch รอบก่อนถูกฆ่ากลางทาง) = ดีลเลอร์ในชุดอื่นอ่านราคาแม่แบบไม่ได้
  //   ข้อทดสอบออกใบตกกระจายแบบหาสาเหตุยาก · ด่านนี้บอกตรง ๆ แทน และไม่ปิดให้เอง (บอสสั่ง 14 ต.ค. 69)
  test.skip(!SERVICE_ROLE_READY, "เครื่องนี้ยังไม่ได้ตั้ง service_role");
  const { data, error } = await adminClient().from("hq_policy").select("hide_catalog_price").order("id").limit(1).single();
  expect(error, "ต้องอ่านค่าสวิตช์ได้").toBeNull();
  expect(data?.hide_catalog_price,
    "สวิตช์ซ่อนราคาแม่แบบค้างเปิดอยู่ (hq_policy.hide_catalog_price = true) — มีรอบก่อนหน้าปิดคืนไม่สำเร็จ ต้องตรวจสาเหตุแล้วปิดเองก่อนรัน").toBe(false);
});
