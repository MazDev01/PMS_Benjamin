// ── ตัวตรวจ: ชื่อภาคบนหน้าจอต้องมาจากรายการกลาง · ตัวกรองภาคใช้ "ทุกภูมิภาค" (บอสสั่ง 30 ต.ค. 69) ─────────────────────────
//
// เจอ: หน้าลูกค้า HQ แสดง "อีสาน/ใต้" (ค่าดิบในฐาน) แต่หน้าใบเสนอราคาแสดง "ภาคตะวันออกเฉียงเหนือ/ภาคใต้" · ตัวกรองบางหน้า "ทุกภาค"
// กติกา: แสดงภาคผ่าน ชื่อภาค() (lib/provinces.ts) หรือ regionDisplay() (เรียก ชื่อภาค) เท่านั้น — ห้ามแสดงค่า .region ตรง
//   ตก ถ้าในไฟล์ .tsx ใต้ apps/hq และ packages/shared/components:
//   ก. แสดง .region ตรงในเนื้อหา JSX: >{x.region}< · {x.region || "—"} · ภาค{x.region} · value={x.region} ของแถวแสดงผล (PanelRow)
//   ข. ประกอบข้อความแสดงผลด้วย ${x.region} (template) ที่ไม่ใช่คำค้น (บรรทัดที่มี toLowerCase/includes = คำค้น ข้าม)
//   ค. รายการตัวเลือกภาคที่แสดงค่าดิบ (REGIONS.map(r => <option>{r}</option>)) · ต่อภาคดิบด้วย [จังหวัด, x.region].join(…)
//   ง. ป้ายตัวกรองภาค "ทุกภาค" (<option>ทุกภาค</option> หรือคำอธิบายตัวกรอง "ทุกภาค") — ต้องเป็น "ทุกภูมิภาค" (ป้ายทุกภูมิภาค)
//   บรรทัดที่เป็นช่องกรอก (<select · <input · onChange) = ค่าที่เก็บ ไม่ใช่การแสดงผล → ข้าม · ยกเว้นเฉพาะบรรทัดที่มี "ภาคดิบได้:" + เหตุผล
// PMS_RGL_ROOT = โฟลเดอร์จำลอง (ข้อทดสอบ tests/tools/region-labels.test.mjs)
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { ไฟล์ที่gitเก็บ } from "./lib/gitFiles.mjs";

const ราก = process.env.PMS_RGL_ROOT ? path.resolve(process.env.PMS_RGL_ROOT) : process.cwd();
const ที่ตรวจ = ["apps/hq", "packages/shared/components"];
function เดิน(d, ออก = []) {
  if (!existsSync(d)) return ออก;
  for (const n of readdirSync(d)) {
    const p = path.join(d, n);
    if (statSync(p).isDirectory()) { if (n !== "node_modules" && !n.startsWith(".next")) เดิน(p, ออก); }
    else if (n.endsWith(".tsx")) ออก.push(path.relative(ราก, p).split(path.sep).join("/"));
  }
  return ออก;
}
const ไฟล์ = process.env.PMS_RGL_ROOT ? ที่ตรวจ.flatMap(d => เดิน(path.join(ราก, d)))
  : ไฟล์ที่gitเก็บ(ที่ตรวจ, { ext: /\.tsx$/ }).map(f => f.replace(/\\/g, "/"));

const ช่องกรอก = /<select|<input|onChange=|\bkey=\{[^}]*\.region\}/;
const แบบ = [
  ["แสดง .region ตรงในเนื้อหา", />\s*\{\s*[\w.?!]+\.region\s*(\|\|[^}]*)?\}/],
  ["แสดง .region ตรงต่อท้ายคำว่า ภาค", /ภาค\s*\{\s*[\w.?!]+\.region/],
  ["ค่าแสดงผล value={x.region} (PanelRow/แถวข้อมูล)", /<PanelRow[^>]*value=\{\s*[\w.?!]+\.region\s*\}/],
  ["ประกอบข้อความแสดงผลด้วย ${x.region}", /\$\{\s*[\w.?!]+\.region\s*\}/],
  ["รายการตัวเลือกภาคแสดงค่าดิบ (REGIONS.map → {r})", /REGIONS\.map\(\s*(\w+)\s*=>\s*\(?\s*<option[^>]*>\s*\{\s*\1\s*\}/],
  ["ต่อภาคดิบเข้าข้อความด้วย join", /\.region\s*\][^;]*\.join\(/],
  ["ป้ายตัวกรองภาค \"ทุกภาค\" (ต้องเป็น \"ทุกภูมิภาค\")", /<option[^>]*>\s*ทุกภาค\s*<|["']ทุกภาค["']\s*,\s*(regionOpts|REGIONS)|caption=["']ทุกภาค["']/],
];
const ผิด = [];
for (const f of ไฟล์) {
  readFileSync(path.join(ราก, f), "utf8").split(/\r?\n/).forEach((บรรทัด, i) => {
    if (/ภาคดิบได้:/.test(บรรทัด) || /^\s*(\/\/|\*|\{\/\*)/.test(บรรทัด)) return;
    for (const [ชื่อ, re] of แบบ) {
      if (!re.test(บรรทัด)) continue;
      if (ชื่อ.startsWith("ประกอบข้อความ") && /toLowerCase|includes\(/.test(บรรทัด)) continue;   // คำค้น ไม่ใช่การแสดงผล
      if (!ชื่อ.startsWith("ป้ายตัวกรอง") && !ชื่อ.startsWith("รายการตัวเลือก") && ช่องกรอก.test(บรรทัด)) continue;
      ผิด.push(`${f}:${i + 1} ${ชื่อ}: ${บรรทัด.trim().slice(0, 140)}`);
    }
  });
}
if (ผิด.length) {
  console.error(`✗ check-region-labels: ชื่อภาคบนหน้าจอไม่ผ่านรายการกลาง ${ผิด.length} จุด:`);
  for (const x of ผิด) console.error(`   ${x}`);
  console.error(`   แก้: แสดงด้วย ชื่อภาค(x.region) จาก @pms/shared/lib/provinces · ป้ายตัวกรองภาคใช้ ป้ายทุกภูมิภาค ("ทุกภูมิภาค")`);
  process.exit(1);
}
console.log(`✓ check-region-labels: ชื่อภาคบนหน้าจอผ่านรายการกลาง (${ไฟล์.length} ไฟล์)`);
