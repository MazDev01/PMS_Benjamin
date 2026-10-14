// ตรวจข้อบังคับ/ทริกเกอร์ของฐานข้อมูลด้วยการ "ลองเขียนจริง" แล้วดูว่าถูกปฏิเสธไหม
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { วางใบเดิมที่ฐาน } from "./lib/legacyQuoteSeed.mjs";
const env = (f) => { const m = new Map(); for (const line of readFileSync(f, "utf8").split(String.fromCharCode(10))) { const t = line.trim(); if (!t || t.startsWith("#")) continue; const i = t.indexOf("="); if (i > 0) m.set(t.slice(0, i).trim(), t.slice(i + 1).trim()); } return m; };
const H = env("apps/hq/.env.local");
const db = createClient(H.get("NEXT_PUBLIC_SUPABASE_URL"), H.get("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const TAG = "ZZAUDIT";
const out = [];
const เทส = async (ชื่อ, คาดว่า, fn) => {
  const { error } = await fn();
  const code = error?.code ?? "-";
  const ผ่าน = คาดว่า === "ปฏิเสธ" ? !!error : !error;
  out.push({ ชื่อ, คาดว่า, ผล: error ? ("ปฏิเสธ [" + code + "] " + (error.message ?? "").slice(0, 70)) : "สำเร็จ", ผ่าน });
  console.log((ผ่าน ? "  ok   " : "  FAIL ") + ชื่อ.padEnd(52) + " → " + (error ? "ปฏิเสธ [" + code + "] " + (error.message ?? "").slice(0, 60) : "สำเร็จ"));
};

const ล้าง = async () => {
  await db.from("quotations").delete().like("customer", TAG + "%");
  await db.from("customers").delete().like("company", TAG + "%");
  await db.from("leads").delete().like("company", TAG + "%");
};
await ล้าง();

console.log("=== ข้อบังคับของฐานข้อมูล (ลองเขียนจริง) ===");
const leadBase = { dealer_code: "RYG", num_id: 987001, name: TAG + "-A", company: TAG + "-A", contact: "x", province: "ระยอง", status: "WAITING" };

await เทส("สร้างลีดปกติ", "สำเร็จ", () => db.from("leads").insert({ id: "#L-987001", ...leadBase }));
await เทส("สร้างลีดซ้ำคีย์เดิม (id+สาขา)", "ปฏิเสธ", () => db.from("leads").insert({ id: "#L-987001", ...leadBase }));
await เทส("สร้างลีดใส่รหัสสาขาที่ไม่มีจริง (FK)", "ปฏิเสธ", () => db.from("leads").insert({ id: "#L-987002", ...leadBase, dealer_code: "ไม่มีสาขานี้" }));
await เทส("สร้างลีดไม่ใส่ชื่อบริษัท (NOT NULL)", "ปฏิเสธ", () => db.from("leads").insert({ id: "#L-987003", dealer_code: "RYG", num_id: 987003, company: null }));
await เทส("ใส่สถานะลีดที่ไม่มีในระบบ", "ปฏิเสธ", () => db.from("leads").insert({ id: "#L-987004", ...leadBase, num_id: 987004, status: "สถานะมั่ว" }));

const quoteBase = { dealer_code: "RYG", customer: TAG + "-A", project: TAG + "-A", date: "2026-08-19",
  province: "ระยอง", building_type: "โกดังสำเร็จรูป", area: "1", total: "500000", total_value: 500000,
  material_cost: 500000, items: 1, line_items: [{ name: "งาน", qty: 1, unit: "งาน", unitPrice: 500000 }], status: "draft" };
// ด่าน 3 (0201): ใบใหม่ที่ไม่มีใบ HQ สร้างไม่ได้ทุกทาง — ข้อแรกยืนยันการปิดทางเดิม
//   กฎของตารางที่เหลือวัดบน "ใบเดิม" ที่วางไว้ที่ฐานทดสอบตรง ๆ (แก้แถวแทนการสร้างใหม่ — กฎชุดเดียวกันทำงานทั้งตอนเพิ่มและแก้)
await เทส("สร้างใบเสนอราคาที่ไม่มีใบ HQ (ปิดทางเดิม)", "ปฏิเสธ", () => db.from("quotations").insert({ id: TAG + "-Q0", ...quoteBase }));
วางใบเดิมที่ฐาน([{ id: TAG + "-Q1", ...quoteBase }]);
await เทส("ใบเสนอราคายอดไม่ตรงกับรายการ BOQ (ทริกเกอร์)", "ปฏิเสธ", () => db.from("quotations").update({ total_value: 999999 }).eq("id", TAG + "-Q1"));
await เทส("ใบเสนอราคาผูกลูกค้าที่ไม่มีจริง (FK ผสม)", "ปฏิเสธ", () => db.from("quotations").update({ customer_id: 999999999 }).eq("id", TAG + "-Q1"));
await เทส("ใบเสนอราคาสถานะที่ไม่มีในระบบ", "ปฏิเสธ", () => db.from("quotations").update({ status: "มั่ว" }).eq("id", TAG + "-Q1"));
// ⚠️ ต้องทำให้ "มีประวัติ" ก่อน — ของว่างอยู่แล้วการตั้งเป็นว่างไม่ใช่การลบ (วัดผิดวิธีมาแล้ว 27 ส.ค. 69)
await db.from("quotations").update({ total_value: 600000, total: "600000", material_cost: 600000,
  line_items: [{ name: "งาน", qty: 1, unit: "งาน", unitPrice: 600000 }] }).eq("id", TAG + "-Q1");
await เทส("ลบประวัติการต่อรองราคาย้อนหลัง", "ปฏิเสธ", () => db.from("quotations").update({ price_history: [] }).eq("id", TAG + "-Q1"));

console.log("");
console.log("(ตัวนับเลขที่เอกสารทดสอบผ่าน API จริงที่ scripts/db-audit3.mjs — RPC ตรวจสาขาของผู้เรียก กุญแจระดับระบบจึงทดสอบตรงไม่ได้)");

await ล้าง();
console.log("");
console.log("สรุป: ผ่าน " + out.filter(o => o.ผ่าน).length + "/" + out.length);
for (const o of out.filter(o => !o.ผ่าน)) console.log("  FAIL " + o.ชื่อ + " — คาด " + o.คาดว่า + " แต่ " + o.ผล);
