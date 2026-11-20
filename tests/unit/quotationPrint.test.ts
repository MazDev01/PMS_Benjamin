import { describe, it, expect } from "vitest";
import { buildQuotationHTML, DEFAULT_DOC, type DocProfile } from "../../packages/shared/lib/quotationPrint";
import type { QuotationMock, IssuerProfile } from "../../packages/shared/lib/mock";

// ─── เอกสารใบเสนอราคาที่พิมพ์ออกไปหาลูกค้า ───────────────────────────────────
// นี่คือกระดาษแผ่นเดียวที่หลุดออกไปนอกบริษัท — พิมพ์ผิดคือเสียหายกับลูกค้าจริง
// เดิมไม่มีเทสต์เลยสักข้อ (ช่องว่างที่ผลตรวจภายนอกทักไว้ 24 ส.ค. 69)

const ผู้ออก: IssuerProfile = { company: "เชียงใหม่สตีล", address: "1 ถ.นิมมาน", phone: "053-000-000", taxId: "0505500000" };

function ใบ(o: Partial<QuotationMock> = {}): QuotationMock {
  return {
    id: "Q-CNX-1001", customer: "หจก. ทดสอบ", project: "โกดังเก็บสินค้า",
    total: "฿1,000,000", totalValue: 1_000_000, materialCost: 600_000,
    province: "เชียงใหม่", buildingType: "โกดังสำเร็จรูป", area: 800,
    status: "sent_to_client", date: "2026-06-01", items: 1,
    customerId: 1, projectId: 1, ...o,
  } as QuotationMock;
}

describe("ยอดเงินบนเอกสาร", () => {
  it("แยก ก่อน VAT / ภาษี / รวมสุทธิ ถูกต้องตามอัตราที่ส่งมา", () => {
    const html = buildQuotationHTML(ใบ(), ผู้ออก, undefined, { ...DEFAULT_DOC, vatPercent: 7 });
    expect(html).toContain("1,000,000");   // ก่อน VAT
    expect(html).toContain("70,000");      // ภาษี 7%
    expect(html).toContain("฿1,070,000");  // รวมสุทธิ
  });

  it("VAT 0% ต้องพิมพ์ภาษี 0 และรวมสุทธิเท่ายอดก่อน VAT (ห้ามคิด 7% ทับ)", () => {
    const html = buildQuotationHTML(ใบ(), ผู้ออก, undefined, { ...DEFAULT_DOC, vatPercent: 0 });
    expect(html).toContain("ภาษีมูลค่าเพิ่ม 0%");
    expect(html).toContain("฿1,000,000");
  });
});

describe("วันยืนราคา — ต้องมาจากข้อมูลจริง ห้ามเขียนตายในเอกสาร", () => {
  it("มีวันหมดอายุบนใบ → ใช้วันนั้น", () => {
    const html = buildQuotationHTML(ใบ({ expiry: "2026-07-15" }), ผู้ออก, undefined, DEFAULT_DOC);
    expect(html).toContain("15 ก.ค. 2569");
  });

  it("ไม่มีวันหมดอายุ → นับจากวันที่ออก + อายุใบที่ดีลเลอร์ตั้งไว้ (ไม่ใช่ 30 วันตายตัว)", () => {
    const doc: DocProfile = { ...DEFAULT_DOC, validityDays: 45 };
    const html = buildQuotationHTML(ใบ({ date: "2026-06-01" }), ผู้ออก, undefined, doc);
    expect(html).toContain("16 ก.ค. 2569");   // 1 มิ.ย. + 45 วัน
    expect(html).not.toContain("1 ก.ค. 2569"); // ไม่ใช่ 30 วัน
  });

  it("ทั้งเอกสารต้องไม่มีข้อความ 'ยืนราคา 30 วัน' เขียนตาย เมื่อดีลเลอร์ตั้งอายุใบเป็น 45", () => {
    const html = buildQuotationHTML(ใบ(), ผู้ออก, undefined, { ...DEFAULT_DOC, validityDays: 45 });
    expect(html).not.toMatch(/ยืนราคา\s*30\s*วัน/);
  });
});

describe("เงื่อนไข — ไม่กรอกต้องไม่ยัดข้อความให้", () => {
  it("เงื่อนไขว่าง → มีแต่บรรทัดวันยืนราคา ไม่มีข้อความที่ระบบแต่งเอง", () => {
    const html = buildQuotationHTML(ใบ(), ผู้ออก, undefined, { ...DEFAULT_DOC, termsAndConditions: "" });
    const ส่วนเงื่อนไข = html.split('<div class="terms">')[1] ?? "";
    expect(ส่วนเงื่อนไข.split("<br/>").filter(l => l.includes("•")).length).toBeLessThanOrEqual(1);
  });

  it("ดีลเลอร์พิมพ์เงื่อนไขเอง → ต้องขึ้นครบทุกบรรทัด", () => {
    const html = buildQuotationHTML(ใบ(), ผู้ออก, undefined, { ...DEFAULT_DOC, termsAndConditions: "มัดจำ 30%\nส่งมอบใน 60 วัน" });
    expect(html).toContain("มัดจำ 30%");
    expect(html).toContain("ส่งมอบใน 60 วัน");
  });
});

