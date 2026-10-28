// ── npm run dev: เปิดเว็บกับ "ฐาน dev" (แยกจากฐานทดสอบของรอบตรวจ · บอสสั่ง 26 ต.ค. 69) ─────────────────────────────────
//
// ทำไม: ฐานทดสอบ (pms-dbcheck) เขียนได้เฉพาะผู้ถือล็อกแล้ว (scripts/lib/testDbGuard.mjs) — เว็บที่เปิดลองเองต้องบันทึกได้ตามปกติ
//   จึงมีฐานในเครื่องอีกชุด pms-dev (พอร์ตใน scripts/lib/ports.json "ฐาน.dev") ใช้กับ npm run dev เท่านั้น
// ก่อนเปิดเว็บทุกครั้ง: ① ฐาน dev ยังไม่มี = สร้าง · ยังไม่เปิด = เปิด ② ลงใบปรับฐานที่ขาด (ชุดเดียวกับ supabase/migrations ของโฟลเดอร์นี้)
//   ③ ฐานใหม่ (ยังไม่มีบัญชีทดสอบ) = ใส่ข้อมูลตัวอย่าง (tests/fixtures/test-baseline.sql + บัญชีจาก tests/.env.test) ④ เปิด turbo dev ชี้ฐาน dev
// รอบตรวจเต็ม/ข้อทดสอบห้ามแตะฐาน dev: ตัวนี้ไม่รันถ้าอยู่ใต้ล็อกฐานทดสอบ · playwright เปิดเว็บเองด้วย turbo dev (ชี้ฐานทดสอบ)
// ใช้: npm run dev | npm run dev:hq | npm run dev:dealer   (ส่งอาร์กิวเมนต์ที่เหลือต่อให้ turbo dev)
//      node scripts/dev-db.mjs --prepare-only   (เตรียมฐาน dev อย่างเดียว ไม่เปิดเว็บ)
// ฐาน dev ลงใบข้ามลำดับ (เช่นเซสชันอื่นลง 0251 ไปก่อน 0250 · ฐาน dev ใช้ร่วมทุกโฟลเดอร์) หรือมีใบที่โฟลเดอร์นี้ไม่มี
//   = ลงต่อไม่ได้ → สร้างฐาน dev ใหม่จากไฟล์ใบตามลำดับ + ข้อมูลตัวอย่าง แล้วเปิดเว็บต่อ (บอสสั่ง 28 ต.ค. 69 · ห้าม --include-all)
// ข้อทดสอบ: tests/tools/dev-db-rebuild.test.mjs (ฐานจำลองแยก — ค่าที่ขึ้นต้น PMS_DEV_ ใช้ชี้ฐานจำลอง)
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { รากโฟลเดอร์ } from "./lib/session.mjs";

const ports = JSON.parse(readFileSync(path.join(รากโฟลเดอร์, "scripts/lib/ports.json"), "utf8")).ฐาน;
const ที่ฐานdev = process.env.PMS_DEV_DB_DIR || "C:/.claude/pms-dev";
const ที่ฐานทดสอบ = process.env.PMS_TEST_DB_DIR || "C:/.claude/pms-dbcheck";
const โปรเจกต์ = process.env.PMS_DEV_PROJECT || "pms-dev";
const คอนเทนเนอร์ = `supabase_db_${โปรเจกต์}`;
const พอร์ตAPI = Number(process.env.PMS_DEV_API_PORT) || ports.dev.api;
const API = `http://127.0.0.1:${พอร์ตAPI}`;
const sh = (cmd, args, opt = {}) => spawnSync(cmd, args, { encoding: "utf8", shell: process.platform === "win32", maxBuffer: 64 << 20, ...opt });
const หยุด = (m) => { console.error(`⛔ ${m}`); process.exit(1); };

if (process.env.PMS_TESTDB_LOCK_HELD) หยุด("อยู่ใต้ล็อกฐานทดสอบ (รอบตรวจ/ข้อทดสอบ) — ห้ามแตะฐาน dev · playwright เปิดเว็บเองด้วย turbo dev");

