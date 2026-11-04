// ── ข้อทดสอบ: ตัวตรวจ check-sql-test-table-locks — ข้อทดสอบ SQL ต้องล็อกตารางแบบไม่ค้างกับงานหน้าเว็บ (deadlock · 4 พ.ย. 69) ──
//   รันตัวตรวจจริงกับโฟลเดอร์จำลอง (อาร์กิวเมนต์โฟลเดอร์) — ไม่แตะไฟล์ทดสอบจริง
// รัน: node tests/tools/sql-test-table-locks.test.mjs
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n   ${String(เพิ่ม).slice(0, 800)}`}`); };
const ตรวจ = (sql) => {
  const ที่ = mkdtempSync(join(tmpdir(), "sql-locks-"));
  writeFileSync(join(ที่, "x.sql"), sql);
  const r = spawnSync(process.execPath, ["scripts/check-sql-test-table-locks.mjs", ที่], { encoding: "utf8" });
  rmSync(ที่, { recursive: true, force: true });
  return { ผ่าน: r.status === 0, ข้อความ: (r.stdout ?? "") + (r.stderr ?? "") };
};
const ฟังก์ชัน = "create function t.ok(b boolean) returns void language plpgsql as $$ begin perform 1; update x set a = 1; end $$;\n";
const ปิดกลาง = "insert into dealer_package_proposals (prospect_id) values (1);\nalter table dealer_package_proposals disable trigger user;\nupdate dealer_package_proposals set note = 'x';\nalter table dealer_package_proposals enable trigger user;\n";

let r = ตรวจ("begin;\n" + ฟังก์ชัน + ปิดกลาง + "rollback;\n");
ผล(!r.ผ่าน && /alter table dealer_package_proposals กลางรายการ/.test(r.ข้อความ), "ปิดตัวดักกลางรายการโดยไม่ล็อกตั้งแต่ต้น (แบบ franchise_proposal_rules เดิม) → ตก", r.ข้อความ);
r = ตรวจ("begin;\nlock table dealer_package_proposals in share row exclusive mode;\n" + ฟังก์ชัน + ปิดกลาง + "rollback;\n");
ผล(r.ผ่าน, "ล็อกตารางที่จะ alter ไว้ต้นรายการ (ก่อนเขียนแถวแรก) → ผ่าน · ตัวคำสั่งที่ประกาศไม่นับเป็นการเขียน", r.ข้อความ);
r = ตรวจ("begin;\ninsert into leads (id) values ('x');\nlock table dealer_package_proposals in share row exclusive mode;\n" + ปิดกลาง + "rollback;\n");
ผล(!r.ผ่าน, "ล็อกหลังเขียนแถวไปแล้ว (ถือแถว/ตัวนับอยู่) → ตก", r.ข้อความ);
r = ตรวจ("begin;\nlock table quotations in share row exclusive mode;\ninsert into quotations (id) values ('x');\nalter table quotations alter column vat_percent drop not null;\nrollback;\n");
ผล(!r.ผ่าน && /access exclusive/.test(r.ข้อความ), "alter column ต้อง access exclusive — ล็อกแค่ share row exclusive → ตก", r.ข้อความ);
r = ตรวจ("begin;\nlock table leads, dealer_prospects in share row exclusive mode;\ndelete from leads;\nrollback;\n");
ผล(!r.ผ่าน && /หลายตารางต้อง nowait/.test(r.ข้อความ), "ล็อกหลายตารางทีละตาราง (แบบ hq_overview เดิม) → ตก", r.ข้อความ);
r = ตรวจ("begin;\ndo $lk$ begin\n  loop\n    begin\n      lock table leads, dealer_prospects in share row exclusive mode nowait;\n      exit;\n    exception when lock_not_available then perform pg_sleep(0.02);\n    end;\n  end loop;\nend $lk$;\ndelete from leads;\nalter table leads disable trigger user;\nrollback;\n");
ผล(r.ผ่าน, "หลายตาราง nowait วนขอใหม่ + alter ตารางที่ล็อกไว้แล้ว → ผ่าน", r.ข้อความ);
r = ตรวจ("begin;\ninsert into leads (id) values ('x');\nset local session_replication_role = replica;\nupdate leads set phone = '';\nset local session_replication_role = origin;\nrollback;\n");
ผล(r.ผ่าน, "ข้ามตัวดักด้วย replica (ไม่ล็อกทั้งตาราง) → ผ่าน", r.ข้อความ);
r = ตรวจ("-- alter table leads disable trigger user; (หมายเหตุ)\nalter table quotations disable trigger q;\nbegin;\ninsert into leads (id) values ('x');\nrollback;\n");
ผล(r.ผ่าน, "alter ก่อน begin / ในหมายเหตุ ไม่นับ → ผ่าน", r.ข้อความ);
r = spawnSync(process.execPath, ["scripts/check-sql-test-table-locks.mjs"], { encoding: "utf8" });
ผล(r.status === 0, "ข้อทดสอบ SQL จริงทั้งชุด (supabase/tests) → ผ่าน", (r.stdout ?? "") + (r.stderr ?? ""));

console.log(ตก ? `\n✗ ตก ${ตก} ข้อ` : "\nALL PASS");
process.exit(ตก ? 1 : 0);
