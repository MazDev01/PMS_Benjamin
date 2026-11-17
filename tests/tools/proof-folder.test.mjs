// ── ข้อทดสอบ: โฟลเดอร์พิสูจน์บนโค้ดเดิม (scripts/proof-folder.mjs · บอสสั่ง 11 พ.ย. 69) ─────────────────────────
//   เหตุ: ลิงก์ "ef-proof-old${d}node_modules" ค้างในเครื่อง (ตัวแปรไม่ถูกแทนค่าในคำสั่งที่พิมพ์เอง) · เคยถอยไฟล์ในโฟลเดอร์ทำงาน
//   ตก: ชื่อมี $ { } % ` หรือตัวแบ่งพาธ · ปลายทางอยู่ใน/เป็นโฟลเดอร์ทำงานหรือโฟลเดอร์หลัก · ปลายทางลิงก์มีตัวแปรค้าง/ไม่มีจริง
//   ลบ: ถอดลิงก์ก่อน ไฟล์ปลายทางของลิงก์ต้องยังอยู่ครบ
//   ตกบนโค้ดเดิม: ไม่มีสคริปต์ (ทุกข้อตก)
// รัน: node tests/tools/proof-folder.test.mjs (ไม่แตะฐาน)
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const ราก = process.cwd();
let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n   ${String(เพิ่ม).slice(-600)}`}`); };
const สคริปต์ = join(ราก, "scripts/proof-folder.mjs");
ผล(existsSync(สคริปต์), "มีสคริปต์ scripts/proof-folder.mjs");
if (!existsSync(สคริปต์)) { console.log(`\n✗ ตก ${ตก} ข้อ`); process.exit(1); }   // ไม่ใช่การข้าม: ไม่มีสคริปต์ = ตกแล้ว

const m = await import(pathToFileURL(สคริปต์).href);
const โยน = (fn) => { try { fn(); return ""; } catch (e) { return String(e.message); } };

// 1) ชื่อโฟลเดอร์
for (const ชื่อ of ["ef-proof-old${d}node_modules", "ef-proof-{x}", "ef-%D%", "ef-`x`", "a/b", "a\\b", "", ".."])
  ผล(/หยุด|ชื่อเดียว|ใช้ได้เฉพาะ|ไม่ได้ระบุ/.test(โยน(() => m.ตรวจชื่อโฟลเดอร์(ชื่อ))), `ชื่อ "${ชื่อ}" ถูกปฏิเสธ`);
ผล(โยน(() => m.ตรวจชื่อโฟลเดอร์("ef-proof-charts")) === "", "ชื่อปกติ ef-proof-charts ผ่าน");
ผล(/ตัวแปรไม่ถูกแทนค่า/.test(โยน(() => m.ตรวจชื่อโฟลเดอร์("ef-proof-old${d}node_modules"))), "ข้อความบอกว่าตัวแปรไม่ถูกแทนค่า");

// 2) ที่ตั้ง: ห้ามอยู่ใน/เป็น โฟลเดอร์ทำงานหรือโฟลเดอร์หลัก
const ทำงาน = "C:/.claude/pms-wt/ef", หลัก = "C:/.claude/Benjamin-HQ-main";
for (const [เป้า, ชื่อ] of [[ทำงาน, "เป็นโฟลเดอร์ทำงาน"], [`${ทำงาน}/proof`, "อยู่ในโฟลเดอร์ทำงาน"], [หลัก, "เป็นโฟลเดอร์หลัก"],
  ["C:\\.claude\\Benjamin-HQ-main\\x", "อยู่ในโฟลเดอร์หลัก (ตัวแบ่ง \\)"], ["C:/.claude", "ครอบโฟลเดอร์ทำงาน"]])
  ผล(/ห้ามพิสูจน์/.test(โยน(() => m.ตรวจที่ตั้ง(เป้า, ทำงาน, หลัก))), `ที่ตั้งถูกปฏิเสธ: ${ชื่อ}`);
