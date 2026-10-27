import { test, expect, type Page } from "@playwright/test";
import { RYG, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { DEALER_ORIGIN, db, loginUI } from "./funcHelpers";
import { adminClient } from "./testDealers";
import { settle } from "./helpers";
import { ล้างใบHQทดสอบ, เลขลูกค้าเป้าหมายทดสอบ } from "./hqQuoteFixture";

// ── ตารางเลือกวัสดุตอนขอราคา (ดีลเลอร์) ต้องเป็นตารางกลางและไม่เบียดกัน (บอสสั่ง 27 ต.ค. 69) ─────────────────────────
//   อาการบนเว็บจริง: ช่องหน่วยทับกับช่องจำนวน · ไอคอนถังขยะชิดยอดรวม
//   ตรวจทั้งจอกว้างและมือถือ: 1) ตารางกลาง (.table-wrap · colgroup ครบทุกคอลัมน์)  2) ช่องกรอก/ปุ่มไม่ล้นออกนอกช่องของตัวเอง
//     3) เนื้อหาช่องที่ติดกันห่างกันอย่างน้อย 12px (รวมถังขยะกับยอด)  4) หัวคอลัมน์จัดแนวเดียวกับข้อมูล  5) หน้าไม่เลื่อนแนวนอน
//     6) ตัวเลขเงินไม่ถูกตัดเป็น … (ยอดหลักล้าน)
//   ต้องตกบนโค้ดก่อนแก้ (ตารางเขียนเอง ไม่มี .table-wrap/colgroup · ช่องจำนวนล้นทับหน่วย · ถังขยะชิดยอด)
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.setTimeout(240_000);

const svc = adminClient();
const แท็ก = Date.now() % 100_000;
const เลข = เลขลูกค้าเป้าหมายทดสอบ();
const บริษัท = `ZZTEST-ตารางวัสดุ-${แท็ก}`;
// ชื่อยาว + หน่วยยาว = กรณีที่เบียดที่สุดที่ HQ ตั้งได้จริง (หน่วยพิมพ์เองได้ · ใบ 0244)
const วัสดุ = [
  { category: "ZZTEST", name: `ZZTEST ผนังเมทัลชีท 0.35 มม. สีขาวนวล พร้อมฉนวนกันความร้อน ${แท็ก}`, unit: "ตร.ม. (ตารางเมตร)", unit_price: 1234567.89 },
  { category: "ZZTEST", name: `ZZTEST ประตูม้วน ${แท็ก}`, unit: "ชุด", unit_price: 45000 },
];
let ไอดี: number[] = [];

test.beforeAll(async () => {
  const r = await svc.from("material_templates").insert(วัสดุ).select("id");
  expect(r.error, "ใส่วัสดุทดสอบ").toBeNull();
  ไอดี = (r.data ?? []).map(x => Number(x.id));
  const sb = await db(RYG);
  const l = await sb.from("leads").insert({ id: `#L-${เลข}`, num_id: เลข, dealer_code: "RYG", company: บริษัท, name: บริษัท,
    contact: "ผู้ทดสอบ", phone: `08${String(เลข).slice(-8)}`, province: "ระยอง", status: "BULLET" });
  expect(l.error, "ลูกค้าเป้าหมายทดสอบ").toBeNull();
});
test.afterAll(async () => {
  ล้างใบHQทดสอบ("RYG", [เลข]);
  await svc.from("material_templates").delete().in("id", ไอดี);
});

async function เปิดฟอร์มขอราคา(page: Page) {
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: "ตาราง" }).click().catch(() => {});
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(บริษัท);
  await page.locator("tbody tr").filter({ hasText: บริษัท }).first().getByRole("button", { name: "ดูรายละเอียด" }).first().click();
  await page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click();
  await page.getByRole("status", { name: "ขั้นต่อไป" }).getByRole("button", { name: /ขอราคาจาก HQ/ }).click();
  const กล่อง = page.locator("[data-box='material-estimate']");
  await expect(กล่อง).toBeVisible({ timeout: 20_000 });
  for (const id of ไอดี) await กล่อง.getByLabel("เลือกวัสดุ").selectOption(String(id));
  await expect(กล่อง.locator("[data-estimate-row]")).toHaveCount(2);
  return กล่อง;
}

