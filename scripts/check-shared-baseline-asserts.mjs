// ── ข้อทดสอบห้ามนับ/ตรวจตรงเป๊ะจากข้อมูลตั้งต้นร่วม โดยไม่สร้างข้อมูลของตัวเอง (บอสสั่ง 29 ต.ค. 69 · คิวรอบหน้าข้อ 3) ─────
//
// เหตุ: ข้อทดสอบรันพร้อมกัน 3 ไฟล์บนฐานทดสอบชุดเดียว · หลายข้อนับลีด/ลูกค้า/ใบของสาขาตั้งต้น (RYG CNX …) หรือยอดทั้งเครือ
//   แล้วเทียบตรงเป๊ะกับหน้าจอ/ค่าก่อนหน้า — ข้ออื่นเขียนสาขาเดียวกันพร้อมกัน → ตัวเลขขยับ → ตกแบบสุ่ม
//   (29 ต.ค. 69 เสียรอบตรวจ 4 รอบ: ใบค่าแฟรนไชส์ · ลูกค้าทั้งเครือ · ภาพรวม HQ · ตั้งดีลเลอร์ระยอง · ตัวกรองค้างติดต่อ)
// กติกา (ต่อข้อทดสอบ 1 ข้อ = บล็อก test(...) หนึ่งบล็อก):
//   ตก ถ้าบล็อก (ก) อ่านขอบเขตร่วม — นับแถวของสาขาตั้งต้นที่ฐาน / อ่านตัวเลขการ์ด·แถบแบ่งหน้า·แถวตารางบนหน้าจอ
//              (ข) ตรวจแบบตรงเป๊ะ (toBe · toEqual · toHaveCount · toHaveText · data-value) และ
//              (ค) ไม่ได้สร้างข้อมูลของตัวเอง — ไม่มี สร้างสาขาของข้อ() (tests/scenario/ownDealer.ts)
//                  และไม่กรองด้วยป้ายของข้อ (ค้น/กรองด้วยตัวแปรป้ายที่สร้างจาก Date.now() / ZZTEST-… ของข้อนั้น)
//   ข้อเก่าที่ยังไม่ได้แก้อยู่ใน scripts/shared-baseline-allowlist.json — รายการลดได้อย่างเดียว
//     · ข้อในรายการที่แก้แล้ว (ไม่เข้าเกณฑ์แล้ว) ต้องเอาออกจากรายการ (ตก) — รายการจึงหดตามงานจริง
//     · เพิ่มรายการใหม่ไม่ได้: เทียบกับรายการบน origin/wip/integration (ถ้ามี) — ชื่อที่ไม่เคยอยู่ = ตก
// PMS_SBA_ROOT = โฟลเดอร์จำลอง (ข้อทดสอบของตัวตรวจ tests/tools/shared-baseline-asserts.test.mjs)
// PMS_SBA_BASE_LIST = ไฟล์รายการฐานสำหรับเทียบ "ห้ามเพิ่ม" (ข้อทดสอบใช้ · ปกติอ่านจาก git)
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const ราก = process.env.PMS_SBA_ROOT ?? process.cwd();
const ที่รายการ = join(ราก, "scripts/shared-baseline-allowlist.json");
const สาขาร่วม = "BKK|CBI|CNX|KKN|NMA|PKT|RYG|UBN";

