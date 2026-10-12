import { test, expect } from "@playwright/test";
import { HQ_ORIGIN, DEALER_ORIGIN } from "./funcHelpers";

// ── หัวข้อความปลอดภัยของหน้าเว็บ ต้องมีครบทั้งสองแอป ────────────────────────────
// เดิมไม่ได้ตั้งอะไรเลย เบราว์เซอร์จึงยอมให้เว็บอื่นเอาหน้าเราไปฝังใน iframe (หลอกให้กดปุ่ม)
// เดาชนิดไฟล์เอง และส่งที่อยู่หน้าจอ (ที่มีรหัสสาขา/เลขที่เอกสาร) ต่อไปเว็บภายนอก
test.setTimeout(120_000);

const REQUIRED: Array<[string, RegExp]> = [
  ["x-frame-options", /DENY/i],
  ["x-content-type-options", /nosniff/i],
  ["referrer-policy", /strict-origin/i],
  ["permissions-policy", /camera=\(\)/i],
  // ต้องเป็นหัวข้อ "บังคับใช้จริง" ไม่ใช่ "รายงานอย่างเดียว" — ต่างกันสิ้นเชิงเรื่องผล
  // (7 ส.ค. 69 · L-2 · ก่อนหน้านี้ตั้งเป็น Content-Security-Policy-Report-Only ซึ่งเบราว์เซอร์ไม่บล็อกอะไรเลย)
  ["content-security-policy", /frame-ancestors 'none'/i],
  // ปลายทางภายนอกต้องถูกจำกัด — ถ้าใครเผลอเปิดกว้าง (เช่นใส่ * ) ข้อนี้จะจับได้
  ["content-security-policy", /connect-src 'self' https:\/\/\*\.supabase\.co/i],
  // ฟอนต์ของเอกสารที่พิมพ์ต้องไม่ถูกบล็อก ไม่งั้นใบเสนอราคาที่ส่งลูกค้าจะเปลี่ยนฟอนต์
  ["content-security-policy", /font-src[^;]*fonts\.gstatic\.com/i],
];

// ห้ามเหลือหัวข้อโหมด "รายงานอย่างเดียว" ค้างไว้คู่กัน — จะทำให้เข้าใจผิดว่ายังไม่ได้บังคับใช้
const FORBIDDEN = ["content-security-policy-report-only"];

for (const [name, origin, path] of [
  ["สำนักงานใหญ่", HQ_ORIGIN, "/hq/login"],
  ["ดีลเลอร์", DEALER_ORIGIN, "/login"],
] as const) {
  test(`หน้าเว็บฝั่ง${name} ต้องมีหัวข้อความปลอดภัยครบ`, async ({ request }) => {
    const res = await request.get(`${origin}${path}`);
    expect(res.status(), `เปิดหน้าได้ (ได้ ${res.status()})`).toBeLessThan(400);
    const headers = res.headers();
    const missing = REQUIRED.filter(([h, re]) => !re.test(headers[h] ?? ""));
    expect(missing.map(m => m[0]),
      `ขาดหัวข้อความปลอดภัย: ${missing.map(m => m[0]).join(", ")} (ที่ได้: ${Object.keys(headers).filter(k => /security|frame|content-type-opt|referrer|permissions/.test(k)).join(", ")})`,
    ).toEqual([]);
    const leftover = FORBIDDEN.filter(h => headers[h]);
    expect(leftover, `ต้องไม่เหลือหัวข้อโหมดรายงานอย่างเดียว: ${leftover.join(", ")}`).toEqual([]);
  });
}
