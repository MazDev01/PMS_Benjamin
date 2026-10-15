// ── ตัวตรวจ: ข้อทดสอบห้าม "หาแถวที่เพิ่งสร้าง" ด้วยป้ายที่แถวเก่าจากรอบก่อนก็มี ──────────────
//
// บั๊กจริง (พบ 13 ต.ค. 69 · func-appt-files.spec.ts):
//   ข้อทดสอบสร้างนัดหมายแล้วหาแถวด้วย waitRow(sb, "appointments", { note: "นัดทดสอบอัตโนมัติ …" })
//   · หมายเหตุเป็นค่าคงที่ทุกรอบ (ไม่มีเลขประจำรอบ)
//   · ตัวเก็บกวาดไม่ได้ลบนัดหมายตามหมายเหตุ → แถวค้างสะสม 34 แถว
//   → waitRow คืน "แถวเก่าจากรอบก่อน" มาให้ตรวจแทนแถวที่เพิ่งสร้าง
//   → ข้อทดสอบตรวจเลขนัดของรอบเก่า ผ่านตลอด แม้จงใจทำให้เลขนัดเป็นเลขเวลาก็ยังผ่าน
//
// กติกา: ทุก waitRow(sb, "ตาราง", { ช่อง: ค่า }) ในชุดทดสอบ ต้องเข้าอย่างน้อยหนึ่งข้อ
//   ก) ค้นด้วยตัวระบุแถวโดยตรง (id / code / *_id / เลขที่เอกสาร)
//   ข) (ตาราง, ช่อง) อยู่ในรายการที่ตัวเก็บกวาดกลางลบตามป้ายอยู่แล้ว (funcHelpers.cleanup + global-teardown.sweep)
//   ค) ไฟล์นั้นลบตารางนั้นตามช่องนั้นเอง (.from("ตาราง").delete() … like/eq("ช่อง"))
//   ง) ค่าที่ใช้ค้นมีเลขประจำรอบ (Date.now / Math.random / randomUUID / uniq) — แถวเก่าจับคู่ไม่ได้
//   ไม่เข้าเลย = แถวเก่าค้างและถูกหยิบมาตรวจแทนได้ → ตก
//
// ยกเว้นได้ทางเดียว: เพิ่มรายการใน scripts/lib/staleRowExceptions.mjs (ไฟล์ + ชื่อข้อทดสอบ + ตาราง + เหตุผล) — ไม่มีคอมเมนต์ปิดการตรวจ
// รัน: node scripts/check-test-stale-row-lookup.mjs [โฟลเดอร์]   (ค่าตั้งต้น tests/scenario)
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { ยกเว้น } from "./lib/staleRowExceptions.mjs";

const dir = process.argv[2] ?? "tests/scenario";

// ── (ข) ช่องที่ตัวเก็บกวาดกลางลบตามป้ายทดสอบ — อ่านจากโค้ดจริง ไม่เขียนตายตัว ──
//   เพิ่ม/ถอดการกวาดในสองไฟล์นั้น รายการนี้ขยับตามเอง (เขียนตายตัว = ตัวตรวจโกหกวันที่ตัวกวาดเปลี่ยน)
const กวาดแล้ว = new Set();
{
  const fh = readFileSync(path.join(dir, "funcHelpers.ts"), "utf8");
  const cleanupBody = fh.slice(fh.indexOf("export async function cleanup("), fh.indexOf("\n}\n", fh.indexOf("export async function cleanup(")));
  for (const m of cleanupBody.matchAll(/\.from\("([a-z_]+)"\)\s*\.(?:delete|select)\([^)]*\)[^;]*?\.(?:like|eq)\("([a-z_]+)",\s*`%\$\{tag\}%`/g)) กวาดแล้ว.add(`${m[1]}.${m[2]}`);
  const gt = readFileSync(path.join(dir, "global-teardown.ts"), "utf8");
  for (const m of gt.matchAll(/await del\("([a-z_]+)",\s*"([a-z_]+)",\s*mark\)/g)) กวาดแล้ว.add(`${m[1]}.${m[2]}`);
}
if (กวาดแล้ว.size < 5) {
  console.error(`❌ อ่านรายการของตัวเก็บกวาดได้แค่ ${กวาดแล้ว.size} ช่อง — รูปแบบโค้ดของ cleanup()/sweep() เปลี่ยน ต้องปรับตัวตรวจนี้ตาม`);
  process.exit(1);
}

