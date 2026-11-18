// ── ข้อทดสอบ: ซ้อมลงใบ 0287 (ดีลเลอร์ HQD ขายตรง + ย้ายทุกอย่างใต้ HQ) แบบ db push บนฐานแยกชั่วคราว + ซ้อมย้อนกลับ ─────────────
//   บอสสั่ง 18 พ.ย. 69: ย้ายลูกค้าเป้าหมายใต้ HQ ทั้งหมด (รวมที่ปิดแล้ว) → หลังลง ใต้ HQ = 0 · ตารางย้อนกลับ + คำสั่งย้อนกลับ
//   ก่อนลงใบ (วางแบบปิดตัวดัก): ลูกค้าเป้าหมายใต้ HQ 6 ราย
//     101 WAITING ระยอง (โน้ต + ประวัติ 1 บรรทัด + นัดหมาย 2) · 102 BULLET ไม่มีจังหวัด (นัดหมาย 1) · 103 PAID (ลูกค้า 5 + โน้ตลูกค้า + ใบตอบรับ + วันตอบรับ + ประวัติพิมพ์)
//     104 CANCELLED · 105 HQ_PRICING (คำขอราคา + ไฟล์คำขอ) · 108 WAITING (ไฟล์แนบ) + ผู้รับผิดชอบของ HQ 1 คน
//     + ลูกค้าเป้าหมายของดีลเลอร์อื่น 1 ราย (ต้องไม่ถูกแตะ) · จดภาพทุกแถวก่อนลงใบ
//   หลังลงใบ: ใต้ HQ = 0 ทุกตาราง · เลขเดิม · ของที่ผูกกันตามไปครบ · ประวัติมีบรรทัดรับโอน · ไม่แจ้งเตือน · ตัวนับ HQD ต่อจากเลขสูงสุด
//     · ตารางย้อนกลับจดครบ · ผู้ใช้ทั่วไปอ่านตารางย้อนกลับไม่ได้ · มีกฎอ่านไฟล์ที่ย้ายมา · บันทึกการใช้งาน
//   ย้อนกลับ (supabase/rollback/0287_rollback.sql): ทุกแถวกลับตรงภาพก่อนลงใบทุกช่อง · ตัวนับ HQD กลับเป็นไม่มี
//   ลงใบไม่มี WARNING · ตกบนโค้ดเดิม: ไม่มีใบ 0287 (ซ้อมใบโยน "ไม่พบใบ")
// รัน: node tests/tools/migration-0287.test.mjs   (ต้องมี docker + ฐานทดสอบเปิดอยู่ · ไม่แตะข้อมูลฐานทดสอบร่วม)
import { existsSync, readFileSync } from "node:fs";
import { ซ้อมใบ } from "../../scripts/lib/migrationRehearsal.mjs";

let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n   ${String(เพิ่ม).slice(0, 1500)}`}`); };
const ใบ = "0287_hq_direct_dealer.sql";
const ย้อน = "supabase/rollback/0287_rollback.sql";
ผล(existsSync(`supabase/migrations/${ใบ}`), `มีใบ ${ใบ}`);
ผล(existsSync(ย้อน), `มีคำสั่งย้อนกลับ ${ย้อน}`);

const ตาราง = ["leads", "appointments", "customers", "customer_notes", "quotations", "quotation_won_at", "quotation_prints", "quote_requests", "quote_files", "files", "responsible_persons"];
const ลีด = (n, สถานะ, จังหวัด, ลูกค้า = "null", โน้ต = "", ประวัติ = "[]") =>
  `('#L-${40321 + n}', ${n}, 'HQ', 'ZZTEST ย้ายขายตรง ${n}', 'ZZTEST', '${สถานะ}', '${จังหวัด}', ${ลูกค้า}, '${โน้ต}', '${ประวัติ}'::jsonb)`;
