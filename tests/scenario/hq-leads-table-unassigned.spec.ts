import { test, expect } from "@playwright/test";
import { ADMIN, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { HQ_ORIGIN, loginUI, watchErrors, assertNoErrors } from "./funcHelpers";
import { adminClient } from "./testDealers";
import { รันSQLในฐาน } from "./localDb";
import { สร้างสาขาของข้อ, type สาขาของข้อ } from "./ownDealer";

// ── หน้า HQ ลูกค้าเป้าหมายทั้งเครือ (/hq/leads) · งานด่วน บอสสั่ง 18 พ.ย. 69 ─────────────────────────────────────────────────
// 1) ตารางแยกตามดีลเลอร์ (ตัวกลาง DrillEngine) ทั้งเครือขึ้นทุกดีลเลอร์ (เว็บจริง 154 แถว ส่วนใหญ่ 0) → แถบเปลี่ยนหน้าตัวกลางแสดงตลอด 10 แถว/หน้า ·
//    เรียงตั้งต้น = เปิดอยู่มาก→น้อย แถว 0 ทั้งแถวไปท้าย · กดหัวคอลัมน์เรียงได้เหมือนเดิม · ไม่ซ่อนแถว (ผลรวมทุกหน้า = จำนวนแถวทั้งหมด)
// 2) การ์ด "ลูกค้าเป้าหมายยังไม่มีผู้รับผิดชอบ" กดแล้ว = รายชื่อด้านล่างเหลือเฉพาะรายที่การ์ดนับ · จำนวนแถว = ตัวเลขบนการ์ด = นับที่ฐาน ·
//    อยู่ในที่อยู่หน้าเว็บ (?unassigned=1) รีเฟรชแล้วคงอยู่ · การ์ดไม่นับลีดใต้รหัส HQ (หน้านี้ไม่นับลีด HQ · บอสตัดสิน 30 ต.ค. 69)
// ข้อมูลของข้อ (ป้ายค้นของรอบนี้): สาขาของข้อ ก + ลีด HQ ป้ายเดียวกัน · เกณฑ์ตั้งต้น 48 ชม. (สาขาของข้อไม่ได้ตั้งเอง)
//   ก1 WAITING เข้ามา 10 วันก่อน ไม่มีผู้รับผิดชอบ · ก2 WAITING 5 วันก่อน ไม่มีผู้รับผิดชอบ → นับ
//   ก3 WAITING วันนี้ (ยังไม่เกินเกณฑ์) · ก4 10 วันก่อน มีผู้รับผิดชอบ · ก5 PAID 10 วันก่อน · HQ1 ใต้ HQ 10 วันก่อน → ไม่นับ
// ตกบนโค้ดเดิม: ตารางแยกตามดีลเลอร์ไม่มีแถบเปลี่ยนหน้า · การ์ดกดไม่ได้ (ไม่มีปุ่ม) และนับลีด HQ รวม (3 แทน 2)
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.setTimeout(150_000);

const admin = adminClient();
const ป้าย = `ZZUNAS${String(Date.now() % 100_000).padStart(5, "0")}`;
const เลข = 1_710_000_000 + Math.floor(Math.random() * 400_000) * 100;
let ก: สาขาของข้อ | null = null;
const วันไทย = (ms: number) => new Date(ms + 7 * 3_600_000).toISOString().slice(0, 10);
const วันก่อน = (n: number) => วันไทย(Date.now() - n * 86_400_000);

test.beforeAll(async () => {
  ก = await สร้างสาขาของข้อ({ จังหวัด: "ตราด", ภาค: "ตะวันออก" });
  // แถว "HQ" ใช้ร่วมกับไฟล์อื่น — สร้างแบบไม่ชน (มีแล้วข้าม) และไม่ลบตอนจบ (แบบเดียวกับ hq-leads-one-set.spec.ts)
  const สาขาHQ = await admin.from("dealers").upsert({ code: "HQ", name: "สำนักงานใหญ่ (ทดสอบ)", province: "กรุงเทพมหานคร", region: "กลาง", status: "active" },
    { onConflict: "code", ignoreDuplicates: true });
  if (สาขาHQ.error) throw new Error(สาขาHQ.error.message);
  const ลีด: [string, string, string, string, string | null][] = [
    // [สาขา, ชื่อ, สถานะ, วันเข้ามา, ผู้รับผิดชอบ]
    [ก.รหัส, "ก1", "WAITING", วันก่อน(10), null],
    [ก.รหัส, "ก2", "WAITING", วันก่อน(5), null],
    [ก.รหัส, "ก3", "WAITING", วันก่อน(0), null],
    [ก.รหัส, "ก4", "WAITING", วันก่อน(10), "ZZTEST พนักงานขาย"],
    [ก.รหัส, "ก5", "PAID", วันก่อน(10), null],
    ["HQ", "HQ1", "WAITING", วันก่อน(10), null],
  ];
  // วางที่ฐานตรง (ปิดตัวดัก) — ข้อนี้วัดการนับ/การแสดง ไม่ใช่ทางสร้างลีด
  const ผล = รันSQLในฐาน(`set local session_replication_role = replica;
    insert into public.leads (id, num_id, dealer_code, company, name, phone, province, source, status, assigned, created_date, last_contact_at) values
      ${ลีด.map(([c, ชื่อ, st, วัน, คน], i) => `('#L-${เลข + i}', ${เลข + i}, '${c}', '${ป้าย} บจก.ทดสอบ ${ชื่อ}', 'ZZTEST ผู้ติดต่อ', '000-000-${String(i).padStart(4, "0")}', 'ตราด', 'Facebook', '${st}', ${คน ? `'${คน}'` : "null"}, '${วัน}', '${วัน}')`).join(",\n      ")};
    set local session_replication_role = origin;`);
  if (ผล === null) throw new Error("ไม่พบฐานทดสอบในเครื่อง (docker) — วางลีดของข้อไม่ได้");
});
test.afterAll(async () => {
  รันSQLในฐาน(`set local session_replication_role = replica;
    delete from public.leads where company like '${ป้าย}%';
    set local session_replication_role = origin;`);
  await ก?.ลบ();
});

test("[hq] ตารางลูกค้าเป้าหมายแยกตามดีลเลอร์: แถบเปลี่ยนหน้า 10 แถว · เปิดอยู่มาก→น้อย แถว 0 ไปท้าย · กดหัวคอลัมน์เรียงได้", async ({ page }) => {
  const errs = watchErrors(page);
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await page.goto(`${HQ_ORIGIN}/hq/leads`, { waitUntil: "domcontentloaded" });
  // คำค้นคุมเฉพาะรายชื่อด้านล่าง (ตารางแยกตามดีลเลอร์ไม่ขึ้นกับคำค้น) — ใส่ไว้ตามกติกาหาแถวในหน้าที่แบ่งหน้า
  await page.getByPlaceholder("ค้นหาบริษัท / จังหวัด / ผู้รับผิดชอบ…", { exact: true }).fill(ป้าย);
  const กล่อง = page.locator('[data-drill-table="dealer"]');
  const แถว = กล่อง.locator("tbody tr").filter({ has: page.locator("[data-group-row]") });
  await expect(แถว).not.toHaveCount(0, { timeout: 45_000 });
  // แถบเปลี่ยนหน้าตัวกลางแสดงตลอด (ตกบนโค้ดเดิม: ไม่มี)
  const แถบ = กล่อง.getByText(/^แสดง \d[\d,]*–\d[\d,]* จาก \d[\d,]* แถว$/);
  await expect(แถบ, "แถบเปลี่ยนหน้าของตารางแยกตามดีลเลอร์").toBeVisible();
  const ทั้งหมด = Number((await แถบ.innerText()).match(/จาก ([\d,]+)/)![1].replace(/,/g, ""));
  expect(ทั้งหมด, "มีดีลเลอร์ของข้อ + ดีลเลอร์ตั้งต้น").toBeGreaterThan(1);
  await expect(แถว).toHaveCount(Math.min(10, ทั้งหมด));

  // ไล่ทุกหน้า: ไม่ซ่อนแถว (นับรวม = ทั้งหมด) · เรียงตั้งต้น เปิดอยู่มาก→น้อย และแถว 0 ทั้งแถวไม่อยู่ก่อนแถวที่มีตัวเลข
  type แถวอ่าน = { ชื่อ: string; เปิด: number; ศูนย์: boolean };
  const อ่านหน้า = () => แถว.evaluateAll(trs => trs.map(tr => {
    const ค่า = [...tr.querySelectorAll("[data-cell]")].map(td => Number(td.getAttribute("data-value") || 0));
    const เปิด = Number(tr.querySelector('[data-cell="open"]')?.getAttribute("data-value") || 0);
    return { ชื่อ: tr.querySelector("[data-group-row]")?.getAttribute("title") ?? "", เปิด, ศูนย์: ค่า.every(v => !(v > 0)) };
  }));
  const ทุกแถว: แถวอ่าน[] = [];
  const หน้า = Math.ceil(ทั้งหมด / 10);
  for (let i = 0; i < หน้า; i++) {
    if (i > 0) {
      await กล่อง.getByRole("button", { name: "หน้าถัดไป", exact: true }).click();
      await expect(กล่อง.getByText(`หน้า ${i + 1} / ${หน้า}`)).toBeVisible();
    }
    ทุกแถว.push(...await อ่านหน้า());
  }
  expect(ทุกแถว.length, "ทุกหน้ารวมกัน = จำนวนแถวทั้งหมด (ไม่ซ่อนแถว)").toBe(ทั้งหมด);
  expect(new Set(ทุกแถว.map(r => r.ชื่อ)).size, "ไม่มีแถวซ้ำข้ามหน้า").toBe(ทั้งหมด);
  const แรกที่ศูนย์ = ทุกแถว.findIndex(r => r.ศูนย์);
  if (แรกที่ศูนย์ >= 0) expect(ทุกแถว.slice(แรกที่ศูนย์).every(r => r.ศูนย์), `แถว 0 ทั้งแถวอยู่ท้ายตาราง: ${JSON.stringify(ทุกแถว)}`).toBe(true);
  const มีตัวเลข = ทุกแถว.filter(r => !r.ศูนย์).map(r => r.เปิด);
  expect(มีตัวเลข, "เรียงตั้งต้น: เปิดอยู่มาก→น้อย").toEqual([...มีตัวเลข].sort((a, b) => b - a));
  expect(ทุกแถว.some(r => r.ชื่อ.includes(ก!.รหัส) || r.ชื่อ.startsWith("ZZTEST")), "ดีลเลอร์ของข้ออยู่ในตาราง").toBe(true);

  // กดหัวคอลัมน์ยังเรียงได้ (ชื่อ ก→ฮ) · กลับหน้า 1
  await กล่อง.locator('button[data-sort="__name"]').click();
  await expect(กล่อง.locator('th[aria-sort="ascending"]')).toHaveCount(1);
  await expect(กล่อง.getByText(`หน้า 1 / ${หน้า}`), "เปลี่ยนการเรียง = กลับหน้าแรก").toBeVisible();
  assertNoErrors(errs, "ตารางแยกตามดีลเลอร์");
});

test("[hq] การ์ดยังไม่มีผู้รับผิดชอบ: กดแล้วรายชื่อเหลือเฉพาะรายที่นับ · จำนวน = การ์ด = ฐาน · รีเฟรชแล้วคงอยู่", async ({ page }) => {
  const errs = watchErrors(page);
  // นับที่ฐาน (กติกาเดียวกับการ์ด: ยังเปิด · ไม่มีผู้รับผิดชอบ · เกิน 48 ชม. นับเป็นวัน · ไม่นับลีดใต้ HQ)
  const นับฐาน = รันSQLในฐาน(`select count(*) from public.leads where company like '${ป้าย}%' and dealer_code <> 'HQ'
      and status not in ('PAID', 'CANCELLED') and (assigned is null or btrim(assigned) = '') and created_date is not null
      and ((now() at time zone 'Asia/Bangkok')::date - created_date) * 24 > 48;`);
  const ฐาน = Number(String(นับฐาน ?? "").match(/\d+/)?.[0] ?? NaN);
  expect(ฐาน, "ข้อมูลของข้อ: นับได้ 2 ราย (ก1 · ก2)").toBe(2);

  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await page.goto(`${HQ_ORIGIN}/hq/leads`, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("ค้นหาบริษัท / จังหวัด / ผู้รับผิดชอบ…", { exact: true }).fill(ป้าย);
  const การ์ด = page.locator('[data-card="unassigned"]');
  await expect(การ์ด, "การ์ดนับเท่าฐาน — ไม่นับลีดใต้ HQ").toContainText(new RegExp(`ยังไม่มีผู้รับผิดชอบ[\\s\\S]*\\b${ฐาน}\\b\\s*ราย`), { timeout: 30_000 });
  await การ์ด.locator("button").click();
  await expect(page).toHaveURL(/[?&]unassigned=1/);
  const ตาราง = page.locator("[data-lead-table]");
  await expect(ตาราง).toHaveAttribute("data-unassigned", "1");
  await expect(ตาราง).toHaveAttribute("data-ready", "1", { timeout: 30_000 });
  await expect(ตาราง, "จำนวนแถว = การ์ด = ฐาน").toHaveAttribute("data-total", String(ฐาน));
  const ชื่อ = ตาราง.locator("tbody tr").filter({ hasText: ป้าย });
  await expect(ชื่อ).toHaveCount(ฐาน);
  await expect(ชื่อ.filter({ hasText: "ก1" })).toHaveCount(1);
  await expect(ชื่อ.filter({ hasText: "ก2" })).toHaveCount(1);
  for (const ไม่ใช่ of ["ก3", "ก4", "ก5", "HQ1"]) await expect(ชื่อ.filter({ hasText: `ทดสอบ ${ไม่ใช่}` }), `${ไม่ใช่} ไม่อยู่ในรายชื่อ`).toHaveCount(0);
  await expect(page.locator("[data-unassigned-filter]")).toBeVisible();

  // รีเฟรช: ลิงก์คงอยู่ · รายชื่อยังกรองอยู่ · จำนวนแถว = ตัวเลขบนการ์ด (ทั้งเครือ ไม่มีคำค้นแล้ว)
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/[?&]unassigned=1/);
  await expect(ตาราง).toHaveAttribute("data-unassigned", "1", { timeout: 30_000 });
  await expect(ตาราง).toHaveAttribute("data-ready", "1", { timeout: 45_000 });
  const ตัวเลขการ์ด = Number((await การ์ด.locator("button").innerText()).match(/(\d[\d,]*)\s*ราย/)![1].replace(/,/g, ""));
  await expect(ตาราง, "หลังรีเฟรช: จำนวนแถว = ตัวเลขบนการ์ด").toHaveAttribute("data-total", String(ตัวเลขการ์ด));

  // เลิกกรอง = กลับรายชื่อปกติ และลิงก์ไม่มี unassigned
  await page.getByRole("button", { name: "เลิกกรองเฉพาะยังไม่มีผู้รับผิดชอบ", exact: true }).click();
  await expect(page).not.toHaveURL(/unassigned=1/);
  await expect(ตาราง).not.toHaveAttribute("data-unassigned", "1");
  assertNoErrors(errs, "การ์ดยังไม่มีผู้รับผิดชอบ");
});
