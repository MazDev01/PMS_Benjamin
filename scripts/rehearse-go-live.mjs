// ── ซ้อมลงใบแก้ฐานข้อมูลบน "สำเนาข้อมูลจริง" ก่อนขึ้นระบบจริง (ก่อนขึ้นระบบจริง ข้อ 12 · บอสสั่ง 15 ต.ค. 69) ──────────
//
// ใครทำอะไร:
//   บอส  สร้างโปรเจกต์ Supabase แยก กู้ข้อมูลจากที่สำรองของระบบจริงเข้าไป (ไม่เอาไฟล์สำรองเข้าโฟลเดอร์งาน)
//        แล้วสร้างไฟล์ .env.rehearsal.local (ไม่ขึ้น git — กฎ .env*) ใส่ 4 ค่า:
//          NEXT_PUBLIC_SUPABASE_URL · NEXT_PUBLIC_SUPABASE_ANON_KEY · SUPABASE_SERVICE_ROLE_KEY · REHEARSAL_DB_URL (postgresql://…)
//   สคริปต์ 1) นับข้อมูลก่อน  2) ลงใบที่ยังไม่มี (คาด 0182–0209) ทีละใบผ่าน CLI · ล้ม = ชื่อใบ + error แล้วหยุด
//           3) นับข้อมูลหลัง (ต้องไม่หาย)  4) audit:db (สิทธิ์จริงเทียบค่าที่ควรเป็น)
//           5) smoke โหมด api: build ที่ชี้สำเนา + บัญชีชั่วคราวบนสำเนา → tests/prod-smoke → ลบบัญชีชั่วคราว
//           6) smoke-old: "โค้ดรุ่นที่อยู่บนระบบจริงตอนนี้" (--old-ref · ค่าตั้งต้น origin/monorepo) กับฐานที่ลงใบแล้ว
//              = จำลองช่วงที่ลงฐานแล้วแต่ยังไม่ลงโค้ด (บอสสั่ง 15 ต.ค. 69) · ดีลเลอร์ต้อง ล็อกอิน · ดูลีด · แก้ลีด · สร้างใบ ได้
//              พัง = ต้องลงฐานกับโค้ดในช่วงที่ไม่มีคนใช้ และแจ้งดีลเลอร์ล่วงหน้า (GO-LIVE-CHECKLIST §5.0)
//   รายงานเป็นตัวเลขอย่างเดียว — ไม่พิมพ์ชื่อ อีเมล เบอร์ หรือรหัสดีลเลอร์
//
// ตัวกัน:
//   • ปฏิเสธถ้าเป้าหมายคือฐานจริง (ref เดียวกับ .env.production.local) — ไฟล์นี้ใช้กับสำเนาเท่านั้น
//   • ปิดการส่งอีเมลระหว่างซ้อม (SMTP ว่าง) — สำเนามีอีเมลจริงของดีลเลอร์ ห้ามหลุดถึงตัวจริง
//
// ใช้:
//   node scripts/rehearse-go-live.mjs                     ทุกขั้น (ใช้ .env.rehearsal.local)
//   node scripts/rehearse-go-live.mjs --step migrate      เฉพาะขั้น 1–3 · --step audit · --step smoke · --step smoke-old [--old-ref <commit>]
//   node scripts/rehearse-go-live.mjs --env <ไฟล์> --allow-local   ซ้อมสคริปต์เองกับฐานในเครื่อง (ตรวจสคริปต์ก่อนใช้จริง)
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import net from "node:net";
import { createClient } from "@supabase/supabase-js";
import { ต้นทาง as ต้นทางเว็บ, พอร์ต as พอร์ตเว็บ } from "./lib/session.mjs";
const เว็บ = ต้นทางเว็บ("test");   // ที่อยู่เว็บในเครื่องของโฟลเดอร์นี้ — ห้ามเขียนพอร์ตเอง (check-hardcoded-ports)
const พอร์ตทดสอบ = พอร์ตเว็บ("test");

const args = process.argv.slice(2);
const ค่าของ = f => (args.includes(f) ? args[args.indexOf(f) + 1] : null);
const ขั้น = ค่าของ("--step") ?? "all";
const ไฟล์ค่า = ค่าของ("--env") ?? ".env.rehearsal.local";
const อ่านenv = f => { try { return Object.fromEntries(readFileSync(f, "utf8").split(/\r?\n/).map(l => l.trim())
  .filter(l => l && !l.startsWith("#") && l.includes("=")).map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])); } catch { return null; } };
