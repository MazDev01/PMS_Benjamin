// ── ล้างร่องรอยการทดสอบ แล้วตั้งต้นระบบให้พร้อมเปิดใช้จริง ────────────────────────
//
// ทำไมต้องมี (ตรวจพบ 11 ส.ค. 69):
//   ฐานข้อมูลชุดนี้ถูกใช้ทั้งพัฒนา ทดสอบ และเตรียมเปิดใช้จริง — ปนกันมาตั้งแต่ต้น
//   ผลคือสิ่งที่ผู้ใช้จริงจะเห็นในวันแรกไม่ใช่ระบบเปล่า แต่เป็นระบบที่ดูเหมือน
//   ใช้งานมาแล้วเป็นปี ทั้งที่ยังไม่มีงานขายจริงแม้แต่รายการเดียว:
//
//     • ตัวนับเลขที่เอกสารเดินไปไกลแล้ว — ระยองออกใบเสนอราคาใบแรกจะได้เลขที่ 2225
//       ลูกค้าที่ได้รับใบจะเข้าใจว่าบริษัทออกใบมาแล้วสองพันกว่าใบ
//     • บันทึกการใช้งานเกือบ 11,000 แถว เป็นร่องรอยการทดสอบล้วน ๆ
//     • ดีลเลอร์สมมติ 3 รายพร้อมบัญชีล็อกอินที่ใช้ได้จริง
//
// ⚠️ อ่านก่อนใช้ — ข้อจำกัดที่ต้องรู้:
//   ชุดทดสอบอัตโนมัติล็อกอินด้วยบัญชีดีลเลอร์ทดสอบ (ดู tests/.env.test)
//   ถ้าลบดีลเลอร์พวกนั้นทิ้งจากฐานข้อมูลชุดที่ชุดทดสอบใช้อยู่ **ชุดทดสอบจะรันไม่ได้อีกเลย**
//   ทางที่ถูกคือแยกฐานข้อมูลเป็น 2 ชุด (ชุดทดสอบ / ชุดจริง) ก่อน แล้วค่อยใช้ --dealers
//   สคริปต์นี้จึงเตือนให้เห็นก่อนเสมอ แต่ไม่ห้าม — คนสั่งต้องรู้ว่ากำลังแลกอะไร
//
// สองโหมด — ปลอดภัยไว้ก่อนเป็นค่าตั้งต้น (แบบเดียวกับ scripts/restore.mjs):
//   node scripts/go-live-reset.mjs                → ตรวจอย่างเดียว ไม่แตะฐานข้อมูล
//   node scripts/go-live-reset.mjs --apply --yes  → ทำจริง
//
// ตัวเลือก:
//   --dealers=RYG,CNX,UBN   ลบดีลเลอร์ที่ระบุ + บัญชีล็อกอิน + ข้อมูลของสาขานั้นทั้งหมด
//                           (ไม่ใส่ = ไม่แตะดีลเลอร์เลย ล้างแค่บันทึก/ตัวนับ)
//   --keep-audit            ไม่ต้องล้างบันทึกการใช้งาน
//   --keep-counters         ไม่ต้องรีเซ็ตตัวนับเลขที่เอกสาร
//   --clear-prices          ล้าง "ราคากลาง" ของแคตตาล็อกให้ว่าง (เก็บชื่อสินค้าไว้)
//   --force                 ทำต่อแม้พบข้อมูลงานขายในระบบ (อันตราย — ต้องตั้งใจจริง)
import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { loadTarget } from "./lib/targetEnv.mjs";
import { ตรวจระบบเปิดใช้จริง } from "./lib/goLiveGuard.mjs";

const APPLY = process.argv.includes("--apply");
const YES = process.argv.includes("--yes");
const FORCE = process.argv.includes("--force");
const KEEP_AUDIT = process.argv.includes("--keep-audit");
const KEEP_COUNTERS = process.argv.includes("--keep-counters");
const CLEAR_PRICES = process.argv.includes("--clear-prices");
const dealersArg = process.argv.find(a => a.startsWith("--dealers="));
const DEALERS = dealersArg
  ? dealersArg.slice("--dealers=".length).split(",").map(s => s.trim().toUpperCase()).filter(Boolean)
  : [];

