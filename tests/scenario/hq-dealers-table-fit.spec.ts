import { test, expect } from "@playwright/test";
import { ADMIN, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { HQ_ORIGIN, loginUI, watchErrors, assertNoErrors } from "./funcHelpers";
import { settle } from "./helpers";
import { สร้างสาขาของข้อ, type สาขาของข้อ } from "./ownDealer";

// ── ตาราง HQ › ดีลเลอร์ (บอสสั่ง 13 พ.ย. 69) ─────────────────────────────────────────────────────────────
//   1) ไม่มีคอลัมน์ลำดับ  2) ชื่อดีลเลอร์แสดงเต็ม ไม่ตัด (ทับ 10 พ.ย. "ตัดด้วย … ชี้แล้วเห็นเต็ม")  3) แถวชิดขึ้น
//   4) ป้ายภูมิภาคแสดงเต็ม · คอลัมน์พอดีป้าย ไม่มีที่ว่างเกิน (วัดกับป้ายยาวสุด "ภาคตะวันออกเฉียงเหนือ")
//   กติกาตาราง: หัวบรรทัดเดียว · ไม่มีแถบเลื่อนแนวนอน · ที่จอ 1366 และ 1920
//   ข้อมูลของข้อ: สาขาของข้อชื่อยาว ภาคตะวันออกเฉียงเหนือ (ไม่พึ่งข้อมูลร่วม)
//   ตกบนโค้ดเดิม: มีหัว "ลำดับ" · ชื่อยาวถูกตัด (…) · ช่องภูมิภาคกว้างเกินป้ายที่จอ 1920 · แถวสูงเกิน 50px (ช่องบน/ล่าง 0.72rem · ปุ่มท้ายแถวกำหนดความสูงเนื้อ)
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.setTimeout(120_000);

const ชื่อยาว = `ZZTEST ดีลเลอร์ชื่อยาวสำหรับตรวจว่าตารางแสดงชื่อเต็มไม่ตัด ${Date.now() % 100_000}`;
let ส: สาขาของข้อ | null = null;
test.beforeAll(async () => { ส = await สร้างสาขาของข้อ({ จังหวัด: "ขอนแก่น", ภาค: "ตะวันออกเฉียงเหนือ", ชื่อ: ชื่อยาว }); });
test.afterAll(async () => { if (ส) await ส.ลบ(); });

test("[ui·hq] ตารางดีลเลอร์: ไม่มีคอลัมน์ลำดับ · ชื่อเต็มไม่ตัด · ภูมิภาคพอดีป้าย · แถวชิด · ไม่ล้นแนวนอน (1366 / 1920)", async ({ page }) => {
  const errs = watchErrors(page);
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  for (const w of [1366, 1920]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto(`${HQ_ORIGIN}/hq/dealers?view=table`, { waitUntil: "domcontentloaded" });
    await settle(page);
    await page.getByPlaceholder(/ค้นหาดีลเลอร์/).fill(ส!.รหัส);
    const ตาราง = page.locator("table[data-dealers-table]");
    const แถว = page.getByRole("row", { name: `เปิดหน้าต่างรายละเอียดดีลเลอร์ ${ชื่อยาว}`, exact: true });
    await expect(แถว, `จอ ${w}: แถวของสาขาของข้อ`).toBeVisible({ timeout: 20_000 });

    // 1) ไม่มีคอลัมน์ลำดับ
    expect((await ตาราง.locator("thead th").allInnerTexts()).map(t => t.trim()), `จอ ${w}: หัวคอลัมน์ (ไม่มีลำดับ)`)
      .toEqual(["รหัส", "ดีลเลอร์", "จังหวัด", "ภูมิภาค", "สถานะ", ""]);

    // 2) ชื่อเต็มไม่ตัด: ข้อความทั้งหมดอยู่ในช่อง ไม่มีส่วนที่ล้น/ซ่อน
    const ชื่อ = await แถว.locator("td[data-col='name']").evaluate(td => {
      const s = td.querySelector("span")!; const a = td.getBoundingClientRect(), b = s.getBoundingClientRect();
      return { ข้อความ: s.textContent, ล้น: td.scrollWidth - td.clientWidth, ซ้าย: b.left - a.left, ขวา: a.right - b.right, ตัด: getComputedStyle(td).textOverflow === "ellipsis" && getComputedStyle(td).whiteSpace === "nowrap" };
    });
    expect(ชื่อ.ข้อความ, `จอ ${w}: ชื่อครบ`).toBe(ชื่อยาว);
    expect(ชื่อ.ล้น, `จอ ${w}: ชื่อไม่ล้นช่อง (scrollWidth ≤ clientWidth)`).toBeLessThanOrEqual(0);
    expect(ชื่อ.ตัด, `จอ ${w}: ช่องชื่อไม่ตัดด้วย …`).toBe(false);
    expect(Math.min(ชื่อ.ซ้าย, ชื่อ.ขวา), `จอ ${w}: ชื่ออยู่ในกรอบช่อง`).toBeGreaterThanOrEqual(0);

    // 4) ภูมิภาค: ป้ายเต็ม · ช่องไม่กว้างเกินป้ายยาวสุดมาก (เผื่อระยะขอบช่อง 32px + 24px)
    const ภาค = await แถว.locator("td[data-col='region']").evaluate(td => {
      const b = td.querySelector<HTMLElement>(".badge")!;
      const cs = getComputedStyle(td);
      return { ข้อความ: b.textContent, ป้ายล้น: b.scrollWidth - b.clientWidth, ป้าย: b.getBoundingClientRect().width,
        ใน: td.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), ขวาเกิน: b.getBoundingClientRect().right - td.getBoundingClientRect().right };
    });
    expect(ภาค.ข้อความ, `จอ ${w}: ป้ายภูมิภาคเต็ม`).toBe("ภาคตะวันออกเฉียงเหนือ");
    expect(ภาค.ป้ายล้น, `จอ ${w}: ป้ายภูมิภาคไม่ถูกตัด`).toBeLessThanOrEqual(0);
    expect(ภาค.ขวาเกิน, `จอ ${w}: ป้ายไม่ล้นช่อง`).toBeLessThanOrEqual(0);
    expect(ภาค.ใน - ภาค.ป้าย, `จอ ${w}: ช่องภูมิภาคพอดีป้ายยาวสุด (ที่ว่าง ${Math.round(ภาค.ใน - ภาค.ป้าย)}px · ป้าย ${Math.round(ภาค.ป้าย)}px)`).toBeLessThanOrEqual(24);

    // 3) แถวชิด: แถวที่ชื่อบรรทัดเดียว (ล้างคำค้น — แถวดีลเลอร์ทั่วไป) สูงไม่เกิน 50px (ช่องบน/ล่าง 0.4rem + ปุ่มท้ายแถว)
    await page.getByPlaceholder(/ค้นหาดีลเลอร์/).fill("");
    await expect(ตาราง.locator("tbody tr").nth(1), `จอ ${w}: มีหลายแถว`).toBeVisible({ timeout: 20_000 });
    const สูง = await ตาราง.locator("tbody tr").evaluateAll(trs => trs.map(tr => {
      const ช่อง = tr.querySelector<HTMLElement>("td[data-col='name']");
      const s = ช่อง?.querySelector("span"); const r = s ? s.getClientRects().length : 0;
      return { สูง: Math.round(tr.getBoundingClientRect().height), บรรทัดเดียว: r === 1 };
    }).filter(x => x.บรรทัดเดียว).map(x => x.สูง));
    expect(สูง.length, `จอ ${w}: มีแถวชื่อบรรทัดเดียวให้วัด`).toBeGreaterThan(0);
    expect(Math.max(...สูง), `จอ ${w}: แถวชิด (สูงสุด ${Math.max(...สูง)}px)`).toBeLessThanOrEqual(50);

    // หัวบรรทัดเดียว · ไม่มีแถบเลื่อนแนวนอน (ตาราง + หน้า)
    const หัวหลายบรรทัด = await ตาราง.locator("thead th").evaluateAll(ths => ths.filter(th => th.scrollWidth > th.clientWidth + 1
      || th.getBoundingClientRect().height > parseFloat(getComputedStyle(th).fontSize) * 2 + parseFloat(getComputedStyle(th).paddingTop) * 2 + 2).map(th => th.textContent));
    expect(หัวหลายบรรทัด, `จอ ${w}: หัวตารางบรรทัดเดียว ไม่ถูกตัด`).toEqual([]);
    expect(await page.locator(".table-wrap").first().evaluate(e => e.scrollWidth - e.clientWidth), `จอ ${w}: ตารางไม่มีแถบเลื่อนแนวนอน`).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `จอ ${w}: หน้าไม่ล้นแนวนอน`).toBeLessThanOrEqual(1);
  }
  assertNoErrors(errs, "ตารางดีลเลอร์พอดี");
});
