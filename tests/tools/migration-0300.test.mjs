// ── ข้อทดสอบ: ซ้อมลงใบ 0300 (ใบเสนอราคาไม่มีฉบับ = V1 · ใบที่ส่งแล้ว revision NULL บันทึกผลลูกค้าได้) แบบ db push บนฐานแยกชั่วคราว ──
//   คนรวมงานสั่ง 23 พ.ย. 69: create_quotation ตั้ง V1 เมื่อว่าง + ตัวกัน 0226 เทียบ coalesce(revision,'V1') · ไม่เติมย้อนหลัง
//   ก่อนลงใบ: ใบที่ส่งแล้ว 2 ใบ revision NULL (ZZ-R1 · ZZ-R2) — แบบใบ dev-sample
//   หลังลงใบ (ปิดตัวกระตุ้นอื่นของตาราง เหลือตัวกันใบที่ส่งแล้ว + ตัวตั้งฉบับ — ข้อนี้ตรวจ 2 ตัวนี้เท่านั้น):
//     ZZ-R1 ส่งกลับทั้งแถวแบบหน้าจอ (revision 'V1' + สถานะ lost + เหตุผล) → ผ่าน · ZZ-R2 เปลี่ยนเป็น V2 → ยังถูกปฏิเสธ (เวอร์ชัน)
//     ใบใหม่ไม่ส่ง revision → V1 · ส่ง V3 มา → V3 คงเดิม · ใบเก่าไม่ถูกเติมย้อนหลัง (ZZ-R2 ยัง NULL)
//   ลงใบไม่มี WARNING · ตกบนโค้ดเดิม: ไม่มีใบ 0300 (ซ้อมใบโยน "ไม่พบใบ")
// รัน: node tests/tools/migration-0300.test.mjs   (ต้องมี docker + ฐานทดสอบเปิดอยู่ · ไม่แตะข้อมูลฐานทดสอบร่วม)
import { existsSync } from "node:fs";
import { ซ้อมใบ } from "../../scripts/lib/migrationRehearsal.mjs";

let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n   ${String(เพิ่ม).slice(0, 1500)}`}`); };
const ใบ = "0300_quote_revision_default.sql";
ผล(existsSync(`supabase/migrations/${ใบ}`), `มีใบ ${ใบ}`);

const ก่อนลงใบ = `set session_replication_role = replica;
insert into public.quotations (id, dealer_code, customer, status, total_value, line_items, revision) values
  ('ZZ-R1', 'RYG', 'ZZTEST ไม่มีฉบับ 1', 'sent_to_client', 1000, '[]', null),
  ('ZZ-R2', 'RYG', 'ZZTEST ไม่มีฉบับ 2', 'sent_to_client', 2000, '[]', null);
set session_replication_role = origin;`;

const หลังลงใบ = `alter table public.quotations disable trigger user;
alter table public.quotations enable trigger quotations_zz_sent_lock;
alter table public.quotations enable trigger quotations_aa_revision_default;
create temp table zz_ผล (k text, v text);
do $t$ begin
  update public.quotations set revision = 'V1', status = 'lost', lost_reason = 'ZZTEST ราคาสูง' where id = 'ZZ-R1';
  insert into zz_ผล values ('บันทึกผล', 'ok');
exception when others then insert into zz_ผล values ('บันทึกผล', sqlerrm); end $t$;
do $t$ begin
  update public.quotations set revision = 'V2' where id = 'ZZ-R2';
  insert into zz_ผล values ('เปลี่ยนฉบับ', 'ผ่าน (ผิด)');
exception when others then insert into zz_ผล values ('เปลี่ยนฉบับ', case when sqlerrm like 'quote_sent_locked:%(เวอร์ชัน)%' then 'ปฏิเสธเวอร์ชัน' else sqlerrm end); end $t$;
select k || '=' || v from zz_ผล order by k;
alter table public.quotations drop constraint if exists quotations_dealer_fk;   -- ฐานซ้อมว่าง ไม่มีดีลเลอร์ (ข้อนี้ตรวจเฉพาะตัวตั้งฉบับ)
insert into public.quotations (id, dealer_code, customer, status, total_value, line_items, vat_percent) values ('ZZ-N1', 'RYG', 'ZZTEST ใหม่', 'draft', 0, '[]', 7);
insert into public.quotations (id, dealer_code, customer, status, total_value, line_items, vat_percent, revision) values ('ZZ-N2', 'RYG', 'ZZTEST ใหม่ 2', 'draft', 0, '[]', 7, '  ');
insert into public.quotations (id, dealer_code, customer, status, total_value, line_items, vat_percent, revision) values ('ZZ-N3', 'RYG', 'ZZTEST ใหม่ 3', 'draft', 0, '[]', 7, 'V3');
select 'แถว=' || string_agg(id || ':' || status || ':' || coalesce(revision, 'NULL'), ',' order by id) from public.quotations where id like 'ZZ-%';
select 'สิทธิ์=' || has_function_privilege('authenticated', 'public._quote_revision_default()', 'execute')
  || '|' || has_function_privilege('anon', 'public._quote_lock_rev(text)', 'execute');`;

try {
  const r = ซ้อมใบ({ ใบ, ก่อนลงใบ, หลังลงใบ });
  const ค่า = (k) => new RegExp(`(?:^|NOTICE:\\s+)${k}=(.*)$`, "m").exec(r.ผลตรวจ)?.[1]?.trim() ?? "(ไม่มีบรรทัด)";
  ผล(r.warnings.length === 0, "ลงใบแบบ db push ไม่มี WARNING", r.warnings.join("\n"));
  ผล(ค่า("บันทึกผล") === "ok", "ใบที่ส่งแล้ว revision NULL: ส่งกลับทั้งแถว (V1) + บันทึกผลลูกค้าปฏิเสธ = ผ่าน", ค่า("บันทึกผล"));
  ผล(ค่า("เปลี่ยนฉบับ") === "ปฏิเสธเวอร์ชัน", "ใบที่ส่งแล้วเปลี่ยนเป็น V2 = ยังถูกปฏิเสธ (เวอร์ชัน)", ค่า("เปลี่ยนฉบับ"));
  ผล(ค่า("แถว") === "ZZ-N1:draft:V1,ZZ-N2:draft:V1,ZZ-N3:draft:V3,ZZ-R1:lost:V1,ZZ-R2:sent_to_client:NULL",
    "ใบใหม่ไม่ส่ง/ส่งว่าง = V1 · ส่ง V3 = คง · ใบเก่าไม่เติมย้อนหลัง (ZZ-R2 ยัง NULL)", ค่า("แถว"));
  ผล(ค่า("สิทธิ์") === "false|false", "ฟังก์ชันใหม่ผู้ใช้/คนนอกเรียกตรงไม่ได้", ค่า("สิทธิ์"));
} catch (e) {
  ผล(false, "ซ้อมลงใบ 0300 + ตรวจ", e.message);
}
console.log(ตก ? `\n✗ ตก ${ตก} ข้อ` : "\nALL PASS");
process.exit(ตก ? 1 : 0);