describe("รายการสินค้า", () => {
  it("มีรายการจริง (BOQ) → พิมพ์ทุกแถวพร้อมยอดต่อแถว", () => {
    const html = buildQuotationHTML(
      ใบ({ lineItems: [
        { name: "เสาเหล็ก H-Beam", qty: 10, unit: "ต้น", unitPrice: 25_000 },
        { name: "แผ่นหลังคาเมทัลชีท", qty: 500, unit: "ตร.ม.", unitPrice: 350 },
      ] as QuotationMock["lineItems"] }),
      ผู้ออก, undefined, DEFAULT_DOC,
    );
    expect(html).toContain("เสาเหล็ก H-Beam");
    expect(html).toContain("250,000");   // 10 × 25,000
    expect(html).toContain("175,000");   // 500 × 350
  });

  it("ใบเก่าที่ไม่มีรายการ → ต้องยังพิมพ์ได้ ไม่ใช่ตารางว่าง", () => {
    const html = buildQuotationHTML(ใบ(), ผู้ออก, undefined, DEFAULT_DOC);
    expect(html).toContain("โกดังเก็บสินค้า");
    expect(html).toContain("800");
  });
});

describe("ความปลอดภัยของเอกสาร", () => {
  it("ชื่อลูกค้าที่มีอักขระพิเศษ ต้องถูกแปลงก่อนใส่ลงเอกสาร (กันสคริปต์แฝง)", () => {
    const html = buildQuotationHTML(ใบ(), ผู้ออก, { company: '<script>alert(1)</script>' }, DEFAULT_DOC);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("หัวเอกสารต้องเป็นชื่อบริษัทดีลเลอร์ ไม่มีชื่อ Benjamin (ตามข้อบังคับเรื่องแบรนด์)", () => {
    const html = buildQuotationHTML(ใบ(), ผู้ออก, undefined, DEFAULT_DOC);
    expect(html).toContain("เชียงใหม่สตีล");
    expect(html.toLowerCase()).not.toContain("benjamin");
  });
});

describe("ภาษีหัก ณ ที่จ่ายบนเอกสาร (บอสสั่ง 28 ส.ค. 69)", () => {
  it("ใบที่ตั้งหัก ณ ที่จ่าย 3% → เอกสารต้องมีบรรทัดหักและยอดชำระสุทธิที่ถูกต้อง", () => {
    const html = buildQuotationHTML(ใบ({ totalValue: 1_000_000, vatPercent: 7, whtRate: 3 }), ผู้ออก, undefined, DEFAULT_DOC);
    expect(html).toContain("ภาษีมูลค่าเพิ่ม 7%");
    expect(html).toContain("รวมเป็นเงิน");
    expect(html).toContain("หัก ณ ที่จ่าย 3%");
    expect(html).toContain("ยอดชำระสุทธิ");
    expect(html).toContain("1,070,000");   // รวมเป็นเงิน
    expect(html).toContain("30,000");      // หัก ณ ที่จ่าย (คิดจากยอดก่อน VAT)
    expect(html).toContain("1,040,000");   // ยอดชำระสุทธิ
  });

  it("ใบที่ไม่ได้ตั้งหัก ณ ที่จ่าย → ต้องไม่มีบรรทัดหัก และยอดชำระสุทธิเท่ายอดรวม", () => {
    const html = buildQuotationHTML(ใบ({ totalValue: 500_000, vatPercent: 7 }), ผู้ออก, undefined, DEFAULT_DOC);
    expect(html).not.toContain("หัก ณ ที่จ่าย");
    expect(html).toContain("535,000");
  });

  it("อัตราที่ตรึงไว้กับใบต้องชนะค่าที่ส่งมาจากหน้าจอ (ใบเก่าพิมพ์ซ้ำแล้วต้องได้ตัวเลขเดิม)", () => {
    const html = buildQuotationHTML(ใบ({ totalValue: 100_000, vatPercent: 0, whtRate: 5 }), ผู้ออก, undefined,
      { ...DEFAULT_DOC, vatPercent: 7 });
    expect(html).toContain("ภาษีมูลค่าเพิ่ม 0%");
    expect(html).toContain("หัก ณ ที่จ่าย 5%");
    expect(html).toContain("95,000");      // 100,000 − 5,000
  });
});

// ── หัว/ท้ายเอกสาร (ตั้งค่าดีลเลอร์ › เอกสาร · 19 พ.ย. 69 เดิมบันทึกแล้วไม่พิมพ์) · ว่าง = ไม่พิมพ์ ──
//   ตกบนโค้ดเดิม (97a8ab9e): ไม่มี data-doc-header/data-doc-footer ในเอกสาร
describe("หัว/ท้ายเอกสารจากตั้งค่าดีลเลอร์", () => {
  it("กรอกหัว/ท้าย → พิมพ์ หัวใต้ข้อมูลบริษัท · ท้ายก่อนลายเซ็น", () => {
    const html = buildQuotationHTML(ใบ(), ผู้ออก, undefined, { ...DEFAULT_DOC, header: "ตัวแทนจำหน่ายอาคารเหล็กสำเร็จรูป", footer: "ขอบคุณที่ไว้วางใจ" } as DocProfile);
    expect(html).toContain('<div class="doc-header" data-doc-header>ตัวแทนจำหน่ายอาคารเหล็กสำเร็จรูป</div>');
    expect(html).toContain('<div class="doc-footer" data-doc-footer>ขอบคุณที่ไว้วางใจ</div>');
    expect(html.indexOf("data-doc-header")).toBeGreaterThan(html.indexOf('class="issuer-meta"'));
    expect(html.indexOf("data-doc-header")).toBeLessThan(html.indexOf('class="parties"'));
    expect(html.indexOf("data-doc-footer")).toBeLessThan(html.indexOf('<div class="signs">'));
  });
  it("หัว/ท้ายว่าง (หรือมีแต่ช่องว่าง) → ไม่พิมพ์กล่อง", () => {
    for (const doc of [DEFAULT_DOC, { ...DEFAULT_DOC, header: "  ", footer: "" } as DocProfile]) {
      const html = buildQuotationHTML(ใบ(), ผู้ออก, undefined, doc);
      expect(html).not.toContain("data-doc-header");
      expect(html).not.toContain("data-doc-footer");
    }
  });
  it("อักขระพิเศษในหัว/ท้ายถูกแปลงก่อนใส่เอกสาร", () => {
    const html = buildQuotationHTML(ใบ(), ผู้ออก, undefined, { ...DEFAULT_DOC, header: "<script>x</script>" } as DocProfile);
    expect(html).not.toContain("<script>x</script>");
  });
});

// ── ตั้งค่าเอกสารว่างทั้งก้อน (ฐานจริง 19 พ.ย. 69: dealer_settings.document ว่าง 156 จาก 156) → ใช้ค่าตั้งต้น พิมพ์ได้ครบ ──
//   ที่อ่านตั้งค่า: { ...DEFAULT_DOC, ...document } (HttpAdapter/SupabaseAdapter) — document = {} ได้ DEFAULT_DOC พอดี
describe("ตั้งค่าเอกสารว่าง = ค่าตั้งต้น", () => {
  it("VAT 7% · ยืนราคา 30 วันจากวันที่ออก · ไม่มีเงื่อนไขแต่งเอง · ไม่มีหัว/ท้าย", () => {
    const ตั้งค่า = { ...DEFAULT_DOC, ...({} as Partial<DocProfile>) };
    const html = buildQuotationHTML(ใบ({ date: "2026-06-01", expiry: undefined }), ผู้ออก, undefined, ตั้งค่า);
    expect(html).toContain("ภาษีมูลค่าเพิ่ม 7%");
    expect(html).toContain("฿1,070,000");
    expect(html).toContain("ราคานี้ยืนยันถึงวันที่ 1 ก.ค. 2569");
    expect(html).not.toContain("data-doc-header");
    expect(html).not.toContain("data-doc-footer");
    expect(DEFAULT_DOC).toMatchObject({ vatPercent: 7, validityDays: 30, quotePrefix: "Q-", runningNumber: 1001 });
  });
});

// ── อีเมล/เว็บไซต์ของบริษัทบนหัวใบ (ใบ 0289 · บอสเลือก ก 19 พ.ย. 69) — ต่อจากโทร · ว่าง = ไม่พิมพ์บรรทัด ──
//   ตกบนโค้ดเดิม: หัวใบไม่มีอีเมล/เว็บไซต์
describe("อีเมล/เว็บไซต์บนหัวใบ", () => {
  it("กรอกแล้ว → พิมพ์ต่อจากบรรทัดโทร ก่อนเลขผู้เสียภาษี", () => {
    const html = buildQuotationHTML(ใบ(), { ...ผู้ออก, email: "cnx@example.test", website: "https://cnx.example.test" }, undefined, DEFAULT_DOC);
    const ส่วน = html.slice(html.indexOf('<div class="issuer-meta">'), html.indexOf("</div>", html.indexOf('<div class="issuer-meta">')));
    expect(ส่วน).toContain("อีเมล cnx@example.test");
    expect(ส่วน).toContain("https://cnx.example.test");
    expect(ส่วน.indexOf("โทร. ")).toBeLessThan(ส่วน.indexOf("อีเมล "));
    expect(ส่วน.indexOf("https://cnx.example.test")).toBeLessThan(ส่วน.indexOf("เลขผู้เสียภาษี"));
  });
  it("ว่าง/ช่องว่างล้วน/ไม่มีช่อง → ไม่มีบรรทัดอีเมล/เว็บไซต์", () => {
    for (const x of [ผู้ออก, { ...ผู้ออก, email: "  ", website: "" }]) {
      const html = buildQuotationHTML(ใบ(), x, undefined, DEFAULT_DOC);
      expect(html).not.toContain("อีเมล ");
    }
  });
});
