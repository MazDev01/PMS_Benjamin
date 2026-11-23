// ── ข้อทดสอบ: ซ้อมลงใบ 0296 (รายการกลาง: ช่องทางที่มา · ประเภทนัดหมาย · เหตุผลผู้สนใจไม่สำเร็จ) แบบ db push บนฐานแยกชั่วคราว ──
//   บอสตัดสิน 19 พ.ย. 69 "ตั้งค่ารายการกลาง" · ใบแปลงข้อมูล (ชื่อที่ตรงรายการ → รหัส) จึงต้องซ้อมบนฐานที่มีข้อมูลก่อนลงใบ (check-migration-rehearsal)
//   ก่อนลงใบ (ปิดตัวดัก): สาขา ZZA · ลีด 5 ราย ช่องทาง Facebook / Walk-in / อื่นๆ / TikTok (นอกรายการ) / ลูกค้าเดิม (ดีลใหม่)
//     · นัด 3 นัด ประเภท call / "นัดพบลูกค้า" (ชื่อ) / zz_unknown · ผู้สนใจไม่สำเร็จ "เงินทุนไม่พอ" / "ไม่มีหน้าร้าน" (HQ เคยตั้งเพิ่ม) / "ย้ายไปต่างประเทศ" (พิมพ์เอง)
//     · ผู้สนใจขั้นนัดคุย 1 ราย · ใบค่าแฟรนไชส์ปฏิเสธ "ยังไม่พร้อม" + หมดอายุ (ข้อความระบบ) · ค่าตั้งหาดีลเลอร์ lostReasons มี "ไม่มีหน้าร้าน"
//   หลังลงใบ (ผู้ใช้จำลองด้วย request.jwt.claims):
//     ค่าตั้งต้นครบ 3 รายการ · แปลงชื่อ → รหัส (ค่านอกรายการคงเดิม) · ป้ายของค่า (_option_label) · ตั้งเพิ่มของ HQ ยกมาเป็นตัวเลือก
//     · ดีลเลอร์อ่านได้ แก้/ลบ/บันทึกไม่ได้ · HQ แก้ชื่อ/ซ่อน/เรียงได้ · ลบตัวที่มีข้อมูลใช้ = option_in_use (ทั้งลบตรงและผ่านคำสั่งบันทึก)
//     · ลบตัวที่ไม่มีข้อมูลได้ · แก้รหัสไม่ได้ · ชื่อซ้ำ (ตัวที่แสดง) = ปฏิเสธ · "อื่นๆ" ถูกจัดเป็น "อื่น ๆ" · ตัวที่มีข้อมูลใช้ (HQ เห็น · ดีลเลอร์ว่าง)
//     · ประวัติผู้สนใจ/บันทึกการใช้งานเขียนชื่อเหตุผล ไม่ใช่รหัส
//   ลงใบไม่มี WARNING · ตกบนโค้ดเดิม: ไม่มีใบ 0296 (ซ้อมใบโยน "ไม่พบใบ")
// รัน: node tests/tools/migration-0296.test.mjs   (ต้องมี docker + ฐานทดสอบเปิดอยู่ · ไม่แตะข้อมูลฐานทดสอบร่วม)
import { existsSync } from "node:fs";
import { ซ้อมใบ } from "../../scripts/lib/migrationRehearsal.mjs";

let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n   ${String(เพิ่ม).slice(0, 1500)}`}`); };
const ใบ = "0296_option_lists.sql";
ผล(existsSync(`supabase/migrations/${ใบ}`), `มีใบ ${ใบ}`);