const env = อ่านenv(ไฟล์ค่า);
if (!env) { console.error(`❌ ไม่พบ ${ไฟล์ค่า} — บอสสร้างโปรเจกต์สำเนาแล้วใส่ 4 ค่า (ดูหัวไฟล์นี้)`); process.exit(2); }
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY, KEY = env.SUPABASE_SERVICE_ROLE_KEY, DBURL = env.REHEARSAL_DB_URL;
for (const [k, v] of Object.entries({ NEXT_PUBLIC_SUPABASE_URL: URL_, NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON, SUPABASE_SERVICE_ROLE_KEY: KEY, REHEARSAL_DB_URL: DBURL }))
  if (!v) { console.error(`❌ ${ไฟล์ค่า} ไม่มีค่า ${k}`); process.exit(2); }
const refOf = u => { try { return new URL(u).hostname.split(".")[0]; } catch { return ""; } };
const prodRef = refOf(อ่านenv(".env.production.local")?.NEXT_PUBLIC_SUPABASE_URL ?? "");
if (prodRef && refOf(URL_) === prodRef) { console.error("❌ เป้าหมายคือฐานจริง — สคริปต์นี้ใช้กับโปรเจกต์สำเนาเท่านั้น หยุด"); process.exit(2); }
const ในเครื่อง = /127\.0\.0\.1|localhost/.test(URL_);
if (ในเครื่อง && !args.includes("--allow-local")) { console.error("❌ เป้าหมายเป็นฐานในเครื่อง — ใส่ --allow-local ถ้าตั้งใจซ้อมตัวสคริปต์"); process.exit(2); }
console.log(`\n🎯 ซ้อมบน: ${ในเครื่อง ? "ฐานในเครื่อง (ซ้อมตัวสคริปต์)" : "โปรเจกต์สำเนา"} · ขั้น: ${ขั้น}`);

const svc = createClient(URL_, KEY, { auth: { persistSession: false } });
const ทำ = s => ขั้น === "all" || ขั้น === s;
const ผลรวม = [];

// psql จากอิมเมจ Postgres ของ Supabase ในเครื่อง · ที่อยู่ฐานส่งผ่านตัวแปรแวดล้อม ไม่อยู่ในบรรทัดคำสั่ง
const อิมเมจ = () => execFileSync("docker", ["image", "ls", "--format", "{{.Repository}}:{{.Tag}}"], { encoding: "utf8" })
  .split(String.fromCharCode(10)).map(s => s.trim()).find(s => /supabase\/postgres:/.test(s));
const psql = sql => {
  const img = อิมเมจ(); if (!img) throw new Error("ไม่พบอิมเมจ Postgres ของ Supabase ในเครื่อง");
  const url = DBURL.replace(/@(127\.0\.0\.1|localhost):/, "@host.docker.internal:");
  return execFileSync("docker", ["run", "--rm", "-i", "-e", "PGURL", "--entrypoint", "sh", img, "-c", 'psql "$PGURL" -X -q -A -t -v ON_ERROR_STOP=1'],
    { input: sql, encoding: "utf8", env: { ...process.env, PGURL: url }, maxBuffer: 64 * 1024 * 1024 });
};

