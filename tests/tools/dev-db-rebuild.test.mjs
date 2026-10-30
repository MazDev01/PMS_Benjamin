// ── ข้อทดสอบ: ฐาน dev ลงใบข้ามลำดับ → npm run dev สร้างฐานใหม่เองแล้วเปิดต่อได้ (บอสสั่ง 28 ต.ค. 69) ──────────────────────
// เจอจริง: เซสชันหนึ่งลง 0251 ลงฐาน dev ไปก่อน (ยังไม่มี 0250) → โฟลเดอร์หลักเปิด npm run dev ไม่ได้
//   "Found local migration files to be inserted before the last migration on remote database"
// จำลองด้วยฐานแยก (ไม่แตะฐาน dev ของบอส): โปรเจกต์ pms-devrebuild-test · เปิดแค่ตัวฐาน · ใบจิ๋ว 3 ใบ
//   ① ลง 0001 + 0003 ก่อน ② เพิ่มไฟล์ 0002 ③ scripts/dev-db.mjs --prepare-only ต้อง: สำเร็จ · บอกบรรทัดเดียวว่าสร้างใหม่เพราะอะไร
//   · ฐานมี 0001 0002 0003 ครบ (ลงตามลำดับ) · ตาราง 0002 มีจริง
// ส่วน "เปิดเว็บ" หลังเตรียมฐานเป็นโค้ดเดิมที่ไม่เปลี่ยน (turbo dev) — ข้อนี้ตรวจถึงจุดที่เดิมพัง
// รัน: node tests/tools/dev-db-rebuild.test.mjs   (PMS_DEV_SCRIPT = ชี้ตัวสคริปต์อื่น ใช้พิสูจน์ว่าโค้ดเดิมตก)
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const ราก = process.cwd();
const สคริปต์ = process.env.PMS_DEV_SCRIPT || path.join(ราก, "scripts/dev-db.mjs");
const ที่ = mkdtempSync(path.join(tmpdir(), "pms-devrebuild-"));
const ใบ = path.join(ที่, "migrations"), ฐาน = path.join(ที่, "devdb");
mkdirSync(ใบ);
const โปรเจกต์ = "pms-devrebuild-test";
const env = { ...process.env, PMS_DEV_DB_DIR: ฐาน, PMS_DEV_PROJECT: โปรเจกต์, PMS_DEV_API_PORT: "58321", PMS_DEV_MIGRATIONS_DIR: ใบ,
  PMS_DEV_START_EXCLUDE: "gotrue,realtime,storage-api,imgproxy,kong,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor" };
delete env.PMS_TESTDB_LOCK_HELD;
// เพดานต่อครั้ง: ค้าง = ตกพร้อมบอกเหตุ ไม่ใช่ให้รอบตรวจเต็มค้างทั้งรอบ (29 ต.ค. 69 ค้างกว่า 50 นาที · ปกติครั้งละไม่ถึง 2 นาที)
const เพดานนาที = 10;
const เตรียม = () => {
  const r = spawnSync(process.execPath, [สคริปต์, "--prepare-only"], { encoding: "utf8", env, cwd: ราก, maxBuffer: 64 << 20, timeout: เพดานนาที * 60_000 });
  if (r.error?.code === "ETIMEDOUT") r.stderr = `${r.stderr ?? ""}\n⛔ เตรียมฐานจำลองเกิน ${เพดานนาที} นาที — supabase start ค้าง (ดู docker ps --filter label=com.supabase.cli.project=${โปรเจกต์})`;
  return r;
};
// เก็บฐานจำลองที่ค้างจากรอบที่ถูกหยุดกลางทาง (ชื่อโปรเจกต์นี้ใช้เฉพาะข้อทดสอบนี้) — ไม่งั้นรอบใหม่เปิดชนของเดิม
const เก็บของค้าง = () => {
  const ป้าย = `label=com.supabase.cli.project=${โปรเจกต์}`;
  const ตัว = spawnSync("docker", ["ps", "-aq", "--filter", ป้าย], { encoding: "utf8" }).stdout.split(/\s+/).filter(Boolean);
  if (ตัว.length) spawnSync("docker", ["rm", "-f", ...ตัว], { encoding: "utf8" });
  const ที่เก็บ = spawnSync("docker", ["volume", "ls", "-q", "--filter", ป้าย], { encoding: "utf8" }).stdout.split(/\s+/).filter(Boolean);
  if (ที่เก็บ.length) spawnSync("docker", ["volume", "rm", ...ที่เก็บ], { encoding: "utf8" });
  return ตัว.length + ที่เก็บ.length;
};
const sql = (q) => spawnSync("docker", ["exec", `supabase_db_${โปรเจกต์}`, "psql", "-U", "postgres", "-d", "postgres", "-At", "-c", q], { encoding: "utf8" }).stdout.trim();
// บัญชีหนึ่งแถวในใบแรก = ฐานไม่ว่าง → ไม่ใส่ข้อมูลตัวอย่างชุดใหญ่ (ข้อนี้ตรวจการสร้างใหม่ ไม่ใช่ข้อมูลตัวอย่าง)
const ใบที่ = { "0001_a.sql": "create table public.profiles (id int); insert into public.profiles values (1);",
  "0002_b.sql": "create table public.from_0002 (id int);", "0003_c.sql": "create table public.from_0003 (id int);" };

