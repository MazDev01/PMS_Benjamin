// ── ข้อทดสอบต้นเหตุงาน "ลบ 0" (บอสรันล้างข้อมูลทดสอบเว็บจริง 5 พ.ย. 69: ขั้นนับก่อนลบได้ 0 แต่ฐานจดลบจริง 54) ─────────────
//   กลไกที่ยืนยันแล้ว (จำลองบนฐานทดสอบ 9 พ.ย. 69) — อธิบายได้ "บางส่วน": แถวส่วนหนึ่งที่ถูกลบเกิดในทรานแซกชันล้างเอง
//     cleanup.sql ลบลีด/ใบเสนอราคาของสาขา ZZT ก่อน → ตัวดักบันทึกการใช้งาน (ใบ 0150 trg_lead_audit / trg_quotation_audit)
//     เขียนแถว "ลบลูกค้าเป้าหมาย ZZT · …" / "ลบใบเสนอราคา ZZT · …" ทุกแถวที่ลบ (ไม่ขึ้นกับว่ามีผู้ใช้ล็อกอิน · ผู้ทำ = system)
//     → ขั้นลบบันทึกท้ายไฟล์ลบแถวพวกนี้ด้วย (เงื่อนไข target like 'ZZT · %') · ขั้นนับก่อนลบ (ก่อนเริ่มไฟล์) มองไม่เห็นเพราะยังไม่เกิด
//     ข้อความเดิมของ run.mjs ("บันทึกการใช้งานทดสอบลบ ${ก่อน.จะลบ}") เอาจำนวนก่อนลบมาบอกว่าลบ → ขึ้น "ลบ 0" ทั้งที่ฐานลบจริง
//   ยังอธิบายไม่ครบ: สรุปการลบจริง 3 ครั้ง (4–5 พ.ย.) ช่วงเวลาแถวที่ลบไม่เท่ากัน (เช่น 15:26 ถึง 15:38) = มีแถวที่เกิดก่อนทรานแซกชันล้าง
//     (ชุดทดสอบเขียนระหว่างรัน) ซึ่งขั้นนับก่อนลบควรเห็น แต่ได้ 0 — สาเหตุส่วนนี้ยังไม่ยืนยัน (ตัด: เงื่อนไขนับ ≠ ลบ · CLI ใช้บัญชีอ่านอย่างเดียว)
//   บันทึกต้นเหตุ (9 พ.ย. 69 · ปิดแบบ "ต้นเหตุไม่ยืนยัน ตัวกันปิดความเสี่ยงครบ" ตามคนรวมงาน · บอสตัดสินตอนปิดรอบ):
//     ข้อมูลจริง (คนรวมงานอ่านจากฐานจริงแบบอ่านอย่างเดียว) แถวสรุปการลบ 3 ครั้ง ลบ 54 ทุกครั้ง = บันทึกของชุดทดสอบเต็มชุด
//       4 พ.ย. at 15:53:43 ช่วง 15:43–15:53 · 5 พ.ย. at 10:32:25 ช่วง 10:04–10:32 · 5 พ.ย. at 15:38:37 ช่วง 15:26–15:38
//       at ของแถวสรุป = เวลาเริ่มทรานแซกชันล้าง = ปลายช่วงทุกครั้ง · ตัวดัก 0150 ใช้ at ค่าเริ่ม now() · สรุปคิดจาก min/max(at) ของแถวที่ลบ
//     ตัดออกแล้ว: เงื่อนไขนับ ≠ ลบ (รุ่น afdafd7 ที่บอสรันตรงกันทุกตัวอักษร) · CLI ใช้บัญชีอ่านอย่างเดียวตอนนับ (CLI 2.109.1 --linked
//       ส่งทุกไฟล์ผ่าน /v1/projects/{ref}/database/query ไม่ส่ง read_only = บัญชีเดียวกับตอนลบ) · ตัวอ่านผลผิดรูป (รุ่นเดิมจะตายที่ด่านปนแถวจริง)
//       · H1 ทรานแซกชันล้างเริ่มก่อน/รอล็อกระหว่างชุดทดสอบเขียน (at ของแถวสรุป = ปลายช่วง → ตก)
//     เหลือ H2: ขั้นนับวันนั้นมองไม่เห็นแถวด้วยเหตุที่ยังไม่รู้ (ผลดิบ "เหลือ" ของวันนั้นไม่มี · วันนี้หลังล้างเหลือ 59 = ทั้งตารางจริง ตัดได้แค่ตอนนี้)
//     ตัวกันที่มีแล้ว (ปิดความเสี่ยงไม่ว่าต้นเหตุไหน): ล็อกชุดเว็บจริงทุกขั้น · lock table audit_log ก่อนด่านปน+ลบ · ด่านปนแถวจริงในทรานแซกชันเดียวกับการลบ
//       · audit_log_guard_row ปฏิเสธลบแถวที่ไม่ใช่แถวทดสอบ (ยืนยันบนฐานจริง 5 พ.ย.) · ผลนับผ่านตัวตรวจเข้ม (เห็นทุกแถว) · ข้อความจบ = สรุปการลบของฐาน
//   ด่านปนแถวจริงในทรานแซกชันล้าง (หลังล็อกตาราง ก่อนลบทันที) ตรวจทุกแถวที่จะลบรวมแถวที่เกิดในทรานแซกชัน จึงไม่มีแถวจริงหลุดไปลบ
//   ข้อ 1 (ฐานทดสอบ · rollback ทั้งหมด): รัน cleanup.sql จริงกับสาขา ZZT จำลองที่มีลีด 3 ราย (วางโดยไม่ลงบันทึก)
//     → เห็นทุกแถว · ฐานจดลบ = นับก่อนลบ + 3 (ส่วนเกิน 3 = บันทึกที่เกิดในทรานแซกชันล้าง) · หลังล้างไม่เหลือแถว ZZT
//   ข้อ 2 (ตกบนโค้ดเดิม): ข้อความจบของ run.mjs ต้องบอกจำนวนที่ลบจริงจากสรุปการลบของฐาน ไม่ใช่จำนวนนับก่อนลบ
//     (PMS_RUN_MJS = ไฟล์ run.mjs ที่จะตรวจ · ค่าเริ่ม tests/prod-live/run.mjs · โค้ดเดิม 2b1f8bf^ ตก)
// รัน: ผ่านตัวห่อ tests/scenario/tool-suites-db.spec.ts (ถือล็อกฐานทดสอบ)
import { readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n   ${String(เพิ่ม).slice(-900)}`}`); };

