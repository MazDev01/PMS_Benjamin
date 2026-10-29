// ── ข้อทดสอบ: ฟังก์ชันกลาง วันที่ขายของใบ (lib/salesDate.ts · ใบ 0260) — กติกาเดียวกับฐาน _q_report_date ──
//   ตัวอย่างของบอส (29 ต.ค. 69): ใบออก ก.ย. ตอบรับ ต.ค. = ยอด ต.ค. · ใบออก ธ.ค. ปีก่อน ตอบรับ ม.ค. = ยอดปีนี้
//   หน้าเว็บทุกจุดที่คิดยอดขายเองเรียกตัวนี้ (แดชบอร์ดดีลเลอร์ · ผลงานดีลเลอร์ · ภาพรวมยอดขาย · ใบเสนอราคาทั้งเครือ · แผงดีลเลอร์ · ลูกค้าทั้งเครือ)
// รัน: node tests/tools/sales-date.test.mjs
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// คอมไพล์ไฟล์ .ts ตัวเดียวด้วย typescript ของโปรเจกต์ แล้วรันในโฟลเดอร์ชั่วคราว
import { createRequire } from "node:module";
const require = createRequire(join(process.cwd(), "package.json"));
const ts = require("typescript");
import { readFileSync } from "node:fs";
const src = readFileSync("packages/shared/lib/salesDate.ts", "utf8").replace(/^import type .*$/m, "");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const ที่ = mkdtempSync(join(tmpdir(), "sales-date-"));
writeFileSync(join(ที่, "salesDate.mjs"), js);
const { วันที่ขายของใบ, เวลาขายของใบ } = await import(pathToFileURL(join(ที่, "salesDate.mjs")).href);
rmSync(ที่, { recursive: true, force: true });

let ตก = 0;
const ผล = (ได้, ควร, ชื่อ) => { const ถูก = ได้ === ควร; if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : ` — ได้ ${ได้} ควรได้ ${ควร}`}`); };
ผล(วันที่ขายของใบ({ status: "won", date: "2026-09-15", wonAt: "2026-10-05T03:00:00Z" }), "2026-10-05", "ใบออก ก.ย. ตอบรับ ต.ค. = วันที่ ต.ค.");
ผล(วันที่ขายของใบ({ status: "won", date: "2025-12-20", wonAt: "2026-01-10T07:00:00Z" })?.slice(0, 4), "2026", "ใบออก ธ.ค. ปีก่อน ตอบรับ ม.ค. = ปีนี้");
ผล(วันที่ขายของใบ({ status: "won", date: "2026-09-15", wonAt: "2026-10-04T18:30:00Z" }), "2026-10-05", "วันตามเวลาไทย (01:30 น.)");
ผล(วันที่ขายของใบ({ status: "won", date: "2026-09-15", wonAt: null }), "2026-09-15", "ใบตอบรับที่ไม่มีบันทึกเวลาตอบรับ = วันออกใบ (ห้ามเดา)");
ผล(วันที่ขายของใบ({ status: "sent_to_client", date: "2026-09-20", wonAt: "2026-10-05T03:00:00Z" }), "2026-09-20", "ใบที่ยังไม่ตอบรับ = วันออกใบ");
ผล(วันที่ขายของใบ({ status: "draft", date: "20 ก.ย. 2569" }), null, "วันออกใบไม่ใช่รูปแบบ YYYY-MM-DD = ไม่มีวันที่");
ผล(เวลาขายของใบ({ status: "won", date: "2026-09-15", wonAt: "2026-10-05T03:00:00Z", savedAt: "2026-09-15T02:00:00Z" }), "2026-10-05T03:00:00Z", "กราฟรายชั่วโมง: ใบตอบรับ = เวลาตอบรับ");
console.log(ตก ? `\n${ตก} FAIL` : "\nALL PASS");
process.exit(ตก ? 1 : 0);
