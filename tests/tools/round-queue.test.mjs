// ── ข้อทดสอบ: รายการรอรอบ + ปิดรอบด้วยคำตอบของบอส + ตัวกันรอบตรวจเต็ม (บอสสั่ง 5 พ.ย. 69 · scripts/lib/roundQueue.mjs) ──
//   ที่เก็บรอบชี้โฟลเดอร์ชั่วคราว (PMS_ROUND_DIR) · ไฟล์ล็อกฐานทดสอบชี้ไฟล์ที่ข้อนี้ถือไว้เอง (PMS_TESTDB_LOCK)
//   → test:prodbuild ที่ผ่านตัวกันรอบไปได้จะหยุดที่ล็อก (exit 3) ก่อน build/แตะฐาน — ไม่มีอะไรรันจริง
//   ตกบนโค้ดก่อนแก้: ไม่มีคำสั่ง round:* และ test:prodbuild รอบเต็มเดินไปถึงล็อกฐานโดยไม่ถามรอบ (exit 3 แทน 2)
// รัน: node tests/tools/round-queue.test.mjs
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n   ${String(เพิ่ม).slice(0, 900)}`}`); };
const ที่ = mkdtempSync(join(tmpdir(), "pms-round-"));
const ล็อก = join(ที่, "testdb.lock");
writeFileSync(ล็อก, JSON.stringify({ token: `test-${process.pid}`, pid: process.pid, งาน: "ข้อทดสอบ round-queue ถือไว้", เซสชัน: "ข้อทดสอบ", เริ่ม: new Date().toISOString() }));
const env = { ...process.env, PMS_ROUND_DIR: join(ที่, "round"), PMS_GATE_RESUME_DIR: join(ที่, "resume"), PMS_TESTDB_LOCK: ล็อก, PMS_TESTDB_LOCK_WAIT: "0", PMS_TESTDB_LOCK_HELD: "" };
// รายชื่อใบบนฐานจริงที่จดไว้ (ตัวกันเลขใบ 5 พ.ย. 69) = ใบในเครื่องทั้งหมด → ไม่มีใบใหม่ · รอบไม่มีใบก็ตรงกัน (ข้อนี้วัดเรื่องรอบ · เรื่องใบวัดที่ migration-order.test.mjs)
mkdirSync(join(ที่, "round"), { recursive: true });
writeFileSync(join(ที่, "round", "prod-migrations.json"), JSON.stringify({ ใบ: readdirSync("supabase/migrations").filter(n => /^\d{4}_.*\.sql$/.test(n)).sort() }));
const สั่ง = (...a) => { const r = spawnSync(process.execPath, ["scripts/round.mjs", ...a], { encoding: "utf8", env }); return { code: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") }; };
const รอบเต็ม = (extraEnv = {}, args = []) => {
  const r = spawnSync(process.execPath, ["scripts/test-prodbuild.mjs", ...args], { encoding: "utf8", env: { ...env, ...extraEnv }, timeout: 120_000 });
  return { code: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") };
};
const รหัสของ = (out) => /รหัส (r[0-9a-z]+)/.exec(out)?.[1];
const อ่านรอบ = () => JSON.parse(readFileSync(join(ที่, "round", "round.json"), "utf8"));

try {
  // ── ยังไม่มีรอบ: รอบเต็มไม่เริ่ม (ทั้งแบบปกติ / PMS_GATE_FULL=1) · ระบุไฟล์ยังรันได้ (ไปถึงล็อก = exit 3) ──
  let g = รอบเต็ม();
  ผล(g.code === 2 && /ไม่เริ่มรอบตรวจเต็ม/.test(g.out) && /ยังไม่ปิดรอบ/.test(g.out) && /round:close/.test(g.out), "ยังไม่ปิดรอบ → test:prodbuild รอบเต็มปฏิเสธพร้อมเหตุผล (ก่อนขอล็อกฐาน)", `exit ${g.code}\n${g.out}`);
  g = รอบเต็ม({ PMS_GATE_FULL: "1" });
  ผล(g.code === 2 && /ยังไม่ปิดรอบ/.test(g.out), "PMS_GATE_FULL=1 ก็ปฏิเสธ (ไม่ใช่ทางข้าม)", `exit ${g.code}\n${g.out}`);
  g = รอบเต็ม({}, ["--reporter=line"]);
  ผล(g.code === 2 && /ยังไม่ปิดรอบ/.test(g.out), "ใส่แค่ --reporter = ยังนับเป็นรอบเต็ม → ปฏิเสธ", `exit ${g.code}\n${g.out}`);
  g = รอบเต็ม({}, ["tests/scenario/ux.spec.ts"]);
  ผล(g.code === 3 && !/ไม่เริ่มรอบตรวจเต็ม/.test(g.out), "ระบุไฟล์ (ข้อทดสอบของส่วนที่แก้) ไม่ต้องปิดรอบ — เดินต่อถึงล็อกฐาน", `exit ${g.code}\n${g.out}`);
  // โหมดเจาะช่วง prod-live (บอสอนุญาต 5 พ.ย. 69 · ทดสอบส่วนตัวของงานที่แก้ชุดเว็บจริง) ไม่ใช่รอบเต็ม → ไม่ต้องปิดรอบ
  g = รอบเต็ม({ PMS_GATE_ONLY_LIVE: "1" });
  ผล(g.code === 3 && !/ไม่เริ่มรอบตรวจเต็ม/.test(g.out), "โหมดเจาะช่วง prod-live (PMS_GATE_ONLY_LIVE=1) รันได้โดยไม่ต้องปิดรอบ — เดินต่อถึงล็อกฐาน", `exit ${g.code}\n${g.out}`);

  // ── รายการรอรอบ ──
  let r = สั่ง("list");
  ผล(r.code === 0 && /รายการรอรอบตรวจเต็ม 0 งาน/.test(r.out) && /ยังไม่เคยปิดรอบ/.test(r.out), "round:list ตอนว่าง", r.out);
  r = สั่ง("close", "--บอสตอบ", "09:30");
  ผล(r.code === 2 && /ไม่มีงานในรอบ/.test(r.out), "ไม่มีงาน = ปิดรอบไม่ได้", r.out);
  r = สั่ง("add", "--งาน", "ใบ 0277 ตัวอย่าง", "--เซสชัน", "ef");
  const ก = รหัสของ(r.out);
  ผล(r.code === 0 && !!ก && /ยังไม่ผ่านทดสอบส่วนตัว/.test(r.out), "round:add ไม่ใส่ --ทดสอบผ่าน = ยังไม่ผ่าน", r.out);
  r = สั่ง("add", "--งาน", "หน้าแดชบอร์ด", "--เซสชัน", "reqdealer", "--ทดสอบผ่าน");
  const ข = รหัสของ(r.out);
  ผล(r.code === 0 && !!ข && /ทดสอบส่วนตัวผ่าน/.test(r.out), "round:add --ทดสอบผ่าน", r.out);
  r = สั่ง("add", "--เซสชัน", "ef");
  ผล(r.code === 2 && /ต้องระบุงาน/.test(r.out), "ไม่ระบุงาน = ปฏิเสธ", r.out);
  r = สั่ง("list");
  ผล(/รายการรอรอบตรวจเต็ม 2 งาน \(ทดสอบส่วนตัวผ่าน 1 · ยังไม่ผ่าน 1\)/.test(r.out) && r.out.includes("ใบ 0277 ตัวอย่าง") && r.out.includes("เซสชัน reqdealer")
    && /งานที่ยังไม่เสร็จ/.test(r.out) && /ตรวจเลย/.test(r.out) && /รอเพิ่มงานก่อน/.test(r.out) && /db:push/.test(r.out), "round:list พิมพ์ข้อมูลพร้อมใช้ในกล่องคำถาม (งาน · เซสชัน · สถานะ · งานที่ยังไม่เสร็จ · ตัวเลือก)", r.out);

  // ── ปิดรอบ ──
  r = สั่ง("close");
  ผล(r.code === 2 && /ต้องระบุเวลาที่บอสตอบ/.test(r.out), "ไม่ระบุเวลาที่บอสตอบ = ปิดรอบไม่ได้", r.out);
  r = สั่ง("close", "--บอสตอบ", "5 พ.ย. 69 09:30");
  ผล(r.code === 2 && r.out.includes(ก) && /ทดสอบส่วนตัวยังไม่ผ่าน/.test(r.out), "มีงานที่ทดสอบส่วนตัวยังไม่ผ่าน = ปิดรอบไม่ได้ (บอกรหัส)", r.out);
  ผล(!existsSync(join(ที่, "round", "round.json")), "ปิดไม่สำเร็จ = ไม่มีรอบเกิดขึ้น");
  r = สั่ง("pass", "--รหัส", ก);
  ผล(r.code === 0, "round:pass ตั้งผ่านภายหลัง", r.out);
  r = สั่ง("close", "--บอสตอบ", "5 พ.ย. 69 09:30");
  ผล(r.code === 0 && /ปิดรอบ รอบ-/.test(r.out), "ทดสอบผ่านครบ + บอสตอบ = ปิดรอบได้", r.out);
  let รอบ = อ่านรอบ();
  ผล(รอบ.สถานะ === "ปิดแล้ว" && รอบ.บอสตอบ === "5 พ.ย. 69 09:30" && รอบ.งาน.length === 2 && /^[0-9a-f]{64}$/.test(รอบ.ลายนิ้วมือ)
    && existsSync(join(ที่, "round", "rounds", `${รอบ.รอบ}.json`)), "บันทึกสำเนารายการ + ลายนิ้วมือ + เวลาที่บอสตอบ (+ สำเนาในประวัติ)", JSON.stringify(รอบ));
  r = สั่ง("close", "--บอสตอบ", "09:40");
  ผล(r.code === 2 && /ปิดไว้แล้วยังไม่ผ่าน/.test(r.out), "ปิดซ้ำทั้งที่รอบเดิมยังไม่ผ่าน = ปฏิเสธ", r.out);

  // ── โหมดเจาะช่วง prod-live ไม่ทำให้รอบนับว่าผ่าน: ไม่จดเริ่มรอบ (รอบยัง "ปิดแล้ว") · ไม่เข้าโหมดรันต่อ · ไม่ลบผลรอบที่ตกที่จดไว้ ──
  //   ที่จดผลรอบ = path.join(cwd, PMS_GATE_RESUME_DIR) (scripts/lib/gateResume.mjs) → ใช้ทางสัมพัทธ์ใต้ test-results ของข้อนี้
  const ที่จดสัมพัทธ์ = `test-results/gate-resume-roundq-${process.pid}`, ที่จด = join(process.cwd(), ที่จดสัมพัทธ์);
  mkdirSync(ที่จด, { recursive: true });
  writeFileSync(join(ที่จด, "ผลรอบที่ตก-ตัวอย่าง.txt"), "ผลรอบที่ตกที่จดไว้ (ข้อทดสอบ)");
  g = รอบเต็ม({ PMS_GATE_ONLY_LIVE: "1", PMS_GATE_RESUME_DIR: ที่จดสัมพัทธ์ });
  ผล(g.code === 3 && อ่านรอบ().สถานะ === "ปิดแล้ว" && !(อ่านรอบ().รัน ?? []).length && !/โหมดรันต่อ|รอบเต็ม \(/.test(g.out),
    "โหมดเจาะช่วง prod-live ไม่จดเริ่มรอบ/ไม่เข้าโหมดรันต่อ (รอบไม่ถูกนับว่าตรวจ/ผ่าน)", `exit ${g.code} · ${JSON.stringify(อ่านรอบ())}\n${g.out}`);
  ผล(existsSync(join(ที่จด, "ผลรอบที่ตก-ตัวอย่าง.txt")), "โหมดเจาะช่วง prod-live ไม่ลบผลรอบที่ตกที่จดไว้");
  const ซอร์สเจาะ = readFileSync("scripts/test-prodbuild.mjs", "utf8");
  const ทางแยก = ซอร์สเจาะ.indexOf('if (process.env.PMS_GATE_ONLY_LIVE === "1")');
  ผล(ทางแยก > 0 && ทางแยก < ซอร์สเจาะ.lastIndexOf("บันทึกเมื่อผ่าน({") && ซอร์สเจาะ.slice(ทางแยก, ซอร์สเจาะ.indexOf("}", ซอร์สเจาะ.indexOf("process.exit(code)", ทางแยก))).search(/บันทึกเมื่อผ่าน|จบรอบ\(|บันทึกcommitที่ผ่าน/) < 0,
    "ทางแยกโหมดเจาะช่วงออกก่อนขั้นจดผลผ่านรอบ (ไม่จด gate-passed · ไม่จบรอบ)");
  rmSync(ที่จด, { recursive: true, force: true });

  // ── รอบที่ปิดแล้ว: รอบเต็มผ่านตัวกัน (เดินต่อถึงล็อก) ──
  g = รอบเต็ม();
  ผล(g.code === 3 && /บอสตอบ "ตรวจเลย" 5 พ.ย. 69 09:30/.test(g.out) && !/ไม่เริ่มรอบตรวจเต็ม/.test(g.out), "ปิดรอบแล้ว → รอบเต็มเริ่มได้ (บอกรอบ + เวลาที่บอสตอบ)", `exit ${g.code}\n${g.out}`);
  ผล(อ่านรอบ().สถานะ === "กำลังตรวจ" && (อ่านรอบ().รัน ?? []).length === 1, "เริ่มรอบเต็ม = จดว่ากำลังตรวจ (รันต่อของรอบเดิมใช้ได้)", JSON.stringify(อ่านรอบ()));
  g = รอบเต็ม();
  ผล(g.code === 3 && !/ไม่เริ่มรอบตรวจเต็ม/.test(g.out), "รอบเดิมที่ยังไม่ผ่าน (ตก → รันต่อ/รันใหม่) เริ่มได้อีก", `exit ${g.code}\n${g.out}`);

  // ── รายการเปลี่ยนหลังปิดรอบ ──
  r = สั่ง("add", "--งาน", "งานแทรกหลังบอสอนุมัติ", "--เซสชัน", "ef", "--ทดสอบผ่าน");
  const ค = รหัสของ(r.out);
  g = รอบเต็ม();
  ผล(g.code === 2 && /รายการรอรอบเปลี่ยนหลังบอสอนุมัติ/.test(g.out) && g.out.includes("งานแทรกหลังบอสอนุมัติ"), "เพิ่มงานหลังปิดรอบ → รอบเต็มปฏิเสธ (บอกงานที่เพิ่ม)", `exit ${g.code}\n${g.out}`);
  r = สั่ง("cancel");
  ผล(r.code === 2 && /ต้องระบุเหตุ/.test(r.out), "ยกเลิกรอบต้องมีเหตุ", r.out);
  r = สั่ง("cancel", "--เหตุ", "มีงานแทรก ถามบอสใหม่");
  ผล(r.code === 0 && อ่านรอบ().สถานะ === "ยกเลิก", "ยกเลิกรอบเดิม", r.out);
  g = รอบเต็ม();
  ผล(g.code === 2 && /ยกเลิกแล้ว/.test(g.out), "รอบที่ยกเลิก = รอบเต็มเริ่มไม่ได้", `exit ${g.code}\n${g.out}`);
  r = สั่ง("close", "--บอสตอบ", "10:05", "--ตัด", ค, "--เร่งด่วน");
  รอบ = อ่านรอบ();
  ผล(r.code === 0 && รอบ.เร่งด่วน === true && รอบ.ตัดออก.includes(ค) && รอบ.งาน.length === 2 && /เร่งด่วน/.test(r.out), "ปิดรอบใหม่ตัดงานแทรกออก + ป้ายเร่งด่วน", r.out);
  g = รอบเต็ม();
  ผล(g.code === 3 && /\(เร่งด่วน\)/.test(g.out), "งานที่ตัดออกไม่ทำให้รายการ \"เปลี่ยน\" → รอบเต็มเริ่มได้", `exit ${g.code}\n${g.out}`);
  r = สั่ง("pass", "--รหัส", "rไม่มีรหัสนี้");
  ผล(r.code === 2 && /ไม่มีงานรหัส/.test(r.out), "ตั้งผ่านงานที่ไม่มี = ปฏิเสธ", r.out);

  // ── รอบผ่านแล้ว = ใช้ซ้ำไม่ได้ · งานของรอบออกจากรายการ งานที่ตัดยังรอรอบหน้า ──
  const { จบรอบ } = await import(new URL("../../scripts/lib/roundQueue.mjs", import.meta.url).href + `?t=${Date.now()}`);
  process.env.PMS_ROUND_DIR = env.PMS_ROUND_DIR;
  const จบ = จบรอบ({ sha: "abc1234", ป้าย: "ข้อทดสอบ" });
  ผล(จบ?.สถานะ === "ผ่านแล้ว", "จบรอบ = ผ่านแล้ว", JSON.stringify(จบ));
  g = รอบเต็ม();
  ผล(g.code === 2 && /ผ่านและใช้ไปแล้ว/.test(g.out), "รอบที่ผ่านแล้ว → รอบเต็มอีกครั้งปฏิเสธ (ใช้ซ้ำไม่ได้)", `exit ${g.code}\n${g.out}`);
  r = สั่ง("list");
  ผล(/รายการรอรอบตรวจเต็ม 1 งาน/.test(r.out) && r.out.includes("งานแทรกหลังบอสอนุมัติ"), "งานของรอบที่ผ่านออกจากรายการ · งานที่ตัดออกยังรอรอบหน้า", r.out);
  ผล(readdirSync(join(ที่, "round", "rounds")).length === 2, "ประวัติรอบเก็บครบทุกรอบ (ยกเลิก + ผ่าน)");

  // ── ไม่มีทางข้าม: ตัวรันรอบตรวจไม่อ่านตัวแปรแวดล้อมปิดตัวกัน ──
  const ซอร์ส = readFileSync("scripts/test-prodbuild.mjs", "utf8");
  const ตัวกัน = ซอร์ส.slice(ซอร์ส.indexOf("const รอบเต็มของบอส"), ซอร์ส.indexOf("process.exit(2);", ซอร์ส.indexOf("const รอบเต็มของบอส")));
  ผล(ตัวกัน.length > 0 && !/process\.env/.test(ตัวกัน), "ตัวกันรอบเต็มไม่มีเงื่อนไขจากตัวแปรแวดล้อม", ตัวกัน);
  // จุดอ้างต้องเจอจริงทุกจุด (เดิมหาข้อความป้ายล็อกแบบเก่า — ป้ายเปลี่ยนเป็น ป้ายล็อกรอบทดสอบ() ใน 515f64d แล้วหาไม่เจอ)
  const ที่ตัวกัน = ซอร์ส.indexOf("ตรวจก่อนรอบเต็ม()"), ที่ขอล็อก = ซอร์ส.indexOf("= ขอล็อกฐานทดสอบ("), ที่ลบผล = ซอร์ส.indexOf("ลบที่จด()");
  ผล(ที่ตัวกัน >= 0 && ที่ขอล็อก >= 0 && ที่ลบผล >= 0 && ที่ตัวกัน < ที่ขอล็อก && ที่ตัวกัน < ที่ลบผล,
    "ตัวกันอยู่ก่อนขอล็อกฐานและก่อนล้างผลรอบที่ตก");
} finally {
  rmSync(ที่, { recursive: true, force: true });
}
console.log(ตก ? `\n✗ ตก ${ตก} ข้อ` : "\nALL PASS");
process.exit(ตก ? 1 : 0);
