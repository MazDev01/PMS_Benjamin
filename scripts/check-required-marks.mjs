// ── ตัวตรวจ: ช่องบังคับต้องมี * สีแดงจากตัวกลาง (บอสสั่ง 4 พ.ย. 69) ─────────────────────────────────────────────────
//
// รายการช่องบังคับทั้งระบบอยู่ไฟล์เดียว scripts/required-fields.json (ช่องที่ฐานบังคับ + ที่ FLOW ใช้ทำงานต่อ + ที่บอสสั่ง)
//   แต่ละรายการ = { file, id, ชื่อ, ที่มา } — id = htmlFor ของป้ายช่อง (id ของ input/select/textarea)
// ตก เมื่อ:
//   1) ช่องในรายการไม่มี <FieldLabel htmlFor="id" required> ในไฟล์นั้น (ป้ายกลาง components/ui/FieldLabel.tsx · * แดง data-required)
//   2) ช่องที่ติด required ยังมีข้อความตัวอย่าง "เว้นว่าง…" (ช่องบังคับห้ามบอกว่าเว้นว่างได้)
//   3) รายการชี้ไฟล์ที่ไม่มีอยู่ (ย้าย/ลบไฟล์แล้วต้องแก้รายการ)
// PMS_REQ_CHECK_ROOT = โฟลเดอร์จำลอง (ข้อทดสอบของตัวตรวจ tests/tools/required-marks.test.mjs)
import { readFileSync, existsSync, globSync } from "node:fs";
import { join } from "node:path";

const ราก = process.env.PMS_REQ_CHECK_ROOT ?? process.cwd();
const รายการ = JSON.parse(readFileSync(join(ราก, "scripts/required-fields.json"), "utf8")).ช่อง ?? [];
const พบ = [];

/** แท็กเปิดทั้งก้อน (ข้ามหลายบรรทัดได้) ของทุก <ชื่อ ...> ในไฟล์ */
function แท็ก(src, ชื่อ) {
  const ผล = [];
  const re = new RegExp(`<${ชื่อ}\\b`, "g");
  let m;
  while ((m = re.exec(src))) {
    let i = m.index, ลึก = 0;
    for (; i < src.length; i++) {
      const c = src[i];
      if (c === "{") ลึก++;
      else if (c === "}") ลึก--;
      else if (c === ">" && ลึก === 0) break;
    }
    ผล.push({ ข้อความ: src.slice(m.index, i + 1), บรรทัด: src.slice(0, m.index).split("\n").length });
  }
  return ผล;
}
const htmlForของ = (t) => /htmlFor=(?:"([^"]+)"|\{"([^"]+)"\})/.exec(t)?.slice(1).find(Boolean) ?? null;

const อ่านแล้ว = new Map();
const อ่าน = (f) => { if (!อ่านแล้ว.has(f)) อ่านแล้ว.set(f, readFileSync(join(ราก, f), "utf8")); return อ่านแล้ว.get(f); };

for (const r of รายการ) {
  if (!existsSync(join(ราก, r.file))) { พบ.push(`${r.file} — ไม่มีไฟล์นี้แล้ว (รายการช่องบังคับ: ${r.ชื่อ} · ${r.id}) — แก้ scripts/required-fields.json`); continue; }
  const src = อ่าน(r.file);
  const ป้าย = แท็ก(src, "FieldLabel").filter(t => htmlForของ(t.ข้อความ) === r.id);
  if (!ป้าย.some(t => /\srequired(\s|>|=\{true\})/.test(t.ข้อความ))) {
    พบ.push(`${r.file} — ช่อง "${r.ชื่อ}" (${r.id}) ไม่มี <FieldLabel htmlFor="${r.id}" required> (* แดงจากตัวกลาง · ที่มา: ${r.ที่มา})`);
  }
}

// ช่องที่ติด required ห้ามมีข้อความตัวอย่าง "เว้นว่าง"
const ไฟล์ = globSync("{apps,packages}/**/*.tsx", { cwd: ราก, exclude: p => p.includes("node_modules") || p.includes(".next") }).map(f => f.replace(/\\/g, "/"));
for (const f of ไฟล์) {
  const src = อ่าน(f);
  if (!src.includes("FieldLabel")) continue;
  const บังคับ = new Set(แท็ก(src, "FieldLabel").filter(t => /\srequired(\s|>|=\{true\})/.test(t.ข้อความ)).map(t => htmlForของ(t.ข้อความ)).filter(Boolean));
  for (const ชื่อ of ["input", "select", "textarea"]) for (const t of แท็ก(src, ชื่อ)) {
    const id = /\sid=(?:"([^"]+)"|\{"([^"]+)"\})/.exec(t.ข้อความ)?.slice(1).find(Boolean);
    if (id && บังคับ.has(id) && /placeholder=[^>]*เว้นว่าง/.test(t.ข้อความ)) พบ.push(`${f}:${t.บรรทัด} — ช่องบังคับ "${id}" มีข้อความตัวอย่าง "เว้นว่าง…" — ช่องบังคับเว้นว่างไม่ได้`);
  }
}

for (const x of พบ) console.log(`  ✗ ${x}`);
console.log(`ช่องบังคับที่ไม่มี * แดงจากตัวกลาง/บอกว่าเว้นว่างได้: ${พบ.length} (ตรวจ ${รายการ.length} ช่องในรายการ · ${ไฟล์.length} ไฟล์)`);
process.exit(พบ.length ? 1 : 0);