type ผล = { ตารางกลาง: boolean; คอลัมน์: string; ล้น: string[]; ชิด: string[]; หัวไม่ตรง: string[]; เงินถูกตัด: string[]; ล้นหน้า: number };

async function วัด(page: Page): Promise<ผล> {
  return page.evaluate(() => {
    const ตาราง = document.querySelector<HTMLTableElement>("[data-box='material-estimate'] table")!;
    const หัว = Array.from(ตาราง.querySelectorAll<HTMLTableCellElement>("thead tr:last-child th"));
    const คอล = ตาราง.querySelectorAll("colgroup > col").length;
    const ตารางกลาง = !!ตาราง.closest(".table-wrap") && getComputedStyle(ตาราง).tableLayout === "fixed";
    const ล้น: string[] = [], ชิด: string[] = [], หัวไม่ตรง: string[] = [], เงินถูกตัด: string[] = [];
    // เนื้อหาที่วาดจริงในช่อง: ตัวอักษรแต่ละก้อน (ตัดตามกรอบช่องถ้าช่องซ่อนส่วนเกิน) + ช่องกรอก/ปุ่ม/ไอคอน (ห้ามล้น)
    const เนื้อหา = (ช่อง: HTMLTableCellElement) => {
      const cs = getComputedStyle(ช่อง), rc = ช่อง.getBoundingClientRect();
      const ใน = { l: rc.left + parseFloat(cs.paddingLeft), r: rc.right - parseFloat(cs.paddingRight) };
      const ตัด = cs.overflowX === "hidden" || cs.overflow === "hidden";
      let l = Infinity, r = -Infinity;
      const ชิ้น: { ชนิด: string; l: number; r: number }[] = [];
      const เดิน = (n: Node) => {
        if (n.nodeType === 3 && n.textContent!.trim()) {
          const rg = document.createRange(); rg.selectNodeContents(n); const x = rg.getBoundingClientRect();
          if (x.width) ชิ้น.push({ ชนิด: "ข้อความ", l: ตัด ? Math.max(x.left, ใน.l) : x.left, r: ตัด ? Math.min(x.right, ใน.r) : x.right });
          return;
        }
        if (n.nodeType !== 1) return;
        const el = n as Element;
        if (["BUTTON", "INPUT", "SELECT"].includes(el.tagName) || el.tagName.toLowerCase() === "svg") {
          const x = el.getBoundingClientRect(); if (x.width) ชิ้น.push({ ชนิด: el.tagName.toLowerCase(), l: x.left, r: x.right }); return;
        }
        el.childNodes.forEach(เดิน);
      };
      เดิน(ช่อง);
      for (const c of ชิ้น) { l = Math.min(l, c.l); r = Math.max(r, c.r); }
      return { ใน, ชิ้น, l, r, ตำแหน่ง: (() => {
        const กรอก = ช่อง.querySelector<HTMLElement>("input, select");
        if (กรอก && กรอก.getBoundingClientRect().width >= 0.8 * (ใน.r - ใน.l)) {
          const a = getComputedStyle(กรอก).textAlign; return a === "start" ? "left" : a === "end" ? "right" : a;
        }
        if (!Number.isFinite(l)) return "ว่าง";
        const ซ้าย = l - ใน.l, ขวา = ใน.r - r;
        if (Math.abs(ซ้าย - ขวา) <= 6 && ซ้าย > 6) return "center";
        return ซ้าย <= ขวา ? "left" : "right";
      })() };
    };
    const ชื่อหัว = (i: number) => หัว[i]?.textContent?.trim() || (หัว[i]?.getAttribute("aria-label") ?? `ช่อง ${i + 1}`);
    for (const [ri, แถว] of Array.from(ตาราง.querySelectorAll<HTMLTableRowElement>("tbody tr")).entries()) {
      const ช่อง = Array.from(แถว.cells).map(เนื้อหา);
      // ตัวเลข (ช่อง .num ที่ไม่ใช่ช่องกรอก) ต้องเห็นครบ — ถูกตัดเป็น … = อ่านยอดเงินผิด
      Array.from(แถว.cells).forEach((td, i) => {
        if (td.classList.contains("num") && !td.querySelector("input") && td.scrollWidth > td.clientWidth + 1)
          เงินถูกตัด.push(`แถว ${ri + 1} "${ชื่อหัว(i)}": ${td.textContent?.trim()} (ต้องการ ${td.scrollWidth}px มี ${td.clientWidth}px)`);
      });
      ช่อง.forEach((c, i) => {
        for (const x of c.ชิ้น) if (x.ชนิด !== "ข้อความ" && (x.l < c.ใน.l - 1 || x.r > c.ใน.r + 1))
          ล้น.push(`แถว ${ri + 1} "${ชื่อหัว(i)}": ${x.ชนิด} ล้นช่อง (${Math.round(x.l - c.ใน.l)} / ${Math.round(c.ใน.r - x.r)} px)`);
      });
      for (let i = 1; i < ช่อง.length; i++) {
        const ก = ช่อง[i - 1], ข = ช่อง[i];
        if (!Number.isFinite(ก.r) || !Number.isFinite(ข.l)) continue;
        const ห่าง = Math.round(ข.l - ก.r);
        if (ห่าง < 12) ชิด.push(`แถว ${ri + 1}: "${ชื่อหัว(i - 1)}" กับ "${ชื่อหัว(i)}" ห่าง ${ห่าง}px`);
      }
      if (ri === 0) หัว.forEach((th, i) => {
        if (!th.textContent?.trim() || !แถว.cells[i]) return;
        const a = เนื้อหา(th).ตำแหน่ง, b = ช่อง[i].ตำแหน่ง;
        if (b !== "ว่าง" && a !== b) หัวไม่ตรง.push(`"${th.textContent.trim()}": หัว ${a} · ข้อมูล ${b}`);
      });
    }
    return { ตารางกลาง, คอลัมน์: `${คอล}/${หัว.length}`, ล้น, ชิด, หัวไม่ตรง, เงินถูกตัด,
      ล้นหน้า: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
}

for (const จอ of [{ ชื่อ: "จอกว้าง", w: 1440, h: 900 }, { ชื่อ: "มือถือ", w: 390, h: 844 }]) {
  test(`[ui·dealer] ตารางเลือกวัสดุตอนขอราคา (${จอ.ชื่อ}): ตารางกลาง · ไม่ล้น · ไม่ชิดกัน · หัวตรงข้อมูล`, async ({ page }) => {
    await page.setViewportSize({ width: จอ.w, height: จอ.h });
    await loginUI(page, DEALER_ORIGIN, "/login", RYG);
    await เปิดฟอร์มขอราคา(page);
    const ผล = await วัด(page);
    expect.soft(ผล.ตารางกลาง, "ใช้ตารางกลาง (.table-wrap · table-layout: fixed)").toBe(true);
    expect.soft(ผล.คอลัมน์.split("/")[0], `colgroup ครบทุกคอลัมน์ (${ผล.คอลัมน์})`).toBe(ผล.คอลัมน์.split("/")[1]);
    expect.soft(ผล.ล้น, "ช่องกรอก/ปุ่ม/ไอคอนอยู่ในช่องของตัวเอง").toEqual([]);
    expect.soft(ผล.ชิด, "เนื้อหาช่องที่ติดกันห่างกันอย่างน้อย 12px").toEqual([]);
    expect.soft(ผล.หัวไม่ตรง, "หัวคอลัมน์จัดแนวเดียวกับข้อมูล").toEqual([]);
    expect.soft(ผล.เงินถูกตัด, "ตัวเลขเงินเห็นครบ ไม่ถูกตัดเป็น …").toEqual([]);
    expect.soft(ผล.ล้นหน้า, "หน้าไม่เลื่อนแนวนอน").toBeLessThanOrEqual(1);
  });
}