// ภาพของแถวทั้งหมดใต้ HQ (+ ดีลเลอร์อื่น) — เทียบก่อนลงใบ ↔ หลังย้อนกลับ
const ภาพ = (ชื่อ) => `create table public.${ชื่อ} as ${ตาราง.map(t => `select '${t}'::text as tbl, to_jsonb(x) as r from public.${t} x where x.dealer_code in ('HQ', 'ZZO')`).join(" union all ")};`;
const ก่อนลงใบ = `set session_replication_role = replica;
insert into public.dealers (code, name, province, region, status) values ('HQ', 'สำนักงานใหญ่', 'ทุกจังหวัด', 'ทุกภาค', 'active'), ('ZZO', 'ZZTEST ดีลเลอร์อื่น', 'ตราด', 'ตะวันออก', 'active');
insert into public.customers (id, dealer_code, company) overriding system value values (5, 'HQ', 'ZZTEST ลูกค้าผูก');
insert into public.customer_notes (id, dealer_code, customer_id) overriding system value values (9001, 'HQ', 5);
insert into public.leads (id, num_id, dealer_code, company, name, status, province, customer_id, note, activities) values
  ${ลีด(101, "WAITING", "ระยอง", "null", "โน้ตจาก HQ", '[{"id":1,"type":"note","icon":"note","date":"1 พ.ย. 2569 · 09:00","text":"ประวัติเดิม"}]')},
  ${ลีด(102, "BULLET", "")}, ${ลีด(103, "PAID", "ตราด", "5")}, ${ลีด(104, "CANCELLED", "")}, ${ลีด(105, "HQ_PRICING", "ตราด")}, ${ลีด(108, "WAITING", "ตราด")},
  ('#L-40999', 678, 'ZZO', 'ZZTEST ลีดดีลเลอร์อื่น', 'ZZTEST', 'WAITING', 'ตราด', null, '', '[]'::jsonb);
insert into public.appointments (id, dealer_code, lead_id, date, company, note) overriding system value values
  (7, 'HQ', 101, '2026-11-20', 'ZZTEST ย้ายขายตรง 101', 'นัดดูหน้างาน'), (8, 'HQ', 101, '2026-11-21', 'ZZTEST ย้ายขายตรง 101', 'นัดเสนอราคา'),
  (9, 'HQ', 102, '2026-11-22', 'ZZTEST ย้ายขายตรง 102', 'นัดโทรตาม');
insert into public.quotations (id, dealer_code, vat_percent, status, deal_id, customer_id, customer, total_value, won_at)
  values ('QT-HQ-103', 'HQ', 7, 'won', 103, 5, 'ZZTEST ลูกค้าผูก', 150000, '2026-11-10T03:00:00Z');
insert into public.quotation_won_at (dealer_code, quote_id, won_at) values ('HQ', 'QT-HQ-103', '2026-11-10T03:00:00Z');
insert into public.quotation_prints (id, dealer_code, quote_id) overriding system value values (9101, 'HQ', 'QT-HQ-103');
insert into public.quote_requests (id, request_no, dealer_code, lead_num_id, due_at) overriding system value values (9105, 'QR-HQ-105', 'HQ', 105, '2026-11-25T03:00:00Z');
insert into public.quote_files (id, request_id, dealer_code, side, object_name, display_name, declared_size, status) overriding system value
  values (9205, 9105, 'HQ', 'dealer', 'HQ/9105/plan.pdf', 'แบบ.pdf', 1000, 'ready');
insert into public.files (id, dealer_code, name, source, record_id, storage_path) overriding system value values (9108, 'HQ', 'ZZTEST แนบ.pdf', 'lead', 108, 'HQ/1700000000-a.pdf');
insert into public.responsible_persons (id, dealer_code, name) overriding system value values (9301, 'HQ', 'ZZTEST พนักงาน HQ');
set session_replication_role = origin;
${ภาพ("zz_before")}`;

