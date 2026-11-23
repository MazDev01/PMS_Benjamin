// ── ข้อทดสอบ: ซ้อมลงใบ 0295 (ดึงชีตอัตโนมัติ + กุญแจแถว Facebook) แบบ db push บนฐานแยกชั่วคราว ──
//   คนรวมงานสั่ง 23 พ.ย. 69 "ใบแปลงข้อมูลจริง ข้อทดสอบนับก่อน/หลัง + ตารางสำรองหรือเหตุผล" (เหตุผลไม่มีตารางสำรองอยู่หัวใบ 0295)
//   ก่อนลงใบ: ชุดที่ยังไม่ยกเลิก (Facebook 2 ราย · ไฟล์ทีม 1 ราย) · ชุดที่ยกเลิกแล้ว (Facebook 1 ราย ค้าง) · ผู้สนใจเพิ่มด้วยมือ 1 ราย
//   หลังลงใบ: กุญแจแถวเฉพาะ Facebook ของชุดที่ยังไม่ยกเลิก (0 → 2) · กุญแจตรงรูปแบบหน้าเว็บ · ผู้สนใจไม่ถูกแก้/ลบ (นับ + ลายเซ็นแถวเท่าเดิม)
//     · แถวตั้งค่าดึงอัตโนมัติ 1 แถว (ปิด) · แจ้งเตือน 2 ชนิดในตารางกลาง · คำสั่งของระบบ = service_role เท่านั้น · คำสั่งนำเข้า/ยกเลิก สิทธิ์เดิม
//   ลงใบไม่มี WARNING · ตกบนโค้ดเดิม: ไม่มีใบ 0295 (ซ้อมใบโยน "ไม่พบใบ")
// รัน: node tests/tools/migration-0295.test.mjs   (ต้องมี docker + ฐานทดสอบเปิดอยู่ · ไม่แตะข้อมูลฐานทดสอบร่วม)
import { existsSync } from "node:fs";
import { ซ้อมใบ } from "../../scripts/lib/migrationRehearsal.mjs";

let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n   ${String(เพิ่ม).slice(0, 1500)}`}`); };
const ใบ = "0295_prospect_sheet_auto_import.sql";
ผล(existsSync(`supabase/migrations/${ใบ}`), `มีใบ ${ใบ}`);

const ก่อนลงใบ = `set session_replication_role = replica;
insert into public.prospect_import_batches (id, file_name, row_count, inserted, created_by) overriding system value values
  (951, 'ZZTEST Google Sheets', 2, 2, 'ZZ'), (952, 'ZZTEST ไฟล์ทีม', 1, 1, 'ZZ'), (953, 'ZZTEST ยกเลิกแล้ว', 1, 1, 'ZZ');
update public.prospect_import_batches set cancelled_at = now(), cancelled_by = 'ZZ' where id = 953;
insert into public.dealer_prospects (id, name, phone, status, channel, import_batch_id, created_at) values
  (961, 'ZZTEST ก', '000-000-2951', 'new', 'Facebook', 951, '2026-11-20T03:15:00Z'),
  (962, 'ZZTEST ข', '0000029', 'new', 'Facebook', 951, '2026-11-21T02:00:00Z'),
  (963, 'ZZTEST ทีม', '000-000-2953', 'contacted', 'LINE OA', 952, '2026-11-01T02:00:00Z'),
  (964, 'ZZTEST ค้างชุดยกเลิก', '000-000-2954', 'new', 'Facebook', 953, '2026-11-02T02:00:00Z'),
  (965, 'ZZTEST มือ', '000-000-2955', 'new', 'Facebook', null, '2026-11-03T02:00:00Z');
set session_replication_role = origin;
-- นับก่อนลงใบเก็บในตารางชั่วคราวของฐานซ้อม (ผลของขั้นนี้ไม่ส่งกลับ) → อ่านหลังลงใบ
create table public.zz_ก่อน as select
  (select count(*) from public.dealer_prospects) as ราย,
  (select md5(string_agg(id || name || coalesce(phone, '') || status || created_at, ',' order by id)) from public.dealer_prospects) as ลาย,
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'prospect_import_keys') as มีตารางกุญแจ,
  (select count(*) from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'S' and (case when c.relkind = 'S' then has_sequence_privilege('anon', c.oid, 'USAGE') end)) as ตัวนับanon;`;

