import { test, expect } from "@playwright/test";
import { spawn, execFileSync } from "node:child_process";
import { ADMIN, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { db } from "./funcHelpers";
import { ข้อมูลงานครบชุด, ล้างใบHQทดสอบ } from "./hqQuoteFixture";
import { สร้างสาขาของข้อ, type สาขาของข้อ } from "./ownDealer";
import { รันSQLในฐาน } from "./localDb";
import { psqlArgs, TESTDB_CONTAINER } from "../../scripts/lib/testDbPsql.mjs";

// ── HQ 2 คนบันทึกใบ HQ พร้อมกัน (ไม่มีคำสั่งล้างรัน) ต้องไม่ล็อกตาย — บังคับลำดับด้วย 2 การเชื่อมต่อ (คนรวมงานขอหลักฐาน 12 พ.ย. 69) ──
//   ฝั่ง 1: begin → hq_quote_save(ใบ X) → ถือธุรกรรมค้าง (ยังไม่ commit)
//   ก) คนละใบ: ฝั่ง 2 hq_quote_save(ใบ Y) ต้องจบทันทีโดยไม่รอฝั่ง 1 = ไม่มีล็อกที่แย่งกัน → วงไขว้เกิดไม่ได้
//   ข) ใบเดียวกัน: ฝั่ง 2 hq_quote_save(ใบ X) ต้องรอฝั่ง 1 (ล็อกแถวคำขอ for update) → ฝั่ง 1 commit → ฝั่ง 2 จบไม่มีข้อผิดพลาด
//   ทั้งสองแบบเป็นทางรับเรื่องครั้งแรก (คำขอใหม่ → กำลังตีราคา · ตัวดักลงบันทึก/แจ้งเตือน) ซึ่งแตะตารางมากที่สุด
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.setTimeout(180_000);

let ส: สาขาของข้อ;
const คำขอ: number[] = [];
const เลขลีด: number[] = [];
const ฐานเลข = 1_860_000_000 + Math.floor(Math.random() * 400_000) * 100;
let uidHQ = "";

test.beforeAll(async () => {
  ส = await สร้างสาขาของข้อ({ จังหวัด: "ตราด" });
  const sd = await db(ส.บัญชี);
  for (let i = 0; i < 3; i++) {
    const เลข = ฐานเลข + i, ชื่อ = `ZZTEST ลำดับล็อกบันทึกใบ ${ส.รหัส} ${i}`;
    expect((await sd.from("leads").insert({ id: `#L-${เลข}`, num_id: เลข, dealer_code: ส.รหัส, company: ชื่อ, name: ชื่อ, contact: "ผู้ทดสอบ",
      phone: `000-000-${String(800 + i).padStart(4, "0")}`, province: "ตราด", status: "BULLET", ...ข้อมูลงานครบชุด })).error, ชื่อ).toBeNull();
    const r = await sd.rpc("quote_request_submit", { p_lead_num_id: เลข, p_product: "โกดัง" });
    expect(r.error, `ส่งคำขอ ${ชื่อ}`).toBeNull();
    คำขอ.push(Number((r.data as { id: number }).id)); เลขลีด.push(เลข);
  }
  uidHQ = (รันSQLในฐาน(`select id from auth.users where lower(email) = lower('${ADMIN.email}');`) ?? "").trim();
  expect(uidHQ, "รหัสผู้ใช้ HQ ของข้อทดสอบ").toMatch(/^[0-9a-f-]{36}$/);
});
test.afterAll(async () => { if (ส) { ล้างใบHQทดสอบ(ส.รหัส, เลขลีด); await ส.ลบ(); } });

/** การเชื่อมต่อค้าง (psql) ในนาม HQ — ส่ง(sql) จบเมื่อคำสั่งชุดนั้นทำเสร็จ */
function เชื่อมต่อ(ชื่อ: string) {
  const p = spawn("docker", [...psqlArgs(TESTDB_CONTAINER), "-X", "-q", "-At", "-v", "ON_ERROR_STOP=0"], { stdio: ["pipe", "pipe", "pipe"] });
  let ออก = "", ผิด = "", ลำดับ = 0;
  p.stdout.setEncoding("utf8"); p.stderr.setEncoding("utf8");
  p.stdout.on("data", (d: string) => { ออก += d; }); p.stderr.on("data", (d: string) => { ผิด += d; });
  const ส่ง = (sql: string, รอ = 20_000) => new Promise<void>((ok, no) => {
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
const เปิดในนามHQ = () => `begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"${uidHQ}","role":"authenticated","user_role":"SUPER_ADMIN"}', true), set_config('request.jwt.claim.sub', '${uidHQ}', true);`;   // บทบาทอ่านจาก user_role ใน JWT (auth_role) แบบเดียวกับที่เว็บส่งมา
const บันทึก = (id: number) => `select 'บันทึกแล้ว=' || (public.hq_quote_save(${id}, '[{"name":"โครงสร้างเหล็ก","qty":10,"unit":"ตัน","unitCost":32000}]'::jsonb, (current_date + 30), '')).id;`;
const pidของ = async (c: ReturnType<typeof เชื่อมต่อ>) => { await c.ส่ง("select 'pid=' || pg_backend_pid();"); return Number(/pid=(\d+)/.exec(c.ออก())?.[1]); };
const รอล็อกอยู่ = (pid: number) => execFileSync("docker", [...psqlArgs(TESTDB_CONTAINER), "-X", "-q", "-At", "-c",
  `select count(*) from pg_stat_activity where pid = ${pid} and wait_event_type = 'Lock'`], { encoding: "utf8" }).trim() === "1";
const รอจน = async (เงื่อนไข: () => boolean, วิ = 10) => { const t = Date.now(); while (Date.now() - t < วิ * 1000) { if (เงื่อนไข()) return true; await new Promise(r => setTimeout(r, 50)); } return false; };

test("[db·hq] HQ 2 คนบันทึกใบ HQ คนละใบพร้อมกัน — ฝั่งที่สองไม่ต้องรอฝั่งแรกเลย (ไม่มีล็อกแย่งกัน = ล็อกตายไม่ได้)", async () => {
  const ก = เชื่อมต่อ("ก"), ข = เชื่อมต่อ("ข");
  try {
    await ก.ส่ง(เปิดในนามHQ()); await ข.ส่ง(เปิดในนามHQ());
    await ก.ส่ง(บันทึก(คำขอ[0]));
    expect(ก.ผิด(), "ฝั่ง ก บันทึกใบ X สำเร็จ (ถือธุรกรรมค้าง)").not.toMatch(/ERROR/);
    await ข.ส่ง(บันทึก(คำขอ[1]), 5_000);   // ต้องจบเองภายใน 5 วิ ขณะฝั่ง ก ยังไม่ commit
    expect(ข.ผิด(), "ฝั่ง ข บันทึกใบ Y ได้ทันทีโดยไม่รอฝั่ง ก").not.toMatch(/ERROR/);
    await ก.ส่ง("commit;"); await ข.ส่ง("commit;");
    expect(ก.ผิด() + ข.ผิด(), "ไม่มี deadlock / ข้อผิดพลาด").not.toMatch(/ERROR|deadlock/i);
    expect((ก.ออก() + ข.ออก()).match(/บันทึกแล้ว=\d+/g)?.length, "บันทึกครบ 2 ใบ").toBe(2);
  } finally { ก.ปิด(); ข.ปิด(); }
});

test("[db·hq] HQ 2 คนบันทึกใบ HQ ใบเดียวกันพร้อมกัน — ฝั่งที่สองรอแล้วทำต่อ ไม่ล็อกตาย", async () => {
  const ก = เชื่อมต่อ("ก"), ข = เชื่อมต่อ("ข");
  try {
    await ก.ส่ง(เปิดในนามHQ()); await ข.ส่ง(เปิดในนามHQ());
    const pidข = await pidของ(ข);
    await ก.ส่ง(บันทึก(คำขอ[2]));
    expect(ก.ผิด(), "ฝั่ง ก บันทึกใบ X สำเร็จ (ถือธุรกรรมค้าง)").not.toMatch(/ERROR/);
    const งานข = ข.ส่ง(บันทึก(คำขอ[2]), 30_000).catch(e => e);
    expect(await รอจน(() => รอล็อกอยู่(pidข)), "ฝั่ง ข รอฝั่ง ก (ล็อกแถวคำขอเดียวกัน)").toBe(true);
    await ก.ส่ง("commit;");
    expect(await งานข, "ฝั่ง ข ทำต่อจนจบหลังฝั่ง ก commit").toBeUndefined();
    await ข.ส่ง("commit;");
    expect(ก.ผิด() + ข.ผิด(), "ไม่มี deadlock / ข้อผิดพลาด").not.toMatch(/ERROR|deadlock/i);
    expect((ก.ออก() + ข.ออก()).match(/บันทึกแล้ว=\d+/g)?.length, "บันทึกครบทั้งสองฝั่ง (ฝั่งหลังแก้ร่างเดิม)").toBe(2);
  } finally { ก.ปิด(); ข.ปิด(); }
});
