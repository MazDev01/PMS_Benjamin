// วัดผลของ "นับยอดรวมครั้งเดียวแล้วใช้ซ้ำ" — เทียบคำขอหน้าแรก (ต้องนับ) กับหน้าถัดไป (ไม่ต้องนับ)
import { readFileSync } from "node:fs";
import { ต้นทาง as ต้นทางเว็บ } from "./lib/session.mjs";
const เว็บ = ต้นทางเว็บ("dev");   // ที่อยู่เว็บในเครื่องของโฟลเดอร์นี้ — ห้ามเขียนพอร์ตเอง (check-hardcoded-ports)
const env = (f) => { const m = new Map(); for (const line of readFileSync(f, "utf8").split(String.fromCharCode(10))) { const t = line.trim(); if (!t || t.startsWith("#")) continue; const i = t.indexOf("="); if (i > 0) m.set(t.slice(0, i).trim(), t.slice(i + 1).trim()); } return m; };
const T = env("tests/.env.test");
const HQ = เว็บ.hq;
const r = await fetch(HQ + "/api/v1/auth?op=login", { method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: T.get("TEST_ADMIN_EMAIL"), password: T.get("TEST_ADMIN_PASSWORD") }) });
const cookie = (r.headers.getSetCookie?.() ?? []).map(c => c.split(";")[0]).join("; ");
const ยิง = async (path, body) => {
  const t0 = Date.now();
  const res = await fetch(HQ + path, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await res.json();
  return { ms: Date.now() - t0, total: j.total, rows: (j.rows ?? []).length, status: res.status };
};
const โชว์ = (ป้าย, x) => console.log("  " + ป้าย.padEnd(46) + String(x.ms).padStart(6) + "ms   ยอดรวม " + String(x.total).padEnd(8) + " แถว " + x.rows);

for (const [ชื่อ, path] of [["ใบเสนอราคา", "/api/v1/quotations?op=page&hq=1"], ["ลูกค้า", "/api/v1/customers?op=page&hq=1"], ["ลูกค้าเป้าหมาย", "/api/v1/leads?op=page"]]) {
  console.log("");
  console.log("=== " + ชื่อ + " ===");
  โชว์("หน้า 1 (ยังไม่รู้ยอดรวม ต้องนับ)", await ยิง(path, { limit: 20, offset: 0 }));
  โชว์("หน้า 2 (รู้ยอดรวมแล้ว ข้ามการนับ)", await ยิง(path, { limit: 20, offset: 20, knownTotal: 999999 }));
  โชว์("หน้า 3 (ข้ามการนับ)", await ยิง(path, { limit: 20, offset: 40, knownTotal: 999999 }));
}
