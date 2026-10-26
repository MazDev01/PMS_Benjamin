// ── ข้อทดสอบ: ฐานทดสอบเขียนได้เฉพาะผู้ถือล็อก (scripts/lib/testDbGuard.mjs · บอสสั่ง 26 ต.ค. 69) ──────────────────────────
// ใช้ฐานทดสอบจริง (pms-dbcheck) · ถือล็อกตลอดข้อ (รอคิวได้) · ทุกแถวที่เขียนติดป้าย ZZTEST-GUARD แล้วลบท้ายข้อ
//   ไม่ถือล็อก (จำลองด้วยโปรเซสลูกที่ไม่มี env ของล็อก) → docker exec psql ตรง / บัญชีบริการ / รหัสเดา / API ด้วยกุญแจตั้งต้น = ถูกปฏิเสธ
//   ถือล็อก → psql ของผู้ถือล็อก / API (ตัวสลับกุญแจ) / โปรเซสลูก = เขียนได้ · ปล่อยล็อกแล้ว รหัส/กุญแจของรอบเก่าใช้ไม่ได้
// mutation proof (โฟลเดอร์แยก): PMS_GUARD_LIB_DIR=<โฟลเดอร์ที่คัดตัวกันไปแก้ให้ไม่กัน> → ข้อทดสอบต้องตก (tests/tools/testdb-guard-mutation.mjs)
// รัน: node tests/tools/testdb-guard.test.mjs
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ราก = process.cwd();
const ที่ตัวกัน = process.env.PMS_GUARD_LIB_DIR || path.join(ราก, "scripts/lib");
const นำเข้า = (f) => import(pathToFileURL(path.join(ที่ตัวกัน, f)).href);
const { ขอล็อกฐานทดสอบ } = await นำเข้า("testDbLock.mjs");
const { คอนเทนเนอร์, อาร์กิวเมนต์psql } = await นำเข้า("testDbGuard.mjs");

let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n   ${String(เพิ่ม).slice(0, 400)}`}`); };
const ports = JSON.parse(readFileSync(path.join(ราก, "scripts/lib/ports.json"), "utf8")).ฐาน;
const API = `http://127.0.0.1:${ports.ทดสอบ.api}`;
const อ่านไฟล์env = (f) => Object.fromEntries(readFileSync(f, "utf8").split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l)).map(l => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const แอป = อ่านไฟล์env(path.join(ราก, "apps/hq/.env.local"));
const ทดสอบ = อ่านไฟล์env(path.join(ราก, "tests/.env.test"));
const แถว = (k) => `insert into public.notifications (kind, audience, title, body, href, dedupe_key) values ('request_new', 'hq', 'ZZTEST-GUARD', 'ZZTEST-GUARD', '/', 'ZZTEST-GUARD:${k}')`;
const แถวJSON = (k) => ({ kind: "request_new", audience: "hq", title: "ZZTEST-GUARD", body: "ZZTEST-GUARD", href: "/", dedupe_key: `ZZTEST-GUARD:${k}` });

// รันใต้ล็อกของรอบตรวจ/playwright (ตัวแม่ถือ) = ข้อที่ต้องสลับกุญแจของรอบ (④) ข้าม — ข้อทดสอบอื่นที่รันพร้อมกันใช้กุญแจนั้นอยู่
//   ข้อเต็มทุกข้อ: รันเดี่ยว (node tests/tools/testdb-guard.test.mjs) และใน mutation proof
const ใต้ตัวแม่ = !!process.env.PMS_TESTDB_LOCK_HELD;
const ล็อก = ขอล็อกฐานทดสอบ("ข้อทดสอบตัวกันเขียนฐานทดสอบ", { รอนาที: 120 });

// โปรเซสลูกที่ "ไม่ได้ถือล็อก" — ตัด env ของล็อกทิ้งทั้งหมด (เหมือนสคริปต์ที่ไม่ผ่านเครื่องมือล็อก)
const envนอกล็อก = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^PMS_TESTDB_|^NODE_OPTIONS$/.test(k)));
const นอกล็อก = (cmd, args, input) => spawnSync(cmd, args, { input, encoding: "utf8", env: envนอกล็อก });
const ถูกปฏิเสธ = (r) => r.status !== 0 && /reject|no pg_hba|password authentication failed|read-only|25006/i.test(r.stderr + r.stdout);

