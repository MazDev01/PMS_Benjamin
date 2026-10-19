// ── ย้ายอีเมลเข้าระบบของดีลเลอร์ไปโดเมนของบริษัท (บอสสั่ง 19 ต.ค. 69) ──────────────────────────────────
//
// ทำไมต้องย้าย: บัญชีดีลเลอร์เดิมเข้าระบบด้วย <รหัสสาขา>@partner-agent.co.th — โดเมนที่ยังไม่มีใครจด
//   ใครจดได้ + Send Email Hook ถูกปิด = รับลิงก์รีเซ็ตรหัสของทุกสาขาได้
//   ย้ายเป็น <รหัสสาขาตัวเล็ก>@dealer.benjaminpebsteel.com (โดเมนย่อยของบริษัท · lib/dealerLogin.ts)
//   ดีลเลอร์พิมพ์แค่รหัสสาขาในหน้าเข้าระบบ ระบบเติมโดเมนให้
//
// ที่เก็บอีเมลเข้าระบบ: auth.users.email + auth.identities (identity_data.email · ช่อง email คำนวณจากตัวนั้น)
//   เปลี่ยนผ่าน auth.admin.updateUserById({ email, email_confirm: true }) = เปลี่ยนทันที ไม่ส่งอีเมลยืนยัน
//   (ทางผู้ดูแลไม่ผ่านขั้นยืนยันอีเมลเปลี่ยน · Send Email Hook ปฏิเสธทุกฉบับอยู่แล้วอีกชั้น)
//   ตารางของเรา: ไม่มีที่เก็บสำเนาอีเมลเข้าระบบ — นับให้เห็นเฉย ๆ (คำขอ/ประวัติเปลี่ยนบัญชี · กล่องขาออก · อีเมลติดต่อ)
//   ประวัติเปลี่ยนบัญชี (dealer_account_changes) = บันทึกย้อนหลัง ไม่แก้
// รหัสผ่านไม่ถูกแตะ — ตรวจด้วยการเข้าระบบจริงด้วยอีเมลใหม่ (สุ่ม --verify-login บัญชี · ใช้สำเนารหัสใน dealer_login_secrets)
//
// ใช้:
//   node scripts/migrate-dealer-login-domain.mjs                         นับอย่างเดียว บนฐานทดสอบ (ค่าตั้งต้น)
//   node scripts/migrate-dealer-login-domain.mjs --apply                 ย้ายจริง บนฐานทดสอบ
//   node scripts/migrate-dealer-login-domain.mjs --prod                  นับอย่างเดียว บนฐานจริง
//   node scripts/migrate-dealer-login-domain.mjs --prod --apply --yes-prod   ย้ายจริง บนฐานจริง
//   --verify-login=N  ตอน --apply ลองเข้าระบบด้วยอีเมลใหม่ N บัญชี (ค่าตั้งต้น 3 · 0 = ไม่ลอง)
//   --only=ABC,XYZ    จำกัดเฉพาะรหัสสาขาที่ระบุ (ข้อทดสอบใช้ — กันไปแตะบัญชีของข้ออื่นที่รันพร้อมกัน)
//   --reverse         ทางถอย: ย้ายกลับ โดเมนใหม่ → โดเมนเดิม (ใช้ร่วมกับตัวเลือกอื่นได้ทุกตัว · ทดสอบใน login-domain-migration.spec.ts)
// ⚠️ ห้ามแตะบัญชี HQ (เลือกเฉพาะบทบาทดีลเลอร์) · พิมพ์เฉพาะจำนวน ไม่พิมพ์อีเมล รหัสสาขา หรือรหัสผ่าน
import { createClient } from "@supabase/supabase-js";
import { readEnvFile, refOf } from "./lib/targetEnv.mjs";
import { วางแผนย้ายโดเมน, OLD_DOMAIN } from "./lib/loginDomainMigration.mjs";
import { ตัวถอดรหัส } from "./lib/dealerSecretNode.mjs";

const args = process.argv.slice(2);
const มี = f => args.includes(f);
const ฐานจริง = มี("--prod"), ลงมือ = มี("--apply"), ย้อน = มี("--reverse");
const เฉพาะ = (args.find(a => a.startsWith("--only=")) ?? "--only=").slice(7).split(",").map(s => s.trim()).filter(Boolean);
const ลองเข้า = Number((args.find(a => a.startsWith("--verify-login=")) ?? "--verify-login=3").split("=")[1]);
const รู้จัก = new Set(["--prod", "--apply", "--yes-prod", "--reverse"]);
const แปลก = args.filter(a => !รู้จัก.has(a) && !a.startsWith("--verify-login=") && !a.startsWith("--only="));
if (แปลก.length || !Number.isInteger(ลองเข้า) || ลองเข้า < 0) { console.error(`❌ ตัวเลือกไม่รู้จัก: ${แปลก.join(" ") || "--verify-login"}`); process.exit(1); }