// ① สร้างโฟลเดอร์ฐาน dev จากค่าตั้งของฐานทดสอบ (เปลี่ยนชื่อโปรเจกต์ + พอร์ต) — ไม่เปิดข้อมูลตั้งต้นของ supabase (เราใส่เอง)
const ไฟล์ค่าตั้ง = path.join(ที่ฐานdev, "supabase/config.toml");
if (!existsSync(ไฟล์ค่าตั้ง)) {
  const ต้นแบบ = path.join(ที่ฐานทดสอบ, "supabase/config.toml");
  if (!existsSync(ต้นแบบ)) หยุด(`ไม่พบค่าตั้งต้นแบบ ${ต้นแบบ}`);
  mkdirSync(path.dirname(ไฟล์ค่าตั้ง), { recursive: true });
  let c = readFileSync(ต้นแบบ, "utf8").replace(/^project_id\s*=.*$/m, `project_id = "${โปรเจกต์}"`);
  c = c.replace(/\b553(\d\d)\b/g, (_, n) => `${String(พอร์ตAPI).slice(0, 3)}${n}`);
  c = c.replace(/(\[db\.seed\][^[]*?enabled\s*=\s*)true/, "$1false");
  writeFileSync(ไฟล์ค่าตั้ง, c);
  console.log(`▶ สร้างฐาน dev ที่ ${ที่ฐานdev} (พอร์ต API ${พอร์ตAPI})`);
}

// ② ใบปรับฐานชุดเดียวกับโฟลเดอร์นี้ (คัดลอกทับทั้งชุด — ใบที่ไม่มีในโฟลเดอร์นี้ลบออก)
const ต้นทางใบ = process.env.PMS_DEV_MIGRATIONS_DIR || path.join(รากโฟลเดอร์, "supabase/migrations"), ปลายทางใบ = path.join(ที่ฐานdev, "supabase/migrations");
mkdirSync(ปลายทางใบ, { recursive: true });
const ใบ = readdirSync(ต้นทางใบ).filter(f => f.endsWith(".sql"));
for (const f of readdirSync(ปลายทางใบ)) if (!ใบ.includes(f)) rmSync(path.join(ปลายทางใบ, f));
for (const f of ใบ) copyFileSync(path.join(ต้นทางใบ, f), path.join(ปลายทางใบ, f));
for (const d of ["functions"]) if (existsSync(path.join(รากโฟลเดอร์, "supabase", d)) && !existsSync(path.join(ที่ฐานdev, "supabase", d))) {
  sh("cmd", ["/c", "xcopy", "/E", "/I", "/Q", path.join(รากโฟลเดอร์, "supabase", d), path.join(ที่ฐานdev, "supabase", d)]);
}

// เปิดฐาน dev ถ้ายังไม่เปิด
const สถานะ = () => sh("npx", ["supabase", "status", "-o", "env", "--workdir", ที่ฐานdev]);
let st = สถานะ();
if (st.status !== 0 || !st.stdout.includes(String(พอร์ตAPI))) {
  console.log("▶ เปิดฐาน dev (ครั้งแรกใช้เวลาราว 1–2 นาที) …");
  const ไม่เปิด = process.env.PMS_DEV_START_EXCLUDE ? ["-x", process.env.PMS_DEV_START_EXCLUDE] : [];   // ฐานจำลองของข้อทดสอบเปิดแค่ตัวฐาน
  const r = sh("npx", ["supabase", "start", "--workdir", ที่ฐานdev, ...ไม่เปิด], { stdio: "inherit" });
  if (r.status !== 0) หยุด("เปิดฐาน dev ไม่สำเร็จ (ดูข้อความด้านบน)");
}

// ลงต่อได้ไหม: ใบในฐานเทียบไฟล์ใบ — ข้ามลำดับ / มีใบที่โฟลเดอร์นี้ไม่มี = สร้างใหม่ทั้งฐาน (supabase db reset ลงทุกใบตามลำดับ)
const ในฐาน = sh("docker", ["exec", คอนเทนเนอร์, "psql", "-U", "postgres", "-d", "postgres", "-At", "-c",
  "select version from supabase_migrations.schema_migrations order by version"], { shell: false });
const เหตุสร้างใหม่ = เหตุต้องสร้างใหม่(ในฐาน.status === 0 ? ในฐาน.stdout.split(/\r?\n/).filter(Boolean) : [], ใบ.map(f => f.split("_")[0]));
if (เหตุสร้างใหม่) {
  const ไฟล์เวลา = path.join(ที่ฐานdev, ".rebuild-seconds");
  const ครั้งก่อน = existsSync(ไฟล์เวลา) ? Number(readFileSync(ไฟล์เวลา, "utf8")) : 0;
  console.log(`▶ สร้างฐาน dev ใหม่ — ${เหตุสร้างใหม่} · ใช้เวลาราว ${ครั้งก่อน ? `${Math.max(1, Math.round(ครั้งก่อน / 60))} นาที` : "3–5 นาที"} (ข้อมูลที่ลองบันทึกในฐาน dev จะหาย · ใส่ข้อมูลตัวอย่างให้ใหม่)`);
  const เริ่ม = Date.now();
  const r = sh("npx", ["supabase", "db", "reset", "--local", "--workdir", ที่ฐานdev]);
  if (r.status !== 0) หยุด(`สร้างฐาน dev ใหม่ไม่สำเร็จ:\n${(r.stderr || r.stdout).split(/\r?\n/).filter(l => !/^NOTICE/.test(l)).slice(-15).join("\n")}`);
  writeFileSync(ไฟล์เวลา, String(Math.round((Date.now() - เริ่ม) / 1000)));
}

// ลงใบที่ขาด
const ลง = sh("npx", ["supabase", "migration", "up", "--local", "--workdir", ที่ฐานdev]);
if (ลง.status !== 0) หยุด(`ลงใบปรับฐานบนฐาน dev ไม่สำเร็จ:\n${(ลง.stderr || ลง.stdout).split(/\r?\n/).filter(l => !/^NOTICE/.test(l)).slice(-15).join("\n")}`);
const ลงใหม่ = (ลง.stdout + ลง.stderr).match(/Applying migration \S+/g) ?? [];
console.log(ลงใหม่.length ? `▶ ลงใบปรับฐานบนฐาน dev ${ลงใหม่.length} ใบ` : "▶ ฐาน dev ใบปรับฐานครบแล้ว");

// ③ ฐานใหม่ = ใส่ข้อมูลตัวอย่าง (ชุดเดียวกับฐานทดสอบ — ชื่อ/ที่อยู่สร้างด้วยสูตร ไม่มีข้อมูลจริง)
// shell: false — คำสั่ง SQL มีช่องว่าง ผ่าน cmd แล้วถูกตัดเป็นหลายคำ (เคยนับได้ "ว่าง" ทั้งที่มีบัญชีแล้ว)
const นับบัญชี = sh("docker", ["exec", คอนเทนเนอร์, "psql", "-U", "postgres", "-d", "postgres", "-At", "-c", "select count(*) from public.profiles"], { shell: false });
if (นับบัญชี.status !== 0 || !/^\d+$/.test(นับบัญชี.stdout.trim())) หยุด(`นับบัญชีในฐาน dev ไม่ได้: ${นับบัญชี.stderr}`);
if (Number(นับบัญชี.stdout.trim()) === 0) {
  console.log("▶ ฐาน dev ยังว่าง — ใส่ข้อมูลตัวอย่าง + บัญชีทดสอบ …");
  const r = sh(process.execPath, [path.join(รากโฟลเดอร์, "scripts/reset-test-db.mjs"), "--workdir", ที่ฐานdev, "--skip-reset"], { stdio: "inherit", shell: false, cwd: รากโฟลเดอร์ });
  if (r.status !== 0) หยุด("ใส่ข้อมูลตัวอย่างในฐาน dev ไม่สำเร็จ");
}

if (process.argv.includes("--prepare-only")) process.exit(0);

// ④ เปิดเว็บชี้ฐาน dev — ค่าใน env ชนะ .env.local (ซึ่งชี้ฐานทดสอบไว้ให้ชุดทดสอบ)
const env = { ...process.env, PMS_DB_TARGET: "dev", NEXT_PUBLIC_SUPABASE_URL: API, SMTP_PORT: String(ports.dev.smtp) };
console.log(`▶ เปิดเว็บกับฐาน dev (${API}) — ข้อมูลที่บันทึกตอนลองใช้อยู่ในฐาน dev ไม่ใช่ฐานทดสอบ`);
const ลูก = spawn("npx", ["turbo", "dev", ...process.argv.slice(2).filter(a => a !== "--prepare-only")], { stdio: "inherit", shell: true, env });
ลูก.on("exit", (code) => process.exit(code ?? 1));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => ลูก.kill(sig));

