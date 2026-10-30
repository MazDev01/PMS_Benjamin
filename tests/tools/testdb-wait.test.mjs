// ── ข้อทดสอบ: ชุดทดสอบที่ใช้ฐานทดสอบ เจอเซสชันอื่นถือล็อก → "รอ" ไม่ใช่ "ตก" (บอสสั่ง 29 ต.ค. 69 · คิวข้อ 2 · scripts/lib/testDbWait.mjs) ──
// ไฟล์ล็อกจำลอง (PMS_TESTDB_LOCK = ไฟล์ชั่วคราว · ไม่แตะล็อกจริง/ฐานจริง):
//   ก. เซสชันอื่นถือล็อก (โปรเซสยังทำงาน) → ชุดทดสอบ db-push-prod-guard พิมพ์ "รอ" บอกว่าใครใช้ · ออกรหัส 75 · ไม่มีคำว่า "ตก"
//      (โค้ดเดิม: ชุดนั้นรันต่อ คำสั่งย่อยติดล็อก → "ตก N" รหัส 1 — ตัวอย่างจริง 29 ต.ค. 69 "ตก 4" ตอน ef ถือล็อก)
//   ข. ชุดทดสอบอีก 3 ชุดที่ใช้ฐานทดสอบ (audit-cleanup · testdb-guard · testdb-schema) ก็ "รอ" แบบเดียวกัน
//   ค. ไม่ต้องรอ: ไม่มีล็อก · ล็อกค้างของโปรเซสที่ตายแล้ว · เราถือเอง (รหัสตรงกับ PMS_TESTDB_LOCK_HELD = รอบตรวจเต็ม)
// รัน: node tests/tools/testdb-wait.test.mjs
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const ราก = process.cwd();
let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n   ${String(เพิ่ม).slice(-1200)}`}`); };
const ที่ = mkdtempSync(path.join(tmpdir(), "pms-testdb-wait-"));
const LOCK = path.join(ที่, "testdb.lock");
const env = { ...process.env, PMS_TESTDB_LOCK: LOCK };
delete env.PMS_TESTDB_LOCK_HELD;
const ค้าง = spawn(process.execPath, ["-e", "setTimeout(()=>{}, 600000)"], { stdio: "ignore" });
const ล็อกอื่น = (pid, token = "ของเซสชันอื่น") => writeFileSync(LOCK, JSON.stringify({ token, pid, งาน: "รอบตรวจเต็ม (abc1234)", เซสชัน: "ef", เริ่ม: new Date().toISOString() }));

try {
  ล็อกอื่น(ค้าง.pid);
  // ก. — จำกัดเวลา: โค้ดเดิมไม่ "รอ" แต่รันต่อจนคำสั่งย่อยติดล็อก (หยุดเองภายในไม่กี่วินาทีต่อข้อ)
  const r = spawnSync(process.execPath, ["tests/tools/db-push-prod-guard.test.mjs"], { cwd: ราก, env, encoding: "utf8", timeout: 180_000 });
  const ออก = `${r.stdout}\n${r.stderr}`;
  ผล(r.status === 75 && /^รอ — /m.test(ออก) && /รอบตรวจเต็ม \(abc1234\)/.test(ออก) && /เซสชัน ef/.test(ออก) && !/^ตก \d/m.test(ออก),
    `ก. เซสชันอื่นถือฐานทดสอบ → db-push-prod-guard ขึ้น "รอ" บอกว่าใครใช้ · รหัส 75 · ไม่ใช่ "ตก" (ได้รหัส ${r.status})`, ออก);

  // ข.
  for (const f of ["audit-cleanup", "testdb-guard", "testdb-schema"]) {
    const x = spawnSync(process.execPath, [`tests/tools/${f}.test.mjs`], { cwd: ราก, env, encoding: "utf8", timeout: 60_000 });
    ผล(x.status === 75 && /^รอ — /m.test(x.stdout), `ข. ${f}: เซสชันอื่นถือฐาน → "รอ" รหัส 75 (ได้ ${x.status})`, `${x.stdout}\n${x.stderr}`);
  }

  // ค. ไม่ต้องรอ — ถามตัวช่วยตรง ๆ (ไม่รันชุดทดสอบจริง ไม่แตะฐาน)
  const ถาม = (extra = {}) => spawnSync(process.execPath, ["--input-type=module", "-e",
    `import { ผู้ถือฐานอื่น } from ${JSON.stringify("file:///" + path.join(ราก, "scripts/lib/testDbWait.mjs").replaceAll("\\", "/"))}; console.log(JSON.stringify(ผู้ถือฐานอื่น()));`],
    { env: { ...env, ...extra }, encoding: "utf8" }).stdout.trim();
  ผล(ถาม() !== "null", "ค. (ตัวคุม) เซสชันอื่นถือ → ตัวช่วยเห็นผู้ถือ");
  ผล(ถาม({ PMS_TESTDB_LOCK_HELD: "ของเซสชันอื่น" }) === "null", "ค. เราถือเอง (รหัสตรงกับ PMS_TESTDB_LOCK_HELD · รอบตรวจเต็ม) → ไม่รอ");
  ค้าง.kill();
  await new Promise(r => setTimeout(r, 500));
  ผล(ถาม() === "null", "ค. ล็อกค้างของโปรเซสที่ตายแล้ว → ไม่รอ");
  rmSync(LOCK, { force: true });
  ผล(ถาม() === "null", "ค. ไม่มีล็อก → ไม่รอ");
} finally {
  try { ค้าง.kill(); } catch { /* */ }
  rmSync(ที่, { recursive: true, force: true });
}
console.log(ตก ? `\n${ตก} FAIL` : "\nALL PASS");
process.exit(ตก ? 1 : 0);
