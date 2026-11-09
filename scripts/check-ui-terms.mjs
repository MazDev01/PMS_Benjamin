// ── ตัวตรวจ: คำที่ห้ามในข้อความบนจอทั้ง 2 แอป (บอสสั่ง 9 พ.ย. 69 "ตรวจคำที่ดูแปลก" · คลังคำ docs/glossary.md) ─────────────────────
//   ตรวจข้อความที่ผู้ใช้เห็นในทุกไฟล์ .ts/.tsx ที่ git เก็บใต้ apps/ และ packages/shared/ (หน้าจอ · ปุ่ม · ป้าย · หัวตาราง · ตัวกรอง ·
//   ข้อความเตือน/ผิดพลาด · ข้อความ API · PDF/พิมพ์ (lib/*Print.ts) · ไฟล์ส่งออก) — คอมเมนต์/ชื่อตัวแปร/คีย์ไม่นับ (scripts/lib/uiTexts.mjs)
//   ข้อความที่ฐานสร้าง (กระดิ่ง/อีเมล) ตรวจที่ supabase/tests/ui_terms_db.sql · รายการคำ = scripts/lib/uiTerms.mjs
//   เจอคำห้าม = ตก (รอบตรวจเต็มตก) · ข้อทดสอบ: tests/unit/uiTerms.test.ts
import { readFileSync } from "node:fs";
import { ไฟล์ที่gitเก็บ } from "./lib/gitFiles.mjs";
import { ข้อความบนจอ } from "./lib/uiTexts.mjs";
import { หาคำห้าม, ไฟล์ไม่ตรวจ } from "./lib/uiTerms.mjs";

const ไม่ใช่หน้าจอ = /\.d\.ts$|\/(tests?|__tests__)\/|\.test\.|\.spec\./;
const ไฟล์ = ไฟล์ที่gitเก็บ(["apps", "packages/shared"], { ext: /\.(tsx|ts)$/ }).map(f => f.split("\\").join("/")).filter(f => !ไม่ใช่หน้าจอ.test(f) && !ไฟล์ไม่ตรวจ.some(r => r.test(f)));
const เจอ = [];
for (const f of ไฟล์) เจอ.push(...หาคำห้าม(f, ข้อความบนจอ(readFileSync(f, "utf8"), f)));
if (เจอ.length) {
  console.error(`✗ check-ui-terms: พบคำห้ามบนจอ ${เจอ.length} จุด (คลังคำ docs/glossary.md)`);
  for (const x of เจอ) console.error(`  ${x.ไฟล์}:${x.line} — "${x.ห้าม}" → ใช้ "${x.ใช้}" · ${x.text.slice(0, 90)}`);
  process.exit(1);
}
console.log(`✓ check-ui-terms: ข้อความบนจอ ${ไฟล์.length} ไฟล์ ไม่มีคำห้ามในคลังคำ`);
