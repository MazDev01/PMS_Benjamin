// ── ข้อทดสอบ: ซ้อมลงใบ 0288 (ย้อนใบ won = ดีลเลอร์ · HQ ดูอย่างเดียว) + 0289 (หัวใบพิมพ์มีอีเมล/เว็บไซต์) แบบ db push บนฐานแยกชั่วคราว ──
//   คนรวมงานสั่ง 19 พ.ย. 69 "ซ้อมใบทั้งสอง" · ไม่ห่อ transaction (ซ้อมใบ) · ลงใบทุกใบถึง 0289 บนฐานที่มีข้อมูลก่อนลงใบ
//   ก่อนลงใบ: สาขา ZZA (ข้อมูลบริษัทครบ + อีเมล/เว็บไซต์) · ลีด PAID + ใบ won ของ ZZA · ใบ won อายุ 10 วันของ ZZA · สาขา ZZB ข้อมูลบริษัทไม่มีอีเมล
//   หลังลงใบ (ผู้ใช้จำลองด้วย request.jwt.claims):
//     0288 · เรื่องแจ้งเตือน won_reverted_by_dealer มี (HQ · ปิดไม่ได้) · HQ ย้อน = forbidden · ดีลเลอร์สาขาอื่น = forbidden · ไม่มีเหตุผล = ปฏิเสธ
//          · ใบ won เกิน 7 วัน = revert_window · ดีลเลอร์เจ้าของใบ ภายใน 7 วัน = ใบกลับส่งแล้ว · ลีดออกจาก PAID · ไทม์ไลน์ · บันทึกการใช้งาน · แจ้ง HQ 1
//     0289 · พิมพ์ใบ ZZA คืนอีเมล/เว็บไซต์ · ZZB คืนอีเมล/เว็บไซต์ว่าง · บันทึกการพิมพ์ยังจด
//   ลงใบไม่มี WARNING · ตกบนโค้ดเดิม: ไม่มีใบ 0288/0289 (ซ้อมใบโยน "ไม่พบใบ")
// รัน: node tests/tools/migration-0288-0289.test.mjs   (ต้องมี docker + ฐานทดสอบเปิดอยู่ · ไม่แตะข้อมูลฐานทดสอบร่วม)
import { existsSync } from "node:fs";
import { ซ้อมใบ } from "../../scripts/lib/migrationRehearsal.mjs";

let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n   ${String(เพิ่ม).slice(0, 1500)}`}`); };
const ใบ = "0289_print_issuer_contact.sql";
ผล(existsSync("supabase/migrations/0288_dealer_revert_won.sql"), "มีใบ 0288_dealer_revert_won.sql");
ผล(existsSync(`supabase/migrations/${ใบ}`), `มีใบ ${ใบ}`);

// auth.uid() ของฐานซ้อมอ่าน request.jwt.claim.sub → ตั้งทั้งสองแบบ
const ผู้ใช้ = (บทบาท, สาขา, id) => `select set_config('request.jwt.claim.sub', '${id}', false); select set_config('request.jwt.claims', json_build_object('sub', '${id}', 'role', 'authenticated', 'user_role', '${บทบาท}', 'dealer_code', '${สาขา}')::text, false); set role authenticated;`;
const ราก = `reset role; select set_config('request.jwt.claims', '', false); select set_config('request.jwt.claim.sub', '', false);`;
const ก่อนลงใบ = `set session_replication_role = replica;
insert into auth.users (id, email, instance_id, aud, role) values
  ('00000000-0000-4000-8000-000000002881', 'zza@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-000000002882', 'zzb@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-000000002883', 'zzhq@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
insert into public.dealers (code, name, province, region, status) values ('ZZA', 'ZZTEST ก', 'ตราด', 'ตะวันออก', 'active'), ('ZZB', 'ZZTEST ข', 'ตราด', 'ตะวันออก', 'active');
insert into public.profiles (id, name, role, status, dealer_code) values
  ('00000000-0000-4000-8000-000000002881', 'ZZTEST ผู้จัดการ ก', 'DEALER_ADMIN', 'active', 'ZZA'),
  ('00000000-0000-4000-8000-000000002882', 'ZZTEST ผู้จัดการ ข', 'DEALER_ADMIN', 'active', 'ZZB'),
  ('00000000-0000-4000-8000-000000002883', 'ZZTEST HQ', 'SUPER_ADMIN', 'active', '');
insert into public.dealer_settings (dealer_code, issuer) values
  ('ZZA', '{"company":"บริษัท ก (ตัวอย่าง) จำกัด","address":"1 ถ.ทดสอบ ต.บางพระ อ.เมืองตราด จ.ตราด 23000","phone":"000-000-0281","taxId":"0000000000281","email":"zza@example.test","website":"https://zza.example.test"}'),
  ('ZZB', '{"company":"บริษัท ข (ตัวอย่าง) จำกัด","address":"2 ถ.ทดสอบ","phone":"000-000-0282","taxId":"0000000000282"}');
insert into public.customers (id, dealer_code, company, name) overriding system value values (1, 'ZZA', 'ZZTEST ลูกค้า ก', 'ZZTEST ลูกค้า ก'), (2, 'ZZA', 'ZZTEST ลูกค้า เก่า', 'ZZTEST ลูกค้า เก่า');
insert into public.leads (id, num_id, dealer_code, company, name, status, province, status_before_paid) values
  ('#L-1', 1, 'ZZA', 'ZZTEST ลูกค้า ก', 'ZZTEST ลูกค้า ก', 'PAID', 'ตราด', 'QUOTED'),
  ('#L-2', 2, 'ZZA', 'ZZTEST ลูกค้า เก่า', 'ZZTEST ลูกค้า เก่า', 'PAID', 'ตราด', 'QUOTED');
insert into public.quotations (id, dealer_code, customer, project, total, total_value, status, date, items, line_items, deal_id, customer_id) values
  ('Q-ZZA-1', 'ZZA', 'ZZTEST ลูกค้า ก', 'โกดัง', '฿100,000', 100000, 'won', '2026-11-18', 1, '[]', 1, 1),
  ('Q-ZZA-2', 'ZZA', 'ZZTEST ลูกค้า เก่า', 'โกดัง', '฿100,000', 100000, 'won', '2026-11-01', 1, '[]', 2, 2),
  ('Q-ZZB-1', 'ZZB', 'ZZTEST ลูกค้า ข', 'โกดัง', '฿100,000', 100000, 'sent_to_client', '2026-11-18', 1, '[]', null, null);
insert into public.quotation_won_at (dealer_code, quote_id, won_at) values ('ZZA', 'Q-ZZA-1', now() - interval '1 day'), ('ZZA', 'Q-ZZA-2', now() - interval '10 days');
set session_replication_role = origin;`;

