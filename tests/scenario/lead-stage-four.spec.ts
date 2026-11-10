import { test, expect, type Page } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { skipReason, ADMIN } from "./supabaseEnv";
import { DEALER_ORIGIN, HQ_ORIGIN, db, loginUI, watchErrors, assertNoErrors } from "./funcHelpers";
import { settle, กดยกเลิกในกล่องยืนยัน } from "./helpers";
import { สร้างสาขาของข้อ, type สาขาของข้อ } from "./ownDealer";
import { เตรียมใบHQ, ทำใบลูกค้าจากใบHQ, ล้างใบHQทดสอบ, type ใบHQพร้อมใช้ } from "./hqQuoteFixture";
import { ลากการ์ด } from "./boardDrag";
import { คอนเทนเนอร์ฐาน } from "./localDb";
import { psqlArgs } from "../../scripts/lib/testDbPsql.mjs";

// ── ยุบขั้นการขายของลีดเหลือ 4 ขั้น (บอสสั่ง 9 พ.ย. 69 · ใบ 0284) ─────────────────────────────────────────────────────
//   "ทำใบให้ลูกค้า" + "รอลูกค้าตอบ" = ขั้นเดียว "เสนอราคาลูกค้า" ทุกที่ · ป้ายย่อยบอก ทำใบแล้ว (ยังไม่ส่ง) / ส่งให้ลูกค้าแล้ว
//   1) [db] รันใบ 0284 จริงบนข้อมูลแบบเดิม (ลีดอยู่ 2 ขั้นเดิม · reached_step 5 · แม่แบบงานขั้น 5) แล้วตรวจว่าย้ายครบ · รันซ้ำได้
//   2) [ui·dealer] บอร์ด 4 คอลัมน์ + ปิด · แถบความคืบหน้า 4 ช่อง · ป้ายทำใบแล้ว/ส่งแล้ว · ไม่มีชื่อขั้นเดิม
//      ลาก ได้ใบ HQ → เสนอราคาลูกค้า = ฟอร์มทำใบ · ลากใบร่างไปปิดสำเร็จ = ฟอร์มส่งใบก่อน (ยกเลิก = อยู่ที่เดิม · บอสตอบ 9 พ.ย. 69 ข้อ 1 ข)
//   3) [ui·hq] ลีดทั้งเครือ: ตัวกรอง/ตาราง/กราฟ/คอลัมน์เจาะลึก ไม่มีชื่อขั้นเดิม · คอลัมน์ "เสนอราคาลูกค้า" นับทั้งขั้น (ข้อ 2 ก)
//   ต้องตกบนโค้ดก่อนยุบ: ไม่มีไฟล์ใบ 0284 · บอร์ดมีคอลัมน์ขั้น 5 · แถบ 5 ช่อง · ชื่อขั้นเดิมบนจอ
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(300_000);
test.describe.configure({ mode: "serial" });

const ใบ0284 = "supabase/migrations/0284_lead_stage_four.sql";
const ชื่อเดิม = /ทำใบให้ลูกค้า|รอลูกค้าตอบ/;

