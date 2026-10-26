// ── ข้อทดสอบ: ตัวนับข้อไม่นิ่ง (scripts/lib/flakyLog.mjs · บอสสั่ง 26 ต.ค. 69) ─────────────────────────────────────
// โฟลเดอร์จำลอง + รายงาน playwright ปลอม (สถานะ flaky) — จำลองครั้งที่ 3 ต้องกันรอบตรวจ · มีต้นเหตุแล้วต้องไม่กัน
// mutation proof: PMS_FLAKY_MUTATE=1 (ตัวนับไม่กันเลย) → ข้อทดสอบต้องตก
// รัน: node tests/tools/flaky-log.test.mjs
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, appendFileSync, rmSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const ราก = process.cwd();
let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n${String(เพิ่ม).slice(0, 800)}`}`); };

// ตัวนับฉบับคัดลอก (แก้ให้พังได้ในโหมด mutation โดยไม่แตะไฟล์จริง)
const ที่ตัวนับ = mkdtempSync(join(tmpdir(), "flaky-lib-"));
copyFileSync(join(ราก, "scripts/lib/flakyLog.mjs"), join(ที่ตัวนับ, "flakyLog.mjs"));
if (process.env.PMS_FLAKY_MUTATE) {
  const p = join(ที่ตัวนับ, "flakyLog.mjs");
  writeFileSync(p, readFileSync(p, "utf8").replace(/\r\n/g, "\n").replace("x.ครั้ง >= เกณฑ์ && !x.ต้นเหตุ.length", "false"));
}
const ตัวนับ = await import(pathToFileURL(join(ที่ตัวนับ, "flakyLog.mjs")).href);

const ข้อA = { file: "a.spec.ts", title: "[a] ข้อที่ไม่นิ่ง" };
const ข้อB = { file: "b.spec.ts", title: "[b] ข้อที่นิ่ง" };
const keyA = "a.spec.ts › [a] ข้อที่ไม่นิ่ง";
// รายงาน playwright จำลอง: ซ้อน suite เหมือนของจริง · flaky = ตกครั้งแรก ผ่านตอนรันซ้ำ
function รายงาน(dir, ชื่อ, ข้อ) {
  const f = join(dir, `${ชื่อ}.json`);
  writeFileSync(f, JSON.stringify({ suites: [{ title: "x", suites: [{ title: "y", specs: ข้อ.map(([s, status]) => ({ file: `tests\\scenario\\${s.file}`, title: s.title, tests: [{ status }] })) }] }] }));
  return f;
}
const เงียบ = { log: () => {}, err: () => {} };
function โฟลเดอร์() { const d = mkdtempSync(join(tmpdir(), "flaky-")); mkdirSync(join(d, "tests")); return d; }

// 1) อ่านรายงาน: เอาเฉพาะสถานะ flaky · ตัวระบุ = ชื่อไฟล์ + ชื่อข้อ (ไม่มีเลขบรรทัด/โฟลเดอร์)
{
  const d = โฟลเดอร์();
  const r = รายงาน(d, "r1", [[ข้อA, "flaky"], [ข้อB, "expected"], [{ file: "c.spec.ts", title: "[c] ตกจริง" }, "unexpected"]]);
  const ได้ = ตัวนับ.ข้อไม่นิ่งจากรายงาน([r, join(d, "ไม่มีไฟล์.json")]);
  ผล(ได้.length === 1 && ได้[0] === keyA, "อ่านรายงาน: เอาเฉพาะข้อที่ตกแล้วผ่านตอนรันซ้ำ · ข้อนิ่ง/ตกจริงไม่นับ", JSON.stringify(ได้));
  rmSync(d, { recursive: true, force: true });
}