if (APPLY && !YES) {
  console.error("\n⚠️  --apply จะลบข้อมูลในฐานข้อมูลจริง — ต้องใส่ --yes ยืนยันด้วย\n");
  process.exit(1);
}

function readEnvFile(file) {
  const out = {};
  try {
    for (const l of readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
    }
  } catch { /* ไม่มีไฟล์ */ }
  return out;
}
// ⚠️ ต้องเป็น "ฐานจริง" เท่านั้น — apps/hq/.env.local ชี้ฐานทดสอบตั้งแต่แยกฐานข้อมูล (11 ส.ค. 69)
//    ล้างผิดฐานคือลบของที่ไม่ควรลบ ตัวเลือกฐานจึงต้องชัดและแสดงให้เห็นก่อนทุกครั้ง
const target = loadTarget();
const svc = createClient(target.url, target.serviceKey, { auth: { persistSession: false } });
const n = x => Number(x).toLocaleString();

async function count(table) {
  const { count: c, error } = await svc.from(table).select("*", { count: "exact", head: true });
  return error ? -1 : (c ?? 0);
}

// ตารางที่นับว่าเป็น "งานขาย" — มีแถวเมื่อไหร่แปลว่ามีคนใช้ระบบทำงานจริงแล้ว
const SALES_TABLES = ["leads", "customers", "quotations", "appointments", "customer_notes", "files"];
const REPORT_TABLES = [...SALES_TABLES, "audit_log", "entity_counters", "quote_counters", "dealers", "profiles"];

// ── ① ต้องมีข้อมูลสำรองที่สดพอ ───────────────────────────────────────────────────
// ลบแล้วเอาคืนไม่ได้ถ้าไม่มีของสำรอง — ข้อนี้จึงเป็นเงื่อนไข ไม่ใช่คำแนะนำ
// ⚠️ ต้องเป็นไฟล์สำรอง "ของฐานนี้" เท่านั้น — มีฐาน 2 ชุดแล้ว ชื่อโฟลเดอร์เป็นวันเวลาล้วน ๆ
//    ถ้านับไฟล์สำรองของฐานทดสอบว่าใช้ได้ ก็เท่ากับลบฐานจริงทั้งที่ไม่มีของสำรองเลย
function newestBackup() {
  if (!existsSync("backups")) return null;
  const mine = readdirSync("backups")
    .map(d => path.join("backups", d))
    .filter(p => existsSync(path.join(p, "manifest.json")))
    .map(p => {
      let src = "";
      try { src = String(JSON.parse(readFileSync(path.join(p, "manifest.json"), "utf8")).source ?? ""); } catch { /* ไฟล์เสีย */ }
      return { p, at: statSync(path.join(p, "manifest.json")).mtimeMs, ref: (src.match(/https?:\/\/([a-z0-9]+)\.supabase\./) ?? [])[1] };
    })
    .filter(b => b.ref === target.ref);
  return mine.sort((a, b) => b.at - a.at)[0] ?? null;
}

console.log("\n══ ล้างร่องรอยการทดสอบ + ตั้งต้นระบบ ══");
console.log(APPLY ? "โหมด: ทำจริง" : "โหมด: ตรวจอย่างเดียว (ยังไม่แตะฐานข้อมูล)");

const bk = newestBackup();
const ageH = bk ? (Date.now() - bk.at) / 3_600_000 : Infinity;
if (!bk) {
  console.log("\n❌ ไม่พบข้อมูลสำรองเลย — สั่ง `npm run backup` ก่อน");
  if (APPLY) process.exit(1);
} else {
  console.log(`\nข้อมูลสำรองล่าสุด: ${bk.p} (${ageH < 1 ? "ไม่ถึงชั่วโมง" : Math.round(ageH) + " ชั่วโมง"}ที่แล้ว)`);
  if (ageH > 24) {
    console.log("❌ เก่าเกิน 24 ชั่วโมง — สั่ง `npm run backup` ใหม่ก่อน");
    if (APPLY) process.exit(1);
  }
}

