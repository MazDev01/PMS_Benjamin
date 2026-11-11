// ── ข้อทดสอบ: ซ้อมลงใบปรับฐานแบบ db push บนฐานแยกชั่วคราว (scripts/lib/migrationRehearsal.mjs · 10 พ.ย. 69) ─────────────
//   ใบทดลอง 9999 (โฟลเดอร์จำลอง = ใบจริงทั้งหมด + ใบทดลอง): SET LOCAL ระดับบนสุด + update ตารางที่มีตัวดัก
//   คาด: ไม่ห่อ transaction เหมือน db push → SET LOCAL ไม่มีผล (ตัวดักยังทำงาน) + WARNING 2 จุด · ข้อมูลของข้อถูกแปลงจริง
//   ตกบนโค้ดเดิม: ไม่มี ซ้อมใบ (ข้อทดสอบเดิมห่อ begin…rollback → SET LOCAL ใช้ได้ ไม่เห็นปัญหา)
// รัน: node tests/tools/migration-rehearsal.test.mjs   (ต้องมี docker + ฐานทดสอบเปิดอยู่ · ไม่แตะข้อมูลฐานทดสอบ)
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { ซ้อมใบ, อ่านความพร้อม, ข้อความผิดเต็ม } from "../../scripts/lib/migrationRehearsal.mjs";

let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n   ${String(เพิ่ม).slice(0, 900)}`}`); };
const ที่ = mkdtempSync(join(tmpdir(), "pms-rehearsal-"));
const ใบ = join(ที่, "migrations");
mkdirSync(ใบ);
for (const f of readdirSync("supabase/migrations").filter(f => f.endsWith(".sql"))) copyFileSync(join("supabase/migrations", f), join(ใบ, f));
writeFileSync(join(ใบ, "9999_zz_rehearsal_probe.sql"),
  "set local session_replication_role = replica;\nupdate public.zz_probe set v = v + 1;\nset local session_replication_role = origin;\n");
const ข้อมูล = `create table public.zz_probe (v int);
create table public.zz_log (at timestamptz default now());
create function public.zz_log_it() returns trigger language plpgsql as $$ begin insert into public.zz_log default values; return new; end $$;
create trigger zz_probe_log after update on public.zz_probe for each row execute function public.zz_log_it();
insert into public.zz_probe values (1);`;
// ── ข้อไม่นิ่ง deploy19 (11 พ.ย. 69): ลงใบ 0001 ไม่สำเร็จ ข้อความว่าง ──
//   เกณฑ์พร้อมเดิม "ถามได้ 3 วินาทีติดกัน" ผ่านได้ตอนยังเป็นเซิร์ฟเวอร์ชั่วคราวของ init · ข้อความผิดถูกกรองเหลือแค่บรรทัด ERROR
//   ตกบนโค้ดเดิม: ไม่มี อ่านความพร้อม / ข้อความผิดเต็ม
{
  const ชั่วคราว = "1||2026-11-11 07:00:00+00", จริงก = "1|*|2026-11-11 07:00:05+00", จริงข = "1|*|2026-11-11 07:00:09+00";
  ผล(!อ่านความพร้อม(ชั่วคราว, null).พร้อม && !อ่านความพร้อม(ชั่วคราว, "2026-11-11 07:00:00+00").พร้อม, "เซิร์ฟเวอร์ชั่วคราวของ init (ไม่ฟัง TCP) = ยังไม่พร้อม แม้ถามได้ติดกัน");
  ผล(!อ่านความพร้อม(จริงก, null).พร้อม, "ตัวจริงครั้งแรก = ยังไม่พร้อม (ต้องเห็นเวลาเริ่มเดิมซ้ำ)");
  ผล(อ่านความพร้อม(จริงก, อ่านความพร้อม(จริงก, null).เวลาเริ่ม).พร้อม, "ตัวจริง + เวลาเริ่มเท่าครั้งก่อน = พร้อม");
  ผล(!อ่านความพร้อม(จริงข, "2026-11-11 07:00:05+00").พร้อม, "เวลาเริ่มเปลี่ยน (รีสตาร์ต) = ยังไม่พร้อม");
  ผล(!อ่านความพร้อม("0|*|2026-11-11 07:00:05+00", "2026-11-11 07:00:05+00").พร้อม && !อ่านความพร้อม("", null).พร้อม, "ยังไม่มีบทบาท / ถามไม่ได้ = ยังไม่พร้อม");
  const ข้อความ = ข้อความผิดเต็ม({ status: 2, stderr: "psql: error: connection to server on socket \"/var/run/postgresql/.s.PGSQL.5432\" failed: FATAL:  the database system is shutting down" });
  ผล(/รหัสออก 2/.test(ข้อความ) && /shutting down/.test(ข้อความ), "ข้อความผิดที่ไม่มีคำว่า ERROR ยังแสดงครบ (ไม่ว่างแบบรอบ deploy19)", ข้อความ);
}
try {
  const ก่อนชื่อ = spawnSync("docker", ["ps", "-a", "--format", "{{.Names}}"], { encoding: "utf8" }).stdout;
  const r = ซ้อมใบ({ ใบ: "9999_zz_rehearsal_probe.sql", โฟลเดอร์ใบ: ใบ, ก่อนลงใบ: ข้อมูล,
    หลังลงใบ: "select (select v from public.zz_probe) || '|' || (select count(*) from public.zz_log);" });
  ผล(r.warnings.length === 2 && r.warnings.every(w => /SET LOCAL can only be used in transaction blocks/.test(w)), "ลงแบบ db push (ไม่ห่อ transaction): SET LOCAL ขึ้น WARNING 2 จุด", JSON.stringify(r));
  ผล(r.ผลตรวจ === "2|1", "ข้อมูลของข้อถูกแปลงจริง (v 1→2) · ตัวดักยังทำงาน (SET LOCAL ไม่มีผล = แบบเดียวกับฐานจริง)", r.ผลตรวจ);
  let โยน = "";
  try { ซ้อมใบ({ ใบ: "9999_zz_rehearsal_probe.sql", โฟลเดอร์ใบ: ใบ, ก่อนลงใบ: ข้อมูล, หลังลงใบ: "do $$ begin raise exception 'FAIL: ผลแปลงไม่ตรง'; end $$;" }); }
  catch (e) { โยน = String(e.message); }
  ผล(/ตรวจหลังลงใบ 9999_zz_rehearsal_probe\.sql ตก/.test(โยน) && /FAIL: ผลแปลงไม่ตรง/.test(โยน), "SQL ตรวจ raise = ซ้อมใบตก บอกใบ+เหตุ", โยน);
  โยน = "";
  try { ซ้อมใบ({ ใบ: "9998_ไม่มี.sql", โฟลเดอร์ใบ: ใบ }); } catch (e) { โยน = String(e.message); }
  ผล(/ไม่พบใบ 9998_ไม่มี\.sql/.test(โยน), "ไม่พบใบ = ตก (ไม่ผ่านเงียบ)", โยน);
  const หลังชื่อ = spawnSync("docker", ["ps", "-a", "--format", "{{.Names}}"], { encoding: "utf8" }).stdout;
  ผล(!/pms-rehearsal-/.test(หลังชื่อ.split("\n").filter(n => !ก่อนชื่อ.includes(n)).join("\n")), "คอนเทนเนอร์ซ้อมถูกลบทิ้งทุกครั้ง (รวมตอนตก)", หลังชื่อ);
} finally { rmSync(ที่, { recursive: true, force: true }); }
console.log(ตก ? `\n✗ ตก ${ตก} ข้อ` : "\nALL PASS");
process.exit(ตก ? 1 : 0);
