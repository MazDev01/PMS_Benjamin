// ── การ์ด KPI ต้องเดินตามตัวกรองของหน้านั้น ๆ (บอสสั่ง 20 ส.ค. 69 · ยืนยันอีกครั้ง 27 ต.ค. 69 หลังย้ายการ์ดไปคิดที่ฐาน ใบ 0246) ──
//
// "ให้พวกนี้คุมได้ · ทำทุกหน้า" — เดิมการ์ดสรุปฝั่งดีลเลอร์คิดจากข้อมูลทั้งสาขาเสมอ
// เลือกจังหวัด/ผู้รับผิดชอบ/ช่องทาง แล้วตารางเปลี่ยน แต่ตัวเลขบนการ์ดนิ่งสนิท
// อ่านคู่กันแล้วขัดกันเอง ("กรองเหลือ 3 ราย แต่การ์ดบอก 16 ราย")
//
// วิธีตรวจ: เลือกจังหวัดที่ทำให้ตัวเลขต่างจากไม่กรองจริง (นับจากตารางในฐานตรง ๆ ไม่ผ่าน kpi_cards) แล้วรอให้การ์ดเป็นเลขนั้น
//   การ์ดที่ไม่เดินตามตัวกรองจะค้างที่เลขทั้งหมด = ตก · ไม่มีจังหวัดที่ทำให้เลขต่าง = ข้ามพร้อมเหตุผล (ไม่ผ่านเงียบ)
import { test, expect, type Page } from "@playwright/test";
import { ADMIN, skipReason, type Account } from "./supabaseEnv";
import { DEALER_ORIGIN, HQ_ORIGIN, db, loginUI } from "./funcHelpers";
import { settle } from "./helpers";
import { รันSQLในฐาน } from "./localDb";
import { สร้างสาขาของข้อ, type สาขาของข้อ } from "./ownDealer";

test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(180_000);

// ── ใช้สาขาของข้อเอง (คิวรอบหน้าข้อ 3 · 29 ต.ค. 69) ──
//   เดิมนับ RYG / ลีดทั้งเครือ (ข้อมูลตั้งต้นร่วม) — ข้ออื่นที่รันพร้อมกันเพิ่ม/ปิดลีดระหว่างนับฐานกับอ่านการ์ด → เลขขยับ
//   สาขาของข้อมีข้อมูล 2 จังหวัดที่รู้ค่า (ตราด · สกลนคร) → เลือกจังหวัดแล้วเลขต้องต่างจากทั้งหมดแน่นอน (ไม่ต้องข้าม)
//   หน้า HQ เลือกดีลเลอร์เป็นสาขานี้ก่อน แล้วค่อยเลือกจังหวัด
let สาขา: สาขาของข้อ;
const วันนี้ = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const ฐานเลข = 1_500_000_000 + Math.floor(Math.random() * 500_000) * 100;   // เลขแถวของรอบนี้ (ไม่ชนช่วงเลขตายตัวของไฟล์อื่น)
// ลีดเปิดอยู่ ตราด 3 · สกลนคร 4 (+ ปิดแล้ว 2 ไม่นับ) · ใบรอลูกค้าตอบ ตราด 1 · สกลนคร 2 (+ ร่าง 1 ไม่นับ) · ลูกค้า ตราด 2 · สกลนคร 3
const ลีด: [string, string][] = [["WAITING", "ตราด"], ["HQ_PRICING", "ตราด"], ["QUOTED", "ตราด"], ["PAID", "ตราด"],
  ["WAITING", "สกลนคร"], ["BULLET", "สกลนคร"], ["HQ_QUOTED", "สกลนคร"], ["QUOTED", "สกลนคร"], ["CANCELLED", "สกลนคร"]];
const ใบ: [string, string][] = [["sent_to_client", "ตราด"], ["sent_to_client", "สกลนคร"], ["sent_to_client", "สกลนคร"], ["draft", "ตราด"]];
const ลูกค้า = ["ตราด", "ตราด", "สกลนคร", "สกลนคร", "สกลนคร"];

