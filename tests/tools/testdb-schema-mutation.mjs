// ── mutation proof: ปิดการเทียบโครงสร้างแล้วข้อทดสอบต้องตก (บอสสั่ง 26 ต.ค. 69) ──────────────────────────────────────────
// คัดตัวล็อกไปโฟลเดอร์แยก (ไฟล์ใน repo ไม่ถูกแก้) แล้วแก้ทีละแบบ → รัน tests/tools/testdb-schema.test.mjs กับตัวที่แก้ → ต้องตก
//   แบบ 1: ไม่เทียบเลย (ขอล็อกได้ทันทีบนฐานที่ไม่ตรง)   แบบ 2: เทียบแต่ไม่สร้างใหม่ (บอกแล้วรันต่อ)
// รัน: node tests/tools/testdb-schema-mutation.mjs   (รันเดี่ยว · ข้อทดสอบคืนฐานด้วยตัวล็อกจริงเองท้ายรอบ)
import { mkdtempSync, copyFileSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

if (process.env.PMS_TESTDB_LOCK_HELD) { console.error("⛔ รันเดี่ยวเท่านั้น"); process.exit(2); }
const ราก = process.cwd();
const ไฟล์ = ["testDbLock.mjs", "testDbSchema.mjs", "testDbGuard.mjs", "fileLock.mjs", "session.mjs", "testDbFetchKey.mjs", "ports.json"];
const แบบ = [
  ["ไม่เทียบโครงสร้างเลย", "testDbLock.mjs", s => s.replace("  try { ให้ฐานตรงกับไฟล์(process.cwd()); }", "  try { void ให้ฐานตรงกับไฟล์; }")],
  ["เทียบแล้วไม่สร้างใหม่ (บอกแล้วรันต่อ)", "testDbLock.mjs", s => s.replace("  const ผล = สร้างใหม่จากไฟล์(ราก);", "  const ผล = { ok: true }; void สร้างใหม่จากไฟล์;")],
];
let ผิด = 0;
for (const [ชื่อ, ไฟล์แก้, แก้] of แบบ) {
  const d = mkdtempSync(path.join(tmpdir(), "schema-mut-"));
  for (const f of ไฟล์) copyFileSync(path.join(ราก, "scripts/lib", f), path.join(d, f));
  const p = path.join(d, ไฟล์แก้), เดิม = readFileSync(p, "utf8").replace(/\r\n/g, "\n"), ใหม่ = แก้(เดิม);
  if (ใหม่ === เดิม) { console.log(`✗ แบบ "${ชื่อ}": หาจุดแก้ไม่เจอ (ตัวล็อกเปลี่ยนรูปไปแล้ว — แก้ไฟล์นี้ให้ตรง)`); ผิด++; continue; }
  writeFileSync(p, ใหม่);
  // ลายที่จำไว้ของตัวที่แก้แยกไฟล์ (ตั้งต้นจากของจริง) — ตัวที่แก้จำลายผิด ๆ ต้องไม่ไปปนของจริง (ข้อทดสอบคืนฐานด้วยลายของจริง)
  const แคช = path.join(d, "schema-cache.json");
  try { copyFileSync(path.join(homedir(), ".pms-testdb-schema.json"), แคช); } catch { /* ยังไม่มี */ }
  const r = spawnSync(process.execPath, ["tests/tools/testdb-schema.test.mjs"], { encoding: "utf8", env: { ...process.env, PMS_GUARD_LIB_DIR: d, PMS_TESTDB_SCHEMA_CACHE: แคช }, maxBuffer: 64 << 20 });
  rmSync(d, { recursive: true, force: true });
  const ตกจริง = r.status !== 0 && /✗/.test(r.stdout);
  console.log(`${ตกจริง ? "✓" : "✗"} แบบ "${ชื่อ}": ข้อทดสอบ${ตกจริง ? "ตก (จับได้)" : "ไม่ตก — ข้อทดสอบอ่อนเกินไป"}`);
  if (ตกจริง) console.log((r.stdout.match(/^✗.*$/gm) ?? []).map(l => `     ${l}`).join("\n"));
  else ผิด++;
}
console.log(ผิด ? `\n${ผิด} FAIL` : "\nALL PASS");
process.exit(ผิด ? 1 : 0);
