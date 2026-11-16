// ข้อมูลผู้สนใจตั้งต้นของเว็บ demo ต้องเป็นข้อมูลปลอมทั้งหมด (บอสสั่งด่วน 16 พ.ย. 69 · ชุดเดิมสร้างจากฐานจริงหลุดขึ้นเว็บ demo สาธารณะ)
// ชื่อ "ผู้สนใจตัวอย่าง NN" · เบอร์ 000-000-NNNN · อีเมล @example.test · ไม่มีหมายเหตุ/ชื่อโซเชียล/ประเภทธุรกิจจริง
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { HQ_PROSPECTS_SEED } from "../../packages/shared/lib/data/local/hqProspectsSeed";

const ไฟล์ = readFileSync(fileURLToPath(new URL("../../packages/shared/lib/data/local/hqProspectsSeed.ts", import.meta.url)), "utf8");

describe("ข้อมูลผู้สนใจของเว็บ demo = ข้อมูลปลอม", () => {
  it("ชื่อ/ชื่อโซเชียลเป็นรูปแบบปลอมทุกแถว", () => {
    expect(HQ_PROSPECTS_SEED.length).toBeGreaterThan(0);
    for (const p of HQ_PROSPECTS_SEED) {
      expect(p.name).toMatch(/^ผู้สนใจตัวอย่าง \d{2,}$/);
      if (p.social != null) expect(p.social).toMatch(/^ผู้สนใจตัวอย่าง \d{2,}$/);
    }
  });
  it("เบอร์ = 000-000-NNNN เท่านั้น · อีเมล = @example.test เท่านั้น", () => {
    for (const p of HQ_PROSPECTS_SEED) {
      if (p.phone != null) expect(p.phone).toMatch(/^000-000-\d{4}$/);
      if (p.email != null) expect(p.email).toMatch(/@example\.test$/);
    }
  });
  it("ทั้งไฟล์ไม่มีเบอร์โทรรูปแบบจริง และไม่อ้างว่าสร้างจากฐานจริง/เอกสารจริง", () => {
    expect(ไฟล์).not.toMatch(/(^|[^0-9])0[1-9]\d-?\d{3}-?\d{4}(?!\d)/);
    expect(ไฟล์).not.toMatch(/ฐานจริง|BJM PEB/);
  });
});
