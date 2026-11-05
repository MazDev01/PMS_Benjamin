// ── ข้อทดสอบตัวกันเลขใบ (บอสสั่ง 5 พ.ย. 69 · scripts/lib/migrationOrder.mjs) — ไม่แตะฐานจริง ไม่ build ─────────────────────
//   ก. ใบในเครื่องที่ยังไม่อยู่บนฐาน แต่เลขน้อยกว่าใบล่าสุดบนฐาน = ข้ามลำดับ → db:push + รอบตรวจเต็มปฏิเสธ (ภาษาไทย)
//   ข. round:add --ใบ · round:list/round:close แสดง/จดรายการใบ · ลายนิ้วมือรวมใบ
//      รอบตรวจเต็มปฏิเสธเมื่อใบใหม่ในเครื่องไม่ตรงกับใบของรอบ (เกิน/ขาด) · db:push ปฏิเสธใบที่ไม่อยู่ในรอบที่ผ่านแล้วล่าสุด
//   db:push รันโหมดทดสอบเครื่องมือ (PMS_PUSH_TEST=1 · --dry-run = ไม่สำรอง ไม่ผูกฐาน · ใบที่จะลง = PMS_PUSH_TEST_PENDING) กับโฟลเดอร์ใบปลอม
//   test:prodbuild: ที่เก็บรอบ/ล็อกฐานชั่วคราว (ผ่านตัวกัน = หยุดที่ล็อก exit 3 · ไม่รันอะไรจริง)
//   ตกบนโค้ดก่อนแก้: ไม่มี --ใบ · ไม่มีรายชื่อใบบนฐาน · db:push/รอบเต็มไม่ตรวจเลขใบ (ใบข้ามลำดับ/นอกรอบผ่านไปได้)
// รัน: node tests/tools/migration-order.test.mjs
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n   ${String(เพิ่ม).slice(-1200)}`}`); };
const ที่ = mkdtempSync(join(tmpdir(), "pms-migorder-"));
const รอบที่ = join(ที่, "round"), ใบที่ = join(ที่, "migrations");
mkdirSync(join(รอบที่, "rounds"), { recursive: true }); mkdirSync(ใบที่, { recursive: true });
const ล็อก = join(ที่, "testdb.lock");
writeFileSync(ล็อก, JSON.stringify({ token: `test-${process.pid}`, pid: process.pid, งาน: "ข้อทดสอบ migration-order ถือไว้", เซสชัน: "ข้อทดสอบ", เริ่ม: new Date().toISOString() }));
const ใส่ใบ = (...ชื่อ) => { for (const n of ชื่อ) writeFileSync(join(ใบที่, n), `-- ${n}\nselect 1;\n`); };
ใส่ใบ("0001_a.sql", "0002_b.sql", "0003_c.sql");
const จดบนฐาน = (ใบ) => writeFileSync(join(รอบที่, "prod-migrations.json"), JSON.stringify({ ใบ }));
const env = { ...process.env, PMS_ROUND_DIR: รอบที่, PMS_MIGRATIONS_DIR: ใบที่, PMS_GATE_RESUME_DIR: join(ที่, "resume"),
  PMS_TESTDB_LOCK: ล็อก, PMS_TESTDB_LOCK_WAIT: "0", PMS_TESTDB_LOCK_HELD: "" };
