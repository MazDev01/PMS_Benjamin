// ── ถามฐานจริงแบบอ่าน (supabase db query --linked) ผ่านคิวล็อกฐานจริง — ห้ามยิงแทรก db:push / สำรอง+ซ้อมกู้ ──────────────
//
// เหตุจริง 29 ต.ค. 69: อ่านฐานจริงทุก 30 วิด้วย `npx supabase db query --linked` ระหว่างบอส db:push 0261 0262
//   CLI ตั้งรหัสใหม่ให้ cli_login_postgres ทุกครั้งที่ต่อแบบ --linked → ขั้นสำรอง 3-auth-data ตก "password authentication failed"
// ใช้คำสั่งนี้แทนการเรียก CLI ตรง: รอให้งานที่ถือล็อกฐานจริงจบก่อน (scripts/lib/prodLock.mjs · รอฐานจริงว่าง) แล้วค่อยถาม
//   ตัวรอไม่ยึดล็อก — db:push ที่บอสสั่งระหว่างที่เรากำลังถามจะไม่หยุด
// ใช้:  npm run prod:query -- "select count(*) from public.dealers"
//       npm run prod:query -- -f path/to/query.sql
//   ตัวเลือกอื่นส่งต่อให้ CLI ตามเดิม (เช่น --output-format json)
// PMS_PROD_OPS_DIR = โฟลเดอร์ที่ CLI ผูกฐานจริงไว้ (ค่าตั้งต้น C:/.claude/pms-prod-ops)
// PMS_PROD_QUERY_DRY=1 = พิมพ์คำสั่งที่จะรันแทนการรัน (ข้อทดสอบ tests/tools/prod-read-waits.test.mjs · ไม่แตะฐาน)
import { spawnSync } from "node:child_process";
import { รอฐานจริงว่าง } from "./lib/prodLock.mjs";

const OPS = process.env.PMS_PROD_OPS_DIR || "C:/.claude/pms-prod-ops";
const args = process.argv.slice(2);
if (!args.length) {
  console.error('ใช้: npm run prod:query -- "<คำสั่ง SQL>"  หรือ  npm run prod:query -- -f <ไฟล์ .sql>');
  process.exit(2);
}
รอฐานจริงว่าง("prod:query (อ่านฐานจริง)");
const คำสั่ง = ["supabase", "db", "query", "--linked", "--workdir", OPS, ...args];
if (process.env.PMS_PROD_QUERY_DRY === "1") {
  console.log(`[ไม่รันจริง] npx ${คำสั่ง.join(" ")}`);
  process.exit(0);
}
// Windows เรียก npx ผ่าน shell → อาร์กิวเมนต์ที่มีช่องว่าง (คำสั่ง SQL · ที่อยู่โฟลเดอร์) ต้องครอบเครื่องหมายคำพูดเอง
const ครอบ = (a) => process.platform === "win32" && /[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a;
const r = spawnSync("npx", คำสั่ง.map(ครอบ), { cwd: OPS, stdio: "inherit", shell: process.platform === "win32" });
process.exit(r.status ?? 1);
