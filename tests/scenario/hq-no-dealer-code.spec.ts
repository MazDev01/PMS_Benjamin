import { test, expect, type Page } from "@playwright/test";
import { ADMIN, skipReason } from "./supabaseEnv";
import { HQ_ORIGIN, loginUI, watchErrors, assertNoErrors } from "./funcHelpers";
import { settle } from "./helpers";
import { รันSQLในฐาน } from "./localDb";

// ── รหัสดีลเลอร์แสดงเฉพาะหน้า "ดีลเลอร์" (บอสสั่ง 6 พ.ย. 69) ─────────────────────────────────────────────────────────────
//   หน้าอื่นฝั่ง HQ ที่บอสระบุ แสดงแค่ชื่อดีลเลอร์: ภาพรวมยอดขาย · ลูกค้าเป้าหมายทั้งเครือ · ใบเสนอราคาทั้งเครือ · ลูกค้าทั้งเครือ · ผู้สนใจ · คำขอใบเสนอราคา
//   รวมตัวเลือกในตัวกรอง (ข้อความในช่องเลือก) · ชิปแถบระดับ · หัวกราฟ/ตาราง · แผงรายละเอียด/แผงที่มา
//   เลขเอกสารที่มีรหัสในเลข (Q-RYG-… · RYG-00012) ไม่ใช่ "รหัสดีลเลอร์ที่แสดงแยก" — ไม่นับ · ค้นหาด้วยรหัสยังได้ · ไฟล์ส่งออกคงรหัส (ไม่ตรวจที่นี่)
//   บอสตอบข้อ 2 (6 พ.ย. 69): แดชบอร์ด HQ · ใบค่าแฟรนไชส์ ก็ไม่มีรหัสเช่นกัน · ชื่อซ้ำ = "ชื่อ (รหัส)" เฉพาะคู่ที่ซ้ำ (ตัวกลางชื่อแสดงตัวเดียว)
//   ตกบนโค้ดก่อนแก้: ตัวเลือกดีลเลอร์ "RYG · ชื่อ" · ป้ายรหัสในตาราง · แผงรายละเอียดมีช่องรหัสดีลเลอร์ (ef-mut-nocode-oldcode.log)
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(240_000);

const รหัสทดสอบ = ["RYG", "CNX"];
/** รหัสที่แสดงแยกจากชื่อ (ชื่อดีลเลอร์ทดสอบมีรหัสอยู่ในชื่อเอง เช่น "ดีลเลอร์ทดสอบ RYG" — ไม่นับ):
 *   1) ช่อง/ป้ายที่ข้อความทั้งช่อง = รหัส (ชิป · ป้าย · ลิงก์ · ช่องในแผง)   2) "RYG · " / "RYG – " (รหัสนำหน้าชื่อ)   3) "(RYG)" · "ดีลเลอร์ RYG" ท้ายประโยค
 *   นับทั้งข้อความบนจอ + ข้อความในช่องเลือก · เลขเอกสาร (Q-RYG-… · RYG-00012) ไม่นับ */
async function รหัสที่เห็น(page: Page): Promise<string[]> {
  return page.evaluate((codes) => {
    const ผล: string[] = [];
    const ช่องเลือก = [...document.querySelectorAll("select option")].map(o => (o as HTMLOptionElement).text);
    const ทั้งหน้า = [document.body.innerText, ...ช่องเลือก].join("\n");
    for (const c of codes) {
      for (const el of document.querySelectorAll("body *")) {
        const h = el as HTMLElement;
        if (h.children.length === 0 && h.offsetParent !== null && h.textContent?.trim() === c) ผล.push(`${c}: ช่องที่มีแค่รหัส <${h.tagName.toLowerCase()}>`);
      }
      for (const m of ทั้งหน้า.matchAll(new RegExp(`(^|[^-A-Za-z0-9])(?<!ทดสอบ )${c}(\\s*[·–]\\s)|\\(${c}\\)|ดีลเลอร์ ${c}(?=$|\\s*[\\n?·])`, "gm")))
        ผล.push(`${c}: …${ทั้งหน้า.slice(Math.max(0, (m.index ?? 0) - 20), (m.index ?? 0) + 30).replace(/\s+/g, " ")}…`);
    }
    return ผล;
  }, รหัสทดสอบ);
}

