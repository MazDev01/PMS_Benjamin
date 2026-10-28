import { test, expect } from "@playwright/test";
import { ADMIN, RYG, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { HQ_ORIGIN, loginUI, db, watchErrors, assertNoErrors } from "./funcHelpers";
import { adminClient } from "./testDealers";
import { กดตกลงในกล่องยืนยัน, รอข้อความแจ้งเตือน } from "./helpers";

// ── HQ โอนลูกค้าเป้าหมายใต้รหัส HQ ให้ดีลเลอร์ (ด่าน 1 · ใบ 0197) ───────────────────────────────────────
// ข้อตัดสินของบอส 14 ต.ค. 69: ดีลเลอร์รายเดียว → โอนอัตโนมัติ (HQ กดยืนยันเป็นชุด) · ทับซ้อน → HQ เลือกต่อจังหวัด
//   ไม่มีจังหวัด / จังหวัดว่าง → คิวรอ ไม่โอน · โอนแล้วย้ายพร้อมประวัติ นัดหมาย โน้ต · ห้ามรันกับระบบจริง
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);   // ข้อเดียวเดินครบ 3 ขั้น (โอนชุด · โอนจังหวัดทับซ้อน · ตรวจคิว) — เกินเพดาน 30 วินาทีของข้อทั่วไปในโหมด api

const admin = adminClient();
const ป้าย = "ZZTEST-โอนHQ";
async function ล้าง() {
  for (const code of ["HQ", "RYG", "CNX"]) {
    const { data } = await admin.from("leads").select("num_id").eq("dealer_code", code).like("company", `${ป้าย}%`);
    const nums = (data ?? []).map(r => r.num_id);
    if (nums.length) await admin.from("appointments").delete().eq("dealer_code", code).in("lead_id", nums);
    await admin.from("leads").delete().eq("dealer_code", code).like("company", `${ป้าย}%`);
  }
  await admin.from("dealer_territories").delete().eq("province", "ลำพูน");
}
test.beforeAll(async () => {
  await ล้าง();
  // สาขา "HQ" ใช้ร่วมกับ territory-multi-dealer.spec.ts ที่รันขนานกัน — สร้างแบบไม่ชน (มีแล้วข้าม) และไม่ลบตอนจบ
  const สาขาHQ = await admin.from("dealers").upsert({ code: "HQ", name: "สำนักงานใหญ่ (ทดสอบ)", province: "กรุงเทพมหานคร", region: "กลาง", status: "active" },
    { onConflict: "code", ignoreDuplicates: true });
  if (สาขาHQ.error) throw new Error(สาขาHQ.error.message);
  // ลำพูน = จังหวัดที่มี 2 สาขาดูแล (ใบ 0214: จังหวัดเดียวมีหลายดีลเลอร์ได้ · ป้าย legacy ไม่ใช้แล้ว)
  await admin.from("dealer_territories").insert([{ province: "ลำพูน", dealer_code: "RYG" }, { province: "ลำพูน", dealer_code: "CNX" }]);
  const lead = (n: number, company: string, province: string) => ({
    id: `#ZZHQ-${n}`, dealer_code: "HQ", num_id: 979_000_000 + n, name: company, company, phone: `081-300-000${n}`, province, status: "WAITING",
    note: n === 1 ? "โน้ตจาก HQ" : "",
  });
  const r = await admin.from("leads").insert([
    lead(1, `${ป้าย}-ระยอง`, "ระยอง"), lead(2, `${ป้าย}-ลำพูน`, "ลำพูน"), lead(3, `${ป้าย}-ไม่มีจังหวัด`, ""),
  ]);
  if (r.error) throw new Error(r.error.message);
  await admin.from("appointments").insert({ id: 979_000_001, dealer_code: "HQ", lead_id: 979_000_001, date: "2026-10-20", company: `${ป้าย}-ระยอง`, note: "นัดดูหน้างาน" });
});
test.afterAll(async () => {
  await ล้าง();
});

