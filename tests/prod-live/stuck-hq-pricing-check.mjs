// ── ตรวจบนเว็บจริง (อ่านอย่างเดียว): ต้องไม่มีลีดที่ใบ HQ ส่งแล้วแต่สถานะยัง "รอราคา HQ" (บอสสั่ง 20 ต.ค. 69 · ใบ 0219) ──────
//   เดิม HQ ส่งใบแล้วลีดค้างรอราคา → ตัวกรอง/ตัวเลข/กล่องงานนับผิด · ใบ 0219 ให้ฐานขยับเป็น "ได้ราคา HQ" เอง + แก้ของค้าง
//   ตัวนี้จับถ้ามีทางไหนทำให้กลับมาค้างอีก · ไม่เขียนอะไร · ไม่พิมพ์ชื่อลูกค้า (บอกแค่จำนวนและรหัสสาขา)
// รัน: node tests/prod-live/stuck-hq-pricing-check.mjs   (ใช้ .env.production.local · ฐานจริง)
//      node tests/prod-live/stuck-hq-pricing-check.mjs --target local   (ฐานทดสอบในเครื่อง · apps/hq/.env.local)
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const local = process.argv.includes("--target") && process.argv[process.argv.indexOf("--target") + 1] === "local";
const env = Object.fromEntries(readFileSync(local ? "apps/hq/.env.local" : ".env.production.local", "utf8").split(/\r?\n/)
  .filter(l => /^[A-Z_]+=/.test(l)).map(l => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: รอ, error: e1 } = await svc.from("leads").select("dealer_code, num_id").eq("status", "HQ_PRICING");
if (e1) { console.error(`✗ อ่านลีดไม่สำเร็จ: ${e1.message}`); process.exit(1); }
const ค้าง = [];
for (const l of รอ ?? []) {
  const { data: rq } = await svc.from("quote_requests").select("id").eq("dealer_code", l.dealer_code).eq("lead_num_id", l.num_id).eq("status", "quoted");
  for (const r of rq ?? []) {
    const { count } = await svc.from("hq_quotes").select("id", { count: "exact", head: true }).eq("request_id", r.id).eq("status", "sent");
    if ((count ?? 0) > 0) { ค้าง.push(l.dealer_code); break; }
  }
}
if (ค้าง.length) {
  console.log(`✗ ลีดที่ใบ HQ ส่งแล้วแต่ยังรอราคา HQ: ${ค้าง.length} แถว (สาขา ${[...new Set(ค้าง)].join(", ")})`);
  process.exitCode = 1;
} else {
  console.log(`✓ ไม่มีลีดที่ใบ HQ ส่งแล้วแต่ยังรอราคา HQ (ตรวจลีดรอราคา ${รอ?.length ?? 0} แถว)`);
}