// ── 1/3 นับข้อมูล (ตัวเลขอย่างเดียว) ──
// ปิดเซิร์ฟเวอร์ทั้งต้น — spawn(shell) บน Windows: p.kill() ปิดแค่ shell, next start ค้างถือพอร์ต (บทเรียน test-prodbuild 15 ต.ค. 69)
const ปิดเซิร์ฟเวอร์ = ps => { for (const p of ps) { try {
  if (process.platform === "win32" && p.pid) spawnSync("taskkill", ["/pid", String(p.pid), "/T", "/F"], { stdio: "ignore" }); else p.kill();
} catch { /* ปิดแล้ว */ } } };
const พอร์ตว่าง = port => new Promise(ok => { const sv = net.createServer().once("error", () => ok(false)).once("listening", () => sv.close(() => ok(true))); sv.listen(port); });
// พร้อม = เซิร์ฟเวอร์ตอบ (สถานะใดก็ได้) — health ตอบ 503 "degraded" ได้เมื่อค่าตั้งเสริมไม่ครบ (เช่นอีเมลที่ปิดไว้ระหว่างซ้อม)
//   แต่เซิร์ฟเวอร์ใช้งานได้ · เดิมรอ 2xx → ซ้อมโค้ดรุ่นเก่ารายงานว่า "ไม่ขึ้น" ทั้งที่ขึ้นใน 1 วิ (ซ้อมตัวสคริปต์ 15 ต.ค. 69)
const รอเซิร์ฟเวอร์ = async port => {
  for (let i = 0; i < 80; i++) { try { await fetch(`http://localhost:${port}/api/health`); return; } catch { /* ยังไม่ขึ้น */ } await new Promise(r => setTimeout(r, 1500)); }
  throw new Error(`เซิร์ฟเวอร์พอร์ต ${port} ไม่ขึ้น`);
};
const ตาราง = ["dealers", "profiles", "leads", "customers", "quotations", "appointments", "customer_notes", "files", "dealer_prospects", "dealer_package_proposals"];
async function นับ() {
  const out = {};
  for (const t of ตาราง) {
    const { count, error } = await svc.from(t).select("*", { count: "exact", head: true });
    out[t] = error ? `อ่านไม่ได้ (${error.code ?? "?"})` : count;
  }
  return out;
}

if (ทำ("migrate")) {
  const ก่อน = await นับ();
  console.log("\n① ข้อมูลก่อนลงใบ:"); for (const [t, n] of Object.entries(ก่อน)) console.log(`   ${t.padEnd(26)} ${n}`);
  const มีแล้ว = new Set(psql("select version from supabase_migrations.schema_migrations;").split(String.fromCharCode(10)).map(s => s.trim()).filter(Boolean));
  const ไฟล์ = readdirSync("supabase/migrations").filter(f => /^\d{4}_.*\.sql$/.test(f)).sort();
  const ค้าง = ไฟล์.filter(f => !มีแล้ว.has(f.slice(0, 4)));
  console.log(`\n② ใบในฐานสำเนา ${มีแล้ว.size} ใบ · ใบที่จะลง ${ค้าง.length} ใบ${ค้าง.length ? ` (${ค้าง[0].slice(0, 4)}–${ค้าง.at(-1).slice(0, 4)})` : ""}`);
  if (ค้าง.length) {
    // ซ้อมตัวสคริปต์กับฐานในเครื่อง: CLI บังคับ TLS กับที่อยู่ที่ไม่รู้จัก — ต้องสั่งจากโฟลเดอร์ของฐานนั้น (--cli-workdir)
    //   ให้ CLI รู้จากไฟล์ตั้งค่าว่าเป็นฐานในเครื่อง · โปรเจกต์ Supabase จริงใช้ TLS ตามปกติ สั่งจากโฟลเดอร์งานนี้
    const ที่สั่ง = ในเครื่อง ? (ค่าของ("--cli-workdir") ?? process.cwd()) : process.cwd();
    const r = spawnSync("npx", ["supabase", "db", "push", "--db-url", `"${DBURL}"`, "--include-all"], { cwd: ที่สั่ง, input: "y\n", encoding: "utf8", shell: true, maxBuffer: 64 * 1024 * 1024 });
    const ข้อความ = `${r.stdout ?? ""}${r.stderr ?? ""}`;
    const ลงแล้ว = [...ข้อความ.matchAll(/Applying migration (\d{4}_[^\s.]+\.sql)/g)].map(m => m[1]);
    if (r.status !== 0) {
      const ใบล้ม = ลงแล้ว.at(-1) ?? "(ไม่ทราบ — ล้มก่อนเริ่มใบแรก)";
      const err = ข้อความ.split(String.fromCharCode(10)).filter(l => /ERROR|error:|failed/i.test(l)).slice(0, 4).join(" | ");
      console.log(`   ✗ ลงใบล้ม: ${ใบล้ม}\n     error: ${err}`);
      ผลรวม.push(`ลงใบ: ล้มที่ ${ใบล้ม}`);
      process.exitCode = 1;
    } else {
      console.log(`   ✓ ลงครบ ${ลงแล้ว.length} ใบ`);
      ผลรวม.push(`ลงใบ: ผ่าน ${ลงแล้ว.length} ใบ`);
    }
  }
  const หลัง = await นับ();
  console.log("\n③ ข้อมูลหลังลงใบ (ต้องเท่าเดิม):");
  let หาย = 0;
  for (const t of ตาราง) {
    const เท่า = หลัง[t] === ก่อน[t];
    if (!เท่า) หาย++;
    console.log(`   ${t.padEnd(26)} ${String(ก่อน[t]).padStart(8)} → ${String(หลัง[t]).padStart(8)} ${เท่า ? "" : "✗ ไม่เท่า"}`);
  }
  ผลรวม.push(`ข้อมูลหลังลงใบ: ${หาย ? `ไม่เท่าเดิม ${หาย} ตาราง` : `เท่าเดิมทั้ง ${ตาราง.length} ตาราง`}`);
  if (หาย) process.exitCode = 1;
}

