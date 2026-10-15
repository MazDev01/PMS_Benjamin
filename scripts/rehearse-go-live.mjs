// ── ซ้อมลงใบแก้ฐานข้อมูลบน "สำเนาข้อมูลจริง" ก่อนขึ้นระบบจริง (ก่อนขึ้นระบบจริง ข้อ 12 · บอสสั่ง 15 ต.ค. 69) ──────────
//
// ใครทำอะไร:
//   บอส  สร้างโปรเจกต์ Supabase แยก กู้ข้อมูลจากที่สำรองของระบบจริงเข้าไป (ไม่เอาไฟล์สำรองเข้าโฟลเดอร์งาน)
//        แล้วสร้างไฟล์ .env.rehearsal.local (ไม่ขึ้น git — กฎ .env*) ใส่ 4 ค่า:
//          NEXT_PUBLIC_SUPABASE_URL · NEXT_PUBLIC_SUPABASE_ANON_KEY · SUPABASE_SERVICE_ROLE_KEY · REHEARSAL_DB_URL (postgresql://…)
//   สคริปต์ 1) นับข้อมูลก่อน  2) ลงใบที่ยังไม่มี (คาด 0182–0209) ทีละใบผ่าน CLI · ล้ม = ชื่อใบ + error แล้วหยุด
//           3) นับข้อมูลหลัง (ต้องไม่หาย)  4) audit:db (สิทธิ์จริงเทียบค่าที่ควรเป็น)
//           5) smoke โหมด api: build ที่ชี้สำเนา + บัญชีชั่วคราวบนสำเนา → tests/prod-smoke → ลบบัญชีชั่วคราว
//   รายงานเป็นตัวเลขอย่างเดียว — ไม่พิมพ์ชื่อ อีเมล เบอร์ หรือรหัสดีลเลอร์
//
// ตัวกัน:
//   • ปฏิเสธถ้าเป้าหมายคือฐานจริง (ref เดียวกับ .env.production.local) — ไฟล์นี้ใช้กับสำเนาเท่านั้น
//   • ปิดการส่งอีเมลระหว่างซ้อม (SMTP ว่าง) — สำเนามีอีเมลจริงของดีลเลอร์ ห้ามหลุดถึงตัวจริง
//
// ใช้:
//   node scripts/rehearse-go-live.mjs                     ทุกขั้น (ใช้ .env.rehearsal.local)
//   node scripts/rehearse-go-live.mjs --step migrate      เฉพาะขั้น 1–3 · --step audit · --step smoke
//   node scripts/rehearse-go-live.mjs --env <ไฟล์> --allow-local   ซ้อมสคริปต์เองกับฐานในเครื่อง (ตรวจสคริปต์ก่อนใช้จริง)
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

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
    const เซิร์ฟเวอร์ = [["apps/hq", 3002], ["apps/dealer", 3001]].map(([cwd, port]) => spawn("npx", ["next", "start", "-p", String(port)], { cwd, env: appEnv, stdio: "ignore", shell: true }));
    try {
      for (const port of [3002, 3001]) {
        let พร้อม = false;
        for (let i = 0; i < 80 && !พร้อม; i++) { try { พร้อม = (await fetch(`http://localhost:${port}/api/health`)).ok; } catch { /* ยังไม่ขึ้น */ } if (!พร้อม) await new Promise(r => setTimeout(r, 1500)); }
        if (!พร้อม) throw new Error(`เซิร์ฟเวอร์พอร์ต ${port} ไม่ขึ้น`);
      }
      const r = spawnSync("npx", ["playwright", "test", "-c", "playwright.prod.config.ts", "--reporter=line"], {
        env: { ...process.env, PROD_HQ_URL: "http://localhost:3002", PROD_DEALER_URL: "http://localhost:3001" }, encoding: "utf8", shell: true, maxBuffer: 64 * 1024 * 1024 });
      const นับผล = k => Number(new RegExp(`(\\d+) ${k}`).exec(r.stdout ?? "")?.[1] ?? 0);
      const สรุป = `ผ่าน ${นับผล("passed")} · ตก ${นับผล("failed")} · ไม่นิ่ง ${นับผล("flaky")} · ข้าม ${นับผล("skipped")}`;
      console.log(`   smoke: ${สรุป}`);
      ผลรวม.push(`smoke โหมด api: ${สรุป}`);
      if (r.status !== 0) process.exitCode = 1;
    } finally { for (const p of เซิร์ฟเวอร์) { try { p.kill(); } catch { /* ปิดแล้ว */ } } }
  } catch (e) {
    console.log(`   ✗ ${e.message}`); ผลรวม.push(`smoke: ${e.message}`); process.exitCode = 1;
  } finally {
    for (const id of ชั่วคราว) await svc.auth.admin.deleteUser(id).catch(() => {});
    console.log(`   ลบบัญชีชั่วคราวแล้ว ${ชั่วคราว.length} บัญชี`);
  }
}

console.log(`\n── สรุปการซ้อม ──\n${ผลรวม.map(s => `  • ${s}`).join("\n") || "  (ไม่มีขั้นที่รัน)"}\n`);
