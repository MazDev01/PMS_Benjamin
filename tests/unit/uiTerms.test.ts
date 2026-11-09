import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
// @ts-expect-error — ไฟล์ .mjs ของเครื่องมือ (ไม่มีชนิดข้อมูล)
import { ข้อความบนจอ } from "../../scripts/lib/uiTexts.mjs";
// @ts-expect-error — ไฟล์ .mjs ของเครื่องมือ (ไม่มีชนิดข้อมูล)
import { คำห้าม, หาคำห้าม, ยกเว้น } from "../../scripts/lib/uiTerms.mjs";

// ── ตัวตรวจคำบนจอ check-ui-terms (บอสสั่ง 9 พ.ย. 69 "ตรวจคำที่ดูแปลกทั้ง 2 แอป" · docs/glossary.md) ──
//   ตกบนโค้ดเดิม: ไฟล์รุ่นก่อนแก้ (4e89fa9) มี "ราคาส่ง HQ" / "โค้ดยืนยัน" / "ก๊อป" บนจอ → ตัวตรวจต้องจับได้
type ข้อความ = { text: string; line: number };
const ตรวจ = (โค้ด: string, ไฟล์ = "apps/x/page.tsx") => หาคำห้าม(ไฟล์, ข้อความบนจอ(โค้ด, ไฟล์) as ข้อความ[]) as { ห้าม: string; line: number }[];

describe("ดึงข้อความบนจอ", () => {
  it("นับสตริง · เทมเพลต · ข้อความ JSX · ไม่นับคอมเมนต์ ชื่อตัวแปร คีย์ ชนิดข้อมูล import", () => {
    const โค้ด = `import x from "ราคาส่ง HQ";
// ราคาส่ง HQ ในคอมเมนต์
const ราคาส่งHQ = 1; type ก = "ราคาส่ง HQ";
const o = { "ราคาส่ง HQ": 1 };
const a = "ราคาส่ง HQ";
const b = \`ยอด \${a} ราคาส่ง HQ\`;
export const C = () => <div className="ราคาส่ง HQ">ราคาส่ง HQ</div>;`;
    const พบ = ตรวจ(โค้ด).map(x => x.line);
    expect(พบ).toEqual([5, 6, 7]);
  });
});

describe("คำห้าม", () => {
  it("ทุกคำในรายการอยู่ในคลังคำ docs/glossary.md และข้อทดสอบข้อความของฐาน", () => {
    const คลัง = readFileSync("docs/glossary.md", "utf8");
    const ฐาน = readFileSync("supabase/tests/ui_terms_db.sql", "utf8");
    for (const k of คำห้าม as { ห้าม: string; แบบ?: string }[]) {
      expect(คลัง, `คลังคำมี "${k.ห้าม}"`).toContain(k.ห้าม.trim());
      expect(ฐาน, `ui_terms_db.sql มี "${k.แบบ ?? k.ห้าม}"`).toContain(`'${k.แบบ ?? k.ห้าม}'`);
    }
  });
  it("จับคำห้ามในข้อความบนจอ · ข้อยกเว้นใช้ได้เฉพาะไฟล์ของมัน", () => {
    expect(ตรวจ(`const s = "ก๊อปลิงก์";`).map(x => x.ห้าม)).toEqual(["ก๊อป"]);
    expect(ตรวจ(`const s = "ดีลเลอร์ขอโค้ดยืนยันอีเมลติดต่อ";`, "apps/hq/app/api/account/route.ts")).toEqual([]);
    expect(ตรวจ(`const s = "ดีลเลอร์ขอโค้ดยืนยันอีเมลติดต่อ";`, "apps/hq/app/api/other/route.ts").map(x => x.ห้าม)).toEqual(["โค้ดยืนยัน"]);
    for (const y of ยกเว้น as { เหตุผล: string }[]) expect(y.เหตุผล.length, "ข้อยกเว้นต้องมีเหตุผล").toBeGreaterThan(10);
  });
  it("ตกบนโค้ดเดิม: ไฟล์รุ่นก่อนแก้ (4e89fa9) มีคำห้าม · รุ่นปัจจุบันไม่มี", () => {
    for (const [ไฟล์, คำ] of [
      ["packages/shared/components/hq/quotations/QuotationTable.tsx", "ราคาส่ง HQ"],
      ["packages/shared/components/ui/ContactEmailForm.tsx", "โค้ดยืนยัน"],
      ["packages/shared/lib/supabaseAuth.ts", "ก๊อป"],
    ] as const) {
      const เดิม = execFileSync("git", ["show", `4e89fa9:${ไฟล์}`], { encoding: "utf8", maxBuffer: 64 << 20 });
      expect(ตรวจ(เดิม, ไฟล์).map(x => x.ห้าม), `${ไฟล์} รุ่นเดิม`).toContain(คำ);
      expect(ตรวจ(readFileSync(ไฟล์, "utf8"), ไฟล์), `${ไฟล์} รุ่นปัจจุบัน`).toEqual([]);
    }
  });
});
