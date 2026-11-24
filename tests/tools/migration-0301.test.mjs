// ── ข้อทดสอบ: ซ้อมลงใบ 0301 (เหตุผลปิดการขายไม่สำเร็จ/ลูกค้าปฏิเสธ = รายการกลาง lead_lost_reason) แบบ db push บนฐานแยกชั่วคราว ──
//   บอสตัดสิน 23 พ.ย. 69 ข้อ 14 · คนรวมงานสั่ง "ใบแปลงข้อมูลจริง ข้อทดสอบนับก่อน/หลัง + ตารางสำรอง"
//   ก่อนลงใบ: HQ ตั้งรายการเดิม (hq_sales_journey.lost) = 3 ชื่อเดิม (เอา "ลูกค้าไม่ตอบสนอง" ออก) + "ทำเลไกล" (ตั้งเพิ่ม) + "อื่นๆ (ระบุเอง)"
//     ข้อมูล: ลีดปิดไม่สำเร็จ 4 แถว (ชื่อตรง · ชื่อตรงแต่ช่องว่างต่าง · "อื่นๆ (ระบุเอง): ไปซื้อที่อื่น" · ข้อความเอง) · ลีดไม่มีเหตุผล 1
//     ใบเสนอราคาปฏิเสธ 2 (ชื่อที่ HQ ตั้งเพิ่ม · ข้อความเอง) · คำขอราคาปิด 1 (ชื่อตรง)
//   หลังลงใบ: รายการ 6 ตัว (ลูกค้าไม่ตอบสนอง ซ่อน · ทำเลไกล r_… · อื่น ๆ (ระบุ) ท้าย) · ทุกแถวเป็นรหัส/other:ข้อความเดิม
//     ตารางสำรองเก็บค่าเดิมครบ 7 แถว · แถวว่างไม่แตะ · เขียนใหม่ด้วยชื่อ/ข้อความ = ตัวกระตุ้นจัดเป็นรหัสให้ · ลบตัวที่มีข้อมูลใช้ไม่ได้
//     ป้ายประวัติคำขอ = ชื่อ · สิทธิ์: ตัวจัดค่า/ตัวกระตุ้น ผู้ใช้เรียกตรงไม่ได้ · ตารางสำรองผู้ใช้อ่านไม่ได้
//   ลงใบไม่มี WARNING · ตกบนโค้ดเดิม: ไม่มีใบ 0301 (ซ้อมใบโยน "ไม่พบใบ")
// รัน: node tests/tools/migration-0301.test.mjs   (ต้องมี docker + ฐานทดสอบเปิดอยู่ · ไม่แตะข้อมูลฐานทดสอบร่วม)
import { existsSync } from "node:fs";
import { ซ้อมใบ } from "../../scripts/lib/migrationRehearsal.mjs";

let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n   ${String(เพิ่ม).slice(0, 1500)}`}`); };
const ใบ = "0301_lead_lost_reason_options.sql";
ผล(existsSync(`supabase/migrations/${ใบ}`), `มีใบ ${ใบ}`);

const ก่อนลงใบ = `set session_replication_role = replica;
insert into public.hq_sales_journey (id, lost) values (1, array['ราคาสูงเกินงบประมาณ', 'คู่แข่งให้ข้อเสนอดีกว่า', 'งบประมาณไม่พร้อม', 'ทำเลไกล', 'อื่นๆ (ระบุเอง)'])
  on conflict (id) do update set lost = excluded.lost;
insert into public.leads (id, num_id, dealer_code, company, name, phone, status, lost_reason) values
  ('#L-ZZ1', 9901, 'RYG', 'ZZ1', 'ZZ1', '000-000-4111', 'CANCELLED', 'ราคาสูงเกินงบประมาณ'),
  ('#L-ZZ2', 9902, 'RYG', 'ZZ2', 'ZZ2', '000-000-4112', 'CANCELLED', 'งบประมาณ  ไม่พร้อม'),
  ('#L-ZZ3', 9903, 'RYG', 'ZZ3', 'ZZ3', '000-000-4113', 'CANCELLED', 'อื่นๆ (ระบุเอง): ไปซื้อที่อื่น'),
  ('#L-ZZ4', 9904, 'RYG', 'ZZ4', 'ZZ4', '000-000-4114', 'CANCELLED', 'ลูกค้าเลื่อนโครงการ'),
  ('#L-ZZ5', 9905, 'RYG', 'ZZ5', 'ZZ5', '000-000-4115', 'BULLET', null);
insert into public.quotations (id, dealer_code, customer, status, total_value, line_items, vat_percent, lost_reason) values
  ('ZZ-Q1', 'RYG', 'ZZ1', 'lost', 0, '[]', 7, 'ทำเลไกล'),
  ('ZZ-Q2', 'RYG', 'ZZ2', 'lost', 0, '[]', 7, 'ราคาสูงกว่าคู่แข่ง');
insert into public.quote_requests (id, request_no, dealer_code, lead_num_id, product, status, due_at, lost_reason) values
  (99001, 'RQ-ZZ-1', 'RYG', 9901, 'โกดัง', 'lost', now(), 'คู่แข่งให้ข้อเสนอดีกว่า');
set session_replication_role = origin;
create table public.zz_ก่อน as select
  (select count(*) from public.leads where id like '#L-ZZ%' and lost_reason is not null) as ลีด,
  (select count(*) from public.quotations where id like 'ZZ-Q%' and lost_reason is not null) as ใบ,
  (select count(*) from public.quote_requests where id = 99001 and lost_reason is not null) as คำขอ;`;