// 2) ครั้งที่ 1–2 ไม่กัน · ครั้งที่ 3 (ไม่มีต้นเหตุ) กัน
{
  const d = โฟลเดอร์();
  const r = รายงาน(d, "r", [[ข้อA, "flaky"], [ข้อB, "expected"]]);
  const กัน1 = ตัวนับ.ตรวจไม่นิ่งท้ายรอบ([r], { รอบ: "ร1", วันที่: "2026-10-01", cwd: d, ...เงียบ });
  const กัน2 = ตัวนับ.ตรวจไม่นิ่งท้ายรอบ([r], { รอบ: "ร2", วันที่: "2026-10-02", cwd: d, ...เงียบ });
  ผล(!กัน1 && !กัน2, "ครั้งที่ 1 และ 2: ยังไม่กันรอบตรวจ");
  const ข้อความ = [];
  const กัน3 = ตัวนับ.ตรวจไม่นิ่งท้ายรอบ([r], { รอบ: "ร3", วันที่: "2026-10-03", cwd: d, log: () => {}, err: s => ข้อความ.push(s) });
  ผล(กัน3, "ครั้งที่ 3 ไม่มีต้นเหตุ: กันรอบตรวจ (ขึ้นเว็บไม่ได้)");
  ผล(ข้อความ.join("\n").includes("ต้องหาต้นเหตุ") && ข้อความ.join("\n").includes(keyA), 'ครั้งที่ 3: รายงาน "ต้องหาต้นเหตุ" พร้อมชื่อข้อ', ข้อความ.join("\n"));
  const ไฟล์ = readFileSync(join(d, "tests/flaky-log.txt"), "utf8");
  ผล((ไฟล์.match(/^ไม่นิ่ง \| /gm) ?? []).length === 3 && ไฟล์.includes("ไม่นิ่ง | 2026-10-03 | ร3 | " + keyA), "ไฟล์เดียวจดครบ 3 บรรทัดพร้อมวันที่และรอบ · ข้อนิ่งไม่ถูกจด", ไฟล์);
  ผล(ตัวนับ.สรุป(d).get(keyA)?.ครั้ง === 3, "นับครั้งได้ 3");

  // 3) เพิ่มบรรทัดต้นเหตุ → ไม่กันแล้ว (ครั้งที่ 4 ก็ไม่กัน)
  appendFileSync(join(d, "tests/flaky-log.txt"), `ต้นเหตุ | 2026-10-03 | ${keyA} | ข้อทดสอบนับแถวระหว่างข้ออื่นเพิ่มข้อมูล — แก้แล้ว\n`);
  ผล(!ตัวนับ.ตรวจไม่นิ่งท้ายรอบ([r], { รอบ: "ร4", วันที่: "2026-10-04", cwd: d, ...เงียบ }), "มีบรรทัดต้นเหตุแล้ว: ไม่กัน (ครั้งที่ 4)");
  rmSync(d, { recursive: true, force: true });
}

// 4) บรรทัดต้นเหตุที่ไม่มีข้อความ ไม่นับเป็นต้นเหตุ · ต้นเหตุของข้ออื่นไม่ช่วยข้อนี้
{
  const d = โฟลเดอร์();
  writeFileSync(join(d, "tests/flaky-log.txt"), [1, 2, 3].map(i => `ไม่นิ่ง | 2026-10-0${i} | ร${i} | ${keyA}`).join("\n")
    + `\nต้นเหตุ | 2026-10-03 | ${keyA} | \nต้นเหตุ | 2026-10-03 | b.spec.ts › [b] ข้อที่นิ่ง | อีกข้อหนึ่ง\n`);
  ผล(ตัวนับ.ตรวจไม่นิ่งท้ายรอบ([], { รอบ: "ร", cwd: d, ...เงียบ }), "ต้นเหตุว่าง/ต้นเหตุของข้ออื่น: ยังกัน (ข้อมูลย้อนหลังก็กันแม้รอบนี้ไม่มีข้อไม่นิ่ง)");
  rmSync(d, { recursive: true, force: true });
}

// 5) ไฟล์จริงของ repo อ่านได้ทุกบรรทัด (ไม่มีบรรทัดผิดรูปแบบที่ตัวนับข้ามเงียบ ๆ)
{
  const บรรทัด = readFileSync(join(ราก, "tests/flaky-log.txt"), "utf8").split(/\r?\n/).filter(l => l && !l.startsWith("#"));
  const ผิด = บรรทัด.filter(l => { const c = l.split(" | "); return !((c[0] === "ไม่นิ่ง" && c.length >= 4 && /^\d{4}-\d\d-\d\d$/.test(c[1])) || (c[0] === "ต้นเหตุ" && c.length >= 4 && c[3]?.trim())); });
  ผล(ผิด.length === 0, `tests/flaky-log.txt ทุกบรรทัดถูกรูปแบบ (${บรรทัด.length} บรรทัด)`, ผิด.join("\n"));
}

rmSync(ที่ตัวนับ, { recursive: true, force: true });
console.log(ตก ? `\n${ตก} FAIL` : "\nALL PASS");
process.exit(ตก ? 1 : 0);
