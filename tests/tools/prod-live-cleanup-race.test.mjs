// ── ข้อทดสอบ: ล้างข้อมูลทดสอบเว็บจริงไม่ซ้อนกับขั้นอื่น · นับ/ตรวจปน/ลบในทรานแซกชันเดียวหลังล็อกตาราง (บอสอนุมัติ 5 พ.ย. 69 · งาน "ลบ 0") ──
//   เหตุ: บอสรันล้างแล้วขั้นนับก่อนลบได้ 0 แต่ฐานลบจริง 54 · ต้นเหตุยังไม่ยืนยัน (ตัวเลขเข้ากับการเขียนแถวระหว่างนับกับลบ แต่เวลาไม่ชัด)
//   1) run.mjs --target prod: ขั้นอื่นของชุดเว็บจริงถือล็อกอยู่ → ไม่เริ่ม (exit 3) บอกว่ารออะไร · หยุดก่อนแตะฐานจริง
//      ตาข่ายกันพลาด: ล็อกฐานจริงจำลองถืออยู่ + รอได้ 1 มิลลิวินาที → ถ้าตัวกันไม่ทำงาน ก็หยุดที่ขั้นรอฐานจริง ไม่ถึงฐานจริง
//   2) จำลองการเขียนแถวระหว่างล้าง (ฐานทดสอบ · rollback ทุกอย่าง): ทรานแซกชันล้างใช้คำสั่งล็อกตารางจาก cleanup.sql จริง
//      → อีกทรานแซกชันเขียนแถวทดสอบแทรก ต้องรอจนการล้างจบ · จำนวนที่นับ = จำนวนที่ลบ (สรุปการลบของฐาน) · แถวที่แทรกไม่ถูกลบเงียบ ๆ
//   3) ลำดับใน cleanup.sql: ล็อกตาราง → ด่านปนแถวจริง → ลบ · ข้อความจบของ run.mjs ใช้สรุปการลบของฐาน
//   ตกบนโค้ดก่อนแก้: ไม่มีล็อกชุดเว็บจริง (ไปหยุดที่ขั้นรอฐานจริงแทน) · cleanup.sql ไม่ล็อกตาราง (แถวแทรกได้ทันที)
// รัน: node tests/tools/prod-live-cleanup-race.test.mjs (ข้อ 2 ต้องถือล็อกฐานทดสอบ — ตัวห่อ tool-suites-db.spec.ts)
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n   ${String(เพิ่ม).slice(-900)}`}`); };
const ที่ = mkdtempSync(path.join(tmpdir(), "pms-live-race-"));
const ถือ = spawn(process.execPath, ["-e", "setTimeout(()=>{}, 600000)"], { stdio: "ignore" });

