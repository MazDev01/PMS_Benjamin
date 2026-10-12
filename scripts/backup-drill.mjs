// ── ซ้อมกู้คืนข้อมูล — พิสูจน์ว่าระบบสำรองใช้ได้จริง ────────────────────────────────
//
// ⚠️ หลักการที่ต้องยึด: **ระบบสำรองที่ไม่เคยทดลองกู้ ไม่นับว่ามีระบบสำรอง**
//   เคสที่เจอบ่อยที่สุดในระบบจริงคือสำรองไว้ครบทุกวัน แต่วันที่ไฟไหม้กลับกู้ไม่ได้
//   เพราะไม่มีใครเคยลอง — ไฟล์เสีย ลำดับตารางผิด หรือกู้แล้วใช้งานต่อไม่ได้
//   ตัวนี้จึงจำลอง "ลบข้อมูลผิดโดยไม่ตั้งใจ" ของจริง แล้วกู้กลับ แล้วตรวจทีละช่อง
//
// ทำอะไรบ้าง (ทุกขั้นตรวจผลจริง ไม่ใช่แค่สั่งแล้วเชื่อว่าผ่าน):
//   1. สร้างลีดทดสอบ 1 รายการ (ป้าย ZZ ให้ตัวตรวจความพร้อมจับได้ถ้าลืมลบ)
//   2. สำรองข้อมูล
//   3. ลบลีดนั้นทิ้ง + ยืนยันว่าหายจริง  ← จำลองเหตุการณ์ "ลบผิด"
//   4. กู้คืนจากไฟล์สำรอง
//   5. เทียบทีละช่องว่าได้ของเดิมกลับมาครบเป๊ะ
//   6. ตรวจว่าตัวนับเลขอัตโนมัติยังใช้งานต่อได้ (กับดัก "กู้แล้วบันทึกใหม่ไม่ได้")
//   7. เก็บกวาด — ลบลีดทดสอบและไฟล์สำรองของการซ้อมทิ้ง
//
// 🔒 แตะเฉพาะข้อมูลที่ตัวเองสร้างขึ้นมาเท่านั้น ไม่ยุ่งกับข้อมูลจริงแม้แต่แถวเดียว
//
// รัน: node scripts/backup-drill.mjs
import { createClient } from "@supabase/supabase-js";
import { loadTarget } from "./lib/targetEnv.mjs";
import { readFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";

const DRILL_DIR = "backups/_drill";
const MARK = { id: "ZZ-DRILL", dealer_code: "" };   // dealer_code เติมจากทะเบียนจริงข้างล่าง

// ⚠️ ตั้งแต่แยกฐานข้อมูล (11 ส.ค. 69) ห้ามอ่าน apps/hq/.env.local ตรง ๆ — ไฟล์นั้นชี้ฐานทดสอบ
//    การซ้อมกู้คืนต้องซ้อมกับฐานจริง ไม่งั้นพิสูจน์ไม่ได้ว่าของจริงกู้ได้ (ใส่ --test เพื่อซ้อมกับฐานทดสอบ)
const target = loadTarget({ allowTest: true });
const svc = createClient(target.url, target.serviceKey, { auth: { persistSession: false } });

// สาขาที่ใช้วางข้อมูลซ้อม — ต้องหยิบจากทะเบียนจริง ไม่ใช่เขียนรหัสตายไว้
// (เดิมตรึงเป็น "RYG" ซึ่งเป็นสาขาทดสอบ · พอลบสาขานั้นออกจากฐานจริง การซ้อมจะพังทันที
//  เพราะลีดต้องอ้างสาขาที่มีอยู่จริง — และจะไม่มีใครรู้จนถึงวันที่ต้องกู้ของจริง)
{
  const { data } = await svc.from("dealers").select("code").limit(1);
  if (!data?.length) {
    console.error("\n❌ ฐานข้อมูลนี้ยังไม่มีดีลเลอร์สักราย — ซ้อมกู้คืนไม่ได้");
    console.error("   การซ้อมต้องสร้างลีดของสาขาใดสาขาหนึ่ง ให้เพิ่มดีลเลอร์ก่อนแล้วค่อยซ้อม");
    process.exit(1);
  }
  MARK.dealer_code = data[0].code;
}

const steps = [];
const step = (ok, name, detail = "") => { steps.push({ ok, name, detail }); console.log(`  ${ok ? "✅" : "❌"} ${name.padEnd(46)} ${detail}`); };
const run = (script, args = []) => execFileSync(process.execPath, [script, ...args], { encoding: "utf8", stdio: "pipe" });
const del = () => svc.from("leads").delete().eq("id", MARK.id).eq("dealer_code", MARK.dealer_code);

console.log("\n══ ซ้อมกู้คืนข้อมูล ══\n");

// เผื่อรอบก่อนค้างไว้
await del();

// ── 1) สร้างข้อมูลทดสอบ ──
const SEED = {
  ...MARK,
  name: "ZZ ซ้อมกู้คืน", company: "ZZ-บริษัททดสอบการกู้คืนข้อมูล",
  phone: "0800000000", province: "ระยอง", status: "WAITING", value: 1234567,
  note: "แถวนี้สร้างโดย scripts/backup-drill.mjs — ถ้าเห็นค้างอยู่แปลว่าการซ้อมหยุดกลางคัน ลบได้เลย",
  created_at: new Date().toISOString(),
};
let before;   // แถวตามที่ "ฐานข้อมูลเก็บไว้จริง" — คือของที่ต้องได้กลับมาเป๊ะ ๆ
{
  const { error } = await svc.from("leads").insert(SEED);
  // ⚠️ ต้องอ่านกลับมาเก็บไว้เทียบ ห้ามเอาค่าที่ส่งไปมาเทียบตรง ๆ
  //   ฐานข้อมูลเก็บและคืนค่าคนละรูปแบบกับที่ส่งไป (ยอดเงินคืนเป็นข้อความ "1234567"
  //   ส่วนเวลาคืนเป็น +00:00 แทน Z) ถ้าเทียบกับค่าที่ส่งจะขึ้น "ไม่ตรงกัน" ทุกครั้ง
  //   ทั้งที่กู้คืนถูกต้อง = สัญญาณเตือนหลอก ซึ่งอันตรายพอ ๆ กับไม่มีสัญญาณเตือน
  const { data } = await svc.from("leads").select("*").eq("id", MARK.id).eq("dealer_code", MARK.dealer_code);
  before = data?.[0];
  step(!error && !!before, "สร้างข้อมูลทดสอบ", error ? error.message.slice(0, 60) : `ลีด ${MARK.id} ของสาขา ${MARK.dealer_code}`);
  if (error || !before) process.exit(1);
}

// ── 2) สำรองข้อมูล ──
{
  let ok = true, detail = "";
  try { const out = run("scripts/backup.mjs", ["_drill"]); detail = (out.match(/รวม [\d,]+ แถว จาก \d+ ตาราง/) ?? [""])[0]; }
  catch (e) { ok = false; detail = String(e.stdout ?? e.message).slice(-70); }
  const dump = ok ? JSON.parse(readFileSync(`${DRILL_DIR}/leads.json`, "utf8")) : [];
  const inDump = dump.some(r => r.id === MARK.id && r.dealer_code === MARK.dealer_code);
  step(ok && inDump, "สำรองข้อมูล — และข้อมูลทดสอบอยู่ในไฟล์จริง", ok ? detail : detail);
  if (!ok || !inDump) process.exit(1);
}

// ── 3) จำลองการลบผิด ──
{
  const { error } = await del();
  const { data } = await svc.from("leads").select("id").eq("id", MARK.id).eq("dealer_code", MARK.dealer_code);
  const gone = (data?.length ?? 0) === 0;
  step(!error && gone, "ลบข้อมูลทิ้ง (จำลองการลบผิด) — ยืนยันว่าหายจริง", gone ? "หายจากฐานข้อมูลแล้ว" : "⚠ ยังอยู่ — การซ้อมนี้ไม่มีความหมาย");
  if (!gone) process.exit(1);
}

// ── 4) กู้คืน ──
{
  let ok = true, detail = "";
  try { const out = run("scripts/restore.mjs", [DRILL_DIR, "--apply", "--yes"]); detail = /✅ กู้คืนครบแล้ว/.test(out) ? "กู้คืนครบ" : "จบแต่ไม่ครบ"; ok = /✅ กู้คืนครบแล้ว/.test(out); }
  catch (e) { ok = false; detail = String(e.stdout ?? e.message).slice(-70); }
  step(ok, "สั่งกู้คืนจากไฟล์สำรอง", detail);
}

// ── 5) เทียบทีละช่อง — จุดตัดสินของการซ้อมทั้งหมด ──
{
  const { data } = await svc.from("leads").select("*").eq("id", MARK.id).eq("dealer_code", MARK.dealer_code);
  const back = data?.[0];
  const diff = back ? Object.keys(before).filter(k => JSON.stringify(back[k]) !== JSON.stringify(before[k])) : ["(ไม่กลับมาเลย)"];
  step(!!back && diff.length === 0, "ข้อมูลกลับมาครบถ้วนตรงทุกช่อง",
    !back ? "⚠ ข้อมูลไม่กลับมา" : diff.length ? `⚠ ต่างกันที่: ${diff.join(", ")}` : `ตรวจครบ ${Object.keys(before).length} ช่อง`);
}

// ── 6) กับดัก "กู้แล้วดูปกติ แต่บันทึกรายการใหม่ไม่ได้" ──
// ตารางที่ใช้เลขรันอัตโนมัติ ถ้าตัวนับไม่ถูกปรับหลังกู้ จะขอเลขที่มีอยู่แล้ว → บันทึกใหม่ไม่ผ่าน
{
  const { data, error } = await svc.from("audit_log")
    .insert({ user: "ZZ-DRILL", role: "SUPER_ADMIN", action: "backup_drill", target: "ซ้อมกู้คืน", at: new Date().toISOString() })
    .select("id");
  const newId = data?.[0]?.id;
  if (newId) await svc.from("audit_log").delete().eq("id", newId);
  step(!error && !!newId, "หลังกู้คืนแล้วยังบันทึกรายการใหม่ได้",
    error ? `⚠ ${error.message.slice(0, 55)}` : `ได้เลขใหม่ ${newId} (ไม่ชนของเดิม)`);
}

// ── 7) เก็บกวาด ──
{
  await del();
  const { data } = await svc.from("leads").select("id").eq("id", MARK.id).eq("dealer_code", MARK.dealer_code);
  try { rmSync(DRILL_DIR, { recursive: true, force: true }); } catch { /* ไม่มีก็ไม่เป็นไร */ }
  step((data?.length ?? 0) === 0, "เก็บกวาดข้อมูลทดสอบและไฟล์ของการซ้อม", "ไม่เหลือร่องรอยในข้อมูลจริง");
}

const bad = steps.filter(s => !s.ok).length;
console.log(`\n${bad ? `❌ การซ้อมไม่ผ่าน ${bad} ข้อ — ระบบสำรองยังเชื่อถือไม่ได้` : "✅ ซ้อมกู้คืนผ่านครบทุกขั้น — ระบบสำรองใช้งานได้จริง"}\n`);
process.exit(bad ? 1 : 0);
