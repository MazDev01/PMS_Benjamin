// ── ตัวตรวจ: แอปต้องไม่ใช้ "แม่แบบ" แล้ว (บอสสั่งเอาแม่แบบออกทั้งระบบ 16 ต.ค. 69) ──────────────────────────────
//
// ฐานข้อมูลเก็บตาราง/มุมมองแม่แบบไว้ (ห้าม drop) แต่ไม่มีโค้ดแอปไหนอ่านหรือเขียนอีก
//   ทาง API /api/v1/catalog ตอบ 410 · หน้าแม่แบบของดีลเลอร์ (/products) และ HQ (/hq/master) ลบแล้ว
// ตก เมื่อเจอในโค้ดแอป (apps/ · packages/ — ไม่นับข้อทดสอบ/สคริปต์):
//   • master_catalog / master_catalog_public  — ตาราง/มุมมองแม่แบบ
//   • catalog-plans                            — ที่เก็บไฟล์แบบแปลนของแม่แบบ
//   • useMasterCatalog / catalogRepo / CatalogRepo / subscribeCatalog / uploadCatalog / catalogUrl / removeCatalog
//   • TemplateSelect / solutionProducts / loadMasterCatalog — ตัวเลือก/ข้อมูลแม่แบบในแอป
//
// ใช้: node scripts/check-no-catalog.mjs   (อยู่ใน pnpm checks)
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ราก = ["apps", "packages"];
const ข้าม = /node_modules|[\\/]\.next[\\/]|[\\/]dist[\\/]|[\\/]\.turbo[\\/]/;
const กฎ = [
  [/\bmaster_catalog(_public)?\b/, "อ้างถึงตาราง/มุมมองแม่แบบ"],
  [/catalog-plans/, "อ้างถึงที่เก็บแบบแปลนของแม่แบบ"],
  [/\b(useMasterCatalog\w*|catalogRepo|CatalogRepo|subscribeCatalog|uploadCatalog|catalogUrl|removeCatalog)\b/, "ใช้ตัวอ่าน/เขียนแม่แบบของชั้นข้อมูล"],
  [/\b(TemplateSelect|solutionProducts|loadMasterCatalog)\b/, "ใช้ตัวเลือก/ข้อมูลแม่แบบในแอป"],
];

const เจอ = [];
const เดิน = (d) => {
  for (const n of readdirSync(d)) {
    const p = path.join(d, n);
    if (ข้าม.test(p + path.sep)) continue;
    if (statSync(p).isDirectory()) { เดิน(p); continue; }
    if (!/\.(ts|tsx|mjs|js)$/.test(n)) continue;
    let ในคำอธิบาย = false;
    readFileSync(p, "utf8").split(/\r?\n/).forEach((บรรทัด, i) => {
      let ตัด = บรรทัด;
      if (ในคำอธิบาย) { const จบ = ตัด.indexOf("*/"); if (จบ < 0) return; ตัด = ตัด.slice(จบ + 2); ในคำอธิบาย = false; }
      ตัด = ตัด.replace(/\/\*.*?\*\//g, "");
      const เริ่ม = ตัด.indexOf("/*"); if (เริ่ม >= 0) { ตัด = ตัด.slice(0, เริ่ม); ในคำอธิบาย = true; }
      ตัด = ตัด.replace(/(^|[^:"'`])\/\/.*$/, "$1");   // ไม่นับคำอธิบายในบรรทัด (ไม่ตัด https://)
      for (const [re, เหตุ] of กฎ) if (re.test(ตัด)) เจอ.push(`${p.replace(/\\/g, "/")}:${i + 1}  ${เหตุ}\n      ${บรรทัด.trim().slice(0, 110)}`);
    });
  }
};
for (const r of ราก) เดิน(r);
if (เจอ.length) {
  console.error(`❌ check-no-catalog: โค้ดแอปยังใช้แม่แบบ ${เจอ.length} จุด (เอาแม่แบบออกทั้งระบบแล้ว — ฐานเก็บข้อมูลไว้เฉย ๆ)`);
  for (const x of เจอ.slice(0, 60)) console.error(`  ${x}`);
  if (เจอ.length > 60) console.error(`  … อีก ${เจอ.length - 60} จุด`);
  process.exit(1);
}
console.log("check-no-catalog: ผ่าน — โค้ดแอปไม่อ้างถึงแม่แบบ");
