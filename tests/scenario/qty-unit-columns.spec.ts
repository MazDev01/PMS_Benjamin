import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { ADMIN, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { DEALER_ORIGIN, HQ_ORIGIN, db, loginUI } from "./funcHelpers";
import { settle } from "./helpers";
import { เตรียมใบHQ, ทำใบลูกค้าจากใบHQ, ล้างใบHQทดสอบ, เลขลูกค้าเป้าหมายทดสอบ, type ใบHQพร้อมใช้ } from "./hqQuoteFixture";
import { adminClient, กรอกข้อมูลบริษัททดสอบ } from "./testDealers";
import { สร้างสาขาของข้อ, type สาขาของข้อ } from "./ownDealer";

// ── ตารางรายการกลาง: จำนวน/หน่วยคนละคอลัมน์ · ตัวเลขชิดขวา · หัวคอลัมน์ตรงแนวข้อมูล (บอสสั่ง 30 ต.ค. 69) ─────────────────
//   เจอ: กล่องใบ HQ ในแผงลีดดีลเลอร์ขึ้น "38ตัน" "2,240ตร.ม." · หัวคอลัมน์ไม่ตรงข้อมูล (ตาราง class "table" ไม่มีสไตล์ → หัวกึ่งกลาง ช่องไม่มีระยะ)
//     ใบพิมพ์ A4 / หน้าใบเสนอราคา HQ รวมจำนวน+หน่วยเป็นช่องเดียว "38 ตัน"
//   ตรวจตำแหน่งจริงบนจอ (ไม่ใช่แค่ข้อความ) ทุกตารางรายการในทุกจุดที่ใช้ตารางกลาง:
//     กล่องใบ HQ · BOQ ของ HQ · ใบลูกค้า (แผงลีด · แผงดูใบ · ฟอร์มบวก %) · ราคาประเมินวัสดุ · ใบพิมพ์ A4 · แม่แบบวัสดุ
//   เกณฑ์ (ทุกคอลัมน์ ทุกแถวรายการของข้อ):
//     1) คอลัมน์: ลำดับ · รายการ · จำนวน · หน่วย (ถัดจากจำนวน) · … · ยอด  (แม่แบบวัสดุไม่ใช่รายการ — ตรวจเฉพาะแนว)
//     2) ตัวเลขทุกคอลัมน์ชิดขวา · ข้อความชิดซ้าย · หัวคอลัมน์ชิดแนวเดียวกับข้อมูลของคอลัมน์นั้น
//     3) จำนวนมีคั่นหลักพัน (2,240) · ตัวเลขไม่ตัดบรรทัด ไม่ถูกตัดเป็น … · เนื้อหาช่องติดกันห่างอย่างน้อย 12px (ไม่ใช่ "38ตัน")
//     4) ส่วนสรุป BOQ: "ราคาส่งดีลเลอร์ (ก่อน VAT)" ตัวหนา · ยอดชิดขวาใต้คอลัมน์ยอด
//     5) มือถือ: หน้าไม่ล้นจอ ตารางเลื่อนในกล่องตัวเอง
//   ข้อมูลของข้อ: สาขาของข้อ + ใบ HQ (เหล็ก 38 ตัน · หลังคา 2,240 ตร.ม.) + ใบลูกค้า + แม่แบบวัสดุ ZZTEST 2 รายการ
//   PMS_SHOTS=ก่อน|หลัง → ถ่ายรูปทุกตารางที่ตรวจไว้ที่ C:\.claude\pms-shots\qty-unit\<ก่อน|หลัง>\ (ถ่ายก่อนตรวจ — โค้ดเดิมตกก็ยังได้รูป)
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
// ข้อต่อข้อไม่พึ่งกัน (ข้อมูลของข้อสร้างใน beforeAll) — ไม่ใช้ serial: ข้อหนึ่งตกแล้วข้ออื่นยังได้ตรวจ/ถ่ายรูปครบทุกจุด
test.setTimeout(240_000);

const แท็ก = Date.now() % 100000;
const บริษัท = `ZZTEST-จำนวนหน่วย-${แท็ก}`;
const บริษัทขอราคา = `ZZTEST-จำนวนหน่วยขอราคา-${แท็ก}`;
const รายการ = [
  { name: "เหล็กโครงสร้างรูปพรรณ", qty: 38, unit: "ตัน", unitCost: 32_000, จำนวนบนจอ: "38" },
  { name: "แผ่นหลังคาเมทัลชีท", qty: 2240, unit: "ตร.ม.", unitCost: 350, จำนวนบนจอ: "2,240" },
];
const แม่แบบ = [
  { category: "ZZTEST", name: `ZZTEST เหล็กโครงสร้างรูปพรรณ ${แท็ก}`, unit: "ตัน", unit_price: 32000 },
  { category: "ZZTEST", name: `ZZTEST แผ่นหลังคาเมทัลชีท ${แท็ก}`, unit: "ตร.ม.", unit_price: 350 },
];
const svc = adminClient();
let สาขา: สาขาของข้อ, ใบHQ: ใบHQพร้อมใช้, เลขใบ = "", ไอดีแม่แบบ: number[] = [];
const เลขลีดขอราคา = เลขลูกค้าเป้าหมายทดสอบ();
test.beforeAll(async () => {
  สาขา = await สร้างสาขาของข้อ({ จังหวัด: "ตราด" });
  await กรอกข้อมูลบริษัททดสอบ(สาขา.รหัส);   // พิมพ์ใบได้ต้องมีข้อมูลบริษัทครบ
  ใบHQ = await เตรียมใบHQ(สาขา.บัญชี, { dealerCode: สาขา.รหัส, company: บริษัท, province: "ตราด",
    lines: รายการ.map(({ name, qty, unit, unitCost }) => ({ name, qty, unit, unitCost })) });
  เลขใบ = (await ทำใบลูกค้าจากใบHQ(สาขา.บัญชี, ใบHQ, { customer: บริษัท, markupPercent: 10, status: "sent_to_client" })).id;
  const t = await svc.from("material_templates").insert(แม่แบบ).select("id");
  expect(t.error, "ใส่แม่แบบวัสดุของข้อ").toBeNull();
  ไอดีแม่แบบ = (t.data ?? []).map(x => Number(x.id));
  const l = await (await db(สาขา.บัญชี)).from("leads").insert({ id: `#L-${เลขลีดขอราคา}`, num_id: เลขลีดขอราคา, dealer_code: สาขา.รหัส,
    company: บริษัทขอราคา, name: บริษัทขอราคา, contact: "ผู้ทดสอบ", phone: `08${String(เลขลีดขอราคา).slice(-8)}`, province: "ตราด", status: "BULLET" });
  expect(l.error, "ลูกค้าเป้าหมายสำหรับฟอร์มขอราคา").toBeNull();
});
test.afterAll(async () => {
  if (ใบHQ) ล้างใบHQทดสอบ(สาขา.รหัส, [ใบHQ.leadNum, เลขลีดขอราคา]);
  if (ไอดีแม่แบบ.length) await svc.from("material_templates").delete().in("id", ไอดีแม่แบบ);
  await สาขา?.ลบ();
});

type ผลตาราง = { ตาราง: string; หัว: string[]; ปัญหา: string[]; แถวที่ตรวจ: number };
/** วัดทุกตารางรายการบนหน้า (มีหัว "จำนวน" หรือเป็นตารางแม่แบบวัสดุ) · ตรวจเฉพาะแถวที่มีชื่อรายการของข้อ (ข้อความหรือค่าในช่องกรอก) */
async function วัด(page: Page, ชื่อรายการ: string[], คาดจำนวน: Record<string, string>) {
  return page.evaluate(({ ชื่อรายการ, คาดจำนวน }) => {
    const ตัวเลข = (s: string) => /\d/.test(s) && !/\p{L}/u.test(s.replace(/บาท/g, ""));
    // เนื้อหาที่วาดจริงในช่อง (ตัวอักษร/ช่องกรอก/ปุ่ม) → ขอบซ้าย-ขวา + แนวชิด (left/right/center)
    const เนื้อหา = (ช่อง: HTMLTableCellElement) => {
      const cs = getComputedStyle(ช่อง), rc = ช่อง.getBoundingClientRect();
      const ใน = { l: rc.left + parseFloat(cs.paddingLeft), r: rc.right - parseFloat(cs.paddingRight) };
      const ชิ้น: { l: number; r: number; top: number }[] = [];
      let ข้อความ = "";
      const เดิน = (n: Node) => {
        if (n.nodeType === 3 && n.textContent!.trim()) {
          ข้อความ += n.textContent;
          const rg = document.createRange(); rg.selectNodeContents(n);
          for (const x of Array.from(rg.getClientRects())) if (x.width) ชิ้น.push({ l: x.left, r: x.right, top: Math.round(x.top) });
          return;
        }
        if (n.nodeType !== 1) return;
        const el = n as HTMLElement;
        if (["INPUT", "SELECT", "BUTTON"].includes(el.tagName) || el.tagName.toLowerCase() === "svg") {
          if (el.tagName === "INPUT") ข้อความ += (el as HTMLInputElement).value;
          const x = el.getBoundingClientRect(); if (x.width) ชิ้น.push({ l: x.left, r: x.right, top: Math.round(x.top) }); return;
        }
        el.childNodes.forEach(เดิน);
      };
      เดิน(ช่อง);
      const l = Math.min(...ชิ้น.map(c => c.l)), r = Math.max(...ชิ้น.map(c => c.r));
      const กรอก = ช่อง.querySelector<HTMLInputElement>("input:not([type=checkbox]), select");
      let แนว: string;
      if (กรอก && กรอก.getBoundingClientRect().width >= 0.8 * (ใน.r - ใน.l)) {
        const a = getComputedStyle(กรอก).textAlign; แนว = a === "start" ? "left" : a === "end" ? "right" : a;
      } else if (!ชิ้น.length) แนว = "ว่าง";
      else {
        const ซ้าย = l - ใน.l, ขวา = ใน.r - r;
        แนว = Math.abs(ซ้าย - ขวา) <= 4 && ซ้าย > 4 ? "center" : ซ้าย <= ขวา ? "left" : "right";
      }
      return { ข้อความ: ข้อความ.trim(), l, r, แนว, บรรทัด: new Set(ชิ้น.map(c => c.top)).size, กรอก: !!กรอก };
    };
    const ออก: { ตาราง: string; หัว: string[]; ปัญหา: string[]; แถวที่ตรวจ: number }[] = [];
    for (const t of Array.from(document.querySelectorAll("table"))) {
      const หัวช่อง = Array.from(t.querySelectorAll<HTMLTableCellElement>("thead tr:last-child th"));
      const หัว = หัวช่อง.map(th => th.textContent?.trim() ?? "");
      const เป็นแม่แบบ = t.getAttribute("aria-label") === "แม่แบบวัสดุ";
      if (!หัว.includes("จำนวน") && !เป็นแม่แบบ) continue;
      const ชื่อ = t.getAttribute("aria-label") || `ตาราง (${หัว.join(" · ")})`;
      const ปัญหา: string[] = [];
      const iจ = หัว.indexOf("จำนวน");
      if (!เป็นแม่แบบ) {
        if (หัว[0] !== "ลำดับ" || หัว[1] !== "รายการ") ปัญหา.push(`คอลัมน์แรกต้องเป็น "ลำดับ · รายการ" ได้ "${หัว.slice(0, 2).join(" · ")}"`);
        if (หัว[iจ + 1] !== "หน่วย") ปัญหา.push(`คอลัมน์ถัดจาก "จำนวน" ต้องเป็น "หน่วย" ได้ "${หัว[iจ + 1] ?? "ไม่มี"}"`);
        if (!หัว.some(h => /^ยอด/.test(h))) ปัญหา.push(`ไม่มีคอลัมน์ "ยอด" (${หัว.join(" · ")})`);
      }
      let แถวที่ตรวจ = 0;
      for (const tr of Array.from(t.querySelectorAll<HTMLTableRowElement>("tbody tr"))) {
        const ค่าทั้งแถว = (tr.textContent ?? "") + Array.from(tr.querySelectorAll("input")).map(i => i.value).join(" ");
        const ของข้อ = ชื่อรายการ.find(n => ค่าทั้งแถว.includes(n));
        if (!ของข้อ || tr.cells.length !== หัวช่อง.length) continue;
        // หัวคอลัมน์ต้องเห็นเต็ม (ไม่ถูกตัดเป็น … — เจอ "ลำ…" ที่ตาราง BOQ ของ HQ 30 ต.ค. 69)
        if (!แถวที่ตรวจ) หัวช่อง.forEach((th, i) => { if (หัว[i] && th.scrollWidth > th.clientWidth + 1) ปัญหา.push(`หัว "${หัว[i]}" ถูกตัด (ต้องการ ${th.scrollWidth}px มี ${th.clientWidth}px)`); });
        แถวที่ตรวจ++;
        const ช่อง = Array.from(tr.cells).map(เนื้อหา);
        ช่อง.forEach((c, i) => {
          const h = หัว[i] || `ช่อง ${i + 1}`;
          if (c.แนว === "ว่าง") return;
          const เลข = c.กรอก ? (tr.cells[i].classList.contains("num") || ตัวเลข(c.ข้อความ)) && !/\p{L}/u.test(c.ข้อความ) : ตัวเลข(c.ข้อความ);
          if (เลข && c.แนว !== "right") ปัญหา.push(`"${ของข้อ}" · ${h}: ตัวเลขต้องชิดขวา ได้ ${c.แนว} ("${c.ข้อความ}")`);
          if (เลข && !c.กรอก && c.บรรทัด > 1) ปัญหา.push(`"${ของข้อ}" · ${h}: ตัวเลขตัดบรรทัด ("${c.ข้อความ}")`);
          if (เลข && !c.กรอก && tr.cells[i].scrollWidth > tr.cells[i].clientWidth + 1) ปัญหา.push(`"${ของข้อ}" · ${h}: ตัวเลขถูกตัด ("${c.ข้อความ}")`);
          if (หัว[i]) {
            const ห = เนื้อหา(หัวช่อง[i]);
            if (ห.แนว !== c.แนว) ปัญหา.push(`"${ของข้อ}" · หัว "${h}" ชิด ${ห.แนว} แต่ข้อมูลชิด ${c.แนว}`);
            else if (!c.กรอก && c.แนว === "right" && Math.abs(ห.r - c.r) > 2) ปัญหา.push(`"${ของข้อ}" · หัว "${h}" ขอบขวาไม่ตรงข้อมูล (ห่าง ${Math.round(ห.r - c.r)}px)`);
            else if (!c.กรอก && c.แนว === "left" && Math.abs(ห.l - c.l) > 2) ปัญหา.push(`"${ของข้อ}" · หัว "${h}" ขอบซ้ายไม่ตรงข้อมูล (ห่าง ${Math.round(ห.l - c.l)}px)`);
          }
          if (i > 0 && ช่อง[i - 1].แนว !== "ว่าง") {
            const ห่าง = Math.round(c.l - ช่อง[i - 1].r);
            if (ห่าง < 12) ปัญหา.push(`"${ของข้อ}" · "${หัว[i - 1]}" กับ "${h}" ห่าง ${ห่าง}px (ต้อง ≥ 12)`);
          }
        });
        if (iจ >= 0) {
          const จ = ช่อง[iจ].ข้อความ, คาด = คาดจำนวน[ของข้อ];
          if (คาด && จ !== คาด && !(ช่อง[iจ].กรอก && จ.replace(/,/g, "") === คาด.replace(/,/g, ""))) ปัญหา.push(`"${ของข้อ}" · จำนวน = "${จ}" (ควร "${คาด}" ตัวเลขล้วนมีคั่นหลักพัน)`);
        }
      }
      ออก.push({ ตาราง: ชื่อ, หัว, ปัญหา, แถวที่ตรวจ });
    }
    return ออก;
  }, { ชื่อรายการ, คาดจำนวน }) as Promise<ผลตาราง[]>;
}
let ลำดับรูป = 0;
async function ถ่าย(page: Page, ชื่อ: string) {
  if (!process.env.PMS_SHOTS) return;
  const ที่ = path.join("C:/.claude/pms-shots/qty-unit", process.env.PMS_SHOTS);
  mkdirSync(ที่, { recursive: true });
  const ตาราง = page.locator("table").filter({ has: page.locator("thead th", { hasText: /^จำนวน$/ }) }).or(page.locator("table[aria-label='แม่แบบวัสดุ']"));
  const n = await ตาราง.count();
  for (let i = 0; i < n; i++) {
    const t = ตาราง.nth(i);
    if (!(await t.isVisible())) continue;
    await t.scrollIntoViewIfNeeded().catch(() => {});
    // ถ่ายกรอบรอบตาราง (รวมส่วนสรุป/ขอบ) — ถ้าหากรอบไม่ได้ ถ่ายตัวตาราง
    const กรอบ = t.locator("xpath=ancestor::*[contains(@class,'table-wrap') or contains(@class,'table-scroll') or @data-panel][1]");
    const เป้า = (await กรอบ.count()) ? กรอบ : t;
    await เป้า.screenshot({ path: path.join(ที่, `${String(++ลำดับรูป).padStart(2, "0")}-${ชื่อ}${n > 1 ? `-${i + 1}` : ""}.png`) }).catch(() => {});
  }
}
/** ตรวจทุกตารางรายการบนหน้า — ต้องเจอตารางที่มีแถวของข้ออย่างน้อย ขั้นต่ำ ตาราง และไม่มีปัญหาเลย */
async function ตรวจหน้า(page: Page, ที่ไหน: string, ชื่อ = รายการ.map(r => r.name), คาด = Object.fromEntries(รายการ.map(r => [r.name, r.จำนวนบนจอ])), ขั้นต่ำ = 1) {
  await expect.poll(async () => (await วัด(page, ชื่อ, คาด)).filter(t => t.แถวที่ตรวจ).length,
    { timeout: 20_000, message: `${ที่ไหน}: เห็นตารางรายการที่มีแถวของข้อ` }).toBeGreaterThanOrEqual(ขั้นต่ำ);
  await ถ่าย(page, ที่ไหน);
  for (const t of (await วัด(page, ชื่อ, คาด)).filter(x => x.แถวที่ตรวจ))
    expect.soft(t.ปัญหา, `${ที่ไหน} · ${t.ตาราง} (${t.หัว.join(" · ")})`).toEqual([]);
}
async function ไม่ล้นจอ(page: Page, ที่ไหน: string) {
  const ล้น = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect.soft(ล้น, `${ที่ไหน}: หน้าไม่ล้นจอแนวนอน`).toBeLessThanOrEqual(1);
}

async function เปิดแผงลีด(page: Page, company: string) {
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: "ตาราง" }).click().catch(() => {});
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(company);
  const แถว = page.locator("tbody tr").filter({ hasText: company }).first();
  await expect(แถว).toBeVisible({ timeout: 20_000 });
  await แถว.locator("td").first().click();
  await page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click();
}