// auth.uid() ของฐานซ้อมอ่าน request.jwt.claim.sub → ตั้งทั้งสองแบบ (แบบเดียวกับ migration-0288-0289.test.mjs)
const ผู้ใช้ = (บทบาท, สาขา, id) => `select set_config('request.jwt.claim.sub', '${id}', false); select set_config('request.jwt.claims', json_build_object('sub', '${id}', 'role', 'authenticated', 'user_role', '${บทบาท}', 'dealer_code', '${สาขา}')::text, false); set role authenticated;`;
const ราก = `reset role; select set_config('request.jwt.claims', '', false); select set_config('request.jwt.claim.sub', '', false);`;
const HQ = "00000000-0000-4000-8000-000000002903", ดีลเลอร์ = "00000000-0000-4000-8000-000000002901";
const ก่อนลงใบ = `set session_replication_role = replica;
insert into auth.users (id, email, instance_id, aud, role) values
  ('${ดีลเลอร์}', 'zza-0290@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('${HQ}', 'zzhq-0290@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
insert into public.dealers (code, name, province, region, status) values ('ZZA', 'ZZTEST ก', 'ตราด', 'ตะวันออก', 'active');
insert into public.profiles (id, name, role, status, dealer_code) values
  ('${ดีลเลอร์}', 'ZZTEST ผู้จัดการ ก', 'DEALER_ADMIN', 'active', 'ZZA'),
  ('${HQ}', 'ZZTEST HQ', 'SUPER_ADMIN', 'active', '');
insert into public.leads (id, num_id, dealer_code, company, name, status, province, source) values
  ('#L-1', 1, 'ZZA', 'ZZTEST ลูกค้า 1', 'ZZTEST ลูกค้า 1', 'WAITING', 'ตราด', 'Facebook'),
  ('#L-2', 2, 'ZZA', 'ZZTEST ลูกค้า 2', 'ZZTEST ลูกค้า 2', 'WAITING', 'ตราด', 'Walk-in'),
  ('#L-3', 3, 'ZZA', 'ZZTEST ลูกค้า 3', 'ZZTEST ลูกค้า 3', 'WAITING', 'ตราด', 'อื่นๆ'),
  ('#L-4', 4, 'ZZA', 'ZZTEST ลูกค้า 4', 'ZZTEST ลูกค้า 4', 'WAITING', 'ตราด', 'TikTok'),
  ('#L-5', 5, 'ZZA', 'ZZTEST ลูกค้า 5', 'ZZTEST ลูกค้า 5', 'WAITING', 'ตราด', 'ลูกค้าเดิม (ดีลใหม่)');
insert into public.appointments (id, dealer_code, lead_id, company, contact, project, province, date, time, type, status, note) values
  (1, 'ZZA', 1, 'ZZTEST ลูกค้า 1', 'ผู้ทดสอบ', 'โทร', 'ตราด', '2026-11-20', '10:00', 'call', 'upcoming', ''),
  (2, 'ZZA', 1, 'ZZTEST ลูกค้า 1', 'ผู้ทดสอบ', 'พบ', 'ตราด', '2026-11-21', '10:00', 'นัดพบลูกค้า', 'upcoming', ''),
  (3, 'ZZA', 1, 'ZZTEST ลูกค้า 1', 'ผู้ทดสอบ', 'อื่น', 'ตราด', '2026-11-22', '10:00', 'zz_unknown', 'upcoming', '');
insert into public.dealer_prospects (id, name, phone, province, region, status, lost_reason) values
  (902901, 'ZZTEST ผู้สนใจ 1', '000-000-2901', 'ตราด', 'ตะวันออก', 'lost', 'เงินทุนไม่พอ'),
  (902902, 'ZZTEST ผู้สนใจ 2', '000-000-2902', 'ตราด', 'ตะวันออก', 'lost', 'ไม่มีหน้าร้าน'),
  (902903, 'ZZTEST ผู้สนใจ 3', '000-000-2903', 'ตราด', 'ตะวันออก', 'lost', 'ย้ายไปต่างประเทศ'),
  (902904, 'ZZTEST ผู้สนใจ 4', '000-000-2904', 'ตราด', 'ตะวันออก', 'meeting', null);
insert into public.dealer_package_proposals (prospect_id, proposal_no, version, status, amount, contract_months, annual_target, region, province, proposed_date, valid_until, terms, close_reason) values
  (902901, 'DP-ZZ-2901', 1, 'rejected', 100000, 12, 1000000, 'ตะวันออก', 'ตราด', '2026-11-01', '2026-11-30', '-', 'ยังไม่พร้อม'),
  (902902, 'DP-ZZ-2902', 1, 'expired', 100000, 12, 1000000, 'ตะวันออก', 'ตราด', '2026-10-01', '2026-10-08', '-', 'หมดอายุ — เลยวันยืนราคา 08/10/2569');
update public.hq_recruit_settings set config = jsonb_set(coalesce(config, '{}'::jsonb), '{lostReasons}', '["เงินทุนไม่พอ", "ไม่มีหน้าร้าน", "ยังไม่พร้อม"]'::jsonb, true) where id = 1;
set session_replication_role = origin;`;