const env = readEnvFile(ฐานจริง ? ".env.production.local" : "apps/hq/.env.local");
// ชุดทดสอบที่สั่งรันกับฐานในเครื่องอีกตัว → ใช้ฐานนั้น (รับเฉพาะที่อยู่ในเครื่อง · แบบเดียวกับ flag-temp-passwords.mjs)
if (!ฐานจริง && /^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "") && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}
const prodRef = refOf(readEnvFile(".env.production.local").NEXT_PUBLIC_SUPABASE_URL ?? "");
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!URL_ || !KEY) { console.error("❌ ไม่พบค่าเชื่อมต่อฐานข้อมูล"); process.exit(1); }
const เป็นฐานจริง = prodRef !== "(ไม่ทราบ)" && refOf(URL_) === prodRef;
if (เป็นฐานจริง && !ฐานจริง) { console.error("❌ ไฟล์ค่าเชื่อมต่อของฐานทดสอบชี้ไปที่ฐานจริง — หยุด (จะแตะฐานจริงต้องใส่ --prod เอง)"); process.exit(1); }
if (เป็นฐานจริง && ลงมือ && !มี("--yes-prod")) { console.error("❌ จะย้ายอีเมลบนฐานจริง ต้องใส่ --yes-prod เพื่อยืนยันว่าตั้งใจ"); process.exit(1); }
console.log(`\n🎯 ฐานข้อมูล: ${เป็นฐานจริง ? "ชุดจริง" : "ชุดทดสอบ"} · โหมด: ${ลงมือ ? "ย้ายจริง" : "นับอย่างเดียว (ไม่แก้อะไร)"}${เฉพาะ.length ? ` · จำกัด ${เฉพาะ.length} รหัส` : ""} · ทิศ: ${ย้อน ? "ย้อนกลับ (โดเมนใหม่ → โดเมนเดิม)" : "โดเมนเดิม → โดเมนใหม่"}`);

const svc = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const ทั้งหมด = async (table, cols) => {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await svc.from(table).select(cols).range(from, from + 999);
    if (error) { console.error(`❌ อ่าน ${table} ไม่ได้: ${error.message}`); process.exit(1); }
    out.push(...data);
    if (data.length < 1000) return out;
  }
};
const อ่านบัญชี = async () => {
  const out = [];
  for (let page = 1; ; page++) {
    const { data, error } = await svc.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) { console.error(`❌ อ่านรายชื่อบัญชีไม่ได้: ${error.message}`); process.exit(1); }
    out.push(...data.users);
    if (data.users.length < 1000) return out;
  }
};
const นับโดเมนเดิม = async () => {
  const มีเดิม = v => String(v ?? "").toLowerCase().includes(`@${OLD_DOMAIN}`);
  const ขอ = await ทั้งหมด("dealer_account_requests", "new_email,status");
  const ประวัติ = await ทั้งหมด("dealer_account_changes", "old_email,new_email");
  const กล่อง = await ทั้งหมด("email_outbox", "to_email");
  const ติดต่อ = await ทั้งหมด("profiles", "contact_email");
  return {
    "คำขอเปลี่ยนบัญชีที่ใช้โดเมนเดิม (ยังรออยู่)": ขอ.filter(r => r.status === "pending" && มีเดิม(r.new_email)).length,
    "ประวัติเปลี่ยนบัญชีที่มีโดเมนเดิม (ไม่แก้)": ประวัติ.filter(r => มีเดิม(r.old_email) || มีเดิม(r.new_email)).length,
    "กล่องขาออกที่ส่งไปโดเมนเดิม": กล่อง.filter(r => มีเดิม(r.to_email)).length,
    "อีเมลติดต่อที่เป็นโดเมนเดิม": ติดต่อ.filter(r => มีเดิม(r.contact_email)).length,
  };
};

const users = await อ่านบัญชี();
const profiles = await ทั้งหมด("profiles", "id,role,dealer_code");
const { ย้าย, สรุป } = วางแผนย้ายโดเมน({ users: users.map(u => ({ id: u.id, email: u.email })), profiles, ย้อน, เฉพาะ });
for (const [k, v] of Object.entries(สรุป)) console.log(`  ${k.padEnd(24)} ${v}`);
for (const [k, v] of Object.entries(await นับโดเมนเดิม())) console.log(`  ${k}: ${v}`);
if (สรุป.บัญชีHQใช้โดเมนเดิม) console.log(`  ⚠️ มีบัญชีที่ไม่ใช่ดีลเลอร์ใช้โดเมนเดิม ${สรุป.บัญชีHQใช้โดเมนเดิม} บัญชี — สคริปต์นี้ไม่แตะ ต้องดูเอง`);

