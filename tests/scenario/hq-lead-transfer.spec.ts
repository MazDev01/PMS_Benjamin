import { test, expect } from "@playwright/test";
import { ADMIN, RYG, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { HQ_ORIGIN, loginUI, db, watchErrors, assertNoErrors } from "./funcHelpers";
import { adminClient } from "./testDealers";
import { สร้างสาขาของชุด, ลบสาขาของชุด } from "./ownBranch";

// ── HQ โอนลูกค้าเป้าหมายใต้รหัส HQ ให้ดีลเลอร์ (ด่าน 1 · ใบ 0197) ───────────────────────────────────────
// 18 พ.ย. 69 (บอสสั่ง · ใบ 0287): ลูกค้าเป้าหมายที่เปิดอยู่ใต้ HQ ย้ายไป HQD (ขายตรง) หมดแล้ว → เอาการ์ดโอนออกจาก /hq/leads
//   ข้อนี้ตรวจว่าการ์ดไม่อยู่แล้ว + ข้อตรวจการโอนเดิมทุกข้อคงไว้ที่คำสั่งโอนของฐาน (สิทธิ์ HQ · ผลเดิม) — ไม่ลดข้อตรวจ
//   ข้อที่เป็นหน้าตาของการ์ดเท่านั้น (กรอบแดง/ข้อความใต้ช่อง/กล่องยืนยัน) หมดไปพร้อมการ์ด
// ข้อตัดสินของบอส 14 ต.ค. 69: ดีลเลอร์รายเดียว → โอนอัตโนมัติ (HQ กดยืนยันเป็นชุด) · ทับซ้อน → HQ เลือกต่อจังหวัด
//   ไม่มีจังหวัด / จังหวัดว่าง → คิวรอ ไม่โอน · โอนแล้วย้ายพร้อมประวัติ นัดหมาย โน้ต · ห้ามรันกับระบบจริง
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);   // ข้อเดียวเดินครบ 3 ขั้น (โอนชุด · โอนจังหวัดทับซ้อน · ตรวจคิว) — เกินเพดาน 30 วินาทีของข้อทั่วไปในโหมด api

