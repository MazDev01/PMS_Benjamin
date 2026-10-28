// ── เป้ายอดขายรายปีของดีลเลอร์ กับเป้าของแพ็กเกจ Standard / Exclusive ────────────────────────────────────────
//
// กติกาปัจจุบัน (บอสตัดสิน 15 ต.ค. 69 · ใบ 0206 · ทับกติกาเดิม 15 ก.ย. 69 ของ 0178–0180):
//   1) เป้าของแพ็กเกจ = ค่าตั้งต้นที่เติมตอนออกใบค่าแฟรนไชส์ใหม่เท่านั้น (ข้อทดสอบอยู่ที่ hq-recruit-settings)
//   2) เป้าเป็นของดีลเลอร์รายนั้น — ตั้งจากใบตอนแปลงเป็นดีลเลอร์ · HQ แก้เองได้ · ไม่ถูกเป้าแพ็กเกจทับ
//   3) แก้เป้าของแพ็กเกจ/แยกภาคที่หน้าตั้งค่าทีหลัง → ดีลเลอร์ที่มีอยู่ไม่เปลี่ยน
//   4) save_dealers ที่ไม่ส่งคีย์ package → แพ็กเกจเดิมไม่หาย · ทะเบียนดีลเลอร์ (view) อ่านแพ็กเกจได้
// (ข้อทดสอบยิงตรงฐาน: supabase/tests/franchise_target.sql)
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { ADMIN, skipReason } from "./supabaseEnv";
import { ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY } from "./adminEnv";
import { db, loginUI, HQ_ORIGIN, watchErrors, assertNoErrors } from "./funcHelpers";
import { settle } from "./helpers";

test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.describe.configure({ mode: "serial" });