let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n   ${String(เพิ่ม).slice(-1500)}`}`); };
try {
  const ค้าง = เก็บของค้าง();
  if (ค้าง) console.log(`(เก็บฐานจำลองที่ค้างจากรอบก่อน ${ค้าง} ชิ้น)`);
  // ① ฐานลง 0001 + 0003 (ยังไม่มีไฟล์ 0002 — เหมือนเซสชันที่มีใบใหม่กว่าแต่ยังไม่มีใบกลาง)
  writeFileSync(path.join(ใบ, "0001_a.sql"), ใบที่["0001_a.sql"]);
  writeFileSync(path.join(ใบ, "0003_c.sql"), ใบที่["0003_c.sql"]);
  const แรก = เตรียม();
  ผล(แรก.status === 0 && sql("select string_agg(version, ',' order by version) from supabase_migrations.schema_migrations") === "0001,0003",
    "จำลองฐาน dev ลง 0001 + 0003 ไปก่อน", แรก.stdout + แรก.stderr);
  // ② โฟลเดอร์ได้ไฟล์ 0002 (เลขต่ำกว่าใบล่าสุดในฐาน) → ③ เปิดใหม่ต้องสร้างฐานใหม่เอง
  writeFileSync(path.join(ใบ, "0002_b.sql"), ใบที่["0002_b.sql"]);
  const สอง = เตรียม();
  const ออก = สอง.stdout + สอง.stderr;
  ผล(สอง.status === 0, "ฐานลงใบข้ามลำดับ → เตรียมฐาน dev สำเร็จ (เดิมหยุดด้วย Found local migration files to be inserted before …)", ออก);
  const บรรทัด = ออก.split(/\r?\n/).filter(l => l.includes("สร้างฐาน dev ใหม่"));
  ผล(บรรทัด.length === 1 && /0003/.test(บรรทัด[0]) && /0002/.test(บรรทัด[0]) && /ใช้เวลาราว/.test(บรรทัด[0]),
    "บอกบรรทัดเดียวว่ากำลังสร้างฐาน dev ใหม่ เพราะอะไร (ใบไหนก่อนใบไหน) ใช้เวลาราวเท่าไหร่", บรรทัด.join("\n") || ออก);
  ผล(sql("select string_agg(version, ',' order by version) from supabase_migrations.schema_migrations") === "0001,0002,0003"
    && sql("select to_regclass('public.from_0002') is not null and to_regclass('public.from_0003') is not null") === "t",
    "ฐานใหม่ลงครบทุกใบตามลำดับ 0001 → 0002 → 0003", sql("select string_agg(version, ',') from supabase_migrations.schema_migrations"));
  ผล(!/include-all/.test(ออก), "ไม่ใช้ --include-all");
  // ④ เปิดครั้งถัดไป ฐานตรงกับไฟล์แล้ว → ไม่สร้างใหม่ซ้ำ
  const สาม = เตรียม();
  ผล(สาม.status === 0 && !/สร้างฐาน dev ใหม่/.test(สาม.stdout + สาม.stderr), "เปิดครั้งถัดไปไม่สร้างฐานใหม่ซ้ำ", สาม.stdout + สาม.stderr);
  // ⑤ ข้อมูลเดิมในฐาน dev ขัดกับใบใหม่ (30 ต.ค. 69: ข้อมูลตัวอย่างดีลเลอร์ 2 จังหวัด ชนใบ 0259 · บอสเปิด npm run dev ไม่ได้)
  //    → ลงใบไม่ได้ = สร้างฐาน dev ใหม่ครั้งเดียวแล้วลงต่อ · บอกว่าใบไหนชนข้อมูลเดิม
  sql("insert into public.from_0003 values (1)");
  writeFileSync(path.join(ใบ, "0004_d.sql"), "alter table public.from_0003 add constraint from_0003_gt5 check (id > 5);");
  const สี่ = เตรียม();
  const ออกสี่ = สี่.stdout + สี่.stderr;
  ผล(สี่.status === 0 && /สร้างฐาน dev ใหม่ — ลง 0004_d\.sql บนข้อมูลเดิมของฐาน dev ไม่ได้/.test(ออกสี่)
    && sql("select string_agg(version, ',' order by version) from supabase_migrations.schema_migrations") === "0001,0002,0003,0004"
    && sql("select count(*) from public.from_0003") === "0",
    "ข้อมูลเดิมในฐาน dev ขัดกับใบใหม่ → สร้างฐาน dev ใหม่เองแล้วลงครบ (เดิมหยุด \"ลงใบปรับฐานบนฐาน dev ไม่สำเร็จ\")",
    `รหัส ${สี่.status} · ใบในฐาน ${sql("select string_agg(version, ',' order by version) from supabase_migrations.schema_migrations")} · แถว ${sql("select count(*) from public.from_0003")}\n` +
    ออกสี่.split(/\r?\n/).filter(l => /สร้างฐาน|ลงใบ|ไม่สำเร็จ|ERROR|Applying/.test(l)).join("\n"));
  // ค่าตั้งที่สร้างให้ฐาน dev ปิด pg-delta (ต้นเหตุ start ค้าง 29 ต.ค. 69)
  const ค่าตั้ง = readFileSync(path.join(ฐาน, "supabase/config.toml"), "utf8");
  ผล(/\[experimental\.pgdelta\][^[]*?enabled\s*=\s*false/.test(ค่าตั้ง), "ค่าตั้งฐาน dev ปิด pg-delta (start ไม่ส่งออกโครงฐานผ่านคอนเทนเนอร์ที่ค้างได้)",
    ค่าตั้ง.match(/\[experimental\.pgdelta\][^[]*/)?.[0] ?? "ไม่มีหัวข้อ experimental.pgdelta");
} finally {
  spawnSync("npx", ["supabase", "stop", "--no-backup", "--workdir", ฐาน], { encoding: "utf8", shell: process.platform === "win32", timeout: เพดานนาที * 60_000 });
  เก็บของค้าง();
  rmSync(ที่, { recursive: true, force: true });
}
console.log(ตก ? `\n${ตก} FAIL` : "\nALL PASS");
process.exit(ตก ? 1 : 0);
