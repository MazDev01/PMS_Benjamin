// ตัวต่อคิวแถวกลาง (tests/scenario/sharedRowLock.ts · คิวข้อ 3 · 29 ต.ค. 69)
//   ข้อที่ถือแถวเดียวกันต้องต่อคิว · คนละแถวไม่รอกัน · ล็อกของโปรเซสที่ตายแล้วยึดคืนได้ · ถือหลายแถวเรียงชื่อ (ไม่รอกันเอง)
import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { ถือแถวกลาง } from "../scenario/sharedRowLock";

const ที่ล็อก = path.resolve(__dirname, "../../test-results/.row-locks");
const รอ = (ms: number) => new Promise(r => setTimeout(r, ms));

describe("ตัวต่อคิวแถวกลาง", () => {
  it("แถวเดียวกัน: คนที่สองรอจนคนแรกปล่อย", async () => {
    const ลำดับ: string[] = [];
    const ปล่อย1 = await ถือแถวกลาง("hq_company");
    const สอง = ถือแถวกลาง("hq_company").then(ปล่อย => { ลำดับ.push("สองได้"); return ปล่อย; });
    await รอ(500);
    ลำดับ.push("หนึ่งปล่อย");
    ปล่อย1();
    (await สอง)();
    expect(ลำดับ).toEqual(["หนึ่งปล่อย", "สองได้"]);
  });

  it("คนละแถว: ไม่รอกัน", async () => {
    const ก = await ถือแถวกลาง("hq_company");
    const เริ่ม = Date.now();
    const ข = await ถือแถวกลาง("hq_sales_journey", 2_000);
    expect(Date.now() - เริ่ม).toBeLessThan(1_000);
    ก(); ข();
  });

  it("ล็อกค้างจากโปรเซสที่ไม่อยู่แล้ว → ยึดคืนได้", async () => {
    const ที่ = path.join(ที่ล็อก, "dealer_settings.RYG");
    mkdirSync(ที่, { recursive: true });
    writeFileSync(path.join(ที่, "owner.json"), JSON.stringify({ pid: 2_147_483_000, at: "2026-10-29T00:00:00Z" }));
    const ปล่อย = await ถือแถวกลาง("dealer_settings.RYG", 3_000);
    ปล่อย();
    expect(existsSync(ที่)).toBe(false);
  });

  it("ถือไม่ได้ในเวลาที่กำหนด → บอกชื่อแถว (ไม่ค้างเงียบ)", async () => {
    const ปล่อย = await ถือแถวกลาง("hq_notif_rules");
    await expect(ถือแถวกลาง("hq_notif_rules", 600)).rejects.toThrow(/hq_notif_rules/);
    ปล่อย();
  });

  it("ถือหลายแถวพร้อมกันสลับลำดับ → ไม่รอกันเอง (เรียงชื่อก่อนถือ)", async () => {
    const [ก, ข] = await Promise.all([
      ถือแถวกลาง(["hq_company", "hq_sales_journey"], 5_000).then(ป => { ป(); return true; }),
      ถือแถวกลาง(["hq_sales_journey", "hq_company"], 5_000).then(ป => { ป(); return true; }),
    ]);
    expect(ก && ข).toBe(true);
  });
});