// ลองคำสั่งด้วยสิทธิ์ผู้ใช้ที่ตั้งไว้ → "ผ่าน" หรือรหัสข้อผิดพลาด (ส่วนหน้า ":") — ฟังก์ชันชั่วคราวบนฐานซ้อม (security invoker)
const ตัวลอง = `create function public.zz_ลอง(p text) returns text language plpgsql as $f$
begin execute p; return 'ผ่าน'; exception when others then return sqlerrm; end $f$;
grant execute on function public.zz_ลอง(text) to authenticated;`;
const ลอง = (ป้าย, sql) => `select '${ป้าย}=' || public.zz_ลอง(${"$"}q${"$"}${sql}${"$"}q${"$"});`;
const หลังลงใบ = `${ตัวลอง}
select 'เรื่องแจ้ง=' || coalesce((select audience || '|' || locked || '|' || flow_row from public.notification_kinds where kind = 'won_reverted_by_dealer'), 'ไม่มี');
${ผู้ใช้("SUPER_ADMIN", "", "00000000-0000-4000-8000-000000002883")}
${ลอง("HQย้อน", "select quotation_revert_won('ZZA', 'Q-ZZA-1', 'ทดสอบ')")}
${ราก}${ผู้ใช้("DEALER_ADMIN", "ZZB", "00000000-0000-4000-8000-000000002882")}
${ลอง("สาขาอื่นย้อน", "select quotation_revert_won('ZZA', 'Q-ZZA-1', 'ทดสอบ')")}
${ราก}${ผู้ใช้("DEALER_ADMIN", "ZZA", "00000000-0000-4000-8000-000000002881")}
${ลอง("ไม่มีเหตุผล", "select quotation_revert_won('ZZA', 'Q-ZZA-1', '  ')")}
${ลอง("เกิน7วัน", "select quotation_revert_won('ZZA', 'Q-ZZA-2', 'ทดสอบ')")}
${ลอง("เจ้าของย้อน", "select quotation_revert_won('ZZA', 'Q-ZZA-1', 'ลูกค้าขอเลื่อน')")}
select 'พิมพ์ก=' || (quotation_print_data('ZZA', 'Q-ZZA-1') -> 'issuer' ->> 'email') || '|' || (quotation_print_data('ZZA', 'Q-ZZA-1') -> 'issuer' ->> 'website');
${ราก}${ผู้ใช้("DEALER_ADMIN", "ZZB", "00000000-0000-4000-8000-000000002882")}
select 'พิมพ์ข=[' || (quotation_print_data('ZZB', 'Q-ZZB-1') -> 'issuer' ->> 'email') || '|' || (quotation_print_data('ZZB', 'Q-ZZB-1') -> 'issuer' ->> 'website') || ']';
${ราก}
select 'ใบ=' || (select string_agg(id || ':' || status, ',' order by id) from public.quotations where dealer_code = 'ZZA');
select 'ลีด=' || (select string_agg(num_id || ':' || status, ',' order by num_id) from public.leads where dealer_code = 'ZZA');
select 'ไทม์ไลน์=' || (select count(*) from public.leads l, jsonb_array_elements(l.activities) x where l.dealer_code = 'ZZA' and l.num_id = 1 and x->>'text' like '%ลูกค้าขอเลื่อน%');
select 'บันทึก=' || (select count(*) from public.audit_log where target like '%Q-ZZA-1%');
select 'แจ้งHQ=' || (select count(*) from public.notifications where kind = 'won_reverted_by_dealer' and body like '%Q-ZZA-1%');
select 'พิมพ์จด=' || (select count(*) from public.quotation_prints where quote_id in ('Q-ZZA-1', 'Q-ZZB-1'));`;

