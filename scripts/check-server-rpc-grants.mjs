// ── ตัวตรวจ: คำสั่งที่โค้ดฝั่งเซิร์ฟเวอร์เรียกด้วยกุญแจ service_role ต้องมีสิทธิ์ service_role จริง ──────────
//
// บั๊กจริง (พบ 13 ต.ค. 69 · ใบ 0188): เส้นทางลบดีลเลอร์และย้ายข้อมูลดีลเลอร์ของสำนักงานใหญ่
//   เรียก delete_dealer_atomic / move_dealer_data_atomic ด้วยกุญแจฝั่งเซิร์ฟเวอร์
//   แต่ใบแก้ฐานข้อมูลถอนสิทธิ์ทุกคนแล้วให้คืนเฉพาะผู้ใช้ที่เข้าระบบ — ฝั่งเซิร์ฟเวอร์เรียกไม่ได้ ได้ 503 ทุกครั้ง
//   ฐานทดสอบในเครื่องถูกให้สิทธิ์แบบเหมานอกใบ ข้อทดสอบจึงผ่านมาตลอด
//
// วิธีตรวจ (ไม่ต้องต่อฐานข้อมูล รันใน CI ได้):
//   1) ไล่โค้ดฝั่งเซิร์ฟเวอร์ หาการเรียก <ตัวเชื่อมต่อสิทธิ์เซิร์ฟเวอร์>.rpc("ชื่อคำสั่ง")
//      ตัวเชื่อมต่อสิทธิ์เซิร์ฟเวอร์ = ตัวแปรที่สร้างด้วยกุญแจ service_role — ในโปรเจกต์นี้ตั้งชื่อ admin / svc เสมอ
//   2) เทียบกับค่าที่ถ่ายจากฐานเปล่าที่สร้างจากใบแก้ฐานข้อมูลล้วน ๆ (supabase/tests/expected-function-grants.json)
//      คำสั่งไหน service_role เรียกไม่ได้ → ตก
// รัน: node scripts/check-server-rpc-grants.mjs [ไฟล์ค่าที่ถ่ายไว้]
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ไฟล์ค่าที่ถ่ายไว้ = process.argv[2] ?? "supabase/tests/expected-function-grants.json";
const ที่มีโค้ดฝั่งเซิร์ฟเวอร์ = ["apps/hq/app/api", "apps/dealer/app/api", "packages/shared/server", "packages/shared/lib/rateLimit.ts", "scripts"];
const ตัวเชื่อมต่อสิทธิ์เซิร์ฟเวอร์ = /\b(?:admin|svc)\s*\.rpc\(\s*["'`]([a-z_0-9]+)["'`]/g;

function ไล่ไฟล์(p, out = []) {
  let st; try { st = statSync(p); } catch { return out; }
  if (st.isFile()) { if (/\.(ts|tsx|mjs|js)$/.test(p)) out.push(p); return out; }
  for (const f of readdirSync(p)) if (f !== "node_modules" && f !== ".next") ไล่ไฟล์(path.join(p, f), out);
  return out;
}

const เรียกจาก = new Map();   // ชื่อคำสั่ง → ไฟล์ที่เรียก
for (const root of ที่มีโค้ดฝั่งเซิร์ฟเวอร์) {
  for (const f of ไล่ไฟล์(root)) {
    if (path.basename(f) === "check-server-rpc-grants.mjs") continue;
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(ตัวเชื่อมต่อสิทธิ์เซิร์ฟเวอร์)) {
      const ln = src.slice(0, m.index).split("\n").length;
      if (!เรียกจาก.has(m[1])) เรียกจาก.set(m[1], []);
      เรียกจาก.get(m[1]).push(`${f.replaceAll("\\", "/")}:${ln}`);
    }
  }
}
if (เรียกจาก.size === 0) {
  console.error("❌ ไม่พบการเรียกคำสั่งด้วยสิทธิ์เซิร์ฟเวอร์เลยสักจุด — รูปแบบโค้ดเปลี่ยน (ชื่อตัวแปร admin / svc) ต้องปรับตัวตรวจนี้ตาม");
  process.exit(1);
}

const ค่า = JSON.parse(readFileSync(ไฟล์ค่าที่ถ่ายไว้, "utf8"));
const พบ = [];
for (const [name, ที่] of [...เรียกจาก].sort()) {
  const แบบ = ค่า.functions.filter(f => f.f.startsWith(name + "("));
  if (!แบบ.length) { พบ.push({ name, ที่, msg: "ไม่มีคำสั่งนี้ในฐานที่สร้างจากใบแก้ฐานข้อมูล" }); continue; }
  if (!แบบ.some(f => f.service_role)) พบ.push({ name, ที่, msg: "ฝั่งเซิร์ฟเวอร์ (service_role) ไม่มีสิทธิ์เรียก — เรียกแล้วจะถูกปฏิเสธทุกครั้ง" });
}
for (const p of พบ) {
  console.log(`  ✗ ${p.name}  ${p.msg}`);
  for (const t of p.ที่) console.log(`      เรียกที่ ${t}`);
}
if (พบ.length) console.log("      แก้: เพิ่มใบแก้ฐานข้อมูล grant execute on function … to service_role แล้วถ่ายค่าใหม่ (node scripts/db-audit-grants.mjs --snapshot …)");
console.log(`คำสั่งที่ฝั่งเซิร์ฟเวอร์เรียกแต่ไม่มีสิทธิ์: ${พบ.length} (ตรวจ ${เรียกจาก.size} คำสั่ง · ค่าที่ถ่ายไว้ ณ ใบ ${ค่า.migration})`);
process.exit(พบ.length ? 1 : 0);
