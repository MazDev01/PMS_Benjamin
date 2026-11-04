// ── ตัวตรวจ: ข้อทดสอบ SQL ล็อกตารางแบบไม่ค้างกับงานหน้าเว็บที่รันพร้อมกัน (deadlock) ─────────────────────────────────
//
// ทำไมต้องมี (รอบตรวจ deploy15 4 พ.ย. 69 · ข้อไม่นิ่ง dealer-create-credentials › "deadlock detected" ตอนสร้างใบค่าแฟรนไชส์):
//   supabase/tests/*.sql รันเป็นรายการเดียว (begin … rollback) ขนานกับข้อทดสอบหน้าเว็บ — พบ 2 แบบที่ค้างกันเอง (ทำซ้ำได้ทั้งคู่)
//   1) alter table <ตาราง> disable/enable trigger (หรือ alter column) กลางรายการ หลังเขียนแถว/ตัวนับไปแล้ว
//      = ขอล็อกทั้งตารางขณะถือตัวนับเลขใบอยู่ ↔ งานหน้าเว็บถือตารางนั้นแล้วรอตัวนับ (franchise_proposal_rules · notification_catalog)
//   2) lock table หลายตารางทีละตาราง: แอปเองเขียนสองลำดับสวนกัน (ลบผู้สนใจ → ใบตาม · ออกใบ → เลื่อนขั้นผู้สนใจ)
//      ล็อกลำดับไหนก็ถือตารางหนึ่งค้างระหว่างรอตารางอื่น (hq_overview · hq_dashboard · kpi_cards)
// กติกา:
//   ก) ทุกตารางที่สั่ง alter table หลัง begin; ต้องถูก lock table ก่อนคำสั่งเขียนแถวแรกของรายการ
//      (share row exclusive · alter column = access exclusive) · ข้ามตัวดักแถวเดียวใช้ session_replication_role = replica แทนได้
//   ข) lock table ที่มีมากกว่า 1 ตาราง ต้องเป็น nowait (ได้ครบหรือไม่ได้เลย · วนขอใหม่ใน do-block — ไม่ถือตารางค้างระหว่างรอ)
// รัน: node scripts/check-sql-test-table-locks.mjs [โฟลเดอร์]   (ไม่ต้องต่อฐานข้อมูล) · ข้อทดสอบ: tests/tools/sql-test-table-locks.test.mjs
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const โฟลเดอร์ = process.argv[2] ?? "supabase/tests";
const ตัดหมายเหตุ = s => s.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
const ชื่อ = t => t.replace(/^public\./i, "").replace(/"/g, "").toLowerCase();
const ระดับ = m => /access\s+exclusive/i.test(m) ? 2 : /share\s+row\s+exclusive|exclusive/i.test(m) ? 1 : 0;

export function ตรวจไฟล์(sql) {
  const s = ตัดหมายเหตุ(sql);
  const เริ่ม = s.search(/(^|\n)\s*begin\s*;/i);
  if (เริ่ม < 0) return [];
  // ตัวคำสั่งที่ประกาศ (create function … $$ … $$) ไม่ใช่การเขียนตอนนี้ — ตัดออกก่อนหาคำสั่งเขียนแรก
  const ใน = s.slice(เริ่ม).replace(/create\s+(?:or\s+replace\s+)?function[\s\S]*?(\$\w*\$)[\s\S]*?\1/gi, "create function …");
  const เขียนแรก = ใน.search(/\b(insert\s+into|update\s+[a-z_."]+\s+set|delete\s+from|perform|select\s+[a-z_.]+\s*\()/i);
  const ล็อก = new Map();
  const พบ = [];
  for (const m of ใน.matchAll(/lock\s+table\s+([^;]+?)\s+in\s+([a-z ]+?)\s+mode(\s+nowait)?\s*;/gi)) {
    const ตาราง = m[1].split(",").map(x => ชื่อ(x.trim()));
    if (ตาราง.length > 1 && !m[3]) พบ.push(`lock table ${ตาราง.join(", ")} — หลายตารางต้อง nowait (ได้ครบหรือไม่ได้เลย วนขอใหม่) ไม่งั้นถือตารางค้างระหว่างรอ = deadlock`);
    if (เขียนแรก >= 0 && m.index > เขียนแรก) continue;
    for (const t of ตาราง) ล็อก.set(t, Math.max(ล็อก.get(t) ?? 0, ระดับ(m[2])));
  }
  for (const m of ใน.matchAll(/alter\s+table\s+(?:only\s+)?([a-z_."]+)\s+([^;]+);/gi)) {
    const t = ชื่อ(m[1]), ต้อง = /alter\s+column/i.test(m[2]) ? 2 : 1;
    if ((ล็อก.get(t) ?? 0) < ต้อง) พบ.push(`alter table ${t} กลางรายการ — ต้อง lock table ${t} in ${ต้อง === 2 ? "access exclusive" : "share row exclusive"} mode ก่อนคำสั่งเขียนแรก`);
  }
  return [...new Set(พบ)];
}

if ((process.argv[1] ?? "").replace(/\\/g, "/").endsWith("scripts/check-sql-test-table-locks.mjs")) {
  const ไฟล์ = readdirSync(โฟลเดอร์).filter(f => f.endsWith(".sql")).sort();
  let n = 0;
  for (const f of ไฟล์) for (const p of ตรวจไฟล์(readFileSync(path.join(โฟลเดอร์, f), "utf8"))) { console.log(`  ✗ ${f}: ${p}`); n++; }
  console.log(`ข้อทดสอบ SQL ที่ล็อกตารางแบบค้างกับงานหน้าเว็บได้ (deadlock): ${n} (ตรวจ ${ไฟล์.length} ไฟล์)`);
  process.exit(n ? 1 : 0);
}
