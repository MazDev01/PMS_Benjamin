// ── ตัวตรวจ: หลังชุดทดสอบจบ ฐานทดสอบต้องไม่มีแถวทดสอบค้าง ───────────────────────────────
//
// คู่กับ check-test-stale-row-lookup.mjs (ตรวจโค้ดข้อทดสอบ) — ตัวนี้ตรวจ "ผลที่เหลือในฐาน"
// บั๊กจริง (พบ 13 ต.ค. 69): นัดหมายที่ข้อทดสอบสร้างค้างสะสม 34 แถว เพราะติดป้ายไว้ในช่องที่ไม่มีใครกวาด
//   แถวค้าง = ข้อทดสอบรอบถัดไปหยิบของเก่ามาตรวจแทนของใหม่ และตัวนับเลขของสาขาเพี้ยนตาม
//
// วิธีตรวจ: ไล่ทุกตารางทุกช่องข้อความ หาป้ายทดสอบ (ZZTEST / ZZLOAD / "ทดสอบอัตโนมัติ") — เจอ = ตก
//   ไม่เขียนรายชื่อตาราง/ช่องตายตัว: อ่านจากโครงจริงของฐาน เพิ่มตารางใหม่ก็ถูกตรวจเอง
//
// ⚠️ แตะเฉพาะฐานทดสอบ (apps/hq/.env.local) · อ่านอย่างเดียว · ถ้าชี้ฐานจริงจะหยุดทันที
//    ไม่มีฐานให้ต่อ (เช่นใน CI ที่ไม่ได้ยกฐานขึ้น) = ข้าม ไม่ถือว่าตก — บอกชัดว่าข้าม
// รัน: node scripts/check-test-leftovers.mjs        (ควรรันหลังชุดทดสอบจบ ไม่ใช่ระหว่างรัน)
import { createClient } from "@supabase/supabase-js";
import { readEnvFile, refOf } from "./lib/targetEnv.mjs";

const ป้าย = ["ZZTEST", "ZZLOAD", "ทดสอบอัตโนมัติ"];
const app = readEnvFile("apps/hq/.env.local");
const prod = readEnvFile(".env.production.local");
const URL_ = app.NEXT_PUBLIC_SUPABASE_URL, KEY = app.SUPABASE_SERVICE_ROLE_KEY;

if (!URL_ || !KEY) { console.log("แถวทดสอบค้างในฐาน: ข้าม (ไม่มีค่าเชื่อมต่อฐานทดสอบใน apps/hq/.env.local)"); process.exit(0); }
if (prod.NEXT_PUBLIC_SUPABASE_URL && refOf(URL_) === refOf(prod.NEXT_PUBLIC_SUPABASE_URL) && refOf(URL_) !== "(ไม่ทราบ)") {
  console.error("❌ apps/hq/.env.local ชี้ฐานจริง — ตัวตรวจนี้ใช้กับฐานทดสอบเท่านั้น หยุด");
  process.exit(1);
}

let defs;
try {
  const res = await fetch(`${URL_}/rest/v1/`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` }, signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  defs = (await res.json()).definitions ?? {};
} catch (e) {
  console.log(`แถวทดสอบค้างในฐาน: ข้าม (ต่อฐานทดสอบไม่ได้ — ${String(e?.message ?? e).slice(0, 60)})`);
  process.exit(0);
}

const svc = createClient(URL_, KEY, { auth: { persistSession: false } });
const พบ = [];
let ตรวจ = 0;
for (const [table, d] of Object.entries(defs)) {
  // ช่องข้อความล้วน — ไม่รวม uuid/วันที่/ตัวเลข (ilike กับชนิดอื่นจะ error) และไม่รวมบันทึกการใช้งาน (เก็บประวัติถาวรโดยตั้งใจ)
  if (table === "audit_log" || table === "rate_limits") continue;
  const cols = Object.entries(d.properties ?? {}).filter(([, p]) => p.type === "string" && (!p.format || p.format === "text" || p.format === "character varying")).map(([c]) => c);
  for (const col of cols) {
    ตรวจ++;
    const { count, error } = await svc.from(table).select("*", { count: "exact", head: true })
      .or(ป้าย.map(t => `${col}.ilike.%${t}%`).join(","));
    if (error) continue;   // มุมมอง/ช่องที่กรองไม่ได้ — ไม่ใช่ที่เก็บแถวทดสอบ
    if (count) พบ.push({ table, col, count });
  }
}

for (const p of พบ) console.log(`  ✗ ${p.table}.${p.col}: ${p.count} แถวมีป้ายทดสอบค้างอยู่`);
if (พบ.length) {
  console.log("      แถวพวกนี้ไม่มีตัวเก็บกวาดไหนลบ — เพิ่มการลบในข้อทดสอบที่สร้าง หรือเพิ่มใน sweep() ของ global-teardown.ts");
  console.log("      (ถ้าเพิ่งรันระหว่างที่ชุดทดสอบยังไม่จบ ให้รอจบก่อนแล้วรันใหม่)");
}
console.log(`แถวทดสอบค้างในฐาน: ${พบ.reduce((s, p) => s + p.count, 0)} (${พบ.length} ช่อง · ตรวจ ${ตรวจ} ช่องใน ${Object.keys(defs).length} ตาราง)`);
process.exit(พบ.length ? 1 : 0);
