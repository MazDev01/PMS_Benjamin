// ── ข้อทดสอบ: ซ้อมลงใบ 0304 (โลโก้ของระบบ HQ เปลี่ยนได้ · บอสสั่ง 24 พ.ย. 69) แบบ db push บนฐานแยกชั่วคราว ──
//   ก่อนลงใบ: ไม่มีตาราง brand_logo
//   หลังลงใบ: มีตาราง (RLS เปิด · ไม่มี policy) · ยังไม่มีโลโก้ = meta ว่าง (ใช้โลโก้เดิม)
//     · ฟังก์ชันเขียน 2 ตัวให้ authenticated · ตัวไฟล์ให้ผู้ล็อกอิน (authenticated) เท่านั้น ไม่ใช่ service_role (แอปดีลเลอร์ไม่มีกุญแจ service โดยตั้งใจ) · anon ไม่มีสิทธิ์ใดเลย
//     · ตัวตรวจไบต์: PNG/JPEG/WebP รู้จัก · SVG/ข้อความ = ไม่รับ
//   ลงใบไม่มี WARNING · ตกบนโค้ดเดิม: ไม่มีใบ 0304 (ซ้อมใบโยน "ไม่พบใบ")
// รัน: node tests/tools/migration-0304.test.mjs   (ต้องมี docker + ฐานทดสอบเปิดอยู่ · ไม่แตะข้อมูลฐานทดสอบร่วม)
import { existsSync } from "node:fs";
import { ซ้อมใบ } from "../../scripts/lib/migrationRehearsal.mjs";

let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n   ${String(เพิ่ม).slice(0, 1500)}`}`); };
const ใบ = "0304_brand_logo.sql";
ผล(existsSync(`supabase/migrations/${ใบ}`), `มีใบ ${ใบ}`);

const ก่อนลงใบ = `create table public.zz_ก่อน as select to_regclass('public.brand_logo') is null as ไม่มีตาราง;`;
const สิทธิ์ = (fn, role) => `has_function_privilege('${role}', 'public.${fn}', 'execute')`;
const หลังลงใบ = `select 'ก่อน=' || (select ไม่มีตาราง from public.zz_ก่อน);
select 'rls=' || relrowsecurity || ':' || (select count(*) from pg_policies where tablename = 'brand_logo') from pg_class where oid = 'public.brand_logo'::regclass;
select 'meta=' || coalesce((select sha256 from public.brand_logo), 'ว่าง');
select 'เขียน=' || (${สิทธิ์("brand_logo_set(text)", "authenticated")} and ${สิทธิ์("brand_logo_clear()", "authenticated")});
select 'ไฟล์=' || ${สิทธิ์("brand_logo_bytes()", "service_role")} || ':' || ${สิทธิ์("brand_logo_bytes()", "authenticated")};
select 'anon=' || (${สิทธิ์("brand_logo_set(text)", "anon")} or ${สิทธิ์("brand_logo_clear()", "anon")} or ${สิทธิ์("brand_logo_meta()", "anon")} or ${สิทธิ์("brand_logo_bytes()", "anon")}
                   or has_table_privilege('anon', 'public.brand_logo', 'select'));
select 'ชนิด=' || concat_ws(',', public._brand_logo_mime(decode('89504e470d0a1a0a00', 'hex')), public._brand_logo_mime(decode('ffd8ffe0', 'hex')),
  public._brand_logo_mime(decode('524946460000000057454250', 'hex')), coalesce(public._brand_logo_mime(convert_to('<svg/>', 'UTF8')), 'ไม่รับ'));`;

try {
  const r = ซ้อมใบ({ ใบ, ก่อนลงใบ, หลังลงใบ });
  const ค่า = (k) => new RegExp(`(?:^|NOTICE:\s+)${k}=(.*)$`, "m").exec(r.ผลตรวจ)?.[1]?.trim() ?? "(ไม่มีบรรทัด)";
  ผล(r.warnings.length === 0, "ลงใบแบบ db push ไม่มี WARNING", r.warnings.join("\n"));
  ผล(ค่า("ก่อน") === "true", "ก่อนลงใบ: ไม่มีตาราง brand_logo", ค่า("ก่อน"));
  ผล(ค่า("rls") === "true:0", "ตาราง brand_logo เปิด RLS ไม่มี policy (เข้าผ่านฟังก์ชันเท่านั้น)", ค่า("rls"));
  ผล(ค่า("meta") === "ว่าง", "ลงใบแล้วยังไม่มีโลโก้ = ใช้โลโก้ Benjamin เดิม", ค่า("meta"));
  ผล(ค่า("เขียน") === "true", "ฟังก์ชันเปลี่ยน/ล้างโลโก้ให้ผู้ล็อกอิน (ฐานตรวจว่าเป็น HQ เอง)", ค่า("เขียน"));
  ผล(ค่า("ไฟล์") === "false:true", "ตัวไฟล์ให้ผู้ล็อกอินเท่านั้น (ไม่พึ่งกุญแจ service)", ค่า("ไฟล์"));
  ผล(ค่า("anon") === "false", "anon ไม่มีสิทธิ์ใดเลย (ใบ 0297)", ค่า("anon"));
  ผล(ค่า("ชนิด") === "image/png,image/jpeg,image/webp,ไม่รับ", "ตัวตรวจไบต์: PNG/JPEG/WebP รู้จัก · SVG ไม่รับ", ค่า("ชนิด"));
} catch (e) {
  ผล(false, "ซ้อมลงใบ 0304 + ตรวจ", e.message);
}
console.log(ตก ? `\n✗ ตก ${ตก} ข้อ` : "\nALL PASS");
process.exit(ตก ? 1 : 0);