// ⚠️ ห้ามจบด้วย process.exit() — Node บน Windows ล้ม (UV_HANDLE_CLOSING) ตอนการเชื่อมต่อยังปิดไม่เสร็จ · ตั้ง exitCode แล้วจบเอง
if (!ลงมือ) console.log(`\nนับอย่างเดียว — ยังไม่ได้แก้อะไร · จะย้าย ${ย้าย.length} บัญชี ให้ใส่ --apply\n`);
else await ย้ายจริง();

async function ย้ายจริง() {

let สำเร็จ = 0, พลาด = 0, ตรวจไม่ผ่าน = 0;
for (const a of ย้าย) {
  const { error } = await svc.auth.admin.updateUserById(a.id, { email: a.to, email_confirm: true });
  if (error) { พลาด++; console.error(`  ✗ ย้ายไม่สำเร็จ 1 บัญชี: ${error.message}`); continue; }
  // ตรวจหลังย้าย: อีเมลบัญชี + ข้อมูลยืนยันตัวตนเป็นอีเมลใหม่ · ไม่มีคำขอเปลี่ยนอีเมลค้าง (= ไม่ได้รอส่งอีเมลยืนยัน)
  const { data } = await svc.auth.admin.getUserById(a.id);
  const u = data?.user;
  const ตัวตน = (u?.identities ?? []).filter(i => i.provider === "email");
  const ผ่าน = u?.email === a.to && ตัวตน.length > 0 && ตัวตน.every(i => String(i.identity_data?.email ?? "").toLowerCase() === a.to)
    && !u?.new_email && !u?.email_change_sent_at;
  if (ผ่าน) สำเร็จ++; else { ตรวจไม่ผ่าน++; console.error("  ✗ ย้ายแล้วแต่ข้อมูลไม่ครบ 1 บัญชี (อีเมลบัญชี/ข้อมูลยืนยันตัวตน/คำขอเปลี่ยนค้าง)"); }
}
console.log(`\n✓ ย้ายสำเร็จ ${สำเร็จ} · ย้ายไม่สำเร็จ ${พลาด} · ย้ายแล้วตรวจไม่ผ่าน ${ตรวจไม่ผ่าน}`);

// รหัสผ่านเดิมยังเข้าระบบได้ด้วยอีเมลใหม่ — ลองจริงทีละบัญชีตามที่สั่ง (ใช้สำเนารหัสที่ HQ เก็บไว้)
let เข้าได้ = 0, เข้าไม่ได้ = 0, ไม่มีสำเนา = 0;
if (ลองเข้า > 0 && ย้าย.length) {
  const ถอด = ตัวถอดรหัส(env.DEALER_SECRET_KEY ?? "");
  if (!ถอด || !ANON) console.log("  ข้ามการลองเข้าระบบ — ไม่มีกุญแจถอดรหัส (DEALER_SECRET_KEY) หรือกุญแจสาธารณะ");
  else {
    const สำเนา = new Map((await ทั้งหมด("dealer_login_secrets", "dealer_code,secret")).map(s => [String(s.dealer_code).toUpperCase(), s.secret]));
    for (const a of ย้าย.slice(0, ลองเข้า)) {
      const pw = สำเนา.has(a.dealerCode) ? ถอด(สำเนา.get(a.dealerCode)) : null;
      if (!pw) { ไม่มีสำเนา++; continue; }
      const anon = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data, error } = await anon.auth.signInWithPassword({ email: a.to, password: pw });
      if (!error && data.session) { เข้าได้++; await anon.auth.signOut(); } else เข้าไม่ได้++;
    }
    console.log(`  ลองเข้าระบบด้วยอีเมลใหม่: ได้ ${เข้าได้} · ไม่ได้ ${เข้าไม่ได้} · ไม่มีสำเนารหัส ${ไม่มีสำเนา}`);
  }
}
const หลัง = วางแผนย้ายโดเมน({ users: (await อ่านบัญชี()).map(u => ({ id: u.id, email: u.email })), profiles, ย้อน, เฉพาะ });
console.log(`  หลังย้าย: ดีลเลอร์ใช้โดเมนปลายทาง ${หลัง.สรุป.ใช้โดเมนใหม่แล้ว} · ยังเหลือโดเมนต้นทาง ${หลัง.สรุป.ต้องย้าย + หลัง.สรุป.ชื่อซ้ำกับบัญชีอื่น + หลัง.สรุป.ไม่มีรหัสสาขา}\n`);
process.exitCode = พลาด || ตรวจไม่ผ่าน || เข้าไม่ได้ ? 1 : 0;
}
