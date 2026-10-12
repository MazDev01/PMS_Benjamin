// ตรวจกฎธุรกิจว่าบังคับที่ "หลังบ้าน" จริงไหม หรือกันไว้แค่บนหน้าจอ
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = (f) => { const m = new Map(); for (const line of readFileSync(f, "utf8").split(String.fromCharCode(10))) { const t = line.trim(); if (!t || t.startsWith("#")) continue; const i = t.indexOf("="); if (i > 0) m.set(t.slice(0, i).trim(), t.slice(i + 1).trim()); } return m; };
const H = env("apps/hq/.env.local"), T = env("tests/.env.test");
const db = createClient(H.get("NEXT_PUBLIC_SUPABASE_URL"), H.get("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const DEALER = "http://localhost:3001";
const TAG = "ZZLOGIC";
const ล้าง = async () => {
  await db.from("quotations").delete().like("customer", TAG + "%");
  await db.from("customers").delete().like("company", TAG + "%");
  await db.from("leads").delete().like("company", TAG + "%");
};
await ล้าง();
const r = await fetch(DEALER + "/api/v1/auth?op=login", { method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: T.get("TEST_RYG_EMAIL"), password: T.get("TEST_RYG_PASSWORD") }) });
const cookie = (r.headers.getSetCookie?.() ?? []).map(c => c.split(";")[0]).join("; ");
const api = (method, path, body) => fetch(DEALER + path, { method, headers: { cookie, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }).then(async x => ({ s: x.status, t: (await x.text()).slice(0, 200) }));

const COMPANY = TAG + "-ลัดขั้น";
await db.from("leads").insert({ id: "#L-996001", dealer_code: "RYG", num_id: 996001, name: COMPANY, company: COMPANY,
  contact: "x", province: "ระยอง", status: "WAITING", value: "500000", area: "100", assigned: "ทดสอบ" });

console.log("=== กฎ: เลื่อนขั้นลีดต้องมีของจริงรองรับ (ทดสอบที่ API ตรง ๆ ไม่ผ่านหน้าจอ) ===");
for (const s of ["QUOTED", "NEGO", "PAID"]) {
  const res = await api("PUT", "/api/v1/leads?op=status", { id: "#L-996001", status: s });
  const { data } = await db.from("leads").select("status").eq("id", "#L-996001").single();
  console.log("  ตั้งสถานะ " + s.padEnd(8) + " ทั้งที่ยังไม่มีใบเสนอราคาเลย → HTTP " + res.s + " · สถานะจริงใน DB = " + data.status);
}
console.log("  สรุป: ถ้าเปลี่ยนได้ทุกขั้น = กฎอยู่แค่บนหน้าจอ ข้ามได้ด้วยการยิง API ตรง");

console.log("");
console.log("=== กฎ: ดีลเลอร์สร้างลูกค้าเองไม่ได้ (ต้องเกิดจากปิดการขายเท่านั้น) ===");
const c = await api("POST", "/api/v1/customers", { id: 991999001, dealerCode: "RYG", name: TAG + "-สร้างเอง",
  company: TAG + "-สร้างเอง", province: "ระยอง", phone: "0800000000", status: "active", joinDate: "2026-08-27", totalValue: 0 });
console.log("  POST /api/v1/customers → " + c.s + " " + c.t.slice(0, 120));
const { data: cc } = await db.from("customers").select("id").like("company", TAG + "%");
console.log("  ลูกค้าที่เกิดขึ้นจริง: " + (cc?.length ?? 0) + " ราย");

console.log("");
console.log("=== กฎ: ปิดการขายไม่สำเร็จต้องมีเหตุผลเสมอ ===");
const l = await api("PUT", "/api/v1/leads", { id: "#L-996001", dealerCode: "RYG", numId: 996001, name: COMPANY,
  company: COMPANY, contact: "x", province: "ระยอง", status: "CANCELLED", value: "500000", area: "100", assigned: "ทดสอบ" });
const { data: l3 } = await db.from("leads").select("status,lost_reason").eq("id", "#L-996001").single();
console.log("  ตั้ง CANCELLED โดยไม่ส่งเหตุผล → HTTP " + l.s + " · ใน DB: สถานะ " + l3.status + " เหตุผล " + JSON.stringify(l3.lost_reason));

console.log("");
console.log("=== กฎ: ราคาในใบต้องตรงกับรายการ BOQ (ผ่าน API) ===");
const q = await api("POST", "/api/v1/quotations?op=numbered", { dealer: "RYG", prefix: "Q-", row: {
  customer: COMPANY, project: COMPANY, date: "2026-08-19", province: "ระยอง", buildingType: "โกดังสำเร็จรูป",
  area: 1, total: "9999999", totalValue: 9999999, materialCost: 500000, items: 1,
  lineItems: [{ name: "งาน", qty: 1, unit: "งาน", unitPrice: 500000 }] } });
console.log("  ส่งยอด 9,999,999 แต่ BOQ มีแค่ 500,000 → HTTP " + q.s + " " + q.t.slice(0, 150));

await ล้าง();
console.log("");
console.log("ล้างข้อมูลทดสอบแล้ว");
