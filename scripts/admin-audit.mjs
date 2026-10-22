// ตรวจเส้นทางผู้ดูแลระบบ (/api/admin/*) ว่าคนที่ไม่ควรเข้าถึง เข้าไม่ได้จริง
import { readFileSync } from "node:fs";
import { ต้นทาง as ต้นทางเว็บ } from "./lib/session.mjs";
const เว็บ = ต้นทางเว็บ("dev");   // ที่อยู่เว็บในเครื่องของโฟลเดอร์นี้ — ห้ามเขียนพอร์ตเอง (check-hardcoded-ports)
const env = (f) => { const m = new Map(); for (const line of readFileSync(f, "utf8").split(String.fromCharCode(10))) { const t = line.trim(); if (!t || t.startsWith("#")) continue; const i = t.indexOf("="); if (i > 0) m.set(t.slice(0, i).trim(), t.slice(i + 1).trim()); } return m; };
const T = env("tests/.env.test");
const HQ = เว็บ.hq;
const jar = {};
async function login(who, acc) {
  const r = await fetch(HQ + "/api/v1/auth?op=login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(acc) });
  jar[who] = (r.headers.getSetCookie?.() ?? []).map(c => c.split(";")[0]).join("; ");
  return r.status;
}
console.log("login ADMIN " + await login("ADMIN", { email: T.get("TEST_ADMIN_EMAIL"), password: T.get("TEST_ADMIN_PASSWORD") }));
console.log("login RYG   " + await login("RYG", { email: T.get("TEST_RYG_EMAIL"), password: T.get("TEST_RYG_PASSWORD") }));

// ⚠️ ส่งข้อมูลที่ "ไม่ถูกต้องโดยตั้งใจ" เสมอ — ถ้าด่านสิทธิ์พังจะได้ไม่มีอะไรถูกสร้างจริง
const เคส = [
  ["POST",   "/api/admin/dealers",             { code: "", name: "" }],
  ["POST",   "/api/admin/dealers/impersonate", { code: "" }],
  ["POST",   "/api/admin/dealers/secret",      { code: "" }],
  ["POST",   "/api/admin/dealers/logins",      { code: "" }],
  ["POST",   "/api/admin/dealers/move",        { from: "", to: "" }],
  ["POST",   "/api/admin/users",               { email: "", name: "" }],
  ["POST",   "/api/admin/audit/clear",         {}],
  ["DELETE", "/api/admin/dealers?code=ZZNOPE", undefined],
];
console.log("");
console.log("ใคร      เมธอด  เส้นทาง                                 สถานะ  คำตอบ");
for (const [method, path, body] of เคส) {
  for (const who of ["ไม่มีใบผ่าน", "RYG", "ADMIN"]) {
    const h = {}; if (who !== "ไม่มีใบผ่าน") h.cookie = jar[who] ?? "";
    if (body !== undefined) h["content-type"] = "application/json";
    const r = await fetch(HQ + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    const t = (await r.text()).slice(0, 70).split(String.fromCharCode(10)).join(" ");
    console.log(who.padEnd(12) + method.padEnd(7) + path.padEnd(40) + String(r.status).padEnd(6) + t);
  }
  console.log("");
}
