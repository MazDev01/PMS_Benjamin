import { test, expect, type Page } from "@playwright/test";
import { HQ_ORIGIN, DEALER_ORIGIN } from "./funcHelpers";
import { buildQuotationHTML, DEFAULT_DOC } from "../../packages/shared/lib/quotationPrint";
import { buildDealerProposalHTML } from "../../packages/shared/lib/dealerProposalPrint";
import type { QuotationMock, IssuerProfile } from "../../packages/shared/lib/mock";
import type { DealerPackageProposal, HQCompany } from "../../packages/shared/lib/data/types";

// ── หน้าพิมพ์ใบตอนไม่มีอินเทอร์เน็ต: ฟอนต์ Sarabun ยังขึ้น · ไม่มีคำขอไป Google (บอสสั่ง 12 พ.ย. 69 · ทำ 26 พ.ย. 69) ──────────
//   ตัดทุกคำขอที่ไม่ใช่เว็บในเครื่อง (เหมือนเน็ตหลุด / Google ล้ม) แล้วเปิดหน้าต่างพิมพ์แบบเดียวกับปุ่มพิมพ์จริง
//   (window.open("") + document.write · lib/quotationPrint.ts printQuotation · lib/dealerProposalPrint.ts)
//   ตรวจ: document.fonts.load ของ Sarabun ได้ฟอนต์ที่โหลดสำเร็จทั้งตัวไทยและตัวเลข/อังกฤษ (น้ำหนัก 400 + 700) · ไม่มีคำขอไป Google
//   ตกบนโค้ดเดิม: หน้าพิมพ์โหลด Sarabun จาก fonts.googleapis.com → ถูกตัด → ไม่มีฟอนต์ Sarabun โหลดได้ + มีคำขอไป Google
//   ไม่ล็อกอิน ไม่แตะฐาน (หน้าเข้าระบบเป็นต้นทางของหน้าต่างพิมพ์ · ฟอนต์เสิร์ฟจาก public/fonts/sarabun ของแต่ละแอป)
//   วิธีตัด: ตัวหาที่อยู่ของเบราว์เซอร์หาชื่อภายนอกไม่เจอ (ยกเว้นเครื่องตัวเอง) — ห้ามใช้ route ดักคำขอ:
//     คำขอจากหน้าต่าง window.open("") + document.write ค้างในตัวดักของ Playwright ไม่ถึงเซิร์ฟเวอร์ (ลองแล้ว 26 พ.ย. 69 = ข้อค้างจนหมดเวลา)
//   คำสั่งพิมพ์อัตโนมัติของหน้าพิมพ์ (window.print หลังโหลด) ตัดออกก่อนเขียน — กล่องพิมพ์ทำให้เบราว์เซอร์ทดสอบค้าง · ไม่เกี่ยวกับฟอนต์
//   พิสูจน์นอกรอบ (เซิร์ฟเวอร์ไฟล์เล็ก · วิธีเดียวกัน): โค้ดใหม่ Sarabun โหลดได้ 1/1/1/1 คำขอไป Google 0 · โค้ดเดิม 0/0/0/0 คำขอไป Google 1 ต่อหน้า
test.setTimeout(120_000);
test.use({ launchOptions: { args: ["--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost"] } });

const ใบเสนอ = { id: "Q-ZZPF-1", customer: "หจก. ทดสอบฟอนต์", project: "โกดังทดสอบ", total: "฿1,234", totalValue: 1234, materialCost: 0,
  province: "ระยอง", buildingType: "โกดัง", area: 10, status: "sent_to_client", date: "2026-11-26", items: 1, customerId: 1, projectId: 1 } as QuotationMock;
const ผู้ออก: IssuerProfile = { company: "ZZ ทดสอบฟอนต์", address: "ที่อยู่ทดสอบ", phone: "000-000-0001", taxId: "" };
const ใบแฟรนไชส์ = { id: "1", proposalNo: "DP-ZZPF-1", status: "sent", region: "ตะวันออก", province: "ระยอง", amount: 150000, terms: "-" } as unknown as DealerPackageProposal;
const hq = { name: "ZZ HQ ทดสอบฟอนต์", address: "", taxId: "", phone: "", email: "", website: "" } as HQCompany;

