// ── ล้างเครื่องหมาย "ต้องเปลี่ยนรหัส" + "ต้องยืนยันอีเมล" ของบัญชีดีลเลอร์ (--unset) ───────────────────────────
//
// บอสตัดสิน 19 ต.ค. 69: ดีลเลอร์เข้าระบบแล้วเข้าหน้าหลักทันที ไม่มีหน้าบังคับตั้งรหัส/ยืนยันอีเมล ไม่มีแถบเตือน
//   เดิมตัวนี้ "ตั้ง" เครื่องหมายย้อนหลังให้ 155 บัญชี (13–19 ต.ค. 69) — โหมดตั้งยกเลิกแล้ว เหลือโหมดล้างอย่างเดียว
//   ต้องล้าง must_change_password ด้วย: ฐานมีด่าน 0187 บัญชีที่มีเครื่องหมายนี้อ่าน/เขียนข้อมูลไม่ได้ (เห็นทุกหน้าว่าง
//   รวมตอน HQ เข้าระบบแทนดีลเลอร์) · เกณฑ์เลือกบัญชีอยู่ที่ scripts/lib/tempPasswordAccounts.mjs
//
// ใช้:
//   node scripts/flag-temp-passwords.mjs --unset                        นับอย่างเดียว บนฐานทดสอบ (ไม่แก้อะไร)
//   node scripts/flag-temp-passwords.mjs --unset --apply                ล้างจริง บนฐานทดสอบ
//   node scripts/flag-temp-passwords.mjs --unset --only ABC,XYZ         จำกัดเฉพาะรหัสดีลเลอร์ที่ระบุ
//   node scripts/flag-temp-passwords.mjs --unset --prod                 นับบนฐานจริง (อ่านอย่างเดียว)
//   node scripts/flag-temp-passwords.mjs --unset --prod --apply --yes-prod   ล้างบนฐานจริง
//
// ⚠️ ค่าตั้งต้นคือฐานทดสอบและ "นับอย่างเดียว" เสมอ — แตะฐานจริงต้องใส่ --prod และจะแก้ได้ต้องมี --apply --yes-prod ครบ
// ⚠️ ไม่แตะบัญชี HQ (เลือกเฉพาะบทบาทดีลเลอร์) · พิมพ์เฉพาะจำนวน ไม่พิมพ์ชื่อ อีเมล หรือรหัสดีลเลอร์
import { createClient } from "@supabase/supabase-js";
import { readEnvFile, refOf } from "./lib/targetEnv.mjs";
import { เลือกบัญชีที่ต้องล้างเครื่องหมาย, อ่านตัวเลือก } from "./lib/tempPasswordAccounts.mjs";

const args = process.argv.slice(2);
const มี = f => args.includes(f);
const { ฐานจริง, ลงมือ, ล้าง, only, ผิด } = อ่านตัวเลือก(args);
if (ผิด) { console.error(`❌ ${ผิด}`); process.exit(1); }
// ⛔ โหมดตั้งเครื่องหมายยกเลิกแล้ว (บอสตัดสิน 19 ต.ค. 69: ดีลเลอร์เข้าแล้วเข้าหน้าหลักทันที ไม่บังคับตั้งรหัส/ยืนยันอีเมล)
//   ตั้งเครื่องหมายเมื่อไร ด่านในฐาน (0187) กันข้อมูลทั้งสาขา = ดีลเลอร์เห็นทุกหน้าว่าง · ใช้ได้เฉพาะ --unset (ล้างเครื่องหมาย)
if (!ล้าง) { console.error("❌ โหมดตั้งเครื่องหมายยกเลิกแล้ว (บอสตัดสิน 19 ต.ค. 69) — ใช้ --unset เพื่อล้างเครื่องหมายเท่านั้น"); process.exit(1); }

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
if (เป็นฐานจริง && ลงมือ && !มี("--yes-prod")) { console.error("❌ จะล้างเครื่องหมายบนฐานจริง ต้องใส่ --yes-prod เพื่อยืนยันว่าตั้งใจ"); process.exit(1); }
console.log(`\n🎯 ฐานข้อมูล: ${เป็นฐานจริง ? "ชุดจริง" : "ชุดทดสอบ"} · โหมด: ${ลงมือ ? "ล้างเครื่องหมายจริง" : "นับอย่างเดียว (ไม่แก้อะไร)"}${only.length ? ` · จำกัด ${only.length} รหัส` : ""}`);

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

const { ต้องล้าง, สรุป } = เลือกบัญชีที่ต้องล้างเครื่องหมาย({
  profiles: await ทั้งหมด("profiles", "id,role,dealer_code"),
  users, only,
});
for (const [k, v] of Object.entries(สรุป)) console.log(`  ${k.padEnd(26)} ${v}`);

if (!ลงมือ) { console.log(`
นับอย่างเดียว — ยังไม่ได้แก้อะไร · จะล้างเครื่องหมาย ${ต้องล้าง.length} บัญชี ให้ใส่ --apply
`); }
else {
  let สำเร็จ = 0, พลาด = 0;
  for (const a of ต้องล้าง) {
    // ต้องส่ง app_metadata เดิมกลับไปด้วย — ช่องนี้ถูกเขียนทับทั้งก้อน ส่งแค่เครื่องหมายจะลบค่าอื่นของบัญชีทิ้ง
    const { error } = await svc.auth.admin.updateUserById(a.id, { app_metadata: { ...a.appMeta, must_change_password: false, must_verify_email: false } });
    if (error) พลาด++; else สำเร็จ++;
  }
  console.log(`
ล้างเครื่องหมายแล้ว ${สำเร็จ} บัญชี${พลาด ? ` · ไม่สำเร็จ ${พลาด} บัญชี` : ""}
`);
  // ไม่ใช้ process.exit — บน Windows มันตัดการเชื่อมต่อที่ยังปิดไม่เสร็จ แล้วขึ้นข้อความผิดพลาดของระบบปนในผลลัพธ์
  process.exitCode = พลาด ? 1 : 0;
}
