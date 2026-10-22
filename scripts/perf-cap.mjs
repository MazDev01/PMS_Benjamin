// ตรวจว่าเพดาน "ดึงทั้งเครือทีเดียว" ทำงาน (เดิม 29 วินาที 12MB)
import { readFileSync } from "node:fs";
import { ต้นทาง as ต้นทางเว็บ } from "./lib/session.mjs";
const เว็บ = ต้นทางเว็บ("dev");   // ที่อยู่เว็บในเครื่องของโฟลเดอร์นี้ — ห้ามเขียนพอร์ตเอง (check-hardcoded-ports)
const env = (f) => { const m = new Map(); for (const line of readFileSync(f, "utf8").split(String.fromCharCode(10))) { const t = line.trim(); if (!t || t.startsWith("#")) continue; const i = t.indexOf("="); if (i > 0) m.set(t.slice(0, i).trim(), t.slice(i + 1).trim()); } return m; };
const T = env("tests/.env.test");
const HQ = เว็บ.hq;
const r = await fetch(HQ + "/api/v1/auth?op=login", { method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: T.get("TEST_ADMIN_EMAIL"), password: T.get("TEST_ADMIN_PASSWORD") }) });
const cookie = (r.headers.getSetCookie?.() ?? []).map(c => c.split(";")[0]).join("; ");
for (const p of ["/api/v1/leads?hq=1", "/api/v1/quotations?hq=1"]) {
  const t0 = Date.now();
  const res = await fetch(HQ + p, { headers: { cookie } });
  const text = await res.text();
  const j = JSON.parse(text);
  console.log("  " + p.padEnd(28) + String(Date.now() - t0).padStart(6) + "ms  " + (text.length / 1024 / 1024).toFixed(1) + "MB  แถว " +
    (j.rows?.length ?? "-") + "  ข้อมูลไม่ครบ=" + j.partial);
}
