import { test, expect, type Page } from "@playwright/test";
import { ADMIN, RYG, skipReason } from "./supabaseEnv";
import { DEALER_ORIGIN, HQ_ORIGIN, db, loginUI, watchErrors, assertNoErrors } from "./funcHelpers";
import { settle } from "./helpers";

// ── การ์ด KPI 4 ใบทุกหน้า (บอสสั่ง 22 ต.ค. 69 · ใบ 0246) ─────────────────────────────────────────────────────────
//   1) ทุกแถวการ์ด ([data-kpi-row]) มี 4 ใบพอดี — ทุกหน้าในรายการ (ตัวตรวจในโค้ด: scripts/check-kpi-rows.mjs)
//   2) ตัวเลขบนการ์ด (data-value) = ที่ฐานคิด (kpi_cards ช่วงเดียวกับที่หน้าใช้ · data-range-start/end ของแถว)
//   3) กดการ์ดแล้วรายการกรองตรงเรื่อง (จำนวนแถว = ตัวเลขบนการ์ด เมื่อไม่เกินหนึ่งหน้า)
//   ข้อที่ต้องตกบนโค้ดก่อนแก้: ทุกข้อ (เดิมไม่มี [data-kpi-row] · บางหน้ามี 1–3 ใบ · ตัวเลขคิดในเบราว์เซอร์)
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(240_000);

// คีย์การ์ดบนจอ (data-kpi) → ช่องในผลของ kpi_cards
const ดีลเลอร์: { ที่: string; หน้า: string; การ์ด: [string, string][] }[] = [
  { ที่: "/dashboard", หน้า: "dealer.dashboard", การ์ด: [["target", "target.annual"], ["pipeline", "pipeline.value"], ["awaiting", "awaiting.count"], ["won", "won.count"]] },
  { ที่: "/leads", หน้า: "dealer.leads", การ์ด: [["open", "open"], ["hq-pricing", "hqPricing"], ["hq-quoted", "hqQuotedNoDraft"], ["awaiting-client", "awaitingClient"]] },
  { ที่: "/quotations", หน้า: "dealer.quotations", การ์ด: [["drafts", "drafts"], ["awaiting", "awaiting"], ["won", "won.count"], ["expiring", "expiring"]] },
  { ที่: "/customers", หน้า: "dealer.customers", การ์ด: [["total", "total"], ["new", "new"], ["sales", "sales"], ["openDeal", "openDeal"]] },
  { ที่: "/calendar", หน้า: "dealer.calendar", การ์ด: [["today", "today"], ["week", "week"], ["overdue", "overdue"], ["doneWeek", "doneWeek"]] },
];
// หน้า: null = ตัวเลขมาจากคำสั่งฐานอื่นที่มีข้อทดสอบของตัวเองแล้ว (แดชบอร์ด hq_dashboard · คำขอใบเสนอราคา hq_quote_board/hq_overview) — ตรวจแค่ 4 ใบพอดี
const HQ: { ที่: string; หน้า: string | null; การ์ด: [string, string][] }[] = [
  { ที่: "/hq/dashboard", หน้า: null, การ์ด: [] },
  { ที่: "/hq/quote-requests", หน้า: null, การ์ด: [] },
  { ที่: "/hq/prospects", หน้า: "hq.prospects", การ์ด: [["talking", "talking"], ["followDue", "followDue"], ["proposalWaiting", "proposalWaiting"], ["converted", "converted"]] },
  { ที่: "/hq/proposals", หน้า: "hq.proposals", การ์ด: [["waiting", "waiting"], ["unpaid", "unpaid.count"], ["overdue", "overdue.count"], ["paid", "paid.amount"]] },
  { ที่: "/hq/dealers", หน้า: "hq.dealers", การ์ด: [["total", "total"], ["active", "active"], ["moving", "moving"], ["idle", "idle"]] },
  { ที่: "/hq/pipeline", หน้า: "hq.pipeline", การ์ด: [["sales", "sales.value"], ["winRate", "winRate.rate"], ["margin", "margin.pct"], ["onTarget", "onTarget.reached"]] },
  { ที่: "/hq/leads", หน้า: "hq.leads", การ์ด: [["open", "open"], ["new", "new"], ["hqWaiting", "hqWaiting"], ["idle", "idle"]] },
  { ที่: "/hq/quotations", หน้า: "hq.quotations", การ์ด: [["sent", "sent"], ["awaiting", "awaiting"], ["won", "won.value"], ["acceptRate", "acceptRate"]] },
  { ที่: "/hq/customers", หน้า: "hq.customers", การ์ด: [["total", "total"], ["new", "new"], ["sales", "sales"], ["dealers", "dealers.with"]] },
  { ที่: "/hq/audit", หน้า: "hq.audit", การ์ด: [["actionsToday", "actionsToday"], ["usersToday", "usersToday"], ["impersonations", "impersonations"], ["reversals", "reversals"]] },
  { ที่: "/hq/users", หน้า: "hq.users", การ์ด: [["total", "total"], ["active", "active"], ["inactive", "inactive"], ["signedIn30", "signedIn30"]] },
];

