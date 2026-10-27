import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { ADMIN, skipReason } from "./supabaseEnv";
import { ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY } from "./adminEnv";
import { HQ_ORIGIN, loginUI, watchErrors, assertNoErrors } from "./funcHelpers";
import { settle } from "./helpers";

// ── หน้าตั้งค่า HQ: ทุกแท็บใช้เลย์เอาต์เดียวกัน (บอสสั่ง 27 ต.ค. 69 · ตั้งค่า › แม่แบบวัสดุ บนเว็บจริงเพี้ยน) ─────────────
//   วนทุกแท็บ: 1) เนื้อหาห่างขอบกรอบไม่น้อยกว่าแท็บอื่น  2) แท็บที่เลือกหน้าตาเดียวกันทุกแท็บ + วงโฟกัสไม่ถูกแถบแท็บตัดเหลือเส้นซ้ายขวา
//             3) แถบแท็บไม่มีแถบเลื่อนแนวตั้ง  4) หัวคอลัมน์จัดแนวเดียวกับข้อมูลในคอลัมน์ · แถวว่างอยู่กลางตาราง
//   ต้องตกบนโค้ดก่อนแก้ (aa72c1c): คำอธิบาย/ปุ่ม/การ์ดชิดขอบกรอบ (ห่าง 0) · หัวคอลัมน์กึ่งกลาง ข้อมูลชิดซ้าย · แถวว่างชิดซ้าย
//     · วงโฟกัสยื่นออก 2px ถูกตัด · แถบแท็บสูงเกิน 1px มีแถบเลื่อนแนวตั้ง
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(240_000);

