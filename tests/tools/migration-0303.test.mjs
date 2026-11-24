// ── ข้อทดสอบ: ซ้อมลงใบ 0303 ("อื่น ๆ (ระบุ)" ต้องมีในกล่องเหตุผลเสมอ · บอสสั่ง 24 พ.ย. 69) แบบ db push บนฐานแยกชั่วคราว ──
//   ก่อนลงใบ: HQ ซ่อนตัวระบุเองของรายการเหตุผลผู้สนใจไม่สำเร็จไว้ (แบบที่หน้าตั้งค่าเดิมทำได้)
//   หลังลงใบ: ตัวที่ซ่อนไว้กลับมาแสดง · ลบ/ซ่อน/เปลี่ยนเป็นตัวธรรมดา = ฐานปฏิเสธ option_other_locked (ทั้งเขียนตรงและทางบันทึกของหน้าตั้งค่า)
//     · แก้ชื่อได้ · ตัวธรรมดายังซ่อนได้ตามเดิม
//   ลงใบไม่มี WARNING · ตกบนโค้ดเดิม: ไม่มีใบ 0303 (ซ้อมใบโยน "ไม่พบใบ")
// รัน: node tests/tools/migration-0303.test.mjs   (ต้องมี docker + ฐานทดสอบเปิดอยู่ · ไม่แตะข้อมูลฐานทดสอบร่วม)
import { existsSync } from "node:fs";
import { ซ้อมใบ } from "../../scripts/lib/migrationRehearsal.mjs";

let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n   ${String(เพิ่ม).slice(0, 1500)}`}`); };
const ใบ = "0303_option_other_always.sql";
ผล(existsSync(`supabase/migrations/${ใบ}`), `มีใบ ${ใบ}`);

const ก่อนลงใบ = `update public.option_lists set hidden = true where list = 'prospect_lost_reason' and code = 'other';
create table public.zz_ก่อน as select (select hidden from public.option_lists where list = 'prospect_lost_reason' and code = 'other') as ซ่อน;`;

const ลอง = (ชื่อ, sql) => `do $t$ begin ${sql}; insert into zz_ผล values ('${ชื่อ}', 'ผ่าน (ผิด)');
exception when others then insert into zz_ผล values ('${ชื่อ}', case when sqlerrm like 'option_other_locked:%' then 'ปฏิเสธ' else sqlerrm end); end $t$;`;
const หลังลงใบ = `select 'ก่อน=' || (select ซ่อน from public.zz_ก่อน);
select 'หลังลงใบ=' || string_agg(list || ':' || hidden, ',' order by list) from public.option_lists where free_text;
create temp table zz_ผล (k text, v text);
${ลอง("ลบ", "delete from public.option_lists where list = 'lead_lost_reason' and code = 'other'")}
${ลอง("ซ่อน", "update public.option_lists set hidden = true where list = 'lead_lost_reason' and code = 'other'")}
${ลอง("เปลี่ยนชนิด", "update public.option_lists set free_text = false where list = 'lead_lost_reason' and code = 'other'")}
${ลอง("บันทึกไม่มีอื่น", "delete from public.option_lists where list = 'lead_lost_reason' and not (code = any(array['price_high']))")}
update public.option_lists set label = 'อื่น ๆ (โปรดระบุ)' where list = 'lead_lost_reason' and code = 'other';
update public.option_lists set hidden = true where list = 'lead_lost_reason' and code = 'no_response';
select k || '=' || v from zz_ผล order by k;
select 'แก้ชื่อ=' || (select label from public.option_lists where list = 'lead_lost_reason' and code = 'other');
select 'ซ่อนตัวธรรมดา=' || (select hidden from public.option_lists where list = 'lead_lost_reason' and code = 'no_response');`;

try {
  const r = ซ้อมใบ({ ใบ, ก่อนลงใบ, หลังลงใบ });
  const ค่า = (k) => new RegExp(`(?:^|NOTICE:\\s+)${k}=(.*)$`, "m").exec(r.ผลตรวจ)?.[1]?.trim() ?? "(ไม่มีบรรทัด)";
  ผล(r.warnings.length === 0, "ลงใบแบบ db push ไม่มี WARNING", r.warnings.join("\n"));
  ผล(ค่า("ก่อน") === "true", "ก่อนลงใบ: ตัวระบุเองของเหตุผลผู้สนใจถูกซ่อนไว้", ค่า("ก่อน"));
  ผล(ค่า("หลังลงใบ") === "lead_lost_reason:false,prospect_lost_reason:false", "ลงใบ: ตัวระบุเองทุกรายการแสดง (ที่ซ่อนไว้กลับมา)", ค่า("หลังลงใบ"));
  for (const k of ["ลบ", "ซ่อน", "เปลี่ยนชนิด"]) ผล(ค่า(k) === "ปฏิเสธ", `${k}ตัวระบุเองตรงที่ตาราง = ฐานปฏิเสธ option_other_locked`, ค่า(k));
  ผล(ค่า("บันทึกไม่มีอื่น") === "ปฏิเสธ", "ลบทั้งชุดแบบที่ option_lists_save ทำ (ชุดที่ส่งไม่มีอื่น ๆ) = ฐานปฏิเสธทั้งคำสั่ง", ค่า("บันทึกไม่มีอื่น"));
  ผล(ค่า("แก้ชื่อ") === "อื่น ๆ (โปรดระบุ)", "แก้ชื่อตัวระบุเองได้", ค่า("แก้ชื่อ"));
  ผล(ค่า("ซ่อนตัวธรรมดา") === "true", "ตัวเลือกธรรมดายังซ่อนได้ตามเดิม", ค่า("ซ่อนตัวธรรมดา"));
} catch (e) {
  ผล(false, "ซ้อมลงใบ 0303 + ตรวจ", e.message);
}
console.log(ตก ? `\n✗ ตก ${ตก} ข้อ` : "\nALL PASS");
process.exit(ตก ? 1 : 0);
