// ── ตัวรันทดสอบ flow ขายบนเว็บจริง (ขั้น 6 วันขึ้นระบบ) ─────────────────────────────────────────────
//   node tests/prod-live/run.mjs --target local|prod setup     สร้างสาขา ZZT + บัญชีชั่วคราว 2 + ลูกค้าเป้าหมายตั้งต้น
//   node tests/prod-live/run.mjs --target local|prod test      รัน live-flow.spec.ts (กดผ่านหน้าจอ)
//   node tests/prod-live/run.mjs --target local|prod files     ลบแถวของการทดสอบส่งอีเมลจริง (ถ้ามี · email-send-cleanup.mjs)
//                                                              แล้วลบไฟล์ใน Storage ที่ข้อทดสอบสร้าง (ก่อนรัน cleanup.sql)
//   ลำดับล้าง: files → cleanup.sql (cleanup.sql ลบบัญชีทดสอบ — ขั้นล้างอีเมลต้องได้รหัสบัญชีก่อนบัญชีหาย)
// ไม่พิมพ์รหัสผ่าน · อีเมลชั่วคราวเป็น live-*@example.test · สถานะเก็บที่ไฟล์ใน LIVE_STATE_DIR (ไม่อยู่ในโค้ด)
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const target = args[args.indexOf("--target") + 1];
const phase = args.at(-1);
if (!["local", "prod"].includes(target) || !["setup", "test", "files"].includes(phase)) {
  console.error("ใช้: node tests/prod-live/run.mjs --target local|prod setup|test|files"); process.exit(2);
}
const envFile = target === "prod" ? ".env.production.local" : "apps/hq/.env.local";
const env = Object.fromEntries(readFileSync(envFile, "utf8").split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l)).map(l => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const WEB = target === "prod"
  ? { hq: "https://pms.benjaminpebsteel.com", dealer: "https://dealerpms.benjaminpebsteel.com" }
  : { hq: "http://localhost:3002", dealer: "http://localhost:3001" };
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
  const d = await svc.from("dealers").insert({ code: CODE, name: "สาขาทดสอบชั่วคราว (ลบทิ้ง)", status: "active", province: "ระยอง" });
  if (d.error) ตาย(`สร้างสาขาไม่สำเร็จ: ${d.error.message}`);
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

if (phase === "test") {
  const st = JSON.parse(readFileSync(STATE, "utf8"));
  const r = spawnSync("npx", ["playwright", "test", "-c", "tests/prod-live/playwright.config.ts", "--reporter=line"], {
    stdio: "inherit", shell: true, env: { ...process.env, LIVE_TARGET: target,
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
void ANON;
