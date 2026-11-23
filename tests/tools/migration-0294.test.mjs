// ── ข้อทดสอบ: ซ้อมลงใบ 0294 (ยกเลิกชุดนำเข้าผู้สนใจ = ลบแจ้งเตือนของรายในชุด + ล้างแจ้งเตือนกำพร้าครั้งเดียว) แบบ db push บนฐานแยกชั่วคราว ──
//   คนรวมงานสั่ง 23 พ.ย. 69 "ใบแปลงข้อมูลจริง ข้อทดสอบนับก่อน/หลัง + ตารางสำรองหรือเหตุผล" (เหตุผลไม่มีตารางสำรองอยู่หัวใบ 0294)
//   ก่อนลงใบ: ผู้สนใจที่ยังอยู่ 1 ราย (แจ้งเตือน 2 ชนิด + อีเมลค้างส่ง) · id ที่ถูกลบไปแล้ว 2 ค่า (แจ้งเตือนกำพร้า 3 แถว · อีเมลค้างส่ง 1 · ล้มเหลว 1 · ส่งแล้ว 1)
//     · แจ้งเตือนชนิดอื่นที่ dedupe_key บังเอิญมีเลขเดียวกัน 1 แถว (ห้ามแตะ)
//   หลังลงใบ: กำพร้าหายครบ (3 + อีเมล 2) · ของรายที่ยังอยู่คงครบ · อีเมลที่ส่งแล้วคง (ประวัติ) · ชนิดอื่นคง · คำสั่งยกเลิกชุดลบแจ้งเตือนในตัว
//   ลงใบไม่มี WARNING · ตกบนโค้ดเดิม: ไม่มีใบ 0294 (ซ้อมใบโยน "ไม่พบใบ")
// รัน: node tests/tools/migration-0294.test.mjs   (ต้องมี docker + ฐานทดสอบเปิดอยู่ · ไม่แตะข้อมูลฐานทดสอบร่วม)
import { existsSync } from "node:fs";
import { ซ้อมใบ } from "../../scripts/lib/migrationRehearsal.mjs";

let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n   ${String(เพิ่ม).slice(0, 1500)}`}`); };
const ใบ = "0294_prospect_import_cancel_notifications.sql";
ผล(existsSync(`supabase/migrations/${ใบ}`), `มีใบ ${ใบ}`);

// id 901 = ยังอยู่ · 902/903 = ถูกลบไปแล้ว (ไม่มีแถว)
const ก่อนลงใบ = `set session_replication_role = replica;
insert into public.dealer_prospects (id, name, phone, status) values (901, 'ZZTEST ผู้สนใจที่ยังอยู่', '000-000-2941', 'new');
insert into public.notifications (kind, audience, title, body, href, dedupe_key) values
  ('prospect_followup_due', 'hq', 'ZZTEST', 'ZZTEST อยู่', '/hq/prospects?open=901', 'prospect_followup_due:901:2026-11-23'),
  ('prospect_idle', 'hq', 'ZZTEST', 'ZZTEST อยู่', '/hq/prospects?open=901', 'prospect_idle:901:2026-11-01'),
  ('prospect_followup_due', 'hq', 'ZZTEST', 'ZZTEST กำพร้า', '/hq/prospects?open=902', 'prospect_followup_due:902:2026-11-23'),
  ('prospect_idle', 'hq', 'ZZTEST', 'ZZTEST กำพร้า', '/hq/prospects?open=902', 'prospect_idle:902:2026-11-01'),
  ('prospect_idle', 'hq', 'ZZTEST', 'ZZTEST กำพร้า', '/hq/prospects?open=903', 'prospect_idle:903:2026-11-01'),
  ('won_reverted_by_dealer', 'hq', 'ZZTEST', 'ZZTEST ชนิดอื่น', '/hq', 'won_reverted_by_dealer:902:zz');
insert into public.email_outbox (kind, to_email, subject, body, ref_table, ref_id, dedupe_key, status) values
  ('prospect_followup_due', 'zz@example.test', 'ZZTEST', 'ZZTEST', 'dealer_prospects', '901', 'zz-อยู่-ค้าง', 'pending'),
  ('prospect_followup_due', 'zz@example.test', 'ZZTEST', 'ZZTEST', 'dealer_prospects', '902', 'zz-กำพร้า-ค้าง', 'pending'),
  ('prospect_idle', 'zz@example.test', 'ZZTEST', 'ZZTEST', 'dealer_prospects', '903', 'zz-กำพร้า-ล้มเหลว', 'failed'),
  ('prospect_idle', 'zz@example.test', 'ZZTEST', 'ZZTEST', 'dealer_prospects', '902', 'zz-กำพร้า-ส่งแล้ว', 'sent');
set session_replication_role = origin;
-- นับก่อนลงใบเก็บไว้ในตารางชั่วคราวของฐานซ้อม (ผลของขั้นนี้ไม่ส่งกลับ) → อ่านหลังลงใบ
create table public.zz_ก่อน as select
  (select count(*) from public.notifications where body like 'ZZTEST%') as แจ้ง,
  (select count(*) from public.email_outbox where dedupe_key like 'zz-%') as อีเมล;`;