test("[ui·dealer] กล่องใบ HQ · ใบลูกค้า (แผงลีด · แผงดูใบ · ฟอร์มบวก %) · ใบพิมพ์ A4 — ตัวเลขชิดขวา หัวตรงแนวข้อมูล จำนวน/หน่วยแยก", async ({ page, context }) => {
  await context.addInitScript(() => { window.print = () => {}; });
  await loginUI(page, DEALER_ORIGIN, "/login", สาขา.บัญชี);
  await เปิดแผงลีด(page, บริษัท);
  await ตรวจหน้า(page, "แผงลีด-ใบHQ-และใบลูกค้า");

  // แผงดูใบลูกค้า
  await page.locator(`[data-quote-item="${เลขใบ}"]`).getByTitle("ดู", { exact: true }).click({ timeout: 20_000 });
  await ตรวจหน้า(page, "แผงดูใบลูกค้า");

  // ใบพิมพ์ A4
  const [เอกสาร] = await Promise.all([context.waitForEvent("page"), page.getByRole("button", { name: "พิมพ์ PDF", exact: true }).click()]);
  await expect.poll(() => เอกสาร.content(), { timeout: 20_000, message: "หน้าพิมพ์ได้เอกสารจริง" }).not.toContain("กำลังเตรียมเอกสาร");
  await เอกสาร.setViewportSize({ width: 900, height: 1200 });
  await ตรวจหน้า(เอกสาร, "ใบพิมพ์-A4");
  await เอกสาร.close();

  // ฟอร์มทำใบให้ลูกค้าจากใบ HQ (ตั้ง % รายบรรทัด) — ปุ่มที่แถบขั้นต่อไป (ลีดที่ทำใบแล้วอาจไม่มีปุ่ม = ไม่มีฟอร์มให้ตรวจ)
  await เปิดแผงลีด(page, บริษัท);
  const ปุ่มทำใบ = page.getByRole("button", { name: /ทำใบให้ลูกค้า/ });
  if (await ปุ่มทำใบ.count()) {
    await ปุ่มทำใบ.first().click();
    await ตรวจหน้า(page, "ฟอร์มทำใบจากใบ-HQ");
  }
});

