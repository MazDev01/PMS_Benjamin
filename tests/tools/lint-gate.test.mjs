// ── ข้อทดสอบ: ตัวตรวจ lint (scripts/check-lint.mjs · บอสสั่ง 12 พ.ย. 69) ─────────────────────────────────
//   ข้อผิดพลาด lint แม้ข้อเดียว = ตก · คำเตือนเกินเพดาน = ตก · เท่า/ต่ำกว่าเพดาน = ผ่าน · อยู่ในชุด checks
//   ตกบนโค้ดเดิม: ไม่มีตัวตรวจ lint (ข้อผิดพลาด 82 ข้อ commit ได้ · คำเตือนเพิ่มได้ไม่จำกัด)
// รัน: node tests/tools/lint-gate.test.mjs
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { join } from "node:path";

let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n   ${String(เพิ่ม).slice(0, 600)}`}`); };
const ราก = process.cwd();
const { ตัดสิน, นับรายงาน, ไฟล์เพดาน } = await import(pathToFileURL(join(ราก, "scripts/check-lint.mjs")).href);

const ผลสะอาด = [{ ชื่อ: "HQ", ผิด: 0, เตือน: 27 }, { ชื่อ: "ดีลเลอร์", ผิด: 0, เตือน: 70 }, { ชื่อ: "shared", ผิด: 0, เตือน: 46 }];
ผล(ตัดสิน({ ผล: ผลสะอาด, เพดาน: 143 }).ผ่าน, "ไม่มีข้อผิดพลาด · คำเตือนเท่าเพดาน = ผ่าน");
const ผิด1 = ตัดสิน({ ผล: [{ ชื่อ: "HQ", ผิด: 1, เตือน: 0 }, ...ผลสะอาด.slice(1)], เพดาน: 143 });
ผล(!ผิด1.ผ่าน && ผิด1.ข้อความ.some(l => /ข้อผิดพลาด lint 1 ข้อ/.test(l)), "ข้อผิดพลาด lint 1 ข้อ = ตก", ผิด1.ข้อความ.join("\n"));
const เกิน = ตัดสิน({ ผล: [{ ชื่อ: "HQ", ผิด: 0, เตือน: 28 }, ...ผลสะอาด.slice(1)], เพดาน: 143 });
ผล(!เกิน.ผ่าน && เกิน.ข้อความ.some(l => /เกินเพดาน 143/.test(l)), "คำเตือนเกินเพดาน 1 = ตก", เกิน.ข้อความ.join("\n"));
const ลด = ตัดสิน({ ผล: [{ ชื่อ: "HQ", ผิด: 0, เตือน: 20 }, ...ผลสะอาด.slice(1)], เพดาน: 143 });
ผล(ลด.ผ่าน && ลด.ข้อความ.some(l => /ลดเพดาน/.test(l)), "คำเตือนลดลง = ผ่าน + บอกให้ลดเพดาน", ลด.ข้อความ.join("\n"));
const นับ = นับรายงาน([{ filePath: "a.tsx", errorCount: 2, warningCount: 1, messages: [{ severity: 2, line: 3, column: 4, ruleId: "react-hooks/rules-of-hooks" }, { severity: 2, line: 5, column: 1, ruleId: "x" }, { severity: 1 }] }, { filePath: "b.tsx", errorCount: 0, warningCount: 2, messages: [] }]);
ผล(นับ.ผิด === 2 && นับ.เตือน === 3 && นับ.ตัวอย่าง[0] === "a.tsx:3:4 react-hooks/rules-of-hooks", "นับรายงาน JSON ของ eslint ทุกไฟล์ + ตำแหน่งข้อผิดพลาด", JSON.stringify(นับ));

// อยู่ในชุด checks · เพดานเป็นตัวเลข
const pkg = JSON.parse(readFileSync(join(ราก, "package.json"), "utf8"));
ผล(/node scripts\/check-lint\.mjs/.test(pkg.scripts.checks), "check-lint อยู่ในชุด checks (commit/รอบตรวจเต็มรันทุกครั้ง)", pkg.scripts.checks);
const เพดาน = JSON.parse(readFileSync(join(ราก, ไฟล์เพดาน), "utf8")).คำเตือนสูงสุด;
ผล(Number.isInteger(เพดาน) && เพดาน >= 0, `เพดานคำเตือนเป็นจำนวนเต็ม (${เพดาน})`);
// ห้ามปิดกฎ: ไม่มี eslint-disable ของ rules-of-hooks ในโค้ดแอป/shared (บอสตัดสิน 12 พ.ย. 69)
const { execFileSync } = await import("node:child_process");
let ปิดกฎ = [];
try { ปิดกฎ = execFileSync("git", ["grep", "-n", "eslint-disable[a-z-]* .*rules-of-hooks", "--", "apps", "packages"], { encoding: "utf8", cwd: ราก, stdio: ["ignore", "pipe", "ignore"] }).trim().split("\n").filter(Boolean); }
catch (e) { if (e.status !== 1) throw e; }   // git grep ไม่เจอ = exit 1
ผล(ปิดกฎ.length === 0, "ไม่มีการปิดกฎ rules-of-hooks ในโค้ด", ปิดกฎ.join("\n"));

console.log(ตก ? `\n✗ ตก ${ตก} ข้อ` : "\nALL PASS");
process.exit(ตก ? 1 : 0);
