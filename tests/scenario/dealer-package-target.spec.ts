// ── เป้ายอดขายรายปีของดีลเลอร์ เชื่อมกับแพ็กเกจ Standard / Exclusive (บอสสั่ง 15 ก.ย. 69 · 0178) ──
//
// สิ่งที่ต้องพิสูจน์ที่ฐานข้อมูล (ด่านจริง ใครเขียนทางไหนก็โดน):
//   1) ดีลเลอร์มีแพ็กเกจ + แพ็กเกจตั้งเป้าไว้ → เป้ายอดขาย = เป้าของแพ็กเกจ · กรอกทับผ่าน save_dealers ไม่ได้
//   2) แก้เป้าของแพ็กเกจที่หน้าตั้งค่า → ดีลเลอร์ในแพ็กเกจนั้นเปลี่ยนตาม
//   3) ไม่มีแพ็กเกจ / แพ็กเกจยังไม่ตั้งเป้า → เป้าที่กรอกเองยังอยู่
//   4) save_dealers ที่ไม่ส่งคีย์ package → แพ็กเกจเดิมไม่หาย · ทะเบียนดีลเลอร์ (view) อ่านแพ็กเกจได้
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

test("[db] เป้ายอดขายตามแพ็กเกจ · แก้เป้าแพ็กเกจแล้วดีลเลอร์เปลี่ยนตาม · ไม่มีแพ็กเกจกรอกเองได้", async () => {
  test.skip(!ADMIN_SERVICE_ROLE_KEY, "เครื่องนี้ยังไม่ได้ตั้ง service_role");
  await ตั้งเป้าแพ็กเกจ(3_000_000, null);
  const ใส่ = await admin.from("dealers").insert([
    { code: STD, name: "ZZTEST แพ็กเกจ Standard", province: "ระยอง", region: "ตะวันออก", revenue_target: 0, status: "active", package: "standard" },
    { code: EXC, name: "ZZTEST แพ็กเกจ Exclusive", province: "ระยอง", region: "ตะวันออก", revenue_target: 1_500_000, status: "active", package: "exclusive" },
  ]);
  expect(ใส่.error).toBeNull();
  expect(await เป้าของ(STD), "มีแพ็กเกจที่ตั้งเป้าไว้ ต้องได้เป้าของแพ็กเกจ").toBe(3_000_000);
  expect(await เป้าของ(EXC), "แพ็กเกจยังไม่ตั้งเป้า ต้องคงเป้าที่กรอกเอง").toBe(1_500_000);

  // ผู้ดูแลกรอกเป้าทับผ่านหน้าดีลเลอร์ (save_dealers) — ต้องกลับเป็นเป้าของแพ็กเกจ
  const hq = await db(ADMIN);
  const บันทึก = await hq.rpc("save_dealers", { p_rows: [
    { code: STD, name: "ZZTEST แพ็กเกจ Standard", province: "ระยอง", region: "ตะวันออก", status: "active", revenue_target: 99, package: "standard" },
  ] });
  expect(บันทึก.error).toBeNull();
  expect(await เป้าของ(STD), "กรอกทับเป้าของดีลเลอร์ที่อยู่ในแพ็กเกจไม่ได้").toBe(3_000_000);

  // แก้เป้าของแพ็กเกจที่หน้าตั้งค่า → ดีลเลอร์เปลี่ยนตามทั้งสองแพ็กเกจ
  await ตั้งเป้าแพ็กเกจ(3_600_000, 8_000_000);
  expect(await เป้าของ(STD), "แก้เป้าแพ็กเกจแล้ว ดีลเลอร์ต้องเปลี่ยนตาม").toBe(3_600_000);
  expect(await เป้าของ(EXC), "แพ็กเกจที่เพิ่งตั้งเป้า ดีลเลอร์ต้องได้เป้านั้น").toBe(8_000_000);

  // เอาแพ็กเกจออก → กรอกเองได้
  expect((await hq.rpc("save_dealers", { p_rows: [
    { code: EXC, name: "ZZTEST แพ็กเกจ Exclusive", province: "ระยอง", region: "ตะวันออก", status: "active", revenue_target: 2_222_000, package: "" },
  ] })).error).toBeNull();
  expect(await เป้าของ(EXC), "ไม่มีแพ็กเกจแล้ว ต้องใช้เป้าที่กรอกเอง").toBe(2_222_000);

  // ผู้เรียกเก่าที่ไม่ส่งคีย์ package → แพ็กเกจเดิมต้องไม่หาย
  expect((await hq.rpc("save_dealers", { p_rows: [
    { code: STD, name: "ZZTEST แพ็กเกจ Standard (แก้ชื่อ)", province: "ระยอง", region: "ตะวันออก", status: "active", revenue_target: 1 },
  ] })).error).toBeNull();
  const { data: ทะเบียน } = await hq.from("dealers_directory").select("code, package, revenue_target").in("code", [STD, EXC]).order("code");
  expect(ทะเบียน, "ทะเบียนดีลเลอร์ต้องอ่านแพ็กเกจได้ และแพ็กเกจเดิมไม่หาย").toEqual([
    { code: STD, package: "standard", revenue_target: 3_600_000 },
    { code: EXC, package: null, revenue_target: 2_222_000 },
  ]);

  // ── แยกตามภาค (0179): ภาคของดีลเลอร์ตั้งเป้าไว้ → ใช้เป้าของภาค · ภาคที่ไม่ได้ตั้ง → ค่ากลาง · ย้ายภาคแล้วเป้าเปลี่ยนตาม ──
  await ตั้งเป้าแพ็กเกจ(3_600_000, 8_000_000, { standard: { ตะวันออก: 2_400_000 } });
  expect(await เป้าของ(STD), "ภาคตะวันออกตั้งเป้าแยกไว้ ต้องได้เป้าของภาค").toBe(2_400_000);
  expect((await admin.from("dealers").update({ region: "เหนือ", province: "เชียงใหม่" }).eq("code", STD)).error).toBeNull();
  expect(await เป้าของ(STD), "ย้ายไปภาคที่ไม่ได้ตั้งแยก ต้องใช้เป้ากลางของแพ็กเกจ").toBe(3_600_000);
  await ตั้งเป้าแพ็กเกจ(3_600_000, 8_000_000, { standard: { ตะวันออก: 2_400_000, เหนือ: 1_800_000 } });
  expect(await เป้าของ(STD), "ตั้งเป้าภาคเหนือเพิ่ม ดีลเลอร์ภาคเหนือต้องเปลี่ยนตาม").toBe(1_800_000);

  // ── กำหนดเป้าเองรายดีลเลอร์ (0180 · บอสสั่ง "ให้สามารถแก้เองหรือแก้ในตั้งค่าก็ได้") ──
  const บันทึกเอง = (manual: boolean, target: number) => hq.rpc("save_dealers", { p_rows: [
    { code: STD, name: "ZZTEST แพ็กเกจ Standard (แก้ชื่อ)", province: "เชียงใหม่", region: "เหนือ", status: "active", revenue_target: target, package: "standard", target_manual: manual },
  ] });
  expect((await บันทึกเอง(true, 4_444_000)).error).toBeNull();
  expect(await เป้าของ(STD), "ติ๊กกำหนดเอง แม้มีแพ็กเกจที่ตั้งเป้า ต้องได้เป้าที่กรอก").toBe(4_444_000);
  await ตั้งเป้าแพ็กเกจ(3_900_000, 8_000_000, { standard: { เหนือ: 1_900_000 } });
  expect(await เป้าของ(STD), "แก้เป้าแพ็กเกจที่ตั้งค่า ดีลเลอร์ที่กำหนดเองต้องไม่เปลี่ยน").toBe(4_444_000);
  // ผู้เรียกเก่าที่ไม่ส่งคีย์ target_manual → โหมดเดิมไม่หาย
  expect((await hq.rpc("save_dealers", { p_rows: [
    { code: STD, name: "ZZTEST แพ็กเกจ Standard (แก้ชื่อ)", province: "เชียงใหม่", region: "เหนือ", status: "active", revenue_target: 4_444_000, package: "standard" },
  ] })).error).toBeNull();
  const { data: โหมด } = await hq.from("dealers_directory").select("target_manual, revenue_target").eq("code", STD).single();
  expect(โหมด, "ไม่ส่งคีย์ target_manual ต้องคงโหมดกำหนดเอง").toEqual({ target_manual: true, revenue_target: 4_444_000 });
  expect((await บันทึกเอง(false, 1)).error).toBeNull();
  expect(await เป้าของ(STD), "ยกเลิกกำหนดเอง ต้องกลับไปตามเป้าแพ็กเกจของภาคทันที").toBe(1_900_000);
});