const เลขจาก = (d: unknown, path: string) => {
  let v: unknown = d;
  for (const k of path.split(".")) v = v == null ? undefined : (v as Record<string, unknown>)[k];
  return v == null ? "" : String(Number(v));
};

async function แถวการ์ดครบ4(page: Page, ที่: string) {
  const แถว = page.locator("[data-kpi-row]");
  await expect(แถว.first(), `${ที่}: มีแถวการ์ด`).toBeVisible({ timeout: 25_000 });
  const จำนวนแถว = await แถว.count();
  for (let i = 0; i < จำนวนแถว; i++) {
    await expect(แถว.nth(i).locator("[data-kpi]"), `${ที่}: แถวการ์ดที่ ${i + 1} ต้องมี 4 ใบพอดี`).toHaveCount(4);
  }
}

async function ตัวเลขตรงฐาน(page: Page, ที่: string, หน้า: string, การ์ด: [string, string][], sb: Awaited<ReturnType<typeof db>>) {
  const แถว = page.locator("[data-kpi-row]").first();
  // รอให้ตัวเลขโหลดจากฐาน (ใบแรกมีค่า หรือขึ้น "—" พร้อมเหตุผล)
  await expect(แถว.locator(`[data-kpi="${การ์ด[0][0]}"] [data-value]`)).toHaveAttribute("data-value", /\S|^$/, { timeout: 20_000 });
  const ต้น = await แถว.getAttribute("data-range-start"), ท้าย = await แถว.getAttribute("data-range-end");
  for (let รอบ = 0; รอบ < 3; รอบ++) {
    const { data, error } = await sb.rpc("kpi_cards", { p_page: หน้า, p_start: ต้น || null, p_end: ท้าย || null, p_dealer: null, p_today: null });
    expect(error?.message ?? "", `${ที่}: ฐานคิดการ์ดได้`).toBe("");
    const จอ = await Promise.all(การ์ด.map(([k]) => แถว.locator(`[data-kpi="${k}"] [data-value]`).first().getAttribute("data-value")));
    const ฐาน = การ์ด.map(([, path]) => เลขจาก(data, path));
    if (จอ.every((v, i) => (v ?? "") === ฐาน[i])) return;
    if (รอบ < 2) { await page.reload({ waitUntil: "domcontentloaded" }); await settle(page); continue; }   // ข้ออื่นเพิ่ม/ลบข้อมูลระหว่างอ่าน — อ่านใหม่ทั้งคู่
    expect(จอ, `${ที่}: ตัวเลขบนการ์ด = ที่ฐานคิด (${การ์ด.map(c => c[0]).join(" · ")})`).toEqual(ฐาน);
  }
}

test("[kpi·dealer] ทุกหน้าดีลเลอร์: แถวการ์ด 4 ใบพอดี · ตัวเลขตรงฐาน", async ({ page }) => {
  const errs = watchErrors(page);
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  const sb = await db(RYG);
  for (const p of ดีลเลอร์) {
    await page.goto(`${DEALER_ORIGIN}${p.ที่}`, { waitUntil: "domcontentloaded" });
    await settle(page);
    await แถวการ์ดครบ4(page, p.ที่);
    await ตัวเลขตรงฐาน(page, p.ที่, p.หน้า, p.การ์ด, sb);
  }
  assertNoErrors(errs, "การ์ด KPI หน้าดีลเลอร์");
});

test("[kpi·hq] ทุกหน้า HQ: แถวการ์ด 4 ใบพอดี · ตัวเลขตรงฐาน", async ({ page }) => {
  const errs = watchErrors(page);
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  const sb = await db(ADMIN);
  for (const p of HQ) {
    await page.goto(`${HQ_ORIGIN}${p.ที่}`, { waitUntil: "domcontentloaded" });
    await settle(page);
    await แถวการ์ดครบ4(page, p.ที่);
    if (p.หน้า) await ตัวเลขตรงฐาน(page, p.ที่, p.หน้า, p.การ์ด, sb);
  }
  assertNoErrors(errs, "การ์ด KPI หน้า HQ");
});

test("[kpi·dealer] ลูกค้าเป้าหมาย: กดการ์ดขั้นแล้วตารางเหลือเฉพาะขั้นนั้น (จำนวนแถว = ตัวเลขบนการ์ด)", async ({ page }) => {
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: "ตาราง" }).click().catch(() => {});
  for (const k of ["hq-pricing", "hq-quoted", "awaiting-client"]) {
    const การ์ด = page.locator(`[data-kpi="${k}"]`);
    await expect(การ์ด.locator("[data-value]")).not.toHaveAttribute("data-value", "", { timeout: 20_000 });
    const ค่า = Number(await การ์ด.locator("[data-value]").getAttribute("data-value"));
    await การ์ด.click();
    const แถว = page.locator("tbody tr[data-lead-row], tbody tr").filter({ hasNot: page.locator("td[colspan]") });
    if (ค่า <= 10) await expect(แถว, `กด ${k}: ตารางเหลือ ${ค่า} แถว`).toHaveCount(ค่า, { timeout: 15_000 });
    await expect(การ์ด, `กด ${k}: การ์ดบอกว่ากำลังกรองอยู่`).toContainText("กดอีกครั้งเพื่อล้างตัวกรอง");
    await การ์ด.click();   // ล้าง
  }
});
