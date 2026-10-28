import { test, expect, type Page } from "@playwright/test";
import { ADMIN, RYG, skipReason, type Account } from "./supabaseEnv";
import { DEALER_ORIGIN, HQ_ORIGIN, loginUI } from "./funcHelpers";
import { settle } from "./helpers";

// ── ตัวตรวจระยะห่างทุกหน้าในเมนู (บอสสั่ง 28 ต.ค. 69 · ปฏิทินดีลเลอร์: การ์ด 4 ใบชนปฏิทิน · ปุ่มกรองล้น 2 แถว) ─────────
//   วนทุกหน้าในเมนูของดีลเลอร์และ HQ (navConfig.tsx) ที่จอกว้าง 1440 และจอมือถือ 390 แล้ววัดจากหน้าจริง:
//   1) กล่องที่อยู่ติดกัน (การ์ด/กล่องชั้นนอกสุด) ห่างกันไม่น้อยกว่าค่ากลาง --space-card · ไม่ซ้อนกัน
//   2) เนื้อหา (ตัวหนังสือ · ปุ่ม · ช่องกรอก) ห่างขอบกล่องไม่น้อยกว่าค่ากลาง --pad-min
//   3) แถวปุ่มกรอง/แท็บ ไม่ล้นเป็นหลายแถวที่จอกว้าง (ไม่พอ = เลื่อนแนวนอน หรือเปลี่ยนเป็นช่องเลือก)
//   4) หน้าไม่ต้องเลื่อนแนวนอน
//   ค่ากลางอ่านจาก :root ของหน้า (packages/shared/globals.css) — ตัวตรวจไม่ตั้งตัวเลขเอง
//   ตกบนโค้ดก่อนแก้: หน้าปฏิทิน (การ์ด 4 ใบชนปฏิทิน · ปุ่มกรองรายการนัดหมายล้น 2 แถว)
test.skip(() => skipReason() !== "", skipReason());
test.setTimeout(600_000);

const ดีลเลอร์ = ["/dashboard", "/leads", "/quotations", "/customers", "/calendar", "/files", "/settings"];
const สำนักงานใหญ่ = ["/hq/dashboard", "/hq/prospects", "/hq/proposals", "/hq/dealers", "/hq/pipeline", "/hq/quote-requests",
  "/hq/leads", "/hq/quotations", "/hq/customers", "/hq/audit", "/hq/settings"];
const จอ = { กว้าง: { width: 1440, height: 900 }, มือถือ: { width: 390, height: 844 } } as const;

