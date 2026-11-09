import { describe, it, expect } from "vitest";
import { readFileSync, mkdtempSync, writeFileSync, rmSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
// @ts-expect-error — ไฟล์ .mjs ของเครื่องมือ (ไม่มีชนิดข้อมูล)
import { ข้อความหลายบรรทัด } from "../../scripts/lib/sqlMultilineStrings.mjs";

// ── ตัวตรวจ check-migration-multiline-strings (คนรวมงานขอ 9 พ.ย. 69 · ต้นเหตุ dealer_display_name ตกในโฟลเดอร์ checkout ใหม่) ──
//   ตกบนโค้ดเดิม: ใบ 0281 (ไม่ยกเว้น) ถูกจับ 5 จุด · ตัวตรวจจริงตกเมื่อมีใบใหม่ที่ขึ้นบรรทัดด้วย Enter
const ตรวจ = (sql: string) => (ข้อความหลายบรรทัด(sql) as { line: number }[]).map(x => x.line);

describe("หาข้อความหลายบรรทัดใน SQL", () => {
  it("จับ '…' และ E'…' ที่มี Enter ข้างใน รวมในตัวฟังก์ชัน $$ · ไม่จับคอมเมนต์ / E'\\n' / JSON หลายบรรทัด", () => {
    const sql = [
      "-- คอมเมนต์ 'มี",
      "ไม่ใช่สตริง",
      "create function f() returns text language sql as $f$",
      "  select 'บรรทัดแรก' || E'\\n' || 'บรรทัดสอง'",       // ไม่จับ (E'\n')
      "  || E'ขึ้น",                                            // จับ (บรรทัด 5)
      "บรรทัด';",
      "$f$;",
      "/* 'ไม่นับ",
      "*/ select '[",                                            // JSON หลายบรรทัด ไม่จับ
      "  {\"k\": 1}",
      "]'::jsonb, 'it''s",                                       // จับ (บรรทัด 11 · '' = ')
      "ok';",
    ].join("\n");
    expect(ตรวจ(sql)).toEqual([5, 11]);
    expect(ตรวจ(sql.replace(/\n/g, "\r\n")), "ไฟล์ CRLF ได้ผลเดียวกัน").toEqual([5, 11]);
  });
  it("ใบ 0281 (อีเมลถึง HQ แบบเดิม) ถูกจับ 5 จุด · ใบ 0285 ไม่มี", () => {
    expect(ตรวจ(readFileSync("supabase/migrations/0281_dealer_display_name.sql", "utf8"))).toHaveLength(5);
    expect(ตรวจ(readFileSync("supabase/migrations/0285_ui_terms_db_texts.sql", "utf8"))).toEqual([]);
  });
  it("ตัวตรวจทั้งโฟลเดอร์: ใบใหม่ที่ขึ้นบรรทัดด้วย Enter = ตก · โฟลเดอร์จริง = ผ่าน", () => {
    const ที่ = mkdtempSync(path.join(tmpdir(), "pms-mls-"));
    try {
      copyFileSync("supabase/migrations/0281_dealer_display_name.sql", path.join(ที่, "0281_dealer_display_name.sql"));
      writeFileSync(path.join(ที่, "9999_bad.sql"), "select 'ก\r\nข';\n");
      const ตก = spawnSync(process.execPath, ["scripts/check-migration-multiline-strings.mjs"], { env: { ...process.env, PMS_MIGRATIONS_DIR: ที่ }, encoding: "utf8" });
      expect(ตก.status, ตก.stderr).toBe(1);
      expect(ตก.stderr).toContain("9999_bad.sql:1");
      const ผ่าน = spawnSync(process.execPath, ["scripts/check-migration-multiline-strings.mjs"], { encoding: "utf8" });
      expect(ผ่าน.status, ผ่าน.stderr).toBe(0);
    } finally { rmSync(ที่, { recursive: true, force: true }); }
  });
});
