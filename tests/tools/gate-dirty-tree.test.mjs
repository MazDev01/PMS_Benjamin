// ── ข้อทดสอบ: รอบตรวจเต็มปฏิเสธเมื่อมีไฟล์ที่ยังไม่ commit ในโฟลเดอร์ (บอสสั่ง 9 พ.ย. 69) ─────────────────────────────
//   เหตุ: รอบตรวจ ef 9 พ.ย. หยุดเพราะไฟล์ทดสอบที่ยังไม่ commit (auto-refresh.spec.ts) ถูกนับเป็นไฟล์ที่เปลี่ยน
//   ตัวกัน: scripts/test-prodbuild.mjs (รอบเต็มเท่านั้น · ก่อนตัวกันรอบ/ล็อกฐาน) + scripts/lib/commitGate.mjs ไฟล์ยังไม่commit()
//   ตกบนโค้ดก่อนแก้: ไม่มี ไฟล์ยังไม่commit · รอบเต็มในโฟลเดอร์ที่มีไฟล์ค้างเดินต่อไปถึงตัวกันรอบ (ไม่บอกชื่อไฟล์)
//   ไม่ใช้เว็บ/ฐานทดสอบ: repo จำลองในโฟลเดอร์ชั่วคราว · ที่เก็บรอบ + ล็อกฐานชี้โฟลเดอร์ชั่วคราว (ล็อกถือไว้ = หยุดที่ล็อก exit 3)
// รัน: node tests/tools/gate-dirty-tree.test.mjs
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync, execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const { ไฟล์ยังไม่commit } = await import(pathToFileURL(resolve("scripts/lib/commitGate.mjs")).href);
const สคริปต์รอบ = resolve("scripts/test-prodbuild.mjs");

