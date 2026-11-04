// ── Supabase CLI ที่คุยกับฐานจริง: รุ่นเดียวกับโปรเจกต์ + อ่านผล JSON ได้ทั้ง 2 รูปแบบ (เหตุจริง 3 พ.ย. 69 15:35) ──
//   1) โฟลเดอร์ผูกฐานจริง (pms-prod-ops) ไม่มี package.json → "npx supabase" ที่ cwd นั้นดึงรุ่นจากที่เก็บของ npx เอง
//      (เครื่องนี้ได้ 3.0.0 · โปรเจกต์ล็อก 2.109.1) → เรียกตัวที่ติดตั้งในโปรเจกต์ตรง ๆ แทน
//   2) CLI ตอบ --output-format json คนละรูปตามคนรัน: มี AI รันอยู่ (ตัวแปร AI_AGENT/CLAUDECODE) = { boundary, rows, warning }
//      · คนรันเองใน terminal = [ {...} ] ล้วน → ตัวอ่านเดิมตัดจาก { ตัวแรก → ล้างข้อมูลทดสอบที่บอสรันเองตกที่ขั้นนับ (ยังไม่ลบอะไร)
// ข้อทดสอบ: tests/tools/supabase-cli-rows.test.mjs
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ราก = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** คำสั่งเรียก CLI ของโปรเจกต์ สำหรับ spawn แบบ shell: true (ใส่เครื่องหมายคำพูดแล้ว) · ยังไม่ติดตั้ง = โยนข้อผิดพลาดบอกวิธีแก้ */
export function คำสั่งCLI() {
  if (process.env.PMS_SUPABASE_CLI) return process.env.PMS_SUPABASE_CLI;   // ข้อทดสอบเท่านั้น: CLI ปลอม (ทั้งบรรทัดคำสั่ง)
  const ไฟล์ = path.join(ราก, "node_modules", ".bin", process.platform === "win32" ? "supabase.CMD" : "supabase");
  if (!existsSync(ไฟล์)) throw new Error(`ไม่พบ Supabase CLI ของโปรเจกต์ (${ไฟล์}) — รัน npm install ในโฟลเดอร์ ${ราก} ก่อน`);
  return `"${ไฟล์}"`;
}

/** รัน SQL จากไฟล์กับฐานที่ผูกไว้ (--linked --yes · JSON) แล้วคืนรายการแถว · ตก/อ่านผลไม่ได้ = โยนข้อผิดพลาด (ผู้เรียกต้องหยุด)
 *  --yes: ผู้เรียกต้องตรวจเองก่อนว่าได้รับอนุญาต (คำสั่งอ่านล้วน หรือบอสพิมพ์ --yes-prod เอง) */
export function รันSQLไฟล์(ไฟล์, { cwd, workdir } = {}) {
  const r = spawnSync(คำสั่งCLI(), ["db", "query", "--linked", "--yes", ...(workdir ? ["--workdir", `"${workdir}"`] : []), "--output-format", "json", "-f", `"${ไฟล์}"`],
    { cwd, encoding: "utf8", shell: true, timeout: 300_000, maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw new Error(`เรียก Supabase CLI ไม่ได้ (${r.error.code ?? r.error.message})`);
  if (r.status !== 0) throw new Error(`คำสั่งจบด้วยรหัส ${r.status} — ${String(r.stderr || r.stdout || "").trim().split(/\r?\n/).slice(-2).join(" | ").slice(0, 300)}`);
  return แถวจากผลCLI(r.stdout);   // stdout เท่านั้น — ข้อความยืนยัน/คำเตือนของ CLI อยู่ใน stderr
}

/** stdout ของ supabase db query --output-format json → รายการแถว · รับ [ ... ] และ { rows: [ ... ] } · อ่านไม่ได้ = โยนข้อผิดพลาด */
export function แถวจากผลCLI(stdout) {
  const t = String(stdout ?? "").trim();
  const เริ่ม = t.search(/[[{]/);
  if (เริ่ม < 0) throw new Error(`ผลไม่ใช่ JSON (ขึ้นต้นด้วย: ${JSON.stringify(t.slice(0, 60))})`);
  let j;
  try { j = JSON.parse(t.slice(เริ่ม)); } catch (e) { throw new Error(`ผลไม่ใช่ JSON (${e.message})`); }
  const แถว = Array.isArray(j) ? j : j?.rows;
  if (!Array.isArray(แถว)) throw new Error(`ผลไม่มีรายการแถว (ได้คีย์: ${j && typeof j === "object" ? Object.keys(j).join(", ") || "ไม่มี" : typeof j})`);
  return แถว;
}
