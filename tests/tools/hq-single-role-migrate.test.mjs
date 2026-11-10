// ── ข้อทดสอบ: ใบ 0282 แปลงผู้ใช้ HQ บทบาทเดิมจริง (บอสสั่ง 5 พ.ย. 69 · คนรวมงานสั่ง 9 พ.ย. 69 "ผู้ใช้ที่เคยเป็น HQ_STAFF ทำได้ทุกอย่างหลังแปลง") ──
//   ในทรานแซกชันที่ย้อนกลับ: เอาข้อจำกัดบทบาทเดียวออกชั่วคราว → สร้างผู้ใช้ HQ_STAFF + HQ_MANAGEMENT (แบบฐานก่อนลงใบ)
//   → รัน "ไฟล์ใบ 0282 จริง" ทั้งไฟล์ (ใบรันซ้ำได้) → ผู้ใช้ทั้งสองเป็นสำนักงานใหญ่ · แผนกเดิมคงอยู่ · ทำได้ทุกอย่างของ HQ
//   (แก้ข้อมูลกลาง · ตีราคา · รับคำขอเป็นผู้รับผิดชอบ · แก้บทบาท/สถานะผู้ใช้อื่น) · ข้อจำกัดกลับมา · ดีลเลอร์ไม่ถูกแตะ
//   mutation (โฟลเดอร์แยก): PMS_HSR_MUTATE=no-convert (ตัดคำสั่งแปลงออกจากใบ) → ข้อทดสอบต้องตก
// รัน: node tests/tools/hq-single-role-migrate.test.mjs (ถือล็อกฐานทดสอบระหว่างรัน)
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { ขอล็อกฐานทดสอบ } from "../../scripts/lib/testDbLock.mjs";
import { อาร์กิวเมนต์psql, คอนเทนเนอร์ } from "../../scripts/lib/testDbGuard.mjs";
import { รอถ้าฐานไม่ว่าง } from "../../scripts/lib/testDbWait.mjs";
รอถ้าฐานไม่ว่าง("ข้อทดสอบแปลงผู้ใช้ HQ (ใบ 0282)");

let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n${String(เพิ่ม).slice(0, 1500)}`}`); };

let ใบ = readFileSync("supabase/migrations/0282_hq_single_role.sql", "utf8").replace(/\r\n/g, "\n");
ผล(/update public\.profiles set role = 'SUPER_ADMIN' where role in \('HQ_MANAGEMENT', 'HQ_STAFF'\);/.test(ใบ), "ใบ 0282 มีคำสั่งแปลงผู้ใช้ HQ เดิม");
if (process.env.PMS_HSR_MUTATE === "no-convert") ใบ = ใบ.replace(/update public\.profiles set role = 'SUPER_ADMIN' where role in \('HQ_MANAGEMENT', 'HQ_STAFF'\);/, "");

const sql = `
begin;
set local client_min_messages = warning;
alter table public.profiles drop constraint if exists profiles_hq_single_role;   -- จำลองฐานก่อนลงใบ (ย้อนกลับท้ายไฟล์)
insert into auth.users (id, email, instance_id, aud, role) values
  ('00000000-0000-4000-8000-000000000281', 'zzhsr-staff@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-000000000282', 'zzhsr-mgmt@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
insert into public.profiles (id, name, role, status, department) values
  ('00000000-0000-4000-8000-000000000281', 'ZZTEST อดีตเจ้าหน้าที่', 'HQ_STAFF', 'active', 'ฝ่ายขาย'),
  ('00000000-0000-4000-8000-000000000282', 'ZZTEST อดีตผู้บริหาร', 'HQ_MANAGEMENT', 'active', 'บริหาร')
  on conflict (id) do update set name = excluded.name, role = excluded.role, status = 'active', department = excluded.department, dealer_code = null;
create temp table ดีลเลอร์ก่อน as select id, role, dealer_code from public.profiles where role::text like 'DEALER%';
-- ── ใบ 0282 จริงทั้งไฟล์ ──
${ใบ}
-- ── ตรวจ ──
select 'บทบาท=' || string_agg(role::text || ':' || coalesce(department, ''), ',' order by name) from public.profiles
 where id in ('00000000-0000-4000-8000-000000000281', '00000000-0000-4000-8000-000000000282');
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-000000000281', 'role', 'authenticated',
  'user_role', (select role from public.profiles where id = '00000000-0000-4000-8000-000000000281'))::text, true);
select 'สิทธิ์=' || public.is_hq() || '|' || public.can_write_master() || '|' || public.can_price_quotes();
-- อดีตเจ้าหน้าที่แก้บทบาท/สถานะผู้ใช้อื่นได้ (ตัวดักสิทธิ์) · รับคำขอเป็นผู้รับผิดชอบได้ (ตรวจผู้รับผิดชอบด้วยบทบาท HQ)
update public.profiles set status = 'inactive' where id = '00000000-0000-4000-8000-000000000282';
select 'ปิดผู้ใช้อื่น=' || (select status from public.profiles where id = '00000000-0000-4000-8000-000000000282');
select 'ผู้รับผิดชอบ=' || exists (select 1 from public.profiles where id = '00000000-0000-4000-8000-000000000281' and role = 'SUPER_ADMIN');
select 'ข้อจำกัด=' || exists (select 1 from pg_constraint where conname = 'profiles_hq_single_role');
select 'ดีลเลอร์คงเดิม=' || not exists (select 1 from ดีลเลอร์ก่อน k join public.profiles p on p.id = k.id where p.role <> k.role or p.dealer_code is distinct from k.dealer_code);
rollback;
`;
const ล็อก = ขอล็อกฐานทดสอบ("ข้อทดสอบแปลงผู้ใช้ HQ (ใบ 0282)", { รอนาที: 30 });
const r = spawnSync("docker", [...อาร์กิวเมนต์psql(คอนเทนเนอร์), "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8" });
ล็อก.release();
const ออก = (r.stdout ?? "") + (r.stderr ?? "");
const ค่า = k => new RegExp(`^${k}=(.*)$`, "m").exec(ออก)?.[1];
ผล(r.status === 0, "รันใบ 0282 จริงบนฐานที่มีผู้ใช้บทบาทเดิมได้ (รันซ้ำได้)", ออก);
ผล(ค่า("บทบาท") === "SUPER_ADMIN:ฝ่ายขาย,SUPER_ADMIN:บริหาร", "อดีตผู้บริหาร + อดีตเจ้าหน้าที่ = สำนักงานใหญ่ · แผนกเดิมคงอยู่", ออก);
ผล(ค่า("สิทธิ์") === "true|true|true", "อดีตเจ้าหน้าที่ทำได้ทุกอย่างของ HQ (is_hq · แก้ข้อมูลกลาง · ตีราคา)", ออก);
ผล(ค่า("ปิดผู้ใช้อื่น") === "inactive", "อดีตเจ้าหน้าที่แก้สถานะผู้ใช้อื่นได้", ออก);
ผล(ค่า("ผู้รับผิดชอบ") === "true", "อดีตเจ้าหน้าที่เป็นผู้รับผิดชอบคำขอได้ (บทบาท HQ)", ออก);
ผล(ค่า("ข้อจำกัด") === "true", "ข้อจำกัดบทบาทเดียวกลับมาหลังลงใบ", ออก);
ผล(ค่า("ดีลเลอร์คงเดิม") === "true", "บัญชีดีลเลอร์ไม่ถูกแตะ", ออก);
console.log(ตก ? `FAIL ${ตก}` : "ALL PASS");
process.exit(ตก ? 1 : 0);
