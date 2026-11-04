// ── ข้อทดสอบ: ชุดล้างผู้สนใจทดสอบ → ใบค่าแฟรนไชส์ → ดีลเลอร์ ZZTN ใน tests/prod-live/cleanup.sql (บอสสั่ง 1 พ.ย. 69) ─────
//   รัน cleanup.sql ตัวจริงบนฐานทดสอบในทรานแซกชันแล้วย้อนทิ้ง (ไม่เหลืออะไรในฐาน) แล้วตรวจ:
//   1) แถวทดสอบหายครบ: ผู้สนใจ · ใบ · การชำระ · สาขา · จังหวัดที่ดูแล · บัญชี · โปรไฟล์ · แจ้งเตือน · บันทึกการใช้งาน
//   2) แถวจริงอยู่ครบ: ผู้สนใจจริงพร้อมใบ+การชำระ · ผู้สนใจ ZZTEST ชื่ออื่น · สาขาอื่น · จังหวัดเดียวกันของสาขาอื่น · บัญชีอื่น · ตารางจังหวัดกลาง
//      + จำนวนแถวทั้งตารางเท่าก่อนใส่แถวทดสอบ
//   3) ด่านกันพลาด: สาขา ZZTN ชื่อจริง / ผูกผู้สนใจจริง / ผู้สนใจทดสอบผูกดีลเลอร์อื่น / ZZTN มีบัญชีอื่น → ยกเลิกทั้งหมด ไม่ลบอะไรเลย
// mutation proof (ทำให้ไฟล์ล้างผิดก่อนรัน · ข้อทดสอบต้องตก): PMS_CLEANUP_MUTATE=broad-prospect (ลบผู้สนใจทุกราย) · broad-dealer (ลบสาขาจริง)
//   · broad-user (ลบบัญชีจริง) · no-guard (ถอดด่านกันพลาด) · miss-prospect (ไม่ลบผู้สนใจทดสอบ) · broad-mail · miss-mail (จดหมายที่ตัวถือจดหมายถือไว้)
//   · miss-batch (ไม่ลบชุดนำเข้าทดสอบ) · broad-batch (ลบชุดนำเข้าทุกชุด) — ชุดนำเข้าผู้สนใจของ live-import.spec.ts (ใบ 0275 · บอสสั่ง 4 พ.ย. 69)
// ขั้นนับที่เหลือของ run.mjs (cleanup-left · ฐานจริงรันหลัง cleanup.sql) — ดึงคำสั่งตัวจริงจาก run.mjs มารันหลังไฟล์ล้างในทรานแซกชันเดียวกัน ทุกช่องต้อง 0
// รัน: node tests/tools/franchise-cleanup.test.mjs (ถือล็อกฐานทดสอบระหว่างรัน)
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { ขอล็อกฐานทดสอบ } from "../../scripts/lib/testDbLock.mjs";
import { อาร์กิวเมนต์psql, คอนเทนเนอร์ } from "../../scripts/lib/testDbGuard.mjs";
import { รอถ้าฐานไม่ว่าง } from "../../scripts/lib/testDbWait.mjs";
รอถ้าฐานไม่ว่าง("ข้อทดสอบล้างชุดผู้สนใจทดสอบ");

let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n${String(เพิ่ม).slice(-1500)}`}`); };

const ป้าย = "ZZTEST-ผู้สนใจเว็บจริง-";
const อีเมลทดสอบ = "zztn@dealer.benjaminpebsteel.com";
let ไฟล์ล้าง = readFileSync("tests/prod-live/cleanup.sql", "utf8").replace(/\r\n/g, "\n")
  .replaceAll("__ชุดสำรองก่อนลบ__", "ฐานทดสอบ (ข้อทดสอบ franchise-cleanup)");