test("[ui·hq] รหัสดีลเลอร์: หน้าดีลเลอร์มีรหัส · 6 หน้าที่บอสระบุไม่มีรหัสที่แสดงแยก (ตาราง · ตัวกรอง · แถบระดับ · แผง)", async ({ page }) => {
  const errs = watchErrors(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);

  await page.goto(`${HQ_ORIGIN}/hq/dealers`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await expect(page.getByText("RYG", { exact: true }).first(), "หน้าดีลเลอร์คงรหัสไว้").toBeVisible({ timeout: 25_000 });

  for (const path of ["/hq/pipeline", "/hq/leads", "/hq/quotations", "/hq/customers", "/hq/prospects", "/hq/quote-requests", "/hq/dashboard", "/hq/proposals"]) {
    await page.goto(`${HQ_ORIGIN}${path}`, { waitUntil: "domcontentloaded" });
    await settle(page);
    await expect.poll(() => รหัสที่เห็น(page), { timeout: 25_000, message: `${path}: ไม่มีรหัสดีลเลอร์ที่แสดงแยก` }).toEqual([]);
  }

  // เจาะลงระดับดีลเลอร์ (ภาพรวมยอดขาย + ลูกค้าเป้าหมายทั้งเครือ): ชิปแถบระดับ · หัวกราฟ/ตาราง · แผงที่มา = ชื่ออย่างเดียว
  for (const path of ["/hq/pipeline", "/hq/leads"]) {
    await page.goto(`${HQ_ORIGIN}${path}?dealer=RYG`, { waitUntil: "domcontentloaded" });
    await settle(page);
    await expect(page.locator('[data-crumbs] [data-crumb="dealer"]'), `${path}: เจาะลงดีลเลอร์ได้ด้วยรหัส`).toBeVisible({ timeout: 25_000 });
    await expect.poll(() => รหัสที่เห็น(page), { timeout: 25_000, message: `${path} ระดับดีลเลอร์: ไม่มีรหัส (แถบระดับ · หัวข้อ)` }).toEqual([]);
    await page.locator("[data-kpi-row] [data-kpi]").first().click();
    await expect(page.getByRole("dialog").first()).toBeVisible();
    await expect.poll(() => รหัสที่เห็น(page), { message: `${path} แผงที่มา: ไม่มีรหัส` }).toEqual([]);
  }
  assertNoErrors(errs, "ไม่มีรหัสดีลเลอร์");
});

// ชื่อซ้ำ 2 ราย (บอสตอบข้อ 3): ตัวเลือก/ตารางต้องเห็น "ชื่อ (รหัส)" เฉพาะคู่นั้น — รายอื่นชื่ออย่างเดียว
test.describe("ชื่อดีลเลอร์ซ้ำ", () => {
  const แท็ก = Date.now() % 100_000;
  const ชื่อซ้ำ = `ZZTEST ชื่อซ้ำ ${แท็ก}`;
  const รหัส = ["ZQA", "ZQB"];
  test.beforeAll(() => {
    รันSQLในฐาน(`set local session_replication_role = replica;
      delete from public.dealers where code in ('ZQA', 'ZQB');
      insert into public.dealers (code, name, province) values ('ZQA', '${ชื่อซ้ำ}', 'ระยอง'), ('ZQB', '${ชื่อซ้ำ}', 'ระยอง');`);
  });
  test.afterAll(() => { รันSQLในฐาน(`set local session_replication_role = replica; delete from public.dealers where code in ('ZQA', 'ZQB');`); });

  test("[ui·hq] ชื่อดีลเลอร์ซ้ำ = \"ชื่อ (รหัส)\" เฉพาะคู่ที่ซ้ำ (ตัวกรองภาพรวมยอดขาย · แดชบอร์ด)", async ({ page }) => {
    const errs = watchErrors(page);
    await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
    for (const path of ["/hq/pipeline", "/hq/dashboard"]) {
      await page.goto(`${HQ_ORIGIN}${path}`, { waitUntil: "domcontentloaded" });
      await settle(page);
      // แดชบอร์ด: ตัวเลือกดีลเลอร์เป็นเมนูเลื่อนลง (SelectFilter) — เปิดก่อนอ่านรายการ
      if (path === "/hq/dashboard") await page.getByRole("button", { name: /ทุกดีลเลอร์/ }).first().click();
      await expect.poll(async () => page.evaluate(() => [...document.querySelectorAll("select option, [role=option], [role=menuitemradio], button")].map(o => (o.textContent ?? "").trim())),
        { timeout: 25_000, message: `${path}: ตัวเลือกดีลเลอร์มีคู่ชื่อซ้ำพร้อมรหัสในวงเล็บ` })
        .toEqual(expect.arrayContaining(รหัส.map(c => `${ชื่อซ้ำ} (${c})`)));
      const มีวงเล็บรหัส = await page.evaluate(() => [...document.querySelectorAll("select option, [role=option], [role=menuitemradio], button")]
        .map(o => (o.textContent ?? "").trim()).filter(t => /\([A-Z]{2,5}\)$/.test(t)));
      expect(มีวงเล็บรหัส, `${path}: รหัสในวงเล็บเฉพาะคู่ที่ชื่อซ้ำ`).toEqual(expect.arrayContaining(รหัส.map(c => `${ชื่อซ้ำ} (${c})`)));
      expect(มีวงเล็บรหัส.length, `${path}: ไม่มีรายอื่นติดรหัส`).toBe(2);
    }
    assertNoErrors(errs, "ชื่อดีลเลอร์ซ้ำ");
  });
});
