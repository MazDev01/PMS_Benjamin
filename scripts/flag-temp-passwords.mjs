// ── ตั้งเครื่องหมาย "ต้องตั้งรหัสผ่านของตัวเอง" ให้บัญชีดีลเลอร์เดิมที่ยังใช้รหัสที่คนอื่นตั้งให้ ───────────
//
// ทำไมต้องมี (13 ต.ค. 69): ด่านที่ฐานข้อมูล (ใบ 0187) กันบัญชีรหัสชั่วคราวไม่ให้แตะข้อมูลจนกว่าจะตั้งรหัสเอง
//   แต่ด่านทำงานจากเครื่องหมาย must_change_password — บัญชีที่เปิดจากไฟล์ด้วยสคริปต์ไม่เคยถูกตั้งเครื่องหมายนี้
//   ตัวนี้ตั้งให้ย้อนหลัง · เกณฑ์เลือกบัญชีอยู่ที่ scripts/lib/tempPasswordAccounts.mjs
//
// ผลกับดีลเลอร์: บัญชีที่ถูกตั้งเครื่องหมาย เข้าระบบครั้งถัดไปจะเจอหน้าตั้งรหัสผ่านใหม่ก่อนใช้งาน
//   คนที่เข้าระบบค้างอยู่จะเจอเมื่อใบผ่านใบปัจจุบันหมดอายุ
//
// ใช้:
//   node scripts/flag-temp-passwords.mjs                 ดูจำนวนอย่างเดียว บนฐานทดสอบ (ค่าตั้งต้น — ไม่แก้อะไร)
//   node scripts/flag-temp-passwords.mjs --apply         ตั้งเครื่องหมายจริง บนฐานทดสอบ
//   node scripts/flag-temp-passwords.mjs --only ABC,XYZ  จำกัดเฉพาะรหัสดีลเลอร์ที่ระบุ
//   node scripts/flag-temp-passwords.mjs --prod                       ดูจำนวนบนฐานจริง (อ่านอย่างเดียว)
//   node scripts/flag-temp-passwords.mjs --prod --apply --yes-prod    ตั้งเครื่องหมายบนฐานจริง
//
// ⚠️ ค่าตั้งต้นคือฐานทดสอบและ "ดูอย่างเดียว" เสมอ — แตะฐานจริงต้องใส่ --prod และจะแก้ได้ต้องมี --apply --yes-prod ครบ
// ⚠️ พิมพ์เฉพาะจำนวน ไม่พิมพ์ชื่อ อีเมล หรือรหัสดีลเลอร์ลงจอ/บันทึก
import { createClient } from "@supabase/supabase-js";
import { readEnvFile, refOf } from "./lib/targetEnv.mjs";
import { เลือกบัญชีที่ต้องตั้งเครื่องหมาย, อ่านตัวเลือก } from "./lib/tempPasswordAccounts.mjs";

const args = process.argv.slice(2);
const มี = f => args.includes(f);
const { ฐานจริง, ลงมือ, only, ผิด } = อ่านตัวเลือก(args);
if (ผิด) { console.error(`❌ ${ผิด}`); process.exit(1); }

const env = readEnvFile(ฐานจริง ? ".env.production.local" : "apps/hq/.env.local");
// ชุดทดสอบที่สั่งรันกับฐานในเครื่องอีกตัว (NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:… ใน env) → ใช้ฐานนั้นด้วย
//   รับเฉพาะที่อยู่ในเครื่อง — ค่าใน env ชี้ที่อื่นไม่มีผล (15 ต.ค. 69 · ก่อนขึ้นระบบจริง ข้อ 5)
if (!ฐานจริง && /^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "") && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
}
const prodRef = refOf(readEnvFile(".env.production.local").NEXT_PUBLIC_SUPABASE_URL ?? "");
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) { console.error("❌ ไม่พบค่าเชื่อมต่อฐานข้อมูล"); process.exit(1); }
const เป็นฐานจริง = prodRef !== "(ไม่ทราบ)" && refOf(URL_) === prodRef;
if (เป็นฐานจริง && !ฐานจริง) { console.error("❌ ไฟล์ค่าเชื่อมต่อของฐานทดสอบชี้ไปที่ฐานจริง — หยุด (จะแตะฐานจริงต้องใส่ --prod เอง)"); process.exit(1); }
if (เป็นฐานจริง && ลงมือ && !มี("--yes-prod")) { console.error("❌ จะตั้งเครื่องหมายบนฐานจริง ต้องใส่ --yes-prod เพื่อยืนยันว่าตั้งใจ"); process.exit(1); }
console.log(`\n🎯 ฐานข้อมูล: ${เป็นฐานจริง ? "ชุดจริง" : "ชุดทดสอบ"} · โหมด: ${ลงมือ ? "ตั้งเครื่องหมายจริง" : "ดูจำนวนอย่างเดียว (ไม่แก้อะไร)"}${only.length ? ` · จำกัด ${only.length} รหัส` : ""}`);

const svc = createClient(URL_, KEY, { auth: { persistSession: false } });
const ทั้งหมด = async (table, cols) => {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await svc.from(table).select(cols).range(from, from + 999);
    if (error) { console.error(`❌ อ่าน ${table} ไม่ได้: ${error.message}`); process.exit(1); }
    out.push(...data);
    if (data.length < 1000) return out;
  }
};
const users = [];
for (let page = 1; ; page++) {
  const { data, error } = await svc.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) { console.error(`❌ อ่านรายชื่อบัญชีไม่ได้: ${error.message}`); process.exit(1); }
  users.push(...data.users.map(u => ({ id: u.id, app_metadata: u.app_metadata })));
  if (data.users.length < 1000) break;
}

const { ต้องตั้ง, สรุป } = เลือกบัญชีที่ต้องตั้งเครื่องหมาย({
  secrets: await ทั้งหมด("dealer_login_secrets", "dealer_code,updated_by"),
  profiles: await ทั้งหมด("profiles", "id,role,dealer_code"),
  users, only,
});
for (const [k, v] of Object.entries(สรุป)) console.log(`  ${k.padEnd(26)} ${v}`);

if (!ลงมือ) { console.log(`\nดูอย่างเดียว — ยังไม่ได้แก้อะไร · จะตั้งเครื่องหมาย ${ต้องตั้ง.length} บัญชี ให้ใส่ --apply\n`); }
else {
  let สำเร็จ = 0, พลาด = 0;
  for (const a of ต้องตั้ง) {
    // ต้องส่ง app_metadata เดิมกลับไปด้วย — ช่องนี้ถูกเขียนทับทั้งก้อน ส่งแค่เครื่องหมายเดียวจะลบค่าอื่นของบัญชีทิ้ง
    // must_verify_email (ด่าน 1): หลังตั้งรหัสแล้วพาไปกรอกและยืนยันอีเมลติดต่อ — ระบบจริงมีอีเมลติดต่อ 0/155 บัญชี
    const { error } = await svc.auth.admin.updateUserById(a.id, { app_metadata: { ...a.appMeta, must_change_password: true, must_verify_email: true } });
    if (error) พลาด++; else สำเร็จ++;
  }
  console.log(`\nตั้งเครื่องหมายแล้ว ${สำเร็จ} บัญชี${พลาด ? ` · ไม่สำเร็จ ${พลาด} บัญชี` : ""}\n`);
  // ไม่ใช้ process.exit — บน Windows มันตัดการเชื่อมต่อที่ยังปิดไม่เสร็จ แล้วขึ้นข้อความผิดพลาดของระบบปนในผลลัพธ์
  process.exitCode = พลาด ? 1 : 0;
}