// ── mutation proof ──
const พัง = process.env.PMS_CLEANUP_MUTATE ?? "";
const แก้ = (เดิม, ใหม่) => { if (!ไฟล์ล้าง.includes(เดิม)) throw new Error(`mutation หาไม่เจอ: ${เดิม}`); ไฟล์ล้าง = ไฟล์ล้าง.replace(เดิม, ใหม่); };
if (พัง === "broad-prospect") แก้(`delete from public.dealer_prospects where name like '${ป้าย}%';`, "delete from public.dealer_prospects;");
if (พัง === "broad-dealer") แก้("delete from public.dealers where code = 'ZZTN';", "update public.dealer_prospects set dealer_code = null where dealer_code = 'ZZTX'; delete from public.dealers where code in ('ZZTN', 'ZZTX');");
if (พัง === "broad-user") แก้(`delete from auth.users where lower(email) = '${อีเมลทดสอบ}';`, `delete from auth.users where lower(email) like '%@dealer.benjaminpebsteel.com' and not exists (select 1 from public.profiles p where p.id = auth.users.id and p.dealer_code <> 'ZZTX');`);
if (พัง === "broad-mail") แก้("or subject like '%ZZTEST%' or body like '%ZZTEST%';", "or subject like '%ZZT%' or body like '%ZZT%';");
if (พัง === "miss-batch") แก้("delete from public.prospect_import_batches where file_name like 'ZZTEST-ผู้สนใจเว็บจริง-%' or created_by = 'บัญชีทดสอบชั่วคราว' or created_by like 'live-%@example.test';", "");
if (พัง === "broad-batch") แก้("delete from public.prospect_import_batches where file_name like 'ZZTEST-ผู้สนใจเว็บจริง-%' or created_by = 'บัญชีทดสอบชั่วคราว' or created_by like 'live-%@example.test';", "delete from public.prospect_import_batches;");
if (พัง === "miss-mail") แก้("or subject like '%ZZTEST%' or body like '%ZZTEST%';", ";");
if (พัง === "miss-prospect") แก้(`delete from public.dealer_prospects where name like '${ป้าย}%';`, "");
if (พัง === "no-guard") ไฟล์ล้าง = ไฟล์ล้าง.replace(/-- ด่านกันพลาดของชุดผู้สนใจ[\s\S]*?end \$\$;\n/, "");
const ตัวไฟล์ = ไฟล์ล้าง.replace(/^begin;$/m, "").replace(/^commit;$/m, "");
ผล(/^begin;$/m.test(ไฟล์ล้าง) && /^commit;$/m.test(ไฟล์ล้าง), "cleanup.sql อยู่ในทรานแซกชันเดียว (พังกลางทาง = ไม่ลบอะไร)");

// คำสั่งนับที่เหลือตัวจริงของ run.mjs (cleanup-left) — สาขาทดสอบ ZZT
const นับที่เหลือ = (/writeFileSync\(ไฟล์เหลือ, `([\s\S]*?)`\);/.exec(readFileSync("tests/prod-live/run.mjs", "utf8").replace(/\r\n/g, "\n"))?.[1] ?? "")
  .replaceAll("${CODE}", "ZZT").trim().replace(/;$/, "");
ผล(/ as ชุดนำเข้า,/.test(นับที่เหลือ), "ขั้นนับที่เหลือของ run.mjs นับชุดนำเข้าผู้สนใจด้วย");
const รัน = (sql) => spawnSync("docker", [...อาร์กิวเมนต์psql(คอนเทนเนอร์), "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8", maxBuffer: 64 << 20 });

