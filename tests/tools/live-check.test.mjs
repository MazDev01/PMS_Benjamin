// ── ข้อทดสอบ: ตัวตรวจหน้าหลักหลังขึ้นเว็บ (scripts/live-check.mjs · อ่านอย่างเดียว · โหมดเร็ว 12 พ.ย. 69) ─────────────────
// เว็บปลอมในเครื่อง (http 127.0.0.1 พอร์ตสุ่ม) — ไม่ยิงเว็บจริง
//   ก) ปกติ = ผ่าน · ข) health 503 / หน้าผิดพลาด / ยิงไม่ติด = ไม่ผ่าน บอกข้อ · ค) มีแต่ GET ไม่มีคุกกี้ (อ่านอย่างเดียวจริง)
// รัน: node tests/tools/live-check.test.mjs
import http from "node:http";
import { spawn } from "node:child_process";

let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n${เพิ่ม}`}`); };
const วิธีที่เห็น = new Set(); let มีคุกกี้ = false;
let แบบ = "ปกติ";
const เว็บ = http.createServer((req, res) => {
  วิธีที่เห็น.add(req.method); if (req.headers.cookie) มีคุกกี้ = true;
  if (req.url === "/api/health") {
    const ok = แบบ !== "health";
    res.writeHead(ok ? 200 : 503, { "content-type": "application/json" });
    return res.end(JSON.stringify({ status: ok ? "ok" : "degraded", checks: [{ name: "database", ok }] }));
  }
  if (req.url === "/" && แบบ === "พาไป") { res.writeHead(307, { location: "/login" }); return res.end(); }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(แบบ === "ผิดพลาด" && req.url === "/login" ? "<html><h2>Application error: a client-side exception has occurred</h2></html>" : "<html><body>เข้าสู่ระบบ<input type=\"password\"></body></html>");
});
await new Promise(r => เว็บ.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${เว็บ.address().port}`;
const รัน = (...a) => new Promise(res => {
  const c = spawn(process.execPath, ["scripts/live-check.mjs", "--hq", url, "--dealer", url, "--timeout", "3000", ...a], { stdio: ["ignore", "pipe", "pipe"] });
  let o = ""; c.stdout.on("data", d => o += d); c.stderr.on("data", d => o += d); c.on("exit", code => res({ code, o }));
});

try {
  แบบ = "ปกติ"; let r = await รัน();
  ผล(r.code === 0 && /ผ่านทั้ง 6 ข้อ/.test(r.o), "เว็บปกติ = ผ่าน 6 ข้อ", r.o);
  แบบ = "พาไป"; r = await รัน();
  ผล(r.code === 0, "หน้าแรกพาไปหน้าเข้าระบบในโดเมนเดียวกัน = ผ่าน", r.o);
  แบบ = "health"; r = await รัน();
  ผล(r.code === 1 && /✗ HQ \/api\/health/.test(r.o) && /503/.test(r.o), "health 503 = ไม่ผ่าน บอกข้อ", r.o);
  แบบ = "ผิดพลาด"; r = await รัน();
  ผล(r.code === 1 && /✗ หน้าเข้าระบบดีลเลอร์/.test(r.o) && /หน้าผิดพลาด/.test(r.o), "หน้าเข้าระบบเป็นหน้าผิดพลาด = ไม่ผ่าน", r.o);
  ผล([...วิธีที่เห็น].every(m => m === "GET") && !มีคุกกี้, "ทุกคำขอเป็น GET ไม่มีคุกกี้ (อ่านอย่างเดียว)", [...วิธีที่เห็น].join(","));
  await new Promise(r2 => เว็บ.close(r2));
  r = await รัน();
  ผล(r.code === 1 && /✗/.test(r.o), "ยิงไม่ติด = ไม่ผ่าน (ไม่ค้าง)", r.o);
} catch (e) {
  ผล(false, "ข้อทดสอบรันจบ", e.stack);
}
console.log(ตก ? `ตก ${ตก}` : "ALL PASS");   // ตัวรันชุดเครื่องมือ (tool-suites-tool.spec.ts) จับคำนี้
process.exit(ตก ? 1 : 0);
