// ── ข้อทดสอบ: ซ้อมลงใบ 0286 (คำบนจอที่ฐานสร้าง รอบ 2) แบบ db push บนฐานแยกชั่วคราว (scripts/lib/migrationRehearsal.mjs) ─────────
//   b6 (คนรวมงาน) สั่ง 12 พ.ย. 69: ซ้อมลงใบแบบฐานจริง · บอส: แถวเก่า "อัปเดตอัตโนมัติ" ห้ามแก้ (แปลงตอนแสดงฝั่งเว็บ)
//   ก่อนลงใบ: ลูกค้าเป้าหมายเก่า 1 แถว มีงานที่ระบบติ๊กให้ doneBy = 'อัปเดตอัตโนมัติ' (วางแบบปิดตัวดัก)
//   หลังลงใบ: 1) แถวเก่ายังเป็นคำเดิม (ใบไม่แตะแถวข้อมูล) 2) ข้อทดสอบ supabase/tests/ui_terms_db.sql ทั้งไฟล์ผ่าน (11 ฟังก์ชันไม่มีคำห้าม ·
//     ผู้ทำโดยระบบ = 'ระบบทำให้') 3) _lead_tasks_five_steps ที่เรียกจริงคืน doneBy = 'ระบบทำให้'
//   ลงใบไม่มี WARNING · ตกบนโค้ดเดิม: ไม่มีใบ 0286 (ซ้อมใบโยน "ไม่พบใบ")
// รัน: node tests/tools/migration-0286.test.mjs   (ต้องมี docker + ฐานทดสอบเปิดอยู่ · ไม่แตะข้อมูลฐานทดสอบร่วม)
import { readFileSync, existsSync } from "node:fs";
import { ซ้อมใบ } from "../../scripts/lib/migrationRehearsal.mjs";

let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n   ${String(เพิ่ม).slice(0, 1500)}`}`); };
const ใบ = "0286_ui_terms_db_texts_2.sql";
ผล(existsSync(`supabase/migrations/${ใบ}`), `มีใบ ${ใบ}`);

const ก่อนลงใบ = `set session_replication_role = replica;
insert into public.dealers (code, name, province, region, status) values ('ZZR', 'ZZTEST ซ้อมใบ 0286', 'ตราด', 'ตะวันออก', 'active');
insert into public.leads (id, num_id, dealer_code, company, name, status, tasks)
  values ('#L-286', 286, 'ZZR', 'ZZTEST แถวเก่า', 'ZZTEST', 'WAITING',
    '[{"key":"collect","label":"เก็บข้อมูลลูกค้า","done":true,"doneAt":"1 พ.ย. 2569","doneBy":"อัปเดตอัตโนมัติ"}]'::jsonb);
set session_replication_role = origin;`;
// ui_terms_db.sql ห่อ begin…rollback เอง — ส่งทั้งไฟล์ต่อท้าย (ตก = raise exception → ซ้อมใบโยน)
const ตรวจคำ = readFileSync("supabase/tests/ui_terms_db.sql", "utf8");
const หลังลงใบ = `select 'แถวเก่า=' || (select tasks->0->>'doneBy' from public.leads where num_id = 286);
select 'ห้าขั้น=' || coalesce((select string_agg(distinct t->>'doneBy', ',') from jsonb_array_elements(
  public._lead_tasks_five_steps('[]'::jsonb, 'QUOTED', 4, '')) t where t->>'doneBy' is not null), '(ไม่มีงานที่ระบบติ๊ก)');
${ตรวจคำ}`;

try {
  const r = ซ้อมใบ({ ใบ, ก่อนลงใบ, หลังลงใบ });
  ผล(r.warnings.length === 0, "ลงใบแบบ db push ไม่มี WARNING", r.warnings.join("\n"));
  ผล(/แถวเก่า=อัปเดตอัตโนมัติ/.test(r.ผลตรวจ), "แถวเก่าในฐานยังเป็น 'อัปเดตอัตโนมัติ' (ใบไม่แตะแถวข้อมูล · บอสห้ามแก้แถวเก่า)", r.ผลตรวจ);
  ผล(/ALL PASS/.test(r.ผลตรวจ), "ui_terms_db.sql ผ่านหลังลงใบ (11 ฟังก์ชันไม่มีคำห้าม · ผู้ทำโดยระบบ = ระบบทำให้)", r.ผลตรวจ);
  const ห้า = /ห้าขั้น=([^\n]*)/.exec(r.ผลตรวจ)?.[1] ?? "";
  ผล(!/อัปเดตอัตโนมัติ/.test(ห้า), "_lead_tasks_five_steps ไม่คืน 'อัปเดตอัตโนมัติ' แล้ว", ห้า);
} catch (e) {
  ผล(false, "ซ้อมลงใบ 0286 + ตรวจหลังลงใบ", e.message);
}
console.log(ตก ? `\n✗ ตก ${ตก} ข้อ` : "\nALL PASS");
process.exit(ตก ? 1 : 0);
