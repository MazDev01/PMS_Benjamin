import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
// @ts-expect-error — ไฟล์ .mjs ของเครื่องมือ (ไม่มีชนิดข้อมูล)
import { setLocalระดับบน } from "../../scripts/lib/sqlSetLocal.mjs";

// ── ตัวตรวจ check-migration-set-local (คนรวมงานแจ้ง 10 พ.ย. 69 · db push ใบ 0284 ขึ้น WARNING SET LOCAL นอก transaction)
//   ตกบนโค้ดเดิม: ไม่มี scripts/lib/sqlSetLocal.mjs / ตัวตรวจ · ใบใหม่ที่มี set local ระดับบนสุดผ่านเงียบ
const บรรทัด = (sql: string) => (setLocalระดับบน(sql) as { line: number }[]).map(x => x.line);

describe("setLocalระดับบน", () => {
  it("SET LOCAL ระดับบนสุดถูกจับ (ตัวเล็ก/ใหญ่ · หลายบรรทัด)", () => {
    expect(บรรทัด("update a set x = 1;\nset local session_replication_role = replica;\nupdate b set y = 2;\nSET  LOCAL session_replication_role = origin;\n")).toEqual([2, 4]);
  });
  it("ใน DO $$ / ตัวฟังก์ชัน $fn$ / คอมเมนต์ / ข้อความ ไม่นับ", () => {
    const sql = [
      "do $$ begin set local session_replication_role = replica; end $$;",
      "create function f() returns void language plpgsql as $fn$ begin set local x = 1; end $fn$;",
      "-- set local ในคอมเมนต์",
      "/* set local\n ในคอมเมนต์ยาว */",
      "select 'set local ในข้อความ';",
      "comment on table t is E'set local \' ยังเป็นข้อความ';",
    ].join("\n");
    expect(บรรทัด(sql)).toEqual([]);
  });
  it("ชื่อที่ลงท้ายคล้ายกันไม่นับ (reset local / offset local)", () => {
    expect(บรรทัด("select 1 as offset_local;\nreset local_x;\n")).toEqual([]);
  });
  it("วิธีที่แนะนำ (set_config ใน DO) ผ่าน", () => {
    expect(บรรทัด("do $$ begin perform set_config('session_replication_role', 'replica', true); update t set a = 1; end $$;")).toEqual([]);
  });
});

describe("check-migration-set-local (ตัวตรวจจริง · โฟลเดอร์จำลอง)", () => {
  const รัน = (dir: string) => spawnSync(process.execPath, ["scripts/check-migration-set-local.mjs"], { encoding: "utf8", env: { ...process.env, PMS_MIGRATIONS_DIR: dir } });
  it("ใบใหม่มี SET LOCAL ระดับบนสุด = ตก บอกไฟล์:บรรทัด · ใบเก่าที่ยกเว้นผ่าน", () => {
    const d = mkdtempSync(path.join(tmpdir(), "pms-setlocal-"));
    try {
      copyFileSync("supabase/migrations/0284_lead_stage_four.sql", path.join(d, "0284_lead_stage_four.sql"));
      let r = รัน(d);
      expect(r.status, r.stderr).toBe(0);
      writeFileSync(path.join(d, "0999_new.sql"), "update t set a = 1;\nset local session_replication_role = replica;\n");
      r = รัน(d);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain("0999_new.sql:2");
      expect(r.stderr).not.toContain("0284_lead_stage_four.sql");
    } finally { rmSync(d, { recursive: true, force: true }); }
  });
  it("ใบจริงทั้งหมดผ่าน (มีแต่ใบเก่าที่ยกเว้น)", () => {
    const r = รัน("supabase/migrations");
    expect(r.status, r.stderr).toBe(0);
  });
});
