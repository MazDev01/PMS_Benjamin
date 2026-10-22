// ตรวจเจาะจุดที่พบปัญหาจากรอบแรก + ทดสอบข้ามสาขาแบบเขียน + วัดเวลา
import { readFileSync } from "node:fs";
import { ต้นทาง as ต้นทางเว็บ } from "./lib/session.mjs";
const เว็บ = ต้นทางเว็บ("dev");   // ที่อยู่เว็บในเครื่องของโฟลเดอร์นี้ — ห้ามเขียนพอร์ตเอง (check-hardcoded-ports)
const env = (f) => { const m = new Map(); for (const line of readFileSync(f, "utf8").split(String.fromCharCode(10))) { const t = line.trim(); if (!t || t.startsWith("#")) continue; const i = t.indexOf("="); if (i > 0) m.set(t.slice(0, i).trim(), t.slice(i + 1).trim()); } return m; };
const T = env("tests/.env.test");
const ACC = { RYG: { email: T.get("TEST_RYG_EMAIL"), password: T.get("TEST_RYG_PASSWORD") },
              CNX: { email: T.get("TEST_CNX_EMAIL"), password: T.get("TEST_CNX_PASSWORD") },
              ADMIN: { email: T.get("TEST_ADMIN_EMAIL"), password: T.get("TEST_ADMIN_PASSWORD") } };
const DEALER = เว็บ.dealer, HQ = เว็บ.hq;
const jar = {};
async function login(who, origin) {
  const r = await fetch(origin + "/api/v1/auth?op=login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(ACC[who]) });
  jar[who + origin] = (r.headers.getSetCookie?.() ?? []).map(c => c.split(";")[0]).join("; ");
  return r.status;
}
async function req(origin, who, method, path, body) {
  const h = {}; if (jar[who + origin]) h.cookie = jar[who + origin]; if (body !== undefined) h["content-type"] = "application/json";
  const t0 = Date.now();
  const r = await fetch(origin + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  return { status: r.status, text, ms: Date.now() - t0 };
}
console.log("login RYG " + await login("RYG", DEALER) + " / CNX " + await login("CNX", DEALER) + " / ADMIN " + await login("ADMIN", HQ));

console.log("");
console.log("=== 1) ดีลเลอร์ขอข้อมูลทั้งเครือ (hq=1) หลุดข้ามสาขาไหม ===");
for (const res of ["leads", "quotations", "customers", "appointments"]) {
  const r = await req(DEALER, "RYG", "GET", "/api/v1/" + res + "?hq=1");
  let codes = [];
  try { const j = JSON.parse(r.text); const rows = j.rows ?? j; codes = [...new Set(rows.map(x => x.dealerCode))]; } catch { codes = ["parse ไม่ได้"]; }
  console.log("  " + res.padEnd(13) + " status " + r.status + " · สาขาที่หลุดออกมา: " + JSON.stringify(codes));
}
const admin = await req(HQ, "ADMIN", "GET", "/api/v1/leads?hq=1");
try { const j = JSON.parse(admin.text); const rows = j.rows ?? j; console.log("  (เทียบ) ADMIN เห็น " + [...new Set(rows.map(x => x.dealerCode))].length + " สาขา · " + rows.length + " แถว"); } catch { console.log("  ADMIN parse ไม่ได้"); }

console.log("");
console.log("=== 2) ดีลเลอร์เขียนข้ามสาขา ===");
const cnxLead = await req(DEALER, "CNX", "GET", "/api/v1/leads?dealer=CNX");
let target = null; try { const j = JSON.parse(cnxLead.text); target = (j.rows ?? j)[0]; } catch {}
if (!target) console.log("  ข้าม — สาขา CNX ไม่มีลีดให้ทดสอบ");
else {
  console.log("  เป้าหมาย: ลีดของ CNX id=" + target.id);
  const w1 = await req(DEALER, "RYG", "PUT", "/api/v1/leads", { ...target, company: "ถูกแก้โดยสาขาอื่น" });
  console.log("  RYG แก้ลีดของ CNX → " + w1.status + " " + w1.text.slice(0, 120));
  const w2 = await req(DEALER, "RYG", "DELETE", "/api/v1/leads?id=" + encodeURIComponent(target.id));
  console.log("  RYG ลบลีดของ CNX → " + w2.status + " " + w2.text.slice(0, 120));
  const after = await req(DEALER, "CNX", "GET", "/api/v1/leads?dealer=CNX");
  let still = null; try { const j = JSON.parse(after.text); still = (j.rows ?? j).find(x => x.id === target.id); } catch {}
  console.log("  ผลจริง: ลีดยังอยู่ไหม = " + (still ? "อยู่ ชื่อ=" + still.company : "หายไปแล้ว (อันตราย)"));
}

console.log("");
console.log("=== 3) ค่าตั้งระบบทุกคีย์ ===");
for (const k of ["policy", "targets", "notifRules", "journey", "leadRules"]) {
  const r = await req(DEALER, "RYG", "GET", "/api/v1/settings?k=" + k);
  console.log("  k=" + k.padEnd(11) + " → " + r.status + " " + r.text.slice(0, 90));
}
const w = await req(DEALER, "RYG", "PUT", "/api/v1/settings?k=policy", { quoteValidityDays: 1 });
console.log("  ดีลเลอร์แก้ค่าตั้งระบบ (policy) → " + w.status + " " + w.text.slice(0, 140));
const chk = await req(HQ, "ADMIN", "GET", "/api/v1/settings?k=policy");
console.log("  ค่าจริงหลังจากนั้น: " + chk.text.slice(0, 140));