// ── ② สำรวจของที่มีอยู่ ──────────────────────────────────────────────────────────
console.log("\n── ตอนนี้ในฐานข้อมูลมีอะไร ──");
const before = {};
for (const t of REPORT_TABLES) {
  before[t] = await count(t);
  console.log(`  ${String(n(before[t])).padStart(8)}  ${t}`);
}

const salesRows = SALES_TABLES.reduce((s, t) => s + Math.max(0, before[t]), 0);
if (salesRows > 0 && !FORCE) {
  console.log(`\n❌ พบข้อมูลงานขาย ${n(salesRows)} รายการในระบบ — หยุดไว้ก่อน`);
  console.log("   ถ้ายืนยันว่าเป็นของทดสอบและตั้งใจจะลบ ให้ใส่ --force");
  process.exit(1);
}

// ── ③ ตัวนับที่เดินไปแล้วทั้งที่ยังไม่มีข้อมูล ──────────────────────────────────
const { data: ec } = await svc.from("entity_counters").select("*");
const { data: qc } = await svc.from("quote_counters").select("*");
if (!KEEP_COUNTERS && ((ec?.length ?? 0) || (qc?.length ?? 0))) {
  console.log("\n── ตัวนับเลขที่เอกสารที่จะรีเซ็ตให้เริ่มที่ 1 ──");
  const thai = { leads: "ลูกค้าเป้าหมาย", customers: "ลูกค้า", appointments: "นัดหมาย" };
  for (const r of ec ?? []) console.log(`  ${r.dealer_code} · ${thai[r.entity] ?? r.entity} → รายการถัดไปจะได้เลข ${n(r.next_id)}`);
  for (const r of qc ?? []) console.log(`  ${r.dealer_code} · ใบเสนอราคา → ใบถัดไปจะได้เลข ${n(r.next_no)}`);
}

// ── ④ ดีลเลอร์ที่จะลบ ──────────────────────────────────────────────────────────────
let victims = [];
if (DEALERS.length) {
  const { data: ds } = await svc.from("dealers").select("code,name").in("code", DEALERS);
  victims = ds ?? [];
  console.log("\n── ดีลเลอร์ที่จะลบ ──");
  for (const v of victims) console.log(`  ${v.code} · ${v.name}`);
  for (const c of DEALERS.filter(c => !victims.some(v => v.code === c))) console.log(`  ${c} · (ไม่มีในระบบ — ข้าม)`);

  // เตือนถ้าบัญชีนั้นเป็นบัญชีที่ชุดทดสอบใช้ล็อกอิน
  const testEnv = readEnvFile("tests/.env.test");
  const usedByTests = Object.keys(testEnv)
    .filter(k => /^TEST_[A-Z]+_EMAIL$/.test(k))
    .map(k => k.replace(/^TEST_|_EMAIL$/g, ""))
    .filter(code => DEALERS.includes(code));
  if (usedByTests.length) {
    console.log(`\n⚠️  ${usedByTests.join(", ")} เป็นบัญชีที่ชุดทดสอบอัตโนมัติใช้ล็อกอิน`);
    console.log("    ลบแล้วชุดทดสอบทั้งชุดจะรันไม่ได้ จนกว่าจะแยกฐานข้อมูลทดสอบออกมาต่างหาก");
  }
}

// ── ⑤ ราคากลางที่ยังไม่ได้ยืนยัน ────────────────────────────────────────────────
//
// ราคากลางถูกยัดเข้าฐานข้อมูลจากชุดข้อมูลตัวอย่างในโค้ด (supabase/seed-catalog.mjs อ่านจาก mock.ts)
// พร้อม "ประวัติการปรับราคา" ย้อนหลังหลายรอบที่ไม่เคยเกิดขึ้นจริง
//
// ⚠️ อันตรายกว่าข้อมูลปลอมที่อื่น: ราคากลางเป็นตัวตั้งของทุกใบเสนอราคา
//    ดีลเลอร์กดเลือกแม่แบบ ราคานี้จะไปโผล่บนใบที่ส่งให้ลูกค้าจริงทันที โดยไม่มีอะไรบอกว่าเป็นของปลอม
//
// ล้างแล้วเหลือ 0 (ไม่ใช่ค่าว่าง — หน้าจอเรียกใช้เป็นตัวเลขตรง ๆ ค่าว่างจะทำให้แสดงผลเพี้ยน)
// ระบบมีกฎห้ามออกใบเสนอราคายอด 0 บาทอยู่แล้ว จึงกันไม่ให้ส่งใบที่ยังไม่ได้ตั้งราคาออกไปได้
const { data: catalog } = await svc.from("master_catalog").select("id,name,price,effective_date,price_history");
const priced = (catalog ?? []).filter(c => Number(c.price) > 0 || (c.price_history?.length ?? 0) > 0 || c.effective_date);
if (CLEAR_PRICES && priced.length) {
  console.log("\n── ราคากลางที่จะล้าง (เก็บชื่อสินค้าไว้) ──");
  for (const c of priced) {
    console.log(`  ${c.name} · ฿${n(c.price)}/หน่วย · ประวัติ ${c.price_history?.length ?? 0} รายการ`);
  }
}

