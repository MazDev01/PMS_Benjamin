// ── ตรวจว่าบัญชีผู้ดูแล (HQ) ไม่ได้ใช้รหัสผ่านเดียวกับบัญชีทดสอบ — อ่านอย่างเดียว (ก่อนขึ้นระบบจริง ข้อ 13) ─────────
//
// บอสเป็นคนรันกับระบบจริง · ผลพิมพ์แค่ "ใช่ / ไม่ใช่" + จำนวนบัญชีที่ตรวจ (ไม่พิมพ์อีเมล ชื่อ หรือรหัส)
//
// อ่านอย่างเดียวจริง:
//   • ไม่ลองล็อกอิน (ล็อกอินแต่ละครั้งสร้างใบผ่านบนระบบจริง = ไม่ใช่อ่านอย่างเดียว)
//   • เทียบรหัสของบัญชีทดสอบกับค่าแฮชในฐานด้วย crypt() ของ Postgres ในรายการแบบ read only แล้วย้อนทิ้ง
//   • รหัสทดสอบส่งเป็นตัวแปรของ psql — ไม่เขียนลงไฟล์ ไม่พิมพ์ลงจอ
//
// ใช้:
//   PMS_PROD_DB_URL="postgresql://…" node scripts/check-prod-admin-password.mjs     ระบบจริง (บอสใส่ที่อยู่ตอนรัน ไม่เก็บในไฟล์)
//   node scripts/check-prod-admin-password.mjs --test                                ทดสอบตัวเองกับฐานทดสอบในเครื่อง (ต้องได้ "ใช่")
//   PMS_OLD_ADMIN_PASSWORDS="…" …                                                   ตรวจเพิ่ม: ยังใช้รหัสตั้งต้นที่เคยอยู่ในโค้ดไหม (โค้ดไม่เก็บรหัสนี้)
//   node scripts/check-prod-admin-password.mjs --test --env-file <ไฟล์รหัสที่ไม่ตรง>   ทดสอบฝั่ง "ไม่ใช่" (ใช้เฉพาะไฟล์ ไม่รวมตัวแปรแวดล้อม)
//
// รหัสของบัญชีทดสอบอ่านจาก tests/.env.test (TEST_*_PASSWORD) และ process.env (SEED_PASSWORD_*)
// ต้องมี Docker (ใช้ psql จากอิมเมจ Postgres ของ Supabase ที่มีในเครื่อง)
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { อาร์กิวเมนต์psql } from "./lib/testDbGuard.mjs";

