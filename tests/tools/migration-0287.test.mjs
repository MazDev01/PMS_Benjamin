// ── ข้อทดสอบ: ซ้อมลงใบ 0287 (ดีลเลอร์ HQD ขายตรง + ย้ายลูกค้าเป้าหมายใต้ HQ) แบบ db push บนฐานแยกชั่วคราว (scripts/lib/migrationRehearsal.mjs) ──
//   บอสสั่ง 18 พ.ย. 69: ย้ายลูกค้าเป้าหมายใต้ HQ ที่ยังเปิดอยู่ไป HQD รวมรายไม่มีจังหวัด — วิธีเดียวกับ 0197
//   ก่อนลงใบ: ลูกค้าเป้าหมายใต้ HQ 8 ราย (วางแบบปิดตัวดัก)
//     101 ระยอง (โน้ต + ประวัติ 1 บรรทัด + นัดหมาย 2 นัด) · 102 ไม่มีจังหวัด (นัดหมาย 1 นัด) → ย้าย
//     103 ลูกค้าผูก · 104 มีใบเสนอราคา · 105 มีคำขอราคา · 108 มีไฟล์แนบ → ไม่ย้าย (นับ + รายงาน)
//     106 PAID · 107 CANCELLED → ไม่ย้าย (ปิดแล้ว · เหลือใต้ HQ)
//   หลังลงใบ: แถว HQD ไม่มีจังหวัด/พื้นที่/เป้า · ย้าย 2 ได้เลขใหม่ของ HQD · โน้ต/ประวัติ/นัดหมายตามไป ·
//     บรรทัด "รับโอนจากสำนักงานใหญ่" · ไม่มีแจ้งเตือน "HQ ส่งลีดใหม่ให้" · บันทึกการใช้งานบอก ย้าย/ไม่ย้าย/เหลือ · ตัวนับ HQD ต่อจากเลขที่ใช้
//   ลงใบไม่มี WARNING · ตกบนโค้ดเดิม: ไม่มีใบ 0287 (ซ้อมใบโยน "ไม่พบใบ")
// รัน: node tests/tools/migration-0287.test.mjs   (ต้องมี docker + ฐานทดสอบเปิดอยู่ · ไม่แตะข้อมูลฐานทดสอบร่วม)
import { existsSync } from "node:fs";
import { ซ้อมใบ } from "../../scripts/lib/migrationRehearsal.mjs";

let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n   ${String(เพิ่ม).slice(0, 1500)}`}`); };
const ใบ = "0287_hq_direct_dealer.sql";
ผล(existsSync(`supabase/migrations/${ใบ}`), `มีใบ ${ใบ}`);

const ลีด = (n, สถานะ, จังหวัด, เพิ่ม = "") =>
  `('#L-HQ${n}', ${n}, 'HQ', 'ZZTEST ย้ายขายตรง ${n}', 'ZZTEST', '${สถานะ}', '${จังหวัด}', ${เพิ่ม || "null, '', '[]'::jsonb"})`;
const ก่อนลงใบ = `set session_replication_role = replica;
insert into public.dealers (code, name, province, region, status) values ('HQ', 'สำนักงานใหญ่', 'ทุกจังหวัด', 'ทุกภาค', 'active');
insert into public.customers (id, dealer_code, company) overriding system value values (5, 'HQ', 'ZZTEST ลูกค้าผูก');
insert into public.leads (id, num_id, dealer_code, company, name, status, province, customer_id, note, activities) values
  ${ลีด(101, "WAITING", "ระยอง", `null, 'โน้ตจาก HQ', '[{"id":1,"type":"note","icon":"note","date":"1 พ.ย. 2569 · 09:00","text":"ประวัติเดิม"}]'::jsonb`)},
  ${ลีด(102, "BULLET", "")},
  ${ลีด(103, "WAITING", "ตราด", "5, '', '[]'::jsonb")},
  ${ลีด(104, "QUOTED", "ตราด")},
  ${ลีด(105, "HQ_PRICING", "ตราด")},
  ${ลีด(106, "PAID", "ตราด")},
  ${ลีด(107, "CANCELLED", "")},
  ${ลีด(108, "WAITING", "ตราด")};
insert into public.appointments (id, dealer_code, lead_id, date, company, note) overriding system value values
  (7, 'HQ', 101, '2026-11-20', 'ZZTEST ย้ายขายตรง 101', 'นัดดูหน้างาน'),
  (8, 'HQ', 101, '2026-11-21', 'ZZTEST ย้ายขายตรง 101', 'นัดเสนอราคา'),
  (9, 'HQ', 102, '2026-11-22', 'ZZTEST ย้ายขายตรง 102', 'นัดโทรตาม');
insert into public.quotations (id, dealer_code, vat_percent, status, deal_id, customer) values ('QT-HQ-104', 'HQ', 7, 'sent_to_client', 104, 'ZZTEST');
insert into public.quote_requests (id, request_no, dealer_code, lead_num_id, due_at) overriding system value values (9105, 'QR-HQ-105', 'HQ', 105, now() + interval '2 days');
insert into public.files (id, dealer_code, name, source, record_id) overriding system value values (9108, 'HQ', 'ZZTEST แนบ.pdf', 'lead', 108);
set session_replication_role = origin;`;

