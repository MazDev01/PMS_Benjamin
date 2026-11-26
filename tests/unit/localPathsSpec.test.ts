import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import * as ฉบับspec from "../scenario/localPaths";
import * as ฉบับสคริปต์ from "../../scripts/lib/localPaths.mjs";   // ชนิดข้อมูลจาก localPaths.d.mts

// ── ตัวกลางที่อยู่ .local สองฉบับต้องให้ผลตรงกัน (26 พ.ย. 69) ────────────────────────────────────────────────
//   scripts/lib/localPaths.mjs = สคริปต์/เครื่องมือ (ESM แท้) · tests/scenario/localPaths.ts = spec ของ Playwright
//   (spec โหลด .mjs ไม่ได้ในรอบตรวจเต็ม deploy36) — ตารางย้ายต่างกันหรือกติกาเลือกที่อยู่ต่างกัน = รูปหน้าจอไปคนละที่กับเครื่องมือ
const ส = ฉบับสคริปต์;
const envเดิม = { PMS_LOCAL_ROOT: process.env.PMS_LOCAL_ROOT, PMS_LEGACY_ROOT: process.env.PMS_LEGACY_ROOT };
afterEach(() => { for (const [k, v] of Object.entries(envเดิม)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });

describe("localPaths: ฉบับ spec = ฉบับสคริปต์", () => {
  it("ตารางย้ายตรงกันทุกชื่อ", () => {
    expect({ ...ฉบับspec.ตารางย้าย }).toEqual({ ...ส.ตารางย้าย });
  });

  it("ที่อยู่ตรงกันทุกชื่อ ทุกสถานะ (ไม่มีทั้งคู่ · มีแต่ที่เดิม · มีที่ใหม่ · ไม่ดูที่เดิม · PMS_LOCAL_ROOT)", () => {
    const ที่ = mkdtempSync(path.join(tmpdir(), "localpaths-spec-"));
    try {
      const เดิม = path.join(ที่, "legacy"), ราก = path.join(ที่, "root");
      process.env.PMS_LEGACY_ROOT = เดิม;
      process.env.PMS_LOCAL_ROOT = path.join(ราก, ".local");
      const เทียบ = (ป้าย: string) => {
        for (const ชื่อ of Object.keys(ส.ตารางย้าย))
          expect(ฉบับspec.ที่ใน(ชื่อ, { cwd: ที่ }), `${ป้าย}: ${ชื่อ}`).toBe(ส.ที่ใน(ชื่อ, { cwd: ที่ }));
      };
      เทียบ("ไม่มีทั้งคู่");
      for (const [i, ชื่อ] of Object.keys(ส.ตารางย้าย).entries()) if (i % 2 === 0) mkdirSync(path.join(เดิม, ส.ตารางย้าย[ชื่อ]), { recursive: true });
      เทียบ("มีแต่ที่เดิมบางชื่อ");
      for (const [i, ชื่อ] of Object.keys(ส.ตารางย้าย).entries()) if (i % 4 === 0) mkdirSync(path.join(ราก, ".local", ชื่อ), { recursive: true });
      เทียบ("ย้ายแล้วบางชื่อ");
      expect(ฉบับspec.ที่ใน("shots", { cwd: ที่ })).toBe(`${path.join(ราก, ".local").replace(/\\/g, "/")}/shots`);   // ชื่อที่ 9 (index 8) อยู่ที่ใหม่
      process.env.PMS_LEGACY_ROOT = "-";
      เทียบ("ไม่ดูที่เดิม");
      delete process.env.PMS_LOCAL_ROOT;
      expect(ฉบับspec.รากLocal(ที่)).toBe(ส.รากLocal(ที่));
    } finally { rmSync(ที่, { recursive: true, force: true }); }
  });

  it("ชื่อที่ไม่รู้จัก = หยุดทั้งสองฉบับ", () => {
    expect(() => ฉบับspec.ที่ใน("ไม่มีชื่อนี้")).toThrow(/ไม่รู้จักชื่อ/);
    expect(() => ส.ที่ใน("ไม่มีชื่อนี้")).toThrow(/ไม่รู้จักชื่อ/);
  });
});
