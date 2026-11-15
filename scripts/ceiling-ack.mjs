#!/usr/bin/env node
// ── บอสรับทราบการเพิ่มเพดานของตัวตรวจ (บอสสั่ง 13 พ.ย. 69 · scripts/lib/ceilingGuard.mjs) ─────────────────────────
//   ใช้: npm run ceiling:ack                                                → แสดงเพดานที่เพิ่มแต่ยังไม่ได้รับทราบ
//        npm run ceiling:ack -- --ไฟล์ <ไฟล์เพดาน> --คีย์ <คีย์> --ค่า <ค่า>   → บอสพิมพ์ค่ายืนยัน → จดลง scripts/ceiling-ack.txt
//   กันแบบเดียวกับ round:ack / --yes-prod: AI รันแทนไม่ได้ (เจอตัวแปรของ AI หรือไม่ใช่หน้าต่างคำสั่งจริง = ปฏิเสธ)
//   หลังรับทราบ: commit scripts/ceiling-ack.txt พร้อมงานที่เพิ่มเพดาน
// ข้อทดสอบ: tests/tools/ceiling-guard.test.mjs
import { createInterface } from "node:readline/promises";
import { ตรวจโฟลเดอร์, จดรับทราบ, ไฟล์รับทราบ } from "./lib/ceilingGuard.mjs";

const args = process.argv.slice(2);
const ค่า = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const ตาย = (m) => { console.error(`⛔ ${m}`); process.exit(1); };

const ไฟล์ = ค่า("--ไฟล์"), คีย์ = ค่า("--คีย์"), ค่าใหม่ = ค่า("--ค่า");
if (!ไฟล์) {
  const ผล = ตรวจโฟลเดอร์(process.cwd());
  if (!ผล.ขาด.length) { console.log("ไม่มีเพดานที่เพิ่มแล้วรอรับทราบ"); process.exit(0); }
  console.log("เพดานที่เพิ่มแล้วรอบอสรับทราบ:");
  for (const x of ผล.ขาด) console.log(`• ${x.ไฟล์} · ${x.คีย์}: ${x.เดิม} → ${x.ใหม่}`);
  console.log(`\nบอสรับทราบ: npm run ceiling:ack -- --ไฟล์ <ไฟล์> --คีย์ <คีย์> --ค่า <ค่าใหม่>`);
  process.exit(0);
}

// ── กัน AI รันแทน (เหมือน round:ack · --yes-prod: ต้องเป็นบอสพิมพ์เอง) ──
const ตัวแปรAI = ["CLAUDECODE", "AI_AGENT", "CLAUDE_CODE_ENTRYPOINT"].filter(k => process.env[k]);
if (ตัวแปรAI.length) ตาย(`คำสั่งนี้บอสรันเองเท่านั้น — เจอตัวแปรของ AI (${ตัวแปรAI.join(", ")})`);
if (!process.stdin.isTTY || !process.stdout.isTTY) ตาย("คำสั่งนี้บอสรันเองในหน้าต่างคำสั่งเท่านั้น (ไม่ใช่หน้าต่างคำสั่งจริง)");

const n = Number(ค่าใหม่);
if (!คีย์ || !Number.isInteger(n) || n < 0) ตาย("ต้องระบุ --คีย์ และ --ค่า (จำนวนเต็ม ≥ 0)");
console.log(`เพิ่มเพดาน ${ไฟล์} · ${คีย์} เป็น ${n}`);
const rl = createInterface({ input: process.stdin, output: process.stdout });
const ตอบ = (await rl.question(`พิมพ์ค่า "${n}" อีกครั้งเพื่อรับทราบ (อย่างอื่น = ยกเลิก): `)).trim();
rl.close();
if (ตอบ !== String(n)) ตาย("ยกเลิก — ไม่ได้รับทราบ");
try { จดรับทราบ({ ไฟล์, คีย์, ค่า: n }); } catch (e) { ตาย(e.message); }
console.log(`✓ รับทราบแล้ว → ${ไฟล์รับทราบ} (commit ไฟล์นี้พร้อมงาน)`);
