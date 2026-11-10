import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
// @ts-expect-error — ไฟล์ .mjs ของเครื่องมือ (ไม่มีชนิดข้อมูล)
import { แปลงข้อมูล, เริ่มบังคับ } from "../../scripts/check-migration-rehearsal.mjs";

// ── ตัวตรวจ check-migration-rehearsal (คนรวมงานเลือกทาง ข 10 พ.ย. 69) ─────────────────────────────────────────────
//   ใบใหม่ตั้งแต่ 0286 ที่แปลงข้อมูล ต้องมีข้อทดสอบที่เรียก ซ้อมใบ( และอ้างชื่อไฟล์ใบ · ใบเก่าไม่ย้อนบังคับ
//   ตกบนโค้ดเดิม: ไม่มีตัวตรวจ (ใบใหม่ที่แปลงข้อมูลไม่มีข้อทดสอบซ้อมก็ผ่าน)
describe("แปลงข้อมูล (ใบแปลงข้อมูลตอนลงไหม)", () => {
  it.each([
    ["update ระดับบนสุด (มีชื่อย่อ)", "create table t (a int);\nupdate leads l set a = 1 where l.a is null;", true],
    ["delete from", "delete from public.x where a = 1;", true],
    ["insert … select", "insert into x (a) select a from y;", true],
    ["with … update", "with s as (select 1 a) update x set a = s.a from s;", true],
    ["DO มี update", "do $$ begin update x set a = 1; end $$;", true],
    ["DO เรียกฟังก์ชันของใบ (แบบ 0261)", "create function public._fix() returns void language sql as $$ update x set a = 1 $$;\ndo $$ begin perform _fix(); end $$;", true],
    ["select เรียกฟังก์ชันของใบ", "create or replace function _fix() returns int language sql as $$ select 1 $$;\nselect _fix();", true],
    ["สร้างฟังก์ชันอย่างเดียว (update ในตัวฟังก์ชัน ไม่รันตอนลงใบ)", "create function f() returns void language sql as $$ update x set a = 1 $$;", false],
    ["insert … values (ข้อมูลตั้งต้นของตารางใหม่)", "create table t (a int);\ninsert into t values (1);", false],
    ["คอมเมนต์/ข้อความ", "-- update x set a = 1;\ncomment on table t is 'update x set a = 1';", false],
    ["select set_config (ไม่ใช่ฟังก์ชันของใบ)", "select set_config('a', 'b', false);", false],
  ])("%s", (_ชื่อ, sql, คาด) => { expect(แปลงข้อมูล(sql)).toBe(คาด); });
  it("ใบเก่าที่แปลงข้อมูลจริงถูกจับ (0250 · 0261 · 0284) · เริ่มบังคับ 0286", () => {
    for (const f of ["0250_lead_tasks_five_steps.sql", "0261_prospect_province_cleanup.sql", "0284_lead_stage_four.sql"])
      expect(แปลงข้อมูล(readFileSync(`supabase/migrations/${f}`, "utf8")), f).toBe(true);
    expect(เริ่มบังคับ).toBe(286);
  });
});

describe("check-migration-rehearsal (ตัวตรวจจริง · โฟลเดอร์จำลอง)", () => {
  const รัน = (ราก: string) => spawnSync(process.execPath, ["scripts/check-migration-rehearsal.mjs"], { encoding: "utf8",
    env: { ...process.env, PMS_MIGRATIONS_DIR: path.join(ราก, "mig"), PMS_TESTS_DIR: path.join(ราก, "tests") } });
  it("ใบใหม่แปลงข้อมูล ไม่มีข้อทดสอบซ้อม = ตก · มีแล้วผ่าน · ใบเก่า/ใบไม่แปลงข้อมูล ไม่บังคับ", () => {
    const ราก = mkdtempSync(path.join(tmpdir(), "pms-rehcheck-"));
    try {
      mkdirSync(path.join(ราก, "mig")); mkdirSync(path.join(ราก, "tests"));
      writeFileSync(path.join(ราก, "mig/0285_old.sql"), "update x set a = 1;");
      writeFileSync(path.join(ราก, "mig/0286_schema_only.sql"), "alter table x add column b int;");
      writeFileSync(path.join(ราก, "mig/0287_transform.sql"), "update leads l set a = 2;");
      let r = รัน(ราก);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain("0287_transform.sql");
      expect(r.stderr).not.toContain("0285_old.sql");
      expect(r.stderr).not.toContain("0286_schema_only.sql");
      writeFileSync(path.join(ราก, "tests/x.test.mjs"), "// อ้างชื่อแต่ไม่ได้ซ้อม 0287_transform.sql");
      expect(รัน(ราก).status, "อ้างชื่อเฉย ๆ ไม่นับ (ต้องเรียก ซ้อมใบ)").toBe(1);
      writeFileSync(path.join(ราก, "tests/x.test.mjs"), "ซ้อมใบ({ ใบ: \"0287_transform.sql\" });");
      r = รัน(ราก);
      expect(r.status, r.stderr).toBe(0);
    } finally { rmSync(ราก, { recursive: true, force: true }); }
  });
  it("ใบจริงทั้งหมดผ่าน", () => { const r = spawnSync(process.execPath, ["scripts/check-migration-rehearsal.mjs"], { encoding: "utf8" }); expect(r.status, r.stderr).toBe(0); });
});