test.beforeAll(async () => {
  สาขา = await สร้างสาขาของข้อ({ จังหวัด: "ตราด" });
  const c = สาขา.รหัส, ชื่อ = (x: string) => `'ZZTEST-ตามตัวกรอง-${c}-${x}'`;
  const ผล = รันSQLในฐาน(`set local session_replication_role = replica;
    insert into public.leads (id, num_id, dealer_code, company, name, phone, province, status, created_date) values
      ${ลีด.map(([st, pv], i) => `('#L-${ฐานเลข + i}', ${ฐานเลข + i}, '${c}', ${ชื่อ(`ลีด${i}`)}, 'ZZTEST', '000-000-${String(i).padStart(4, "0")}', '${pv}', '${st}', '${วันนี้}')`).join(",\n      ")};
    insert into public.customers (id, dealer_code, name, company, province, join_date) values
      ${ลูกค้า.map((pv, i) => `(${ฐานเลข + 20 + i}, '${c}', ${ชื่อ(`ลูกค้า${i}`)}, ${ชื่อ(`ลูกค้า${i}`)}, '${pv}', '${วันนี้}')`).join(",\n      ")};
    insert into public.quotations (id, dealer_code, customer, project, status, total_value, date, customer_id, province) values
      ${ใบ.map(([st, pv], i) => `('${c}-Q${i}', '${c}', ${ชื่อ(`ลูกค้า${i}`)}, 'ZZTEST', '${st}', 10000, '${วันนี้}', ${ฐานเลข + 20 + i}, '${pv}')`).join(",\n      ")};
    set local session_replication_role = origin;`);
  if (ผล === null) throw new Error("ไม่พบฐานทดสอบในเครื่อง (docker) — วางข้อมูลของสาขาไม่ได้");
});
test.afterAll(async () => { await สาขา.ลบ(); });

/** นับจากฐานตรง ๆ (count ที่ฐาน ไม่ดึงแถว — ไม่ติดเพดานแถวต่อคำขอ) · จังหวัด null = ไม่กรอง */
type ตัวนับ = (จังหวัด: string | null) => Promise<number>;
const ค่าการ์ด = (page: Page, kpi: string) => page.locator(`[data-kpi-row] [data-kpi="${kpi}"] [data-value]`).first();