test("[ui·dealer] ราคาประเมินวัสดุตอนขอราคา — ตัวเลข/ช่องกรอกชิดขวา หัวตรงแนวข้อมูล จำนวน/หน่วยแยก", async ({ page }) => {
  await loginUI(page, DEALER_ORIGIN, "/login", สาขา.บัญชี);
  await เปิดแผงลีด(page, บริษัทขอราคา);
  await page.getByRole("status", { name: "ขั้นต่อไป" }).getByRole("button", { name: /ขอราคาจาก HQ/ }).click();
  const กล่อง = page.locator("[data-box='material-estimate']");
  await expect(กล่อง).toBeVisible({ timeout: 20_000 });
  for (const id of ไอดีแม่แบบ) await กล่อง.getByLabel("เลือกวัสดุ").selectOption(String(id));
  await กล่อง.getByLabel("จำนวนวัสดุ 1").fill("38");
  await กล่อง.getByLabel("จำนวนวัสดุ 2").fill("2240");
  await ตรวจหน้า(page, "ราคาประเมินวัสดุ", แม่แบบ.map(t => t.name), { [แม่แบบ[0].name]: "38", [แม่แบบ[1].name]: "2,240" });
});

test("[ui·hq] ตาราง BOQ ของใบ HQ ที่ส่งแล้ว + แม่แบบวัสดุ — ตัวเลขชิดขวา หัวตรงแนวข้อมูล · สรุปตัวหนาชิดขวาใต้ยอด", async ({ page }) => {
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await page.goto(`${HQ_ORIGIN}/hq/quote-requests?open=${ใบHQ.requestId}`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await ตรวจหน้า(page, "HQ-BOQ");
  // ส่วนสรุป: ป้าย "ราคาส่งดีลเลอร์ (ก่อน VAT)" ตัวหนา · ยอดชิดขวาใต้คอลัมน์ยอด
  const สรุป = await page.evaluate(() => {
    const t = document.querySelector<HTMLTableElement>("table[aria-label='รายการ BOQ']");
    const ป้าย = t ? Array.from(t.querySelectorAll<HTMLTableCellElement>("tfoot td")).find(td => td.textContent?.includes("ราคาส่งดีลเลอร์ (ก่อน VAT)")) : undefined;
    const ยอด = t?.querySelector<HTMLElement>("[data-testid='hq-quote-total']");
    const หัวยอด = t ? Array.from(t.querySelectorAll<HTMLTableCellElement>("thead th")).find(th => /^ยอด/.test(th.textContent?.trim() ?? "")) : undefined;
    const ขวา = (el?: Element | null) => { if (!el) return NaN; const rg = document.createRange(); rg.selectNodeContents(el); return rg.getBoundingClientRect().right; };
    return { หนา: ป้าย ? Number(getComputedStyle(ป้าย).fontWeight) : 0, ป้ายชิด: ป้าย ? getComputedStyle(ป้าย).textAlign : "ไม่มี",
      ห่างจากหัวยอด: Math.round(ขวา(ยอด) - ขวา(หัวยอด)) };
  });
  expect.soft(สรุป.หนา, "\"ราคาส่งดีลเลอร์ (ก่อน VAT)\" ตัวหนา").toBeGreaterThanOrEqual(700);
  expect.soft(สรุป.ป้ายชิด, "ป้ายสรุปชิดขวา").toBe("right");
  expect.soft(Math.abs(สรุป.ห่างจากหัวยอด), "ยอดรวมชิดขวาใต้คอลัมน์ยอด (ขอบขวาตรงหัว \"ยอด\")").toBeLessThanOrEqual(2);

  // ตั้งค่า › แม่แบบวัสดุ (ค้นแม่แบบของข้อ)
  await page.goto(`${HQ_ORIGIN}/hq/settings`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: "แม่แบบวัสดุ" }).click();
  await page.getByLabel("ค้นแม่แบบวัสดุ").fill(`${แท็ก}`);
  await ตรวจหน้า(page, "แม่แบบวัสดุ", แม่แบบ.map(t => t.name), {});
});

test("[ui·มือถือ] กล่องใบ HQ + ใบลูกค้าบนจอ 390px: หน้าไม่ล้นจอ ตารางเลื่อนในกล่องตัวเอง · ตัวเลขชิดขวา หัวตรงแนว", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginUI(page, DEALER_ORIGIN, "/login", สาขา.บัญชี);
  await เปิดแผงลีด(page, บริษัท);
  await ตรวจหน้า(page, "มือถือ-แผงลีด");
  await ไม่ล้นจอ(page, "มือถือ-แผงลีด");
  const เลื่อนได้ = await page.evaluate(() => Array.from(document.querySelectorAll("table")).filter(t => Array.from(t.querySelectorAll("thead th")).some(th => th.textContent?.trim() === "จำนวน"))
    .map(t => { for (let e = t.parentElement; e; e = e.parentElement) if (getComputedStyle(e).overflowX === "auto" || getComputedStyle(e).overflowX === "scroll") return true; return false; }));
  expect.soft(เลื่อนได้.length, "มือถือ: เห็นตารางรายการ").toBeGreaterThan(0);
  expect.soft(เลื่อนได้.every(Boolean), "มือถือ: ทุกตารางรายการเลื่อนแนวนอนในกล่องตัวเอง").toBe(true);
});
