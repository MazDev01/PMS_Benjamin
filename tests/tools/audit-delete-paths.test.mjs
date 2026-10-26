// ── ข้อทดสอบ: ตัวตรวจ check-audit-delete-paths (ทางลบบันทึกการใช้งานมีแค่ 2 ทาง · บอสสั่ง 26 ต.ค. 69) ─────────────────────
// repo จำลอง: คัดลอกตัวตรวจจริง แล้ววางไฟล์ทีละแบบ — ทางลบใหม่ทุกแบบต้องทำให้ตัวตรวจตก · ของที่อนุญาต/คำอธิบายต้องผ่าน
// mutation proof: PMS_AUDIT_PATHS_MUTATE=1 (ตัวตรวจผ่านเสมอ) → ข้อทดสอบต้องตก
// รัน: node tests/tools/audit-delete-paths.test.mjs
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync, execFileSync } from "node:child_process";

const ราก = process.cwd();
let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n${String(เพิ่ม).slice(0, 800)}`}`); };

function ตรวจ(ไฟล์) {
  const root = mkdtempSync(join(tmpdir(), "audit-paths-"));
  const คัด = f => { mkdirSync(dirname(join(root, f)), { recursive: true }); copyFileSync(join(ราก, f), join(root, f)); };
  const เขียน = (f, s) => { mkdirSync(dirname(join(root, f)), { recursive: true }); writeFileSync(join(root, f), s); };
  คัด("scripts/check-audit-delete-paths.mjs"); คัด("scripts/lib/gitFiles.mjs");
  if (process.env.PMS_AUDIT_PATHS_MUTATE) {
    const p = join(root, "scripts/check-audit-delete-paths.mjs");
    writeFileSync(p, readFileSync(p, "utf8").replace(/\r\n/g, "\n").replace("if (เจอ.length) {", "if (false) {"));
  }
  เขียน("apps/ok.ts", "export const ok = 1;\n");
  for (const [f, s] of Object.entries(ไฟล์)) เขียน(f, s);
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["-c", "core.autocrlf=false", "add", "-A"], { cwd: root });
  const r = spawnSync(process.execPath, ["scripts/check-audit-delete-paths.mjs"], { cwd: root, encoding: "utf8" });
  rmSync(root, { recursive: true, force: true });
  return { ผ่าน: r.status === 0, ข้อความ: (r.stdout ?? "") + (r.stderr ?? "") };
}

const ตกได้ = [
  ["หน้าเว็บ/เส้นทาง: supabase-js ลบบันทึก", "apps/hq/app/api/x/route.ts", 'await admin.from("audit_log").delete().gte("at", "1970-01-01");\n'],
  ["หน้าเว็บ: supabase-js แก้บันทึก", "packages/shared/lib/x.ts", 'await sb.from("audit_log").update({ action: "x" }).eq("id", 1);\n'],
  ["สคริปต์: delete from audit_log", "scripts/x.mjs", 'run("delete from public.audit_log where id = 1");\n'],
  ["สคริปต์: truncate audit_log", "scripts/y.mjs", 'run("truncate table audit_log");\n'],
  ["ข้อทดสอบ: เปิดสวิตช์ pms.audit_delete เอง", "tests/scenario/x.spec.ts", "await sql(\"select set_config('pms.audit_delete', 'test', false)\");\n"],
  ["ข้อทดสอบ: เรียก audit_test_cleanup นอกไฟล์ที่อนุญาต", "tests/scenario/y.spec.ts", 'await svc.rpc("audit_test_cleanup", { p_ids: [1] });\n'],
  ["ใบใหม่ 0242: ปิดตัวดัก", "supabase/migrations/0242_x.sql", "alter table public.audit_log disable trigger audit_log_guard_row;\n"],
  ["ใบใหม่ 0242: นิยามกติกาแถวทดสอบใหม่", "supabase/migrations/0242_x.sql", "create or replace function public._audit_is_test_row(p_user text, p_target text, p_action text) returns boolean language sql as $$ select true $$;\n"],
  ["ใบใหม่ 0242: ทิ้งตัวดัก", "supabase/migrations/0242_x.sql", "drop trigger audit_log_guard_row on public.audit_log;\n"],
  ["ข้อทดสอบฐานที่ไม่ย้อนกลับ (ไม่มี rollback)", "supabase/tests/x.sql", "begin;\ndelete from audit_log;\ncommit;\n"],
];
for (const [ชื่อ, f, s] of ตกได้) {
  const r = ตรวจ({ [f]: s });
  ผล(!r.ผ่าน && r.ข้อความ.includes(f), `ตก: ${ชื่อ}`, r.ข้อความ);
}
const ผ่านได้ = [
  ["ไฟล์ที่อนุญาต (cleanup.sql)", { "tests/prod-live/cleanup.sql": "set local pms.audit_delete = 'test';\ndelete from public.audit_log where target like 'ZZT · %';\n" }],
  ["ใบเก่าก่อน 0241 (ประวัติ)", { "supabase/migrations/0062_x.sql": "delete from public.audit_log where at < now() - interval '2 years';\n" }],
  ["ข้อทดสอบฐานที่ย้อนกลับทั้งไฟล์", { "supabase/tests/x.sql": "-- หัว\nbegin;\nalter table audit_log disable trigger audit_log_guard_row; delete from audit_log;\n\\echo 'ALL PASS'\nrollback;\n" }],
  ["อยู่ในคำอธิบายเท่านั้น", { "apps/hq/z.ts": '// เดิม admin.from("audit_log").delete() — ยกเลิกแล้ว\nexport const z = 1;\n', "supabase/migrations/0242_y.sql": "-- delete from audit_log ห้ามทำ\nselect 1;\n" }],
];
for (const [ชื่อ, ไฟล์] of ผ่านได้) {
  const r = ตรวจ(ไฟล์);
  ผล(r.ผ่าน, `ผ่าน: ${ชื่อ}`, r.ข้อความ);
}
console.log(ตก ? `FAIL ${ตก}` : "ALL PASS");
process.exit(ตก ? 1 : 0);