// ── แยกไฟล์เป็นบล็อกข้อทดสอบ: จาก test("ชื่อ" ถึงก่อน test( ถัดไปที่ต้นบรรทัด ──
function บล็อก(เนื้อ) {
  const เริ่ม = [...เนื้อ.matchAll(/^\s*test(?:\.fixme|\.only)?\(\s*(["'`])((?:\\.|(?!\1).)*)\1/gm)];
  return เริ่ม.map((m, i) => ({ ชื่อ: m[2], ตัว: เนื้อ.slice(m.index, เริ่ม[i + 1]?.index ?? เนื้อ.length) }));
}

// (ก) อ่านขอบเขตร่วม
const นับฐานสาขาร่วม = new RegExp(String.raw`\.eq\(\s*"dealer_code"\s*,\s*"(?:${สาขาร่วม})"\s*\)[^;]*?(?:count:\s*"exact"|\)\)?\.data\)?\s*\?\?\s*\[\]\)?\.length|\.length)`, "s");
const นับฐานทั้งเครือ = /\.from\("(?:leads|customers|quotations|quote_requests|dealers|dealer_prospects|appointments)"\)\.select\([^)]*\{\s*count:\s*"exact"[^}]*\}\)(?![^;]*\.(?:eq|like|ilike|in)\(\s*"(?:company|name|customer|code|dealer_code|id|num_id|lead_num_id|request_no)")/s;
const นับฐาน = /count:\s*"exact"|\.reduce\(/;   // นับแถว / บวกยอดจากฐาน (ใช้คู่กับ .from( ในข้อเดียวกัน)
const อ่านเลขจอ = /Number\(\s*\(?\s*await\s+[^;]*\.(?:innerText|textContent)\(\)|\.(?:innerText|textContent)\(\)\)?\.replace\(\/\[\^\d/;
const อ่านจอ = /data-kpi|\[data-value\]|"data-value"|แสดง \.\* จาก|จาก\\s\+\(\\d\+\)|tbody tr"\)\.count\(\)|locator\("tbody tr"\)\)\.toHaveCount/;
// (ข) ตรวจตรงเป๊ะ
const ตรงเป๊ะ = /\.(?:toBe|toEqual|toStrictEqual|toHaveCount|toHaveText|toContain)\(|toHaveAttribute\(\s*"data-value"/;
// (ค) ข้อมูลของตัวเอง
const สร้างเอง = /สร้างสาขาของข้อ\(/;
const ป้ายของข้อ = (ตัว, ทั้งไฟล์) => {
  // ตัวแปรป้าย = const X = `ZZTEST-…${…}` หรือ `${NS}…` / `${TAG}…` / Date.now() — แล้วถูกใช้กรองฐาน (like/eq ช่องชื่อ) หรือค้นบนจอ (fill)
  const ป้าย = [...ทั้งไฟล์.matchAll(/(?:const|let)\s+([\p{L}\p{M}\w$]+)\s*=\s*`[^`]*(?:ZZTEST|\$\{(?:NS|TAG|แท็ก|ป้าย)\}|Date\.now\(\))[^`]*`/gu)].map(m => m[1]);
  const ใช้ = (x) => String.raw`\x60?(?:\$\{)?${x}(?![\p{L}\p{M}\w$])`;
  return ป้าย.some(x => new RegExp(String.raw`\.(?:like|ilike|eq)\(\s*"(?:company|name|customer|project)"\s*,\s*${ใช้(x)}|\.fill\(\s*${ใช้(x)}`, "u").test(ตัว));
};

// ตัวช่วยระดับไฟล์ (async function X / const X = async …) — ข้อที่เรียกตัวช่วย = นับเนื้อตัวช่วยเป็นของข้อนั้นด้วย (ชั้นเดียว)
//   เนื้อตัวช่วยจบที่หัวตัวช่วยถัดไป หรือ test( / test.beforeAll( ถัดไป
function ตัวช่วย(เนื้อ) {
  const หัว = [...เนื้อ.matchAll(/^(?:export\s+)?(?:async\s+function\s+([\p{L}\p{M}\w$]+)|const\s+([\p{L}\p{M}\w$]+)\s*=\s*(?:async\s*)?\()/gmu)];
  const จบ = [...หัว.map(m => m.index), ...[...เนื้อ.matchAll(/^\s*test(?:\.\w+)?\(/gm)].map(m => m.index)].sort((a, b) => a - b);
  return หัว.map(m => ({ ชื่อ: m[1] ?? m[2], ตัว: เนื้อ.slice(m.index, จบ.find(x => x > m.index) ?? เนื้อ.length) }));
}

function ตรวจไฟล์(ไฟล์) {
  const ทั้งไฟล์ = readFileSync(join(ราก, "tests/scenario", ไฟล์), "utf8");
  if (/^\s*test\.skip\(\s*\(\)\s*=>\s*!process\.env\.PMS_SHOTS/m.test(ทั้งไฟล์)) return [];   // ไฟล์ถ่ายภาพหน้าจอ ไม่ตรวจตัวเลข
  const ช่วย = ตัวช่วย(ทั้งไฟล์);
  // สาขาของข้อที่สร้างระดับไฟล์ (เช่นใน beforeAll: ก = await สร้างสาขาของข้อ()) — นับเป็นข้อมูลของข้อ เฉพาะข้อที่ใช้ตัวแปรนั้นจริง (ก.รหัส / ก.บัญชี)
  //   เดิมยกเว้นทั้งไฟล์เมื่อ beforeAll สร้างสาขา — ข้อในไฟล์เดียวกันที่ยังนับยอดทั้งเครือหลุดไป (ef พบ 29 ต.ค. 69: kpi-cards › ทุกหน้า HQ)
  const ตัวแปรสาขา = [...ทั้งไฟล์.matchAll(/([\p{L}\p{M}\w$]+)\s*=\s*await\s+สร้างสาขาของข้อ\(/gu)].map(m => m[1]);
  //   + ตัวแปรที่รับรหัสจากสาขานั้น (CODE = สาขา.รหัส)
  for (const x of [...ตัวแปรสาขา]) for (const m of ทั้งไฟล์.matchAll(new RegExp(String.raw`([\p{L}\p{M}\w$]+)\s*=\s*${x}\??\.รหัส`, "gu"))) ตัวแปรสาขา.push(m[1]);
  const ใช้รหัส = (ตัว) => ตัวแปรสาขา.some(x => new RegExp(String.raw`(?<![\p{L}\p{M}\w$])${x}(?![\p{L}\p{M}\w$])(?!\??\.)`, "u").test(ตัว));
  const ใช้สาขาไฟล์ = (ตัว) => ตัวแปรสาขา.some(x => new RegExp(String.raw`(?<![\p{L}\p{M}\w$])${x}\??\.(?:รหัส|บัญชี)`, "u").test(ตัว));
  return บล็อก(ทั้งไฟล์).map(({ ชื่อ, ตัว }) => ({ ชื่อ,
    ตัว: [ตัว, ...ช่วย.filter(h => new RegExp(String.raw`(?<![\p{L}\p{M}\w$])${h.ชื่อ}\(`, "u").test(ตัว)).map(h => h.ตัว)].join("\n") }))
    .filter(({ ตัว }) =>
    (นับฐานสาขาร่วม.test(ตัว) || นับฐานทั้งเครือ.test(ตัว) || (นับฐาน.test(ตัว) && /\.from\("/.test(ตัว)) || อ่านจอ.test(ตัว) || อ่านเลขจอ.test(ตัว)) && ตรงเป๊ะ.test(ตัว)
    && !สร้างเอง.test(ตัว) && !ใช้สาขาไฟล์(ตัว) && !ใช้รหัส(ตัว) && !ป้ายของข้อ(ตัว, ทั้งไฟล์))
    .map(({ ชื่อ }) => `${ไฟล์} › ${ชื่อ}`);
}

// ไฟล์ในช่วงที่รันทีละไฟล์ (โปรเจกต์ hq-settings · stress ใน playwright.config.ts) ไม่มีข้ออื่นเขียนพร้อมกัน — ยอดทั้งเครือนิ่ง ไม่ตรวจ
const ค่าตั้ง = existsSync(join(ราก, "playwright.config.ts")) ? readFileSync(join(ราก, "playwright.config.ts"), "utf8") : "";
const รันทีละไฟล์ = new Set(["hq-settings", "stress"].flatMap(ชื่อ => {
  const m = ค่าตั้ง.match(new RegExp(String.raw`name:\s*"${ชื่อ}"[\s\S]*?testMatch:\s*\/\(?([^/)]*)\)?\\.spec\\.ts\/`));
  return m ? m[1].split("|").map(x => `${x}.spec.ts`) : [];
}));
const ที่ข้อ = join(ราก, "tests/scenario");
const พบ = existsSync(ที่ข้อ) ? readdirSync(ที่ข้อ).filter(f => f.endsWith(".spec.ts") && !รันทีละไฟล์.has(f)).sort().flatMap(ตรวจไฟล์) : [];
const รายการ = existsSync(ที่รายการ) ? JSON.parse(readFileSync(ที่รายการ, "utf8")).ข้อ ?? [] : [];

let ฐาน = null;
if (process.env.PMS_SBA_BASE_LIST) ฐาน = existsSync(process.env.PMS_SBA_BASE_LIST) ? JSON.parse(readFileSync(process.env.PMS_SBA_BASE_LIST, "utf8")).ข้อ ?? [] : [];
else {
  try { ฐาน = JSON.parse(execFileSync("git", ["show", "origin/wip/integration:scripts/shared-baseline-allowlist.json"], { cwd: ราก, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })).ข้อ ?? []; }
  catch { ฐาน = null; }   // ยังไม่มีรายการบนสาขารวมงาน (รอบแรก) — ไม่เทียบ
}

const ใหม่ = พบ.filter(x => !รายการ.includes(x));
const แก้แล้ว = รายการ.filter(x => !พบ.includes(x));
const เพิ่มรายการ = ฐาน ? รายการ.filter(x => !ฐาน.includes(x)) : [];
let ตก = false;
if (ใหม่.length) {
  ตก = true;
  console.error(`✗ check-shared-baseline-asserts: ข้อทดสอบ ${ใหม่.length} ข้อนับ/ตรวจตรงเป๊ะจากข้อมูลตั้งต้นร่วม (สาขา ${สาขาร่วม.replaceAll("|", " ")} หรือยอดทั้งเครือ) โดยไม่สร้างข้อมูลของตัวเอง:`);
  for (const x of ใหม่) console.error(`   ${x}`);
  console.error("   แก้: สร้างข้อมูลของข้อเอง — สร้างสาขาของข้อ() (tests/scenario/ownDealer.ts) แล้วนับ/กรองหน้า HQ ด้วยสาขานั้น");
  console.error("        หรือสร้างแถวที่มีป้ายของข้อ (const ป้าย = `ZZTEST-…-${Date.now() % 100000}`) แล้วค้น/กรองด้วยป้ายนั้น");
}
if (แก้แล้ว.length) {
  ตก = true;
  console.error(`✗ check-shared-baseline-asserts: ${แก้แล้ว.length} ข้อในรายการยกเว้นแก้แล้ว — เอาออกจาก scripts/shared-baseline-allowlist.json (รายการลดได้อย่างเดียว):`);
  for (const x of แก้แล้ว) console.error(`   ${x}`);
}
if (เพิ่มรายการ.length) {
  ตก = true;
  console.error(`✗ check-shared-baseline-asserts: เพิ่มรายการยกเว้นไม่ได้ (${เพิ่มรายการ.length} ข้อไม่มีในรายการของ origin/wip/integration) — แก้ข้อทดสอบให้สร้างข้อมูลของตัวเองแทน:`);
  for (const x of เพิ่มรายการ) console.error(`   ${x}`);
}
if (ตก) process.exit(1);
console.log(`✓ check-shared-baseline-asserts: ไม่มีข้อทดสอบใหม่ที่นับตรงเป๊ะจากข้อมูลตั้งต้นร่วม · รายการยกเว้นเหลือ ${รายการ.length} ข้อ`);
