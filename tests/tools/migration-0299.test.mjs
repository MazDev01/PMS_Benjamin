// ── ข้อทดสอบ: ซ้อมลงใบ 0299 (ลบผู้สนใจทีละราย = ลบแจ้งเตือนของรายนั้น + ล้างกำพร้าครั้งเดียว) แบบ db push บนฐานแยกชั่วคราว ──
//   ผู้ตรวจ scn-prospect 23 พ.ย. 69: ลบผู้สนใจรายเดียว (ถังขยะในแผง) แจ้งเตือน prospect_followup_due ของรายนั้นค้าง
//   ก่อนลงใบ: ผู้สนใจ 2 ราย (901 จะถูกลบหลังลงใบ · 902 คงอยู่) แจ้งเตือน 2 ชนิด/ราย + อีเมลค้างส่ง/ส่งแล้ว
//     · id 903 ถูกลบไปแล้วก่อนใบนี้ (กำพร้า 1 แถว + อีเมลค้าง 1) · แจ้งเตือนชนิดอื่นที่ dedupe_key มีเลข 901 (ห้ามแตะ)
//   หลังลงใบ: กำพร้าของ 903 หาย · ลบ 901 แบบหน้าจอ (ลบแถวตรง) → แจ้งเตือน 2 + อีเมลค้างของ 901 หาย · ที่ส่งแล้วคง · 902 คงครบ · ชนิดอื่นคง
//   ลงใบไม่มี WARNING · ตกบนโค้ดเดิม: ไม่มีใบ 0299 (ซ้อมใบโยน "ไม่พบใบ")
// รัน: node tests/tools/migration-0299.test.mjs   (ต้องมี docker + ฐานทดสอบเปิดอยู่ · ไม่แตะข้อมูลฐานทดสอบร่วม)
import { existsSync } from "node:fs";
import { ซ้อมใบ } from "../../scripts/lib/migrationRehearsal.mjs";

let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n   ${String(เพิ่ม).slice(0, 1500)}`}`); };
const ใบ = "0299_prospect_delete_notifications.sql";
ผล(existsSync(`supabase/migrations/${ใบ}`), `มีใบ ${ใบ}`);

const ก่อนลงใบ = `set session_replication_role = replica;
insert into public.dealer_prospects (id, name, phone, status) values
  (901, 'ZZTEST ผู้สนใจที่จะถูกลบ', '000-000-2991', 'new'), (902, 'ZZTEST ผู้สนใจที่คงอยู่', '000-000-2992', 'new');
insert into public.notifications (kind, audience, title, body, href, dedupe_key) values
  ('prospect_followup_due', 'hq', 'ZZTEST', 'ZZTEST 901', '/hq/prospects?open=901', 'prospect_followup_due:901:2026-11-23'),
  ('prospect_idle', 'hq', 'ZZTEST', 'ZZTEST 901', '/hq/prospects?open=901', 'prospect_idle:901:2026-11-01'),
  ('prospect_followup_due', 'hq', 'ZZTEST', 'ZZTEST 902', '/hq/prospects?open=902', 'prospect_followup_due:902:2026-11-23'),
  ('prospect_idle', 'hq', 'ZZTEST', 'ZZTEST 902', '/hq/prospects?open=902', 'prospect_idle:902:2026-11-01'),
  ('prospect_followup_due', 'hq', 'ZZTEST', 'ZZTEST กำพร้า', '/hq/prospects?open=903', 'prospect_followup_due:903:2026-11-23'),
  ('won_reverted_by_dealer', 'hq', 'ZZTEST', 'ZZTEST ชนิดอื่น', '/hq', 'won_reverted_by_dealer:901:zz');
insert into public.email_outbox (kind, to_email, subject, body, ref_table, ref_id, dedupe_key, status) values
  ('prospect_followup_due', 'zz@example.test', 'ZZTEST', 'ZZTEST', 'dealer_prospects', '901', 'zz-901-ค้าง', 'pending'),
  ('prospect_idle', 'zz@example.test', 'ZZTEST', 'ZZTEST', 'dealer_prospects', '901', 'zz-901-ส่งแล้ว', 'sent'),
  ('prospect_followup_due', 'zz@example.test', 'ZZTEST', 'ZZTEST', 'dealer_prospects', '902', 'zz-902-ค้าง', 'pending'),
  ('prospect_idle', 'zz@example.test', 'ZZTEST', 'ZZTEST', 'dealer_prospects', '903', 'zz-903-ค้าง', 'pending');
set session_replication_role = origin;
create table public.zz_ก่อน as select
  (select count(*) from public.notifications where body like 'ZZTEST%') as แจ้ง,
  (select count(*) from public.email_outbox where dedupe_key like 'zz-%') as อีเมล;`;