type ผลวัด = { ปัญหา: string[] };
/** วัดหน้าที่เปิดอยู่ — ทำในเบราว์เซอร์ (ตำแหน่งจริงหลังจัดหน้า) */
const วัดหน้า = (page: Page, จอกว้าง: boolean) => page.evaluate((จอกว้าง): ผลวัด => {
  const ราก = getComputedStyle(document.documentElement);
  const px = (ชื่อ: string) => parseFloat(ราก.getPropertyValue(ชื่อ)) || 0;
  const ห่างกล่อง = px("--space-card"), ห่างขอบ = px("--pad-min");
  const ปัญหา: string[] = [];
  if (!ห่างกล่อง || !ห่างขอบ) return { ปัญหา: [`ไม่พบค่ากลาง --space-card (${ห่างกล่อง}) / --pad-min (${ห่างขอบ}) ใน :root`] };
  const ชื่อ = (e: Element) => {
    const t = (e.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 28);
    const c = typeof (e as HTMLElement).className === "string" ? (e as HTMLElement).className.trim().split(/\s+/).slice(0, 2).join(".") : "";
    return `${e.tagName.toLowerCase()}${c ? "." + c : ""}${t ? ` "${t}"` : ""}`;
  };
  const เนื้อหา = document.querySelector(".content");
  if (!เนื้อหา) return { ปัญหา: ["ไม่พบกล่องเนื้อหาหลัก (.content)"] };

  // 4) หน้าไม่เลื่อนแนวนอน
  const ล้น = document.documentElement.scrollWidth - window.innerWidth;
  if (ล้น > 1) ปัญหา.push(`หน้าเลื่อนแนวนอน ${ล้น}px`);

  // กล่อง = มีพื้น/ขอบอย่างน้อย 3 ด้าน หรือมีเงา · ไม่ลอย (fixed/absolute = เมนูเด้ง/ป้ายลอย) · ไม่ใช่ปุ่ม/ช่องกรอก/ป้ายเล็ก
  const เห็น = (e: Element) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const เป็นกล่อง = (e: Element) => {
    if (!(e instanceof HTMLElement) || /^(INPUT|SELECT|TEXTAREA|LABEL|TABLE|THEAD|TBODY|TR|TD|TH|IMG|SVG|SPAN)$/i.test(e.tagName)) return false;
    const s = getComputedStyle(e);
    if (s.position === "fixed" || s.position === "absolute" || s.display === "inline") return false;
    const r = e.getBoundingClientRect();
    if (r.width < 60 || r.height < 36) return false;
    // ปุ่ม/ลิงก์ที่เป็นการ์ด (การ์ด KPI กดได้) นับเป็นกล่อง · ปุ่มทั่วไปไม่นับ
    if (/^(BUTTON|A)$/.test(e.tagName) && (r.height < 56 || r.width < 120)) return false;
    const ขอบ = ["Top", "Right", "Bottom", "Left"].filter(d => parseFloat(s.getPropertyValue(`border-${d.toLowerCase()}-width`)) > 0 && s.getPropertyValue(`border-${d.toLowerCase()}-style`) !== "none").length;
    return ขอบ >= 3 || (s.boxShadow !== "none" && s.backgroundColor !== "rgba(0, 0, 0, 0)");
  };
  const กล่องทั้งหมด = [...เนื้อหา.querySelectorAll("*")].filter(e => เห็น(e) && เป็นกล่อง(e));
  const ชั้นนอก = กล่องทั้งหมด.filter(e => !กล่องทั้งหมด.some(o => o !== e && o.contains(e)));

  // 1) กล่องชั้นนอกที่อยู่ติดกัน ห่างไม่น้อยกว่าค่ากลาง
  const กรอบ = ชั้นนอก.map(e => ({ e, r: e.getBoundingClientRect() }));
  for (let i = 0; i < กรอบ.length; i++) for (let j = i + 1; j < กรอบ.length; j++) {
    const a = กรอบ[i].r, b = กรอบ[j].r;
    const ซ้อนแนวนอน = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const ซ้อนแนวตั้ง = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (ซ้อนแนวนอน > 1 && ซ้อนแนวตั้ง > 1) { ปัญหา.push(`กล่องซ้อนกัน: ${ชื่อ(กรอบ[i].e)} ↔ ${ชื่อ(กรอบ[j].e)}`); continue; }
    const ห่าง = ซ้อนแนวนอน > 1 ? Math.max(b.top - a.bottom, a.top - b.bottom) : ซ้อนแนวตั้ง > 1 ? Math.max(b.left - a.right, a.left - b.right) : Infinity;
    if (ห่าง < ห่างกล่อง - 0.5) ปัญหา.push(`กล่องห่างกัน ${Math.round(ห่าง)}px (ต้อง ≥ ${ห่างกล่อง}): ${ชื่อ(กรอบ[i].e)} ↔ ${ชื่อ(กรอบ[j].e)}`);
  }

  // 2) เนื้อหาห่างขอบกล่อง — ตัวหนังสือ/ปุ่ม/ช่องกรอกที่เห็นอยู่ในกล่อง (ส่วนที่เลื่อนพ้นกรอบไม่นับ)
  for (const { e, r } of กรอบ) {
    const s = getComputedStyle(e);
    const ใน = { l: r.left + parseFloat(s.borderLeftWidth), r: r.right - parseFloat(s.borderRightWidth), t: r.top + parseFloat(s.borderTopWidth), b: r.bottom - parseFloat(s.borderBottomWidth) };
    const ชิ้น: { ที่: Element; r: DOMRect }[] = [];
    const เดิน = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
    for (let n = เดิน.nextNode(); n; n = เดิน.nextNode()) {
      if (!(n.textContent ?? "").trim() || !n.parentElement || !เห็น(n.parentElement)) continue;
      const rg = document.createRange(); rg.selectNodeContents(n);
      for (const x of rg.getClientRects()) if (x.width > 0 && x.height > 0) ชิ้น.push({ ที่: n.parentElement, r: x });
    }
    // ช่องกรอก (มีกรอบของตัวเอง) + ไอคอน · ปุ่มวัดจากตัวหนังสือ/ไอคอนข้างใน (แท็บ/แถวรายการที่เต็มกว้างกล่องเว้นที่ในตัวเอง)
    for (const c of e.querySelectorAll("input:not([type=hidden]), select, textarea, svg")) if (เห็น(c)) ชิ้น.push({ ที่: c, r: c.getBoundingClientRect() });
    // ชิ้นที่กล่องเลื่อนข้างใน (ตารางเลื่อนแนวนอน ฯลฯ) ตัดไว้ = มองไม่เห็นเต็ม ไม่นับ — ส่วนที่เห็นเต็มเท่านั้นที่วัด
    const ถูกตัด = (ที่: Element, x: DOMRect) => {
      for (let p: Element | null = ที่; p && p !== e; p = p.parentElement) {   // รวมตัวที่ถือข้อความเอง (ตัดด้วย … ในช่องตัวเอง)
        const ps = getComputedStyle(p);
        if (ps.overflowX === "visible" && ps.overflowY === "visible") continue;
        const pr = p.getBoundingClientRect();
        if (x.left < pr.left - 0.5 || x.right > pr.right + 0.5 || x.top < pr.top - 0.5 || x.bottom > pr.bottom + 0.5) return true;
        // ขอบของกล่องที่เลื่อนได้จริง = ขอบที่เลื่อนต่อได้ (เนื้อหายังมีต่อ) ไม่ใช่ขอบกล่อง — ชิ้นที่อยู่ติดขอบนั้นไม่นับ
        const เลื่อนข้าง = p.scrollWidth > p.clientWidth + 1, เลื่อนลง = p.scrollHeight > p.clientHeight + 1;
        if (เลื่อนข้าง && (x.right > pr.right - ห่างขอบ || x.left < pr.left + ห่างขอบ)) return true;
        if (เลื่อนลง && (x.bottom > pr.bottom - ห่างขอบ || x.top < pr.top + ห่างขอบ)) return true;
      }
      return false;
    };
    let แย่สุด: { ห่าง: number; ด้าน: string; ที่: Element } | null = null;
    for (const { ที่, r: x } of ชิ้น) {
      if (x.right <= ใน.l || x.left >= ใน.r || x.bottom <= ใน.t || x.top >= ใน.b) continue;   // เลื่อนพ้นกรอบ
      if (x.left < ใน.l - 0.5 || x.right > ใน.r + 0.5 || x.top < ใน.t - 0.5 || x.bottom > ใน.b + 0.5) continue;   // ถูกตัดในกล่องเลื่อน
      if (ถูกตัด(ที่, x)) continue;
      const ด้าน = [["ซ้าย", x.left - ใน.l], ["ขวา", ใน.r - x.right], ["บน", x.top - ใน.t], ["ล่าง", ใน.b - x.bottom]] as [string, number][];
      const [ชื่อด้าน, ห่าง] = ด้าน.reduce((a, b) => b[1] < a[1] ? b : a);
      if (ห่าง < ห่างขอบ - 0.5 && (!แย่สุด || ห่าง < แย่สุด.ห่าง)) แย่สุด = { ห่าง, ด้าน: ชื่อด้าน, ที่ };
    }
    if (แย่สุด) ปัญหา.push(`เนื้อหาชิดขอบกล่องด้าน${แย่สุด.ด้าน} ${Math.round(แย่สุด.ห่าง)}px (ต้อง ≥ ${ห่างขอบ}): ${ชื่อ(แย่สุด.ที่)} ใน ${ชื่อ(e)}`);
  }

  // 3) แถวปุ่มกรอง/แท็บ ไม่ล้นหลายแถวที่จอกว้าง — แถบแท็บ หรือแถวที่ลูกเป็นปุ่มล้วน ≥ 3 ปุ่ม
  if (จอกว้าง) {
    for (const g of เนื้อหา.querySelectorAll("*")) {
      if (!เห็น(g)) continue;
      const ลูก = [...g.children].filter(เห็น);
      const แถบแท็บ = g.getAttribute("role") === "tablist" || g.classList.contains("tab-bar");
      // แถวปุ่ม = ปุ่มสั้น ๆ เรียงกัน (ไม่ใช่รายการแถวเต็มกว้างที่เรียงลงล่างตามแบบ)
      const กว้าง = g.getBoundingClientRect().width;
      const ปุ่มล้วน = ลูก.length >= 3 && ลูก.every(c => (/^(BUTTON|A)$/.test(c.tagName) || c.getAttribute("role") === "tab") && c.getBoundingClientRect().width < กว้าง * 0.45);
      if (!แถบแท็บ && !ปุ่มล้วน) continue;
      const แถว = new Set(ลูก.map(c => Math.round(c.getBoundingClientRect().top / 4)));
      if (แถว.size > 1) ปัญหา.push(`แถวปุ่ม/แท็บล้น ${แถว.size} แถว: ${ชื่อ(g)}`);
    }
  }
  return { ปัญหา: [...new Set(ปัญหา)] };
}, จอกว้าง);

