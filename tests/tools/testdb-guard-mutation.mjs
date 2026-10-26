// ── mutation proof: ปิดการกันแล้วข้อทดสอบตัวกันต้องตก (บอสสั่ง 26 ต.ค. 69) ───────────────────────────────────────────
// คัดตัวกันไปโฟลเดอร์แยก (ไฟล์ใน repo ไม่ถูกแก้) แล้วแก้ทีละแบบให้ "ไม่กัน" → รัน tests/tools/testdb-guard.test.mjs กับตัวที่แก้ → ต้องตก
//   แบบ 1: pg_hba เปิด trust ทุกทาง (docker exec psql เขียนได้)   แบบ 2: คำสั่งก่อนทุกคำขอไม่บังคับอ่านอย่างเดียว (API เขียนได้)
//   แบบ 3: ผู้ใช้ที่ล็อกอินเขียนได้โดยไม่มีกุญแจ   แบบ 4: ปล่อยล็อกแล้วไม่สุ่มกุญแจทิ้ง
// ⚠️ ระหว่างพิสูจน์ ฐานทดสอบถูกติดตั้งตัวกันที่แก้แล้ว (ถือล็อกอยู่) — จบแต่ละแบบ ขอล็อกด้วยตัวจริงทันทีเพื่อลงตัวกันจริงกลับ
// รัน: node tests/tools/testdb-guard-mutation.mjs   (ห้ามรันใต้ล็อกของคนอื่น — ขอล็อกเอง)
import { mkdtempSync, copyFileSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

if (process.env.PMS_TESTDB_LOCK_HELD) { console.error("⛔ รันเดี่ยวเท่านั้น (ห้ามรันใต้ล็อกของตัวแม่)"); process.exit(2); }
const ราก = process.cwd();
const ไฟล์ = ["testDbGuard.mjs", "testDbLock.mjs", "fileLock.mjs", "session.mjs", "testDbFetchKey.mjs", "ports.json"];
const แบบ = [
  ["pg_hba เปิด trust ทุกทาง", s => s.replace('"local all  pms_lockadmin  scram-sha-256",', '"local all  all  trust", "host  all  all  all  trust", "local all  pms_lockadmin  scram-sha-256",')],
  ["คำสั่งก่อนทุกคำขอไม่บังคับอ่านอย่างเดียว", s => s.replace("perform set_config('transaction_read_only', 'on', true);", "perform 1;")],
  ["ผู้ใช้ที่ล็อกอินเขียนได้โดยไม่มีกุญแจ (ช่องเดิมข้อ 3)", s => s.replace("if h and ส่งมา is not null and ส่งมา = k then return; end if;",
    "if coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb ->> 'role' = 'authenticated' then return; end if; if h and ส่งมา is not null and ส่งมา = k then return; end if;")],
  ["ปล่อยล็อกแล้วไม่สุ่มกุญแจทิ้ง", s => s.replace("update pms_lock.current set key = '${สุ่ม()}', held = false where id = 1 and key = '${ของเรา}';", "perform 1;")],
];
let ผิด = 0;
const คืนตัวจริง = () => spawnSync(process.execPath, ["--input-type=module", "-e",
  `const { ขอล็อกฐานทดสอบ } = await import(${JSON.stringify(pathToFileURL(path.join(ราก, "scripts/lib/testDbLock.mjs")).href)}); ขอล็อกฐานทดสอบ("คืนตัวกันจริงหลัง mutation", { รอนาที: 30 }).release();`], { encoding: "utf8", stdio: "inherit" });
for (const [ชื่อ, แก้] of แบบ) {
  const d = mkdtempSync(path.join(tmpdir(), "guard-mut-"));
  for (const f of ไฟล์) copyFileSync(path.join(ราก, "scripts/lib", f), path.join(d, f));
  const p = path.join(d, "testDbGuard.mjs"), เดิม = readFileSync(p, "utf8").replace(/\r\n/g, "\n"), ใหม่ = แก้(เดิม);
  if (ใหม่ === เดิม) { console.log(`✗ แบบ "${ชื่อ}": หาจุดแก้ไม่เจอ (ตัวกันเปลี่ยนรูปไปแล้ว — แก้ไฟล์นี้ให้ตรง)`); ผิด++; continue; }
  writeFileSync(p, ใหม่);
  const r = spawnSync(process.execPath, ["tests/tools/testdb-guard.test.mjs"], { encoding: "utf8", env: { ...process.env, PMS_GUARD_LIB_DIR: d } });
  คืนตัวจริง();
  rmSync(d, { recursive: true, force: true });
  const ตกจริง = r.status !== 0 && /✗/.test(r.stdout);
  console.log(`${ตกจริง ? "✓" : "✗"} แบบ "${ชื่อ}": ข้อทดสอบ${ตกจริง ? "ตก (จับได้)" : "ไม่ตก — ข้อทดสอบอ่อนเกินไป"}`);
  if (ตกจริง) console.log((r.stdout.match(/^✗.*$/gm) ?? []).map(l => `     ${l}`).join("\n"));
  else ผิด++;
}
console.log(ผิด ? `\n${ผิด} FAIL` : "\nALL PASS");
process.exit(ผิด ? 1 : 0);