const หลังลงใบ = `select 'ก่อน=' || (select ลีด || '|' || ใบ || '|' || คำขอ from public.zz_ก่อน);
select 'รายการ=' || string_agg(code || ':' || label || case when hidden then ':ซ่อน' else '' end || case when free_text then ':ระบุ' else '' end, ',' order by sort, code)
  from public.option_lists where list = 'lead_lost_reason';
select 'ลีด=' || string_agg(id || '=' || coalesce(lost_reason, 'NULL'), ',' order by id) from public.leads where id like '#L-ZZ%';
select 'ใบ=' || string_agg(id || '=' || lost_reason, ',' order by id) from public.quotations where id like 'ZZ-Q%';
select 'คำขอ=' || (select lost_reason from public.quote_requests where id = 99001);
select 'สำรอง=' || count(*) || '|' || count(*) filter (where old_value = 'ลูกค้าเลื่อนโครงการ' and new_value = 'other:ลูกค้าเลื่อนโครงการ')
  from public.lost_reason_backup_0301 where row_key like '#L-ZZ%' or row_key like 'RYG|ZZ-Q%' or row_key = '99001';
-- เขียนใหม่ด้วยชื่อ/ข้อความ (แบบหน้าจอเดิม/ทางเขียนตรง) → ตัวกระตุ้นจัดเป็นรหัส · ปิดตัวกระตุ้นอื่น (ข้อนี้ตรวจตัวจัดค่า)
alter table public.leads disable trigger user;
alter table public.leads enable trigger aa_lost_reason_code;
update public.leads set lost_reason = 'ลูกค้าไม่ตอบสนอง' where id = '#L-ZZ5';
update public.leads set lost_reason = 'อื่น ๆ: ย้ายไปจังหวัดอื่น' where id = '#L-ZZ1';
select 'เขียนใหม่=' || (select lost_reason from public.leads where id = '#L-ZZ5') || '|' || (select lost_reason from public.leads where id = '#L-ZZ1');
-- ตารางจับคู่ (จุดเดียวที่บอสกำหนด): เพิ่มแถวแล้วข้อความเดิมนั้นจัดเป็นรหัส · ตารางว่างตั้งแต่ลงใบ
select 'จับคู่ว่าง=' || (select count(*) from public.lead_lost_reason_map);
insert into public.lead_lost_reason_map (old_key, old_text, code) values (public._option_key('งบประมาณไม่พอ'), 'งบประมาณไม่พอ', 'budget');
update public.leads set lost_reason = 'งบประมาณ ไม่พอ' where id = '#L-ZZ4';
select 'จับคู่=' || (select lost_reason from public.leads where id = '#L-ZZ4');
select 'ป้าย=' || public._option_label('lead_lost_reason', 'price_high') || '|' || public._option_label('lead_lost_reason', 'other:ลูกค้าเลื่อนโครงการ');
create temp table zz_ผล (k text, v text);
do $t$ begin
  delete from public.option_lists where list = 'lead_lost_reason' and code = 'budget';
  insert into zz_ผล values ('ลบ', 'ลบได้ (ผิด)');
exception when others then insert into zz_ผล values ('ลบ', case when sqlerrm like 'option_in_use:%' then 'ปฏิเสธ' else sqlerrm end); end $t$;
select k || '=' || v from zz_ผล;
select 'สิทธิ์=' || has_function_privilege('authenticated', 'public._lead_lost_value(text)', 'execute')
  || '|' || has_function_privilege('authenticated', 'public._lead_lost_reason_code()', 'execute')
  || '|' || has_table_privilege('authenticated', 'public.lost_reason_backup_0301', 'select')
  || '|' || has_table_privilege('anon', 'public.lost_reason_backup_0301', 'select')
  || '|' || has_table_privilege('authenticated', 'public.lead_lost_reason_map', 'select');`;

