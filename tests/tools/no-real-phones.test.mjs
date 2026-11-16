// ── ข้อทดสอบ: ตัวตรวจเบอร์โทรรูปแบบจริง + ป้ายข้อมูลจากฐานจริง ในไฟล์ที่ git เก็บ (บอสสั่งด่วน 16 พ.ย. 69 ข้อ 5) ──
//   โฟลเดอร์จำลอง (PMS_PHONE_ROOT): เบอร์มือถือ/บ้าน/+66 รูปแบบจริง = ตก · 000-000-NNNN = ผ่าน · ป้ายข้อมูลจากฐานจริง = ตก
//   ข้อยกเว้นเจาะจงไฟล์+บรรทัดเท่านั้น (บรรทัดอื่นในไฟล์เดียวกัน = ตก) · ข้อยกเว้นค้าง = ตก · repo จริงตอนนี้ = ผ่าน
//   เบอร์ในไฟล์นี้ประกอบตอนรัน (ไม่มีเบอร์รูปแบบจริงเป็นตัวอักษรในไฟล์ ไม่งั้นตัวตรวจจับไฟล์นี้เอง)
// รัน: node tests/tools/no-real-phones.test.mjs
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const ราก = process.cwd();
const ที่ = path.join(ราก, "test-results", `no-real-phones-${process.pid}`);
let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : ` — ${เพิ่ม.slice(0, 400)}`}`); };
const ตรวจ = (root) => spawnSync(process.execPath, [path.join(ราก, "scripts/check-no-real-phones.mjs")],
  { encoding: "utf8", env: { ...process.env, PMS_PHONE_ROOT: root ?? "" }, cwd: ราก });
const ออก = (r) => (r.stdout ?? "") + (r.stderr ?? "");
function จำลอง(ชื่อ, ไฟล์) {
  const r = path.join(ที่, ชื่อ);
  rmSync(r, { recursive: true, force: true });
  for (const [f, เนื้อ] of Object.entries(ไฟล์)) { mkdirSync(path.dirname(path.join(r, f)), { recursive: true }); writeFileSync(path.join(r, f), เนื้อ); }
  return r;
}
// เบอร์รูปแบบจริงประกอบตอนรัน
const ม = ["08", "1-", "555-", "12", "34"].join("");          // มือถือมีขีด
const มต = ["08", "9", "876", "54", "32"].join("");            // มือถือไม่คั่น
const บ้าน = ["0", "2-", "123-", "45", "67"].join("");         // บ้านกรุงเทพ
const ส = ["+66 ", "81 ", "234 ", "56", "78"].join("");        // +66
const ป้าย = "สร้างจาก" + "ฐานจริง";

let r = ตรวจ(จำลอง("ok", { "a.ts": `const phone = "000-000-1234";\nconst x = "0000009001";\n` }));
ผล(r.status === 0, "ก1 เบอร์ 000-000-NNNN ทั้งแบบขีดและไม่คั่น = ผ่าน", ออก(r));

for (const [ชื่อ, เบอร์] of [["มือถือมีขีด", ม], ["มือถือไม่คั่น", มต], ["บ้าน", บ้าน], ["+66", ส]]) {
  r = ตรวจ(จำลอง(`bad-${ชื่อ}`, { "tests/x.spec.ts": `const p = "${เบอร์}";\n` }));
  ผล(r.status === 1 && /เบอร์รูปแบบจริง/.test(ออก(r)) && /tests\/x\.spec\.ts:1/.test(ออก(r)), `ข ${ชื่อ} = ตก พร้อมไฟล์:บรรทัด`, ออก(r));
  ผล(!ออก(r).includes(เบอร์.slice(-4)), `ข ${ชื่อ}: ไม่พิมพ์ 4 หลักท้าย`, ออก(r));
}

r = ตรวจ(จำลอง("phrase", { "seed.ts": `// ข้อมูลชุดนี้${ป้าย} 10 ราย\nexport const x = 1;\n` }));
ผล(r.status === 1 && /seed\.ts:1/.test(ออก(r)), "ค ป้ายข้อมูลจากฐานจริง = ตก", ออก(r));

