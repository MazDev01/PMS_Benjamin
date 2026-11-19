import { test, expect, type Locator } from "@playwright/test";
import { ADMIN, skipReason } from "./supabaseEnv";
import { HQ_ORIGIN, DEALER_ORIGIN, db, loginUI, watchErrors, assertNoErrors } from "./funcHelpers";
import { settle, แถวตามชื่อ } from "./helpers";
import { รันSQLในฐาน } from "./localDb";
import { สร้างสาขาของข้อ, type สาขาของข้อ } from "./ownDealer";
import { เวลาจากป้ายไทย } from "@pms/shared/lib/customerTimeline";

// ── แท็บ "ประวัติ" ในหน้าต่างลูกค้า = เส้นเวลาทุกงานของลูกค้า (บอสสั่ง 19 พ.ย. 69) ─────────────────────────────────────────
//   เหตุการณ์จริงที่ระบบบันทึก: เป็นลูกค้าเป้าหมาย · ขอราคาจาก HQ · ไทม์ไลน์ลีด (HQ ส่งใบ · ส่งใบให้ลูกค้า · ตอบรับ/ปฏิเสธ/ย้อน · บันทึกการติดต่อ)
//   · นัดหมาย · บันทึกของลูกค้า · เป็นลูกค้า — ใหม่สุดก่อน · ไม่มีวันที่ = ไม่แสดง · HQ + ดีลเลอร์ตัวกลางเดียว (CustomerTimeline)
//   ข้อมูลของข้อเอง (สาขาของข้อ): ลูกค้า 1 · งาน 2 (ผูกลูกค้า 1 · ผูกผ่านใบ 1) · บันทึกการติดต่อ 3 (นัดในไทม์ไลน์ 1 = ไม่นับ · ไม่มีวันที่ 1 = ไม่นับ)
//     · คำขอราคา 1 · นัดหมาย 2 (ไม่มีวันที่ 1 = ไม่นับ) · บันทึกของลูกค้า 1 · งานของสาขาอื่นเลขเดียวกัน (ต้องไม่ขึ้น)
//   จำนวนแต่ละชนิด = นับที่ฐานเอง (ไม่เรียกตัวประกอบของแอป)
//   ตกบนโค้ดเดิม (e506ce56): HQ แท็บประวัติแสดงแค่ "ปิดการขาย" ไม่มี [data-customer-timeline] · ดีลเลอร์ไม่มีแท็บประวัติ
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(180_000);
test.describe.configure({ mode: "serial" });

type ชนิด = "lead" | "request" | "activity" | "appointment" | "note" | "customer";
let คาด: Record<ชนิด, number>;
let สาขา: สาขาของข้อ, สาขาอื่น: สาขาของข้อ;
const ฐาน = 9_200_000 + Math.floor(Math.random() * 70_000) * 10;
let ชื่อลูกค้า = "";