const ทดสอบตัวเอง = process.argv.includes("--test");
const อ่านไฟล์ = (f) => { try { return readFileSync(f, "utf8"); } catch { return ""; } };
// --env-file <ไฟล์> = อ่านรหัสบัญชีทดสอบจากไฟล์อื่น (ใช้ตอนทดสอบว่าตอบ "ไม่ใช่" ได้ถูก)
const ไฟล์รหัส = process.argv.includes("--env-file") ? process.argv[process.argv.indexOf("--env-file") + 1] : "tests/.env.test";
const ค่าในไฟล์ = Object.fromEntries(อ่านไฟล์(ไฟล์รหัส).split(/\r?\n/)
  .map(l => l.trim()).filter(l => l && !l.startsWith("#") && l.includes("="))
  .map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const รหัสทดสอบ = [...new Set([
  ...Object.entries(ค่าในไฟล์).filter(([k]) => /^TEST_.*_PASSWORD$/.test(k)).map(([, v]) => v),
  ...Object.entries(process.env).filter(([k]) => /^(TEST_.*_PASSWORD|SEED_PASSWORD_.*)$/.test(k)).map(([, v]) => v ?? ""),
].filter(Boolean))];
if (!รหัสทดสอบ.length) { console.error("❌ ไม่พบรหัสของบัญชีทดสอบ (tests/.env.test → TEST_*_PASSWORD)"); process.exit(2); }

// รหัสผู้ดูแลตั้งต้นที่เคยเขียนไว้ในโค้ด/คู่มือ — ยังอยู่ในประวัติ git (บอสสั่งไม่แก้ประวัติ) ใครเข้าถึง repo ก็อ่านได้
//   เพิ่ม 15 ต.ค. 69: ตอบแยกอีกบรรทัด · ตัวรหัสไม่เก็บในโค้ดแล้ว → ใส่ตอนรัน PMS_OLD_ADMIN_PASSWORDS="รหัส1,รหัส2"
//   ไม่ใส่ = บรรทัดนี้ขึ้น "ไม่ได้ตรวจ" (ไม่ถือว่าผ่าน)
const รหัสในโค้ด = (process.env.PMS_OLD_ADMIN_PASSWORDS ?? "").split(",").map(s => s.trim()).filter(Boolean);

// รายการ read only — เขียนอะไรไม่ได้แม้คำสั่งผิด · ผลเป็นตัวเลข 3 ตัว: บัญชีผู้ดูแลที่ตรวจ · ที่รหัสตรงกับรหัสทดสอบ · ที่ใช้รหัสในโค้ด
const คำสั่ง = `begin transaction read only;
select count(*) as admins,
       count(*) filter (where exists (select 1 from unnest(string_to_array(:'pw', E'\\x1f')) x(p)
                                      where u.encrypted_password = extensions.crypt(x.p, u.encrypted_password))) as same,
       count(*) filter (where exists (select 1 from unnest(string_to_array(:'pw2', E'\\x1f')) x(p)
                                      where u.encrypted_password = extensions.crypt(x.p, u.encrypted_password))) as code
  from auth.users u join public.profiles pr on pr.id = u.id
 where (pr.role::text = 'SUPER_ADMIN' or pr.role::text like 'HQ\\_%')
   and coalesce(u.encrypted_password, '') <> '';
rollback;`;
const ตัวคั่น = String.fromCharCode(0x1f);   // ตัวคั่นที่ไม่มีทางอยู่ในรหัสผ่าน

function รัน() {
  const psqlArgs = ["-X", "-q", "-A", "-t", "-F", "|", "-v", "ON_ERROR_STOP=1", "-v", `pw=${รหัสทดสอบ.join(ตัวคั่น)}`, "-v", `pw2=${รหัสในโค้ด.join(ตัวคั่น)}`];
  if (ทดสอบตัวเอง) {
    const c = execFileSync("docker", ["ps", "--filter", "name=supabase_db_", "--format", "{{.Names}}"], { encoding: "utf8" })
      .split(String.fromCharCode(10)).map(s => s.trim()).find(s => s.includes("dbcheck"));
    if (!c) { console.error("❌ ไม่พบฐานทดสอบในเครื่อง (docker)"); process.exit(2); }
    return execFileSync("docker", [...อาร์กิวเมนต์psql(c, { เขียน: false }), ...psqlArgs], { input: คำสั่ง, encoding: "utf8" });
  }
  const url = process.env.PMS_PROD_DB_URL ?? "";
  if (!/^postgres(ql)?:\/\//.test(url)) { console.error("❌ ตั้ง PMS_PROD_DB_URL เป็นที่อยู่ฐานข้อมูล (postgresql://…) ตอนรัน — สคริปต์ไม่เก็บค่านี้"); process.exit(2); }
  const img = execFileSync("docker", ["image", "ls", "--format", "{{.Repository}}:{{.Tag}}"], { encoding: "utf8" })
    .split(String.fromCharCode(10)).map(s => s.trim()).find(s => /supabase\/postgres:/.test(s));
  if (!img) { console.error("❌ ไม่พบอิมเมจ Postgres ของ Supabase ในเครื่อง (ต้องมี psql)"); process.exit(2); }
  // ที่อยู่ฐานส่งผ่านตัวแปรแวดล้อมของคอนเทนเนอร์ ไม่อยู่ในบรรทัดคำสั่ง
  return execFileSync("docker", ["run", "--rm", "-i", "-e", "PGURL", "--entrypoint", "sh", img, "-c", `psql "$PGURL" ${psqlArgs.map(a => `'${a.replace(/'/g, "'\\''")}'`).join(" ")}`],
    { input: คำสั่ง, encoding: "utf8", env: { ...process.env, PGURL: url } });
}

let ผล;
try { ผล = รัน(); }
catch (e) { console.error(`❌ ตรวจไม่สำเร็จ: ${String(e.stderr ?? e.message).split(String.fromCharCode(10))[0]}`); process.exit(2); }
const [admins, same, code] = ผล.trim().split(String.fromCharCode(10)).filter(Boolean).pop().split("|").map(Number);
console.log(`\n🎯 ฐานข้อมูล: ${ทดสอบตัวเอง ? "ชุดทดสอบในเครื่อง" : "ระบบจริง"} · ตรวจบัญชีผู้ดูแล ${admins} บัญชี · เทียบกับรหัสบัญชีทดสอบ ${รหัสทดสอบ.length} ชุด`);
console.log(`บัญชีผู้ดูแลใช้รหัสเดียวกับบัญชีทดสอบ: ${same > 0 ? "ใช่" : "ไม่ใช่"}${same > 0 ? ` (${same} บัญชี)` : ""}\n`);
console.log(`บัญชีผู้ดูแลใช้รหัสตั้งต้นที่เคยอยู่ในโค้ด: ${!รหัสในโค้ด.length ? "ไม่ได้ตรวจ (ไม่ได้ใส่ PMS_OLD_ADMIN_PASSWORDS)" : code > 0 ? `ใช่ (${code} บัญชี)` : "ไม่ใช่"}
`);
process.exitCode = same > 0 || code > 0 ? 1 : 0;