// ข้อยกเว้นเจาะจงบรรทัด: บรรทัดที่ยกเว้นของ formatPhone.test.ts (7 · 16 · 21 · 22 · 25 · 28) ผ่าน · บรรทัดอื่นในไฟล์เดียวกัน = ตก
const ไฟล์ยกเว้น = "tests/unit/formatPhone.test.ts", แถวยกเว้น = [7, 16, 21, 22, 25, 28];
const บรรทัด = n => Array.from({ length: n }, (_, i) => `// ${i + 1}`);
const ทดสอบเบอร์ = บรรทัด(40); for (const n of แถวยกเว้น) ทดสอบเบอร์[n - 1] = `expect(f("${มต}")).toBe("${ม}"); // ${บ้าน}`;
r = ตรวจ(จำลอง("exc-ok", { [ไฟล์ยกเว้น]: ทดสอบเบอร์.join("\n") }));
ผล(r.status === 0, "ง1 บรรทัดที่ยกเว้นทุกบรรทัด = ผ่าน", ออก(r));
const เลื่อน = [...ทดสอบเบอร์]; เลื่อน.splice(0, 0, "// บรรทัดใหม่ด้านบน");   // ทุกบรรทัดเลื่อนลง 1
r = ตรวจ(จำลอง("exc-shift", { [ไฟล์ยกเว้น]: เลื่อน.join("\n") }));
ผล(r.status === 1 && /ไม่มีอะไรให้ยกเว้น/.test(ออก(r)) && /formatPhone\.test\.ts:8 · เบอร์รูปแบบจริง/.test(ออก(r)), "ง1ข บรรทัดเลื่อน = ข้อยกเว้นค้าง + เบอร์ที่บรรทัดใหม่ตก", ออก(r));
const อีกบรรทัด = [...ทดสอบเบอร์]; อีกบรรทัด[9] = `const p = "${ม}";`;
r = ตรวจ(จำลอง("exc-other-line", { [ไฟล์ยกเว้น]: อีกบรรทัด.join("\n") }));
ผล(r.status === 1 && /formatPhone\.test\.ts:10 · เบอร์รูปแบบจริง/.test(ออก(r)) && !/ไม่มีอะไรให้ยกเว้น/.test(ออก(r)), "ง2 ไฟล์ที่มีข้อยกเว้น แต่คนละบรรทัด = ตก", ออก(r));
// โค้ดแอปที่ส่งให้เบราว์เซอร์ (apps/ · packages/) ต้องไม่มีข้อยกเว้นเลย (บอสต้องการเบอร์รูปแบบจริงใน JS ของเว็บ demo = 0 · 16 พ.ย. 69)
const { ยกเว้น } = await import(new URL(`file:///${ราก.replace(/\\/g, "/")}/scripts/check-no-real-phones.mjs`).href);
ผล(!ยกเว้น.some(x => /^(apps|packages)\//.test(x.ไฟล์)), "ฉ ไม่มีข้อยกเว้นในโค้ดแอป (apps/ · packages/)", JSON.stringify(ยกเว้น.map(x => x.ไฟล์)));

// repo จริงตอนนี้ต้องผ่าน (ข้อยกเว้นตรงทุกบรรทัด ไม่ค้าง)
r = ตรวจ(undefined);
ผล(r.status === 0 && /✓ check-no-real-phones/.test(ออก(r)), "จ repo ตอนนี้ไม่มีเบอร์รูปแบบจริง/ป้าย และข้อยกเว้นไม่ค้าง", ออก(r));

rmSync(ที่, { recursive: true, force: true });
console.log(ตก ? `FAIL ${ตก} ข้อ` : "ALL PASS");
process.exit(ตก ? 1 : 0);
