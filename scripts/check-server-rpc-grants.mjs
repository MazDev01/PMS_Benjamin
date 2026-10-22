// ── ตัวตรวจ: คำสั่งของฐานข้อมูลที่โค้ดเรียก ต้องมีสิทธิ์เรียกตรงกับผู้เรียกจริง ─────────────────────
//
// บั๊กจริง (พบ 13 ต.ค. 69 · ใบ 0188 / 0190):
//   เส้นทางลบดีลเลอร์และย้ายข้อมูลดีลเลอร์ของสำนักงานใหญ่เรียกคำสั่งด้วยกุญแจฝั่งเซิร์ฟเวอร์
//   แต่ใบแก้ฐานข้อมูลให้สิทธิ์เฉพาะผู้ใช้ที่เข้าระบบ — บนฐานในเครื่องรุ่นเก่าเรียกไม่ได้ ได้ 503 ทุกครั้ง
//   ส่วนฐานรุ่นใหม่ให้สิทธิ์ตั้งต้นกว้างจนบั๊กไม่โผล่ = สิทธิ์เรียกคำสั่งขึ้นกับรุ่นของฐาน ไม่ได้ขึ้นกับใบ
//   ตั้งแต่ใบ 0190 ทุกคำสั่งถูกกำหนดสิทธิ์ชัด: ไม่ให้ = เรียกไม่ได้จริงบนทุกฐาน ตัวตรวจนี้จึงต้องครอบทั้งสองฝั่ง
//
// วิธีตรวจ (ไม่ต้องต่อฐานข้อมูล รันใน CI ได้):
//   1) ไล่โค้ด หาการเรียก <ตัวเชื่อมต่อ>.rpc("ชื่อคำสั่ง") และตารางคำสั่งแบบ rpc: "ชื่อคำสั่ง" (metrics.ts)
//      ตัวเชื่อมต่อสิทธิ์เซิร์ฟเวอร์ = ตัวแปรชื่อ admin / svc หรือตัวแปรที่สร้างด้วยกุญแจ SERVICE_ROLE ในไฟล์เดียวกัน
//      นอกนั้น = เรียกด้วยใบผ่านของผู้ใช้ (หน้าเว็บ และ /api/v1 ที่ส่งใบผ่านของผู้ใช้ต่อ)
//   2) เทียบกับค่าที่ถ่ายจากฐานเปล่าที่สร้างจากใบแก้ฐานข้อมูลล้วน ๆ (supabase/tests/expected-function-grants.json)
//      ฝั่งเซิร์ฟเวอร์เรียก → ต้องมีสิทธิ์ service_role · ผู้ใช้เรียก → ต้องมีสิทธิ์ authenticated
//   3) คนที่ยังไม่เข้าระบบ (anon) ต้องเรียกคำสั่งไหนไม่ได้เลย เว้นแต่อยู่ในรายการยกเว้นพร้อมเหตุผล
// อ่านเฉพาะไฟล์ที่ git เก็บ (git ls-files) — เดิมไล่ทั้งโฟลเดอร์ ข้ามแค่ node_modules/.next
//   แล้วไปเจอผล build ที่ตั้งชื่อโฟลเดอร์อื่น (apps/dealer/.next-r4 จาก PMS_DIST_DIR) ไฟล์ 9MB ทำให้ regex เดินย้อนกลับ
//   แบบกำลังสองจนตัวตรวจค้างไม่จบ ขั้นแรกของรอบตรวจเต็มค้างตาม (22 ต.ค. 69 · บอสสั่งแก้แบบนี้)
//   ไฟล์ใหม่ที่ยังไม่ git add จึงไม่ถูกตรวจ — รอบตรวจเต็มรันหลัง commit ครบทุกงานอยู่แล้ว
// รัน: node scripts/check-server-rpc-grants.mjs [ไฟล์ค่าที่ถ่ายไว้]
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const ไฟล์ค่าที่ถ่ายไว้ = process.argv[2] ?? "supabase/tests/expected-function-grants.json";
const ที่มีโค้ด = ["apps", "packages", "scripts"];

/** คำสั่งที่คนยังไม่เข้าระบบเรียกได้ — ต้องมีเหตุผล (ตอนนี้ไม่มี: หน้าเข้าสู่ระบบไม่เรียกคำสั่งไหนของฐาน) */
const ยกเว้นคนนอก = [
  // { name: "ชื่อคำสั่ง", reason: "ทำไมคนที่ยังไม่เข้าระบบต้องเรียกได้" },
];

/** ไฟล์โค้ดที่ git เก็บไว้ใต้โฟลเดอร์ที่กำหนด (ไม่รวมผล build / ไฟล์ที่ยังไม่ git add) */
const ไฟล์ที่gitเก็บ = root => execFileSync("git", ["ls-files", "-z", "--", root], { encoding: "utf8", maxBuffer: 64 << 20 })
  .split("\0").filter(f => /\.(ts|tsx|mjs|js)$/.test(f));

