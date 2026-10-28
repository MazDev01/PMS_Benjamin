// ── ตัวช่วยร่วมของข้อมูลตัวอย่างฐาน dev (scripts/dev-sample-data.mjs · บอสสั่ง 28 ต.ค. 69) ───────────────────────────────
// ทุกส่วน (ไฟล์ในโฟลเดอร์นี้) export { ชื่อ, มีแล้ว(ctx), ลบ(ctx), สร้าง(ctx) } — ตัวรันเรียกตามลำดับ · แต่ละส่วนลบ/สร้างเฉพาะของตัวเอง
// กติกาของทุกส่วน:
//   · เดินทางเดียวกับหน้าเว็บ (บัญชีผู้ใช้ + คำสั่งเดียวกับที่แอปเรียก) — ฐานติ๊กงาน/จดไทม์ไลน์/แจ้งเตือนเอง ไม่วางสถานะตรง ๆ
//     ยกเว้นสิ่งที่ผู้ใช้ทำไม่ได้: ย้อน "เวลา" (ข้อมูลย้อนหลัง) · ของที่มาจากหลังบ้าน (ลีดของ HQ · บัญชีผู้ใช้) → กุญแจฝั่งเซิร์ฟเวอร์ (ctx.svc)
//   · ข้อมูลสมมติล้วน: ชื่อตามสูตร · อีเมล @example.test · เบอร์ 000-000-xxxx · ห้ามชื่อ/เบอร์/อีเมลคนจริง
//   · ฐาน dev เท่านั้น — ตรวจพอร์ตก่อนทุกครั้ง (ฐานทดสอบ/ฐานจริงห้ามรัน)
//   · รหัสผ่านบัญชีที่สร้างใหม่เก็บนอก repo: ctx.ไฟล์บัญชี (C:/.claude/pms-dev/บัญชีตัวอย่าง.json)
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { รากโฟลเดอร์ } from "../lib/session.mjs";

export const ป้าย = "ข้อมูลตัวอย่าง";
const เขตเวลาไทย = 7 * 3_600_000;
/** วันที่ ISO (เวลาไทย) บวก/ลบจากวันนี้ */
export const วัน = (บวก = 0) => new Date(Date.now() + เขตเวลาไทย + บวก * 86_400_000).toISOString().slice(0, 10);
const เดือนไทย = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
/** ป้ายวันที่ไทยแบบที่แอปเก็บใน created_label เช่น "28 ต.ค. 2569" */
export const ป้ายวัน = (iso) => { const [y, m, d] = iso.split("-").map(Number); return `${d} ${เดือนไทย[m - 1]} ${y + 543}`; };
/** เวลา (timestamptz) ย้อนหลัง n วัน ตอน hh:00 เวลาไทย */
export const เวลาย้อน = (n, hh = 10) => new Date(`${วัน(-n)}T${String(hh).padStart(2, "0")}:00:00+07:00`).toISOString();
export const ต้อง = (r, อะไร) => { if (r.error) throw new Error(`${อะไร}: ${r.error.message}`); return r.data; };
export const หยุด = (m) => { console.error(`⛔ ${m}`); process.exit(1); };
export const เบอร์ = (n) => `000-000-${String(n).slice(-4).padStart(4, "0")}`;