const หลังลงใบ = `select 'ก่อน=' || (select แจ้ง || '|' || อีเมล from public.zz_ก่อน);
select 'หลังแจ้ง=' || (select string_agg(dedupe_key, ',' order by dedupe_key) from public.notifications where body like 'ZZTEST%');
select 'หลังอีเมล=' || (select string_agg(dedupe_key, ',' order by dedupe_key) from public.email_outbox where dedupe_key like 'zz-%');
select 'ผู้สนใจ=' || (select count(*) from public.dealer_prospects where id = 901);
select 'คำสั่งยกเลิก=' || (pg_get_functiondef('public.hq_prospects_import_cancel(bigint)'::regprocedure) like '%delete from notifications%')
  || '|' || has_function_privilege('authenticated', 'public.hq_prospects_import_cancel(bigint)', 'execute')
  || '|' || has_function_privilege('anon', 'public.hq_prospects_import_cancel(bigint)', 'execute');`;

try {
  const r = ซ้อมใบ({ ใบ, ก่อนลงใบ, หลังลงใบ });
  const ค่า = (k) => new RegExp(`(?:^|NOTICE:\\s+)${k}=(.*)$`, "m").exec(r.ผลตรวจ)?.[1]?.trim() ?? "(ไม่มีบรรทัด)";
  ผล(r.warnings.length === 0, "ลงใบแบบ db push ไม่มี WARNING", r.warnings.join("\n"));
  ผล(ค่า("ก่อน") === "6|4", "ก่อนลงใบ: แจ้งเตือนตัวอย่าง 6 แถว · อีเมล 4 แถว", ค่า("ก่อน"));
  ผล(ค่า("หลังแจ้ง") === "prospect_followup_due:901:2026-11-23,prospect_idle:901:2026-11-01,won_reverted_by_dealer:902:zz",
    "หลังลงใบ: แจ้งเตือนกำพร้า 3 แถวหาย · ของรายที่ยังอยู่ 2 + ชนิดอื่น 1 คงเดิม (6 → 3)", ค่า("หลังแจ้ง"));
  ผล(ค่า("หลังอีเมล") === "zz-กำพร้า-ส่งแล้ว,zz-อยู่-ค้าง",
    "หลังลงใบ: อีเมลค้างส่ง/ล้มเหลวของรายที่ไม่มีแล้วหาย · ที่ส่งแล้ว + ของรายที่ยังอยู่คง (4 → 2)", ค่า("หลังอีเมล"));
  ผล(ค่า("ผู้สนใจ") === "1", "หลังลงใบ: ผู้สนใจที่ยังอยู่ไม่ถูกแตะ", ค่า("ผู้สนใจ"));
  ผล(ค่า("คำสั่งยกเลิก") === "true|true|false", "คำสั่งยกเลิกชุดลบแจ้งเตือนในตัว · สิทธิ์เดิม (authenticated ได้ · anon ไม่ได้)", ค่า("คำสั่งยกเลิก"));
} catch (e) {
  ผล(false, "ซ้อมลงใบ 0294 + ตรวจ", e.message);
}
console.log(ตก ? `\n✗ ตก ${ตก} ข้อ` : "\nALL PASS");
process.exit(ตก ? 1 : 0);