if (ทำ("audit") && !process.exitCode) {
  const sql = execFileSync("node", ["scripts/db-audit-grants.mjs", "--print-sql"], { encoding: "utf8" })
    .split(String.fromCharCode(10)).filter(l => !l.startsWith("--")).join(" ");
  const dir = mkdtempSync(path.join(tmpdir(), "pms-rehearsal-"));
  const ไฟล์ผล = path.join(dir, "grants.json");
  writeFileSync(ไฟล์ผล, psql(sql).trim());
  const r = spawnSync("node", ["scripts/db-audit-grants.mjs", "--actual", ไฟล์ผล], { encoding: "utf8" });
  const สรุป = (r.stdout ?? "").split(String.fromCharCode(10)).find(l => l.startsWith("สิทธิ์ไม่ตรงกับใบแก้ฐานข้อมูล")) ?? "(ไม่มีผลสรุป)";
  console.log(`\n④ audit:db — ${สรุป}`);
  ผลรวม.push(`audit:db: ${สรุป}`);
  if (r.status !== 0) process.exitCode = 1;
}

if (ทำ("smoke") && !process.exitCode) {
  // บัญชีชั่วคราวบนสำเนา (ผู้ดูแล 1 + ดีลเลอร์ 1 ของสาขาที่เปิดใช้งานสาขาแรก) — ลบทิ้งหลังจบเสมอ
  const รหัสชั่วคราว = `Rehearsal-${Math.random().toString(36).slice(2, 10)}-9`;
  const { data: สาขา } = await svc.from("dealers").select("code").eq("status", "active").order("code").limit(1);
  const ชั่วคราว = [];
  try {
    for (const [role, code] of [["SUPER_ADMIN", ""], ["DEALER_ADMIN", สาขา?.[0]?.code ?? ""]]) {   // ผู้ดูแล HQ ใช้รหัสสาขาว่าง (ไม่ใช่ null)
      const email = `rehearsal-${role.toLowerCase()}-${Date.now()}@example.test`;
      const { data, error } = await svc.auth.admin.createUser({ email, password: รหัสชั่วคราว, email_confirm: true });
      if (error) throw new Error(`สร้างบัญชีชั่วคราวไม่สำเร็จ: ${error.message}`);
      ชั่วคราว.push(data.user.id);
      const { error: pErr } = await svc.from("profiles").upsert({ id: data.user.id, role, dealer_code: code, name: "บัญชีซ้อม (ชั่วคราว)", status: "active", contact_email_verified_at: new Date().toISOString() }, { onConflict: "id" });
      if (pErr) throw new Error(`ตั้งโปรไฟล์บัญชีชั่วคราวไม่สำเร็จ: ${pErr.message}`);
      process.env[role === "SUPER_ADMIN" ? "PROD_ADMIN_EMAIL" : "PROD_DEALER_EMAIL"] = email;
      process.env[role === "SUPER_ADMIN" ? "PROD_ADMIN_PASSWORD" : "PROD_DEALER_PASSWORD"] = รหัสชั่วคราว;
    }
    // build + start ที่ชี้สำเนา · ปิดอีเมล · โหมด api เหมือนเว็บจริง
    const appEnv = { ...process.env, NEXT_PUBLIC_DATA_SOURCE: "api", NEXT_PUBLIC_SUPABASE_URL: URL_, NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON,
      SUPABASE_SERVICE_ROLE_KEY: KEY, SMTP_HOST: "", SMTP_USER: "", SMTP_PASS: "", PMS_LOCAL_HTTP_TEST: "1" };
    console.log("\n⑤ smoke: build ที่ชี้สำเนา (ราว 1–2 นาที)");
    if (spawnSync("npm", ["run", "build"], { env: appEnv, stdio: "ignore", shell: true }).status !== 0) throw new Error("build ไม่ผ่าน");
    const เซิร์ฟเวอร์ = [["apps/hq", พอร์ตทดสอบ.hq], ["apps/dealer", พอร์ตทดสอบ.dealer]].map(([cwd, port]) => spawn("npx", ["next", "start", "-p", String(port)], { cwd, env: appEnv, stdio: "ignore", shell: true }));
    try {
      for (const port of [พอร์ตทดสอบ.hq, พอร์ตทดสอบ.dealer]) await รอเซิร์ฟเวอร์(port);
      const r = spawnSync("npx", ["playwright", "test", "-c", "playwright.prod.config.ts", "--reporter=line"], {
        env: { ...process.env, PROD_HQ_URL: เว็บ.hq, PROD_DEALER_URL: เว็บ.dealer }, encoding: "utf8", shell: true, maxBuffer: 64 * 1024 * 1024 });
      const นับผล = k => Number(new RegExp(`(\\d+) ${k}`).exec(r.stdout ?? "")?.[1] ?? 0);
      const สรุป = `ผ่าน ${นับผล("passed")} · ตก ${นับผล("failed")} · ไม่นิ่ง ${นับผล("flaky")} · ข้าม ${นับผล("skipped")}`;
      console.log(`   smoke: ${สรุป}`);
      ผลรวม.push(`smoke โหมด api: ${สรุป}`);
      if (r.status !== 0) process.exitCode = 1;
    } finally { ปิดเซิร์ฟเวอร์(เซิร์ฟเวอร์); }
  } catch (e) {
    console.log(`   ✗ ${e.message}`); ผลรวม.push(`smoke: ${e.message}`); process.exitCode = 1;
  } finally {
    for (const id of ชั่วคราว) await svc.auth.admin.deleteUser(id).catch(() => {});
    console.log(`   ลบบัญชีชั่วคราวแล้ว ${ชั่วคราว.length} บัญชี`);
  }
}

