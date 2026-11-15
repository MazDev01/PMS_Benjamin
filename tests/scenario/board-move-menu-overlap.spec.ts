import { test, expect, type Page } from "@playwright/test";
import { ADMIN, RYG, skipReason } from "./supabaseEnv";
import { HQ_ORIGIN, DEALER_ORIGIN, db, loginUI, watchErrors, assertNoErrors } from "./funcHelpers";
import { ช่องผู้สนใจครบ } from "./requiredFixtures";
import { settle } from "./helpers";

// ── เมนู "ย้ายไปขั้น…" ต้องขึ้นทับการ์ดใบล่าง (บั๊ก บอสสั่ง 13 พ.ย. 69 · ตัวกลาง StageBoard · ทั้ง 2 บอร์ด) ─────────────────────
//   ต้นเหตุ: ชี้การ์ด = การ์ดยกลอย (transform ของ .card:hover) → เมนูถูกขังในชั้นของการ์ดใบนั้น การ์ดใบล่างวาดทับ
//   ตรวจ: เปิดเมนูของการ์ดใบบนในคอลัมน์ที่มีการ์ด ≥ 2 ใบ → จุดกลางของทุกตัวเลือกเป็นของเมนูจริง (ไม่ใช่การ์ดใบล่าง)
//     แล้วคลิกตัวเลือกสุดท้ายที่กดได้ด้วยเมาส์จริง (ไม่ force) → เมนูปิดเพราะตัวเลือกทำงาน · ฟอร์มของขั้นที่เปิดขึ้น = กดยกเลิก (ข้อมูลไม่เปลี่ยน)
//   ตกบนโค้ดเดิม: จุดกลางของตัวเลือกล่างเป็นของการ์ดใบล่าง
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(180_000);
// ผู้สนใจของข้อ 2 ราย (คอลัมน์เดียวกัน = มีการ์ดใบล่างแน่นอน · ไม่พึ่งข้อมูลร่วม) — ไม่บันทึกฟอร์ม ขั้นไม่เปลี่ยน
const แท็ก = `ZZTEST-เมนูย้ายขั้น-${Date.now() % 1_000_000}`;
test.beforeAll(async () => {
  const { error } = await (await db(ADMIN)).from("dealer_prospects").insert([1, 2].map(n => ({ ...ช่องผู้สนใจครบ(), name: `${แท็ก}-${n}`, province: "ตราด" })));
  expect(error).toBeNull();
});
test.afterAll(async () => { await (await db(ADMIN)).from("dealer_prospects").delete().like("name", `${แท็ก}-%`); });

