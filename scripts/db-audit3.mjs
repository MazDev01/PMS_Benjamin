// ตรวจซ้ำสองเรื่องที่รอบก่อนวัดผิดวิธี: ประวัติราคา (ต้องมีของก่อนถึงจะลบได้) + ตัวนับเลขที่ผ่าน API จริง
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { วางใบเดิมที่ฐาน } from "./lib/legacyQuoteSeed.mjs";
const env = (f) => { const m = new Map(); for (const line of readFileSync(f, "utf8").split(String.fromCharCode(10))) { const t = line.trim(); if (!t || t.startsWith("#")) continue; const i = t.indexOf("="); if (i > 0) m.set(t.slice(0, i).trim(), t.slice(i + 1).trim()); } return m; };
const H = env("apps/hq/.env.local"), T = env("tests/.env.test");
const db = createClient(H.get("NEXT_PUBLIC_SUPABASE_URL"), H.get("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const TAG = "ZZAUDIT3";
const DEALER = "http://localhost:3001";

await db.from("quotations").delete().like("customer", TAG + "%");
const base = { dealer_code: "RYG", customer: TAG + "-A", project: TAG + "-A", date: "2026-08-19",
  province: "ระยอง", building_type: "โกดังสำเร็จรูป", area: "1", total: "500000", total_value: 500000,
  material_cost: 500000, items: 1, line_items: [{ name: "งาน", qty: 1, unit: "งาน", unitPrice: 500000 }], status: "draft" };
// ใบเดิม (ไม่มีใบ HQ) สร้างผ่านแอป/API ไม่ได้แล้ว (ด่าน 3) — วางที่ฐานทดสอบตรง ๆ เพื่อวัดประวัติราคา
วางใบเดิมที่ฐาน([{ id: TAG + "-Q1", ...base }]);
console.log("=== ประวัติการต่อรองราคา ===");
const up = await db.from("quotations").update({ total_value: 600000, total: "600000", material_cost: 600000,
  line_items: [{ name: "งาน", qty: 1, unit: "งาน", unitPrice: 600000 }] }).eq("id", TAG + "-Q1");
console.log("  แก้ราคา 500,000 -> 600,000: " + (up.error ? "ปฏิเสธ " + up.error.message : "สำเร็จ"));
const { data: q1 } = await db.from("quotations").select("price_history").eq("id", TAG + "-Q1").single();
console.log("  ประวัติที่ระบบบันทึกให้เอง: " + JSON.stringify(q1?.price_history));
const del = await db.from("quotations").update({ price_history: [] }).eq("id", TAG + "-Q1");
console.log("  ลองลบประวัติทิ้ง: " + (del.error ? "ปฏิเสธ [" + del.error.code + "] " + del.error.message : "สำเร็จ (อันตราย)"));
await db.from("quotations").delete().like("customer", TAG + "%");

console.log("");
console.log("=== ตัวนับเลขที่เอกสาร ผ่าน API จริง (ยิงพร้อมกัน 20 สาย) ===");
const r = await fetch(DEALER + "/api/v1/auth?op=login", { method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: T.get("TEST_RYG_EMAIL"), password: T.get("TEST_RYG_PASSWORD") }) });
const cookie = (r.headers.getSetCookie?.() ?? []).map(c => c.split(";")[0]).join("; ");
const ยิง = (path, body) => fetch(DEALER + path, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify(body) }).then(async x => ({ s: x.status, t: await x.text() }));
const t0 = Date.now();
const เลขลูกค้า = await Promise.all(Array.from({ length: 20 }, () => ยิง("/api/v1/customers?op=next", { dealerCode: "RYG" })));
const ค่า = เลขลูกค้า.map(x => x.s === 200 ? x.t : "ERR" + x.s);
console.log("  เลขลูกค้า 20 สาย ใน " + (Date.now() - t0) + "ms · ซ้ำ " + (ค่า.length - new Set(ค่า).size) + " · ตัวอย่าง " + ค่า.slice(0, 5).join(","));
const t1 = Date.now();
const เลขลีด = await Promise.all(Array.from({ length: 20 }, () => ยิง("/api/v1/leads?op=next", { dealerCode: "RYG" })));
const ค่า2 = เลขลีด.map(x => x.s === 200 ? x.t : "ERR" + x.s);
console.log("  เลขลีด 20 สาย ใน " + (Date.now() - t1) + "ms · ซ้ำ " + (ค่า2.length - new Set(ค่า2).size) + " · ตัวอย่าง " + ค่า2.slice(0, 5).join(","));

console.log("");
console.log("=== ความเร็วตอบสนอง (20 สายพร้อมกัน ต่อเส้นทาง) ===");
for (const p of ["/api/v1/leads?dealer=RYG", "/api/v1/quotations?dealer=RYG", "/api/v1/customers?dealer=RYG"]) {
  const t = Date.now();
  const res = await Promise.all(Array.from({ length: 20 }, () => fetch(DEALER + p, { headers: { cookie } })));
  const codes = [...new Set(res.map(x => x.status))];
  console.log("  " + p.padEnd(34) + " 20 สาย " + (Date.now() - t) + "ms · status " + JSON.stringify(codes));
}
