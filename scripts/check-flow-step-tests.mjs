// ── ตัวตรวจ: ทุกขั้น D/H ใน FLOW ต้องมีข้อทดสอบหน้าเว็บอย่างน้อย 1 ข้อที่ติดรหัสขั้นในชื่อ (บอสสั่ง 28 ต.ค. 69) ───────────────
//
// เหตุ: บอสเจอขั้นที่หน้าเว็บไม่ตรง FLOW ทีละจุด — ขั้นไหนไม่มีข้อทดสอบหน้าเว็บ ไม่มีใครรู้ว่าพัง
// รายการขั้น = แถว <tr><td>D1</td>… / <tr><td>H1</td>… ในตาราง flow ของ docs/FLOW.html (อ่านจาก FLOW ตรง ไม่จดซ้ำที่นี่)
//   (แถวตารางแจ้งเตือนมี data-notif-row — ไม่ใช่ขั้น ไม่นับ)
// ข้อทดสอบหน้าเว็บ = test(...) / test.describe(...) ใน tests/scenario/*.spec.ts ที่ชื่อมี [D3] · [H9x] ฯลฯ (หลายรหัสในชื่อเดียวได้)
//   ไม่นับ: ไฟล์ถ่ายรูป zz-shots* (ไม่ใช่ข้อทดสอบ) · ข้อทดสอบเครื่องมือ *-tool.spec.ts (ไม่ได้เปิดหน้าเว็บ)
// ตก: ขั้นไหนไม่มีข้อเลย · ชื่อข้อติดรหัสที่ FLOW ไม่มี (พิมพ์ผิด/ขั้นถูกลบ)
// ข้อทดสอบ: tests/tools/flow-step-tests.test.mjs (PMS_FLOW_STEP_ROOT = โฟลเดอร์จำลอง)
import fs from "node:fs";
import path from "node:path";

const ROOT = process.env.PMS_FLOW_STEP_ROOT || process.cwd();
const flow = fs.readFileSync(path.join(ROOT, "docs/FLOW.html"), "utf8");
const ขั้น = [...new Set([...flow.matchAll(/<tr><td>([DH]\d+[a-z]?)<\/td>/g)].map(m => m[1]))];
if (!ขั้น.length) { console.log("❌ อ่านรายการขั้นจาก docs/FLOW.html ไม่ได้ (ไม่พบแถว <tr><td>D1</td>…) — รูปแบบตารางเปลี่ยน ต้องแก้ตัวตรวจ"); process.exit(1); }

const โฟลเดอร์ = path.join(ROOT, "tests/scenario");
const ไฟล์ = fs.readdirSync(โฟลเดอร์).filter(f => f.endsWith(".spec.ts") && !f.startsWith("zz-shots") && !f.endsWith("-tool.spec.ts"));
const มี = new Map(ขั้น.map(k => [k, []]));
const ไม่รู้จัก = [];
for (const f of ไฟล์) {
  const text = fs.readFileSync(path.join(โฟลเดอร์, f), "utf8");
  for (const m of text.matchAll(/\btest(?:\.(?:describe|only|fixme|skip))?(?:\.(?:serial|parallel))?\(\s*(["'`])((?:\\.|(?!\1).)*)\1/g)) {
    const บรรทัด = text.slice(0, m.index).split("\n").length;
    for (const t of m[2].matchAll(/\[([DH]\d+[a-z]?)\]/g)) {
      if (มี.has(t[1])) มี.get(t[1]).push(`${f}:${บรรทัด}`);
      else ไม่รู้จัก.push(`${f}:${บรรทัด} [${t[1]}]`);
    }
  }
}
const ขาด = ขั้น.filter(k => !มี.get(k).length);
console.log(`ขั้นใน FLOW ${ขั้น.length} ขั้น · มีข้อทดสอบหน้าเว็บ ${ขั้น.length - ขาด.length} · ขาด ${ขาด.length}${ไม่รู้จัก.length ? ` · รหัสที่ FLOW ไม่มี ${ไม่รู้จัก.length}` : ""}`);
if (!ขาด.length && !ไม่รู้จัก.length) process.exit(0);
if (ขาด.length) console.log(`  ✗ ขั้นที่ยังไม่มีข้อทดสอบหน้าเว็บ (ชื่อข้อต้องมี [รหัส]): ${ขาด.join(" · ")}`);
for (const x of ไม่รู้จัก) console.log(`  ✗ ${x} — FLOW ไม่มีขั้นนี้`);
process.exit(1);
