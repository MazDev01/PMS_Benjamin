// ── ข้อทดสอบ: คำสั่งล้างเว็บจริง (tests/prod-live/cleanup.sql) ไม่รอกันไขว้กับงานหน้าเว็บ (deadlock) — แบบเกิดแน่ทุกครั้ง ──────────
//   บอสสั่ง 12 พ.ย. 69: สุ่ม 15 ครั้งไม่เกิด = พิสูจน์ไม่ได้ → บังคับลำดับล็อกเองด้วย 2 การเชื่อมต่อ
//   ตาราง A = hq_quotes (คำสั่งล้างปิดตัวดักก่อน) · B = quotations (ปิดตัวดักทีหลัง)
//     1) ฝั่งล้าง: รันไฟล์ตัวจริงช่วงแรก (ถึงก่อนบรรทัด alter table quotations) — ถือ A แล้วค้างไว้
//     2) ฝั่งบันทึก (แทนงานหน้าเว็บ): begin · ล็อก B (row exclusive = แบบที่การเขียนแถวขอ) · แล้วขอ A
//     3) ฝั่งล้าง: รันช่วงที่เหลือ (alter table quotations = ขอ B)
//   โค้ดเดิม: ล้างถือ A รอ B · บันทึกถือ B รอ A → ฐานตัดสิน "deadlock detected" ทุกครั้ง
//   โค้ดใหม่: ล้างล็อก A+B พร้อมกันตั้งแต่ต้นไฟล์ (nowait วนขอใหม่) → บันทึกรอที่ B ตั้งแต่ขั้น 2 · ไม่มีวงไขว้ · ทั้งสองฝั่งจบ
//   ช่วงท้ายของไฟล์เปลี่ยน commit เป็น rollback — ไม่ลบอะไรจริง · ใช้ฐานทดสอบ (ต้องถือล็อก: รันผ่าน tool-suites-db.spec.ts)
// รัน: node tests/tools/cleanup-lock-order.test.mjs
import { readFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";

let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n   ${String(เพิ่ม).slice(-1500)}`}`); };
const จบ = () => { console.log(ตก ? `\n✗ ตก ${ตก} ข้อ` : "\nALL PASS"); process.exit(ตก ? 1 : 0); };

if (!process.env.PMS_TESTDB_PG_PASSWORD) { ผล(false, "ต้องถือล็อกฐานทดสอบ (รันผ่าน tool-suites-db.spec.ts / toolrun)"); จบ(); }
const { psqlArgs, TESTDB_CONTAINER } = await import(new URL(`file:///${path.resolve("scripts/lib/testDbPsql.mjs").replace(/\\/g, "/")}`).href);
const ฐาน = psqlArgs(TESTDB_CONTAINER);

// ── ไฟล์ตัวจริง แบ่งสองช่วง ──
const ไฟล์ = readFileSync("tests/prod-live/cleanup.sql", "utf8").replace(/\r\n/g, "\n").replaceAll("__ชุดสำรองก่อนลบ__", "ข้อทดสอบ cleanup-lock-order");
const จุดแบ่ง = ไฟล์.search(/^alter table public\.quotations disable trigger/m);
ผล(จุดแบ่ง > 0 && /^commit;$/m.test(ไฟล์), "พบบรรทัด alter table public.quotations disable trigger และ commit ในไฟล์ล้าง");
if (จุดแบ่ง <= 0) จบ();
const ช่วงแรก = ไฟล์.slice(0, จุดแบ่ง);
const ช่วงหลัง = ไฟล์.slice(จุดแบ่ง).replace(/^commit;$/m, "rollback;");