/** ฐานลงใบต่อได้ไหม · คืนเหตุ (ข้อความบรรทัดเดียว) ถ้าต้องสร้างใหม่ · null = ลงต่อได้
 *  supabase migration up ปฏิเสธทั้งสองกรณี: ใบเลขต่ำกว่าใบล่าสุดในฐานที่ยังไม่ได้ลง · ใบในฐานที่ไม่มีไฟล์ */
function เหตุต้องสร้างใหม่(ในฐาน, ในไฟล์) {
  if (!ในฐาน.length) return null;
  const ล่าสุด = ในฐาน.reduce((a, b) => (a > b ? a : b));
  const มี = new Set(ในฐาน), ไฟล์ = new Set(ในไฟล์);
  const ข้าม = ในไฟล์.filter(v => !มี.has(v) && v < ล่าสุด).sort();
  if (ข้าม.length) return `ฐาน dev ลงใบ ${ล่าสุด} ไปก่อนใบ ${ข้าม.join(", ")} (ลงย้อนลำดับไม่ได้)`;
  const เกิน = ในฐาน.filter(v => !ไฟล์.has(v));
  if (เกิน.length) return `ฐาน dev มีใบ ${เกิน.join(", ")} ที่โฟลเดอร์นี้ไม่มี (ลงจากโฟลเดอร์อื่น)`;
  return null;
}
