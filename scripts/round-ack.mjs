#!/usr/bin/env node
// ── บอสรับทราบข้อทดสอบไม่นิ่งของรอบตรวจเต็ม (บอสสั่ง 11 พ.ย. 69 · scripts/lib/flakyAck.mjs) ────────────────────────────
//   รอบตรวจเต็มที่ผ่านแต่มีข้อไม่นิ่ง = "รอรับทราบ" · session:merge / pre-push / Vercel / db:push:prod ปฏิเสธจนกว่าบอสรันคำสั่งนี้
//   ใช้: npm run round:ack                 → แสดงรอบที่รอรับทราบ + ชื่อข้อไม่นิ่ง
//        npm run round:ack -- --รอบ <ป้าย>  → บอสพิมพ์ป้ายรอบยืนยันในหน้าต่างคำสั่ง → บันทึกเวลา + ชื่อข้อ (supabase/gate-flaky-ack.txt) + ปิดรอบ
//   กันแบบเดียวกับ --yes-prod: AI รันแทนไม่ได้ — เจอตัวแปรของ AI (CLAUDECODE / AI_AGENT / CLAUDE_CODE_ENTRYPOINT) หรือไม่ใช่หน้าต่างคำสั่งจริง (ไม่มี TTY) = ปฏิเสธ
//   หลังรับทราบ: commit supabase/gate-flaky-ack.txt (ไม่นับในลายนิ้วมือโค้ด) แล้ว merge/push/db:push ได้ตามปกติ
//   ข้อไม่นิ่งยังอยู่ใน tests/flaky-log.txt + รายการรอบหน้าเพื่อหาต้นเหตุ (การรับทราบไม่ใช่การแก้)
// ข้อทดสอบ: tests/tools/flaky-ack.test.mjs
import { createInterface } from "node:readline/promises";
import { สถานะในเครื่อง, จดรับทราบ, ไฟล์รับทราบ } from "./lib/flakyAck.mjs";
import { จบรอบ } from "./lib/roundQueue.mjs";

const args = process.argv.slice(2);
const ค่า = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const ตาย = (m) => { console.error(`⛔ ${m}`); process.exit(1); };

const { รอ } = สถานะในเครื่อง();
const ป้าย = ค่า("--รอบ");
if (!ป้าย) {
  if (!รอ.length) { console.log("ไม่มีรอบตรวจที่รอรับทราบ"); process.exit(0); }
  console.log("รอบตรวจที่รอบอสรับทราบ (ผ่าน แต่มีข้อทดสอบไม่นิ่ง):");
  for (const x of รอ) { console.log(`• ${x.ป้าย} · commit ${x.sha}`); x.ข้อ.forEach((k, i) => console.log(`   ${i + 1}. ${k}`)); }
  console.log(`\nบอสรับทราบ: npm run round:ack -- --รอบ <ป้าย>`);
  process.exit(0);
}

// ── กัน AI รันแทน (เหมือน --yes-prod: ต้องเป็นบอสพิมพ์เอง) ──
const ตัวแปรAI = ["CLAUDECODE", "AI_AGENT", "CLAUDE_CODE_ENTRYPOINT"].filter(k => process.env[k]);
if (ตัวแปรAI.length) ตาย(`คำสั่งนี้บอสรันเองเท่านั้น — เจอตัวแปรของ AI (${ตัวแปรAI.join(", ")}) · AI ห้ามรับทราบแทนบอส`);
if (!process.stdin.isTTY || !process.stdout.isTTY) ตาย("คำสั่งนี้บอสรันเองในหน้าต่างคำสั่งเท่านั้น (ไม่ใช่หน้าต่างคำสั่งจริง — ส่งคำตอบผ่านท่อไม่ได้)");

const รอบนี้ = รอ.find(x => x.ป้าย === ป้าย);
if (!รอบนี้) ตาย(`ไม่มีรอบ "${ป้าย}" ที่รอรับทราบ — ดูรายการด้วย npm run round:ack`);
console.log(`รอบ ${รอบนี้.ป้าย} · commit ${รอบนี้.sha} · ข้อทดสอบไม่นิ่ง ${รอบนี้.ข้อ.length} ข้อ:`);
รอบนี้.ข้อ.forEach((k, i) => console.log(`   ${i + 1}. ${k}`));
const rl = createInterface({ input: process.stdin, output: process.stdout });
const ตอบ = (await rl.question(`\nพิมพ์ป้ายรอบ "${รอบนี้.ป้าย}" เพื่อรับทราบ (อย่างอื่น = ยกเลิก): `)).trim();
rl.close();
if (ตอบ !== รอบนี้.ป้าย) ตาย("ยกเลิก — ไม่ได้รับทราบ");

จดรับทราบ({ ป้าย, ผู้รับทราบ: process.env.USERNAME || process.env.USER || "บอส" });
const จบ = จบรอบ({ sha: รอบนี้.sha, ป้าย: `${ป้าย} (บอสรับทราบข้อไม่นิ่ง)` });
console.log(`✓ รับทราบรอบ ${ป้าย} แล้ว → ${ไฟล์รับทราบ} — commit ไฟล์นี้ แล้ว merge/push/db:push ได้ตามปกติ${จบ ? ` · รอบ ${จบ.รอบ} ปิดจบ` : ""}`);
console.log("   ข้อไม่นิ่งยังอยู่ในรายการรอบหน้าเพื่อหาต้นเหตุ");
