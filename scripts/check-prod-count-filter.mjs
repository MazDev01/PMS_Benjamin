// ── ตัวตรวจ: สคริปต์ที่นับ/รายงานข้อมูลบนฐานจริง ต้องตัดข้อมูลทดสอบผ่านตัวกรองกลาง (บอสสั่ง 29 ต.ค. 69 · คิวข้อ 11) ───────
//
// เหตุจริง 29 ต.ค. 69: ef นับใบตอบรับบนฐานจริงได้ 1 ใบ รายงานบอสว่าเป็นใบจริง — ที่จริงเป็นใบของสาขาทดสอบ ZZT (prod-live)
//   สคริปต์แต่ละตัวเคยเขียนเกณฑ์ข้อมูลทดสอบเอง (acceptance-check ดูแค่ป้าย ZZTEST · preflight นับบัญชี live-hq เป็นผู้ดูแลจริง)
// กติกา: ไฟล์ที่ git เก็บใต้ scripts/ และ tests/prod-live/ ที่ (ก) ชี้ฐานจริง — เรียก loadTarget( · ส่ง "--linked" ให้ CLI · เรียก prod:query
//   และ (ข) นับ/รวมยอด — count: "exact" · count(*) · .length · .reduce( · sum(
//   ต้อง import ตัวกรองกลาง scripts/lib/prodRealData.mjs — ไม่งั้นตก
// เครื่องมือที่ทำกับทั้งฐานโดยตั้งใจ (สำรอง · กู้ · ล้าง · เติมข้อมูลตั้งต้น) อยู่ในรายการ "ทำทั้งฐาน" ด้านล่างพร้อมเหตุผล
//   ข้อยกเว้นของสคริปต์นับมีตัวเดียว: ชุดล้างข้อมูลทดสอบ prod-live (นับแถวทดสอบ ZZT ที่จะลบ = ต้องเห็นแถวทดสอบ)
//   ชื่อในรายการที่ไม่มีไฟล์แล้ว หรือไม่เข้าเกณฑ์ (ก)+(ข) แล้ว = ตก ให้เอาออก (รายการไม่ค้างเกินจริง)
// PMS_PCF_ROOT = โฟลเดอร์จำลอง (ข้อทดสอบ tests/tools/prod-count-filter.test.mjs) — เดินไฟล์ทั้งโฟลเดอร์แทน git
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { ไฟล์ที่gitเก็บ } from "./lib/gitFiles.mjs";

const ราก = process.env.PMS_PCF_ROOT ? path.resolve(process.env.PMS_PCF_ROOT) : process.cwd();
const ตัวกรอง = "scripts/lib/prodRealData.mjs";

// เครื่องมือที่ทำกับทุกแถวของฐานโดยตั้งใจ — ไม่ใช่สคริปต์นับ/รายงานข้อมูลจริง
const ทำทั้งฐาน = {
  "scripts/backup.mjs": "สำรองทุกแถว แล้วนับเทียบต้นทาง–ไฟล์สำรอง (ตัดแถวทดสอบ = ตัวเลขไม่ตรงกับที่สำรองจริง)",
  "scripts/backup-drill.mjs": "ซ้อมกู้ นับทุกแถวเทียบไฟล์สำรอง",
  "scripts/restore.mjs": "กู้ทุกแถวจากไฟล์สำรอง นับเทียบ",
  "scripts/prod-backup-verify.mjs": "สำรอง+ซ้อมกู้ก่อน db:push นับทุกตารางเทียบต้นทาง–ฐานซ้อมกู้",
  "scripts/go-live-reset.mjs": "ล้างร่องรอยการทดสอบก่อนเปิดใช้ นับทั้งตารางก่อน/หลังล้าง",
  "scripts/seed-dealers.mjs": "เติมทะเบียนดีลเลอร์จริงจาก Excel (เขียน ไม่ได้นับรายงาน)",
  "scripts/seed-hq-leads.mjs": "เติมลูกค้าเป้าหมาย HQ ตั้งต้น (เขียน ไม่ได้นับรายงาน)",
  "scripts/seed-hq-settings.mjs": "เติมค่าตั้ง HQ ตั้งต้น (เขียน ไม่ได้นับรายงาน)",
  "scripts/git-hooks/pre-push.mjs": "ตรวจเลขใบปรับฐานที่ลงแล้วก่อน push (นับใบปรับฐาน ไม่ได้นับข้อมูลธุรกิจ)",
  "scripts/prod-query.mjs": "ตัวส่งคำสั่ง SQL ต่อให้ CLI ผ่านคิวล็อก — คนเขียน SQL นับต้องใส่ เงื่อนไขSQLสาขาจริง() เอง",
};
// ข้อยกเว้นของสคริปต์นับ (ตัวเดียว)
const ข้อยกเว้น = {
  "tests/prod-live/run.mjs": "ชุดล้างข้อมูลทดสอบ ZZT ของ prod-live — นับแถวทดสอบที่จะลบ จึงต้องเห็นแถวทดสอบ",
};