try {
  const r = ซ้อมใบ({ ใบ, ก่อนลงใบ, หลังลงใบ });
  const ค่า = (k) => new RegExp(`(?:^|NOTICE:\\s+)${k}=(.*)$`, "m").exec(r.ผลตรวจ)?.[1]?.trim() ?? "(ไม่มีบรรทัด)";
  ผล(r.warnings.length === 0, "ลงใบแบบ db push ไม่มี WARNING", r.warnings.join("\n"));
  ผล(ค่า("ก่อน") === "4|2|1", "ก่อนลงใบ: ลีดมีเหตุผล 4 · ใบปฏิเสธ 2 · คำขอปิด 1", ค่า("ก่อน"));
  ผล(/^price_high:ราคาสูงเกินงบประมาณ,competitor:คู่แข่งให้ข้อเสนอดีกว่า,budget:งบประมาณไม่พร้อม,no_response:ลูกค้าไม่ตอบสนอง:ซ่อน,r_[0-9a-f]{10}:ทำเลไกล,other:อื่น ๆ \(ระบุ\):ระบุ$/.test(ค่า("รายการ")),
    "รายการตั้งต้น: ตามที่ HQ ตั้งเดิม · ชื่อที่ HQ เอาออก = ซ่อน · ชื่อที่ตั้งเพิ่ม = r_… · อื่น ๆ (ระบุ) ท้าย", ค่า("รายการ"));
  ผล(ค่า("ลีด") === "#L-ZZ1=price_high,#L-ZZ2=budget,#L-ZZ3=other:ไปซื้อที่อื่น,#L-ZZ4=other:ลูกค้าเลื่อนโครงการ,#L-ZZ5=NULL",
    "ลีด: ชื่อตรง/ช่องว่างต่าง = รหัส · อื่นๆ (ระบุเอง): x = other:x · ข้อความเอง = other:ข้อความเดิม · ว่างไม่แตะ", ค่า("ลีด"));
  ผล(/^ZZ-Q1=r_[0-9a-f]{10},ZZ-Q2=other:ราคาสูงกว่าคู่แข่ง$/.test(ค่า("ใบ")), "ใบเสนอราคา: ชื่อที่ HQ ตั้งเพิ่ม = r_… · ข้อความเอง = other:…", ค่า("ใบ"));
  ผล(ค่า("คำขอ") === "competitor", "คำขอราคา: ชื่อตรง = รหัส", ค่า("คำขอ"));
  ผล(ค่า("สำรอง") === "7|1", "ตารางสำรองเก็บค่าเดิม 7 แถว (ทุกแถวที่เปลี่ยน) · ค่าเดิม/ค่าใหม่ถูกคู่", ค่า("สำรอง"));
  ผล(ค่า("เขียนใหม่") === "no_response|other:ย้ายไปจังหวัดอื่น", "เขียนใหม่ด้วยชื่อ (ตัวที่ซ่อน) = รหัส · \"อื่น ๆ: x\" = other:x", ค่า("เขียนใหม่"));
  ผล(ค่า("จับคู่ว่าง") === "0", "ตารางจับคู่ว่างตั้งแต่ลงใบ (จับคู่เฉพาะชื่อตรงรายการ · รอบอสกำหนด)", ค่า("จับคู่ว่าง"));
  ผล(ค่า("จับคู่") === "budget", "เพิ่มแถวตารางจับคู่ → ข้อความเดิมนั้น (ช่องว่างต่างได้) = รหัสตามตาราง", ค่า("จับคู่"));
  ผล(ค่า("ป้าย") === "ราคาสูงเกินงบประมาณ|อื่น ๆ: ลูกค้าเลื่อนโครงการ", "ป้ายจากรหัส = ชื่อ · other:x = อื่น ๆ: x", ค่า("ป้าย"));
  ผล(ค่า("ลบ") === "ปฏิเสธ", "ลบตัวเลือกที่มีข้อมูลใช้ (budget) = ฐานปฏิเสธ option_in_use", ค่า("ลบ"));
  ผล(ค่า("สิทธิ์") === "false|false|false|false|false", "ตัวจัดค่า/ตัวกระตุ้นผู้ใช้เรียกตรงไม่ได้ · ตารางสำรอง/ตารางจับคู่ผู้ใช้/คนนอกอ่านไม่ได้", ค่า("สิทธิ์"));
} catch (e) {
  ผล(false, "ซ้อมลงใบ 0301 + ตรวจ", e.message);
}
console.log(ตก ? `\n✗ ตก ${ตก} ข้อ` : "\nALL PASS");
process.exit(ตก ? 1 : 0);
