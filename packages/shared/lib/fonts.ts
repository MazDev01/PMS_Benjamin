// ── ฟอนต์ของทั้งสองแอป: Noto Sans Thai จากไฟล์ในโปรเจกต์ (ไม่ดึงจากอินเทอร์เน็ตตอนสร้างเว็บ) ───────────────────────────────
//   เดิม next/font/google ดึงฟอนต์จาก Google ทุกครั้งที่ build — 11 พ.ย. 69 11:54 Google ล้มชั่วคราว รอบตรวจ build ไม่ผ่าน
//   ตอนนี้ไฟล์ฟอนต์อยู่ที่ packages/shared/fonts (ฟอนต์ตัวเดิม Noto Sans Thai แบบแปรผัน น้ำหนัก 100–900 · สัญญาอนุญาต OFL-1.1
//   ไฟล์ OFL-LICENSE.txt · ที่มา @fontsource-variable/noto-sans-thai 5.3.0) แยก 2 ไฟล์ตามชุดตัวอักษรแบบเดียวกับที่ Google แบ่ง:
//   ไทย · ละติน (ตัวเลข/อังกฤษ) — --font-sans ใน globals.css เรียงละตินก่อน ไทยตามหลัง (ตัวอักษรไทยไม่มีในไฟล์ละติน → ใช้ไฟล์ไทย)
//   ตัวตรวจ tests/tools/no-remote-font.test.mjs: ห้ามกลับไปใช้ next/font/google
import localFont from "next/font/local";

export const notoThai = localFont({
  src: [{ path: "../fonts/noto-sans-thai-thai-wght-normal.woff2", weight: "100 900", style: "normal" }],
  variable: "--font-noto-thai",
  display: "swap",
});

export const notoLatin = localFont({
  src: [{ path: "../fonts/noto-sans-thai-latin-wght-normal.woff2", weight: "100 900", style: "normal" }],
  variable: "--font-noto-latin",
  display: "swap",
  // ไม่สร้างฟอนต์สำรองของละติน (ฟอนต์เครื่อง เช่น Arial) — ถ้ามีจะคั่นอยู่ก่อนฟอนต์ไทยใน --font-sans
  //   เครื่องที่ฟอนต์สำรองมีตัวอักษรไทยจะดึงไทยไปแสดงด้วยฟอนต์เครื่องแทน Noto Sans Thai
  adjustFontFallback: false,
});
