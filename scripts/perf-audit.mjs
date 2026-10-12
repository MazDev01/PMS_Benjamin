// วัดว่าระบบยังไหวไหมเมื่อข้อมูลเยอะเท่าใช้งานจริง (ใช้คู่กับ scripts/seed-volume.mjs)
import { readFileSync } from "node:fs";
const env = (f) => { const m = new Map(); for (const line of readFileSync(f, "utf8").split(String.fromCharCode(10))) { const t = line.trim(); if (!t || t.startsWith("#")) continue; const i = t.indexOf("="); if (i > 0) m.set(t.slice(0, i).trim(), t.slice(i + 1).trim()); } return m; };
const T = env("tests/.env.test");
const D = "http://localhost:3001", HQ = "http://localhost:3002";
const jar = {};
async function login(who, origin, acc) {
  const r = await fetch(origin + "/api/v1/auth?op=login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(acc) });
  jar[who] = (r.headers.getSetCookie?.() ?? []).map(c => c.split(";")[0]).join("; ");
  return r.status;
}
console.log("login RYG " + await login("RYG", D, { email: T.get("TEST_RYG_EMAIL"), password: T.get("TEST_RYG_PASSWORD") }) +
  " · ADMIN " + await login("ADMIN", HQ, { email: T.get("TEST_ADMIN_EMAIL"), password: T.get("TEST_ADMIN_PASSWORD") }));

const ผล = [];
async function วัด(ชื่อ, origin, who, method, path, body) {
  const h = { cookie: jar[who] }; if (body !== undefined) h["content-type"] = "application/json";
  const t0 = Date.now();
  const r = await fetch(origin + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  const ms = Date.now() - t0;
  let แถว = "-", ครบ = "";
  try {
    const j = JSON.parse(text);
    const rows = j.rows ?? j;
    if (Array.isArray(rows)) แถว = rows.length;
    if (j.total != null) แถว = แถว + "/" + j.total;
    if (j.partial === true) ครบ = "  ⚠️ ข้อมูลไม่ครบ (ชนเพดาน)";
  } catch { /* ไม่ใช่ JSON */ }
  const ขนาด = (text.length / 1024).toFixed(0) + "KB";
  ผล.push({ ชื่อ, ms });
  console.log("  " + String(ms).padStart(6) + "ms  " + ขนาด.padStart(8) + "  แถว " + String(แถว).padEnd(12) + ชื่อ + ครก(ครบ));
}
const ครก = (s) => s;

console.log("");
console.log("=== ฝั่งดีลเลอร์: โหลดข้อมูลทั้งสาขา (แอปดึงทั้งก้อนเข้าหน่วยความจำ) ===");
await วัด("ลูกค้าเป้าหมายทั้งสาขา", D, "RYG", "GET", "/api/v1/leads?dealer=RYG");
await วัด("ใบเสนอราคาทั้งสาขา", D, "RYG", "GET", "/api/v1/quotations?dealer=RYG");
await วัด("ลูกค้าทั้งสาขา", D, "RYG", "GET", "/api/v1/customers?dealer=RYG");
await วัด("นัดหมายทั้งสาขา", D, "RYG", "GET", "/api/v1/appointments?dealer=RYG");

console.log("");
console.log("=== ฝั่ง HQ: ทั้งเครือ ===");
await วัด("ลูกค้าเป้าหมายทั้งเครือ", HQ, "ADMIN", "GET", "/api/v1/leads?hq=1");
await วัด("ใบเสนอราคาทั้งเครือ", HQ, "ADMIN", "GET", "/api/v1/quotations?hq=1");

console.log("");
console.log("=== ตารางแบ่งหน้า (สิ่งที่หน้าจอใช้จริง) ===");
await วัด("ลีดหน้าแรก 20 แถว", HQ, "ADMIN", "POST", "/api/v1/leads?op=page", { limit: 20, offset: 0 });
await วัด("ลีดหน้าที่ 500", HQ, "ADMIN", "POST", "/api/v1/leads?op=page", { limit: 20, offset: 10000 });
await วัด("ลีดค้นหาคำว่า ZZVOL", HQ, "ADMIN", "POST", "/api/v1/leads?op=page", { limit: 20, offset: 0, search: "ZZVOL-ลูกค้าเป้าหมาย-19999" });
await วัด("ใบเสนอราคาหน้าแรก 20 แถว", HQ, "ADMIN", "POST", "/api/v1/quotations?op=page", { limit: 20, offset: 0 });
await วัด("ลูกค้าหน้าแรก 20 แถว", HQ, "ADMIN", "POST", "/api/v1/metrics?k=hqCustomersPage", { limit: 20, offset: 0 });

console.log("");
console.log("=== รายงาน/ตัวชี้วัด (คำนวณที่ฐานข้อมูล) ===");
const keys = {
  dealerRollup: { year: 2026, asOf: "2026-08-27", defaultDays: 7, perDealer: null },
  networkQuoteRange: { start: "2026-01-01", end: "2026-12-31", dealer: null },
  leadSummary: { dateStart: "2026-01-01", dateEnd: "2026-12-31" },
  dashboardQuoteSummary: { start: "2026-01-01", end: "2026-12-31", dealer: null },
  networkCustomerSummary: { dealerCode: null, dateStart: "2026-01-01", dateEnd: "2026-12-31" },
  unassignedLeads: { asOf: "2026-08-27T00:00:00Z", defaultHours: 24 },
  hqAlerts: { asOf: "2026-08-27", unassignedDefaultHours: 24, leadIdleDays: 7, quoteValidityDays: 30, quoteExpiringDays: 7, dealerIdleDays: 14 },
  hqQuotationsSummary: { asOf: "2026-08-27" },
};
for (const k of Object.keys(keys)) await วัด(k, HQ, "ADMIN", "POST", "/api/v1/metrics?k=" + k, keys[k]);

console.log("");
const ช้า = ผล.filter(x => x.ms > 3000);
console.log("ช้ากว่า 3 วินาที: " + (ช้า.length ? ช้า.map(x => x.ชื่อ + " " + x.ms + "ms").join(" · ") : "ไม่มี"));
