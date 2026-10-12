import { test, expect } from "@playwright/test";
import { open } from "./helpers";

// ── กล่องข้อความตอนชี้เมาส์ในกราฟ ต้องกว้างพอสำหรับตัวหนังสือข้างใน ──────────────
// บอสทัก 3 รอบว่าตัวหนังสือทะลุกรอบ (25 ส.ค. 69) — ต้นเหตุคือกล่องตรึงความกว้างไว้ตายตัว
// พอขยายฟอนต์ให้อ่านง่ายขึ้น ข้อความไทยยาว ๆ ก็ล้นทันที
// เทสต์นี้วัด "ความกว้างจริงของตัวหนังสือ" เทียบกับกล่องในเบราว์เซอร์ ไม่ใช่เดาจากโค้ด
test("[ui] กล่องตัวเลขในกราฟ ต้องไม่มีตัวหนังสือล้นกรอบ", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 1000 });
  for (const [ชื่อ, role, path] of [["HQ", "hq", "/hq/dashboard"], ["ดีลเลอร์", "dealer", "/dashboard"]] as const) {
    await open(page, role, path);
    await page.waitForTimeout(3000);
    const cards = page.locator(".card");
    const cn = await cards.count();
    for (let c = 0; c < cn; c++) {
      const card = cards.nth(c);
      const bars = card.locator("svg rect, svg circle");
      const n = await bars.count();
      if (!n) continue;
      for (let i = n - 1; i >= Math.max(0, n - 10); i--) {
        await bars.nth(i).hover({ force: true }).catch(() => {});
        await page.waitForTimeout(200);
        const out = await card.evaluate(el => {
          const boxes = [...el.querySelectorAll('svg rect')].filter(r => ["#2D2D2D", "#fff"].includes(r.getAttribute("fill") ?? "") && Number(r.getAttribute("rx") ?? 0) >= 8);
          if (!boxes.length) return null;
          const b = boxes[0] as SVGGraphicsElement;
          const bw = b.getBBox().width;
          const texts = [...el.querySelectorAll("svg text")].filter(t => {
            const tb = (t as SVGGraphicsElement).getBBox();
            const bb = (b as SVGGraphicsElement).getBBox();
            return tb.y > bb.y - 4 && tb.y < bb.y + bb.height + 4;
          });
          return { bw: Math.round(bw), lines: texts.map(t => ({ s: (t.textContent ?? "").slice(0, 28), w: Math.round((t as SVGGraphicsElement).getBBox().width) })) };
        });
        if (out && out.lines.length) {
          const ล้น = out.lines.filter(l => l.w > out.bw - 8);
          console.log(`PROBE ${ชื่อ} การ์ด#${c} กล่อง ${out.bw} · ${JSON.stringify(out.lines)} ${ล้น.length ? "ล้น!" : "พอดี"}`);
          expect(ล้น, `กล่องในกราฟต้องกว้างพอ: ${JSON.stringify(ล้น)}`).toHaveLength(0);
          break;
        }
      }
    }
  }
});
