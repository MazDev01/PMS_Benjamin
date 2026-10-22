// ทดสอบการยิงพร้อมกันบนข้อมูลชิ้นเดียวกัน (race condition) ผ่าน API จริง
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { วางใบเดิมที่ฐาน } from "./lib/legacyQuoteSeed.mjs";
import { ต้นทาง as ต้นทางเว็บ } from "./lib/session.mjs";
const เว็บ = ต้นทางเว็บ("dev");   // ที่อยู่เว็บในเครื่องของโฟลเดอร์นี้ — ห้ามเขียนพอร์ตเอง (check-hardcoded-ports)
const env = (f) => { const m = new Map(); for (const line of readFileSync(f, "utf8").split(String.fromCharCode(10))) { const t = line.trim(); if (!t || t.startsWith("#")) continue; const i = t.indexOf("="); if (i > 0) m.set(t.slice(0, i).trim(), t.slice(i + 1).trim()); } return m; };
const H = env("apps/hq/.env.local"), T = env("tests/.env.test");
const db = createClient(H.get("NEXT_PUBLIC_SUPABASE_URL"), H.get("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const DEALER = เว็บ.dealer;
const TAG = "ZZRACE";
const ล้าง = async () => {
  await db.from("quotations").delete().like("customer", TAG + "%");
  await db.from("customers").delete().like("company", TAG + "%");
  await db.from("leads").delete().like("company", TAG + "%");
};
await ล้าง();

const r = await fetch(DEALER + "/api/v1/auth?op=login", { method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: T.get("TEST_RYG_EMAIL"), password: T.get("TEST_RYG_PASSWORD") }) });
const cookie = (r.headers.getSetCookie?.() ?? []).map(c => c.split(";")[0]).join("; ");
const api = (method, path, body) => fetch(DEALER + path, { method, headers: { cookie, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }).then(async x => ({ s: x.status, t: await x.text() }));

// เตรียมดีล: ลีด + ใบเสนอราคาที่ส่งแล้ว
const COMPANY = TAG + "-ปิดพร้อมกัน";
await db.from("leads").insert({ id: "#L-995001", dealer_code: "RYG", num_id: 995001, name: COMPANY, company: COMPANY,
  contact: "x", province: "ระยอง", status: "QUOTED", value: "500000", area: "100", assigned: "ทดสอบ" });
// ใบแบบเดิม (ไม่มีใบ HQ) วางที่ฐานในเครื่องตรง — ทางเขียนปกติปิดตั้งแต่ใบ 0201 (ทดสอบการชนกันของสถานะ ไม่ได้ทดสอบ Flow)
วางใบเดิมที่ฐาน([{ id: TAG + "-Q1", dealer_code: "RYG", customer: COMPANY, project: COMPANY,
  date: "2026-08-19", province: "ระยอง", building_type: "โกดังสำเร็จรูป", area: "1", total: "500000", total_value: 500000,
  material_cost: 500000, items: 1, line_items: [{ name: "งาน", qty: 1, unit: "งาน", unitPrice: 500000 }], status: "draft" }]);
const { data: qs } = await db.from("quotations").select("id").eq("customer", COMPANY);
const qid = qs[0].id;
await db.from("quotations").update({ status: "sent_to_client" }).eq("id", qid);
console.log("เตรียมดีลแล้ว: ใบ " + qid);

console.log("");
console.log("=== 1) ปิดการขายพร้อมกัน 10 สาย บนดีลเดียวกัน ===");
const payload = { dealer: "RYG", knownCustomerId: null, leadCompany: COMPANY, targetQuoteId: qid, cascadeWon: true,
  payload: { name: COMPANY, company: COMPANY, province: "ระยอง", phone: "0800000000", joinDate: "2026-08-27", status: "active", totalValue: 0 } };
const t0 = Date.now();
const res = await Promise.all(Array.from({ length: 10 }, () => api("POST", "/api/v1/customers?op=close-won", payload)));
console.log("  ใช้เวลา " + (Date.now() - t0) + "ms · สถานะที่ได้: " + JSON.stringify(res.reduce((a, x) => (a[x.s] = (a[x.s] ?? 0) + 1, a), {})));
const { data: cs } = await db.from("customers").select("id,company,total_value").eq("company", COMPANY);
console.log("  ลูกค้าที่เกิดขึ้นจริง: " + cs.length + " ราย · " + JSON.stringify(cs.map(c => ({ id: c.id, ยอด: c.total_value }))));
console.log("  ต้องได้ 1 ราย ยอด 500000 → " + (cs.length === 1 && Number(cs[0].total_value) === 500000 ? "PASS" : "FAIL"));

console.log("");
console.log("=== 2) เปลี่ยนสถานะใบเดียวกันพร้อมกัน 10 สาย (won/lost สลับ) ===");
const st = ["won", "lost", "won", "lost", "won", "lost", "won", "lost", "won", "lost"];
const res2 = await Promise.all(st.map(s => api("PUT", "/api/v1/quotations?op=status-reconciled", { id: qid, status: s })));
console.log("  สถานะที่ได้: " + JSON.stringify(res2.reduce((a, x) => (a[x.s] = (a[x.s] ?? 0) + 1, a), {})));
const { data: q2 } = await db.from("quotations").select("status").eq("id", qid).single();
const { data: c2 } = await db.from("customers").select("total_value").eq("company", COMPANY).maybeSingle();
console.log("  สถานะสุดท้ายของใบ: " + q2.status + " · ยอดลูกค้า: " + (c2?.total_value ?? "-"));
const ตรง = (q2.status === "won" && Number(c2?.total_value) === 500000) || (q2.status !== "won" && Number(c2?.total_value) === 0);
console.log("  ยอดลูกค้าต้องสอดคล้องกับสถานะสุดท้าย → " + (ตรง ? "PASS" : "FAIL"));

console.log("");
console.log("=== 3) แก้ลีดตัวเดียวกันพร้อมกัน 10 สาย (ค่าต่างกัน) ===");
const { data: lead } = await db.from("leads").select("*").eq("company", COMPANY).single();
// ทางเดียวที่แก้ลูกค้าเป้าหมาย = บันทึกส่วนต่าง (ใบ 0211 · PUT ทั้งแถวปิดแล้ว 410)
const res3 = await Promise.all(Array.from({ length: 10 }, (_, i) => api("POST", "/api/v1/leads?op=apply", { id: lead.id, intent: { fields: { value: String(100000 * (i + 1)) } } })));
console.log("  สถานะที่ได้: " + JSON.stringify(res3.reduce((a, x) => (a[x.s] = (a[x.s] ?? 0) + 1, a), {})));
const { data: l2 } = await db.from("leads").select("value").eq("company", COMPANY);
console.log("  แถวลีดที่เหลือ: " + l2.length + " · ค่าที่บันทึกจริง: " + JSON.stringify(l2.map(x => x.value)));
const ค่าที่ยิง = Array.from({ length: 10 }, (_, i) => String(100000 * (i + 1)));
console.log("  ต้องเหลือ 1 แถว และค่าต้องเป็นหนึ่งในที่ยิงไป → " + (l2.length === 1 && ค่าที่ยิง.includes(l2[0].value) ? "PASS" : "FAIL"));

await ล้าง();
console.log("");
console.log("ล้างข้อมูลทดสอบแล้ว");
