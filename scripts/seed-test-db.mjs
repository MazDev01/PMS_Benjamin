// ── ตั้งต้นฐานข้อมูล "ชุดทดสอบ" ให้ชุดทดสอบอัตโนมัติใช้งานได้ ──────────────────────
//
// ทำไมต้องมี (แยกฐานข้อมูล 11 ส.ค. 69):
//   ฐานทดสอบเพิ่งสร้างใหม่ มีแต่ตารางเปล่า ชุดทดสอบ 265 ข้อจะรันไม่ได้เลย
//   เพราะมันต้องล็อกอินด้วยบัญชีดีลเลอร์ แล้วบัญชีนั้นต้องผูกกับสาขาที่มีอยู่จริง
//
//   ตัวนี้สร้างของขั้นต่ำที่ชุดทดสอบต้องใช้ ให้เหมือนที่ฐานเดิมเคยมี:
//     ดีลเลอร์ 3 ราย · บัญชีล็อกอิน 4 บัญชี · แม่แบบสินค้า · ค่าตั้งของสำนักงานใหญ่
//
// ⚠️ ห้ามรันกับฐานจริงเด็ดขาด — ตัวนี้สร้าง "ดีลเลอร์สมมติ" ซึ่งเป็นสิ่งที่เราเพิ่งล้างออกจากฐานจริง
//    จึงตรวจก่อนเสมอว่าฐานที่ชี้อยู่ไม่ใช่ฐานจริง และไม่รับ --test/--prod ให้สลับ
//
// รหัสผ่านของบัญชีทดสอบอ่านจาก tests/.env.test (ไฟล์เดียวกับที่ชุดทดสอบใช้)
// ข้อมูลตั้งต้น (ชื่อสาขา/จังหวัด/แม่แบบ) คัดจากไฟล์สำรองของฐานเดิม — ไม่ได้แต่งขึ้นใหม่
//
// รัน: node scripts/seed-test-db.mjs <โฟลเดอร์สำรองที่ใช้เป็นต้นแบบ>
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { readEnvFile, refOf } from "./lib/targetEnv.mjs";
import { ขอล็อกฐานทดสอบ } from "./lib/testDbLock.mjs";

// เขียนฐานทดสอบ = ถือล็อกฐานทดสอบ — เซสชันอื่นใช้ฐานอยู่ (เช่นรอบตรวจเต็ม) = หยุด บอกว่าใคร (scripts/lib/testDbLock.mjs · 22 ต.ค. 69)
ขอล็อกฐานทดสอบ("seed-test-db");

const srcDir = process.argv.slice(2).find(a => !a.startsWith("--"));
if (!srcDir || !existsSync(path.join(srcDir, "manifest.json"))) {
  console.error("ใช้: node scripts/seed-test-db.mjs <โฟลเดอร์สำรองที่ใช้เป็นต้นแบบ>");
  process.exit(1);
}

const app = readEnvFile("apps/hq/.env.local");
const prod = readEnvFile(".env.production.local");
const URL_ = app.NEXT_PUBLIC_SUPABASE_URL, KEY = app.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) { console.error("❌ apps/hq/.env.local ไม่มีค่าเชื่อมต่อครบ"); process.exit(1); }

// ── ด่านกันพลาด: ห้ามชี้ฐานจริง ──────────────────────────────────────────────────
if (prod.NEXT_PUBLIC_SUPABASE_URL && refOf(URL_) === refOf(prod.NEXT_PUBLIC_SUPABASE_URL)) {
  console.error(`\n❌ apps/hq/.env.local ชี้ไปที่ "ฐานจริง" (${refOf(URL_)}) — หยุดทันที`);
  console.error("   ตัวนี้สร้างดีลเลอร์สมมติ ห้ามลงฐานจริงเด็ดขาด");
  process.exit(1);
}
console.log(`\n🎯 ฐานข้อมูลที่จะตั้งต้น: ชุดทดสอบ · ${refOf(URL_)}`);

const svc = createClient(URL_, KEY, { auth: { persistSession: false } });
const read = f => { try { return JSON.parse(readFileSync(path.join(srcDir, f), "utf8")); } catch { return []; } };
const test = readEnvFile("tests/.env.test");

// ── ① ดีลเลอร์ ─────────────────────────────────────────────────────────────────────
const dealers = read("dealers.json");
if (!dealers.length) { console.error("❌ ไฟล์สำรองไม่มีดีลเลอร์ให้คัดลอก"); process.exit(1); }
{
  const { error } = await svc.from("dealers").upsert(dealers, { onConflict: "code" });
  console.log(error ? `  ❌ ดีลเลอร์: ${error.message}` : `  ✅ ดีลเลอร์ ${dealers.length} ราย`);
  if (error) process.exit(1);
}

