// ── ข้อทดสอบ: ล้างข้อมูลทดสอบเว็บจริงไม่ซ้อนกับขั้นอื่น · นับ/ตรวจปน/ลบในทรานแซกชันเดียวหลังล็อกตาราง (บอสอนุมัติ 5 พ.ย. 69 · งาน "ลบ 0") ──
//   เหตุ: บอสรันล้างแล้วขั้นนับก่อนลบได้ 0 แต่ฐานลบจริง 54 · ต้นเหตุยังไม่ยืนยัน (ตัวเลขเข้ากับการเขียนแถวระหว่างนับกับลบ แต่เวลาไม่ชัด)
//   9 พ.ย. 69: ยืนยันได้บางส่วน — แถวส่วนหนึ่งเกิดในทรานแซกชันล้างเอง (ตัวดักใบ 0150 ตอน cleanup.sql ลบลีด/ใบ ZZT · cleanup-self-audit.test.mjs)
//   1) run.mjs --target prod: ขั้นอื่นของชุดเว็บจริงถือล็อกอยู่ → ไม่เริ่ม (exit 3) บอกว่ารออะไร · หยุดก่อนแตะฐานจริง
//      ตาข่ายกันพลาด: ล็อกฐานจริงจำลองถืออยู่ + รอได้ 1 มิลลิวินาที → ถ้าตัวกันไม่ทำงาน ก็หยุดที่ขั้นรอฐานจริง ไม่ถึงฐานจริง
//   2) จำลองการเขียนแถวระหว่างล้าง (ฐานทดสอบ · rollback ทุกอย่าง · ฝั่งล้าง = supabase/tests/cleanup_race_side.sql): ใช้คำสั่งล็อกตารางจาก cleanup.sql จริง
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
  const ที่ล็อก = ล็อกตาราง ? ล้าง.indexOf(ล็อกตาราง) : -1, ที่ด่าน = ล้าง.indexOf("_audit_is_test_row(\"user\", target, action)");
  const ที่ก่อนลบ = ล้าง.indexOf("set local pms.audit_backup = '__ชุดสำรองก่อนลบ__';"), ที่จบ = ล้าง.lastIndexOf("commit;");
  const ช่วง = ที่ล็อก > 0 && ที่จบ > ที่ล็อก ? ล้าง.slice(ที่ล็อก, ที่จบ) : "";
  ผล(ที่ล็อก > 0 && ที่ล็อก < ที่ด่าน && ที่ด่าน < ที่ก่อนลบ && !/^\s*(commit|begin|end)\s*;/mi.test(ช่วง),
    "cleanup.sql: ล็อกตารางบันทึก → ด่านปนแถวจริง → ลบ (ในทรานแซกชันเดียว ไม่มี commit คั่น)", `ล็อก ${ที่ล็อก} ด่าน ${ที่ด่าน} ก่อนลบ ${ที่ก่อนลบ} จบ ${ที่จบ}`);
  const run = readFileSync("tests/prod-live/run.mjs", "utf8");
  ผล(/สรุปการลบล่าสุด/.test(run) && /ลบจริงตามฐาน/.test(run), "run.mjs: ข้อความจบใช้จำนวนจากสรุปการลบของฐาน");

  // ── 2) จำลองการเขียนแถวระหว่างล้าง ──
  //   ฝั่งล้าง = supabase/tests/cleanup_race_side.sql (ทั้งไฟล์ rollback) โดยแทนบรรทัดล็อกด้วยบรรทัดจาก cleanup.sql จริง
  //   ฝั่งแทรก = อีกการเชื่อมต่อ เขียนแถวทดสอบระหว่างฝั่งล้างหน่วง แล้ว rollback (ไม่มีแถวค้าง ไม่ต้องลบจริง)
  const ฝั่งล้างไฟล์ = readFileSync("supabase/tests/cleanup_race_side.sql", "utf8");
  const ล็อกในไฟล์ = /^lock table public\.audit_log in [a-z ]+ mode;$/m.exec(ฝั่งล้างไฟล์)?.[0];
  ผล(!!ล็อกตาราง && ล็อกในไฟล์ === ล็อกตาราง, "คำสั่งล็อกใน cleanup_race_side.sql ตรงกับ cleanup.sql", `${ล็อกในไฟล์} ≠ ${ล็อกตาราง}`);
  const { psqlArgs, TESTDB_CONTAINER } = await import(new URL(`file:///${path.resolve("scripts/lib/testDbPsql.mjs").replace(/\\/g, "/")}`).href);
  if (!process.env.PMS_TESTDB_PG_PASSWORD) {
    ผล(false, "ข้อ 2 ต้องถือล็อกฐานทดสอบ (รันผ่าน tool-suites-db.spec.ts / toolrun)");
  } else if (!ล็อกตาราง || !ล็อกในไฟล์) {
    ผล(false, "ข้อ 2: cleanup.sql ไม่มีคำสั่งล็อกตารางบันทึก — แถวแทรกระหว่างนับกับลบได้");
  } else {
    const psql = (sql, เมื่อพิมพ์) => new Promise(res => { const p = spawn("docker", [...psqlArgs(TESTDB_CONTAINER), "-X", "-At", "-v", "ON_ERROR_STOP=1"]);
      let o = ""; p.stdout.on("data", d => { o += d; เมื่อพิมพ์?.(o); }); p.stderr.on("data", d => o += d); p.on("close", c => res({ c, o, จบ: Date.now() })); p.stdin.end(sql); });
    let วางแล้ว; const รอวาง = new Promise(r2 => { วางแล้ว = r2; });
    const เริ่ม = Date.now();
    const ฝั่งล้าง = psql(ฝั่งล้างไฟล์.replace(ล็อกในไฟล์, ล็อกตาราง), o => { if (o.includes("วางแถวแล้ว")) วางแล้ว(); });
    await Promise.race([รอวาง, ฝั่งล้าง]);
    await new Promise(r2 => setTimeout(r2, 800));
    const ฝั่งแทรก = psql(`begin; set local session_replication_role = replica;
insert into public.audit_log ("user", role, action, target) values ('live-race@example.test', 'SUPER_ADMIN', 'จำลองแข่ง', 'ZZT · จำลองแข่ง');
select 'เห็นแถวตัวเอง=' || count(*) from public.audit_log where target = 'ZZT · จำลองแข่ง';
rollback;`);
    const [ก, ข] = await Promise.all([ฝั่งล้าง, ฝั่งแทรก]);
    ผล(ก.c === 0 && /นับ=3/.test(ก.o) && /ลบ=3/.test(ก.o) && /ALL PASS/.test(ก.o), "จำนวนที่นับในทรานแซกชันล้าง = จำนวนที่ลบ (3 = 3)", ก.o);
    ผล(ข.c === 0 && ข.จบ >= ก.จบ - 50, "แถวที่เขียนแทรกระหว่างล้าง ต้องรอจนการล้างจบ (ไม่แทรกระหว่างนับกับลบ)", `แทรกเสร็จ +${ข.จบ - เริ่ม} ms · ล้างเสร็จ +${ก.จบ - เริ่ม} ms\n${ข.o}`);
    ผล(/เห็นแถวตัวเอง=1/.test(ข.o), "แถวที่แทรกหลังการล้างยังอยู่ (ไม่ถูกลบโดยไม่ได้นับ)", ข.o);
  }
} finally {
  ถือ.kill();
  rmSync(ที่, { recursive: true, force: true });
}
console.log(ตก ? `\n✗ ตก ${ตก} ข้อ` : "\nALL PASS");
process.exit(ตก ? 1 : 0);