const ตัวระบุ = c => c === "id" || c === "code" || /_id$/.test(c) || /_no$/.test(c);
const มีเลขประจำรอบ = s => /Date\.now\(\)|Math\.random\(\)|randomUUID\(\)|\buniq\w*\(|\bnanoid\(/.test(s);

/** นิยามของตัวแปรในไฟล์ (const X = …;) — ไล่ตามได้ 3 ชั้น เพื่อดูว่าค่าที่ใช้ค้นมีเลขประจำรอบไหม */
function ขยายค่า(src, expr, depth = 0) {
  if (depth > 3) return expr;
  let out = expr;
  for (const id of new Set(expr.match(/[A-Za-z_฀-๿][\w฀-๿]*/g) ?? [])) {
    const m = src.match(new RegExp(`(?:const|let)\\s+${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*(?::[^=]+)?=\\s*([^;\\n]+)`));
    if (m && m[1] !== expr) out += " ⟵ " + ขยายค่า(src, m[1], depth + 1);
  }
  return out;
}

const บรรทัดที่ = (src, idx) => src.slice(0, idx).split("\n").length;
const พบ = [];
const อ่านไม่ออก = [];
const ใช้แล้ว = new Set();
let ตรวจ = 0;
for (const f of readdirSync(dir).filter(x => /\.spec\.ts$/.test(x))) {
  const src = readFileSync(path.join(dir, f), "utf8");
  const lines = src.split(/\r?\n/);
  // นับทุกจุดที่เรียก — จุดไหนอ่านรูปแบบไม่ออกต้องฟ้อง ไม่ใช่ข้ามเงียบ ๆ (ข้ามเงียบ = ตัวตรวจบอกว่าสะอาดทั้งที่ไม่ได้ดู)
  const ทั้งหมด = [...src.matchAll(/(?<![\w.])waitRow(?:<[^()]*?>)?\(/gs)].filter(x => !/import\s*\{[^}]*$/.test(src.slice(Math.max(0, x.index - 200), x.index)));
  const อ่านได้ = [...src.matchAll(/(?<![\w.])waitRow(?:<[^()]*?>)?\(\s*[^,]+?,\s*"([a-z_]+)"\s*,\s*\{([^}]*)\}/gs)];
  for (const x of ทั้งหมด) {
    if (!อ่านได้.some(y => y.index === x.index)) อ่านไม่ออก.push(`${dir}/${f}:${บรรทัดที่(src, x.index)}`);
  }
  for (const m of อ่านได้) {
    ตรวจ++;
    const table = m[1], obj = m[2];
    const ln = src.slice(0, m.index).split(/\r?\n/).length;
    // ข้อทดสอบที่ครอบจุดนี้อยู่ = test("ชื่อ", …) ตัวล่าสุดก่อนหน้า — ใช้จับคู่กับรายการยกเว้น (ไฟล์ + ชื่อข้อ + ตาราง)
    const หัวข้อ = [...src.slice(0, m.index).matchAll(/\btest(?:\.\w+)?\(\s*(["'`])((?:\\.|(?!\1).)*)\1/gs)].pop()?.[2] ?? "";
    const ข้อยกเว้น = ยกเว้น.find(x => x.file === f && x.table === table && หัวข้อ.includes(x.test));
    if (ข้อยกเว้น) { ใช้แล้ว.add(ข้อยกเว้น); continue; }
    // ช่องที่ใช้ค้น: { ช่อง: ค่า, ช่อง } (แบบย่อ = ชื่อตัวแปรเป็นทั้งช่องและค่า)
    const คู่ = [...obj.matchAll(/([a-z_]+)\s*(?::\s*((?:`[^`]*`|"[^"]*"|[^,])+))?/g)].map(x => ({ col: x[1], val: (x[2] ?? x[1]).trim() }));
    const ผ่าน = คู่.some(({ col, val }) =>
      ตัวระบุ(col)                                                                           // ก
      || กวาดแล้ว.has(`${table}.${col}`)                                                      // ข
      || new RegExp(`\\.from\\("${table}"\\)\\s*\\.delete\\(\\)[^;]*\\.(?:like|eq|in)\\("${col}"`, "s").test(src)   // ค
      || มีเลขประจำรอบ(ขยายค่า(src, val)));                                                     // ง
    if (!ผ่าน) พบ.push({ f, ln, table, cols: คู่.map(k => k.col).join(", "), หัวข้อ });
  }
}
// รายการยกเว้นที่ไม่ตรงกับจุดไหนแล้ว = ข้อทดสอบถูกเปลี่ยน/ลบ ต้องเอารายการออก ไม่ปล่อยค้าง
const ยกเว้นค้าง = ยกเว้น.filter(x => !ใช้แล้ว.has(x));
for (const x of ยกเว้น) {
  if (!x.file || !x.test || !x.table || String(x.reason ?? "").trim().length < 20) {
    console.log(`  ✗ รายการยกเว้นไม่ครบ (ต้องมี file + test + table + เหตุผลที่อธิบายได้จริง): ${JSON.stringify(x).slice(0, 120)}`);
    ยกเว้นค้าง.push(x);
  }
}

for (const p of พบ) {
  console.log(`  ✗ ${dir}/${p.f}:${p.ln}  waitRow("${p.table}", { ${p.cols} })`);
  console.log(`      ค้นด้วยช่องที่ไม่มีใครเก็บกวาด และค่าไม่มีเลขประจำรอบ — แถวค้างจากรอบก่อนจะถูกหยิบมาตรวจแทนแถวที่เพิ่งสร้าง`);
  console.log(`      แก้: ใส่เลขประจำรอบในค่า (เช่น #\${Date.now()}) หรือ ลบ "${p.table}" ตามช่องนั้นทั้งก่อนและหลังข้อทดสอบ`);
}
for (const x of อ่านไม่ออก) console.log(`  ? ${x}  เรียก waitRow ในรูปแบบที่ตัวตรวจอ่านไม่ออก — เขียนให้เป็น waitRow(sb, "ตาราง", { ช่อง: ค่า }) หรือกำกับ stale-row-ok`);
console.log(`ข้อทดสอบที่หาแถวด้วยป้ายที่แถวเก่าก็มี: ${พบ.length} (ตรวจ ${ตรวจ} จุด · อ่านไม่ออก ${อ่านไม่ออก.length} · ตัวเก็บกวาดกลางครอบ ${กวาดแล้ว.size} ช่อง)`);
for (const x of ยกเว้นค้าง) console.log(`  ✗ รายการยกเว้นที่ไม่ตรงกับจุดไหนแล้ว: ${x.file} › ${x.test} (${x.table}) — เอาออกจาก scripts/lib/staleRowExceptions.mjs`);
if (ยกเว้น.length) console.log(`รายการยกเว้นที่ใช้อยู่: ${ยกเว้น.length - ยกเว้นค้าง.length} (ดูเหตุผลใน scripts/lib/staleRowExceptions.mjs)`);
process.exit(พบ.length || อ่านไม่ออก.length || ยกเว้นค้าง.length ? 1 : 0);