const หลังลงใบ = `select 'HQD=' || coalesce((select coalesce(province, '-') || '|' || coalesce(region, '-') || '|' || revenue_target from public.dealers where code = 'HQD'), 'ไม่มี');
select 'พื้นที่HQD=' || (select count(*) from public.dealer_territories where dealer_code = 'HQD');
select 'ชื่อบนเอกสาร=' || coalesce((select issuer->>'company' from public.dealer_settings where dealer_code = 'HQD'), 'ไม่มี');
select 'ย้ายแล้ว=' || coalesce((select string_agg(company || '#' || num_id || '#' || id, ',' order by company) from public.leads where dealer_code = 'HQD'), '');
select 'เหลือHQ=' || coalesce((select string_agg(num_id::text || ':' || status, ',' order by num_id) from public.leads where dealer_code = 'HQ'), '');
select 'โน้ต=' || coalesce((select note from public.leads where dealer_code = 'HQD' and company like '%101'), 'ไม่มี');
select 'ประวัติ=' || coalesce((select string_agg(x->>'text', '|' order by (x->>'id')::int) from public.leads l, jsonb_array_elements(l.activities) x
  where l.dealer_code = 'HQD' and l.company like '%101'), 'ไม่มี');
select 'ประวัติ102=' || coalesce((select string_agg(x->>'text', '|') from public.leads l, jsonb_array_elements(l.activities) x
  where l.dealer_code = 'HQD' and l.company like '%102'), 'ไม่มี');
select 'นัด=' || coalesce((select string_agg(a.note || '@' || a.dealer_code || '/' || (a.id > 0) || '/' || (a.lead_id = l.num_id), ',' order by a.note)
  from public.appointments a join public.leads l on l.dealer_code = a.dealer_code and l.num_id = a.lead_id where a.company like 'ZZTEST ย้ายขายตรง%'), 'ไม่มี');
select 'นัดค้างHQ=' || (select count(*) from public.appointments where dealer_code = 'HQ');
select 'แจ้งเตือน=' || (select count(*) from public.notifications where kind = 'lead_from_hq');
select 'บันทึก=' || coalesce((select string_agg(target, ' / ') from public.audit_log where action = 'ย้ายลูกค้าเป้าหมายของ HQ ไปขายตรง (HQD)'), 'ไม่มี');
select 'ตัวนับ=' || coalesce((select string_agg(entity || ':' || next_id, ',' order by entity) from public.entity_counters where dealer_code = 'HQD'), 'ไม่มี');
select 'ใบยังผูกHQ=' || (select count(*) from public.quotations where dealer_code = 'HQ' and deal_id = 104)
  || '|' || (select count(*) from public.quote_requests where dealer_code = 'HQ' and lead_num_id = 105);`;