ผล(โยน(() => m.ตรวจที่ตั้ง("C:/.claude/pms-wt/ef-proof-charts", ทำงาน, หลัก)) === "", "ที่ตั้งโฟลเดอร์แยกข้าง ๆ ผ่าน");

// 3) แผนลิงก์: ปลายทางมีตัวแปรค้าง / ไม่มีจริง = หยุด
ผล(/ตัวแปรไม่ถูกแทนค่า/.test(โยน(() => m.แผนลิงก์("C:/.claude/pms-wt/ef-proof-x", "C:/.claude/pms-wt/ef${d}", () => true))), "ต้นทางมี ${d} = หยุด");
ผล(/ไม่มีอยู่จริง/.test(โยน(() => m.แผนลิงก์("C:/.claude/pms-wt/ef-proof-x", ทำงาน, () => false))), "ปลายทางลิงก์ไม่มีจริง = หยุด");
ผล(โยน(() => m.แผนลิงก์("C:/.claude/pms-wt/ef-proof-x", ทำงาน, () => true)) === "", "แผนลิงก์ปกติผ่าน");

// 4) คำสั่ง สร้าง ชื่อแปลก → ออก 1 และไม่สร้างอะไร
const r = spawnSync(process.execPath, [สคริปต์, "สร้าง", "--ชื่อ", "ef-proof-old${d}node_modules", "--commit", "a9458ceb"], { encoding: "utf8" });
ผล(r.status === 1 && /ตัวแปรไม่ถูกแทนค่า/.test(r.stderr), "คำสั่งสร้างชื่อแปลก = ออก 1 พร้อมเหตุผล", `${r.status} ${r.stdout}${r.stderr}`);
ผล(!existsSync(join(m.ที่เก็บเริ่มต้น, "ef-proof-old${d}node_modules")), "ไม่มีโฟลเดอร์ชื่อแปลกเกิดขึ้น");

// 5) ลบ: ถอดลิงก์ก่อน ปลายทางไม่ถูกแตะ
const ที่ = mkdtempSync(join(tmpdir(), "proof-folder-"));
try {
  const ปลาย = join(ที่, "ของจริง"); mkdirSync(ปลาย); writeFileSync(join(ปลาย, "สำคัญ.txt"), "ห้ามหาย");
  const ที่เก็บ = join(ที่, "wt"); const เป้า = join(ที่เก็บ, "ef-proof-t"); mkdirSync(join(เป้า, "apps"), { recursive: true });
  writeFileSync(join(เป้า, "a.txt"), "x");
  symlinkSync(ปลาย, join(เป้า, "node_modules"), "junction");
  symlinkSync(ปลาย, join(เป้า, "apps", "node_modules"), "junction");
  const พลาด = โยน(() => m.ลบ({ ชื่อ: "ef-proof-t", ต้นทาง: join(ที่, "ef"), ที่เก็บ }));
  ผล(พลาด === "", "ลบโฟลเดอร์พิสูจน์ที่มีลิงก์ได้", พลาด);
  ผล(!existsSync(เป้า), "โฟลเดอร์พิสูจน์หายแล้ว");
  ผล(existsSync(join(ปลาย, "สำคัญ.txt")), "ไฟล์ปลายทางของลิงก์ยังอยู่ (ไม่ตามเข้าไปลบ)");
} finally {
  // ลิงก์ที่อาจค้าง (ถ้าข้อลบตก) ถอดด้วย rmdir ก่อนล้างโฟลเดอร์ชั่วคราว — ไม่ตามเข้าไปลบปลายทาง
  for (const l of [join(ที่, "wt", "ef-proof-t", "node_modules"), join(ที่, "wt", "ef-proof-t", "apps", "node_modules")])
    if (existsSync(l)) spawnSync("cmd", ["/c", "rmdir", l]);
  rmSync(ที่, { recursive: true, force: true });
}

console.log(ตก ? `\n✗ ตก ${ตก} ข้อ` : "\nALL PASS");
process.exit(ตก ? 1 : 0);