const สิทธิ์ = (บทบาท, fn) => `has_function_privilege('${บทบาท}', 'public.${fn}', 'execute')`;
const หลังลงใบ = `select 'ก่อน=' || (select ราย || '|' || มีตารางกุญแจ from public.zz_ก่อน);
select 'ตัวนับก่อน=' || (select ตัวนับanon from public.zz_ก่อน);
select 'ตัวนับ=' || (select count(*) from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'S'
    and ((case when c.relkind = 'S' then has_sequence_privilege('anon', c.oid, 'USAGE') end) or (case when c.relkind = 'S' then has_sequence_privilege('anon', c.oid, 'SELECT') end) or (case when c.relkind = 'S' then has_sequence_privilege('anon', c.oid, 'UPDATE') end)))
  || '|' || has_sequence_privilege('authenticated', 'public.hqd_move_0287_id_seq', 'USAGE')
  || '|' || has_sequence_privilege('authenticated', 'public.dealer_prospects_id_seq', 'USAGE');
select 'ลายคงเดิม=' || ((select ลาย from public.zz_ก่อน) = (select md5(string_agg(id || name || coalesce(phone, '') || status || created_at, ',' order by id)) from public.dealer_prospects));
select 'หลังราย=' || (select count(*) from public.dealer_prospects);
select 'กุญแจ=' || (select string_agg(key || '@' || batch_id, ',' order by key) from public.prospect_import_keys);
select 'ตั้งค่า=' || (select count(*) || '|' || bool_or(enabled) from public.prospect_sheet_sync);
select 'แจ้ง=' || (select string_agg(kind || ':' || flow_row || ':' || bell || ':' || email, ',' order by kind) from public.notification_kinds where kind like 'prospect_sheet_%');
select 'ระบบ=' || (${สิทธิ์("service_role", "_prospect_sheet_claim(boolean)")} and ${สิทธิ์("service_role", "_prospect_sheet_import(text, jsonb, text, boolean)")}
  and ${สิทธิ์("service_role", "_prospect_sheet_finish(boolean, text, bigint, boolean)")})
  || '|' || (${สิทธิ์("authenticated", "_prospect_sheet_claim(boolean)")} or ${สิทธิ์("authenticated", "_prospect_sheet_import(text, jsonb, text, boolean)")}
  or ${สิทธิ์("anon", "_prospect_sheet_finish(boolean, text, bigint, boolean)")} or ${สิทธิ์("authenticated", "_cron_prospect_sheet()")} or ${สิทธิ์("anon", "_cron_prospect_sheet()")});
select 'ผู้ใช้=' || (${สิทธิ์("authenticated", "hq_prospects_import(text, jsonb)")} and ${สิทธิ์("authenticated", "hq_prospects_import_cancel(bigint)")}
  and ${สิทธิ์("authenticated", "hq_prospect_sheet_sync()")} and ${สิทธิ์("authenticated", "hq_prospect_sheet_sync_set(text, boolean)")} and ${สิทธิ์("authenticated", "hq_prospect_import_keys()")})
  || '|' || (${สิทธิ์("anon", "hq_prospects_import(text, jsonb)")} or ${สิทธิ์("anon", "hq_prospect_sheet_sync_set(text, boolean)")} or ${สิทธิ์("anon", "hq_prospect_import_keys()")});`;

try {
  const r = ซ้อมใบ({ ใบ, ก่อนลงใบ, หลังลงใบ });
  const ค่า = (k) => new RegExp(`(?:^|NOTICE:\\s+)${k}=(.*)$`, "m").exec(r.ผลตรวจ)?.[1]?.trim() ?? "(ไม่มีบรรทัด)";
  ผล(r.warnings.length === 0, "ลงใบแบบ db push ไม่มี WARNING", r.warnings.join("\n"));
  ผล(ค่า("ก่อน") === "5|0", "ก่อนลงใบ: ผู้สนใจ 5 ราย · ยังไม่มีตารางกุญแจแถว", ค่า("ก่อน"));
  ผล(Number(ค่า("ตัวนับก่อน")) > 0, "ก่อนลงใบ: มีตัวนับเลขที่ anon ใช้ได้ (ค่าตั้งต้นของสคีมา)", ค่า("ตัวนับก่อน"));
  ผล(ค่า("ตัวนับ") === "0|false|true", "หลังลงใบ: ตัวนับเลขทุกตัว anon ใช้ไม่ได้ · hqd_move_0287_id_seq ผู้ใช้ใช้ไม่ได้ · ตัวนับของตารางที่หน้าเว็บเขียนตรงคงเดิม", ค่า("ตัวนับ"));
  ผล(ค่า("หลังราย") === "5" && ค่า("ลายคงเดิม") === "true", "หลังลงใบ: ผู้สนใจ 5 ราย ไม่ถูกแก้/ลบ (ลายเซ็นแถวเท่าเดิม)", `${ค่า("หลังราย")} ${ค่า("ลายคงเดิม")}`);
  ผล(ค่า("กุญแจ") === "ZZTEST ก|0000002951|2026-11-20T10:15:00@951,ZZTEST ข|0000029|2026-11-21T09:00:00@951",
    "หลังลงใบ: กุญแจแถว 0 → 2 เฉพาะ Facebook ของชุดที่ยังไม่ยกเลิก (ไม่รวมไฟล์ทีม/ชุดยกเลิก/เพิ่มมือ) · รูปแบบ ชื่อ|ตัวเลข|เวลาไทย", ค่า("กุญแจ"));
  ผล(ค่า("ตั้งค่า") === "1|false", "แถวตั้งค่าดึงอัตโนมัติ 1 แถว เริ่มที่ปิด", ค่า("ตั้งค่า"));
  ผล(ค่า("แจ้ง") === "prospect_sheet_failed:H10:true:false,prospect_sheet_imported:H10:true:false", "แจ้งเตือน 2 ชนิด (FLOW H10 · กระดิ่ง · ไม่มีอีเมล)", ค่า("แจ้ง"));
  ผล(ค่า("ระบบ") === "true|false", "คำสั่งของระบบ/ตัวตั้งเวลา = service_role เท่านั้น (ผู้ใช้/anon เรียกไม่ได้)", ค่า("ระบบ"));
  ผล(ค่า("ผู้ใช้") === "true|false", "คำสั่งของหน้าเว็บ = authenticated (ฐานตรวจสิทธิ์นำเข้า) · anon ไม่ได้", ค่า("ผู้ใช้"));
} catch (e) {
  ผล(false, "ซ้อมลงใบ 0295 + ตรวจ", e.message);
}
console.log(ตก ? `\n✗ ตก ${ตก} ข้อ` : "\nALL PASS");
process.exit(ตก ? 1 : 0);