async function ตรวจ(page: Page, kpi: string, นับ: ตัวนับ, ชื่อ: string, ควรทั้งหมด: number) {
  const ทั้งหมด = await นับ(null);
  expect(ทั้งหมด, `${ชื่อ}: ข้อมูลที่วางไว้ของสาขาของข้อ`).toBe(ควรทั้งหมด);
  await expect(ค่าการ์ด(page, kpi), `${ชื่อ}: ก่อนกรอง การ์ด = ทั้งหมดในฐาน`).toHaveAttribute("data-value", String(ทั้งหมด), { timeout: 25_000 });
  const ช่อง = page.getByLabel("ทุกจังหวัด").first();
  await expect(ช่อง).toBeVisible({ timeout: 20_000 });
  const ตัวเลือก = await ช่อง.evaluate(el => [...(el as HTMLSelectElement).options].map(o => o.value).filter(v => v && v !== "ALL"));
  // จังหวัดที่ทำให้เลขต่างจากทั้งหมด (เลือกตัวที่มีแถวมากสุด)
  const ผล = (await Promise.all(ตัวเลือก.map(async p => ({ จังหวัด: p, เลข: await นับ(p) })))).filter(x => x.เลข !== ทั้งหมด).sort((a, b) => b.เลข - a.เลข);
  test.skip(ผล.length === 0, `${ชื่อ}: ฐานทดสอบไม่มีจังหวัดที่ทำให้ตัวเลขต่างจากทั้งหมด`);
  await ช่อง.selectOption(ผล[0].จังหวัด);
  await expect(ค่าการ์ด(page, kpi), `${ชื่อ}: เลือก ${ผล[0].จังหวัด} แล้วการ์ดต้องนับเฉพาะที่กรอง (ไม่ใช่ทั้งหมด ${ทั้งหมด})`)
    .toHaveAttribute("data-value", String(ผล[0].เลข), { timeout: 20_000 });
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function ตัวนับของ(ใคร: Account, ตาราง: "leads" | "quotations" | "customers", กรอง: (q: any) => any): Promise<ตัวนับ> {
  const sb = await db(ใคร);
  return async จังหวัด => {
    let q = กรอง(sb.from(ตาราง).select("id", { count: "exact", head: true }));
    if (จังหวัด != null) q = q.eq("province", จังหวัด);
    const { count, error } = await q;
    expect(error?.message ?? "", `นับ ${ตาราง}`).toBe("");
    return count ?? 0;
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

test("[ui·dealer] หน้าลูกค้าเป้าหมาย: เลือกจังหวัดแล้วการ์ด \"ลีดที่เปิดอยู่\" ต้องเปลี่ยนตาม", async ({ page }) => {
  const นับ = await ตัวนับของ(สาขา.บัญชี, "leads", q => q.eq("dealer_code", สาขา.รหัส).not("status", "in", "(PAID,CANCELLED)"));
  await loginUI(page, DEALER_ORIGIN, "/login", สาขา.บัญชี);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await ตรวจ(page, "open", นับ, "ลีดที่เปิดอยู่", 7);
});

test("[ui·dealer] หน้าใบเสนอราคา: เลือกจังหวัดแล้วการ์ด \"รอลูกค้าตอบ\" ต้องเปลี่ยนตาม", async ({ page }) => {
  const นับ = await ตัวนับของ(สาขา.บัญชี, "quotations", q => q.eq("dealer_code", สาขา.รหัส).eq("status", "sent_to_client"));
  await loginUI(page, DEALER_ORIGIN, "/login", สาขา.บัญชี);
  await page.goto(`${DEALER_ORIGIN}/quotations`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await ตรวจ(page, "awaiting", นับ, "รอลูกค้าตอบ", 3);
});

test("[ui·dealer] หน้าลูกค้า: เลือกจังหวัดแล้วการ์ด \"ลูกค้าทั้งหมด\" ต้องเปลี่ยนตาม", async ({ page }) => {
  const นับ = await ตัวนับของ(สาขา.บัญชี, "customers", q => q.eq("dealer_code", สาขา.รหัส));
  await loginUI(page, DEALER_ORIGIN, "/login", สาขา.บัญชี);
  await page.goto(`${DEALER_ORIGIN}/customers`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await ตรวจ(page, "total", นับ, "ลูกค้าทั้งหมด", 5);
});

test("[ui·hq] หน้าลีดทั้งเครือ: เลือกจังหวัดแล้วการ์ด \"ลีดที่เปิดอยู่\" ต้องเปลี่ยนตาม (ตารางแบ่งหน้าที่ฐาน)", async ({ page }) => {
  const นับ = await ตัวนับของ(ADMIN, "leads", q => q.eq("dealer_code", สาขา.รหัส).not("status", "in", "(PAID,CANCELLED)"));
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await page.goto(`${HQ_ORIGIN}/hq/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  // เลือกดีลเลอร์เป็นสาขาของข้อ (การ์ดกับตารางเดินตามตัวกรองดีลเลอร์ · ใบ 0246) แล้วค่อยเลือกจังหวัด
  await page.getByLabel("ทุกดีลเลอร์", { exact: true }).selectOption(สาขา.รหัส);
  await ตรวจ(page, "open", นับ, "ลีดที่เปิดอยู่ของดีลเลอร์ที่เลือก", 7);
});