const svc = createClient(ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const แท็ก = Date.now() % 100_000;
const วัสดุ = `ZZTEST-จัดหน้า-${แท็ก}`;
test.beforeAll(async () => {
  const r = await svc.from("material_templates").insert({ category: "ZZTEST", name: วัสดุ, unit: "ชุด", unit_price: 1000 });
  expect(r.error, "ใส่วัสดุทดสอบ 1 รายการ (ให้ตารางมีแถวข้อมูล)").toBeNull();
});
test.afterAll(async () => { await svc.from("material_templates").delete().eq("name", วัสดุ); });

type ผลแท็บ = { ห่างขอบ: number; ใกล้สุด: string; หน้าตาแท็บ: string; โฟกัสถูกตัด: boolean; แถบเลื่อนตั้ง: boolean; หัวไม่ตรง: string[] };

async function วัดแท็บ(page: Page): Promise<ผลแท็บ> {
  return page.evaluate(() => {
    const แถบ = document.querySelector<HTMLElement>(".tab-bar")!;
    const ที่เลือก = แถบ.querySelector<HTMLElement>(".tab-item.active")!;
    const cs = getComputedStyle(ที่เลือก);
    const หน้าตาแท็บ = [cs.borderLeftWidth, cs.borderRightWidth, cs.borderTopWidth, cs.borderBottomWidth, cs.borderBottomColor, cs.color, cs.backgroundColor, cs.fontWeight].join("|");
    // วงโฟกัส (กดคีย์บอร์ด) ต้องอยู่ในแถบแท็บทั้งวง — ยื่นออกนอกแนวตั้ง = ถูก overflow ตัดเหลือเส้นซ้าย-ขวา
    //   ยื่นออกนอกตัวแท็บ = ความหนาวง + ระยะห่าง (ระยะติดลบ = หดเข้าด้านใน) · ไม่มีวง = 0
    const ยื่น = cs.outlineStyle === "none" ? 0 : Math.max(0, parseFloat(cs.outlineWidth || "0") + parseFloat(cs.outlineOffset || "0"));
    const rt = ที่เลือก.getBoundingClientRect(), rb = แถบ.getBoundingClientRect();
    const โฟกัสถูกตัด = document.activeElement === ที่เลือก && (rt.top - ยื่น < rb.top - 0.5 || rt.bottom + ยื่น > rb.bottom + 0.5);
    // แถบเลื่อนแนวตั้งที่มองเห็น = เลื่อนแนวตั้งได้จริง (overflow-y ไม่ได้ซ่อน และเนื้อหาสูงเกิน) หรือมีแถบกินความกว้างของแถบแท็บ
    const csบ = getComputedStyle(แถบ);
    const แถบเลื่อนตั้ง = (!["hidden", "visible", "clip"].includes(csบ.overflowY) && แถบ.scrollHeight > แถบ.clientHeight)
      || แถบ.offsetWidth - แถบ.clientWidth - parseFloat(csบ.borderLeftWidth) - parseFloat(csบ.borderRightWidth) > 0;

    // ระยะจากขอบกรอบถึงเนื้อหาที่ใกล้ที่สุด (ข้อความ/ช่องกรอก/ปุ่ม) ทุกกรอบ .card ในส่วนเนื้อหาของแท็บ
    const ส่วน = document.querySelector<HTMLElement>(".section-stack")!;
    let ห่างขอบ = Infinity, ใกล้สุด = "";
    const มองเห็น = (el: Element) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden"; };
    for (const การ์ด of Array.from(ส่วน.querySelectorAll<HTMLElement>(".card"))) {
      if (!มองเห็น(การ์ด)) continue;
      const rc = การ์ด.getBoundingClientRect();
      const ใน = Array.from(การ์ด.querySelectorAll<HTMLElement>("*")).filter(el =>
        มองเห็น(el) && !el.closest(".table-wrap") && el.closest(".card") === การ์ด &&
        (["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(el.tagName) || Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent!.trim())));
      for (const el of ใน) {
        const r = el.getBoundingClientRect();
        const ห่าง = Math.min(r.left - rc.left, rc.right - r.right, r.top - rc.top);
        if (ห่าง < ห่างขอบ) { ห่างขอบ = ห่าง; ใกล้สุด = (el.textContent || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 40); }
      }
    }

    // หัวคอลัมน์จัดแนวเดียวกับข้อมูลในคอลัมน์ (แถวข้อมูลแถวแรก) · แถวว่าง (td colspan เต็มแถว) ต้องกึ่งกลาง
    const แนว = (s: string) => (s === "start" || s === "-webkit-left" ? "left" : s === "end" ? "right" : s.replace("-internal-", "").replace("-webkit-", ""));
    // ตำแหน่งเนื้อหาจริงในช่อง (วัดจากที่วาดบนจอ ไม่ใช่แค่ค่า text-align ของช่อง — ปุ่มที่จัดขวาด้วยกล่องข้างใน ก็นับว่าชิดขวา)
    //   ช่องกรอกที่กว้างเกือบเต็มช่อง = ใช้แนวตัวอักษรในช่องกรอก (ราคาชิดขวา) · อย่างอื่น = เทียบช่องว่างซ้าย/ขวาของเนื้อหา
    const ตำแหน่ง = (ช่อง: HTMLTableCellElement): string => {
      const cs = getComputedStyle(ช่อง), rc = ช่อง.getBoundingClientRect();
      const ใน = { l: rc.left + parseFloat(cs.paddingLeft), r: rc.right - parseFloat(cs.paddingRight) };
      const กรอก = ช่อง.querySelector<HTMLElement>("input:not([type=checkbox]), select, textarea");
      let ก: DOMRect;
      if (กรอก) {
        ก = กรอก.getBoundingClientRect();
        if (ก.width >= 0.8 * (ใน.r - ใน.l)) return แนว(getComputedStyle(กรอก).textAlign);
      } else {
        // ขอบเขตของเนื้อหาที่วาดจริง = รวมกรอบของตัวอักษรแต่ละก้อน + ไอคอน/ปุ่ม/รูป (ไม่ใช่กล่องห่อที่กว้างเต็มช่อง)
        let l = Infinity, r = -Infinity;
        const เดิน = (n: Node) => {
          if (n.nodeType === 3 && n.textContent!.trim()) { const rg = document.createRange(); rg.selectNodeContents(n); const x = rg.getBoundingClientRect(); if (x.width) { l = Math.min(l, x.left); r = Math.max(r, x.right); } return; }
          if (n.nodeType !== 1) return;
          const el = n as Element;
          if (["svg", "img", "BUTTON", "INPUT", "SELECT"].includes(el.tagName) || el.tagName.toLowerCase() === "svg") {
            const x = el.getBoundingClientRect(); if (x.width) { l = Math.min(l, x.left); r = Math.max(r, x.right); } return;
          }
          el.childNodes.forEach(เดิน);
        };
        เดิน(ช่อง);
        if (!Number.isFinite(l)) return "ว่าง";
        ก = new DOMRect(l, 0, r - l, 1);
      }
      const ซ้าย = ก.left - ใน.l, ขวา = ใน.r - ก.right;
      if (Math.abs(ซ้าย - ขวา) <= 6 && ซ้าย > 6) return "center";
      return ซ้าย <= ขวา ? "left" : "right";
    };
    const หัวไม่ตรง: string[] = [];
    for (const ตาราง of Array.from(ส่วน.querySelectorAll<HTMLTableElement>("table"))) {
      if (!มองเห็น(ตาราง)) continue;
      const หัว = Array.from(ตาราง.querySelectorAll<HTMLTableCellElement>("thead tr:last-child th"));
      for (const แถว of Array.from(ตาราง.querySelectorAll<HTMLTableRowElement>("tbody tr"))) {
        const ช่อง = Array.from(แถว.cells);
        if (ช่อง.length === 1 && ช่อง[0].colSpan > 1) {
          if (ตำแหน่ง(ช่อง[0]) !== "center") หัวไม่ตรง.push(`แถวว่าง "${ช่อง[0].textContent?.trim().slice(0, 30)}" ไม่อยู่กลางตาราง`);
          continue;
        }
        if (ช่อง.length !== หัว.length) continue;
        หัว.forEach((th, i) => {
          if (!th.textContent?.trim()) return;
          const a = ตำแหน่ง(th), b = ตำแหน่ง(ช่อง[i]);
          if (b !== "ว่าง" && a !== b) หัวไม่ตรง.push(`"${th.textContent.trim()}": หัว ${a} · ข้อมูล ${b}`);
        });
        break;
      }
    }
    return { ห่างขอบ: Math.round(ห่างขอบ), ใกล้สุด, หน้าตาแท็บ, โฟกัสถูกตัด, แถบเลื่อนตั้ง, หัวไม่ตรง };
  });
}

test("[ui·hq] ตั้งค่า: ทุกแท็บเลย์เอาต์เดียวกัน (ระยะขอบ · แท็บที่เลือก · ไม่มีแถบเลื่อนตั้ง · หัวคอลัมน์ตรงข้อมูล)", async ({ page }) => {
  const errs = watchErrors(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginUI(page, HQ_ORIGIN, "/hq/settings", ADMIN);
  await page.goto(`${HQ_ORIGIN}/hq/settings`, { waitUntil: "domcontentloaded" });
  await settle(page);
  const แท็บ = page.locator(".tab-bar .tab-item");
  await expect(แท็บ.first()).toBeVisible({ timeout: 20_000 });
  const ชื่อแท็บ = (await แท็บ.allInnerTexts()).map(s => s.trim());
  expect(ชื่อแท็บ, "มีแท็บแม่แบบวัสดุ").toContain("แม่แบบวัสดุ");

  const ผล: Record<string, ผลแท็บ> = {};
  for (const ชื่อ of ชื่อแท็บ) {
    await page.locator(".tab-bar .tab-item", { hasText: ชื่อ }).click();
    await settle(page);
    await page.waitForTimeout(400);
    if (ชื่อ === "แม่แบบวัสดุ") {
      // ตารางมีแถวข้อมูล (วัสดุทดสอบ) ก่อนวัดหัวคอลัมน์
      await expect(page.locator("table[aria-label='แม่แบบวัสดุ'] tbody tr").filter({ has: page.locator(`input[value="${วัสดุ}"]`) })).toHaveCount(1, { timeout: 20_000 });
    }
    // โฟกัสด้วยคีย์บอร์ด (วงโฟกัสแสดงจริง) แล้ววัด
    await page.keyboard.press("Shift+Tab"); await page.keyboard.press("Tab");
    ผล[ชื่อ] = await วัดแท็บ(page);
  }
  // แถวว่างของแท็บแม่แบบวัสดุ (ค้นสิ่งที่ไม่มี) ต้องอยู่กลางตาราง
  await page.locator(".tab-bar .tab-item", { hasText: "แม่แบบวัสดุ" }).click();
  await page.getByPlaceholder("ค้นชื่อ / หมวด / หน่วย").fill(`ZZ-ไม่มีจริง-${แท็ก}`);
  await expect(page.getByText("ไม่พบวัสดุที่ค้น")).toBeVisible({ timeout: 10_000 });
  const แถวว่าง = await วัดแท็บ(page);

  const อื่น = Object.entries(ผล).filter(([k]) => k !== "แม่แบบวัสดุ");
  const น้อยสุดของแท็บอื่น = Math.min(...อื่น.map(([, v]) => v.ห่างขอบ));
  const วัสดุ_ = ผล["แม่แบบวัสดุ"];
  // ตรวจครบทุกข้อในรอบเดียว (expect.soft) — เห็นทุกปัญหาพร้อมกัน ไม่หยุดที่ข้อแรก
  expect.soft(วัสดุ_.ห่างขอบ, `แม่แบบวัสดุ: เนื้อหาห่างขอบกรอบไม่น้อยกว่าแท็บอื่น (แท็บอื่นน้อยสุด ${น้อยสุดของแท็บอื่น}px · ใกล้สุด "${วัสดุ_.ใกล้สุด}")`).toBeGreaterThanOrEqual(น้อยสุดของแท็บอื่น);
  for (const [ชื่อ, v] of Object.entries(ผล)) {
    expect.soft(v.หน้าตาแท็บ, `แท็บ "${ชื่อ}" ที่เลือกหน้าตาเดียวกับแท็บแรก`).toBe(ผล[ชื่อแท็บ[0]].หน้าตาแท็บ);
    expect.soft(v.โฟกัสถูกตัด, `แท็บ "${ชื่อ}": วงโฟกัสอยู่ในแถบแท็บทั้งวง (ไม่ถูกตัดเหลือเส้นซ้ายขวา)`).toBe(false);
    expect.soft(v.แถบเลื่อนตั้ง, `แท็บ "${ชื่อ}": แถบแท็บไม่มีแถบเลื่อนแนวตั้ง`).toBe(false);
    expect.soft(v.หัวไม่ตรง, `แท็บ "${ชื่อ}": หัวคอลัมน์จัดแนวเดียวกับข้อมูล`).toEqual([]);
  }
  expect.soft(แถวว่าง.หัวไม่ตรง, "แม่แบบวัสดุ: แถวว่างอยู่กลางตาราง").toEqual([]);
  assertNoErrors(errs, "หน้าตั้งค่า HQ ทุกแท็บ");
});