// ── ② บัญชีล็อกอิน — id ใหม่เสมอ (คนละโปรเจกต์ = คนละ auth) จึงต้องผูก profile ใหม่ ──
// รหัสผ่านต้องตรงกับ tests/.env.test ไม่งั้นชุดทดสอบล็อกอินไม่ได้
const oldProfiles = read("profiles.json");
const oldUsers = read("_auth_users.json");
const pwOf = email => {
  for (const k of Object.keys(test)) {
    if (/_EMAIL$/.test(k) && test[k].toLowerCase() === email.toLowerCase()) return test[k.replace(/_EMAIL$/, "_PASSWORD")];
  }
  return null;
};

for (const u of oldUsers) {
  const prof = oldProfiles.find(p => p.id === u.id);
  if (!prof) { console.log(`  ⏭️  ${u.email} — ไม่มีโปรไฟล์คู่กัน ข้าม`); continue; }
  const pw = pwOf(u.email);
  if (!pw) { console.log(`  ⏭️  ${u.email} — ไม่มีรหัสผ่านใน tests/.env.test ข้าม`); continue; }

  const { data: created, error: authErr } = await svc.auth.admin.createUser({
    email: u.email, password: pw, email_confirm: true, user_metadata: u.user_metadata ?? {},
  });
  if (authErr && !/already/i.test(authErr.message)) { console.log(`  ❌ ${u.email}: ${authErr.message}`); continue; }

  // มีอยู่แล้ว (รันซ้ำ) → หา id เดิมมาใช้
  let id = created?.user?.id;
  if (!id) {
    const { data: list } = await svc.auth.admin.listUsers();
    id = list?.users?.find(x => x.email?.toLowerCase() === u.email.toLowerCase())?.id;
  }
  if (!id) { console.log(`  ❌ ${u.email}: หา id ของบัญชีไม่เจอ`); continue; }

  const { error: pErr } = await svc.from("profiles").upsert({ ...prof, id }, { onConflict: "id" });
  console.log(pErr ? `  ❌ โปรไฟล์ ${u.email}: ${pErr.message}` : `  ✅ ${u.email} · ${prof.role}${prof.dealer_code ? " · " + prof.dealer_code : ""}`);
}

// ── ③ ค่าตั้งกลางและแม่แบบสินค้า ────────────────────────────────────────────────
for (const [file, table, conflict] of [
  ["master_catalog.json", "master_catalog", "id"],
  ["hq_company.json", "hq_company", "id"],
  ["hq_policy.json", "hq_policy", "id"],
  ["hq_targets.json", "hq_targets", "id"],
  ["hq_notif_rules.json", "hq_notif_rules", "id"],
  ["hq_sales_journey.json", "hq_sales_journey", "id"],
  ["dealer_settings.json", "dealer_settings", "dealer_code"],
  ["dealer_lead_rules.json", "dealer_lead_rules", "dealer_code"],
  // ⚠️ ขาดไม่ได้ — หน้า HQ มีปุ่มดูอีเมล+รหัสผ่านของสาขา และมีเทสต์ที่เอารหัสนั้นไปล็อกอินจริง
  //    ไม่คัดมาด้วย = เทสต์ตก 1 ข้อ ข้าม 1 ข้อ โดยไม่มีอะไรบอกว่าเพราะอะไร (เจอตอนแยกฐาน 11 ส.ค. 69)
  //    ค่าที่เก็บเป็นข้อความเข้ารหัส ใช้กุญแจ DEALER_SECRET_KEY ตัวเดียวกันทั้งสองฐาน จึงถอดได้ปกติ
  ["dealer_login_secrets.json", "dealer_login_secrets", "dealer_code"],
]) {
  const rows = read(file);
  if (!rows.length) { console.log(`  ⏭️  ${table} — ไม่มีข้อมูลในไฟล์สำรอง`); continue; }
  const { error } = await svc.from(table).upsert(rows, { onConflict: conflict });
  console.log(error ? `  ❌ ${table}: ${error.message.slice(0, 70)}` : `  ✅ ${table} ${rows.length} แถว`);
}

// ── ④ ตรวจผล — ล็อกอินได้จริงไหม ไม่ใช่แค่ "สั่งแล้วไม่ error" ───────────────────
console.log("\n── ตรวจผล ──");
const anon = createClient(URL_, app.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
let bad = 0;
for (const k of Object.keys(test).filter(k => /_EMAIL$/.test(k))) {
  const email = test[k], pw = test[k.replace(/_EMAIL$/, "_PASSWORD")];
  const { data, error } = await anon.auth.signInWithPassword({ email, password: pw });
  if (error || !data?.session) { console.log(`  ❌ ล็อกอิน ${email} ไม่ผ่าน — ${error?.message ?? "ไม่ได้ session"}`); bad++; }
  else console.log(`  ✅ ล็อกอิน ${email} ผ่าน`);
  await anon.auth.signOut().catch(() => {});
}
for (const t of ["dealers", "profiles", "master_catalog"]) {
  const { count } = await svc.from(t).select("*", { count: "exact", head: true });
  console.log(`  ${String(count ?? 0).padStart(4)}  ${t}`);
}
console.log(bad ? `\n❌ ยังล็อกอินไม่ได้ ${bad} บัญชี` : "\n✅ ฐานทดสอบพร้อมใช้งาน");
process.exit(bad ? 1 : 0);