try {
  const r = ซ้อมใบ({ ใบ, ก่อนลงใบ, หลังลงใบ });
  const ค่า = (k) => new RegExp(`(?:^|NOTICE:\\s+)${k}=(.*)$`, "m").exec(r.ผลตรวจ)?.[1]?.trim() ?? "(ไม่มีบรรทัด)";
  ผล(r.warnings.length === 0, "ลงใบแบบ db push ไม่มี WARNING", r.warnings.join("\n"));
  ผล(ค่า("เรื่องแจ้ง") === "hq|true|H9", "0288: เรื่องแจ้งเตือน won_reverted_by_dealer ของ HQ · ปิดไม่ได้ · แถว H9", ค่า("เรื่องแจ้ง"));
  ผล(ค่า("HQย้อน").startsWith("forbidden: สำนักงานใหญ่"), "0288: HQ ย้อนการตอบรับ = ปฏิเสธ (ดูอย่างเดียว)", ค่า("HQย้อน"));
  ผล(ค่า("สาขาอื่นย้อน").startsWith("forbidden: ย้อนการตอบรับได้เฉพาะใบของสาขาตัวเอง"), "0288: ดีลเลอร์สาขาอื่นย้อนใบของสาขานี้ = ปฏิเสธ", ค่า("สาขาอื่นย้อน"));
  ผล(ค่า("ไม่มีเหตุผล") !== "ผ่าน" && ค่า("ไม่มีเหตุผล") !== "(ไม่มีบรรทัด)", "0288: ไม่มีเหตุผล = ปฏิเสธ", ค่า("ไม่มีเหตุผล"));
  ผล(ค่า("เกิน7วัน").startsWith("revert_window"), "0288: ใบที่ตอบรับเกิน 7 วัน = ปฏิเสธ (revert_window)", ค่า("เกิน7วัน"));
  ผล(ค่า("เจ้าของย้อน") === "ผ่าน", "0288: ดีลเลอร์เจ้าของใบ ภายใน 7 วัน พร้อมเหตุผล = ย้อนได้", ค่า("เจ้าของย้อน"));
  ผล(ค่า("ใบ") === "Q-ZZA-1:sent_to_client,Q-ZZA-2:won", "0288: ใบที่ย้อนกลับเป็นส่งแล้ว · ใบที่ถูกปฏิเสธยังตอบรับ", ค่า("ใบ"));
  ผล(ค่า("ลีด") === "1:QUOTED,2:PAID", "0288: ลีดของใบที่ย้อนกลับขั้นก่อนปิด · ลีดอื่นไม่ขยับ", ค่า("ลีด"));
  ผล(ค่า("ไทม์ไลน์") === "1", "0288: ไทม์ไลน์ลีดมีบรรทัดย้อนพร้อมเหตุผล", ค่า("ไทม์ไลน์"));
  ผล(Number(ค่า("บันทึก")) >= 1, "0288: บันทึกการใช้งานจดการย้อน", ค่า("บันทึก"));
  ผล(ค่า("แจ้งHQ") === "1", "0288: แจ้ง HQ 1 รายการ", ค่า("แจ้งHQ"));
  ผล(ค่า("พิมพ์ก") === "zza@example.test|https://zza.example.test", "0289: พิมพ์ใบคืนอีเมล/เว็บไซต์ของบริษัท", ค่า("พิมพ์ก"));
  ผล(ค่า("พิมพ์ข") === "[|]", "0289: บริษัทไม่กรอกอีเมล/เว็บไซต์ = คืนค่าว่าง (ไม่ใช่ null)", ค่า("พิมพ์ข"));
  ผล(ค่า("พิมพ์จด") === "4", "0289: จดบันทึกการพิมพ์ทุกครั้งเหมือนเดิม (2 ครั้ง × 2 ใบ)", ค่า("พิมพ์จด"));
} catch (e) {
  ผล(false, "ซ้อมลงใบ 0288 + 0289 + ตรวจ", e.message);
}
console.log(ตก ? `\n✗ ตก ${ตก} ข้อ` : "\nALL PASS");
process.exit(ตก ? 1 : 0);