test("[db] ใบ 0284 รันจริงบนข้อมูลแบบเดิม: ลีด 2 ขั้นเดิม → เสนอราคาลูกค้า · reached_step 5 → 4 · แม่แบบงานขั้น 5 → 4 ตามลำดับเดิม · รันซ้ำได้", () => {
  const c = คอนเทนเนอร์ฐาน();
  test.skip(!c, "ต้องใช้ฐานทดสอบในเครื่อง (docker)");
  expect(existsSync(ใบ0284), "มีไฟล์ใบปรับฐาน 0284").toBe(true);
  const ใบ = readFileSync(ใบ0284, "utf8");
  // ข้อมูลแบบก่อนใบ 0284 (ปิดตัวดัก — ตัวกันใหม่ไม่รับขั้น 5): สาขา ZZST4 · ลีด 5 ราย · แม่แบบงานของ HQ แบบ 5 ขั้น
  const ตั้ง = `
set local session_replication_role = replica;
insert into dealers (code, name, province, region, status, revenue_target) values ('ZZST4', 'ZZTEST ยุบขั้น', 'ตราด', 'ตะวันออก', 'active', 0);
insert into leads (id, num_id, dealer_code, company, name, phone, province, status, created_date, reached_step) values
  ('#L-998401', 998401, 'ZZST4', 'ZZTEST ยุบ ทำใบ',  'ZZTEST', '000-000-8401', 'ตราด', 'HQ_QUOTED', current_date, 4),
  ('#L-998402', 998402, 'ZZST4', 'ZZTEST ยุบ รอตอบ', 'ZZTEST', '000-000-8402', 'ตราด', 'QUOTED',    current_date, 5),
  ('#L-998403', 998403, 'ZZST4', 'ZZTEST ยุบ ปฏิเสธ', 'ZZTEST', '000-000-8403', 'ตราด', 'CANCELLED', current_date, 5),
  ('#L-998404', 998404, 'ZZST4', 'ZZTEST ยุบ ได้ใบ',  'ZZTEST', '000-000-8404', 'ตราด', 'HQ_QUOTED', current_date, 1),
  ('#L-998405', 998405, 'ZZST4', 'ZZTEST ยุบ ใหม่',   'ZZTEST', '000-000-8405', 'ตราด', 'WAITING',   current_date, 1);
insert into quotations (id, dealer_code, customer, status, total_value, line_items, date, deal_id) values
  ('ZZST4-Q1', 'ZZST4', 'ZZTEST ยุบ ทำใบ',  'draft',          10000, '[]', current_date::text, 998401),
  ('ZZST4-Q2', 'ZZST4', 'ZZTEST ยุบ รอตอบ', 'sent_to_client', 20000, '[]', current_date::text, 998402),
  ('ZZST4-Q3', 'ZZST4', 'ZZTEST ยุบ ปฏิเสธ', 'lost',           30000, '[]', current_date::text, 998403);
update hq_sales_journey set tasks = '[
  {"key":"collect","label":"เก็บข้อมูลลูกค้า","step":1,"auto":true},{"key":"requirement","label":"สรุปความต้องการ","step":1,"auto":true},
  {"key":"appointment","label":"นัดหมาย","step":1,"auto":true},{"key":"requestQuote","label":"ส่งคำขอราคา","step":2,"auto":true},
  {"key":"hqQuote","label":"ได้ใบ HQ","step":3,"auto":true},{"key":"makeQuote","label":"จัดทำใบเสนอราคา","step":4,"auto":true},
  {"key":"zz4","label":"ZZTEST งานขั้น 4","step":4},{"key":"sendQuote","label":"ส่งใบเสนอราคา","step":5,"auto":true},
  {"key":"followCustomer","label":"ติดตามลูกค้า","step":5},{"key":"zz5","label":"ZZTEST งานขั้น 5","step":5}]'::jsonb where id = 1;
set local session_replication_role = origin;
create temp table ก่อน as select (select count(*) from leads where reached_step = 5) as r5;
do $$ begin
  if (select r5 from ก่อน) < 2 then raise exception 'FAIL: ข้อมูลแบบเดิมต้องมี reached_step 5 อย่างน้อย 2 แถว'; end if;
  if not exists (select 1 from hq_sales_journey j, jsonb_array_elements(j.tasks) e where j.id = 1 and e ->> 'step' = '5') then
    raise exception 'FAIL: แม่แบบงานแบบเดิมต้องมีขั้น 5'; end if;
end $$;`;
  const ตรวจ = (รอบ: string) => `
do $$
declare
  hq uuid := (select id from profiles where role = 'SUPER_ADMIN' and status = 'active' limit 1);
  j jsonb := (select tasks from hq_sales_journey where id = 1);
  หน้า jsonb; สรุป jsonb; ก jsonb; ด jsonb;
begin
  if lead_stage_no('ZZST4', 998401, 'HQ_QUOTED') <> 4 then raise exception 'FAIL ${รอบ}: ทำใบแล้วยังไม่ส่ง ต้องเป็นขั้น 4'; end if;
  if lead_stage_no('ZZST4', 998402, 'QUOTED') <> 4 then raise exception 'FAIL ${รอบ}: ส่งใบแล้ว (เดิมขั้น 5) ต้องเป็นขั้น 4'; end if;
  if lead_stage_no('ZZST4', 998404, 'HQ_QUOTED') <> 3 then raise exception 'FAIL ${รอบ}: ได้ใบ HQ ไม่มีใบร่าง ต้องคงขั้น 3'; end if;
  if exists (select 1 from leads where lead_stage_no(dealer_code, num_id, status) = 5) then raise exception 'FAIL ${รอบ}: ยังมีลีดขั้น 5'; end if;
  if exists (select 1 from leads where reached_step = 5) then raise exception 'FAIL ${รอบ}: ยังมี reached_step 5'; end if;
  if (select reached_step from leads where num_id = 998402 and dealer_code = 'ZZST4') <> 4
     or (select reached_step from leads where num_id = 998403 and dealer_code = 'ZZST4') <> 4 then raise exception 'FAIL ${รอบ}: reached_step 5 → 4'; end if;
  if exists (select 1 from leads where reached_step is distinct from _lead_reached_step(dealer_code, num_id)) then
    raise exception 'FAIL ${รอบ}: reached_step ทุกแถวต้องตรงตัวคิดใหม่'; end if;
  -- แม่แบบ: ขั้น 1–4 · งาน 2 ขั้นเดิมรวมที่ขั้น 4 เรียงตามลำดับเดิม
  if exists (select 1 from jsonb_array_elements(j) e where coalesce(e ->> 'step', '') !~ '^[1-4]$') then raise exception 'FAIL ${รอบ}: แม่แบบมีขั้นนอก 1–4 %', j; end if;
  if (select jsonb_agg(e ->> 'key' order by o) from jsonb_array_elements(j) with ordinality x(e, o) where e ->> 'step' = '4')
     <> '["makeQuote","zz4","sendQuote","followCustomer","zz5"]'::jsonb then raise exception 'FAIL ${รอบ}: ลำดับงานขั้น 4 %', j; end if;
  -- ตัวกันแม่แบบไม่รับขั้น 5 อีก
  begin
    update hq_sales_journey set tasks = tasks || '[{"key":"zz6","label":"ZZTEST ขั้น 5 ใหม่","step":5}]'::jsonb where id = 1;
    raise exception 'FAIL ${รอบ}: ตัวกันแม่แบบรับขั้น 5';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    if sqlerrm not like 'lead_tasks_invalid%1–4%' then raise exception 'FAIL ${รอบ}: ข้อความปฏิเสธ %', sqlerrm; end if;
  end;
  -- ตาราง/สรุป/การ์ด/เจาะลึก ของ HQ
  perform set_config('request.jwt.claims', json_build_object('sub', hq, 'role', 'authenticated', 'user_role', 'SUPER_ADMIN', 'dealer_code', '')::text, true);
  perform set_config('role', 'authenticated', true);
  หน้า := leads_page(50, 0, p_dealer_codes => array['ZZST4'], p_stage => 4);
  if (หน้า ->> 'total')::int <> 2 then raise exception 'FAIL ${รอบ}: leads_page ขั้น 4 ต้องได้ 2 ราย (ได้ %)', หน้า ->> 'total'; end if;
  if (leads_page(50, 0, p_dealer_codes => array['ZZST4'], p_stage => 5) ->> 'total')::int <> 0 then raise exception 'FAIL ${รอบ}: ไม่มีขั้น 5'; end if;
  if (leads_page(50, 0, p_dealer_codes => array['ZZST4'], p_stage => 0) ->> 'total')::int <> 4 then raise exception 'FAIL ${รอบ}: กำลังดำเนินการ = 4 ราย'; end if;
  สรุป := lead_summary(p_dealer_codes => array['ZZST4']);
  if (select jsonb_agg(jsonb_build_array((x ->> 'stage')::int, (x ->> 'count')::int) order by (x ->> 'stage')::int) from jsonb_array_elements(สรุป -> 'byStage') x)
     <> '[[1,1],[3,1],[4,2],[7,1]]'::jsonb then raise exception 'FAIL ${รอบ}: byStage %', สรุป -> 'byStage'; end if;
  ด := (select r from jsonb_array_elements(hq_drill('leads', current_date - 30, current_date) -> 'dealers') r where r ->> 'code' = 'ZZST4');
  if (ด ->> 'wait')::int <> 2 then raise exception 'FAIL ${รอบ}: เจาะลึก คอลัมน์เสนอราคาลูกค้า = 2 (ได้ %)', ด; end if;
  -- การ์ดหน้าลีดดีลเลอร์ = สาขาของผู้เรียก (auth_dealer จาก jwt) → สวมสิทธิ์ดีลเลอร์ ZZST4
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'user_role', 'DEALER_ADMIN', 'dealer_code', 'ZZST4')::text, true);
  ก := kpi_cards('dealer.leads');
  if (ก ->> 'quoteStage')::int <> 2 or (ก ->> 'hqQuotedNoDraft')::int <> 1 then raise exception 'FAIL ${รอบ}: การ์ดดีลเลอร์ %', ก; end if;
  perform set_config('role', 'postgres', true);
  raise notice 'ok ${รอบ}: ย้ายครบ';
end $$;`;
  // รันใบจริง 2 รอบ (รอบสองต้องไม่เปลี่ยนอะไร) แล้ว rollback ทั้งหมด
  const sql = `begin;\n${ตั้ง}\n${ใบ}\n${ตรวจ("รอบแรก")}\ncreate temp table หลังรอบแรก as select (select tasks from hq_sales_journey where id = 1) as t;\n${ใบ}\n${ตรวจ("รันซ้ำ")}
do $$ begin if (select t from หลังรอบแรก) is distinct from (select tasks from hq_sales_journey where id = 1) then raise exception 'FAIL: รันซ้ำแล้วแม่แบบเปลี่ยน'; end if; end $$;
select 'ALL PASS';\nrollback;`;
  const r = spawnSync("docker", [...psqlArgs(c), "-X", "-q", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8" });
  const ข้อความ = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
  console.log(ข้อความ.split(/\r?\n/).filter(l => /NOTICE|ALL PASS|ERROR/.test(l)).join("\n"));
  expect(ข้อความ, "ไม่มี ERROR").not.toMatch(/ERROR:/);
  expect(ข้อความ, "รอบแรกแปลงแม่แบบ 1 แถว").toMatch(/แม่แบบงาน HQ ขั้น 5 → ขั้น 4 1 แถว/);
  expect(ข้อความ, "รอบแรกแปลง reached_step").toMatch(/reached_step 5 → 4 [1-9]\d* แถว/);
  expect(ข้อความ, "รันซ้ำไม่แตะข้อมูล").toMatch(/แม่แบบงาน HQ ขั้น 5 → ขั้น 4 0 แถว[\s\S]*reached_step 5 → 4 0 แถว/);
  expect(ข้อความ).toMatch(/ALL PASS/);
  expect(r.status).toBe(0);
});

// ── หน้าจอ: สาขาของข้อ · ลีด 4 ราย (ข้อมูลลูกค้า · ได้ใบ HQ · ทำใบแล้ว · ส่งแล้ว) ──
let ส: สาขาของข้อ;
const ชื่อ = (x: string) => `ZZTEST ยุบขั้น ${ส.รหัส} ${x}`;
let ได้ใบ: ใบHQพร้อมใช้, ทำใบ: ใบHQพร้อมใช้, ส่งแล้ว: ใบHQพร้อมใช้;
let ใบร่างId = "";

test.describe("หน้าจอ 4 ขั้น", () => {
  test.beforeAll(async () => {
    ส = await สร้างสาขาของข้อ({ จังหวัด: "ตราด", ภาค: "ตะวันออก" });
    const sb = await db(ส.บัญชี);
    // ข้อมูลบริษัทผู้ออกใบครบ (ส่งใบให้ลูกค้าต้องครบ · ใบ 0247)
    expect((await sb.from("dealer_settings").upsert({ dealer_code: ส.รหัส, issuer: { company: "ZZTEST บริษัทยุบขั้น", address: "1 ถนนทดสอบ ตราด",
      phone: "000-000-0502", taxId: "0-0000-00000-00-0", email: "", website: "" } }, { onConflict: "dealer_code" })).error, "ผู้ออกใบ").toBeNull();
    const ใหม่ = await sb.from("leads").insert({ id: `#L-${997_840_000 + Math.floor(Math.random() * 9999)}`, num_id: 997_840_000 + Math.floor(Math.random() * 9999),
      dealer_code: ส.รหัส, company: ชื่อ("ใหม่"), name: ชื่อ("ใหม่"), contact: "คุณทดสอบ", phone: "000-000-8410", province: "ตราด", status: "WAITING" });
    expect(ใหม่.error, "สร้างลีดใหม่").toBeNull();
    const เส้น = [{ name: "ZZTEST โครงเหล็ก", qty: 10, unit: "ตร.ม.", unitCost: 1000 }];
    ได้ใบ = await เตรียมใบHQ(ส.บัญชี, { dealerCode: ส.รหัส, company: ชื่อ("ได้ใบ"), province: "ตราด", lines: เส้น });
    ทำใบ = await เตรียมใบHQ(ส.บัญชี, { dealerCode: ส.รหัส, company: ชื่อ("ทำใบ"), province: "ตราด", lines: เส้น });
    ใบร่างId = (await ทำใบลูกค้าจากใบHQ(ส.บัญชี, ทำใบ, { customer: ชื่อ("ทำใบ"), markupPercent: 10, status: "draft" })).id;
    ส่งแล้ว = await เตรียมใบHQ(ส.บัญชี, { dealerCode: ส.รหัส, company: ชื่อ("ส่งแล้ว"), province: "ตราด", lines: เส้น });
    const q = await ทำใบลูกค้าจากใบHQ(ส.บัญชี, ส่งแล้ว, { customer: ชื่อ("ส่งแล้ว"), markupPercent: 10, status: "draft" });
    const s = await sb.rpc("quotation_send", { p_dealer: ส.รหัส, p_id: q.id });
    expect(s.error?.message ?? "", "ส่งใบ").toBe("");
  });
  test.afterAll(async () => {
    // ใบ HQ ที่ส่งแล้ว/คำขอราคาลบตรงไม่ได้ (ฐานกัน) → ตัวล้างใบ HQ ของข้อทดสอบก่อน แล้วค่อยลบสาขา
    if (ส) ล้างใบHQทดสอบ(ส.รหัส, [ได้ใบ, ทำใบ, ส่งแล้ว].filter(Boolean).map(x => x.leadNum));
    await ส?.ลบ();
  });

  const เปิดลีด = async (page: Page) => {
    await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
    await settle(page);
    await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(`ZZTEST ยุบขั้น ${ส.รหัส}`);
  };

  test("[ui·dealer] บอร์ด 4 คอลัมน์ + ปิด · แถบ 4 ช่อง · ป้ายทำใบแล้ว/ส่งแล้ว · ไม่มีชื่อขั้นเดิม · ลากใบร่างไปปิดสำเร็จ = ฟอร์มส่งใบก่อน", async ({ page }) => {
    const errs = watchErrors(page);
    await page.setViewportSize({ width: 1700, height: 950 });
    await loginUI(page, DEALER_ORIGIN, "/login", ส.บัญชี);
    await เปิดลีด(page);

    // ตัวกรองขั้นตอน: ไม่มีชื่อขั้นเดิม
    const ตัวเลือก = await page.getByRole("combobox", { name: "ขั้นตอน", exact: true }).locator("option").allInnerTexts();
    expect(ตัวเลือก.join(" | "), "ตัวกรองขั้นตอนไม่มีชื่อขั้นเดิม").not.toMatch(ชื่อเดิม);

    // ตาราง: ป้ายย่อย + แถบ 4 ช่อง
    await page.getByRole("button", { name: "ตาราง" }).click().catch(() => {});
    const แถว = (x: string) => page.locator("tbody tr").filter({ hasText: ชื่อ(x) }).first();
    await expect(แถว("ส่งแล้ว")).toBeVisible({ timeout: 20_000 });
    await expect(แถว("ทำใบ").locator("[data-stage-label]")).toHaveText("เสนอราคาลูกค้า");
    await expect(แถว("ทำใบ").locator("[data-stage-sub]")).toHaveText("ทำใบแล้ว (ยังไม่ส่ง)");
    await expect(แถว("ส่งแล้ว").locator("[data-stage-label]")).toHaveText("เสนอราคาลูกค้า");
    await expect(แถว("ส่งแล้ว").locator("[data-stage-sub]")).toHaveText("ส่งให้ลูกค้าแล้ว");
    await expect(แถว("ได้ใบ").locator("[data-stage-sub]"), "ได้ใบ HQ ไม่มีป้ายย่อย").toHaveCount(0);
    for (const x of ["ใหม่", "ได้ใบ", "ทำใบ", "ส่งแล้ว"]) await expect(แถว(x).locator("[data-progress-cell]"), `${x}: แถบ 4 ช่อง`).toHaveCount(4);
    await expect(แถว("ทำใบ").locator("[data-progress]")).toHaveAttribute("data-progress", "100");
    await expect(แถว("ได้ใบ").locator("[data-progress]")).toHaveAttribute("data-progress", "75");
    await expect(page.locator("tbody"), "ตารางไม่มีชื่อขั้นเดิม").not.toContainText(ชื่อเดิม);

    // บอร์ด: คอลัมน์ 1 2 3 4 + ปิดสำเร็จ 6 + ปิดไม่สำเร็จ 7 (ไม่มีขั้น 5)
    await page.locator('button[title="บอร์ด"]').click();
    const บอร์ด = page.getByRole("region", { name: "บอร์ดลูกค้าเป้าหมาย" });
    await expect(บอร์ด).toBeVisible();
    expect(await บอร์ด.locator("[data-board-column]").evaluateAll(es => es.map(e => e.getAttribute("data-board-column"))), "คอลัมน์บอร์ด").toEqual(["1", "2", "3", "4", "6", "7"]);
    await expect(บอร์ด, "บอร์ดไม่มีชื่อขั้นเดิม").not.toContainText(ชื่อเดิม);
    const คอล4 = บอร์ด.locator('[data-board-column="4"]');
    await expect(คอล4, "หัวคอลัมน์").toContainText("เสนอราคาลูกค้า");
    await expect(คอล4.locator("[data-board-card]").filter({ hasText: ชื่อ("ทำใบ") }).locator("[data-stage-sub]")).toHaveText("ทำใบแล้ว (ยังไม่ส่ง)");
    await expect(คอล4.locator("[data-board-card]").filter({ hasText: ชื่อ("ส่งแล้ว") }).locator("[data-stage-sub]")).toHaveText("ส่งให้ลูกค้าแล้ว");
    await expect(บอร์ด.locator('[data-board-column="3"] [data-board-card]').filter({ hasText: ชื่อ("ได้ใบ") })).toHaveCount(1);

    // ลากใบร่าง (เสนอราคาลูกค้า) ไปปิดสำเร็จ = ฟอร์มส่งใบก่อน · ยกเลิก = การ์ดอยู่ที่เดิม ใบยังเป็นร่าง
    const การ์ดทำใบ = () => บอร์ด.locator("[data-board-card]").filter({ hasText: ชื่อ("ทำใบ") });
    await ลากการ์ด(page, การ์ดทำใบ(), บอร์ด.locator('[data-board-column="6"]'));
    await expect(page.getByRole("alertdialog"), "ลากไปปิดสำเร็จตอนยังไม่ส่ง = ฟอร์มส่งใบ").toContainText(`ส่งใบ ${ใบร่างId} ให้ลูกค้า`, { timeout: 25_000 });
    await กดยกเลิกในกล่องยืนยัน(page);
    await page.keyboard.press("Escape");
    await expect(บอร์ด.locator('[data-board-column="4"] [data-board-card]').filter({ hasText: ชื่อ("ทำใบ") }), "ยกเลิก = อยู่ที่เดิม").toHaveCount(1, { timeout: 15_000 });
    expect((await (await db(ส.บัญชี)).from("quotations").select("status").eq("id", ใบร่างId).eq("dealer_code", ส.รหัส).single()).data?.status, "ยกเลิก = ใบยังเป็นร่าง").toBe("draft");

    // ลาก ได้ใบ HQ → เสนอราคาลูกค้า = ฟอร์มทำใบจากใบ HQ
    await ลากการ์ด(page, บอร์ด.locator("[data-board-card]").filter({ hasText: ชื่อ("ได้ใบ") }), คอล4);
    await expect(page.getByRole("button", { name: "สร้างใบเสนอราคา" }).last(), "ลากเข้าเสนอราคาลูกค้า = ฟอร์มทำใบ").toBeVisible({ timeout: 25_000 });
    // แถบในแผงลีด 4 ขั้น ไม่มีชื่อขั้นเดิม
    await expect(page.getByRole("list", { name: "ขั้นตอนการขาย" }).locator("li")).toHaveText(["ข้อมูลลูกค้า", "ขอราคา HQ", /ได้ใบ HQ/, "เสนอราคาลูกค้า"].map(x => typeof x === "string" ? new RegExp(x) : x));
    assertNoErrors(errs, "บอร์ดลีด 4 ขั้น");
  });

  test("[ui·dealer] แดชบอร์ด: สัดส่วนดีลตามขั้นไม่มีชื่อขั้นเดิม", async ({ page }) => {
    await loginUI(page, DEALER_ORIGIN, "/login", ส.บัญชี);
    await page.goto(`${DEALER_ORIGIN}/dashboard`, { waitUntil: "domcontentloaded" });
    await settle(page);
    const โดนัท = page.locator("[data-deal-stage-chart]");
    await expect(โดนัท, "กราฟสัดส่วนดีลตามขั้น").toBeVisible({ timeout: 25_000 });
    await expect(โดนัท).toContainText("เสนอราคาลูกค้า");
    await expect(โดนัท).not.toContainText(ชื่อเดิม);
  });

  test("[ui·hq] ลีดทั้งเครือ: ตัวกรอง/ตาราง/กราฟ/เจาะลึกไม่มีชื่อขั้นเดิม · ป้ายทำใบแล้ว/ส่งแล้ว · คอลัมน์เสนอราคาลูกค้านับทั้งขั้น", async ({ page }) => {
    const errs = watchErrors(page);
    await page.setViewportSize({ width: 1600, height: 950 });
    await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
    await page.goto(`${HQ_ORIGIN}/hq/leads`, { waitUntil: "domcontentloaded" });
    await settle(page);
    // คอลัมน์ตารางเจาะลึกระดับทั้งเครือ: "เสนอราคาลูกค้า" (เดิม "รอลูกค้าตอบ") · ตัวเลขของคอลัมน์ตรวจที่ฐานในข้อ [db] (hq_drill)
    const เจาะ = page.locator("[data-drill-table]");
    await expect(เจาะ.locator("thead"), "หัวตารางเจาะลึก").toContainText("เสนอราคาลูกค้า", { timeout: 30_000 });
    await expect(เจาะ.locator("thead"), "หัวตารางเจาะลึกไม่มีชื่อขั้นเดิม").not.toContainText(ชื่อเดิม);
    await page.locator("[data-drill-scope]").getByLabel("ดีลเลอร์").selectOption(ส.รหัส);
    await expect(page.locator('[data-crumbs] [data-crumb="dealer"]')).toHaveText(ส.ชื่อ, { timeout: 25_000 });
    await page.getByPlaceholder("ค้นหาบริษัท / จังหวัด / ผู้รับผิดชอบ…").fill(`ZZTEST ยุบขั้น ${ส.รหัส}`);
    const ตาราง = page.locator("[data-lead-table][data-ready='1']");
    await expect(ตาราง).toBeVisible({ timeout: 25_000 });
    const แถว = (x: string) => ตาราง.locator("tbody tr").filter({ hasText: ชื่อ(x) }).first();
    await expect(แถว("ทำใบ").locator("[data-stage-label]")).toHaveText("เสนอราคาลูกค้า", { timeout: 20_000 });
    await expect(แถว("ทำใบ").locator("[data-stage-sub]")).toHaveText("ทำใบแล้ว (ยังไม่ส่ง)");
    await expect(แถว("ส่งแล้ว").locator("[data-stage-sub]")).toHaveText("ส่งให้ลูกค้าแล้ว");
    await expect(แถว("ได้ใบ").locator("[data-stage-label]")).toHaveText("ได้ใบ HQ");
    const ตัวเลือก = await page.getByLabel("ขั้นตอน", { exact: true }).first().locator("option").allInnerTexts();
    expect(ตัวเลือก.join(" | "), "ตัวกรองขั้นตอน HQ ไม่มีชื่อขั้นเดิม").not.toMatch(ชื่อเดิม);
    const กราฟ = page.locator("[data-stage-chart][data-ready='1']");
    await expect(กราฟ).toBeVisible({ timeout: 25_000 });
    expect(await กราฟ.locator("[data-stage]").evaluateAll(es => es.map(e => e.getAttribute("data-stage"))), "กราฟลีดตามขั้นตอน").toEqual(["1", "2", "3", "4", "6", "7"]);
    await expect(กราฟ.locator('[data-stage="4"]'), "ขั้นเสนอราคาลูกค้า = ทำใบแล้ว + ส่งแล้ว").toHaveAttribute("data-count", "2");
    await expect(page.locator("body"), "หน้าลีดทั้งเครือไม่มีชื่อขั้นเดิม").not.toContainText(ชื่อเดิม);
    // แผงลีด HQ: ขั้นตอน + ป้ายย่อย
    await แถว("ส่งแล้ว").click();
    await expect(page.locator(".side-drawer [data-stage-label]").first()).toHaveText("เสนอราคาลูกค้า", { timeout: 15_000 });
    // การ์ดขั้นตอน: ชื่อขั้นตัวใหญ่ · ขั้นย่อยบรรทัดเล็กใต้ (บอสสั่ง 10 พ.ย. 69 · เดิม "ชื่อขั้น · ขั้นย่อย" บรรทัดเดียว)
    const การ์ดขั้น = page.locator(".side-drawer [data-stat-value]").filter({ hasText: "เสนอราคาลูกค้า" }).locator("..");
    await expect(การ์ดขั้น.locator("[data-stat-value]"), "แผงลีด HQ: ชื่อขั้น").toHaveText("เสนอราคาลูกค้า");
    await expect(การ์ดขั้น.locator("[data-stat-sub]"), "แผงลีด HQ บอกส่งแล้ว (ขั้นย่อย)").toHaveText("ส่งให้ลูกค้าแล้ว");
    await expect(page.locator(".side-drawer")).not.toContainText(ชื่อเดิม);
    assertNoErrors(errs, "ลีดทั้งเครือ 4 ขั้น");
  });
});
