import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
// @ts-expect-error — ไฟล์ .mjs ของสคริปต์ (ไม่มีชนิด)
import { บันทึกเมื่อผ่าน, ตรวจใบก่อนลง, ลายนิ้วมือใบ, ข้อความไม่ผ่าน } from "../../scripts/lib/migrationGate.mjs";

// ── ตัวบันทึก/ตรวจ "ใบปรับฐานผ่านรอบตรวจเต็ม" (บอสสั่ง 21 ต.ค. 69) — ปลายทางรวมทดสอบที่ tests/tools/db-push-prod-guard.test.mjs (G–H) ──
let tmp = "", dir = "", record = "";
beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), "pms-mgate-"));
  dir = path.join(tmp, "migrations"); mkdirSync(dir);
  record = path.join(tmp, "gate.json");
  writeFileSync(path.join(dir, "0001_a.sql"), "select 1;\n");
  writeFileSync(path.join(dir, "0002_b.sql"), "select 2;\n");
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

describe("บันทึกเมื่อผ่าน", () => {
  it("รอบตรวจมีข้อตก → ไม่บันทึก", () => {
    expect(บันทึกเมื่อผ่าน({ ตก: 1, ตัวตรวจ: 0, dir, record })).toBe(false);
    expect(existsSync(record)).toBe(false);
  });
  it("ตัวตรวจท้ายรอบไม่ผ่าน (ข้อไม่ได้รัน) → ไม่บันทึก", () => {
    expect(บันทึกเมื่อผ่าน({ ตก: 0, ตัวตรวจ: 1, dir, record })).toBe(false);
    expect(existsSync(record)).toBe(false);
  });
  it("ผ่านครบ → บันทึกทุกไฟล์ใบ", () => {
    expect(บันทึกเมื่อผ่าน({ ตก: 0, ตัวตรวจ: 0, dir, record })).toBe(true);
    expect(Object.keys(JSON.parse(readFileSync(record, "utf8")).ใบ)).toEqual(["0001_a.sql", "0002_b.sql"]);
    expect(ตรวจใบก่อนลง(dir, record)).toEqual({ ผ่าน: true, ไม่ผ่าน: [] });
  });
});

describe("ตรวจใบก่อนลง", () => {
  it("ใบใหม่ที่ไม่อยู่ในบันทึก → ไม่ผ่าน (ใหม่)", () => {
    บันทึกเมื่อผ่าน({ ตก: 0, ตัวตรวจ: 0, dir, record });
    writeFileSync(path.join(dir, "0003_c.sql"), "select 3;\n");
    const r = ตรวจใบก่อนลง(dir, record);
    expect(r.ผ่าน).toBe(false);
    expect(r.ไม่ผ่าน).toEqual([{ ใบ: "0003", ไฟล์: "0003_c.sql", เหตุ: "ใหม่" }]);
    expect(ข้อความไม่ผ่าน(r.ไม่ผ่าน)).toEqual(["ใบ 0003 ยังไม่ผ่านรอบตรวจเต็ม รอให้ผ่านก่อน"]);
  });
  it("แก้ใบหลังรอบตรวจผ่าน → ไม่ผ่าน (แก้หลังรอบตรวจ)", () => {
    บันทึกเมื่อผ่าน({ ตก: 0, ตัวตรวจ: 0, dir, record });
    writeFileSync(path.join(dir, "0002_b.sql"), "select 22;\n");
    expect(ตรวจใบก่อนลง(dir, record).ไม่ผ่าน).toEqual([{ ใบ: "0002", ไฟล์: "0002_b.sql", เหตุ: "แก้หลังรอบตรวจ" }]);
  });
  it("ไม่มีไฟล์บันทึกเลย → ทุกใบไม่ผ่าน", () => {
    expect(ตรวจใบก่อนลง(dir, record).ไม่ผ่าน.map((x: { ใบ: string }) => x.ใบ)).toEqual(["0001", "0002"]);
  });
  it("ขึ้นบรรทัดแบบ CRLF/LF เป็นไฟล์เดียวกัน (git ในเครื่องแปลงได้)", () => {
    บันทึกเมื่อผ่าน({ ตก: 0, ตัวตรวจ: 0, dir, record });
    writeFileSync(path.join(dir, "0001_a.sql"), "select 1;\r\n");
    expect(ตรวจใบก่อนลง(dir, record).ผ่าน).toBe(true);
    expect(ลายนิ้วมือใบ(dir)["0001_a.sql"]).toBe(JSON.parse(readFileSync(record, "utf8")).ใบ["0001_a.sql"]);
  });
});