const หลังลงใบ = `select 'ก่อน=' || (select แจ้ง || '|' || อีเมล from public.zz_ก่อน);
select 'หลังล้าง=' || (select string_agg(dedupe_key, ',' order by dedupe_key) from public.notifications where body like 'ZZTEST%');
-- ลบรายเดียวแบบหน้าจอ (ลบแถวตรง · ตัวกระตุ้นเปิด)
select set_config('pms.audit_skip', 'on', false);
delete from public.dealer_prospects where id = 901;
select 'หลังลบแจ้ง=' || (select string_agg(dedupe_key, ',' order by dedupe_key) from public.notifications where body like 'ZZTEST%');
select 'หลังลบอีเมล=' || (select string_agg(dedupe_key, ',' order by dedupe_key) from public.email_outbox where dedupe_key like 'zz-%');
select 'ตัวกระตุ้น=' || (select count(*) from pg_trigger where tgname = 'prospect_deleted_cleanup' and tgrelid = 'public.dealer_prospects'::regclass)
  || '|' || has_function_privilege('authenticated', 'public._prospect_deleted_cleanup()', 'execute')
  || '|' || has_function_privilege('anon', 'public._prospect_deleted_cleanup()', 'execute');`;

try {
  const r = ซ้อมใบ({ ใบ, ก่อนลงใบ, หลังลงใบ });
  const ค่า = (k) => new RegExp(`(?:^|NOTICE:\\s+)${k}=(.*)$`, "m").exec(r.ผลตรวจ)?.[1]?.trim() ?? "(ไม่มีบรรทัด)";
  ผล(r.warnings.length === 0, "ลงใบแบบ db push ไม่มี WARNING", r.warnings.join("\n"));
  ผล(ค่า("ก่อน") === "6|4", "ก่อนลงใบ: แจ้งเตือนตัวอย่าง 6 แถว · อีเมล 4 แถว", ค่า("ก่อน"));
  ผล(ค่า("หลังล้าง") === "prospect_followup_due:901:2026-11-23,prospect_followup_due:902:2026-11-23,prospect_idle:901:2026-11-01,prospect_idle:902:2026-11-01,won_reverted_by_dealer:901:zz",
    "ลงใบ: แจ้งเตือนกำพร้าของ 903 หาย (6 → 5) · ของรายที่ยังอยู่คงครบ", ค่า("หลังล้าง"));
  ผล(ค่า("หลังลบแจ้ง") === "prospect_followup_due:902:2026-11-23,prospect_idle:902:2026-11-01,won_reverted_by_dealer:901:zz",
    "ลบ 901 รายเดียว: แจ้งเตือนชนิดผู้สนใจของ 901 หาย 2 แถว (5 → 3) · ของ 902 + ชนิดอื่นคง", ค่า("หลังลบแจ้ง"));
  ผล(ค่า("หลังลบอีเมล") === "zz-901-ส่งแล้ว,zz-902-ค้าง",
    "อีเมล: ค้างส่งของ 901 + กำพร้า 903 หาย · ที่ส่งแล้วคง (ประวัติ) · ของ 902 คง (4 → 2)", ค่า("หลังลบอีเมล"));
  ผล(ค่า("ตัวกระตุ้น") === "1|false|false", "มีตัวกระตุ้นหลังลบ 1 ตัว · ผู้ใช้/คนนอกเรียกฟังก์ชันตรงไม่ได้", ค่า("ตัวกระตุ้น"));
} catch (e) {
  ผล(false, "ซ้อมลงใบ 0299 + ตรวจ", e.message);
}
console.log(ตก ? `\n✗ ตก ${ตก} ข้อ` : "\nALL PASS");
process.exit(ตก ? 1 : 0);