let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n   ${String(เพิ่ม).slice(0, 900)}`}`); };
const ที่ = mkdtempSync(join(tmpdir(), "pms-dirty-"));
const repo = join(ที่, "repo");
mkdirSync(repo);
const git = (...a) => execFileSync("git", a, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const เทียบ = (ได้, คาด) => JSON.stringify([...ได้].sort()) === JSON.stringify([...คาด].sort());

const ล็อก = join(ที่, "testdb.lock");
writeFileSync(ล็อก, JSON.stringify({ token: `test-${process.pid}`, pid: process.pid, งาน: "ข้อทดสอบ gate-dirty-tree ถือไว้", เซสชัน: "ข้อทดสอบ", เริ่ม: new Date().toISOString() }));
const env = { ...process.env, PMS_ROUND_DIR: join(ที่, "round"), PMS_GATE_RESUME_DIR: join(ที่, "resume"), PMS_TESTDB_LOCK: ล็อก, PMS_TESTDB_LOCK_WAIT: "0", PMS_TESTDB_LOCK_HELD: "", PMS_GATE_FULL: "", PMS_GATE_ONLY_LIVE: "" };
const รอบเต็ม = (args = []) => {
  const r = spawnSync(process.execPath, [สคริปต์รอบ, ...args], { cwd: repo, encoding: "utf8", env, timeout: 120_000 });
  return { code: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") };
};

try {
  git("init", "-q");
  git("config", "user.email", "test@example.test"); git("config", "user.name", "ข้อทดสอบ");
  git("config", "core.autocrlf", "false"); git("config", "core.quotepath", "true");
  writeFileSync(join(repo, ".gitignore"), "ข้าม/\n");
  writeFileSync(join(repo, "เดิม.ts"), "export const ก = 1;\n");
  writeFileSync(join(repo, "จะลบ.ts"), "export const ข = 2;\n");
  writeFileSync(join(repo, "จะย้าย.ts"), "export const ค = 3;\n");
  git("add", "-A"); git("commit", "-qm", "ตั้งต้น");

  // ── ไฟล์ยังไม่commit(): ทุกแบบของไฟล์ค้าง · ชื่อไทย/มีวรรคได้ชื่อจริง (ไม่ใช่แบบที่ git ใส่เครื่องหมายคำพูด) ──
  ผล(เทียบ(ไฟล์ยังไม่commit(repo), []), "โฟลเดอร์สะอาด = ไม่มีไฟล์ค้าง", JSON.stringify(ไฟล์ยังไม่commit(repo)));
  mkdirSync(join(repo, "ข้าม"));
  writeFileSync(join(repo, "ข้าม", "ผลรัน.log"), "x");
  ผล(เทียบ(ไฟล์ยังไม่commit(repo), []), "ไฟล์ที่ .gitignore ข้าม ไม่นับ", JSON.stringify(ไฟล์ยังไม่commit(repo)));
  mkdirSync(join(repo, "tests"));
  writeFileSync(join(repo, "tests", "ไฟล์ใหม่ ยังไม่เก็บ.spec.ts"), "// ใหม่\n");
  writeFileSync(join(repo, "เดิม.ts"), "export const ก = 10;\n");
  unlinkSync(join(repo, "จะลบ.ts"));
  git("mv", "จะย้าย.ts", "ย้ายแล้ว.ts");
  const คาด = ["tests/ไฟล์ใหม่ ยังไม่เก็บ.spec.ts", "เดิม.ts", "จะลบ.ts", "ย้ายแล้ว.ts"];
  ผล(เทียบ(ไฟล์ยังไม่commit(repo), คาด), "นับครบ: ไฟล์ใหม่ (ในโฟลเดอร์ย่อย · ชื่อไทยมีวรรค) · แก้แล้ว · ลบแล้ว · ย้ายชื่อ (นับชื่อใหม่ครั้งเดียว)",
    JSON.stringify(ไฟล์ยังไม่commit(repo)));

  // ── รอบเต็มในโฟลเดอร์ที่มีไฟล์ค้าง = ปฏิเสธ บอกชื่อไฟล์ · หยุดก่อนตัวกันรอบ/ล็อกฐาน ──
  let g = รอบเต็ม();
  ผล(g.code === 2 && /ไม่เริ่มรอบตรวจเต็ม/.test(g.out) && /ไฟล์ที่ยังไม่ commit/.test(g.out) && คาด.every(f => g.out.includes(f)),
    "มีไฟล์ค้าง → รอบเต็มปฏิเสธ (exit 2) พร้อมชื่อไฟล์ทุกไฟล์", `exit ${g.code}\n${g.out}`);
  ผล(!/ยังไม่ปิดรอบ/.test(g.out) && !/ล็อก/.test(g.out.replace(/ไฟล์ที่ยังไม่ commit[\s\S]*/, "")), "ตัวกันไฟล์ค้างอยู่ก่อนตัวกันรอบและก่อนขอล็อกฐาน", g.out);
  g = รอบเต็ม(["--reporter=line"]);
  ผล(g.code === 2 && /ไฟล์ที่ยังไม่ commit/.test(g.out), "ใส่แค่ --reporter = ยังนับเป็นรอบเต็ม → ปฏิเสธ", `exit ${g.code}\n${g.out}`);
  // ระบุไฟล์ (ทดสอบส่วนตัวระหว่างแก้) ไม่ใช่รอบเต็ม — ไฟล์ค้างได้ (เดินต่อถึงล็อกฐานที่ข้อนี้ถือไว้ → exit 3)
  g = รอบเต็ม(["tests/ไฟล์ใหม่ ยังไม่เก็บ.spec.ts"]);
  ผล(g.code === 3 && !/ไฟล์ที่ยังไม่ commit/.test(g.out), "ระบุไฟล์ = ไม่ใช่รอบเต็ม ไม่ถูกกัน (ถึงล็อกฐาน)", `exit ${g.code}\n${g.out}`);

  // ── ไฟล์ค้างเหลือตัวเดียว (ไฟล์บันทึกของรอบตรวจเองก็นับ — บอสสั่งปฏิเสธทุกไฟล์) ──
  git("add", "-A"); git("commit", "-qm", "งาน");
  mkdirSync(join(repo, "tests"), { recursive: true });
  writeFileSync(join(repo, "tests", "flaky-log.txt"), "ไม่นิ่ง | ตัวอย่าง\n");
  g = รอบเต็ม();
  ผล(g.code === 2 && g.out.includes("tests/flaky-log.txt") && /1 ไฟล์/.test(g.out), "ไฟล์บันทึกข้อไม่นิ่งที่ยังไม่ commit ก็ปฏิเสธ (บอกชื่อ)", `exit ${g.code}\n${g.out}`);
  rmSync(join(repo, "tests", "flaky-log.txt"));

  // ── โฟลเดอร์สะอาด → ผ่านตัวกันนี้ ไปเจอตัวกันถัดไป (ยังไม่ปิดรอบ) ──
  ผล(เทียบ(ไฟล์ยังไม่commit(repo), []), "commit แล้ว = สะอาด");
  g = รอบเต็ม();
  ผล(g.code === 2 && /ยังไม่ปิดรอบ/.test(g.out) && !/ไฟล์ที่ยังไม่ commit/.test(g.out), "โฟลเดอร์สะอาด → ผ่านตัวกันไฟล์ค้าง ไปถึงตัวกันรอบ", `exit ${g.code}\n${g.out}`);

  // ── ไม่มีทางข้าม: ตัวกันไม่มีเงื่อนไขจากตัวแปรแวดล้อม · อยู่ก่อนตัวกันรอบ/ล็อกฐาน/ล้างผลรอบที่ตก ──
  const ซอร์ส = readFileSync(สคริปต์รอบ, "utf8");
  const ต้น = ซอร์ส.indexOf("const ค้างก่อนเริ่ม = ไฟล์ยังไม่commit()");
  const ช่วง = ต้น >= 0 ? ซอร์ส.slice(ต้น, ซอร์ส.indexOf("process.exit(2);", ต้น)) : "";
  ผล(ต้น >= 0 && ช่วง.length > 0 && !/process\.env/.test(ช่วง), "ตัวกันไฟล์ค้างไม่มีเงื่อนไขจากตัวแปรแวดล้อม", ช่วง);
  const ที่ตัวกันรอบ = ซอร์ส.indexOf("ตรวจก่อนรอบเต็ม()"), ที่ขอล็อก = ซอร์ส.indexOf("= ขอล็อกฐานทดสอบ("), ที่ลบผล = ซอร์ส.indexOf("ลบที่จด()");
  ผล(ต้น >= 0 && ที่ตัวกันรอบ > ต้น && ที่ขอล็อก > ต้น && ที่ลบผล > ต้น, "ตัวกันไฟล์ค้างอยู่ก่อนตัวกันรอบ · ขอล็อกฐาน · ล้างผลรอบที่ตก");
} finally {
  rmSync(ที่, { recursive: true, force: true });
}
console.log(ตก ? `\n✗ ตก ${ตก} ข้อ` : "\nALL PASS");
process.exit(ตก ? 1 : 0);