test("[ui·hq] หน้าดีลเลอร์: เลือกแพ็กเกจแล้วเป้าล็อกตามแพ็กเกจ/ภาค · หน้าตั้งค่า: กรอกเป้าแยกภาคแล้วดีลเลอร์เปลี่ยนตาม", async ({ page }) => {
  test.skip(!ADMIN_SERVICE_ROLE_KEY, "เครื่องนี้ยังไม่ได้ตั้ง service_role");
  test.setTimeout(180_000);
  const errs = watchErrors(page);
  await purge();
  await ตั้งเป้าแพ็กเกจ(3_000_000, null, { standard: { ตะวันออก: 2_400_000 } });
  const ชื่อ = "ZZTEST ฟอร์มแพ็กเกจ";
  expect((await admin.from("dealers").insert({ code: STD, name: ชื่อ, province: "ระยอง", region: "ตะวันออก", revenue_target: 500_000, status: "active" })).error).toBeNull();

  // ── หน้าดีลเลอร์ › แก้ไข ──
  await loginUI(page, HQ_ORIGIN, "/hq/dealers", ADMIN);
  await page.getByPlaceholder("ค้นหาดีลเลอร์...").fill(STD);
  await page.getByRole("button", { name: `แก้ไขดีลเลอร์ ${ชื่อ}` }).first().click({ timeout: 30_000 });
  const เป้า = page.getByLabel("เป้ายอดขายทั้งปี");
  await expect(เป้า, "ยังไม่มีแพ็กเกจ ต้องกรอกเองได้").toBeEnabled();
  await expect(เป้า).toHaveValue("500,000");

  await page.getByLabel("แพ็กเกจดีลเลอร์").selectOption("standard");
  await expect(เป้า, "เลือกแพ็กเกจที่ตั้งเป้าไว้ ช่องเป้าต้องล็อก").toBeDisabled();
  await expect(เป้า, "ภาคตะวันออกตั้งเป้าแยกไว้ ต้องขึ้นเป้าของภาค").toHaveValue("2,400,000");
  await expect(page.getByText("ตามแพ็กเกจ Standard · ตะวันออก")).toBeVisible();

  // หน้าดีลเลอร์มีตัวกรอง "ภูมิภาค" อีกช่อง — เลือกเฉพาะในหน้าต่างแก้ไข
  const ฟอร์ม = page.getByRole("dialog").filter({ has: page.getByLabel("แพ็กเกจดีลเลอร์") });
  await ฟอร์ม.getByLabel("ภูมิภาค").selectOption("เหนือ");
  await ฟอร์ม.getByLabel("จังหวัดที่ตั้ง").selectOption("เชียงใหม่");
  await expect(เป้า, "ย้ายไปภาคที่ไม่ได้ตั้งแยก ต้องขึ้นค่ากลาง").toHaveValue("3,000,000");
  await page.getByRole("button", { name: "บันทึกการแก้ไข" }).click();
  await expect.poll(async () => (await admin.from("dealers").select("package, region, revenue_target").eq("code", STD).single()).data,
    { timeout: 20_000, message: "บันทึกแล้วต้องได้แพ็กเกจ ภาค และเป้าตามค่ากลาง" })
    .toEqual({ package: "standard", region: "เหนือ", revenue_target: 3_000_000 });

  // ── ตั้งค่า › หาดีลเลอร์ › เป้าแยกภาค ──
  await settle(page);   // ไม่ใช้ networkidle — โหมด api เปิดสายอัปเดตสดค้างไว้ ไม่มีวัน "เงียบ" (ดู helpers.settle)
  await page.goto(`${HQ_ORIGIN}/hq/settings`);
  await page.locator(".tab-bar").getByRole("button", { name: "หาดีลเลอร์" }).click({ timeout: 25_000 });
  const ช่องเหนือ = page.locator("#rc-standard-target-เหนือ");
  await expect(ช่องเหนือ, "ภาคที่ยังไม่ตั้งต้องว่าง (บอกค่ากลางไว้เป็นตัวอย่าง)").toHaveValue("");
  await expect(page.locator("#rc-standard-target-ตะวันออก")).toHaveValue("2,400,000");
  await ช่องเหนือ.fill("1800000");
  await expect(ช่องเหนือ, "ช่องเงินต้องมีลูกน้ำ").toHaveValue("1,800,000");
  await page.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect.poll(async () => เป้าของ(STD), { timeout: 20_000, message: "กรอกเป้าภาคเหนือแล้ว ดีลเลอร์ภาคเหนือต้องเปลี่ยนตาม" })
    .toBe(1_800_000);
  await settle(page);   // ไม่ใช้ networkidle — โหมด api เปิดสายอัปเดตสดค้างไว้ ไม่มีวัน "เงียบ" (ดู helpers.settle)
  assertNoErrors(errs, "หน้าดีลเลอร์ + ตั้งค่า › หาดีลเลอร์ (เป้าตามแพ็กเกจ)");
});