const STD = "ZZS";
const EXC = "ZZW";   // ไม่ใช้ ZZX — hq-prospects ใช้เป็น "สาขาที่ไม่มีอยู่จริง"
const admin = createClient(ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
let ค่าตั้งเดิม: unknown = null;

async function purge() {
  await admin.from("dealers").delete().in("code", [STD, EXC]);
}
test.beforeAll(async () => {
  ค่าตั้งเดิม = ((await admin.from("hq_recruit_settings").select("config").eq("id", 1).maybeSingle()).data as { config: unknown } | null)?.config ?? {};
  await purge();
});
test.afterAll(async () => {
  await purge();
  await admin.from("hq_recruit_settings").update({ config: ค่าตั้งเดิม }).eq("id", 1);
});

const ตั้งเป้าแพ็กเกจ = async (standard: number | null, exclusive: number | null,
  ตามภาค: { standard?: Record<string, number>; exclusive?: Record<string, number> } = {}) => {
  const base = (ค่าตั้งเดิม && typeof ค่าตั้งเดิม === "object" ? ค่าตั้งเดิม : {}) as Record<string, unknown>;
  const proposal = (base.proposal && typeof base.proposal === "object" ? base.proposal : {}) as Record<string, unknown>;
  const { error } = await admin.from("hq_recruit_settings").update({
    config: { ...base, proposal: { ...proposal, packages: {
      standard: { annualTarget: standard, targetsByRegion: ตามภาค.standard ?? {} },
      exclusive: { annualTarget: exclusive, targetsByRegion: ตามภาค.exclusive ?? {} },
    } } },
  }).eq("id", 1);
  expect(error).toBeNull();
};
const เป้าของ = async (code: string) =>
  Number(((await admin.from("dealers").select("revenue_target").eq("code", code).single()).data as { revenue_target: number }).revenue_target);

test("[db] เป้าเป็นของดีลเลอร์ · แพ็กเกจตั้งเป้าไว้ก็ไม่ทับ · แก้เป้าแพ็กเกจทีหลังดีลเลอร์ไม่เปลี่ยน", async () => {
  test.skip(!ADMIN_SERVICE_ROLE_KEY, "เครื่องนี้ยังไม่ได้ตั้ง service_role");
  await ตั้งเป้าแพ็กเกจ(3_000_000, null, { standard: { ตะวันออก: 2_400_000 } });
  const ใส่ = await admin.from("dealers").insert([
    { code: STD, name: "ZZTEST แพ็กเกจ Standard", province: "ระยอง", region: "ตะวันออก", revenue_target: 12_000_000, status: "active", package: "standard" },
    { code: EXC, name: "ZZTEST แพ็กเกจ Exclusive", province: "ระยอง", region: "ตะวันออก", revenue_target: 1_500_000, status: "active", package: "exclusive" },
  ]);
  expect(ใส่.error).toBeNull();
  expect(await เป้าของ(STD), "แพ็กเกจตั้งเป้าไว้ (ภาคตะวันออก 2,400,000) เป้าที่ใส่ตอนสร้าง (จากใบ) ต้องคงอยู่").toBe(12_000_000);
  expect(await เป้าของ(EXC)).toBe(1_500_000);

  // HQ แก้เป้าของดีลเลอร์เองผ่านหน้าดีลเลอร์ (save_dealers) — ต้องได้ค่าที่แก้
  const hq = await db(ADMIN);
  expect((await hq.rpc("save_dealers", { p_rows: [
    { code: STD, name: "ZZTEST แพ็กเกจ Standard", province: "ระยอง", region: "ตะวันออก", status: "active", revenue_target: 9_900_000, package: "standard" },
  ] })).error).toBeNull();
  expect(await เป้าของ(STD), "HQ แก้เป้าของดีลเลอร์ในแพ็กเกจได้").toBe(9_900_000);

  // แก้เป้าของแพ็กเกจ/แยกภาคที่หน้าตั้งค่าทีหลัง → ดีลเลอร์ที่มีอยู่ไม่เปลี่ยน
  await ตั้งเป้าแพ็กเกจ(3_600_000, 8_000_000, { standard: { ตะวันออก: 2_000_000 } });
  expect(await เป้าของ(STD), "แก้เป้าแพ็กเกจทีหลัง ดีลเลอร์ standard ต้องไม่เปลี่ยน").toBe(9_900_000);
  expect(await เป้าของ(EXC), "แก้เป้าแพ็กเกจทีหลัง ดีลเลอร์ exclusive ต้องไม่เปลี่ยน").toBe(1_500_000);

  // ย้ายภาค / เปลี่ยนแพ็กเกจ → เป้าไม่เปลี่ยนตามแพ็กเกจ
  expect((await admin.from("dealers").update({ region: "เหนือ", province: "เชียงใหม่", package: "exclusive" }).eq("code", STD)).error).toBeNull();
  expect(await เป้าของ(STD), "ย้ายภาค/เปลี่ยนแพ็กเกจ เป้าต้องคงเดิม").toBe(9_900_000);

  // ผู้เรียกเก่าที่ไม่ส่งคีย์ package → แพ็กเกจเดิมต้องไม่หาย · ทะเบียนอ่านแพ็กเกจได้
  expect((await hq.rpc("save_dealers", { p_rows: [
    { code: EXC, name: "ZZTEST แพ็กเกจ Exclusive (แก้ชื่อ)", province: "ระยอง", region: "ตะวันออก", status: "active", revenue_target: 2_222_000 },
  ] })).error).toBeNull();
  const { data: ทะเบียน } = await hq.from("dealers_directory").select("code, package, revenue_target").in("code", [STD, EXC]).order("code");
  expect(ทะเบียน, "ทะเบียนดีลเลอร์ต้องอ่านแพ็กเกจได้ และแพ็กเกจเดิมไม่หาย").toEqual([
    { code: STD, package: "exclusive", revenue_target: 9_900_000 },
    { code: EXC, package: "exclusive", revenue_target: 2_222_000 },
  ]);
});

test("[ui·hq] หน้าดีลเลอร์: เลือกแพ็กเกจแล้วช่องเป้ายังแก้ได้ · หน้าตั้งค่า: แก้เป้าแยกภาคแล้วดีลเลอร์ที่มีอยู่ไม่เปลี่ยน", async ({ page }) => {
  test.skip(!ADMIN_SERVICE_ROLE_KEY, "เครื่องนี้ยังไม่ได้ตั้ง service_role");
  test.setTimeout(180_000);
  const errs = watchErrors(page);
  await purge();
  await ตั้งเป้าแพ็กเกจ(3_000_000, null, { standard: { ตะวันออก: 2_400_000 } });
  const ชื่อ = "ZZTEST ฟอร์มแพ็กเกจ";
  expect((await admin.from("dealers").insert({ code: STD, name: ชื่อ, province: "ระยอง", region: "ตะวันออก", revenue_target: 500_000, status: "active" })).error).toBeNull();

  // ── หน้ารายละเอียดดีลเลอร์ › แก้ไข (ปุ่มแก้ไขย้ายจากแถวทะเบียนมาที่นี่ · รอบ 2 ช่วง ข) ──
  await loginUI(page, HQ_ORIGIN, `/hq/dealers/${STD}`, ADMIN);
  await page.getByRole("button", { name: "แก้ไข", exact: true }).click({ timeout: 30_000 });
  const เป้า = page.getByLabel("เป้ายอดขายทั้งปี");
  await expect(เป้า).toHaveValue("500,000");
  await page.getByLabel("แพ็กเกจดีลเลอร์").selectOption("standard");
  await expect(เป้า, "เลือกแพ็กเกจที่ตั้งเป้าไว้ ช่องเป้ายังแก้ได้").toBeEnabled();
  await expect(เป้า, "เลือกแพ็กเกจแล้ว เป้าของดีลเลอร์ต้องไม่ถูกแทนด้วยเป้าแพ็กเกจ").toHaveValue("500,000");
  await expect(page.getByText(/ตามแพ็กเกจ Standard/), "ไม่มีโหมดเป้าตามแพ็กเกจแล้ว").toHaveCount(0);
  await เป้า.fill("1234000");
  await page.getByRole("button", { name: "บันทึกการแก้ไข" }).click();
  await expect.poll(async () => (await admin.from("dealers").select("package, revenue_target").eq("code", STD).single()).data,
    { timeout: 20_000, message: "บันทึกแล้วต้องได้แพ็กเกจ และเป้าตามที่กรอก" })
    .toEqual({ package: "standard", revenue_target: 1_234_000 });

  // ── ตั้งค่า › หาดีลเลอร์ › เป้าแยกภาค (ค่าตั้งต้นของใบใหม่) ──
  await settle(page);   // ไม่ใช้ networkidle — โหมด api เปิดสายอัปเดตสดค้างไว้ ไม่มีวัน "เงียบ" (ดู helpers.settle)
  await page.goto(`${HQ_ORIGIN}/hq/settings`);
  await page.locator(".tab-bar").getByRole("button", { name: "หาดีลเลอร์" }).click({ timeout: 25_000 });
  const ช่องตะวันออก = page.locator("#rc-standard-target-ตะวันออก");
  await expect(ช่องตะวันออก).toHaveValue("2,400,000");
  await ช่องตะวันออก.fill("1800000");
  await expect(ช่องตะวันออก, "ช่องเงินต้องมีลูกน้ำ").toHaveValue("1,800,000");
  await page.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect.poll(async () => ((await admin.from("hq_recruit_settings").select("config").eq("id", 1).single()).data as { config: { proposal: { packages: { standard: { targetsByRegion: Record<string, number> } } } } })
    .config.proposal.packages.standard.targetsByRegion["ตะวันออก"], { timeout: 20_000, message: "ค่าตั้งเป้าภาคต้องบันทึกลงฐาน" }).toBe(1_800_000);
  expect(await เป้าของ(STD), "แก้เป้าแพ็กเกจที่ตั้งค่า ดีลเลอร์ที่มีอยู่ต้องไม่เปลี่ยน").toBe(1_234_000);
  await settle(page);
  assertNoErrors(errs, "หน้าดีลเลอร์ + ตั้งค่า › หาดีลเลอร์ (เป้าของดีลเลอร์)");
});
