// ── ตัวรันทดสอบ flow ขายบนเว็บจริง (ขั้น 6 วันขึ้นระบบ) ─────────────────────────────────────────────
//   node tests/prod-live/run.mjs --target local|prod setup     สร้างสาขา ZZT + บัญชีชั่วคราว 2 + ลูกค้าเป้าหมายตั้งต้น
//   node tests/prod-live/run.mjs --target local|prod test      รัน live-flow.spec.ts (กดผ่านหน้าจอ)
//   node tests/prod-live/run.mjs --target local|prod files     ลบแถวของการทดสอบส่งอีเมลจริง (ถ้ามี · email-send-cleanup.mjs)
//                                                              แล้วลบไฟล์ใน Storage ที่ข้อทดสอบสร้าง (ก่อนรัน cleanup.sql)
//   node tests/prod-live/run.mjs --target prod cleanup              ฐานจริง: นับบันทึกการใช้งาน (ปนแถวจริงต้อง 0) → cleanup.sql
//                                                              (ใส่ชื่อชุดสำรองที่ซ้อมกู้ผ่านให้เอง) → ตรวจว่าไม่เหลือแถวทดสอบ
//   ลำดับล้าง: files → cleanup (cleanup.sql ลบบัญชีทดสอบ — ขั้นล้างอีเมลต้องได้รหัสบัญชีก่อนบัญชีหาย)
// ด่านฐานจริง (บอสสั่ง 28 ต.ค. 69): --target prod ทุกขั้นต้องมีผลสำรอง+ซ้อมกู้ "ผ่าน" ภายใน 30 นาที (scripts/lib/prodBackupMark.mjs)
//   ไม่มี/ไม่ผ่าน/เก่าเกิน = ไม่รัน ตรวจก่อนอ่านกุญแจหรือต่อฐาน — ไม่พึ่งการต่อคำสั่งด้วย && · ข้อทดสอบ tests/tools/prod-live-guard.test.mjs
// ไม่พิมพ์รหัสผ่าน · อีเมลชั่วคราวเป็น live-*@example.test · สถานะเก็บที่ไฟล์ใน LIVE_STATE_DIR (ไม่อยู่ในโค้ด)
import { readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { ต้นทาง } from "../../scripts/lib/session.mjs";
import { ขอล็อกฐานทดสอบ } from "../../scripts/lib/testDbLock.mjs";
import { กันฐานจริง } from "../../scripts/lib/prodBackupMark.mjs";

const args = process.argv.slice(2);
const target = args[args.indexOf("--target") + 1];
const phase = args.at(-1);
if (!["local", "prod"].includes(target) || !["setup", "test", "files", "trial", "cleanup"].includes(phase)) {
  console.error("ใช้: node tests/prod-live/run.mjs --target local|prod setup|test|files|trial|cleanup"); process.exit(2);
}
const ชุดสำรอง = target === "prod" ? กันฐานจริง(`prod-live ${phase}`) : "";
const envFile = target === "prod" ? ".env.production.local" : "apps/hq/.env.local";
const env = Object.fromEntries(readFileSync(envFile, "utf8").split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l)).map(l => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
// ในเครื่อง: ที่อยู่ที่รอบตรวจเต็มส่งมา หรือพอร์ตทดสอบของโฟลเดอร์นี้ (scripts/lib/session.mjs) · เขียนฐานทดสอบ = ถือล็อกฐานทดสอบ
const WEB = target === "prod"
  ? { hq: "https://pms.benjaminpebsteel.com", dealer: "https://dealerpms.benjaminpebsteel.com" }
  : { hq: process.env.PMS_HQ_ORIGIN ?? ต้นทาง("test").hq, dealer: process.env.PMS_DEALER_ORIGIN ?? ต้นทาง("test").dealer };
if (target === "local") ขอล็อกฐานทดสอบ(`prod-live ในเครื่อง (${phase})`);
const STATE = path.join(process.env.LIVE_STATE_DIR ?? ".", `live-state-${target}.json`);
const CODE = "ZZT";
const svc = createClient(URL_, KEY, { auth: { persistSession: false } });
const ตาย = m => { console.error(`✗ ${m}`); process.exit(1); };

if (phase === "setup") {
  if (existsSync(STATE)) ตาย(`มีสถานะรอบก่อนค้างอยู่ (${STATE}) — ล้างก่อน`);
  const { data: มี } = await svc.from("dealers").select("code").eq("code", CODE);
  if (มี?.length) ตาย(`มีสาขา ${CODE} อยู่แล้ว — ไม่แตะ`);
  const รหัส = `Live-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 6)}9`;
  const t = Date.now();
  const st = { code: CODE, password: รหัส, users: [], leadNum: 979_000_000 + (t % 999_999), company: `ZZTEST-ทดสอบระบบ-${t % 100000}` };
  writeFileSync(STATE, JSON.stringify(st));
  const d = await svc.from("dealers").insert({ code: CODE, name: "สาขาทดสอบชั่วคราว (ลบทิ้ง)", status: "active", province: "ระยอง", region: "ตะวันออก" });
  if (d.error) ตาย(`สร้างสาขาไม่สำเร็จ: ${d.error.message}`);
  // จังหวัดที่ดูแล — ดีลเลอร์สร้างลีดได้เฉพาะในพื้นที่ตัวเอง · หน้าแก้ไขดีลเลอร์ของ HQ ไม่มีช่องนี้ (กำหนดได้ตอนตั้งเป็นดีลเลอร์เท่านั้น)
  //   ลบตามสาขาอัตโนมัติ (FK ON DELETE CASCADE) — cleanup.sql ไม่ต้องลบเอง
  //   ฐานที่ลงใบ 0259 แล้วให้พื้นที่ตามจังหวัดที่ตั้งเอง (ดีลเลอร์ 1 ราย = 1 จังหวัด) → มีแล้วข้าม · ฐานก่อนใบนี้ = ใส่เอง
  const พื้นที่ = await svc.from("dealer_territories").upsert({ dealer_code: CODE, province: "ระยอง" }, { onConflict: "province,dealer_code", ignoreDuplicates: true });
  if (พื้นที่.error) ตาย(`ตั้งจังหวัดที่ดูแลไม่สำเร็จ: ${พื้นที่.error.message}`);
  const { data: ได้พื้นที่ } = await svc.from("dealer_territories").select("province").eq("dealer_code", CODE);
  if ((ได้พื้นที่ ?? []).map(x => x.province).join(",") !== "ระยอง") ตาย(`จังหวัดที่ดูแลของสาขาทดสอบไม่ใช่ระยอง: ${JSON.stringify(ได้พื้นที่)}`);
  // ข้อมูลบริษัทครบ — ส่ง/พิมพ์ใบให้ลูกค้าได้เฉพาะสาขาที่กรอกชื่อบริษัท · ที่อยู่ · เลขผู้เสียภาษีครบ (ใบ 0247) · cleanup.sql ลบแถวนี้
  const ตั้งค่า = await svc.from("dealer_settings").upsert({ dealer_code: CODE,
    issuer: { company: "ZZTEST บริษัทสาขาทดสอบชั่วคราว", address: "ZZTEST ที่อยู่ทดสอบ", phone: "000-000-0000", taxId: "0000000000000" } },
    { onConflict: "dealer_code" });
  if (ตั้งค่า.error) ตาย(`ตั้งข้อมูลบริษัทไม่สำเร็จ: ${ตั้งค่า.error.message}`);
  for (const [role, code] of [["SUPER_ADMIN", ""], ["DEALER_ADMIN", CODE]]) {
    const email = `live-${role === "SUPER_ADMIN" ? "hq" : "dealer"}-${t}@example.test`;
    const { data, error } = await svc.auth.admin.createUser({ email, password: รหัส, email_confirm: true,
      app_metadata: { must_change_password: false, must_verify_email: false } });
    if (error) ตาย(`สร้างบัญชีไม่สำเร็จ: ${error.message}`);
    st.users.push({ id: data.user.id, email, role });
    writeFileSync(STATE, JSON.stringify(st));
    const p = await svc.from("profiles").upsert({ id: data.user.id, role, dealer_code: code, name: "บัญชีทดสอบชั่วคราว",
      status: "active", contact_email_verified_at: new Date().toISOString() }, { onConflict: "id" });
    if (p.error) ตาย(`ตั้งโปรไฟล์ไม่สำเร็จ: ${p.error.message}`);
  }
  // ลูกค้าเป้าหมายตั้งต้น — ใส่ด้วยกุญแจฝั่งเซิร์ฟเวอร์ (ทุกจังหวัดมีดีลเลอร์ครองพื้นที่แล้ว สาขาทดสอบเพิ่มเองไม่ได้)
  const l = await svc.from("leads").insert({ id: `#L-${st.leadNum}`, num_id: st.leadNum, dealer_code: CODE, company: st.company,
    name: st.company, contact: "ผู้ทดสอบ", phone: "000-000-0000", province: "ระยอง", product: "โกดังสำเร็จรูป", status: "BULLET" });
  if (l.error) ตาย(`สร้างลูกค้าเป้าหมายไม่สำเร็จ: ${l.error.message}`);
  console.log(`✓ setup: สาขา ${CODE} · บัญชี ${st.users.length} · ลูกค้าเป้าหมาย #L-${st.leadNum}`);
}

if (phase === "test" || phase === "trial") {
  // trial = ทดลองใช้เว็บแทนบอส (tests/prod-live/trial/trial.ts · บอสสั่ง 21 ต.ค. 69) — ใช้สาขา/บัญชีชั่วคราวชุดเดียวกัน
  const st = JSON.parse(readFileSync(STATE, "utf8"));
  const config = phase === "trial" ? "tests/prod-live/trial/playwright.config.ts" : "tests/prod-live/playwright.config.ts";
  const r = spawnSync("npx", ["playwright", "test", "-c", config, "--reporter=line"], {
    stdio: "inherit", shell: true, env: { ...process.env, LIVE_TARGET: target,
      LIVE_SHOTS_DIR: process.env.LIVE_SHOTS_DIR ?? `C:/.claude/pms-shots/trial/${target}`,
      LIVE_HQ_URL: WEB.hq, LIVE_DEALER_URL: WEB.dealer, LIVE_PASSWORD: st.password,
      LIVE_HQ_EMAIL: st.users.find(u => u.role === "SUPER_ADMIN").email, LIVE_DEALER_EMAIL: st.users.find(u => u.role === "DEALER_ADMIN").email,
      LIVE_DEALER_CODE: st.code, LIVE_COMPANY: st.company, LIVE_LEAD_NUM: String(st.leadNum),
      LIVE_SUPABASE_URL: URL_, LIVE_SERVICE_KEY: KEY, LIVE_ANON_KEY: ANON } });
  process.exit(r.status ?? 1);
}

if (phase === "files") {
  // การทดสอบส่งอีเมลจริง (email-send-once.mjs) ส่งไปผู้รับแจ้งเตือน HQ — cleanup.sql เลือกด้วยอีเมล live-* จึงไม่ครอบ
  //   ต้องลบด้วยรหัสบัญชีทดสอบก่อน cleanup.sql ลบบัญชีทิ้ง (บอสสั่ง 19 ต.ค. 69 · ห้ามเลือกด้วยอีเมลผู้รับ)
  const st = existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : null;
  if (st?.emailTest) {
    if (target !== "prod") ตาย("การทดสอบส่งอีเมลจริงมีแต่ระบบจริง");
    const r = spawnSync("node", ["tests/prod-live/email-send-cleanup.mjs", "--yes"], { stdio: "inherit", shell: true, env: process.env });
    if (r.status !== 0) ตาย("ล้างแถวของการทดสอบส่งอีเมลไม่สำเร็จ — หยุดก่อน cleanup.sql");
  }
  const { data: rows, error } = await svc.from("files").select("storage_path").eq("dealer_code", CODE);
  if (error) ตาย(error.message);
  const paths = (rows ?? []).map(r => r.storage_path).filter(Boolean);
  const { data: buckets } = await svc.storage.listBuckets();
  let ลบ = 0;
  for (const b of buckets ?? []) {
    if (!paths.length) break;
    const { data } = await svc.storage.from(b.id).remove(paths);
    ลบ += data?.length ?? 0;
  }
  console.log(`✓ files: แถวไฟล์ ${rows?.length ?? 0} · ลบใน Storage ${ลบ}`);
}
if (phase === "cleanup") {
  // ฐานในเครื่องล้างโดยรอบตรวจเต็ม (scripts/test-prodbuild.mjs) · ที่นี่ฐานจริงเท่านั้น ผ่านโฟลเดอร์ที่ผูกฐานจริงไว้ (supabase link)
  if (target !== "prod") ตาย("cleanup ใช้กับ --target prod เท่านั้น (ฐานในเครื่องล้างโดยรอบตรวจเต็ม)");
  const OPS = process.env.PMS_PROD_OPS_DIR ?? "C:/.claude/pms-prod-ops";
  const ถาม = (ไฟล์, ชื่อขั้น) => {
    const r = spawnSync("npx", ["supabase", "db", "query", "--linked", "--workdir", `"${OPS}"`, "--output-format", "json", "-f", `"${ไฟล์}"`],
      { cwd: OPS, encoding: "utf8", shell: true });
    if (r.status !== 0) ตาย(`${ชื่อขั้น} ไม่สำเร็จ (รหัส ${r.status}) — ${(r.stderr || r.stdout || "").trim().slice(0, 300)}`);
    try { return JSON.parse(r.stdout.slice(r.stdout.indexOf("{"))).rows ?? []; } catch { ตาย(`${ชื่อขั้น}: อ่านผลไม่ได้`); }
  };
  const นับ = () => ถาม(path.resolve("tests/prod-live/cleanup-audit-count.sql"), "นับบันทึกการใช้งาน")[0] ?? {};
  const ก่อน = นับ();
  if (Number(ก่อน.ปนแถวจริง) !== 0) ตาย(`เงื่อนไขลบจับแถวที่ไม่ใช่แถวทดสอบ ${ก่อน.ปนแถวจริง} แถว — ไม่ลบ หยุดรายงาน`);
  const ไฟล์ล้าง = path.join(OPS, "cleanup-run.sql");
  writeFileSync(ไฟล์ล้าง, readFileSync("tests/prod-live/cleanup.sql", "utf8").replaceAll("__ชุดสำรองก่อนลบ__", ชุดสำรอง));
  ถาม(ไฟล์ล้าง, "cleanup.sql");
  const หลัง = นับ();
  const ไฟล์เหลือ = path.join(OPS, "cleanup-left.sql");
  writeFileSync(ไฟล์เหลือ, `select (select count(*) from public.dealers where code = '${CODE}') as สาขา,
  (select count(*) from public.leads where dealer_code = '${CODE}') as ลีด,
  (select count(*) from auth.users where email like 'live-%@example.test') as บัญชี;
`);
  const เหลือ = ถาม(ไฟล์เหลือ, "ตรวจแถวที่เหลือ")[0] ?? {};
  const ค้าง = { บันทึก: Number(หลัง.จะลบ), สาขา: Number(เหลือ.สาขา), ลีด: Number(เหลือ.ลีด), บัญชี: Number(เหลือ.บัญชี) };
  if (Object.values(ค้าง).some(n => n !== 0)) ตาย(`ล้างแล้วยังเหลือแถวทดสอบ ${JSON.stringify(ค้าง)} — หยุดรายงาน`);
  if (existsSync(STATE)) rmSync(STATE);   // สถานะมีรหัสผ่านบัญชีชั่วคราว — ล้างครบแล้วไม่ต้องเก็บ
  console.log(`✓ cleanup: บันทึกการใช้งานทดสอบลบ ${ก่อน.จะลบ} · ไม่เหลือแถวทดสอบ (สาขา 0 · ลีด 0 · บัญชี 0 · บันทึก 0) · ชุดสำรอง ${ชุดสำรอง}`);
}
void ANON;
