// ตรวจไฟล์แนบ: สาขาอื่นดึงไฟล์ของสาขาเราได้ไหม (IDOR) + อัปโหลดข้ามสาขาได้ไหม
import { readFileSync } from "node:fs";
import { ต้นทาง as ต้นทางเว็บ } from "./lib/session.mjs";
const เว็บ = ต้นทางเว็บ("dev");   // ที่อยู่เว็บในเครื่องของโฟลเดอร์นี้ — ห้ามเขียนพอร์ตเอง (check-hardcoded-ports)
const env = (f) => { const m = new Map(); for (const line of readFileSync(f, "utf8").split(String.fromCharCode(10))) { const t = line.trim(); if (!t || t.startsWith("#")) continue; const i = t.indexOf("="); if (i > 0) m.set(t.slice(0, i).trim(), t.slice(i + 1).trim()); } return m; };
const T = env("tests/.env.test");
const D = เว็บ.dealer;
const jar = {};
async function login(who, acc) {
  const r = await fetch(D + "/api/v1/auth?op=login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(acc) });
  jar[who] = (r.headers.getSetCookie?.() ?? []).map(c => c.split(";")[0]).join("; ");
  return r.status;
}
console.log("login RYG " + await login("RYG", { email: T.get("TEST_RYG_EMAIL"), password: T.get("TEST_RYG_PASSWORD") }) +
  " · CNX " + await login("CNX", { email: T.get("TEST_CNX_EMAIL"), password: T.get("TEST_CNX_PASSWORD") }));

const ส่งไฟล์ = async (who, dealerCode) => {
  const fd = new FormData();
  fd.set("dealerCode", dealerCode);
  fd.set("stamp", String(990000000 + Math.floor(Math.random() * 1000)));
  fd.set("file", new File(["ความลับของสาขา " + dealerCode], "secret.pdf", { type: "application/pdf" }));
  const r = await fetch(D + "/api/v1/storage", { method: "POST", headers: { cookie: jar[who] }, body: fd });
  return { s: r.status, t: (await r.text()).slice(0, 120) };
};

console.log("");
console.log("=== 1) อัปโหลดไฟล์เข้าสาขาตัวเอง (.pdf) ===");
const up = await ส่งไฟล์("RYG", "RYG");
console.log("  RYG อัปโหลดเข้าโฟลเดอร์ RYG → " + up.s + " " + up.t);
const path = up.s === 200 ? JSON.parse(up.t) : null;

console.log("");
console.log("=== 2) อัปโหลดไฟล์ยัดเข้าโฟลเดอร์ของสาขาอื่น ===");
const up2 = await ส่งไฟล์("CNX", "RYG");
console.log("  CNX อัปโหลดเข้าโฟลเดอร์ RYG → " + up2.s + " " + up2.t + (up2.s === 200 ? "   ⚠️ ยัดไฟล์ข้ามสาขาได้" : ""));

if (path) {
  console.log("");
  console.log("=== 3) สาขาอื่นขอลิงก์ดาวน์โหลดไฟล์ของเรา (IDOR) ===");
  const q = "?path=" + encodeURIComponent(path);
  for (const who of ["RYG", "CNX"]) {
    const r = await fetch(D + "/api/v1/storage" + q, { headers: { cookie: jar[who] } });
    const t = (await r.text()).slice(0, 100);
    console.log("  " + who.padEnd(4) + " ขอลิงก์ → " + r.status + " " + (t.includes("token") ? "ได้ลิงก์" : t));
  }
  const ไม่มีใบผ่าน = await fetch(D + "/api/v1/storage" + q);
  console.log("  ไม่มีใบผ่าน ขอลิงก์ → " + ไม่มีใบผ่าน.status);

  console.log("");
  console.log("=== 4) สาขาอื่นสั่งลบไฟล์ของเรา ===");
  const del = await fetch(D + "/api/v1/storage" + q, { method: "DELETE", headers: { cookie: jar["CNX"] } });
  console.log("  CNX สั่งลบ → " + del.status + " " + (await del.text()).slice(0, 90));
  const ยังอยู่ = await fetch(D + "/api/v1/storage" + q, { headers: { cookie: jar["RYG"] } });
  const tt = (await ยังอยู่.text()).slice(0, 60);
  console.log("  ไฟล์ยังอยู่ไหม (ถาม RYG) → " + ยังอยู่.status + " " + (tt.includes("token") ? "ยังอยู่" : tt));

  // เก็บกวาด
  await fetch(D + "/api/v1/storage" + q, { method: "DELETE", headers: { cookie: jar["RYG"] } });
  console.log("  (ลบไฟล์ทดสอบเรียบร้อย)");
}

console.log("");
console.log("=== 5) อัปโหลดชนิดไฟล์ที่ไม่รองรับ ===");
const fd = new FormData();
fd.set("dealerCode", "RYG"); fd.set("stamp", "990000999");
fd.set("file", new File(["x"], "virus.exe", { type: "application/octet-stream" }));
const bad = await fetch(D + "/api/v1/storage", { method: "POST", headers: { cookie: jar["RYG"] }, body: fd });
console.log("  RYG อัปโหลด .exe → " + bad.status + " " + (await bad.text()).slice(0, 130));
