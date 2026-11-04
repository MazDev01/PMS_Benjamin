// ── ข้อทดสอบ: prod:query ใส่ --yes ได้เฉพาะคำสั่งอ่าน · คำสั่งเขียนถูกปฏิเสธก่อนต่อฐาน (บอสสั่ง 3 พ.ย. 69 · เลือก ก) ──
//   ไม่แตะฐานใด ๆ: PMS_PROD_QUERY_DRY=1 (พิมพ์คำสั่งแทนการรัน) · ล็อกฐานจริงชั่วคราว
//   1) คำสั่งอ่าน (รวม case…end · ข้อความค้นหาที่มีคำว่า delete · หมายเหตุ · ไฟล์ -f) → ผ่าน และคำสั่งที่จะรันมี --yes
//   2) คำสั่งเขียน/แก้โครง/สิทธิ์/สั่งงานฐาน ทุกรูปแบบ (ซ่อนใน CTE · หลัง ; · select into · ฟังก์ชันเขียน · explain analyze · do · ไฟล์ -f)
//      → หยุดรหัส 3 · ไม่พิมพ์คำสั่งที่จะรัน (ไม่ต่อฐาน) · ไม่มี --yes
//   3) ส่ง --yes / --agent มาเอง → ปฏิเสธ
// mutation proof: PMS_PROD_QUERY_SCRIPT=<สคริปต์ที่ไม่มีตัวกัน> → ข้อ 2–3 ต้องตก
// รัน: node tests/tools/prod-read-only.test.mjs
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const ราก = process.cwd();
const สคริปต์ = process.env.PMS_PROD_QUERY_SCRIPT || path.join(ราก, "scripts/prod-query.mjs");
const ที่ = path.join(ราก, "test-results", `prod-read-only-${process.pid}`);
rmSync(ที่, { recursive: true, force: true });
mkdirSync(ที่, { recursive: true });
const env = { ...process.env, PMS_PROD_QUERY_DRY: "1", PMS_PROD_LOCK: path.join(ที่, "prod.lock"), PMS_PROD_OPS_DIR: ที่ };
delete env.PMS_PROD_LOCK_HELD;
let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n   ${String(เพิ่ม).slice(0, 400)}`}`); };
const รัน = (...a) => { const r = spawnSync(process.execPath, [สคริปต์, ...a], { env, encoding: "utf8" }); return { code: r.status, ออก: `${r.stdout}\n${r.stderr}` }; };
const ไฟล์ = (ชื่อ, sql) => { const f = path.join(ที่, ชื่อ); writeFileSync(f, sql); return f; };

const อ่าน = [
  ["select max(version) from supabase_migrations.schema_migrations"],
  ["select case when status = 'won' then 1 else 0 end as x from public.leads"],
  ["select count(*) from public.audit_log where action = 'ลบใบค่าแฟรนไชส์ (ร่าง)' or target like '%delete%'"],
  ["-- นับก่อน delete\nselect 1 /* ไม่ drop */"],
  ["with a as (select 1 as n) select n from a"],
  ["select 1", "--output-format", "json"],
  ["-f", ไฟล์("อ่าน.sql", "select json_build_object('a', (select count(*) from public.dealers where code = 'ZZT'));\n")],
];
for (const a of อ่าน) {
  const r = รัน(...a);
  ผล(r.code === 0 && /\[ไม่รันจริง\].* --yes /.test(r.ออก), `อ่าน → ผ่าน + มี --yes: ${a.join(" ").slice(0, 60).replace(/\n/g, " ")}`, r.ออก);
}

const เขียน = [
  ["insert into public.dealers (code) values ('X')"],
  ["UPDATE public.leads SET status = 'won'"],
  ["delete from public.quote_requests"],
  ["with d as (delete from public.leads returning *) select count(*) from d"],
  ["select 1; drop table public.leads"],
  ["select * into public.copy_leads from public.leads"],
  ["select setval('public.quote_counters_seq', 1)"],
  ["select nextval('x')"],
  ["select pg_terminate_backend(123)"],
  ["explain analyze delete from public.leads"],
  ["do $$ begin delete from public.leads; end $$"],
  ["truncate public.leads"],
  ["alter table public.leads add column x int"],
  ["create table x (a int)"],
  ["grant all on public.leads to anon"],
  ["select * from public.leads for update"],
  ["copy public.leads to '/tmp/x'"],
  ["select 1 /* unterminated"],
  ["select 'ไม่ปิด"],
  ["-f", ไฟล์("เขียน.sql", "select 1;\nupdate public.dealers set name = 'x';\n")],
];
for (const a of เขียน) {
  const r = รัน(...a);
  ผล(r.code === 3 && !/\[ไม่รันจริง\]/.test(r.ออก) && /⛔/.test(r.ออก), `เขียน → ปฏิเสธก่อนต่อฐาน: ${a.join(" ").slice(0, 60).replace(/\n/g, " ")}`, r.ออก);
}

for (const a of [["select 1", "--yes"], ["select 1", "--agent", "no"], ["select 1", "--agent=no"]]) {
  const r = รัน(...a);
  ผล(r.code === 3 && !/\[ไม่รันจริง\]/.test(r.ออก), `ส่ง ${a.slice(1).join(" ")} มาเอง → ปฏิเสธ`, r.ออก);
}
// 4) จุดอื่นที่เรียก CLI กับฐานจริงพร้อม --yes (3 พ.ย. 69): ด่านก่อน push ตรวจคำถามเป็นคำสั่งอ่านก่อนใส่ --yes ·
//    ขั้นล้างข้อมูลทดสอบ (มีคำสั่งเขียน) ใส่ --yes ได้เฉพาะเมื่อคนพิมพ์ --yes-prod เอง (บอสเลือก ก)
{
  const { readFileSync } = await import("node:fs");
  const ก่อนpush = readFileSync(path.join(ราก, "scripts/git-hooks/pre-push.mjs"), "utf8");
  const ตรวจที่ = ก่อนpush.indexOf("ตรวจอ่านอย่างเดียว(คำถาม)"), yesที่ = ก่อนpush.indexOf('"--yes"');
  ผล(ตรวจที่ > 0 && yesที่ > ตรวจที่, "ด่านก่อน push: ตรวจคำถามเป็นคำสั่งอ่านก่อนใส่ --yes");
  const ล้าง = readFileSync(path.join(ราก, "tests/prod-live/run.mjs"), "utf8");
  const ส่วนล้าง = ล้าง.slice(ล้าง.indexOf('if (phase === "cleanup")'));
  const ด่าน = ส่วนล้าง.indexOf("if (!ยืนยันเขียน) ตาย("), yesล้าง = ส่วนล้าง.indexOf("รันSQLไฟล์(");   // ตัวกลางที่ใส่ --yes (scripts/lib/supabaseCli.mjs)
  ผล(ด่าน > 0 && yesล้าง > ด่าน && /args\.includes\("--yes-prod"\)/.test(ล้าง), "ขั้นล้างข้อมูลทดสอบ: ไม่มี --yes-prod ที่คนพิมพ์ = หยุดก่อนใส่ --yes");
}
rmSync(ที่, { recursive: true, force: true });
console.log(ตก ? `FAIL ${ตก}` : "ALL PASS");
process.exit(ตก ? 1 : 0);