/** รอหน้าโหลดครบ + ภาพเคลื่อนไหวจบ (การ์ดค่อย ๆ โผล่ · แถบโต) ก่อนวัด */
async function เปิดแล้วรอ(page: Page, url: string) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await settle(page);
  await expect(page.locator(".content")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("กำลังโหลด", { exact: false }).first()).toBeHidden({ timeout: 20_000 }).catch(() => {});
  await page.evaluate(() => Promise.all(document.getAnimations().map(a => a.finished.catch(() => {}))));
}

async function ตรวจทุกหน้า(page: Page, origin: string, ล็อกอิน: string, บัญชี: Account, หน้า: string[], ชนิดจอ: keyof typeof จอ) {
  await page.setViewportSize(จอ[ชนิดจอ]);
  await loginUI(page, origin, ล็อกอิน, บัญชี);
  const ตก: string[] = [];
  for (const p of หน้า) {
    await เปิดแล้วรอ(page, `${origin}${p}`);
    // รูปก่อน/หลัง (บอสสั่ง) — รันเองเมื่อสั่ง PMS_SHOTS=ก่อน|หลัง
    if (process.env.PMS_SHOTS) await page.screenshot({ fullPage: true,
      path: `C:/.claude/pms-shots/layout-spacing/${process.env.PMS_SHOTS}/${origin === HQ_ORIGIN ? "hq" : "dealer"}${p.replace(/^\/hq/, "").replace(/\//g, "-")}-${ชนิดจอ}.png` });
    const { ปัญหา } = await วัดหน้า(page, ชนิดจอ === "กว้าง");
    for (const x of ปัญหา) ตก.push(`${p} [จอ${ชนิดจอ}] ${x}`);
  }
  expect(ตก, `หน้าที่ระยะห่างไม่ผ่าน (${ตก.length} จุด):\n${ตก.join("\n")}`).toEqual([]);
}

