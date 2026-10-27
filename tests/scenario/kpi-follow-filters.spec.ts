// ── การ์ด KPI ต้องเดินตามตัวกรองของหน้านั้น ๆ (บอสสั่ง 20 ส.ค. 69 · ยืนยันอีกครั้ง 27 ต.ค. 69 หลังย้ายการ์ดไปคิดที่ฐาน ใบ 0246) ──
//
// "ให้พวกนี้คุมได้ · ทำทุกหน้า" — เดิมการ์ดสรุปฝั่งดีลเลอร์คิดจากข้อมูลทั้งสาขาเสมอ
// เลือกจังหวัด/ผู้รับผิดชอบ/ช่องทาง แล้วตารางเปลี่ยน แต่ตัวเลขบนการ์ดนิ่งสนิท
// อ่านคู่กันแล้วขัดกันเอง ("กรองเหลือ 3 ราย แต่การ์ดบอก 16 ราย")
//
// วิธีตรวจ: เลือกจังหวัดที่ทำให้ตัวเลขต่างจากไม่กรองจริง (นับจากตารางในฐานตรง ๆ ไม่ผ่าน kpi_cards) แล้วรอให้การ์ดเป็นเลขนั้น
//   การ์ดที่ไม่เดินตามตัวกรองจะค้างที่เลขทั้งหมด = ตก · ไม่มีจังหวัดที่ทำให้เลขต่าง = ข้ามพร้อมเหตุผล (ไม่ผ่านเงียบ)
import { test, expect, type Page } from "@playwright/test";
import { ADMIN, RYG, skipReason } from "./supabaseEnv";
import { DEALER_ORIGIN, HQ_ORIGIN, db, loginUI } from "./funcHelpers";
import { settle } from "./helpers";

test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(180_000);

/** นับจากฐานตรง ๆ (count ที่ฐาน ไม่ดึงแถว — ไม่ติดเพดานแถวต่อคำขอ) · จังหวัด null = ไม่กรอง */
type ตัวนับ = (จังหวัด: string | null) => Promise<number>;
const ค่าการ์ด = (page: Page, kpi: string) => page.locator(`[data-kpi-row] [data-kpi="${kpi}"] [data-value]`).first();

async function ตรวจ(page: Page, kpi: string, นับ: ตัวนับ, ชื่อ: string) {
  const ทั้งหมด = await นับ(null);
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
async function ตัวนับของ(ใคร: typeof RYG, ตาราง: "leads" | "quotations" | "customers", กรอง: (q: any) => any): Promise<ตัวนับ> {
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
  const นับ = await ตัวนับของ(RYG, "leads", q => q.eq("dealer_code", "RYG").not("status", "in", "(PAID,CANCELLED)"));
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await ตรวจ(page, "open", นับ, "ลีดที่เปิดอยู่");
});

test("[ui·dealer] หน้าใบเสนอราคา: เลือกจังหวัดแล้วการ์ด \"รอลูกค้าตอบ\" ต้องเปลี่ยนตาม", async ({ page }) => {
  const นับ = await ตัวนับของ(RYG, "quotations", q => q.eq("dealer_code", "RYG").eq("status", "sent_to_client"));
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/quotations`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await ตรวจ(page, "awaiting", นับ, "รอลูกค้าตอบ");
});

test("[ui·dealer] หน้าลูกค้า: เลือกจังหวัดแล้วการ์ด \"ลูกค้าทั้งหมด\" ต้องเปลี่ยนตาม", async ({ page }) => {
  const นับ = await ตัวนับของ(RYG, "customers", q => q.eq("dealer_code", "RYG"));
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/customers`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await ตรวจ(page, "total", นับ, "ลูกค้าทั้งหมด");
});

test("[ui·hq] หน้าลีดทั้งเครือ: เลือกจังหวัดแล้วการ์ด \"ลีดที่เปิดอยู่\" ต้องเปลี่ยนตาม (ตารางแบ่งหน้าที่ฐาน)", async ({ page }) => {
  const นับ = await ตัวนับของ(ADMIN, "leads", q => q.neq("dealer_code", "HQ").not("status", "in", "(PAID,CANCELLED)"));
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await page.goto(`${HQ_ORIGIN}/hq/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await ตรวจ(page, "open", นับ, "ลีดทั้งเครือที่เปิดอยู่");
});