// ลองคำสั่งด้วยสิทธิ์ผู้ใช้ที่ตั้งไว้ → "ผ่าน" หรือข้อความผิดพลาด — ฟังก์ชันชั่วคราวบนฐานซ้อม (security invoker)
const ตัวลอง = `create function public.zz_ลอง(p text) returns text language plpgsql as $f$
begin execute p; return 'ผ่าน'; exception when others then return sqlerrm; end $f$;
grant execute on function public.zz_ลอง(text) to authenticated;`;
const ลอง = (ป้าย, sql) => `select '${ป้าย}=' || public.zz_ลอง(${"$"}q${"$"}${sql}${"$"}q${"$"});`;
// บันทึกทั้งรายการของ lead_source ใหม่ (ลำดับ/ชื่อ/ซ่อนตามที่ส่ง) — ตัวที่ไม่อยู่ในชุด = ลบ
const ชุดช่องทาง = (แถว) => `select option_lists_save('lead_source', '${JSON.stringify(แถว)}'::jsonb)`;
const ช่องทางทั้งหมด = (แก้ = {}) => ["facebook", "website", "line", "walk_in", "referral", "exhibition", "other", "repeat_customer"]
  .filter(c => !(แก้.ลบ ?? []).includes(c))
  .map(c => ({ code: c, label: แก้.ชื่อ?.[c] ?? ({ facebook: "Facebook", website: "เว็บไซต์", line: "LINE", walk_in: "ลูกค้าเข้ามาเอง", referral: "แนะนำต่อ", exhibition: "งานแสดงสินค้า", other: "อื่น ๆ", repeat_customer: "ลูกค้าเดิม (งานขายใหม่)" })[c], hidden: (แก้.ซ่อน ?? ["repeat_customer"]).includes(c) }));

const หลังลงใบ = `${ตัวลอง}
select 'จำนวน=' || (select string_agg(list || ':' || n, ',' order by list) from (select list, count(*) n from public.option_lists group by list) x);
select 'อื่นๆ=' || (select count(*) from public.option_lists where label like '%อื่นๆ%');
select 'ลีด=' || (select string_agg(num_id || ':' || source, ',' order by num_id) from public.leads where dealer_code = 'ZZA');
select 'นัด=' || (select string_agg(id || ':' || type, ',' order by id) from public.appointments where dealer_code = 'ZZA');
select 'ผู้สนใจ=' || (select string_agg(id || ':' || coalesce(lost_reason, '-'), ',' order by id) from public.dealer_prospects where id between 902901 and 902903);
select 'ตั้งเพิ่ม=' || coalesce((select code || '|' || label from public.option_lists where list = 'prospect_lost_reason' and label = 'ไม่มีหน้าร้าน'), 'ไม่มี');
select 'ใบ=' || (select string_agg(proposal_no || ':' || close_reason, ',' order by proposal_no) from public.dealer_package_proposals where proposal_no like 'DP-ZZ-%');
select 'ป้ายนอก=' || public._option_label('lead_source', 'TikTok');
select 'ป้ายระบุ=' || public._option_label('prospect_lost_reason', 'other:ย้ายไปต่างประเทศ');
select 'ป้ายรหัส=' || public._option_label('appointment_type', 'site_visit');
select 'config=' || (select config -> 'lostReasons' from public.hq_recruit_settings where id = 1)::text;
${ผู้ใช้("DEALER_ADMIN", "ZZA", ดีลเลอร์)}
select 'ดีลเลอร์อ่าน=' || (select count(*) from public.option_lists);
${ลอง("ดีลเลอร์แก้ตรง", "update public.option_lists set label = 'แอบแก้' where list = 'lead_source' and code = 'line'")}
${ลอง("ดีลเลอร์ลบตรง", "delete from public.option_lists where list = 'lead_source' and code = 'exhibition'")}
${ลอง("ดีลเลอร์บันทึก", ชุดช่องทาง(ช่องทางทั้งหมด()))}
select 'ดีลเลอร์ใช้อยู่=' || public.option_lists_used()::text;
${ราก}${ผู้ใช้("SUPER_ADMIN", "", HQ)}
select 'HQใช้อยู่=' || (select string_agg(x ->> 'list' || ':' || (x ->> 'code'), ',' order by x ->> 'list', x ->> 'code') from jsonb_array_elements(public.option_lists_used()) x);
${ลอง("HQลบที่ใช้", "delete from public.option_lists where list = 'lead_source' and code = 'facebook'")}
${ลอง("HQบันทึกลบที่ใช้", ชุดช่องทาง(ช่องทางทั้งหมด({ ลบ: ["facebook"] })))}
${ลอง("HQแก้รหัส", "update public.option_lists set code = 'fb' where list = 'lead_source' and code = 'facebook'")}
${ลอง("HQชื่อซ้ำ", ชุดช่องทาง(ช่องทางทั้งหมด({ ชื่อ: { website: "LINE" } })))}
${ลอง("HQซ่อนหมด", ชุดช่องทาง(ช่องทางทั้งหมด({ ซ่อน: ["facebook", "website", "line", "walk_in", "referral", "exhibition", "other", "repeat_customer"] })))}
${ลอง("HQบันทึก", ชุดช่องทาง([...ช่องทางทั้งหมด({ ชื่อ: { facebook: "เฟซบุ๊ก", other: "อื่นๆ" }, ซ่อน: ["repeat_customer", "line"], ลบ: ["exhibition"] }), { label: "TikTok ใหม่", hidden: false }]))}
${ลอง("HQไม่สำเร็จ", "update public.dealer_prospects set status = 'lost', lost_reason = 'not_ready' where id = 902904")}
${ราก}
select 'หลังบันทึก=' || (select string_agg(code || ':' || label || ':' || hidden, ',' order by sort) from public.option_lists where list = 'lead_source' and code <> 'repeat_customer' and code not like 'c%');
select 'ตัวใหม่=' || (select count(*) from public.option_lists where list = 'lead_source' and label = 'TikTok ใหม่' and code ~ '^c[0-9a-f]{12}$');
select 'ป้ายลีดหลังแก้=' || public._option_label('lead_source', (select source from public.leads where dealer_code = 'ZZA' and num_id = 1));
select 'ไม่ถูกแอบแก้=' || (select count(*) from public.option_lists where label = 'แอบแก้');
select 'ประวัติ=' || (select count(*) from public.dealer_prospect_activities where prospect_id = 902904 and body like '%เหตุผล: ยังไม่พร้อม%');
select 'บันทึกการใช้งาน=' || (select count(*) from public.audit_log where action = 'ตั้งค่ารายการกลาง');`;