async function ตรวจเมนู(page: Page, ป้ายบอร์ด: string) {
  const บอร์ด = page.getByRole("region", { name: ป้ายบอร์ด });
  await expect(บอร์ด).toBeVisible({ timeout: 25_000 });
  await expect(บอร์ด.locator("[data-move-menu]").nth(0), `${ป้ายบอร์ด}: มีการ์ดที่ย้ายขั้นได้`).toBeVisible({ timeout: 25_000 });
  // คอลัมน์แรกที่การ์ดใบบนมีปุ่มย้ายขั้น และมีการ์ดใบล่างต่อจากมัน
  const ที่ = await บอร์ด.evaluate(b => {
    const cols = [...b.querySelectorAll("[data-board-column]")];
    for (const c of cols) {
      const cards = [...c.querySelectorAll("[data-board-card]")];
      if (cards.length >= 2 && cards[0].querySelector("[data-move-menu]")) return { col: c.getAttribute("data-board-column"), card: cards[0].getAttribute("data-board-card") };
    }
    return null;
  });
  expect(ที่, `${ป้ายบอร์ด}: มีคอลัมน์ที่มีการ์ด ≥ 2 ใบและใบบนย้ายขั้นได้`).not.toBeNull();
  const การ์ด = บอร์ด.locator(`[data-board-column="${ที่!.col}"] [data-board-card="${ที่!.card}"]`);
  await การ์ด.scrollIntoViewIfNeeded();
  await การ์ด.locator("[data-move-menu]").click();
  const เมนู = การ์ด.getByRole("menu");
  await expect(เมนู).toBeVisible();
  // เมนูทั้งอันต้องอยู่ในจอ (จุดนอกจอ elementFromPoint ไม่เจออะไร) แล้วชี้เมาส์ที่ปุ่มของการ์ดใบบนค้างไว้ = การ์ดยกลอย (ภาวะของบั๊ก)
  await เมนู.evaluate(e => e.scrollIntoView({ block: "center" }));
  await การ์ด.locator("[data-move-menu]").hover();
  // เมนูต้องยื่นลงไปถึงการ์ดใบล่างจริง (ไม่งั้นข้อนี้ไม่ได้ตรวจกรณีบัง)
  const ล่าง = บอร์ด.locator(`[data-board-column="${ที่!.col}"] [data-board-card]`).nth(1);
  const [ม, ล] = [(await เมนู.boundingBox())!, (await ล่าง.boundingBox())!];
  expect(ม.y + ม.height, `${ป้ายบอร์ด}: เมนูยื่นทับพื้นที่การ์ดใบล่าง`).toBeGreaterThan(ล.y);
  // จุดกลางของทุกตัวเลือก = ตัวเลือกนั้นจริง (ไม่ใช่การ์ดใบล่างที่วาดทับ) · เมาส์ยังชี้การ์ดใบบน (การ์ดยกลอยอยู่ = กรณีของบั๊ก)
  const ทุกตัว = เมนู.getByRole("menuitem");
  const n = await ทุกตัว.count();
  expect(n, `${ป้ายบอร์ด}: เมนูมีตัวเลือก`).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) {
    const ตัว = ทุกตัว.nth(i);
    const ได้ = await ตัว.evaluate(e => { const r = e.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!top && e.contains(top); });
    expect(ได้, `${ป้ายบอร์ด}: ตัวเลือกที่ ${i + 1}/${n} (${(await ตัว.textContent())?.trim()}) อยู่บนสุด ไม่ถูกการ์ดใบล่างบัง`).toBe(true);
  }
  // คลิกตัวเลือกสุดท้ายที่กดได้ (เมาส์จริง ไม่ force) → ตัวเลือกทำงาน = เมนูปิด
  const กดได้ = เมนู.locator('[role="menuitem"]:not([disabled])');
  expect(await กดได้.count(), `${ป้ายบอร์ด}: มีตัวเลือกที่กดได้`).toBeGreaterThan(0);
  await กดได้.last().click();
  await expect(เมนู, `${ป้ายบอร์ด}: กดตัวเลือกสุดท้ายแล้วเมนูปิด (ตัวเลือกทำงาน)`).toBeHidden();
  // ฟอร์มของขั้นที่เปิดขึ้น = ปิดโดยไม่บันทึก
  await page.keyboard.press("Escape");
}

test("[ui·hq] บอร์ดผู้สนใจ: เมนูย้ายไปขั้น… ขึ้นทับการ์ดใบล่าง · กดตัวเลือกสุดท้ายได้", async ({ page }) => {
  const errs = watchErrors(page);
  await page.setViewportSize({ width: 1600, height: 1000 });   // บอร์ดเต็มจอ เมนูของการ์ดใบบนอยู่ในจอ (จอ 720 เมนูตกขอบล่าง)
  await loginUI(page, HQ_ORIGIN, "/hq/prospects", ADMIN);
  await settle(page);
  await page.locator('button[title="บอร์ด"]').click();
  await ตรวจเมนู(page, "บอร์ดผู้สนใจเป็นดีลเลอร์");
  assertNoErrors(errs, "เมนูย้ายขั้นบอร์ดผู้สนใจ");
});

test("[ui·dealer] บอร์ดลูกค้าเป้าหมาย: เมนูย้ายไปขั้น… ขึ้นทับการ์ดใบล่าง · กดตัวเลือกสุดท้ายได้", async ({ page }) => {
  const errs = watchErrors(page);
  await page.setViewportSize({ width: 1600, height: 1000 });   // บอร์ดเต็มจอ เมนูของการ์ดใบบนอยู่ในจอ (จอ 720 เมนูตกขอบล่าง)
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: "บอร์ด", exact: true }).nth(0).click();
  await ตรวจเมนู(page, "บอร์ดลูกค้าเป้าหมาย");
  assertNoErrors(errs, "เมนูย้ายขั้นบอร์ดลูกค้าเป้าหมาย");
});