test.beforeAll(async () => {
  สาขา = await สร้างสาขาของข้อ({ จังหวัด: "ตราด", ภาค: "ตะวันออก" });
  สาขาอื่น = await สร้างสาขาของข้อ({ จังหวัด: "ตราด", ภาค: "ตะวันออก" });
  const c = สาขา.รหัส, o = สาขาอื่น.รหัส;
  ชื่อลูกค้า = `ZZTEST เส้นเวลา ${c}`;
  const กิจกรรม = JSON.stringify([
    { id: 1, type: "call", icon: "phone", text: "โทรแนะนำบริษัท (ทดสอบ)", date: "2 ก.ย. 2569 · 10:00" },
    { id: 2, type: "meeting", icon: "meeting", text: "นัดดูหน้างาน (ซ้ำกับแถวนัด)", date: "3 ก.ย. 2569 · 10:00" },
    { id: 3, type: "doc", icon: "doc", text: "ส่งใบเสนอราคาให้ลูกค้า (ทดสอบ)", at: "2026-10-05T04:00:00Z" },
    { id: 4, type: "call", icon: "phone", text: "ไม่มีวันที่ (ทดสอบ)" },
  ]).replace(/'/g, "''");
  const ผล = รันSQLในฐาน(`set local session_replication_role = replica;
    insert into public.customers (id, dealer_code, name, company, province, join_date, created_at) values
      (${ฐาน}, '${c}', '${ชื่อลูกค้า}', '${ชื่อลูกค้า}', 'ตราด', '2026-10-20', '2026-10-20T03:00:00Z');
    insert into public.leads (id, num_id, dealer_code, company, name, phone, province, status, customer_id, created_at, activities) values
      ('#L-${ฐาน}', ${ฐาน}, '${c}', '${ชื่อลูกค้า}', '${ชื่อลูกค้า}', '000-000-0911', 'ตราด', 'PAID', ${ฐาน}, '2026-09-01T02:00:00Z', '${กิจกรรม}'::jsonb),
      ('#L-${ฐาน + 1}', ${ฐาน + 1}, '${c}', '${ชื่อลูกค้า}', '${ชื่อลูกค้า}', '000-000-0912', 'ตราด', 'PAID', null, '2026-11-01T02:00:00Z', '[]'::jsonb),
      ('#L-${ฐาน}', ${ฐาน}, '${o}', 'ZZTEST สาขาอื่น', 'ZZTEST สาขาอื่น', '000-000-0913', 'ตราด', 'WAITING', null, '2026-11-02T02:00:00Z', '[]'::jsonb);
    insert into public.quotations (id, dealer_code, customer, project, total, total_value, status, date, items, line_items, customer_id, deal_id) values
      ('Q-ZZTL-${ฐาน}', '${c}', '${ชื่อลูกค้า}', 'ZZTEST', '฿1', 1, 'won', '2026-11-05', 0, '[]', ${ฐาน}, ${ฐาน + 1});
    insert into public.quote_requests (request_no, dealer_code, lead_num_id, product, status, submitted_at, due_at) values
      ('ZZTL-${ฐาน}', '${c}', ${ฐาน}, 'โกดังเก็บสินค้า', 'quoted', '2026-09-10T02:00:00Z', '2026-09-24T02:00:00Z'),
      ('ZZTL-${ฐาน}-o', '${o}', ${ฐาน}, 'โกดังเก็บสินค้า', 'new', '2026-11-03T02:00:00Z', '2026-11-17T02:00:00Z');
    insert into public.appointments (id, dealer_code, lead_id, project, date, time, type, status, note) values
      (${ฐาน}, '${c}', ${ฐาน}, 'ZZTEST', '2026-10-20', '09:30', 'site_visit', 'done', ''),
      (${ฐาน + 1}, '${c}', ${ฐาน}, 'ZZTEST', '', '', 'call', 'scheduled', '');
    insert into public.customer_notes (dealer_code, customer_id, title, content, category, author, created_at) values
      ('${c}', ${ฐาน}, 'ZZTEST บันทึกเส้นเวลา', 'ทดสอบ', 'ลูกค้า', 'ZZTEST', '2026-11-12T05:00:00Z');
    set local session_replication_role = origin;`);
  if (ผล === null) throw new Error("ไม่พบฐานทดสอบในเครื่อง (docker) — วางข้อมูลของข้อไม่ได้");

  // นับที่ฐานเอง — งานของลูกค้า = ลีดที่ผูกลูกค้า + ลีดของใบที่ผูกลูกค้า (สาขาเดียวกัน)
  const sb = await db(ADMIN);
  const ใบ = ((await sb.from("quotations").select("deal_id").eq("dealer_code", c).eq("customer_id", ฐาน).not("deal_id", "is", null)).data ?? []) as { deal_id: number }[];
  const เลขใบ = new Set(ใบ.map(q => Number(q.deal_id)));
  const ลีด = (((await sb.from("leads").select("num_id, customer_id, created_at, activities").eq("dealer_code", c)).data ?? []) as
    { num_id: number; customer_id: number | null; created_at: string | null; activities: { type?: string; at?: string; date?: string; text?: string }[] | null }[])
    .filter(l => l.customer_id === ฐาน || เลขใบ.has(l.num_id));
  const เลข = ลีด.map(l => l.num_id);
  const คำขอ = ((await sb.from("quote_requests").select("submitted_at").eq("dealer_code", c).in("lead_num_id", เลข)).data ?? []) as { submitted_at: string | null }[];
  const นัด = ((await sb.from("appointments").select("date").eq("dealer_code", c).in("lead_id", เลข)).data ?? []) as { date: string | null }[];
  const บันทึก = ((await sb.from("customer_notes").select("created_at").eq("dealer_code", c).eq("customer_id", ฐาน)).data ?? []) as { created_at: string | null }[];
  คาด = {
    lead: ลีด.filter(l => l.created_at).length,
    activity: ลีด.flatMap(l => l.activities ?? []).filter(a => a.type !== "meeting" && String(a.text ?? "").trim() && (a.at || เวลาจากป้ายไทย(a.date))).length,
    request: คำขอ.filter(r => r.submitted_at).length,
    appointment: นัด.filter(a => /^\d{4}-\d{2}-\d{2}$/.test(String(a.date ?? ""))).length,
    note: บันทึก.filter(n => n.created_at).length,
    customer: 1,
  };
  // ค่าที่วางไว้ (กันข้อมูลลงไม่ครบแล้วผ่านหลอก)
  expect(คาด, "นับที่ฐานได้ตามข้อมูลที่วาง").toEqual({ lead: 2, activity: 2, request: 1, appointment: 1, note: 1, customer: 1 });
});
test.afterAll(async () => {
  รันSQLในฐาน(`set local session_replication_role = replica;
    delete from public.customer_notes where dealer_code = '${สาขา.รหัส}';
    delete from public.appointments where dealer_code = '${สาขา.รหัส}';
    delete from public.quote_requests where dealer_code in ('${สาขา.รหัส}', '${สาขาอื่น.รหัส}');
    delete from public.quotations where dealer_code = '${สาขา.รหัส}';
    delete from public.leads where dealer_code in ('${สาขา.รหัส}', '${สาขาอื่น.รหัส}');
    delete from public.customers where dealer_code = '${สาขา.รหัส}';
    set local session_replication_role = origin;`);
  await สาขา.ลบ(); await สาขาอื่น.ลบ();
});

async function ตรวจเส้นเวลา(แผง: Locator, ฝั่ง: string) {
  const เส้น = แผง.locator("[data-customer-timeline]");
  await expect(เส้น, `${ฝั่ง}: มีเส้นเวลาของลูกค้า`).toBeVisible({ timeout: 30_000 });
  const ทั้งหมด = Object.values(คาด).reduce((a, b) => a + b, 0);
  await expect(เส้น.locator("[data-timeline-event]"), `${ฝั่ง}: จำนวนเหตุการณ์ = นับที่ฐาน`).toHaveCount(ทั้งหมด);
  for (const [k, n] of Object.entries(คาด)) await expect(เส้น.locator(`[data-timeline-event="${k}"]`), `${ฝั่ง}: ${k} = ${n} (ฐาน)`).toHaveCount(n);
  const เวลา = await เส้น.locator("[data-timeline-event]").evaluateAll(es => es.map(e => Date.parse(e.getAttribute("data-at") ?? "")));
  expect(เวลา.every(t => Number.isFinite(t)), `${ฝั่ง}: ทุกเหตุการณ์มีวันที่`).toBe(true);
  expect(เวลา, `${ฝั่ง}: ใหม่สุดก่อน`).toEqual([...เวลา].sort((a, b) => b - a));
  await expect(เส้น, `${ฝั่ง}: นัดในไทม์ไลน์ลีดไม่ซ้ำกับแถวนัด`).not.toContainText("ซ้ำกับแถวนัด");
  await expect(เส้น, `${ฝั่ง}: งานของสาขาอื่นเลขเดียวกันไม่ขึ้น`).not.toContainText("ZZTL-" + ฐาน + "-o");
}

test("[ui·hq] หน้าต่างลูกค้า HQ แท็บประวัติ = เส้นเวลาทุกงาน นับตรงฐาน ใหม่สุดก่อน", async ({ page }) => {
  const errs = watchErrors(page);
  await loginUI(page, HQ_ORIGIN, "/hq/customers", ADMIN);
  await settle(page);
  await (await แถวตามชื่อ(page, `เปิดรายละเอียดลูกค้า ${ชื่อลูกค้า}`, ชื่อลูกค้า, /ค้นหาชื่อลูกค้า/)).click();
  const แผง = page.locator("[data-row-panel]").last();
  await expect(แผง).toBeVisible({ timeout: 20_000 });
  await แผง.locator("[data-panel-tab='timeline']").click();
  await ตรวจเส้นเวลา(แผง, "HQ");
  assertNoErrors(errs, "เส้นเวลาลูกค้า HQ");
});

test("[ui·ดีลเลอร์] หน้าต่างลูกค้าดีลเลอร์ แท็บประวัติ = เส้นเวลาชุดเดียวกับ HQ (ตัวกลางเดียว)", async ({ page }) => {
  const errs = watchErrors(page);
  await loginUI(page, DEALER_ORIGIN, "/customers", สาขา.บัญชี);
  await settle(page);
  await (await แถวตามชื่อ(page, `เปิดรายละเอียดลูกค้า ${ชื่อลูกค้า}`, ชื่อลูกค้า, /ค้นหาลูกค้า,/)).getByRole("button", { name: "ดูรายละเอียด", exact: true }).click();
  const แผง = page.locator("[data-row-panel]").last();
  await expect(แผง).toBeVisible({ timeout: 20_000 });
  await แผง.getByRole("button", { name: "ประวัติ", exact: true }).click();
  await ตรวจเส้นเวลา(แผง, "ดีลเลอร์");
  assertNoErrors(errs, "เส้นเวลาลูกค้า ดีลเลอร์");
});
