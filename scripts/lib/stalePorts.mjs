// ── ตอนเริ่มรอบตรวจเต็ม: ปิดโปรเซสที่ค้างบนพอร์ตของเซสชันตัวเองอัตโนมัติ (บอสสั่ง 29 ต.ค. 69 · คิวข้อ 1) ──────────────────
//
// เหตุ: รอบที่ถูกหยุดกลางทาง (ปิดหน้าต่าง · ฆ่าตัวรัน) ทิ้ง next start ค้างบนพอร์ตทดสอบ → รอบถัดไปหยุดที่ "พอร์ตถูกใช้อยู่" ต้องมาปิดเอง
// ปิดเฉพาะพอร์ตที่ส่งมา = พอร์ตทดสอบของเซสชันนี้ (scripts/lib/session.mjs · ทะเบียนพอร์ตแยกต่อเซสชัน) — ไม่แตะพอร์ตของเซสชันอื่น
//   ตัวรันรอบตรวจถือล็อกฐานทดสอบก่อนถึงขั้นนี้ → รอบตรวจอื่นของเซสชันเดียวกันที่ยังรันอยู่จริงไม่มี (รอคิวอยู่) · ที่ฟังพอร์ตอยู่ = ของค้าง
// ข้อทดสอบ: tests/tools/stale-ports.test.mjs
import { spawnSync } from "node:child_process";

/** pid ที่ฟังพอร์ตนี้อยู่ (TCP LISTEN) */
export function ผู้ฟังพอร์ต(port) {
  if (process.platform === "win32") {
    const r = spawnSync("netstat", ["-ano", "-p", "TCP"], { encoding: "utf8" });
    return [...new Set((r.stdout ?? "").split(/\r?\n/)
      .map(l => l.trim().split(/\s+/))
      .filter(c => c.length >= 5 && /LISTENING/i.test(c[3]) && new RegExp(`[:.]${port}$`).test(c[1]))
      .map(c => Number(c[4])).filter(p => p > 0))];
  }
  const r = spawnSync("lsof", ["-ti", `tcp:${port}`, "-sTCP:LISTEN"], { encoding: "utf8" });
  return [...new Set((r.stdout ?? "").split(/\s+/).map(Number).filter(p => p > 0))];
}

/** ปิดโปรเซสที่ฟังพอร์ตเหล่านี้ (ทั้งต้นโปรเซส) · คืน [{ port, pid }] ที่ปิด · ไม่ปิดตัวเอง */
export function ปิดของค้างบนพอร์ต(ports, { log = console.log } = {}) {
  const ปิด = [];
  for (const port of ports) {
    for (const pid of ผู้ฟังพอร์ต(port)) {
      if (pid === process.pid) continue;
      if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
      else { try { process.kill(pid, "SIGKILL"); } catch { /* ปิดไปแล้ว */ } }
      ปิด.push({ port, pid });
      log(`▶ ปิดโปรเซสที่ค้างบนพอร์ต ${port} ของเซสชันนี้ (pid ${pid}) — ของรอบก่อนที่ถูกหยุดกลางทาง`);
    }
  }
  return ปิด;
}