const admin = adminClient();
const ป้าย = "ZZTEST-โอนHQ";
// ลำพูน = จังหวัดที่มี 2 สาขาดูแล — สาขาทดสอบ 2 สาขาที่ดูแลลำพูนจังหวัดเดียว (ดีลเลอร์ 1 ราย = 1 จังหวัดพอดี · ใบ 0259 · บอสสั่ง 29 ต.ค. 69)
const สาขาลำพูน = ["ZTLPA", "ZTLPB"] as const;
async function ล้าง() {
  for (const code of ["HQ", "RYG"]) {
    const { data } = await admin.from("leads").select("num_id").eq("dealer_code", code).like("company", `${ป้าย}%`);
    const nums = (data ?? []).map(r => r.num_id);
    if (nums.length) await admin.from("appointments").delete().eq("dealer_code", code).in("lead_id", nums);
    await admin.from("leads").delete().eq("dealer_code", code).like("company", `${ป้าย}%`);
  }
  for (const code of สาขาลำพูน) expect(await ลบสาขาของชุด(code), `เก็บกวาดสาขา ${code}`).toEqual([]);
}
test.beforeAll(async () => {
  await ล้าง();
  // สาขา "HQ" ใช้ร่วมกับ territory-multi-dealer.spec.ts ที่รันขนานกัน — สร้างแบบไม่ชน (มีแล้วข้าม) และไม่ลบตอนจบ
  const สาขาHQ = await admin.from("dealers").upsert({ code: "HQ", name: "สำนักงานใหญ่ (ทดสอบ)", province: "กรุงเทพมหานคร", region: "กลาง", status: "active" },
    { onConflict: "code", ignoreDuplicates: true });
  if (สาขาHQ.error) throw new Error(สาขาHQ.error.message);
  // ลำพูน = จังหวัดที่มี 2 สาขาดูแล (ใบ 0214: จังหวัดเดียวมีหลายดีลเลอร์ได้) — สาขาทดสอบ 2 สาขา จังหวัดเดียวกัน
  for (const code of สาขาลำพูน) await สร้างสาขาของชุด(code, "ลำพูน");
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

test("[H6] [hq] /hq/leads ไม่มีการ์ดโอนแล้ว · โอนที่ฐาน: ยืนยันเป็นชุด (ดีลเลอร์รายเดียว) · เลือกเองเมื่อทับซ้อน · ไม่มีจังหวัดไม่โอน", async ({ page }) => {
  const errs = watchErrors(page);
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await page.goto(`${HQ_ORIGIN}/hq/leads`, { waitUntil: "domcontentloaded" });
  // หน้าโหลดรายชื่อเสร็จ แล้วการ์ดโอนต้องไม่อยู่ (ตกบนโค้ดเดิม: การ์ดขึ้นเพราะมีลูกค้าเป้าหมายใต้ HQ ของข้อ)
  await expect(page.locator("[data-lead-table]")).toHaveAttribute("data-ready", "1", { timeout: 30_000 });
  await expect(page.locator(".card").filter({ hasText: "โอนลูกค้าเป้าหมายของ HQ ให้ดีลเลอร์" }), "เอาการ์ดโอนออกแล้ว (บอสสั่ง 18 พ.ย. 69)").toHaveCount(0);

  const hq = await db(ADMIN);
  // แผนการโอน: ระยอง (สาขาเดียว) = โอนอัตโนมัติ · ลำพูน (2 สาขา) = HQ เลือกเอง ระบบไม่เลือกให้ · ไม่มีจังหวัด = โอนไม่ได้
  const { data: แผน, error: e0 } = await hq.rpc("hq_lead_transfer_plan");
  expect(e0?.message ?? "").toBe("");
  const แถว = (p: string) => (แผน as { province: string; mode: string; dealer_codes: string[] }[]).find(r => r.province === p);
  expect([แถว("ระยอง")?.mode, แถว("ระยอง")?.dealer_codes], "ระยอง = โอนอัตโนมัติให้ RYG").toEqual(["auto", ["RYG"]]);
  expect([แถว("ลำพูน")?.mode, แถว("ลำพูน")?.dealer_codes], "ลำพูน หลายสาขา = HQ เลือกเอง").toEqual(["choose", [...สาขาลำพูน]]);
  expect(แถว("")?.mode, "ไม่มีจังหวัด = โอนไม่ได้").toBe("queue");
  // ยังไม่เลือกสาขา/เลือกสาขาที่ไม่ได้ดูแล = ไม่โอน
  const ผิดสาขา = await hq.rpc("transfer_hq_leads", { p_province: "ลำพูน", p_to: "RYG" });
  expect(ผิดสาขา.error?.message ?? "", "โอนให้สาขาที่ไม่ได้ดูแลจังหวัดไม่ได้").toMatch(/transfer_not_owner/);
  expect((await admin.from("leads").select("dealer_code").like("company", `${ป้าย}-ลำพูน`)).data?.map(r => r.dealer_code), "ยังไม่ถูกโอน").toEqual(["HQ"]);

  // 1) ยืนยันเป็นชุด
  const ชุด = await hq.rpc("transfer_hq_leads_auto");
  expect(ชุด.error?.message ?? "").toBe("");
  expect((await admin.from("leads").select("dealer_code").like("company", `${ป้าย}-ระยอง`)).data?.map(r => r.dealer_code)).toEqual(["RYG"]);
  const { data: ย้าย } = await admin.from("leads").select("num_id, note, activities").eq("dealer_code", "RYG").eq("company", `${ป้าย}-ระยอง`).single();
  expect(ย้าย!.note, "โน้ตย้ายตาม").toBe("โน้ตจาก HQ");
  expect(JSON.stringify(ย้าย!.activities), "ประวัติบอกว่ารับโอนจาก HQ").toContain("รับโอนจากสำนักงานใหญ่");
  const { data: นัด } = await admin.from("appointments").select("note").eq("dealer_code", "RYG").eq("lead_id", ย้าย!.num_id);
  expect(นัด?.map(a => a.note), "นัดหมายย้ายตาม").toEqual(["นัดดูหน้างาน"]);
  // RYG เห็นในฐานะเจ้าของ
  const { data: เห็น } = await (await db(RYG)).from("leads").select("company").eq("company", `${ป้าย}-ระยอง`);
  expect(เห็น?.length, "RYG เห็นลูกค้าเป้าหมายที่รับโอน").toBe(1);

  // 2) หลายสาขา — HQ เลือกสาขาที่ 2 เอง
  const เลือก = await hq.rpc("transfer_hq_leads", { p_province: "ลำพูน", p_to: "ZTLPB" });
  expect(เลือก.error?.message ?? "").toBe("");
  expect((await admin.from("leads").select("dealer_code").like("company", `${ป้าย}-ลำพูน`)).data?.map(r => r.dealer_code)).toEqual(["ZTLPB"]);

  // 3) ไม่มีจังหวัด ยังอยู่ที่ HQ (คำสั่งโอนปฏิเสธ)
  const ไม่มีจังหวัด = await hq.rpc("transfer_hq_leads", { p_province: "", p_to: "RYG" });
  expect(ไม่มีจังหวัด.error?.message ?? "", "ไม่มีจังหวัด = โอนไม่ได้").toMatch(/transfer_queue/);
  const { data: คิว } = await admin.from("leads").select("dealer_code").like("company", `${ป้าย}-ไม่มีจังหวัด`);
  expect(คิว?.map(r => r.dealer_code), "ไม่มีจังหวัด = ไม่ถูกโอน").toEqual(["HQ"]);
  assertNoErrors(errs, "หน้าลูกค้าเป้าหมายของ HQ");
});
