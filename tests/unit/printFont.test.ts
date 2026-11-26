import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { buildQuotationHTML, DEFAULT_DOC } from "../../packages/shared/lib/quotationPrint";
import { buildDealerProposalHTML } from "../../packages/shared/lib/dealerProposalPrint";
import { ฟอนต์พิมพ์CSS, ไฟล์ฟอนต์พิมพ์, ที่ฟอนต์พิมพ์ } from "../../packages/shared/lib/printFont";
import type { QuotationMock, IssuerProfile } from "../../packages/shared/lib/mock";
import type { DealerPackageProposal, HQCompany } from "../../packages/shared/lib/data/types";

// ── หน้าพิมพ์ใบใช้ Sarabun จากไฟล์ในโปรเจกต์ ไม่โหลดจาก Google ตอนพิมพ์ (บอสสั่ง 12 พ.ย. 69 · ทำ 26 พ.ย. 69) ──────────────
//   ตกบนโค้ดเดิม: หน้าพิมพ์ทั้งสองแบบมี <link> ไป fonts.googleapis.com · ไม่มีไฟล์ Sarabun ในแอป · ไม่มี lib/printFont.ts
//   ตรวจในเบราว์เซอร์จริงตอนตัดอินเทอร์เน็ต: tests/scenario/print-font-offline.spec.ts

const ราก = path.resolve(__dirname, "../..");
const ใบเสนอ = { id: "Q-ZZ-1", customer: "หจก. ทดสอบ", project: "โกดัง", total: "฿1", totalValue: 1000, materialCost: 0, province: "ระยอง",
  buildingType: "โกดัง", area: 10, status: "sent_to_client", date: "2026-11-26", items: 1, customerId: 1, projectId: 1 } as QuotationMock;
const ผู้ออก: IssuerProfile = { company: "ZZ ทดสอบ", address: "ที่อยู่ทดสอบ", phone: "000-000-0001", taxId: "" };
const ใบแฟรนไชส์ = { id: "1", proposalNo: "DP-ZZ-1", status: "draft", region: "ตะวันออก", province: "ระยอง", amount: 1, terms: "-" } as unknown as DealerPackageProposal;
const hq = { name: "ZZ HQ", address: "", taxId: "", phone: "", email: "", website: "" } as HQCompany;

const หน้าพิมพ์ = [
  ["ใบเสนอราคา", () => buildQuotationHTML(ใบเสนอ, ผู้ออก, undefined, DEFAULT_DOC)],
  ["ใบค่าแฟรนไชส์", () => buildDealerProposalHTML(ใบแฟรนไชส์, { name: "ผู้สนใจทดสอบ" }, hq)],
] as const;

describe("หน้าพิมพ์ใบ: ฟอนต์ Sarabun จากเว็บเราเอง", () => {
  for (const [ชื่อ, สร้าง] of หน้าพิมพ์) {
    it(`${ชื่อ}: ไม่มีคำขอไป Google (fonts.googleapis.com / fonts.gstatic.com)`, () => {
      const html = สร้าง();
      expect(html).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/);
      expect(html).not.toMatch(/<link[^>]+stylesheet/i);
    });
    it(`${ชื่อ}: ประกาศ @font-face Sarabun ครบ 8 ไฟล์ (ไทย + ละติน · 400/600/700/800) จาก ${ที่ฟอนต์พิมพ์}`, () => {
      const html = สร้าง();
      const ที่อ้าง = [...html.matchAll(/@font-face\{font-family:'Sarabun'[^}]*src:url\(([^)]+)\)/g)].map(m => m[1]);
      expect(ที่อ้าง.map(u => u.split("/").pop()).sort()).toEqual([...ไฟล์ฟอนต์พิมพ์].sort());
      expect(ที่อ้าง.every(u => u.includes(`${ที่ฟอนต์พิมพ์}/`))).toBe(true);
      expect(html).toMatch(/font-family:'Sarabun'/);
    });
  }

  it("ใส่ต้นทางเว็บได้ (หน้าต่างพิมพ์ใช้ที่อยู่เต็ม) · ตัด / ท้าย", () => {
    expect(ฟอนต์พิมพ์CSS("https://pms.example.test/")).toContain("url(https://pms.example.test/fonts/sarabun/sarabun-thai-400-normal.woff2)");
    expect(ฟอนต์พิมพ์CSS("")).toContain("url(/fonts/sarabun/sarabun-latin-800-normal.woff2)");
  });

  it("ช่วงตัวอักษรไทยครอบ ก–๛ และ ฿ · ละตินครอบตัวเลข/อังกฤษ", () => {
    const css = ฟอนต์พิมพ์CSS("");
    expect(css).toMatch(/sarabun-thai-400-normal\.woff2\) format\('woff2'\);unicode-range:[^}]*U\+0E01-0E5B/);
    expect(css).toMatch(/sarabun-latin-400-normal\.woff2\) format\('woff2'\);unicode-range:U\+0000-00FF/);
  });

  it("ไฟล์ฟอนต์มีจริงในทั้งสองแอป · เป็น woff2 · ไฟล์ตรงกันทุกไบต์ · มีสัญญาอนุญาต OFL", () => {
    const sha = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");
    for (const f of ไฟล์ฟอนต์พิมพ์) {
      const [hqไฟล์, dealerไฟล์] = ["hq", "dealer"].map(แอป => path.join(ราก, `apps/${แอป}/public${ที่ฟอนต์พิมพ์}`, f));
      expect(existsSync(hqไฟล์), `ไม่มี ${hqไฟล์}`).toBe(true);
      expect(existsSync(dealerไฟล์), `ไม่มี ${dealerไฟล์}`).toBe(true);
      expect(readFileSync(hqไฟล์).subarray(0, 4).toString("latin1")).toBe("wOF2");
      expect(sha(hqไฟล์)).toBe(sha(dealerไฟล์));
    }
    for (const แอป of ["hq", "dealer"])
      expect(readFileSync(path.join(ราก, `apps/${แอป}/public${ที่ฟอนต์พิมพ์}/OFL-LICENSE.txt`), "utf8")).toContain("SIL Open Font License");
  });
});
