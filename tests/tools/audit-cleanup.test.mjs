// ── ข้อทดสอบ: ขั้นล้างบันทึกการใช้งานใน tests/prod-live/cleanup.sql (บอสสั่ง 26 ต.ค. 69 · ใบ 0241) ────────────────────────
//   ใช้ "ขั้นจริง" จาก cleanup.sql (ระหว่าง -- ═══ บันทึกการใช้งาน … -- ═══ จบบันทึกการใช้งาน) รันกับฐานทดสอบในทรานแซกชันที่ย้อนกลับ
//   1) เงื่อนไขในไฟล์นับ (cleanup-audit-count.sql) ตรงกับไฟล์ลบทุกตัวอักษร
//   2) นับก่อนลบได้ตรง: จะลบ = แถว ZZT/live-* · ปนแถวจริง = 0
//   3) หลังลบ: แถว ZZT/live-* หาย · แถวจริงอยู่ครบ · แถวทดสอบอื่น (ZZTEST ในการกระทำ) ไม่ถูกแตะ (ชุดล้าง prod-live แคบกว่ากติกาฐาน)
// mutation proof (โฟลเดอร์แยกเท่านั้น): PMS_AUDIT_MUTATE=broad (เงื่อนไขลบกว้างจนปนแถวจริง) · broad-guard (กว้าง + ปิดกติกาของตัวดัก)
//   → ข้อทดสอบต้องตก (ตัวดักปฏิเสธ หรือแถวจริงหาย)
// รัน: node tests/tools/audit-cleanup.test.mjs (ถือล็อกฐานทดสอบระหว่างรัน)
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { ขอล็อกฐานทดสอบ } from "../../scripts/lib/testDbLock.mjs";
import { อาร์กิวเมนต์psql, คอนเทนเนอร์ } from "../../scripts/lib/testDbGuard.mjs";

let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n${String(เพิ่ม).slice(0, 1500)}`}`); };

const ลบ = readFileSync("tests/prod-live/cleanup.sql", "utf8").replace(/\r\n/g, "\n")
  .replaceAll("__ชุดสำรองก่อนลบ__", "ฐานทดสอบ (ข้อทดสอบ audit-cleanup)");   // ใบ 0245: ต้องมีชื่อชุดสำรอง
const นับ = readFileSync("tests/prod-live/cleanup-audit-count.sql", "utf8").replace(/\r\n/g, "\n");
const ขั้น = /-- ═══ บันทึกการใช้งาน[^\n]*\n([\s\S]*?)-- ═══ จบบันทึกการใช้งาน ═══/.exec(ลบ)?.[1] ?? "";
ผล(!!ขั้น, "cleanup.sql มีขั้นล้างบันทึกการใช้งาน (หัว/ท้ายขั้นครบ)");
const เงื่อนไขลบ = /delete from public\.audit_log\s+where ([^;]+);/.exec(ขั้น)?.[1]?.trim() ?? "";
const เงื่อนไขนับ = /count\(\*\) filter \(where \((.+?)\)\) as จะลบ/.exec(นับ)?.[1]?.trim() ?? "";
ผล(!!เงื่อนไขลบ && เงื่อนไขลบ === เงื่อนไขนับ, "เงื่อนไขในไฟล์นับตรงกับไฟล์ลบทุกตัวอักษร", `ลบ: ${เงื่อนไขลบ}\nนับ: ${เงื่อนไขนับ}`);

// ── mutation proof ──
let ขั้นที่รัน = ขั้น, ปิดกติกา = "";
const พัง = process.env.PMS_AUDIT_MUTATE ?? "";
if (พัง === "broad" || พัง === "broad-guard") ขั้นที่รัน = ขั้น.replaceAll(`target = 'ZZT'`, `target = 'ZZT' or "user" like 'ผู้ดูแล%'`);
if (พัง === "broad-guard") ปิดกติกา = `create or replace function public._audit_is_test_row(p_user text, p_target text, p_action text) returns boolean language sql immutable as $$ select true $$;`;