try {
  const r = ซ้อมใบ({ ใบ, ก่อนลงใบ, หลังลงใบ });
  const ค่า = (k) => new RegExp(`(?:^|NOTICE:\\s+)${k}=(.*)$`, "m").exec(r.ผลตรวจ)?.[1]?.trim() ?? "(ไม่มีบรรทัด)";
  ผล(r.warnings.length === 0, "ลงใบแบบ db push ไม่มี WARNING", r.warnings.join("\n"));
  ผล(ค่า("จำนวน") === "appointment_type:9,lead_source:8,prospect_lost_reason:6", "ค่าตั้งต้นครบ 3 รายการ (+ เหตุผลที่ HQ ตั้งเพิ่ม 1)", ค่า("จำนวน"));
  ผล(ค่า("อื่นๆ") === "0", "ไม่มีชื่อ อื่นๆ (ไม่เว้นวรรค) ในรายการ", ค่า("อื่นๆ"));
  ผล(ค่า("ลีด") === "1:facebook,2:walk_in,3:other,4:TikTok,5:repeat_customer", "ช่องทางที่มา: ชื่อ/ชื่อเดิม → รหัส · นอกรายการคงเดิม", ค่า("ลีด"));
  ผล(ค่า("นัด") === "1:call,2:visit,3:zz_unknown", "ประเภทนัด: รหัสคงเดิม · ชื่อ → รหัส · ไม่รู้จักคงเดิม", ค่า("นัด"));
  ผล(/^r_[0-9a-f]{10}\|ไม่มีหน้าร้าน$/.test(ค่า("ตั้งเพิ่ม")), "เหตุผลที่ HQ เคยตั้งเพิ่ม (config.lostReasons) ยกมาเป็นตัวเลือก", ค่า("ตั้งเพิ่ม"));
  ผล(/^902901:no_capital,902902:r_[0-9a-f]{10},902903:ย้ายไปต่างประเทศ$/.test(ค่า("ผู้สนใจ")), "เหตุผลผู้สนใจ: ชื่อในรายการ → รหัส · พิมพ์เองคงเดิม", ค่า("ผู้สนใจ"));
  ผล(ค่า("ใบ") === "DP-ZZ-2901:not_ready,DP-ZZ-2902:หมดอายุ — เลยวันยืนราคา 08/10/2569", "ใบที่ปฏิเสธ → รหัส · หมดอายุ (ข้อความระบบ) คงเดิม", ค่า("ใบ"));
  ผล(ค่า("ป้ายนอก") === "TikTok (ตามที่บันทึกไว้)", "ป้ายค่านอกรายการ = (ตามที่บันทึกไว้)", ค่า("ป้ายนอก"));
  ผล(ค่า("ป้ายระบุ") === "อื่น ๆ: ย้ายไปต่างประเทศ", "ป้ายตัวเลือกระบุเอง = อื่น ๆ: ข้อความ", ค่า("ป้ายระบุ"));
  ผล(ค่า("ป้ายรหัส") === "นัดดูหน้างาน", "site_visit = นัดดูหน้างาน", ค่า("ป้ายรหัส"));
  ผล(ค่า("config").includes("ไม่มีหน้าร้าน"), "ค่าเดิมใน hq_recruit_settings.config ไม่ถูกแตะ", ค่า("config"));
  ผล(Number(ค่า("ดีลเลอร์อ่าน")) >= 22, "ดีลเลอร์อ่านรายการกลางได้", ค่า("ดีลเลอร์อ่าน"));
  ผล(ค่า("ดีลเลอร์บันทึก").startsWith("forbidden:"), "ดีลเลอร์บันทึกรายการกลางไม่ได้", ค่า("ดีลเลอร์บันทึก"));
  ผล(ค่า("ดีลเลอร์ใช้อยู่") === "[]", "ดีลเลอร์ถามตัวที่มีข้อมูลใช้ = ว่าง", ค่า("ดีลเลอร์ใช้อยู่"));
  ผล(ค่า("ไม่ถูกแอบแก้") === "0", "ดีลเลอร์แก้ตรงที่ตารางไม่ได้ (กฎรายแถว)", ค่า("ไม่ถูกแอบแก้"));
  ผล(ค่า("HQใช้อยู่").includes("lead_source:facebook") && ค่า("HQใช้อยู่").includes("appointment_type:call") && !ค่า("HQใช้อยู่").includes("lead_source:exhibition"),
    "HQ เห็นตัวที่มีข้อมูลใช้ (facebook · call) · ตัวที่ไม่มีข้อมูลไม่อยู่", ค่า("HQใช้อยู่"));
  ผล(ค่า("HQลบที่ใช้").startsWith("option_in_use:"), "ลบตรงตัวที่มีข้อมูลใช้ = option_in_use", ค่า("HQลบที่ใช้"));
  ผล(ค่า("HQบันทึกลบที่ใช้").startsWith("option_in_use:"), "บันทึกชุดที่ไม่มีตัวที่มีข้อมูลใช้ = option_in_use (ทั้งชุดไม่ลง)", ค่า("HQบันทึกลบที่ใช้"));
  ผล(ค่า("HQแก้รหัส").startsWith("option_code_locked:"), "แก้รหัสไม่ได้", ค่า("HQแก้รหัส"));
  ผล(ค่า("HQชื่อซ้ำ").startsWith("option_label_duplicate:"), "ตัวที่แสดงชื่อซ้ำ = ปฏิเสธ", ค่า("HQชื่อซ้ำ"));
  ผล(ค่า("HQซ่อนหมด").startsWith("option_list_all_hidden:"), "ซ่อนหมด = ปฏิเสธ", ค่า("HQซ่อนหมด"));
  ผล(ค่า("HQบันทึก") === "ผ่าน", "HQ บันทึก: แก้ชื่อ · ซ่อน · ลบตัวที่ไม่มีข้อมูล · เพิ่มตัวใหม่", ค่า("HQบันทึก"));
  ผล(ค่า("หลังบันทึก") === "facebook:เฟซบุ๊ก:false,website:เว็บไซต์:false,line:LINE:true,walk_in:ลูกค้าเข้ามาเอง:false,referral:แนะนำต่อ:false,other:อื่น ๆ:false",
    "ผลบันทึก: ชื่อใหม่ · ซ่อน · exhibition ถูกลบ · อื่นๆ → อื่น ๆ · ลำดับตามที่ส่ง", ค่า("หลังบันทึก"));
  ผล(ค่า("ตัวใหม่") === "1", "ตัวใหม่ได้รหัสจากฐาน (c + 12 หลัก)", ค่า("ตัวใหม่"));
  ผล(ค่า("ป้ายลีดหลังแก้") === "เฟซบุ๊ก", "แก้ชื่อแล้วข้อมูลเดิมเห็นชื่อใหม่", ค่า("ป้ายลีดหลังแก้"));
  ผล(ค่า("HQไม่สำเร็จ") === "ผ่าน" && ค่า("ประวัติ") === "1", "ประวัติผู้สนใจเขียนชื่อเหตุผล (ไม่ใช่รหัส)", `${ค่า("HQไม่สำเร็จ")} · ${ค่า("ประวัติ")}`);
  ผล(Number(ค่า("บันทึกการใช้งาน")) >= 1, "บันทึกรายการกลาง = ลงบันทึกการใช้งาน", ค่า("บันทึกการใช้งาน"));
} catch (e) {
  ผล(false, "ซ้อมลงใบ 0296 + ตรวจ", e.message);
}
console.log(ตก ? `\n✗ ตก ${ตก} ข้อ` : "\nALL PASS");
process.exit(ตก ? 1 : 0);