if (!APPLY) {
  console.log("\n✅ ตรวจอย่างเดียว — ไม่ได้แตะฐานข้อมูล");
  console.log("   สั่งจริง: node scripts/go-live-reset.mjs --apply --yes"
    + (DEALERS.length ? ` --dealers=${DEALERS.join(",")}` : ""));
  process.exit(0);
}

// ⛔ ระบบเปิดใช้จริงแล้ว = ห้ามล้าง (บอสสั่ง 19 ต.ค. 69) — ตัวนี้ลบงานขายและรีเซ็ตตัวนับเลขเอกสาร (entity_counters · quote_counters)
//   ใช้ได้ครั้งเดียวก่อนเปิดระบบ (11 ส.ค. 69) · มีคำขอราคาของดีลเลอร์จริงแล้ว = ล้าง/รีเซ็ตแล้วเลขเอกสารซ้ำกับที่ออกไปแล้ว
{
  const ผล = await ตรวจระบบเปิดใช้จริง(svc);   // scripts/lib/goLiveGuard.mjs · ข้อทดสอบ tests/unit/goLiveGuard.test.ts
  if (ผล.หยุด) { console.error(`\n❌ หยุด: ${ผล.เหตุผล}`); process.exit(1); }
}

// ══ ลงมือจริง ════════════════════════════════════════════════════════════════════
console.log("\n── กำลังทำ ──");

/** ล้างแถวตามเงื่อนไข — PostgREST บังคับให้มี where เสมอ กันลบทั้งตารางโดยไม่ตั้งใจ */
async function clear(table, where) {
  const { error } = await where(svc.from(table).delete());
  if (error) throw new Error(`${table}: ${error.message}`);
}

// ④.1 ดีลเลอร์ — ต้องล้างลูกก่อนแม่ ไม่งั้นฐานข้อมูลปฏิเสธเพราะยังมีของอ้างถึงอยู่
const CHILD_TABLES = [
  "files", "customer_notes", "appointments", "quotations", "leads", "customers",
  "responsible_persons", "dealer_lead_rules", "dealer_settings",
  "dealer_login_secrets", "entity_counters", "quote_counters",
];
for (const v of victims) {
  const code = v.code;
  for (const t of CHILD_TABLES) {
    try { await clear(t, q => q.eq("dealer_code", code)); }
    catch (e) { console.log(`  ⚠️ ${e.message}`); }
  }
  // บัญชีล็อกอินของสาขานั้น — ต้องลบฝั่งยืนยันตัวตนก่อน profiles (profiles.id อ้าง auth.users)
  const { data: profs } = await svc.from("profiles").select("id,role").eq("dealer_code", code);
  for (const p of profs ?? []) {
    if (p.role === "SUPER_ADMIN") { console.log(`  ⏭️  ข้ามบัญชีผู้ดูแลระบบ (${p.id})`); continue; }
    const { error } = await svc.auth.admin.deleteUser(p.id);
    if (error) console.log(`  ⚠️ ลบบัญชีล็อกอินไม่สำเร็จ: ${error.message}`);
  }
  try { await clear("profiles", q => q.eq("dealer_code", code)); } catch (e) { console.log(`  ⚠️ ${e.message}`); }
  try { await clear("dealers", q => q.eq("code", code)); } catch (e) { console.log(`  ⚠️ ${e.message}`); }
  console.log(`  ✅ ลบดีลเลอร์ ${code} แล้ว`);
}