// ตัวเตรียมแถว: ใส่ตรงในทรานแซกชัน (ปิดด่านแปลงเป็นดีลเลอร์ + ตัวดักสถานะชั่วคราว เฉพาะทรานแซกชันนี้) — ข้อนี้ตรวจการลบ ไม่ใช่การสร้าง
const ปิดด่าน = `
alter table public.dealers disable trigger dealers_conversion_gate;
alter table public.dealer_prospects disable trigger dealer_prospects_stage_guard;
alter table public.dealer_package_proposals disable trigger dealer_package_proposals_before_write;
alter table public.dealer_proposal_payments disable trigger dealer_proposal_payments_guard;
`;
const เปิดด่าน = `
alter table public.dealers enable trigger dealers_conversion_gate;
alter table public.dealer_prospects enable trigger dealer_prospects_stage_guard;
alter table public.dealer_package_proposals enable trigger dealer_package_proposals_before_write;
alter table public.dealer_proposal_payments enable trigger dealer_proposal_payments_guard;
`;
const ใส่ใบ = (ผู้สนใจ, เลข, ยอด) => `
insert into public.dealer_package_proposals (prospect_id, proposal_no, status, amount)
  select id, '${เลข}', 'accepted', ${ยอด} from public.dealer_prospects where name = '${ผู้สนใจ}';
insert into public.dealer_proposal_payments (proposal_id, paid_on, amount, reference)
  select id, current_date, ${ยอด}, 'TR-${เลข}' from public.dealer_package_proposals where proposal_no = '${เลข}';`;
const บัญชี = (id, อีเมล, สาขา) => `
insert into auth.users (id, email, aud, role) values ('${id}', '${อีเมล}', 'authenticated', 'authenticated');
insert into public.profiles (id, name, role, dealer_code, status) values ('${id}', '${สาขา} ทดสอบล้าง', 'DEALER_ADMIN', '${สาขา}', 'active')
  on conflict (id) do update set dealer_code = excluded.dealer_code;`;
const สาขา = (code, name, จังหวัด, ราย = "null") => `
insert into public.dealers (code, name, status, province, region, prospect_id) values ('${code}', '${name}', 'active', '${จังหวัด}', 'ตะวันออก', ${ราย});`;

const นับทุกตาราง = `(select jsonb_build_object(
  'dealers', (select count(*) from public.dealers), 'prospects', (select count(*) from public.dealer_prospects),
  'proposals', (select count(*) from public.dealer_package_proposals), 'payments', (select count(*) from public.dealer_proposal_payments),
  'territories', (select count(*) from public.dealer_territories), 'users', (select count(*) from auth.users),
  'profiles', (select count(*) from public.profiles), 'provinces', (select count(*) from public.th_provinces),
  'leads', (select count(*) from public.leads), 'batches', (select count(*) from public.prospect_import_batches), 'outbox', (select count(*) from public.email_outbox), 'activities', (select count(*) from public.dealer_prospect_activities where prospect_id in (select id from public.dealer_prospects where name not like 'ZZTEST-%' and name not like 'ผู้สนใจจริง-ทดสอบล้าง%'))))`;

