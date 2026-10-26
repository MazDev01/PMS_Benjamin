// ── สร้างฐานทดสอบใหม่จากศูนย์ — ลงใบทั้งหมด → ข้อมูลตั้งต้น → บัญชีทดสอบ (ก่อนขึ้นระบบจริง ข้อ 5 · 15 ต.ค. 69) ──────────
//
// ทำไม: ฐานทดสอบเดิมได้ข้อมูลมาจากการกู้ชุดสำรอง — พังหรือเครื่องใหม่ก็สร้างกลับไม่ได้ และ CI ไม่มีทางได้ฐานแบบเดียวกัน
//   ตัวนี้ทำให้ "reset → seed → ผลชุดทดสอบเท่าเดิม" ได้จากของในโค้ดอย่างเดียว:
//     ① supabase db reset (ลงใบ supabase/migrations ทั้งหมดของโฟลเดอร์ที่ชี้)
//     ② tests/fixtures/test-baseline.sql (ข้อมูลสมมติ · ส่งออกด้วย scripts/export-test-baseline.mjs)
//     ③ บัญชีทดสอบ 3 บัญชี + โปรไฟล์ + สำเนารหัสสาขา (เข้ารหัสใหม่ด้วย DEALER_SECRET_KEY) จาก tests/.env.test หรือ process.env
//     ④ ตรวจผล: ล็อกอินได้จริงทุกบัญชี + นับแถว
//
// ⚠️ ฐานในเครื่องเท่านั้น — ล้างทั้งฐาน · หยุดเองถ้าที่อยู่ API ไม่ใช่ 127.0.0.1/localhost (ไม่มีตัวเลือกให้ข้าม)
//
// ใช้: node scripts/reset-test-db.mjs [--workdir <โฟลเดอร์ที่มี supabase/config.toml>]   ค่าตั้งต้น = โฟลเดอร์นี้ (พอร์ต 54321 · CI)
//      node scripts/reset-test-db.mjs --skip-reset …   ข้าม ① (ฐานเพิ่งลงใบมาแล้ว)
import { execFileSync } from "node:child_process";
import { copyFileSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { createCipheriv, randomBytes, createHash } from "node:crypto";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { readEnvFile } from "./lib/targetEnv.mjs";
import { ขอล็อกฐานทดสอบ } from "./lib/testDbLock.mjs";
import { อาร์กิวเมนต์psql, ระหว่างล้างฐาน, คอนเทนเนอร์ as คอนเทนเนอร์ฐานทดสอบ } from "./lib/testDbGuard.mjs";

// เขียนฐานทดสอบ = ถือล็อกฐานทดสอบ — เซสชันอื่นใช้ฐานอยู่ (เช่นรอบตรวจเต็ม) = หยุด บอกว่าใคร (scripts/lib/testDbLock.mjs · 22 ต.ค. 69)
//   (ถือล็อกเฉพาะเมื่อเป็นฐานทดสอบ pms-dbcheck — ฐาน dev ไม่ต้องรอคิวรอบตรวจ · ดูด้านล่าง)

const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const workdir = path.resolve(arg("--workdir") ?? ".");
const sh = (cmd, args, opt = {}) => execFileSync(cmd, args, { encoding: "utf8", shell: process.platform === "win32", maxBuffer: 64 * 1024 * 1024, ...opt });

// ── ค่าเชื่อมต่อจากตัวฐานเอง (ไม่อ่าน .env.local ของแอป — กันชี้ผิดฐาน) ───────────────────────────────
const st = Object.fromEntries(sh("npx", ["supabase", "status", "-o", "env", "--workdir", workdir]).split(/\r?\n/)
  .map(l => l.match(/^([A-Z_]+)="?(.*?)"?$/)).filter(Boolean).map(m => [m[1], m[2]]));
const API = st.API_URL ?? "";
const ฐานมีตัวกัน = () => container === คอนเทนเนอร์ฐานทดสอบ;
const SERVICE = st.SERVICE_ROLE_KEY ?? "", ANON = st.ANON_KEY ?? "";   // ฐานทดสอบ: ตัวสลับกุญแจ (testDbFetchKey.mjs) ใส่กุญแจของรอบให้เอง
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(API) || !SERVICE) {
  console.error(`❌ ไม่ใช่ฐานในเครื่อง หรืออ่านค่าจาก supabase status ไม่ได้ (${API || "ไม่มีที่อยู่"}) — หยุด`);
  process.exit(1);
}
const projectId = readFileSync(path.join(workdir, "supabase/config.toml"), "utf8").match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];
const container = `supabase_db_${projectId}`;
if (ฐานมีตัวกัน()) ขอล็อกฐานทดสอบ("reset-test-db");
console.log(`\n🎯 ฐานทดสอบในเครื่อง: ${projectId} · ${API}`);

