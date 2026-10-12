// เทียบเวลา "รันในนามผู้ใช้จริง (มีกฎความปลอดภัยตรวจทุกแถว)" กับ "รันด้วยกุญแจระดับระบบ (ข้ามกฎ)"
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = (f) => { const m = new Map(); for (const line of readFileSync(f, "utf8").split(String.fromCharCode(10))) { const t = line.trim(); if (!t || t.startsWith("#")) continue; const i = t.indexOf("="); if (i > 0) m.set(t.slice(0, i).trim(), t.slice(i + 1).trim()); } return m; };
const H = env("apps/hq/.env.local"), T = env("tests/.env.test");
const URL_ = H.get("NEXT_PUBLIC_SUPABASE_URL");
const ANON = env("apps/dealer/.env.local").get("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const ระบบ = createClient(URL_, H.get("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

const ตัวผู้ใช้ = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: s, error: e } = await ตัวผู้ใช้.auth.signInWithPassword({ email: T.get("TEST_ADMIN_EMAIL"), password: T.get("TEST_ADMIN_PASSWORD") });
if (e) { console.error("ล็อกอินไม่ผ่าน: " + e.message); process.exit(1); }
const ในนามผู้ใช้ = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { Authorization: "Bearer " + s.session.access_token } } });

const args = { p_limit: 20, p_offset: 0, p_status: null, p_dealer_codes: null, p_province: null, p_product: null,
  p_source: null, p_search: null, p_date_start: null, p_date_end: null, p_overdue: false, p_as_of: "2026-08-27",
  p_default_days: 7, p_follow_up_days: {} };

const วัด = async (ชื่อ, fn, รอบ = 3) => {
  const เวลา = [];
  for (let i = 0; i < รอบ; i++) { const t = Date.now(); const r = await fn(); เวลา.push(Date.now() - t); if (r.error) { console.log("  " + ชื่อ + " ERROR " + r.error.message.slice(0, 70)); return; } }
  console.log("  " + ชื่อ.padEnd(46) + เวลา.map(x => String(x).padStart(5) + "ms").join(" "));
};

console.log("=== leads_page (20 แถวจาก 20,000) ===");
await วัด("กุญแจระดับระบบ (ข้ามกฎความปลอดภัย)", () => ระบบ.rpc("leads_page", args));
await วัด("ในนามผู้ดูแล HQ (กฎความปลอดภัยทำงาน)", () => ในนามผู้ใช้.rpc("leads_page", args));
console.log("");
console.log("=== อ่านตารางตรง ๆ 20 แถว ===");
await วัด("กุญแจระดับระบบ", () => ระบบ.from("leads").select("*").limit(20));
await วัด("ในนามผู้ดูแล HQ", () => ในนามผู้ใช้.from("leads").select("*").limit(20));
console.log("");
console.log("=== นับทั้งตาราง ===");
await วัด("กุญแจระดับระบบ", () => ระบบ.from("leads").select("id", { count: "exact", head: true }));
await วัด("ในนามผู้ดูแล HQ", () => ในนามผู้ใช้.from("leads").select("id", { count: "exact", head: true }));

console.log("");
console.log("=== เจาะจงว่าเวลาหายไปไหน ===");
await วัด("นับ leads เฉพาะสาขา RYG (ในนาม HQ)", () => ในนามผู้ใช้.from("leads").select("id", { count: "exact", head: true }).eq("dealer_code", "RYG"));
await วัด("นับ quotations ทั้งหมด (ในนาม HQ)", () => ในนามผู้ใช้.from("quotations").select("id", { count: "exact", head: true }));
await วัด("นับ leads แบบประมาณ (planned)", () => ในนามผู้ใช้.from("leads").select("id", { count: "planned", head: true }));
await วัด("อ่าน leads 1000 แถว (ในนาม HQ)", () => ในนามผู้ใช้.from("leads").select("*").range(0, 999));
await วัด("อ่าน leads 1000 แถว (กุญแจระบบ)", () => ระบบ.from("leads").select("*").range(0, 999));

// ล็อกอินเป็นดีลเลอร์ (สาขาเดียว) เทียบกับ HQ (เห็นทั้งเครือ)
const ดีลเลอร์ = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: s2 } = await ดีลเลอร์.auth.signInWithPassword({ email: T.get("TEST_RYG_EMAIL"), password: T.get("TEST_RYG_PASSWORD") });
const ในนามดีลเลอร์ = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { Authorization: "Bearer " + s2.session.access_token } } });
console.log("");
console.log("=== ในนามดีลเลอร์ (เห็นแค่สาขาตัวเอง 2,500 แถว) ===");
await วัด("นับ leads", () => ในนามดีลเลอร์.from("leads").select("id", { count: "exact", head: true }));
await วัด("leads_page 20 แถว", () => ในนามดีลเลอร์.rpc("leads_page", args));