const นับHQ = ตาราง.map(t => `(select count(*) from public.${t} where dealer_code = 'HQ')`).join(" + ");
const นับHQD = (t) => `(select count(*) from public.${t} where dealer_code = 'HQD')`;
const หลังลงใบ = `select 'HQเหลือ=' || (${นับHQ});
select 'HQD=' || ${["leads", "appointments", "customers", "quotations", "quote_requests", "files", "quote_files", "customer_notes"].map(นับHQD).join(" || '|' || ")};
select 'เลขเดิม=' || (select string_agg(num_id::text || ':' || status, ',' order by num_id) from public.leads where dealer_code = 'HQD');
select 'ผูก=' || (select deal_id || '/' || customer_id from public.quotations where dealer_code = 'HQD' and id = 'QT-HQ-103')
  || '|' || ${นับHQD("quotation_won_at")} || '|' || ${นับHQD("quotation_prints")}
  || '|' || (select customer_id from public.leads where dealer_code = 'HQD' and num_id = 103);
select 'นัด=' || (select string_agg(id || '>' || lead_id, ',' order by id) from public.appointments where dealer_code = 'HQD');
select 'ประวัติ=' || (select string_agg(x->>'text', '|' order by (x->>'id')::int) from public.leads l, jsonb_array_elements(l.activities) x where l.dealer_code = 'HQD' and l.num_id = 101);
select 'รับโอนทุกราย=' || (select count(*) from public.leads l where l.dealer_code = 'HQD' and l.activities::text like '%รับโอนจากสำนักงานใหญ่%');
select 'ดีลเลอร์อื่น=' || (select dealer_code || ':' || jsonb_array_length(activities) from public.leads where num_id = 678);
select 'แจ้งเตือน=' || (select count(*) from public.notifications);
select 'ตัวนับ=' || (select string_agg(entity || ':' || next_id, ',' order by entity) from public.entity_counters where dealer_code = 'HQD');
select 'สำรองแถว=' || (select string_agg(tbl || ':' || k, ',' order by tbl) from (select tbl, count(*) k from public.hqd_move_0287 group by 1) x);
select 'ตารางย้อนกลับ=' || (select relrowsecurity from pg_class where oid = 'public.hqd_move_0287'::regclass)
  || '|' || has_table_privilege('anon', 'public.hqd_move_0287', 'select') || '|' || has_table_privilege('authenticated', 'public.hqd_move_0287', 'select');
select 'กฎอ่านไฟล์=' || (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'dealer_files_read_by_row');
select 'บันทึก=' || coalesce((select target from public.audit_log where action = 'ย้ายข้อมูลของ HQ ไปขายตรง (HQD)'), 'ไม่มี');
${readFileSync(ย้อน, "utf8")}
${ภาพ("zz_after")}
select 'ย้อนกลับต่าง=' || (select count(*) from public.zz_before a full join public.zz_after b on a.tbl = b.tbl and a.r = b.r where a.r is null or b.r is null)
  || '|ก่อน=' || (select count(*) from public.zz_before) || '|หลัง=' || (select count(*) from public.zz_after);
select 'ต่างตัวอย่าง=' || coalesce((select string_agg(x.tbl || ':' || x.r::text, ' / ') from ((select * from public.zz_before except select * from public.zz_after) union all (select * from public.zz_after except select * from public.zz_before)) x), '-');
select 'ตัวนับหลังย้อน=' || coalesce((select string_agg(entity, ',') from public.entity_counters where dealer_code = 'HQD'), 'ไม่มี');
select 'HQDหลังย้อน=' || ${นับHQD("leads")};`;