const ชี้ฐานจริง = /\bloadTarget\s*\(|["'`]--linked["'`]|prod-query\.mjs|prod:query/;
const นับ = /count:\s*["']exact["']|count\(\*\)|\.length\b|\.reduce\(|\bsum\(/;
const ใช้ตัวกรอง = /from\s+["'][./]*(?:scripts\/)?lib\/prodRealData\.mjs["']|prodRealData\.mjs["']/;

function เดิน(dir, ออก = []) {
  for (const n of readdirSync(dir)) {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) { if (n !== "node_modules") เดิน(p, ออก); }
    else if (n.endsWith(".mjs")) ออก.push(path.relative(ราก, p).split(path.sep).join("/"));
  }
  return ออก;
}
const ไฟล์ = process.env.PMS_PCF_ROOT
  ? ["scripts", "tests/prod-live"].filter(d => existsSync(path.join(ราก, d))).flatMap(d => เดิน(path.join(ราก, d)))
  : ไฟล์ที่gitเก็บ(["scripts", "tests/prod-live"], { ext: /\.mjs$/ }).map(f => f.replace(/\\/g, "/"));   // Windows คืน "\" — เทียบกับรายการด้วย "/"

const ผิด = [], เข้าเกณฑ์ = new Set();
for (const f of ไฟล์) {
  if (f === ตัวกรอง || /^scripts\/check-/.test(f)) continue;   // ตัวกรองเอง · ตัวตรวจอ่านโค้ด ไม่ได้อ่านฐาน
  const เนื้อ = readFileSync(path.join(ราก, f), "utf8");
  if (!ชี้ฐานจริง.test(เนื้อ) || !นับ.test(เนื้อ)) continue;
  เข้าเกณฑ์.add(f);
  if (ทำทั้งฐาน[f] || ข้อยกเว้น[f] || ใช้ตัวกรอง.test(เนื้อ)) continue;
  ผิด.push(f);
}
const ค้าง = Object.keys({ ...ทำทั้งฐาน, ...ข้อยกเว้น }).filter(f => !เข้าเกณฑ์.has(f));

if (ผิด.length || ค้าง.length) {
  if (ผิด.length) {
    console.error(`✗ check-prod-count-filter: สคริปต์ ${ผิด.length} ไฟล์นับ/รายงานฐานจริงโดยไม่ตัดข้อมูลทดสอบผ่านตัวกรองกลาง:`);
    for (const f of ผิด) console.error(`   ${f}`);
    console.error(`   แก้: import { แถวจริง } from "./lib/prodRealData.mjs" แล้วนับจาก แถวจริง(rows) · นับด้วย SQL ใช้ เงื่อนไขSQLสาขาจริง()`);
    console.error(`        (ตัดสาขา ZZT/ZZ…/ZT… · อีเมล @example.test / live-… · ป้าย ZZTEST/ZZLOAD — อย่าเขียนเกณฑ์เอง)`);
  }
  if (ค้าง.length) {
    console.error(`✗ check-prod-count-filter: รายชื่อในรายการ "ทำทั้งฐาน"/ข้อยกเว้นที่ไม่มีไฟล์แล้วหรือไม่เข้าเกณฑ์แล้ว — เอาออกจากรายการในไฟล์นี้:`);
    for (const f of ค้าง) console.error(`   ${f}`);
  }
  process.exit(1);
}
console.log(`✓ check-prod-count-filter: สคริปต์ที่นับฐานจริง ${เข้าเกณฑ์.size - Object.keys(ทำทั้งฐาน).length - Object.keys(ข้อยกเว้น).length} ไฟล์ตัดข้อมูลทดสอบผ่าน ${ตัวกรอง} · ทำทั้งฐาน ${Object.keys(ทำทั้งฐาน).length} · ข้อยกเว้น ${Object.keys(ข้อยกเว้น).length}`);
