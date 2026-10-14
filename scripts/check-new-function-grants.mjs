// ── ตัวตรวจ: คำสั่งใหม่ของฐานข้อมูล ต้องกำหนดสิทธิ์เรียกเองในใบที่สร้าง ────────────────────────────
//
// ทำไมต้องมี (13 ต.ค. 69 · ใบ 0190): สิทธิ์ตั้งต้นของคำสั่งใหม่ต่างกันตามรุ่นของฐานข้อมูล
//   บางรุ่นให้ทุกคนผ่าน public · บางรุ่นให้ตรงกับ anon / authenticated / service_role ด้วย
//   ใบที่สร้างคำสั่งแล้วไม่กำหนดสิทธิ์ = ได้สิทธิ์ไม่เหมือนกันในแต่ละฐาน และคนที่ยังไม่เข้าระบบอาจเรียกได้
//   ใบ 0190 จัดของเดิมให้ชัดทั้งหมดแล้ว — ตัวนี้กันของใหม่
//
// กติกา: ใบที่เลขมากกว่า 0191 และสร้างคำสั่ง "ชื่อใหม่" (ไม่เคยมีในใบก่อนหน้า) ต้องมีในใบเดียวกัน
//     revoke all on function public.<ชื่อ>(…) from public, anon, authenticated, service_role;
//   แล้วค่อย grant ให้ผู้ที่ต้องเรียกจริง (ตัวตรวจ check-server-rpc-grants.mjs ตรวจว่า grant ตรงกับผู้เรียกในโค้ด)
//   คำสั่งที่ create or replace ทับของเดิมไม่ต้องทำซ้ำ — สิทธิ์เดิมคงอยู่
// รัน: node scripts/check-new-function-grants.mjs   (ไม่ต้องต่อฐานข้อมูล)
import { readFileSync, readdirSync } from "node:fs";

const โฟลเดอร์ = "supabase/migrations";
const เริ่มบังคับหลังใบ = 191;
const สร้างคำสั่ง = /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?("?)([a-z_][a-z_0-9]*)\1\s*\(/gi;
const ตัดหมายเหตุ = s => s.replace(/--[^\n]*/g, "");

const ไฟล์ = readdirSync(โฟลเดอร์).filter(f => /^\d{4}_.*\.sql$/.test(f)).sort();
const เคยมี = new Set();
const พบ = [];
let ตรวจ = 0;
for (const f of ไฟล์) {
  const เลข = Number(f.slice(0, 4));
  const sql = ตัดหมายเหตุ(readFileSync(`${โฟลเดอร์}/${f}`, "utf8"));
  const ในใบนี้ = new Set([...sql.matchAll(สร้างคำสั่ง)].map(m => m[2].toLowerCase()));
  if (เลข > เริ่มบังคับหลังใบ) {
    for (const name of ในใบนี้) {
      if (เคยมี.has(name)) continue;
      ตรวจ++;
      const ถอน = [...sql.matchAll(new RegExp(`revoke\\s+all\\s+on\\s+function\\s+(?:public\\.)?${name}\\s*\\([^;]*?\\)\\s*from\\s+([^;]+);`, "gi"))].map(m => m[1].toLowerCase());
      const ครบ = ถอน.some(r => ["public", "anon", "authenticated", "service_role"].every(x => new RegExp(`(^|[\\s,])${x}([\\s,]|$)`).test(r)));
      if (!ครบ) พบ.push(`${f}: คำสั่งใหม่ ${name}() ไม่ได้ถอนสิทธิ์ตั้งต้นให้ครบ — ต้องมี revoke all on function public.${name}(…) from public, anon, authenticated, service_role; แล้ว grant ตามผู้เรียกจริง`);
    }
  }
  for (const n of ในใบนี้) เคยมี.add(n);
}
for (const p of พบ) console.log(`  ✗ ${p}`);
console.log(`คำสั่งใหม่ของฐานที่ไม่ได้กำหนดสิทธิ์เรียกเอง: ${พบ.length} (ตรวจ ${ตรวจ} คำสั่งใหม่ในใบหลัง ${String(เริ่มบังคับหลังใบ).padStart(4, "0")} · รู้จักคำสั่งเดิม ${เคยมี.size} ชื่อ)`);
process.exit(พบ.length ? 1 : 0);
