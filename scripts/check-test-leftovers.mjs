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
// 26 ต.ค. 69 (บอสสั่ง): บอกด้วยว่าแถวค้างมาจากเซสชันไหน — เทียบเวลาสร้างแถวกับประวัติผู้ถือล็อก (scripts/lib/testDbLock.mjs)
//   ฐานทดสอบเขียนได้เฉพาะผู้ถือล็อก (testDbGuard.mjs) → แถวที่เกิดในช่วงที่เซสชันไหนถือล็อก = ของเซสชันนั้น
//   ตารางที่ไม่มีเวลาสร้าง / แถวที่เกิดก่อนเริ่มจดประวัติ = บอกว่าไม่ทราบพร้อมเหตุผล
// เซสชันอื่นถือล็อกอยู่ (กำลังรันชุดทดสอบ) = หยุด บอกว่าใครใช้อยู่ — ไม่รายงานว่าตก (แถวของชุดที่ยังไม่จบไม่ใช่ของค้าง)
import { createClient } from "@supabase/supabase-js";
import { readEnvFile, refOf } from "./lib/targetEnv.mjs";
import { อ่านล็อก, ยังทำงานอยู่ } from "./lib/fileLock.mjs";
import { ไฟล์ล็อกฐานทดสอบ, ใครถือล็อกตอน, ประวัติผู้ถือล็อก } from "./lib/testDbLock.mjs";

{
  const ล็อก = อ่านล็อก(ไฟล์ล็อกฐานทดสอบ());
  if (ล็อก && ยังทำงานอยู่(ล็อก.pid) && ล็อก.token !== process.env.PMS_TESTDB_LOCK_HELD) {
    console.log(`⏸ ฐานทดสอบถูกใช้โดย ${ล็อก.เซสชัน || "เซสชันที่ไม่ทราบชื่อ"} (งาน "${ล็อก.งาน}") รอแล้วรันใหม่ — ยังไม่ตรวจ ไม่ใช่ตก`);
    process.exit(3);
  }
}

const ป้าย = ["ZZTEST", "ZZLOAD", "ทดสอบอัตโนมัติ"];
// + "ZZ" ตัวพิมพ์ใหญ่แบบตรงตัว (ไม่สนตัวพิมพ์ไม่ได้ — คำทั่วไปมี zz) — ป้ายอื่นที่ขึ้นต้น ZZ เคยหลุดตัวตรวจ (19 ต.ค. 69):
//   ข้อทดสอบกล่องงาน HQ ใช้ป้าย ZZBOARD แล้วเก็บกวาดไม่ครบ → ค้างสะสม 14 ชุดโดยไม่มีอะไรเตือน จนตัวนับเลขคำขอกระโดด
//   ข้อมูลในฐานทดสอบสร้างด้วยสูตร (test-baseline) ไม่มี "ZZ" ในข้อมูลปกติ · รหัสสาขาชั่วคราว ZZxx ก็นับเป็นของค้าง
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
  // ตารางแม่แบบที่เลิกใช้แล้ว (ห้าม drop · templates-removed) — แถว ZZFIX เป็นข้อมูลตั้งต้นที่ตั้งใจใส่ (tests/fixtures/test-baseline.sql)
  if (table === "master_catalog" || table === "master_catalog_public") continue;
  // ช่องที่เก็บข้อความเข้ารหัส (v1:… base64 สุ่มทุกครั้ง) — มีตัวอักษร "ZZ" ได้โดยบังเอิญ ไม่ใช่ป้ายทดสอบ
  //   (เจอ 26 ต.ค. 69 หลังสร้างฐานทดสอบใหม่จากไฟล์: สำเนารหัสสาขา CNX ที่เข้ารหัสใหม่มี "ZZ" ในเนื้อ)
  const ช่องเข้ารหัส = new Set(["dealer_login_secrets.secret"]);
  const cols = Object.entries(d.properties ?? {}).filter(([, p]) => p.type === "string" && (!p.format || p.format === "text" || p.format === "character varying")).map(([c]) => c);
  for (const col of cols.filter(c => !ช่องเข้ารหัส.has(`${table}.${c}`))) {
    ตรวจ++;
    const { count, error } = await svc.from(table).select("*", { count: "exact", head: true })
      .or([...ป้าย.map(t => `${col}.ilike.%${t}%`), `${col}.like.*ZZ*`].join(","));
    if (error) continue;   // มุมมอง/ช่องที่กรองไม่ได้ — ไม่ใช่ที่เก็บแถวทดสอบ
    if (count) พบ.push({ table, col, count, เวลา: Object.keys(d.properties ?? {}).find(c => c === "created_at") });
  }
}

/** แถวค้างมาจากเซสชันไหน — เวลาสร้างแถว (created_at) เทียบประวัติผู้ถือล็อก */
async function ที่มา(p) {
  if (!p.เวลา) return "ไม่ทราบเซสชัน (ตารางนี้ไม่มีเวลาสร้างแถว)";
  const { data, error } = await svc.from(p.table).select(p.เวลา)
    .or([...ป้าย.map(t => `${p.col}.ilike.%${t}%`), `${p.col}.like.*ZZ*`].join(",")).limit(200);
  if (error || !data) return "ไม่ทราบเซสชัน (อ่านเวลาสร้างไม่ได้)";
  const เริ่มจด = ประวัติผู้ถือล็อก()[0]?.เริ่ม;
  const นับ = new Map();
  for (const r of data) {
    const x = ใครถือล็อกตอน(r[p.เวลา]);
    const ชื่อ = x ? `เซสชัน ${x.เซสชัน} (งาน "${x.งาน}" เริ่ม ${new Date(x.เริ่ม).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })})`
      : เริ่มจด && Date.parse(r[p.เวลา]) < Date.parse(เริ่มจด) ? "ไม่ทราบเซสชัน (เกิดก่อนเริ่มจดประวัติผู้ถือล็อก)" : "ไม่ทราบเซสชัน (ไม่มีใครถือล็อกตอนแถวเกิด)";
    นับ.set(ชื่อ, (นับ.get(ชื่อ) ?? 0) + 1);
  }
  return [...นับ].map(([k, n]) => `${k} ${n} แถว`).join(" · ");
}

for (const p of พบ) console.log(`  ✗ ${p.table}.${p.col}: ${p.count} แถวมีป้ายทดสอบค้างอยู่ — มาจาก ${await ที่มา(p)}`);
if (พบ.length) {
  console.log("      แถวพวกนี้ไม่มีตัวเก็บกวาดไหนลบ — เพิ่มการลบในข้อทดสอบที่สร้าง หรือเพิ่มใน sweep() ของ global-teardown.ts");
  console.log("      (ถ้าเพิ่งรันระหว่างที่ชุดทดสอบยังไม่จบ ให้รอจบก่อนแล้วรันใหม่)");
}
console.log(`แถวทดสอบค้างในฐาน: ${พบ.reduce((s, p) => s + p.count, 0)} (${พบ.length} ช่อง · ตรวจ ${ตรวจ} ช่องใน ${Object.keys(defs).length} ตาราง)`);
process.exit(พบ.length ? 1 : 0);