const เซิร์ฟเวอร์ = new Map(), ผู้ใช้ = new Map();   // ชื่อคำสั่ง → ที่เรียก
const จด = (m, name, ที่) => { if (!m.has(name)) m.set(name, []); m.get(name).push(ที่); };
for (const root of ที่มีโค้ด) {
  for (const f of ไฟล์ที่gitเก็บ(root)) {
    if (/check-server-rpc-grants\.mjs$/.test(f)) continue;
    let src; try { src = readFileSync(f, "utf8"); } catch { continue; }   // ลบในโฟลเดอร์แล้วแต่ยังไม่ commit
    const ไฟล์ = f;
    const บรรทัด = i => src.slice(0, i).split("\n").length;
    const ตัวแปรเซิร์ฟเวอร์ = new Set(["admin", "svc"]);
    for (const m of src.matchAll(/(?:const|let)\s+(\w+)\s*=\s*createClient\([^;]*?SERVICE_ROLE/gs)) ตัวแปรเซิร์ฟเวอร์.add(m[1]);
    for (const m of src.matchAll(/([\w.()]+)\s*\.rpc\(\s*["'`]([a-z_0-9]+)["'`]/g)) {
      const ตัวแปร = m[1].split(".").pop().replace(/[()]/g, "");
      จด(ตัวแปรเซิร์ฟเวอร์.has(ตัวแปร) ? เซิร์ฟเวอร์ : ผู้ใช้, m[2], `${ไฟล์}:${บรรทัด(m.index)}`);
    }
    for (const m of src.matchAll(/\brpc:\s*["']([a-z_0-9]+)["']/g)) จด(ผู้ใช้, m[1], `${ไฟล์}:${บรรทัด(m.index)}`);
  }
}
if (เซิร์ฟเวอร์.size === 0 || ผู้ใช้.size === 0) {
  console.error("❌ ไม่พบการเรียกคำสั่งของฐานฝั่งใดฝั่งหนึ่งเลย — รูปแบบโค้ดเปลี่ยน ต้องปรับตัวตรวจนี้ตาม");
  process.exit(1);
}

const ค่า = JSON.parse(readFileSync(ไฟล์ค่าที่ถ่ายไว้, "utf8"));
const พบ = [];
const ตรวจ = (m, role, ใคร) => {
  for (const [name, ที่] of [...m].sort()) {
    const แบบ = ค่า.functions.filter(f => f.f.startsWith(name + "("));
    if (!แบบ.length) { พบ.push({ name, ที่, msg: "ไม่มีคำสั่งนี้ในฐานที่สร้างจากใบแก้ฐานข้อมูล" }); continue; }
    if (!แบบ.some(f => f[role])) พบ.push({ name, ที่, msg: `${ใคร} (${role}) ไม่มีสิทธิ์เรียก — เรียกแล้วจะถูกปฏิเสธทุกครั้ง` });
  }
};
ตรวจ(เซิร์ฟเวอร์, "service_role", "ฝั่งเซิร์ฟเวอร์");
ตรวจ(ผู้ใช้, "authenticated", "ผู้ใช้ที่เข้าระบบ");
for (const f of ค่า.functions) {
  const name = f.f.split("(")[0];
  if (f.anon && !ยกเว้นคนนอก.some(e => e.name === name)) พบ.push({ name, ที่: [], msg: "คนที่ยังไม่เข้าระบบ (anon) เรียกได้ และไม่อยู่ในรายการยกเว้น" });
}
for (const e of ยกเว้นคนนอก) if (!ค่า.functions.some(f => f.f.startsWith(e.name + "(") && f.anon)) พบ.push({ name: e.name, ที่: [], msg: "รายการยกเว้นคนนอกไม่ตรงกับคำสั่งที่คนนอกเรียกได้แล้ว — เอาออก" });

for (const p of พบ) {
  console.log(`  ✗ ${p.name}  ${p.msg}`);
  for (const t of p.ที่) console.log(`      เรียกที่ ${t}`);
}
if (พบ.length) console.log("      แก้: เพิ่มใบแก้ฐานข้อมูล grant execute on function … to <ผู้เรียก> แล้วถ่ายค่าใหม่ (node scripts/db-audit-grants.mjs --snapshot …)");
console.log(`คำสั่งของฐานที่สิทธิ์เรียกไม่ตรงกับผู้เรียกในโค้ด: ${พบ.length} (ฝั่งเซิร์ฟเวอร์เรียก ${เซิร์ฟเวอร์.size} คำสั่ง · ผู้ใช้เรียก ${ผู้ใช้.size} คำสั่ง · ค่าที่ถ่ายไว้ ณ ใบ ${ค่า.migration})`);
process.exit(พบ.length ? 1 : 0);
