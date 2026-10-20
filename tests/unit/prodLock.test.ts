import { describe, it, expect } from "vitest";
import { spawnSync, spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// ── ตัวล็อกงานที่แตะฐานจริง (scripts/lib/prodLock.mjs · บอสสั่ง 20 ต.ค. 69) ─────────────────────────────────────
//   รันในโปรเซสลูก เพราะตัวล็อกปิดโปรเซสเองเมื่อมีงานอื่นถือล็อกอยู่
const ลูก = (lock: string, env: Record<string, string> = {}) => spawnSync(process.execPath, ["--input-type=module", "-e",
  `import { ขอล็อก } from "./scripts/lib/prodLock.mjs"; const l = ขอล็อก("งานทดสอบ"); console.log("ได้ล็อก", l.token); l.release();`],
  { env: { ...process.env, PMS_PROD_LOCK: lock, PMS_PROD_LOCK_HELD: "", ...env }, encoding: "utf8" });

describe("prodLock", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "pms-lock-"));

  it("ไม่มีใครถือ → ได้ล็อก และปล่อยแล้วไฟล์หาย", () => {
    const lock = path.join(dir, "a.lock");
    const r = ลูก(lock);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("ได้ล็อก");
    expect(existsSync(lock)).toBe(false);
  });

  it("โปรเซสอื่นที่ยังทำงานถือล็อก → หยุด exit 3 บอกชื่องาน · ไม่ลบล็อกของเขา", () => {
    const lock = path.join(dir, "b.lock");
    const ค้าง = spawn(process.execPath, ["-e", "setTimeout(()=>{}, 60000)"], { stdio: "ignore" });
    writeFileSync(lock, JSON.stringify({ token: "ของเขา", pid: ค้าง.pid, งาน: "db:push:prod", เริ่ม: new Date().toISOString() }));
    const r = ลูก(lock);
    ค้าง.kill();
    expect(r.status).toBe(3);
    expect(r.stderr).toContain("มีงานอื่นกำลังแตะฐานจริงอยู่");
    expect(r.stderr).toContain("db:push:prod");
    expect(JSON.parse(readFileSync(lock, "utf8")).token).toBe("ของเขา");
  });

  it("ล็อกค้างของโปรเซสที่ตายแล้ว → เก็บกวาดแล้วได้ล็อก", () => {
    const lock = path.join(dir, "c.lock");
    const ตาย = spawnSync(process.execPath, ["-e", "console.log(process.pid)"], { encoding: "utf8" });
    writeFileSync(lock, JSON.stringify({ token: "ค้าง", pid: Number(ตาย.stdout.trim()), งาน: "สำรองฐานจริง + ซ้อมกู้", เริ่ม: "2026-10-20T02:32:00Z" }));
    const r = ลูก(lock);
    expect(r.status).toBe(0);
    expect(r.stderr).toContain("พบล็อกค้าง");
    expect(existsSync(lock)).toBe(false);
  });

  it("ตัวลูกของงานที่ถือล็อกอยู่ (PMS_PROD_LOCK_HELD ตรง) → ไม่ล็อกซ้ำ ไม่ลบล็อกของแม่", () => {
    const lock = path.join(dir, "d.lock");
    writeFileSync(lock, JSON.stringify({ token: "แม่", pid: process.pid, งาน: "db:push:prod", เริ่ม: new Date().toISOString() }));
    const r = ลูก(lock, { PMS_PROD_LOCK_HELD: "แม่" });
    expect(r.status).toBe(0);
    expect(JSON.parse(readFileSync(lock, "utf8")).token).toBe("แม่");
  });
});