try {
  // ── 1) ล็อกชุดเว็บจริง ──
  const ล็อกชุด = path.join(ที่, "prod-live.lock"), ล็อกฐาน = path.join(ที่, "prod.lock");
  writeFileSync(ล็อกชุด, JSON.stringify({ token: "จำลอง-test", pid: ถือ.pid, งาน: "prod-live test", เริ่ม: new Date().toISOString() }));
  writeFileSync(ล็อกฐาน, JSON.stringify({ token: "จำลอง-ตาข่าย", pid: ถือ.pid, งาน: "ตาข่ายกันพลาดของข้อทดสอบ", เริ่ม: new Date().toISOString() }));
  const env = { ...process.env, PMS_PROD_LIVE_LOCK: ล็อกชุด, PMS_PROD_LOCK: ล็อกฐาน, PMS_PROD_READ_WAIT_MS: "1" };
  delete env.PMS_PROD_LIVE_LOCK_HELD; delete env.PMS_PROD_LOCK_HELD;
  const r = spawnSync(process.execPath, ["tests/prod-live/run.mjs", "--target", "prod", "cleanup", "--yes-prod"], { encoding: "utf8", env, timeout: 60_000 });
  const ออก = `${r.stdout}\n${r.stderr}`;
  ผล(r.status === 3 && /ชุดทดสอบเว็บจริง/.test(ออก) && /prod-live test/.test(ออก), "ขั้น test ถือล็อกอยู่ → cleanup ไม่เริ่ม บอกว่ารอขั้นไหน (exit 3)", `exit ${r.status}\n${ออก}`);
  ผล(!/ตาข่ายกันพลาด/.test(ออก), "หยุดที่ล็อกชุดเว็บจริง ก่อนขั้นรอฐานจริง (ไม่เดินต่อเข้าใกล้ฐานจริง)", ออก);

  // ── 3) ลำดับใน cleanup.sql + ข้อความจบ ──
  const ล้าง = readFileSync("tests/prod-live/cleanup.sql", "utf8");
  const ล็อกตาราง = /^lock table public\.audit_log in [a-z ]+ mode;$/m.exec(ล้าง)?.[0];
  const ที่ล็อก = ล็อกตาราง ? ล้าง.indexOf(ล็อกตาราง) : -1, ที่ด่าน = ล้าง.indexOf("_audit_is_test_row(\"user\", target, action)"), ที่ลบ = ล้าง.indexOf("delete from public.audit_log");
  ผล(ที่ล็อก > 0 && ที่ล็อก < ที่ด่าน && ที่ด่าน < ที่ลบ, "cleanup.sql: ล็อกตารางบันทึก → ด่านปนแถวจริง → ลบ (ในทรานแซกชันเดียว)", `ล็อก ${ที่ล็อก} ด่าน ${ที่ด่าน} ลบ ${ที่ลบ}`);
  const run = readFileSync("tests/prod-live/run.mjs", "utf8");
  ผล(/สรุปการลบล่าสุด/.test(run) && /ลบจริงตามฐาน/.test(run), "run.mjs: ข้อความจบใช้จำนวนจากสรุปการลบของฐาน");

  // ── 2) จำลองการเขียนแถวระหว่างล้าง ──
  const { psqlArgs, TESTDB_CONTAINER } = await import(new URL(`file:///${path.resolve("scripts/lib/testDbPsql.mjs").replace(/\\/g, "/")}`).href);
  if (!process.env.PMS_TESTDB_PG_PASSWORD) {
    ผล(false, "ข้อ 2 ต้องถือล็อกฐานทดสอบ (รันผ่าน tool-suites-db.spec.ts / toolrun)");
  } else if (!ล็อกตาราง) {
    ผล(false, "ข้อ 2: cleanup.sql ไม่มีคำสั่งล็อกตารางบันทึก — แถวแทรกระหว่างนับกับลบได้");
  } else {
    const ป้าย = `ZZT · จำลองแข่ง-${process.pid}`;
    const psql = (sql) => new Promise(res => { const p = spawn("docker", [...psqlArgs(TESTDB_CONTAINER), "-X", "-At", "-v", "ON_ERROR_STOP=1"]);
      let o = ""; p.stdout.on("data", d => o += d); p.stderr.on("data", d => o += d); p.on("close", c => res({ c, o, จบ: Date.now() })); p.stdin.end(sql); });
    // ทรานแซกชันล้าง: วางแถวทดสอบ 3 แถว (commit แยก) → ล็อกตาราง (คำสั่งจาก cleanup.sql) → นับ → หน่วงให้อีกฝั่งแทรก → ลบ → สรุปการลบ
    await psql(`set session_replication_role = replica; insert into public.audit_log ("user", role, action, target) select 'live-race@example.test', 'SUPER_ADMIN', 'จำลองแข่ง', '${ป้าย}' from generate_series(1, 3);`);
    const เริ่ม = Date.now();
    const ฝั่งล้าง = psql(`begin;
${ล็อกตาราง}
select 'นับ=' || count(*) from public.audit_log where target = '${ป้าย}';
select pg_sleep(2.5);
set local pms.audit_delete = 'test'; set local pms.audit_backup = 'ข้อทดสอบจำลองแข่ง';
with ลบ as (delete from public.audit_log where target = '${ป้าย}' returning 1) select 'ลบ=' || count(*) from ลบ;
commit;`);
    await new Promise(r2 => setTimeout(r2, 800));
    const ฝั่งแทรก = psql(`set session_replication_role = replica; insert into public.audit_log ("user", role, action, target) values ('live-race@example.test', 'SUPER_ADMIN', 'จำลองแข่ง', '${ป้าย}'); select 'แทรกเสร็จ';`);
    const [ก, ข] = await Promise.all([ฝั่งล้าง, ฝั่งแทรก]);
    const นับ = /นับ=(\d+)/.exec(ก.o)?.[1], ลบ = /ลบ=(\d+)/.exec(ก.o)?.[1];
    ผล(ก.c === 0 && นับ === "3" && ลบ === "3", "จำนวนที่นับในทรานแซกชันล้าง = จำนวนที่ลบ (3 = 3)", ก.o);
    ผล(ข.c === 0 && ข.จบ >= ก.จบ - 50, "แถวที่เขียนแทรกระหว่างล้าง ต้องรอจนการล้างจบ (ไม่แทรกระหว่างนับกับลบ)", `แทรกเสร็จ +${ข.จบ - เริ่ม} ms · ล้างเสร็จ +${ก.จบ - เริ่ม} ms\n${ข.o}`);
    const เหลือ = await psql(`select count(*) from public.audit_log where target = '${ป้าย}';`);
    ผล(เหลือ.o.trim().split("\n").at(-1) === "1", "แถวที่แทรกหลังการล้างยังอยู่ (ไม่ถูกลบโดยไม่ได้นับ)", เหลือ.o);
    await psql(`set session_replication_role = replica; set pms.audit_delete = 'test'; set pms.audit_backup = 'ข้อทดสอบจำลองแข่ง'; delete from public.audit_log where target = '${ป้าย}' or (action = 'ลบแถวทดสอบในบันทึกการใช้งาน' and target like '%ข้อทดสอบจำลองแข่ง');`);
  }
} finally {
  ถือ.kill();
  rmSync(ที่, { recursive: true, force: true });
}
console.log(ตก ? `\n✗ ตก ${ตก} ข้อ` : "\nALL PASS");
process.exit(ตก ? 1 : 0);