/** การเชื่อมต่อค้าง (psql เปิดค้าง ป้อนคำสั่งทีละขั้น) — ส่ง(sql) คืน promise ที่จบเมื่อคำสั่งชุดนั้นทำเสร็จ (เครื่องหมายท้าย) */
function เชื่อมต่อ(ชื่อ) {
  const p = spawn("docker", [...ฐาน, "-X", "-q", "-At", "-v", "ON_ERROR_STOP=0"], { stdio: ["pipe", "pipe", "pipe"] });
  let ออก = "", ผิด = "", ลำดับ = 0;
  p.stdout.setEncoding("utf8"); p.stderr.setEncoding("utf8");
  p.stdout.on("data", d => { ออก += d; });
  p.stderr.on("data", d => { ผิด += d; });
  const ส่ง = (sql, รอ = 20_000) => new Promise((ok, no) => {
    const ป้าย = `__จบ_${ชื่อ}_${++ลำดับ}__`;
    p.stdin.write(`${sql}\n\\echo ${ป้าย}\n`);
    const เริ่ม = Date.now();
    const ดู = setInterval(() => {
      if (ออก.includes(ป้าย)) { clearInterval(ดู); ok(); }
      else if (Date.now() - เริ่ม > รอ) { clearInterval(ดู); no(new Error(`${ชื่อ}: ไม่จบใน ${รอ / 1000} วิ`)); }
    }, 25);
  });
  return { ส่ง, ผิด: () => ผิด, ออก: () => ออก, ปิด: () => { try { p.stdin.end(); } catch { /* */ } setTimeout(() => p.kill(), 2000); } };
}
/** การเชื่อมต่อ pid นี้กำลังรอล็อกอยู่ไหม (อ่านจากการเชื่อมต่อแยก · บัญชีเดียวกันเห็นสถานะกัน) */
const รอล็อกอยู่ = (pid) => spawnSync("docker", [...ฐาน, "-X", "-q", "-At", "-c", `select count(*) from pg_stat_activity where pid = ${pid} and wait_event_type = 'Lock'`], { encoding: "utf8" }).stdout.trim() === "1";
const รอจน = async (เงื่อนไข, วิ = 10) => { const เริ่ม = Date.now(); while (Date.now() - เริ่ม < วิ * 1000) { if (เงื่อนไข()) return true; await new Promise(r => setTimeout(r, 50)); } return false; };

const ล้าง = เชื่อมต่อ("ล้าง"), บันทึก = เชื่อมต่อ("บันทึก");
try {
  await บันทึก.ส่ง("select 'pid=' || pg_backend_pid();");
  const pidบันทึก = Number(/pid=(\d+)/.exec(บันทึก.ออก())?.[1]);
  ผล(pidบันทึก > 0, "อ่านเลขการเชื่อมต่อฝั่งบันทึกได้", บันทึก.ออก());

  // 1) ฝั่งล้าง: ช่วงแรกของไฟล์ (ถือ A = hq_quotes · โค้ดใหม่ถือ A+B)
  await ล้าง.ส่ง(ช่วงแรก);
  ผล(!/ERROR/.test(ล้าง.ผิด()), "ฝั่งล้าง: ช่วงแรกของไฟล์ทำงานจบ (ถือตาราง A ค้างไว้)", ล้าง.ผิด());

  // 2) ฝั่งบันทึก: ถือ B แล้วขอ A (ไม่รอผล — โค้ดใหม่จะรอที่ B · โค้ดเดิมจะรอที่ A)
  const งานบันทึก = บันทึก.ส่ง("begin;\nlock table public.quotations in row exclusive mode;\nlock table public.hq_quotes in row exclusive mode;\nrollback;", 60_000).catch(e => e);
  ผล(await รอจน(() => รอล็อกอยู่(pidบันทึก)), "ฝั่งบันทึกรอล็อกอยู่ (ถือ B รอ A · หรือรอที่ B ถ้าฝั่งล้างถือไว้แล้ว)");

  // 3) ฝั่งล้าง: ช่วงที่เหลือ (ขอ B) → โค้ดเดิม = วงไขว้ ฐานตัดสิน deadlock
  const งานล้าง = ล้าง.ส่ง(ช่วงหลัง, 60_000).catch(e => e);
  const [จบล้าง, จบบันทึก] = await Promise.all([งานล้าง, งานบันทึก]);
  const ข้อความ = `ฝั่งล้าง: ${ล้าง.ผิด().slice(-600)}\nฝั่งบันทึก: ${บันทึก.ผิด().slice(-600)}`;
  ผล(!/deadlock detected/i.test(ล้าง.ผิด() + บันทึก.ผิด()), "ไม่มี deadlock detected ทั้งสองฝั่ง (โค้ดเดิม: ล้างถือ A รอ B · บันทึกถือ B รอ A)", ข้อความ);
  ผล(!(จบล้าง instanceof Error) && !(จบบันทึก instanceof Error), "ทั้งสองฝั่งทำงานจบ ไม่ค้าง", `${จบล้าง?.message ?? ""} ${จบบันทึก?.message ?? ""}\n${ข้อความ}`);
  ผล(!/ERROR/.test(บันทึก.ผิด()), "ฝั่งบันทึกได้ล็อกครบ (รอจนฝั่งล้างจบแล้วทำต่อ)", บันทึก.ผิด());
} finally {
  ล้าง.ปิด(); บันทึก.ปิด();
}
จบ();