test("[H6] [hq] โอนลูกค้าเป้าหมายของ HQ: ยืนยันเป็นชุด (ดีลเลอร์รายเดียว) · เลือกเองเมื่อทับซ้อน · คิวรอไม่โอน", async ({ page }) => {
  const errs = watchErrors(page);
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await page.goto(`${HQ_ORIGIN}/hq/leads`, { waitUntil: "domcontentloaded" });
  const การ์ด = page.locator(".card").filter({ hasText: "โอนลูกค้าเป้าหมายของ HQ ให้ดีลเลอร์" }).first();
  await expect(การ์ด).toBeVisible({ timeout: 30_000 });
  await expect(การ์ด.getByRole("row", { name: /ระยอง/ })).toContainText("RYG");
  // จังหวัดสาขาเดียว (ระยอง) = โอนอัตโนมัติ · จังหวัดหลายสาขา (ลำพูน: RYG + CNX · ใบ 0214) = HQ ต้องเลือกเอง ระบบไม่เลือกให้
  await expect(การ์ด.getByRole("row", { name: /ระยอง/ }).getByText("โอนอัตโนมัติได้")).toBeVisible();
  const ช่องลำพูน = การ์ด.getByRole("row", { name: /ลำพูน/ }).getByLabel("โอนจังหวัดลำพูนให้");
  await expect(ช่องลำพูน, "หลายสาขา: ระบบต้องไม่เลือกสาขาให้").toHaveValue("");
  await expect(การ์ด.getByRole("row", { name: /ลำพูน/ }).getByRole("button", { name: "โอน" }), "ยังไม่เลือกสาขา = โอนไม่ได้").toBeDisabled();
  await expect(การ์ด.getByText(/คิวรอ/)).toBeVisible();

  // 1) ยืนยันเป็นชุด
  await การ์ด.getByRole("button", { name: /โอนอัตโนมัติทั้งหมด/ }).click();
  await กดตกลงในกล่องยืนยัน(page);
  await รอข้อความแจ้งเตือน(page, /โอนแล้ว/);
  await expect.poll(async () => (await admin.from("leads").select("dealer_code").like("company", `${ป้าย}-ระยอง`)).data?.map(r => r.dealer_code), { timeout: 20_000 })
    .toEqual(["RYG"]);
  const { data: ย้าย } = await admin.from("leads").select("num_id, note, activities").eq("dealer_code", "RYG").eq("company", `${ป้าย}-ระยอง`).single();
  expect(ย้าย!.note, "โน้ตย้ายตาม").toBe("โน้ตจาก HQ");
  expect(JSON.stringify(ย้าย!.activities), "ประวัติบอกว่ารับโอนจาก HQ").toContain("รับโอนจากสำนักงานใหญ่");
  const { data: นัด } = await admin.from("appointments").select("note").eq("dealer_code", "RYG").eq("lead_id", ย้าย!.num_id);
  expect(นัด?.map(a => a.note), "นัดหมายย้ายตาม").toEqual(["นัดดูหน้างาน"]);
  // RYG เห็นในฐานะเจ้าของ
  const { data: เห็น } = await (await db(RYG)).from("leads").select("company").eq("company", `${ป้าย}-ระยอง`);
  expect(เห็น?.length, "RYG เห็นลูกค้าเป้าหมายที่รับโอน").toBe(1);

  // 2) หลายสาขา — HQ เลือก CNX เอง
  const แถวลำพูน = การ์ด.getByRole("row", { name: /ลำพูน/ });
  await แถวลำพูน.getByLabel("โอนจังหวัดลำพูนให้").selectOption("CNX");
  await แถวลำพูน.getByRole("button", { name: "โอน" }).click();
  await กดตกลงในกล่องยืนยัน(page);
  await expect.poll(async () => (await admin.from("leads").select("dealer_code").like("company", `${ป้าย}-ลำพูน`)).data?.map(r => r.dealer_code), { timeout: 20_000 })
    .toEqual(["CNX"]);

  // 3) คิวรอยังอยู่ที่ HQ
  const { data: คิว } = await admin.from("leads").select("dealer_code").like("company", `${ป้าย}-ไม่มีจังหวัด`);
  expect(คิว?.map(r => r.dealer_code), "ไม่มีจังหวัด = คิวรอ ไม่ถูกโอน").toEqual(["HQ"]);
  assertNoErrors(errs, "หน้าลูกค้าเป้าหมายของ HQ");
});