/** จดทุกคำขอที่ไม่ใช่เครื่องตัวเอง (ทุกหน้าต่างในบริบทเดียวกัน รวมหน้าต่างพิมพ์) — อินเทอร์เน็ตถูกตัดที่ตัวหาที่อยู่ (test.use ด้านบน) */
function จดคำขอภายนอก(page: Page) {
  const ภายนอก: string[] = [];
  page.context().on("request", (r) => {
    const u = new URL(r.url());
    if (/^https?:$/.test(u.protocol) && !["127.0.0.1", "localhost"].includes(u.hostname)) ภายนอก.push(u.href);
  });
  return ภายนอก;
}
/** หน้าพิมพ์ไม่มีคำสั่งพิมพ์อัตโนมัติ (กล่องพิมพ์ทำให้เบราว์เซอร์ทดสอบค้าง) — ส่วนอื่นของหน้าเหมือนเดิมทุกตัวอักษร */
const ไม่พิมพ์อัตโนมัติ = (html: string) => {
  const ตัด = html.replace(/<script>window\.onload=[^<]*<\/script>/, "");
  expect(ตัด.length, "หน้าพิมพ์ต้องมีคำสั่งพิมพ์อัตโนมัติแบบเดิม (ถ้าเปลี่ยนรูป ต้องแก้ตัวตัดตรงนี้)").toBeLessThan(html.length);
  return ตัด;
};

for (const [ชื่อ, ต้นทาง, หน้าเข้า, สร้าง] of [
  ["HQ · ใบค่าแฟรนไชส์", HQ_ORIGIN, "/hq/login", () => buildDealerProposalHTML(ใบแฟรนไชส์, { name: "ผู้สนใจทดสอบ" }, hq)],
  ["ดีลเลอร์ · ใบเสนอราคา", DEALER_ORIGIN, "/login", () => buildQuotationHTML(ใบเสนอ, ผู้ออก, undefined, DEFAULT_DOC)],
] as const) {
  test(`${ชื่อ}: ตัดอินเทอร์เน็ตแล้วหน้าพิมพ์ยังใช้ Sarabun · ไม่มีคำขอไป Google`, async ({ page }) => {
    const ภายนอก = จดคำขอภายนอก(page);
    await page.goto(`${ต้นทาง}${หน้าเข้า}`, { waitUntil: "domcontentloaded" });
    const html = ไม่พิมพ์อัตโนมัติ(สร้าง());
    const [หน้าพิมพ์] = await Promise.all([
      page.waitForEvent("popup"),
      page.evaluate((h) => { const w = window.open("", "_blank"); w?.document.open(); w?.document.write(h); w?.document.close(); }, html),
    ]);
    await หน้าพิมพ์.waitForLoadState("load");
    const ผล = await หน้าพิมพ์.evaluate(async () => {
      const โหลด = async (แบบ: string, ข้อความ: string) => (await document.fonts.load(แบบ, ข้อความ))
        .filter(f => f.family.replace(/["']/g, "") === "Sarabun" && f.status === "loaded").length;
      await document.fonts.ready;
      return { ไทย400: await โหลด("400 16px Sarabun", "ใบเสนอราคา"), ไทย700: await โหลด("700 16px Sarabun", "ใบเสนอราคา"),
        เลข400: await โหลด("400 16px Sarabun", "Q-1234"), เลข700: await โหลด("700 16px Sarabun", "Q-1234") };
    });
    expect(ผล, "ฟอนต์ Sarabun ต้องโหลดได้จากเว็บเราเองทั้งตัวไทยและตัวเลข/อังกฤษ (400 · 700)").toEqual({ ไทย400: 1, ไทย700: 1, เลข400: 1, เลข700: 1 });
    expect(ภายนอก.filter(u => /fonts\.(googleapis|gstatic)\.com/.test(u)), "ต้องไม่มีคำขอไป Google").toEqual([]);
    await หน้าพิมพ์.close();
  });
}