const ล็อก = ขอล็อกฐานทดสอบ("ข้อทดสอบ franchise-cleanup", { รอนาที: 30 });
try {
  // ── ทางหลัก: แถวทดสอบหาย แถวจริงอยู่ ──
  const หลัก = รัน(`
begin;
set local client_min_messages = warning;
create temp table ก่อนใส่ as select ${นับทุกตาราง} as n;
${ปิดด่าน}
insert into public.dealer_prospects (name, phone, region, province, status) values
  ('${ป้าย}1', '000-000-0001', 'ตะวันออก', 'ตราด', 'meeting'),
  ('ผู้สนใจจริง-ทดสอบล้าง', '000-000-0002', 'ตะวันออก', 'ตราด', 'meeting'),
  ('ZZTEST-ชุดอื่น-ทดสอบล้าง', '000-000-0003', 'ตะวันออก', 'ตราด', 'meeting');
insert into public.prospect_import_batches (file_name, row_count, inserted, created_by) values
  ('${ป้าย}นำเข้า-ทดสอบล้าง.xlsx', 2, 2, 'บัญชีทดสอบชั่วคราว'), ('ไฟล์จริง-ทดสอบล้าง.xlsx', 1, 1, 'ผู้ดูแลจริง');
insert into public.dealer_prospects (name, phone, region, province, status, import_batch_id)
  select '${ป้าย}นำเข้า-' || n, '000-000-01' || n, 'ตะวันออก', 'ตราด', 'new', b.id
    from public.prospect_import_batches b, generate_series(10, 11) n where b.file_name = '${ป้าย}นำเข้า-ทดสอบล้าง.xlsx';
update public.dealer_prospects set import_batch_id = (select id from public.prospect_import_batches where file_name = 'ไฟล์จริง-ทดสอบล้าง.xlsx')
 where name = 'ผู้สนใจจริง-ทดสอบล้าง';
${ใส่ใบ(`${ป้าย}1`, "DP-ล้าง-ทดสอบ", 100000)}
${ใส่ใบ("ผู้สนใจจริง-ทดสอบล้าง", "DP-ล้าง-จริง", 200000)}
${สาขา("ZZTN", `${ป้าย}1`, "ตราด", `(select id from public.dealer_prospects where name = '${ป้าย}1')`)}
${สาขา("ZZTX", "สาขาจริงทดสอบล้าง", "ตราด", "(select id from public.dealer_prospects where name = 'ผู้สนใจจริง-ทดสอบล้าง')")}
update public.dealer_prospects set dealer_code = 'ZZTN', status = 'won' where name = '${ป้าย}1';
update public.dealer_prospects set dealer_code = 'ZZTX', status = 'won' where name = 'ผู้สนใจจริง-ทดสอบล้าง';
${บัญชี("00000000-0000-4000-8000-0000000000a1", อีเมลทดสอบ, "ZZTN")}
${บัญชี("00000000-0000-4000-8000-0000000000a2", "zztx@dealer.benjaminpebsteel.com", "ZZTX")}
insert into public.notifications (kind, audience, dealer_code, title, body, href, dedupe_key) values
  ('proposal_awaiting', 'hq', null, 'ล้าง', 'DP-ล้าง-ทดสอบ · ${ป้าย}1 · รอ', '/x', 'ล้าง-ทดสอบ-hq'),
  ('proposal_awaiting', 'hq', null, 'ล้าง', 'DP-ล้าง-จริง · ผู้สนใจจริง-ทดสอบล้าง · รอ', '/x', 'ล้าง-จริง-hq'),
  ('hq_quote_sent', 'dealer', 'ZZTN', 'ล้าง', 'ของสาขาทดสอบ', '/x', 'ล้าง-ทดสอบ-สาขา');
insert into public.email_outbox (kind, to_email, subject, body, ref_table, ref_id, dedupe_key) values
  ('customer_accepted', 'hq-จริง@example.test', 'ลูกค้าตอบรับ — ZZTEST-ทดสอบล้าง', '', 'quotations', '1', 'ล้าง-จดหมาย-ทดสอบ'),
  ('customer_accepted', 'hq-จริง@example.test', 'ลูกค้าตอบรับ — บริษัทจริงทดสอบล้าง', 'ZZTOP', 'quotations', '2', 'ล้าง-จดหมาย-จริง');
insert into public.audit_log ("user", role, action, target, at) values
  ('บัญชีทดสอบชั่วคราว', 'SUPER_ADMIN', 'ออกใบค่าแฟรนไชส์', 'DP-ล้าง-ทดสอบ · ${ป้าย}1', now()),
  ('', '', 'เพิ่มผู้สนใจเป็นดีลเลอร์', '${ป้าย}1', now()),
  ('${ป้าย}1', 'DEALER_ADMIN', 'เข้าสู่ระบบ', 'ตัวแอป', now()),
  ('system', '', 'แก้ไขดีลเลอร์', 'ZZTN · ${ป้าย}1', now()),
  ('ผู้ดูแลจริง', 'SUPER_ADMIN', 'ออกใบค่าแฟรนไชส์', 'DP-ล้าง-จริง · ผู้สนใจจริง-ทดสอบล้าง', now()),
  ('ผู้ดูแลจริง', 'SUPER_ADMIN', 'แก้ไขดีลเลอร์', 'ZZTX · สาขาจริงทดสอบล้าง', now()),
  ('บัญชีทดสอบชั่วคราว', 'SUPER_ADMIN', 'นำเข้าผู้สนใจเป็นดีลเลอร์', '${ป้าย}นำเข้า-ทดสอบล้าง.xlsx · เพิ่ม 2 ราย · ข้าม 0 แถว · ชุด 1', now()),
  ('บัญชีทดสอบชั่วคราว', 'SUPER_ADMIN', 'ยกเลิกการนำเข้าผู้สนใจ', '${ป้าย}นำเข้า-ทดสอบล้าง.xlsx · ลบ 2 ราย · ชุด 1', now()),
  ('ผู้ดูแลจริง', 'SUPER_ADMIN', 'นำเข้าผู้สนใจเป็นดีลเลอร์', 'ไฟล์จริง-ทดสอบล้าง.xlsx · เพิ่ม 1 ราย · ข้าม 0 แถว · ชุด 2', now());
${เปิดด่าน}
${ตัวไฟล์}
select concat('เหลือ=', to_jsonb(x)) from (${นับที่เหลือ}) x;
select concat('ทดสอบ=', jsonb_build_object(
  'ชุดนำเข้า', (select count(*) from public.prospect_import_batches where file_name like '${ป้าย}%'),
  'ผู้สนใจ', (select count(*) from public.dealer_prospects where name like '${ป้าย}%'),
  'ใบ', (select count(*) from public.dealer_package_proposals where proposal_no = 'DP-ล้าง-ทดสอบ'),
  'การชำระ', (select count(*) from public.dealer_proposal_payments where reference = 'TR-DP-ล้าง-ทดสอบ'),
  'สาขา', (select count(*) from public.dealers where code = 'ZZTN'),
  'จังหวัด', (select count(*) from public.dealer_territories where dealer_code = 'ZZTN'),
  'บัญชี', (select count(*) from auth.users where lower(email) = '${อีเมลทดสอบ}'),
  'โปรไฟล์', (select count(*) from public.profiles where dealer_code = 'ZZTN'),
  'แจ้งเตือน', (select count(*) from public.notifications where dedupe_key like 'ล้าง-ทดสอบ%'),
  'จดหมาย', (select count(*) from public.email_outbox where dedupe_key = 'ล้าง-จดหมาย-ทดสอบ'),
  'บันทึก', (select count(*) from public.audit_log where target like '%${ป้าย}%' and target not like '%จริง-ทดสอบล้าง' or target = 'ZZTN' or target like 'ZZTN · %' or "user" like '${ป้าย}%')));
select concat('จริง=', jsonb_build_object(
  'ชุดนำเข้า', (select count(*) from public.prospect_import_batches b join public.dealer_prospects x on x.import_batch_id = b.id
                 where b.file_name = 'ไฟล์จริง-ทดสอบล้าง.xlsx' and x.name = 'ผู้สนใจจริง-ทดสอบล้าง'),
  'บันทึกนำเข้า', (select count(*) from public.audit_log where "user" = 'ผู้ดูแลจริง' and target like 'ไฟล์จริง-ทดสอบล้าง.xlsx · %'),
  'ผู้สนใจ', (select count(*) from public.dealer_prospects where name in ('ผู้สนใจจริง-ทดสอบล้าง', 'ZZTEST-ชุดอื่น-ทดสอบล้าง')),
  'ใบ', (select count(*) from public.dealer_package_proposals where proposal_no = 'DP-ล้าง-จริง'),
  'การชำระ', (select count(*) from public.dealer_proposal_payments where reference = 'TR-DP-ล้าง-จริง'),
  'สาขา', (select count(*) from public.dealers where code = 'ZZTX'),
  'จังหวัด', (select count(*) from public.dealer_territories where dealer_code = 'ZZTX' and province = 'ตราด'),
  'บัญชี', (select count(*) from auth.users where lower(email) = 'zztx@dealer.benjaminpebsteel.com'),
  'โปรไฟล์', (select count(*) from public.profiles where dealer_code = 'ZZTX'),
  'แจ้งเตือน', (select count(*) from public.notifications where dedupe_key = 'ล้าง-จริง-hq'),
  'จดหมาย', (select count(*) from public.email_outbox where dedupe_key = 'ล้าง-จดหมาย-จริง'),
  'บันทึก', (select count(*) from public.audit_log where "user" = 'ผู้ดูแลจริง' and target like '%ทดสอบล้าง')));
-- ลบแถวจริงจำลองออก แล้วจำนวนทั้งตารางต้องเท่าก่อนใส่ = ไม่มีแถวจริงของฐานหายไปแม้แถวเดียว
${ปิดด่าน}
delete from public.dealer_prospects where name in ('ผู้สนใจจริง-ทดสอบล้าง', 'ZZTEST-ชุดอื่น-ทดสอบล้าง') and dealer_code is null;
${เปิดด่าน}
alter table public.dealer_proposal_payments disable trigger dealer_proposal_payments_guard;
alter table public.dealer_package_proposals disable trigger dealer_package_proposals_before_delete;
delete from public.dealer_proposal_payments where reference = 'TR-DP-ล้าง-จริง';
delete from public.dealer_package_proposals where proposal_no = 'DP-ล้าง-จริง';
delete from public.profiles where dealer_code = 'ZZTX';
delete from auth.users where lower(email) = 'zztx@dealer.benjaminpebsteel.com';
update public.dealers set prospect_id = null where code = 'ZZTX';
delete from public.dealer_prospects where name = 'ผู้สนใจจริง-ทดสอบล้าง';
delete from public.dealers where code = 'ZZTX';
delete from public.prospect_import_batches where file_name = 'ไฟล์จริง-ทดสอบล้าง.xlsx';
delete from public.email_outbox where dedupe_key = 'ล้าง-จดหมาย-จริง';
select 'ก่อน=' || (select n from ก่อนใส่)::text;
select 'หลัง=' || ${นับทุกตาราง}::text;
rollback;
`);
  const ออก = (หลัก.stdout ?? "") + (หลัก.stderr ?? "");
  const err = /ERROR:.*$/m.exec(ออก)?.[0];
  ผล(หลัก.status === 0 && !err, "รันชุดล้างจบโดยไม่มีข้อผิดพลาด (ตัวดักที่ตารางไม่ขวาง)", err ?? ออก);
  const อ่าน = (ป้ายผล) => { try { return JSON.parse(new RegExp(`^${ป้ายผล}=(\\{.*\\})$`, "m").exec(ออก)?.[1] ?? "null"); } catch { return null; } };
  const ทดสอบ = อ่าน("ทดสอบ"), จริง = อ่าน("จริง");
  ผล(!!ทดสอบ && Object.values(ทดสอบ).every(n => n === 0), `แถวทดสอบหายครบ ${JSON.stringify(ทดสอบ)}`, ออก);
  const เหลือ = อ่าน("เหลือ");
  ผล(!!เหลือ && Object.keys(เหลือ).length > 0 && Object.values(เหลือ).every(n => Number(n) === 0), `ขั้นนับที่เหลือของ run.mjs (cleanup-left) = 0 ทุกช่อง ${JSON.stringify(เหลือ)}`, ออก);
  const คาดจริง = { ชุดนำเข้า: 1, บันทึกนำเข้า: 1, ผู้สนใจ: 2, ใบ: 1, การชำระ: 1, สาขา: 1, จังหวัด: 1, บัญชี: 1, โปรไฟล์: 1, แจ้งเตือน: 1, จดหมาย: 1, บันทึก: 2 };
  ผล(!!จริง && Object.entries(คาดจริง).every(([k, v]) => จริง[k] === v), `แถวจริงอยู่ครบ ${JSON.stringify(จริง)}`, ออก);
  const ก่อนj = อ่าน("ก่อน"), หลังj = อ่าน("หลัง");
  ผล(!!ก่อนj && JSON.stringify(ก่อนj) === JSON.stringify(หลังj), `จำนวนแถวทุกตาราง (รวมตารางจังหวัดกลาง) เท่าก่อนใส่แถวทดสอบ ${JSON.stringify(หลังj)}`, `ก่อน ${JSON.stringify(ก่อนj)} หลัง ${JSON.stringify(หลังj)}
${ออก}`);

  // ── ด่านกันพลาด: ยกเลิกทั้งหมด ──
  const เตรียมด่าน = (แถว) => `
begin;
set local client_min_messages = warning;
${ปิดด่าน}
${แถว}
${เปิดด่าน}
${ตัวไฟล์}
rollback;
`;
  for (const [ชื่อกรณี, แถว, ข้อความ] of [
    ["สาขา ZZTN ชื่อไม่ขึ้นต้นป้ายทดสอบ", สาขา("ZZTN", "ดีลเลอร์จริงรหัสซ้ำ", "ตราด"), "ZZTN ไม่ใช่สาขาทดสอบ"],
    ["ผู้สนใจทดสอบผูกกับดีลเลอร์อื่น", `insert into public.dealer_prospects (name, phone, region, province, status, dealer_code) values ('${ป้าย}2', '000-000-0001', 'ตะวันออก', 'ตราด', 'won', 'RYG');`, "ผู้สนใจทดสอบผูกกับดีลเลอร์อื่น"],
    ["สาขา ZZTN ผูกกับผู้สนใจจริง", `insert into public.dealer_prospects (name, phone, region, province, status) values ('ผู้สนใจจริง-ทดสอบล้าง', '000-000-0002', 'ตะวันออก', 'ตราด', 'won');
${สาขา("ZZTN", `${ป้าย}3`, "ตราด", "(select id from public.dealer_prospects where name = 'ผู้สนใจจริง-ทดสอบล้าง')")}`, "ZZTN ผูกกับผู้สนใจจริง"],
    ["ชุดนำเข้าทดสอบมีผู้สนใจจริง", `insert into public.prospect_import_batches (file_name, created_by) values ('${ป้าย}นำเข้า-ด่าน.xlsx', 'บัญชีทดสอบชั่วคราว');
insert into public.dealer_prospects (name, phone, region, province, status, import_batch_id)
  select 'ผู้สนใจจริง-ทดสอบล้าง', '000-000-0002', 'ตะวันออก', 'ตราด', 'new', id from public.prospect_import_batches where file_name = '${ป้าย}นำเข้า-ด่าน.xlsx';`, "ชุดนำเข้าทดสอบมีผู้สนใจจริง"],
    ["สาขา ZZTN มีบัญชีอื่นปน", `${สาขา("ZZTN", `${ป้าย}4`, "ตราด")}
${บัญชี("00000000-0000-4000-8000-0000000000a3", "คนจริง@example.test", "ZZTN")}`, "ZZTN มีบัญชีอื่น"],
  ]) {
    const r = รัน(เตรียมด่าน(แถว));
    const ข้อ = (r.stdout ?? "") + (r.stderr ?? "");
    ผล(r.status !== 0 && ข้อ.includes(ข้อความ), `ด่านกันพลาด: ${ชื่อกรณี} → ยกเลิกทั้งหมด`, ข้อ);
  }
} finally {
  ล็อก.release();
}
console.log(ตก ? `FAIL ${ตก}` : "ALL PASS");
process.exit(ตก ? 1 : 0);
