// อาร์กิวเมนต์ psql ของฐานทดสอบมี 2 ตัวที่ต้องตรงกัน: testDbPsql.mjs (ข้อทดสอบ TypeScript) · testDbGuard.mjs (สคริปต์/ตัวล็อก)
//   แยกกันเพราะตัวรัน playwright โหลดไฟล์ที่ TypeScript ดึงไปแบบ CommonJS แล้ว ESM แท้ดึงชื่อส่งออกจากไฟล์นั้นไม่ได้ (26 ต.ค. 69)
import { describe, it, expect } from "vitest";
import { psqlArgs, TESTDB_CONTAINER } from "../../scripts/lib/testDbPsql.mjs";
import { อาร์กิวเมนต์psql, คอนเทนเนอร์ } from "../../scripts/lib/testDbGuard.mjs";

describe("อาร์กิวเมนต์ psql ของฐานทดสอบ 2 ตัวตรงกัน", () => {
  it("คอนเทนเนอร์ · เขียน (มี/ไม่มีกุญแจ) · อ่าน · คอนเทนเนอร์อื่น", () => {
    expect(TESTDB_CONTAINER).toBe(คอนเทนเนอร์);
    const เดิม = process.env.PMS_TESTDB_PG_PASSWORD;
    try {
      delete process.env.PMS_TESTDB_PG_PASSWORD;
      expect(() => psqlArgs(คอนเทนเนอร์)).toThrow(/ถือล็อก/);
      expect(() => อาร์กิวเมนต์psql(คอนเทนเนอร์)).toThrow(/ถือล็อก/);
      process.env.PMS_TESTDB_PG_PASSWORD = "k";
      expect(psqlArgs(คอนเทนเนอร์)).toEqual(อาร์กิวเมนต์psql(คอนเทนเนอร์));
      expect(psqlArgs(คอนเทนเนอร์, { write: false })).toEqual(อาร์กิวเมนต์psql(คอนเทนเนอร์, { เขียน: false }));
      expect(psqlArgs("supabase_db_pms-dev")).toEqual(อาร์กิวเมนต์psql("supabase_db_pms-dev"));
      expect(psqlArgs(คอนเทนเนอร์)).toContain("pms_writer");
      expect(psqlArgs(คอนเทนเนอร์, { write: false })).toContain("pms_reader");
    } finally {
      if (เดิม === undefined) delete process.env.PMS_TESTDB_PG_PASSWORD; else process.env.PMS_TESTDB_PG_PASSWORD = เดิม;
    }
  });
});