const รัน = (ไฟล์, args = [], extra = {}) => { const r = spawnSync(process.execPath, [ไฟล์, ...args], { encoding: "utf8", env: { ...env, ...extra }, timeout: 120_000, input: "" });
  return { code: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") }; };
const สั่ง = (...a) => รัน("scripts/round.mjs", a);
const รอบเต็ม = () => รัน("scripts/test-prodbuild.mjs");
const รหัสของ = (out) => /รหัส (r[0-9a-z]+)/.exec(out)?.[1];
const อ่านรอบ = () => JSON.parse(readFileSync(join(รอบที่, "round.json"), "utf8"));

try {
  // ── ตัวช่วยล้วน ──
  const lib = await import(new URL("../../scripts/lib/migrationOrder.mjs", import.meta.url).href);
  ผล(JSON.stringify(lib.ใบข้ามลำดับ(["0002_b.sql", "0004_d.sql"], ["0001_a.sql", "0003_c.sql"])) === JSON.stringify(["0002_b.sql"]), "ก. ใบใหม่เลขน้อยกว่าใบล่าสุดบนฐาน = ข้ามลำดับ (เลขสูงกว่า = ไม่ข้าม)");
  ผล(lib.ใบข้ามลำดับ(["0001_a.sql"], []).length === 0, "ฐานว่าง = ไม่มีข้ามลำดับ");
  let ต = lib.ตรวจใบก่อนลงฐาน({ ที่จะลง: ["0002_b.sql"], ในเครื่อง: ["0001_a.sql", "0002_b.sql", "0003_c.sql"], รอบผ่าน: { รอบ: "x", ใบ: ["0002"] } });
  ผล(!ต.ได้ && /ใบ 0002 ยังไม่อยู่บนฐานจริง แต่เลขน้อยกว่าใบล่าสุดบนฐาน \(0003\)/.test(ต.เหตุ) && /--include-all/.test(ต.เหตุ), "db:push ก. ข้ามลำดับ = ไม่ลง (แม้อยู่ในรอบ)", ต.เหตุ);
  ต = lib.ตรวจใบก่อนลงฐาน({ ที่จะลง: ["0003_c.sql"], ในเครื่อง: ["0001_a.sql", "0002_b.sql", "0003_c.sql"], รอบผ่าน: null });
  ผล(!ต.ได้ && /ไม่มีรอบตรวจเต็มที่ผ่านแล้ว/.test(ต.เหตุ), "db:push ข. ไม่มีรอบที่ผ่าน = ไม่ลง", ต.เหตุ);
  ต = lib.ตรวจใบก่อนลงฐาน({ ที่จะลง: ["0003_c.sql"], ในเครื่อง: ["0001_a.sql", "0002_b.sql", "0003_c.sql"], รอบผ่าน: { รอบ: "รอบ-1", ใบ: ["0002"] } });
  ผล(!ต.ได้ && /ใบ 0003 ไม่อยู่ในรายการใบของรอบที่ผ่านแล้วล่าสุด \(รอบ-1/.test(ต.เหตุ), "db:push ข. ใบนอกรอบ = ไม่ลง", ต.เหตุ);
  ต = lib.ตรวจใบก่อนลงฐาน({ ที่จะลง: ["0003_c.sql"], ในเครื่อง: ["0001_a.sql", "0002_b.sql", "0003_c.sql"], รอบผ่าน: { รอบ: "รอบ-1", ใบ: ["0003"] } });
  ผล(ต.ได้, "db:push ใบเรียงต่อ + อยู่ในรอบ = ลงได้", JSON.stringify(ต));

  // ── round:add --ใบ · list · close ──
  let r = สั่ง("add", "--งาน", "ใบนำเข้า", "--เซสชัน", "ef", "--ทดสอบผ่าน", "--ใบ", "277");
  ผล(r.code === 2 && /เลขใบต้องเป็นตัวเลข 4 หลัก/.test(r.out), "round:add --ใบ เลขผิดรูป = ปฏิเสธ", r.out);
  r = สั่ง("add", "--งาน", "ใบนำเข้า", "--เซสชัน", "ef", "--ทดสอบผ่าน", "--ใบ", "0003");
  ผล(r.code === 0 && /ใบ 0003/.test(r.out), "round:add --ใบ 0003 จดใบของงาน", r.out);
  const ก = รหัสของ(r.out);
  r = สั่ง("add", "--งาน", "งานไม่มีใบ", "--เซสชัน", "ef", "--ทดสอบผ่าน");
  ผล(r.code === 0 && !/ · ใบ /.test(r.out), "งานไม่มีใบ = ไม่ต้องใส่ --ใบ", r.out);
  r = สั่ง("list");
  ผล(r.code === 0 && /ใบ 0003/.test(r.out) && /ใบปรับฐานของรายการ: 0003/.test(r.out), "round:list แสดงใบของงาน + ใบรวมของรายการ", r.out);
  const { ลายนิ้วมือ } = await import(new URL("../../scripts/lib/roundQueue.mjs", import.meta.url).href);
  const ฐาน = { id: "r1", งาน: "ก", เซสชัน: "ef", ทดสอบผ่าน: true };
  ผล(ลายนิ้วมือ([{ ...ฐาน, ใบ: ["0003"] }]) !== ลายนิ้วมือ([{ ...ฐาน, ใบ: ["0004"] }]) && ลายนิ้วมือ([{ ...ฐาน, ใบ: ["0003"] }]) !== ลายนิ้วมือ([ฐาน]),
    "ลายนิ้วมือรวมใบ (ใบเปลี่ยน = ลายนิ้วมือเปลี่ยน)");
  ผล(ลายนิ้วมือ([ฐาน]) === ลายนิ้วมือ([{ ...ฐาน, ใบ: [] }]), "งานไม่มีใบ = ลายนิ้วมือเดิม (รอบที่ปิดก่อนมีช่องใบยังตรง)");
  r = สั่ง("close", "--บอสตอบ", "5 พ.ย. 69 13:00");
  ผล(r.code === 0 && JSON.stringify(อ่านรอบ().ใบ) === JSON.stringify(["0003"]) && /ใบ 0003/.test(r.out), "round:close จดรายการใบของรอบ", r.out);

  // ── รอบตรวจเต็ม: เทียบใบใหม่ในเครื่องกับรายชื่อใบบนฐานที่จดไว้ + ใบของรอบ ──
  let g = รอบเต็ม();
  ผล(g.code === 2 && /ยังไม่มีรายชื่อใบบนฐานจริงที่จดไว้/.test(g.out) && /--dry-run/.test(g.out), "ไม่มีรายชื่อใบบนฐานที่จด = รอบเต็มไม่เริ่ม (บอกให้ db:push --dry-run จดก่อน)", `exit ${g.code}\n${g.out}`);
  จดบนฐาน(["0001_a.sql", "0003_c.sql"]);
  g = รอบเต็ม();
  ผล(g.code === 2 && /ใบ 0002 ยังไม่อยู่บนฐานจริง แต่เลขน้อยกว่าใบล่าสุดบนฐาน \(0003\)/.test(g.out), "ก. ใบในเครื่องข้ามลำดับ = รอบเต็มไม่เริ่ม", `exit ${g.code}\n${g.out}`);
  จดบนฐาน(["0001_a.sql"]);
  g = รอบเต็ม();
  ผล(g.code === 2 && /ไม่ตรงกับรายการใบของรอบ/.test(g.out) && /เกิน: ใบ 0002/.test(g.out), "ข. ใบใหม่ในเครื่องเกินใบของรอบ = รอบเต็มไม่เริ่ม", `exit ${g.code}\n${g.out}`);
  จดบนฐาน(["0001_a.sql", "0002_b.sql", "0003_c.sql"]);
  g = รอบเต็ม();
  ผล(g.code === 2 && /ขาด: ใบ 0003/.test(g.out), "ข. ใบของรอบไม่มีในเครื่อง (ขาด) = รอบเต็มไม่เริ่ม", `exit ${g.code}\n${g.out}`);
  จดบนฐาน(["0001_a.sql", "0002_b.sql"]);
  g = รอบเต็ม();
  ผล(g.code === 3 && !/ไม่เริ่มรอบตรวจเต็ม/.test(g.out) && /ใบ 0003/.test(g.out), "ใบใหม่ตรงกับใบของรอบ = ผ่านตัวกัน (เดินต่อถึงล็อกฐาน)", `exit ${g.code}\n${g.out}`);

  // ── db:push (โหมดทดสอบ · --dry-run) ──
  const { บันทึกเมื่อผ่าน } = await import(new URL("../../scripts/lib/migrationGate.mjs", import.meta.url).href);
  const บันทึกรอบ = join(ที่, "gate-passed.json");
  บันทึกเมื่อผ่าน({ ตก: 0, ตัวตรวจ: 0, dir: ใบที่, record: บันทึกรอบ, ป้าย: "ข้อทดสอบ" });
  const push = (pending, extra = {}) => รัน("scripts/db-push-prod.mjs", ["--dry-run"], { PMS_PUSH_TEST: "1", PMS_PUSH_TEST_PENDING: pending,
    PMS_GATE_RECORD: บันทึกรอบ, PMS_PROD_LOCK: join(ที่, "prod.lock"), PMS_BACKUP_ROOT: join(ที่, "backups"), PMS_PROD_LOCK_HELD: "", ...extra });
  let p = push("0003_c.sql", { PMS_ROUND_DIR: "" });
  ผล(p.code !== 0 && /ต้องตั้ง PMS_ROUND_DIR/.test(p.out), "โหมดทดสอบไม่ตั้งที่เก็บรอบ = ไม่ทำงาน (ไม่จดทับรายชื่อใบบนฐานจริง)", p.out);
  p = push("0002_b.sql");
  ผล(p.code !== 0 && /หยุด ไม่ลงใบ/.test(p.out) && /ใบ 0002 ยังไม่อยู่บนฐานจริง แต่เลขน้อยกว่าใบล่าสุดบนฐาน \(0003\)/.test(p.out), "db:push ก. ใบข้ามลำดับ = ไม่ลง พร้อมเหตุผล", p.out);
  p = push("0003_c.sql");
  ผล(p.code !== 0 && /ไม่มีรอบตรวจเต็มที่ผ่านแล้ว/.test(p.out), "db:push ข. ยังไม่มีรอบที่ผ่าน = ไม่ลง", p.out);
  writeFileSync(join(รอบที่, "rounds", "รอบ-เก่า.json"), JSON.stringify({ รอบ: "รอบ-เก่า", สถานะ: "ผ่านแล้ว", ผ่านเมื่อ: "2026-11-01T00:00:00Z", ใบ: ["0002"] }));
  p = push("0003_c.sql");
  ผล(p.code !== 0 && /ใบ 0003 ไม่อยู่ในรายการใบของรอบที่ผ่านแล้วล่าสุด \(รอบ-เก่า/.test(p.out), "db:push ข. ใบนอกรอบที่ผ่านล่าสุด = ไม่ลง", p.out);
  writeFileSync(join(รอบที่, "rounds", "รอบ-ใหม่.json"), JSON.stringify({ รอบ: "รอบ-ใหม่", สถานะ: "ผ่านแล้ว", ผ่านเมื่อ: "2026-11-05T00:00:00Z", ใบ: ["0003"] }));
  p = push("0003_c.sql");
  ผล(p.code === 0 && /ใบที่จะลงเรียงต่อจากใบบนฐาน/.test(p.out), "db:push ใบเรียงต่อ + อยู่ในรอบที่ผ่านล่าสุด = ผ่านตัวกัน", p.out);
  const จด = JSON.parse(readFileSync(join(รอบที่, "prod-migrations.json"), "utf8"));
  ผล(JSON.stringify(จด.ใบ) === JSON.stringify(["0001_a.sql", "0002_b.sql"]) && /db:push/.test(จด.ที่มา), "db:push จดรายชื่อใบบนฐาน (ใบในเครื่องที่ไม่ต้องลง)", JSON.stringify(จด));
  ผล(!existsSync("C:/.claude/pms-round/prod-migrations.json") || !readFileSync("C:/.claude/pms-round/prod-migrations.json", "utf8").includes("0001_a.sql"), "ไม่จดทับที่เก็บรอบจริง");
} finally {
  rmSync(ที่, { recursive: true, force: true });
}
console.log(ตก ? `\n✗ ตก ${ตก} ข้อ` : "\nALL PASS");
process.exit(ตก ? 1 : 0);
