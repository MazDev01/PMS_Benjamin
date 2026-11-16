import { test, expect, type Locator, type Page } from "@playwright/test";
import { open } from "./helpers";

// ── กล่องข้อความตอนชี้เมาส์ในกราฟ ต้องกว้างพอสำหรับตัวหนังสือข้างใน ──────────────
// บอสทัก 3 รอบว่าตัวหนังสือทะลุกรอบ (25 ส.ค. 69) — ต้นเหตุคือกล่องตรึงความกว้างไว้ตายตัว
// พอขยายฟอนต์ให้อ่านง่ายขึ้น ข้อความไทยยาว ๆ ก็ล้นทันที
// เทสต์นี้วัด "ความกว้างจริงของตัวหนังสือ" เทียบกับกล่องในเบราว์เซอร์ ไม่ใช่เดาจากโค้ด
// ไม่นิ่งครั้งที่ 3 (รอบ deploy21 13 พ.ย. 69 · trace): รอตายตัว 207 ครั้งรวม 26.4 วิ (200ms หลังชี้ทุกแท่ง + 3 วิต่อหน้า)
//   จากเพดาน 30 วิ → เครื่องหน่วงนิดเดียวก็หมดเวลา · แก้: รอจนกล่องตัวเลขขึ้นจริง (สูงสุด 1.5 วิต่อแท่ง) · รอกราฟขึ้นแทนรอ 3 วิ

/** กล่องตัวเลขที่ขึ้นในการ์ด (พื้นเข้ม/ขาว มุมมน ≥ 8) + ความกว้างตัวหนังสือแต่ละบรรทัด · ไม่มีกล่อง = null */
const วัดกล่อง = (el: Element | null) => {
  if (!el) return null;
  const boxes = [...el.querySelectorAll("svg rect")].filter(r => ["#2D2D2D", "#fff"].includes(r.getAttribute("fill") ?? "") && Number(r.getAttribute("rx") ?? 0) >= 8);
  if (!boxes.length) return null;
  const b = boxes[0] as SVGGraphicsElement;
  const bb = b.getBBox();
  const texts = [...el.querySelectorAll("svg text")].filter(t => {
    const tb = (t as SVGGraphicsElement).getBBox();
    return tb.y > bb.y - 4 && tb.y < bb.y + bb.height + 4;
  });
  if (!texts.length) return null;
  return { bw: Math.round(bb.width), lines: texts.map(t => ({ s: (t.textContent ?? "").slice(0, 28), w: Math.round((t as SVGGraphicsElement).getBBox().width) })) };
};

/** ชี้เมาส์ที่แท่งแล้วรอจนกล่องตัวเลขขึ้น (ไม่รอตายตัว) — ไม่ขึ้นใน 1 วิ = แท่งนี้ไม่มีกล่อง (ลองแท่งถัดไป) */
async function ชี้แล้ววัด(page: Page, card: Locator, bar: Locator) {
  try {
    await bar.hover({ force: true });   // แท่งขนาดศูนย์/ถูกบัง ชี้ไม่ได้ = ลองแท่งถัดไป (แบบเดิม)
    const el = await card.elementHandle();
    const h = await page.waitForFunction(วัดกล่อง, el, { timeout: 1_000, polling: 50 });
    return (await h.jsonValue()) as ReturnType<typeof วัดกล่อง>;
  } catch { return null; }   // ไม่ใช่การข้าม: ไม่มีกล่องที่แท่งนี้ — ท้ายหน้าตรวจ กล่องที่ตรวจ > 0
}

// แยกข้อละหน้า (13 พ.ย. 69 · คนรวมงานสั่ง ไม่ขยายเพดาน): 2 หน้าในข้อเดียวใช้จริง 29.2–31.0 วิ (วัดในรอบทดสอบส่วนตัว) ชนเพดาน 30 วิ
//   งานจริงต่อหน้า = การ์ดกราฟ × แท่งที่ลองชี้ (สูงสุด 6 · แท่งที่ไม่มีกล่องรอ ≤ 1 วิ ตามเงื่อนไขจริง) · วัดหลังแก้: หน้าหลัก HQ 11.4 วิ · ดีลเลอร์ 4.8 วิ (ยังตรวจกล่องได้ 4 กล่องเท่าเดิม)
for (const [ชื่อ, role, path] of [["HQ", "hq", "/hq/dashboard"], ["ดีลเลอร์", "dealer", "/dashboard"]] as const) {
  test(`[ui] กล่องตัวเลขในกราฟ ต้องไม่มีตัวหนังสือล้นกรอบ · หน้าหลัก${ชื่อ}`, async ({ page }) => {
    await page.setViewportSize({ width: 1500, height: 1000 });
    await open(page, role, path);
    // รอกราฟขึ้นจริง (แทนรอตายตัว 3 วิ)
    await expect(page.locator(".card svg:not(.lucide) rect:visible").first(), `${ชื่อ}: กราฟขึ้น`).toBeVisible({ timeout: 20_000 });   // แท่งที่มองเห็น (บางกราฟมีแท่งซ่อน)
    const cards = page.locator(".card");
    const cn = await cards.count();
    // กล่องที่ตรวจได้จริง — ไม่มีเลย = ตก ไม่ใช่ผ่านเงียบ (บอสสั่ง 11 พ.ย. 69 · เดิมไม่มีกราฟ/ไม่มีกล่อง = ผ่านโดยไม่ได้ตรวจอะไร)
    let กล่องที่ตรวจ = 0;
    for (let c = 0; c < cn; c++) {
      const card = cards.nth(c);
      // เฉพาะกราฟ (ไม่นับไอคอน lucide ในหัวการ์ด/การ์ด KPI) — ผลไม่นิ่ง 10 พ.ย. 69 (deploy18 · trace): ชี้เมาส์ที่ไอคอนการ์ดละ 10 ครั้ง
      const bars = card.locator("svg:not(.lucide) rect, svg:not(.lucide) circle");
      const n = await bars.count();
      if (!n) continue;   // ไม่ใช่การข้าม: การ์ดที่ไม่มีกราฟ — ท้ายหน้าตรวจ กล่องที่ตรวจ > 0
      for (let i = n - 1; i >= Math.max(0, n - 6); i--) {
        const out = await ชี้แล้ววัด(page, card, bars.nth(i));
        if (out) {
          const ล้น = out.lines.filter(l => l.w > out.bw - 8);
          console.log(`PROBE ${ชื่อ} การ์ด#${c} กล่อง ${out.bw} · ${JSON.stringify(out.lines)} ${ล้น.length ? "ล้น!" : "พอดี"}`);
          กล่องที่ตรวจ++;
          expect(ล้น, `กล่องในกราฟต้องกว้างพอ: ${JSON.stringify(ล้น)}`).toHaveLength(0);
          break;
        }
      }
    }
    expect(กล่องที่ตรวจ, `ขาดข้อมูล: แดชบอร์ด${ชื่อ}ไม่มีกราฟที่ชี้แล้วขึ้นกล่องตัวเลขเลย (ข้อมูลตั้งต้นต้องมียอดในกราฟ)`).toBeGreaterThan(0);
  });
}
