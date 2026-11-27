// ── ฟอนต์ของหน้าพิมพ์ใบ (Sarabun) จากไฟล์ในโปรเจกต์ — ไม่โหลดจาก Google ตอนพิมพ์ (บอสสั่ง 12 พ.ย. 69 · ทำ 26 พ.ย. 69) ───────
//   เดิม quotationPrint.ts · dealerProposalPrint.ts ใส่ <link> ไป fonts.googleapis.com → เครื่องที่ไม่มีอินเทอร์เน็ต/Google ล้ม
//   = ใบที่พิมพ์ตกไปใช้ฟอนต์เครื่อง หน้าตาเพี้ยน และเบราว์เซอร์ของผู้ใช้ส่งคำขอไป Google ทุกครั้งที่พิมพ์
//   ตอนนี้: ไฟล์ Sarabun (ไทย + ละติน · น้ำหนัก 400/600/700/800 ชุดเดิมที่ใช้) อยู่ใน apps/{hq,dealer}/public/fonts/sarabun
//   (สัญญาอนุญาต OFL-1.1 · ไฟล์ OFL-LICENSE.txt · ที่มา @fontsource/sarabun 5.2.8) · หน้าต่างพิมพ์โหลดจากเว็บเราเอง
//   แบ่งชุดตัวอักษรแบบเดียวกับ Google (unicode-range) — ตัวอักษรไทยโหลดไฟล์ไทย ตัวเลข/อังกฤษโหลดไฟล์ละติน
//   CSP ไม่อนุญาต fonts.googleapis.com / fonts.gstatic.com แล้ว (packages/shared/lib/securityHeaders.mjs)
//   ข้อทดสอบ: tests/unit/printFont.test.ts · tests/scenario/print-font-offline.spec.ts (ตัดอินเทอร์เน็ตแล้วฟอนต์ยังขึ้น)
export const น้ำหนักฟอนต์พิมพ์ = [400, 600, 700, 800] as const;
export const ชุดอักษรฟอนต์พิมพ์ = {
  thai: "U+02D7,U+0303,U+0331,U+0E01-0E5B,U+200C-200D,U+25CC",
  latin: "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
} as const;
export const ที่ฟอนต์พิมพ์ = "/fonts/sarabun";

/** ชื่อไฟล์ฟอนต์ทั้งหมด (ข้อทดสอบใช้ตรวจว่ามีไฟล์จริงในทั้งสองแอป) */
export const ไฟล์ฟอนต์พิมพ์ = (Object.keys(ชุดอักษรฟอนต์พิมพ์) as (keyof typeof ชุดอักษรฟอนต์พิมพ์)[])
  .flatMap(ชุด => น้ำหนักฟอนต์พิมพ์.map(น => `sarabun-${ชุด}-${น}-normal.woff2`));

/** ต้นทางของเว็บที่เปิดหน้าต่างพิมพ์ — หน้าต่างพิมพ์ (about:blank + document.write) ใช้ที่อยู่เต็ม ไม่พึ่งการเดาที่อยู่ฐานของเบราว์เซอร์ */
const ต้นทางเว็บ = () => (typeof location !== "undefined" && /^https?:$/.test(location.protocol) ? location.origin : "");

/** @font-face ของ Sarabun สำหรับใส่ใน <style> ของหน้าพิมพ์ */
export function ฟอนต์พิมพ์CSS(ต้นทาง: string = ต้นทางเว็บ()): string {
  const ราก = `${ต้นทาง.replace(/\/+$/, "")}${ที่ฟอนต์พิมพ์}`;
  return (Object.entries(ชุดอักษรฟอนต์พิมพ์) as [string, string][]).flatMap(([ชุด, ช่วง]) => น้ำหนักฟอนต์พิมพ์.map(น =>
    `@font-face{font-family:'Sarabun';font-style:normal;font-display:swap;font-weight:${น};src:url(${ราก}/sarabun-${ชุด}-${น}-normal.woff2) format('woff2');unicode-range:${ช่วง}}`,
  )).join("\n");
}
