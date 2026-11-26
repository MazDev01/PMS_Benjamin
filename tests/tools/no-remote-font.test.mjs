// ── ข้อทดสอบ: ขั้นสร้างเว็บไม่ดึงฟอนต์จากอินเทอร์เน็ต (คิว 11 พ.ย. 69 · Google ล้มชั่วคราว 11:54 รอบตรวจ build ไม่ผ่าน) ─────────
//   1) ไม่มีโค้ดของแอป/แพ็กเกจกลางใช้ next/font/google (ดึงจาก Google ทุกครั้งที่ build)
//   2) ฟอนต์มาจาก packages/shared/lib/fonts.ts (next/font/local) · ไฟล์ฟอนต์ที่อ้างมีอยู่จริง + สัญญาอนุญาต OFL
//   3) ทั้งสองแอปใส่ตัวแปรฟอนต์ทั้งไทย + ละติน · --font-sans ใช้ทั้งสองตัว
//   4) (26 พ.ย. 69) ไม่มีโค้ดอ้างที่อยู่ฟอนต์ของ Google เลย — หน้าพิมพ์ใบใช้ Sarabun ในโปรเจกต์ (ตกบนโค้ดก่อนหน้า: quotationPrint · dealerProposalPrint · securityHeaders)
//   ตกบนโค้ดเดิม: layout ทั้งสองแอป import Noto_Sans_Thai จาก next/font/google
//   การพิสูจน์ build ตอนไม่มีอินเทอร์เน็ต (ตั้ง proxy ปลอม) ทำในโฟลเดอร์แยก ดูรายงานงาน
// รัน: node tests/tools/no-remote-font.test.mjs
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";

let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n   ${String(เพิ่ม).slice(0, 800)}`}`); };

const ข้าม = new Set(["node_modules", ".next", ".next-test", ".turbo", "dist"]);
const ไล่ = (ที่, ออก = []) => {
  for (const n of readdirSync(ที่)) {
    if (ข้าม.has(n) || n.startsWith(".next")) continue;
    const p = path.join(ที่, n);
    if (statSync(p).isDirectory()) ไล่(p, ออก);
    else if (/\.(tsx?|jsx?|mjs|cjs|css)$/.test(n)) ออก.push(p);
  }
  return ออก;
};
const ไฟล์ = [...ไล่("apps"), ...ไล่("packages")];
const ใช้google = ไฟล์.filter(f => /from\s+["']next\/font\/google["']/.test(readFileSync(f, "utf8")));
ผล(ใช้google.length === 0, "ไม่มีโค้ดใช้ next/font/google (ดึงฟอนต์จาก Google ตอน build)", ใช้google.join("\n"));
// หน้าพิมพ์ใบ (quotationPrint · dealerProposalPrint) เดิมโหลด Sarabun จาก Google ที่เบราว์เซอร์ตอนกดพิมพ์ — 26 พ.ย. 69 (บอสสั่ง 12 พ.ย. 69)
//   ย้ายไฟล์ Sarabun มาไว้ในโปรเจกต์ (lib/printFont.ts · apps/*/public/fonts/sarabun) → โค้ดแอป/แพ็กเกจห้ามมีที่อยู่ฟอนต์ของ Google เลย (นอกคอมเมนต์)
const ที่อยู่google = /fonts\.(googleapis|gstatic)\.com/;
const อ้างgoogle = ไฟล์.flatMap(f => readFileSync(f, "utf8").split(/\r?\n/).map((l, i) => [l, i]).filter(([l]) => ที่อยู่google.test(String(l).replace(/^\s*\/\/.*$/, "").replace(/\s\/\/\s.*$/, ""))).map(([, i]) => `${f}:${Number(i) + 1}`));
ผล(อ้างgoogle.length === 0, "ไม่มีโค้ดอ้าง fonts.googleapis.com / fonts.gstatic.com (หน้าพิมพ์ใบใช้ Sarabun ในโปรเจกต์)", อ้างgoogle.join("\n"));

const fonts = "packages/shared/lib/fonts.ts";
ผล(existsSync(fonts), "มีตัวกลางฟอนต์ packages/shared/lib/fonts.ts");
if (existsSync(fonts)) {
  const s = readFileSync(fonts, "utf8");
  ผล(/from "next\/font\/local"/.test(s), "ตัวกลางฟอนต์ใช้ next/font/local");
  const อ้าง = [...s.matchAll(/path:\s*"([^"]+)"/g)].map(m => path.join(path.dirname(fonts), m[1]));
  ผล(อ้าง.length >= 2 && อ้าง.every(existsSync), "ไฟล์ฟอนต์ที่อ้างมีอยู่จริงทุกไฟล์ (ไทย + ละติน)", อ้าง.join("\n"));
  ผล(/--font-noto-thai/.test(s) && /--font-noto-latin/.test(s), "ตัวแปรฟอนต์ไทย + ละติน");
}
ผล(existsSync("packages/shared/fonts/OFL-LICENSE.txt") && /SIL Open Font License/.test(readFileSync("packages/shared/fonts/OFL-LICENSE.txt", "utf8")), "มีสัญญาอนุญาต OFL คู่กับไฟล์ฟอนต์");
for (const แอป of ["hq", "dealer"]) {
  const l = readFileSync(`apps/${แอป}/app/layout.tsx`, "utf8");
  ผล(/@pms\/shared\/lib\/fonts/.test(l) && /notoThai\.variable/.test(l) && /notoLatin\.variable/.test(l), `แอป ${แอป}: ใช้ตัวกลางฟอนต์ ใส่ตัวแปรไทย + ละติน`);
}
const g = readFileSync("packages/shared/globals.css", "utf8");
ผล(/--font-sans:\s*var\(--font-noto-latin\),\s*var\(--font-noto-thai\)/.test(g), "--font-sans ใช้ฟอนต์ละติน + ไทยจากไฟล์ในโปรเจกต์");

console.log(ตก ? `\n✗ ตก ${ตก} ข้อ` : "\nALL PASS");
process.exit(ตก ? 1 : 0);