// ④.2 ตัวนับ — ลบแถวทิ้ง ระบบสร้างใหม่เองโดยตั้งต้นจากข้อมูลจริงที่มี (0) + 1 = 1
//     (next_entity_id ใน 0016/0036 · create_quotation ใน 0118 — ทั้งคู่ตั้งต้นเองได้)
if (!KEEP_COUNTERS) {
  await clear("entity_counters", q => q.neq("dealer_code", " "));
  await clear("quote_counters", q => q.neq("dealer_code", " "));
  console.log("  ✅ รีเซ็ตตัวนับเลขที่เอกสารแล้ว — รายการถัดไปจะเริ่มที่ 1");
}

// ④.3 ราคากลางที่ยังไม่ได้ยืนยัน — ล้างตัวเลขทิ้ง เก็บชื่อสินค้าและคำอธิบายไว้
if (CLEAR_PRICES) {
  for (const c of priced) {
    const { error } = await svc.from("master_catalog")
      .update({ price: 0, effective_date: null, price_history: [] }).eq("id", c.id);
    if (error) console.log(`  ⚠️ ${c.name}: ${error.message}`);
  }
  console.log(`  ✅ ล้างราคากลาง ${priced.length} แม่แบบแล้ว — ชื่อสินค้ายังอยู่ครบ`);
}

// ④.4 บันทึกการใช้งาน — ต้องเป็น "ขั้นสุดท้าย" เสมอ
//   ทุกขั้นข้างบนแตะข้อมูลที่มีตัวดักคอยจดอยู่ (เช่น แก้ราคากลาง = จด 1 แถวต่อแม่แบบ)
//   ถ้าล้างบันทึกก่อน แล้วไปแก้ราคาทีหลัง จะได้บันทึกใหม่ 6 แถวค้างไว้ทันที
//   — เคยพลาดมาแล้วตอนล้างฐานจริง 11 ส.ค. 69 (ตัวตรวจฟ้องว่าล้างไม่สำเร็จ ทั้งที่ล้างสำเร็จ)
if (!KEEP_AUDIT) {
  await clear("audit_log", q => q.gte("at", "1970-01-01"));
  console.log(`  ✅ ล้างบันทึกการใช้งาน ${n(before.audit_log)} แถวแล้ว`);
}


// ── ⑥ ตรวจผลหลังทำ ──────────────────────────────────────────────────────────────
// ไม่เชื่อว่าคำสั่งไม่ error แล้วแปลว่าได้ผลจริง — RLS เคยปฏิเสธคำสั่งเงียบ ๆ มาแล้ว
console.log("\n── ตรวจผลหลังทำ ──");
let bad = 0;
for (const t of REPORT_TABLES) {
  const after = await count(t);
  console.log(`  ${String(n(after)).padStart(8)}  ${t}${after !== before[t] ? `  (เดิม ${n(before[t])})` : ""}`);
  if (!KEEP_AUDIT && t === "audit_log" && after > 0) bad++;
  if (!KEEP_COUNTERS && (t === "entity_counters" || t === "quote_counters") && after > 0) bad++;
}
for (const v of victims) {
  const { count: left } = await svc.from("dealers").select("*", { count: "exact", head: true }).eq("code", v.code);
  if (left) { console.log(`  ❌ ดีลเลอร์ ${v.code} ยังอยู่`); bad++; }
}
if (CLEAR_PRICES) {
  const { data: after } = await svc.from("master_catalog").select("name,price,effective_date,price_history");
  const still = (after ?? []).filter(c => Number(c.price) > 0 || (c.price_history?.length ?? 0) > 0 || c.effective_date);
  console.log(`  ${String((after ?? []).length).padStart(8)}  master_catalog (ยังมีราคาค้าง ${still.length})`);
  if (still.length) { console.log(`  ❌ ยังเหลือราคา: ${still.map(s => s.name).join(", ")}`); bad++; }
}
console.log(bad ? `\n❌ ยังเหลือของที่สั่งล้างอยู่ ${bad} จุด — ตรวจสิทธิ์เขียนของฐานข้อมูล` : "\n✅ เรียบร้อย");
process.exit(bad ? 1 : 0);