// ── ① ไม่ถือล็อก: ต่อฐานตรง ──
for (const [ชื่อ, args] of [
  ["docker exec psql -U postgres (ทาง socket)", ["exec", "-i", คอนเทนเนอร์, "psql", "-X", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"]],
  ["docker exec psql -U supabase_admin (ทาง socket)", ["exec", "-i", คอนเทนเนอร์, "psql", "-X", "-U", "supabase_admin", "-d", "postgres", "-v", "ON_ERROR_STOP=1"]],
  ["docker exec psql -h 127.0.0.1 -U postgres รหัสตั้งต้น", ["exec", "-i", "-e", "PGPASSWORD=postgres", คอนเทนเนอร์, "psql", "-X", "-h", "127.0.0.1", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"]],
  ["docker exec psql -h 127.0.0.1 -U authenticator รหัสตั้งต้น", ["exec", "-i", "-e", "PGPASSWORD=postgres", คอนเทนเนอร์, "psql", "-X", "-h", "127.0.0.1", "-U", "authenticator", "-d", "postgres", "-v", "ON_ERROR_STOP=1"]],
  ["docker exec psql -U pms_writer รหัสเดา", ["exec", "-i", "-e", "PGPASSWORD=postgres", คอนเทนเนอร์, "psql", "-X", "-h", "127.0.0.1", "-U", "pms_writer", "-d", "postgres", "-v", "ON_ERROR_STOP=1"]],
]) {
  const r = นอกล็อก("docker", args, `begin; ${แถว("psql")}; rollback;`);
  ผล(ถูกปฏิเสธ(r), `ไม่ถือล็อก: ${ชื่อ} → ถูกปฏิเสธ`, r.stdout + r.stderr);
}
{
  const r = นอกล็อก("docker", อาร์กิวเมนต์psql(คอนเทนเนอร์, { เขียน: false }).concat(["-X", "-At", "-v", "ON_ERROR_STOP=1"]), `select count(*) from public.dealers; ${แถว("reader")};`);
  ผล(r.status !== 0 && /\d+/.test(r.stdout) && /read-only|permission denied/i.test(r.stderr), "บัญชีอ่าน pms_reader: อ่านได้ เขียนไม่ได้ (ไม่ต้องถือล็อก)", r.stdout + r.stderr);
}

// ── ② ไม่ถือล็อก: ทาง API (กุญแจตั้งต้นจาก .env.local แบบที่สคริปต์ทั่วไปใช้ · ผู้ใช้ที่ล็อกอิน) ──
//   ข้อนี้เองถือล็อกอยู่ = "เซสชันอื่นถือล็อก" ในมุมของโปรเซสลูกที่ไม่มี env ของล็อก
const ยิง = (env, k, { key = แอป.SUPABASE_SERVICE_ROLE_KEY, jwt = key, หัว = {} } = {}) => spawnSync(process.execPath, ["--input-type=module", "-e", `
  const r = await fetch(${JSON.stringify(API)} + "/rest/v1/notifications", { method: "POST",
    headers: { apikey: ${JSON.stringify(key)}, Authorization: "Bearer " + ${JSON.stringify(jwt)}, "Content-Type": "application/json", Prefer: "return=minimal", ...${JSON.stringify(หัว)} },
    body: JSON.stringify(${JSON.stringify(แถวJSON(k))}) });
  process.stdout.write(String(r.status) + " " + await r.text());`], { encoding: "utf8", env });   // ไม่ใช้ console.log — ใน worker ของ playwright ตัวเลขถูกพิมพ์เป็นสี
const อ่านอย่างเดียว = (r) => /25006|read-only/i.test(r.stdout);
{
  const r = ยิง(envนอกล็อก, "api-service");
  ผล(อ่านอย่างเดียว(r), "ไม่ถือล็อก: API ด้วยกุญแจ service ตั้งต้น → อ่านอย่างเดียว", r.stdout + r.stderr);
  const a = ยิง(envนอกล็อก, "api-anon", { key: แอป.NEXT_PUBLIC_SUPABASE_ANON_KEY });
  ผล(อ่านอย่างเดียว(a), "ไม่ถือล็อก: API ด้วยกุญแจ anon ตั้งต้น → อ่านอย่างเดียว", a.stdout + a.stderr);
}
// ผู้ใช้ที่ล็อกอินขณะที่เซสชันอื่น (ข้อนี้) ถือล็อก — ต้องเขียนไม่ได้ ไม่ว่าจะไม่มีกุญแจหรือเดากุญแจ (บอสสั่ง 26 ต.ค. 69 ข้อ 3)
const เข้าระบบ = async (email, password) => {
  const r = await fetch(`${API}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: แอป.NEXT_PUBLIC_SUPABASE_ANON_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  return (await r.json()).access_token;
};
for (const [บัญชี, email, password] of [["HQ", ทดสอบ.TEST_ADMIN_EMAIL, ทดสอบ.TEST_ADMIN_PASSWORD], ["ดีลเลอร์ RYG", ทดสอบ.TEST_RYG_EMAIL, ทดสอบ.TEST_RYG_PASSWORD]]) {
  const jwt = await เข้าระบบ(email, password);
  if (!jwt) { ผล(false, `ล็อกอินบัญชีทดสอบ ${บัญชี} ได้`); continue; }
  const ไม่มี = ยิง(envนอกล็อก, `user-${บัญชี}`, { key: แอป.NEXT_PUBLIC_SUPABASE_ANON_KEY, jwt });
  ผล(อ่านอย่างเดียว(ไม่มี), `ผู้ใช้ ${บัญชี} ล็อกอินขณะเซสชันอื่นถือล็อก ไม่มีกุญแจ → เขียนไม่ได้`, ไม่มี.stdout + ไม่มี.stderr);
  const เดา = ยิง(envนอกล็อก, `user-guess-${บัญชี}`, { key: แอป.NEXT_PUBLIC_SUPABASE_ANON_KEY, jwt, หัว: { "x-pms-lock": "guessed-wrong-key" } });
  ผล(อ่านอย่างเดียว(เดา), `ผู้ใช้ ${บัญชี} ล็อกอินขณะเซสชันอื่นถือล็อก กุญแจไม่ตรง → เขียนไม่ได้`, เดา.stdout + เดา.stderr);
  const ถูก = ยิง(process.env, `user-ok-${บัญชี}`, { key: แอป.NEXT_PUBLIC_SUPABASE_ANON_KEY, jwt });   // โปรเซสของผู้ถือล็อก (แนบกุญแจให้เอง)
  ผล(!อ่านอย่างเดียว(ถูก), `ผู้ใช้ ${บัญชี} ในโปรเซสของผู้ถือล็อก (กุญแจตรง) → ไม่ถูกบังคับอ่านอย่างเดียว (สิทธิ์ตามกติกาปกติ)`, ถูก.stdout + ถูก.stderr);
}

// ── ③ ถือล็อก: เขียนได้ ──
{
  const r = spawnSync("docker", อาร์กิวเมนต์psql(คอนเทนเนอร์).concat(["-X", "-q", "-v", "ON_ERROR_STOP=1"]), { input: `begin; ${แถว("psql-ok")}; rollback;`, encoding: "utf8" });
  ผล(r.status === 0, "ถือล็อก: psql ของผู้ถือล็อก (pms_writer รหัสของรอบ) → เขียนได้", r.stderr);
}
{
  const r = ยิง(process.env, "api-ok");   // โปรเซสลูกได้ NODE_OPTIONS → แนบกุญแจให้เอง
  ผล(/^201 /.test(r.stdout), "ถือล็อก: โปรเซสลูก API ด้วยกุญแจ service ตั้งต้น (แนบกุญแจของรอบให้เอง) → เขียนได้", r.stdout + r.stderr);
}

// เก็บกวาด (ยังถือล็อก)
spawnSync("docker", อาร์กิวเมนต์psql(คอนเทนเนอร์).concat(["-X", "-q"]), { input: "delete from public.notifications where dedupe_key like 'ZZTEST-GUARD:%';", encoding: "utf8" });

// ── ④ ปล่อยล็อก: กุญแจของรอบเก่าใช้ไม่ได้ ──
const รหัสเก่า = process.env.PMS_TESTDB_PG_PASSWORD;
ล็อก.release();
if (ใต้ตัวแม่) console.log("- ข้าม: ปล่อยล็อกแล้วกุญแจเก่าใช้ไม่ได้ (รันใต้ล็อกของตัวแม่ · ทดสอบตอนรันเดี่ยว)");
else {
  const r = นอกล็อก("docker", ["exec", "-i", "-e", `PGPASSWORD=${รหัสเก่า}`, คอนเทนเนอร์, "psql", "-X", "-h", "127.0.0.1", "-U", "pms_writer", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], `begin; ${แถว("old")}; rollback;`);
  ผล(ถูกปฏิเสธ(r), "ปล่อยล็อกแล้ว: รหัส psql ของรอบเก่า → ใช้ไม่ได้", r.stdout + r.stderr);
  const a = ยิง(envนอกล็อก, "old-key", { หัว: { "x-pms-lock": รหัสเก่า } });
  ผล(อ่านอย่างเดียว(a), "ปล่อยล็อกแล้ว: กุญแจ API ของรอบเก่า → อ่านอย่างเดียว", a.stdout + a.stderr);
}

// ตัวกันพัง (เช่นตอนพิสูจน์) ข้อ ④ อาจเขียนแถวลงได้ — ขอล็อกใหม่แล้วกวาดแถว ZZTEST-GUARD ทิ้งเสมอ
if (!ใต้ตัวแม่) {
  const กวาด = ขอล็อกฐานทดสอบ("ข้อทดสอบตัวกัน · กวาดแถวทดสอบ", { รอนาที: 10 });
  spawnSync("docker", อาร์กิวเมนต์psql(คอนเทนเนอร์).concat(["-X", "-q"]), { input: "delete from public.notifications where dedupe_key like 'ZZTEST-GUARD:%';", encoding: "utf8" });
  กวาด.release();
}

console.log(ตก ? `\n${ตก} FAIL` : "\nALL PASS");
process.exit(ตก ? 1 : 0);