try {
  const r = ซ้อมใบ({ ใบ, ก่อนลงใบ, หลังลงใบ });
  const ค่า = (k) => new RegExp(`^${k}=(.*)$`, "m").exec(r.ผลตรวจ)?.[1] ?? "(ไม่มีบรรทัด)";
  ผล(r.warnings.length === 0, "ลงใบแบบ db push ไม่มี WARNING", r.warnings.join("\n"));
  ผล(ค่า("HQเหลือ") === "0", "หลังลง ใต้ HQ = 0 ทุกตาราง (รวมรายที่ปิดแล้ว)", ค่า("HQเหลือ"));
  ผล(ค่า("HQD") === "6|3|1|1|1|1|1|1", "ใต้ HQD: ลูกค้าเป้าหมาย 6 · นัดหมาย 3 · ลูกค้า 1 · ใบ 1 · คำขอ 1 · ไฟล์ 1 · ไฟล์คำขอ 1 · โน้ตลูกค้า 1", ค่า("HQD"));
  ผล(ค่า("เลขเดิม") === "101:WAITING,102:BULLET,103:PAID,104:CANCELLED,105:HQ_PRICING,108:WAITING", "คงเลขเดิม + สถานะเดิม (เปิด 4 · ปิด 2)", ค่า("เลขเดิม"));
  ผล(ค่า("ผูก") === "103/5|1|1|5", "ใบตอบรับยังผูกลูกค้าเป้าหมาย 103 + ลูกค้า 5 · วันตอบรับ/ประวัติพิมพ์ตามไป", ค่า("ผูก"));
  ผล(ค่า("นัด") === "7>101,8>101,9>102", "นัดหมายเลขเดิม ผูกลูกค้าเป้าหมายเดิม", ค่า("นัด"));
  ผล(ค่า("ประวัติ") === "ประวัติเดิม|รับโอนจากสำนักงานใหญ่ (ขายตรง HQD)", "ประวัติเดิมครบ + บรรทัดรับโอนต่อท้าย", ค่า("ประวัติ"));
  ผล(ค่า("รับโอนทุกราย") === "6", "ลูกค้าเป้าหมายทุกรายมีบรรทัดรับโอน", ค่า("รับโอนทุกราย"));
  ผล(ค่า("ดีลเลอร์อื่น") === "ZZO:0", "ลูกค้าเป้าหมายของดีลเลอร์อื่นไม่ถูกแตะ", ค่า("ดีลเลอร์อื่น"));
  ผล(ค่า("แจ้งเตือน") === "0", "ไม่สร้างแจ้งเตือนตอนย้าย", ค่า("แจ้งเตือน"));
  ผล(ค่า("ตัวนับ") === "appointments:10,customers:6,leads:109", "ตัวนับ HQD ต่อจากเลขสูงสุด", ค่า("ตัวนับ"));
  ผล(ค่า("สำรองแถว") === "appointments:3,customer_notes:1,customers:1,files:1,leads:6,quotation_prints:1,quotation_won_at:1,quotations:1,quote_files:1,quote_requests:1,responsible_persons:1",
    "ตารางย้อนกลับจดแถวเดิมครบทุกตาราง", ค่า("สำรองแถว"));
  ผล(ค่า("ตารางย้อนกลับ") === "true|false|false", "ตารางย้อนกลับเปิด RLS · anon/authenticated อ่านไม่ได้", ค่า("ตารางย้อนกลับ"));
  ผล(ค่า("กฎอ่านไฟล์") === "1", "มีกฎอ่านไฟล์ที่ย้ายมา (dealer_files_read_by_row)", ค่า("กฎอ่านไฟล์"));
  ผล(/^ลูกค้าเป้าหมาย 6 ราย · นัดหมาย 3 · ลูกค้า 1 · ใบเสนอราคา 1 · คำขอราคา 1 · ไฟล์ 1 · ไฟล์คำขอ 1/.test(ค่า("บันทึก")), "บันทึกการใช้งานบอกจำนวนที่ย้าย", ค่า("บันทึก"));
  const ต่าง = /^0\|ก่อน=(\d+)\|หลัง=(\d+)$/.exec(ค่า("ย้อนกลับต่าง"));
  ผล(!!ต่าง && ต่าง[1] === ต่าง[2] && Number(ต่าง[1]) === 19, "ย้อนกลับ: 19 แถว (รวมลีดของดีลเลอร์อื่น)กลับตรงภาพก่อนลงใบทุกช่อง (เทียบทั้งแถว)", `${ค่า("ย้อนกลับต่าง")} · ${ค่า("ต่างตัวอย่าง")}`);
  ผล(ค่า("ตัวนับหลังย้อน") === "ไม่มี" && ค่า("HQDหลังย้อน") === "0", "ย้อนกลับ: ตัวนับ HQD กลับเป็นไม่มี · ไม่เหลือลูกค้าเป้าหมายใต้ HQD", `${ค่า("ตัวนับหลังย้อน")} · ${ค่า("HQDหลังย้อน")}`);
} catch (e) {
  ผล(false, "ซ้อมลงใบ 0287 + ย้อนกลับ + ตรวจ", e.message);
}
console.log(ตก ? `\n✗ ตก ${ตก} ข้อ` : "\nALL PASS");
process.exit(ตก ? 1 : 0);
