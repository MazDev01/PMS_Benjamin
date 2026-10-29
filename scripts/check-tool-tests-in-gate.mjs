// ── ข้อทดสอบเครื่องมือทุกชุดต้องอยู่ในรอบตรวจเต็ม (บอสสั่ง 29 ต.ค. 69) ──────────────────────────────────────────────
//
// เหตุ: tests/tools/db-push-prod-guard.test.mjs (สำรอง+ซ้อมกู้) ไม่มีใครเรียกในรอบตรวจเต็ม → ตกเงียบมา 3 วัน (26–28 ต.ค.) ไม่มีใครเห็น
//   ตรวจแล้วอีก 11 ชุดก็หลุดเหมือนกัน (ข้อทดสอบเครื่องมือรวมงาน · ตัวกัน pre-push · Vercel ฯลฯ)
// กติกา: ทุกไฟล์ tests/tools/*.test.mjs ต้องมีข้อทดสอบใน tests/scenario/*.spec.ts ที่เรียกไฟล์นั้น ("tests/tools/<ชื่อไฟล์>")
//   รอบตรวจเต็มรัน tests/scenario ทั้งหมด → ชุดที่ถูกห่อ = รันทุกรอบ ตกแล้วรอบตรวจตก
//   ไม่มีรายการยกเว้น — ชุดที่ยังไม่พร้อมเข้ารอบตรวจ ให้ลบหรือแก้ให้ผ่าน ไม่ใช่ปล่อยค้าง
// PMS_TOOL_GATE_ROOT = โฟลเดอร์จำลอง (ข้อทดสอบของตัวตรวจ tests/tools/tool-tests-in-gate.test.mjs)
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ราก = process.env.PMS_TOOL_GATE_ROOT ?? process.cwd();
const ชุด = existsSync(join(ราก, "tests/tools")) ? readdirSync(join(ราก, "tests/tools")).filter(f => f.endsWith(".test.mjs")).sort() : [];
const ห่อ = existsSync(join(ราก, "tests/scenario"))
  ? readdirSync(join(ราก, "tests/scenario")).filter(f => f.endsWith(".spec.ts")).map(f => readFileSync(join(ราก, "tests/scenario", f), "utf8")).join("\n")
  : "";
const หลุด = ชุด.filter(f => !ห่อ.includes(`tests/tools/${f}`));

if (หลุด.length) {
  console.error(`✗ check-tool-tests-in-gate: ข้อทดสอบเครื่องมือ ${หลุด.length} ชุดไม่อยู่ในรอบตรวจเต็ม (ไม่มี tests/scenario/*.spec.ts เรียก) — ตกแล้วจะไม่มีใครเห็น:`);
  for (const f of หลุด) console.error(`   tests/tools/${f}`);
  console.error("   แก้: เพิ่มข้อทดสอบที่ spawn ไฟล์นั้นแล้วต้องได้ ALL PASS (ดูแบบ tests/scenario/tool-suites-tool.spec.ts)");
  process.exit(1);
}
console.log(`✓ check-tool-tests-in-gate: ข้อทดสอบเครื่องมือ ${ชุด.length} ชุดอยู่ในรอบตรวจเต็มครบ`);
