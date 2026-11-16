// ── ข้อทดสอบ: ตัวลงข้อมูลตัวอย่างฐาน dev ปฏิเสธปลายทางที่ไม่ใช่ฐาน dev ในเครื่อง (บอสสั่ง 13 พ.ย. 69) ─────────────────
//   ตัวกัน: ตรวจปลายทาง() ใน scripts/dev-sample/ตัวช่วย.mjs (ทำงานก่อนสร้างการเชื่อมต่อใด ๆ)
//   โหมดตรวจอย่างเดียว: node scripts/dev-sample-data.mjs --ตรวจปลายทาง=<url> — ไม่ต่อฐาน ไม่อ่าน ไม่เขียน
//   (1) ฐานจริง (คลาวด์ *.supabase.co) = ปฏิเสธ exit 1  (2) ฐานทดสอบในเครื่อง (55321) = ปฏิเสธ  (3) เครื่องอื่น = ปฏิเสธ
//   (4) ฐาน dev ในเครื่อง = ผ่าน exit 0  (5) โหมดตรวจไม่ต่อฐานจริง: ไม่มีการเรียกเครือข่าย (ตรวจจากเวลาตอบ + ไม่มีข้อความเชื่อมต่อ)
//   (6) ตัวกันอยู่ก่อน createClient ในเตรียม()
//   ตกบนโค้ดเดิม: ไม่มีโหมดตรวจอย่างเดียว (ตัวรันไม่รู้จักตัวเลือก → เดินลงข้อมูลบนฐาน dev ต่อตามปกติ exit 0)
// รัน: node tests/tools/dev-sample-guard.test.mjs
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n   ${String(เพิ่ม).slice(0, 600)}`}`); };
const ราก = process.cwd();
const ports = JSON.parse(readFileSync(join(ราก, "scripts/lib/ports.json"), "utf8")).ฐาน;
const ตรวจ = (url) => {
  const เริ่ม = Date.now();
  const r = spawnSync(process.execPath, ["scripts/dev-sample-data.mjs", `--ตรวจปลายทาง=${url}`], { cwd: ราก, encoding: "utf8", timeout: 60_000 });
  return { code: r.status, out: (r.stdout ?? "") + (r.stderr ?? ""), ms: Date.now() - เริ่ม };
};

let r = ตรวจ("https://yhhhcrvexample.supabase.co");
ผล(r.code === 1 && /ฐานบนคลาวด์/.test(r.out) && /ฐานจริงห้าม/.test(r.out), "(1) ชี้ฐานจริง (*.supabase.co) = ปฏิเสธ exit 1", JSON.stringify(r));
ผล(!/ข้อมูลตัวอย่างพร้อม|สร้างส่วน|ลบส่วน|เข้าระบบบัญชี/.test(r.out), "(5) ปฏิเสธก่อนเริ่มงานใด ๆ (ไม่มีข้อความลบ/สร้าง/เข้าระบบ)", r.out);
r = ตรวจ(`http://127.0.0.1:${ports.ทดสอบ.api}`);
ผล(r.code === 1 && /ไม่ใช่ฐาน dev/.test(r.out), `(2) ฐานทดสอบในเครื่อง (${ports.ทดสอบ.api}) = ปฏิเสธ`, JSON.stringify(r));
r = ตรวจ(`http://10.0.0.5:${ports.dev.api}`);
ผล(r.code === 1 && /ไม่ใช่ฐานในเครื่อง/.test(r.out), "(3) เครื่องอื่นแม้พอร์ตตรง = ปฏิเสธ", JSON.stringify(r));
r = ตรวจ("ไม่ใช่ที่อยู่");
ผล(r.code === 1 && /อ่านไม่ได้/.test(r.out), "ปลายทางอ่านไม่ได้ = ปฏิเสธ", JSON.stringify(r));
r = ตรวจ(`http://127.0.0.1:${ports.dev.api}`);
ผล(r.code === 0 && /ตรวจอย่างเดียว ไม่ได้ต่อฐาน/.test(r.out), "(4) ฐาน dev ในเครื่อง = ผ่าน (ตรวจอย่างเดียว)", JSON.stringify(r));

// (6) ตัวกันอยู่ก่อนการเชื่อมต่อใน เตรียม()
const src = readFileSync(join(ราก, "scripts/dev-sample/ตัวช่วย.mjs"), "utf8");
const ตัวเตรียม = src.slice(src.indexOf("export async function เตรียม()"));
const ที่กัน = ตัวเตรียม.indexOf("ตรวจปลายทาง(API"), ที่ต่อ = ตัวเตรียม.indexOf("createClient("), ที่sql = ตัวเตรียม.indexOf('spawnSync("docker"');
ผล(ที่กัน > 0 && ที่กัน < ที่ต่อ && ที่กัน < ที่sql, "(6) ตัวกันปลายทางอยู่ก่อน createClient และ psql ใน เตรียม()", `${ที่กัน} · ${ที่ต่อ} · ${ที่sql}`);
const ตัวรัน = readFileSync(join(ราก, "scripts/dev-sample-data.mjs"), "utf8");
ผล(ตัวรัน.indexOf("--ตรวจปลายทาง=") > 0 && ตัวรัน.indexOf("--ตรวจปลายทาง=") < ตัวรัน.indexOf("await เตรียม()"), "โหมดตรวจอย่างเดียวออกก่อน เตรียม() (ไม่ต่อฐาน)");

console.log(ตก ? `\n✗ ตก ${ตก} ข้อ` : "\nALL PASS");
process.exit(ตก ? 1 : 0);
