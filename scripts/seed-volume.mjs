// ปั๊มข้อมูลจำลองปริมาณมากลง "ฐานทดสอบ" เพื่อวัดว่าระบบยังไหวไหมตอนข้อมูลเยอะเท่าใช้งานจริง
//   ใช้:  node scripts/seed-volume.mjs 20000        (สร้าง)
//         node scripts/seed-volume.mjs clean         (ลบทิ้งทั้งหมด)
// ⚠️ ยิงลงฐาน "ชุดทดสอบ" เท่านั้น (อ่านค่าจาก apps/hq/.env.local) ห้ามชี้ไปฐานจริงเด็ดขาด
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { วางใบเดิมที่ฐาน } from "./lib/legacyQuoteSeed.mjs";
import { ขอล็อกฐานทดสอบ } from "./lib/testDbLock.mjs";

// เขียนฐานทดสอบ = ถือล็อกฐานทดสอบ — เซสชันอื่นใช้ฐานอยู่ (เช่นรอบตรวจเต็ม) = หยุด บอกว่าใคร (scripts/lib/testDbLock.mjs · 22 ต.ค. 69)
ขอล็อกฐานทดสอบ("seed-volume");
const env = (f) => { const m = new Map(); for (const line of readFileSync(f, "utf8").split(String.fromCharCode(10))) { const t = line.trim(); if (!t || t.startsWith("#")) continue; const i = t.indexOf("="); if (i > 0) m.set(t.slice(0, i).trim(), t.slice(i + 1).trim()); } return m; };
const H = env("apps/hq/.env.local");
const URL_ = H.get("NEXT_PUBLIC_SUPABASE_URL");
if (!URL_.includes("fxckixlz")) { console.error("หยุด — นี่ไม่ใช่ฐานข้อมูลชุดทดสอบ: " + URL_); process.exit(1); }
const db = createClient(URL_, H.get("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

const TAG = "ZZVOL";
const ID_BASE = 970_000_000;
const สาขา = ["RYG", "CNX", "BKK", "CBI", "KKN", "NMA", "PKT", "UBN"];   // ต้องตรงกับทะเบียนสาขาจริงในฐาน (FK)
const จังหวัด = ["ระยอง", "ชลบุรี", "เชียงใหม่", "กรุงเทพฯ", "ขอนแก่น", "สงขลา", "นครราชสีมา", "ภูเก็ต"];
const สินค้า = ["โรงงาน", "โกดังสำเร็จรูป", "อาคารสำเร็จรูปทุกประเภท", "งานตามแบบของลูกค้า"];
const สถานะ = ["WAITING", "BULLET", "QUOTED", "FOLLOWUP", "NEGO", "PAID", "CANCELLED"];

async function ล้าง() {
  console.log("กำลังลบข้อมูลจำลอง...");
  for (const t of ["quotations", "customers", "leads"]) {
    const col = t === "customers" ? "company" : t === "leads" ? "company" : "customer";
    let รอบ = 0;
    for (;;) {
      const { error, count } = await db.from(t).delete({ count: "exact" }).like(col, TAG + "%");
      if (error) { console.log("  " + t + " ลบไม่สำเร็จ: " + error.message); break; }
      รอบ += count ?? 0;
      if (!count) break;
    }
    console.log("  " + t + " ลบไป " + รอบ + " แถว");
  }
}

const อาร์กิวเมนต์ = process.argv[2] ?? "20000";
if (อาร์กิวเมนต์ === "clean") { await ล้าง(); process.exit(0); }

const จำนวน = Number(อาร์กิวเมนต์);
console.log("ฐานข้อมูล: " + URL_);
console.log("จะสร้างลูกค้าเป้าหมาย " + จำนวน + " แถว + ใบเสนอราคาราวครึ่งหนึ่ง");
await ล้าง();

const วันที่ = (i) => {
  const d = new Date(2026, 0, 1 + (i % 240));
  return d.toISOString().slice(0, 10);
};
const ก้อน = 500;
let เริ่ม = Date.now();
for (let i = 0; i < จำนวน; i += ก้อน) {
  const rows = [];
  for (let k = 0; k < ก้อน && i + k < จำนวน; k++) {
    const n = i + k;
    const d = สาขา[n % สาขา.length];
    rows.push({
      id: "#L-" + (ID_BASE + n), dealer_code: d, num_id: ID_BASE + n,
      name: TAG + "-ลูกค้าเป้าหมาย-" + n, company: TAG + "-ลูกค้าเป้าหมาย-" + n,
      contact: "คุณทดสอบ " + n, phone: "08" + String(10000000 + n).slice(-8),
      email: "vol" + n + "@example.co.th", province: จังหวัด[n % จังหวัด.length],
      product: สินค้า[n % สินค้า.length], category: สินค้า[n % สินค้า.length],
      status: สถานะ[n % สถานะ.length], value: String(300000 + (n % 50) * 25000),
      area: String(100 + (n % 40) * 25), assigned: "พนักงาน " + (n % 12),
      source: ["เว็บไซต์", "Facebook", "โทรเข้า", "ลูกค้าแนะนำ", "ออกบูธ"][n % 5],
      last_contact_at: วันที่(n),
    });
  }
  const { error } = await db.from("leads").insert(rows);
  if (error) { console.error("insert leads ล้ม: " + error.message); process.exit(1); }
  if ((i / ก้อน) % 8 === 0) console.log("  ลูกค้าเป้าหมาย " + (i + rows.length) + "/" + จำนวน + " (" + ((Date.now() - เริ่ม) / 1000).toFixed(0) + "s)");
}
console.log("ลูกค้าเป้าหมายเสร็จใน " + ((Date.now() - เริ่ม) / 1000).toFixed(1) + " วินาที");

// ── ลูกค้า: ใบที่สถานะ "ปิดการขายได้" ต้องมีลูกค้าผูกอยู่จริง (ข้อบังคับของฐานข้อมูล) ──
เริ่ม = Date.now();
const จำนวนใบ = Math.floor(จำนวน / 2);
const มีลูกค้า = (n) => n % 5 === 2;               // ใบที่จะเป็น won
const idลูกค้า = (n) => ID_BASE + 500_000 + n;
for (let i = 0; i < จำนวนใบ; i += ก้อน) {
  const rows = [];
  for (let k = 0; k < ก้อน && i + k < จำนวนใบ; k++) {
    const n = i + k;
    if (!มีลูกค้า(n)) continue;
    const d = สาขา[n % สาขา.length];
    rows.push({
      id: idลูกค้า(n), dealer_code: d, name: TAG + "-ลูกค้า-" + n, company: TAG + "-ลูกค้า-" + n,
      email: "volc" + n + "@example.co.th", phone: "09" + String(10000000 + n).slice(-8),
      province: จังหวัด[n % จังหวัด.length], category: สินค้า[n % สินค้า.length], status: "active",
      join_date: วันที่(n), owner: "พนักงาน " + (n % 12), initials: "ZZ", color: "#003366",
      total_value: 300000 + (n % 50) * 25000,
    });
  }
  if (!rows.length) continue;
  const { error } = await db.from("customers").insert(rows);
  if (error) { console.error("insert customers ล้ม: " + error.message); process.exit(1); }
}
console.log("ลูกค้าเสร็จใน " + ((Date.now() - เริ่ม) / 1000).toFixed(1) + " วินาที");

เริ่ม = Date.now();
for (let i = 0; i < จำนวนใบ; i += ก้อน) {
  const rows = [];
  for (let k = 0; k < ก้อน && i + k < จำนวนใบ; k++) {
    const n = i + k;
    const d = สาขา[n % สาขา.length];
    const ยอด = 300000 + (n % 50) * 25000;
    rows.push({
      id: TAG + "-Q-" + d + "-" + n, dealer_code: d, deal_id: ID_BASE + n,
      customer: TAG + "-ลูกค้าเป้าหมาย-" + n, project: TAG + "-โครงการ-" + n,
      date: วันที่(n), province: จังหวัด[n % จังหวัด.length],
      building_type: สินค้า[n % สินค้า.length], area: String(100 + (n % 40) * 25),
      total: String(ยอด), total_value: ยอด, material_cost: ยอด, items: 1,
      line_items: [{ name: "งานตามสัญญา", qty: 1, unit: "งาน", unitPrice: ยอด }],
      status: ["draft", "sent_to_client", "won", "lost", "expired"][n % 5],
      ...(มีลูกค้า(n) ? { customer_id: idลูกค้า(n) } : {}),
    });
  }
  // ใบไม่มีใบ HQ = ใบแบบเดิม · ฐานปฏิเสธทางเขียนปกติตั้งแต่ใบ 0201 → วางที่ฐานในเครื่องตรง (ข้อมูลปริมาณสำหรับวัดความเร็วเท่านั้น)
  try { วางใบเดิมที่ฐาน(rows); } catch (e) { console.error("วางใบเสนอราคาล้ม: " + (e instanceof Error ? e.message : e)); process.exit(1); }
  if ((i / ก้อน) % 8 === 0) console.log("  ใบเสนอราคา " + (i + rows.length) + "/" + จำนวนใบ + " (" + ((Date.now() - เริ่ม) / 1000).toFixed(0) + "s)");
}
console.log("ใบเสนอราคาเสร็จใน " + ((Date.now() - เริ่ม) / 1000).toFixed(1) + " วินาที");

for (const t of ["leads", "quotations"]) {
  const { count } = await db.from(t).select("id", { count: "exact", head: true });
  console.log("รวมในตาราง " + t + ": " + count + " แถว");
}
