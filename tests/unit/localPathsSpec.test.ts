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

  // prod-ops (ที่ CLI ผูกฐานจริง) อยู่นอก repo (บอสสั่ง 27 พ.ย. 69) — เดิมอยู่ .local/prod-ops แล้ว CLI เดินขึ้นไปเจอ supabase/config.toml ของ repo
  //   ตกบนโค้ดเดิม: prod-ops อยู่ในตารางย้าย · ที่ใน("prod-ops") = <repo>/.local/prod-ops · ที่อยู่ส่วนตัว("prod-ops") ไม่รู้จักชื่อ
  //   ค่าตั้งต้นตรงตัวของรากส่วนตัว ตรวจที่ tests/tools/private-outside-repo.test.mjs (ไฟล์ที่ยกเว้นข้อห้ามเขียนที่อยู่ตรง ๆ)
  it("prod-ops ชี้ที่ส่วนตัว (<รากส่วนตัว>/prod-ops · ค่าตั้งต้น pms-private) ไม่ใช่ใต้ repo · ไม่มีทางถอยไป .local", () => {
    const เดิม = process.env.PMS_PRIVATE_ROOT;
    try {
      delete process.env.PMS_PRIVATE_ROOT;
      expect("prod-ops" in ส.ตารางย้าย || "prod-ops" in ฉบับspec.ตารางย้าย, "prod-ops ไม่อยู่ในตารางย้าย .local ทั้งสองฉบับ").toBe(false);
      // ผู้เรียกเดิม (pre-push ฉบับก่อน · ที่ใน("prod-ops")) ได้ที่ส่วนตัว ไม่ใช่ .local · ฉบับ spec ไม่มีใครใช้ = ไม่รู้จักชื่อ
      expect(ส.ที่ใน("prod-ops")).toBe(ส.ที่อยู่ส่วนตัว("prod-ops"));
      expect(ส.ที่ใน("prod-ops")).not.toContain("/.local/");
      expect(() => ฉบับspec.ที่ใน("prod-ops")).toThrow(/ไม่รู้จักชื่อ/);
      const ที่ = ส.ที่อยู่ส่วนตัว("prod-ops");
      expect(ที่).toBe(`${ส.รากส่วนตัว()}/prod-ops`);
      expect(ที่.endsWith("/pms-private/prod-ops") || ที่.endsWith("/.pms-private/prod-ops"), `ค่าตั้งต้นอยู่ในรากส่วนตัว (${ที่})`).toBe(true);
      const rel = path.relative(path.resolve(ส.โฟลเดอร์หลัก()), path.resolve(ที่));
      expect(rel.startsWith("..") || path.isAbsolute(rel), `ไม่อยู่ใต้ repo (${rel})`).toBe(true);
      expect(ส.ห้ามเปิด).toEqual(expect.arrayContaining(["prod-ops", "pms-prod-ops"]));
      // ไม่เจอ = หยุด ไม่สร้างใหม่ · รากส่วนตัวใต้ repo = หยุด
      const ชั่วคราว = mkdtempSync(path.join(tmpdir(), "prodops-"));
      try {
        process.env.PMS_PRIVATE_ROOT = ชั่วคราว;
        expect(() => ส.ที่ส่วนตัว("prod-ops")).toThrow(/ไม่เจอโฟลเดอร์/);   // cwd = repo นี้ (โฟลเดอร์ชั่วคราวอยู่นอก repo)
        mkdirSync(path.join(ชั่วคราว, "prod-ops"));
        expect(ส.ที่ส่วนตัว("prod-ops")).toBe(`${ชั่วคราว.replace(/\\/g, "/")}/prod-ops`);
        process.env.PMS_PRIVATE_ROOT = path.join(ส.โฟลเดอร์หลัก(), ".local", "zz-ไม่มีจริง");
        expect(() => ส.ที่ส่วนตัว("prod-ops")).toThrow(/อยู่ใต้ repo/);
      } finally { rmSync(ชั่วคราว, { recursive: true, force: true }); }
    } finally { if (เดิม === undefined) delete process.env.PMS_PRIVATE_ROOT; else process.env.PMS_PRIVATE_ROOT = เดิม; }
  });

  it("ชื่อที่ไม่รู้จัก = หยุดทั้งสองฉบับ", () => {
    expect(() => ฉบับspec.ที่ใน("ไม่มีชื่อนี้")).toThrow(/ไม่รู้จักชื่อ/);
    expect(() => ส.ที่ใน("ไม่มีชื่อนี้")).toThrow(/ไม่รู้จักชื่อ/);
  });
});