// ── ข้อ 2: ข้อความจบ ──
const run = readFileSync(process.env.PMS_RUN_MJS ?? "tests/prod-live/run.mjs", "utf8");
const ล้าง = run.slice(run.indexOf('if (phase === "cleanup")'));
const ข้อความจบ = ล้าง.split("\n").filter(l => /console\.log\(`✓ cleanup/.test(l)).join("\n");
ผล(!!ข้อความจบ, "run.mjs มีข้อความจบของขั้นล้าง", ล้าง.slice(0, 300));
ผล(!/ลบ \$\{ก่อน\.จะลบ\}/.test(ข้อความจบ), "ข้อความจบไม่เอาจำนวนนับก่อนลบมาบอกว่า \"ลบ N\" (ต้นเหตุ \"ลบ 0\")", ข้อความจบ);
ผล(/\$\{สรุปการลบล่าสุด/.test(ข้อความจบ) && /ลบจริงตามฐาน/.test(ข้อความจบ), "ข้อความจบบอกจำนวนที่ลบจริงจากสรุปการลบของฐาน", ข้อความจบ);
ผล(/select target from public\.audit_log where action = 'ลบแถวทดสอบในบันทึกการใช้งาน'/.test(ล้าง), "สรุปการลบอ่านจากแถวที่ฐานจดเอง (ใบ 0245)", ล้าง.slice(0, 200));

// ── ข้อ 1: จำลองบนฐานทดสอบ ──
if (!process.env.PMS_TESTDB_PG_PASSWORD) {
  ผล(false, "ข้อ 1 ต้องถือล็อกฐานทดสอบ (รันผ่าน tool-suites-db.spec.ts / toolrun)");
} else {
  const { psqlArgs, TESTDB_CONTAINER } = await import(new URL(`file:///${path.resolve("scripts/lib/testDbPsql.mjs").replace(/\\/g, "/")}`).href);
  const นับ = readFileSync("tests/prod-live/cleanup-audit-count.sql", "utf8").split("\n").filter(l => !l.trimStart().startsWith("--")).join("\n").trim().replace(/;$/, "");
  const ไฟล์ล้าง = readFileSync("tests/prod-live/cleanup.sql", "utf8");
  ผล(/^begin;$/m.test(ไฟล์ล้าง) && /^commit;$/m.test(ไฟล์ล้าง), "cleanup.sql เป็นทรานแซกชันเดียว (begin … commit)");
  const ตัวล้าง = ไฟล์ล้าง.replace(/^begin;$/m, "").replace(/^commit;$/m, "").replaceAll("__ชุดสำรองก่อนลบ__", "จำลองข้อทดสอบ cleanup-self-audit");
  const sql = `begin;
-- สาขาทดสอบ ZZT + ลีด 3 ราย (วางแบบ replica = ตัวดักไม่ลงบันทึกตอนวาง) · ไม่ลบบันทึกเอง (ทางลบมีแค่ 2 ทาง · check-audit-delete-paths)
set local session_replication_role = replica;
insert into public.dealers (code, name, province, region, status) values ('ZZT', 'สาขาทดสอบชั่วคราว (ลบทิ้ง)', 'ตราด', 'ตะวันออก', 'active') on conflict (code) do nothing;
insert into public.leads (id, num_id, dealer_code, company, name, phone, province, status, created_date) values
  ('#L-ZZTSA1', 990001001, 'ZZT', 'ZZTEST ก', 'ZZTEST', '000-000-0001', 'ตราด', 'WAITING', current_date),
  ('#L-ZZTSA2', 990001002, 'ZZT', 'ZZTEST ข', 'ZZTEST', '000-000-0002', 'ตราด', 'WAITING', current_date),
  ('#L-ZZTSA3', 990001003, 'ZZT', 'ZZTEST ค', 'ZZTEST', '000-000-0003', 'ตราด', 'WAITING', current_date);
set local session_replication_role = origin;
select 'ก่อน=' || row_to_json(c)::text from (${นับ}) c;
${ตัวล้าง}
select 'สรุป=' || coalesce((select target from public.audit_log where action = 'ลบแถวทดสอบในบันทึกการใช้งาน' order by id desc limit 1), 'ไม่มี');
select 'เหลือ=' || count(*) from public.audit_log where target like 'ZZT · %' or target = 'ZZT';
select 'ลีดเหลือ=' || count(*) from public.leads where dealer_code = 'ZZT';
rollback;`;
  const r = spawnSync("docker", [...psqlArgs(TESTDB_CONTAINER), "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8", maxBuffer: 16 << 20 });
  const o = `${r.stdout}\n${r.stderr}`;
  ผล(r.status === 0, "รัน cleanup.sql จริงบนฐานทดสอบได้ (rollback ทั้งหมด)", o);
  const ก่อน = JSON.parse(/^ก่อน=(.*)$/m.exec(r.stdout ?? "")?.[1] ?? "{}");
  ผล(ก่อน.เห็นทุกแถว === true && Number(ก่อน.เหลือ) > 0, "ขั้นนับเห็นทุกแถว (ไม่ใช่การมองไม่เห็นแถว)", JSON.stringify(ก่อน));
  ผล(Number.isInteger(Number(ก่อน.จะลบ)) && Number(ก่อน.ปนแถวจริง) === 0, "ขั้นนับก่อนลบอ่านได้ · ไม่ปนแถวจริง", JSON.stringify(ก่อน));
  const ลบจริง = Number(/^สรุป=(\d+) แถว · /m.exec(r.stdout ?? "")?.[1] ?? NaN);
  ผล(ลบจริง === Number(ก่อน.จะลบ) + 3, `ฐานจดลบ = นับก่อนลบ ${ก่อน.จะลบ} + 3 (บันทึกที่ตัวดักเขียนตอน cleanup.sql ลบลีด 3 ราย · เกิดในทรานแซกชันล้าง ขั้นนับมองไม่เห็น)`, o);
  ผล(/^เหลือ=0$/m.test(r.stdout ?? "") && /^ลีดเหลือ=0$/m.test(r.stdout ?? ""), "หลังล้างไม่เหลือบันทึก/ลีดของ ZZT", o);
}
console.log(ตก ? `\n✗ ตก ${ตก} ข้อ` : "\nALL PASS");
process.exit(ตก ? 1 : 0);