const ล็อก = ขอล็อกฐานทดสอบ("ข้อทดสอบ audit-cleanup", { รอนาที: 30 });
const sql = `
begin;
set local client_min_messages = warning;
${ปิดกติกา}
insert into public.audit_log ("user", role, action, target, at) values
  ('ผู้ดูแลระบบสำนักงานใหญ่', 'SUPER_ADMIN', 'แก้ไขดีลเลอร์', 'RYG · ทดสอบล้าง-จริง1', now()),
  ('สมหญิง ขายดี', 'DEALER_ADMIN', 'สร้างใบเสนอราคา', 'CNX · ทดสอบล้าง-จริง2', now()),
  ('ผู้ดูแลระบบสำนักงานใหญ่', 'SUPER_ADMIN', 'ZZTEST แก้ไขดีลเลอร์', 'RYG · ทดสอบล้าง-ZZTEST', now()),
  ('live-dealer-9@example.test', 'DEALER_ADMIN', 'สร้างใบเสนอราคา', 'ZZT · Q-ZZT-ทดสอบล้าง', now()),
  ('live-hq-9@example.test', 'SUPER_ADMIN', 'ส่งใบ HQ', 'ZZT · RQ-ทดสอบล้าง', now()),
  ('บัญชีทดสอบชั่วคราว', 'SUPER_ADMIN', 'เข้าสู่ระบบ', 'Benjamin HQ', now()),
  ('system', '', 'สร้างลูกค้าเป้าหมาย', 'ZZT · #L-ทดสอบล้าง', now());
create temp table ก่อน as select id, "user", target from public.audit_log;
\\o /dev/null
${นับ}
\\o
select 'นับ=' || จะลบ || '|' || ปนแถวจริง from (${นับ.replace(/;\s*$/, "").replace(/^--.*$/gm, "")}) c;
${ขั้นที่รัน}
select 'หลัง=' ||
  (select count(*) from ก่อน k where not exists (select 1 from public.audit_log a where a.id = k.id) and (k.target like '%ทดสอบล้าง-จริง%')) || '|' ||
  (select count(*) from public.audit_log where target like '%ทดสอบล้าง%' and target like 'ZZT%') || '|' ||
  (select count(*) from public.audit_log where target = 'RYG · ทดสอบล้าง-ZZTEST');
rollback;
`;
const r = spawnSync("docker", [...อาร์กิวเมนต์psql(คอนเทนเนอร์), "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8" });
ล็อก.release();
const ออก = (r.stdout ?? "") + (r.stderr ?? "");
const ข้อผิดพลาด = /ERROR:.*$/m.exec(ออก)?.[0];
ผล(r.status === 0 && !ข้อผิดพลาด, "ขั้นล้างบันทึกรันจบโดยไม่มีข้อผิดพลาด (ตัวดักไม่ปฏิเสธ = ไม่มีแถวจริงในเงื่อนไข)", ข้อผิดพลาด ?? ออก);
const [, จะลบ, ปน] = /นับ=(\d+)\|(\d+)/.exec(ออก) ?? [];
ผล(Number(ปน) === 0 && Number(จะลบ) >= 4, `นับก่อนลบ: จะลบ ${จะลบ} แถว (แถวทดสอบ ZZT/live-* ของชุดนี้ 4 แถว + ที่ค้างในฐาน) · ปนแถวจริง ${ปน}`, ออก);
const [, จริงหาย, ทดสอบเหลือ, zztestเหลือ] = /หลัง=(\d+)\|(\d+)\|(\d+)/.exec(ออก) ?? [];
ผล(จริงหาย === "0", "แถวจริงไม่ถูกลบ (0 แถวหาย)", ออก);
ผล(ทดสอบเหลือ === "0", "แถว ZZT/live-* ถูกลบหมด", ออก);
ผล(zztestเหลือ === "1", "ชุดล้าง prod-live ไม่แตะแถวทดสอบแบบอื่น (การกระทำ ZZTEST) — ลบแคบเฉพาะ ZZT/live-*", ออก);
console.log(ตก ? `FAIL ${ตก}` : "ALL PASS");
process.exit(ตก ? 1 : 0);