export async function เตรียม() {
  const ports = JSON.parse(readFileSync(path.join(รากโฟลเดอร์, "scripts/lib/ports.json"), "utf8")).ฐาน;
  const ที่ฐานdev = process.env.PMS_DEV_DB_DIR || "C:/.claude/pms-dev";
  const st = spawnSync("npx", ["supabase", "status", "-o", "env", "--workdir", ที่ฐานdev], { encoding: "utf8", shell: process.platform === "win32" });
  const ค่า = Object.fromEntries((st.stdout ?? "").split(/\r?\n/).map(l => l.match(/^([A-Z_]+)="?(.*?)"?$/)).filter(Boolean).map(m => [m[1], m[2]]));
  const API = ค่า.API_URL;
  if (!API || !ค่า.ANON_KEY || !ค่า.SERVICE_ROLE_KEY) หยุด("อ่านค่าฐาน dev ไม่ได้ — เปิดฐาน dev ก่อน (npm run dev หรือ node scripts/dev-db.mjs --prepare-only)");
  if (new URL(API).port !== String(ports.dev.api)) หยุด(`ไม่ใช่ฐาน dev (${API}) — ข้อมูลตัวอย่างลงได้เฉพาะฐาน dev พอร์ต ${ports.dev.api}`);
  const คอนเทนเนอร์ = `supabase_db_${process.env.PMS_DEV_PROJECT || "pms-dev"}`;

  // บัญชีของข้อมูลตั้งต้น (tests/.env.test · git ไม่เก็บ) + บัญชีที่ข้อมูลตัวอย่างสร้าง (ไฟล์นอก repo)
  const ทดสอบ = Object.fromEntries(readFileSync(path.join(รากโฟลเดอร์, "tests/.env.test"), "utf8").split(/\r?\n/)
    .filter(l => /^[A-Z_]+=/.test(l)).map(l => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
  const ไฟล์บัญชี = path.join(ที่ฐานdev, "บัญชีตัวอย่าง.json");
  const อ่านบัญชี = () => (existsSync(ไฟล์บัญชี) ? JSON.parse(readFileSync(ไฟล์บัญชี, "utf8")) : { บัญชี: [] });
  const เขียนบัญชี = (j) => writeFileSync(ไฟล์บัญชี, JSON.stringify(j, null, 2) + "\n");

  const svc = createClient(API, ค่า.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const เข้า = async (email, password) => {
    const c = createClient(API, ค่า.ANON_KEY, { auth: { persistSession: false } });
    const { error } = await c.auth.signInWithPassword({ email, password });
    if (error) throw new Error(`เข้าระบบบัญชีตัวอย่างไม่ได้ (${email.split("@")[0]}…): ${error.message}`);
    return c;
  };
  /** บัญชีผู้ใช้ (สร้างถ้ายังไม่มี · รหัสผ่านสุ่มครั้งเดียวเก็บในไฟล์นอก repo) → { email, password, id } */
  const บัญชีผู้ใช้ = async ({ email, role, dealer_code = "", name }) => {
    const j = อ่านบัญชี();
    let b = j.บัญชี.find(x => x.email === email);
    if (!b) { b = { email, password: `Dev-${randomBytes(6).toString("base64url")}9a`, role, dealer_code, name }; j.บัญชี.push(b); เขียนบัญชี(j); }
    const { data: list } = await svc.auth.admin.listUsers({ perPage: 1000 });
    let u = list?.users?.find(x => x.email === email);
    if (!u) u = ต้อง(await svc.auth.admin.createUser({ email, password: b.password, email_confirm: true }), `สร้างบัญชี ${email}`).user;
    else await svc.auth.admin.updateUserById(u.id, { password: b.password });
    ต้อง(await svc.from("profiles").upsert({ id: u.id, role, dealer_code, name, status: "active", contact_email_verified_at: new Date().toISOString() }, { onConflict: "id" }), `โปรไฟล์ ${email}`);
    return { ...b, id: u.id };
  };
  /** SQL ตรงบนฐาน dev (ใช้เฉพาะลบชุดเดิมที่ฐานกันการลบ · ไม่ใช้สร้างข้อมูล) */
  const sql = (text) => {
    const r = spawnSync("docker", ["exec", "-i", คอนเทนเนอร์, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-At"], { input: text, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`SQL ฐาน dev: ${(r.stderr || r.stdout).trim().split(/\r?\n/).slice(-3).join(" ")}`);
    return r.stdout;
  };
  return { svc, เข้า, sql, ทดสอบ, ไฟล์บัญชี, อ่านบัญชี, บัญชีผู้ใช้, วัน, ป้ายวัน, เวลาย้อน, ต้อง, ป้าย, เบอร์ };
}