if (ทำ("smoke-old") && !process.exitCode) {
  // ── ⑥ โค้ดรุ่นที่อยู่บนระบบจริงตอนนี้ + ฐานที่ลงใบแล้ว (ช่วงที่ลงฐานแล้วแต่ยังไม่ลงโค้ด) ─────────────────────────────
  const อ้างอิง = ค่าของ("--old-ref") ?? "origin/monorepo";
  const เช็ก = [];   // [ชื่อขั้น, ผ่าน?, รายละเอียด (ตัวเลข/รหัสข้อผิดพลาดเท่านั้น — ไม่พิมพ์ชื่อ/อีเมล/เบอร์)]
  let ที่ = "", เซิร์ฟเวอร์ = [], ชั่วคราว = null, เตรียมพัง = "";
  try {
    const sha = execFileSync("git", ["rev-parse", "--short", อ้างอิง], { encoding: "utf8" }).trim();
    console.log(`\n⑥ smoke-old: โค้ดรุ่น ${อ้างอิง} (${sha}) — ต้องตรงกับที่อยู่บน Vercel ตอนนี้ (บอสยืนยันก่อนรันจริง)`);
    for (const port of [พอร์ตทดสอบ.dealer, พอร์ตทดสอบ.hq]) if (!await พอร์ตว่าง(port)) throw new Error(`พอร์ต ${port} ไม่ว่าง (มีเซิร์ฟเวอร์ค้าง)`);
    ที่ = mkdtempSync(path.join(tmpdir(), "pms-old-"));
    execFileSync("git", ["worktree", "add", "--detach", ที่, sha], { stdio: "ignore" });
    if (spawnSync("pnpm", ["install", "--frozen-lockfile"], { cwd: ที่, stdio: "ignore", shell: true }).status !== 0) throw new Error("ติดตั้งแพ็กเกจของโค้ดรุ่นเก่าไม่สำเร็จ");
    const appEnv = { ...process.env, NEXT_PUBLIC_DATA_SOURCE: "api", NEXT_PUBLIC_SUPABASE_URL: URL_, NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON,
      SUPABASE_SERVICE_ROLE_KEY: KEY, SMTP_HOST: "", SMTP_USER: "", SMTP_PASS: "" };
    console.log("   build โค้ดรุ่นเก่าที่ชี้สำเนา (ราว 1–2 นาที)");
    if (spawnSync("npm", ["run", "build"], { cwd: ที่, env: appEnv, stdio: "ignore", shell: true }).status !== 0) throw new Error("build โค้ดรุ่นเก่าไม่ผ่าน");
    เซิร์ฟเวอร์ = [["apps/hq", พอร์ตทดสอบ.hq], ["apps/dealer", พอร์ตทดสอบ.dealer]].map(([cwd, port]) =>
      spawn("npx", ["next", "start", "-p", String(port)], { cwd: path.join(ที่, cwd), env: appEnv, stdio: "ignore", shell: true }));
    for (const port of [พอร์ตทดสอบ.hq, พอร์ตทดสอบ.dealer]) await รอเซิร์ฟเวอร์(port);

    // บัญชีดีลเลอร์ชั่วคราวของสาขาที่มีลูกค้าเป้าหมายที่ยังเปิดอยู่ — ลบทิ้งหลังจบเสมอ
    const { data: แถว } = await svc.from("leads").select("dealer_code").not("status", "in", "(PAID,CANCELLED,HQ_PRICING)").limit(1);
    const สาขา = แถว?.[0]?.dealer_code;
    if (!สาขา) throw new Error("สำเนาไม่มีลูกค้าเป้าหมายที่ยังเปิดอยู่ให้ทดสอบ");
    const รหัส = `Rehearsal-${Math.random().toString(36).slice(2, 10)}-9`, อีเมล = `rehearsal-old-${Date.now()}@example.test`;
    const { data: u, error: ue } = await svc.auth.admin.createUser({ email: อีเมล, password: รหัส, email_confirm: true });
    if (ue) throw new Error(`สร้างบัญชีชั่วคราวไม่สำเร็จ: ${ue.message}`);
    ชั่วคราว = u.user.id;
    await svc.from("profiles").upsert({ id: ชั่วคราว, role: "DEALER_ADMIN", dealer_code: สาขา, name: "บัญชีซ้อม (ชั่วคราว)", status: "active",
      contact_email_verified_at: new Date().toISOString() }, { onConflict: "id" });

    const D = เว็บ.dealer;
    // รายงานแค่รหัสข้อผิดพลาด (เช่น hq_quote_required) — ไม่พิมพ์ข้อความเต็มที่อาจมีชื่อลูกค้า
    // ป้ายเหตุผลของเรา (เช่น hq_quote_required) ก่อน — รหัส Postgres (P0001) ไม่บอกว่าพังเพราะอะไร
    const รหัสผิด = t => String(t).match(/\b([a-z]+(?:_[a-z]+)+):/)?.[1] ?? String(t).match(/"code"\s*:\s*"([^"]+)"/)?.[1] ?? "";
    // ① ล็อกอิน
    const lg = await fetch(`${D}/api/v1/auth?op=login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: อีเมล, password: รหัส }) });
    const cookie = (lg.headers.getSetCookie?.() ?? []).map(c => c.split(";")[0]).join("; ");
    เช็ก.push(["ล็อกอิน", lg.ok && !!cookie, `HTTP ${lg.status}`]);
    const api = (method, p, body) => fetch(D + p, { method, headers: { cookie, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    // ② ดูลีด
    const ls = await api("GET", `/api/v1/leads?dealer=${encodeURIComponent(สาขา)}`);
    const lj = await ls.json().catch(() => null);
    const rows = Array.isArray(lj) ? lj : (lj?.rows ?? []);
    เช็ก.push(["ดูลีด", ls.ok && rows.length > 0, `HTTP ${ls.status} · ${rows.length} แถว`]);
    // ③ แก้ลีด (ทางของโค้ดรุ่นเก่า: PUT ทั้งแถว · ส่งค่าเดิมกลับ = ไม่เปลี่ยนข้อมูลบนสำเนา)
    const ลีด = rows.find(r => !["PAID", "CANCELLED", "HQ_PRICING"].includes(r.status));
    const g = ลีด ? await api("POST", "/api/v1/leads?op=get", { id: ลีด.id }) : null;
    const เต็ม = g ? await g.json().catch(() => null) : null;
    const แก้ = เต็ม ? await api("PUT", "/api/v1/leads", เต็ม) : null;
    เช็ก.push(["แก้ลีด", !!แก้?.ok, แก้ ? `HTTP ${แก้.status}${แก้.ok ? "" : ` ${รหัสผิด(await แก้.text())}`}` : "ไม่มีลูกค้าเป้าหมายให้แก้"]);
    // ④ สร้างใบ (ทางของโค้ดรุ่นเก่า: ออกเลข + บันทึก โดยไม่มีใบ HQ)
    const ใบ = ลีด ? await api("POST", "/api/v1/quotations?op=numbered", { dealer: สาขา, prefix: "Q-", row: {
      customer: ลีด.company, project: ลีด.company, date: new Date().toISOString().slice(0, 10), province: ลีด.province, buildingType: ลีด.product || "โกดังสำเร็จรูป",
      area: 1, dealId: ลีด.numId, total: "100", totalValue: 100, materialCost: 100, items: 1, status: "draft",
      lineItems: [{ name: "รายการซ้อม", qty: 1, unit: "งาน", unitPrice: 100 }] } }) : null;
    const ใบj = ใบ?.ok ? await ใบ.json().catch(() => null) : null;
    เช็ก.push(["สร้างใบ", !!ใบ?.ok, ใบ ? `HTTP ${ใบ.status}${ใบ.ok ? "" : ` ${รหัสผิด(await ใบ.text())}`}` : "ไม่มีลูกค้าเป้าหมายให้ออกใบ"]);
    if (ใบj?.id) await svc.from("quotations").delete().eq("id", ใบj.id);   // ใบซ้อม (ร่าง) ลบทิ้ง
  } catch (e) {
    เตรียมพัง = e.message;
  } finally {
    ปิดเซิร์ฟเวอร์(เซิร์ฟเวอร์);
    if (ชั่วคราว) await svc.auth.admin.deleteUser(ชั่วคราว).catch(() => {});
    if (ที่ && spawnSync("git", ["worktree", "remove", "--force", ที่], { stdio: "ignore" }).status !== 0) {
      // Windows: node_modules ลึกเกินขีดจำกัดความยาว path → ลบผ่าน path แบบยาว (\\?\) แล้วล้างรายการ worktree
      if (process.platform === "win32") spawnSync("powershell", ["-NoProfile", "-Command", `Remove-Item -LiteralPath '\\\\?\\${ที่}' -Recurse -Force`], { stdio: "ignore" });
      spawnSync("git", ["worktree", "prune"], { stdio: "ignore" });
    }
  }
  for (const [ชื่อ, ผ่าน, รายละเอียด] of เช็ก) console.log(`   ${ผ่าน ? "✓" : "✗"} ${ชื่อ} — ${รายละเอียด}`);
  const พัง = เช็ก.filter(x => !x[1]).map(x => x[0]);
  // เตรียมไม่สำเร็จ ≠ ผลตัดสิน — ยังไม่รู้ว่าโค้ดรุ่นเก่าใช้กับฐานใหม่ได้ไหม (ต้องแก้การซ้อมแล้วรันใหม่)
  if (เตรียมพัง) { console.log(`   ⚠ ซ้อมไม่สำเร็จ (เตรียมการ): ${เตรียมพัง}`); ผลรวม.push(`smoke-old: ซ้อมไม่สำเร็จ (เตรียมการ) — ยังตัดสินไม่ได้ · ${เตรียมพัง}`); process.exitCode = 1; }
  else ผลรวม.push(`smoke-old (โค้ดรุ่นเก่า + ฐานใหม่): ${พัง.length ? `พัง ${พัง.join(" · ")} → ต้องลงฐานกับโค้ดในช่วงที่ไม่มีคนใช้ + แจ้งดีลเลอร์ล่วงหน้า` : "ผ่านครบ 4 ขั้น → ลงฐานก่อนโค้ดได้ตามปกติ"}`);
  if (พัง.length) process.exitCode = 1;
}

console.log(`\n── สรุปการซ้อม ──\n${ผลรวม.map(s => `  • ${s}`).join("\n") || "  (ไม่มีขั้นที่รัน)"}\n`);