// ── ① ลงใบทั้งหมดใหม่ ─────────────────────────────────────────────────────────────────────────────
//   --migrations-from <โฟลเดอร์>: ใบชุดของโฟลเดอร์นั้น (ฐานทดสอบตรงกับไฟล์ของผู้ถือล็อก · scripts/lib/testDbSchema.mjs) — คัดทับทั้งชุดก่อนล้าง
const ใบจาก = arg("--migrations-from");
if (ใบจาก) {
  const ต้น = path.join(path.resolve(ใบจาก), "supabase/migrations"), ปลาย = path.join(workdir, "supabase/migrations");
  const ใบ = readdirSync(ต้น).filter(f => f.endsWith(".sql"));
  for (const f of readdirSync(ปลาย)) if (f.endsWith(".sql") && !ใบ.includes(f)) rmSync(path.join(ปลาย, f));
  for (const f of ใบ) copyFileSync(path.join(ต้น, f), path.join(ปลาย, f));
  console.log(`① ใบปรับฐาน ${ใบ.length} ใบ จาก ${ใบจาก}`);
}
if (!process.argv.includes("--skip-reset")) {
  console.log("① ล้างฐาน + ลงใบทั้งหมด …");
  // NOTICE หลายร้อยบรรทัด — พิมพ์เฉพาะตอนล้มเหลว
  const ล้าง = () => sh("npx", ["supabase", "db", "reset", "--workdir", workdir], { stdio: "pipe" });
  try { ฐานมีตัวกัน() ? ระหว่างล้างฐาน(ล้าง) : ล้าง(); }
  catch (e) { console.error(String(e.stderr ?? e.message).split(/\r?\n/).filter(l => !/^NOTICE|^Applying/.test(l)).join("\n")); process.exit(1); }
}

// ── ② ข้อมูลตั้งต้น ───────────────────────────────────────────────────────────────────────────────
console.log("② ใส่ข้อมูลตั้งต้น (tests/fixtures/test-baseline.sql) …");
sh("docker", [...อาร์กิวเมนต์psql(container), "-X", "-q", "-v", "ON_ERROR_STOP=1"],
  { input: readFileSync("tests/fixtures/test-baseline.sql", "utf8"), stdio: ["pipe", "ignore", "inherit"], shell: false });

// ── ②ข แถว "สำนักงานใหญ่ (HQ)" ในทะเบียนดีลเลอร์ — เจ้าของลูกค้าเป้าหมายของ HQ (ใบ 0197) ห้ามลบ (ใบ 0222) ───────────────
//   ฐานจริงมีแถวนี้ (สร้างตอนนำเข้าลูกค้าเป้าหมายของ HQ) แต่ไม่อยู่ในใบปรับฐานและไฟล์ข้อมูลตั้งต้น → ฐานที่สร้างใหม่จากไฟล์ขาดแถวนี้
//   (เจอ 26 ต.ค. 69: รอบตรวจบนฐานที่สร้างใหม่ตก 5 ข้อที่ต้องใช้แถว HQ) · ค่าเดียวกับฐานจริง (ไม่ใช่ข้อมูลส่วนบุคคล)
console.log("②ข แถว HQ ในทะเบียนดีลเลอร์ …");
sh("docker", [...อาร์กิวเมนต์psql(container), "-X", "-q", "-v", "ON_ERROR_STOP=1"], { shell: false, stdio: ["pipe", "ignore", "inherit"],
  input: "insert into public.dealers (code, name, province, region, revenue_target, status, package, target_manual) values ('HQ', 'สำนักงานใหญ่', 'ทุกจังหวัด', 'ทุกภาค', 3200000, 'active', 'exclusive', false) on conflict (code) do nothing;" });

// ── ②ค ข้อมูลที่ใบปรับฐานเติมให้ตอนลงใบ แต่ข้อมูลตั้งต้นลงทีหลัง (ปิดตัวดักระหว่างใส่) จึงไม่ได้ ───────────────────────
//   quotation_won_at (ใบ 0235 · แดชบอร์ดนับยอดตามวันตอบรับ): ใบตอบรับในข้อมูลตั้งต้นไม่มีวันตอบรับ → หัวการ์ดยอดขายไม่นับ
//   ใช้สูตรเดียวกับขั้นเติมของใบ 0235 · ทำซ้ำได้ (on conflict do nothing) · เจอ 26 ต.ค. 69 ตอนรอบตรวจรันบนฐานที่สร้างใหม่
console.log("②ค วันตอบรับของใบในข้อมูลตั้งต้น (ใบ 0235) …");
sh("docker", [...อาร์กิวเมนต์psql(container), "-X", "-q", "-v", "ON_ERROR_STOP=1"], { shell: false, stdio: ["pipe", "ignore", "inherit"],
  input: `insert into public.quotation_won_at (dealer_code, quote_id, won_at)
select q.dealer_code, q.id, coalesce(h.ordered_at,
         case when q.date ~ '^\\d{4}-\\d{2}-\\d{2}' then (substring(q.date, 1, 10)::date)::timestamp at time zone 'Asia/Bangkok' end, q.created_at, now())
  from public.quotations q left join public.hq_quotes h on h.id = q.hq_quote_id
 where q.status = 'won'
on conflict (dealer_code, quote_id) do nothing;` });

