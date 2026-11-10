// ── ตัวตรวจ: ใบปรับฐานห้ามมี SET LOCAL ระดับบนสุด (นอก transaction) ─────────────────────────────────────────────
//   เหตุ (คนรวมงานแจ้ง 10 พ.ย. 69): db push ฐานจริงใบ 0284 ขึ้น WARNING "SET LOCAL can only be used in transaction blocks" 2 ครั้ง
//     db push ไม่ห่อใบด้วย transaction → set local session_replication_role ไม่มีผล = ปิดตัวดักไม่ได้ (ข้อมูลอาจถูกตัวดักแก้/บันทึกซ้ำ)
//   ใช้แทน: DO $$ begin perform set_config('session_replication_role', 'replica', true); … ; perform set_config('session_replication_role', 'origin', true); end $$;
//   ใบเก่าที่ลงฐานจริงแล้ว = ยกเว้น (ห้ามแก้ใบที่ลงแล้ว · ลายนิ้วมือใบ) พร้อมเหตุผล — ใบใหม่ไม่มีทางยกเว้น
//   ข้อทดสอบ: tests/unit/sqlSetLocal.test.ts · PMS_MIGRATIONS_DIR = โฟลเดอร์จำลอง
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { setLocalระดับบน } from "./lib/sqlSetLocal.mjs";
import { ยกเว้นSetLocal } from "./lib/migrationWarnings.mjs";

const โฟลเดอร์ = process.env.PMS_MIGRATIONS_DIR ?? "supabase/migrations";
// รายการยกเว้นกลาง (ใช้ร่วมกับ reset-test-db ที่ตกเมื่อการลงใบขึ้น WARNING) — scripts/lib/migrationWarnings.mjs
export const ยกเว้น = ยกเว้นSetLocal;
const เจอ = [];
for (const f of readdirSync(โฟลเดอร์).filter(n => n.endsWith(".sql")).sort()) {
  if (ยกเว้น[f]) continue;
  for (const r of setLocalระดับบน(readFileSync(path.join(โฟลเดอร์, f), "utf8"))) เจอ.push(`${f}:${r.line} — ${r.text}`);
}
if (เจอ.length) {
  console.error(`✗ check-migration-set-local: ใบปรับฐานมี SET LOCAL ระดับบนสุด ${เจอ.length} จุด — db push ไม่ห่อ transaction จึงไม่มีผล`);
  console.error("  ใช้แทน: DO $$ begin perform set_config('session_replication_role', 'replica', true); … end $$;");
  for (const x of เจอ) console.error(`  ${x}`);
  process.exit(1);
}
console.log(`✓ check-migration-set-local: ใบปรับฐานไม่มี SET LOCAL ระดับบนสุด (ยกเว้นใบที่ลงแล้ว ${Object.keys(ยกเว้น).length} ใบ)`);