test("[layout·dealer] ทุกหน้าในเมนู จอกว้าง: กล่องห่างกัน · เนื้อหาห่างขอบ · ปุ่มกรองแถวเดียว · ไม่เลื่อนแนวนอน", async ({ page }) => {
  await ตรวจทุกหน้า(page, DEALER_ORIGIN, "/login", RYG, ดีลเลอร์, "กว้าง");
});
test("[layout·dealer] ทุกหน้าในเมนู จอมือถือ: กล่องห่างกัน · เนื้อหาห่างขอบ · ไม่เลื่อนแนวนอน", async ({ page }) => {
  await ตรวจทุกหน้า(page, DEALER_ORIGIN, "/login", RYG, ดีลเลอร์, "มือถือ");
});
test("[layout·hq] ทุกหน้าในเมนู จอกว้าง: กล่องห่างกัน · เนื้อหาห่างขอบ · ปุ่มกรองแถวเดียว · ไม่เลื่อนแนวนอน", async ({ page }) => {
  await ตรวจทุกหน้า(page, HQ_ORIGIN, "/hq/login", ADMIN, สำนักงานใหญ่, "กว้าง");
});
test("[layout·hq] ทุกหน้าในเมนู จอมือถือ: กล่องห่างกัน · เนื้อหาห่างขอบ · ไม่เลื่อนแนวนอน", async ({ page }) => {
  await ตรวจทุกหน้า(page, HQ_ORIGIN, "/hq/login", ADMIN, สำนักงานใหญ่, "มือถือ");
});