// ── ③ บัญชีทดสอบ ──────────────────────────────────────────────────────────────────────────────────
const ไฟล์ = readEnvFile("tests/.env.test");
const ค่า = k => process.env[k] ?? ไฟล์[k] ?? "";
const กุญแจ = process.env.DEALER_SECRET_KEY ?? readEnvFile("apps/hq/.env.local").DEALER_SECRET_KEY ?? "";
// เข้ารหัสแบบเดียวกับ packages/shared/lib/dealerSecret.ts (v1 · aes-256-gcm · กุญแจ = sha256 ของค่าใน env)
const เข้ารหัส = plain => {
  const k = createHash("sha256").update(กุญแจ).digest(), iv = randomBytes(12), c = createCipheriv("aes-256-gcm", k, iv);
  const d = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), d.toString("base64")].join(":");
};
const บัญชี = [
  // [คีย์ใน tests/.env.test, บทบาท, สาขา, ผู้ตั้งรหัสในสำเนา (ค่าเดิมของฐานทดสอบ)]
  ["TEST_ADMIN", "SUPER_ADMIN", "", null],
  ["TEST_CNX", "DEALER_ADMIN", "CNX", "ผู้ดูแลระบบสำนักงานใหญ่"],
  ["TEST_RYG", "DEALER_ADMIN", "RYG", "ระบบ (เปลี่ยนรหัสรอบแก้ช่องโหว่)"],
];
const svc = createClient(API, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
console.log("③ บัญชีทดสอบ …");
let พัง = 0;
for (const [k, role, code, ผู้ตั้ง] of บัญชี) {
  const email = ค่า(`${k}_EMAIL`), password = ค่า(`${k}_PASSWORD`);
  if (!email || !password) { console.error(`  ❌ ไม่มี ${k}_EMAIL / ${k}_PASSWORD`); พัง++; continue; }
  const { data, error } = await svc.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) { console.error(`  ❌ สร้างบัญชี ${k}: ${error.message}`); พัง++; continue; }
  const name = code ? (await svc.from("dealers").select("name").eq("code", code).single()).data?.name : "ผู้ดูแลระบบสำนักงานใหญ่";
  const { error: pe } = await svc.from("profiles").upsert({
    id: data.user.id, role, dealer_code: code, name, status: "active",
    contact_email: email, contact_email_verified_at: code ? new Date().toISOString() : null,
  }, { onConflict: "id" });
  if (pe) { console.error(`  ❌ โปรไฟล์ ${k}: ${pe.message}`); พัง++; continue; }
  if (code) {
    if (กุญแจ.length < 32) { console.error("  ❌ ไม่มี DEALER_SECRET_KEY (≥32 ตัว) — สร้างสำเนารหัสสาขาไม่ได้"); พัง++; continue; }
    const { error: se } = await svc.from("dealer_login_secrets").upsert({ dealer_code: code, secret: เข้ารหัส(password), updated_by: ผู้ตั้ง }, { onConflict: "dealer_code" });
    if (se) { console.error(`  ❌ สำเนารหัส ${code}: ${se.message}`); พัง++; continue; }
  }
  console.log(`  ✅ ${role}${code ? " · " + code : ""}`);
}

// ── ④ ตรวจผล — ล็อกอินได้จริง ไม่ใช่แค่ "สั่งแล้วไม่ error" ─────────────────────────────────────────────
console.log("④ ตรวจผล …");
const anon = createClient(API, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
for (const [k] of บัญชี) {
  const { data, error } = await anon.auth.signInWithPassword({ email: ค่า(`${k}_EMAIL`), password: ค่า(`${k}_PASSWORD`) });
  if (error || !data?.session) { console.error(`  ❌ ล็อกอิน ${k} ไม่ผ่าน`); พัง++; }
  await anon.auth.signOut().catch(() => {});
}
for (const t of ["dealers", "customers", "leads", "quotations", "master_catalog", "profiles"]) {
  const { count } = await svc.from(t).select("*", { count: "exact", head: true });
  console.log(`  ${String(count ?? 0).padStart(4)}  ${t}`);
}
console.log(พัง ? `\n❌ ไม่ครบ ${พัง} จุด` : "\n✅ ฐานทดสอบพร้อมใช้งาน");
process.exit(พัง ? 1 : 0);