try {
  const r = ซ้อมใบ({ ใบ, ก่อนลงใบ, หลังลงใบ });
  const ค่า = (k) => new RegExp(`^${k}=(.*)$`, "m").exec(r.ผลตรวจ)?.[1] ?? "(ไม่มีบรรทัด)";
  ผล(r.warnings.length === 0, "ลงใบแบบ db push ไม่มี WARNING", r.warnings.join("\n"));
  ผล(ค่า("HQD") === "-|-|0", "แถว HQD: ไม่มีจังหวัด/ภาค · เป้า 0", ค่า("HQD"));
  ผล(ค่า("พื้นที่HQD") === "0", "HQD ไม่มีแถวพื้นที่ดูแล", ค่า("พื้นที่HQD"));
  ผล(ค่า("ชื่อบนเอกสาร") === "สำนักงานใหญ่ (ขายตรง)", "ชื่อบริษัทตั้งต้นบนเอกสารของ HQD", ค่า("ชื่อบนเอกสาร"));
  ผล(ค่า("ย้ายแล้ว") === "ZZTEST ย้ายขายตรง 101#1##L-40322,ZZTEST ย้ายขายตรง 102#2##L-40323",
    "ย้ายเฉพาะรายเปิดที่ไม่มีใบ/คำขอ/ลูกค้า/ไฟล์ (รวมรายไม่มีจังหวัด) · เลขใหม่ของ HQD เรียงตามเลขเดิม", ค่า("ย้ายแล้ว"));
  ผล(ค่า("เหลือHQ") === "103:WAITING,104:QUOTED,105:HQ_PRICING,106:PAID,107:CANCELLED,108:WAITING",
    "เหลือใต้ HQ: ลูกค้าผูก · มีใบ · มีคำขอ · มีไฟล์ · ปิดแล้ว 2", ค่า("เหลือHQ"));
  ผล(ค่า("โน้ต") === "โน้ตจาก HQ", "โน้ตย้ายตาม", ค่า("โน้ต"));
  ผล(ค่า("ประวัติ") === "ประวัติเดิม|รับโอนจากสำนักงานใหญ่ (ขายตรง HQD)", "ประวัติเดิมอยู่ครบ + บรรทัด \"รับโอนจากสำนักงานใหญ่\" ต่อท้าย", ค่า("ประวัติ"));
  ผล(ค่า("ประวัติ102") === "รับโอนจากสำนักงานใหญ่ (ขายตรง HQD)", "รายไม่มีประวัติ (ไม่มีจังหวัด) ได้บรรทัดรับโอน", ค่า("ประวัติ102"));
  // ลำดับตามการเรียงคำไทยของฐาน — เทียบเป็นชุด (เรียงใน JS)
  ผล(ค่า("นัด").split(",").sort().join(",") === ["นัดดูหน้างาน@HQD/true/true", "นัดเสนอราคา@HQD/true/true", "นัดโทรตาม@HQD/true/true"].sort().join(","),
    "นัดหมายทั้ง 3 ย้ายตาม: อยู่ HQD · เลขบวก · ผูกเลขใหม่ของลูกค้าเป้าหมาย", ค่า("นัด"));
  ผล(ค่า("นัดค้างHQ") === "0", "ไม่มีนัดหมายค้างใต้ HQ (เลขชั่วคราวติดลบไม่เหลือ)", ค่า("นัดค้างHQ"));
  ผล(ค่า("แจ้งเตือน") === "0", "ไม่สร้างแจ้งเตือน \"HQ ส่งลีดใหม่ให้\" (0231) ตอนย้าย", ค่า("แจ้งเตือน"));
  ผล(ค่า("บันทึก") === "ย้าย 2 ราย · ไม่ย้าย 4 ราย (มีใบเสนอราคา/คำขอราคา/ลูกค้าผูก/ไฟล์แนบ) · เหลือใต้ HQ 6 ราย",
    "บันทึกการใช้งานบอกจำนวนย้าย/ไม่ย้าย/เหลือ (ไม่ข้ามเงียบ)", ค่า("บันทึก"));
  ผล(ค่า("ตัวนับ") === "appointments:4,leads:3", "ตัวนับของ HQD ต่อจากเลขที่ใช้ (ลูกค้าเป้าหมาย 1–2 · นัดหมาย 1–3)", ค่า("ตัวนับ"));
  ผล(ค่า("ใบยังผูกHQ") === "1|1", "ใบเสนอราคา/คำขอราคาเดิมยังผูกลูกค้าเป้าหมายใต้ HQ", ค่า("ใบยังผูกHQ"));
} catch (e) {
  ผล(false, "ซ้อมลงใบ 0287 + ตรวจหลังลงใบ", e.message);
}
console.log(ตก ? `\n✗ ตก ${ตก} ข้อ` : "\nALL PASS");
process.exit(ตก ? 1 : 0);
