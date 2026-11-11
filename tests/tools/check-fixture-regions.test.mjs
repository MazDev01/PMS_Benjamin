// ── ข้อทดสอบ: ตัวตรวจชื่อภาคในข้อมูลตั้งต้น (scripts/check-fixture-regions.mjs · 10 พ.ย. 69) ─────────────
//   โฟลเดอร์จำลอง (PMS_FXR_ROOT): ใบ 0195 จำลอง + ข้อมูลตั้งต้นจำลอง → ตก/ผ่านตามชื่อภาค
// รัน: node tests/tools/check-fixture-regions.test.mjs
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n   ${เพิ่ม}`}`); };
const ที่ = mkdtempSync(join(tmpdir(), "pms-fxr-"));
const รัน = () => { const r = spawnSync(process.execPath, ["scripts/check-fixture-regions.mjs"], { encoding: "utf8", env: { ...process.env, PMS_FXR_ROOT: ที่ } }); return { code: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") }; };
try {
  mkdirSync(join(ที่, "supabase/migrations"), { recursive: true });
  mkdirSync(join(ที่, "tests/fixtures"), { recursive: true });
  writeFileSync(join(ที่, "supabase/migrations/0195_dealer_territories.sql"), "insert into public.th_provinces (name, region) values\n  ('เชียงใหม่', 'เหนือ'),\n  ('ขอนแก่น', 'อีสาน'),\n  ('ชลบุรี', 'ตะวันออก'),\n  ('กาญจนบุรี', 'ตะวันตก'),\n  ('ภูเก็ต', 'ใต้'),\n  ('กรุงเทพมหานคร', 'กลาง');\n");
  const ข้อมูล = (ภาค) => writeFileSync(join(ที่, "tests/fixtures/base.sql"), `select '[{"code":"A","region":"${ภาค}"},{"code":"B","region":"กลาง"}]';\nupdate public.dealers set region = '${ภาค}' where code = 'C';\n`);
  ข้อมูล("อีสาน");
  let r = รัน();
  ผล(r.code === 0 && /✓ check-fixture-regions/.test(r.out), "ภาคตามรายการ th_provinces → ผ่าน", r.out);
  ข้อมูล("ทุกภาค");
  r = รัน();
  ผล(r.code === 0, "ดีลเลอร์ทุกภาค (\"ทุกภาค\") → ผ่าน", r.out);
  ข้อมูล("ตะวันออกเฉียงเหนือ");
  r = รัน();
  ผล(r.code === 1 && /tests\/fixtures\/base\.sql:1 ภาค "ตะวันออกเฉียงเหนือ"/.test(r.out) && /tests\/fixtures\/base\.sql:2 ภาค "ตะวันออกเฉียงเหนือ"/.test(r.out),
    "ภาคนอกรายการ (JSON และ region = '…') → ตก บอกไฟล์:บรรทัด", r.out);
  writeFileSync(join(ที่, "supabase/seed.sql"), "insert into x values ('region', 'ภาคอีสาน');\n");
  ข้อมูล("อีสาน");
  r = รัน();
  ผล(r.code === 1 && /supabase\/seed\.sql:1 ภาค "ภาคอีสาน"/.test(r.out), "supabase/seed.sql ก็ตรวจ", r.out);
  rmSync(join(ที่, "supabase/migrations/0195_dealer_territories.sql"));
  r = รัน();
  ผล(r.code === 1 && /ไม่พบใบ 0195/.test(r.out), "ไม่พบรายการภาค = ตก (ไม่ผ่านเงียบ)", r.out);
} finally { rmSync(ที่, { recursive: true, force: true }); }
console.log(ตก ? `\n✗ ตก ${ตก} ข้อ` : "\nALL PASS");
process.exit(ตก ? 1 : 0);
